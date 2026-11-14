import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Real isolated Windows UI, native SQLite and filesystem; no invoke or dialog mocks.
export async function checkProjectRestore({ run, checked, click, fill, find, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests }) {
  const projectId = 'restore-source', directory = resolve(run, '恢复验收源码');
  await mkdir(directory); await writeFile(resolve(directory, 'app.json'), '{"pages":[]}');
  await writeFile(resolve(directory, 'app.js'), 'wx.getLocation({});');
  const sourceBefore = await readFile(resolve(directory, 'app.json'), 'utf8');
  const requestCount = requests.length, errors = [];
  const monitor = () => inspect('window.__restoreErrors=[];window.addEventListener("error",e=>window.__restoreErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__restoreErrors.push(String(e.reason?.message||e.reason)));');
  await monitor(); await command('POST', '/window/rect', { width: 1200, height: 850 });
  let backupJson, restoredId, archivePath, archivedSessionId;
  const status = () => text('#project-backup-status');
  const importFile = async path => {
    await command('POST', `/element/${await find('#project-import-file')}/value`, { text: path });
    await until(() => inspect('return !document.querySelector("#project-import-review").hidden && !document.querySelector("#project-import-directory").disabled'), 'project backup preview');
  };
  const restoreFile = async path => {
    await importFile(path); await fill('#project-import-path', directory);
    await until(() => inspect('return !document.querySelector("#project-import-confirm").disabled'), 'directory entered');
    await click('#project-import-confirm');
    await until(async () => /项目已追加恢复|此备份已恢复/.test(await status()), 'project restored');
  };
  await checked('Restore fixture uses actual native project, scan and exported backup', async () => {
    assert.equal((await projectInvoke('project_snapshot')).projects.length, 0);
    await projectInvoke('project_save', { project: { id: projectId, name: '恢复验收项目', directory, subject: 'personal' } });
    await projectInvoke('project_run', { projectId, kind: 'check', subject: 'personal', runId: 'restore-native-check' });
    backupJson = await projectInvoke('project_export', { projectId });
    const backup = JSON.parse(backupJson); assert.ok(backup.artifacts.length > 0);
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return !document.querySelector("#project-retry").disabled'), 'project registry loaded');
    await closeProjects(); await selectProject(projectId);
    await fill('#desktopInput', '恢复过程中保留的草稿');
    await projectDialog();
    await until(async () => /容量/.test(await text('#project-storage-status')), 'native storage capacity');
  });
  await checked('Malformed backup preserves projects and gives a retry path', async () => {
    const path = resolve(run, 'broken-project-backup.json'); await writeFile(path, '{broken');
    await command('POST', `/element/${await find('#project-import-file')}/value`, { text: path });
    await until(async () => /格式|解析|JSON/.test(await status()), 'malformed backup feedback');
    assert.equal((await projectInvoke('project_snapshot')).projects.length, 1);
    assert.equal(await inspect('return document.querySelector("#project-import-confirm").disabled'), true);
  });
  await checked('Preview and explicit path restore append without overwriting or changing the active draft', async () => {
    const path = resolve(run, 'project-backup.json'); await writeFile(path, backupJson);
    await importFile(path);
    assert.match(await text('#project-import-warnings'), /不覆盖.*外部历史/);
    assert.equal(await inspect('return document.querySelector("#project-import-confirm").disabled'), true);
    await screenshot('restore-preview');
    await fill('#project-import-path', directory); await click('#project-import-confirm');
    await until(async () => /项目已追加恢复/.test(await status()), 'append restore');
    const snapshot = await projectInvoke('project_snapshot');
    assert.equal(snapshot.projects.length, 2); assert.equal(snapshot.activeProjectId, projectId);
    restoredId = snapshot.projects.find(item => item.id !== projectId).id;
    assert.ok(snapshot.runs.filter(item => item.projectId === restoredId).every(item => item.provenance === 'imported' && item.state !== 'succeeded'));
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '恢复过程中保留的草稿');
    await closeProjects(); await selectProject(restoredId);
    await fill('#desktopInput', '待归档项目的会话草稿');
    archivedSessionId = await inspect('return document.querySelector("[data-action=recent-session][aria-current=true]").dataset.sessionId');
    await projectDialog();
    assert.match(await text('#project-history'), /导入|外部/);
    await screenshot('restored-history');
  });
  await checked('Imported report can be read but does not become a local verified comparison', async () => {
    assert.equal(await inspect('return document.querySelector("#project-compare").disabled'), true);
    await click('#project-history .project-run button');
    await until(() => inspect('return document.querySelector("#desktop-tools").open'), 'restored report visible');
    assert.match(await text('#report-note'), /外部导入.*未.*核验/);
    assert.match(await text('#report'), /外部|导入/);
    await screenshot('restored-report'); await click('#desktop-tools-close'); await projectDialog();
  });
  await checked('Archive cancellation is inert and confirmed archive saves a recoverable file before capacity drops', async () => {
    const before = await projectInvoke('project_storage_status');
    await click('#project-archive');
    await until(() => inspect('return !document.querySelector("#project-archive-review").hidden'), 'archive preview');
    await click('#project-archive-cancel');
    assert.equal((await projectInvoke('project_snapshot')).projects.length, 2);
    await click('#project-archive');
    await until(() => inspect('return !document.querySelector("#project-archive-confirm").disabled'), 'archive confirmation');
    await screenshot('archive-confirmation'); await click('#project-archive-confirm');
    await until(async () => /项目已归档。恢复文件：/.test(await status()), 'archive persisted');
    archivePath = (await status()).split('恢复文件：')[1].split('。会话内容')[0];
    const saved = await readFile(archivePath, 'utf8'); assert.ok(JSON.parse(saved).artifacts.length > 0);
    const after = await projectInvoke('project_storage_status');
    assert.equal(after.projects, before.projects - 1); assert.ok(after.runs < before.runs);
    assert.equal(await readFile(resolve(directory, 'app.json'), 'utf8'), sourceBefore);
    await screenshot('archive-recovery-path');
    await closeProjects();
    await click(`[data-action="recent-session"][data-session-id="${archivedSessionId}"]`);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '待归档项目的会话草稿');
    assert.equal((await projectInvoke('project_snapshot')).activeProjectId, null);
    await projectDialog();
  });
  await checked('Archive round trip and native restart preserve imported history without enabling tools', async () => {
    await restoreFile(archivePath);
    let snapshot = await projectInvoke('project_snapshot');
    assert.equal(snapshot.projects.length, 2); restoredId = snapshot.projects.find(item => item.id !== projectId).id;
    await closeProjects(); await selectProject(restoredId);
    errors.push(...await inspect('return window.__restoreErrors || []'));
    await quit(); await launch(); await monitor();
    snapshot = await projectInvoke('project_snapshot');
    assert.equal(snapshot.activeProjectId, restoredId);
    assert.ok(snapshot.artifacts.some(item => item.projectId === restoredId && item.provenance === 'imported'));
    assert.notEqual(await inspect('return document.querySelector("#desktop-agent-tools").dataset.enabled'), 'true');
    await projectDialog(); await command('POST', '/window/rect', { width: 390, height: 844 });
    assert.ok(await inspect('return document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector("#desktop-projects").scrollWidth<=document.querySelector("#desktop-projects").clientWidth+1'));
    await screenshot('restore-narrow'); await command('POST', '/window/rect', { width: 1200, height: 850 });
    await closeProjects();
    errors.push(...await inspect('return window.__restoreErrors || []')); assert.deepEqual(errors, []);
    assert.equal(requests.length, requestCount);
    await writeFile(resolve(run, 'restore-evidence.json'), JSON.stringify({ actualNativeStorage: true, archivePath, restoredId, sourceUnchanged: true, modelRequestsAdded: requests.length - requestCount, errors }, null, 2));
  });
}
