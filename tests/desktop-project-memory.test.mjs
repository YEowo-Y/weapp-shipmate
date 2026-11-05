import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextEncoder } from 'node:util';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = requireDesktop('typescript');
const source = readFileSync(new URL('../desktop/src/project-memory.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const entry = { id: 'entry-a', title: '语言偏好', text: '请使用中文', enabled: false, source: 'user', createdAt: 1, updatedAt: 1 };
const snapshot = (entries = []) => ({ projectId: 'a', revision: 2, entries });

function harness(overrides = {}) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [], calls = [];
  document.createElement = tag => {
    const node = create(tag); node.listeners = {}; node.isConnected = true; node.classList = { add() {} };
    node.addEventListener = (type, listener) => { node.listeners[type] = listener; };
    node.focus = () => { document.activeElement = node; }; node.showModal = () => { node.open = true; };
    node.close = () => { node.open = false; node.listeners.close?.(); };
    node.replaceChildren = (...children) => { node.textContent = ''; node.append(...children); };
    nodes.push(node); return node;
  };
  document.body = document.createElement('body'); let projectId = 'a', busy = false, changes = 0;
  const handlers = {
    project_snapshot: async () => ({ projects: [{ id: 'a', name: '项目 A' }, { id: 'b', name: '项目 B' }] }),
    project_memory_snapshot: async ({ projectId }) => ({ ...snapshot(), projectId }),
    project_memory_save: async args => ({ projectId: args.projectId, revision: args.expectedRevision + 1, entries: [{ ...entry, ...args.entry }] }),
    project_memory_delete: async args => ({ projectId: args.projectId, revision: args.expectedRevision + 1, entries: [] }),
    ...overrides,
  };
  const context = vm.createContext({ document, TextEncoder, crypto: { randomUUID: () => 'entry-new' }, createIcon, invoke: async (name, args) => { calls.push({ name, args }); return handlers[name](args); }, createActionButton: (doc, label) => { const b = doc.createElement('wa-button'); b.textContent = label; return b; } });
  vm.runInContext(script, context);
  const app = context.mountProjectMemory({ getProjectId: () => projectId, isBusy: () => busy, onChange: () => { changes++; } });
  const node = id => nodes.findLast(item => item.id === id), anchor = document.createElement('button');
  return { app, node, anchor, calls, document, changes: () => changes, setProject(id) { projectId = id; app.selectChanged(); }, setBusy(value) { busy = value; }, click: id => node(id).listeners.click(), input(id, value) { node(id).value = value; node(id).listeners.input?.(); }, toggle(value) { node('memory-enabled').checked = value; node('memory-enabled').listeners.change?.(); } };
}

test('memory loads current scope and empty state without sending or writing; new entries default to disabled', async () => {
  const h = harness(); h.app.open(h.anchor); await setImmediate();
  assert.match(h.node('memory-scope').textContent, /项目 A/); assert.match(h.node('memory-list').textContent, /暂无/);
  assert.deepEqual(h.calls.map(call => call.name).sort(), ['project_memory_snapshot', 'project_snapshot']);
  h.click('memory-new'); assert.equal(h.node('memory-enabled').checked, false);
  assert.equal(h.node('memory-save').disabled, true); assert.equal(h.node('memory-editor').hidden, false);
});

test('memory searches saved names and content locally and clears an empty result without writes', async () => {
  const h = harness({ project_memory_snapshot: async () => snapshot([entry, { ...entry, id: 'entry-b', title: '发布约定', text: 'Use GitHub checks' }]) });
  h.app.open(); await setImmediate(); const calls = h.calls.length;
  h.input('memory-search', '  github ');
  assert.match(h.node('memory-list').textContent, /发布约定/);
  assert.doesNotMatch(h.node('memory-list').textContent, /语言偏好/);
  assert.equal(h.node('memory-count').textContent, '1 / 2 条匹配');
  h.input('memory-search', '语言'); assert.match(h.node('memory-list').textContent, /语言偏好/);
  h.input('memory-search', '无匹配'); assert.match(h.node('memory-list').textContent, /没有匹配/);
  assert.equal(h.node('memory-count').textContent, '0 / 2 条匹配');
  h.click('memory-search-clear');
  assert.equal(h.node('memory-search').value, ''); assert.equal(h.node('memory-search-clear').hidden, true);
  assert.equal(h.document.activeElement, h.node('memory-search'));
  assert.match(h.node('memory-list').textContent, /语言偏好/); assert.match(h.node('memory-list').textContent, /发布约定/);
  assert.equal(h.calls.length, calls);
});

test('filtered memory editing retains its query and unsaved draft through cancel confirmation', async () => {
  const h = harness({ project_memory_snapshot: async () => snapshot([entry]) }); h.app.open(); await setImmediate();
  h.input('memory-search', '中文'); h.click('memory-entry-entry-a'); h.input('memory-text', '未保存的新内容');
  h.click('memory-cancel-edit'); assert.equal(h.node('memory-prompt').hidden, false);
  h.click('memory-keep-editing'); assert.equal(h.node('memory-text').value, '未保存的新内容');
  assert.equal(h.node('memory-search').value, '中文');
  h.click('memory-cancel-edit'); h.click('memory-confirm');
  assert.equal(h.node('memory-editor').hidden, true); assert.equal(h.node('memory-count').textContent, '1 / 1 条匹配');
  h.setProject('b'); h.app.open(); await setImmediate();
  assert.equal(h.node('memory-search').value, '', 'a previous project search does not hide another project');
  assert.equal(h.calls.some(call => call.name === 'project_memory_save'), false);
});

test('memory writes explicit title/body/consent with revision and updates only after persisted success', async () => {
  let finish;
  const h = harness({ project_memory_save: args => new Promise(resolve => { finish = () => resolve({ ...snapshot([{ ...entry, ...args.entry }]), revision: 3 }); }) });
  h.app.open(h.anchor); await setImmediate(); h.click('memory-new'); h.input('memory-title', '发布习惯'); h.input('memory-text', '每次先检查变更');
  h.click('memory-save'); h.click('memory-save'); assert.equal(h.calls.filter(call => call.name === 'project_memory_save').length, 1); assert.equal(h.changes(), 0);
  const request = h.calls.find(call => call.name === 'project_memory_save').args;
  assert.equal(request.projectId, 'a'); assert.equal(request.expectedRevision, 2); assert.equal(request.entry.enabled, false);
  assert.equal(request.entry.text, '每次先检查变更'); assert.equal(request.entry.id, 'entry-new');
  finish(); await setImmediate(); assert.equal(h.changes(), 1); assert.equal(h.node('memory-editor').hidden, true);
  assert.match(h.node('memory-status').textContent, /已保存/); assert.match(h.node('memory-list').textContent, /发布习惯/);
});

test('memory validates UTF-8 bytes before invocation and does not count Chinese characters as one byte', async () => {
  const h = harness(); h.app.open(); await setImmediate(); h.click('memory-new'); h.input('memory-title', '偏好'); h.input('memory-text', '中'.repeat(1366));
  assert.equal(h.node('memory-save').disabled, true); h.click('memory-save'); assert.equal(h.calls.some(call => call.name === 'project_memory_save'), false);
  assert.match(h.node('memory-byte-count').textContent, /4,098|4098/);
  h.input('memory-text', '中'.repeat(1365)); assert.equal(h.node('memory-save').disabled, false);
});

test('memory edits persisted entries and keeps draft after conflict; refresh requires explicit discard', async () => {
  const h = harness({ project_memory_snapshot: async () => snapshot([entry]), project_memory_save: async () => { throw new Error('记忆已变化，请重新读取后再保存'); } });
  h.app.open(); await setImmediate(); h.click('memory-entry-entry-a'); h.input('memory-text', '保留我的未保存修改'); h.toggle(true); h.click('memory-save'); await setImmediate();
  assert.equal(h.node('memory-text').value, '保留我的未保存修改'); assert.equal(h.node('memory-enabled').checked, true);
  assert.match(h.node('memory-status').textContent, /已变化/); assert.equal(h.changes(), 0);
  h.click('memory-refresh'); assert.equal(h.calls.filter(call => call.name === 'project_memory_snapshot').length, 1); assert.equal(h.node('memory-prompt').hidden, false);
  h.click('memory-keep-editing'); assert.equal(h.node('memory-text').value, '保留我的未保存修改');
  h.click('memory-refresh'); h.click('memory-confirm'); await setImmediate(); assert.equal(h.calls.filter(call => call.name === 'project_memory_snapshot').length, 2);
});

test('memory deletion names concrete record and requires inline confirmation', async () => {
  const h = harness({ project_memory_snapshot: async () => snapshot([entry]) }); h.app.open(); await setImmediate(); h.click('memory-entry-entry-a'); h.click('memory-delete');
  assert.match(h.node('memory-prompt').textContent, /语言偏好/); assert.equal(h.calls.some(call => call.name === 'project_memory_delete'), false);
  h.click('memory-keep-editing'); assert.equal(h.calls.some(call => call.name === 'project_memory_delete'), false);
  h.click('memory-delete'); h.click('memory-confirm'); await setImmediate();
  const request = h.calls.find(call => call.name === 'project_memory_delete').args;
  assert.equal(request.entryId, entry.id); assert.equal(request.expectedRevision, 2); assert.equal(h.changes(), 1);
  assert.match(h.node('memory-list').textContent, /暂无/); assert.match(h.node('memory-status').textContent, /已删除/);
});

test('memory dirty close and Escape require discard; clean close restores opener focus', async () => {
  const h = harness(); h.app.open(h.anchor); await setImmediate(); h.click('memory-new'); h.input('memory-title', '未保存');
  let prevented = false; h.node('desktop-memory').listeners.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.node('desktop-memory').open, true); assert.equal(h.node('memory-prompt').hidden, false);
  h.click('memory-keep-editing'); h.click('memory-done'); h.click('memory-confirm');
  assert.equal(h.node('desktop-memory').open, false); assert.equal(h.document.activeElement, h.anchor);
});

