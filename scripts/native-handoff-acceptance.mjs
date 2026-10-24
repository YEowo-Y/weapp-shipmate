import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseHandoff } from '../desktop/design-previews/repair-handoff.js';

// Real WebView2 interactions and native persisted tools; never mocks invoke.
export async function checkHandoffFlows({ run, checked, click, fill, press, inspect, text, command, find, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests }) {
  const directory = resolve(run, 'P6 真实预检夹具'), downloads = resolve(run, 'handoff-downloads');
  await mkdir(directory); await mkdir(downloads);
  const fixtures = { 'app.json': JSON.stringify({ pages: ['pages/index/index'] }), 'project.config.json': JSON.stringify({ appid: 'touristappid', miniprogramRoot: './' }), 'app.js': 'wx.getLocation({type:"wgs84"});\n' };
  for (const [name, value] of Object.entries(fixtures)) await writeFile(resolve(directory, name), value);
  const snapshot = () => projectInvoke('project_snapshot');
  const openMenu = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="handoff"]'); await until(() => inspect('return document.querySelector("#desktop-handoff").open'), 'handoff dialog'); };
  const upload = async path => command('POST', `/element/${await find('#handoff-file')}/value`, { text: path });
  const close = async () => { await press('\uE00C'); await until(() => inspect('return !document.querySelector("#desktop-handoff").open'), 'handoff closed'); };
  let source, jsonPath, saved;
  await checked('P6 fresh empty state and menu return focus', async () => {
    assert.equal((await snapshot()).artifacts.length, 0);
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    await openMenu();
    assert.match(await text('#handoff-content'), /尚未打开/);
    assert.equal(await inspect('return document.querySelector("#handoff-json").disabled'), true);
    await screenshot('p6-empty'); await close();
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-more');
  });
  await checked('P6 actual bundled preflight generates a source-linked handoff through the report toolbar', async () => {
    await projectInvoke('project_save', { project: { id: 'p6-project', name: 'P6 交接验收项目', directory, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length === 2 && !document.querySelector("#project-retry").disabled'), 'P6 project loaded');
    await closeProjects(); await selectProject('p6-project');
    await click('#desktop-tools-toggle'); await click('#check-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok")'), 'actual preflight complete');
    const result = await snapshot(); assert.equal(result.runs.length, 1); assert.equal(result.runs[0].state, 'succeeded');
    source = await projectInvoke('project_artifact', { artifactId: result.artifacts[0].id });
    assert.ok(source.data.result.items.length > 0);
    await click('#handoff-report');
    await until(async () => (await text('#handoff-source')).includes(source.id), 'source-linked handoff');
    assert.match(await text('#handoff-provenance'), /本机已保存/);
    assert.match(await text('#handoff-content'), /期望结果[\s\S]*验证步骤/);
    assert.doesNotMatch(await text('#handoff-content'), /尚未打开交接内容/);
    assert.equal(await inspect('return document.querySelector("#handoff-basis").open'), false);
    assert.doesNotMatch(await text('#handoff-status'), /不受支持/);
    await screenshot('p6-handoff-wide');
  });
  await checked('P6 JSON and Markdown downloads roundtrip without raw project paths or inputs', async () => {
    await command('POST', '/ms/cdp/execute', { cmd: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: downloads } });
    await click('#handoff-json'); await click('#handoff-markdown');
    jsonPath = resolve(downloads, `shipmate-handoff-${source.createdAt}.json`);
    const data = await until(async () => { try { return await readFile(jsonPath, 'utf8'); } catch { return null; } }, 'JSON downloaded');
    saved = parseHandoff(data); assert.equal(saved.source.artifactId, source.id); assert.equal(saved.source.runId, source.runId);
    assert.equal(saved.items.length, source.data.result.items.length);
    assert.equal(saved.source.contextRevision, source.contextRevision);
    assert.equal(data.includes(directory), false); assert.equal(data.includes('inputSummary'), false); assert.equal(data.includes('raw report'), false);
    const md = await until(async () => { try { return await readFile(resolve(downloads, `shipmate-handoff-${source.createdAt}.md`), 'utf8'); } catch { return null; } }, 'Markdown downloaded');
    assert.match(md, /未修改项目文件.*未验证修复结果/);
    await close(); await click('#desktop-tools-close');
  });
  await checked('P6 external reopen is readonly; malformed and oversized files retain valid content and recover', async () => {
    const before = await snapshot();
    await openMenu(); await upload(jsonPath);
    await until(async () => (await text('#handoff-provenance')).includes('外部文件'), 'external provenance');
    assert.match(await text('#handoff-warning'), /来源|外部文件/);
    const validText = await text('#handoff-content');
    for (const [name, data] of [['broken.json', '{bad'], ['future.json', JSON.stringify({ ...saved, version: 99 })], ['large.json', ' '.repeat(512 * 1024 + 1)]]) {
      const path = resolve(run, name); await writeFile(path, data); await upload(path);
      await until(async () => (await text('#handoff-status')).includes('已保留'), 'failed import preserves previous');
      assert.equal(await text('#handoff-content'), validText);
    }
    await upload(jsonPath);
    await until(async () => (await text('#handoff-status')).startsWith('已打开'), 'same-file retry');
    assert.deepEqual(await snapshot(), before);
    await screenshot('p6-handoff-reopened');
  });
  await checked('P6 narrow layout contains content and Web Awesome keyboard focus', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await inspect('document.querySelector("#handoff-done").focus()'); await press('\uE004');
    assert.equal(await inspect('return document.activeElement.id'), 'handoff-dismiss');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE008' }, { type: 'keyDown', value: '\uE004' }, { type: 'keyUp', value: '\uE004' }, { type: 'keyUp', value: '\uE008' }] }] });
    assert.equal(await inspect('return document.activeElement.id'), 'handoff-done');
    const geometry = await inspect('const d=document.querySelector("#desktop-handoff"),r=d.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};');
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry));
    assert.ok(geometry.overflow <= 1 && geometry.pageOverflow <= 1, JSON.stringify(geometry));
    await inspect('document.querySelector("#desktop-handoff .context-body").scrollTop=0;document.querySelector("#handoff-dismiss").focus()');
    await screenshot('p6-handoff-narrow'); await writeFile(resolve(run, 'handoff-visuals.json'), JSON.stringify({ geometry }, null, 2));
    await close(); await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('P6 restart restores source history; changed project version remains a historical handoff', async () => {
    await quit(); await launch();
    await click('#desktop-tools-toggle');
    await until(() => inspect('return !document.querySelector("#handoff-report").disabled'), 'saved report restored');
    await click('#handoff-report'); assert.ok((await text('#handoff-source')).includes(source.id));
    await close(); await click('#desktop-tools-close');
    await projectDialog(); await fill('#project-name', 'P6 项目已改名'); await click('#project-save');
    await until(async () => (await snapshot()).projects[0].revision > source.projectRevision, 'project revision advanced');
    await closeProjects(); await click('#desktop-tools-toggle');
    await until(() => inspect('return !document.querySelector("#handoff-report").disabled'), 'historical source restored after rename');
    await click('#handoff-report'); assert.match(await text('#handoff-warning'), /项目版本已变化/);
    await screenshot('p6-handoff-stale'); await close(); await click('#desktop-tools-close');
    await openMenu(); await upload(jsonPath);
    await until(async () => (await text('#handoff-provenance')).includes('外部文件'), 'portable file after restart');
    assert.ok((await text('#handoff-source')).includes(source.id)); await close();
  });
  await checked('P6 exports and reopening leave project files, native artifact and tool run count unchanged', async () => {
    assert.deepEqual((await readdir(directory)).sort(), Object.keys(fixtures).sort());
    for (const [name, value] of Object.entries(fixtures)) assert.equal(await readFile(resolve(directory, name), 'utf8'), value);
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: source.id }), source);
    assert.equal((await snapshot()).runs.length, 1); assert.equal((await snapshot()).artifacts.length, 1);
    assert.equal(requests.length, 0);
  });
}
