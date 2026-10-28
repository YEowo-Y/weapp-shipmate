import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import { createActionButton } from './helpers/ui-action.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';
import { normalizeSessionSnapshot } from '../desktop/design-previews/session-store.js';
import { parseSessionBackup, mergeSessionBackup } from '../desktop/design-previews/session-transfer.js';

const source = readFileSync(new URL('../desktop/design-previews/session-data-dialog.js', import.meta.url), 'utf8');
const snapshot = (title = 'Original') => ({ version: 1, currentSessionId: 'session-1', sessionSequence: 1,
  sessions: [{ id: 'session-1', title, draft: 'unsent draft', messages: [{ id: 'm1', role: 'user', text: 'Saved message' }] }] });
function harness(options = {}) {
  const doc = { activeElement: null };
  let buttonsReady = !options.deferButtons, releaseButtons;
  const rendered = options.deferButtons ? new Promise(resolve => { releaseButtons = () => { buttonsReady = true; resolve(); }; }) : Promise.resolve();
  function element(tag) {
    const listeners = new Map();
    return { tag, children: [], dataset: {}, value: '', ownerDocument: doc,
      append(...children) { this.children.push(...children); }, setAttribute(name, value) { this[name] = value; },
      addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
      async fire(type, event = {}) { await Promise.all((listeners.get(type) || []).map(fn => fn({ preventDefault() {}, ...event }))); },
      updateComplete: rendered,
      click() { return this.fire('click'); }, focus() { if (tag === 'wa-button' && !buttonsReady) throw new TypeError('Inner button has not rendered'); doc.activeElement = this; }, remove() {},
      showModal() { this.open = true; }, close() { this.open = false; void this.fire('close'); },
    };
  }
  doc.createElement = element; doc.createElementNS = (_ns, tag) => element(tag); doc.body = element('body');
  const downloads = [];
  doc.defaultView = { Blob: class { constructor(parts) { downloads.push(JSON.parse(parts[0])); } },
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} }, setTimeout(fn) { fn(); } };
  const context = vm.createContext({ createActionButton, createIcon, normalizeSessionSnapshot, parseSessionBackup, mergeSessionBackup });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  let current = snapshot(); const commits = [], busy = [], trigger = element('button');
  const createSurface = options.embedded ? context.createSessionDataPanel : context.openSessionDataDialog;
  const surface = createSurface({ document: doc, trigger, capture: () => current,
    prepare: options.prepare || (async () => {}),
    async commit(value) { commits.push(value); await options.commit?.(value); current = value; },
    onBusyChange: value => busy.push(value), ...options.callbacks,
  });
  const flatten = node => [node, ...node.children.flatMap(flatten)];
  const find = name => flatten(surface.node).find(node => node.dataset.action === name);
  const select = async (text = JSON.stringify(snapshot('Imported')), name = 'backup.json', size = text.length) => {
    find('backup-file').files = [{ name, size, text: async () => text }]; await find('backup-file').fire('change');
  };
  return { surface, doc, trigger, find, select, commits, busy, downloads, current: () => current, setCurrent: value => { current = value; }, flatten, releaseButtons };
}

test('opening returns its surface before custom buttons render, then focuses the completed control', async () => {
  const app = harness({ deferButtons: true });
  assert.equal(app.surface.node.open, true); assert.equal(app.doc.activeElement, null);
  app.releaseButtons(); await setImmediate();
  assert.equal(app.doc.activeElement, app.find('cancel'));
});

test('delayed initial focus cannot steal user focus or target a closed or disposed dialog', async () => {
  for (const action of ['move', 'close', 'dispose']) {
    let disposed = false;
    const app = harness({ deferButtons: true, callbacks: { isDisposed: () => disposed } });
    if (action === 'move') app.find('backup-file').focus();
    if (action === 'close') app.surface.close();
    if (action === 'dispose') disposed = true;
    const focused = app.doc.activeElement;
    app.releaseButtons(); await setImmediate();
    assert.equal(app.doc.activeElement, focused, action);
  }
});

