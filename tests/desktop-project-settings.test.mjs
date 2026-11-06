import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom'), ts = require('typescript');
const html = readFileSync(new URL('../desktop/index.html', import.meta.url), 'utf8');
const compile = file => ts.transpileModule(readFileSync(new URL(`../desktop/src/${file}.ts`, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const source = `${compile('project-backup')}\n${compile('projects')}`;
const project = (id, revision = 1) => ({ id, name: id, directory: `C:/projects/${id}`, subject: 'personal', revision, directoryAvailable: true });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness({ invoke: handle, canChangeProject = () => true } = {}) {
  const dom = new JSDOM(html), document = dom.window.document, calls = [];
  let projects = [project('a'), project('b')], activeProjectId = 'a', dataRequests = 0;
  const node = id => document.getElementById(id);
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const invoke = async (command, args) => {
    calls.push([command, args]);
    if (handle) { const value = await handle(command, args); if (value !== undefined) return value; }
    if (command === 'project_snapshot') return JSON.parse(JSON.stringify({ projects, activeProjectId, runs: [], artifacts: [] }));
    if (command === 'project_select') { activeProjectId = args.projectId; return; }
    if (command === 'project_save') {
      const previous = projects.find(p => p.id === args.project.id);
      if (previous && args.project.expectedRevision !== previous.revision) throw Error('项目已在其他窗口更新，请重新加载。');
      const value = { ...previous, ...args.project, revision: (previous?.revision ?? 0) + 1 };
      projects = [...projects.filter(p => p.id !== value.id), value]; return value;
    }
    if (command === 'project_storage_status') return { projects: 2, runs: 0, confirmations: 0, artifactBytes: 0, projectLimit: 200, runLimit: 10000, confirmationLimit: 10000, artifactByteLimit: 67108864 };
    if (command === 'project_import_preview') return { projectName: '恢复项目', sourceProjectId: 'old', runs: 1, artifacts: 1, memoryEntries: 0, warnings: [] };
    if (command === 'project_import') return { projectId: 'restored', alreadyImported: false };
  };
  const context = vm.createContext({ document, invoke, open: async () => 'C:/relocated', crypto: { randomUUID: () => 'new-project' }, TextEncoder: globalThis.TextEncoder, setTimeout, clearTimeout, URL, Blob: globalThis.Blob });
  vm.runInContext(`${source}\nglobalThis.mount = mountProjects`, context);
  const app = context.mount({ beforeSelect: async () => true, onRegistry() {}, onChange() {}, onArtifact() {}, isBusy: () => false, associateSession: async () => true, canChangeProject, onOpenData: () => { dataRequests++; } });
  document.body.append(app.settings.element, app.backupSettings.element);
  const settle = async () => { await setImmediate(); await setImmediate(); };
  const fire = async (id, event = 'click') => { node(id).dispatchEvent(new dom.window.Event(event, { bubbles: true, cancelable: true })); await settle(); };
  return { app, calls, node, fire, settle, document, get dataRequests() { return dataRequests; }, update(value) { projects = projects.map(p => p.id === value.id ? value : p); }, async selectFile() { Object.defineProperty(node('project-import-file'), 'files', { configurable: true, value: [{ size: 2, text: async () => '{}' }] }); await fire('project-import-file', 'change'); } };
}

test('embedded project controls use the existing form, picker and controller and return to legacy manager', async () => {
  const h = harness(); await h.app.ready;
  const form = h.node('project-form'); h.app.settings.open();
  assert.equal(h.node('desktop-projects').open, false);
  assert.equal(h.app.settings.element.contains(form), true);
  assert.deepEqual([...h.node('project-settings-select').options].map(option => option.value), ['', 'a', 'b']);
  h.node('project-settings-select').value = 'b'; await h.fire('project-settings-select', 'change');
  assert.equal(h.app.getActiveId(), 'b'); assert.equal(h.node('desktop-project-select').value, 'b');
  assert.equal(h.node('project-name').value, 'b'); assert.equal(h.node('project-backup').hidden, true);
  await h.fire('project-open-data'); assert.equal(h.dataRequests, 1);
  h.app.settings.close(); assert.equal(h.node('desktop-projects').contains(form), true);
  h.app.openManager(); assert.equal(h.node('desktop-projects').open, true); assert.equal(h.node('project-form'), form);
  h.app.destroy();
});

test('unsaved project edits block navigation and project changes until explicit save or discard', async () => {
  const h = harness(); await h.app.ready; h.app.settings.open();
  h.node('project-name').value = '新名称'; await h.fire('project-name', 'input');
  assert.equal(h.app.settings.canClose(), false); h.app.settings.close();
  assert.equal(h.app.settings.element.contains(h.node('project-form')), true);
  h.node('project-settings-select').value = 'b'; await h.fire('project-settings-select', 'change');
  assert.equal(h.app.getActiveId(), 'a'); assert.equal(h.node('project-settings-select').value, 'a');
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_select'), false);
  await h.fire('project-choose-directory'); assert.equal(h.node('project-directory').value, 'C:/relocated');
  await h.fire('project-form', 'submit');
  assert.equal(h.app.settings.canClose(), true); assert.equal(h.app.getActive().name, '新名称'); assert.equal(h.app.getActive().directory, 'C:/relocated');
  h.node('project-name').value = '丢弃'; await h.fire('project-name', 'input'); await h.fire('project-discard');
  assert.equal(h.node('project-name').value, '新名称'); assert.equal(h.app.settings.canClose(), true);
  h.app.destroy();
});

test('pending project save cannot close the settings panel and completion updates the shared selector', async () => {
  const pending = deferred(); const h = harness({ invoke: cmd => cmd === 'project_save' ? pending.promise : undefined });
  await h.app.ready; h.app.settings.open(); h.node('project-name').value = '保存中'; await h.fire('project-form', 'submit');
  assert.equal(h.app.settings.canClose(), false); h.app.settings.close();
  assert.equal(h.app.settings.element.contains(h.node('project-form')), true); assert.equal(h.node('project-discard').disabled, true);
  pending.resolve({ ...project('a', 2), name: '保存中' }); await h.settle();
  assert.equal(h.app.settings.canClose(), true); assert.match(h.node('desktop-project-select').textContent, /保存中/);
  h.app.destroy();
});

test('refresh preserves a conflicting draft and original revision until explicit discard adopts the latest data', async () => {
  const h = harness(); await h.app.ready; h.app.settings.open();
  h.node('project-name').value = '本地草稿'; h.update({ ...project('a', 2), name: '外部名称' }); await h.app.refresh();
  assert.equal(h.node('project-name').value, '本地草稿'); await h.fire('project-form', 'submit');
  assert.equal(h.calls.find(([cmd]) => cmd === 'project_save')[1].project.expectedRevision, 1);
  assert.match(h.node('project-status').textContent, /重新加载/); assert.equal(h.app.settings.canClose(), false);
  await h.fire('project-retry'); assert.equal(h.node('project-name').value, '本地草稿');
  await h.fire('project-discard'); assert.equal(h.node('project-name').value, '外部名称');
  h.node('project-name').value = '已解决'; await h.fire('project-form', 'submit');
  assert.equal(h.calls.filter(([cmd]) => cmd === 'project_save').at(-1)[1].project.expectedRevision, 2);
  assert.equal(h.app.settings.canClose(), true); h.app.destroy();
});

test('data settings reuse the real project backup controller without opening its legacy dialog', async () => {
  const pending = deferred(); const h = harness({ invoke: cmd => cmd === 'project_import' ? pending.promise : undefined });
  await h.app.ready; const backup = h.node('project-backup'); h.app.backupSettings.open(); await h.settle();
  assert.equal(h.node('desktop-projects').open, false); assert.equal(h.app.backupSettings.element.contains(backup), true);
  assert.equal(backup.contains(h.node('project-export')), true); assert.match(h.node('project-backup-project').textContent, /a/);
  assert.equal(backup.firstElementChild.querySelector('h3')?.id, 'project-backup-title');
  assert.equal(backup.firstElementChild.nextElementSibling.id, 'project-backup-project');
  assert.equal(h.node('project-export').closest('.settings-row').querySelector('strong').textContent, '导出项目备份');
  assert.equal(h.node('project-import').closest('.settings-row').querySelector('strong').textContent, '恢复项目备份');
  assert.equal(h.node('project-storage-refresh').closest('.settings-row').contains(h.node('project-storage-status')), true);
  assert.equal(h.node('project-archive').closest('.settings-row').querySelector('strong').textContent, '归档当前项目');
  assert.equal(h.node('project-import-review').previousElementSibling.contains(h.node('project-import')), true);
  assert.equal(h.node('project-archive-review').previousElementSibling.contains(h.node('project-archive')), true);
  await h.selectFile(); assert.equal(h.node('project-import-review').hidden, false);
  await h.fire('project-import-directory'); await h.fire('project-import-confirm');
  assert.equal(h.calls.filter(([cmd]) => cmd === 'project_import').length, 1);
  assert.equal(h.app.backupSettings.canClose(), false); h.app.backupSettings.close();
  assert.equal(h.app.backupSettings.element.contains(backup), true);
  pending.resolve({ projectId: 'restored', alreadyImported: false }); await h.settle();
  assert.equal(h.app.backupSettings.canClose(), true); h.app.backupSettings.close();
  assert.equal(h.node('desktop-projects').contains(backup), true);
  h.app.settings.open(); assert.equal(h.app.settings.element.contains(h.node('project-form')), true); h.app.destroy();
});

test('project switching consults the maintenance guard before native selection', async () => {
  const h = harness({ canChangeProject: () => false }); await h.app.ready; h.app.settings.open();
  h.node('project-settings-select').value = 'b'; await h.fire('project-settings-select', 'change');
  await h.fire('project-new'); h.node('project-association-target').value = 'b'; await h.fire('project-associate');
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_select'), false);
  assert.equal(h.node('project-name').value, 'a'); h.app.destroy();
});

test('results reuse the existing history outside settings and preserve configuration drafts', async () => {
  const h = harness(); await h.app.ready;
  const history = h.node('project-history');
  h.app.settings.open(); assert.equal(history.closest('div').hidden, true);
  h.node('project-name').value = '未保存'; await h.fire('project-name', 'input');
  assert.equal(h.app.results.open(), false); assert.equal(h.app.settings.canClose(), false);
  await h.fire('project-discard'); h.app.settings.close();
  assert.equal(h.app.results.open(), true); assert.equal(h.app.results.element.contains(history), true);
  h.app.results.close(); h.app.openManager();
  assert.equal(h.node('desktop-projects').contains(history), true);
  h.app.destroy();
});

test('opening settings during initial project loading still mounts the disabled controls', async () => {
  const pending = deferred(); const h = harness({ invoke: cmd => cmd === 'project_snapshot' ? pending.promise : undefined });
  h.app.settings.open(); assert.equal(h.app.settings.element.contains(h.node('project-form')), true);
  assert.equal(h.node('project-settings-select').disabled, true);
  pending.resolve({ projects: [project('a')], activeProjectId: 'a', runs: [], artifacts: [] }); await h.app.ready;
  assert.equal(h.node('project-settings-select').disabled, false); assert.equal(h.node('project-name').value, 'a');
  h.app.destroy();
});

test('legacy manager can reopen a retained draft after an external close', async () => {
  const h = harness(); await h.app.ready; h.app.openManager(); h.node('project-name').value = '保留草稿';
  h.node('desktop-projects').close(); h.app.openManager();
  assert.equal(h.node('desktop-projects').open, true); assert.equal(h.node('project-name').value, '保留草稿');
  h.app.destroy();
});

test('project export failures remain visible inside the data settings page', async () => {
  const h = harness({ invoke: cmd => { if (cmd === 'project_export') throw Error('无法读取项目数据'); } });
  await h.app.ready; h.app.backupSettings.open(); await h.fire('project-export');
  assert.match(h.node('project-backup-status').textContent, /无法读取项目数据/);
  assert.equal(h.app.backupSettings.canClose(), true); h.app.destroy();
});
