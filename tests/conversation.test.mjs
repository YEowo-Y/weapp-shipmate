import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONVERSATION_STATES,
  createConversationController,
  createDemoPlan,
} from '../desktop/design-previews/conversation.js';

function manualScheduler() {
  let sequence = 0;
  const tasks = new Map();
  return {
    schedule(callback) {
      const id = ++sequence;
      tasks.set(id, callback);
      return id;
    },
    cancelSchedule(id) {
      tasks.delete(id);
    },
    flushOne() {
      const entry = tasks.entries().next().value;
      if (!entry) return false;
      tasks.delete(entry[0]);
      entry[1]();
      return true;
    },
    flushAll() {
      while (this.flushOne()) {
        // Drain the deterministic scheduler until the controller is idle.
      }
    },
    pending: () => tasks.size,
  };
}

function plan(overrides = {}) {
  return {
    workingDelayMs: 1,
    chunkDelayMs: 1,
    chunks: ['第一块', '第二块'],
    ...overrides,
  };
}

test('runs through working, streaming, and complete with ordered chunks', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({
    ...clock,
    planFactory: () => plan(),
    onEvent: (event) => events.push(event),
    eventTarget: null,
  });

  assert.deepEqual(controller.start({ input: '检查项目' }), { ok: true, runId: 1 });
  assert.equal(controller.getSnapshot().state, CONVERSATION_STATES.WORKING);
  clock.flushAll();

  assert.equal(controller.getSnapshot().state, CONVERSATION_STATES.COMPLETE);
  assert.deepEqual(events.filter((event) => event.type === 'chunk').map((event) => event.chunk), ['第一块', '第二块']);
  assert.deepEqual(events.filter((event) => event.type === 'state').map((event) => event.state), ['working', 'streaming', 'complete']);
});

test('invalid structured output ends in error without completion or approval result', () => {
  const clock = manualScheduler();
  const events = [];
  const badPlan = createDemoPlan('检查');
  badPlan.structuredResult.simulation = false;
  const controller = createConversationController({ ...clock, onEvent: event => events.push(event), eventTarget: null });
  controller.start({ input: '检查', plan: badPlan });
  clock.flushAll();
  assert.equal(controller.getSnapshot().state, 'error');
  assert.equal(events.some(event => event.type === 'complete'), false);
  assert.equal(events.at(-1).error.code, 'invalid_demo_result');
  assert.equal(events.at(-1).toolState, 'fail');
  assert.equal(events.at(-1).result, undefined);
});

test('run traces preserve identity, terminal timing, and tool cancellation', () => {
  const clock = manualScheduler();
  let time = 100;
  const controller = createConversationController({ ...clock, now: () => time, eventTarget: null });
  controller.start({ input: '检查' });
  assert.equal(controller.getSnapshot().toolState, null);
  while (controller.getSnapshot().toolState === null) assert.ok(clock.flushOne());
  assert.equal(controller.getSnapshot().toolState, 'running');
  time = 420;
  controller.stop();
  const stopped = controller.getSnapshot();
  assert.equal(stopped.runId, 1);
  assert.equal(stopped.elapsedMs, 320);
  assert.equal(stopped.toolState, 'canceled');
  time = 900;
  assert.equal(controller.getSnapshot().elapsedMs, 320);
  controller.retry();
  clock.flushAll();
  assert.equal(controller.getSnapshot().runId, 2);
  assert.equal(controller.getSnapshot().toolState, 'success');
  assert.equal(controller.getSnapshot().retry, true);
});

test('a tool without a validated result cannot finish successfully', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({ ...clock, onEvent: event => events.push(event), eventTarget: null });
  controller.start({ input: '检查', plan: plan({ tool: { name: 'demo_preflight' } }) });
  clock.flushAll();
  assert.equal(controller.getSnapshot().state, 'error');
  assert.equal(events.some(event => event.type === 'complete'), false);
  assert.equal(controller.getSnapshot().toolState, 'fail');
  assert.ok(Number.isFinite(controller.getSnapshot().elapsedMs));
});

