import { createCredentialRpc } from './credential-rpc.mjs';
import { createAgentToolRpc } from './agent-tool-rpc.mjs';
import { AGENT_PROVIDERS } from '../design-previews/agent-contract.js';
import { TextDecoder } from 'node:util';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createModelConnectionHandler, validOAuthCallback } from './model-connections.mjs';

const BASE = '/api/model-connections';
const ROUTE = /^\/api\/model-connections\/(openai|anthropic|google|openrouter|ollama|custom)\/(connect|refresh|disconnect|chat|verify)$/;
const MAX_LINE = 400_000;
const validId = id => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function validateRequest(request) {
  if (!request || !validId(request.id)) return false;
  const { path, method, body, headers = {} } = request;
  if (!(method === 'GET' && path === BASE || method === 'POST' && (ROUTE.test(path) || AGENT_PROVIDERS.some(provider => path === `${BASE}/${provider}/agent`) || [`${BASE}/openrouter/oauth/start`, `${BASE}/openrouter/oauth/cancel`, `${BASE}/openrouter/oauth/complete`, `${BASE}/tools/explain`].includes(path)))) return false;
  if (body !== undefined && body !== null && (typeof body !== 'string' || Buffer.byteLength(body) > 65_536)) return false;
  if (method === 'GET' && body) return false;
  return headers && typeof headers === 'object' && !Array.isArray(headers) && Object.entries(headers).every(([key, value]) => ['content-type', 'x-shipmate-csrf', 'accept'].includes(key.toLowerCase()) && typeof value === 'string' && value.length <= 256 && !/[\r\n]/.test(value));
}

// HTTP exists only to reuse the audited broker. Its address never crosses IPC;
// browser access is denied except an exact, single-use OAuth callback.
export async function createDesktopBridge({ emit, brokerOptions = {} }) {
  const secret = randomBytes(32).toString('hex');
  const handler = createModelConnectionHandler(brokerOptions);
  const pending = new Map();
  let cookie = '', flow = null, closed = false, flowRevision = 0;
  const server = createServer(async (req, res) => {
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}`) { res.writeHead(403); res.end(); return; }
    if (same(req.headers['x-shipmate-desktop'], secret)) { await handler(req, res); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method !== 'GET' || !flow || flow.deadline <= Date.now() || url.pathname !== flow.path || !validOAuthCallback(url.searchParams, flow.state)) {
      res.writeHead(403, { 'Cache-Control': 'no-store' }); res.end('Access denied'); return;
    }
    flow = null;
    req.headers.cookie = cookie;
    // Keep the broker's callback validation, replace only its preview redirect.
    const writeHead = res.writeHead.bind(res);
    res.writeHead = (status, headers) => {
      if (status === 303) return writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
      return writeHead(status, headers);
    };
    const end = res.end.bind(res);
    res.end = data => end(data || '<!doctype html><meta charset="utf-8"><title>上线船友</title><p>授权处理已结束。请返回上线船友查看连接状态。</p>');
    await handler(req, res);
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Establish one private session before concurrent settings/composer loads.
  const bootstrap = await fetch(origin + BASE, { headers: { origin, 'x-shipmate-desktop': secret } });
  cookie = bootstrap.headers.get('set-cookie')?.split(';')[0] ?? '';
  await bootstrap.arrayBuffer();
  async function request(value) {
    const id = value?.id;
    if (!validateRequest(value) || closed || pending.has(id) || pending.size >= 16) {
      if (validId(id)) emit({ id, type: 'error', message: '桌面连接请求无效或当前请求过多。' });
      return;
    }
    const controller = new AbortController();
    pending.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), 140_000);
    try {
      const changesFlow = value.path.endsWith('/oauth/start') || value.path.endsWith('/oauth/cancel') || value.path.endsWith('/openrouter/disconnect') || value.path.endsWith('/openrouter/connect');
      const revision = changesFlow ? ++flowRevision : flowRevision;
      if (value.path.endsWith('/oauth/cancel') || value.path.endsWith('/openrouter/disconnect') || value.path.endsWith('/openrouter/connect')) flow = null;
      const response = await fetch(origin + value.path, {
        method: value.method, body: value.body ?? undefined, signal: controller.signal, redirect: 'manual',
        headers: { ...value.headers, origin, cookie, 'x-shipmate-desktop': secret, 'x-shipmate-request-id': id },
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const headers = Object.fromEntries(['content-type', 'x-vercel-ai-ui-message-stream', 'cache-control'].flatMap(name => response.headers.has(name) ? [[name, response.headers.get(name)]] : []));
      emit({ id, type: 'headers', status: response.status, headers });
      if (value.path.endsWith('/oauth/start') && response.ok) {
        const text = await response.text();
        const payload = JSON.parse(text);
        const authorization = new URL(payload.authorizationUrl);
        if (revision !== flowRevision) {
          // A newer cancellation or replacement already owns callback registration.
        } else if (payload.mode === 'manual') {
          flow = null;
        } else {
          const callback = new URL(authorization.searchParams.get('callback_url'));
          if (callback.origin !== origin || !callback.pathname.startsWith(`${BASE}/oauth/callback/`)) throw new Error();
          flow = { path: callback.pathname, state: authorization.searchParams.get('state'), deadline: Date.parse(payload.expiresAt) };
        }
        emit({ id, type: 'chunk', data: text });
      } else {
        const decoder = new TextDecoder();
        for await (const chunk of response.body) emit({ id, type: 'chunk', data: decoder.decode(chunk, { stream: true }) });
        const rest = decoder.decode();
        if (rest) emit({ id, type: 'chunk', data: rest });
      }
      emit({ id, type: 'end' });
    } catch {
      emit({ id, type: 'error', message: controller.signal.aborted ? '请求已停止或超时，请重试。' : '桌面连接服务暂时不可用，请重试。' });
    } finally { clearTimeout(timeout); pending.delete(id); }
  }
  return {
    request,
    cancel(id) { pending.get(id)?.abort(); },
    async close() {
      closed = true; flow = null; cookie = '';
      for (const controller of pending.values()) controller.abort();
      handler.dispose(); server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

export async function runStdio(input = process.stdin, output = process.stdout) {
  const emit = event => output.write(`${JSON.stringify(event)}\n`);
  const credentials = createCredentialRpc(emit);
  const projectTools = createAgentToolRpc(emit);
  let bridge, buffered = '', ended = false;
  const queued = [];
  const close = () => { ended = true; credentials.close(); projectTools.close(); void bridge?.close(); };
  const dispatch = message => {
    if (credentials.receive(message)) return;
    if (projectTools.receive(message)) return;
    if (!bridge) { if (queued.length < 16) queued.push(message); return; }
    if (message.type === 'cancel' && validId(message.id)) bridge.cancel(message.id);
    else if (message.type === 'request') void bridge.request(message.request);
  };
  // Register the response dispatcher before bootstrap asks the native vault.
  input.setEncoding('utf8');
  input.on('data', chunk => {
    buffered += chunk;
    if (Buffer.byteLength(buffered) > MAX_LINE) { input.destroy(); close(); return; }
    let newline;
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
      try { dispatch(JSON.parse(line)); } catch { /* Never echo malformed private frames. */ }
    }
  });
  input.once('end', close); input.once('error', close);
  bridge = await createDesktopBridge({ emit, brokerOptions: { credentialStore: credentials.store, projectToolRunner: projectTools.run } });
  if (ended) { await bridge.close(); return; }
  for (const message of queued) dispatch(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStdio().catch(() => { process.exitCode = 1; });
}


