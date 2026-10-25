import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom'), ts = require('typescript');
const html = readFileSync(new URL('../desktop/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../desktop/src/project-backup.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness({ invoke: custom, choose = async () => 'C:/new-source', refresh: customRefresh = async () => {} } = {}) {
  const dom = new JSDOM(html), document = dom.window.document, calls = [];
  let project = { id: 'p1', name: '原项目' }, busy = false, refreshes = 0, archives = 0, requestSequence = 0;
  const node = id => document.getElementById(id);
  node('desktop-projects').open = true;
  const invoke = async (command, args) => {
    calls.push([command, args]);
    if (custom) { const result = await custom(command, args); if (result !== undefined) return result; }
    if (command === 'project_storage_status') return { projects: 1, runs: 4, confirmations: 2, artifactBytes: 1024, projectLimit: 200, runLimit: 10000, confirmationLimit: 10000, artifactByteLimit: 67108864, warning: false, blocked: false };
    if (command === 'project_import_preview') return { projectName: '历史项目', sourceProjectId: 'old', runs: 4, artifacts: 3, memoryEntries: 1, warnings: ['不会恢复执行权限'] };
    if (command === 'project_import') return { projectId: 'restored', alreadyImported: false, idMap: {} };
    if (command === 'project_archive_prepare') return { token: 'bound-token', backupJson: '{}', projectName: project.name, runs: 4, artifacts: 3, expiresAt: Date.now() + 10000 };
  };
  const context = vm.createContext({ document, invoke, open: choose, crypto: { randomUUID: () => `unique-request-${++requestSequence}` }, TextEncoder: globalThis.TextEncoder, Error });
  vm.runInContext(`${script}\nglobalThis.mount = mountProjectBackup;`, context);
  const app = context.mount({ getProject: () => project, isBusy: () => busy, operation: async action => { if (busy) return false; busy = true; app.sync(); try { await action(); return true; } finally { busy = false; app.sync(); } }, refresh: async () => { refreshes++; await customRefresh(); }, archive: async (id, token) => { calls.push(['archive', { id, token }]); archives++; return { backupPath: 'C:/app/archives/p1.json' }; } });
  const settle = async () => { await setImmediate(); await setImmediate(); };
  const fire = async (id, event = 'click') => { node(id).dispatchEvent(new dom.window.Event(event, { bubbles: true })); await settle(); };
  const selectFile = async (text = async () => '{"backup":true}', size = 20) => { Object.defineProperty(node('project-import-file'), 'files', { configurable: true, value: [{ name: 'backup.json', size, text }] }); await fire('project-import-file', 'change'); };
  return { app, calls, node, fire, selectFile, settle, get refreshes() { return refreshes; }, get archives() { return archives; }, setProject(value) { project = value; app.sync(); }, setBusy(value) { busy = value; app.sync(); }, close() { node('desktop-projects').open = false; node('desktop-projects').dispatchEvent(new dom.window.Event('close')); } };
}

test('project import previews before explicit directory selection and never switches or writes implicitly', async () => {
  const h = harness(); await h.app.refreshStorage(); await h.selectFile();
  assert.match(h.node('project-import-summary').textContent, /历史项目.*4.*3/s);
  assert.equal(h.node('project-import-confirm').disabled, true);
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_import'), false);
  await h.fire('project-import-directory'); await h.fire('project-import-confirm');
  const [command, args] = h.calls.find(([cmd]) => cmd === 'project_import');
  assert.equal(command, 'project_import'); assert.equal(args.directory, 'C:/new-source'); assert.equal(args.requestId, 'unique-request-2');
  assert.equal(h.refreshes, 1); assert.match(h.node('project-backup-status').textContent, /未切换当前会话/);
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_select'), false);
});

test('manual source path uses a new confirmation id and is locked during a pending restore', async () => {
  const pending = deferred(); const h = harness({ invoke: cmd => cmd === 'project_import' ? pending.promise : undefined });
  await h.selectFile(); h.node('project-import-path').value = ' C:/pasted-source '; await h.fire('project-import-path', 'input');
  assert.equal(h.node('project-import-confirm').disabled, false);
  await h.fire('project-import-confirm');
  const args = h.calls.find(([cmd]) => cmd === 'project_import')[1];
  assert.equal(args.directory, 'C:/pasted-source'); assert.equal(args.requestId, 'unique-request-2');
  assert.equal(h.node('project-import-path').disabled, true);
  pending.resolve({ projectId: 'restored', alreadyImported: false }); await h.settle();
});

test('capacity summary explains the stage-record quota as well as project, run and artifact limits', async () => {
  const h = harness(); await h.app.refreshStorage();
  assert.match(h.node('project-storage-status').textContent, /阶段记录 2\/10000/);
});

test('import failure retains preview and request id for retry without overwriting current data', async () => {
  let failure = true;
  const h = harness({ invoke: (cmd) => { if (cmd === 'project_import' && failure) throw Error('磁盘已满'); } });
  await h.selectFile(); await h.fire('project-import-directory'); await h.fire('project-import-confirm');
  assert.match(h.node('project-backup-status').textContent, /磁盘已满/); assert.equal(h.node('project-import-review').hidden, false);
  failure = false; await h.fire('project-import-confirm');
  const requests = h.calls.filter(([cmd]) => cmd === 'project_import');
  assert.equal(requests.length, 2); assert.equal(requests[0][1].requestId, requests[1][1].requestId);
});

test('closing dialog invalidates slow file reads and keeps them from previewing or importing', async () => {
  const waiting = deferred(), h = harness(); await h.selectFile(() => waiting.promise); h.close(); waiting.resolve('{}'); await h.settle();
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_import_preview'), false);
  assert.equal(h.node('project-import-review').hidden, true);
});

test('archive requires explicit second confirmation and snapshot stays tied to selected project', async () => {
  const h = harness(); await h.fire('project-archive');
  assert.equal(h.archives, 0); assert.match(h.node('project-archive-summary').textContent, /原项目.*4.*3/s);
  h.setProject({ id: 'other', name: '另一个项目' }); await h.fire('project-archive-confirm'); assert.equal(h.archives, 0);
  await h.fire('project-archive'); await h.fire('project-archive-confirm');
  assert.equal(h.archives, 1); assert.equal(h.calls.at(-1)?.[0] === 'project_select', false);
  assert.match(h.node('project-backup-status').textContent, /C:\/app\/archives\/p1.json/);
});

test('running task disables import/archive and duplicate confirmation cannot start another import', async () => {
  const waiting = deferred(); const h = harness({ invoke: cmd => cmd === 'project_import' ? waiting.promise : undefined });
  h.setBusy(true); await h.fire('project-archive'); assert.equal(h.calls.some(([cmd]) => cmd === 'project_archive_prepare'), false);
  h.setBusy(false); await h.selectFile(); await h.fire('project-import-directory'); await h.fire('project-import-confirm'); await h.fire('project-import-confirm');
  assert.equal(h.calls.filter(([cmd]) => cmd === 'project_import').length, 1);
  waiting.resolve({ projectId: 'restored', alreadyImported: false }); await h.settle();
});

test('capacity failures are visible and invalid files cannot erase an existing preview', async () => {
  const h = harness({ invoke: cmd => { if (cmd === 'project_storage_status') throw Error('暂时不可读取'); } });
  await h.app.refreshStorage(); assert.match(h.node('project-storage-status').textContent, /暂时不可读取/);
  await h.selectFile(); const first = h.node('project-import-summary').textContent;
  await h.selectFile(async () => '{}', 128 * 1024 * 1024 + 1);
  assert.equal(h.node('project-import-summary').textContent, first); assert.match(h.node('project-backup-status').textContent, /过大|超过/);
});

test('committed archive remains explicitly successful when subsequent session/registry refresh fails', async () => {
  const h = harness({ refresh: async () => { throw Error('session conflict'); } });
  await h.fire('project-archive'); await h.fire('project-archive-confirm');
  assert.equal(h.archives, 1);
  assert.match(h.node('project-backup-status').textContent, /项目已归档.*恢复文件.*刷新失败/s);
  assert.equal(h.node('project-archive-review').hidden, true);
  await h.fire('project-archive-confirm'); assert.equal(h.archives, 1);
});
