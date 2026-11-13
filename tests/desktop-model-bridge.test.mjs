import { TextEncoder } from 'node:util';
import { ReadableStream } from 'node:stream/web';
import { text } from 'node:stream/consumers';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const { Response } = globalThis;
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopBridge, validateRequest } from '../desktop/server/desktop-bridge.mjs';

const BASE = '/api/model-connections';

test('domestic provider routes permit only existing connection and chat operations', () => {
  for (const provider of ['deepseek', 'glm', 'kimi']) {
    for (const action of ['connect', 'refresh', 'disconnect', 'chat', 'verify']) {
      const request = { id: 'domestic-1', path: `${BASE}/${provider}/${action}`, method: 'POST' };
      assert.equal(validateRequest(request), true);
      assert.equal(validateRequest({ ...request, method: 'GET' }), false);
      assert.equal(validateRequest({ ...request, path: `${request.path}?endpoint=evil` }), false);
    }
    for (const action of ['agent', 'oauth/start']) assert.equal(validateRequest({ id: 'domestic-1', path: `${BASE}/${provider}/${action}`, method: 'POST' }), false);
  }
});
async function harness(t, fetchImpl, options = {}) {
  const streams = new Map();
  const bridge = await createDesktopBridge({ brokerOptions: { fetchImpl, ...options }, emit(event) { streams.get(event.id)?.push(event); } });
  t.after(() => bridge.close());
  let sequence = 0;
  async function request(path = BASE, body, csrf) {
    const id = `r-${++sequence}`;
    const events = []; streams.set(id, events);
    await bridge.request({ id, path, method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json', 'x-shipmate-csrf': csrf ?? '' } });
    const text = events.filter(e => e.type === 'chunk').map(e => e.data).join('');
    return { events, status: events.find(e => e.type === 'headers')?.status, text, json: () => JSON.parse(text) };
  }
  return { bridge, request, streams };
}

test('desktop bridge rejects arbitrary paths, headers, methods and oversized payloads', () => {
  const request = { id: 'abc', path: BASE, method: 'GET' };
  assert.ok(validateRequest(request));
  for (const change of [{ path: 'http://example.com' }, { path: `${BASE}/../tools` }, { method: 'DELETE' }, { headers: { cookie: 'stolen' } }, { headers: { origin: 'http://evil' } }, { body: 'a'.repeat(65537) }, { id: 'bad\nframe' }]) assert.equal(validateRequest({ ...request, ...change }), false);
});

test('agent route is desktop-only and private request identity cannot be supplied as a public header', async t => {
  let calls = 0;
  const h = await harness(t, async () => { calls++; return Response.json({ data: [{ id: 'test-model' }] }); });
  const csrf = (await h.request()).json().csrfToken;
  await h.request(`${BASE}/openai/connect`, { apiKey: 'secret' }, csrf);
  const body = { model: 'test-model', messages: [{ role: 'user', content: '检查' }], agent: { projectId: 'p1', sessionId: 's1', allowRead: true, shareResults: false } };
  assert.equal((await h.request(`${BASE}/openai/agent`, body, csrf)).status, 409);
  assert.equal(calls, 1);
  assert.equal(validateRequest({ id: 'test', path: `${BASE}/openai/agent`, method: 'POST', headers: { 'x-shipmate-request-id': 'forged' } }), false);
  for (const provider of ['openai', 'anthropic', 'google']) {
    assert.equal(validateRequest({ id: 'test', path: `${BASE}/${provider}/agent`, method: 'POST' }), true);
    assert.equal(validateRequest({ id: 'test', path: `${BASE}/${provider}/agent`, method: 'GET' }), false);
    assert.equal(validateRequest({ id: 'test', path: `${BASE}/${provider}/agent/extra`, method: 'POST' }), false);
  }
  assert.equal(validateRequest({ id: 'test', path: `${BASE}/custom/agent`, method: 'POST' }), false);
});

test('desktop explain queries real local rules without credentials and rejects malformed input', async t => {
  const h = await harness(t, () => { throw new Error('No network expected'); });
  const csrf = (await h.request()).json().csrfToken;
  const route = `${BASE}/tools/explain`;
  for (const path of [`${route}/extra`, `${route}?query=x`, `${BASE}/tools/guide`]) assert.equal(validateRequest({ id: 'test', method: 'POST', path }), false);
  assert.equal(validateRequest({ id: 'test', method: 'GET', path: route }), false);
  assert.equal((await h.request(route, { query: '隐私' }, 'wrong')).status, 403);
  assert.equal((await h.request(route, { query: '隐私', includeDrafts: true }, csrf)).status, 400);
  const result = await h.request(route, { query: '诱导分享' }, csrf);
  assert.equal(result.status, 200); assert.ok(result.json().items.length);
  assert.equal(result.json().meta.query, '诱导分享');
  const empty = await h.request(route, { query: 'unmatchedxyz' }, csrf);
  assert.equal(empty.status, 200); assert.deepEqual(empty.json().items, []);
});

test('owned stdio child returns framed events and exits when its owner closes stdin', async t => {
  const child = spawn(process.execPath, ['desktop/server/desktop-bridge.mjs'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const exited = once(child, 'exit');
  let output = '', errors = '', pending = '';
  const privateFrames = [];
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { errors += chunk; });
  const finished = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('stdio response timed out')), 5000);
    child.stdout.on('data', chunk => {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        const frame = JSON.parse(line);
        if (frame.type === 'credential') {
          privateFrames.push(frame);
          child.stdin.write(`${JSON.stringify({ type: 'credential-result', id: frame.id, ok: true, record: null })}\n`);
        } else output += `${line}\n`;
      }
      if (output.slice(0, output.lastIndexOf('\n')).split('\n').some(line => line && JSON.parse(line).type === 'end')) { clearTimeout(timer); resolve(); }
    });
  });
  child.stdin.write(`${JSON.stringify({ type: 'request', request: { id: 'native-1', path: BASE, method: 'GET' } })}\n`);
  await finished;
  const events = output.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(privateFrames.length, 9);
  assert.ok(privateFrames.every(frame => frame.operation === 'load'));
  assert.equal(events[0].type, 'headers'); assert.equal(events[0].status, 200);
  assert.ok(events.every(event => event.id === 'native-1'));
  child.stdin.end();
  assert.equal((await exited)[0], 0); assert.equal(errors, '');
});

