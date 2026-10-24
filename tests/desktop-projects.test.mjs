import { Blob } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../desktop/src/projects.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const project = (id, extra = {}) => ({ id, name: id, directory: `C:/projects/${id}`, subject: 'personal', revision: 1, directoryAvailable: true, ...extra });
function harness({ projects = [project('a'), project('b')], activeProjectId = 'a', runs = [], artifacts = [], invoke: custom, beforeSelect = async () => true, associateSession = async () => true } = {}) {
  const doc = createPreviewDocument();
  const createElement = doc.createElement.bind(doc);
  doc.createElement = tag => Object.assign(createElement(tag), { events: {}, addEventListener(type, fn) { (this.events[type] ??= []).push(fn); } });
  const nodes = new Map(), calls = [], changes = [], shown = [], reveals = [], registry = [], pending = [], snapshots = [];
  const node = id => {
    if (!nodes.has(id)) {
      const element = doc.createElement('div'); Object.assign(element, { value: '', disabled: false, open: false, isConnected: true, events: {},
        addEventListener(type, fn) { (this.events[type] ??= []).push(fn); }, removeEventListener() {},
        focus() { doc.activeElement = this; }, showModal() { this.open = true; }, close() { this.open = false; this.events.close?.forEach(fn => fn({})); },
        contains: other => other === element, reportValidity: () => true, querySelectorAll() { return this.children.flatMap(child => child.children ?? []).filter(child => child.tag === 'button'); },
      }); nodes.set(id, element);
    } return nodes.get(id);
  };
  doc.querySelector = selector => node(selector.slice(1)); doc.body = doc.createElement('body');
  let current = activeProjectId;
  const invoke = async (cmd, args) => {
    calls.push([cmd, args]);
    if (custom) { const result = await custom(cmd, args); if (result !== undefined) return result; }
    if (cmd === 'project_snapshot') return JSON.parse(JSON.stringify({ projects, activeProjectId: current, runs, artifacts }));
    if (cmd === 'project_select') { current = args.projectId; return null; }
    if (cmd === 'project_artifact') return { ...artifacts.find(a => a.id === args.artifactId), markdown: 'saved source' };
  };
  const context = { document: doc, invoke, open: async () => 'C:/chosen', crypto: { randomUUID: () => 'new-project' }, setTimeout, clearTimeout, URL, Blob };
  vm.createContext(context); vm.runInContext(`${script}\nglobalThis.mount = mountProjects;`, context);
  const controller = context.mount({ beforeSelect, onRegistry: ids => registry.push(ids), onChange: p => changes.push(p), onSnapshot: value => snapshots.push(value), onArtifact: (a, reveal) => { shown.push(a); reveals.push({ reveal, dialogOpen: node('desktop-projects').open }); if (reveal) node('report').focus(); }, isBusy: () => false, onPending: v => pending.push(v), associateSession });
  return { controller, calls, changes, shown, reveals, registry, pending, snapshots, node, doc, async fire(id, type = 'click') { for (const fn of node(id).events[type] ?? []) fn({ preventDefault() {} }); for (let i = 0; i < 20; i++) await Promise.resolve(); } };
}

test('project snapshot notifies on rules-only refresh; failure is visible without discarding saved content', async () => {
  let rulesVersion = 'one', failed = false;
  const app = harness({ invoke: cmd => {
    if (cmd === 'project_snapshot') {
      if (failed) throw new Error('Storage read failed');
      return { projects: [project('a')], activeProjectId: 'a', runs: [], artifacts: [], rulesVersion };
    }
  } });
  await app.controller.ready; const changes = app.changes.length, notifications = app.snapshots.length;
  rulesVersion = 'two'; assert.equal(await app.controller.refresh(), true);
  assert.equal(app.changes.length, changes); assert.equal(app.snapshots.length, notifications + 1);
  assert.equal(app.controller.getSnapshot().rulesVersion, 'two');
  failed = true; assert.equal(await app.controller.refresh(), false);
  assert.equal(app.controller.getSnapshot().rulesVersion, 'two'); assert.match(app.node('project-status').textContent, /Storage read failed/);
});

