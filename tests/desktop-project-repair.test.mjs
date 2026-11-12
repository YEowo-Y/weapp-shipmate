import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createIcon } from '../desktop/design-previews/components/icons.js';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom'), ts = require('typescript');
const source = readFileSync(new URL('../desktop/src/project-repair.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const artifact = { id: 'a1', projectId: 'p1', kind: 'check' };
const plan = kind => ({ planId: `plan-${kind}`, projectId: 'p1', file: 'app.json', expiresAt: Date.now() + 300000, before: '{"pages":[]}', after: '{"pages":[],"requiredPrivateInfos":["getLocation"]}', missingApis: ['getLocation'], evidence: [{ file: 'pages/index.js', apis: ['getLocation'] }], warnings: ['非原子写入；保留恢复备份'], kind });
const result = (writeState = 'applied') => ({ operationId: 'op1', projectId: 'p1', kind: 'apply', createdAt: Date.now(), writeState, recheckState: 'required', undoAvailable: writeState === 'applied', recoveryAvailable: writeState === 'recovery_required', backupPath: 'C:/backup/app.json', message: '原生处理结果' });
function harness({ invoke: custom, recheck = async () => ({ ...artifact, id: 'recheck-1' }), onReadReport } = {}) {
  const dom = new JSDOM('<body><button id="opener">打开修复</button></body>'), document = dom.window.document, calls = [], rechecks = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { this.scrolled = true; };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  let projectId = 'p1', externalBusy = false, sequence = 0;
  const invoke = async (command, args) => {
    calls.push([command, args]); if (custom) { const answer = await custom(command, args); if (answer !== undefined) return answer; }
    if (command === 'project_repair_prepare') return plan('apply');
    if (command === 'project_repair_undo_prepare') return plan('undo');
    if (command === 'project_repair_recovery_prepare') return plan('recovery');
    if (command === 'project_repair_snapshot') return { operations: [result()] };
    if (command === 'project_repair_apply') return result();
    if (command === 'project_repair_undo') return result('undone');
  };
  const context = vm.createContext({ document, invoke, createIcon, crypto: { randomUUID: () => `request-${++sequence}` }, createActionButton: (doc, label) => Object.assign(doc.createElement('button'), { textContent: label }) });
  vm.runInContext(`${script}\nglobalThis.mount = mountProjectRepair;`, context);
  const app = context.mount({ getProjectId: () => projectId, isBusy: () => externalBusy, onRecheck: async id => { rechecks.push(id); return await recheck(id); }, onReadReport });
  const node = id => document.getElementById(id), settle = async () => { await setImmediate(); await setImmediate(); };
  const click = async id => { node(id).click(); await settle(); };
  const confirmBusiness = async () => { node('repair-business-confirm').checked = true; node('repair-business-confirm').dispatchEvent(new dom.window.Event('change')); await settle(); };
  return { app, calls, rechecks, node, settle, click, confirmBusiness, document, setProject(id) { projectId = id; app.sync(); }, setBusy(value) { externalBusy = value; app.sync(); }, dispose() { app.destroy(); dom.window.close(); } };
}

test('repair preview shows full app.json and file evidence without writing until explicit business confirmation', async () => {
  const h = harness(); h.app.openForArtifact(artifact, h.node('opener')); await h.settle();
  assert.equal(h.node('repair-before').textContent, plan('apply').before); assert.equal(h.node('repair-after').textContent, plan('apply').after);
  assert.match(h.node('repair-evidence').textContent, /pages\/index.js.*getLocation/s);
  assert.equal(h.node('repair-confirm').disabled, true); assert.equal(h.calls.some(([cmd]) => cmd === 'project_repair_apply'), false);
  await h.confirmBusiness(); await h.click('repair-confirm');
  const args = h.calls.find(([cmd]) => cmd === 'project_repair_apply')[1]; assert.equal(args.businessConfirmed, true); assert.equal(args.planId, 'plan-apply');
  assert.equal(h.calls.find(([cmd]) => cmd === 'project_repair_record_recheck')[1].artifactId, 'recheck-1'); assert.deepEqual(h.rechecks, ['p1']); assert.match(h.node('repair-result').textContent, /已写入/); h.dispose();
});

test('imported and foreign-project reports cannot request a writable plan', async () => {
  for (const bad of [{ ...artifact, provenance: 'imported' }, { ...artifact, projectId: 'other' }, { ...artifact, kind: 'guide' }]) {
    const h = harness(); h.app.openForArtifact(bad); await h.settle();
    assert.equal(h.calls.some(([cmd]) => cmd === 'project_repair_prepare'), false); assert.match(h.node('repair-status').textContent, /本机.*预检/); h.dispose();
  }
});

test('completed repair records open their exact local report without rerunning or writing', async () => {
  const linked = { ...artifact, id: 'linked-old-report', markdown: '原复检报告' };
  const operations = [
    { ...result(), recheckState: 'completed', recheckArtifactId: linked.id },
    { ...result(), operationId: 'pending' },
    { ...result(), operationId: 'missing-link', recheckState: 'completed' },
    { ...result(), operationId: 'foreign', projectId: 'other', recheckState: 'completed', recheckArtifactId: 'foreign-report' },
  ];
  const opened = [];
  const h = harness({
    invoke: cmd => cmd === 'project_repair_snapshot' ? { operations } : cmd === 'project_artifact' ? linked : undefined,
    onReadReport: (report, anchor) => { opened.push([report, anchor]); h.app.close(); return true; },
  });
  h.app.openHistory(h.node('opener')); await h.settle();
  assert.equal(h.document.querySelectorAll('[data-repair-action="read-report"]').length, 1);
  h.document.querySelector('[data-repair-action="read-report"]').click(); await h.settle();
  assert.deepEqual(opened, [[linked, h.node('opener')]]);
  const reads = h.calls.filter(([cmd]) => cmd === 'project_artifact');
  assert.equal(reads.length, 1); assert.equal(reads[0][1].artifactId, linked.id); assert.equal(reads[0][1].localProjectId, 'p1');
  assert.equal(h.node('desktop-repair').open, false);
  assert.equal(h.rechecks.length, 0);
  assert.ok(h.calls.every(([cmd]) => ['project_repair_snapshot', 'project_artifact'].includes(cmd)));
  h.dispose();
});

test('returning from a linked report reloads the original filter and focuses the matching record', async () => {
  let back, operation = { ...result(), recheckState: 'completed', recheckArtifactId: 'linked' };
  const h = harness({
    invoke: cmd => cmd === 'project_repair_snapshot' ? { operations: [operation] } : cmd === 'project_artifact' ? { ...artifact, id: 'linked', markdown: '报告' } : undefined,
    onReadReport: (_report, _anchor, returnToRecord) => { back = returnToRecord; h.app.close(); return true; },
  });
  h.app.openHistory(); await h.settle();
  const filter = h.node('repair-history-filter'); filter.value = 'applied'; filter.dispatchEvent(new h.document.defaultView.Event('change'));
  h.document.querySelector('[data-repair-action="read-report"]').click(); await h.settle();
  const reads = h.calls.length;
  assert.equal(back(h.node('opener')), true); await h.settle();
  assert.equal(filter.value, 'applied');
  assert.equal(h.document.activeElement.dataset.operationId, operation.operationId);
  assert.equal(h.document.activeElement.scrolled, true);
  assert.equal(h.calls.length, reads + 1);
  assert.equal(h.calls.at(-1)[0], 'project_repair_snapshot');
  h.app.close(); operation = { ...operation, writeState: 'undone' };
  assert.equal(back(h.node('opener')), true); await h.settle();
  assert.equal(filter.value, 'all', 'changed state reveals the requested record outside the old filter');
  assert.equal(h.document.activeElement.dataset.operationId, operation.operationId);
  h.app.close(); h.setProject('other');
  assert.equal(back(h.node('opener')), false);
  assert.equal(h.node('desktop-repair').open, false);
  h.dispose();
});

test('returning handles missing records and read failures without inventing state or stealing focus', async () => {
  let back, mode = 'initial', resolve;
  const operation = { ...result(), recheckState: 'completed', recheckArtifactId: 'linked' };
  const h = harness({
    invoke: cmd => {
      if (cmd === 'project_artifact') return { ...artifact, id: 'linked', markdown: '报告' };
      if (cmd === 'project_repair_snapshot') {
        if (mode === 'missing') return { operations: [] };
        if (mode === 'failed') throw Error('storage unavailable');
        if (mode === 'pending') return new Promise(done => { resolve = done; });
        return { operations: [operation] };
      }
    },
    onReadReport: (_report, _anchor, returnToRecord) => { back = returnToRecord; h.app.close(); return true; },
  });
  h.app.openHistory(); await h.settle();
  h.document.querySelector('[data-repair-action="read-report"]').click(); await h.settle();
  mode = 'missing'; back(h.node('opener')); await h.settle();
  assert.match(h.node('repair-status').textContent, /记录已不可用/);
  h.app.close(); mode = 'failed'; back(h.node('opener')); await h.settle();
  assert.match(h.node('repair-status').textContent, /读取失败.*storage unavailable/);
  h.app.close(); mode = 'pending'; back(h.node('opener'));
  h.node('repair-done').focus();
  resolve({ operations: [operation] }); await h.settle();
  assert.equal(h.document.activeElement, h.node('repair-done'));
  h.app.close(); mode = 'pending'; back(h.node('opener')); h.setProject('other');
  resolve({ operations: [operation] }); await h.settle();
  assert.equal(h.document.querySelector('[data-repair-action="read-report"]'), null);
  assert.equal(h.rechecks.length, 0);
  h.dispose();
});

test('a delayed repair close event preserves focus already handed to a report', async () => {
  const h = harness(); h.app.openHistory(h.node('opener')); await h.settle();
  const dialog = h.node('desktop-repair');
  dialog.close = () => { dialog.open = false; };
  h.app.close();
  const reportControl = h.document.createElement('button'); h.document.body.append(reportControl); reportControl.focus();
  dialog.dispatchEvent(new h.document.defaultView.Event('close'));
  assert.equal(h.document.activeElement, reportControl);
  h.app.openHistory(h.node('opener')); await h.settle();
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new h.document.defaultView.Event('close')); };
  await h.click('repair-dismiss');
  assert.equal(h.document.activeElement, h.node('opener'));
  h.dispose();
});

