/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';
import { streamGuide } from '../desktop/design-previews/guide-transport.js';
import { runGuide } from '../src/guide.mjs';

const input = { subject: 'personal', sensitive: true, domain: false };
const result = runGuide({ subject_type: input.subject, collects_sensitive: input.sensitive, has_server_domain: input.domain });
const snapshot = { storage: 'memory', csrfToken: 'guide-csrf', connections: [] };
const frames = [
  { type: 'start', messageId: 'guide-message' },
  { type: 'tool-input-available', toolCallId: 'guide-call', toolName: 'weapp_shipmate_guide', input },
  { type: 'tool-output-available', toolCallId: 'guide-call', output: result },
  { type: 'finish', finishReason: 'stop' }, '[DONE]',
];
const serialize = values => values.map(value => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`).join('');
function response(values, fragment = 31, cancelled = () => {}) {
  const bytes = new TextEncoder().encode(serialize(values));
  let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset === bytes.length) return controller.close();
    controller.enqueue(bytes.slice(offset, offset += Math.min(fragment, bytes.length - offset)));
  }, cancel: cancelled }), { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
}
function fetcherFor(reply, requests = []) {
  return async (url, options) => {
    requests.push({ url, ...options });
    return options.method === 'GET' ? Response.json(snapshot) : reply();
  };
}

test('local guide uses fresh CSRF without model connection and decodes UTF-8 across network chunks', async () => {
  for (const fragment of [1, 200000]) {
    const requests = [], started = [];
    const output = await streamGuide({ input, onToolStart: value => started.push(value) }, { fetcher: fetcherFor(() => response(frames, fragment), requests) });
    assert.deepEqual(output, result);
    assert.deepEqual(started, [{ toolCallId: 'guide-call', input }]);
    assert.equal(requests[1].url, '/api/model-connections/tools/guide');
    assert.equal(requests[1].headers['X-Shipmate-CSRF'], 'guide-csrf');
    assert.equal(requests[1].credentials, 'same-origin');
    assert.deepEqual(JSON.parse(requests[1].body), input);
    assert.equal(requests.length, 2);
  }
});

test('guide result requires matching input, tool name, call ID and complete terminal sequence', async () => {
  for (const bad of [
    frames.slice(0, 3), [...frames.slice(0, 3), '[DONE]'],
    [frames[0], { ...frames[1], toolName: 'exec' }, ...frames.slice(2)],
    [frames[0], { ...frames[1], input: { ...input, subject: 'enterprise' } }, ...frames.slice(2)],
    [frames[0], frames[1], { ...frames[2], toolCallId: 'other' }, ...frames.slice(3)],
    [frames[0], frames[1], frames[1], ...frames.slice(2)],
    [frames[0], frames[1], { ...frames[2], output: { ...result, command: 'check' } }, ...frames.slice(3)],
    [...frames.slice(0, 3), { type: 'finish', finishReason: 'error' }, '[DONE]'],
    [frames[0], { type: 'text-start', id: 'not-a-model' }, ...frames.slice(2)],
  ]) await assert.rejects(streamGuide({ input }, { fetcher: fetcherFor(() => response(bad)) }), /清单|格式|中断|完成|校验/);
});

test('tool failure and HTTP error cannot leak raw error text or publish result', async () => {
  const requests = [];
  const bad = [frames[0], frames[1], { type: 'tool-output-error', toolCallId: 'guide-call', errorText: 'secret path credential' }, { type: 'finish', finishReason: 'error' }, '[DONE]'];
  await assert.rejects(streamGuide({ input }, { fetcher: fetcherFor(() => response(bad), requests) }), error => /清单|失败/.test(error.message) && !error.message.includes('secret'));
  assert.equal(requests.length, 2);
  await assert.rejects(streamGuide({ input }, { fetcher: fetcherFor(() => new Response('secret path', { status: 409 })) }), error => /操作|执行/.test(error.message) && !error.message.includes('secret'));
});

test('invalid inputs and pre-abort do not make local or provider requests', async () => {
  let calls = 0;
  const fetcher = () => { calls++; throw new Error(); };
  await assert.rejects(streamGuide({ input: { ...input, dir: 'C:/private' } }, { fetcher }), /参数|输入/);
  await assert.rejects(streamGuide({ input: { subject: 'personal', sensitive: true } }, { fetcher }), /参数|输入/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(streamGuide({ input, signal: controller.signal }, { fetcher }), error => error.name === 'AbortError');
  assert.equal(calls, 0);
});

test('stopping after tool start cancels reader and discards even coalesced results', async () => {
  const controller = new AbortController(); let canceled = false;
  await assert.rejects(streamGuide({ input, signal: controller.signal, onToolStart: () => controller.abort() }, {
    fetcher: fetcherFor(() => new Response(new ReadableStream({
      start(stream) { stream.enqueue(new TextEncoder().encode(serialize(frames))); },
      cancel() { canceled = true; },
    }), { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } })),
  }), error => error.name === 'AbortError');
  assert.equal(canceled, true);
});

test('bounded timeout settles an uncooperative fetch and cancels late response body', async () => {
  let timeout, resolveFetch, canceled = false;
  const pending = streamGuide({ input }, {
    fetcher: async (_url, options) => options.method === 'GET' ? Response.json(snapshot) : new Promise(resolve => { resolveFetch = resolve; }),
    setTimer: fn => { timeout = fn; return 4; }, clearTimer: () => {},
  });
  for (let i = 0; i < 30 && !resolveFetch; i++) await Promise.resolve();
  assert.ok(resolveFetch);
  timeout(); await assert.rejects(pending, /超时/);
  resolveFetch(response(frames, 200000, () => { canceled = true; }));
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(canceled, true);
});