test('stop cancels pending work, preserves partial output, and ignores stale callbacks', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({
    ...clock,
    planFactory: () => plan(),
    onEvent: (event) => events.push(event),
    eventTarget: null,
  });

  controller.start({ input: '检查项目' });
  clock.flushOne();
  const stopped = controller.stop();

  assert.equal(stopped.ok, true);
  assert.equal(stopped.output, '第一块');
  assert.equal(clock.pending(), 0);
  clock.flushAll();
  assert.equal(controller.getSnapshot().state, CONVERSATION_STATES.STOPPED);
  assert.equal(events.filter((event) => event.type === 'chunk').length, 1);
});

test('failure can retry without creating a second request lifecycle input', () => {
  const clock = manualScheduler();
  const events = [];
  const failing = plan({
    failAt: 1,
    failure: { code: 'tool_failed', message: '工具失败', retryable: true },
  });
  const controller = createConversationController({
    ...clock,
    planFactory: () => failing,
    onEvent: (event) => events.push(event),
    eventTarget: null,
  });

  controller.start({ input: '检查项目' });
  clock.flushAll();
  assert.equal(controller.getSnapshot().state, CONVERSATION_STATES.ERROR);

  const retried = controller.retry({ plan: plan() });
  assert.equal(retried.ok, true);
  clock.flushAll();

  const starts = events.filter((event) => event.type === 'run-start');
  assert.equal(starts.length, 2);
  assert.equal(starts[0].input, '检查项目');
  assert.equal(starts[1].input, '检查项目');
  assert.equal(starts[1].retry, true);
  assert.equal(controller.getSnapshot().state, CONVERSATION_STATES.COMPLETE);
});

test('rejects empty and concurrent starts', () => {
  const clock = manualScheduler();
  const controller = createConversationController({
    ...clock,
    planFactory: () => plan(),
    eventTarget: null,
  });

  assert.deepEqual(controller.start({ input: '   ' }), { ok: false, reason: 'empty' });
  assert.equal(controller.start({ input: '第一次' }).ok, true);
  assert.deepEqual(controller.start({ input: '第二次' }), { ok: false, reason: 'busy' });
});

test('stale callbacks from a stopped run cannot mutate the next run', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({
    schedule: clock.schedule,
    cancelSchedule: () => {
      // Deliberately leave canceled callbacks queued to exercise the run-id guard.
    },
    planFactory: (input) => plan({ chunks: [input] }),
    onEvent: (event) => events.push(event),
    eventTarget: null,
  });

  controller.start({ input: '旧运行' });
  controller.stop();
  controller.start({ input: '新运行' });
  clock.flushAll();

  assert.deepEqual(events.filter((event) => event.type === 'chunk').map((event) => event.chunk), ['新运行']);
  assert.equal(controller.getSnapshot().state, CONVERSATION_STATES.COMPLETE);
});

for (const terminal of ['stopped', 'complete', 'error']) {
  test(`finishes publishing ${terminal} before accepting a reentrant start`, () => {
    const clock = manualScheduler();
    const attempts = [];
    const events = [];
    const controller = createConversationController({
      ...clock,
      planFactory: () => plan(),
      onEvent(event) {
        events.push(event);
        if (event.runId === 1 && (event.type === terminal || (event.type === 'state' && event.state === terminal))) {
          attempts.push(controller.start({ input: '回调里的请求' }));
        }
      },
    });
    controller.start({ input: '第一条请求', ...(terminal === 'error' ? { plan: plan({ failAt: 0 }) } : {}) });
    if (terminal === 'stopped') controller.stop();
    clock.flushAll();
    assert.deepEqual(attempts, [{ ok: false, reason: 'busy' }, { ok: false, reason: 'busy' }]);
    assert.equal(events.at(-1).type, terminal);
    assert.equal(events.at(-1).runId, 1);
    assert.deepEqual(controller.start({ input: '第二条请求' }), { ok: true, runId: 2 });
    clock.flushAll();
    assert.equal(controller.getSnapshot().state, 'complete');
    assert.equal(controller.getSnapshot().output, '第一块第二块');
  });
}