test('missing linked report can be retried without substituting another report', async () => {
  let missing = true, opened = 0;
  const linked = { ...artifact, id: 'linked', markdown: '报告' };
  const h = harness({
    invoke: cmd => {
      if (cmd === 'project_repair_snapshot') return { operations: [{ ...result(), recheckState: 'completed', recheckArtifactId: 'linked' }] };
      if (cmd === 'project_artifact') { if (missing) throw Error('报告不存在'); return linked; }
    },
    onReadReport: () => { opened++; return true; },
  });
  h.app.openHistory(); await h.settle();
  const read = h.document.querySelector('[data-repair-action="read-report"]');
  read.click(); await h.settle();
  assert.equal(opened, 0); assert.equal(read.disabled, false); assert.equal(h.node('desktop-repair').open, true);
  assert.match(h.node('repair-status').textContent, /无法读取本次复检报告.*报告不存在.*原修复记录保留/);
  missing = false; read.click(); await h.settle();
  assert.equal(opened, 1); assert.equal(h.rechecks.length, 0);
  h.dispose();
});

test('report links reject mismatched, imported and empty results and preserve the repair dialog', async () => {
  for (const override of [{ id: 'different' }, { projectId: 'other' }, { kind: 'guide' }, { provenance: 'imported' }, { markdown: '' }]) {
    let opened = 0;
    const h = harness({
      invoke: cmd => cmd === 'project_repair_snapshot' ? { operations: [{ ...result(), recheckState: 'completed', recheckArtifactId: 'linked' }] }
        : cmd === 'project_artifact' ? { ...artifact, id: 'linked', markdown: '报告', ...override } : undefined,
      onReadReport: () => { opened++; return true; },
    });
    h.app.openHistory(); await h.settle();
    h.document.querySelector('[data-repair-action="read-report"]').click(); await h.settle();
    assert.equal(opened, 0); assert.equal(h.node('desktop-repair').open, true);
    assert.match(h.node('repair-status').textContent, /不匹配或内容不可用/);
    h.dispose();
  }
});

