// @ts-check
/* global Headers, Response, ReadableStream, TextEncoder, DOMException */
import { AGENT_PROVIDERS } from './agent-contract.js';
const BASE = '/api/model-connections';
const ROUTE = /^\/api\/model-connections\/(openai|anthropic|google|deepseek|glm|kimi|openrouter|ollama|custom)\/(connect|refresh|disconnect|chat|verify)$/;
const OAUTH = /^\/api\/model-connections\/openrouter\/oauth\/(start|cancel|complete)$/;
const unavailable = () => new Error('桌面模型服务暂时不可用。请重启应用或修复安装，然后重试连接。');
const aborted = () => new DOMException('请求已取消。', 'AbortError');

/** @typedef {{ onmessage: (event: unknown) => void }} ModelChannel */
/** @typedef {{ id: string; path: string; method: string; headers: Record<string, string>; body: string | null }} ModelRequest */
/**
 * @typedef {{
 *   (command: 'model_request', args: { request: ModelRequest; onEvent: ModelChannel }): Promise<unknown>;
 *   (command: 'model_cancel', args: { id: string }): Promise<unknown>;
 * }} InvokeModel
 */

/**
 * Fetch-compatible adapter; model APIs and SSE parsing remain in the shared client.
 * @param {{ invoke: InvokeModel; createChannel: () => ModelChannel; makeId?: () => string; timeoutMs?: number }} options
 */
export function createDesktopModelFetch({ invoke, createChannel, makeId = () => globalThis.crypto.randomUUID(), timeoutMs = 150000 }) {
  /** @type {Set<() => void>} */
  const active = new Set();
  /** @param {RequestInfo | URL} path @param {RequestInit} [init] @returns {Promise<Response>} */
  const fetcher = (path, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (typeof path !== 'string' || !(method === 'GET' && path === BASE || method === 'POST' && (ROUTE.test(path) || OAUTH.test(path) || AGENT_PROVIDERS.some(provider => path === `${BASE}/${provider}/agent`) || path === `${BASE}/tools/explain`))) {
      return Promise.reject(new Error('桌面模型请求不受支持。'));
    }
    const { body, signal } = init;
    if (body !== undefined && (typeof body !== 'string' || new TextEncoder().encode(body).length > 65536)) {
      return Promise.reject(new Error('模型请求过长或格式不受支持。'));
    }
    if (signal?.aborted) return Promise.reject(aborted());
    /** @type {Record<string, string>} */
    const headers = {};
    for (const [key, value] of new Headers(init.headers)) {
      if (['content-type', 'x-shipmate-csrf'].includes(key)) headers[key] = value;
    }
    return new Promise((resolve, reject) => {
      const id = makeId();
      /** @type {ModelChannel | undefined} */
      let channel;
      /** @type {ReadableStreamDefaultController<Uint8Array> | undefined} */
      let stream;
      let accepted = false, finished = false, hasHeaders = false, cancelPending = false, received = 0;
      const cancelNative = () => {
        cancelPending = true;
        if (accepted) void Promise.resolve(invoke('model_cancel', { id })).catch(() => {});
      };
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        active.delete(abort);
        if (channel) channel.onmessage = () => {};
      };
      /** @param {Error} error */
      const fail = error => {
        if (finished) return;
        finished = true;
        cancelNative();
        cleanup();
        if (hasHeaders && stream) stream.error(error);
        else reject(error);
      };
      const abort = () => fail(aborted());
      const timer = setTimeout(() => fail(new Error('桌面模型服务响应超时，请重试。')), timeoutMs);
      active.add(abort);
      signal?.addEventListener('abort', abort, { once: true });
      try {
        channel = createChannel();
        channel.onmessage = event => {
          if (finished) return;
          try {
            if (!event || typeof event !== 'object' || !('type' in event)) throw unavailable();
            if (event.type === 'headers' && !hasHeaders) {
              const status = 'status' in event ? event.status : undefined;
              if (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status > 599 || [204, 205, 304].includes(status)) throw unavailable();
              const fields = 'headers' in event && event.headers && typeof event.headers === 'object'
                ? /** @type {Record<string, unknown>} */ (event.headers) : null;
              const responseHeaders = new Headers();
              for (const name of ['content-type', 'x-vercel-ai-ui-message-stream']) {
                const value = fields?.[name];
                if (typeof value === 'string') responseHeaders.set(name, value);
              }
              /** @type {ReadableStream<Uint8Array>} */
              const body = new ReadableStream({
                start(controller) { stream = controller; },
                cancel() {
                  if (finished) return;
                  finished = true; cancelNative(); cleanup();
                },
              });
              const response = new Response(body, { status, headers: responseHeaders });
              hasHeaders = true;
              resolve(response);
            } else if (event.type === 'chunk' && hasHeaders && stream && 'data' in event && typeof event.data === 'string') {
              const bytes = new TextEncoder().encode(event.data);
              received += bytes.byteLength;
              if (received > 8 * 1024 * 1024) throw new Error('模型响应超过大小限制。');
              stream.enqueue(bytes);
            } else if (event.type === 'end' && hasHeaders && stream) {
              finished = true; cleanup(); stream.close();
            } else {
              // Never expose raw subprocess/provider errors or credentials.
              throw unavailable();
            }
          } catch (error) {
            fail(error instanceof Error ? error : unavailable());
          }
        };
        Promise.resolve(invoke('model_request', { request: { id, path, method, headers, body: body ?? null }, onEvent: channel }))
          .then(() => { accepted = true; if (cancelPending) cancelNative(); })
          .catch(() => fail(unavailable()));
      } catch { fail(unavailable()); }
    });
  };
  fetcher.dispose = () => { for (const abort of [...active]) abort(); };
  return fetcher;
}
