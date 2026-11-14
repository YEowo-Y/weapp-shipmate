/* global Response, structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAgentStream, streamChat } from '../desktop/design-previews/chat-transport.js';
import { normalizeSessionSnapshot } from '../desktop/design-previews/session-store.js';

export const result = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '检查报告', summary: '请核对范围', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
const start = [{ type: 'start', messageId: 'm1' }, { type: 'start-step' }];
const tool = (toolCallId = 'tool1') => [{ type: 'tool-input-start', toolCallId, toolName: 'project_read' }, { type: 'tool-input-delta', toolCallId, inputTextDelta: '{"kind":"check","query":""}' }, { type: 'tool-input-available', toolCallId, toolName: 'project_read', input: { kind: 'check', query: '' } }, { type: 'tool-output-available', toolCallId, output: result }];
const text = (id, delta) => [{ type: 'text-start', id }, { type: 'text-delta', id, delta }, { type: 'text-end', id }];
const end = [{ type: 'finish-step' }, { type: 'finish', finishReason: 'stop' }, '[DONE]'];
const read = async (events, onDelta = () => {}, onToolEvent = () => {}, signal = new AbortController().signal) => readAgentStream(new Response(events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\r\n\r\n`).join('')).body, signal, onDelta, onToolEvent);

test('agent multi-step text and tools keep SDK IDs in arrival order', async () => {
  const seen = [];
  await read([...start, ...text('t1', '先检查'), ...tool(), { type: 'finish-step' }, { type: 'start-step' }, ...tool('tool2'), ...text('t2', '再说明'), ...end], (delta, meta) => seen.push([meta.textId, delta]), event => { if (event.type === 'tool-output-available') seen.push(event.toolCallId); });
  assert.deepEqual(seen, [['t1', '先检查'], 'tool1', 'tool2', ['t2', '再说明']]);
});

test('agent invalid, duplicate, late, incomplete and oversized tool events fail closed', async () => {
  const cases = [
    [...start, ...tool(), ...tool(), ...end],
    [...start, tool()[0], tool()[3], ...end],
    [...start, tool()[0], { ...tool()[2], input: { kind: 'check', query: '', directory: 'C:/' } }, ...end],
    [...start, ...tool().slice(0, 3), { ...tool()[3], output: { ...result, directory: 'private' } }, ...end],
    [...start, ...tool().slice(0, 3), ...end],
    [...start, ...tool(), ...end.slice(0, -1)],
    [...start, ...tool(), ...end.slice(0, -1), tool()[3], '[DONE]'],
    [...start, tool()[0], { ...tool()[1], inputTextDelta: 'a'.repeat(32769) }],
    [...start, ...tool(), ...tool('tool2'), ...tool('tool3'), ...end],
    [...start, ...text('t1', 'partial'), { type: 'finish-step' }, { type: 'finish', finishReason: 'length' }, '[DONE]'],
  ];
  for (const events of cases) await assert.rejects(read(events), /格式|顺序|中断|完成/);
});

test('agent no-tool answer completes but failed tool cannot become successful', async () => {
  await read([...start, ...text('t1', '请提供问题'), ...end]);
  await assert.rejects(read([...start, ...tool().slice(0, 3), { type: 'tool-output-error', toolCallId: 'tool1', errorText: '项目忙碌，请重试' }, ...end]), /未完成/);
});

test('agent stop prevents late tool callbacks', async () => {
  const controller = new AbortController(), seen = [];
  await assert.rejects(read([...start, ...tool(), ...end], () => {}, event => { seen.push(event.type); controller.abort(); }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(seen, ['tool-input-start']);
});

test('restart retains completed project tools, stops pending ones and strips all grants', () => {
  const done = { type: 'tool', tool: { kind: 'project', name: 'project_read', toolCallId: 'tool1', state: 'success', label: '检查项目', parameters: { kind: 'check', query: '' } }, result };
  const pending = { type: 'tool', tool: { kind: 'project', name: 'project_read', toolCallId: 'tool2', state: 'running', label: '准备工具' } };
  const snapshot = { version: 1, sessionSequence: 1, currentSessionId: 'session-1', sessions: [{ id: 'session-1', title: '项目', draft: '', agent: { allowRead: true }, messages: [{ id: 'a1', role: 'assistant', text: '检查', status: 'streaming', live: { providerId: 'openai', model: 'test', messages: [], agent: { allowRead: true } }, parts: [done, { type: 'text', text: '说明', textId: 't1' }, pending] }] }] };
  const saved = normalizeSessionSnapshot(snapshot, { restore: true });
  const message = saved.sessions[0].messages[0];
  assert.equal(message.status, 'stopped'); assert.equal(message.parts[0].tool.state, 'success'); assert.equal(message.parts[2].tool.state, 'canceled');
  assert.doesNotMatch(JSON.stringify(saved), /allowRead|"agent"/);
  const invalid = structuredClone(snapshot); invalid.sessions[0].messages[0].parts[0].result.sourceUrl = 'javascript:alert(1)';
  assert.throws(() => normalizeSessionSnapshot(invalid));
});


test('agent route carries current explicit grants separately from model messages', async () => {
  const calls = [];
  const agent = { projectId: 'project-1', sessionId: 'session-1', allowRead: true, shareResults: false };
  const args = { providerId: 'openai', model: 'test', messages: [{ role: 'user', content: '检查项目' }], agent };
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (init.method === 'GET') return Response.json({ storage: 'memory', csrfToken: 'csrf', connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'test', name: 'Test' }] }] });
    return new Response([...start, ...tool(), ...end].map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
  };
  await streamChat(args, { fetcher });
  assert.equal(calls[1].path, '/api/model-connections/openai/agent');
  assert.deepEqual(JSON.parse(calls[1].init.body), { model: args.model, messages: args.messages, agent });
  await assert.rejects(streamChat({ ...args, providerId: 'custom' }, { fetcher }), /授权/);
  assert.equal(calls.length, 2, 'unsupported agent provider must not send a request');
});
