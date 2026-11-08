import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createIcon } from '../desktop/design-previews/components/icons.js';
import { sessionMatch } from '../desktop/design-previews/session-search.js';
import { createSessionPersistence } from '../desktop/design-previews/session-persistence.js';
import { createActionButton, bindActionMenu } from './helpers/ui-action.mjs';

const source = readFileSync(new URL('../desktop/design-previews/session-workspace.js', import.meta.url), 'utf8');
function node(doc, tag = 'div') {
  const listeners = new Map();
  return { ownerDocument: doc, tag, children: [], dataset: {}, value: '', hidden: false,
    append(...children) { for (const child of children) { child.remove?.(); child.parentNode = this; this.children.push(child); } }, replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); },
    insertBefore(child, before) { if (child === before) return; child.remove?.(); const index = this.children.indexOf(before); child.parentNode = this; this.children.splice(index < 0 ? this.children.length : index, 0, child); },
    setAttribute(name, value) { this[name] = value; }, remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; },
    contains(target) { return this === target || this.children.some(child => child.contains(target)); },
    get lastElementChild() { return this.children.at(-1); },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== fn)); },
    fire(type, event = {}) { for (const fn of listeners.get(type) || []) fn({ target: this, preventDefault() {}, ...event }); },
    click() { this.fire('click'); },
    focus() { doc.activeElement = this; }, select() {}, showModal() { this.open = true; }, close() { this.open = false; Promise.resolve().then(() => this.fire('close')); },
  };
}
function harness({ loaded = null, loadError = false, saveError = false, layout, projectScoped, onOpenDataSettings } = {}) {
  const doc = { createElement(tag) { return node(doc, tag); } };
  doc.createElementNS = (_namespace, tag) => node(doc, tag);
  Object.assign(doc, node(doc)); doc.body = node(doc);
  const win = node(doc); win.location = { reload() { win.reloaded = true; } }; doc.defaultView = win;
  const host = node(doc), input = node(doc), writes = [], lifecycle = [], hooks = [], dataDialogs = [], dataPanels = [];
  const store = { async load() { if (loadError) throw new Error('offline'); return { revision: 3, snapshot: loaded }; },
    async save(snapshot, revision) { if (typeof saveError === 'function' ? saveError() : saveError) throw Object.assign(new Error('Conflict'), { code: 'conflict' }); writes.push(JSON.parse(JSON.stringify(snapshot))); return { revision: revision + 1 }; }, close() {} };
  const context = vm.createContext({ createSessionStore: () => store, createSessionPersistence, sessionMatch,
    normalizeSessionSnapshot: value => JSON.parse(JSON.stringify(value)), createIcon, createActionButton, bindActionMenu,
    openSessionDataDialog(options) { dataDialogs.push(options); return { node: node(doc, 'dialog') }; },
    createSessionDataPanel(options) {
      const panel = { options, element: node(doc, 'section'), opens: 0, closes: 0, destroyed: false,
        open() { panel.opens++; }, close() { panel.closes++; }, canClose: () => true,
        destroy() { panel.destroyed = true; } };
      dataPanels.push(panel); return panel;
    },
    mountConversation(options) {
      hooks.push(options); let messages = options.initialMessages, edit = null, view = null, model = null;
      return { stop() { lifecycle.push('stop'); }, destroy() { lifecycle.push('destroy'); },
        getMessages: () => messages, getDraftState: () => ({ draft: input.value, edit }), getViewState: () => view,
        getModelSelection: () => model, setModelSelection(value) { model = value; options.onModelSelectionChange?.(value); },
        replaceMessages(value) { messages = value; options.onMessagesChange?.(value); },
        setDraft(value, editing) { input.value = value; edit = editing || null; options.onDraftChange?.(); },
        restoreViewState(value) { view = value || null; },
      };
    },
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/^export \{.*\};\r?\n/gm, '').replace(/export /g, ''), context);
  const args = { host, input, layout, projectScoped, onOpenDataSettings, sendButton: node(doc), scroll: node(doc), list: node(doc), status: node(doc), jumpButton: node(doc), onSessionChange: session => lifecycle.push(session.id) };
  const mounting = context.mountSessionWorkspace(args);
  return { mounting, context, host, doc, win, args, hooks, writes, lifecycle, dataDialogs, dataPanels, setLoadError(value) { loadError = value; }, setSaveError(value) { saveError = value; } };
}
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const find = (root, action) => [root, ...root.children.flatMap(child => flatten(child))].find(item => item.dataset.action === action);
const flatten = root => [root, ...root.children.flatMap(child => flatten(child))];

function rowMenu(app, id, action) {
  const row = flatten(app.host).find(item => item.dataset.action === 'recent-session' && item.dataset.sessionId === id);
  const menu = row.parentNode.children[1].children[0];
  menu.fire('wa-select', { detail: { item: { value: action } } });
  menu.fire('wa-after-hide');
  return menu;
}

test('sidebar menus rename another conversation without switching or losing the current draft', async () => {
  const app = harness({ layout: 'sidebar' }), workspace = await app.mounting;
  workspace.createSession(); app.args.input.value = 'keep this draft';
  rowMenu(app, 'session-1', 'rename');
  const surface = app.doc.body.children.at(-1), form = flatten(surface).find(item => item.tag === 'form');
  form.children[0].value = 'Renamed first'; form.fire('submit'); await tick();
  assert.equal(workspace.getCurrentSession().id, 'session-2');
  assert.equal(app.args.input.value, 'keep this draft');
  await workspace.flush();
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === 'session-1').title, 'Renamed first');
  assert.equal(app.doc.activeElement['aria-label'], '会话操作：Renamed first');
  workspace.destroy();
});

