/* global Response, ReadableStream */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runExplain } from '../src/explain.mjs';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';
import { ConnectionError } from '../desktop/server/model-providers.mjs';

const input = { query: '诱导分享' };
const guideInput = { subject: 'personal', sensitive: true, domain: false };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function app(t, options = {}) {
  const handler = createModelConnectionHandler({ fetchImpl: () => { throw new Error('unexpected network'); }, ...options });
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const session = await fetch(`${origin}/api/model-connections`);
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const { csrfToken } = await session.json();
  return {
    handler,
    post: (value = input, { headers = {}, path = 'tools/explain', signal } = {}) => fetch(`${origin}/api/model-connections/${path}`, {
      method: 'POST', signal,
      headers: { cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Shipmate-CSRF': csrfToken, ...headers },
      body: JSON.stringify(value),
    }),
  };
}

async function retryAfterUnlock(client, value = input, options = {}) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await client.post(value, options);
    if (response.status !== 409) return response;
    await response.body.cancel();
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('session execution slot did not unlock');
}

test('explain returns real local results and genuine empty matches without a model', async t => {
  const client = await app(t);
  for (const query of ['诱导分享', '隐私', '不存在的拒因xyz0123']) {
    const response = await client.post({ query: `  ${query}  ` });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const result = await response.json();
    assert.deepEqual(result, runExplain(query, { includeDrafts: false }));
    if (query.startsWith('不存在')) assert.equal(result.items.length, 0);
    else assert.ok(result.items.length > 0);
  }
});

test('explain validates parameters and rejects unauthorized requests before execution', async t => {
  let calls = 0;
  const client = await app(t, { explainRunner: () => { calls++; return {}; } });
  for (const value of [null, [], {}, { query: '' }, { query: '  ' }, { query: 42 }, { query: 'x'.repeat(4097) }, { ...input, includeDrafts: true }, { ...input, root: 'C:/private' }]) {
    assert.equal((await client.post(value)).status, 400);
  }
  assert.equal((await client.post(input, { headers: { 'X-Shipmate-CSRF': '' } })).status, 403);
  assert.equal((await client.post(input, { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await client.post(input, { headers: { cookie: '' } })).status, 401);
  assert.equal((await client.post(input, { path: 'tools/explain/extra' })).status, 404);
  assert.equal(calls, 0);
});

test('explain runner failures and invalid results never expose private details and release the lock', async t => {
  for (const fail of [() => { throw new Error('private-secret /private/path'); }, () => { throw new ConnectionError('internal_runner', 'private-secret /private/path', 500); }, () => ({ command: 'explain', secret: 'private-secret' }), () => ({ ...runExplain(input.query), meta: { query: 'wrong', summary: 'private-secret' } })]) {
    let calls = 0;
    const client = await app(t, { explainRunner: query => ++calls === 1 ? fail() : runExplain(query) });
    const response = await client.post();
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.doesNotMatch(body, /private-secret|private\/path/);
    assert.equal(JSON.parse(body).error.code, 'explain_failed');
    assert.equal((await client.post()).status, 200);
  }
});

test('explain timeout cancels execution, blocks concurrent mutations and releases the session slot', async t => {
  const started = deferred();
  let calls = 0, signal;
  const client = await app(t, { explainTimeoutMs: 1000, explainRunner: (query, options) => {
    if (++calls > 1) return runExplain(query);
    signal = options.signal;
    assert.equal(options.includeDrafts, false);
    started.resolve();
    return new Promise(() => {});
  } });
  const pending = client.post();
  await started.promise;
  assert.equal((await client.post()).status, 409);
  assert.equal((await client.post({ apiKey: 'key' }, { path: 'openai/connect' })).status, 409);
  assert.equal((await client.post(guideInput, { path: 'tools/guide' })).status, 409);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'query_timeout');
  assert.equal(signal.aborted, true);
  assert.equal((await client.post()).status, 200);
});

test('disconnect cancels explain, ignores late output and allows a fresh query', async t => {
  const started = deferred(), output = deferred(), aborted = deferred();
  let calls = 0;
  const client = await app(t, { explainRunner: (query, { signal }) => {
    if (++calls > 1) return runExplain(query);
    signal.addEventListener('abort', aborted.resolve, { once: true });
    started.resolve();
    return output.promise;
  } });
  const controller = new AbortController();
  const pending = client.post(input, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started.promise;
  controller.abort();
  await rejected;
  await aborted.promise;
  output.resolve(runExplain(input.query));
  const response = await retryAfterUnlock(client);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), runExplain(input.query));
});

test('a running guide blocks explain and cancellation releases the shared slot', async t => {
  const started = deferred();
  const client = await app(t, { guideRunner: () => { started.resolve(); return new Promise(() => {}); } });
  const guide = await client.post(guideInput, { path: 'tools/guide' });
  await started.promise;
  assert.equal((await client.post()).status, 409);
  await guide.body.cancel();
  assert.equal((await retryAfterUnlock(client)).status, 200);
});

test('dispose and session expiry cancel pending explain without returning late output', async t => {
  for (const mode of ['dispose', 'expire']) {
    const started = deferred(), output = deferred();
    let now = 100, signal;
    const client = await app(t, { now: () => now, explainRunner: (_query, options) => {
      signal = options.signal;
      started.resolve();
      return output.promise;
    } });
    const pending = client.post();
    await started.promise;
    if (mode === 'dispose') client.handler.dispose();
    else { now += 3600001; assert.equal((await client.post()).status, 401); }
    const response = await pending;
    assert.equal(response.status, 408);
    assert.equal(signal.aborted, true);
    assert.equal((await response.json()).error.code, 'query_cancelled');
    output.resolve(runExplain(input.query));
  }
});

test('explain and live inference share the session execution slot in both directions', async t => {
  const started = deferred();
  const client = await app(t, {
    explainRunner: () => { started.resolve(); return new Promise(() => {}); },
    fetchImpl: async url => url.endsWith('/models')
      ? new Response(JSON.stringify({ data: [{ id: 'test' }] }), { headers: { 'Content-Type': 'application/json' } })
      : new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('data: {"type":"response.output_text.delta","delta":"partial"}\n\n')); } }), { headers: { 'Content-Type': 'text/event-stream' } }),
  });
  assert.equal((await client.post({ apiKey: 'key' }, { path: 'openai/connect' })).status, 200);
  const controller = new AbortController();
  const pending = client.post(input, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started.promise;
  const chat = { model: 'test', messages: [{ role: 'user', content: 'hello' }] };
  assert.equal((await client.post(chat, { path: 'openai/chat' })).status, 409);
  controller.abort();
  await rejected;
  const response = await retryAfterUnlock(client, chat, { path: 'openai/chat' });
  assert.equal(response.status, 200);
  assert.equal((await client.post()).status, 409);
  await response.body.cancel();
});
