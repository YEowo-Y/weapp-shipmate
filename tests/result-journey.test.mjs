import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthReplay, HEALTH_MONITORS, mountHealth } from '../desktop/design-previews/health.js';

// Real rejection-query journeys are covered by local-explain-ui.test.mjs.

function replayHarness() {
  let next = 0;
  const queue = new Map();
  const states = [];
  const replay = createHealthReplay({
    schedule(callback) { const id = ++next; queue.set(id, callback); return id; },
    clearSchedule(id) { queue.delete(id); },
    onChange(state) { states.push(state); },
  });
  function tick() { const [id, callback] = queue.entries().next().value; queue.delete(id); callback(); }
  return { replay, queue, states, tick };
}

test('health replay has bounded progress and duplicate starts cannot schedule extra work', () => {
  const { replay, queue, tick, states } = replayHarness();
  assert.equal(replay.start(), true);
  assert.equal(replay.start(), false);
  assert.equal(queue.size, 1);
  assert.equal(replay.getState().status, 'running');
  for (let step = 1; step <= HEALTH_MONITORS.length; step++) {
    tick();
    assert.equal(replay.getState().completed, step);
  }
  assert.equal(queue.size, 0);
  assert.equal(replay.getState().status, 'completed');
  assert.ok(states.every(state => state.source === 'local-demo'));
  assert.ok(states.every(state => state.verified === false));
  assert.equal(replay.start(), true);
  assert.equal(replay.getState().completed, 0);
  replay.dispose();
  assert.equal(queue.size, 0);
});

test('stopping replay invalidates its pending callback and self-review remains separate from health verification', () => {
  const { replay, queue } = replayHarness();
  assert.equal(replay.toggleReviewed(), true);
  assert.equal(replay.getState().reviewed, true);
  replay.start();
  assert.equal(replay.toggleReviewed(), false, 'self-review is disabled while replay runs');
  const late = [...queue.values()][0];
  assert.equal(replay.stop(), true);
  late();
  assert.equal(replay.getState().status, 'stopped');
  assert.equal(queue.size, 0);
  assert.equal(replay.getState().completed, 0);
  assert.equal(replay.getState().reviewed, true);
  assert.equal(replay.getState().verified, false);
  assert.equal(replay.toggleReviewed(), true);
  assert.equal(replay.getState().reviewed, false);
  assert.equal(replay.stop(), false);
});

test('health controls remain usable after returning from the browser page cache', () => {
  const nodes = Object.fromEntries(['healthReplay', 'healthStatus', 'healthReviewed', 'healthProgress'].map(id => [id, {
    attributes: {}, classes: new Set(), events: {},
    addEventListener(type, callback) { this.events[type] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    fire(type) { this.events[type]?.(); },
  }]));
  for (const node of Object.values(nodes)) node.classList = {
    toggle(name, active) { if (active) node.classes.add(name); else node.classes.delete(name); },
  };
  const events = {};
  const replay = mountHealth({ getElementById: id => nodes[id] }, {
    addEventListener(type, callback) { events[type] = callback; },
  });
  try {
    nodes.healthReplay.fire('click');
    assert.equal(replay.getState().status, 'running');
    assert.equal(nodes.healthReviewed.disabled, true);
    assert.equal(nodes.healthStatus.classes.has('is-working'), true);
    events.pagehide();
    assert.equal(replay.getState().status, 'stopped');
    assert.equal(nodes.healthReviewed.disabled, false);
    assert.equal(nodes.healthStatus.classes.has('is-working'), false);
    // A restored page keeps its existing event handlers and must be able to run again.
    nodes.healthReplay.fire('click');
    assert.equal(replay.getState().status, 'running');
    events.pagehide();
    assert.equal(replay.getState().status, 'stopped');
    nodes.healthReviewed.fire('click');
    assert.equal(nodes.healthReviewed.attributes['aria-pressed'], 'true');
    assert.match(nodes.healthStatus.textContent, /已停止/);
    assert.match(nodes.healthStatus.textContent, /已在本页标记为阅读/);
    nodes.healthReviewed.fire('click');
    assert.equal(nodes.healthReviewed.attributes['aria-pressed'], 'false');
    assert.match(nodes.healthStatus.textContent, /已停止/);
    assert.match(nodes.healthStatus.textContent, /未标记为阅读/);
    assert.equal(replay.getState().verified, false);
  } finally { replay.dispose(); }
});