test('sidebar archive retains drafts, switches only the active target, and restores through history', async () => {
  const app = harness({ layout: 'sidebar' }), workspace = await app.mounting;
  app.args.input.value = 'first draft'; workspace.createSession(); app.args.input.value = 'second draft';
  rowMenu(app, 'session-1', 'archive'); await tick();
  assert.equal(workspace.getCurrentSession().id, 'session-2');
  assert.equal(app.args.input.value, 'second draft');
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === 'session-1').draft, 'first draft');
  rowMenu(app, 'session-2', 'archive'); await tick();
  assert.equal(workspace.getCurrentSession().id, 'session-3');
  assert.equal(app.doc.activeElement.dataset.sessionId, 'session-3');
  workspace.openHistory(undefined, 'archived');
  find(app.doc.body.children.at(-1), 'restore-session').click(); await tick();
  assert.ok(app.writes.at(-1).sessions.some(item => !item.archived && item.draft === 'second draft'));
  workspace.destroy();
});

test('sidebar archive conflict preserves the row, current draft and a reachable recovery dialog', async () => {
  const app = harness({ layout: 'sidebar' }), workspace = await app.mounting;
  await workspace.flush(); app.setSaveError(true); app.args.input.value = 'unsaved';
  const menu = rowMenu(app, 'session-1', 'archive'); await tick();
  assert.equal(workspace.getCurrentSession().archived, undefined);
  assert.equal(app.args.input.value, 'unsaved');
  assert.ok(menu.parentNode);
  const surface = app.doc.body.children.at(-1);
  assert.equal(surface['aria-label'], '未能完成归档');
  assert.equal(app.doc.activeElement, find(surface, 'cancel'));
  find(surface, 'cancel').click(); await tick();
  assert.equal(app.doc.activeElement, menu.children[0]);
  app.setSaveError(false); await workspace.flush(); workspace.destroy();
});

test('a failed data dialog initialization keeps later close callbacks safe and surfaces the original error', async () => {
  const app = harness(), workspace = await app.mounting;
  let closed;
  app.context.openSessionDataDialog = options => { closed = options.onClose; throw new Error('Dialog initialization failed'); };
  assert.throws(() => workspace.openData(), /Dialog initialization failed/);
  assert.doesNotThrow(() => closed(node(app.doc, 'dialog')));
  workspace.destroy();
});

test('failed UI apply after commit offers reload instead of retry or stale backup', () => {
  const context = vm.createContext({ temporaryMode: false, saved: {}, root: { dataset: {} },
    notice: { contains: () => false }, doc: {}, temporary: {}, retry: {}, reload: {}, backup: {}, noticeText: {}, storageLabel: 'Saved' });
  const fn = source.match(/^ {2}function saveStatus\(state\) \{[^]*?^ {2}\}/m)[0];
  vm.runInContext(fn, context);
  context.saveStatus({ state: 'error', code: 'apply-failed' });
  assert.equal(context.retry.hidden, true); assert.equal(context.reload.hidden, false); assert.equal(context.backup.hidden, true);
  assert.match(context.noticeText.textContent, /已保存.*重新载入/);
  assert.doesNotMatch(context.saved.textContent, /尚未保存/);
});

test('empty workspace creates only one session and persists drafts before creating another', async () => {
  const app = harness(); const workspace = await app.mounting;
  await workspace.flush(); assert.equal(app.writes.at(-1).sessions.length, 1);
  app.args.input.value = 'Unsent'; app.args.input.fire('input');
  workspace.createSession(); await workspace.flush();
  assert.equal(app.writes.at(-1).sessions.length, 2);
  assert.equal(app.writes.at(-1).sessions[1].draft, 'Unsent');
  assert.ok(app.lifecycle.includes('stop'));
  workspace.destroy();
});

test('restores existing sessions without replacing schema fields and flushes on hidden/pagehide', async () => {
  const loaded = { version: 1, sessionSequence: 2, currentSessionId: 'session-2', sessions: [
    { id: 'session-2', title: 'Saved', draft: 'editing', messages: [], references: ['x'], pendingScenario: 'normal', modelSelection: null,
      edit: null, viewState: { scrollTop: 42, followLatest: false }, draftView: { selectionStart: 2, selectionEnd: 2 } },
  ] };
  const app = harness({ loaded }); const workspace = await app.mounting;
  assert.equal(app.args.input.value, 'editing');
  assert.equal(workspace.getCurrentSession().references[0], 'x');
  app.args.input.value = 'latest'; app.doc.visibilityState = 'hidden'; app.doc.fire('visibilitychange'); await tick();
  assert.equal(app.writes.at(-1).sessions[0].draft, 'latest');
  app.win.fire('pagehide', { persisted: true }); await tick();
  assert.ok(app.lifecycle.includes('stop')); assert.ok(!app.lifecycle.includes('destroy'));
  workspace.destroy();
});

test('read failure offers temporary mode without writing over existing history', async () => {
  const app = harness({ loadError: true }); await tick();
  assert.equal(app.args.input.disabled, true);
  find(app.host, 'temporary').fire('click');
  const workspace = await app.mounting; workspace.createSession(); await workspace.flush();
  assert.equal(app.writes.length, 0); assert.match(find(app.host, 'save-status').textContent, /临时/);
  workspace.destroy();
});

test('CAS conflict exposes backup and requires explicit confirmation before reload', async () => {
  const app = harness({ saveError: true }); const workspace = await app.mounting; await workspace.flush();
  assert.equal(find(app.host, 'backup').hidden, false);
  find(app.host, 'reload').fire('click');
  assert.equal(app.win.reloaded, undefined);
  const dialog = app.doc.body.children.at(-1);
  find(dialog, 'cancel').fire('click'); assert.equal(app.win.reloaded, undefined);
  find(app.host, 'reload').fire('click');
  find(app.doc.body.children.at(-1), 'confirm').fire('click');
  assert.equal(app.win.reloaded, true);
  workspace.destroy();
});