test('background results refresh history without replacing an open project draft or its save revision', async () => {
  const runs = [], artifacts = [];
  const app = harness({ runs, artifacts, invoke: (cmd, args) => cmd === 'project_save' ? project(args.project.id, { ...args.project, revision: 2 }) : undefined });
  await app.controller.ready; app.controller.openManager();
  app.node('project-name').value = 'Unsaved name'; app.node('project-directory').value = 'C:/relocated'; app.node('project-subject').value = 'enterprise';
  const notifications = app.snapshots.length;
  runs.push({ id: 'background', projectId: 'a', kind: 'check', state: 'succeeded', startedAt: 200 });
  artifacts.push({ id: 'report', runId: 'background', projectId: 'a', kind: 'check', createdAt: 200, rulesVersion: '{}' });
  assert.equal(await app.controller.refresh(), true);
  assert.equal(app.node('project-name').value, 'Unsaved name'); assert.equal(app.node('project-directory').value, 'C:/relocated'); assert.equal(app.node('project-subject').value, 'enterprise');
  assert.match(app.node('project-history').textContent, /已完成/); assert.equal(app.snapshots.length, notifications + 1);
  assert.equal(app.controller.getSnapshot().artifacts.length, 1); assert.equal(app.shown.length, 0, 'background results must not replay a report');
  await app.fire('project-form', 'submit');
  const saved = app.calls.find(([cmd]) => cmd === 'project_save')[1].project;
  assert.deepEqual({ ...saved }, { id: 'a', name: 'Unsaved name', directory: 'C:/relocated', subject: 'enterprise', expectedRevision: 1 });
  assert.equal(app.node('project-name').value, 'Unsaved name'); assert.match(app.node('project-status').textContent, /已保存/);
});

test('background refresh retains both an empty new project editor and its later draft', async () => {
  const app = harness({ invoke: (cmd, args) => cmd === 'project_save' ? project(args.project.id, args.project) : undefined });
  await app.controller.ready; app.controller.openManager(); await app.fire('project-new');
  await app.controller.refresh();
  assert.equal(app.node('project-name').value, ''); assert.equal(app.node('project-directory').value, ''); assert.equal(app.node('project-editor-title').textContent, '新建项目');
  app.node('project-name').value = 'New project'; await app.fire('project-choose-directory');
  await app.controller.refresh(); await app.fire('project-form', 'submit');
  const saved = app.calls.find(([cmd]) => cmd === 'project_save')[1].project;
  assert.deepEqual({ ...saved }, { id: 'new-project', name: 'New project', directory: 'C:/chosen', subject: 'personal' });
  assert.equal(app.controller.getActiveId(), 'new-project'); assert.equal(app.node('project-editor-title').textContent, '项目设置');
});

test('snapshot retry preserves a relocation draft while directory availability and history still update', async () => {
  let failed = false; const projects = [project('a')];
  const app = harness({ projects, invoke: cmd => { if (cmd === 'project_snapshot' && failed) throw Error('read unavailable'); } });
  await app.controller.ready; app.controller.openManager(); app.node('project-directory').value = 'C:/replacement';
  failed = true; assert.equal(await app.controller.refresh(), false);
  assert.equal(app.node('project-directory').value, 'C:/replacement');
  failed = false; projects[0] = project('a', { directoryAvailable: false }); await app.fire('project-retry');
  assert.equal(app.node('project-directory').value, 'C:/replacement'); assert.match(app.node('project-directory-note').textContent, /新的位置/);
  assert.equal(app.changes.at(-1).directoryAvailable, false); assert.equal(app.node('project-status').textContent, '');
});

test('explicit project selection replaces a preserved draft and a failed selection retains it', async () => {
  let allow = false; const app = harness({ beforeSelect: async id => id !== 'b' || allow });
  await app.controller.ready; app.controller.openManager(); app.node('project-name').value = 'Draft a';
  await app.controller.refresh(); app.node('desktop-project-select').value = 'b'; await app.fire('desktop-project-select', 'change');
  assert.equal(app.node('project-name').value, 'Draft a'); assert.equal(app.controller.getActiveId(), 'a');
  allow = true; app.node('desktop-project-select').value = 'b'; await app.fire('desktop-project-select', 'change');
  assert.equal(app.node('project-name').value, 'b'); assert.equal(app.node('project-directory').value, 'C:/projects/b');
});

