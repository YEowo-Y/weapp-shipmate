import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createConversationController } from '../desktop/design-previews/conversation.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const request = () => ({ input: 'Hello', live: { providerId: 'openai', model: 'test-model', label: 'Test', messages: [{ role: 'user', content: 'Hello' }] } });
test('real text emits incremental output and completes without demo tools or approval', async () => {
  const events = [];
  const controller = createConversationController({ onEvent: event => events.push(event), transport: async ({ onDelta }) => { onDelta('Hello'); onDelta(' world'); } });
  assert.equal(controller.start(request()).ok, true);
  await tick();
  assert.equal(controller.getSnapshot().output, 'Hello world');
  assert.equal(controller.getSnapshot().state, 'complete');
  assert.equal(events.some(event => event.type === 'tool-start'), false);
  assert.equal(events.find(event => event.type === 'complete').result.review, undefined);
});
test('stop aborts real transport and ignores late deltas and completion', async () => {
  let active;
  let resolve;
  const controller = createConversationController({ transport: options => { active = options; return new Promise(done => { resolve = done; }); } });
  controller.start(request()); await tick();
  active.onDelta('partial'); controller.stop();
  assert.equal(active.signal.aborted, true);
  active.onDelta('late'); resolve(); await tick();
  assert.equal(controller.getSnapshot().state, 'stopped');
  assert.equal(controller.getSnapshot().output, 'partial');
});
test('stopping from the streaming state event suppresses the current and later deltas', async () => {
  const events = [];
  let transportSignal;
  const controller = createConversationController({
    transport({ onDelta, signal }) {
      transportSignal = signal;
      onDelta('first');
      onDelta('late');
    },
    onEvent(event) {
      events.push(event);
      if (event.type === 'state' && event.state === 'streaming') controller.stop();
    },
  });
  controller.start(request());
  await tick();
  assert.equal(transportSignal?.aborted, true);
  assert.equal(controller.getSnapshot().state, 'stopped');
  assert.equal(controller.getSnapshot().output, '');
  assert.deepEqual(events.filter(event => ['chunk', 'complete'].includes(event.type)), []);
});
test('retry freezes original model and history; failure preserves partial output', async () => {
  const requests = [];
  const controller = createConversationController({ transport: async options => { requests.push(options); options.onDelta('part'); throw new Error('连接中断，请重试。'); } });
  const original = request(); controller.start(original);
  original.live.model = 'changed'; original.live.messages[0].content = 'changed';
  await tick();
  assert.equal(controller.getSnapshot().state, 'error');
  assert.equal(controller.getSnapshot().output, 'part');
  controller.retry(); await tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].model, 'test-model');
  assert.equal(requests[1].messages[0].content, 'Hello');
});
test('explicit demo plans never call transport even with live selection', async () => {
  let calls = 0;
  const controller = createConversationController({ transport: async () => { calls++; } });
  controller.start({ ...request(), plan: { chunks: [] } });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 0);
  assert.equal(controller.getSnapshot().state, 'complete');
  controller.dispose();
});

for (const providerId of ['anthropic', 'google']) {
  test(`${providerId} failed partial response recovers only on manual retry with original history`, async () => {
    const requests = [];
    const controller = createConversationController({ transport: async options => {
      requests.push(options);
      if (requests.length === 1) { options.onDelta('partial'); throw new Error('连接中断，请重试。'); }
      options.onDelta('Recovered');
    } });
    const original = request(); original.live.providerId = providerId;
    original.live.model = providerId === 'google' ? 'models/gemini-test' : 'claude-test';
    controller.start(original); await tick();
    assert.equal(controller.getSnapshot().state, 'error');
    assert.equal(controller.getSnapshot().output, 'partial');
    assert.equal(requests.length, 1, 'failed inference is never automatically retried');
    controller.retry(); await tick();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].providerId, providerId);
    assert.deepEqual(requests[1].messages, [{ role: 'user', content: 'Hello' }]);
    assert.equal(controller.getSnapshot().state, 'complete');
    assert.equal(controller.getSnapshot().output, 'Recovered');
    controller.dispose();
  });
}