test('backup preview names the scope and only appends after a successful commit', async () => {
  const app = harness(); await app.select();
  const description = app.flatten(app.surface.node).find(item => item.className === 'session-workspace__data-description');
  assert.match(description.textContent, /项目记忆不包含在内.*项目备份导出/);
  assert.equal(app.commits.length, 0); assert.equal(app.find('import-confirm').disabled, false);
  const preview = app.flatten(app.surface.node).find(item => item.className === 'session-workspace__import-preview');
  assert.match(preview.textContent, /1 个会话 · 1 条消息/);
  await app.find('import-confirm').click();
  assert.equal(app.current().sessions.length, 2); assert.equal(app.current().currentSessionId, 'session-1');
  assert.equal(app.current().sessions[0].draft, 'unsent draft');
  assert.notEqual(app.current().sessions[1].messages[0].id, 'm1');
  assert.match(app.find('data-feedback').textContent, /已追加导入并保存/);
  assert.equal(app.find('import-confirm').disabled, true);
  assert.deepEqual(app.busy, [true, false]);
});

test('invalid, oversized and unknown-version backups disable confirmation without changing existing data', async () => {
  const app = harness();
  for (const [text, size] of [['{broken', 7], [JSON.stringify(snapshot()), 21 * 1024 * 1024], [JSON.stringify({ ...snapshot(), version: 9 }), 100]]) {
    await app.select(text, 'invalid.json', size);
    assert.equal(app.find('import-confirm').disabled, true);
    assert.match(app.find('data-feedback').textContent, /原记录未修改/);
    await app.find('import-confirm').click(); assert.equal(app.commits.length, 0);
  }
  assert.equal(app.current().sessions.length, 1);
});

test('file selection races and closing while reading cannot resurrect an old preview', async () => {
  const app = harness(); let resolveOld;
  app.find('backup-file').files = [{ name: 'old.json', size: 100, text: () => new Promise(resolve => { resolveOld = resolve; }) }];
  const oldRead = app.find('backup-file').fire('change'); await app.select('{broken');
  resolveOld(JSON.stringify(snapshot())); await oldRead;
  assert.equal(app.find('import-confirm').disabled, true);
  let resolveClosing;
  app.find('backup-file').files = [{ name: 'closing.json', size: 100, text: () => new Promise(resolve => { resolveClosing = resolve; }) }];
  const closingRead = app.find('backup-file').fire('change'); app.surface.close();
  resolveClosing(JSON.stringify(snapshot())); await closingRead;
  assert.equal(app.find('import-confirm').disabled, true); assert.equal(app.doc.activeElement, app.trigger);
});