test('project saved report entry rejects another project before native lookup', async () => {
  const app = harness({ artifacts: [{ id: 'own', projectId: 'a', createdAt: 1 }, { id: 'foreign', projectId: 'b', createdAt: 2 }] });
  await app.controller.ready; const queries = () => app.calls.filter(([cmd]) => cmd === 'project_artifact').length;
  const before = queries(); assert.equal(await app.controller.openArtifact('foreign'), false); assert.equal(queries(), before);
  assert.equal(await app.controller.openArtifact('own'), true); assert.equal(app.shown.at(-1).id, 'own');
});
test('project startup restores scope and latest report, refresh does not replay unchanged report', async () => {
  const app = harness({ artifacts: [{ id: 'old', projectId: 'a', createdAt: 10 }, { id: 'new', projectId: 'a', createdAt: 20 }, { id: 'other', projectId: 'b', createdAt: 30 }] });
  await app.controller.ready;
  assert.equal(app.controller.isReady(), true); assert.equal(app.controller.getActiveId(), 'a');
  assert.equal(app.shown[0].id, 'new'); assert.equal(app.registry[0].join(','), 'a,b');
  await app.controller.refresh(); assert.equal(app.shown.length, 1); assert.equal(app.changes.length, 1);
  assert.deepEqual(app.pending, [true, false, true, false]);
});
test('failed conversation switch rolls native selection back without changing visible project', async () => {
  const app = harness({ beforeSelect: async id => id !== 'b' }); await app.controller.ready;
  app.node('desktop-project-select').value = 'b'; await app.fire('desktop-project-select', 'change');
  assert.equal(app.controller.getActiveId(), 'a'); assert.equal(app.node('desktop-project-select').value, 'a');
  assert.deepEqual(app.calls.filter(c => c[0] === 'project_select').map(c => c[1].projectId), ['b', 'a']);
  assert.match(app.node('project-status').textContent, /尚未保存/);
});
test('failed rollback disables actions until snapshot recovery', async () => {
  const app = harness({ beforeSelect: async id => id !== 'b', invoke: async (cmd, args) => { if (cmd === 'project_select' && args.projectId === 'a') throw Error('rollback unavailable'); } }); await app.controller.ready;
  app.node('desktop-project-select').value = 'b'; await app.fire('desktop-project-select', 'change');
  assert.equal(app.controller.isReady(), false); assert.equal(app.node('project-save').disabled, true); assert.match(app.node('project-status').textContent, /回退失败/);
});
test('snapshot errors preserve UI and can be retried without overwriting storage', async () => {
  let failed = true; const app = harness({ invoke: async cmd => { if (cmd === 'project_snapshot' && failed) throw Error('database corrupt'); } });
  await app.controller.ready; assert.equal(app.controller.isReady(), false); assert.match(app.node('desktop-project-status').textContent, /database corrupt/);
  failed = false; await app.controller.refresh(); assert.equal(app.controller.isReady(), true);
  assert.equal(app.calls.some(c => c[0] === 'project_save'), false);
});
test('project history filters scope, reports interrupted state and renders hostile data as text', async () => {
  const app = harness({ projects: [project('a', { name: '<img onerror=x>', directoryAvailable: false })], runs: [{ id: 'r1', projectId: 'a', kind: 'check', state: 'interrupted', startedAt: 100, error: '<script>x</script>' }, { id: 'r2', projectId: 'b', kind: 'guide', state: 'succeeded', startedAt: 200 }] });
  await app.controller.ready; assert.match(app.node('project-history').textContent, /意外中断/); assert.match(app.node('project-history').textContent, /<script>x<\/script>/);
  assert.equal(app.node('project-history').children.length, 1); assert.match(app.node('project-directory-note').textContent, /新的位置/);
});
test('external busy prevents project switching and edits; dialog Escape close restores opener', async () => {
  const app = harness(); await app.controller.ready; app.controller.setBusy(true);
  app.node('desktop-project-select').value = 'b'; await app.fire('desktop-project-select', 'change');
  assert.equal(app.calls.some(c => c[0] === 'project_select'), false); assert.equal(await app.controller.saveSubject('enterprise'), false);
  app.controller.setBusy(false); await app.controller.pickFolder(); assert.equal(app.node('desktop-projects').open, true);
  app.node('desktop-projects').close(); assert.equal(app.node('desktop-projects').open, false);
  app.controller.destroy(); assert.equal(app.controller.isReady(), false);
});

test('association selects native target first and restores it if saving the original session fails', async () => {
  const events = [];
  const app = harness({ invoke: async (cmd, args) => { if (cmd === 'project_select') events.push(`native:${args.projectId}`); }, associateSession: async id => { events.push(`associate:${id}`); return false; } });
  await app.controller.ready; app.node('project-association-target').value = 'b'; await app.fire('project-associate');
  assert.deepEqual(events, ['native:b', 'associate:b', 'native:a']); assert.equal(app.controller.getActiveId(), 'a');
});
test('saved new project remains available when its conversation switch fails', async () => {
  const app = harness({ beforeSelect: async id => id !== 'new-project', invoke: async cmd => cmd === 'project_save' ? project('new-project') : undefined });
  await app.controller.ready; await app.fire('project-new'); app.node('project-name').value = 'New'; app.node('project-directory').value = 'C:/new';
  await app.fire('project-form', 'submit');
  assert.equal(app.controller.getActiveId(), 'a'); assert.equal(app.node('desktop-project-select').children.some(node => node.value === 'new-project'), true);
});

