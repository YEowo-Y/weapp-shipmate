/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';
import { streamChat, loadChatConnections } from '../desktop/design-previews/chat-transport.js';

const snapshot = { storage: 'memory', csrfToken: 'test-csrf', connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'test-model', name: 'Test' }] }] };
const args = { providerId: 'openai', model: 'test-model', messages: [{ role: 'user', content: '你好' }] };
const parts = [
  { type: 'start', messageId: 'r1' }, { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: '你好' }, { type: 'text-end', id: 't1' }, { type: 'finish' }, '[DONE]',
];
const serialize = values => values.map(value => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`).join('');
function response(text, { fragment = 7, cancel = () => {} } = {}) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === bytes.length) return controller.close();
    controller.enqueue(bytes.slice(offset, offset += Math.min(fragment, bytes.length - offset)));
  }, cancel }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'x-vercel-ai-ui-message-stream': 'v1' } });
}
function fetcherFor(reply, requests = []) {
  return async (url, options) => {
    requests.push({ url, ...options });
    return options.method === 'GET' ? Response.json(snapshot) : reply();
  };
}

test('real text uses fresh same-origin CSRF and handles byte-split UTF-8 and CRLF', async () => {
  const requests = [], chunks = [];
  await streamChat({ ...args, onDelta: delta => chunks.push(delta) }, { fetcher: fetcherFor(() => response(': ping\r\n\r\n' + serialize(parts), { fragment: 1 }), requests) });
  assert.deepEqual(chunks, ['你好']);
  assert.equal(requests[1].url, '/api/model-connections/openai/chat');
  assert.equal(requests[1].headers['X-Shipmate-CSRF'], 'test-csrf');
  assert.equal(requests[1].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(requests[1].body), { model: args.model, messages: args.messages });
  assert.equal(requests.length, 2);
});

test('missing terminal, malformed frames, mismatched text IDs and empty response never succeed', async () => {
  for (const bad of [parts.slice(0, 3), [...parts.slice(0, 3), '[DONE]'], [parts[0], parts[1], { type: 'text-delta', id: 'other', delta: 'x' }], [parts[0], parts[1], parts[3], parts[4], parts[5]], [{ type: 'finish' }, '[DONE]'], ['not-json']]) {
    await assert.rejects(streamChat(args, { fetcher: fetcherFor(() => response(serialize(bad))) }), /中断|格式|空|完成/);
  }
});

test('in-stream failure preserves prior text without completing or retrying', async () => {
  const requests = [], chunks = [];
  await assert.rejects(streamChat({ ...args, onDelta: text => chunks.push(text) }, { fetcher: fetcherFor(() => response(serialize([...parts.slice(0, 3), { type: 'error', errorText: '本次回复达到长度上限。' }, '[DONE]'])), requests) }), /长度上限/);
  assert.deepEqual(chunks, ['你好']); assert.equal(requests.length, 2);
});

test('HTTP errors do not echo raw provider bodies and never retry automatically', async () => {
  const requests = [];
  await assert.rejects(streamChat(args, { fetcher: fetcherFor(() => new Response('secret upstream key', { status: 401 }), requests) }), error => /连接|会话/.test(error.message) && !error.message.includes('secret'));
  assert.equal(requests.length, 2);
});

test('abort cancels a stalled read and suppresses additional text', async () => {
  let cancelled = false, ready;
  const waiting = new Promise(resolve => { ready = resolve; });
  const controller = new AbortController();
  const pending = streamChat({ ...args, signal: controller.signal }, { fetcher: fetcherFor(() => {
    ready();
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
  }) });
  await waiting; controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(cancelled, true);
});

test('total timeout settles even if a fetch ignores abort', async () => {
  let timeout, cleared = 0, signal;
  const pending = streamChat(args, { fetcher: async (_url, options) => {
    if (options.method === 'GET') return Response.json(snapshot);
    signal = options.signal; return new Promise(() => {});
  }, setTimer: fn => { timeout = fn; return 3; }, clearTimer: id => { assert.equal(id, 3); cleared++; } });
  for (let i = 0; i < 12 && !signal; i++) await Promise.resolve();
  timeout();
  await assert.rejects(pending, /超时/); assert.equal(cleared, 1);
  if (signal) assert.equal(signal.aborted, true);
});

test('pre-aborted or unsupported requests do not reach a provider or connection endpoint', async () => {
  let calls = 0; const fetcher = () => { calls++; throw new Error(); };
  const controller = new AbortController(); controller.abort();
  await assert.rejects(streamChat({ ...args, signal: controller.signal }, { fetcher }), error => error.name === 'AbortError');
  await assert.rejects(streamChat({ ...args, providerId: 'unknown' }, { fetcher }), /尚不支持/);
  assert.equal(calls, 0);
});

for (const providerId of ['anthropic', 'google', 'custom']) {
  test(`${providerId} sends the selected model through authenticated text streaming`, async () => {
    const requests = [], chunks = [];
    await streamChat({ ...args, providerId, onDelta: delta => chunks.push(delta) }, { fetcher: async (url, options) => {
      requests.push({ url, ...options });
      return options.method === 'GET'
        ? Response.json({ ...snapshot, connections: [{ ...snapshot.connections[0], providerId }] })
        : response(serialize(parts), { fragment: 1 });
    } });
    assert.deepEqual(chunks, ['你好']);
    assert.equal(requests[1].url, `/api/model-connections/${providerId}/chat`);
    assert.equal(requests[1].headers['X-Shipmate-CSRF'], 'test-csrf');
    assert.deepEqual(JSON.parse(requests[1].body), { model: args.model, messages: args.messages });
    assert.equal(requests.length, 2);
  });
}

test('catalog loading performs no inference and can be canceled', async () => {
  const requests = [];
  assert.deepEqual(await loadChatConnections({ fetcher: fetcherFor(() => { throw new Error('no inference'); }, requests) }), snapshot);
  assert.equal(requests.length, 1);
  const controller = new AbortController();
  const pending = loadChatConnections({ signal: controller.signal, fetcher: () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('coalesced network chunks have the same text as fragmented chunks below response limits', async () => {
  const deltas = Array.from({ length: 150 }, () => ({ type: 'text-delta', id: 't1', delta: 'x'.repeat(1000) }));
  const wire = serialize([parts[0], parts[1], ...deltas, ...parts.slice(3)]);
  for (const fragment of [wire.length, 4096]) {
    let output = '';
    await streamChat({ ...args, onDelta: delta => { output += delta; } }, { fetcher: fetcherFor(() => response(wire, { fragment })) });
    assert.equal(output.length, 150000);
  }
});
