/* global Headers, Response, ReadableStream, TextEncoder, DOMException */
const BASE = '/api/model-connections';
const ROUTE = /^\/api\/model-connections\/(openai|anthropic|google|openrouter|ollama|custom)\/(connect|refresh|disconnect|chat|verify)$/;
const OAUTH = /^\/api\/model-connections\/openrouter\/oauth\/(start|cancel|complete)$/;
const unavailable = () => new Error('桌面模型服务暂时不可用。请重启应用或修复安装，然后重试连接。');
const aborted = () => new DOMException('请求已取消。', 'AbortError');

/** Fetch-compatible adapter; model APIs and SSE parsing remain in the shared client. */
export function createDesktopModelFetch({ invoke, createChannel, makeId = () => globalThis.crypto.randomUUID(), timeoutMs = 150000 }) {
  const active = new Set();
  const fetcher = (path, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (typeof path !== 'string' || !(method === 'GET' && path === BASE || method === 'POST' && (ROUTE.test(path) || OAUTH.test(path) || path === `${BASE}/openai/agent` || path === `${BASE}/tools/explain`))) {
      return Promise.reject(new Error('桌面模型请求不受支持。'));
    }
    if (init.body !== undefined && (typeof init.body !== 'string' || new TextEncoder().encode(init.body).length > 65536)) {
      return Promise.reject(new Error('模型请求过长或格式不受支持。'));
    }
    if (init.signal?.aborted) return Promise.reject(aborted());
    const headers = {};
    for (const [key, value] of new Headers(init.headers)) {
      if (['content-type', 'x-shipmate-csrf'].includes(key)) headers[key] = value;
    }
    return new Promise((resolve, reject) => {
      const id = makeId();
      let channel, stream, accepted = false, finished = false, hasHeaders = false, cancelPending = false, received = 0;
      const cancelNative = () => {
        cancelPending = true;
        if (accepted) void Promise.resolve(invoke('model_cancel', { id })).catch(() => {});
      };
      const cleanup = () => {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', abort);
        active.delete(abort);
        if (channel) channel.onmessage = () => {};
      };
      const fail = error => {
        if (finished) return;
        finished = true;
        cancelNative();
        cleanup();
        if (hasHeaders) stream.error(error);
        else reject(error);
      };
      const abort = () => fail(aborted());
      const timer = setTimeout(() => fail(new Error('桌面模型服务响应超时，请重试。')), timeoutMs);
      active.add(abort);
      init.signal?.addEventListener('abort', abort, { once: true });
      try {
        channel = createChannel();
        channel.onmessage = event => {
          if (finished) return;
          try {
            if (event.type === 'headers' && !hasHeaders) {
              if (!Number.isInteger(event.status) || event.status < 200 || event.status > 599 || [204, 205, 304].includes(event.status)) throw unavailable();
              const responseHeaders = new Headers();
              for (const name of ['content-type', 'x-vercel-ai-ui-message-stream']) {
                if (typeof event.headers?.[name] === 'string') responseHeaders.set(name, event.headers[name]);
              }
              const body = new ReadableStream({
                start(controller) { stream = controller; },
                cancel() {
                  if (finished) return;
                  finished = true; cancelNative(); cleanup();
                },
              });
              hasHeaders = true;
              resolve(new Response(body, { status: event.status, headers: responseHeaders }));
            } else if (event.type === 'chunk' && hasHeaders && typeof event.data === 'string') {
              const bytes = new TextEncoder().encode(event.data);
              received += bytes.byteLength;
              if (received > 8 * 1024 * 1024) throw new Error('模型响应超过大小限制。');
              stream.enqueue(bytes);
            } else if (event.type === 'end' && hasHeaders) {
              finished = true; cleanup(); stream.close();
            } else {
              // Never expose raw subprocess/provider errors or credentials.
              throw unavailable();
            }
          } catch (error) { fail(error); }
        };
        Promise.resolve(invoke('model_request', { request: { id, path, method, headers, body: init.body ?? null }, onEvent: channel }))
          .then(() => { accepted = true; if (cancelPending) cancelNative(); })
          .catch(() => fail(unavailable()));
      } catch { fail(unavailable()); }
    });
  };
  fetcher.dispose = () => { for (const abort of [...active]) abort(); };
  return fetcher;
}