test('memory ignores late loads after close/reopen and project switch', async () => {
  const pending = [];
  const h = harness({ project_memory_snapshot: ({ projectId }) => new Promise(resolve => { pending.push({ projectId, resolve }); }) });
  h.app.open(h.anchor); await setImmediate(); h.click('memory-dismiss'); h.setProject('b'); h.app.open(h.anchor); await setImmediate();
  pending[1].resolve({ projectId: 'b', revision: 1, entries: [] }); await setImmediate();
  pending[0].resolve(snapshot([entry])); await setImmediate();
  assert.match(h.node('memory-scope').textContent, /项目 B/); assert.doesNotMatch(h.node('memory-list').textContent, /语言偏好/);
  h.setProject('a'); assert.equal(h.node('desktop-memory').open, false);
});

test('memory load failure provides retry; missing project and app busy cannot mutate', async () => {
  let attempts = 0;
  const h = harness({ project_memory_snapshot: async () => { if (!attempts++) throw new Error('读取失败'); return snapshot(); } });
  h.app.open(); await setImmediate(); assert.match(h.node('memory-status').textContent, /读取失败/); assert.equal(h.node('memory-new').disabled, true);
  h.click('memory-refresh'); await setImmediate(); assert.equal(h.node('memory-new').disabled, false);
  h.setBusy(true); h.click('memory-new'); assert.equal(h.node('memory-editor').hidden, true);
  h.setBusy(false); h.setProject(null); h.app.open(); await setImmediate(); assert.equal(h.node('memory-new').disabled, true); assert.match(h.node('memory-status').textContent, /选择项目/);
});