test('late and duplicate linked-report reads cannot navigate after leaving or while another tool is busy', async () => {
  for (const leave of ['close', 'switch', 'busy', 'destroy', 'navigation-denied']) {
    const pending = deferred(); let opened = 0;
    const h = harness({
      invoke: cmd => cmd === 'project_repair_snapshot' ? { operations: [{ ...result(), recheckState: 'completed', recheckArtifactId: 'linked' }] } : cmd === 'project_artifact' ? pending.promise : undefined,
      onReadReport: () => { opened++; return false; },
    });
    h.app.openHistory(); await h.settle();
    const read = h.document.querySelector('[data-repair-action="read-report"]');
    read.click(); read.dispatchEvent(new h.document.defaultView.Event('click')); await h.settle();
    assert.equal(h.calls.filter(([cmd]) => cmd === 'project_artifact').length, 1);
    if (leave === 'close') { h.app.close(); h.app.openHistory(); await h.settle(); }
    if (leave === 'switch') h.setProject('other');
    if (leave === 'busy') h.setBusy(true);
    if (leave === 'destroy') h.app.destroy();
    pending.resolve({ ...artifact, id: 'linked', markdown: '报告' }); await h.settle();
    assert.equal(opened, leave === 'navigation-denied' ? 1 : 0);
    if (['busy', 'navigation-denied'].includes(leave)) {
      assert.equal(h.node('desktop-repair').open, true);
      assert.match(h.node('repair-status').textContent, /当前操作尚未结束/);
    }
    assert.equal(h.rechecks.length, 0); h.dispose();
  }
});

