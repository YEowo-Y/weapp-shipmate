import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopModelFetch } from '../desktop/design-previews/desktop-model-fetch.js';
import { streamChat } from '../desktop/design-previews/chat-transport.js';
import { queryExplain } from '../desktop/design-previews/explain-transport.js';
import { runExplain } from '../src/explain.mjs';

function bridge() {
  const calls = [];
  const fetcher = createDesktopModelFetch({ makeId: () => 'request-1', createChannel: () => ({}), invoke: async (command, args) => { calls.push({ command, args }); } });
  return { fetcher, calls, emit(event) { calls.find(call => call.command === 'model_request').args.onEvent.onmessage(event); } };
}
const headers = { type: 'headers', status: 200, headers: { 'content-type': 'text/plain', 'set-cookie': 'never-expose' } };

test('new built-in providers use native fixed chat routes without acquiring agent or OAuth routes', async () => {
  for (const provider of ['deepseek', 'glm', 'kimi']) {
    const b = bridge();
    for (const action of ['agent', 'oauth/start']) await assert.rejects(b.fetcher(`/api/model-connections/${provider}/${action}`, { method: 'POST' }));
    assert.equal(b.calls.length, 0);
    const pending = b.fetcher(`/api/model-connections/${provider}/chat`, { method: 'POST', body: '{}' });
    assert.equal(b.calls[0].args.request.path, `/api/model-connections/${provider}/chat`);
    b.emit(headers); b.emit({ type: 'chunk', data: 'reply' }); b.emit({ type: 'end' });
    assert.equal(await (await pending).text(), 'reply');
    b.fetcher.dispose();
  }
});

test('native explain uses the shared query transport and only the exact POST route', async () => {
  const calls = [];
  const fetcher = createDesktopModelFetch({ createChannel: () => ({}), invoke: async (command, args) => {
    if (command !== 'model_request') return;
    const { request, onEvent } = args; calls.push(request);
    onEvent.onmessage({ ...headers, headers: { 'content-type': 'application/json' } });
    onEvent.onmessage({ type: 'chunk', data: JSON.stringify(request.method === 'GET'
      ? { storage: 'memory', csrfToken: 'csrf', connections: [] }
      : runExplain(JSON.parse(request.body).query)) });
    onEvent.onmessage({ type: 'end' });
  } });
  for (const path of ['/api/model-connections/tools/guide', '/api/model-connections/tools/explain/extra', '/api/model-connections/tools/explain?query=x']) await assert.rejects(fetcher(path, { method: 'POST' }));
  await assert.rejects(fetcher('/api/model-connections/tools/explain'));
  assert.equal(calls.length, 0);
  const result = await queryExplain({ query: '  诱导分享  ' }, { fetcher });
  assert.ok(result.items.length); assert.equal(result.meta.query, '诱导分享');
  assert.equal(calls[1].path, '/api/model-connections/tools/explain');
  assert.equal(calls[1].headers['x-shipmate-csrf'], 'csrf');
  fetcher.dispose();
});

test('native adapter forwards only fixed model requests and harmless headers', async () => {
  const b = bridge();
  for (const path of ['https://evil.test/', '/api/model-connections/../secret', '/api/model-connections?x=1', '/api/model-connections/tools/guide']) await assert.rejects(b.fetcher(path));
  assert.equal(b.calls.length, 0);
  const pending = b.fetcher('/api/model-connections/openai/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shipmate-CSRF': 'csrf', Authorization: 'secret', Cookie: 'session' }, body: '{"apiKey":"test"}' });
  assert.deepEqual(b.calls[0].args.request.headers, { 'content-type': 'application/json', 'x-shipmate-csrf': 'csrf' });
  b.emit(headers); b.emit({ type: 'chunk', data: '你好' }); b.emit({ type: 'end' });
  const response = await pending;
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(await response.text(), '你好');
});