test('sessionMatch searches titles first and returns a message location and bounded excerpt', async () => {
  const app = harness(); const workspace = await app.mounting;
  const session = { title: 'Work', messages: [{ id: 'm', text: 'The saved answer has a needle inside.' }] };
  assert.equal(app.context.sessionMatch(session, 'work').snippet, '');
  assert.equal(app.context.sessionMatch(session, 'NEEDLE').messageId, 'm');
  assert.equal(app.context.sessionMatch(session, 'absent').matched, false);
  workspace.destroy();
});

test('opening the current history result does not stop the run or return focus to the history trigger', async () => {
  const app = harness(); const workspace = await app.mounting;
  workspace.openHistory();
  const dialog = app.doc.body.children.at(-1);
  assert.ok(find(dialog, 'backup'), 'Normal history includes export');
  const before = app.lifecycle.filter(item => item === 'stop').length;
  find(dialog, 'session').fire('click'); await tick();
  assert.equal(app.lifecycle.filter(item => item === 'stop').length, before);
  assert.equal(app.doc.activeElement, app.args.input);
  workspace.destroy();
});

test('bfcache clean return reloads while a conflict keeps the local version and guards leaving', async () => {
  const clean = harness(); const cleanWorkspace = await clean.mounting; await cleanWorkspace.flush();
  clean.win.fire('pageshow', { persisted: true }); assert.equal(clean.win.reloaded, true); cleanWorkspace.destroy();
  const dirty = harness({ saveError: true }); const dirtyWorkspace = await dirty.mounting;
  assert.equal(await dirtyWorkspace.flush(), false);
  dirty.win.fire('pageshow', { persisted: true }); await tick(); assert.equal(dirty.win.reloaded, undefined);
  let blocked = false; dirty.win.fire('beforeunload', { preventDefault() { blocked = true; } });
  assert.equal(blocked, true); dirtyWorkspace.destroy();
});

test('read retry restores input focus and preserves the loaded record', async () => {
  const app = harness({ loadError: true }); await tick();
  find(app.host, 'retry').focus(); app.setLoadError(false); find(app.host, 'retry').fire('click');
  const workspace = await app.mounting;
  assert.equal(app.doc.activeElement, app.args.input);
  assert.equal(await workspace.flush(), true);
  workspace.destroy();
});

test('rename validates an empty name and persists a valid title without altering messages', async () => {
  const app = harness(); const workspace = await app.mounting;
  find(app.host, 'rename').fire('click');
  const dialog = app.doc.body.children.at(-1);
  const form = flatten(dialog).find(item => item.tag === 'form');
  const field = flatten(form).find(item => item.tag === 'input');
  const save = find(dialog, 'confirm');
  assert.equal(save.tag, 'wa-button');
  assert.equal(save.type, 'submit');
  assert.equal(find(dialog, 'cancel').type, 'button');
  assert.ok(form.id);
  assert.equal(save.form, form.id, 'Footer save still submits the rename form');
  field.value = '  '; form.fire('submit'); assert.equal(dialog.open, true);
  assert.equal(field['aria-invalid'], 'true');
  assert.ok(flatten(form).some(item => item.id === field['aria-describedby'] && /1–80/.test(item.textContent)));
  field.value = 'Focused'; field.fire('input');
  assert.equal(field['aria-invalid'], 'false');
  field.fire('compositionstart'); form.fire('submit'); assert.equal(dialog.open, true);
  field.fire('compositionend');
  field.value = '  Focused   task  '; form.fire('submit'); await tick();
  assert.equal(workspace.getCurrentSession().title, 'Focused task');
  assert.equal(workspace.getCurrentSession().messages.length, 0);
  await workspace.flush(); assert.equal(app.writes.at(-1).sessions[0].title, 'Focused task');
  workspace.destroy();
});

test('rename from the header menu preserves the draft and returns focus to that menu', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting;
  app.args.input.value = 'keep this draft';
  const trigger = node(app.doc, 'button'); workspace.renameSession(trigger);
  const dialog = app.doc.body.children.at(-1), form = flatten(dialog).find(item => item.tag === 'form');
  flatten(form).find(item => item.tag === 'input').value = 'Header rename'; form.fire('submit'); await tick();
  assert.equal(app.doc.activeElement, trigger); assert.equal(app.args.input.value, 'keep this draft');
  await workspace.flush(); assert.equal(app.writes.at(-1).sessions[0].title, 'Header rename');
  assert.equal(app.writes.at(-1).sessions[0].draft, 'keep this draft');
  workspace.destroy();
});