test('recheck failure never relabels an applied write as unchanged and preserves undo history', async () => {
  const h = harness({ recheck: async () => { throw Error('scanner unavailable'); } }); h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm');
  assert.match(h.node('repair-result').textContent, /已写入/); assert.match(h.node('repair-recheck-status').textContent, /复检未完成/);
  assert.ok(h.document.querySelector('[data-repair-action="undo-preview"]')); assert.equal(h.node('repair-confirm').disabled, true); h.dispose();
});

test('failed automatic recheck can be retried from its record without repeating the file write', async () => {
  let attempts = 0, operation = result();
  const h = harness({
    recheck: async () => { if (++attempts === 1) throw Error('scanner unavailable'); return { ...artifact, id: 'retry-report' }; },
    invoke: (cmd, args) => {
      if (cmd === 'project_repair_snapshot') return { operations: [operation] };
      if (cmd === 'project_repair_record_recheck') { operation = { ...operation, recheckState: 'completed', recheckArtifactId: args.artifactId }; return operation; }
    },
  });
  h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm');
  const retry = h.document.querySelector('[data-repair-action="recheck"]');
  assert.ok(retry); assert.equal(retry.dataset.operationId, 'op1');
  retry.focus(); retry.click(); await h.settle();
  assert.equal(attempts, 2);
  assert.equal(h.calls.filter(([cmd]) => cmd === 'project_repair_apply').length, 1);
  assert.equal(h.calls.filter(([cmd]) => cmd === 'project_repair_undo').length, 0);
  assert.equal(operation.recheckArtifactId, 'retry-report');
  assert.equal(h.document.querySelector('[data-repair-action="recheck"]'), null);
  assert.match(h.node('repair-recheck-status').textContent, /复检已完成并关联报告/);
  assert.equal(h.document.activeElement, h.node('repair-recheck-status'));
  assert.match(h.node('repair-result').textContent, /已写入/);
  assert.ok(h.document.querySelector('[data-repair-action="undo-preview"]'));
  h.dispose();
});

test('history retry retains pending state on association failure and succeeds on a later attempt', async () => {
  let rejectAssociation = true, operation = result();
  const h = harness({ invoke: (cmd, args) => {
    if (cmd === 'project_repair_snapshot') return { operations: [operation] };
    if (cmd === 'project_repair_record_recheck') {
      if (rejectAssociation) throw Error('配置已在复检前后改变');
      operation = { ...operation, recheckState: 'completed', recheckArtifactId: args.artifactId }; return operation;
    }
  } });
  h.app.openHistory(); await h.settle();
  h.document.querySelector('[data-repair-action="recheck"]').click(); await h.settle();
  assert.match(h.node('repair-recheck-status').textContent, /关联未完成.*配置已在复检前后改变/);
  assert.equal(operation.recheckState, 'required');
  assert.ok(h.document.querySelector('[data-repair-action="recheck"]'));
  rejectAssociation = false;
  h.document.querySelector('[data-repair-action="recheck"]').click(); await h.settle();
  assert.equal(operation.recheckState, 'completed'); assert.equal(h.rechecks.length, 2);
  assert.ok(h.calls.every(([cmd]) => ['project_repair_snapshot', 'project_repair_record_recheck'].includes(cmd)));
  h.dispose();
});

