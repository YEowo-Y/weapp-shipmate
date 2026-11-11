import assert from 'node:assert/strict';
import { readFile, writeFile, realpath, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { extractMainText } from '../src/source-text.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sampleHtml = `<html><title>Labelled source acceptance fixture</title><main class="page"><h1>原生来源检查夹具</h1><p>${'此文本仅用于确定性检查器验收，不代表官方规则、政策变化或真实联网结果。'.repeat(18)}</p></main></html>`;

async function inventory(root, paths) {
  const files = {};
  async function visit(path) {
    const info = await lstat(path);
    assert.equal(info.isSymbolicLink(), false, `Evidence path cannot be a symlink: ${path}`);
    if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(resolve(path, name));
    else files[relative(root, path).replaceAll('\\', '/')] = hash(await readFile(path));
  }
  for (const path of paths) await visit(resolve(root, path));
  return files;
}

// Install BEFORE the first native launch. All checks execute the real bundled
// core with request/DNS dependency injection; no invoke or final-result mocks.
// Timing and malformed-output fixtures deliberately test failure boundaries.
export async function prepareSourceFreshnessFixture({ run, isolatedDirectory }) {
  assert.ok(isolatedDirectory, 'Sources acceptance requires a disposable runtime');
  const root = await realpath(isolatedDirectory), runtime = await realpath(resolve(root, 'runtime'));
  const cli = await realpath(resolve(runtime, 'desktop/server/source-check.mjs'));
  const inside = relative(root, cli);
  assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Only mutate the verified disposable runtime');
  const original = await readFile(cli), originalPath = resolve(dirname(cli), 'p7-sources-original.mjs');
  const control = resolve(dirname(cli), 'p7-sources-control.json'), journal = resolve(dirname(cli), 'p7-sources-journal.jsonl');
  const protectedRuntime = ['rules', 'flow.yaml', 'rejections.yaml', 'source-catalog.json'];
  const protectedRepo = ['rules', 'flow.yaml', 'rejections.yaml', 'corpus/source-snapshots'];
  const runtimeBefore = await inventory(runtime, protectedRuntime), repoBefore = await inventory(repo, protectedRepo);
  const catalog = JSON.parse(await readFile(resolve(runtime, 'source-catalog.json'), 'utf8'));
  await writeFile(originalPath, original); await writeFile(journal, '');
  await writeFile(control, JSON.stringify({ mode: 'changed', html: sampleHtml }));
  const wrapper = `// Labelled disposable native acceptance adapter. Never shipped.
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { checkSource } from './p7-sources-original.mjs';
const config=JSON.parse(readFileSync(new URL('./p7-sources-control.json',import.meta.url),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('../../source-catalog.json',import.meta.url),'utf8'));
const log=entry=>appendFileSync(new URL('./p7-sources-journal.jsonl',import.meta.url),JSON.stringify({...entry,time:Date.now(),pid:process.pid})+'\\n');
log({event:'invocation',sourceId:process.argv[2],mode:config.mode});
if(config.mode==='malformed'){process.stdout.write('{"labelledMalformedFixture":true}\\n');}
else {
const lookup=async(host,options)=>{log({event:'dns',host,options});return [{address:config.mode==='private'?'127.0.0.1':'8.8.8.8',family:4}];};
const request=(url,options,onResponse)=>{
  assert.equal(url.protocol,'https:'); assert.equal(options.method,'GET'); assert.equal(options.servername,url.hostname); assert.equal(options.agent,false);
  assert.deepEqual(Object.keys(options.headers).sort(),['accept','accept-encoding','user-agent']);
  options.lookup(url.hostname,{all:true},(error,addresses)=>{assert.ifError(error);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);});
  log({event:'request',url:url.href,method:options.method,headers:options.headers,pinnedAddress:'8.8.8.8',hasRequestBody:false});
  const req=new EventEmitter(); req.destroy=()=>{req.destroyed=true;}; req.end=()=>{
    if(config.mode==='hold'||config.mode==='timeout')return;
    queueMicrotask(()=>{
      if(req.destroyed)return;
      if(config.mode==='network'){req.emit('error',new Error('Labelled network failure'));return;}
      const response=Readable.from([Buffer.from(config.mode==='login'?'<html><title>Sign in</title><input type="password"></html>':config.html)]);
      response.statusCode=config.mode==='redirect'?302:config.mode==='missing'?404:200;
      response.headers={'content-type':'text/html; charset=utf-8',...(config.mode==='redirect'?{location:'https://127.0.0.1/blocked'}:{})};
      onResponse(response);
    });
  }; return req;
};
const result=await checkSource(catalog,process.argv[2],{lookup,request,quote:process.argv[4],timeoutMs:config.mode==='timeout'?100:10000});
process.stdout.write(JSON.stringify(result)+'\\n');
}
`;
  await writeFile(cli, wrapper);
  return {
    catalog, runtime, journal,
    async mode(mode, html = sampleHtml) { await writeFile(control, JSON.stringify({ mode, html })); },
    async events() { return (await readFile(journal, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); },
    async assertProtected() {
      assert.deepEqual(await inventory(runtime, protectedRuntime), runtimeBefore, 'checks cannot rewrite bundled rules or source metadata');
      assert.deepEqual(await inventory(repo, protectedRepo), repoBefore, 'checks cannot rewrite repository rules or source archives');
    },
    async restore() {
      await writeFile(cli, original);
      assert.equal(hash(await readFile(cli)), hash(original));
      await writeFile(resolve(run, 'source-check-fixture-events.json'), await readFile(journal));
    },
  };
}

export async function checkSourceFreshnessFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, quit, launch, requests, sourceFixture, ownedRuntimeProcesses }) {
  const fixture = sourceFixture, snapshot = () => projectInvoke('source_freshness_snapshot');
  const automatic = fixture.catalog.sources.find(source => source.baseline?.method === 'fetch');
  const manual = fixture.catalog.sources.find(source => source.baseline?.method === 'manual');
  assert.ok(automatic && manual, 'Built-in catalog contains both automatic and manually archived sources');
  const row = source => `.source-freshness-row[data-source-id="${source.id}"]`;
  const button = source => `wa-button[data-source-id="${source.id}"]`;
  const record = async source => (await snapshot()).checks.find(item => item.sourceId === source.id);
  const invocations = async () => (await fixture.events()).filter(item => item.event === 'invocation');
  const ready = () => until(() => inspect('const d=document.querySelector("#desktop-source-freshness"),b=document.querySelector("#source-freshness-reload");return d?.open && d.getAttribute("aria-busy")==="false" && b&&!b.disabled;'), 'sources panel settled');
  const open = async () => { await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="sources"]'); await ready(); };
  const close = async () => { await click('#source-freshness-done'); await until(() => inspect('return !document.querySelector("#desktop-source-freshness").open'), 'sources panel closed'); };
  const expand = async source => { if (!await inspect('return document.querySelector(arguments[0]).open', [row(source)])) await click(`${row(source)} > summary`); };
  const refresh = async () => { await click('#source-freshness-reload'); await ready(); };
  const scrollEvidence = [];
  const checkGeometry = source => inspect(`
    const control=document.querySelector(arguments[0]),body=control.closest('.context-body'),footer=document.querySelector('#desktop-source-freshness > footer');
    const bounds=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const button=bounds(control),bodyRect=bounds(body),footerRect=bounds(footer),inner=control.shadowRoot?.querySelector('button,[part=base]');
    const x=(button.left+button.right)/2,y=(button.top+button.bottom)/2,hit=document.elementFromPoint(x,y);
    return {button,innerButton:bounds(inner),body:bodyRect,footer:footerRect,
      bodyScrollTop:body.scrollTop,bodyScrollHeight:body.scrollHeight,bodyClientHeight:body.clientHeight,
      bodyOverflowY:getComputedStyle(body).overflowY,footerPosition:getComputedStyle(footer).position,buttonDisplay:getComputedStyle(control).display,
      viewport:{width:innerWidth,height:innerHeight},hit:hit?{tag:hit.tagName,id:hit.id,className:hit.className}:null,
      clickable:button.width>0&&button.height>0&&!control.disabled&&button.top>=bodyRect.top&&button.bottom<=bodyRect.bottom&&button.bottom<=footerRect.top&&
        button.left>=0&&button.right<=innerWidth&&button.top>=0&&button.bottom<=innerHeight&&(hit===control||control.contains(hit))};
  `, [button(source)]);
  const clickCheck = async (source = automatic) => {
    await expand(source);
    const entry = { sourceId: source.id, before: await checkGeometry(source), after: null };
    scrollEvidence.push(entry);
    await writeFile(resolve(run, 'source-freshness-scroll.json'), JSON.stringify(scrollEvidence, null, 2));
    // EdgeDriver may align a custom-element host with the viewport bottom while
    // its real click point is clipped by the nested scroll body and footer.
    // Scroll normally, then require a visible, unobstructed hit target. Never
    // force the click or invoke click() in page JavaScript.
    await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})', [button(source)]);
    try {
      await until(async () => { entry.after = await checkGeometry(source); return entry.after.clickable; }, 'source check button is inside the scrollport and unobstructed', 3000);
    } finally { await writeFile(resolve(run, 'source-freshness-scroll.json'), JSON.stringify(scrollEvidence, null, 2)); }
    await click(button(source));
  };
  const check = async (mode, expectedState, expectedReason) => {
    const previous = (await record(automatic))?.latest.checkedAt;
    await fixture.mode(mode); await clickCheck();
    await until(async () => { const saved = await record(automatic); return saved?.latest.checkedAt !== previous && saved?.latest.state === expectedState && saved?.latest.reason === expectedReason; }, `native source result ${expectedState}/${expectedReason}`, 20000);
    await ready(); return record(automatic);
  };
  const observations = [], visuals = {};
  const unchanged = async (description, read, expected, duration = 1200) => {
    // This is a bounded observation of UI/restart idleness, not a lifetime claim.
    const start = Date.now();
    do { assert.deepEqual(await read(), expected, description); await delay(100); } while (Date.now() - start < duration);
    observations.push({ description, durationMs: Date.now() - start });
  };
  const geometry = () => inspect('const d=document.querySelector("#desktop-source-freshness"),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};');
  const contained = value => { assert.ok(value.left >= -1 && value.right <= value.width + 1 && value.top >= -1 && value.bottom <= value.height + 1, JSON.stringify(value)); assert.ok(value.overflow <= 1 && value.pageOverflow <= 1, JSON.stringify(value)); };
  let evidence;

  await checked('P7 sources startup and directory refresh never issue implicit network checks', async () => {
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    const initial = await snapshot(); assert.deepEqual(initial.catalog, fixture.catalog); assert.deepEqual(initial.checks, []);
    assert.equal(initial.catalog.sources.length, 16); assert.equal((await invocations()).length, 0);
    await open(); await refresh(); await refresh();
    assert.equal(await inspect('return document.querySelectorAll(".source-freshness-row").length'), 16);
    assert.equal(await inspect('return document.querySelectorAll(".source-freshness-row[open]").length'), 0);
    assert.match(await text('#source-freshness-description'), /不发送项目/);
    assert.match(await text('#source-freshness-status'), /未发起在线请求/);
    await unchanged('opening and refreshing only read local records', async () => (await invocations()).length, 0);
    await fill('#source-freshness-search', initial.catalog.sources[0].references[0].id);
    assert.ok(await inspect('return [...document.querySelectorAll(".source-freshness-row")].filter(n=>!n.hidden).length > 0'));
    await fill('#source-freshness-search', 'no-such-official-source');
    assert.equal(await inspect('return document.querySelector("#source-freshness-empty").checkVisibility()'), true);
    await click('#source-freshness-clear');
    await click('#source-freshness-filter'); await press('\uE010'); await press('\uE007');
    await until(() => inspect('return document.querySelector("#source-freshness-filter").value === "manual"'), 'source state filter selected by keyboard');
    assert.deepEqual(await inspect('return [...document.querySelectorAll(".source-freshness-row")].filter(n=>!n.hidden).map(n=>n.dataset.sourceId)'), initial.catalog.sources.filter(source => source.baseline?.method === 'manual').map(source => source.id));
    assert.equal(await inspect('return [...document.querySelectorAll(".source-freshness-row")].filter(n=>!n.hidden).every(n=>n.querySelector("summary small").textContent === "需人工核验")'), true);
    await screenshot('p7-sources-filtered'); await click('#source-freshness-clear');
    assert.equal(await inspect('return [...document.querySelectorAll(".source-freshness-row")].filter(n=>!n.hidden).length'), 16);
    assert.equal((await invocations()).length, 0, 'local filtering makes no online checks');
    visuals.directory = await geometry(); contained(visuals.directory); await screenshot('p7-sources-directory');
  });

  await checked('P7 catalog exposes exact official links, archive metadata and manual-verification boundaries', async () => {
    for (const source of [automatic, manual]) {
      await expand(source);
      const link = await inspect('const a=document.querySelector(arguments[0]+" a");return {href:a.href,rel:a.rel,target:a.target};', [row(source)]);
      assert.equal(link.href, source.url); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/); assert.match(link.rel, /noreferrer/);
      await inspect('document.querySelector(arguments[0]+" a").focus()', [row(source)]);
      assert.equal(await inspect('return document.activeElement.matches(arguments[0]+" a") && document.activeElement.checkVisibility()', [row(source)]), true);
      for (const ref of source.references) { assert.ok((await text(row(source))).includes(ref.id)); if (ref.lastVerified) assert.ok((await text(row(source))).includes(ref.lastVerified)); }
    }
    assert.match(await text(row(manual)), /人工归档|人工核验/);
    assert.equal(await inspect('return document.querySelector(arguments[0])===null', [button(manual)]), true);
    assert.equal((await invocations()).length, 0);
    await screenshot('p7-sources-manual-metadata');
    await assert.rejects(projectInvoke('source_freshness_check', { sourceId: 'https://127.0.0.1/private', runId: 'p7-invalid-url' }));
    await assert.rejects(projectInvoke('source_freshness_check', { sourceId: 'source-0000000000000000', runId: 'p7-invalid-source' }));
    assert.equal((await invocations()).length, 0, 'untrusted IDs are denied before Node execution');
  });

  await checked('P7 explicit source check uses real extraction, hash comparison, native validation and SQLite', async () => {
    const before = await projectInvoke('project_snapshot');
    const saved = await check('changed', 'changed', 'different'); evidence = saved.lastEvidence;
    assert.deepEqual(evidence, saved.latest); assert.equal(saved.sourceId, automatic.id);
    assert.equal(saved.latest.contentHash, hash(extractMainText(sampleHtml))); assert.notEqual(saved.latest.contentHash, automatic.baseline.hash);
    assert.equal(saved.latest.catalogVersion, fixture.catalog.catalogVersion); assert.equal(saved.latest.httpStatus, 200);
    assert.match(await text(row(automatic)), /正文与归档不同|有效正文证据/);
    assert.equal(await inspect('return document.querySelector(arguments[0]).open', [row(automatic)]), true, 'expanded row survives result rendering');
    assert.deepEqual(await projectInvoke('project_snapshot'), before, 'source checks never become project artifacts or runs');
    await screenshot('p7-sources-changed-evidence');
  });

  await checked('P7 network, login, redirects, private DNS and timeout preserve prior valid evidence', async () => {
    for (const [mode, reason] of [['network', 'network'], ['login', 'access'], ['redirect', 'redirect'], ['private', 'access'], ['timeout', 'timeout']]) {
      const before = (await fixture.events()).filter(item => item.event === 'request').length;
      const saved = await check(mode, 'unknown', reason);
      assert.equal(saved.latest.contentHash, null); assert.deepEqual(saved.lastEvidence, evidence);
      assert.equal(await inspect('return document.querySelector("#source-freshness-status").dataset.error'), 'true');
      assert.match(await text(row(automatic)), /保留的有效正文证据/);
      if (mode === 'private') assert.equal((await fixture.events()).filter(item => item.event === 'request').length, before, 'private DNS never opens a request');
    }
    const saved = await check('missing', 'unavailable', 'not_found'); assert.deepEqual(saved.lastEvidence, evidence); assert.equal(saved.latest.httpStatus, 404);
    assert.doesNotMatch(await text('#source-freshness-status'), /政策已更新|已核验政策/);
    await screenshot('p7-sources-unknown-preserved');
  });

  await checked('P7 cancellation and global tool lock prevent overlapping work and retain saved evidence', async () => {
    await fixture.mode('hold'); const before = await record(automatic), count = (await invocations()).length;
    await clickCheck();
    await until(async () => (await invocations()).length === count + 1 && (await fixture.events()).at(-1)?.event === 'request', 'held actual source process reaches request adapter');
    assert.equal(await inspect('return document.querySelector("#source-freshness-stop").hidden'), false);
    assert.equal(await inspect('return [...document.querySelectorAll("#source-freshness-list wa-button")].every(b=>b.disabled)'), true);
    const other = fixture.catalog.sources.find(item => item.id !== automatic.id && item.baseline?.method !== 'manual');
    await assert.rejects(projectInvoke('source_freshness_check', { sourceId: other.id, runId: 'p7-busy-source' }), /busy|正在|占用|运行|执行|任务/i);
    await assert.rejects(projectInvoke('run_guide', { subject: 'personal', runId: 'p7-busy-guide' }), /busy|正在|占用|运行|执行|任务/i);
    assert.equal((await invocations()).length, count + 1, 'busy denial cannot dispatch another source process');
    assert.ok((await ownedRuntimeProcesses()).length > 0);
    await screenshot('p7-sources-checking'); await click('#source-freshness-stop'); await ready();
    await until(async () => (await ownedRuntimeProcesses()).length === 0, 'stopped source child exits', 15000);
    await refresh(); assert.deepEqual(await record(automatic), before);
    await unchanged('canceled source cannot commit a late result', () => record(automatic), before);
    const recovered = await check('changed', 'changed', 'different'); evidence = recovered.lastEvidence;
  });

  await checked('P7 malformed child output is recoverable and never replaces valid stored evidence', async () => {
    const before = await record(automatic), count = (await invocations()).length;
    await fixture.mode('malformed'); await clickCheck();
    await until(async () => (await invocations()).length === count + 1, 'malformed output fixture executed'); await ready();
    assert.equal(await inspect('return document.querySelector("#source-freshness-status").dataset.error'), 'true');
    assert.match(await text('#source-freshness-status'), /重试|未能完成/); assert.deepEqual(await record(automatic), before);
    await screenshot('p7-sources-error-recovery');
    evidence = (await check('changed', 'changed', 'different')).lastEvidence;
  });

  await checked('P7 Escape cancels an active check and restores a visible menu focus target', async () => {
    const before = await record(automatic), count = (await invocations()).length;
    await fixture.mode('hold'); await clickCheck();
    await until(async () => (await invocations()).length === count + 1, 'active source before dismiss');
    await press('\uE00C'); await until(() => inspect('return !document.querySelector("#desktop-source-freshness").open && document.activeElement.id==="desktop-more" && document.activeElement.checkVisibility()'), 'Escape closes panel and returns focus');
    await until(async () => (await ownedRuntimeProcesses()).length === 0, 'dismissal cancels owned source child', 15000);
    assert.deepEqual(await record(automatic), before); await open();
  });

  await checked('P7 restart cancels active source work, restores SQLite evidence and does not recheck', async () => {
    const before = await snapshot(), count = (await invocations()).length;
    await fixture.mode('hold'); await clickCheck();
    await until(async () => (await invocations()).length === count + 1 && (await ownedRuntimeProcesses()).length > 0, 'source child active before native exit');
    await quit(); await launch(); assert.deepEqual(await snapshot(), before);
    await open(); await expand(automatic); assert.match(await text(row(automatic)), /有效正文证据/);
    await unchanged('restart and restored panel do not repeat source requests', async () => (await invocations()).length, count + 1);
    await screenshot('p7-sources-restored'); await close();
  });

  await checked('P7 preferences and health route to one source dialog with dark, narrow and keyboard support', async () => {
    await click('#desktop-preferences-open'); await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'preferences open');
    await click('#desktop-theme-dark'); await click('#desktop-motion-reduce');
    await click('#preferences-nav-about'); await click('#settings-sources'); await ready();
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").open && document.querySelector("#desktop-preferences").dataset.section==="about"'), true);
    assert.equal(await inspect('return document.querySelector("#desktop-source-freshness").matches(":modal") && document.querySelector("#desktop-source-freshness").contains(document.activeElement)'), true);
    assert.equal(await inspect('return document.querySelectorAll("#desktop-source-freshness").length'), 1);
    assert.equal(await inspect('return document.body.dataset.theme'), 'dark'); await expand(automatic);
    visuals.darkWide = await geometry(); contained(visuals.darkWide); await screenshot('p7-sources-dark-wide');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    visuals.darkNarrow = await geometry(); contained(visuals.darkNarrow);
    await inspect('document.querySelector("#source-freshness-done").focus()'); await press('\uE004');
    assert.equal(await inspect('return document.activeElement.id'), 'source-freshness-dismiss');
    for (let index = 0; index < 16; index++) { await press('\uE004'); assert.equal(await inspect('return document.querySelector("#desktop-source-freshness").contains(document.activeElement)'), true); }
    await screenshot('p7-sources-dark-narrow'); await close();
    assert.equal(await inspect('return document.activeElement.checkVisibility()'), true);
    assert.equal(await inspect('return document.activeElement.id'), 'settings-sources');
    await click('#preferences-content-dismiss'); await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'return from source settings to application');
    await command('POST', '/window/rect', { width: 1200, height: 850 });
    await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="health"]');
    await until(() => inspect('return document.querySelector("#desktop-health").open'), 'health open');
    await click('#health-sources'); await ready();
    assert.equal(await inspect('return document.querySelector("#desktop-health").open'), false);
    assert.equal(await inspect('return document.querySelectorAll("#desktop-source-freshness").length'), 1); await close();
  });

  await checked('P7 checks leave rules, archives, projects and model transport untouched', async () => {
    await fixture.assertProtected(); assert.equal(requests.length, 0);
    assert.deepEqual(await inspect('return window.__sourceAcceptanceErrors'), []);
    const project = await projectInvoke('project_snapshot'); assert.equal(project.projects.length, 0); assert.equal(project.runs.length, 0); assert.equal(project.artifacts.length, 0);
    const sent = (await fixture.events()).filter(item => item.event === 'request');
    assert.ok(sent.length > 0); assert.ok(sent.every(item => item.method === 'GET' && item.hasRequestBody === false && item.pinnedAddress === '8.8.8.8'));
    assert.ok(sent.every(item => fixture.catalog.sources.some(source => source.url === item.url)));
    assert.deepEqual((await record(automatic)).lastEvidence, evidence);
    await writeFile(resolve(run, 'source-freshness-visuals.json'), JSON.stringify(visuals, null, 2));
    await writeFile(resolve(run, 'source-freshness-observations.json'), JSON.stringify({ observations, catalogVersion: fixture.catalog.catalogVersion, publicNetwork: 'Not exercised: deterministic request and DNS adapters through the real core.', officialLinks: 'Verified exact href, rel, target and keyboard focus; external browsers were not opened.', requestCount: sent.length }, null, 2));
  });

  await checked('Report filters use latest quote evidence and keep the outline aligned with severity and quote filters', async () => {
    await quit(); await launch();
    await click('#start-guide'); await click('#guide-btn');
    await until(() => inspect('return !document.querySelector("#read-report").disabled'), 'guide generated');
    await click('#read-report');
    const selector = '#report-reader-content .report-quote-check button:not([hidden])';
    const first = () => inspect('return document.querySelector(arguments[0])?.closest("article").querySelector(".report-quote-status")?.textContent', [selector]);
    await until(async () => (await first())?.includes('尚未在线核验'), 'reader loaded local quote records');
    assert.equal(await inspect('return document.querySelectorAll("#report-reader-content article").length === document.querySelectorAll("#report-reader-content .report-quote-status").length'), true);
    const expected = await inspect(`return [...document.querySelectorAll("#report-reader-content article")].map(article => ({
      id: article.querySelector("h3").id, eligible: !article.querySelector(".report-quote-check button").hidden
    }))`);
    const unchecked = expected.filter(row => row.eligible).map(row => row.id);
    const manual = expected.filter(row => !row.eligible).map(row => row.id);
    assert.ok(unchecked.length && manual.length, 'guide exercises both online and manual items');
    const filter = '#report-reader-quote-filter';
    const checkVisible = async ids => {
      const rows = await inspect(`return {
        content: [...document.querySelectorAll("#report-reader-content article:not([hidden]) h3")].map(n => n.id),
        outline: [...document.querySelectorAll("#report-reader-outline li:not([hidden]) a")].map(n => n.hash.slice(1))
      }`);
      assert.deepEqual(rows.content, ids); assert.deepEqual(rows.outline, ids);
    };
    const choose = async value => {
      await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",behavior:"instant"})', [filter]);
      await click(`${filter} option[value="${value}"]`);
      await until(() => inspect('return document.querySelector(arguments[0]).value === arguments[1]', [filter, value]), `quote filter ${value}`);
    };
    const beforeChecks = (await invocations()).length;
    await choose('manual'); await checkVisible(manual);
    await choose('unchecked'); await checkVisible(unchecked);
    await choose('all'); await checkVisible(expected.map(row => row.id));
    assert.equal((await invocations()).length, beforeChecks);
    const quote = await inspect('return document.querySelector(arguments[0]).closest("article").querySelector("blockquote").textContent', [selector]);
    const verify = async (mode, expected, html) => {
      await fixture.mode(mode, html);
      await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",behavior:"instant"})', [selector]);
      await click(selector);
      await until(async () => (await first())?.includes(expected), expected);
      return first();
    };
    const escaped = quote.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    assert.match(await verify('changed', '本次核验 · 引文逐字匹配', sampleHtml.replace('</main>', '<p>' + escaped + '</p></main>')), /核验时间/);
    await choose('matched'); await checkVisible([unchecked[0]]);
    await click('#report-reader-summary [data-reader-filter="conditional"]');
    await checkVisible([]);
    await click('#report-reader-summary [data-reader-filter="all"]');
    await checkVisible([unchecked[0]]);
    await choose('all');
    assert.match(await verify('changed', '本次核验 · 官方正文未找到此引文'), /上次匹配时间/);
    await choose('missing'); await checkVisible([unchecked[0]]);
    await choose('all');
    assert.match(await verify('network', '本次核验 · 无法核验'), /网络连接失败.*上次匹配时间/);
    await screenshot('report-quote-network-after-match');
    const count = (await invocations()).length;
    await click('#report-reader-dismiss');
    await click('#desktop-more');
    await click('#desktop-actions wa-dropdown-item[value="report"]');
    await until(async () => (await first())?.includes('上次记录 · 无法核验'), 'reopened report shows last failed check');
    assert.match(await first(), /网络连接失败.*上次匹配时间/);
    await choose('unverified'); await checkVisible([unchecked[0]]);
    await screenshot('report-quote-filter-reopened-failure');
    assert.equal(await inspect('return document.querySelector("#report-reader-priority").hidden'), true);
    await click('#report-reader-quote-jump');
    assert.equal(await inspect('const e=document.activeElement;return e.matches(".report-reader-evidence[open] > summary") && e.closest("article").querySelector("h3").id === arguments[0]', [unchecked[0]]), true);
    await choose('unchecked'); await checkVisible(unchecked.slice(1));
    assert.equal(count, beforeChecks + 3, 'only the three explicit verification actions invoked the checker');
    assert.equal((await invocations()).length, count, 'opening the report never sends a verification request');
  });
}
