import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Actual Windows plugin submission, SQLite, watcher, scanner and WebView2.
// No notification mock, OS-policy change, app registration or visible-toast claim.
export async function checkSystemNotificationFlows({ run, checked, click, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, ownedRuntimeProcesses }) {
  const projectId = 'p7-notifications-project';
  const directory = resolve(run, 'P7 系统通知验收项目');
  const base = 'wx.getLocation({type:"wgs84"});\n';
  const network = `${base}wx.request({url:"http://notifications.example.com/data"});\n`;
  const profile = `${network}wx.getUserProfile({desc:"Labelled P7 notification fixture"});\n`;
  const location = `${profile}wx.chooseLocation({});\n`;
  const address = `${location}wx.chooseAddress({});\n`;
  const files = {
    'app.json': JSON.stringify({ pages: ['pages/index/index'], requiredPrivateInfos: ['getLocation'] }),
    'project.config.json': JSON.stringify({ appid: 'touristappid', miniprogramRoot: './' }),
    'app.js': base,
  };
  await mkdir(directory);
  for (const [name, content] of Object.entries(files)) await writeFile(resolve(directory, name), content);
  const change = async content => { files['app.js'] = content; await writeFile(resolve(directory, 'app.js'), content); };
  const snapshot = () => projectInvoke('system_notifications_snapshot');
  const project = () => projectInvoke('project_snapshot');
  const maintenance = () => projectInvoke('project_maintenance_snapshot', { projectId });
  const runs = async () => (await project()).runs.filter(item => item.projectId === projectId && item.kind === 'check');
  const watching = () => until(async () => (await maintenance()).state === 'watching', 'notification fixture watcher ready', 20000);
  const observations = [], outcomes = [], visuals = {};
  const quiet = async (description, read, expected, duration = 4500) => {
    // Bounded suppression evidence, longer than watcher burst/dispatch settling.
    const start = Date.now();
    do { assert.deepEqual(await read(), expected, description); await delay(150); } while (Date.now() - start < duration);
    observations.push({ description, durationMs: Date.now() - start });
  };
  const ready = () => until(() => inspect('const d=document.querySelector("#desktop-preferences"),s=document.querySelector(".system-notifications"),t=document.querySelector("#system-notifications-enabled");return d?.open && s?.getAttribute("aria-busy")==="false" && t&&!t.disabled;'), 'native system-notification settings ready');
  const scrollEvidence = [];
  const settingGeometry = selector => inspect(`
    const control=document.querySelector(arguments[0]),body=control.closest('.context-body'),header=document.querySelector('#desktop-preferences .preferences-content-header');
    const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const target=bounds(control),bodyRect=bounds(body),headerRect=bounds(header),hit=document.elementFromPoint((target.left+target.right)/2,(target.top+target.bottom)/2);
    return {target,body:bodyRect,header:headerRect,bodyScrollTop:body.scrollTop,bodyScrollHeight:body.scrollHeight,bodyClientHeight:body.clientHeight,
      bodyOverflowY:getComputedStyle(body).overflowY,headerPosition:getComputedStyle(header).position,
      hit:hit?{tag:hit.tagName,id:hit.id,className:hit.className}:null,
      clickable:target.width>0&&target.height>0&&!control.disabled&&target.top>=bodyRect.top&&target.bottom<=bodyRect.bottom&&target.top>=headerRect.bottom&&
        target.left>=0&&target.right<=innerWidth&&target.top>=0&&target.bottom<=innerHeight&&(hit===control||control.contains(hit))};
  `, [selector]);
  const clickSetting = async selector => {
    const entry = { selector, before: await settingGeometry(selector), after: null }; scrollEvidence.push(entry);
    await writeFile(resolve(run, 'system-notification-scroll.json'), JSON.stringify(scrollEvidence, null, 2));
    // Center only the actual settings target inside its natural scrollport.
    // A layout obstruction still fails; the subsequent click is native WebDriver.
    await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})', [selector]);
    try {
      await until(async () => { entry.after = await settingGeometry(selector); return entry.after.clickable; }, 'notification setting is visible inside the scrollport and unobstructed', 3000);
    } finally { await writeFile(resolve(run, 'system-notification-scroll.json'), JSON.stringify(scrollEvidence, null, 2)); }
    await click(selector);
  };
  const open = async () => {
    await click('#desktop-preferences-open'); await click('#preferences-nav-notifications'); await ready();
  };
  const close = async () => { await click('#preferences-content-dismiss'); await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'preferences closed'); };
  const reload = async () => { await clickSetting('#system-notifications-reload'); await ready(); };
  const enabled = async value => {
    const before = await snapshot();
    assert.notEqual(before.enabled, value, 'fixture toggles require an actual preference change');
    await clickSetting('#system-notifications-enabled');
    await until(async () => { const state = await snapshot(); return state.revision > before.revision && state.enabled === value; }, 'notification preference persisted'); await ready();
    assert.equal(await inspect('return document.querySelector("#system-notifications-enabled").checked'), value);
    assert.deepEqual((await snapshot()).lastAttempt, before.lastAttempt, 'saving permission preference does not send a notification');
    return snapshot();
  };
  const openHealth = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="health"]'); await until(() => inspect('return document.querySelector("#desktop-health").open && !document.querySelector("#maintenance-watch").disabled'), 'project maintenance ready'); };
  const closeHealth = async () => { await click('#health-done'); await until(() => inspect('return !document.querySelector("#desktop-health").open'), 'maintenance closed'); };
  const maintenanceSettings = async (watchEnabled, notificationsEnabled) => {
    const before = await maintenance();
    if (await inspect('return document.querySelector("#maintenance-watch").checked') !== watchEnabled) await click('#maintenance-watch');
    if (await inspect('return document.querySelector("#maintenance-notifications").checked') !== notificationsEnabled) await click('#maintenance-notifications');
    await click('#maintenance-save');
    await until(async () => { const state = await maintenance(); return state.revision > before.revision && state.watchEnabled === watchEnabled && state.notificationsEnabled === notificationsEnabled; }, 'project notification settings saved');
    if (watchEnabled) await watching();
  };
  const completedChange = async content => {
    const before = (await runs()).length; await change(content);
    await until(async () => { const list = await runs(); return list.length > before && list[0].state === 'succeeded' && (await maintenance()).state === 'watching'; }, 'real changed-source preflight completed', 30000);
    return projectInvoke('project_artifact', { artifactId: (await project()).artifacts.find(item => item.kind === 'check' && item.projectId === projectId).id });
  };
  const actualAttempt = (value, kind, noticeId) => {
    assert.ok(value.lastAttempt); assert.equal(value.lastAttempt.kind, kind); assert.equal(value.lastAttempt.noticeId, noticeId);
    assert.ok(Number.isInteger(value.lastAttempt.attemptedAt) && value.lastAttempt.attemptedAt > 0);
    assert.ok(['submitted', 'failed', 'permission_required'].includes(value.lastAttempt.outcome));
    assert.equal(value.delivery, value.lastAttempt.outcome);
    outcomes.push({ ...value.lastAttempt, installationRequired: value.installationRequired, permission: value.permission, message: value.message, visibleDeliveryVerified: false });
  };
  const geometry = () => inspect('const d=document.querySelector("#desktop-preferences"),s=document.querySelector(".system-notifications"),r=d.getBoundingClientRect(),q=s.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,sectionWidth:q.width,sectionOverflow:s.scrollWidth-s.clientWidth};');
  const contained = value => { assert.ok(value.left >= -1 && value.right <= value.width + 1 && value.top >= -1 && value.bottom <= value.height + 1, JSON.stringify(value)); assert.ok(value.overflow <= 1 && value.pageOverflow <= 1 && value.sectionOverflow <= 1, JSON.stringify(value)); };
  let baseline, firstNotice, systemNotice, systemAttempt;

  await checked('P7 system notifications default off; opening, reading and restart do not submit', async () => {
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    const initial = await snapshot(); assert.equal(initial.schemaVersion, 1); assert.equal(initial.enabled, false); assert.equal(initial.lastAttempt, null);
    assert.equal(initial.permission, 'granted', 'Windows plugin reports granted; this does not inspect Windows notification settings');
    assert.equal(initial.installationRequired, true, 'Windows identity requirement is disclosed, not detected as satisfied');
    await open(); assert.equal(await inspect('return document.querySelector("#system-notifications-enabled").checked'), false);
    assert.equal(await inspect('return document.querySelector("#system-notifications-test").disabled'), true);
    assert.match(await text('#system-notifications-installation'), /不代表.*显示/);
    await reload(); await reload();
    await quiet('settings queries do not create notification attempts', async () => (await snapshot()).lastAttempt, null, 1200);
    await screenshot('p7-notifications-default-off'); await close(); await quit(); await launch();
    assert.equal((await snapshot()).enabled, false); assert.equal((await snapshot()).lastAttempt, null);
  });

  await checked('P7 explicit opt-in uses native CAS; conflicts preserve state and recover by rereading', async () => {
    await open(); const before = await snapshot(); await enabled(true);
    const saved = await snapshot();
    await assert.rejects(projectInvoke('system_notifications_save', { expectedRevision: before.revision, enabled: false }), /冲突|变化|改变|版本|重新|刷新|conflict|revision/i);
    assert.deepEqual(await snapshot(), saved);
    // A second actual native writer simulates a settings window race. UI must
    // keep the persisted newer setting until a deliberate refreshed operation.
    await projectInvoke('system_notifications_save', { expectedRevision: saved.revision, enabled: false });
    await clickSetting('#system-notifications-enabled'); await ready();
    assert.equal(await inspect('return document.querySelector("#system-notifications-status").dataset.error'), 'true');
    assert.equal((await snapshot()).enabled, false); assert.equal((await snapshot()).lastAttempt, null);
    await screenshot('p7-notifications-cas-recovery'); await reload();
    assert.equal(await inspect('return document.querySelector("#system-notifications-enabled").checked'), false);
    await enabled(true);
  });

  await checked('P7 explicit test reports actual plugin outcome without claiming a visible Windows toast', async () => {
    const before = await snapshot(); assert.equal(before.lastAttempt, null);
    await clickSetting('#system-notifications-test');
    await until(async () => (await snapshot()).lastAttempt?.kind === 'test', 'actual official plugin test attempt recorded', 20000); await ready();
    const result = await snapshot(); actualAttempt(result, 'test', null);
    if (result.delivery === 'submitted') {
      assert.match(await text('#system-notifications-status'), /已提交.*系统/);
      assert.match(await text('#system-notifications-status'), /是否显示|勿扰/);
      assert.equal(await inspect('return document.querySelector("#system-notifications-status").dataset.error'), 'false');
    } else assert.equal(await inspect('return document.querySelector("#system-notifications-status").dataset.error'), 'true');
    await screenshot('p7-notifications-real-plugin-outcome');
    await enabled(false); assert.equal(await inspect('return document.querySelector("#system-notifications-test").disabled'), true);
    const disabled = await projectInvoke('system_notifications_test'); assert.equal(disabled.delivery, 'disabled'); assert.deepEqual(disabled.lastAttempt, result.lastAttempt);
    await quiet('disabled tests do not create another OS submission attempt', async () => (await snapshot()).lastAttempt, result.lastAttempt, 1200);
    await close();
  });

  await checked('P7 system-off still saves real maintenance notices and opens their reports', async () => {
    assert.equal((await project()).projects.length, 0);
    await projectInvoke('project_save', { project: { id: projectId, name: 'P7 系统通知夹具', directory, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===2 && !document.querySelector("#project-retry").disabled'), 'notification fixture project loaded');
    await closeProjects(); await selectProject(projectId);
    await click('#desktop-tools-toggle'); await click('#check-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#check-btn").disabled'), 'baseline scanner report', 30000);
    baseline = await projectInvoke('project_artifact', { artifactId: (await project()).artifacts.find(item => item.kind === 'check').id });
    assert.deepEqual(baseline.data.result.items.map(item => item.ruleId).sort(), ['privacy.getLocation']);
    await click('#desktop-tools-close'); await openHealth(); await maintenanceSettings(true, true); await closeHealth();
    const before = (await snapshot()).lastAttempt;
    const artifact = await completedChange(network); firstNotice = (await maintenance()).notices[0];
    assert.equal(firstNotice.artifactId, artifact.id); assert.equal(firstNotice.newCount, 2);
    assert.deepEqual((await snapshot()).lastAttempt, before, 'system preference does not suppress app-local reminder persistence');
    await openHealth(); await click(`[data-notice-id="${firstNotice.id}"]`);
    await until(() => inspect('return !document.querySelector("#desktop-health").open && document.querySelector("#desktop-tools").open'), 'app-local notice opens saved report');
    assert.equal(await text('#report-title'), '代码预检'); await screenshot('p7-notifications-app-report'); await click('#desktop-tools-close');
  });

  await checked('P7 enabling system delivery never replays an existing app-local reminder', async () => {
    const before = (await snapshot()).lastAttempt, count = (await maintenance()).notices.length;
    await open(); await enabled(true); await close();
    await completedChange(`${network}// same findings after system opt-in\n`);
    assert.equal((await maintenance()).notices.length, count);
    await quiet('opt-in plus identical findings do not replay old reminders', async () => (await snapshot()).lastAttempt, before);
  });

  await checked('P7 real watcher new-problem notice triggers one recorded official plugin attempt and keeps the report', async () => {
    const before = await snapshot();
    const artifact = await completedChange(profile);
    systemNotice = (await maintenance()).notices.find(item => item.artifactId === artifact.id);
    assert.ok(systemNotice); assert.equal(systemNotice.newCount, 1); assert.equal(systemNotice.read, false);
    await until(async () => (await snapshot()).lastAttempt?.noticeId === systemNotice.id, 'new notice dispatch outcome recorded', 20000);
    const result = await snapshot(); actualAttempt(result, 'notice', systemNotice.id); systemAttempt = result.lastAttempt;
    assert.equal(result.revision, before.revision, 'background delivery does not change preference CAS revision');
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: artifact.id }), artifact, 'system outcome cannot replace or remove the successful report');
    assert.ok((await maintenance()).notices.some(item => item.id === systemNotice.id), 'app-local notice remains available regardless of system outcome');
    assert.equal((await runs())[0].state, 'succeeded');
    await open(); await reload();
    assert.match(await text('#system-notifications-last-attempt'), /最近维护通知尝试/);
    assert.match(await text('#system-notifications-last-attempt'), result.delivery === 'submitted' ? /已提交.*不代表实际显示/ : /失败|权限/);
    await screenshot('p7-notifications-watch-delivery-state'); await close();
    await openHealth(); await screenshot('p7-notifications-watch-app-notice'); await closeHealth();
  });

  await checked('P7 identical scans, rereads and read markers do not duplicate system submissions', async () => {
    const count = (await maintenance()).notices.length;
    await completedChange(`${profile}// duplicate facts only\n`); assert.equal((await maintenance()).notices.length, count);
    await openHealth(); await click('#maintenance-read-all');
    await until(async () => (await maintenance()).notices.every(item => item.read), 'app notices marked read'); await closeHealth();
    await open(); await reload(); await reload(); await close();
    await quiet('duplicate events and read operations retain last system attempt', async () => (await snapshot()).lastAttempt, systemAttempt);
  });

  await checked('P7 native restart preserves device preference and dedup state without replay', async () => {
    const before = await snapshot(), notices = (await maintenance()).notices, count = (await runs()).length;
    await quit(); await launch(); await watching();
    assert.equal((await snapshot()).enabled, true); assert.equal((await snapshot()).revision, before.revision);
    assert.deepEqual((await snapshot()).lastAttempt, systemAttempt); assert.deepEqual((await maintenance()).notices, notices);
    await quiet('restart restores watcher without replaying system notifications or scans', async () => ({ attempt: (await snapshot()).lastAttempt, runs: (await runs()).length }), { attempt: systemAttempt, runs: count });
    await completedChange(`${profile}// same findings after restart\n`);
    assert.deepEqual((await snapshot()).lastAttempt, systemAttempt);
  });

  await checked('P7 application reminder and system delivery switches remain independent', async () => {
    const beforeCount = (await maintenance()).notices.length;
    await openHealth(); await maintenanceSettings(true, false); await closeHealth();
    const suppressed = await completedChange(location); assert.ok(suppressed.data.result.items.some(item => item.ruleId === 'privacy.chooseLocation'));
    assert.equal((await maintenance()).notices.length, beforeCount); assert.deepEqual((await snapshot()).lastAttempt, systemAttempt);
    await openHealth(); await maintenanceSettings(true, true); await closeHealth();
    await open(); await enabled(false); await close();
    const artifact = await completedChange(address); const appOnly = (await maintenance()).notices.find(item => item.artifactId === artifact.id);
    assert.ok(appOnly); assert.equal(appOnly.newCount, 1); assert.deepEqual((await snapshot()).lastAttempt, systemAttempt);
    await quiet('global off leaves app-local new reminders without OS attempts', async () => (await snapshot()).lastAttempt, systemAttempt);
  });

  await checked('P7 notification controls share actual dark styling and retain narrow keyboard navigation', async () => {
    await open(); await click('#preferences-nav-appearance'); await clickSetting('#desktop-theme-dark'); await clickSetting('#desktop-motion-reduce'); await click('#preferences-nav-notifications'); await ready();
    assert.equal(await inspect('return document.body.dataset.theme'), 'dark');
    await inspect('document.querySelector("#system-notifications-enabled").scrollIntoView({block:"center"})');
    visuals.darkWide = await geometry(); contained(visuals.darkWide); await screenshot('p7-notifications-dark-wide');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await inspect('document.querySelector("#system-notifications-enabled").focus()');
    assert.equal(await inspect('return document.activeElement.id'), 'system-notifications-enabled');
    await press('\uE004');
    assert.equal(await inspect('return document.activeElement.id'), 'system-notifications-reload', 'disabled test is skipped in keyboard order');
    for (let index = 0; index < 16; index++) { await press('\uE004'); assert.equal(await inspect('return document.querySelector("#desktop-preferences").contains(document.activeElement)'), true); }
    await inspect('document.querySelector("#system-notifications-enabled").scrollIntoView({block:"center"})');
    visuals.darkNarrow = await geometry(); contained(visuals.darkNarrow); await screenshot('p7-notifications-dark-narrow');
    await press('\uE00C'); await until(() => inspect('const active=document.activeElement;return !document.querySelector("#desktop-preferences").open && active.id==="desktop-preferences-open" && active.checkVisibility()'), 'preferences Escape restores a visible navigation entry or its disclosure');
    assert.equal(await inspect('return document.querySelector("#desktop-navigation").open'), false, 'closing preferences keeps narrow navigation folded');
    await press('\uE007');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && !document.querySelector("#desktop-navigation").open'), 'Enter reopens settings while navigation stays folded');
    await click('#preferences-categories'); await click('#preferences-nav-notifications'); await ready();
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.activeElement.id==="desktop-preferences-open" && document.activeElement.checkVisibility()'), 'reopened preferences returns focus to its visible opener');
    assert.equal(await inspect('return document.querySelector("#desktop-navigation").open'), false);
    await command('POST', '/window/rect', { width: 1200, height: 850 });
  });

  await checked('P7 notification acceptance records delivery limits and leaves real project evidence intact', async () => {
    for (const [name, expected] of Object.entries(files)) assert.equal(await readFile(resolve(directory, name), 'utf8'), expected);
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: baseline.id }), baseline);
    assert.equal(requests.length, 0); assert.deepEqual(await inspect('return window.__notificationAcceptanceErrors'), []);
    assert.ok((await ownedRuntimeProcesses()).length > 0, 'owned watcher remains for scoped native shutdown verification');
    await writeFile(resolve(run, 'system-notification-visuals.json'), JSON.stringify(visuals, null, 2));
    await writeFile(resolve(run, 'system-notification-outcomes.json'), JSON.stringify({
      outcomes, observations,
      actualPluginSubmissionObserved: outcomes.some(item => item.outcome === 'submitted'),
      actualPluginFailureObserved: outcomes.some(item => item.outcome === 'failed'),
      failureInjection: 'None. A real failed return is verified if observed; deterministic failure handling remains a separate native unit-test claim.',
      visibleToastDelivery: 'Not verified. Plugin submitted only means API acceptance; no visual receipt was collected.',
      installedApplicationIdentity: 'Not verified. Isolated debug executable; no installation, shortcut registration or OS policy changes.',
      permissionPrompt: 'Not exercised. The official Windows plugin reports granted and does not expose Windows notification policy.',
      modelRequests: requests.length,
    }, null, 2));
  });
}
