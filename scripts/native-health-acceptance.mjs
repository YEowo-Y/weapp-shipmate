import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, realpath, rename, stat } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

// Real installed WebView2 UI and native SQLite/CLI. Fault injection is confined
// to the harness's already-validated, disposable copy of the bundled runtime.
export async function checkHealthFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, isolatedDirectory }) {
  const a = 'p7-health-a', b = 'p7-health-b';
  const directory = resolve(run, 'P7 真实预检项目 A'), otherDirectory = resolve(run, 'P7 未预检项目 B');
  await mkdir(directory); await mkdir(otherDirectory);
  const fixtures = {
    'app.json': JSON.stringify({ pages: ['pages/index/index'] }),
    'project.config.json': JSON.stringify({ appid: 'touristappid', miniprogramRoot: './' }),
    'app.js': 'wx.getLocation({type:"wgs84"});\n',
  };
  for (const root of [directory, otherDirectory]) {
    for (const [name, value] of Object.entries(fixtures)) await writeFile(resolve(root, name), value);
  }
  const snapshot = () => projectInvoke('project_snapshot');
  const healthText = () => text('#desktop-health');
  const ready = () => until(() => inspect('const d=document.querySelector("#desktop-health"),r=document.querySelector("#health-refresh"); return d?.open && d.getAttribute("aria-busy")!=="true" && !r.disabled;'), 'health snapshot loaded');
  const open = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="health"]'); await ready(); };
  const close = async () => { await press('\uE00C'); await until(() => inspect('return !document.querySelector("#desktop-health").open'), 'health dialog closed'); };
  const refresh = async () => { await click('#health-refresh'); await ready(); };
  const successfulCheck = async () => {
    const count = (await snapshot()).runs.length;
    await click('#health-check');
    await until(() => inspect('return !document.querySelector("#desktop-health").open'), 'manual health check reveals tools');
    await until(async () => {
      const state = await snapshot();
      return state.runs.length === count + 1 && state.runs[0].kind === 'check' && state.runs[0].state === 'succeeded'
        && await inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#check-btn").disabled');
    }, 'actual bundled health preflight complete', 30000);
    await click('#desktop-tools-close');
  };
  const geometry = () => inspect('const d=document.querySelector("#desktop-health"),r=d.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};');
  const contained = value => {
    assert.ok(value.left >= -1 && value.right <= value.width + 1 && value.top >= -1 && value.bottom <= value.height + 1, JSON.stringify(value));
    assert.ok(value.overflow <= 1 && value.pageOverflow <= 1, JSON.stringify(value));
  };
  let firstArtifact, latestArtifact, firstReportText;

  await checked('P7 fresh project health has an actionable empty state and restores menu focus', async () => {
    const initial = await snapshot(); assert.equal(initial.projects.length, 0); assert.equal(initial.runs.length, 0);
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    await open(); assert.match(await healthText(), /选择.*项目|先.*项目|未选择项目/);
    assert.equal(await inspect('return document.querySelector("#health-check").disabled && document.querySelector("#health-report").disabled'), true);
    await screenshot('p7-health-empty'); await close();
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-more');
  });

  await checked('P7 home entry shows the selected unchecked project without inventing a healthy state', async () => {
    for (const [id, name, root] of [[a, 'P7 维护项目 A', directory], [b, 'P7 维护项目 B', otherDirectory]]) {
      await projectInvoke('project_save', { project: { id, name, directory: root, subject: 'personal' } });
    }
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===3 && !document.querySelector("#project-retry").disabled'), 'P7 projects loaded');
    await closeProjects(); await selectProject(a);
    await click('#home-health'); await ready();
    assert.match(await text('#health-project-name'), /P7 维护项目 A/);
    assert.match(await healthText(), /尚未预检/);
    assert.equal(await inspect('return document.querySelector("#health-report").disabled'), true);
    assert.equal(await inspect('return document.querySelector("#health-check").disabled'), false);
    assert.equal((await snapshot()).runs.length, 0);
    await screenshot('p7-health-unchecked');
  });

  await checked('P7 explicit recheck executes the real bundled scanner and retains source-linked history', async () => {
    await successfulCheck();
    const state = await snapshot(); assert.equal(state.runs.length, 1); assert.equal(state.artifacts.length, 1);
    firstArtifact = await projectInvoke('project_artifact', { artifactId: state.artifacts[0].id });
    assert.equal(firstArtifact.projectId, a); assert.equal(firstArtifact.kind, 'check');
    assert.ok(firstArtifact.data.result.items.length > 0); assert.ok(firstArtifact.rulesVersion);
    await open(); assert.match(await healthText(), /保存的预检记录/);
    assert.match(await healthText(), /未.*检查当前文件/);
    assert.equal(await inspect('return document.querySelector("#health-report").disabled'), false);
    const wide = await geometry(); contained(wide);
    await screenshot('p7-health-wide');
    await writeFile(resolve(run, 'health-visuals.json'), JSON.stringify({ wide }, null, 2));
    await click('#health-report');
    await until(() => inspect('return !document.querySelector("#desktop-health").open && document.querySelector("#report-title").textContent==="代码预检"'), 'saved check opened');
    firstReportText = await text('#report'); assert.ok(firstReportText.length > 50);
    await click('#desktop-tools-close');
  });

  await checked('P7 reading maintenance state never rescans files or changes saved evidence', async () => {
    const before = await snapshot();
    // A source edit is deliberate test setup. A status refresh must neither run
    // the scanner nor claim to have verified this changed file.
    await writeFile(resolve(directory, 'app.js'), `${fixtures['app.js']}// P7 explicit source-change fixture\n`);
    try {
      await open(); await refresh(); await refresh();
      assert.match(await healthText(), /未.*检查当前文件/);
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await projectInvoke('project_artifact', { artifactId: firstArtifact.id }), firstArtifact);
      assert.equal(requests.length, 0);
    } finally { await writeFile(resolve(directory, 'app.js'), fixtures['app.js']); }
    await close();
  });

  await checked('P7 health opens the last successful check even when the latest artifact is a guide', async () => {
    await click('#desktop-tools-toggle'); await click('#guide-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#guide-btn").disabled'), 'actual guide complete', 30000);
    const state = await snapshot(); assert.equal(state.artifacts[0].kind, 'guide');
    assert.equal(await text('#report-title'), '流程导航');
    await click('#desktop-tools-close'); await open(); await click('#health-report');
    await until(() => inspect('return document.querySelector("#report-title").textContent==="代码预检"'), 'health resolves successful check');
    assert.equal(await text('#report'), firstReportText);
    await click('#desktop-tools-close');
  });

  await checked('P7 rename preserves freshness while changing project subject requires a recheck', async () => {
    await projectDialog(); await fill('#project-name', 'P7 维护项目 A 已改名'); await click('#project-save');
    await until(() => inspect('return !document.querySelector("#project-save").disabled && document.querySelector("#desktop-project-select").selectedOptions[0].textContent==="P7 维护项目 A 已改名"'), 'rename saved');
    const renamed = (await snapshot()).projects.find(project => project.id === a);
    assert.ok(renamed.revision > firstArtifact.projectRevision); assert.equal(renamed.contextRevision, firstArtifact.contextRevision);
    await closeProjects(); await open();
    assert.match(await text('#health-project-name'), /已改名/);
    assert.doesNotMatch(await healthText(), /项目事实已变化|待重新预检/);
    await close(); await projectDialog();
    await inspect('const n=document.querySelector("#project-subject"); if(!Array.from(n.options).some(o=>o.value==="enterprise")) throw new Error("enterprise option unavailable"); n.value="enterprise";n.dispatchEvent(new Event("change",{bubbles:true}));');
    await click('#project-save');
    await until(() => inspect('return !document.querySelector("#project-save").disabled && document.querySelector("#project-subject").value==="enterprise"'), 'subject saved');
    const changed = (await snapshot()).projects.find(project => project.id === a);
    assert.ok(changed.contextRevision > firstArtifact.contextRevision);
    await closeProjects(); await open(); assert.match(await healthText(), /项目事实已变化/); assert.match(await healthText(), /待重新预检/);
    await screenshot('p7-health-stale');
    await successfulCheck();
    latestArtifact = await projectInvoke('project_artifact', { artifactId: (await snapshot()).artifacts[0].id });
    assert.equal(latestArtifact.kind, 'check'); assert.equal(latestArtifact.contextRevision, changed.contextRevision);
    await open(); assert.doesNotMatch(await healthText(), /项目事实已变化|待重新预检/); await close();
  });

  await checked('P7 failed and canceled checks preserve the last successful report and explicit recovery', async () => {
    const root = await realpath(isolatedDirectory), cli = await realpath(resolve(root, 'runtime/src/project-tool.mjs'));
    const inside = relative(root, cli); assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside));
    const original = await readFile(cli), marker = resolve(dirname(cli), 'p7-tool-started');
    const before = await snapshot();
    try {
      await writeFile(cli, '// Labelled P7 malformed-output fixture: disposable runtime copy only.\nconsole.log("not a domain artifact");\n');
      await open(); await click('#health-check');
      await until(() => inspect('return document.querySelector("#status").classList.contains("error") && !document.querySelector("#check-btn").disabled'), 'P7 malformed output rejected');
      let state = await snapshot(); assert.equal(state.runs[0].state, 'failed'); assert.deepEqual(state.artifacts, before.artifacts);
      await click('#desktop-tools-close'); await open(); assert.match(await healthText(), /失败/);
      assert.equal(await inspect('return document.querySelector("#health-report").disabled'), false);
      await screenshot('p7-health-failed');
      const originalTheme = await inspect('return document.body.dataset.theme');
      try {
        await close(); await click('#desktop-preferences-open');
        await until(() => inspect('return document.querySelector("#desktop-theme-dark")?.checkVisibility()'), 'appearance settings ready');
        await click('#desktop-theme-dark'); await click('#preferences-content-dismiss');
        await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.body.dataset.theme === "dark"'), 'explicit dark preference applied');
        await open();
        await command('POST', '/ms/cdp/execute', { cmd: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } });
        const visual = await inspect('const e=document.querySelector(".health-error"),d=document.querySelector("#desktop-health");return {theme:document.body.dataset.theme,errorColor:getComputedStyle(e).color,errorToken:getComputedStyle(e).getPropertyValue("--block").trim(),background:getComputedStyle(d).backgroundColor,reduced:matchMedia("(prefers-reduced-motion: reduce)").matches};');
        assert.equal(visual.theme, 'dark'); assert.equal(visual.reduced, true);
        assert.match(visual.errorToken, /^#[0-9a-f]{6}$/i);
        const channels = [1, 3, 5].map(start => parseInt(visual.errorToken.slice(start, start + 2), 16));
        assert.equal(visual.errorColor, `rgb(${channels.join(', ')})`, 'failure text uses the active semantic error color');
        await screenshot('p7-health-dark-failed'); await writeFile(resolve(run, 'health-dark.json'), JSON.stringify(visual, null, 2));
      } finally {
        await command('POST', '/ms/cdp/execute', { cmd: 'Emulation.setEmulatedMedia', params: { features: [] } });
        await close(); await click('#desktop-preferences-open');
        await until(() => inspect('return document.querySelector(arguments[0])?.checkVisibility()', [`#desktop-theme-${originalTheme}`]), 'appearance settings ready to restore');
        await click(`#desktop-theme-${originalTheme}`); await click('#preferences-content-dismiss');
        await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'appearance settings closed');
        await open();
      }
      await click('#health-report'); assert.equal(await text('#report-title'), '代码预检');
      await click('#desktop-tools-close');
      await writeFile(cli, '// Labelled P7 cancellation fixture: disposable runtime copy only.\nimport { writeFileSync } from "node:fs";\nwriteFileSync(new URL("./p7-tool-started", import.meta.url), "started");\nsetTimeout(() => console.log("UNEXPECTED LATE RESULT"), 60000);\n');
      await open(); await click('#health-check'); await until(async () => (await stat(marker)).isFile(), 'P7 native child actually started');
      await click('#stop-tool');
      await until(() => inspect('return !document.querySelector("#check-btn").disabled && document.querySelector("#stop-tool").hidden'), 'P7 cancellation settled');
      state = await snapshot(); assert.equal(state.runs[0].state, 'canceled'); assert.deepEqual(state.artifacts, before.artifacts);
      await click('#desktop-tools-close'); await open(); assert.match(await healthText(), /取消|停止/);
      assert.equal(await inspect('return document.querySelector("#health-report").disabled'), false);
      await close();
    } finally { await writeFile(cli, original); }
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: latestArtifact.id }), latestArtifact);
  });

  await checked('P7 moving a fixture directory is detected on refresh without losing historical reports', async () => {
    const root = await realpath(run), moved = resolve(run, 'P7 临时移走的项目 A');
    for (const path of [await realpath(directory), moved]) {
      const inside = relative(root, path); assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside));
    }
    const before = await snapshot(); await open(); await rename(directory, moved);
    try {
      await refresh(); assert.match(await healthText(), /目录不可用/);
      assert.equal(await inspect('return document.querySelector("#health-check").disabled'), true);
      assert.equal(await inspect('return document.querySelector("#health-report").disabled'), false);
      assert.equal((await snapshot()).projects.find(project => project.id === a).directoryAvailable, false);
      assert.deepEqual((await snapshot()).runs, before.runs); await screenshot('p7-health-directory-unavailable');
    } finally { await rename(moved, directory); }
    await refresh(); assert.doesNotMatch(await healthText(), /目录不可用/);
    assert.equal(await inspect('return document.querySelector("#health-check").disabled'), false);
    assert.deepEqual((await snapshot()).runs, before.runs); await close();
  });

  await checked('P7 maintenance state stays project-scoped and survives native process restart', async () => {
    const before = await snapshot();
    await selectProject(b); await click('#home-health'); await ready();
    assert.match(await text('#health-project-name'), /P7 维护项目 B/); assert.match(await healthText(), /尚未预检/);
    assert.equal(await inspect('return document.querySelector("#health-report").disabled'), true);
    assert.doesNotMatch(await healthText(), /维护项目 A|已改名/); await close();
    await selectProject(a); await quit(); await launch(); await open();
    assert.match(await text('#health-project-name'), /P7 维护项目 A 已改名/);
    assert.match(await healthText(), /取消|停止/);
    assert.equal(await inspect('return document.querySelector("#health-report").disabled'), false);
    const restored = await snapshot(); assert.deepEqual(restored.runs, before.runs); assert.deepEqual(restored.artifacts, before.artifacts);
    await screenshot('p7-health-restored');
  });

  await checked('P7 narrow and wide maintenance dialogs contain keyboard focus and recover project navigation', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await inspect('document.querySelector("#health-done").focus()'); await press('\uE004');
    assert.equal(await inspect('return document.activeElement.id'), 'health-dismiss');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE008' }, { type: 'keyDown', value: '\uE004' }, { type: 'keyUp', value: '\uE004' }, { type: 'keyUp', value: '\uE008' }] }] });
    assert.equal(await inspect('return document.activeElement.id'), 'health-done');
    for (let i = 0; i < 10; i++) { await press('\uE004'); assert.equal(await inspect('return document.querySelector("#desktop-health").contains(document.activeElement)'), true); }
    const narrow = await geometry(); contained(narrow);
    await inspect('document.querySelector("#desktop-health .context-body").scrollTop=0;document.querySelector("#health-dismiss").focus()');
    await screenshot('p7-health-narrow');
    const evidence = JSON.parse(await readFile(resolve(run, 'health-visuals.json'), 'utf8'));
    await writeFile(resolve(run, 'health-visuals.json'), JSON.stringify({ ...evidence, narrow }, null, 2));
    await click('#health-project');
    await until(() => inspect('return !document.querySelector("#desktop-health").open && document.querySelector("#desktop-preferences").open && document.querySelector("#desktop-preferences").dataset.section === "projects" && document.querySelector("#project-form").checkVisibility()'), 'health opens embedded project configuration');
    assert.equal(await inspect('return document.querySelector("#project-name").value'), 'P7 维护项目 A 已改名');
    assert.equal(await inspect('return document.querySelector("#project-history").checkVisibility()'), false);
    await click('#preferences-content-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'project settings closed');
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    await open(); await click('#health-history');
    await until(() => inspect('return !document.querySelector("#desktop-health").open && document.querySelector("#desktop-project-results").open'), 'maintenance history opens the results workspace');
    assert.match(await text('#project-history-title'), /P7 维护项目 A 已改名/);
    await screenshot('p7-health-results-destination');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-project-results").open'), 'results closed');
  });

  await checked('P7 maintenance and read-only preflight leave source files and prior artifacts intact without model calls', async () => {
    for (const root of [directory, otherDirectory]) {
      assert.deepEqual((await readdir(root)).sort(), Object.keys(fixtures).sort());
      for (const [name, value] of Object.entries(fixtures)) assert.equal(await readFile(resolve(root, name), 'utf8'), value);
    }
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: firstArtifact.id }), firstArtifact);
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: latestArtifact.id }), latestArtifact);
    const state = await snapshot(); assert.equal(state.runs.length, 5); assert.equal(state.artifacts.length, 3);
    assert.equal(state.runs.filter(item => item.projectId === b).length, 0); assert.equal(requests.length, 0);
  });
}