test('abort before native acceptance still cancels once the request is registered', async () => {
  let accepted; const calls = [];
  const fetcher = createDesktopModelFetch({ createChannel: () => ({}), invoke(command) { calls.push(command); return command === 'model_request' ? new Promise(resolve => { accepted = resolve; }) : Promise.resolve(); } });
  const controller = new AbortController();
  const request = fetcher('/api/model-connections', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  accepted(); await Promise.resolve();
  assert.deepEqual(calls, ['model_request', 'model_cancel']);
});

test('reader cancellation and disposal abort native requests, late events do not revive them', async () => {
  const b = bridge(); const pending = b.fetcher('/api/model-connections');
  b.emit(headers); const response = await pending;
  await response.body.cancel();
  b.emit({ type: 'chunk', data: 'late' }); b.fetcher.dispose();
  assert.equal(b.calls.filter(call => call.command === 'model_cancel').length, 1);
  const c = bridge(); const waiting = c.fetcher('/api/model-connections'); c.fetcher.dispose();
  await assert.rejects(waiting, { name: 'AbortError' });
});

test('process failure errors the active response without revealing raw error text', async () => {
  const b = bridge(); const pending = b.fetcher('/api/model-connections');
  b.emit(headers); const response = await pending;
  const text = response.text(); b.emit({ type: 'error', message: 'private-key' });
  await assert.rejects(text, error => /桌面模型服务/.test(error.message) && !error.message.includes('private-key'));
});

test('reuses real chat parser through native channels with incremental events', async () => {
  let chatChannel; let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const fetcher = createDesktopModelFetch({ createChannel: () => ({}), invoke: async (command, args) => {
    if (command !== 'model_request') return;
    const channel = args.onEvent;
    if (args.request.method === 'GET') {
      channel.onmessage({ ...headers, headers: { 'content-type': 'application/json' } });
      channel.onmessage({ type: 'chunk', data: JSON.stringify({ storage: 'memory', csrfToken: 'csrf', connections: [{ providerId: 'ollama', status: 'connected', models: [{ id: 'fixture', name: 'Fixture' }] }] }) });
      channel.onmessage({ type: 'end' });
    } else {
      chatChannel = channel;
      channel.onmessage({ ...headers, headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } }); ready();
    }
  } });
  const deltas = [];
  const request = streamChat({ providerId: 'ollama', model: 'fixture', messages: [{ role: 'user', content: 'hello' }], onDelta: text => deltas.push(text) }, { fetcher });
  await started;
  for (const value of [{ type: 'start', messageId: 'm' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '你好' }, { type: 'text-end', id: 't' }, { type: 'finish' }, '[DONE]']) chatChannel.onmessage({ type: 'chunk', data: `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n` });
  chatChannel.onmessage({ type: 'end' }); await request;
  assert.deepEqual(deltas, ['你好']);
});

test('native adapter permits only the exact manual OAuth completion route', async () => {
  const b = bridge();
  for (const path of ['/api/model-connections/openai/oauth/complete', '/api/model-connections/openrouter/oauth/complete/extra', '/api/model-connections/openrouter/oauth/complete?code=bad']) await assert.rejects(b.fetcher(path, { method: 'POST' }));
  const body = JSON.stringify({ flowId: 'flow', code: 'test-code' });
  const pending = b.fetcher('/api/model-connections/openrouter/oauth/complete', { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Shipmate-CSRF': 'csrf' } });
  assert.equal(b.calls[0].args.request.body, body);
  b.emit(headers); b.emit({ type: 'chunk', data: 'ok' }); b.emit({ type: 'end' });
  assert.equal(await (await pending).text(), 'ok');
});

test('native adapter accepts explicit custom verification but rejects route extensions', async () => {
  const b = bridge();
  await assert.rejects(b.fetcher('/api/model-connections/custom/verify/extra', { method: 'POST' }));
  const pending = b.fetcher('/api/model-connections/custom/verify', { method: 'POST', body: '{"model":"test-model"}' });
  b.emit(headers); b.emit({ type: 'end' }); await pending;
  assert.equal(b.calls[0].args.request.path, '/api/model-connections/custom/verify');
  b.fetcher.dispose();
});
