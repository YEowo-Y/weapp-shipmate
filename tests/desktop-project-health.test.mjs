import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = requireDesktop('typescript');
const source = readFileSync(new URL('../desktop/src/project-health.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const derive = vm.runInNewContext(`${script}\nderiveProjectHealth`, {});
const project = { id: 'a', name: '项目 A', directory: 'C:/project', directoryAvailable: true, subject: 'personal', revision: 5, contextRevision: 0 };
const report = { id: 'report-a', runId: 'run-a', projectId: 'a', kind: 'check', contextRevision: 0, rulesVersion: 'rules-1', toolVersion: 'test', createdAt: 1000 };
const run = { id: 'run-a', projectId: 'a', kind: 'check', state: 'succeeded', startedAt: 900, finishedAt: 1000 };
const snapshot = (extra = {}) => ({ projects: [{ ...project }], activeProjectId: 'a', rulesVersion: 'rules-1', artifacts: [{ ...report }], runs: [{ ...run }], ...extra });

test('health scopes attempts and saved checks to the active project, preserving native insertion order', () => {
  const value = derive(snapshot({ runs: [{ ...run, id: 'new', state: 'failed' }, run], artifacts: [{ ...report, projectId: 'b' }, { ...report, kind: 'guide' }, report] }));
  assert.equal(value.attempt.id, 'new'); assert.equal(value.report.id, 'report-a');
  assert.equal(value.label, '最近预检失败'); assert.equal(value.canCheck, true);
  assert.equal(derive(snapshot({ activeProjectId: null })).report, null);
  assert.equal(derive(snapshot({ activeProjectId: 'missing' })).project, null);
});
test('health never claims current files verified; rename is not a context change and revision zero is valid', () => {
  const value = derive(snapshot());
  assert.equal(value.label, '保存的预检记录'); assert.equal(value.reasons.length, 0);
  assert.match(value.description, /未检查当前文件/);
  assert.equal(derive(snapshot({ projects: [{ ...project, revision: 999 }] })).reasons.length, 0);
  assert.match(derive(snapshot({ projects: [{ ...project, contextRevision: 1 }] })).reasons.join(), /项目事实已变化/);
});
test('health distinguishes unknown basis and changed rules, directory missing, absent report and terminal attempt states', () => {
  assert.match(derive(null).label, /尚未就绪/); assert.equal(derive(null).canCheck, false);
  assert.match(derive(snapshot({ rulesVersion: null })).reasons.join(), /当前规则版本不可用/);
  assert.match(derive(snapshot({ rulesVersion: 'rules-2' })).reasons.join(), /规则资料已变化/);
  assert.match(derive(snapshot({ artifacts: [{ ...report, contextRevision: null }] })).reasons.join(), /无法核对/);
  const missing = derive(snapshot({ projects: [{ ...project, directoryAvailable: false }] }));
  assert.equal(missing.canCheck, false); assert.equal(missing.report.id, report.id); assert.match(missing.label, /目录不可用/);
  assert.equal(derive(snapshot({ runs: [], artifacts: [] })).label, '尚未预检');
  assert.match(derive(snapshot({ artifacts: [] })).description, /未找到.*报告/);
  for (const state of ['canceled', 'interrupted', 'running']) {
    const value = derive(snapshot({ runs: [{ ...run, state }] }));
    assert.equal(value.report.id, report.id); assert.notEqual(value.label, '保存的预检记录');
    if (state === 'running') assert.equal(value.canCheck, false);
  }
});

function harness({ load = async () => true, openReport = async () => true, withMaintenance = false, onHistory, onManage = () => {} } = {}) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [];
  document.createElement = tag => {
    const node = create(tag); node.listeners = {}; node.isConnected = true; node.classList = { add() {} };
    node.addEventListener = (type, listener) => { node.listeners[type] = listener; };
    node.focus = () => { document.activeElement = node; }; node.showModal = () => { node.open = true; };
    node.close = () => { node.open = false; node.listeners.close?.(); };
    node.replaceChildren = (...children) => { node.textContent = ''; node.append(...children); };
    nodes.push(node); return node;
  };
  document.body = document.createElement('body'); let current = snapshot(), busy = false, checks = 0, reports = [];
  const context = vm.createContext({ document, createIcon, createActionButton: (doc, label) => { const b = doc.createElement('wa-button'); b.textContent = label; return b; } });
  vm.runInContext(script, context);
  const fallback = document.createElement('button');
  const maintenance = withMaintenance ? document.createElement('section') : undefined;
  const app = context.mountProjectHealth({ getSnapshot: () => current, isBusy: () => busy, reload: load, onCheck: () => { checks++; }, onReport: async id => { reports.push(id); return openReport(id); }, onManage, onHistory, maintenance, returnFocus: () => fallback });
  const node = id => nodes.find(item => item.id === id), anchor = document.createElement('button');
  return { app, node, anchor, fallback, document, maintenance, checks: () => checks, reports, setSnapshot(value) { current = value; app.refresh(); }, setBusy(value) { busy = value; app.refresh(); }, click: id => node(id).listeners.click() };
}
test('health reads status without executing tools; duplicate reloads are suppressed and failure preserves report', async () => {
  let resolve, calls = 0;
  const h = harness({ load: () => { calls++; return new Promise(done => { resolve = done; }); } });
  h.app.open(h.anchor); h.click('health-refresh');
  assert.equal(calls, 1); assert.equal(h.checks(), 0); assert.equal(h.node('health-check').disabled, true);
  resolve(false); await setImmediate();
  assert.match(h.node('health-status').textContent, /未能刷新.*保留/);
  assert.equal(h.node('health-report').disabled, false);
  h.click('health-refresh'); resolve(true); await setImmediate();
  assert.equal(h.node('health-status').dataset.error, 'false'); assert.equal(h.checks(), 0);
});
test('health guards running, missing project and unavailable directory, but allows explicit retry and saved report', async () => {
  const h = harness(); h.app.open(h.anchor); await setImmediate();
  h.setBusy(true); h.click('health-check'); assert.equal(h.checks(), 0);
  h.setBusy(false); h.setSnapshot(snapshot({ projects: [{ ...project, directoryAvailable: false }] }));
  h.click('health-check'); assert.equal(h.checks(), 0); assert.equal(h.node('health-report').disabled, false);
  h.setSnapshot(snapshot()); h.click('health-check'); assert.equal(h.checks(), 1); assert.equal(h.node('desktop-health').open, false);
  h.app.open(h.anchor); await setImmediate(); await h.click('health-report');
  assert.equal(h.reports[0], 'report-a'); assert.equal(h.node('desktop-health').open, false);
});
test('health close invalidates pending refresh and restores focus; newer project has isolated report', async () => {
  let resolve;
  const h = harness({ load: () => new Promise(done => { resolve = done; }) });
  h.app.open(h.anchor); const old = resolve;
  h.node('desktop-health').close(); assert.equal(h.document.activeElement, h.anchor);
  h.setSnapshot(snapshot({ activeProjectId: 'b', projects: [{ ...project, id: 'b', name: 'B' }] }));
  h.app.open(h.anchor); resolve(true); await setImmediate();
  const status = h.node('health-status').textContent; old(false); await setImmediate();
  assert.equal(h.node('health-status').textContent, status);
  assert.equal(h.node('health-report').disabled, true); assert.match(h.node('health-summary').textContent, /尚未预检/);
});
test('health failed report opening is recoverable and never closes the dialog', async () => {
  const h = harness({ openReport: async () => { throw new Error('read failed'); } }); h.app.open(h.anchor); await setImmediate();
  await h.click('health-report'); assert.equal(h.node('desktop-health').open, true);
  assert.match(h.node('health-status').textContent, /报告.*重试/);
  h.app.destroy(); assert.equal(h.document.body.children.length, 0);
});

test('health returns focus to a visible fallback when reading notices hides the original shortcut', async () => {
  const h = harness(); h.app.open(h.anchor); await setImmediate();
  h.anchor.hidden = true; h.click('health-done');
  assert.equal(h.document.activeElement, h.fallback);
});

test('health reclaims the same maintenance panel after settings borrows it', async () => {
  const h = harness({ withMaintenance: true });
  const home = h.maintenance.parentNode, settings = h.document.createElement('section');
  settings.append(h.maintenance); assert.equal(h.maintenance.parentNode, settings);
  h.app.restoreMaintenance(); assert.equal(h.maintenance.parentNode, home);
  settings.append(h.maintenance); h.app.open(h.anchor);
  assert.equal(h.maintenance.parentNode, home); assert.equal(h.node('desktop-health').open, true);
  await setImmediate(); h.app.destroy();
});

test('health exposes separate configuration and history destinations and guards both while loading', async () => {
  let settings = 0, histories = 0, resolve;
  const h = harness({ load: () => new Promise(done => { resolve = done; }), onManage: () => { settings++; }, onHistory: () => { histories++; } });
  h.app.open(h.anchor);
  assert.equal(h.node('health-project').textContent, '项目设置');
  assert.equal(h.node('health-history').textContent, '运行历史');
  assert.equal(h.node('health-history').disabled, true);
  h.click('health-project'); h.click('health-history');
  assert.equal(settings + histories, 0);
  resolve(true); await setImmediate();
  h.click('health-history'); assert.equal(histories, 1); assert.equal(settings, 0);
  assert.equal(h.node('desktop-health').open, false);
  h.app.open(h.anchor); resolve(true); await setImmediate();
  h.click('health-project'); assert.equal(settings, 1); assert.equal(histories, 1);
  h.app.destroy();
});
