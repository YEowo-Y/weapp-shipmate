import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath, rename, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Real native SQLite, Node fs.watch and bundled scanner. Only timing fixtures
// wrap a disposable runtime copy; scanner results are never fabricated.
export async function checkMaintenanceFlows({ run, projectDatabase, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, isolatedDirectory, ownedRuntimeProcesses }) {
  const a = 'p7-maintenance-a', b = 'p7-maintenance-b';
  const directory = resolve(run, 'P7 自动维护项目 A'), otherDirectory = resolve(run, 'P7 自动维护项目 B');
  const baseSource = 'wx.getLocation({type:"wgs84"});\n';
  const requestSource = `${baseSource}wx.request({url:"http://maintenance.example.com/data"});\n`;
  const profileSource = `${requestSource}wx.getUserProfile({desc:"P7 labelled fixture"});\n`;
  const expectedSources = new Map();
  for (const root of [directory, otherDirectory]) {
    await mkdir(root); await mkdir(resolve(root, 'node_modules')); await mkdir(resolve(root, 'dist'));
    for (const [name, value] of Object.entries({
      'app.json': JSON.stringify({ pages: ['pages/index/index'], requiredPrivateInfos: ['getLocation'] }),
      'project.config.json': JSON.stringify({ appid: 'touristappid', miniprogramRoot: './' }),
      'app.js': baseSource, '.env': 'P7_LABELLED_NOT_A_SECRET=one\n',
      'node_modules/ignored.js': '// generated fixture\n', 'dist/ignored.js': '// generated fixture\n',
    })) { const path = resolve(root, name); await writeFile(path, value); expectedSources.set(path, value); }
  }
  const change = async (root, name, value) => { const path = resolve(root, name); await writeFile(path, value); expectedSources.set(path, value); };
  const project = () => projectInvoke('project_snapshot');
  const state = (projectId = a) => projectInvoke('project_maintenance_snapshot', { projectId });
  const checksFor = async (projectId = a) => (await project()).runs.filter(item => item.projectId === projectId && item.kind === 'check');
  const watching = (projectId = a) => until(async () => (await state(projectId)).state === 'watching', 'native watcher ready', 20000);
  const ready = () => until(() => inspect('const d=document.querySelector("#desktop-health"),w=document.querySelector("#maintenance-watch");return d?.open && d.getAttribute("aria-busy")!=="true" && w && !w.disabled;'), 'maintenance dialog loaded');
  const open = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="health"]'); await ready(); };
  const close = async () => { await click('#health-done'); await until(() => inspect('return !document.querySelector("#desktop-health").open'), 'maintenance dialog closed'); };
  const saveSettings = async (watchEnabled, notificationsEnabled, projectId = a) => {
    const previous = await state(projectId);
    if (await inspect('return document.querySelector("#maintenance-watch").checked') !== watchEnabled) await click('#maintenance-watch');
    if (await inspect('return document.querySelector("#maintenance-notifications").checked') !== notificationsEnabled) await click('#maintenance-notifications');
    await click('#maintenance-save');
    await until(async () => { const value = await state(projectId); return value.revision > previous.revision && value.watchEnabled === watchEnabled && value.notificationsEnabled === notificationsEnabled; }, 'project maintenance settings persisted');
    if (watchEnabled) await watching(projectId); else await until(async () => (await state(projectId)).state === 'off', 'watcher disabled');
  };
  const completedChange = async (work, projectId = a) => {
    const previous = (await checksFor(projectId)).length;
    await work();
    await until(async () => { const runs = await checksFor(projectId); return runs.length > previous && runs[0].state === 'succeeded' && (await state(projectId)).state === 'watching'; }, 'changed source produces real saved preflight', 30000);
    return projectInvoke('project_artifact', { artifactId: (await project()).artifacts.find(item => item.projectId === projectId && item.kind === 'check').id });
  };
  // Negative assertions sample repeatedly for 4.5 s: longer than the watcher
  // 3 s burst cap + 500 ms scheduler poll + 1 s root identity poll. This proves
  // suppression within a stated bounded observation, never indefinitely.
  const observeUnchanged = async (description, read, expected, duration = 4500) => {
    const started = Date.now();
    do { assert.deepEqual(await read(), expected, description); await delay(150); } while (Date.now() - started < duration);
    observations.push({ description, durationMs: Date.now() - started, passed: true });
  };
  const observations = [], visuals = {}, processCounts = {};
  const openPreferences = async () => {
    await click('#desktop-preferences-open'); await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'preferences dialog');
  };
  const closePreferences = async () => { await click('#preferences-content-dismiss'); await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'preferences closed'); };
  const appearance = () => inspect('return {theme:document.body.dataset.theme,size:document.body.style.getPropertyValue("--message-font-size"),motion:document.body.dataset.motion};');
  const geometry = selector => inspect('const d=document.querySelector(arguments[0]),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};', [selector]);
  const contained = value => { assert.ok(value.left >= -1 && value.right <= value.width + 1 && value.top >= -1 && value.bottom <= value.height + 1, JSON.stringify(value)); assert.ok(value.overflow <= 1 && value.pageOverflow <= 1, JSON.stringify(value)); };
  let baseline, firstNotice, savedNoticeCount, lastArtifact;

  await checked('P7 maintenance defaults off and file edits cannot silently run tools', async () => {
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    assert.equal((await project()).projects.length, 0);
    for (const [id, name, root] of [[a, 'P7 自动维护 A', directory], [b, 'P7 自动维护 B', otherDirectory]]) await projectInvoke('project_save', { project: { id, name, directory: root, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===3 && !document.querySelector("#project-retry").disabled'), 'maintenance projects loaded');
    await closeProjects(); await selectProject(a); await open();
    const initial = await state(); assert.equal(initial.watchEnabled, false); assert.equal(initial.notificationsEnabled, false); assert.equal(initial.state, 'off'); assert.deepEqual(initial.notices, []);
    assert.equal(await inspect('return document.querySelector("#desktop-maintenance-open").hidden'), true);
    assert.equal(await inspect('return document.querySelector("#maintenance-watch").checked || document.querySelector("#maintenance-notifications").checked'), false);
    await screenshot('p7-maintenance-default-off'); await close();
    await change(directory, 'app.js', `${baseSource}// changed while disabled\n`);
    await observeUnchanged('default off never scans source changes', async () => (await checksFor()).length, 0);
    processCounts.off = (await ownedRuntimeProcesses()).length;
  });

  await checked('External project changes preserve each maintenance draft without starting a watcher', async () => {
    await openPreferences(); await click('#preferences-nav-projects');
    const waitForProject = id => until(() => inspect(`
      const selector = document.querySelector('#project-settings-select');
      return selector?.value === arguments[0] && !selector.disabled &&
        document.querySelector('#maintenance-watch')?.checkVisibility() &&
        !document.querySelector('#maintenance-watch').disabled;
    `, [id]), 'maintenance settings ready for ' + id);
    const externalSwitch = async id => {
      await projectInvoke('project_select', { projectId: id });
      await click('#project-retry');
      await waitForProject(id);
    };
    await waitForProject(a);
    const beforeA = await state(a);
    await click('#maintenance-watch');
    await externalSwitch(b);
    const beforeB = await state(b);
    assert.equal(await inspect('return document.querySelector("#maintenance-watch").checked'), false);
    await click('#maintenance-notifications');
    await externalSwitch(a);
    assert.equal(await inspect('return document.querySelector("#maintenance-watch").checked'), true);
    assert.equal(await inspect('return document.querySelector("#maintenance-notifications").checked'), false);
    assert.match(await text('#maintenance-status'), /未保存/);
    await inspect('document.querySelector("#maintenance-status").scrollIntoView({block:"center"})');
    await screenshot('p7-restored-maintenance-draft');
    await click('#maintenance-discard');
    await externalSwitch(b);
    assert.equal(await inspect('return document.querySelector("#maintenance-notifications").checked'), true);
    await click('#maintenance-discard');
    const verifyNotSaved = async before => {
      const after = await state(before.projectId);
      assert.equal(after.revision, before.revision);
      assert.equal(after.watchEnabled, false);
      assert.equal(after.notificationsEnabled, false);
      assert.equal(after.state, 'off');
    };
    await verifyNotSaved(beforeB);
    await externalSwitch(a);
    assert.equal(await inspect('return document.querySelector("#maintenance-save").disabled'), true);
    await verifyNotSaved(beforeA);
    await closePreferences();
  });

  await checked('A stale maintenance save requires a fresh read before merging the local draft', async () => {
    const initial = await state();
    const base = await projectInvoke('project_maintenance_save', {
      projectId: a, expectedRevision: initial.revision, watchEnabled: false, notificationsEnabled: false,
    });
    await open(); await click('#maintenance-watch');

    // A separate writer in the disposable acceptance database reproduces a change
    // this WebView has not received. All recovery actions use the real UI and IPC.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(await realpath(projectDatabase));
    try {
      const key = 'project_maintenance:' + a;
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
      const external = JSON.parse(row.value);
      assert.equal(external.projectId, a);
      assert.equal(external.revision, base.revision);
      external.revision++; external.notificationsEnabled = true;
      const updated = db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').run(JSON.stringify(external), key, row.value);
      assert.equal(updated.changes, 1);
    } finally { db.close(); }

    await click('#maintenance-save');
    await until(async () => /先重新加载/.test(await text('#maintenance-status')), 'rejected save offers reload');
    assert.equal(await inspect('return document.querySelector("#maintenance-save").disabled'), true);
    assert.equal(await inspect('return document.querySelector("#maintenance-watch").checked'), true);
    await screenshot('p7-maintenance-save-conflict');
    await click('#maintenance-retry');
    await until(() => inspect('return !document.querySelector("#maintenance-save").disabled && document.querySelector("#maintenance-notifications").checked'), 'latest settings merge with the draft');
    const fresh = await state();
    assert.equal(fresh.revision, base.revision + 1);
    assert.equal(fresh.watchEnabled, false);
    await click('#maintenance-save');
    await until(async () => {
      const saved = await state();
      return saved.revision === fresh.revision + 1 && saved.watchEnabled && saved.notificationsEnabled;
    }, 'explicit save persists both changes');
    await ready();
    await saveSettings(false, false); await close();
  });

  await checked('P7 manual preflight establishes a real baseline and enabling watcher does not scan immediately', async () => {
    await click('#desktop-tools-toggle'); await click('#check-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#check-btn").disabled'), 'manual baseline preflight', 30000);
    baseline = await projectInvoke('project_artifact', { artifactId: (await project()).artifacts.find(item => item.kind === 'check').id });
    assert.deepEqual(baseline.data.result.items.map(item => item.ruleId).sort(), ['privacy.getLocation']);
    await click('#desktop-tools-close'); await open(); await saveSettings(true, true); await close();
    processCounts.watching = (await ownedRuntimeProcesses()).length;
    assert.ok(processCounts.watching > processCounts.off, 'enabling creates a separately owned watcher process');
    await observeUnchanged('enable only starts watcher and preserves baseline', async () => ({ runs: (await checksFor()).length, notices: (await state()).notices.length }), { runs: 1, notices: 0 });
  });

  await checked('P7 actual source change creates a comparable report and one source-linked new-problem notice', async () => {
    lastArtifact = await completedChange(() => change(directory, 'app.js', requestSource));
    assert.deepEqual(lastArtifact.data.scope, baseline.data.scope);
    const added = lastArtifact.data.result.items.map(item => item.ruleId).filter(id => !baseline.data.result.items.some(item => item.ruleId === id)).sort();
    assert.deepEqual(added, ['domain.request-whitelist', 'security.insecure-request']);
    const current = await state(); assert.equal(current.notices.length, 1); firstNotice = current.notices[0];
    assert.equal(firstNotice.artifactId, lastArtifact.id); assert.equal(firstNotice.newCount, 2); assert.equal(firstNotice.read, false); assert.ok(current.lastCheckedAt > 0);
    assert.equal(await inspect('return document.querySelector("#desktop-health").open || document.querySelector("#desktop-tools").open'), false, 'background completion does not open a modal or tools');
    await until(() => inspect('return !document.querySelector("#desktop-maintenance-open").hidden && Number.parseInt(document.querySelector("#desktop-maintenance-count").textContent,10)>0'), 'unread count exposes maintenance shortcut');
    await click('#desktop-maintenance-open'); await ready();
    await until(() => inspect('return Boolean(document.querySelector(arguments[0]))', [`[data-notice-id="${firstNotice.id}"]`]), 'source-linked notice rendered');
    assert.match(await text('#maintenance-last-check'), /最近预检记录/);
    const noticeState = await state();
    await click('#maintenance-notice-filter'); await press('\uE010'); await press('\uE007');
    assert.deepEqual(await inspect('return [...document.querySelectorAll("#maintenance-notices [data-notice-id]")].map(n=>n.dataset.noticeId)'), [firstNotice.id]);
    assert.deepEqual(await state(), noticeState, 'local filter does not mark reminders read or write settings');
    await inspect('document.querySelector("#maintenance-notices").scrollIntoView({block:"center",behavior:"instant"})');
    await screenshot('p7-maintenance-notice'); await click('#maintenance-read-all');
    await until(async () => (await state()).notices.every(item => item.read), 'read state persisted');
    await until(() => inspect('return document.querySelector("#desktop-maintenance-open").hidden'), 'read notices hide maintenance shortcut');
    assert.match(await text('#maintenance-notices'), /没有未读/);
    await click('#maintenance-notice-reset');
    assert.deepEqual(await inspect('return [...document.querySelectorAll("#maintenance-notices [data-notice-id]")].map(n=>n.dataset.noticeId)'), [firstNotice.id]);
    await close();
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-more', 'hidden unread shortcut falls back to a visible keyboard target');
    await open();
    await click(`[data-notice-id="${firstNotice.id}"]`);
    await until(() => inspect('return !document.querySelector("#desktop-health").open && document.querySelector("#desktop-tools").open'), 'notice opens its saved report');
    assert.equal(await text('#report-title'), '代码预检'); await click('#desktop-tools-close');
  });

  await checked('P7 duplicate findings and ignored generated or secret files cannot create repeated work or notices', async () => {
    savedNoticeCount = (await state()).notices.length;
    await completedChange(() => change(directory, 'app.js', `${requestSource}// same facts, different bytes\n`));
    assert.equal((await state()).notices.length, savedNoticeCount);
    const count = (await checksFor()).length;
    for (const name of ['node_modules/ignored.js', 'dist/ignored.js', '.env']) await change(directory, name, '// P7 labelled ignored-file edit\n');
    await observeUnchanged('known ignored generated and secret paths do not dispatch scans', async () => (await checksFor()).length, count);
  });

  await checked('P7 background report refresh preserves existing-project edits and an unsaved new-project form', async () => {
    const beforeProjects = (await project()).projects;
    for (const creating of [false, true]) {
      await projectDialog();
      if (creating) await click('#project-new');
      const draftName = creating ? 'P7 尚未保存的新项目草稿' : 'P7 尚未保存的项目名称修改';
      await fill('#project-name', draftName);
      const beforeRows = await inspect('return document.querySelectorAll("#project-history .project-run").length');
      await completedChange(() => change(directory, 'app.js', `${requestSource}// preserve ${creating ? 'new' : 'existing'} project form\n`));
      await until(() => inspect('return document.querySelectorAll("#project-history .project-run").length > arguments[0] && document.querySelector("#desktop-projects").getAttribute("aria-busy")!=="true"', [beforeRows]), 'background report reaches the real project-history UI');
      assert.equal(await inspect('return document.querySelector("#project-name").value'), draftName);
      assert.equal(await text('#project-editor-title'), creating ? '新建项目' : '项目设置');
      assert.equal(await inspect('return document.querySelector("#project-directory").value'), creating ? '' : beforeProjects.find(item => item.id === a).directory);
      assert.deepEqual((await project()).projects, beforeProjects, 'unsaved form text never becomes a native project mutation');
      await screenshot(creating ? 'p7-maintenance-new-project-draft' : 'p7-maintenance-project-draft');
      await click('#project-close');
      assert.equal(await inspect('return document.querySelector("#desktop-projects").open'), true, 'unsaved project draft blocks closing');
      await click('#project-discard'); await closeProjects();
    }
  });

  await checked('P7 notifications-off is persistent, independent of watching and never replays suppressed findings', async () => {
    await open(); await saveSettings(true, false); await close();
    const artifact = await completedChange(() => change(directory, 'app.js', profileSource));
    assert.ok(artifact.data.result.items.some(item => item.ruleId === 'privacy.getUserProfile'));
    assert.equal((await state()).notices.length, savedNoticeCount);
    await open(); await saveSettings(true, true); await close();
    await completedChange(() => change(directory, 'app.js', `${profileSource}// notifications re-enabled\n`));
    assert.equal((await state()).notices.length, savedNoticeCount);
    await completedChange(() => change(directory, 'extra.js', 'wx.chooseLocation({});\n'));
    assert.equal((await state()).notices.length, savedNoticeCount, 'changed file scope becomes a baseline, not a comparable new-problem notice');
  });

  await checked('P7 burst edits coalesce into at most two real checks instead of one check per event', async () => {
    const before = (await checksFor()).length;
    for (let index = 0; index < 30; index++) await change(directory, 'app.js', `${profileSource}// burst ${index}\n`);
    await until(async () => (await checksFor()).length > before && (await checksFor())[0].state === 'succeeded' && (await state()).state === 'watching', 'coalesced burst completes', 30000);
    await observeUnchanged('burst settles without unbounded followup checks', async () => { const count = (await checksFor()).length - before; assert.ok(count >= 1 && count <= 2, `burst created ${count} runs`); return (await state()).notices.length; }, savedNoticeCount);
  });

  await checked('P7 global tool lock, stop, disabling and switching cancel only owned automatic work', async () => {
    const root = await realpath(isolatedDirectory), cli = await realpath(resolve(root, 'runtime/src/project-tool.mjs'));
    const owned = relative(root, cli); assert.ok(owned && !owned.startsWith('..') && !isAbsolute(owned));
    const original = await readFile(cli), originalPath = resolve(dirname(cli), 'p7-maintenance-original.mjs');
    const guideMarker = resolve(dirname(cli), 'p7-maintenance-guide-started'), checkMarker = resolve(dirname(cli), 'p7-maintenance-check-started');
    await writeFile(originalPath, original);
    const hold = kind => `// Labelled timing-only fixture in disposable runtime; original scanner runs for all other kinds.\nimport {writeFileSync} from 'node:fs';\nif(process.argv[2]===${JSON.stringify(kind)}){writeFileSync(new URL('./p7-maintenance-${kind}-started',import.meta.url),String(Date.now()));await new Promise(resolve=>setTimeout(resolve,60000));}\nawait import('./p7-maintenance-original.mjs');\n`;
    try {
      await writeFile(cli, hold('guide')); await click('#desktop-tools-toggle'); await click('#guide-btn');
      await until(async () => (await stat(guideMarker)).isFile(), 'actual native manual guide child started');
      const count = (await checksFor()).length;
      await change(directory, 'app.js', `${profileSource}// queued behind manual guide\n`);
      await until(async () => (await state()).state === 'pending', 'automatic check pending behind global tool lock', 15000);
      assert.equal((await checksFor()).length, count);
      assert.equal((await project()).runs.filter(item => item.state === 'running').length, 1);
      const manualRunId = (await project()).runs.find(item => item.kind === 'guide' && item.state === 'running').id;
      await open(); await until(() => inspect('return !document.querySelector("#maintenance-stop").disabled'), 'pending automatic stop control'); await click('#maintenance-stop');
      await until(async () => (await state()).state === 'watching', 'pending stop clears queued automatic work');
      assert.ok((await project()).runs.some(item => item.id === manualRunId && item.state === 'running'), 'pending stop never cancels an unrelated manual tool');
      await close();
      await change(directory, 'app.js', `${profileSource}// new event queues after explicit pending stop\n`);
      await until(async () => (await state()).state === 'pending', 'later file change can enqueue again');
      await click('#stop-tool');
      await until(async () => (await checksFor()).length > count && (await checksFor())[0].state === 'succeeded' && (await state()).state === 'watching', 'pending check executes after manual cancellation', 30000);
      assert.ok((await project()).runs.some(item => item.kind === 'guide' && item.state === 'canceled'));
      await click('#desktop-tools-close');
      await writeFile(cli, hold('check')); await change(directory, 'app.js', `${profileSource}// controlled automatic cancellation\n`);
      await until(async () => (await stat(checkMarker)).isFile() && (await state()).state === 'checking', 'actual automatic check child started');
      const runId = (await state()).runId; assert.ok(runId);
      await open(); await until(() => inspect('return !document.querySelector("#maintenance-stop").disabled'), 'automatic stop control'); await click('#maintenance-stop');
      await until(async () => (await project()).runs.some(item => item.id === runId && item.state === 'canceled') && (await state()).state === 'watching', 'automatic cancellation returns to watching');
      await close();

      let marker = await readFile(checkMarker, 'utf8');
      await change(directory, 'app.js', `${profileSource}// disable while automatic child is running\n`);
      await until(async () => { const current = await state(); return current.state === 'checking' && current.runId !== runId && await readFile(checkMarker, 'utf8') !== marker; }, 'second automatic child actually running');
      const disabledRunId = (await state()).runId; assert.ok(disabledRunId);
      await open(); await saveSettings(false, true);
      await until(async () => (await project()).runs.some(item => item.id === disabledRunId && item.state === 'canceled'), 'disabling cancels in-flight automatic child');
      const disabledCount = (await checksFor()).length;
      await observeUnchanged('disabling during execution clears pending followup work', async () => ({ count: (await checksFor()).length, state: (await state()).state }), { count: disabledCount, state: 'off' });

      await saveSettings(true, true); await close(); marker = await readFile(checkMarker, 'utf8');
      await change(directory, 'app.js', `${profileSource}// switch while automatic child is running\n`);
      await until(async () => { const current = await state(); return current.state === 'checking' && current.runId !== disabledRunId && await readFile(checkMarker, 'utf8') !== marker; }, 'third automatic child actually running');
      const switchedRunId = (await state()).runId; assert.ok(switchedRunId);
      await selectProject(b);
      await until(async () => (await project()).runs.some(item => item.id === switchedRunId && item.state === 'canceled') && (await state(b)).state === 'off', 'project switch cancels old automatic child without enabling new project');
      await selectProject(a); await watching();
      const switchedCount = (await checksFor()).length;
      await observeUnchanged('returning to previous project never replays canceled work', async () => ({ count: (await checksFor()).length, state: (await state()).state }), { count: switchedCount, state: 'watching' });
      await open(); await saveSettings(false, true); await close();
    } finally { await writeFile(cli, original); }
    const count = (await checksFor()).length;
    await change(directory, 'app.js', `${profileSource}// changed after disabling watcher\n`);
    await observeUnchanged('disabled watcher has no queued or newly triggered automatic work', async () => (await checksFor()).length, count);
    await until(async () => (await ownedRuntimeProcesses()).length < processCounts.watching, 'disable releases watcher process');
    processCounts.disabled = (await ownedRuntimeProcesses()).length;
    assert.ok(processCounts.disabled < processCounts.watching, 'disable releases the separately owned watcher');
  });

  await checked('P7 project switches detach the old watcher and first report in another project is only a baseline', async () => {
    await open(); await saveSettings(true, true); await close();
    await selectProject(b); assert.equal((await state(b)).watchEnabled, false);
    const aCount = (await checksFor(a)).length;
    await change(directory, 'app.js', `${profileSource}// inactive project edit\n`);
    await observeUnchanged('inactive project events cannot dispatch old-scope runs', async () => (await checksFor(a)).length, aCount);
    await assert.rejects(state(a));
    await open(); await saveSettings(true, true, b); await close();
    await completedChange(() => change(otherDirectory, 'app.js', requestSource), b); assert.deepEqual((await state(b)).notices, []);
    await selectProject(a); await watching(); const bCount = (await checksFor(b)).length;
    await change(otherDirectory, 'app.js', `${requestSource}// inactive B edit\n`);
    await observeUnchanged('returning to A detaches B watcher', async () => (await checksFor(b)).length, bCount);
    await completedChange(() => change(directory, 'app.js', `${profileSource}// active A edit\n`));
  });

  await checked('P7 moved project directory pauses with recovery and explicit retry never invents a scan', async () => {
    const root = await realpath(run), moved = resolve(run, 'P7 临时移动项目 A');
    for (const path of [await realpath(directory), moved]) { const inside = relative(root, path); assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside)); }
    const count = (await checksFor()).length;
    await rename(directory, moved);
    try {
      await until(async () => ['paused', 'error'].includes((await state()).state), 'watcher detects missing bound directory', 15000);
      await open(); await screenshot('p7-maintenance-directory-error');
    } finally { await rename(moved, directory); }
    await click('#maintenance-retry'); await watching(); await close();
    await observeUnchanged('retry starts watcher but does not silently recheck files', async () => (await checksFor()).length, count);
    lastArtifact = await completedChange(() => change(directory, 'app.js', `${profileSource}// recovered watcher\n`));
  });

  await checked('P7 appearance controls apply actual dark theme, text size and reduced motion and survive process restart', async () => {
    await openPreferences();
    await click('#desktop-theme-dark'); await click('#desktop-message-size-18'); await click('#desktop-motion-reduce');
    assert.deepEqual(await appearance(), { theme: 'dark', size: '18px', motion: 'reduce' }); assert.match(await text('#preferences-status'), /已保存/);
    assert.equal(await inspect('return getComputedStyle(document.querySelector("#report")).fontSize'), '18px');
    await screenshot('p7-preferences-dark'); await closePreferences();
    const before = await state(), count = (await checksFor()).length;
    await quit(); await launch(); await watching();
    assert.deepEqual(await appearance(), { theme: 'dark', size: '18px', motion: 'reduce' });
    assert.equal(await inspect('return getComputedStyle(document.querySelector("#report")).fontSize'), '18px');
    const restored = await state(); assert.equal(restored.watchEnabled, true); assert.equal(restored.notificationsEnabled, true); assert.deepEqual(restored.notices, before.notices);
    await observeUnchanged('restart restores enabled watcher without replaying checks or notifications', async () => ({ runs: (await checksFor()).length, notices: (await state()).notices }), { runs: count, notices: before.notices });
    await open(); await screenshot('p7-maintenance-dark-restored'); await close();
    await openPreferences(); assert.equal(await inspect('return document.querySelector("#desktop-theme-dark").getAttribute("aria-checked")==="true"'), true); await closePreferences();
  });

  await checked('P7 appearance follows system media, resets only appearance and keeps responsive keyboard focus', async () => {
    await openPreferences(); await click('#desktop-theme-system'); await click('#desktop-motion-system');
    try {
      await command('POST', '/ms/cdp/execute', { cmd: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] } });
      await until(async () => (await appearance()).theme === 'light' && (await appearance()).motion === 'system', 'appearance follows system light and motion');
      await command('POST', '/ms/cdp/execute', { cmd: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] } });
      await until(async () => (await appearance()).theme === 'dark' && (await appearance()).motion === 'reduce', 'appearance follows system dark and reduced motion');
      await click('#preferences-reset'); assert.match(await text('#preferences-status'), /已恢复外观默认/);
      assert.equal((await appearance()).size, '16px'); assert.equal((await state()).watchEnabled, true); assert.equal((await state()).notificationsEnabled, true);
      assert.equal(await inspect('return getComputedStyle(document.querySelector("#report")).fontSize'), '16px');
      assert.equal(await inspect('return document.querySelector("#desktop-theme-system").getAttribute("aria-checked")==="true" && document.querySelector("#desktop-motion-system").getAttribute("aria-checked")==="true"'), true);
      visuals.preferencesWide = await geometry('#desktop-preferences'); contained(visuals.preferencesWide); await screenshot('p7-preferences-wide');
      await command('POST', '/window/rect', { width: 390, height: 844 });
      await inspect('document.querySelector("#preferences-reset").focus()'); await press('\uE004'); assert.equal(await inspect('return document.activeElement.id'), 'preferences-categories');
      await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE008' }, { type: 'keyDown', value: '\uE004' }, { type: 'keyUp', value: '\uE004' }, { type: 'keyUp', value: '\uE008' }] }] });
      assert.equal(await inspect('return document.activeElement.id'), 'preferences-reset');
      for (let index = 0; index < 14; index++) { await press('\uE004'); assert.equal(await inspect('return document.querySelector("#desktop-preferences").contains(document.activeElement)'), true); }
      visuals.preferencesNarrow = await geometry('#desktop-preferences'); contained(visuals.preferencesNarrow); await screenshot('p7-preferences-narrow');
      await closePreferences(); await command('POST', '/window/rect', { width: 1200, height: 850 });
    } finally { await command('POST', '/ms/cdp/execute', { cmd: 'Emulation.setEmulatedMedia', params: { features: [] } }); }
  });

  await checked('P7 settings embed real maintenance, model, data and project controls without duplicate dialogs or forms', async () => {
    for (const [section, target, control] of [
      ['projects', '.maintenance-panel', '#maintenance-watch'], ['models', '.desktop-model-panel', '#desktop-model-search'],
      ['data', '.session-workspace-data-panel', '[data-action="backup-file"]'], ['projects', '.project-settings-panel', '#project-form'],
    ]) {
      await openPreferences(); await click(`#preferences-nav-${section}`);
      await until(() => inspect('const d=document.querySelector("#desktop-preferences"),p=d.querySelector(arguments[1]);return d.open && d.dataset.section===arguments[0] && p?.checkVisibility() && !d.querySelector("[aria-busy=true]") && Boolean(p.querySelector(arguments[2]));', [section, target, control]), `settings mounts ${target}`);
      assert.equal(await inspect('return document.querySelector("#desktop-preferences").matches(":modal") && document.querySelectorAll("dialog[open]").length===1'), true, 'settings remains the only open dialog');
      assert.equal(await inspect('return document.querySelectorAll(arguments[0]).length', [control]), 1, 'embedded controls reuse one instance');
      await closePreferences();
      assert.equal(await inspect('return Boolean(document.querySelector(arguments[0])?.checkVisibility())', [target]), false, `close ${target}`);
    }
    await open(); visuals.maintenanceWide = await geometry('#desktop-health'); contained(visuals.maintenanceWide); await screenshot('p7-maintenance-wide');
    await command('POST', '/window/rect', { width: 390, height: 844 }); visuals.maintenanceNarrow = await geometry('#desktop-health'); contained(visuals.maintenanceNarrow); await screenshot('p7-maintenance-narrow');
    await inspect('document.querySelector("#maintenance-notice-filter").scrollIntoView({block:"start",behavior:"instant"})'); await screenshot('p7-maintenance-notices-narrow');
    await close(); await command('POST', '/window/rect', { width: 1200, height: 850 });
  });

  await checked('P7 maintenance links preserve drafts and connect both settings destinations without changing preferences', async () => {
    const before = await state(), globalBefore = await projectInvoke('system_notifications_snapshot');
    await open(); await click('#maintenance-watch'); await click('#maintenance-system-settings');
    assert.equal(await inspect('return document.querySelector("#desktop-health").open'), true);
    assert.match(await text('#maintenance-status'), /尚未保存/);
    await click('#maintenance-discard'); await click('#maintenance-system-settings');
    await until(() => inspect('return document.querySelector("#desktop-preferences").dataset.section==="notifications" && !document.querySelector("#system-notifications-project").disabled'), 'system notification settings reached');
    assert.equal(await inspect('return document.querySelector("#desktop-health").open'), false);
    await click('#system-notifications-project');
    await until(() => inspect('return document.querySelector("#desktop-preferences").dataset.section==="projects" && !document.querySelector("#maintenance-watch").disabled'), 'project reminders reached');
    assert.deepEqual(await state(), before); assert.deepEqual(await projectInvoke('system_notifications_snapshot'), globalBefore);
    await screenshot('p7-maintenance-settings-linked'); await closePreferences();
  });

  await checked('P7 maintenance leaves project content intact, keeps zero model requests and exits with an owned watcher', async () => {
    for (const [path, expected] of expectedSources) assert.equal(await readFile(path, 'utf8'), expected, path);
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: baseline.id }), baseline);
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: lastArtifact.id }), lastArtifact);
    assert.equal(requests.length, 0); assert.deepEqual(await inspect('return window.__maintenanceAcceptanceErrors'), []);
    assert.equal((await state()).state, 'watching'); assert.ok((await ownedRuntimeProcesses()).length > 0);
    await writeFile(resolve(run, 'maintenance-visuals.json'), JSON.stringify(visuals, null, 2));
    await writeFile(resolve(run, 'maintenance-observations.json'), JSON.stringify({ observations, processCounts, systemNotifications: 'OS permission, visible delivery and installed application identity are not exercised; app-local notices only.' }, null, 2));
    // Harness quit verifies all exact-path runtime children and this run's
    // isolated WebView2 profile have exited; no unrelated process is killed.
  });
}