test('only unfinished checks for applied writes or completed restore operations offer retry', async () => {
  const operations = [
    { ...result(), operationId: 'apply' },
    { ...result('undone'), kind: 'undo', operationId: 'undo' },
    { ...result('undone'), kind: 'recovery', operationId: 'recovery' },
    { ...result('undone'), operationId: 'compensated-original' },
    { ...result('recovery_required'), operationId: 'torn' },
    { ...result('not_applied'), operationId: 'not-written' },
    { ...result(), recheckState: 'completed', operationId: 'already-checked' },
    { ...result(), projectId: 'other', operationId: 'foreign' },
  ];
  const h = harness({ invoke: cmd => cmd === 'project_repair_snapshot' ? { operations } : undefined });
  h.app.openHistory(); await h.settle();
  assert.deepEqual([...h.document.querySelectorAll('[data-repair-action="recheck"]')].map(n => n.dataset.operationId), ['apply', 'undo', 'recovery']);
  const stale = h.document.querySelector('[data-repair-action="recheck"]');
  h.setBusy(true); stale.dispatchEvent(new h.document.defaultView.Event('click')); await h.settle();
  assert.equal(h.rechecks.length, 0);
  h.setBusy(false); h.setProject('other'); stale.dispatchEvent(new h.document.defaultView.Event('click')); await h.settle();
  assert.equal(h.rechecks.length, 0);
  h.dispose();
});

test('duplicate retries and late results after closing or switching projects cannot associate reports', async () => {
  for (const leave of ['close', 'switch', 'destroy']) {
    const pending = deferred(), h = harness({ recheck: () => pending.promise });
    h.app.openHistory(); await h.settle();
    const retry = h.document.querySelector('[data-repair-action="recheck"]');
    retry.click(); await h.settle();
    retry.dispatchEvent(new h.document.defaultView.Event('click')); await h.settle();
    assert.equal(h.rechecks.length, 1);
    if (leave === 'close') { await h.click('repair-dismiss'); h.app.openHistory(); await h.settle(); }
    else if (leave === 'switch') h.setProject('other');
    else h.app.destroy();
    pending.resolve({ ...artifact, id: 'late-report' }); await h.settle();
    assert.equal(h.calls.filter(([cmd]) => cmd === 'project_repair_record_recheck').length, 0);
    h.dispose();
  }
});

test('expired or switched-project plans never submit writes, including forged click events', async () => {
  const h = harness({ invoke: cmd => cmd === 'project_repair_prepare' ? { ...plan('apply'), expiresAt: Date.now() - 1 } : undefined });
  h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm');
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_repair_apply'), false); assert.match(h.node('repair-status').textContent, /过期/); h.dispose();
  const second = harness(); second.app.openForArtifact(artifact); await second.settle(); await second.confirmBusiness(); second.setProject('other'); await second.click('repair-confirm');
  assert.equal(second.calls.some(([cmd]) => cmd === 'project_repair_apply'), false); second.dispose();
});

test('pending writes cannot be duplicated or dismissed and interrupted writes skip recheck', async () => {
  const pending = deferred(); const h = harness({ invoke: cmd => cmd === 'project_repair_apply' ? pending.promise : undefined });
  h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm'); await h.click('repair-confirm'); await h.click('repair-dismiss');
  assert.equal(h.calls.filter(([cmd]) => cmd === 'project_repair_apply').length, 1); assert.equal(h.node('desktop-repair').open, true);
  pending.resolve(result('recovery_required')); await h.settle(); assert.equal(h.rechecks.length, 0); assert.match(h.node('repair-result').textContent, /恢复/); h.dispose();
});