test('memory project switches retain only an in-session draft and never rebase its original write version', async () => {
  let revision = 2;
  const h = harness({ project_memory_snapshot: async ({ projectId }) => ({ projectId, revision, entries: projectId === 'a' ? [entry] : [] }) });
  h.app.open(); await setImmediate(); h.click('memory-entry-entry-a'); h.input('memory-text', '项目 A 的草稿');
  h.setProject('a'); assert.equal(h.node('desktop-memory').open, true);
  h.setProject('b'); h.app.open(); await setImmediate(); assert.doesNotMatch(h.node('memory-list').textContent, /语言偏好/); assert.equal(h.node('memory-editor').hidden, true);
  revision = 5; h.setProject('a'); h.app.open(); await setImmediate();
  assert.equal(h.node('memory-text').value, '项目 A 的草稿'); assert.match(h.node('memory-status').textContent, /原始版本/);
  h.click('memory-save'); await setImmediate(); assert.equal(h.calls.find(call => call.name === 'project_memory_save').args.expectedRevision, 2);
});

test('memory cannot dismiss an in-flight write and a failed delete remains retryable', async () => {
  let reject;
  const h = harness({ project_memory_snapshot: async () => snapshot([entry]), project_memory_delete: () => new Promise((_, fail) => { reject = fail; }) });
  h.app.open(h.anchor); await setImmediate(); h.click('memory-entry-entry-a'); h.click('memory-delete'); h.click('memory-confirm');
  h.click('memory-dismiss'); assert.equal(h.node('desktop-memory').open, true); assert.equal(h.node('memory-dismiss').disabled, true);
  reject(new Error('本机存储暂不可用')); await setImmediate();
  assert.match(h.node('memory-status').textContent, /未能删除.*原条目仍保留/); assert.equal(h.node('memory-delete').disabled, false);
  assert.equal(h.node('memory-text').value, entry.text); assert.equal(h.changes(), 0);
});

test('memory refuses an unexpected project snapshot and renders hostile content as text only', async () => {
  const h = harness({ project_memory_snapshot: async () => ({ ...snapshot([entry]), projectId: 'b' }) }); h.app.open(); await setImmediate();
  assert.equal(h.node('memory-new').disabled, true); assert.doesNotMatch(h.node('memory-list').textContent, /语言偏好/);
  h.app.destroy(); assert.equal(h.document.body.children.length, 0);
  const safe = harness({ project_memory_snapshot: async () => snapshot([{ ...entry, title: '<img onerror=alert(1)>', text: '<script>alert(1)</script>' }]) });
  safe.app.open(); await setImmediate(); assert.match(safe.node('memory-list').textContent, /<img/); safe.click('memory-entry-entry-a'); assert.equal(safe.node('memory-text').value, '<script>alert(1)</script>');
});
