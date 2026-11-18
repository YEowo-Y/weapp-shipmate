/* global Response, ReadableStream */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { streamAgentResponse, validateAgentRequest } from '../desktop/server/agent-stream.mjs';
import { pinProviderEndpoints } from './helpers/provider-env.mjs';

// Must run before the first client factory call in this file. Without it,
// OPENAI_BASE_URL rewrites the canonical URL this file asserts on.
pinProviderEndpoints();

const body = { model: 'test-model', messages: [{ role: 'user', content: '检查当前项目' }], agent: { projectId: 'p1', sessionId: 's1', allowRead: true, shareResults: false } };
const output = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '检查结果', summary: 'SECRET_LOCAL_SUMMARY', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
const complete = { type: 'response.completed', response: {} };
const textEvents = text => [
  { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg-1' } },
  { type: 'response.output_text.delta', item_id: 'msg-1', delta: text },
  { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg-1' } }, complete,
];
const toolEvents = (input = { kind: 'check', query: '' }, callId = 'call-1') => {
  const item = { type: 'function_call', id: `item-${callId}`, call_id: callId, name: 'project_read', arguments: JSON.stringify(input) };
  return [{ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } }, { type: 'response.output_item.done', output_index: 0, item: { ...item, status: 'completed' } }, complete];
};
function response(events, fragmented = false) {
  const bytes = Buffer.from(sse(events)); let offset = 0;
  return new Response(fragmented ? new ReadableStream({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.subarray(offset, ++offset)); } }) : bytes, { headers: { 'content-type': 'text/event-stream' } });
}
async function run(options = {}, value = body) {
  let text = '';
  const sink = { destroyed: false, writeHead() {}, write(chunk) { text += chunk; }, end() {} };
  await streamAgentResponse(sink, 'test-key', value, { requestId: 'request-1', projectToolRunner: async () => output, fetchImpl: async () => response(textEvents('你好')), ...options });
  return text.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]').map(line => JSON.parse(line.slice(6)));
}