test('stdio broker keeps console diagnostics off its protocol stream', async t => {
  const preload = `process.once('beforeExit', () => {
    console.info('probe-info'); console.log('probe-log'); console.debug('probe-debug'); console.warn('probe-warn');
  });`;
  const child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'desktop/server/desktop-bridge.mjs'], { windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const result = Promise.all([once(child, 'close'), text(child.stdout), text(child.stderr)]);
  child.stdin.end();
  const [[code], stdout, stderr] = await result;
  assert.equal(code, 0);
  for (const line of stdout.trimEnd().split('\n').filter(Boolean)) JSON.parse(line);
  for (const marker of ['probe-info', 'probe-log', 'probe-debug', 'probe-warn']) assert.ok(stderr.includes(marker), marker);
});

test('desktop reuses broker session, CSRF, model discovery and real stream conversion', async t => {
  const calls = [];
  const h = await harness(t, async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'test-model', model: 'test-model' }] });
    return new Response('{"message":{"content":"你好"},"done":false}\n{"message":{"content":"桌面"},"done":false}\n{"done":true}\n', { headers: { 'content-type': 'application/x-ndjson' } });
  });
  const initial = (await h.request()).json();
  assert.equal(initial.storage, 'memory');
  assert.equal((await h.request(`${BASE}/ollama/connect`, {}, 'wrong')).status, 403);
  const connected = (await h.request(`${BASE}/ollama/connect`, {}, initial.csrfToken)).json();
  assert.equal(connected.connections.find(c => c.providerId === 'ollama').status, 'connected');
  const streamed = await h.request(`${BASE}/ollama/chat`, { model: 'test-model', messages: [{ role: 'user', content: 'hello' }] }, initial.csrfToken);
  assert.equal(streamed.status, 200);
  assert.match(streamed.text, /text-delta/); assert.match(streamed.text, /你好/); assert.match(streamed.text, /桌面/); assert.match(streamed.text, /\[DONE\]/);
  assert.equal(streamed.events.at(-1).type, 'end');
  assert.equal(calls.length, 2);
  assert.ok(!JSON.stringify(streamed.events).includes('shipmate_models'));
});

