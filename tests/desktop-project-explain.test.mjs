import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { runExplain } from '../src/explain.mjs';
import { validateExplainInput, validateExplainResult } from '../desktop/design-previews/explain-contract.js';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Desktop is an optional CLI surface. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Install desktop dependencies' }, fn);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(invoke) {
  const source = readFileSync(new URL('../desktop/src/project-explain.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = { crypto: { randomUUID: () => 'explain-test' }, validateExplainInput: value => validateExplainInput(JSON.parse(JSON.stringify(value))), validateExplainResult };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const state = { projectId: 'project-a', ready: true, busy: false, saved: [], requests: [], stopErrors: [], refreshes: 0 };
  const controller = context.createProjectExplain({
    invoke: async (name, args) => { state.requests.push({ name, args }); return invoke(name, args); },
    getProjectId: () => state.projectId, isReady: () => state.ready, isBusy: () => state.busy,
    setBusy: value => { state.busy = value; }, onArtifact: value => state.saved.push(value),
    onStopError: message => state.stopErrors.push(message), onSettled: async () => { state.refreshes++; },
  });
  return { state, query: controller.query };
}
function artifact(args) {
  return { id: args.runId, runId: args.runId, projectId: args.projectId, kind: 'explain', markdown: '拒因报告',
    data: { schemaVersion: 1, kind: 'explain', result: runExplain(args.query), scope: null } };
}

desktopTest('native explain binds persisted artifact to selected project and returns the validated old result', async () => {
  const app = harness(async (_name, args) => artifact(args));
  const result = await app.query({ query: '  隐私  ' });
  assert.equal(result.meta.query, '隐私');
  assert.equal(app.state.requests[0].name, 'project_run');
  assert.equal(app.state.requests[0].args.projectId, 'project-a');
  assert.equal(app.state.saved.length, 1);
  assert.equal(app.state.refreshes, 1);
  assert.equal(app.state.busy, false);
});

desktopTest('native explain rejects invalid input, busy and unavailable storage before invoking', async () => {
  const app = harness(async () => { throw new Error('must not run'); });
  await assert.rejects(app.query({ query: ' ' }), /输入/);
  app.state.ready = false;
  await assert.rejects(app.query({ query: '隐私' }), /项目存储/);
  app.state.ready = true; app.state.busy = true;
  await assert.rejects(app.query({ query: '隐私' }), /等待/);
  assert.equal(app.state.requests.length, 0);
});

desktopTest('native explain does not accept mismatched project, run, type or query payloads', async () => {
  for (const alter of [a => { a.projectId = 'project-b'; }, a => { a.runId = 'another'; }, a => { a.kind = 'guide'; }, a => { a.data.kind = 'guide'; }, a => { a.data.result.meta.query = 'different'; }, a => { a.data.schemaVersion = 999; }]) {
    const app = harness(async (_name, args) => { const value = artifact(args); alter(value); return value; });
    await assert.rejects(app.query({ query: '隐私' }), /不匹配|校验/);
    assert.equal(app.state.saved.length, 0);
    assert.equal(app.state.busy, false);
  }
});

desktopTest('cancel sends native stop once, discards late result and waits for both execution and acknowledgement', async () => {
  const run = deferred(), stop = deferred(); let request;
  const app = harness(async (name, args) => { if (name === 'run_cancel') return stop.promise; request = args; return run.promise; });
  const signal = new AbortController();
  const pending = app.query({ query: '隐私', signal: signal.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  signal.abort(); stop.resolve(); await Promise.resolve();
  assert.equal(app.state.busy, true);
  run.resolve(artifact(request)); await rejected;
  assert.equal(app.state.saved.length, 0);
  assert.equal(app.state.busy, false);
  assert.equal(app.state.requests.filter(item => item.name === 'run_cancel').length, 1);
});

desktopTest('stop failure remains visible and cannot unlock execution early', async () => {
  const run = deferred();
  const app = harness(async name => { if (name === 'run_cancel') throw new Error('native stop failed'); return run.promise; });
  const signal = new AbortController();
  const pending = app.query({ query: '隐私', signal: signal.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  signal.abort(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.state.busy, true);
  assert.equal(app.state.stopErrors.length, 1);
  run.reject(new Error('tool failed')); await rejected;
  assert.equal(app.state.busy, false);
});

desktopTest('an already aborted query makes no native request; unassigned queries can persist separately', async () => {
  const app = harness(async (_name, args) => artifact(args));
  const signal = new AbortController(); signal.abort();
  await assert.rejects(app.query({ query: '隐私', signal: signal.signal }), { name: 'AbortError' });
  assert.equal(app.state.requests.length, 0);
  app.state.projectId = null;
  await app.query({ query: '隐私' });
  assert.equal(app.state.saved[0].projectId, null);
});
