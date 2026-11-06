import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = requireDesktop('typescript');
const source = readFileSync(new URL('../desktop/src/maintenance.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const snapshot = (extra = {}) => ({ projectId: 'a', revision: 0, watchEnabled: false, notificationsEnabled: false, state: 'off', message: '', runId: null, lastCheckedAt: null, notices: [], ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function harness({ invoke: handle, open = async () => true, reveal = () => true, delayedListen, listenFailure, onResult, onNotifications } = {}) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [], calls = [];
  document.createElement = tag => { const node = create(tag); node.listeners = {}; node.focus = () => { document.activeElement = node; }; node.contains = target => node === target || node.children.some(child => child.contains(target)); node.addEventListener = (name, handler) => { node.listeners[name] = handler; }; nodes.push(node); return node; };
  let project = 'a', listener, removed = 0, results = 0, revealed = 0, unread = 0;
  const context = vm.createContext({ document, createActionButton: (doc, text) => { const b = doc.createElement('wa-button'); b.textContent = text; return b; },
    invoke: async (name, args) => { calls.push({ name, args }); return handle ? handle(name, args) : snapshot({ projectId: args.projectId }); },
    listen: async (_, callback) => { listener = callback; if (listenFailure?.()) throw new Error('listen failed'); if (delayedListen) await delayedListen; return () => { removed++; }; },
  });
  vm.runInContext(script, context);
  const app = context.mountProjectMaintenance({ onNotifications, getProjectId: () => project, onResult: async () => { results++; return onResult?.(); }, onOpenArtifact: open, onRevealReport: isCurrent => { revealed++; return reveal(isCurrent); }, onUnread: count => { unread = count; } });
  const node = id => nodes.find(n => n.id === id);
  return { app, node, calls, document, setProject: id => { project = id; }, event: value => listener({ payload: value }), removed: () => removed, results: () => results, revealed: () => revealed, unread: () => unread,
    click: async id => { node(id).listeners.click(); await setImmediate(); },
    change: (id, value) => { node(id).checked = value; node(id).listeners.change(); },
    openNotice: async () => { node('maintenance-notices').children[0].children[0].listeners.click(); await setImmediate(); },
  };
}

test('maintenance blocks leaving unsaved or pending settings and explicitly discards the draft', async () => {
  const pending = deferred();
  const h = harness({ invoke: name => name.endsWith('save') ? pending.promise : snapshot() });
  await h.app.select(); assert.equal(h.app.canClose(), true);
  h.change('maintenance-watch', true); assert.equal(h.app.canClose(), false);
  assert.equal(h.node('maintenance-discard').disabled, false);
  h.change('maintenance-watch', false); assert.equal(h.app.canClose(), true, 'returning to saved values clears dirty state');
  h.change('maintenance-watch', true); await h.click('maintenance-save');
  assert.equal(h.app.canClose(), false); assert.equal(h.node('maintenance-discard').disabled, true);
  h.app.discardChanges(); assert.equal(h.node('maintenance-watch').checked, true);
  pending.resolve(snapshot({ revision: 1, watchEnabled: true })); await setImmediate();
  assert.equal(h.app.canClose(), true);
  h.change('maintenance-notifications', true); await h.click('maintenance-discard');
  assert.equal(h.node('maintenance-notifications').checked, false); assert.equal(h.app.canClose(), true);
});

test('failed maintenance save reloads a conflict revision without discarding the draft or restarting the watcher', async () => {
  let conflict = true, revision = 1, wrongProject = false;
  const h = harness({ invoke: (name, args) => {
    if (name.endsWith('save')) {
      if (conflict) { revision = 2; throw Error('revision conflict'); }
      return snapshot({ revision: args.expectedRevision + 1, watchEnabled: args.watchEnabled, notificationsEnabled: args.notificationsEnabled });
    }
    return snapshot({ projectId: wrongProject ? 'b' : 'a', revision, notificationsEnabled: revision > 1 });
  } });
  await h.app.select(); h.change('maintenance-watch', true); await h.click('maintenance-save');
  assert.equal(h.node('maintenance-retry').textContent, '重新加载'); assert.equal(h.app.canClose(), false);
  assert.equal(h.node('maintenance-save').disabled, true);
  await h.click('maintenance-save');
  assert.equal(h.calls.filter(c => c.name.endsWith('_save')).length, 1);
  wrongProject = true; await h.click('maintenance-retry');
  assert.equal(h.node('maintenance-save').disabled, true, 'an unrelated snapshot cannot unlock saving');
  wrongProject = false; await h.click('maintenance-retry');
  assert.equal(h.node('maintenance-watch').checked, true);
  assert.equal(h.node('maintenance-notifications').checked, true);
  assert.equal(h.calls.some(call => call.name === 'project_maintenance_retry'), false);
  conflict = false; await h.click('maintenance-save');
  const saved = h.calls.filter(call => call.name.endsWith('save')).at(-1);
  assert.deepEqual({ ...saved.args }, { projectId: 'a', expectedRevision: 2, watchEnabled: true, notificationsEnabled: true });
  assert.equal(h.app.canClose(), true);
});
test('maintenance defaults off, synchronizes once and reloads failed reads explicitly', async () => {
  let fail = true;
  const h = harness({ invoke: (name) => { if (name.endsWith('snapshot') && fail) throw new Error('offline'); return name.endsWith('sync') ? null : snapshot(); } });
  assert.equal(h.node('maintenance-watch').checked, false); assert.equal(h.node('maintenance-save').disabled, true);
  await h.app.select(); assert.match(h.node('maintenance-status').textContent, /重新加载/);
  fail = false; await h.click('maintenance-retry'); assert.match(h.node('maintenance-state').textContent, /已关闭/);
  await h.app.select(); assert.equal(h.calls.filter(c => c.name.endsWith('sync')).length, 1);
  assert.equal(h.results(), 0); assert.equal(h.calls.filter(c => c.name.endsWith('snapshot')).length, 2);
});
test('failed save preserves the off draft and keeps the running check stoppable', async () => {
  const h = harness({ invoke: name => { if (name.endsWith('save')) throw new Error('CAS'); return snapshot({ watchEnabled: true, state: 'checking', runId: 'auto-1' }); } });
  await h.app.select(); h.change('maintenance-watch', false); await h.click('maintenance-save');
  assert.equal(h.node('maintenance-watch').checked, false); assert.equal(h.node('maintenance-save').disabled, true);
  assert.match(h.node('maintenance-status').textContent, /草稿/);
  assert.equal(h.calls.find(c => c.name.endsWith('save')).args.watchEnabled, false);
  assert.equal(h.node('maintenance-stop').disabled, false);
});
test('events preserve drafts and refresh metadata only on completion or changed check time', async () => {
  const h = harness(); await h.app.select(); h.change('maintenance-watch', true);
  h.event(snapshot({ state: 'checking', runId: 'auto-1' })); assert.equal(h.node('maintenance-watch').checked, true); assert.equal(h.results(), 0);
  h.event(snapshot({ state: 'watching', lastCheckedAt: 123 })); assert.equal(h.results(), 1);
  h.event(snapshot({ state: 'watching', lastCheckedAt: 123 })); assert.equal(h.results(), 1);
});
test('maintenance drafts follow their project and preserve untouched settings changed elsewhere', async () => {
  let externalNotifications = false;
  const h = harness({ invoke: (name, args) => snapshot({
    projectId: args.projectId,
    revision: externalNotifications && args.projectId === 'a' ? 2 : 1,
    notificationsEnabled: externalNotifications && args.projectId === 'a',
    ...(name.endsWith('_save') && { watchEnabled: args.watchEnabled, notificationsEnabled: args.notificationsEnabled }),
  }) });
  await h.app.select();
  h.change('maintenance-watch', true);
  h.setProject('b'); await h.app.select();
  assert.equal(h.node('maintenance-watch').checked, false);
  assert.equal(h.app.canClose(), true);
  h.change('maintenance-notifications', true);
  h.setProject(null); await h.app.select();
  externalNotifications = true;
  h.setProject('a'); await h.app.select();
  assert.equal(h.node('maintenance-watch').checked, true, 'restore the unsaved A switch');
  assert.equal(h.node('maintenance-notifications').checked, true, 'adopt the latest untouched A switch');
  assert.equal(h.calls.some(c => c.name.endsWith('_save')), false);
  await h.click('maintenance-save');
  const saves = h.calls.filter(c => c.name.endsWith('_save'));
  assert.equal(saves.length, 1);
  assert.deepEqual({ ...saves[0].args }, { projectId: 'a', expectedRevision: 2, watchEnabled: true, notificationsEnabled: true });
  h.setProject('b'); await h.app.select();
  assert.equal(h.node('maintenance-notifications').checked, true);
  assert.match(h.node('maintenance-status').textContent, /未保存/);
  h.change('maintenance-notifications', false);
  assert.doesNotMatch(h.node('maintenance-status').textContent, /未保存/);
  h.change('maintenance-notifications', true);
  await h.click('maintenance-discard');
  h.setProject('a'); await h.app.select();
  h.setProject('b'); await h.app.select();
  assert.equal(h.node('maintenance-notifications').checked, false);
  assert.equal(h.app.canClose(), true);
});

test('project switch discards stale read and wrong-project responses', async () => {
  const pending = deferred();
  const h = harness({ invoke: (name, args) => name.endsWith('snapshot') && args.projectId === 'a' ? pending.promise : snapshot({ projectId: args.projectId }) });
  const old = h.app.select(); await setImmediate(); h.setProject('b'); await h.app.select();
  pending.resolve(snapshot({ state: 'error', message: 'old project' })); await old;
  assert.doesNotMatch(h.node('maintenance-state').textContent, /old project/);
  h.event(snapshot({ state: 'error', message: 'foreign event' })); assert.doesNotMatch(h.node('maintenance-state').textContent, /foreign/);
});
test('events win over an older in-flight snapshot with the same config revision', async () => {
  const pending = deferred(); let delayed = false;
  const h = harness({ invoke: name => delayed && name.endsWith('snapshot') ? pending.promise : snapshot() });
  await h.app.select(); delayed = true; const read = h.app.refresh(); await setImmediate();
  h.event(snapshot({ state: 'checking', runId: 'new' })); pending.resolve(snapshot()); await read;
  assert.match(h.node('maintenance-state').textContent, /执行中/);
});
test('notices mark read only after successful report opening, with reveal and unread callbacks', async () => {
  let succeeds = false; const notice = { id: 'n1', artifactId: 'saved', createdAt: 1000, newCount: 2, read: false };
  const h = harness({ open: async id => { assert.equal(id, 'saved'); return succeeds; }, invoke: name => snapshot({ notices: [{ ...notice, read: name.endsWith('read') }] }) });
  await h.app.select(); assert.equal(h.unread(), 1); await h.openNotice();
  assert.equal(h.calls.filter(c => c.name.endsWith('_read')).length, 0); assert.equal(h.revealed(), 0);
  succeeds = true; await h.openNotice(); assert.equal(h.calls.filter(c => c.name.endsWith('_read')).length, 1); assert.equal(h.revealed(), 1); assert.equal(h.unread(), 0);
});
test('a notice stays unread if navigation is blocked or the project changes before reveal', async () => {
  const gate = deferred(), notice = { id: 'n1', artifactId: 'saved', createdAt: 1, newCount: 1, read: false };
  let blocked = true;
  const h = harness({
    invoke: (_, args) => snapshot({ projectId: args.projectId, notices: args.projectId === 'a' ? [notice] : [] }),
    reveal: async isCurrent => { if (blocked) return false; await gate.promise; return isCurrent(); },
  });
  await h.app.select();
  h.change('maintenance-watch', true);
  await h.openNotice();
  assert.equal(h.revealed(), 0);
  assert.equal(h.node('maintenance-watch').checked, true);
  await h.click('maintenance-discard');
  await h.openNotice();
  assert.equal(h.revealed(), 1);
  assert.equal(h.unread(), 1);
  blocked = false; await h.openNotice();
  h.setProject('b'); await h.app.select();
  gate.resolve(); await setImmediate();
  assert.equal(h.calls.some(call => call.name.endsWith('_read')), false);
});

test('listener is removed after normal and delayed destruction', async () => {
  const h = harness(); await h.app.select(); h.app.destroy(); assert.equal(h.removed(), 1);
  const pending = deferred(), delayed = harness({ delayedListen: pending.promise }); delayed.app.destroy(); pending.resolve(); await setImmediate(); assert.equal(delayed.removed(), 1);
});
test('failed refresh after ready offers reload instead of restarting maintenance and preserves drafts', async () => {
  let fail = false;
  const h = harness({ invoke: name => { if (fail && name.endsWith('snapshot')) throw new Error('read'); return snapshot(); } });
  await h.app.select(); h.change('maintenance-notifications', true); fail = true; await h.app.refresh();
  assert.equal(h.node('maintenance-retry').textContent, '重新加载'); fail = false; await h.click('maintenance-retry');
  assert.equal(h.node('maintenance-notifications').checked, true);
  assert.equal(h.calls.filter(c => c.name.endsWith('_retry')).length, 0);
});
test('stop, retry and read-all send only current project and explicit notice IDs', async () => {
  const h = harness({ invoke: () => snapshot({ state: 'checking', runId: 'own-auto', notices: [{ id: 'unread', artifactId: 'r', createdAt: 1, newCount: 1, read: false }, { id: 'read', artifactId: 's', createdAt: 2, newCount: 1, read: true }] }) });
  await h.app.select(); await h.click('maintenance-stop'); await h.click('maintenance-retry'); await h.click('maintenance-read-all');
  for (const name of ['stop', 'retry', 'read']) assert.equal(h.calls.find(c => c.name === `project_maintenance_${name}`).args.projectId, 'a');
  assert.deepEqual(Array.from(h.calls.find(c => c.name.endsWith('_read')).args.noticeIds), ['unread']);
});
test('a late successful save cannot replace another project or its drafts', async () => {
  const pending = deferred();
  const h = harness({ invoke: (name, args) => name.endsWith('save') ? pending.promise : snapshot({ projectId: args.projectId }) });
  await h.app.select(); h.change('maintenance-watch', true); await h.click('maintenance-save');
  h.setProject('b'); await h.app.select(); h.change('maintenance-notifications', true);
  pending.resolve(snapshot({ revision: 1, watchEnabled: true })); await setImmediate();
  assert.equal(h.node('maintenance-watch').checked, false); assert.equal(h.node('maintenance-notifications').checked, true);
  assert.equal(h.node('maintenance-save').disabled, false);
});
test('successful save reconciles newer config without rolling back an intervening event state', async () => {
  const pending = deferred();
  const h = harness({ invoke: name => name.endsWith('save') ? pending.promise : snapshot() });
  await h.app.select(); h.change('maintenance-watch', true); await h.click('maintenance-save');
  h.event(snapshot({ state: 'pending' }));
  pending.resolve(snapshot({ revision: 1, watchEnabled: true })); await setImmediate();
  assert.equal(h.node('maintenance-watch').checked, true); assert.equal(h.node('maintenance-save').disabled, true);
  assert.match(h.node('maintenance-state').textContent, /等待自动预检/);
});
test('background state events preserve existing notice controls for keyboard focus', async () => {
  const notices = [{ id: 'n', artifactId: 'r', createdAt: 1, newCount: 1, read: false }];
  const h = harness({ invoke: () => snapshot({ notices }) }); await h.app.select();
  const control = h.node('maintenance-notices').children[0].children[0];
  h.event(snapshot({ state: 'watching', notices }));
  assert.equal(h.node('maintenance-notices').children[0].children[0], control);
});

test('subscription failure is recoverable by explicit reload and pending work can be stopped', async () => {
  let fail = true;
  const h = harness({ listenFailure: () => fail, invoke: () => snapshot({ state: 'pending' }) });
  await h.app.select(); assert.match(h.node('maintenance-status').textContent, /重新加载/);
  fail = false; await h.click('maintenance-retry');
  assert.equal(h.node('maintenance-stop').disabled, false); await h.click('maintenance-stop');
  assert.equal(h.calls.filter(c => c.name.endsWith('_stop')).length, 1);
  h.app.destroy(); assert.equal(h.removed(), 1);
});
test('checking and pending busy-slot cycles do not refresh metadata until a check completes', async () => {
  const h = harness(); await h.app.select();
  for (let i = 0; i < 3; i++) {
    h.event(snapshot({ state: 'checking', runId: 'auto' }));
    h.event(snapshot({ state: 'pending', runId: null }));
  }
  assert.equal(h.results(), 0);
  h.event(snapshot({ state: 'checking', runId: 'auto' }));
  h.event(snapshot({ state: 'pending', lastCheckedAt: 123 }));
  assert.equal(h.results(), 1);
});

test('completion metadata refreshes serialize and coalesce pending latest events', async () => {
  const first = deferred(), second = deferred(); let running = 0, peak = 0, count = 0;
  const h = harness({ onResult: async () => {
    running++; peak = Math.max(peak, running); count++;
    await (count === 1 ? first.promise : second.promise); running--;
  } });
  await h.app.select();
  h.event(snapshot({ state: 'checking', runId: 'auto' }));
  h.event(snapshot({ state: 'checking', runId: 'auto', lastCheckedAt: 123 }));
  h.event(snapshot({ state: 'watching', lastCheckedAt: 123 }));
  h.event(snapshot({ state: 'watching', lastCheckedAt: 124 }));
  assert.equal(h.results(), 1); assert.equal(peak, 1);
  first.resolve(); await setImmediate(); assert.equal(h.results(), 2); assert.equal(peak, 1);
  second.resolve(); await setImmediate(); assert.equal(running, 0); assert.equal(h.results(), 2);
  assert.doesNotMatch(h.node('maintenance-status').textContent, /未能刷新/);
});
test('queued metadata refresh and late failures cannot affect a newly selected project', async () => {
  const pending = deferred();
  const h = harness({ onResult: async () => { await pending.promise; throw new Error('old refresh'); } });
  await h.app.select(); h.event(snapshot({ state: 'checking' }));
  h.event(snapshot({ state: 'checking', lastCheckedAt: 123 }));
  h.event(snapshot({ state: 'watching', lastCheckedAt: 123 }));
  h.setProject('b'); await h.app.select(); pending.resolve(); await setImmediate();
  assert.equal(h.results(), 1); assert.doesNotMatch(h.node('maintenance-status').textContent, /未能刷新/);
});

test('maintenance shows the real check time and filters unread notices without native writes', async () => {
  const notices = [
    { id: 'unread', artifactId: 'a1', createdAt: 1000, newCount: 2, read: false },
    { id: 'read', artifactId: 'a2', createdAt: 2000, newCount: 1, read: true },
  ];
  const h = harness({ invoke: (_name, args) => snapshot({ projectId: args.projectId, notices, lastCheckedAt: 1000 }) });
  await h.app.select();
  assert.match(h.node('maintenance-last-check').textContent, /最近预检记录/);
  assert.match(h.node('maintenance-notice-count').textContent, /1 条未读.*2 条提醒/);
  const before = h.calls.length;
  const filter = h.node('maintenance-notice-filter');
  filter.value = 'unread'; filter.listeners.change();
  assert.equal(h.node('maintenance-notices').children.length, 1);
  assert.equal(h.node('maintenance-notices').children[0].children[0].dataset.noticeId, 'unread');
  h.node('maintenance-notices').children[0].children[0].focus();
  h.event(snapshot({ notices: notices.map(n => ({ ...n, read: true })), lastCheckedAt: 1000 }));
  assert.equal(h.document.activeElement, filter, 'removed focused unread notice returns focus to filter');
  assert.match(h.node('maintenance-notices').textContent, /没有未读/);
  await h.click('maintenance-notice-reset');
  assert.equal(filter.value, 'all'); assert.equal(h.node('maintenance-notices').children.length, 2);
  assert.equal(h.calls.length, before, 'filtering and resetting never send commands');
  filter.value = 'unread'; filter.listeners.change(); h.setProject('b'); await h.app.select();
  assert.equal(filter.value, 'all');
});

test('notification navigation keeps unsaved and pending maintenance settings in place', async () => {
  let opened = 0; const pending = deferred();
  const h = harness({ onNotifications: () => { opened++; }, invoke: name => name.endsWith('save') ? pending.promise : snapshot() });
  await h.app.select(); assert.match(h.node('maintenance-last-check').textContent, /尚无/);
  await h.click('maintenance-system-settings'); assert.equal(opened, 1);
  h.change('maintenance-watch', true);
  await h.click('maintenance-system-settings'); assert.equal(opened, 1); assert.match(h.node('maintenance-status').textContent, /尚未保存/);
  await h.click('maintenance-save'); await h.click('maintenance-system-settings'); assert.equal(opened, 1);
  pending.resolve(snapshot({ watchEnabled: true, revision: 1 })); await setImmediate();
  await h.click('maintenance-system-settings'); assert.equal(opened, 2);
  h.app.destroy(); await h.click('maintenance-system-settings'); assert.equal(opened, 2);
});