test('history search clears empty results, supports keyboard selection and preserves IME input', async () => {
  const loaded = { version: 1, sessionSequence: 2, currentSessionId: 'session-1', sessions: [
    { id: 'session-1', title: 'First', draft: 'first draft', messages: [] },
    { id: 'session-2', title: 'Second', draft: 'second draft', messages: [] },
  ] };
  const app = harness({ loaded }); const workspace = await app.mounting; workspace.openHistory();
  const dialog = app.doc.body.children.at(-1), search = flatten(dialog).find(item => item.tag === 'input');
  const rows = () => flatten(dialog).filter(item => item.dataset.action === 'session');
  const clear = find(dialog, 'clear-search');
  assert.equal(clear.tag, 'wa-button');
  assert.equal(clear['aria-label'], '清除搜索');
  assert.equal(rows()[0].tag, 'button', 'Search rows keep native keyboard semantics');
  assert.equal(clear.hidden, true);
  search.fire('compositionstart'); search.value = 'Second'; search.fire('input', { isComposing: true });
  dialog.fire('keydown', { key: 'Enter', isComposing: true });
  assert.equal(rows().length, 2); assert.equal(dialog.open, true);
  search.fire('compositionend'); assert.equal(rows().length, 1); assert.equal(clear.hidden, false);
  let prevented = false;
  dialog.fire('cancel', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(search.value, ''); assert.equal(rows().length, 2);
  search.value = 'missing'; search.fire('input'); assert.equal(rows().length, 0);
  find(dialog, 'clear-empty').click(); assert.equal(rows().length, 2); assert.equal(app.doc.activeElement, search);
  dialog.fire('keydown', { key: 'ArrowUp' }); assert.equal(app.doc.activeElement, rows()[1]);
  dialog.fire('keydown', { key: 'ArrowDown' }); assert.equal(app.doc.activeElement, rows()[0]);
  search.focus(); search.value = 'Second'; search.fire('input');
  dialog.fire('keydown', { key: 'Enter' }); await tick();
  assert.equal(workspace.getCurrentSession().id, 'session-2');
  assert.equal(app.args.input.value, 'second draft');
  assert.equal(app.doc.activeElement, app.args.input);
  workspace.destroy();
});

test('history close restores opener and Escape without a query retains native dismissal', async () => {
  const app = harness(); const workspace = await app.mounting; workspace.openHistory();
  const dialog = app.doc.body.children.at(-1);
  let prevented = false; dialog.fire('cancel', { preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  find(dialog, 'close').click(); await tick();
  assert.equal(dialog.open, false); assert.equal(app.doc.activeElement, find(app.host, 'history'));
  workspace.destroy();
});

test('history opened from a persistent menu restores that trigger instead of the sidebar', async () => {
  const app = harness(); const workspace = await app.mounting;
  const trigger = node(app.doc, 'button');
  workspace.openHistory(trigger);
  const dialog = app.doc.body.children.at(-1);
  find(dialog, 'close').click(); await tick();
  assert.equal(app.doc.activeElement, trigger);
  workspace.destroy();
});

test('history message match missing from rendered DOM falls back to the composer', async () => {
  const loaded = { version: 1, sessionSequence: 1, currentSessionId: 'session-1', sessions: [
    { id: 'session-1', title: 'Saved', draft: '', messages: [{ id: 'missing-node', role: 'assistant', text: 'needle' }] },
  ] };
  const app = harness({ loaded }); const workspace = await app.mounting; workspace.openHistory();
  const dialog = app.doc.body.children.at(-1), search = flatten(dialog).find(item => item.tag === 'input');
  search.value = 'needle'; search.fire('input'); find(dialog, 'session').click(); await tick();
  assert.equal(app.doc.activeElement, app.args.input);
  workspace.destroy();
});

test('history message matches expose their snippet as an accessible description', async () => {
  const loaded = { version: 1, sessionSequence: 1, currentSessionId: 'session-1', sessions: [{
    id: 'session-1', title: 'Saved task', draft: '', messages: [{ id: 'm', role: 'user', text: 'Find needle in this answer' }],
  }] };
  const app = harness({ loaded }); const workspace = await app.mounting; workspace.openHistory();
  const dialog = app.doc.body.children.at(-1);
  const search = flatten(dialog).find(item => item.tag === 'input'); search.value = 'needle'; search.fire('input');
  const row = find(dialog, 'session'); const snippet = row.children.find(item => item.tag === 'small');
  assert.ok(snippet.id); assert.equal(row['aria-describedby'], snippet.id);
  search.value = 'Saved'; search.fire('input');
  assert.equal(find(dialog, 'session')['aria-describedby'], undefined);
  workspace.destroy();
});

for (const surface of ['history', 'reload', 'notice']) {
  test(`backup failure is visible and retryable in the ${surface} surface`, async () => {
    const app = harness({ saveError: surface !== 'history' }); const workspace = await app.mounting; await workspace.flush();
    let attempts = 0;
    app.win.Blob = class {};
    app.win.URL = { createObjectURL() { attempts++; throw new Error('Download unavailable'); } };
    let root = app.host;
    if (surface === 'history') { workspace.openHistory(); root = app.doc.body.children.at(-1); }
    if (surface === 'reload') { find(app.host, 'reload').fire('click'); root = app.doc.body.children.at(-1); }
    const control = find(root, 'backup'); control.fire('click');
    const feedback = flatten(root).find(item => item.role === 'status' && /无法下载备份/.test(item.textContent || ''));
    assert.ok(feedback, 'The initiating surface owns the download error announcement');
    assert.equal(feedback.hidden, false);
    if (surface !== 'notice') assert.equal(root.open, true);
    else assert.equal(app.host.children[0].children.at(-1).hidden, false);
    assert.equal(control.hidden, false); assert.notEqual(control.disabled, true);
    control.fire('click'); assert.equal(attempts, 2, 'A failed download can be retried');
    assert.equal(app.win.reloaded, undefined); workspace.destroy();
  });
}

test('sidebar uses the shared store to switch drafts and preserves current running session', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting;
  const rows = () => flatten(app.host).filter(item => item.dataset.action === 'recent-session');
  assert.equal(find(app.host, 'new').lastElementChild.textContent, '新建会话');
  assert.equal(find(app.host, 'new')['aria-label'], '新建会话');
  assert.equal(find(app.host, 'history').lastElementChild.textContent, '搜索历史');
  assert.equal(rows().length, 1);
  app.args.input.value = 'first unsent draft'; app.args.input.fire('input');
  find(app.host, 'new').click();
  assert.deepEqual(rows().map(row => row.dataset.sessionId), ['session-2', 'session-1']);
  app.args.input.value = 'second unsent draft'; app.args.input.fire('input');
  const oldRow = rows()[1]; oldRow.click();
  assert.equal(app.args.input.value, 'first unsent draft');
  assert.equal(oldRow['aria-current'], 'true');
  assert.equal(rows()[0]['aria-current'], 'false');
  const stops = app.lifecycle.filter(item => item === 'stop').length;
  oldRow.click();
  assert.equal(app.lifecycle.filter(item => item === 'stop').length, stops);
  assert.equal(app.doc.activeElement, app.args.input);
  await workspace.flush();
  const persisted = app.writes.at(-1);
  assert.equal(persisted.currentSessionId, 'session-1');
  assert.equal(persisted.sessions[0].draft, 'second unsent draft');
  workspace.destroy();
  const restored = harness({ layout: 'sidebar', loaded: persisted }); const restoredWorkspace = await restored.mounting;
  assert.equal(restored.args.input.value, 'first unsent draft');
  find(restored.host, 'recent-session').click();
  assert.equal(restored.args.input.value, 'second unsent draft');
  restoredWorkspace.destroy();
});

test('sidebar keeps row identity and focus during streaming and updates automatic and renamed titles', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting;
  const row = find(app.host, 'recent-session'); row.focus();
  const messages = [{ role: 'user', text: 'Inspect my project' }];
  app.hooks[0].onMessagesChange(messages);
  assert.equal(find(app.host, 'recent-session'), row);
  assert.equal(row.lastElementChild.textContent, 'Inspect my project');
  assert.equal(row['aria-label'], 'Inspect my project');
  assert.equal(app.doc.activeElement, row);
  for (let i = 0; i < 20; i++) app.hooks[0].onMessagesChange([...messages, { role: 'assistant', text: `Chunk ${i}` }]);
  assert.equal(find(app.host, 'recent-session'), row);
  assert.equal(app.doc.activeElement, row);
  find(app.host, 'rename').click();
  const dialog = app.doc.body.children.at(-1);
  const form = flatten(dialog).find(item => item.tag === 'form');
  flatten(form).find(item => item.tag === 'input').value = 'Release check';
  form.fire('submit'); await tick();
  assert.equal(row.lastElementChild.textContent, 'Release check');
  assert.equal(find(app.host, 'rename')['aria-label'], '重命名当前会话：Release check');
  assert.equal(find(app.host, 'history').lastElementChild.textContent, '搜索历史');
  assert.equal(app.doc.activeElement, find(app.host, 'rename'));
  workspace.destroy();
});

test('toolbar remains the default and sidebar read failures retain recovery controls', async () => {
  const app = harness(); const workspace = await app.mounting;
  assert.equal(app.host.children[0].className, 'session-workspace');
  assert.equal(find(app.host, 'recent-session'), undefined);
  assert.equal(find(app.host, 'new').lastElementChild.textContent, '新建会话');
  assert.equal(find(app.host, 'history').lastElementChild.textContent, '新会话');
  workspace.destroy();
  const failed = harness({ layout: 'sidebar', loadError: true }); await tick();
  assert.equal(find(failed.host, 'history').disabled, true);
  assert.equal(find(failed.host, 'new').disabled, true);
  assert.equal(find(failed.host, 'recent-session'), undefined);
  assert.equal(find(failed.host, 'temporary').hidden, false);
  find(failed.host, 'temporary').click(); const temporary = await failed.mounting;
  assert.equal(find(failed.host, 'new').disabled, false);
  assert.equal(find(failed.host, 'recent-session')['aria-current'], 'true');
  assert.equal(await temporary.flush(), false);
  assert.equal(failed.writes.length, 0);
  assert.match(find(failed.host, 'save-status').textContent, /未保存/);
  temporary.destroy();
});

test('archive is committed before removing a sidebar row and restores drafts through archived history', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting;
  app.args.input.value = 'keep this draft'; app.args.input.fire('input'); await workspace.flush();
  workspace.openHistory(); let dialog = app.doc.body.children.at(-1);
  find(dialog, 'archive-session').click(); await tick();
  const archived = app.writes.at(-1).sessions.find(item => item.id === 'session-1');
  assert.equal(archived.archived, true); assert.equal(archived.draft, 'keep this draft');
  assert.notEqual(workspace.getCurrentSession().id, 'session-1');
  assert.equal(flatten(app.host).filter(item => item.dataset.action === 'recent-session').length, 1);
  find(dialog, 'filter-archived').click();
  assert.equal(find(dialog, 'session').dataset.sessionId, 'session-1');
  find(dialog, 'restore-session').click(); await tick();
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === 'session-1').archived, false);
  find(dialog, 'filter-active').click();
  flatten(dialog).find(item => item.dataset.action === 'session' && item.dataset.sessionId === 'session-1').click(); await tick();
  assert.equal(app.args.input.value, 'keep this draft'); workspace.destroy();
});

