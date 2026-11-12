import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { deriveWorkflow } from '../src/workflow.mjs';
import { createHandoff } from '../desktop/design-previews/repair-handoff.js';

const execFileAsync = promisify(execFile);
async function readWindowsClipboard() {
  try {
    const { stdout } = await execFileAsync(resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command',
      '$ErrorActionPreference="Stop"; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $value=Get-Clipboard -Raw; ConvertTo-Json -Compress -InputObject $value',
    ], { windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' });
    // Trim only the JSON transport framing; preserve the decoded clipboard text.
    const value = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    if (typeof value !== 'string') throw new Error('Clipboard did not contain text');
    return value;
  } catch {
    // Do not expose stdout/stderr or clipboard contents in native failure logs.
    throw new Error('Could not read Windows clipboard text within the acceptance timeout.');
  }
}

// Real SQLite, bundled tools and native WebView2; never replaces invoke or tools.
// Presentation stress styles affect only this isolated document and are removed.
export async function checkReadingFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, refresh, requests }) {
  const projectId = 'reading-project', directory = resolve(run, '报告阅读真实工具夹具');
  const files = {
    'app.json': JSON.stringify({ pages: ['pages/index/index'], requiredPrivateInfos: ['getLocation'] }),
    'project.config.json': JSON.stringify({ appid: 'touristappid', miniprogramRoot: './' }),
    'app.js': 'wx.getLocation({type:"wgs84"});\nwx.request({url:"http://reading-fixture.example.com/data"});\n',
  };
  await mkdir(directory);
  for (const [name, content] of Object.entries(files)) await writeFile(resolve(directory, name), content);
  const snapshot = () => projectInvoke('project_snapshot');
  const visuals = [], interactions = [], artifacts = {};
  const readerReady = () => until(() => inspect('return document.querySelector("#desktop-report-reader")?.open && document.querySelector("#report-reader-dismiss").checkVisibility()'), 'report reader open');
  const closeReader = async () => { await press('\uE00C'); await until(() => inspect('return !document.querySelector("#desktop-report-reader").open'), 'reader closed'); };
  const closeTools = async () => { if (await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-close'); };
  const shape = selector => inspect(`
    const node=document.querySelector(arguments[0]),r=node.getBoundingClientRect(),body=node.closest('.report-reader-body,.context-body'),b=body?.getBoundingClientRect();
    const hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollTop:body?.scrollTop??null,
      hit:hit?{tag:hit.tagName,id:hit.id}:null,visible:r.width>0&&r.height>0&&!node.disabled&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&(!b||r.top>=b.top&&r.bottom<=b.bottom)&&(hit===node||node.contains(hit))};
  `, [selector]);
  const activate = async selector => {
    const entry = { selector, before: await shape(selector), after: null }; interactions.push(entry);
    await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})', [selector]);
    try { await until(async () => { entry.after = await shape(selector); return entry.after.visible; }, `visible native click target ${selector}`, 3000); }
    finally { await writeFile(resolve(run, 'reading-interactions.json'), JSON.stringify(interactions, null, 2)); }
    await click(selector);
  };
  const openMenu = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="report"]'); await readerReady(); };
  const openHistoryReport = async (artifact, entry = '#desktop-results-open') => {
    await closeTools();
    if (entry === '#desktop-results-open' && !await inspect('return document.querySelector("#desktop-navigation").open')) await click('#desktop-navigation > summary');
    await activate(entry);
    await until(() => inspect('return document.querySelector("#desktop-project-results").open'), 'results workspace opened');
    await click('#project-results-retry');
    await until(() => inspect('return !document.querySelector("#project-results-retry").disabled && !document.querySelector("#desktop-project-select").disabled'), 'project history refreshed');
    const rows = (await snapshot()).runs.filter(item => item.projectId === projectId), index = rows.findIndex(item => item.id === artifact.runId);
    assert.ok(index >= 0, 'saved run remains in real project history');
    await activate(`#project-history .project-run:nth-child(${index + 1}) > button`);
    await until(() => inspect('return !document.querySelector("#desktop-project-results").open && document.querySelector("#desktop-tools").open && !document.querySelector("#read-report").disabled'), 'saved report loaded through history');
  };
  const fromHistory = async (artifact, entry) => {
    await openHistoryReport(artifact, entry);
    await activate('#read-report'); await readerReady();
    assert.equal(await text('#report-reader-title'), artifact.title);
    assert.equal(await inspect('return document.querySelector(".report-reader-body").scrollTop'), 0, 'each opened report starts at its overview, not a previous reading position');
    assert.equal(await inspect('return document.querySelector("#report-reader-outline").scrollTop'), 0, 'each report starts with the beginning of its own outline');
  };
  const verifyContent = async artifact => {
    const pack = createHandoff(artifact), expected = pack.items;
    const labels = { all: '全部', blocker: '阻断', warning: '警告', info: '提示', conditional: '条件自查' };
    const filters = await inspect(`return [...document.querySelectorAll('#report-reader-summary [data-reader-filter]')].map(button => ({
      key: button.dataset.readerFilter, label: button.textContent.trim(), pressed: button.getAttribute('aria-pressed')
    }))`);
    const expectedFilters = [];
    for (const [key, label] of Object.entries(labels)) {
      const count = key === 'all' ? expected.length : expected.filter(item => (item.conditional ? 'conditional' : item.rule.severity) === key).length;
      if (count) expectedFilters.push({ key, label: `${label} ${count}`, pressed: String(key === 'all') });
    }
    assert.deepEqual(filters, expectedFilters);
    const smallTargets = await inspect(`return [...document.querySelectorAll('#report-reader-summary button, #report-reader-summary select, #report-reader-outline a')].filter(n=>!n.closest('[hidden]')).filter(n=>{const r=n.getBoundingClientRect();return r.width<24 || r.height<24}).map(n=>n.textContent)`);
    assert.deepEqual(smallTargets, [], 'filters and outline links meet the minimum target size');
    if (!expected.length) assert.equal(await text('#report-reader-summary'), '0 个核对项');
    const rows = await inspect(`return [...document.querySelectorAll('#report-reader-content article[data-reader-item]')].map(article=>({
      heading:article.querySelector('h3').textContent,headingId:article.querySelector('h3').id,text:article.textContent,
      requirements:[...article.querySelectorAll(':scope > ul > li')].map(n=>n.textContent),
      visibleRequirements:[...article.querySelectorAll(':scope > ul > li')].every(n=>n.checkVisibility()),
      visibleParagraphs:[...article.querySelectorAll(':scope > p')].filter(n=>n.checkVisibility()).map(n=>n.textContent),
      links:[...article.querySelectorAll(':scope > a')].map(n=>({href:n.href,target:n.target,rel:n.rel})),
      metadata:article.querySelector('.report-reader-meta').textContent,evidenceOpen:article.querySelector('details').open
    }));`);
    assert.equal(rows.length, expected.length);
    for (const [index, item] of expected.entries()) {
      const row = rows[index], rule = item.rule;
      assert.equal(row.heading, `${index + 1}. ${rule.title}`); assert.equal(row.headingId, `reader-item-${index}`);
      assert.deepEqual(row.requirements, rule.requires.length ? rule.requires : ['对照官方要求确认适用性与处理方案。']);
      assert.equal(row.visibleRequirements, true, 'requirements are not hidden inside collapsed evidence');
      assert.ok(row.text.includes(`规则编号 ${rule.ruleId}`)); assert.equal(row.metadata.includes(rule.ruleId), false); assert.equal(row.metadata.includes('条件自查'), item.conditional);
      assert.equal(row.evidenceOpen, false);
      if (item.conditional) {
        const signals = artifact.data.result.selfCheck.find(entry => entry.ruleId === rule.ruleId).signal;
        assert.ok(row.visibleParagraphs.some(value => value.includes(`业务自查线索：${signals.join('、')}`)), 'conditional signals remain in visible article text');
      }
      if (rule.note) assert.ok(row.visibleParagraphs.some(value => value.includes(rule.note)), 'rule notes are not hidden in evidence');
      if (rule.confidence) {
        const label = { high: '高', medium: '中', low: '低' }[rule.confidence];
        assert.ok(row.text.includes(`规则置信度：${label}（规则维护者对规则准确性的把握`));
      } else assert.ok(!row.text.includes('规则置信度'));
      if (rule.manual_required) assert.match(row.text, /按操作类型处理后核对实际结果，并记录验证依据/);
      if (item.rejectSummary) assert.ok(row.text.includes(item.rejectSummary));
      assert.deepEqual(row.links.map(link => link.href), rule.official_url ? [new URL(rule.official_url).href] : []);
      for (const link of row.links) { assert.match(link.href, /^https:\/\//); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/); assert.match(link.rel, /noreferrer/); }
    }
    assert.match(await text('#report-reader-warning'), /历史快照.*未重新扫描.*未实时核验/);
    const context = await inspect('const n=document.querySelector("#report-reader-context");return {visible:n.checkVisibility(),summary:n.querySelector(":scope > p")?.textContent,notes:[...n.querySelectorAll(":scope > ul > li")].map(n=>n.textContent),visibleNotes:[...n.querySelectorAll(":scope > ul > li")].every(n=>n.checkVisibility())}');
    assert.equal(context.visible, true); assert.equal(context.visibleNotes, true);
    assert.equal(context.summary, artifact.data.result.meta.summary); assert.deepEqual(context.notes, artifact.data.result.notes);
    assert.equal(await inspect('return document.querySelector("#report-reader-warning").checkVisibility()'), true);
    assert.match(await text('#report-reader-provenance'), /保存于/);
    const versionText = await text('#report-reader-versions');
    for (const value of [artifact.id, artifact.runId, artifact.toolVersion, artifact.rulesVersion]) assert.ok(versionText.includes(value));
    assert.equal(await inspect('return document.querySelector("#report-reader-versions").open'), false);
    assert.equal(await inspect('return document.querySelector("#report-reader-original").open'), false);
    assert.equal(await inspect(`return document.querySelectorAll('#report-reader-outline a[href^="#reader-item-"]').length`), expected.length);
    return pack;
  };
  const geometry = async label => {
    const value = await inspect(`
      const dialog=document.querySelector('#desktop-report-reader'),body=dialog.querySelector('.report-reader-body');
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const visible=node=>node.checkVisibility();
      const blocks=[...dialog.querySelectorAll('h2,h3,h4,p,li,summary,a,wa-button,select')].filter(visible);
      const clipped=blocks.filter(node=>{const c=getComputedStyle(node);return (/^(hidden|clip)$/.test(c.overflowX)&&node.scrollWidth>node.clientWidth+1)||(/^(hidden|clip)$/.test(c.overflowY)&&node.scrollHeight>node.clientHeight+1);}).map(node=>({tag:node.tagName,id:node.id,text:node.textContent.slice(0,80)}));
      return {viewport:{width:innerWidth,height:innerHeight},theme:document.body.dataset.theme,messageSize:getComputedStyle(body).fontSize,dialog:rect(dialog),body:rect(body),
        pageOverflow:document.documentElement.scrollWidth-innerWidth,dialogOverflow:dialog.scrollWidth-dialog.clientWidth,bodyOverflow:body.scrollWidth-body.clientWidth,
        contentOverflow:document.querySelector('#report-reader-content').scrollWidth-document.querySelector('#report-reader-content').clientWidth,clipped,
        localScrollers:[...dialog.querySelectorAll('pre,table,#report-reader-outline')].filter(visible).map(node=>({tag:node.tagName,id:node.id,overflowX:getComputedStyle(node).overflowX,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth})),
        footerControls:[...dialog.querySelectorAll('.report-reader-footer wa-button')].filter(visible).map(node=>({id:node.id,...rect(node)}))};
    `);
    visuals.push({ label, ...value }); await writeFile(resolve(run, 'reading-visuals.json'), JSON.stringify(visuals, null, 2));
    assert.ok(value.dialog.left >= -1 && value.dialog.right <= value.viewport.width + 1 && value.dialog.top >= -1 && value.dialog.bottom <= value.viewport.height + 1, JSON.stringify(value));
    for (const key of ['pageOverflow', 'dialogOverflow', 'bodyOverflow', 'contentOverflow']) assert.ok(value[key] <= 1, `${label} ${key}: ${value[key]}`);
    assert.deepEqual(value.clipped, [], `${label}: text blocks must not clip overflow`);
    for (const control of value.footerControls) assert.ok(control.left >= value.dialog.left && control.right <= value.dialog.right + 1 && control.bottom <= value.dialog.bottom + 1, JSON.stringify(control));
    for (const scroller of value.localScrollers) if (scroller.scrollWidth > scroller.clientWidth + 1) assert.match(scroller.overflowX, /auto|scroll/, 'wide original content must scroll locally');
    await screenshot(`reading-${label}`);
    return value;
  };
  const appearance = async theme => {
    await closeTools();
    await activate('#desktop-preferences-open');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && document.querySelector("#desktop-theme-system")?.checkVisibility()'), 'appearance preferences rendered');
    await activate(`#desktop-theme-${theme}`); await activate('#desktop-message-size-18'); await activate('#desktop-motion-reduce');
    await click('#preferences-content-dismiss'); await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'appearance saved');
    assert.equal(await inspect('return document.body.dataset.theme'), theme);
  };
  const clearStress = () => inspect(`document.querySelector('#reading-spacing-override')?.remove();for(const [node,style] of window.__readingTextStyles||[]){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);}delete window.__readingTextStyles;`);
  const stress = async ({ doubleText, spacing }) => {
    await clearStress();
    if (doubleText) await inspect(`const nodes=[...document.querySelectorAll('#desktop-report-reader,#desktop-report-reader *')].filter(n=>n.namespaceURI==='http://www.w3.org/1999/xhtml');const sizes=nodes.map(n=>parseFloat(getComputedStyle(n).fontSize));window.__readingTextStyles=nodes.map(n=>[n,n.getAttribute('style')]);nodes.forEach((n,i)=>n.style.setProperty('font-size',sizes[i]*2+'px','important'));`);
    if (spacing) await inspect(`const style=document.createElement('style');style.id='reading-spacing-override';style.textContent='#desktop-report-reader,#desktop-report-reader *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}#desktop-report-reader p{margin-block-end:2em!important}';document.head.append(style);`);
  };

  await checked('Reading starts with truthful empty state and disabled report entry points', async () => {
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    const initial = await snapshot(); assert.equal(initial.projects.length, 0); assert.equal(initial.artifacts.length, 0); assert.equal(initial.runs.length, 0);
    assert.equal(await inspect('return document.querySelector("#home-report").disabled'), true);
    await click('#desktop-tools-toggle'); assert.equal(await inspect('return document.querySelector("#read-report").disabled'), true);
    assert.match(await text('#report'), /报告将显示|尚未/); await screenshot('reading-empty'); await closeTools();
  });
  await checked('Actual bundled preflight opens structured reading from the tool toolbar', async () => {
    await projectInvoke('project_save', { project: { id: projectId, name: '报告阅读验收项目', directory, subject: 'personal' } });
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===2 && !document.querySelector("#project-retry").disabled'), 'reading fixture project registered');
    await closeProjects(); await selectProject(projectId); await click('#desktop-tools-toggle'); await click('#check-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#check-btn").disabled'), 'actual preflight saved', 30000);
    const saved = await snapshot(); assert.equal(saved.runs.length, 1); assert.equal(saved.runs[0].state, 'succeeded');
    artifacts.check = await projectInvoke('project_artifact', { artifactId: saved.artifacts[0].id });
    assert.ok(artifacts.check.data.result.items.length >= 3);
    await activate('#read-report'); await readerReady(); await verifyContent(artifacts.check); await geometry('check-wide');
  });
  await checked('Report priority shows a real finding and navigates directly to its requirements', async () => {
    const items = createHandoff(artifacts.check).items;
    assert.ok(items.every(item => !item.conditional && item.rule.severity === 'warning'), 'this real preflight contains warnings, not synthetic blockers');
    const index = 0;
    assert.equal(await text('#report-reader-priority h3'), '建议先核对');
    assert.equal(await text('#report-reader-priority p:first-of-type'), items[index].rule.title);
    assert.equal(await text('#report-reader-priority p:nth-of-type(2)'), items[index].rule.requires[0]);
    const before = await snapshot();
    await activate('#report-reader-priority button');
    assert.equal(await inspect('return document.activeElement.id'), `reader-item-${index}`);
    assert.equal(await inspect('return document.activeElement.checkVisibility()'), true);
    assert.deepEqual((await snapshot()).runs, before.runs);
    assert.deepEqual((await snapshot()).artifacts, before.artifacts);
    await inspect('document.querySelector(".report-reader-body").scrollTop=0');
    await screenshot('reading-priority-overview');
  });
  await checked('Reading path labels are guidance; native outline links focus the actual headings', async () => {
    assert.equal(await inspect('return document.querySelector(".report-reader-steps")'), null, 'static tutorial is replaced by the report content');
    assert.equal(await inspect('return document.querySelector("#desktop-report-reader").getAttribute("role")'), 'region');
    const count = createHandoff(artifacts.check).items.length;
    await activate(`#report-reader-outline a[href="#reader-item-${count - 1}"]`);
    assert.equal(await inspect('return document.activeElement.id'), `reader-item-${count - 1}`);
    await activate('#report-reader-outline a[href="#reader-item-0"]'); assert.equal(await inspect('return document.activeElement.id'), 'reader-item-0');
    await inspect(`document.querySelector('#report-reader-outline a[href="#reader-item-0"]').focus()`); await press('\uE007');
    assert.equal(await inspect('return document.activeElement.id'), 'reader-item-0', 'keyboard Enter follows the outline and focuses its heading');
    await press('\uE004'); assert.equal(await inspect('return document.querySelector("#desktop-report-reader").contains(document.activeElement)'), true);
    await activate('#report-reader-content article:first-child .report-reader-evidence > summary');
    assert.match(await text('#report-reader-content article:first-child .report-reader-evidence'), /资料记录日期.*未实时核验/);
    const confidenceIndex = createHandoff(artifacts.check).items.findIndex(item => item.rule.confidence);
    assert.ok(confidenceIndex >= 0, 'real preflight includes a rule with recorded confidence');
    const evidenceSelector = `[data-reader-item="${confidenceIndex}"] .report-reader-evidence`;
    if (confidenceIndex !== 0) await activate(`${evidenceSelector} > summary`);
    assert.equal(await inspect('return document.querySelector(arguments[0] + " > p").checkVisibility()', [evidenceSelector]), true);
    await screenshot('reading-rule-confidence');
    await closeReader(); assert.equal(await inspect('return document.activeElement.checkVisibility()'), true); await closeTools();
    await activate('#home-report'); await readerReady(); await closeReader();
    assert.equal(await inspect('return document.activeElement.id'), 'home-report');
    await openMenu(); await closeReader(); assert.equal(await inspect('return document.activeElement.id'), 'desktop-more');
  });
  await checked('Complete original report remains expandable and actual copy retains its Markdown', async () => {
    await fromHistory(artifacts.check); await activate('#report-reader-original > summary');
    assert.equal(await inspect('return document.querySelector("#report-reader-original").open'), true);
    assert.equal((await text('#report-reader-original .report-markdown')).replace(/\s+/g, ' ').trim(), (await text('#report')).replace(/\s+/g, ' ').trim());
    await geometry('original-report'); await closeReader();
    if (!await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-toggle');
    await activate('#copy-report'); await until(async () => /已复制报告/.test(await text('#copy-status')), 'real original report copy completed');
    const clipboard = await readWindowsClipboard();
    const newlineStats = value => ({ length: value.length, crlf: (value.match(/\r\n/g) || []).length, bareLf: (value.match(/(?<!\r)\n/g) || []).length, bareCr: (value.match(/\r(?!\n)/g) || []).length });
    const diagnostics = {
      expected: newlineStats(artifacts.check.markdown), actual: newlineStats(clipboard), exactEqual: clipboard === artifacts.check.markdown,
      // Windows Clipboard converts LF to CRLF. Preserve every other character,
      // including trailing newlines, spaces and any standalone carriage return.
      crlfToLfOnlyEqual: clipboard.replace(/\r\n/g, '\n') === artifacts.check.markdown.replace(/\r\n/g, '\n'),
    };
    await writeFile(resolve(run, 'reading-clipboard.json'), JSON.stringify(diagnostics, null, 2));
    assert.equal(diagnostics.crlfToLfOnlyEqual, true, 'Windows clipboard must match fixture Markdown after CRLF-to-LF conversion only; contents are intentionally omitted');
    await closeTools();
  });
  for (const kind of ['guide', 'explain']) await checked(`Actual ${kind} artifact reopens from history with all structured requirements`, async () => {
    artifacts[kind] = await projectInvoke('project_run', { projectId, kind, runId: `reading-${kind}`, ...(kind === 'guide' ? { subject: 'personal' } : { query: '隐私' }) });
    assert.ok(createHandoff(artifacts[kind]).items.length > 0);
    if (kind === 'guide') assert.ok(artifacts.guide.data.result.selfCheck.length > 0, 'real guide includes conditional applicability');
    await fromHistory(artifacts[kind]); await verifyContent(artifacts[kind]); await geometry(`${kind}-wide`);
    await activate('#report-reader-handoff');
    await until(() => inspect('return document.querySelector("#desktop-handoff").matches(":modal")'), 'handoff opens from the saved report');
    const handoff = await text('#handoff-content');
    if (kind === 'guide') assert.match(handoff, /重新生成上线清单/);
    else {
      assert.match(handoff, /原始审核反馈/);
      assert.doesNotMatch(handoff, /重新生成上线清单/);
    }
    await click('#handoff-done'); await closeReader(); await closeTools();
  });
  await checked('Guide filters keep the outline, original numbering and full handoff in sync', async () => {
    await fromHistory(artifacts.guide);
    const items = createHandoff(artifacts.guide).items;
    const allIds = items.map((_, index) => `reader-item-${index}`);
    const conditionalIds = allIds.filter((_, index) => items[index].conditional);
    assert.ok(conditionalIds.length > 0 && conditionalIds.length < items.length, 'real guide has both conditional and confirmed items');
    const selectFilter = key => activate(`#report-reader-summary [data-reader-filter="${key}"]`);
    const visibleItems = () => inspect(`return {
      articles: [...document.querySelectorAll('#report-reader-content article h3')].filter(n => n.checkVisibility()).map(n => n.id),
      outline: [...document.querySelectorAll('#report-reader-outline li a')].filter(n => n.checkVisibility()).map(n => n.hash.slice(1)),
      pressed: [...document.querySelectorAll('#report-reader-summary [aria-pressed="true"]')].map(n => n.dataset.readerFilter)
    }`);
    await inspect(`document.querySelector('#report-reader-summary [data-reader-filter="conditional"]').focus()`);
    await press('\uE007');
    assert.equal(await inspect('return document.activeElement.dataset.readerFilter'), 'conditional');
    assert.equal(await text('#report-reader-filter-status'), `显示条件自查 ${conditionalIds.length} 项，共 ${items.length} 项`);
    assert.equal(await inspect('return document.querySelector("#report-reader-filter-status").getAttribute("role")'), 'status');
    assert.deepEqual(await visibleItems(), { articles: conditionalIds, outline: conditionalIds, pressed: ['conditional'] });
    await screenshot('reading-conditional-filter');
    await activate('#report-reader-original > summary');
    const original = await inspect('return document.querySelector("#report-reader-original .report-markdown").textContent');
    for (const item of items) assert.ok(original.includes(item.rule.title), 'original report keeps every rule title');
    await activate('#report-reader-original > summary');
    await activate(`#report-reader-outline a[href="#${conditionalIds[0]}"]`);
    assert.equal(await inspect('return document.activeElement.id'), conditionalIds[0]);
    await activate('#report-reader-handoff');
    await until(() => inspect('return document.querySelector("#desktop-handoff").matches(":modal")'), 'full handoff opened from a filtered guide');
    assert.equal(await inspect('return document.querySelectorAll("#handoff-content h2").length'), items.length);
    await click('#handoff-done');
    assert.deepEqual(await visibleItems(), { articles: conditionalIds, outline: conditionalIds, pressed: ['conditional'] });
    await activate('#report-reader-priority button');
    assert.ok(!conditionalIds.includes(await inspect('return document.activeElement.id')), 'priority opens an unconditional item hidden by the conditional filter');
    assert.deepEqual(await visibleItems(), { articles: allIds, outline: allIds, pressed: ['all'] });
    await selectFilter('all');
    await closeReader(); await closeTools();
  });
  await checked('Action filters compose with severity and quote state while preserving the complete saved guide', async () => {
    await fromHistory(artifacts.guide);
    const items = createHandoff(artifacts.guide).items;
    const actions = item => item.rule.action_categories ?? ['manual_check'];
    const select = async (selector, value) => {
      const index = await inspect('return [...document.querySelector(arguments[0]).options].findIndex(n => n.value === arguments[1])', [selector, value]);
      assert.ok(index >= 0);
      await activate(selector); await press('\uE011');
      for (let i = 0; i < index; i++) await press('\uE015');
      await press('\uE007');
      assert.equal(await inspect('return document.querySelector(arguments[0]).value', [selector]), value);
    };
    const verify = async expected => {
      const ids = items.flatMap((item, index) => expected(item) ? [`reader-item-${index}`] : []);
      const visible = await inspect(`return {
        articles:[...document.querySelectorAll('#report-reader-content article h3')].filter(n=>n.checkVisibility()).map(n=>n.id),
        outline:[...document.querySelectorAll('#report-reader-outline li a')].filter(n=>n.checkVisibility()).map(n=>n.hash.slice(1))
      }`);
      assert.deepEqual(visible, { articles: ids, outline: ids });
    };
    for (const action of ['code', 'console', 'materials', 'manual_check']) {
      await select('#report-reader-action-filter', action);
      await verify(item => actions(item).includes(action));
    }
    await select('#report-reader-action-filter', 'console');
    await activate('#report-reader-summary [data-reader-filter="conditional"]');
    await until(() => inspect('return !document.querySelector("#report-reader-quote-filter").disabled'), 'quote snapshot loaded');
    await select('#report-reader-quote-filter', 'unchecked');
    await verify(item => item.conditional && actions(item).includes('console'));
    await screenshot('reading-action-filter');
    await activate('#report-reader-handoff');
    await until(() => inspect('return document.querySelector("#desktop-handoff").matches(":modal")'), 'full handoff from action filter');
    assert.equal(await inspect('return document.querySelectorAll("#handoff-content h2").length'), items.length);
    await click('#handoff-done');
    assert.equal(await inspect('return document.querySelector("#report-reader-action-filter").value'), 'console');
    await verify(item => item.conditional && actions(item).includes('console'));
    await closeReader(); await closeTools();
    await fromHistory(artifacts.guide); await verifyContent(artifacts.guide);
    assert.equal(await inspect('return document.querySelector("#report-reader-action-filter").value'), 'all');
    await closeReader(); await closeTools();
  });
  await checked('Closing a handoff resumes the same report, evidence and reading position', async () => {
    await appearance('light');
    await fromHistory(artifacts.guide);
    const evidence = '#report-reader-content article:nth-child(2) .report-reader-evidence';
    await activate(evidence + ' > summary');
    const position = () => inspect('return document.querySelector(".report-reader-body").scrollTop');
    const initialPosition = await position();
    assert.ok(initialPosition > 0, 'the report has been scrolled to an item');
    for (const dismiss of ['escape', 'done']) {
      await activate('#report-reader-handoff');
      await until(() => inspect('return document.querySelector("#desktop-report-reader").open && document.querySelector("#desktop-handoff").matches(":modal")'), 'handoff opened over reader');
      assert.ok((await text('#handoff-source')).includes(artifacts.guide.id));
      assert.equal(await inspect('return getComputedStyle(document.querySelector("#handoff-content")).fontSize'), '18px');
      assert.equal(await inspect('return document.querySelectorAll("dialog:modal").length'), 1);
      if (dismiss === 'escape') await press('\uE00C'); else await click('#handoff-done');
      await until(() => inspect('return !document.querySelector("#desktop-handoff").open && document.activeElement.id === "report-reader-handoff"'), 'focus returns to the reader action');
      assert.equal(await inspect('return document.querySelector(arguments[0]).open', [evidence]), true);
      assert.ok(Math.abs(await position() - initialPosition) <= 1, 'scroll position stays on the same evidence');
    }
    await screenshot('reading-after-handoff');
    await closeReader(); await closeTools();
  });
  await checked('Report workspace retains focus and reachable navigation when shrinking', async () => {
    await command('POST', '/window/rect', { width: 1000, height: 850 }); await fromHistory(artifacts.check);
    await command('POST', '/window/rect', { width: 390, height: 850 });
    await until(() => inspect('const d=document.querySelector("#desktop-report-reader"),b=document.querySelector("#report-reader-dismiss"),r=b.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return d.open && !d.matches(":modal") && d.getAttribute("role")==="region" && d.contains(document.activeElement) && (hit===b||b.contains(hit))'), 'reader stays active above the responsive tools drawer');
    await geometry('toolbar-reader-resize'); await closeReader();
    assert.equal(await inspect('return document.activeElement!==document.body && document.activeElement.checkVisibility()'), true);
    await closeTools(); await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('Saved reports return keyboard focus to their visible history entry', async () => {
    const before = await snapshot();
    for (const [width, entry, target] of [[1200, '#home-results', '#home-results'], [390, '#desktop-results-open', '#desktop-results-open']]) {
      await command('POST', '/window/rect', { width, height: 850 });
      const returned = () => until(() => inspect('const target=document.querySelector(arguments[0]); return !document.querySelector("#desktop-tools").open && !document.querySelector("#desktop-report-reader").open && target.checkVisibility() && document.activeElement === target', [target]), `report exit returns focus to ${target} at ${width}px`);
      await openHistoryReport(artifacts.check, entry); await closeTools(); await returned();
      await fromHistory(artifacts.check, entry); await closeReader(); await returned();
      if (width === 390) await screenshot('reading-history-return-focus-390');
    }
    const after = await snapshot();
    assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.artifacts, before.artifacts);
    await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('Refresh and native restart retain all real reports without running tools again', async () => {
    const before = await snapshot(); await refresh();
    assert.deepEqual((await snapshot()).artifacts, before.artifacts); assert.deepEqual((await snapshot()).runs, before.runs);
    await fromHistory(artifacts.check); await verifyContent(artifacts.check); await closeReader(); await closeTools();
    await quit(); await launch(); assert.deepEqual((await snapshot()).artifacts, before.artifacts); assert.deepEqual((await snapshot()).runs, before.runs);
    await fromHistory(artifacts.guide); await verifyContent(artifacts.guide);
    assert.equal(await inspect('return getComputedStyle(document.querySelector(".report-reader-body")).fontSize'), '18px', 'reading preference survives native restart');
    await closeReader(); await closeTools();
  });
  await checked('Changed project revision remains an explicitly historical reading snapshot', async () => {
    await projectDialog(); await fill('#project-name', '报告阅读验收项目 · 已改名'); await click('#project-save');
    await until(async () => (await snapshot()).projects.find(item => item.id === projectId).revision > artifacts.check.projectRevision, 'project metadata revision saved');
    await closeProjects(); await fromHistory(artifacts.check);
    assert.match(await text('#report-reader-warning'), /项目版本已变化/); await geometry('historical-warning'); await closeReader(); await closeTools();
  });
  for (const theme of ['light', 'dark']) await checked(`Reading ${theme} appearance respects 18px text at 320, 390, 1000 and 1440px`, async () => {
    await command('POST', '/window/rect', { width: 1200, height: 900 }); await appearance(theme); await fromHistory(artifacts.guide);
    for (const width of [320, 390, 1000, 1440]) {
      await command('POST', '/window/rect', { width, height: 900 });
      await inspect('document.querySelector(".report-reader-body").scrollTop=0;document.querySelector("#report-reader-dismiss").focus()');
      const value = await geometry(`${theme}-${width}`); assert.equal(value.messageSize, '18px'); assert.equal(value.theme, theme);
      for (let index = 0; index < 8; index++) { await press('\uE004'); assert.equal(await inspect('return document.querySelector("#desktop-report-reader").contains(document.activeElement)'), true); }
    }
    await closeReader(); assert.equal(await inspect('return document.activeElement!==document.body && document.activeElement.checkVisibility()'), true); await closeTools();
  });
  await checked('Reading survives 200 percent text and user text-spacing overrides without page overflow', async () => {
    await fromHistory(artifacts.guide);
    try {
      for (const scenario of [{ width: 320, doubleText: true, spacing: false }, { width: 390, doubleText: false, spacing: true }, { width: 1000, doubleText: true, spacing: true }, { width: 1440, doubleText: true, spacing: true }]) {
        await command('POST', '/window/rect', { width: scenario.width, height: 1000 }); await stress(scenario);
        await inspect('document.querySelector(".report-reader-body").scrollTop=0;document.querySelector("#report-reader-dismiss").focus()');
        const value = await geometry(`stress-${scenario.width}-${scenario.doubleText ? '200percent' : 'normal'}-${scenario.spacing ? 'spacing' : 'default'}`);
        assert.equal(value.messageSize, scenario.doubleText ? '36px' : '18px');
        await activate('#report-reader-original > summary');
        assert.equal(await inspect('return document.querySelector("#report-reader-original").open'), true);
        await geometry(`stress-original-${scenario.width}`); await activate('#report-reader-original > summary');
      }
    } finally { await clearStress(); }
    await closeReader(); await closeTools(); await command('POST', '/window/rect', { width: 1200, height: 850 });
  });
  await checked('Next step opens the missing fact and keeps unsaved guidance drafts intact', async () => {
    await activate('#desktop-workflow-open');
    await until(() => inspect('return document.querySelector("#desktop-workflow").open && !document.querySelector("#workflow-content").hidden && !document.querySelector("#workflow-retry").disabled'), 'workflow loaded');
    let state = await projectInvoke('project_workflow', { projectId });
    for (let count = 0; count < state.catalog.stages.length; count++) {
      const model = deriveWorkflow(state), next = model.stages.find(stage => stage.id === model.nextAction?.stageId);
      if (!next || next.applicability === null) break;
      assert.equal(next.applicability, true);
      await activate('#workflow-next-open');
      await activate(`#workflow-confirm-${next.id}`);
      await until(async () => {
        state = await projectInvoke('project_workflow', { projectId });
        return deriveWorkflow(state).stages.find(stage => stage.id === next.id).status === 'confirmed'
          && await inspect('return !document.querySelector("#workflow-retry").disabled');
      }, 'explicit stage confirmation saved');
    }
    const model = deriveWorkflow(state);
    assert.equal(model.nextAction.stageId, 'privacy');
    await activate('#workflow-facts-open');
    const draft = '保留尚未保存的业务核对草稿';
    await fill('#workflow-businessType', draft);
    await activate('#workflow-facts > summary');
    assert.equal(await text('#workflow-next-open'), '补充项目事实');
    const before = await projectInvoke('project_workflow', { projectId });
    await activate('#workflow-next-open');
    assert.equal(await inspect('return document.activeElement.id'), 'workflow-collectsSensitive');
    assert.equal(await inspect('return document.querySelector("#workflow-facts").open'), true);
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), draft);
    assert.deepEqual(await projectInvoke('project_workflow', { projectId }), before, 'navigation never saves facts or confirms a stage');
    await screenshot('workflow-next-missing-fact');
    await activate('#workflow-close');
  });
  await checked('Conditional report entries open the matching project fact without saving or replacing drafts', async () => {
    const before = await projectInvoke('project_workflow', { projectId });
    const draft = '保留尚未保存的业务核对草稿';
    for (const field of ['collectsSensitive', 'hasServerDomain']) {
      assert.equal(before.project.facts[field], null);
      await fromHistory(artifacts.guide);
      const entry = `#report-reader-content [data-reader-fact="${field}"]`;
      await activate(entry);
      await until(() => inspect('return document.querySelector("#desktop-workflow").open && !document.querySelector("#workflow-content").hidden && !document.querySelector("#workflow-retry").disabled && document.activeElement.id === arguments[0]', [`workflow-${field}`]), `report opens the ${field} fact field`);
      assert.equal(await inspect('return document.querySelector("#workflow-facts").open'), true);
      assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), draft);
      assert.equal(await inspect('return document.querySelector(arguments[0]).value', [`#workflow-${field}`]), 'unknown');
      assert.deepEqual(await projectInvoke('project_workflow', { projectId }), before, 'report navigation never saves facts or changes confirmations');
      assert.deepEqual(await projectInvoke('project_artifact', { artifactId: artifacts.guide.id }), artifacts.guide, 'original guide remains a saved snapshot');
      await screenshot(`reading-missing-fact-${field}`);
      await activate('#workflow-close');
    }
  });
  await checked('Saving a missing fact produces a new guide and preserves the old report with a stale-facts warning', async () => {
    await fromHistory(artifacts.guide);
    await activate('#report-reader-content [data-reader-fact="collectsSensitive"]');
    await until(() => inspect('return document.activeElement.id === "workflow-collectsSensitive" && !document.querySelector("#workflow-retry").disabled'), 'privacy fact focused');
    assert.equal(await inspect('return document.querySelector("#workflow-generate-guide").disabled'), true, 'unsaved draft must be saved before generation');
    // End selects the last observed native option, false; Tab commits it through the real field handler.
    assert.equal(await inspect('return document.querySelector("#workflow-collectsSensitive").options[2].value'), 'false');
    await press('\uE010'); await press('\uE004');
    assert.equal(await inspect('return document.querySelector("#workflow-collectsSensitive").value'), 'false');
    await activate('#workflow-save-facts');
    await until(() => inspect('return !document.querySelector("#workflow-generate-guide").disabled && document.querySelector("#workflow-status").textContent.includes("项目事实已保存")'), 'saved facts ready for generation');
    const saved = await projectInvoke('project_workflow', { projectId });
    assert.equal(saved.project.facts.collectsSensitive, false);
    assert.equal(saved.project.facts.businessType, '保留尚未保存的业务核对草稿');
    assert.equal((await snapshot()).artifacts.length, 3, 'saving facts alone never regenerates a report');
    await screenshot('workflow-facts-saved-update-guide');
    await activate('#workflow-generate-guide'); await readerReady();
    const state = await snapshot(), fresh = state.artifacts.find(item => !Object.values(artifacts).some(old => old.id === item.id));
    assert.ok(fresh, 'a separate guide artifact was saved');
    artifacts.updatedGuide = await projectInvoke('project_artifact', { artifactId: fresh.id });
    assert.equal(artifacts.updatedGuide.kind, 'guide');
    assert.equal(artifacts.updatedGuide.contextRevision, saved.project.contextRevision);
    assert.notEqual(artifacts.updatedGuide.contextRevision, artifacts.guide.contextRevision);
    await verifyContent(artifacts.updatedGuide);
    assert.equal(await inspect('return document.querySelector("#report-reader-content [data-reader-fact=collectsSensitive]") === null'), true);
    assert.doesNotMatch(await text('.report-reader-warning'), /项目事实已变化/);
    await screenshot('reading-updated-guide');
    await closeReader();
    await fromHistory(artifacts.guide);
    assert.match(await text('.report-reader-warning'), /项目事实已变化/);
    assert.deepEqual(await projectInvoke('project_artifact', { artifactId: artifacts.guide.id }), artifacts.guide);
    await screenshot('reading-old-guide-stale-facts');
    await closeReader(); await closeTools();
  });
  await checked('Reading and explicit guide regeneration preserve files and original artifacts without model requests', async () => {
    assert.deepEqual((await readdir(directory)).sort(), Object.keys(files).sort());
    for (const [name, content] of Object.entries(files)) assert.equal(await readFile(resolve(directory, name), 'utf8'), content);
    for (const artifact of Object.values(artifacts)) assert.deepEqual(await projectInvoke('project_artifact', { artifactId: artifact.id }), artifact);
    const final = await snapshot(); assert.equal(final.runs.length, 4); assert.equal(final.artifacts.length, 4); assert.ok(final.runs.every(item => item.state === 'succeeded'));
    assert.equal(requests.length, 0); assert.deepEqual(await inspect('return window.__readingAcceptanceErrors'), []);
    await writeFile(resolve(run, 'reading-evidence.json'), JSON.stringify({
      artifacts: Object.values(artifacts).map(({ id, runId, kind, projectRevision }) => ({ id, runId, kind, projectRevision })),
      toolsExecuted: final.runs.map(({ id, kind, state }) => ({ id, kind, state })), modelRequests: requests.length,
      officialLinks: 'Verified URL and accessible link metadata only; no external page opened.',
      clipboard: 'Actual report-toolbar Clipboard API write followed by Windows PowerShell -STA Get-Clipboard -Raw. JSON decoded, CRLF converted to LF only, then exact fixture comparison; all other characters preserved. Only length/newline statistics and equality results logged. No API mock or external paste.',
      textStress: 'DOM-only 200% computed font-size and line-height 1.5, paragraph spacing 2em, letter .12em, word .16em overrides; restored after assertions.',
      limits: 'Bounded report-reader checks, not a whole-product WCAG conformance or installed-release acceptance claim. Invalid/legacy structured data fallback is covered separately by unit tests.',
    }, null, 2));
  });
}
