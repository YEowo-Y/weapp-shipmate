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
function harness({ invoke: custom, recheck = async () => ({ ...artifact, id: 'recheck-1' }) } = {}) {
  const dom = new JSDOM('<body><button id="opener">打开修复</button></body>'), document = dom.window.document, calls = [], rechecks = [];
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
  const app = context.mount({ getProjectId: () => projectId, isBusy: () => externalBusy, onRecheck: async id => { rechecks.push(id); return await recheck(id); } });
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

test('recheck failure never relabels an applied write as unchanged and preserves undo history', async () => {
  const h = harness({ recheck: async () => { throw Error('scanner unavailable'); } }); h.app.openForArtifact(artifact); await h.settle(); await h.confirmBusiness(); await h.click('repair-confirm');
  assert.match(h.node('repair-result').textContent, /已写入/); assert.match(h.node('repair-recheck-status').textContent, /复检未完成/);
  assert.ok(h.document.querySelector('[data-repair-action="undo-preview"]')); assert.equal(h.node('repair-confirm').disabled, true); h.dispose();
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
