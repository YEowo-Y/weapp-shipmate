import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const apiUrl = 'https://api.github.com/repos/YEowo-Y/weapp-shipmate/releases/latest';
const releasePage = 'https://github.com/YEowo-Y/weapp-shipmate/releases/tag/';
const checkButton = '#settings-check-release';
const status = '#settings-release-status';
const tag = '#settings-release-tag';
const page = '#settings-release-page';
const idle = '点击后从 GitHub 查询公开稳定版。';
const failure = '检查更新失败，请重试。';

export async function prepareReleaseCheckFixture(isolatedDirectory) {
  assert.ok(isolatedDirectory, 'Version checks require a disposable runtime copy');
  const root = await realpath(isolatedDirectory);
  const script = await realpath(resolve(root, 'runtime/desktop/server/release-check.mjs'));
  const inside = relative(root, script);
  assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Only edit the isolated copy');
  const original = await readFile(script);
  const folder = dirname(script);
  const originalPath = resolve(folder, 't12b-original.mjs');
  const control = resolve(folder, 't12b-control.json');
  const journal = resolve(folder, 't12b-journal.jsonl');
  const gate = resolve(folder, 't12b-continue');
  const wrapper = `// Test adapter. Installed only in the disposable native runtime.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { fetchLatestRelease } from './t12b-original.mjs';
const here = name => new URL('./t12b-' + name, import.meta.url);
const { mode, tag } = JSON.parse(readFileSync(here('control.json'), 'utf8'));
const log = record => appendFileSync(here('journal.jsonl'), JSON.stringify({ ...record, mode, pid: process.pid, at: Date.now() }) + '\\n');
const proxyActivationRemoved = process.env.NODE_USE_ENV_PROXY === undefined;
const proxyCanaryPresent = /^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(process.env.HTTPS_PROXY ?? '');
log({ event: 'start', proxyActivationRemoved, proxyCanaryPresent });
assert.ok(proxyActivationRemoved && proxyCanaryPresent, 'the release child clears inherited proxy activation');
if (mode === 'malformed') {
  process.stdout.write('{"upstream":"labelled-invalid-output"}\\n');
} else {
  if (mode === 'hold') {
    while (!existsSync(here('continue'))) await delay(30);
  }
  const result = await fetchLatestRelease((input, options, onResponse) => {
    assert.equal(String(input), ${JSON.stringify(apiUrl)});
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.agent, false);
    const headers = new Headers(options.headers);
    assert.deepEqual([...headers.keys()].sort(), ['accept', 'accept-encoding', 'user-agent', 'x-github-api-version']);
    assert.equal(headers.get('accept-encoding'), 'identity');
    assert.equal(headers.get('x-github-api-version'), '2022-11-28');
    const request = new EventEmitter();
    request.end = () => {
      log({ event: 'request', url: String(input), method: 'GET', headers: Object.fromEntries(headers) });
      if (mode === 'timeout') {
        const timer = setTimeout(() => request.emit('error', new Error('Labelled deadline was not applied')), 10000);
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          request.emit('error', options.signal.reason);
        }, { once: true });
      } else {
        const body = JSON.stringify({ tag_name: tag, draft: false, prerelease: false, body: 'labelled-not-displayed', html_url: 'https://example.invalid/test' });
        const response = Readable.from([Buffer.from(body)]);
        response.statusCode = mode === 'unavailable' ? 404 : mode === 'failed' ? 403 : 200;
        response.headers = { 'content-type': 'application/json' };
        queueMicrotask(() => onResponse(response));
      }
    };
    request.destroy = () => request;
    return request;
  });
  process.stdout.write(JSON.stringify(result) + '\\n');
}
log({ event: 'complete' });
`;
  await writeFile(originalPath, original, { flag: 'wx' });
  await writeFile(journal, '', { flag: 'wx' });
  const select = async (mode, tag = 'v0.1.0') => {
    await unlink(gate).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await writeFile(control, JSON.stringify({ mode, tag }));
  };
  await select('release');
  await writeFile(script, wrapper);
  return {
    select,
    release: () => writeFile(gate, ''),
    events: async () => (await readFile(journal, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)),
    restore: async () => {
      await writeFile(script, original);
      assert.deepEqual(await readFile(script), original);
    },
  };
}

