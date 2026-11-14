import test from 'node:test';
import { URLSearchParams } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { readFileSync } from 'node:fs';
import { normalizeSessionSnapshot } from '../desktop/design-previews/session-store.js';
import { validateGuideInput, validateGuideResult } from '../desktop/design-previews/guide-contract.js';
import { runGuide } from '../src/guide.mjs';

const source = readFileSync(new URL('../desktop/design-previews/main.js', import.meta.url), 'utf8');
function node() {
  return { hidden: false, dataset: {}, textContent: '', children: [], handlers: {}, classList: { toggle() {} },
    setAttribute() {}, focus() { this.focused = true; }, click() { this.handlers.click?.(); }, addEventListener(type, callback) { this.handlers[type] = callback; } };
}
async function setup({ review = { state: 'pending', kind: 'local-demo-change', runId: 1 }, flush = true } = {}) {
  const nodes = new Map();
  const get = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  const events = {};
  let current = { id: 'session-1', messages: review ? [{ id: 'reply-1', review }] : [] };
  let config;
  let navigation;
  let stopped = false;
  let resolveConfirm;
  const updates = [];
  const conversation = { stop() { stopped = true; }, controller: { getSnapshot: () => ({ state: 'idle' }) }, updateReviewState(state, detail) {
    updates.push({ state, detail }); current.messages.at(-1).review.state = state;
  }, submit() { return { ok: true }; } };
  const win = { dispatchEvent(event) { events[event.type]?.(event); }, addEventListener(type, fn) { events[type] = fn; }, location: { href: '' }, shipmatePreview: { notify() {} }, shipmateUI: { ready: Promise.resolve({ confirm: () => new Promise(resolve => { resolveConfirm = resolve; }), setReviewState(state, detail) { events['shipmate:review-state']?.({ detail: { ...detail, state } }); } }) } };
  const root = get('review-root');
  const panel = get('.side__body'); panel.children = [get('workspaceReview'), get('workspaceReviewEmpty'), get('.term')]; panel.querySelector = get;
  const context = vm.createContext({ URLSearchParams, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }, document: { getElementById: get, querySelector: get, querySelectorAll: () => [get('tab0'), get('tab1')] }, window: win,
    bindActionMenu(menu, handler) { menu.select = handler; }, validateGuideInput, validateGuideResult,
    installSessionNavigation(options) { navigation = options; }, mountComposer() {}, mountReview: () => ({ root, undo: get('undo') }), updateReview(_root, state) { root.dataset.state = state; }, getReviewPresentation: state => ({ label: state, summary: state }), createDemoPlan: () => ({}),
    mountConversation: () => conversation,
    mountSessionWorkspace: async options => { config = options; return { conversation, getCurrentSession: () => current, flush: async () => flush }; }
  });
  await vm.runInContext(`(async () => { ${source.replace(/^import .*;\r?\n/gm, '')} })()`, context);
  return { get, events, win, updates, config, navigation, stopped: () => stopped, switchTo(session) { current = session; config?.onSessionChange(session); }, confirm(value) { resolveConfirm(value); } };
}