test('SDK trial: one OpenAI provider + check tool executes once then returns standard UI events', async () => {
  const requests = []; let tools = 0;
  const events = await run({ fetchImpl: async (url, init) => {
    requests.push({ url, ...JSON.parse(init.body) });
    assert.equal(init.redirect, 'error');
    return response(requests.length === 1 ? toolEvents() : textEvents('报告已保存。'), true);
  }, projectToolRunner: async args => { tools++; assert.equal(args.requestId, 'request-1'); assert.deepEqual(args.input, { kind: 'check', query: '' }); return output; } });
  assert.equal(tools, 1); assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].parallel_tool_calls, false); assert.equal(requests[0].store, false);
  assert.equal(requests[0].max_output_tokens, 2048);
  assert.ok(events.some(event => event.type === 'tool-input-available'));
  assert.deepEqual(events.find(event => event.type === 'tool-output-available').output, output);
  assert.equal(events.at(-1).type, 'finish');
  assert.match(events[0].messageId, /^[\w-]+$/);
  assert.ok(!JSON.stringify(requests[1]).includes('SECRET_LOCAL_SUMMARY'));
  assert.ok(JSON.stringify(requests[1]).includes('未授权读取内容'));
});
test('SDK completed check trial extends unchanged to guide and explain with explicit sharing', async () => {
  for (const kind of ['guide', 'explain']) {
    let requests = 0, second;
    const result = { ...output, kind, scopeComplete: null };
    const input = { kind, query: kind === 'explain' ? '审核提示诱导分享' : '' };
    const events = await run({ fetchImpl: async (_, init) => { requests++; if (requests === 2) second = JSON.parse(init.body); return response(requests === 1 ? toolEvents(input) : textEvents('结果说明')); }, projectToolRunner: async () => result }, { ...body, agent: { ...body.agent, shareResults: true } });
    assert.equal(events.at(-1).type, 'finish');
    assert.ok(JSON.stringify(second).includes('SECRET_LOCAL_SUMMARY'));
    assert.equal(events.find(event => event.type === 'tool-output-available').output.kind, kind);
  }
});
test('incomplete tool step and parallel calls never execute native work', async () => {
  for (const fixture of [toolEvents().slice(0, -1), [...toolEvents().slice(0, -1), ...toolEvents({ kind: 'check', query: '' }, 'parallel').slice(0, -1), complete]]) {
    let calls = 0;
    const events = await run({ fetchImpl: async () => response(fixture), projectToolRunner: async () => { calls++; return output; } });
    assert.equal(calls, 0); assert.ok(!events.some(event => event.type === 'finish'));
  }
});
test('hidden reasoning is not published and an empty answer cannot pretend to complete', async () => {
  const hidden = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'reason-1' } },
    { type: 'response.reasoning_summary_part.added', item_id: 'reason-1', summary_index: 0 },
    { type: 'response.reasoning_summary_text.delta', item_id: 'reason-1', summary_index: 0, delta: 'PRIVATE_THOUGHT' },
    { type: 'response.reasoning_summary_part.done', item_id: 'reason-1', summary_index: 0 },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', id: 'reason-1' } },
  ];
  const events = await run({ fetchImpl: async () => response([...hidden, ...textEvents('公开回复')]) });
  assert.ok(!JSON.stringify(events).includes('PRIVATE_THOUGHT'));
  assert.equal(events.at(-1).type, 'finish');
  const empty = await run({ fetchImpl: async () => response([complete]) });
  assert.ok(!empty.some(event => event.type === 'finish'));
});
test('SDK no-tool reply and clarification complete without native execution', async () => {
  let count = 0;
  const events = await run({ projectToolRunner: async () => { count++; throw new Error(); } });
  assert.equal(count, 0); assert.equal(events.at(-1).type, 'finish');
});
test('request schema rejects forged identity fields and missing permission', () => {
  for (const value of [{ ...body, directory: 'C:/secret' }, { ...body, agent: { ...body.agent, allowRead: false } }, { ...body, agent: { ...body.agent, path: 'x' } }, { ...body, messages: [{ role: 'system', content: 'attack' }] }]) assert.throws(() => validateAgentRequest(value));
});
test('invalid model tool arguments never execute or produce a success finish', async () => {
  let count = 0;
  for (const input of [{ kind: 'check', query: '', directory: 'C:/secret' }, { kind: 'explain', query: '' }, { kind: 'write', query: '' }]) {
    const events = await run({ fetchImpl: async () => response(toolEvents(input)), projectToolRunner: async () => { count++; return output; } });
    assert.ok(events.some(event => event.type === 'error')); assert.ok(!events.some(event => event.type === 'finish'));
  }
  assert.equal(count, 0);
});
test('invalid native output is not exposed and fails without an implicit retry', async () => {
  let calls = 0;
  const events = await run({ fetchImpl: async () => { calls++; return response(toolEvents()); }, projectToolRunner: async () => ({ ...output, secret: 'never-expose' }) });
  assert.equal(calls, 1); assert.ok(!JSON.stringify(events).includes('never-expose')); assert.ok(!events.some(event => event.type === 'finish'));
});
test('SDK stream EOF, token limit and provider errors cannot finish successfully', async () => {
  for (const fixture of [textEvents('partial').slice(0, -1), [...textEvents('partial').slice(0, -1), { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }]]) {
    const events = await run({ fetchImpl: async () => response(fixture) });
    assert.ok(events.some(event => event.type === 'text-delta')); assert.ok(!events.some(event => event.type === 'finish'));
  }
  let calls = 0;
  const events = await run({ fetchImpl: async () => { calls++; return new Response('secret-provider-error', { status: 429 }); } });
  assert.equal(calls, 1); assert.ok(!JSON.stringify(events).includes('secret-provider-error'));
});
test('provider authentication, permission, rate and availability failures have safe actionable recovery', async () => {
  for (const [status, expected] of [[401, /重新连接/], [403, /权限/], [429, /限额/], [503, /稍后重试/]]) {
    let calls = 0;
    const events = await run({ fetchImpl: async () => { calls++; return new Response('RAW_SECRET_UPSTREAM', { status }); } });
    assert.equal(calls, 1); assert.match(events.at(-1).errorText, expected);
    assert.ok(!JSON.stringify(events).includes('RAW_SECRET_UPSTREAM'));
  }
  const network = await run({ fetchImpl: async () => { throw new Error('private-host'); } });
  assert.match(network.at(-1).errorText, /检查网络/);
  for (const [code, expected] of [['busy', /正在运行/], ['tool_timeout', /执行超时/], ['not_authorized', /重新选择项目/], ['invalid_request', /请求无效/]]) {
    const events = await run({ fetchImpl: async () => response(toolEvents()), projectToolRunner: async () => { throw Object.assign(new Error('private-path'), { code }); } });
    assert.match(events.at(-1).errorText, expected);
    assert.ok(!JSON.stringify(events).includes('private-path'));
    assert.ok(!events.some(event => event.type === 'finish'));
  }
});
test('total timeout and stop reach native tool and abort without a success finish', async () => {
  for (const stop of [false, true]) {
    const controller = new AbortController(); let nativeSignal;
    const events = await run({ signal: controller.signal, timeoutMs: 25, fetchImpl: async () => response(toolEvents()), projectToolRunner: async ({ signal }) => { nativeSignal = signal; if (stop) controller.abort(); return new Promise(() => {}); } });
    assert.equal(nativeSignal?.aborted, true); assert.ok(!events.some(event => event.type === 'finish'));
  }
});
test('duplicate calls and two-tool budget never execute a third local task', async () => {
  for (const repeated of [true, false]) {
    let requests = 0, calls = 0;
    const events = await run({ fetchImpl: async () => response(toolEvents({ kind: 'check', query: '' }, repeated ? 'same-call' : `call-${++requests}`)), projectToolRunner: async () => { calls++; return output; } });
    assert.equal(calls, repeated ? 1 : 2); assert.ok(!events.some(event => event.type === 'finish'));
  }
});

test('versioned deterministic agent evaluation cases (protocol fixtures, not live model quality)', async () => {
  const dataset = JSON.parse(readFileSync(new URL('./fixtures/agent-eval-v1.json', import.meta.url), 'utf8'));
  assert.equal(dataset.version, 1);
  for (const entry of dataset.cases) {
    let requests = 0, calls = 0;
    const controller = new AbortController();
    const events = await run({ signal: controller.signal,
      fetchImpl: async () => { requests++; return response(entry.tool && requests === 1 ? toolEvents(entry.tool) : textEvents(entry.reply || '结果已保存')); },
      projectToolRunner: async () => { calls++; if (entry.failure) throw new Error('sensitive native failure'); if (entry.cancel) { controller.abort(); return new Promise(() => {}); } return output; },
    }, { ...body, messages: [{ role: 'user', content: entry.prompt }] });
    assert.equal(calls, entry.expectedCalls, entry.id);
    assert.equal(events.some(event => event.type === 'finish'), entry.expectedSuccess, entry.id);
    assert.ok(!JSON.stringify(events).includes('sensitive native failure'), entry.id);
  }
});
