import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
const ts = createRequire(new URL('../desktop/package.json', import.meta.url))('typescript');
const source = readFileSync(new URL('../desktop/src/system-notifications.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const snapshot = (extra = {}) => ({ schemaVersion: 1, revision: 0, enabled: false, permission: 'granted', delivery: 'idle', message: null, installationRequired: true, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness(handle = async () => snapshot(), onProjectSettings) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [], calls = [];
  document.createElement = tag => { const n = create(tag); n.listeners = {}; n.addEventListener = (name, fn) => { n.listeners[name] = fn; }; nodes.push(n); return n; };
  const context = vm.createContext({ document, createActionButton: (doc, text) => { const b = doc.createElement('wa-button'); b.textContent = text; return b; } }); vm.runInContext(script, context);
  const app = context.mountSystemNotifications({ onProjectSettings, invoke: async (name, args) => { calls.push({ name, args }); return handle(name, args); } });
  const node = id => nodes.find(n => n.id === id);
  return { app, node, calls, change: async enabled => { node('system-notifications-enabled').checked = enabled; node('system-notifications-enabled').listeners.change(); await setImmediate(); }, click: async suffix => { node(`system-notifications-${suffix}`).listeners.click(); await setImmediate(); } };
}
test('mount has no side effects and opening reads only without permission request or sending', async () => {
  const h = harness(); assert.equal(h.calls.length, 0); assert.equal(h.node('system-notifications-enabled').checked, false); await h.app.open();
  assert.deepEqual(h.calls.map(c => c.name), ['system_notifications_snapshot']); assert.equal(h.node('system-notifications-test').disabled, true);
  const toggleGroup = h.node('system-notifications-enabled').parentNode.parentNode;
  assert.match(toggleGroup.className, /system-notifications-preferences/);
  assert.equal(h.node('system-notifications-description').parentNode, toggleGroup);
  const stateGroup = h.node('system-notifications-permission').parentNode.parentNode.parentNode;
  assert.match(stateGroup.className, /system-notifications-state/);
  assert.equal(h.node('system-notifications-installation').parentNode, h.node('system-notifications-permission').parentNode);
  assert.equal(h.node('system-notifications-reload').parentNode, h.node('system-notifications-permission').parentNode.parentNode);
  assert.equal(h.node('system-notifications-test').parentNode.parentNode, stateGroup);
  assert.equal(h.node('system-notifications-project').parentNode.hidden, true, 'a missing project callback hides the whole reminder row');
  assert.equal(h.node('system-notifications-status').parentNode, h.app.element);
  assert.match(h.node('system-notifications-permission').textContent, /Windows 通知设置和勿扰/); assert.match(h.node('system-notifications-installation').textContent, /不是安装状态检测/);
});
test('enable and disable persist using revision and restore after reopen; testing is explicit', async () => {
  let stored = snapshot(); const h = harness((name, args) => { if (name.endsWith('_save')) stored = snapshot({ revision: stored.revision + 1, enabled: args.enabled }); return name.endsWith('_test') ? { ...stored, delivery: 'submitted' } : stored; });
  await h.app.open(); await h.change(true); assert.equal(h.calls[1].args.expectedRevision, 0); assert.equal(h.node('system-notifications-enabled').checked, true);
  assert.equal(h.calls.filter(c => c.name.endsWith('_test')).length, 0); h.app.close(); await h.app.open(); assert.equal(h.node('system-notifications-enabled').checked, true);
  await h.click('test'); assert.match(h.node('system-notifications-status').textContent, /已提交给系统/); assert.doesNotMatch(h.node('system-notifications-status').textContent, /已显示|已送达/);
  await h.change(false); assert.equal(h.node('system-notifications-enabled').checked, false); assert.equal(h.node('system-notifications-test').disabled, true);
});
test('denied enable remains off; save failures retain authoritative state and can retry', async () => {
  let mode = 'fail'; const h = harness(name => { if (name.endsWith('_snapshot')) return snapshot(); if (mode === 'fail') throw new Error('write'); return snapshot({ permission: 'denied', enabled: false }); });
  await h.app.open(); await h.change(true); assert.equal(h.node('system-notifications-enabled').checked, false); assert.match(h.node('system-notifications-status').textContent, /重新读取/);
  assert.equal(h.node('system-notifications-enabled').disabled, true, 'a failed save requires a fresh read before another change');
  await h.change(true);
  assert.equal(h.calls.filter(call => call.name.endsWith('_save')).length, 1);
  mode = 'denied'; await h.click('reload'); await h.change(true); assert.equal(h.node('system-notifications-enabled').checked, false); assert.match(h.node('system-notifications-status').textContent, /权限未允许/);
});
test('busy operations suppress duplicates; closing ignores late results and reopening waits then reloads', async () => {
  const pending = deferred(); let stored = snapshot(); const h = harness(async (name) => { if (name.endsWith('_save')) { await pending.promise; stored = snapshot({ revision: 1, enabled: true }); } return stored; });
  await h.app.open(); await h.change(true); await h.change(true); await h.click('test'); assert.equal(h.calls.filter(c => c.name.endsWith('_save')).length, 1);
  h.app.close(); const opening = h.app.open(); assert.equal(h.calls.filter(c => c.name.endsWith('_snapshot')).length, 1);
  pending.resolve(); await opening; assert.equal(h.calls.filter(c => c.name.endsWith('_snapshot')).length, 2); assert.equal(h.node('system-notifications-enabled').checked, true);
  assert.match(h.node('system-notifications-status').textContent, /已读取/);
});
test('read and test failure recover without reporting a delivered notification', async () => {
  let failRead = true, failTest = true;
  const h = harness(name => { if (name.endsWith('_snapshot') && failRead) throw new Error('read'); if (name.endsWith('_test')) return snapshot({ enabled: true, delivery: failTest ? 'failed' : 'submitted' }); return snapshot({ enabled: true }); });
  await h.app.open(); assert.equal(h.node('system-notifications-enabled').disabled, true); failRead = false; await h.click('reload');
  await h.click('test'); assert.match(h.node('system-notifications-status').textContent, /未提交/); failTest = false; await h.click('test'); assert.match(h.node('system-notifications-status').textContent, /已提交给系统/);
});
test('destroy and close isolate late failures without claiming cancellation of OS permission', async () => {
  const pending = deferred(); const h = harness(name => name.endsWith('_save') ? pending.promise : snapshot()); await h.app.open(); await h.change(true); h.app.close();
  const before = h.node('system-notifications-status').textContent; pending.reject(new Error('permission')); await setImmediate(); assert.equal(h.node('system-notifications-status').textContent, before);
  h.app.destroy(); await h.app.open(); assert.equal(h.calls.length, 2);
});
test('persisted watcher delivery failure and submission remain distinct from actual OS display', async () => {
  let outcome = 'failed';
  const h = harness(() => snapshot({ lastAttempt: { kind: 'notice', noticeId: 'private-id', attemptedAt: 1000, outcome } }));
  await h.app.open(); assert.match(h.node('system-notifications-last-attempt').textContent, /维护通知尝试.*提交失败/); assert.doesNotMatch(h.node('system-notifications-last-attempt').textContent, /private-id/);
  outcome = 'submitted'; await h.click('reload'); assert.match(h.node('system-notifications-last-attempt').textContent, /已提交给系统，不代表实际显示/);
});

test('project settings navigation is unavailable during IPC or after closing and never changes permission', async () => {
  let opened = 0; const pending = deferred();
  const h = harness(async () => pending.promise, () => { opened++; });
  const opening = h.app.open();
  await h.click('project'); assert.equal(opened, 0);
  pending.resolve(snapshot()); await opening;
  await h.click('project'); assert.equal(opened, 1);
  assert.deepEqual(h.calls.map(call => call.name), ['system_notifications_snapshot']);
  h.app.close(); await h.click('project'); assert.equal(opened, 1);
  h.app.destroy(); await h.click('project'); assert.equal(opened, 1);
  assert.equal(harness().node('system-notifications-project').hidden, true);
});
