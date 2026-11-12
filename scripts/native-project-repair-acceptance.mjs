// Actual native IPC, bundled CLI and filesystem; no mocked repair commands.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function checkProjectRepairFlows(options) {
  const { checked, click, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, run, requests } = options;
  const projectId = 'native-repair-project', directory = resolve(run, '受限修复项目'), file = resolve(directory, 'app.json');
  const original = Buffer.from('{\r\n  "pages": [],\r\n  "window": { "navigationBarTitleText": "修复验收" }\r\n}\r\n');
  const beforeRequests = requests.length, errors = [];
  const monitor = () => inspect('window.__repairErrors=[];window.addEventListener("error",e=>window.__repairErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__repairErrors.push(String(e.reason?.message||e.reason)));');
  const snapshot = () => projectInvoke('project_snapshot');
  const repairSnapshot = () => projectInvoke('project_repair_snapshot', { projectId });
  let serial = 0, operationId;
  async function reloadProjects() {
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return !document.querySelector("#project-retry").disabled'), 'project registry refreshed');
    await closeProjects();
  }
  async function closeRepair() { await click('#repair-done'); await until(() => inspect('return !document.querySelector("#desktop-repair").open'), 'repair closed'); }
  async function closeReport() { if (await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-close'); }
  async function openReport() {
    await click('#desktop-results-open'); await click('#project-results-retry');
    await until(() => inspect('return !document.querySelector("#project-results-retry").disabled && !!document.querySelector("#project-history .project-run button")'), 'saved report ready');
    await click('#project-history .project-run button');
    await until(() => inspect('return document.querySelector("#desktop-tools").open'), 'report open');
  }
  async function prepare() {
    await openReport(); await click('#repair-report');
    await until(() => inspect('return document.querySelector("#desktop-repair").open && document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'repair prepared');
    assert.equal(await inspect('return document.querySelector("#repair-preview").hidden'), false, await text('#repair-status'));
  }
  async function scan() {
    return projectInvoke('project_run', { projectId, kind: 'check', subject: 'personal', runId: `native-repair-scan-${++serial}` });
  }
  async function apply() {
    await click('#repair-business-confirm'); await click('#repair-confirm');
    await until(async () => /复检已完成/.test(await text('#repair-recheck-status')) && await inspect('return document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'write and actual CLI recheck', 30_000);
    assert.match(await text('#repair-result'), /已写入/);
  }
  async function history() {
    await click('#desktop-more');
    await click('#desktop-repair-history');
    await until(() => inspect('return document.querySelector("#desktop-repair").open && document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'repair history ready');
  }
  await monitor(); await command('POST', '/window/rect', { width: 1200, height: 850 });
  await checked('Repair fixture is an actual local single-root project with static privacy API evidence', async () => {
    await mkdir(directory, { recursive: true }); await writeFile(file, original);
    await writeFile(resolve(directory, 'app.js'), 'App({ onLaunch() { wx.getLocation({ type: "wgs84", success() {} }); } });\n');
    await writeFile(resolve(directory, 'project.config.json'), JSON.stringify({ appid: 'touristappid', projectname: 'Native repair fixture', compileType: 'miniprogram', miniprogramRoot: './' }));
    await projectInvoke('project_save', { project: { id: projectId, name: '受限修复验收', directory, subject: 'personal' } });
    const report = await scan(); assert.equal(report.kind, 'check');
    await reloadProjects(); await selectProject(projectId);
  });
  await checked('Repair preview shows complete before/after and requires explicit business confirmation', async () => {
    await openReport(); await click('#read-report');
    const evidence = '#report-reader-content article:last-child .report-reader-evidence';
    await click(evidence + ' > summary');
    const position = await inspect('return document.querySelector(".report-reader-body").scrollTop');
    assert.ok(position > 0);
    const openPreview = async () => {
      await click('#report-reader-repair');
      await until(() => inspect('return document.querySelector("#desktop-repair").matches(":modal") && document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'repair preview over reader');
    };
    await openPreview(); await closeRepair();
    await until(() => inspect('return document.activeElement.id === "report-reader-repair"'), 'return focus to reader');
    assert.ok(await inspect('return document.querySelector(arguments[0]).open', [evidence]));
    assert.ok(Math.abs(await inspect('return document.querySelector(".report-reader-body").scrollTop') - position) <= 1);
    await openPreview();
    assert.equal(await text('#repair-before'), original.toString());
    assert.ok(JSON.parse(await text('#repair-after')).requiredPrivateInfos.includes('getLocation'));
    assert.match(await text('#repair-evidence'), /app.js.*getLocation/);
    assert.equal(await inspect('return document.querySelector("#repair-confirm").disabled'), true);
    assert.deepEqual(await readFile(file), original);
    await screenshot('repair-full-preview');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    assert.equal(await inspect('const d=document.querySelector("#desktop-repair");return document.documentElement.scrollWidth<=innerWidth+1 && d.scrollWidth<=d.clientWidth+1'), true);
    assert.equal(await inspect('const b=document.querySelector("#desktop-repair .context-body");return b.scrollWidth<=b.clientWidth+1'), true, 'only source code panes may scroll horizontally, never the whole repair form');
    await screenshot('repair-preview-narrow'); await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('Approved repair writes only app.json, saves backup and completes a real follow-up check', async () => {
    const runs = (await snapshot()).runs.length; await apply();
    assert.ok(JSON.parse(await readFile(file, 'utf8')).requiredPrivateInfos.includes('getLocation'));
    assert.ok((await snapshot()).runs.length > runs);
    const applied = (await repairSnapshot()).operations.find(item => item.writeState === 'applied');
    assert.ok(applied?.undoAvailable); operationId = applied.operationId;
    assert.equal(applied.recheckState, 'completed'); assert.ok(applied.recheckArtifactId);
    assert.deepEqual(await readFile(applied.backupPath), original);
    await screenshot('repair-applied-rechecked');
    await closeRepair();
    await until(() => inspect('return document.activeElement.id === "report-reader-repair"'), 'return to rechecked report');
    assert.ok((await text('#report-reader-versions')).includes(applied.recheckArtifactId));
    assert.equal(await inspect('return document.querySelector(".report-reader-body").scrollTop'), 0);
    await screenshot('repair-rechecked-reader');
    await click('#report-reader-dismiss');
    await history();
  });
  await checked('Undo requires another preview and restores original bytes including CRLF', async () => {
    await click(`[data-repair-action="undo-preview"][data-operation-id="${operationId}"]`);
    await until(async () => /确认撤销/.test(await text('#repair-preview-title')) && await inspect('return !document.querySelector("#repair-confirm").disabled'), 'undo preview');
    assert.equal(await text('#repair-after'), original.toString()); await screenshot('repair-undo-preview');
    await click('#repair-confirm');
    await until(async () => /复检已完成/.test(await text('#repair-recheck-status')) && await inspect('return document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'undo rechecked', 30_000);
    assert.deepEqual(await readFile(file), original); assert.match(await text('#repair-result'), /已恢复原文件/);
    const historyBefore = await repairSnapshot();
    await click('#repair-history-filter');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE010' }, { type: 'keyUp', value: '\uE010' }, { type: 'keyDown', value: '\uE007' }, { type: 'keyUp', value: '\uE007' }] }] });
    await until(() => inspect('return document.querySelector("#repair-history-filter").value === "undone"'), 'repair history filters undone operations');
    const undone = historyBefore.operations.filter(operation => operation.writeState === 'undone');
    assert.ok(undone.length > 0);
    assert.equal(await inspect('return document.querySelectorAll("#repair-history .project-repair-operation").length'), undone.length);
    assert.equal(await inspect('return [...document.querySelectorAll("#repair-history .project-repair-operation")].every(n=>n.dataset.writeState === "undone")'), true);
    assert.match(await text('#repair-history-count'), /条记录/);
    await screenshot('repair-history-filtered'); await click('#repair-history-reset');
    assert.deepEqual(await repairSnapshot(), historyBefore, 'history filters cannot mutate repair state');
    await closeRepair(); await closeReport();
  });
  await checked('A file changed after preview invalidates the plan and is never overwritten', async () => {
    await scan(); await prepare();
    const edited = Buffer.from('{"pages":[],"window":{"navigationBarTitleText":"预览后手动修改"}}\n'); await writeFile(file, edited);
    await click('#repair-business-confirm'); await click('#repair-confirm');
    await until(() => inspect('return document.querySelector("#repair-status").dataset.error==="true" && document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'stale plan rejected');
    assert.equal(await inspect('return document.querySelector("#repair-confirm").disabled'), true);
    assert.deepEqual(await readFile(file), edited); await screenshot('repair-stale-plan');
    await closeRepair(); await closeReport(); await writeFile(file, original);
  });
  await checked('An unverified repair survives restart and can retry without another source write', async () => {
    // Persist a real approved repair with no follow-up check, as if the app exited after writing.
    const report = await scan();
    const pendingPlan = await projectInvoke('project_repair_prepare', { projectId, artifactId: report.id });
    const pending = await projectInvoke('project_repair_apply', { planId: pendingPlan.planId, requestId: 'native-repair-pending-recheck', businessConfirmed: true });
    assert.equal(pending.writeState, 'applied'); assert.equal(pending.recheckState, 'required');
    const appliedBytes = await readFile(file), backupBytes = await readFile(pending.backupPath);
    errors.push(...await inspect('return window.__repairErrors')); await quit(); await launch(); await monitor();
    await history();
    const retry = `[data-repair-action="recheck"][data-operation-id="${pending.operationId}"]`;
    assert.equal(await inspect('return !!document.querySelector(arguments[0])', [retry]), true);
    const before = await repairSnapshot(), runs = (await snapshot()).runs.length;
    const edited = Buffer.from(appliedBytes.toString().replace('修复验收', '复检前人工编辑'));
    await writeFile(file, edited);
    await click(retry);
    await until(async () => /关联未完成/.test(await text('#repair-recheck-status')) && await inspect('return document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'changed configuration cannot claim a completed recheck', 30_000);
    assert.deepEqual(await readFile(file), edited);
    assert.equal((await repairSnapshot()).operations.find(item => item.operationId === pending.operationId).recheckState, 'required');
    await screenshot('repair-recheck-association-failed');
    await writeFile(file, appliedBytes);
    await click(retry);
    await until(async () => /复检已完成并关联报告/.test(await text('#repair-recheck-status')) && await inspect('return document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'history retry links a real current check', 30_000);
    const after = await repairSnapshot(), verified = after.operations.find(item => item.operationId === pending.operationId);
    assert.equal(after.operations.length, before.operations.length, 'retry creates no additional file operation');
    assert.equal(verified.recheckState, 'completed');
    const linked = await projectInvoke('project_artifact', { artifactId: verified.recheckArtifactId, localProjectId: projectId });
    assert.equal(linked.kind, 'check'); assert.equal(linked.projectId, projectId);
    assert.equal((await snapshot()).runs.length, runs + 2, 'each explicit retry runs exactly one check');
    assert.deepEqual(await readFile(file), appliedBytes);
    assert.deepEqual(await readFile(pending.backupPath), backupBytes);
    assert.equal(await inspect('return document.querySelector(arguments[0]) === null', [retry]), true);
    assert.equal(await inspect('return document.activeElement.id'), 'repair-recheck-status');
    await screenshot('repair-history-recheck-completed');
    // Restore this test fixture through the existing, separately confirmed undo path.
    await click(`[data-repair-action="undo-preview"][data-operation-id="${pending.operationId}"]`);
    await until(() => inspect('return !document.querySelector("#repair-confirm").disabled'), 'fixture undo preview');
    await click('#repair-confirm');
    await until(async () => /复检已完成/.test(await text('#repair-recheck-status')) && await inspect('return document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'fixture undo completed', 30_000);
    assert.deepEqual(await readFile(file), original);
    await closeRepair(); await closeReport();
  });
  await checked('Repair history survives native restart and later edits block undo', async () => {
    await scan(); await prepare(); await apply();
    operationId = (await repairSnapshot()).operations.find(item => item.writeState === 'applied' && item.undoAvailable).operationId;
    await closeRepair(); await closeReport();
    errors.push(...await inspect('return window.__repairErrors')); await quit(); await launch(); await monitor();
    assert.equal((await snapshot()).activeProjectId, projectId);
    assert.ok((await repairSnapshot()).operations.some(item => item.operationId === operationId && item.recheckState === 'completed'));
    await history(); assert.match(await text('#repair-history'), /已写入 app.json/); await screenshot('repair-history-restarted');
    const edited = Buffer.from('{"pages":[],"requiredPrivateInfos":["getLocation"],"window":{"navigationBarTitleText":"后续编辑"}}\n'); await writeFile(file, edited);
    await click(`[data-repair-action="undo-preview"][data-operation-id="${operationId}"]`);
    await until(() => inspect('return document.querySelector("#repair-status").dataset.error==="true" && document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'changed file undo refused');
    assert.equal(await inspect('return document.querySelector("#repair-confirm").disabled'), true);
    assert.deepEqual(await readFile(file), edited); await screenshot('repair-undo-after-edit-refused'); await closeRepair(); await closeReport();
  });
  await checked('Repair records open their exact linked reports even when newer reports exist or a reader is already open', async () => {
    const latest = await scan(), records = await repairSnapshot(), bytes = await readFile(file);
    const linked = records.operations.filter(item => item.recheckState === 'completed' && item.recheckArtifactId);
    assert.ok(linked.length >= 2);
    const targets = [linked.at(-1), linked.find(item => item.recheckArtifactId !== linked.at(-1).recheckArtifactId)];
    assert.ok(targets.every(item => item.recheckArtifactId !== latest.id));
    await history();
    for (const [index, target] of targets.entries()) {
      if (index) {
        await click('#report-reader-repair');
        await until(() => inspect('return document.querySelector("#desktop-repair").open && document.querySelector("#desktop-repair").getAttribute("aria-busy")==="false"'), 'repair dialog over an existing reader');
        await click('#repair-history-refresh');
        await until(() => inspect('return !document.querySelector("#repair-history-refresh").disabled'), 'linked history loaded');
      }
      const selector = `[data-repair-action="read-report"][data-operation-id="${target.operationId}"]`;
      await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",behavior:"instant"})', [selector]);
      if (!index) await screenshot('repair-linked-report-action');
      const before = await snapshot();
      await click(selector);
      await until(() => inspect('return !document.querySelector("#desktop-repair").open && document.querySelector("#desktop-report-reader").open && document.activeElement.id==="report-reader-dismiss"'), 'linked report is readable and focused');
      const versions = await text('#report-reader-versions');
      assert.ok(versions.includes(target.recheckArtifactId));
      assert.ok(!versions.includes(latest.id), 'reading an old repair cannot substitute the latest report');
      assert.equal(await inspect('return document.querySelector(".report-reader-body").scrollTop'), 0);
      const after = await snapshot();
      assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.artifacts, before.artifacts);
      assert.deepEqual(await repairSnapshot(), records);
      assert.deepEqual(await readFile(file), bytes);
      await screenshot(index ? 'repair-linked-report-replaces-reader' : 'repair-linked-report-reader');
    }
    await click('#report-reader-dismiss'); await closeReport();
  });
  await checked('Imported historical reports cannot grant native file repair authority', async () => {
    const backupJson = await projectInvoke('project_export', { projectId });
    const imported = await projectInvoke('project_import', { backupJson, directory, requestId: 'native-repair-import' });
    const importedId = imported.projectId;
    assert.ok(importedId && importedId !== projectId); await reloadProjects(); await selectProject(importedId);
    const artifact = (await snapshot()).artifacts.find(item => item.projectId === importedId && item.kind === 'check');
    assert.equal(artifact.provenance, 'imported');
    const bytes = await readFile(file);
    await assert.rejects(() => projectInvoke('project_repair_prepare', { projectId: importedId, artifactId: artifact.id }));
    await openReport();
    if (await inspect('return !document.querySelector("#repair-report").disabled')) {
      await click('#repair-report'); await until(() => inspect('return document.querySelector("#repair-status").dataset.error==="true"'), 'imported report blocked');
      assert.equal(await inspect('return document.querySelector("#repair-confirm").disabled'), true); await screenshot('repair-imported-rejected'); await closeRepair();
    } else await screenshot('repair-imported-disabled');
    assert.deepEqual(await readFile(file), bytes); await closeReport();
  });
  errors.push(...await inspect('return window.__repairErrors')); assert.deepEqual(errors, []);
  assert.equal(requests.length, beforeRequests, 'Repair must not invoke any model provider');
  await writeFile(resolve(run, 'repair-evidence.json'), JSON.stringify({ projectId, operationId, actualNativeCommands: true, byteExactUndoVerified: true, modelRequestsAdded: 0, errors }, null, 2));
}