test('history restart path previews undo and recovery before separate explicit confirmation', async () => {
  for (const state of ['applied', 'recovery_required']) {
    const h = harness({ invoke: cmd => cmd === 'project_repair_snapshot' ? { operations: [result(state)] } : undefined });
    h.app.openHistory(); await h.settle();
    const action = state === 'applied' ? 'undo-preview' : 'recovery-preview'; h.document.querySelector(`[data-repair-action="${action}"]`).click(); await h.settle();
    assert.equal(h.calls.some(([cmd]) => cmd === 'project_repair_undo'), false);
    await h.click('repair-confirm'); assert.equal(h.calls.filter(([cmd]) => cmd === 'project_repair_undo').length, 1); assert.deepEqual(h.rechecks, ['p1']); h.dispose();
  }
});

test('recheck filters count actionable pending checks separately from linked reports and recovery', async () => {
  const operations = [
    { ...result(), operationId: 'pending-apply' },
    { ...result('undone'), kind: 'undo', operationId: 'pending-undo' },
    { ...result('undone'), operationId: 'compensated-original' },
    { ...result('recovery_required'), operationId: 'needs-recovery', recheckState: 'not_required' },
    { ...result(), operationId: 'linked', recheckState: 'completed', recheckArtifactId: 'report-linked' },
    { ...result(), operationId: 'missing-link', recheckState: 'completed' },
    { ...result('not_applied'), operationId: 'not-written', recheckState: 'not_required' },
  ];
  const h = harness({ invoke: cmd => cmd === 'project_repair_snapshot' ? { operations } : undefined, onReadReport: () => true });
  h.app.openHistory(); await h.settle();
  const before = h.calls.length, select = h.node('repair-history-filter');
  const change = value => { select.value = value; select.dispatchEvent(new h.document.defaultView.Event('change')); };
  const label = value => [...select.options].find(option => option.value === value).textContent;
  assert.equal(label('all'), '全部记录 7');
  assert.equal(label('recheck_required'), '待复检 2');
  assert.equal(label('recheck_completed'), '已关联复检 1');
  assert.equal(label('recovery_required'), '需要恢复文件 1');
  change('recheck_required');
  assert.deepEqual([...h.document.querySelectorAll('.project-repair-operation')].map(row => row.dataset.operationId), ['pending-apply', 'pending-undo']);
  assert.equal(h.node('repair-history-count').textContent, '2 / 7 条记录');
  change('recheck_completed');
  assert.deepEqual([...h.document.querySelectorAll('.project-repair-operation')].map(row => row.dataset.operationId), ['linked']);
  assert.equal(h.document.querySelector('[data-repair-action="read-report"]').dataset.operationId, 'linked');
  change('recovery_required'); assert.ok(h.document.querySelector('[data-repair-action="recovery-preview"]'));
  assert.equal(h.calls.length, before); assert.equal(h.rechecks.length, 0);
  h.dispose();
});

test('successful retry leaves the pending filter and linked-report return preserves the completed filter', async () => {
  let operation = result(), fail = true, back;
  const h = harness({
    invoke: (cmd, args) => {
      if (cmd === 'project_repair_snapshot') return { operations: [operation] };
      if (cmd === 'project_repair_record_recheck') {
        if (fail) throw Error('association unavailable');
        operation = { ...operation, recheckState: 'completed', recheckArtifactId: args.artifactId }; return operation;
      }
      if (cmd === 'project_artifact') return { ...artifact, id: operation.recheckArtifactId, markdown: '报告' };
    },
    onReadReport: (_artifact, _anchor, returnToRecord) => { back = returnToRecord; h.app.close(); return true; },
  });
  h.app.openHistory(); await h.settle();
  const select = h.node('repair-history-filter');
  select.value = 'recheck_required'; select.dispatchEvent(new h.document.defaultView.Event('change'));
  h.document.querySelector('[data-repair-action="recheck"]').click(); await h.settle();
  assert.equal(h.document.querySelectorAll('.project-repair-operation').length, 1);
  assert.match(h.node('repair-recheck-status').textContent, /关联未完成/);
  fail = false; h.document.querySelector('[data-repair-action="recheck"]').click(); await h.settle();
  assert.equal(select.value, 'recheck_required');
  assert.equal(h.document.querySelectorAll('.project-repair-operation').length, 0);
  assert.match(h.node('repair-history').textContent, /当前没有待复检记录.*需要恢复文件/);
  assert.equal(h.node('repair-history-count').textContent, '0 / 1 条记录');
  assert.equal([...select.options].find(option => option.value === 'recheck_completed').textContent, '已关联复检 1');
  select.value = 'recheck_completed'; select.dispatchEvent(new h.document.defaultView.Event('change'));
  h.document.querySelector('[data-repair-action="read-report"]').click(); await h.settle();
  back(h.node('opener')); await h.settle();
  assert.equal(select.value, 'recheck_completed');
  assert.equal(h.document.activeElement.dataset.operationId, operation.operationId);
  assert.ok(h.calls.every(([cmd]) => ['project_repair_snapshot', 'project_repair_record_recheck', 'project_artifact'].includes(cmd)));
  h.dispose();
});

