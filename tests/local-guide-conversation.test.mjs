import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { runGuide } from '../src/guide.mjs';
import { createConversationController } from '../desktop/design-previews/conversation.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const input = () => ({ subject: 'personal', sensitive: false, domain: true });
const result = () => runGuide({ subject_type: 'personal', collects_sensitive: false, has_server_domain: true });

test('guide uses real tool events and validated result, never model transport', async () => {
  const events = [];
  let modelCalls = 0;
  const controller = createConversationController({ onEvent: event => events.push(event), transport: () => { modelCalls++; },
    guideTransport: async ({ input, onToolStart }) => { onToolStart({ toolCallId: 'g1', input }); return result(); } });
  assert.equal(controller.start({ input: '清单', guide: input() }).ok, true);
  await flush();
  assert.equal(controller.getSnapshot().state, 'complete');
  assert.equal(modelCalls, 0);
  assert.deepEqual(events.filter(event => ['tool-start', 'tool-result', 'complete'].includes(event.type)).map(event => event.type), ['tool-start', 'tool-result', 'complete']);
  assert.equal(events.find(event => event.type === 'tool-start').tool.kind, 'guide');
  assert.equal(events.find(event => event.type === 'complete').result.structuredResult.command, 'guide');
});

test('guide inputs are frozen for retries and invalid/ambiguous requests are refused', async () => {
  const requests = [];
  const controller = createConversationController({ guideTransport: async args => { requests.push(args); args.onToolStart({ toolCallId: 'g', input: args.input }); throw new Error('失败'); } });
  const guide = input();
  controller.start({ input: '清单', guide }); guide.subject = 'enterprise'; await flush();
  controller.retry(); await flush();
  assert.equal(requests.length, 2); assert.equal(requests[1].input.subject, 'personal');
  assert.equal(controller.start({ input: 'bad', guide: { ...input(), domain: 'yes' } }).ok, false);
  assert.equal(controller.start({ input: 'both', guide: input(), live: { providerId: 'openai', model: 'a', messages: [] } }).ok, false);
});

test('stopping guide aborts transport and rejects late output, including after replacement', async () => {
  let pending; let resolve;
  const controller = createConversationController({ guideTransport: args => { pending = args; return new Promise(done => { resolve = done; }); } });
  controller.start({ input: '清单', guide: input() }); await flush();
  pending.onToolStart({ toolCallId: 'g', input: pending.input });
  controller.stop(); assert.equal(pending.signal.aborted, true);
  resolve(result()); await flush();
  assert.equal(controller.getSnapshot().state, 'stopped');
  controller.start({ input: '清单', guide: input() }); await flush();
  controller.dispose(); assert.equal(pending.signal.aborted, true);
  resolve(result()); await flush(); assert.equal(controller.getSnapshot().state, 'idle');
});

test('invalid guide output cannot become success', async () => {
  const controller = createConversationController({ guideTransport: async ({ input, onToolStart }) => { onToolStart({ toolCallId: 'g', input }); return { invalid: true }; } });
  controller.start({ input: '清单', guide: input() }); await flush();
  assert.equal(controller.getSnapshot().state, 'error');
});

test('guide output without a tool start is rejected and explicit plans stay demo', async () => {
  let calls = 0;
  const controller = createConversationController({ guideTransport: async () => { calls++; return result(); } });
  controller.start({ input: '清单', guide: input() }); await flush();
  assert.equal(controller.getSnapshot().state, 'error');
  controller.start({ input: '演示', guide: input(), plan: { chunks: [] } });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().state, 'complete');
  controller.dispose();
});