test('pending writes block duplicate submission and dismissal and announce success only after commit', async () => {
  let release; const app = harness({ commit: () => new Promise(resolve => { release = resolve; }) });
  await app.select(); const pending = app.find('import-confirm').click();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(app.find('backup-file').disabled, true); assert.equal(app.find('close').disabled, true);
  assert.doesNotMatch(app.find('data-feedback').textContent, /已追加导入/);
  await app.find('import-confirm').click(); app.surface.close();
  assert.equal(app.commits.length, 1); assert.equal(app.surface.node.open, true);
  let prevented = false; await app.surface.node.fire('cancel', { preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  release(); await pending;
  assert.match(app.find('data-feedback').textContent, /已追加导入并保存/);
});

test('failed persistence leaves current records intact and lets the user retry', async () => {
  let failed = true; const app = harness({ commit: async () => { if (failed) throw Object.assign(new Error(), { code: 'quota' }); } });
  await app.select(); await app.find('import-confirm').click();
  assert.equal(app.current().sessions.length, 1); assert.match(app.find('data-feedback').textContent, /导入未完成/);
  assert.equal(app.find('import-confirm').disabled, false);
  failed = false; await app.find('import-confirm').click(); assert.equal(app.current().sessions.length, 2);
});

test('failed pre-save prevents import writes and still allows downloading the current backup', async () => {
  const app = harness({ prepare: async () => { throw new Error('Unsaved'); } });
  await app.select(); await app.find('import-confirm').click();
  assert.equal(app.commits.length, 0); assert.equal(app.find('backup').disabled, false);
  await app.find('backup').click(); assert.equal(app.downloads.length, 1);
  assert.equal(app.downloads[0].sessions[0].draft, 'unsent draft');
});

test('closing after import restores focus to the original opener', async () => {
  let closedNode;
  const app = harness({ callbacks: { onClose: node => { closedNode = node; } } }); await app.select(); await app.find('import-confirm').click();
  assert.ok(app.find('close').children.some(child => child.textContent === '关闭' && child.className === 'sr-only'));
  await app.find('cancel').click(); assert.equal(app.doc.activeElement, app.trigger); assert.equal(closedNode, app.surface.node);
});

test('committed import with failed UI apply requires reload and blocks duplicate import and stale export', async () => {
  const app = harness({ commit: async () => { throw Object.assign(new Error('UI failed'), { code: 'apply-failed' }); } });
  await app.select(); await app.find('import-confirm').click();
  assert.match(app.find('data-feedback').textContent, /已保存.*重新载入/);
  for (const name of ['backup-file', 'import-confirm', 'backup']) assert.equal(app.find(name).disabled, true);
  await app.select(); await app.find('import-confirm').click(); await app.find('backup').click();
  assert.equal(app.commits.length, 1); assert.equal(app.downloads.length, 0);
  assert.equal(app.find('cancel').disabled, false);
  await app.find('cancel').click(); assert.equal(app.doc.activeElement, app.trigger);
});

test('unavailable project registry offers a precise retry without importing', async () => {
  const app = harness({ prepare: async () => { throw Object.assign(new Error('Not ready'), { code: 'projects-unavailable' }); } });
  await app.select(); await app.find('import-confirm').click();
  assert.equal(app.commits.length, 0);
  assert.match(app.find('data-feedback').textContent, /项目列表尚未加载.*项目.*重试/);
  assert.equal(app.find('import-confirm').disabled, false);
});

test('embedded data panel reopens without a dialog or focus jump and exports the latest session', async () => {
  const app = harness({ embedded: true });
  const panel = app.surface;
  assert.equal(panel.element, panel.node); assert.equal(panel.element.tag, 'section');
  assert.equal(panel.element.hidden, true); assert.equal(app.doc.body.children.length, 0);
  assert.equal(app.find('close'), undefined); assert.equal(app.find('cancel'), undefined);
  app.trigger.focus(); panel.open(); await setImmediate();
  assert.equal(panel.element.hidden, false); assert.equal(app.doc.activeElement, app.trigger);
  assert.equal(panel.node.open, undefined); assert.equal(panel.canClose(), true);
  await app.select();
  panel.open(); assert.equal(app.find('import-confirm').disabled, false);
  assert.equal(panel.close(), true); assert.equal(panel.element.hidden, true);
  assert.equal(app.find('import-confirm').disabled, true);
  const latest = snapshot('Updated'); latest.sessions[0].draft = 'new current draft';
  app.setCurrent(latest); panel.open(); await app.find('backup').click();
  assert.equal(app.find('import-confirm').disabled, true);
  assert.equal(app.flatten(panel.node).find(item => item.className === 'session-workspace__import-preview').hidden, true);
  assert.equal(app.downloads[0].sessions[0].title, 'Updated');
  assert.equal(app.downloads[0].sessions[0].draft, 'new current draft');
  assert.equal(app.doc.activeElement, app.trigger);
});

test('embedded panel navigation invalidates pending file reads and destroy prevents reopening', async () => {
  const app = harness({ embedded: true }); app.surface.open();
  let release;
  app.find('backup-file').files = [{ name: 'old.json', size: 100, text: () => new Promise(resolve => { release = resolve; }) }];
  const pending = app.find('backup-file').fire('change');
  app.surface.close(); app.surface.open(); await app.select(JSON.stringify(snapshot()), 'current.json');
  release(JSON.stringify(snapshot('Old'))); await pending;
  const preview = app.flatten(app.surface.node).find(item => item.className === 'session-workspace__import-preview');
  assert.match(preview.textContent, /current.json/); assert.equal(app.find('import-confirm').disabled, false);
  app.surface.close(); app.surface.destroy(); app.surface.open();
  await app.find('backup').click(); await app.find('import-confirm').click();
  assert.equal(app.surface.element.hidden, true); assert.equal(app.downloads.length, 0); assert.equal(app.commits.length, 0);
});

test('embedded pending import blocks navigation until the shared write completes', async () => {
  let release;
  const app = harness({ embedded: true, commit: () => new Promise(resolve => { release = resolve; }) });
  app.surface.open(); await app.select(); const pending = app.find('import-confirm').click();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(app.surface.canClose(), false); assert.equal(app.surface.close(), false);
  assert.equal(app.surface.element.hidden, false); assert.equal(app.find('backup-file').disabled, true);
  await app.find('import-confirm').click(); assert.equal(app.commits.length, 1);
  release(); await pending;
  assert.equal(app.surface.canClose(), true); assert.match(app.find('data-feedback').textContent, /已追加导入并保存/);
  assert.deepEqual(app.busy, [true, false]); assert.equal(app.surface.close(), true);
  assert.equal(app.surface.element.hidden, true);
});

test('embedded import validates files and retains the committed UI failure lock across navigation', async () => {
  const app = harness({ embedded: true, commit: async () => { throw Object.assign(new Error('UI failed'), { code: 'apply-failed' }); } });
  app.surface.open();
  for (const [text, size] of [['{broken', 7], [JSON.stringify(snapshot()), 20 * 1024 * 1024 + 1]]) {
    await app.select(text, 'invalid.json', size); assert.equal(app.find('import-confirm').disabled, true);
  }
  assert.equal(app.commits.length, 0);
  await app.select(); await app.find('import-confirm').click();
  app.surface.close(); app.surface.open();
  assert.match(app.find('data-feedback').textContent, /已保存.*重新载入/);
  for (const name of ['backup-file', 'import-confirm', 'backup']) assert.equal(app.find(name).disabled, true);
  await app.select(); await app.find('import-confirm').click(); await app.find('backup').click();
  assert.equal(app.commits.length, 1); assert.equal(app.downloads.length, 0);
});

test('embedded panel respects an existing workspace reload requirement on first opening', async () => {
  const app = harness({ embedded: true, callbacks: { isReloadRequired: () => true } });
  app.surface.open();
  assert.match(app.find('data-feedback').textContent, /已保存.*重新载入/);
  await app.select(); await app.find('import-confirm').click(); await app.find('backup').click();
  assert.equal(app.commits.length, 0); assert.equal(app.downloads.length, 0);
  assert.equal(app.find('backup-file').disabled, true); assert.equal(app.surface.canClose(), true);
});

test('delayed import completion focus cannot cross embedded navigation', async () => {
  const app = harness({ embedded: true, deferButtons: true }); app.surface.open();
  await app.select(); const pending = app.find('import-confirm').click();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.match(app.find('data-feedback').textContent, /已追加导入并保存/);
  assert.equal(app.surface.canClose(), true);
  app.surface.close(); app.surface.open(); app.trigger.focus();
  app.releaseButtons(); await pending;
  assert.equal(app.doc.activeElement, app.trigger);
});

test('destroying an embedded panel during a write releases its owner lock when the write settles', async () => {
  let release;
  const app = harness({ embedded: true, commit: () => new Promise(resolve => { release = resolve; }) });
  app.surface.open(); await app.select(); const pending = app.find('import-confirm').click();
  await setImmediate(); assert.equal(app.commits.length, 1);
  app.surface.destroy(); app.trigger.focus(); release(); await pending;
  assert.deepEqual(app.busy, [true, false]); assert.equal(app.surface.canClose(), true);
  assert.equal(app.doc.activeElement, app.trigger);
  assert.doesNotMatch(app.find('data-feedback').textContent, /已追加导入并保存/);
});