test('failed archive preserves active session and reports an error without success', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting; await workspace.flush();
  app.setSaveError(true); workspace.openHistory(); const dialog = app.doc.body.children.at(-1);
  find(dialog, 'archive-session').click(); await tick();
  assert.equal(workspace.getCurrentSession().id, 'session-1');
  assert.notEqual(workspace.getCurrentSession().archived, true);
  assert.equal(find(app.host, 'recent-session').dataset.sessionId, 'session-1');
  assert.ok(flatten(dialog).some(item => /未归档|操作未完成/.test(item.textContent || '')));
  workspace.destroy();
});

test('archive saved before UI apply failure directs reload without claiming no change', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting; await workspace.flush();
  workspace.conversation.replaceMessages = () => { throw new Error('render failed'); };
  workspace.openHistory(); const dialog = app.doc.body.children.at(-1);
  find(dialog, 'archive-session').click(); await tick();
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === 'session-1').archived, true);
  const notices = flatten(dialog).map(item => item.textContent || '').join(' ');
  assert.match(notices, /已保存.*重新载入/); assert.doesNotMatch(notices, /原会话未归档|操作未完成/);
  workspace.destroy();
});

test('archived filter composes with search and keeps row actions outside session buttons', async () => {
  const loaded = { version: 1, sessionSequence: 2, currentSessionId: 'session-1', sessions: [
    { id: 'session-1', title: 'First', draft: '', messages: [] },
    { id: 'session-2', title: 'Archived', draft: 'saved', archived: true, messages: [] },
  ] };
  const app = harness({ layout: 'sidebar', loaded }); const workspace = await app.mounting;
  assert.equal(flatten(app.host).filter(item => item.dataset.action === 'recent-session').length, 1);
  workspace.openHistory(undefined, 'archived'); const dialog = app.doc.body.children.at(-1);
  assert.equal(find(dialog, 'session').dataset.sessionId, 'session-2');
  assert.equal(find(dialog, 'session').contains(find(dialog, 'restore-session')), false);
  const search = flatten(dialog).find(item => item.tag === 'input'); search.value = 'missing'; search.fire('input');
  assert.equal(find(dialog, 'session'), undefined);
  find(dialog, 'clear-empty').click(); assert.equal(find(dialog, 'session').dataset.sessionId, 'session-2');
  workspace.destroy();
});

