/* global Response, ReadableStream, TextEncoder */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runExplain } from '../src/explain.mjs';
import { queryExplain } from '../desktop/design-previews/explain-transport.js';

const snapshot = { storage: 'memory', csrfToken: 'explain-csrf', connections: [] };
const result = runExplain('隐私');
const fetcherFor = (reply, calls = []) => async (url, options) => {
  calls.push({ url, ...options });
  return options.method === 'GET' ? Response.json(snapshot) : reply();
};

test('real query binds trimmed input and uses the existing session without model credentials', async () => {
  const calls = [];
  assert.deepEqual(await queryExplain({ query: ' 隐私 ' }, { fetcher: fetcherFor(() => Response.json(result), calls) }), result);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/model-connections/tools/explain');
  assert.equal(calls[1].headers['X-Shipmate-CSRF'], 'explain-csrf');
  assert.equal(calls[1].credentials, 'same-origin');
  assert.equal(calls[1].redirect, 'error');
  assert.deepEqual(JSON.parse(calls[1].body), { query: '隐私' });
});

test('invalid input and an already cancelled query never use the network', async () => {
  let calls = 0;
  const options = { fetcher: () => { calls++; throw new Error(); } };
  for (const query of ['', ' ', 'x'.repeat(4097), 2]) await assert.rejects(queryExplain({ query }, options), /输入/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(queryExplain({ query: '隐私', signal: controller.signal }, options), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('unmatched input remains empty and mismatched, malformed or oversized results are rejected', async () => {
  const empty = runExplain('nothingxyz');
  assert.deepEqual(await queryExplain({ query: 'nothingxyz' }, { fetcher: fetcherFor(() => Response.json(empty)) }), empty);
  for (const reply of [() => Response.json(empty), () => Response.json({ secret: 'private' }), () => new Response('<html>secret</html>'), () => new Response('{', { headers: { 'Content-Type': 'application/json' } }), () => new Response(' '.repeat(600001), { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(queryExplain({ query: '隐私' }, { fetcher: fetcherFor(reply) }), error => /结果|格式|支持|过大/.test(error.message) && !error.message.includes('secret'));
  }
});

test('HTTP errors are actionable, sanitized and never automatically retried', async () => {
  for (const status of [400, 401, 403, 409, 413, 500, 504]) {
    const calls = [];
    await assert.rejects(queryExplain({ query: '隐私' }, { fetcher: fetcherFor(() => new Response('secret path', { status }), calls) }), error => !error.message.includes('secret') && /输入|会话|操作|超时|服务/.test(error.message));
    assert.equal(calls.length, 2);
  }
});

test('stop interrupts a blocked body reader and releases its lock', async () => {
  const controller = new AbortController(); let cancelled = false, started;
  const ready = new Promise(resolve => { started = resolve; });
  const body = new ReadableStream({ pull() { started(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const pending = queryExplain({ query: '隐私', signal: controller.signal }, { fetcher: fetcherFor(() => new Response(body, { headers: { 'Content-Type': 'application/json' } })) });
  await ready; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(cancelled, true); assert.equal(body.locked, false);
});

test('timeout settles a fetch that ignores abort and cancels its late response', async () => {
  let timeout, resolveFetch, cancelled = false;
  const pending = queryExplain({ query: '隐私' }, {
    fetcher: async (_url, options) => options.method === 'GET' ? Response.json(snapshot) : new Promise(resolve => { resolveFetch = resolve; }),
    setTimer: fn => { timeout = fn; return 1; }, clearTimer() {},
  });
  for (let i = 0; i < 40 && !resolveFetch; i++) await Promise.resolve();
  assert.ok(resolveFetch); timeout(); await assert.rejects(pending, /超时/);
  resolveFetch(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(cancelled, true);
});

test('UTF-8 characters split across chunks preserve the exact rule evidence', async () => {
  const data = new TextEncoder().encode(JSON.stringify(result)); let offset = 0;
  const body = new ReadableStream({ pull(controller) { if (offset === data.length) controller.close(); else controller.enqueue(data.slice(offset, ++offset)); } });
  assert.deepEqual(await queryExplain({ query: '隐私' }, { fetcher: fetcherFor(() => new Response(body, { headers: { 'Content-Type': 'application/json' } })) }), result);
});