test('desktop OAuth callback is private, state-bound and single-use', async t => {
  let exchanges = 0;
  const h = await harness(t, async url => {
    if (String(url).includes('/auth/keys')) { exchanges++; return Response.json({ key: 'oauth-secret' }); }
    if (String(url).endsWith('/api/v1/key')) return Response.json({ data: { label: 'test' } });
    return Response.json({ data: [{ id: 'test/model', name: 'Test' }] });
  });
  const csrf = (await h.request()).json().csrfToken;
  const authorization = new URL((await h.request(`${BASE}/openrouter/oauth/start`, {}, csrf)).json().authorizationUrl);
  const callback = new URL(authorization.searchParams.get('callback_url'));
  assert.equal((await fetch(callback.origin + BASE)).status, 403);
  callback.searchParams.set('state', 'wrong'); callback.searchParams.set('code', 'test-code');
  assert.equal((await fetch(callback)).status, 403); assert.equal(exchanges, 0);
  callback.searchParams.set('state', authorization.searchParams.get('state'));
  for (const [name, value] of [['state', 'duplicate'], ['code', 'duplicate'], ['error', 'access_denied']]) {
    const malformed = new URL(callback); malformed.searchParams.append(name, value);
    assert.equal((await fetch(malformed)).status, 403);
  }
  const completed = await fetch(callback);
  assert.equal(completed.status, 200); assert.match(await completed.text(), /返回上线船友/);
  assert.equal((await fetch(callback)).status, 403); assert.equal(exchanges, 1);
  const snapshot = (await h.request()).json();
  assert.equal(snapshot.connections.find(c => c.providerId === 'openrouter').status, 'connected');
  assert.ok(!JSON.stringify(snapshot).includes('oauth-secret'));
  const denialAuth = new URL((await h.request(`${BASE}/openrouter/oauth/start`, {}, csrf)).json().authorizationUrl);
  const denial = new URL(denialAuth.searchParams.get('callback_url'));
  denial.searchParams.set('error', 'access_denied');
  denial.searchParams.set('code', 'must-not-exchange');
  assert.equal((await fetch(denial)).status, 403);
  denial.searchParams.delete('code');
  assert.equal((await fetch(denial)).status, 200);
  assert.equal((await fetch(denial)).status, 403);
  assert.equal((await h.request()).json().oauth.status, 'error');
  assert.equal(exchanges, 1);
});

test('desktop cancellation aborts upstream and allows subsequent requests', async t => {
  let aborted;
  const upstreamAborted = new Promise(resolve => { aborted = resolve; });
  const h = await harness(t, async (url, init) => {
    if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'test-model' }] });
    init.signal.addEventListener('abort', () => aborted(), { once: true });
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"message":{"content":"start"},"done":false}\n')); } }), { headers: { 'content-type': 'application/x-ndjson' } });
  });
  const csrf = (await h.request()).json().csrfToken;
  await h.request(`${BASE}/ollama/connect`, {}, csrf);
  const events = []; h.streams.set('cancel-me', events);
  const running = h.bridge.request({ id: 'cancel-me', path: `${BASE}/ollama/chat`, method: 'POST', headers: { 'content-type': 'application/json', 'x-shipmate-csrf': csrf }, body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: 'hello' }] }) });
  for (let i = 0; i < 100 && !events.some(e => e.type === 'chunk'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(events.some(e => e.type === 'chunk'));
  h.bridge.cancel('cancel-me'); await running;
  await Promise.race([upstreamAborted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('upstream not aborted')), 2000); timer.unref(); })]);
  assert.equal(events.at(-1).type, 'error');
  assert.equal((await h.request()).status, 200);
});




test('desktop manual OAuth completes over IPC and removes previous loopback registration', async t => {
  let exchanges = 0;
  const h = await harness(t, async url => {
    if (url.endsWith('/auth/keys')) { exchanges++; return Response.json({ key: 'manual-key' }); }
    return url.endsWith('/key') ? Response.json({ data: { label: 'fixture' } }) : Response.json({ data: [{ id: 'manual/model' }] });
  });
  const csrf = (await h.request()).json().csrfToken;
  const previous = new URL((await h.request(`${BASE}/openrouter/oauth/start`, {}, csrf)).json().authorizationUrl);
  const callback = new URL(previous.searchParams.get('callback_url'));
  callback.searchParams.set('state', previous.searchParams.get('state')); callback.searchParams.set('code', 'old');
  const flow = (await h.request(`${BASE}/openrouter/oauth/start`, { mode: 'manual' }, csrf)).json();
  assert.equal(flow.mode, 'manual');
  assert.equal(new URL(flow.authorizationUrl).searchParams.has('callback_url'), false);
  assert.equal((await fetch(callback)).status, 403);
  assert.equal((await h.request()).json().oauth.flowId, flow.flowId);
  const completed = await h.request(`${BASE}/openrouter/oauth/complete`, { flowId: flow.flowId, code: 'test-code' }, csrf);
  assert.equal(completed.status, 200); assert.equal(completed.json().oauth.status, 'success');
  assert.equal((await h.request(`${BASE}/openrouter/oauth/complete`, { flowId: flow.flowId, code: 'test-code' }, csrf)).status, 409);
  assert.equal(exchanges, 1); assert.equal(completed.text.includes('manual-key'), false);
});
