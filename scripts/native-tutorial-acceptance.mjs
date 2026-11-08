import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Capture actual native UI over disposable source files. These screenshots are
// tutorial source material, not fabricated product states or user project data.
export async function checkTutorialFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, requests }) {
  const projectId = 'tutorial-project';
  const directory = resolve(run, '教程示例项目');
  const downloads = resolve(run, 'tutorial-downloads');
  const captureOnly = process.argv.includes('--tutorial-capture-only');
  const captures = {};
  const files = {
    'project.config.json': JSON.stringify({ appid: 'touristappid', miniprogramRoot: './' }),
    'app.json': JSON.stringify({ pages: ['pages/index/index'] }),
    'app.js': '// Tutorial fixture: static scanner input; never executed.\nif (false) wx.getLocation({ type: "wgs84" });\n',
  };
  const activate = async selector => {
    await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})', [selector]);
    await click(selector);
  };
  const close = async selector => { await press('\uE00C'); await until(() => inspect('return !document.querySelector(arguments[0])?.open', [selector]), `${selector} closed`); };
  const capture = async (name, selectors) => {
    const geometry = await inspect(`const targets={};
      for (const [key,selector] of Object.entries(arguments[0])) {
        const node=document.querySelector(selector); if (!node) throw new Error('Missing tutorial target '+selector);
        const r=node.getBoundingClientRect();
        targets[key]={selector,css:{x:r.x,y:r.y,width:r.width,height:r.height},visible:node.checkVisibility()&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth};
      }
      return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},targets};`, [selectors]);
    await screenshot(name);
    const png = await readFile(resolve(run, `${name}.png`));
    const image = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    for (const target of Object.values(geometry.targets)) {
      target.pixels = {
        x: target.css.x * image.width / geometry.viewport.width,
        y: target.css.y * image.height / geometry.viewport.height,
        width: target.css.width * image.width / geometry.viewport.width,
        height: target.css.height * image.height / geometry.viewport.height,
      };
    }
    captures[name] = { file: `${name}.png`, sha256: createHash('sha256').update(png).digest('hex'), image, ...geometry };
    await writeFile(resolve(run, 'tutorial-capture.json'), JSON.stringify({ projectId, fixture: 'Temporary scanner-only example; actual native UI; no source execution or model request.', captures }, null, 2));
  };
  await checked('Tutorial source captures show a real saved example, preflight, report, preparation export and handoff', async () => {
    await mkdir(directory); await mkdir(downloads);
    for (const [name, content] of Object.entries(files)) await writeFile(resolve(directory, name), content);
    await command('POST', '/window/rect', { width: 1000, height: 850 });
    await click('#desktop-preferences-open');
    await until(() => inspect('return document.querySelector("#desktop-theme-light")?.checkVisibility()'), 'tutorial appearance controls ready');
    await click('#desktop-theme-light'); await click('#desktop-message-size-16');
    await close('#desktop-preferences');
    await projectInvoke('project_save', { project: { id: projectId, name: '社区服务小程序（示例）', directory, subject: 'personal' } });
    const before = await projectInvoke('project_workflow', { projectId });
    await projectInvoke('project_facts_save', { projectId, expectedRevision: before.project.revision, facts: { businessType: '社区活动预约和信息展示', hasPayment: false, collectsSensitive: true, hasServerDomain: false } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return [...document.querySelector("#desktop-project-select").options].some(option=>option.value===arguments[0])&&!document.querySelector("#project-retry").disabled', [projectId]), 'tutorial project appears');
    await closeProjects(); await selectProject(projectId);
    await fill('#desktopInput', '');
    await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="home"]');
    await until(() => inspect('return document.querySelector("#session-empty").checkVisibility()'), 'tutorial home ready');
    await inspect('document.querySelector("#desktopScroll").scrollTop=0');
    await capture('tutorial-home', { project: '#desktop-project-select', start: '#start-check', workflow: '#home-workflow' });
    await activate('#start-check');
    await until(() => inspect('return document.querySelector("#desktop-tools").open&&!document.querySelector("#check-btn").disabled'), 'tutorial preflight controls ready');
    await capture('tutorial-tools', { run: '#check-btn', directory: '#dir', subject: '#subject' });
    await activate('#check-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok")&&!document.querySelector("#check-btn").disabled'), 'tutorial actual preflight finishes');
    assert.match(await text('#report'), /getLocation|位置/);
    await capture('tutorial-tools-result', { report: '#read-report', handoff: '#handoff-report', status: '#status' });
    await activate('#read-report');
    await until(() => inspect('return document.querySelector("#desktop-report-reader").open&&document.querySelector("#report-reader-content").textContent.includes("位置")'), 'tutorial report reader ready');
    await capture('tutorial-report', { summary: '#report-reader-summary', items: '#report-reader-content', handoff: '#report-reader-handoff' });
    await activate('#report-reader-handoff');
    await until(() => inspect('return document.querySelector("#desktop-handoff").open&&document.querySelector("#handoff-content").textContent.includes("位置")'), 'tutorial handoff ready');
    assert.match(await text('#handoff-provenance'), /本机已保存/);
    await capture('tutorial-handoff', { copy: '#handoff-copy', export: '#handoff-markdown', content: '#handoff-content', basis: '#handoff-basis' });
    await close('#desktop-handoff');
    if (await inspect('return document.querySelector("#desktop-report-reader").open')) await close('#desktop-report-reader');
    if (await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-close');
    await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="home"]');
    await activate('#home-workflow');
    await until(() => inspect('return document.querySelector("#desktop-workflow").open&&document.querySelector("#desktop-workflow").getAttribute("aria-busy")!=="true"'), 'tutorial workflow ready');
    if (!await inspect('return document.querySelector("#workflow-facts").open')) await activate('#workflow-facts > summary');
    assert.doesNotMatch(await text('#workflow-facts-summary'), /未保存/);
    await capture('tutorial-workflow', { export: '#workflow-export', facts: '#workflow-facts', next: '#workflow-next', overview: '#workflow-overview' });
    await command('POST', '/ms/cdp/execute', { cmd: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: downloads } });
    await activate('#workflow-export');
    const exported = await until(async () => (await readdir(downloads)).find(name => name.endsWith('.md')), 'tutorial preparation file downloaded');
    assert.match(await readFile(resolve(downloads, exported), 'utf8'), /社区服务小程序（示例）/);
    await close('#desktop-workflow');
    for (const [name, content] of Object.entries(files)) assert.equal(await readFile(resolve(directory, name), 'utf8'), content);
    assert.deepEqual(requests, []);
  });

  await checked('Tutorial viewer has readable steps, explicit playback, pause on switch and close, and narrow keyboard recovery', async () => {
    const open = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="tutorials"]'); await until(() => inspect('return document.querySelector("#desktop-tutorials")?.open'), 'tutorial viewer opens'); };
    const play = async () => {
      const result = await command('POST', '/execute/async', { script: 'const done=arguments[arguments.length-1]; const video=document.querySelector("#tutorials-video"); video.play().then(()=>done({ok:true}),error=>done({ok:false,error:String(error)}));', args: [] });
      assert.equal(result.ok, true, result.error);
      await until(() => inspect('const video=document.querySelector("#tutorials-video");return video.currentTime>0&&video.videoWidth>0&&!video.paused'), 'packaged tutorial decodes and plays');
    };
    const decoded = [];
    await open();
    for (const id of ['preflight', 'workflow', 'handoff']) {
      await inspect('window.__previousTutorialVideo=document.querySelector("#tutorials-video")');
      await activate(`#tutorials-select-${id}`);
      assert.equal(await inspect('return window.__previousTutorialVideo.paused'), true, 'switch pauses the preceding video');
      const media = await inspect('const v=document.querySelector("#tutorials-video");return {controls:v.controls,autoplay:v.autoplay,loop:v.loop,preload:v.preload,paused:v.paused,src:v.getAttribute("src"),steps:document.querySelectorAll("#tutorials-steps li").length};');
      assert.deepEqual(media, { controls: true, autoplay: false, loop: false, preload: 'none', paused: true, src: `/tutorials/${id}.mp4`, steps: 3 });
      if (!captureOnly) {
        await play();
        const video = await inspect('const v=document.querySelector("#tutorials-video");return {width:v.videoWidth,height:v.videoHeight,duration:v.duration};');
        assert.deepEqual(video, { width: 1920, height: 1080, duration: 24 });
        decoded.push({ id, ...video });
        if (id === 'preflight') await screenshot('tutorial-viewer-wide');
      }
    }
    await inspect('window.__previousTutorialVideo=document.querySelector("#tutorials-video")');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-tutorials").open&&document.activeElement.id==="desktop-more"'), 'Escape restores menu focus');
    assert.equal(await inspect('return window.__previousTutorialVideo.paused'), true, 'close pauses playback');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await open();
    assert.equal(await inspect('return document.querySelector("#tutorials-video").paused'), true, 'reopening never resumes automatically');
    const layout = await inspect('const d=document.querySelector("#desktop-tutorials"),v=document.querySelector("#tutorials-video"),r=d.getBoundingClientRect();return {fits:r.left>=-1&&r.right<=innerWidth+1,videoFits:v.getBoundingClientRect().width<=d.clientWidth,steps:document.querySelector("#tutorials-steps").textContent,focusInside:d.contains(document.activeElement)};');
    assert.ok(layout.fits && layout.videoFits && layout.focusInside, JSON.stringify(layout));
    assert.match(layout.steps, /复制 Markdown/);
    await screenshot('tutorial-viewer-narrow');
    await activate('#tutorials-close');
    await until(() => inspect('return !document.querySelector("#desktop-tutorials").open'), 'visible tutorial close works');
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-more');
    await inspect('delete window.__previousTutorialVideo');
    await writeFile(resolve(run, 'tutorial-viewer-evidence.json'), JSON.stringify({ mediaPlayback: captureOnly ? 'not-run: explicit --tutorial-capture-only' : 'three packaged videos decoded and played', decoded, noAutoplay: true, pauseOnSwitchAndClose: true, narrowKeyboardRecovery: true, layout }, null, 2));
    await command('POST', '/window/rect', { width: 1000, height: 850 });
    assert.deepEqual(requests, []);
  });
}