test('history state filtering is local, preserves recovery actions and recovers from an empty selection', async () => {
  const operations = ['applied', 'recovery_required', 'undone'].map((state, index) => ({ ...result(state), operationId: `op-${index}` }));
  const h = harness({ invoke: cmd => cmd === 'project_repair_snapshot' ? { operations } : undefined });
  h.app.openHistory(); await h.settle();
  const calls = h.calls.length, select = h.node('repair-history-filter');
  const change = value => { select.value = value; select.dispatchEvent(new h.document.defaultView.Event('change')); };
  change('recovery_required');
  assert.equal(h.node('repair-history-count').textContent, '1 / 3 条记录');
  assert.equal(h.document.querySelectorAll('.project-repair-operation').length, 1);
  assert.ok(h.document.querySelector('[data-repair-action="recovery-preview"]'));
  assert.equal(h.calls.length, calls, 'filter does not load, prepare or write');
  change('not_applied');
  assert.match(h.node('repair-history').textContent, /此状态下没有/);
  assert.equal(h.node('repair-history-reset').hidden, false);
  await h.click('repair-history-reset');
  assert.equal(h.node('repair-history-filter').value, 'all');
  assert.equal(h.document.querySelectorAll('.project-repair-operation').length, 3);
  change('undone'); await h.click('repair-history-refresh');
  assert.equal(select.value, 'undone'); assert.equal(h.document.querySelectorAll('.project-repair-operation').length, 1);
  h.dispose();
});


test('recheck association failure preserves completed file change and undo', async () => {
  const h = harness({ invoke: cmd => { if (cmd === 'project_repair_record_recheck') throw Error('文件在复检后改变'); } });
  h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm');
  assert.match(h.node('repair-result').textContent, /已写入/);
  assert.match(h.node('repair-recheck-status').textContent, /关联未完成/);
  assert.ok(h.document.querySelector('[data-repair-action="undo-preview"]')); h.dispose();
});

test('closing a pending preview allows a new preview without stale completion unlocking it', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const h = harness({ invoke: cmd => cmd === 'project_repair_prepare' ? (++count === 1 ? first.promise : second.promise) : undefined });
  h.app.openForArtifact(artifact); await h.settle(); await h.click('repair-dismiss');
  h.app.openForArtifact(artifact); await h.settle(); assert.equal(count, 2);
  first.resolve({ ...plan('apply'), before: 'old' }); await h.settle();
  assert.equal(h.node('desktop-repair').getAttribute('aria-busy'), 'true'); assert.equal(h.node('repair-preview').hidden, true);
  second.resolve({ ...plan('apply'), before: 'new' }); await h.settle();
  assert.equal(h.node('repair-before').textContent, 'new'); assert.equal(h.node('desktop-repair').getAttribute('aria-busy'), 'false'); h.dispose();
});


test('unknown write response discards approval and never claims no modification or retries', async () => {
  const h = harness({ invoke: cmd => { if (cmd === 'project_repair_apply') throw Error('连接中断'); } });
  h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm');
  assert.match(h.node('repair-status').textContent, /未能确认.*勿重复/s);
  assert.equal(h.node('repair-result').textContent, ''); assert.equal(h.node('repair-confirm').disabled, true);
  await h.click('repair-confirm'); assert.equal(h.calls.filter(([cmd]) => cmd === 'project_repair_apply').length, 1);
  await h.click('repair-history-refresh'); assert.ok(h.document.querySelector('[data-repair-action="undo-preview"]')); h.dispose();
});