export async function checkReleaseFlows({
  run, checked, command, inspect, until, click, press, text, screenshot,
  openSettingsSection, closeSettings, projectInvoke, ownedRuntimeProcesses, quit,
  fixture, live,
}) {
  const evidence = { webviewUserAgent: await inspect('return navigator.userAgent'), appearance: [] };
  const saveEvidence = () => writeFile(resolve(run, 't12b-release-check.json'), JSON.stringify(evidence, null, 2) + '\n');
  const waitForStatus = expected => until(async () => (await text(status))?.trim() === expected, expected);
  const absent = async () => assert.equal(await inspect('return !document.querySelector(arguments[0]) && !document.querySelector(arguments[1])', [tag, page]), true);
  const chooseAppearance = async (theme, width) => {
    await command('POST', '/window/rect', { width, height: 850 });
    await openSettingsSection('appearance');
    await click(`#desktop-theme-${theme}`);
    await until(() => inspect('return document.body.dataset.theme === arguments[0]', [theme]), `apply ${theme} theme`);
    await openSettingsSection('about');
    await waitForStatus(idle);
    assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("role")', [status]), 'status');
    assert.equal(await inspect('return document.querySelectorAll("#settings-versions > div").length'), 3);
    const layout = await inspect(`const body=document.querySelector("#preferences-body");
      const button=document.querySelector(arguments[0]).getBoundingClientRect();
      return {theme:document.body.dataset.theme,width:innerWidth,clientWidth:body.clientWidth,
        scrollWidth:body.scrollWidth,buttonLeft:button.left,buttonRight:button.right};`, [checkButton]);
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1 && layout.buttonLeft >= 0 && layout.buttonRight <= layout.width + 1);
    evidence.appearance.push(layout);
  };
  const keyboard = async selector => {
    await inspect('const button = document.querySelector(arguments[0]); button.focus(); return true;', [selector]);
    assert.equal(await inspect('return document.activeElement.matches(arguments[0])', [selector]), true);
    await press('\uE007');
  };
  const closeWithFocusReturn = async () => {
    await closeSettings();
    await until(() => inspect('return document.activeElement.id === "desktop-preferences-open"'), 'closed settings return focus to its original trigger');
  };
  const probeEscape = async () => {
    await inspect(`const settings=document.querySelector('#desktop-preferences');
      const events=[];
      const note=event=>{if(event.type!=='keydown'||event.key==='Escape') events.push(event.type)};
      const types=['keydown','cancel','close'];
      for(const type of types) settings.addEventListener(type,note,true);
      window.__t12bEscape=()=>{
        for(const type of types) settings.removeEventListener(type,note,true);
        delete window.__t12bEscape;
        return {closed:!settings.open,focus:document.activeElement.id,events};
      };`);
    await press('\uE00C');
    return command('POST', '/execute/async', {
      script: 'const done=arguments[arguments.length-1]; setTimeout(()=>done(window.__t12bEscape()),300);', args: [],
    });
  };
  const starts = async () => (await fixture.events()).filter(item => item.event === 'start');
  const query = async (mode, expected, expectedTag) => {
    await fixture.select(mode, expectedTag);
    await click(checkButton);
    await waitForStatus(expected);
    if (expectedTag) assert.equal((await text(tag)).trim(), expectedTag);
    else await absent();
    assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("aria-disabled") === "true"', [checkButton]), false);
  };

  await chooseAppearance('light', 1240);
  evidence.localVersion = (await until(() => text('#settings-versions dd'), 'packaged desktop version')).trim();
  if (live) {
    await checked('About queries the genuine public GitHub release on keyboard activation', async () => {
      await absent();
      await keyboard(checkButton);
      await until(() => text(tag), 'real stable release tag');
      const publicTag = (await text(tag)).trim();
      assert.match(publicTag, /^v\d+\.\d+\.\d+$/);
      evidence.live = { publicTag, status: await text(status) };
      const packageConfig = JSON.parse(await readFile(new URL('../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
      assert.equal(evidence.localVersion, packageConfig.version);
      if (evidence.localVersion === '0.2.0-rc.6' && publicTag === 'v0.1.0') {
        assert.equal(evidence.live.status.trim(), '当前版本较新。');
      }
      await screenshot('t12b-live-light');
    });
    await checked('Viewing the checked public release hands its fixed URL to the system browser', async () => {
      await inspect(`const original=window.fetch;
        const opener=window.__TAURI_INTERNALS__.convertFileSrc('plugin:opener|open_url','ipc');
        window.fetch=function(input, options) {
          const pending=original.call(this, input, options);
          if(input===opener) pending.then(response=>{
            window.__t12bOpener={url:JSON.parse(options.body).url,ok:response.headers.get('Tauri-Response')==='ok'};
          });
          return pending;
        };
        window.__t12bRestoreOpener=()=>{window.fetch=original};`);
      try {
        await keyboard(page);
        evidence.opener = await until(() => inspect('return window.__t12bOpener ?? null'), 'native browser handoff');
        assert.deepEqual(evidence.opener, { url: releasePage + evidence.live.publicTag, ok: true });
      } finally { await inspect('window.__t12bRestoreOpener();'); }
    });
  } else {
    assert.equal(evidence.localVersion, '0.2.0', 'the stable comparison fixture uses its dedicated version override');
    await checked('Startup, opening About, changing sections and reopening run no query', async () => {
      await absent();
      await inspect('document.querySelector(arguments[0]).focus()', [checkButton]);
      evidence.escape = { idle: await probeEscape() };
      await saveEvidence();
      if (evidence.escape.idle.closed) {
        assert.equal(evidence.escape.idle.focus, 'desktop-preferences-open');
        await openSettingsSection('about');
      }
      await openSettingsSection('shortcuts');
      await closeWithFocusReturn();
      await openSettingsSection('about');
      await waitForStatus(idle);
      assert.deepEqual(await fixture.events(), []);
    });
    await checked('One explicit check survives duplicate activation and leaves project preflight usable', async () => {
      await fixture.select('hold');
      await keyboard(checkButton);
      await waitForStatus('正在检查更新…');
      assert.equal(await inspect('return document.activeElement.matches(arguments[0])', [checkButton]), true);
      assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("aria-disabled")', [checkButton]), 'true');
      await inspect('const button=document.querySelector(arguments[0]); button.click(); button.click();', [checkButton]);
      assert.deepEqual(await projectInvoke('release_check'), { status: 'busy' });
      await until(async () => (await starts()).length === 1, 'sole release checker starts');
      const project = resolve(run, 'release-check-project');
      await mkdir(project);
      await writeFile(resolve(project, 'app.json'), '{"pages":[],"window":{}}\n');
      const report = await projectInvoke('run_check', { dir: project, subject: 'personal', runId: 't12b-parallel' });
      assert.match(report, /预检/);
      assert.equal((await starts()).length, 1);
      await screenshot('t12b-pending-light');
    });
    await checked('Closing during query discards its late answer and restores focus', async () => {
      const [held] = await starts();
      evidence.escape.held = await probeEscape();
      await saveEvidence();
      assert.equal(evidence.escape.held.closed, evidence.escape.idle.closed, 'Escape behavior is consistent during a query');
      if (evidence.escape.held.closed) assert.equal(evidence.escape.held.focus, 'desktop-preferences-open');
      else await closeWithFocusReturn();
      await openSettingsSection('about');
      await waitForStatus(idle);
      await keyboard(checkButton);
      await waitForStatus('上一次检查仍在运行，请稍后重试。');
      assert.equal((await starts()).length, 1);
      await fixture.release();
      await until(async () => !(await ownedRuntimeProcesses()).includes(held.pid), 'closed view query exits');
      await waitForStatus('上一次检查仍在运行，请稍后重试。');
      await absent();
    });
    await checked('Changing sections forgets the pending query and completed results', async () => {
      await fixture.select('hold');
      await keyboard(checkButton);
      await waitForStatus('正在检查更新…');
      const held = await until(async () => (await starts())[1], 'second sole release checker starts');
      await openSettingsSection('shortcuts');
      await openSettingsSection('about');
      await waitForStatus(idle);
      await fixture.release();
      await until(async () => !(await ownedRuntimeProcesses()).includes(held.pid), 'previous section query exits');
      await waitForStatus(idle);
      await absent();
      await query('release', '当前版本较新。', 'v0.1.0');
      await screenshot('t12b-local-newer-light');
      await closeWithFocusReturn();
      await openSettingsSection('about');
      await waitForStatus(idle);
      await absent();
    });
    await checked('Dark narrow About shows unavailable, failure, retry and stable version comparisons', async () => {
      await chooseAppearance('dark', 780);
      await query('unavailable', '暂无可查询的公开版本。');
      await query('failed', failure);
      await query('malformed', failure);
      await query('timeout', failure);
      const timed = (await fixture.events()).filter(item => item.mode === 'timeout');
      evidence.timeoutMs = timed.find(item => item.event === 'complete').at - timed.find(item => item.event === 'request').at;
      assert.ok(evidence.timeoutMs >= 7500 && evidence.timeoutMs < 12000, '8-second request deadline');
      await query('release', '当前版本与公开稳定版相同。', 'v0.2.0');
      await query('release', '公开稳定版较新。', 'v0.2.1');
      assert.doesNotMatch(await text('#preferences-body'), /labelled-not-displayed|example\.invalid/);
      await screenshot('t12b-public-newer-dark');
      const count = (await starts()).length;
      await click('#preferences-categories');
      await openSettingsSection('about');
      await waitForStatus(idle);
      await absent();
      assert.equal((await starts()).length, count);
      await closeSettings();
    });
    await checked('Foreign WebView origin cannot start a release query', async () => {
      const before = (await fixture.events()).length;
      const appUrl = await command('GET', '/url');
      const foreign = createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<!doctype html><title>Origin fixture</title><p id="t12b-foreign">Origin fixture</p>');
      });
      await new Promise((ok, reject) => { foreign.once('error', reject); foreign.listen(0, '127.0.0.1', ok); });
      try {
        await command('POST', '/url', { url: `http://127.0.0.1:${foreign.address().port}/` });
        await until(() => text('#t12b-foreign'), 'foreign-origin HTML loaded');
        evidence.foreignDenied = await command('POST', '/execute/async', {
          script: `const done=arguments[arguments.length-1];
            if(typeof window.__TAURI_INTERNALS__?.invoke !== 'function') { done(true); return; }
            window.__TAURI_INTERNALS__.invoke('release_check').then(()=>done(false),()=>done(true));`, args: [],
        });
        assert.equal(evidence.foreignDenied, true);
        assert.equal((await fixture.events()).length, before);
      } finally {
        await command('POST', '/url', { url: appUrl });
        foreign.closeAllConnections();
        await new Promise(accept => foreign.close(accept));
      }
      await until(() => inspect('return !!document.querySelector("#desktopInput")'), 'trusted WebView restored');
    });
    await checked('Native shutdown reaps the in-flight release checker', async () => {
      const count = (await starts()).length;
      await fixture.select('hold');
      await openSettingsSection('about');
      await click(checkButton);
      const child = await until(async () => (await starts())[count], 'held release checker starts');
      assert.ok((await ownedRuntimeProcesses()).includes(child.pid));
      await quit({ nativeClose: true });
      assert.deepEqual(await ownedRuntimeProcesses(), []);
      evidence.reapedPid = child.pid;
    });
    evidence.events = await fixture.events();
  }
  await saveEvidence();
}
