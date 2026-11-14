/* global Response, ReadableStream */
// Isolated local browser acceptance fixture. Never forwards upstream requests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createModelConnectionHandler, isLocalHost } from '../desktop/server/model-connections.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../desktop/design-previews');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const banner = '<aside data-fixture-banner style="position:fixed;inset:0 0 auto;z-index:2147483647;background:#ffd66b;color:#231d10;font:12px/20px system-ui;text-align:center;padding:2px 8px;pointer-events:none">本地验收模拟环境 · 无外部请求 · 非真实供应商连接</aside>';
const scenarios = new Set(['fixture-success', 'fixture-auth-error', 'fixture-rate-limit', 'fixture-empty', 'fixture-slow', 'fixture-refresh-error']);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Actual broker and preview files, with a closed, synthetic upstream. */
export function createFixtureServer({ slowMs = 2500, streamDelayMs = 400, stopDelayMs = 250 } = {}) {
  for (const value of [streamDelayMs, stopDelayMs]) if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error('Invalid stream delay');
  if (!Number.isFinite(slowMs) || slowMs < 0 || slowMs > 10000) throw new Error('Invalid fixture delay');
  let upstreamCalls = 0;
  const refreshCalls = new Map();
  const chatAttempts = new Map();
  const chatStats = { requests: 0, cancelled: 0, active: 0 };
  function chatResponse(provider, options) {
    chatStats.requests++;
    let payload;
    try { payload = JSON.parse(options.body); } catch { return json({}, 400); }
    const messages = provider === 'google' ? payload.contents : payload.messages;
    const last = messages?.at(-1);
    const prompt = provider === 'google' ? last?.parts?.map(part => part.text || '').join('') : last?.content;
    if (typeof prompt !== 'string') return json({}, 400);
    const attemptKey = provider + ':' + prompt;
    const attempt = (chatAttempts.get(attemptKey) || 0) + 1;
    chatAttempts.set(attemptKey, attempt);
    if (prompt.includes('[fixture-rate]') && attempt === 1) return json({}, 429);
    const fails = prompt.includes('[fixture-retry]') && attempt === 1;
    const truncated = prompt.includes('[fixture-truncate]');
    const stopping = prompt.includes('[fixture-stop]');
    const chunks = stopping ? Array.from({ length: 120 }, (_, index) => `模拟输出 ${index + 1} · `)
      : ['这是', '明确标记的', '本地模拟回复。', '\n\n', '正在验证', '流式输出、', '停止生成', '与错误恢复。'];
    const frames = [];
    const frame = value => `event: ${value.type || 'message'}\ndata: ${JSON.stringify(value)}\n\n`;
    if (provider === 'anthropic') {
      frames.push(frame({ type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model: payload.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }));
      frames.push(frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
    }
    for (const text of (fails || truncated ? chunks.slice(0, 3) : chunks)) {
      frames.push(provider === 'anthropic' ? frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
        : frame({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text }] } }] }));
    }
    if (fails) frames.push(provider === 'anthropic' ? frame({ type: 'error', error: { type: 'overloaded_error', message: 'Synthetic fixture error only' } }) : frame({ error: { code: 503, status: 'UNAVAILABLE', message: 'Synthetic fixture error only' } }));
    else if (!truncated) {
      if (provider === 'anthropic') frames.push(frame({ type: 'content_block_stop', index: 0 }), frame({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }), frame({ type: 'message_stop' }));
      else frames.push(frame({ candidates: [{ index: 0, content: { role: 'model', parts: [] }, finishReason: 'STOP' }] }));
    }
    let cursor = 0, finished = false;
    const pending = new AbortController();
    let streamController;
    const complete = cancelled => {
      if (finished) return;
      finished = true;
      chatStats.active--;
      if (cancelled) chatStats.cancelled++;
      options.signal?.removeEventListener('abort', onAbort);
      pending.abort();
    };
    const onAbort = () => { if (!finished) { complete(true); streamController.error(new Error('Fixture stream aborted')); } };
    chatStats.active++;
    const stream = new ReadableStream({
      start(controller) { streamController = controller; options.signal?.addEventListener('abort', onAbort, { once: true }); if (options.signal?.aborted) onAbort(); },
      async pull(controller) {
        try {
          await delay(stopping ? stopDelayMs : streamDelayMs, undefined, { signal: pending.signal });
          if (finished) return;
          controller.enqueue(Buffer.from(frames[cursor++]));
          if (cursor === frames.length) { complete(false); controller.close(); }
        } catch (error) { if (!finished) { complete(false); controller.error(error); } }
      },
      cancel() { complete(true); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  const connections = createModelConnectionHandler({ cookieName: 'shipmate_model_fixture', fetchImpl: async (value, options = {}) => {
    upstreamCalls++;
    const url = new URL(value);
    if (url.href === 'https://openrouter.ai/api/v1/auth/keys' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/u.test(body.code_verifier)) return json({}, 400);
      if (body.code === 'fixture-oauth-slow') await delay(slowMs, undefined, { signal: options.signal });
      return ['fixture-oauth-success', 'fixture-oauth-slow'].includes(body.code) ? json({ key: 'fixture-success' }) : json({}, 403);
    }
    const key = options.headers?.Authorization?.replace(/^Bearer /u, '') || options.headers?.['x-api-key'] || options.headers?.['x-goog-api-key'];
    const local = url.href === 'http://127.0.0.1:11434/api/tags';
    const allowed = [
      'https://api.openai.com/v1/models', 'https://api.anthropic.com/v1/models',
      'https://generativelanguage.googleapis.com/v1beta/models',
      'https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/key',
    ];
    const chatProvider = url.origin + url.pathname === 'https://api.anthropic.com/v1/messages' ? 'anthropic'
      : url.origin === 'https://generativelanguage.googleapis.com' && /^\/v1beta\/models\/fixture-demo-model-[a-z0-9-]+:streamGenerateContent$/u.test(url.pathname) && url.searchParams.get('alt') === 'sse' ? 'google' : null;
    if (!local && !chatProvider && !allowed.includes(url.origin + url.pathname)) return json({}, 403);
    if (!local && (!scenarios.has(key) || key === 'fixture-auth-error')) return json({}, 401);
    if (key === 'fixture-rate-limit') return json({}, 429);
    if (chatProvider) return options.method === 'POST' ? chatResponse(chatProvider, options) : json({}, 405);
    if (key === 'fixture-slow') await delay(slowMs, undefined, { signal: options.signal });
    if (url.pathname === '/api/v1/key') return json({ data: { label: 'Local acceptance fixture only' } });
    if (key === 'fixture-refresh-error') {
      const count = (refreshCalls.get(url.hostname) || 0) + 1;
      refreshCalls.set(url.hostname, count);
      if (count === 2) return json({}, 429);
    }
    const rows = Array.from({ length: key === 'fixture-empty' ? 0 : 36 }, (_, index) => {
      const name = index === 35 ? 'fixture-demo-model-long-'.padEnd(url.hostname === 'generativelanguage.googleapis.com' ? 249 : 256, 'x') : `fixture-demo-model-${String(index + 1).padStart(2, '0')}`;
      return url.hostname === 'generativelanguage.googleapis.com' ? { name: `models/${name}`, displayName: name, supportedGenerationMethods: ['generateContent'] } : { id: name, name, display_name: name, displayName: name };
    });
    if (url.hostname === 'generativelanguage.googleapis.com' && rows.length) rows.push({ name: 'models/fixture-embedding-only', displayName: 'Fixture embedding only', supportedGenerationMethods: ['embedContent'] });
    return json({ data: rows, models: rows, has_more: false });
  } });
  const server = createServer(async (req, res) => {
    try {
      if (!isLocalHost(req)) { res.writeHead(403); res.end('Local host required'); return; }
      if (await connections(req, res)) return;
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let path;
      try { path = decodeURIComponent((req.url || '/').split('?')[0]); }
      catch { res.writeHead(400); res.end(); return; }
      if (path === '/') path = '/settings.html';
      const full = resolve(root, '.' + path);
      if (!full.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      let content;
      try { content = await readFile(full); }
      catch { res.writeHead(404); res.end(); return; }
      if (extname(full) === '.html') content = content.toString('utf8').replace(/(<body\b[^>]*>)/iu, `$1${banner}`);
      res.writeHead(200, { 'Content-Type': types[extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.on('close', () => connections.dispose());
  return {
    server,
    get upstreamCalls() { return upstreamCalls; },
    get chatStats() { return { ...chatStats }; },
    async close() {
      connections.dispose();
      server.closeAllConnections();
      if (server.listening) await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    },
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const fixture = createFixtureServer();
  fixture.server.listen(5512, '127.0.0.1', () => {
    console.log('FIXTURE ONLY — no external requests; not proof of real provider connectivity.');
    console.log('http://127.0.0.1:5512/settings.html');
    console.log('Test keys: ' + [...scenarios].join(', '));
    console.log('Anthropic/Google prompts: [fixture-stop] (30s), [fixture-retry] (partial error once), [fixture-rate] (429 once), [fixture-truncate] (missing terminal). Retry the same prompt to recover.');
  });
  fixture.server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void fixture.close(); });
}