for (const terminate of ['stop', 'dispose']) {
  test(`${terminate} leaves a replacement started by the transport abort listener intact`, async () => {
    const clock = manualScheduler();
    let signal, replacement;
    const controller = createConversationController({
      ...clock,
      transport(request) {
        signal = request.signal;
        signal.addEventListener('abort', () => {
          if (terminate === 'stop') controller.dispose();
          replacement = controller.start({ input: '新运行', plan: plan({ chunks: ['新结果'] }) });
        }, { once: true });
        return new Promise(() => {});
      },
    });
    controller.start({ input: '旧运行', live: { providerId: 'openai', model: 'fixture', messages: [] } });
    await Promise.resolve();
    assert.ok(signal);
    controller[terminate]();
    assert.equal(signal.aborted, true);
    assert.deepEqual(replacement, { ok: true, runId: 2 });
    assert.equal(controller.getSnapshot().state, 'working');
    assert.equal(clock.pending(), 1);
    clock.flushAll();
    assert.equal(controller.getSnapshot().state, 'complete');
    assert.equal(controller.getSnapshot().output, '新结果');
  });
}

test('tool execution is ordered between text parts and stops independently after success', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({ ...clock, onEvent: event => events.push(event), eventTarget: null });
  controller.start({ input: '检查', plan: createDemoPlan('检查') });
  assert.equal(controller.getSnapshot().toolState, null);
  while (!events.some(event => event.type === 'tool-result')) assert.ok(clock.flushOne());
  const types = events.map(event => event.type);
  assert.ok(types.indexOf('chunk') < types.indexOf('tool-start'));
  assert.ok(types.indexOf('tool-start') < types.indexOf('tool-result'));
  assert.equal(controller.getSnapshot().toolState, 'success');
  controller.stop();
  assert.equal(controller.getSnapshot().toolState, 'success', 'stopping text must not relabel a completed tool');
  assert.equal(events.some(event => event.type === 'complete'), false);
  assert.equal(clock.pending(), 0);
});

test('a plan failure owns a new run and retry request instead of corrupting the previous run', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({ ...clock, planFactory(input) {
    if (input === '失败请求') throw new Error('示例计划不可用');
    return plan();
  }, onEvent: event => events.push(event), eventTarget: null });
  controller.start({ input: '成功请求' });
  clock.flushAll();
  const previous = controller.getSnapshot();
  const result = controller.start({ input: '失败请求' });
  assert.equal(result.ok, false);
  const failed = controller.getSnapshot();
  assert.notEqual(failed.runId, previous.runId);
  assert.equal(failed.input, '失败请求');
  assert.equal(failed.output, '');
  assert.deepEqual(events.filter(event => event.runId === failed.runId).map(event => event.type), ['run-start', 'state', 'state', 'error']);
  controller.retry({ plan: plan() });
  assert.equal(controller.getSnapshot().input, '失败请求');
});

test('tool failure preserves the introductory text and emits no result or follow-up completion', () => {
  const clock = manualScheduler();
  const events = [];
  const controller = createConversationController({ ...clock, onEvent: event => events.push(event), eventTarget: null });
  controller.start({ input: '检查', plan: createDemoPlan('检查', { scenario: 'timeout' }) });
  clock.flushAll();
  assert.equal(controller.getSnapshot().state, 'error');
  assert.equal(controller.getSnapshot().toolState, 'fail');
  assert.equal(events.filter(event => event.type === 'chunk').length, 2);
  assert.equal(events.some(event => ['tool-result', 'complete'].includes(event.type)), false);
  assert.equal(events.at(-1).error.code, 'demo_timeout');
  assert.equal(clock.pending(), 0);
});