test('history opens report after closing project dialog while startup restoration stays unobtrusive', async () => {
  const app = harness({ runs: [{ id: 'r', projectId: 'a', kind: 'guide', state: 'succeeded', startedAt: 100 }], artifacts: [{ id: 'report', runId: 'r', projectId: 'a', createdAt: 100, rulesVersion: '{}' }] });
  await app.controller.ready; assert.equal(app.reveals[0].reveal, false);
  await app.controller.pickFolder();
  const button = app.node('project-history').children[0].children.find(node => node.tag === 'button');
  button.events.click[0](); for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(app.reveals[1].reveal, true); assert.equal(app.reveals[1].dialogOpen, false);
  app.node('desktop-projects').events.close[0](); assert.equal(app.doc.activeElement, app.node('report'), 'queued close event must not steal focus from report');
});
test('latest artifact loading failure remains retryable after snapshot restoration', async () => {
  let failed = true;
  const app = harness({ artifacts: [{ id: 'report', projectId: 'a', createdAt: 100 }], invoke: async cmd => { if (cmd === 'project_artifact' && failed) throw Error('artifact temporarily unavailable'); } });
  await app.controller.ready; assert.equal(app.shown.length, 0); assert.match(app.node('project-status').textContent, /temporarily unavailable/);
  failed = false; await app.controller.refresh(); assert.equal(app.shown.length, 1); assert.equal(app.shown[0].id, 'report');
  await app.controller.refresh(); assert.equal(app.shown.length, 1, 'normal refresh must not replay the saved artifact');
});

test('refresh invalidates available directory without requiring a project revision change', async () => {
  const projects = [project('a')]; const app = harness({ projects }); await app.controller.ready;
  projects[0] = project('a', { directoryAvailable: false }); await app.controller.refresh();
  assert.equal(app.changes.length, 2); assert.equal(app.changes[1].directoryAvailable, false);
  assert.match(app.node('project-directory-note').textContent, /新的位置/);
});


test('project comparison preserves server refusal and never labels missing findings repaired', async () => {
  const artifacts = [{id:'new',projectId:'a',kind:'check',createdAt:2},{id:'old',projectId:'a',kind:'check',createdAt:1}];
  const app = harness({artifacts,invoke:async cmd=>cmd==='project_compare'?{comparable:false,reason:'扫描范围不同',added:[],remaining:[],notDetected:[]}:undefined});
  await app.controller.ready;await app.fire('project-compare');assert.match(app.node('project-comparison').textContent,/无法比较：扫描范围不同/);
  assert.equal(app.calls.find(c=>c[0]==='project_compare')[1].beforeArtifactId,'old');
});
test('project comparison renders typed groups as text and clearly bounds not-detected meaning', async () => {
  const app=harness({artifacts:[{id:'old',projectId:'a',kind:'check',createdAt:1},{id:'new',projectId:'a',kind:'check',createdAt:2}],invoke:async cmd=>cmd==='project_compare'?{comparable:true,reason:'',added:[{ruleId:'x',title:'<img onerror=x>'}],remaining:[],notDetected:[]}:undefined});
  await app.controller.ready;await app.fire('project-compare');assert.match(app.node('project-comparison').textContent,/<img onerror=x>/);assert.match(app.node('project-comparison').textContent,/不代表问题已修复/);
});

test('equal-time reports keep native insertion order and distinct readable comparison labels', async () => {
  const artifacts = [{id:'new',projectId:'a',kind:'check',createdAt:5,title:'项目预检'},{id:'old',projectId:'a',kind:'check',createdAt:5,title:'项目预检'}];
  const app = harness({ artifacts }); await app.controller.ready;
  assert.equal(app.node('project-compare-before').value, 'old');
  assert.equal(app.node('project-compare-after').value, 'new');
  const choices = app.node('project-compare-after').children;
  assert.match(choices[0].textContent, /^报告 1/);
  assert.match(choices[1].textContent, /^报告 2/);
  assert.notEqual(choices[0].textContent, choices[1].textContent);
});