test('workspace mounts durable sidebar sessions without seeding fake task results', async () => {
  const h = await setup();
  assert.ok(h.config, 'must mount shared session workspace');
  assert.equal(h.config.workspace, 'my-miniprogram');
  assert.equal(h.config.initialMessages.length, 0);
  assert.equal(h.config.layout, 'sidebar');
  assert.equal(h.events.pagehide, undefined, 'shared workspace owns lifecycle');
  assert.doesNotThrow(() => normalizeSessionSnapshot(JSON.parse(JSON.stringify({ version: 1, currentSessionId: 'session-1', sessionSequence: 1, sessions: [{ id: 'session-1', title: '新会话', draft: '', messages: h.config.initialMessages }] })))) ;
});
test('empty session clears sidebar review and ignores another session approval', async () => {
  const h = await setup();
  h.switchTo({ id: 'session-2', messages: [] });
  assert.equal(h.get('workspaceReview').hidden, true);
  assert.equal(h.get('workspaceReviewEmpty').hidden, false);
  h.events['shipmate:review-state']({ detail: { state: 'accepted', sessionId: 'session-1', messageId: 'reply-1', runId: 1 } });
  assert.equal(h.updates.length, 0);
});
test('restored stale review is displayed without granting approval', async () => {
  const h = await setup({ review: { state: 'stale', runId: 1 } });
  assert.equal(h.get('review-root').dataset.state, 'stale');
  h.events['shipmate:review-state']({ detail: { state: 'accepted', sessionId: 'session-1', messageId: 'reply-1', runId: 1 } });
  assert.equal(h.updates.length, 0);
});
test('confirmation cannot approve another session after switching', async () => {
  const h = await setup();
  const pending = h.get('approve-change').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  h.switchTo({ id: 'session-2', messages: [{ id: 'reply-2', review: { state: 'pending', runId: 2 } }] });
  h.confirm(true); await pending;
  assert.equal(h.updates.length, 0);
});
test('navigation uses the shared flush and stop guard', async () => {
  for (const success of [false, true]) {
    const h = await setup({ flush: success });
    assert.equal(await h.navigation.flush(), success);
    h.navigation.stop();
    assert.equal(h.stopped(), true);
  }
});
test('approval applies only to current pending review and supports local undo', async () => {
  const h = await setup();
  const pending = h.get('approve-change').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  h.confirm(true); await pending;
  assert.equal(h.updates.at(-1).state, 'accepted');
  await h.get('undo').handlers.click();
  assert.equal(h.updates.at(-1).state, 'pending');
});
test('switching to empty session while terminal selected retains correct empty view', async () => {
  const h = await setup();
  h.get('tab1').handlers.click();
  h.switchTo({ id: 'session-2', messages: [] });
  assert.equal(h.get('.term').hidden, false);
  assert.equal(h.get('workspaceReviewEmpty').hidden, true);
  h.get('tab0').handlers.click();
  assert.equal(h.get('workspaceReviewEmpty').hidden, false);
  assert.equal(h.get('workspaceReview').hidden, true);
});

test('new run invalidates pending review without relying on asynchronous global UI', async () => {
  const h = await setup();
  h.config.onEvent({ type: 'state', state: 'working' });
  h.config.onEvent({ type: 'run-start', runId: 2 });
  assert.equal(h.updates.at(-1).state, 'stale');
  assert.equal(h.updates.at(-1).detail.runId, 1);
});
test('late approval cannot alter a newer review in the same session', async () => {
  const h = await setup();
  const pending = h.get('approve-change').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  h.switchTo({ id: 'session-1', messages: [{ id: 'reply-2', review: { state: 'pending', runId: 2 } }] });
  h.confirm(true); await pending;
  assert.equal(h.updates.length, 0);
});

test('message review action opens the current sidebar without redirecting an old review', async () => {
  const h = await setup();
  h.get('tab1').handlers.click();
  h.events['shipmate:open-review']({ detail: { messageId: 'old-reply' } });
  assert.equal(h.get('.term').hidden, false);
  h.events['shipmate:open-review']({ detail: { messageId: 'reply-1' } });
  assert.equal(h.get('workspaceReview').hidden, false);
  assert.equal(h.get('review-root').focused, undefined, 'responsive surface owns focus');
});

test('home tracks current task and review validation only forwards current message', async () => {
  const h = await setup({ review: null });
  assert.equal(h.get('workspaceHomeContent').hidden, false);
  let opened = 0;
  h.win.addEventListener('shipmate:review-open-validated', () => opened++);
  h.events['shipmate:open-review']({ detail: { messageId: 'old' } });
  assert.equal(opened, 0);
  h.switchTo({ id: 'other', title: '已有任务', messages: [{ id: 'new', review: { state: 'pending' } }] });
  assert.equal(h.get('workspaceHomeContent').hidden, true);
  assert.equal(h.get('workspaceTitle').textContent, '已有任务');
  h.events['shipmate:open-review']({ detail: { messageId: 'new' } });
  assert.equal(opened, 1);
});

test('current result entries accept only completed validated guides and clear on session change', async () => {
  const h = await setup({ review: null });
  assert.equal(h.get('workspaceResult').disabled, true);
  const guide = { id: 'guide', role: 'assistant', status: 'complete',
    guide: { subject: 'personal', sensitive: false, domain: true },
    structuredResult: runGuide({ subject_type: 'personal', collects_sensitive: false, has_server_domain: true }) };
  h.switchTo({ id: 'with-result', messages: [guide] });
  assert.equal(h.get('workspaceResult').disabled, false);
  assert.equal(h.get('workspaceMenuResult').disabled, false);
  h.switchTo({ id: 'incomplete', messages: [{ ...guide, status: 'streaming' }] });
  assert.equal(h.get('workspaceResult').disabled, true);
  h.switchTo({ id: 'invalid', messages: [{ ...guide, structuredResult: {} }] });
  assert.equal(h.get('workspaceMenuResult').disabled, true);
  h.switchTo({ id: 'empty', messages: [] });
  assert.match(h.get('workspaceResult-summary').textContent, /尚无/);
});