test('archive transaction failure after a successful pre-save does not mutate the live session', async () => {
  const app = harness({ layout: 'sidebar' }); const workspace = await app.mounting; await workspace.flush();
  app.args.input.value = 'preserved'; app.args.input.fire('input'); await workspace.flush();
  let attempts = 0; app.setSaveError(() => ++attempts === 2);
  workspace.openHistory(); const dialog = app.doc.body.children.at(-1);
  find(dialog, 'archive-session').click(); await tick();
  assert.equal(attempts, 2); assert.equal(workspace.getCurrentSession().id, 'session-1');
  assert.notEqual(workspace.getCurrentSession().archived, true); assert.equal(app.args.input.value, 'preserved');
  assert.notEqual(app.writes.at(-1).sessions[0].archived, true);
  assert.ok(find(dialog, 'archive-session')); workspace.destroy();
});

test('project switching preserves A/B drafts, remembers sessions after reload and does not remount', async () => {
  const app = harness({ projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects(['a', 'b']);
  assert.equal(await workspace.selectProject('a'), true);
  const a = workspace.getCurrentSession().id;
  app.args.input.value = 'Draft A'; app.args.input.fire('input');
  assert.equal(await workspace.selectProject('b'), true);
  app.args.input.value = 'Draft B'; app.args.input.fire('input');
  assert.equal(await workspace.selectProject('a'), true);
  assert.equal(app.args.input.value, 'Draft A');
  assert.equal(workspace.getCurrentSession().id, a);
  assert.equal(app.hooks.length, 1);
  const count = app.writes.at(-1).sessions.length;
  await workspace.selectProject('a');
  assert.equal(app.writes.at(-1).sessions.length, count);
  await workspace.flush();
  const reload = harness({ loaded: app.writes.at(-1), projectScoped: true }); const restored = await reload.mounting;
  restored.setKnownProjects(['a', 'b']); await restored.selectProject('b');
  assert.equal(reload.args.input.value, 'Draft B');
  workspace.destroy(); restored.destroy();
});

test('failed project association preserves original metadata and draft', async () => {
  const app = harness({ projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects(['a']); await workspace.flush();
  app.args.input.value = 'Keep'; app.setSaveError(true);
  assert.equal(await workspace.associateCurrentSession('a'), false);
  assert.equal(workspace.getCurrentSession().projectId ?? null, null);
  assert.equal(app.args.input.value, 'Keep');
  workspace.destroy();
});

test('project association changes metadata once, preserves messages, and survives commit conflict', async () => {
  const app = harness({ projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects(['a', 'b']);
  workspace.conversation.replaceMessages([{ id: 'u', role: 'user', text: 'Existing' }]);
  app.args.input.value = 'Unsent';
  const original = workspace.getCurrentSession().id;
  assert.equal(await workspace.associateCurrentSession('a'), true);
  assert.equal(workspace.getCurrentSession().id, original);
  assert.equal(workspace.getCurrentSession().messages[0].text, 'Existing');
  assert.equal(app.writes.at(-1).sessions.length, 1);
  let saves = 0; app.setSaveError(() => ++saves === 2);
  assert.equal(await workspace.associateCurrentSession('b'), false);
  assert.equal(workspace.getCurrentSession().projectId, 'a');
  assert.equal(app.args.input.value, 'Unsent');
  workspace.destroy();
});

test('project scope filters sidebar/history and archive fallback stays in the same project', async () => {
  const app = harness({ layout: 'sidebar', projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects(['a', 'b']);
  await workspace.selectProject('a'); const a = workspace.getCurrentSession().id;
  await workspace.selectProject('b'); const b = workspace.getCurrentSession().id;
  await workspace.selectProject('a');
  assert.deepEqual(flatten(app.host).filter(item => item.dataset.action === 'recent-session').map(item => item.dataset.sessionId), [a]);
  workspace.openHistory();
  const dialog = app.doc.body.children.at(-1);
  assert.deepEqual(flatten(dialog).filter(item => item.dataset.action === 'session').map(item => item.dataset.sessionId), [a]);
  find(dialog, 'archive-session').fire('click'); await tick();
  assert.equal(workspace.getCurrentSession().projectId, 'a');
  assert.notEqual(workspace.getCurrentSession().id, b);
  assert.notEqual(workspace.getCurrentSession().id, a);
  workspace.destroy();
});

test('import keeps existing projects and maps unknown imported project references to unassigned', async () => {
  const app = harness({ projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects(['a']); await workspace.selectProject('a');
  workspace.openData(); const surface = app.dataDialogs.at(-1);
  await surface.prepare();
  const snapshot = JSON.parse(JSON.stringify(surface.capture()));
  snapshot.sessions.push({ id: 'session-99', projectId: 'foreign', title: 'Imported', draft: 'Keep', messages: [{ id: 'imported-message', role: 'user', text: 'Retained' }] });
  snapshot.sessionSequence = 99;
  await surface.commit(snapshot);
  const saved = app.writes.at(-1);
  assert.equal(saved.sessions.find(item => item.id === 'session-99').projectId, null);
  assert.equal(saved.sessions.find(item => item.id === 'session-99').messages[0].text, 'Retained');
  assert.equal(workspace.getCurrentSession().projectId, 'a');
  workspace.destroy();
});

test('project-scoped import waits for trusted registry before preparing or committing', async () => {
  const app = harness({ projectScoped: true }); const workspace = await app.mounting;
  await workspace.flush(); workspace.openData(); const surface = app.dataDialogs.at(-1);
  const before = app.writes.length;
  await assert.rejects(surface.prepare(), error => error.code === 'projects-unavailable');
  await assert.rejects(surface.commit(surface.capture()), error => error.code === 'projects-unavailable');
  assert.equal(app.writes.length, before);
  workspace.setKnownProjects([]);
  await surface.prepare(); await surface.commit(surface.capture());
  assert.equal(workspace.getCurrentSession().projectId ?? null, null);
  workspace.destroy();
});

test('both same-project and cross-project selection block new and competing scope changes while saving', async () => {
  for (const target of [null, 'a']) {
    const app = harness({ projectScoped: true }); const workspace = await app.mounting;
    workspace.setKnownProjects(['a', 'b']); await workspace.flush();
    const pending = workspace.selectProject(target);
    assert.equal(workspace.createSession(), undefined);
    assert.equal(await workspace.selectProject('b'), false);
    assert.equal(await workspace.associateCurrentSession('b'), false);
    assert.equal(await pending, true);
    assert.equal(workspace.getCurrentSession().projectId ?? null, target);
    assert.equal(app.writes.at(-1).sessions.length, target === null ? 1 : 2);
    workspace.destroy();
  }
});

function orphanedProjectSnapshot() {
  return { version: 1, currentSessionId: 'session-1', sessionSequence: 2,
    projectCurrentSessions: [{ projectId: 'removed', sessionId: 'session-1' }, { projectId: 'kept', sessionId: 'session-2' }],
    sessions: [{ id: 'session-1', projectId: 'removed', title: 'Recover me', draft: 'Unsent recovery', messages: [{ id: 'retained', role: 'user', text: 'Keep message' }], viewState: { scrollTop: 42, followLatest: false }, modelSelection: { providerId: 'openai', model: 'saved', label: 'Saved' } },
      { id: 'session-2', projectId: 'kept', title: 'Kept', draft: 'Other draft', messages: [] }] };
}

test('trusted restored project registry reconciles orphaned associations without losing session content', async () => {
  const app = harness({ loaded: orphanedProjectSnapshot(), projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects(['kept']);
  assert.equal(await workspace.selectProject(null), true);
  const recovered = workspace.getCurrentSession();
  assert.equal(recovered.id, 'session-1'); assert.equal(recovered.projectId, null);
  assert.equal(recovered.draft, 'Unsent recovery'); assert.equal(recovered.messages[0].text, 'Keep message');
  assert.equal(recovered.viewState.scrollTop, 42); assert.equal(recovered.modelSelection.model, 'saved');
  const saved = app.writes.at(-1);
  assert.equal(saved.sessions.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.projectCurrentSessions)), [{ projectId: 'kept', sessionId: 'session-2' }, { projectId: null, sessionId: 'session-1' }]);
  workspace.destroy();
});

test('trusted empty registry recovers all orphaned sessions while an unloaded registry never rewrites associations', async () => {
  const app = harness({ loaded: orphanedProjectSnapshot(), projectScoped: true }); const workspace = await app.mounting;
  await workspace.selectProject(null);
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === 'session-1').projectId, 'removed');
  workspace.setKnownProjects([]); assert.equal(await workspace.selectProject(null), true);
  assert.ok(app.writes.at(-1).sessions.every(item => item.projectId == null));
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === 'session-1').draft, 'Unsent recovery');
  workspace.destroy();
});

test('orphan reconciliation failed CAS leaves original associations and selected session untouched', async () => {
  const app = harness({ loaded: orphanedProjectSnapshot(), projectScoped: true }); const workspace = await app.mounting;
  workspace.setKnownProjects([]); let writes = 0; app.setSaveError(() => ++writes === 2);
  assert.equal(await workspace.selectProject(null), false);
  assert.equal(workspace.getCurrentSession().id, 'session-1');
  assert.equal(workspace.getCurrentSession().projectId, 'removed');
  assert.equal(workspace.getCurrentSession().draft, 'Unsent recovery');
  assert.equal(app.writes.at(-1).sessions[0].projectId, 'removed');
  assert.match(find(app.host, 'save-status').textContent, /尚未保存/);
  workspace.destroy();
});


test('temporary workspace exposes its mode without permitting project changes or association', async () => {
  const normal = harness(); const saved = await normal.mounting;
  assert.equal(saved.isTemporary(), false); saved.destroy();
  const app = harness({ loadError: true, projectScoped: true }); await tick();
  find(app.host, 'temporary').fire('click');
  const workspace = await app.mounting;
  assert.equal(workspace.isTemporary(), true);
  workspace.setKnownProjects(['a']);
  assert.equal(await workspace.selectProject('a'), false);
  assert.equal(await workspace.associateCurrentSession('a'), false);
  assert.equal(workspace.getCurrentSession().projectId ?? null, null);
  workspace.openData();
  await assert.rejects(app.dataDialogs.at(-1).prepare(), /临时模式不能导入/);
  assert.equal(app.writes.length, 0);
  workspace.destroy();
});

test('data settings panel is lazy, stable and owned by the workspace lifetime', async () => {
  const app = harness(), workspace = await app.mounting;
  assert.equal(app.dataPanels.length, 0);
  const panel = workspace.getDataSettingsPanel();
  assert.equal(workspace.getDataSettingsPanel(), panel);
  assert.equal(app.dataPanels.length, 1); assert.equal(app.dataDialogs.length, 0);
  assert.equal(panel.element.tag, 'section');
  const mounts = app.hooks.length;
  panel.open(); panel.close(); panel.open();
  assert.equal(app.dataPanels[0].opens, 2); assert.equal(app.dataPanels[0].closes, 1);
  assert.equal(app.hooks.length, mounts);
  workspace.openData();
  assert.equal(app.dataPanels[0].closes, 2); assert.equal(app.dataDialogs.length, 1);
  workspace.destroy();
  assert.equal(app.dataPanels[0].destroyed, true);
  assert.equal(app.dataPanels[0].options.isDisposed(), true);
  panel.open(); assert.equal(app.dataPanels[0].opens, 2);
});

test('embedded data transaction flushes the live draft and guards the same workspace mutation', async () => {
  const app = harness({ projectScoped: true }), workspace = await app.mounting;
  workspace.setKnownProjects(['a']); await workspace.selectProject('a');
  const panel = workspace.getDataSettingsPanel(), options = app.dataPanels[0].options;
  app.args.input.disabled = false; app.args.sendButton.disabled = true;
  app.args.input.value = 'Draft changed in the current conversation';
  options.onBusyChange(true);
  assert.equal(panel.canClose(), false); assert.equal(app.args.input.disabled, true);
  assert.equal(workspace.createSession(), undefined);
  panel.open(); assert.equal(app.dataPanels[0].opens, 0);
  const stops = app.lifecycle.filter(item => item === 'stop').length;
  await options.prepare();
  assert.equal(app.lifecycle.filter(item => item === 'stop').length, stops + 1);
  assert.equal(app.writes.at(-1).sessions.find(item => item.id === workspace.getCurrentSession().id).draft, app.args.input.value);
  const snapshot = JSON.parse(JSON.stringify(options.capture()));
  snapshot.sessions.push({ id: 'session-99', projectId: 'foreign', title: 'Imported', draft: 'Imported draft', messages: [] });
  snapshot.sessionSequence = 99;
  await options.commit(snapshot); options.onBusyChange(false);
  assert.equal(panel.canClose(), true); assert.equal(app.args.input.disabled, false); assert.equal(app.args.sendButton.disabled, true);
  const imported = app.writes.at(-1).sessions.find(item => item.id === 'session-99');
  assert.equal(imported.projectId, null); assert.equal(imported.draft, 'Imported draft');
  assert.equal(workspace.getCurrentSession().projectId, 'a');
  assert.equal(app.args.input.value, 'Draft changed in the current conversation');
  workspace.destroy();
});

test('embedded data rejects missing registry and detects a persisted import whose UI apply failed', async () => {
  let navigations = 0;
  const app = harness({ projectScoped: true, onOpenDataSettings: () => { navigations++; } }), workspace = await app.mounting;
  workspace.getDataSettingsPanel(); const options = app.dataPanels[0].options;
  await assert.rejects(options.prepare(), error => error.code === 'projects-unavailable');
  await assert.rejects(options.commit(options.capture()), error => error.code === 'projects-unavailable');
  workspace.setKnownProjects([]); await options.prepare();
  assert.equal(options.isReloadRequired(), false);
  const snapshot = JSON.parse(JSON.stringify(options.capture()));
  workspace.conversation.replaceMessages = () => { throw new Error('Conversation UI failed'); };
  await assert.rejects(options.commit(snapshot), error => error.code === 'apply-failed');
  assert.equal(options.isReloadRequired(), true);
  assert.throws(options.capture, error => error.code === 'apply-failed');
  await assert.rejects(options.prepare(), error => error.code === 'apply-failed');
  workspace.openData(); assert.equal(navigations, 0, 'persisted but unapplied import cannot navigate into another import surface');
  workspace.destroy();
});

test('history data navigation uses the host route without replacing the stable data panel or mutating sessions', async () => {
  const anchors = [], app = harness({ onOpenDataSettings: anchor => anchors.push(anchor) });
  const workspace = await app.mounting; await workspace.flush();
  const panel = workspace.getDataSettingsPanel(), anchor = node(app.doc, 'button');
  const writes = app.writes.length, lifecycle = [...app.lifecycle];
  workspace.openHistory(anchor, 'archived');
  const history = app.doc.body.children.find(child => child.dataset.kind === 'history');
  find(history, 'data').click(); await tick();
  assert.equal(history.open, false); assert.equal(anchors[0], anchor);
  assert.equal(app.dataDialogs.length, 0); assert.equal(workspace.getDataSettingsPanel(), panel);
  assert.equal(app.dataPanels[0].closes, 0, 'host owns embedded panel lifecycle');
  assert.equal(app.writes.length, writes); assert.deepEqual(app.lifecycle, lifecycle);
  workspace.destroy(); workspace.openData(anchor); assert.equal(anchors.length, 1);
});

test('data navigation cannot close history or escape a pending import transaction', async () => {
  const anchors = [], app = harness({ onOpenDataSettings: anchor => anchors.push(anchor) });
  const workspace = await app.mounting; workspace.getDataSettingsPanel();
  workspace.openHistory();
  const history = app.doc.body.children.find(child => child.dataset.kind === 'history');
  const options = app.dataPanels[0].options; options.onBusyChange(true);
  find(history, 'data').click(); workspace.openData();
  assert.equal(history.open, true); assert.equal(anchors.length, 0); assert.equal(app.dataDialogs.length, 0);
  options.onBusyChange(false); app.dataPanels[0].canClose = () => false;
  find(history, 'data').click(); assert.equal(history.open, true); assert.equal(anchors.length, 0);
  app.dataPanels[0].canClose = () => true;
  workspace.openData(); assert.equal(anchors.length, 1);
  workspace.destroy();
});

test('standalone history data entry retains the existing backup dialog fallback', async () => {
  const app = harness(), workspace = await app.mounting, anchor = node(app.doc, 'button');
  workspace.openHistory(anchor);
  find(app.doc.body.children.find(child => child.dataset.kind === 'history'), 'data').click();
  await tick(); assert.equal(app.dataDialogs.length, 1); assert.equal(app.dataDialogs[0].trigger, anchor);
  workspace.destroy();
});
