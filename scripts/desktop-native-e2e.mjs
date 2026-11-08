/* global AbortSignal */
// Real Windows Tauri/WebView2 E2E. The Ollama upstream is a labelled deterministic
// fixture, as is OpenRouter's OAuth exchange; no invoke mocks, browser preview,
// external account or paid API is used.
import assert from 'node:assert/strict';
import { checkHandoffFlows } from './native-handoff-acceptance.mjs';
import { checkHealthFlows } from './native-health-acceptance.mjs';
import { checkMemoryFlows } from './native-memory-acceptance.mjs';
import { checkMaintenanceFlows } from './native-maintenance-acceptance.mjs';
import { checkSourceFreshnessFlows, prepareSourceFreshnessFixture } from './native-source-freshness-acceptance.mjs';
import { checkSystemNotificationFlows } from './native-system-notification-acceptance.mjs';
import { checkReadingFlows } from './native-reading-acceptance.mjs';
import { checkPresentationFlows } from './native-presentation-acceptance.mjs';
import { checkOpenClaudeChat } from './native-open-claude-acceptance.mjs';
import { checkResultTrust } from './native-result-trust-acceptance.mjs';
import { checkProjectRepairFlows } from './native-project-repair-acceptance.mjs';
import { checkProjectRestore } from './native-project-restore-acceptance.mjs';
import { checkProviderAgentFlows } from './native-provider-agent-acceptance.mjs';
import { checkBuiltinProviderFlows } from './native-builtin-providers-acceptance.mjs';
import { createAgentFixture } from './native-agent-fixture.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, stat, cp, mkdtemp, realpath, rename, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(repo, '.omx/artifacts/desktop-model-native');
const run = resolve(artifacts, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const isolated = process.argv.includes('--isolated-runtime');
const releaseSmoke = process.argv.includes('--release-smoke');
const projectsMode = process.argv.includes('--projects');
const restoreMode = process.argv.includes('--restore');
const repairMode = process.argv.includes('--repair');
const providerAgentMode = process.argv.includes('--provider-agent');
const builtinProvidersMode = process.argv.includes('--builtin-providers');
const allBatchesMode = process.argv.includes('--all-batches');
const workflowMode = process.argv.includes('--workflow');
const handoffMode = process.argv.includes('--handoff') || process.argv.includes('--p6');
const healthMode = process.argv.includes('--health') || process.argv.includes('--p7');
const memoryMode = process.argv.includes('--memory');
const maintenanceMode = process.argv.includes('--maintenance');
const sourcesMode = process.argv.includes('--sources');
const notificationsMode = process.argv.includes('--notifications');
const readingMode = process.argv.includes('--reading');
const presentationMode = process.argv.includes('--presentation');
const agentMode = process.argv.includes('--agent') || process.argv.includes('--p5');
const connectionsMode = process.argv.includes('--connections') || process.argv.includes('--p4');
const expectedIdentifier = process.argv.find(value => value.startsWith('--expected-identifier='))?.slice('--expected-identifier='.length);
let projectDatabase;
const suppliedApplication = process.argv.find(value => value.startsWith('--application='))?.slice('--application='.length);
let application = suppliedApplication || resolve(repo, 'desktop/src-tauri/target/debug/desktop.exe');
const processExitChecks = [];
const maintenanceFrontendErrors = [];
const sourceFrontendErrors = [];
const notificationFrontendErrors = [];
const readingFrontendErrors = [];
const presentationFrontendErrors = [];
let verifiedRuntimeExecutable;
let verifiedApplication;
let isolatedDirectory;
let sourceFixture;
const elementKey = 'element-6066-11e4-a52e-4f735466cecf';
const realModel = process.argv.includes('--real-ollama');
const model = realModel ? 'llama3.2:3b' : 'shipmate-native-fixture:latest';
const checks = [], requests = [];
const agentFixture = createAgentFixture(requests);
const captures = [];
const projectVisuals = [];
let binarySha256;
let session, driver, fixture, driverLog;
let customFixture;
let providerAgentFixtureHandler;
let failNext = false, holdNext = false, emptyCatalog = false, oauthExchanges = 0;
const base = 'http://127.0.0.1:4444';

async function until(work, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let error;
  while (Date.now() < deadline) {
    try { const result = await work(); if (result) return result; } catch (caught) { error = caught; }
    await delay(100);
  }
  throw new Error(`Timed out: ${description}${error ? ` (${error.message})` : ''}`);
}
async function wd(method, path, body) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${method} ${path}: ${JSON.stringify(data.value)}`);
  return data.value;
}
const command = (method, path, body) => wd(method, `/session/${session}${path}`, body);
const find = async selector => (await command('POST', '/element', { using: 'css selector', value: selector }))[elementKey];
const click = async selector => command('POST', `/element/${await until(() => find(selector), selector)}/click`, {});
async function openNavigation() {
  if (await inspect('const n=document.querySelector("#desktop-navigation"); return n && !n.open && getComputedStyle(n.querySelector("summary")).display !== "none";')) {
    await click('#desktop-navigation > summary');
  }
}
async function fill(selector, text) {
  const id = await find(selector);
  await command('POST', `/element/${id}/clear`, {});
  await command('POST', `/element/${id}/value`, { text });
}
const inspect = (script, args = []) => command('POST', '/execute/sync', { script, args });
const text = selector => inspect('return document.querySelector(arguments[0])?.textContent ?? null', [selector]);
const press = value => command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }] });
async function checked(name, work) {
  const start = Date.now();
  await work(); checks.push({ name, passed: true, durationMs: Date.now() - start });
  console.log(`PASS ${name}`);
}
async function screenshot(name, { settle = true } = {}) {
  // Capture settled surfaces, while keeping continuous streaming motion active.
  if (settle) await until(() => inspect(`return document.getAnimations().every(animation =>
    !(animation.pending || animation.playState === 'running') ||
    !Number.isFinite(animation.effect?.getComputedTiming().endTime));`), 'finite visual transitions settled', 2000);
  await writeFile(resolve(run, `${name}.png`), Buffer.from(await command('GET', '/screenshot'), 'base64'));
  captures.push({ name, window: await command('GET', '/window/rect') });
}
async function launch() {
  // Edge WebDriver otherwise overrides the env var with a fresh temporary UDF.
  // https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options
  const result = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': {
    application, webviewOptions: { userDataFolder: resolve(run, 'webview-profile') },
  } } } });
  session = result.sessionId;
  await until(() => inspect('return Boolean(document.querySelector("#desktopInput") && !document.querySelector("#desktopInput").disabled)'), 'native app ready', 30000);
  assert.match(await command('GET', '/url'), /^(tauri:|https?:\/\/tauri\.localhost)/);
  assert.equal(await inspect('return typeof window.__TAURI_INTERNALS__?.invoke'), 'function');
  if (memoryMode) await inspect('window.__memoryAcceptanceErrors=[]; window.addEventListener("error",event=>window.__memoryAcceptanceErrors.push({message:event.message,line:event.lineno,column:event.colno,stack:event.error?.stack}));');
  if (maintenanceMode) await inspect('window.__maintenanceAcceptanceErrors=[]; window.addEventListener("error",event=>window.__maintenanceAcceptanceErrors.push({type:"error",message:event.message,line:event.lineno,column:event.colno})); window.addEventListener("unhandledrejection",event=>window.__maintenanceAcceptanceErrors.push({type:"unhandledrejection",message:String(event.reason?.message||event.reason)}));');
  if (sourcesMode) await inspect('window.__sourceAcceptanceErrors=[]; window.addEventListener("error",event=>window.__sourceAcceptanceErrors.push({type:"error",message:event.message,line:event.lineno,column:event.colno})); window.addEventListener("unhandledrejection",event=>window.__sourceAcceptanceErrors.push({type:"unhandledrejection",message:String(event.reason?.message||event.reason)}));');
  if (notificationsMode) await inspect('window.__notificationAcceptanceErrors=[]; window.addEventListener("error",event=>window.__notificationAcceptanceErrors.push({type:"error",message:event.message,line:event.lineno,column:event.colno})); window.addEventListener("unhandledrejection",event=>window.__notificationAcceptanceErrors.push({type:"unhandledrejection",message:String(event.reason?.message||event.reason)}));');
  if (readingMode) await monitorReadingErrors();
  if (presentationMode) await monitorPresentationErrors();
  if (builtinProvidersMode || allBatchesMode || repairMode || providerAgentMode || restoreMode || projectsMode || workflowMode || connectionsMode || agentMode || handoffMode || healthMode || memoryMode || maintenanceMode || sourcesMode || notificationsMode || readingMode || presentationMode) {
    await until(() => inspect('return document.querySelector("#desktop-project-select") && !document.querySelector("#desktop-project-select").disabled'), 'project store and session scope ready', 30000);
    assert.ok((await stat(projectDatabase)).isFile(), 'isolated identifier database exists');
  }
}
async function monitorReadingErrors() {
  await inspect('window.__readingAcceptanceErrors=[]; window.addEventListener("error",event=>window.__readingAcceptanceErrors.push({type:"error",message:event.message,line:event.lineno,column:event.colno})); window.addEventListener("unhandledrejection",event=>window.__readingAcceptanceErrors.push({type:"unhandledrejection",message:String(event.reason?.message||event.reason)}));');
}
async function refreshReading() {
  readingFrontendErrors.push(...await inspect('return window.__readingAcceptanceErrors || []'));
  await command('POST', '/refresh', {});
  await until(() => inspect('return document.querySelector("#desktop-project-select") && !document.querySelector("#desktop-project-select").disabled && document.querySelector("#desktopInput") && !document.querySelector("#desktopInput").disabled'), 'reading workspace hydrated after native refresh', 30000);
  await monitorReadingErrors();
}
async function monitorPresentationErrors() {
  await inspect('window.__presentationAcceptanceErrors=[]; window.addEventListener("error",event=>window.__presentationAcceptanceErrors.push({type:"error",message:event.message,line:event.lineno,column:event.colno})); window.addEventListener("unhandledrejection",event=>window.__presentationAcceptanceErrors.push({type:"unhandledrejection",message:String(event.reason?.message||event.reason)}));');
}
async function refreshPresentation() {
  presentationFrontendErrors.push(...await inspect('return window.__presentationAcceptanceErrors || []'));
  await command('POST', '/refresh', {});
  await until(() => inspect('return document.querySelector("#desktop-project-select") && !document.querySelector("#desktop-project-select").disabled && document.querySelector("#desktopInput") && !document.querySelector("#desktopInput").disabled'), 'presentation workspace hydrated after native refresh', 30000);
  await monitorPresentationErrors();
}
async function ownedRuntimeProcesses() {
  const executable = resolve(dirname(application), 'runtime/node.exe');
  const powershell = resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script = `$ErrorActionPreference="Stop"; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $taskProcesses=@(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'desktop.exe'" | Select-Object ProcessId,ParentProcessId,ExecutablePath); ConvertTo-Json -InputObject $taskProcesses -Compress`;
  return new Promise((accept, reject) => {
    const query = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, env: { ...process.env, SHIPMATE_E2E_RUNTIME_NODE: executable } });
    let output = '', error = '';
    query.stdout.on('data', data => { output += data; });
    query.stderr.on('data', data => { error += data; });
    query.on('error', reject);
    query.on('exit', async code => {
      if (code !== 0) { reject(new Error(`Scoped runtime process query failed: ${error}`)); return; }
      try {
        const candidates = JSON.parse(output.trim() || '[]');
        const normalize = value => value.replace(/^\\\\\?\\/, '').toLowerCase();
        if (!verifiedRuntimeExecutable) {
          // Packaged Codex may virtualize AppData. Require identical filesystem file IDs,
          // not a matching name/suffix, before accepting a CIM-reported physical path.
          const expectedApp = await stat(application, { bigint: true });
          const expectedNode = await stat(executable, { bigint: true });
          for (const candidate of candidates) {
            if (!candidate.ExecutablePath) continue;
            try {
              const observedApp = await stat(candidate.ExecutablePath, { bigint: true });
              if (expectedApp.ino === 0n || observedApp.ino !== expectedApp.ino || observedApp.dev !== expectedApp.dev) continue;
              verifiedApplication = candidate.ExecutablePath;
              // The app CIM path can stay virtual while Rust canonicalizes its child path.
              // Verify the direct parent PID and the node file identity independently.
              for (const child of candidates.filter(item => item.ParentProcessId === candidate.ProcessId && item.ExecutablePath)) {
                const observedNode = await stat(child.ExecutablePath, { bigint: true });
                if (expectedNode.ino !== 0n && observedNode.ino === expectedNode.ino && observedNode.dev === expectedNode.dev) {
                  verifiedRuntimeExecutable = child.ExecutablePath;
                  break;
                }
              }
              if (verifiedRuntimeExecutable) break;
            } catch { /* Other processes are not owned by this test. */ }
          }
        }
        const target = normalize(verifiedRuntimeExecutable || executable);
        accept(candidates.filter(item => item.ExecutablePath && normalize(item.ExecutablePath) === target).map(item => item.ProcessId));
      } catch (caught) { reject(caught); }
    });
  });
}
async function quit() {
  if (!session) return;
  const before = releaseSmoke || maintenanceMode || sourcesMode || notificationsMode || readingMode || presentationMode ? await ownedRuntimeProcesses() : [];
  if (maintenanceMode) maintenanceFrontendErrors.push(...await inspect('return window.__maintenanceAcceptanceErrors || []'));
  if (sourcesMode) sourceFrontendErrors.push(...await inspect('return window.__sourceAcceptanceErrors || []'));
  if (notificationsMode) notificationFrontendErrors.push(...await inspect('return window.__notificationAcceptanceErrors || []'));
  if (readingMode) readingFrontendErrors.push(...await inspect('return window.__readingAcceptanceErrors || []'));
  if (presentationMode) presentationFrontendErrors.push(...await inspect('return window.__presentationAcceptanceErrors || []'));
  await command('DELETE', ''); session = null;
  if (healthMode || repairMode || handoffMode || memoryMode || maintenanceMode || sourcesMode || notificationsMode || readingMode || presentationMode) {
    // DELETE /session can return before WebView2 finishes writing Preferences.
    // Wait only for this run's explicitly isolated profile; do not kill browsers.
    await until(async () => {
      const remaining = await new Promise((accept, reject) => {
        const query = spawn(resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process -Filter "Name = \'msedgewebview2.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($env:SHIPMATE_TEST_PROFILE,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count'], { windowsHide: true, env: { ...process.env, SHIPMATE_TEST_PROFILE: resolve(run, 'webview-profile') } });
        let output = ''; query.stdout.on('data', data => { output += data; }); query.on('error', reject);
        query.on('exit', code => code === 0 && /^\d+$/.test(output.trim()) ? accept(Number(output.trim())) : reject(new Error('Could not verify isolated WebView2 shutdown')));
      });
      return remaining === 0;
    }, 'isolated persistent WebView2 profile finishes shutdown', 15000);
  }
  if (releaseSmoke || maintenanceMode || sourcesMode || notificationsMode || readingMode || presentationMode) {
    await until(async () => (await ownedRuntimeProcesses()).length === 0, 'installed runtime processes exit after native shutdown', 15000);
    processExitChecks.push({ verifiedPhysicalApplication: verifiedApplication ?? null, verifiedPhysicalExecutable: verifiedRuntimeExecutable ?? null, executable: resolve(dirname(application), 'runtime/node.exe'), before, remaining: [], passed: true });
  }
  if (maintenanceMode) assert.deepEqual(maintenanceFrontendErrors, [], 'no monitored frontend errors or unhandled rejections');
  if (sourcesMode) assert.deepEqual(sourceFrontendErrors, [], 'no monitored source-panel frontend errors or unhandled rejections');
  if (notificationsMode) assert.deepEqual(notificationFrontendErrors, [], 'no monitored notification frontend errors or unhandled rejections');
  if (readingMode) assert.deepEqual(readingFrontendErrors, [], 'no monitored report-reading frontend errors or unhandled rejections');
  if (presentationMode) assert.deepEqual(presentationFrontendErrors, [], 'no monitored presentation frontend errors or unhandled rejections');
}
async function settingsConnectionsReady() {
  await until(() => inspect('const settings=document.querySelector("#desktop-preferences"); return settings.open && settings.dataset.section==="models" && settings.querySelector(".desktop-model-panel")?.checkVisibility() && !document.querySelector("#desktop-model-dialog").open'), 'embedded model settings ready');
}
async function openSettingsSection(section) {
  if (!await inspect('return document.querySelector("#desktop-preferences").open')) {
    await openNavigation(); await click('#desktop-preferences-open');
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && Boolean(document.querySelector("#preferences-body"))'), 'global settings ready');
  }
  if (!await inspect('return document.querySelector(arguments[0]).checkVisibility()', [`#preferences-nav-${section}`])) await click('#preferences-categories');
  await click(`#preferences-nav-${section}`);
}
async function openSettingsConnections() { await openSettingsSection('models'); await settingsConnectionsReady(); }
async function openModelSettings() { await openSettingsConnections(); }
async function openDataSettings() {
  await openSettingsSection('data');
  await until(() => inspect('const settings=document.querySelector("#desktop-preferences"); return settings.open && settings.dataset.section==="data" && settings.querySelector(".session-workspace-data-panel")?.checkVisibility()'), 'embedded session data settings ready');
}
async function closeSettings() {
  await click('#preferences-content-dismiss');
  await until(() => inspect('return !document.querySelector("#desktop-preferences").open'), 'settings return to application');
}
async function connectedModel() {
  await openModelSettings();
  await until(() => inspect('return !document.querySelector("[data-provider-id=ollama]").disabled'), 'provider selector ready');
  await click('[data-provider-id="ollama"]');
  await until(() => inspect('return document.querySelector("[data-provider-id=ollama]").getAttribute("aria-pressed") === "true"'), 'Ollama selected');
  await until(() => inspect('return !document.querySelector("#desktop-provider-connect").disabled'), 'connect ready');
  await click('#desktop-provider-connect');
  await until(() => find(`#desktop-preferences .desktop-model-panel [data-model-id="${model}"]`), 'discovered fixture model');
  await screenshot('model-connection');
  await click(`#desktop-preferences .desktop-model-panel [data-model-id="${model}"]`);
  await until(() => inspect('return document.querySelector("#desktop-preferences .desktop-model-panel [aria-pressed=true][data-model-id]")?.dataset.modelId === arguments[0]', [model]), 'model selected inside settings');
}
async function send(message) { await fill('#desktopInput', message); await click('#desktopSend'); }
async function openExplainFromMenu() {
  await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="explain"]');
  await until(() => inspect('return document.querySelector("#desktop-explain").open && document.activeElement.id === (document.querySelector("#rjQuery").open ? "rjInput" : "rjResultHeading")'), 'menu lookup open and focused');
}
async function editExplainQuery() {
  if (!await inspect('return document.querySelector("#rjQuery").open')) await click('#rjQuerySummary');
}
async function finished() { await until(async () => ['complete', 'idle', 'stopped', 'error'].includes(await inspect('return document.querySelector("#desktopConversationStatus").dataset.state')), 'generation settled'); }

// P2 uses real typed IPC for fixture setup and storage assertions only. Product
// interactions below run through the actual native WebView DOM and bundled CLI.
async function projectInvoke(method, args = {}) {
  const result = await command('POST', '/execute/async', {
    script: 'const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),reason=>done({ok:false,reason:String(reason)}));', args: [method, args],
  });
  if (!result.ok) throw new Error(`${method}: ${result.reason}`);
  return result.value;
}
async function chooseOption(selector, value) {
  // Native select options cannot reliably be clicked in the OS popup by EdgeDriver.
  // Selecting an observed DOM option and dispatching change still exercises the
  // installed product's handler, persistence, rendering and recovery paths.
  await inspect('const node=document.querySelector(arguments[0]); if(node.disabled || !Array.from(node.options).some(o=>o.value===arguments[1])) throw new Error("Unavailable option"); node.value=arguments[1];node.dispatchEvent(new Event("change",{bubbles:true}));', [selector, value]);
}
async function selectProject(id) {
  await openNavigation();
  const selector = `.project-folder-row[data-project-id=${JSON.stringify(id ?? '')}]`;
  await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"nearest"})', [selector]);
  if (!await inspect('const n=document.querySelector(arguments[0]); return n.getAttribute("aria-current")==="true" && n.getAttribute("aria-expanded")==="true"', [selector])) await click(selector);
  await until(() => inspect('const n=document.querySelector("#desktop-project-select"); return !n.disabled && n.value===arguments[0]', [id ?? '']), 'project selection saved');
}
async function projectDialog() { await openNavigation(); await click('#desktop-project-manage'); await until(() => inspect('return document.querySelector("#desktop-projects").open'), 'project dialog open'); }
async function closeProjects() { await click('#project-close'); await until(() => inspect('return !document.querySelector("#desktop-projects").open'), 'project dialog closed'); }
async function saveDraft(value) {
  await fill('#desktopInput', value);
  await until(async () => /已保存/.test(await text('[data-action="save-status"]')), 'draft persisted');
}
async function checkProjectFlows() {
  const a = 'p2-acceptance-a', b = 'p2-acceptance-b';
  const directoryA = resolve(run, '项目 A'), directoryB = resolve(run, '项目 B');
  await mkdir(directoryA); await mkdir(directoryB);
  for (const directory of [directoryA, directoryB]) {
    await writeFile(resolve(directory, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }));
    await writeFile(resolve(directory, 'project.config.json'), JSON.stringify({ appid: 'touristappid', projectname: 'P2 acceptance fixture', miniprogramRoot: './' }));
  }
  const snapshot = () => projectInvoke('project_snapshot');
  await checked('P2 isolation: fresh dedicated identifier database and no inherited project fixtures', async () => {
    const initial = await snapshot(); assert.equal(initial.projects.length, 0); assert.equal(initial.runs.length, 0);
    assert.equal(initial.activeProjectId, null);
    await saveDraft('未归属旧会话草稿');
  });
  await checked('Real IPC seeds two labelled fixture directories; UI reload exposes both project options', async () => {
    for (const [id, name, directory] of [[a, '验收项目 A', directoryA], [b, '验收项目 B', directoryB]]) {
      await projectInvoke('project_save', { project: { id, name, directory, subject: 'personal' } });
    }
    await projectDialog(); await click('#project-retry');
    await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===3 && !document.querySelector("#project-retry").disabled'), 'fixture projects loaded');
    await closeProjects();
  });
  await checked('Project A/B/unassigned switches preserve separate drafts without copying sessions', async () => {
    await selectProject(a); assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '');
    await saveDraft('项目 A 独立草稿');
    await selectProject(b); assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '');
    await saveDraft('项目 B 独立草稿');
    await selectProject(a); assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '项目 A 独立草稿');
    await selectProject(null); assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '未归属旧会话草稿');
    await selectProject(a);
  });
  await checked('Project settings rename through form, with keyboard dismissal and trigger focus recovery', async () => {
    await projectDialog(); await fill('#project-name', '验收项目 A 已改名'); await click('#project-save');
    await until(() => inspect('return document.querySelector("#desktop-project-select").selectedOptions[0].textContent==="验收项目 A 已改名" && !document.querySelector("#project-save").disabled'), 'renamed project persisted');
    assert.equal((await snapshot()).projects.find(p => p.id === a).name, '验收项目 A 已改名');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-projects").open && document.activeElement.id==="desktop-project-manage"'), 'Escape returns project trigger focus');
  });
  let originalArtifact;
  await checked('Actual bundled guide produces immutable project A artifact and explicit historical provenance', async () => {
    await click('#start-guide'); await click('#guide-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#guide-btn").disabled'), 'project guide saved', 30000);
    assert.ok((await text('#report')).length > 50); assert.match(await text('#report-note'), /历史|保存于/);
    const state = await snapshot(); originalArtifact = state.artifacts.find(item => item.projectId === a);
    assert.ok(originalArtifact); assert.equal(state.runs.find(item => item.id === originalArtifact.runId).state, 'succeeded');
    assert.ok(originalArtifact.toolVersion); assert.ok(Object.keys(JSON.parse(originalArtifact.rulesVersion)).length > 0);
    await screenshot('p2-project-report');
    await click('#save-report'); await until(async () => /已加入/.test(await text('#copy-status')), 'report added to matching session');
    await click('#desktop-tools-close');
  });
  await checked('Project B has no A report or A history; returning A restores saved report', async () => {
    await selectProject(b);
    assert.ok(!(await text('#desktopMessages')).includes('上线清单'));
    await projectDialog(); assert.equal(await inspect('return document.querySelectorAll("#project-history .project-run").length'), 0); assert.ok((await text('#project-history')).length > 0); await closeProjects();
    await openNavigation(); await click('[data-action="history"]');
    assert.ok(!(await text('.session-workspace__results')).includes('上线清单'));
    await press('\uE00C'); await selectProject(a);
    assert.ok((await text('#report')).length > 50);
    await projectDialog(); await click('#project-history button');
    await until(() => inspect('return !document.querySelector("#desktop-projects").open'), 'historical artifact opens');
    assert.match(await text('#report-note'), /历史|保存于/);
    if (await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-close');
  });
  await checked('Actual project check reads the saved fixture directory and persists findings as a successful report', async () => {
    await click('#desktop-tools-toggle'); await click('#check-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#check-btn").disabled'), 'real project check finishes', 30000);
    const state = await snapshot(), check = state.runs.find(item => item.projectId === a && item.kind === 'check');
    assert.ok(check); assert.equal(check.state, 'succeeded');
    const artifact = state.artifacts.find(item => item.runId === check.id); assert.ok(artifact);
    const full = await projectInvoke('project_artifact', { artifactId: artifact.id });
    assert.ok(full.markdown.length > 50); assert.ok(full.inputSummary.includes('项目 A'));
    assert.match(await text('#report-title'), /预检/);
    await screenshot('p2-real-project-check'); await click('#desktop-tools-close');
  });
  await checked('Duplicate run ID is rejected without changing artifact or rerunning CLI', async () => {
    const before = await snapshot();
    await assert.rejects(projectInvoke('project_run', { projectId: a, kind: 'guide', runId: originalArtifact.runId, subject: 'personal' }));
    const after = await snapshot(); assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.artifacts, before.artifacts);
  });
  await checked('Actual cancel and missing CLI failures retain saved artifact; restored CLI recovers', async () => {
    const root = await realpath(isolatedDirectory), cli = await realpath(resolve(root, 'runtime/src/project-tool.mjs'));
    const inside = relative(root, cli); assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside));
    const original = await readFile(cli), started = resolve(dirname(cli), 'p2-slow-started');
    await click('#desktop-tools-toggle');
    const report = await text('#report'), artifactCount = (await snapshot()).artifacts.length;
    try {
      await writeFile(cli, `// Labelled P2 isolated-copy cancellation fixture.\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('./p2-slow-started', import.meta.url), 'started');\nsetTimeout(() => console.log('UNEXPECTED LATE RESULT'), 60000);\n`);
      await click('#guide-btn'); await until(async () => (await stat(started)).isFile(), 'P2 tool actually running');
      assert.equal(await inspect('return document.querySelector("#desktop-project-select").disabled'), true);
      await click('#stop-tool'); await until(() => inspect('return !document.querySelector("#guide-btn").disabled && document.querySelector("#stop-tool").hidden'), 'P2 cancellation settled');
      assert.match(await text('#status'), /已停止/); assert.equal(await text('#report'), report);
      const canceled = await snapshot(); assert.equal(canceled.artifacts.length, artifactCount); assert.ok(canceled.runs.some(item => item.projectId === a && item.state === 'canceled'));
    } finally { await writeFile(cli, original); }
    const backup = `${cli}.p2-missing-backup`; await rename(cli, backup);
    try {
      await click('#guide-btn'); await until(() => inspect('return document.querySelector("#status").classList.contains("error") && !document.querySelector("#guide-btn").disabled'), 'P2 missing CLI error');
      assert.equal(await text('#report'), report); assert.equal((await snapshot()).artifacts.length, artifactCount);
      await screenshot('p2-error-preserves-artifact');
    } finally { await rename(backup, cli); }
    await click('#guide-btn'); await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#guide-btn").disabled'), 'P2 restored guide succeeds');
    assert.equal((await snapshot()).artifacts.length, artifactCount + 1); await click('#desktop-tools-close');
  });
  await checked('Old unassigned conversation can move into B with its draft, retaining A isolation', async () => {
    await selectProject(null); await projectDialog();
    await chooseOption('#project-association-target', b); await click('#project-associate');
    await until(async () => /归属已保存/.test(await text('#project-status')), 'association persisted');
    await closeProjects(); await selectProject(b);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '未归属旧会话草稿');
    await selectProject(a); assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '项目 A 独立草稿');
  });
  await checked('Project JSON download uses real WebView download and includes provenance without credentials or conversations', async () => {
    const downloads = resolve(run, 'project-downloads'); await mkdir(downloads);
    await command('POST', '/ms/cdp/execute', { cmd: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: downloads } });
    await projectDialog(); await click('#project-export');
    const data = await until(async () => { const file = (await readdir(downloads)).find(name => /^shipmate-project-\d+\.json$/.test(name)); return file && JSON.parse(await readFile(resolve(downloads, file), 'utf8')); }, 'complete project JSON download');
    assert.equal(data.project.id, a); assert.ok(data.runs.length); assert.ok(data.artifacts.length);
    assert.ok(data.artifacts[0].markdown); assert.ok(data.artifacts[0].rulesVersion);
    const serialized = JSON.stringify(data); assert.doesNotMatch(serialized, /fixture-native-oauth-key|apiKey|accessToken|未归属旧会话草稿|项目 A 独立草稿/);
    await closeProjects();
  });
  await checked('Missing fixture directory disables check; real IPC relocation preserves immutable previous report', async () => {
    const moved = resolve(run, '项目 A 已移动'); await rename(directoryA, moved);
    await projectDialog(); await click('#project-retry');
    await until(async () => /原目录不可用/.test(await text('#project-directory-note')), 'missing directory displayed');
    assert.equal(await inspect('return document.querySelector("#check-btn").disabled'), true);
    const current = (await snapshot()).projects.find(item => item.id === a);
    await projectInvoke('project_save', { project: { id: a, name: current.name, directory: moved, subject: current.subject, expectedRevision: current.revision } });
    await click('#project-retry'); await until(async () => (await text('#project-directory-note')).includes('仅保存目录'), 'relocated directory loaded');
    await closeProjects();
    assert.equal((await projectInvoke('project_artifact', { artifactId: originalArtifact.id })).projectRevision, originalArtifact.projectRevision);
    assert.equal(await inspect('return document.querySelector("#check-btn").disabled'), false);
  });
  await checked('Reload and process restart recover selected project, scoped draft, and immutable artifact', async () => {
    await command('POST', '/refresh', {});
    await until(() => inspect('return document.querySelector("#desktop-project-select")?.value === "p2-acceptance-a" && !document.querySelector("#desktop-project-select").disabled'), 'reload project ready');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '项目 A 独立草稿');
    await quit(); await launch();
    assert.equal((await snapshot()).activeProjectId, a);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '项目 A 独立草稿');
    assert.ok((await text('#report')).length > 50);
  });
  await checked('Project dialog narrow layout, keyboard focus containment, and scroll boundaries', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 }); await projectDialog();
    const focusSequence = [];
    for (let i = 0; i < 16; i++) {
      await press('\uE004');
      const focus = await inspect('const a=document.activeElement; return {tag:a.tagName,id:a.id,inside:document.querySelector("#desktop-projects").contains(a),body:a===document.body};');
      focusSequence.push(focus);
      // Chromium's native modal traversal can expose document.body while focus
      // cycles through browser chrome; no background application control may focus.
      assert.ok(focus.inside || focus.body, JSON.stringify(focusSequence));
    }
    const geometry = await inspect('const d=document.querySelector("#desktop-projects"),r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};');
    assert.ok(geometry.left >= -1 && geometry.right <= geometry.width + 1); assert.ok(geometry.overflow <= 1); assert.ok(geometry.pageOverflow <= 1);
    await inspect('document.querySelector("#desktop-projects .session-workspace-dialog__body").scrollTop=0;document.querySelector("#project-name").focus();');
    await screenshot('p2-projects-narrow');
    const styles = () => inspect('const d=document.querySelector("#desktop-projects"),s=getComputedStyle(d),root=getComputedStyle(document.documentElement);return {opacity:s.opacity,background:s.backgroundColor,rootTokens:Object.fromEntries(["--bg","--surface","--surface-raised","--text"].map(k=>[k,root.getPropertyValue(k)]))};');
    projectVisuals.push({ viewport: 'narrow', geometry, focusSequence, styles: await styles() });
    await press('\uE00C');
    await command('POST', '/window/rect', { width: 1200, height: 850 }); await projectDialog(); await screenshot('p2-projects-wide');
    projectVisuals.push({ viewport: 'wide', styles: await styles() });
    await writeFile(resolve(run, 'project-visuals.json'), JSON.stringify(projectVisuals, null, 2));
    await closeProjects();
  });
}

const workflowProjectA = 'p3-acceptance-a', workflowProjectB = 'p3-acceptance-b';
const legacyWorkflowArtifact = 'p3-labelled-v1-markdown';
async function prepareWorkflowFixture() {
  // This is an explicitly labelled migration fixture, not a mocked tool result.
  // Only the already-validated, fresh acceptance identifier receives a v1 DB.
  const { DatabaseSync } = await import('node:sqlite');
  const directory = resolve(run, '工作流项目 A');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'project.config.json'), JSON.stringify({ appid: 'touristappid', projectname: 'P3 acceptance fixture', miniprogramRoot: './' }));
  await writeFile(resolve(directory, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }));
  await writeFile(resolve(directory, 'app.js'), 'wx.getLocation({type:"wgs84"});\n');
  await mkdir(dirname(projectDatabase), { recursive: true });
  const db = new DatabaseSync(projectDatabase);
  try {
    db.exec("BEGIN; CREATE TABLE projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE runs(id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), state TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE artifacts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(id), project_id TEXT REFERENCES projects(id), data TEXT NOT NULL CHECK(json_valid(data))); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT); CREATE INDEX runs_project ON runs(project_id); CREATE INDEX artifacts_project ON artifacts(project_id); PRAGMA user_version=1;");
    const timestamp = Date.now() - 60000;
    const project = { id: workflowProjectA, name: '验收工作流 A', directory, subject: 'personal', revision: 1, createdAt: timestamp, updatedAt: timestamp, directoryAvailable: true };
    const common = { projectId: project.id, kind: 'check', projectRevision: 1, toolVersion: 'labelled-v1-fixture', rulesVersion: '{}', inputSummary: '{}' };
    const priorRun = { ...common, id: legacyWorkflowArtifact, state: 'succeeded', startedAt: timestamp, finishedAt: timestamp, error: null };
    const artifact = { ...common, id: legacyWorkflowArtifact, runId: legacyWorkflowArtifact, title: '明确标记的旧版 Markdown 验收记录', markdown: '# 旧版 Markdown 验收记录\n\n这是迁移测试夹具，不是真实工具执行结果。\n', createdAt: timestamp };
    db.prepare('INSERT INTO projects VALUES(?,?,?)').run(project.id, 1, JSON.stringify(project));
    db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run(priorRun.id, project.id, priorRun.state, JSON.stringify(priorRun));
    db.prepare('INSERT INTO artifacts VALUES(?,?,?,?)').run(artifact.id, artifact.runId, project.id, JSON.stringify(artifact));
    db.exec('COMMIT;');
  } finally { db.close(); }
}
async function workflowDialog() {
  await openNavigation(); await click('#desktop-workflow-open');
  await until(() => inspect('const d=document.querySelector("#desktop-workflow");return d?.open && d.getAttribute("aria-busy")!=="true";'), 'workflow dialog ready');
}
async function closeWorkflow() {
  await until(() => inspect('return document.querySelector("#desktop-workflow").getAttribute("aria-busy")!=="true"'), 'workflow operation settled before closing');
  await press('\uE00C');
  await until(() => inspect('return !document.querySelector("#desktop-workflow").open'), 'workflow dialog closed');
}
async function checkWorkflowFlows() {
  const a = workflowProjectA, b = workflowProjectB;
  const snapshot = () => projectInvoke('project_snapshot');
  const workflow = () => projectInvoke('project_workflow', { projectId: a });
  let stageId, rulesVersion, firstArtifact, secondArtifact;
  await checked('P3 v1 migration preserves labelled Markdown; unassigned workflow has a genuine empty state', async () => {
    const initial = await snapshot(); assert.equal(initial.projects.length, 1);
    const old = await projectInvoke('project_artifact', { artifactId: legacyWorkflowArtifact });
    assert.match(old.markdown, /迁移测试夹具/); assert.ok(old.data == null);
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(projectDatabase, { readOnly: true });
    try { assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2); } finally { db.close(); }
    const backupFile = (await readdir(dirname(projectDatabase))).find(name => /^projects\.pre-v2-\d+\.sqlite3$/.test(name));
    assert.ok(backupFile, 'migration keeps a consistent v1 backup');
    const backup = new DatabaseSync(resolve(dirname(projectDatabase), backupFile), { readOnly: true });
    try { assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 1); assert.ok(backup.prepare('SELECT data FROM artifacts WHERE id=?').get(legacyWorkflowArtifact)); } finally { backup.close(); }
    await workflowDialog(); assert.match(await text('#desktop-workflow'), /选择项目|先.*项目/); await closeWorkflow();
    await selectProject(a);
  });
  await checked('Actual workflow facts form preserves unknown separately from false', async () => {
    await workflowDialog(); await fill('#workflow-businessType', '社区活动信息展示');
    await chooseOption('#workflow-hasPayment', 'false'); await chooseOption('#workflow-collectsSensitive', 'unknown'); await chooseOption('#workflow-hasServerDomain', 'true');
    await click('#workflow-save-facts');
    await until(async () => (await workflow()).project.facts.businessType === '社区活动信息展示', 'facts persisted');
    const state = await workflow(); assert.equal(state.project.facts.hasPayment, false); assert.equal(state.project.facts.collectsSensitive, null); assert.equal(state.project.facts.hasServerDomain, true);
    rulesVersion = state.rulesVersion;
    stageId = String(state.catalog.stages[0].stage);
    assert.equal(state.catalog.stages.length, 8);
    await until(() => inspect('return document.querySelector("#desktop-workflow").getAttribute("aria-busy")!=="true"'), 'facts form settled');
  });
  await checked('Workflow labels source-dependent rules as conditional before any scan or confirmation', async () => {
    const before = await snapshot(), state = await workflow();
    const stage = '#workflow-stages [data-stage="privacy"]';
    if (!await inspect('return document.querySelector(arguments[0]).open', [stage])) await click(`${stage} > summary`);
    const items = await inspect('return [...document.querySelectorAll(arguments[0]+" > ul > li")].map(el=>({title:el.querySelector("strong")?.textContent,hint:el.querySelector(".desktop-field-hint")?.textContent}))', [stage]);
    const location = items.find(item => item.title === '地理位置隐私声明');
    assert.ok(location); assert.match(location.hint, /条件线索.*wx.getLocation.*判断是否适用/);
    const after = await snapshot();
    assert.deepEqual(after.runs, before.runs); assert.deepEqual(after.artifacts, before.artifacts);
    assert.deepEqual((await workflow()).confirmations, state.confirmations);
    await screenshot('p3-conditional-source-rules');
  });
  await checked('Unknown facts and incomplete prerequisites cannot be confirmed or marked not applicable', async () => {
    const before = await workflow();
    for (const [id, state] of [['privacy', 'confirmed'], ['privacy', 'not_applicable'], ['certification', 'confirmed'], ['registration', 'not_applicable']]) {
      await assert.rejects(projectInvoke('project_stage_confirm', { projectId: a, expectedRevision: before.project.revision, expectedRulesVersion: before.rulesVersion, stageId: id, state, note: '必须拒绝的条件或前置不足验收请求' }));
    }
    assert.deepEqual((await workflow()).confirmations, before.confirmations);
    assert.equal(await inspect('return document.querySelector("#workflow-confirm-privacy").disabled && document.querySelector("#workflow-not-applicable-privacy").disabled && document.querySelector("#workflow-confirm-certification").disabled && document.querySelector("#workflow-not-applicable-registration").disabled'), true);
  });
  await checked('Stage confirmation requires explicit UI action and survives process restart', async () => {
    const stage = `#workflow-stages [data-stage="${stageId}"]`;
    if (!await inspect('return document.querySelector(arguments[0]).open', [stage])) await click(`${stage} > summary`);
    await fill(`#workflow-note-${stageId}`, '验收人员已核对当前项目事实；此记录不是官方审批。');
    await click(`#workflow-confirm-${stageId}`);
    await until(async () => (await workflow()).confirmations.some(item => String(item.stageId) === stageId && item.state === 'confirmed'), 'human confirmation persisted');
    await closeWorkflow(); await quit(); await launch();
    const restored = await workflow(); assert.ok(restored.confirmations.some(item => String(item.stageId) === stageId && item.state === 'confirmed'));
    assert.equal(restored.project.facts.collectsSensitive, null);
    await workflowDialog(); assert.match(await text('#workflow-stages'), /人工.*确认|已确认/); await screenshot('p3-confirmed-workflow'); await closeWorkflow();
  });
  await checked('Stale rule evidence is rejected by real native command without appending confirmation', async () => {
    const before = await workflow();
    await assert.rejects(projectInvoke('project_stage_confirm', { projectId: a, expectedRevision: before.project.revision, expectedRulesVersion: `${rulesVersion}-stale`, stageId, state: 'confirmed', note: '必须拒绝的过期依据' }));
    assert.deepEqual((await workflow()).confirmations, before.confirmations);
  });
  await checked('Changing actual facts invalidates old confirmation while preserving its history', async () => {
    const before = await workflow(); await workflowDialog();
    await chooseOption('#workflow-hasPayment', 'true'); await click('#workflow-save-facts');
    await until(async () => (await workflow()).project.contextRevision > before.project.contextRevision, 'context revision advanced');
    const after = await workflow(); assert.ok(after.confirmations.some(item => item.contextRevision < after.project.contextRevision));
    await until(async () => /待重检|需.*重新|已失效/.test(await text('#workflow-stages')), 'stale confirmation visible');
    await screenshot('p3-stale-confirmation'); await closeWorkflow();
  });
  await checked('Workflow downloads saved facts, stale confirmation and rule materials without saving the draft', async () => {
    const before = await snapshot(), saved = await workflow();
    const record = saved.confirmations.find(item => item.stageId === stageId && item.state === 'confirmed');
    const rule = saved.catalog.rules.find(item => item.id === 'privacy.getLocation');
    assert.ok(record?.note && rule?.official_url && rule.requires.length);
    const downloads = resolve(run, 'workflow-downloads');
    await mkdir(downloads);
    await command('POST', '/ms/cdp/execute', { cmd: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: downloads } });
    await workflowDialog();
    await click('#workflow-facts-open');
    const draft = '未保存的工作流导出草稿';
    await fill('#workflow-businessType', draft);
    await click('#workflow-export');
    const markdown = await until(async () => {
      const file = (await readdir(downloads)).find(name => /^shipmate-workflow-\d+\.md$/.test(name));
      return file && readFile(resolve(downloads, file), 'utf8');
    }, 'workflow Markdown download');
    assert.ok(markdown.includes(saved.project.facts.businessType));
    assert.ok(!markdown.includes(draft));
    assert.match(markdown, /涉及支付：是/);
    assert.match(markdown, /收集敏感信息：尚未确认/);
    assert.match(markdown, /状态：待重检/);
    assert.ok(markdown.includes(record.note));
    assert.ok(markdown.includes(rule.requires[0]));
    assert.ok(markdown.includes(rule.official_url));
    const after = await snapshot(), reloaded = await workflow();
    assert.deepEqual(after.runs, before.runs);
    assert.deepEqual(after.artifacts, before.artifacts);
    assert.deepEqual(reloaded.project, saved.project);
    assert.deepEqual(reloaded.confirmations, saved.confirmations);
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), draft);
    await screenshot('p3-workflow-export');
    await closeWorkflow();
  });
  await checked('Two projects have independent facts and manual progress', async () => {
    const directory = resolve(run, '工作流项目 B'); await mkdir(directory);
    await projectInvoke('project_save', { project: { id: b, name: '验收工作流 B', directory, subject: 'enterprise' } });
    await projectDialog(); await click('#project-retry'); await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===3 && !document.querySelector("#project-retry").disabled'), 'B registered'); await closeProjects();
    await selectProject(b); await workflowDialog();
    assert.equal(await inspect('return document.querySelector("#workflow-businessType").value'), '');
    const state = await projectInvoke('project_workflow', { projectId: b }); assert.equal(state.confirmations.length, 0); assert.equal(state.project.facts.hasPayment, null);
    await closeWorkflow(); await selectProject(a);
  });
  async function realCheck() {
    if (!await inspect('return document.querySelector("#desktop-tools").open')) await click('#desktop-tools-toggle');
    const before = (await snapshot()).artifacts.map(item => item.id);
    await click('#check-btn'); await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#check-btn").disabled'), 'structured check saved', 30000);
    const latest = (await snapshot()).artifacts.find(item => item.projectId === a && item.kind === 'check' && !before.includes(item.id));
    assert.ok(latest); return projectInvoke('project_artifact', { artifactId: latest.id });
  }
  await checked('Same file set with changed content produces comparable real checks and not-detected findings', async () => {
    firstArtifact = await realCheck(); assert.equal(firstArtifact.data.scope.complete, true);
    await writeFile(resolve(run, '工作流项目 A/app.js'), 'App({});\n');
    secondArtifact = await realCheck(); assert.equal(secondArtifact.data.scope.filesHash, firstArtifact.data.scope.filesHash);
    await click('#desktop-tools-close'); await projectDialog();
    await chooseOption('#project-compare-before', firstArtifact.id); await chooseOption('#project-compare-after', secondArtifact.id); await click('#project-compare');
    await until(async () => /未再检出|仍存在|新增/.test(await text('#project-comparison')), 'comparison rendered');
    const compared = await projectInvoke('project_compare', { projectId: a, beforeArtifactId: firstArtifact.id, afterArtifactId: secondArtifact.id });
    assert.equal(compared.comparable, true); assert.ok(compared.notDetected.length > 0);
    assert.match(await text('#project-comparison'), /不代表问题已修复或官方审核通过/);
    assert.doesNotMatch(await inspect('return Array.from(document.querySelectorAll("#project-comparison h3,#project-comparison h4")).map(n=>n.textContent).join(" ")'), /已修复/);
    await screenshot('p3-comparable-checks'); await closeProjects();
  });
  await checked('Changed file inventory and legacy Markdown are explicitly not comparable', async () => {
    await writeFile(resolve(run, '工作流项目 A/extra.js'), 'export const acceptanceFixture = true;\n');
    const third = await realCheck(); await click('#desktop-tools-close');
    const changed = await projectInvoke('project_compare', { projectId: a, beforeArtifactId: secondArtifact.id, afterArtifactId: third.id }); assert.equal(changed.comparable, false); assert.ok(changed.reason);
    const legacy = await projectInvoke('project_compare', { projectId: a, beforeArtifactId: legacyWorkflowArtifact, afterArtifactId: third.id }); assert.equal(legacy.comparable, false); assert.ok(legacy.reason);
    assert.match((await projectInvoke('project_artifact', { artifactId: legacyWorkflowArtifact })).markdown, /迁移测试夹具/);
  });
  await checked('Actual rejection lookup is saved as a structured project artifact', async () => {
    const before = (await snapshot()).artifacts.map(item => item.id);
    await openExplainFromMenu(); await editExplainQuery(); await fill('#rjInput', '隐私声明'); await click('#rjBtn');
    await until(async () => (await snapshot()).artifacts.some(item => item.projectId === a && item.kind === 'explain' && !before.includes(item.id)), 'explain artifact saved', 30000);
    const artifact = (await snapshot()).artifacts.find(item => item.projectId === a && item.kind === 'explain');
    const full = await projectInvoke('project_artifact', { artifactId: artifact.id }); assert.equal(full.data.kind, 'explain'); assert.ok(full.markdown.length > 30);
    await screenshot('p3-explain-artifact'); await click('#desktop-explain-close');
  });
  await checked('Malformed isolated tool output fails without replacing stored artifacts', async () => {
    const root = await realpath(isolatedDirectory), script = await realpath(resolve(root, 'runtime/src/project-tool.mjs'));
    const inside = relative(root, script); assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside));
    const original = await readFile(script), before = await snapshot();
    try {
      await writeFile(script, '// Labelled isolated P3 malformed-output fixture.\nconsole.log("not a domain artifact");\n');
      await click('#desktop-tools-toggle'); const previous = await text('#report'); await click('#check-btn');
      await until(() => inspect('return document.querySelector("#status").classList.contains("error") && !document.querySelector("#check-btn").disabled'), 'malformed output rejected');
      assert.deepEqual((await snapshot()).artifacts, before.artifacts); assert.equal(await text('#report'), previous);
      await screenshot('p3-error-preserves-report'); await click('#desktop-tools-close');
    } finally { await writeFile(script, original); }
  });
  await checked('Workflow narrow dialog contains keyboard navigation without horizontal overflow', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 }); await workflowDialog();
    for (let i = 0; i < 16; i++) {
      await press('\uE004'); assert.equal(await inspect('return document.activeElement===document.body || document.querySelector("#desktop-workflow").contains(document.activeElement)'), true);
    }
    const geometry = await inspect('const d=document.querySelector("#desktop-workflow"),r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:d.scrollWidth-d.clientWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth};');
    assert.ok(geometry.left >= -1 && geometry.right <= geometry.width + 1 && geometry.overflow <= 1 && geometry.pageOverflow <= 1);
    await screenshot('p3-workflow-narrow'); await closeWorkflow();
    await command('POST', '/window/rect', { width: 1200, height: 850 }); await workflowDialog(); await screenshot('p3-workflow-wide'); await closeWorkflow();
  });
}

async function checkAgentFlows() {
  const projectId = 'p5-native-project', directory = resolve(run, 'P5 本地工具项目');
  const snapshot = () => projectInvoke('project_snapshot');
  const toolsCount = () => inspect('return document.querySelectorAll("[data-component^=project-tool-]").length');
  async function assertToolLayout() {
    const rows = await inspect(`return [...document.querySelectorAll('[data-component^="project-tool-"] > summary')].map(header => {
      const icon = header.querySelector('svg').getBoundingClientRect(), title = header.querySelector('.tool-details__title').getBoundingClientRect(), status = header.querySelector('.component-status').getBoundingClientRect();
      return { display: getComputedStyle(header).display, marker: getComputedStyle(header).listStyleType,
        iconCenter: icon.top + icon.height / 2, titleCenter: title.top + title.height / 2, statusCenter: status.top + status.height / 2,
        gap: title.left - icon.right, overflow: header.scrollWidth - header.clientWidth };
    });`);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(row.display, 'flex', 'Tool records must reuse the shared compact row layout');
      assert.equal(row.marker, 'none'); assert.ok(row.gap >= 6);
      assert.ok(Math.abs(row.iconCenter - row.titleCenter) <= 2 && Math.abs(row.titleCenter - row.statusCenter) <= 2);
      assert.ok(row.overflow <= 1);
    }
  }
  async function permissions(read, share = false) {
    await click('#desktop-agent-tools');
    for (const [selector, value] of [['#desktop-agent-read', read], ['#desktop-agent-share', share]]) {
      if (await inspect('return document.querySelector(arguments[0]).checked', [selector]) !== value) await click(selector);
    }
    await click('#desktop-agent-done');
  }
  async function connect() {
    await openModelSettings();
    await until(() => inspect('return !document.querySelector("[data-provider-id=openai]").disabled'), 'P5 connection service ready');
    await click('[data-provider-id="openai"]');
    await until(() => inspect('return !document.querySelector("#desktop-provider-key").disabled && document.querySelector("#desktop-connection-editor").open'), 'P5 key editor ready');
    await fill('#desktop-provider-key','p5-native-fake-key'); await click('#desktop-provider-connect');
    await until(() => find('#desktop-preferences .desktop-model-panel [data-model-id="gpt-4.1-mini"]'),'P5 fixture model');
    await click('#desktop-preferences .desktop-model-panel [data-model-id="gpt-4.1-mini"]');
  }
  async function runScenario(prompt, steps) {
    const before = requests.length; agentFixture.next(steps); await send(prompt);
    await until(() => requests.length > before,'P5 actual SDK request'); await finished();
    return requests.slice(before);
  }
  await checked('Agent permissions default off for a saved project and explicit OpenAI connection', async () => {
    await mkdir(directory); await writeFile(resolve(directory,'project.config.json'), JSON.stringify({appid:'touristappid',projectname:'P5 fixture',compileType:'miniprogram',miniprogramRoot:'./'}));
    await writeFile(resolve(directory,'app.json'),JSON.stringify({pages:[]}));
    await projectInvoke('project_save',{project:{id:projectId,name:'P5工具验收',directory,subject:'personal'}});
    await projectDialog(); await click('#project-retry'); await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===2 && !document.querySelector("#project-retry").disabled'),'P5 project ready'); await closeProjects(); await selectProject(projectId); await connect(); await closeSettings();
    await click('#desktop-agent-tools');
    assert.equal(await inspect('return document.querySelector("#desktop-agent-read").checked'),false);
    assert.equal(await inspect('return document.querySelector("#desktop-agent-share").checked'),false);
    assert.equal(await inspect('return document.querySelector("#desktop-agent-share").disabled'),true);
    await screenshot('p5-permissions-default'); await click('#desktop-agent-done');
  });
  await checked('No-share actual project check saves local report without exposing result to the second model request', async () => {
    await permissions(true);
    const calls = await runScenario('P5检查当前项目不分享', [{kind:'check'},{text:'P5_LOCAL_CHECK_SAVED'}]);
    assert.equal(calls.length,2);
    const outputs = calls[1].input.filter(item => item.type==='function_call_output');
    assert.equal(outputs.length,1); assert.match(outputs[0].output,/未授权读取内容/); assert.doesNotMatch(outputs[0].output,/artifactId|summary|ruleId/);
    const state = await snapshot(); assert.equal(state.artifacts.length,1); assert.equal(state.artifacts[0].kind,'check');
    assert.equal(await toolsCount(),1); assert.equal(await inspect('return document.querySelector("[data-component^=project-tool-]").dataset.toolState'),'success');
    await click('[data-component^="project-tool-"] > summary'); await click('[data-action="open-artifact"]');
    await until(() => inspect('return document.querySelector("#desktop-tools").open'),'local artifact opens');
    assert.ok((await text('#report')).length>50); await screenshot('p5-local-artifact'); await click('#desktop-tools-close');
    assert.ok(await inspect('const n=document.querySelector("#desktopConversationStatus");return n.dataset.state==="complete" && n.dataset.announcement==="action" && getComputedStyle(n).clipPath==="none" && n.getBoundingClientRect().height>10'), 'artifact feedback stays visible after a completed run');
    await screenshot('trust-local-action-feedback');
  });
  await checked('Shared guide and explain execute sequentially with two distinct records and bounded model projections', async () => {
    await permissions(true,true);
    const calls = await runScenario('P5生成清单并解释诱导分享', [{kind:'guide'},{kind:'explain'},{text:'P5_TWO_TOOLS_COMPLETE'}]);
    assert.equal(calls.length,3);
    const outputs = calls[2].input.filter(item => item.type==='function_call_output').map(item=>JSON.parse(item.output));
    assert.equal(outputs.length,2);
    for(const output of outputs){assert.equal(output.schemaVersion,1);assert.ok(output.items.length<=20);assert.ok(output.artifactId);assert.ok(!JSON.stringify(output).includes(directory));assert.equal(Object.hasOwn(output,'markdown'),false);}
    assert.deepEqual(outputs.map(item=>item.kind),['guide','explain']);
    assert.equal((await snapshot()).artifacts.length,3); assert.equal(await toolsCount(),3);
    await assertToolLayout();
    await screenshot('p5-multiple-tool-results');
  });
  await checked('Agent streaming stop aborts the upstream and preserves completed tool records', async () => {
    const before = await toolsCount(); agentFixture.next([{hold:true,text:'P5_STREAMING '}]);
    await send('P5停止流式'); await until(() => requests.at(-1)?.input?.some(item=>JSON.stringify(item).includes('P5停止流式')),'P5 stream started');
    await click('#desktopSend'); await until(() => requests.at(-1).aborted,'P5 response transport aborted'); await finished(); assert.equal(await toolsCount(),before);
  });
  await checked('Agent tool cancellation stops the real isolated child and retains prior artifacts', async () => {
    const root=await realpath(isolatedDirectory), cli=await realpath(resolve(root,'runtime/src/project-tool.mjs'));
    assert.ok(!relative(root,cli).startsWith('..'));
    const original=await readFile(cli), marker=resolve(dirname(cli),'p5-tool-started'), before=(await snapshot()).artifacts.length;
    try {
      await writeFile(cli,"import { writeFileSync } from 'node:fs'; writeFileSync(new URL('./p5-tool-started',import.meta.url),'started'); setTimeout(()=>console.log('UNEXPECTED LATE RESULT'),60000);\n");
      agentFixture.next([{kind:'check'}]); await send('P5取消本地工具'); await until(async()=> (await stat(marker)).isFile(),'P5 child actually spawned');
      await click('#desktopSend'); await finished();
      await until(async()=> (await snapshot()).runs.some(item=>item.state==='canceled'),'P5 native run canceled');
      assert.equal((await snapshot()).artifacts.length,before);
      assert.ok(await inspect('return Boolean(document.querySelector("[data-component^=project-tool-][data-tool-state=canceled]"))'));
    } finally { await writeFile(cli,original); }
  });
  await checked('Agent provider error is recoverable by explicit retry without repeating prior tools', async () => {
    const before=(await snapshot()).artifacts.length;
    await runScenario('P5错误恢复',[{error:true}]);
    assert.ok(await inspect('return Boolean(document.querySelector("[data-component=message][data-state=error]"))'));
    agentFixture.next([{text:'P5_RECOVERED'}]); await click('[data-component="message"][data-state="error"] [data-action="retry"]');
    await until(async()=> (await text('#desktopMessages')).includes('P5_RECOVERED'),'explicit retry recovered'); await finished(); assert.equal((await snapshot()).artifacts.length,before);
  });
  await checked('Switching project scope revokes Agent permissions and preserves the original conversation', async () => {
    const before=await toolsCount(); await selectProject(null);
    assert.notEqual(await inspect('return document.querySelector("#desktop-agent-tools").dataset.enabled'),'true');
    await selectProject(projectId); assert.equal(await toolsCount(),before);
    await click('#desktop-agent-tools');
    assert.equal(await inspect('return document.querySelector("#desktop-agent-read").checked || document.querySelector("#desktop-agent-share").checked'),false);
    await click('#desktop-agent-done'); await permissions(true,true);
  });
  await checked('Restart retains Agent tool parts and artifacts but revokes both permissions without automatic inference', async () => {
    const before=await toolsCount(), count=requests.length; await quit(); await launch();
    assert.equal(await toolsCount(),before); assert.equal((await snapshot()).artifacts.length,3); assert.equal(requests.length,count);
    await connect(); await closeSettings(); await click('#desktop-agent-tools');
    assert.equal(await inspect('return document.querySelector("#desktop-agent-read").checked || document.querySelector("#desktop-agent-share").checked'),false);
    await screenshot('p5-restart-permissions'); await click('#desktop-agent-done');
  });
  await checked('Agent permission dialog and tool results fit narrow viewport with keyboard focus containment', async () => {
    await command('POST','/window/rect',{width:390,height:844}); await click('#desktop-agent-tools');
    for(let i=0;i<8;i++){await press('\uE004');assert.equal(await inspect('return document.querySelector("#desktop-agent-dialog").contains(document.activeElement)'),true);}
    assert.equal(await inspect('const d=document.querySelector("#desktop-agent-dialog"); return d.scrollWidth<=d.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth;'),true);
    await screenshot('p5-permissions-narrow'); await click('#desktop-agent-dismiss');
    await until(()=>inspect('return document.activeElement.id==="desktop-agent-tools"'),'P5 dialog returns focus'); await screenshot('p5-results-narrow');
    await assertToolLayout();
    const firstTool = '[data-component^="project-tool-"][data-tool-state="success"]';
    if (!(await inspect('return document.querySelector(arguments[0]).open', [firstTool]))) await click(`${firstTool} > summary`);
    await inspect('document.querySelector(arguments[0]).scrollIntoView({ block: "start" });', [firstTool]);
    assert.equal(await inspect(`const card=document.querySelector(arguments[0]), body=card.querySelector('.tool-details__body'); return card.open && parseFloat(getComputedStyle(body).paddingLeft)>=12 && body.scrollWidth<=body.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth;`, [firstTool]), true);
    await screenshot('p5-tool-expanded-narrow');
  });
  await checkResultTrust({ run, checked, click, fill, find, inspect, text, command, until, screenshot, projectInvoke, selectProject, openDataSettings, quit, launch, requests, projectId });
}

async function checkConnectionsFlows() {
  const dummyKey = 'fixture-native-oauth-key';
  async function checkModelCards(state) {
    for (const width of [320, 1000, 1440]) {
      await command('POST', '/window/rect', { width, height: 1000 });
      assert.equal(await inspect("return document.querySelector('.desktop-connection-state').checkVisibility()"), state !== 'oauth', state+': pending authorization does not leave an empty connection card');
      const expected = state === 'oauth' ? ['desktop-oauth-code', 'desktop-provider-oauth-complete', 'desktop-provider-oauth-cancel'] : ['desktop-provider-refresh', 'desktop-provider-disconnect', 'desktop-provider-verify', 'desktop-model-search'];
      assert.deepEqual(await inspect('return arguments[0].filter(id=>document.getElementById(id)?.checkVisibility())', [expected]), expected, state+': required controls are visible');
      const result = await inspect(`const root=document.querySelector('.desktop-model-panel'),rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
        const cards=[...root.querySelectorAll('.preferences-group')].filter(n=>n.checkVisibility());
        const rows=[...root.querySelectorAll('.settings-row')].filter(n=>n.checkVisibility()).map(row=>({copy:rect(row.firstElementChild),actions:[...row.lastElementChild.children].filter(n=>n.checkVisibility()).map(rect)}));
        return {overflow:document.querySelector('#preferences-body').scrollWidth-document.querySelector('#preferences-body').clientWidth,
          cards:cards.map(n=>({box:rect(n),controls:[...n.querySelectorAll('input,select,wa-button,button')].filter(c=>c.checkVisibility()).map(rect)})),rows};`);
      assert.ok(result.overflow<=1, state+': model settings fit '+width+'px');
      for (const card of result.cards) for (const control of card.controls) assert.ok(control.left>=card.box.left-1&&control.right<=card.box.right+1, state+': controls fit their card at '+width+'px');
      for (const row of result.rows) for (const action of row.actions) assert.ok(width===320?action.top>=row.copy.bottom+10:action.left>=row.copy.right+12, state+': status and actions follow the responsive layout at '+width+'px');
      await inspect('document.querySelector(arguments[0]).scrollIntoView({block:"center",behavior:"instant"})', [state==='oauth'?'#desktop-oauth-code-form':'.desktop-connection-state']);
      await screenshot('p4-'+state+'-cards-'+width);
    }
    await command('POST', '/window/rect', { width: 1000, height: 900 });
  }
  async function openProvider() {
    await openModelSettings();
    await until(() => inspect('return !document.querySelector("[data-provider-id=openrouter]").disabled'), 'provider ready');
    if (!(await inspect('return document.querySelector("[data-provider-id=openrouter]").getAttribute("aria-pressed") === "true"'))) await click('[data-provider-id="openrouter"]');
  }
  async function editConnection() {
    if (await inspect('const editor=document.querySelector("#desktop-connection-editor"); return editor && !editor.open;')) await click('#desktop-connection-editor-toggle');
  }
  await checked('Explicit system storage saves only the isolated fake OpenRouter credential', async () => {
    await openProvider(); await chooseOption('#desktop-provider-storage', 'system');
    await fill('#desktop-provider-key', dummyKey); await click('#desktop-provider-connect');
    await until(() => find('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]'), 'fixture catalog connected');
    await screenshot('p4-system-connected'); await checkModelCards('connected'); await click('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]');
  });
  await checked('Restart restores disconnected saved credential and explicit reconnect does not infer', async () => {
    const before = requests.length; await quit(); await launch(); await openProvider();
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
    assert.equal(requests.length, before);
    await click('#desktop-provider-refresh'); await until(() => find('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]'), 'stored credential reconnects');
    assert.equal(requests.length, before); await screenshot('p4-restored-connection');
  });
  await checked('Inference verification is explicit and separate from model discovery', async () => {
    const before = requests.length; await click('#desktop-provider-verify');
    await until(() => requests.length > before && requests.at(-1).completed, 'explicit fixture inference');
    await until(async () => /通过|成功|可用/.test(await text('#desktop-inference-status')), 'inference verified UI');
    await click('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]');
    await closeSettings();
    await send('P4真实原生桥协议夹具聊天'); await finished();
    assert.ok(requests.at(-1).messages.some(message => message.content.includes('P4真实原生桥协议夹具聊天')));
  });
  await checked('Stopped connection stream aborts the fixture request', async () => {
    holdNext = true; await send('P4停止生成验收'); await until(() => requests.at(-1)?.messages.some(message => message.content.includes('P4停止生成验收')), 'stream running');
    await click('#desktopSend'); await until(() => requests.at(-1).aborted, 'upstream aborted'); await finished();
  });
  await checked('Deleting saved credential prevents restoration after process restart', async () => {
    await openProvider(); await click('#desktop-provider-disconnect');
    await until(() => inspect('return document.querySelectorAll("#desktop-preferences .desktop-model-panel [data-model-id=\\"fixture/oauth-model\\"]").length===0'), 'delete operation settles');
    await quit(); await launch(); await openProvider();
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
    assert.match(await text('#desktop-provider-status'), /未连接|断开|连接/);
    await screenshot('p4-deleted-connection');
  });
  await checked('Temporary replacement removes the previous saved account instead of resurrecting it', async () => {
    await chooseOption('#desktop-provider-storage', 'system'); await fill('#desktop-provider-key', dummyKey); await click('#desktop-provider-connect');
    await until(() => find('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]'), 'system account connected');
    await editConnection(); await screenshot('p4-edit-connection'); await chooseOption('#desktop-provider-storage', 'memory'); await fill('#desktop-provider-key', dummyKey); await click('#desktop-provider-connect');
    await until(async () => /本次|临时|内存/.test(await text('#desktop-storage-hint')), 'temporary replacement applied');
    const count = requests.length; await quit(); await launch(); await openProvider();
    assert.equal(requests.length, count); assert.equal(await inspect('return document.querySelectorAll("#desktop-preferences .desktop-model-panel [data-model-id=\\"fixture/oauth-model\\"]").length'), 0);
    assert.equal(await inspect('return document.querySelector("#desktop-provider-refresh").hidden'), true);
  });
  await checked('System OAuth fixture survives restart without repeating exchange or inference', async () => {
    await chooseOption('#desktop-provider-storage', 'system'); await click('#desktop-provider-oauth-manual');
    await until(() => inspect('return !document.querySelector("#desktop-oauth-code-form").hidden'), 'manual OAuth ready');
    await checkModelCards('oauth');
    await fill('#desktop-oauth-code', 'fixture-native-oauth-success'); await click('#desktop-provider-oauth-complete');
    await until(() => find('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]'), 'OAuth catalog');
    const exchanges = oauthExchanges, count = requests.length;
    await quit(); await launch(); await openProvider(); assert.equal(oauthExchanges, exchanges); assert.equal(requests.length, count);
    await click('#desktop-provider-refresh'); await until(() => find('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]'), 'saved OAuth reconnect');
    assert.equal(oauthExchanges, exchanges); assert.equal(requests.length, count);
    const storage = await inspect('return JSON.stringify({local:{...localStorage},session:{...sessionStorage},html:document.documentElement.outerHTML})');
    assert.ok(!storage.includes(dummyKey));
    await click('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]');
    await closeSettings();
  });
  await checked('Explicit report context previews actual content and removal excludes it from subsequent requests', async () => {
    const directory = resolve(run, 'P4 上下文项目'); await mkdir(directory);
    await writeFile(resolve(directory, 'readme.txt'), 'P4_CONTEXT_FILE_MARKER'); await writeFile(resolve(directory, '.env'), 'DUMMY_SECRET=fixture');
    await writeFile(resolve(directory, 'large.txt'), 'x'.repeat(17000));
    await projectInvoke('project_save', {project:{id:'p4-context',name:'P4上下文验收',directory,subject:'personal'}});
    await projectDialog(); await click('#project-retry'); await until(() => inspect('return document.querySelector("#desktop-project-select").options.length===2 && !document.querySelector("#project-retry").disabled'), 'context project loaded'); await closeProjects(); await selectProject('p4-context');
    const safe = await projectInvoke('project_context_file',{projectId:'p4-context',path:'readme.txt'}); assert.equal(safe.text,'P4_CONTEXT_FILE_MARKER');
    for(const path of ['.env','large.txt','../outside.txt']) await assert.rejects(projectInvoke('project_context_file',{projectId:'p4-context',path}));
    await openExplainFromMenu(); await editExplainQuery(); await fill('#rjInput', '隐私声明'); await click('#rjBtn');
    const saved = await until(async () => (await projectInvoke('project_snapshot')).artifacts.find(item => item.projectId === 'p4-context' && item.kind === 'explain'), 'context lookup artifact saved');
    const artifact = await projectInvoke('project_artifact', { artifactId: saved.id });
    const contextSnapshot = await projectInvoke('project_context_report', { projectId:'p4-context', artifactId:saved.id });
    assert.equal(contextSnapshot.createdAt, artifact.createdAt);
    assert.equal(contextSnapshot.contextRevision, artifact.contextRevision);
    assert.equal(contextSnapshot.title, artifact.title);
    await click('#desktop-explain-close');
    await openProvider(); await click('#desktop-preferences .desktop-model-panel [data-model-id="fixture/oauth-model"]');
    await closeSettings();
    await click('.agent-composer__add'); await until(() => inspect('return document.querySelector("#desktop-context-dialog").open'), 'context dialog');
    await chooseOption('#desktop-context-report',artifact.id); await click('#desktop-context-add-report');
    await until(() => inspect('return document.querySelectorAll("#desktop-context-items details").length===1'), 'report attached');
    await click('#desktop-context-items details summary'); assert.equal(await text('#desktop-context-items pre'),artifact.markdown);
    assert.ok(!(await text('#desktop-context-items summary')).includes(String(artifact.createdAt)), 'context metadata must not expose raw epoch timestamp');
    await screenshot('p4-context-preview');
    await command('POST','/window/rect',{width:390,height:844});
    assert.equal(await inspect('const d=document.querySelector("#desktop-context-dialog"); return document.documentElement.scrollWidth<=innerWidth && d.scrollWidth<=d.clientWidth+1;'),true);
    assert.equal(await inspect('const b=document.querySelector("#desktop-context-dismiss"), r=b.getBoundingClientRect(); return r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth;'),true);
    await screenshot('p4-context-narrow');
    await click('#desktop-context-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-context-dialog").open && document.activeElement.matches(".agent-composer__add")'), 'context dismiss restores composer attachment focus');
    await click('.agent-composer__add');
    await command('POST','/window/rect',{width:1200,height:850}); await click('#desktop-context-close');
    await send('P4有明确报告上下文'); await finished();
    assert.ok(requests.at(-1).messages.some(message => typeof message.content === 'string' && message.content.includes(artifact.markdown.slice(0,60))));
    await click('.agent-composer__add'); await click('#desktop-context-items details summary'); await click(`[data-context-remove="report:${artifact.id}"]`); await click('#desktop-context-close');
    await send('P4已移除报告上下文'); await finished(); assert.ok(!requests.at(-1).messages.some(message => typeof message.content === 'string' && message.content.includes(artifact.markdown.slice(0,60))));
    await selectProject(null); await click('.agent-composer__add'); assert.equal(await inspect('return document.querySelectorAll("#desktop-context-items details").length'),0); await click('#desktop-context-close');
  });
  await checked('Connection settings fit a narrow native window and retain modal keyboard focus', async () => {
    await command('POST','/window/rect',{width:390,height:844}); await openProvider();
    for(let i=0;i<12;i++){await press('\uE004');assert.equal(await inspect('return document.activeElement===document.body || document.querySelector("#desktop-preferences").contains(document.activeElement)'),true);}
    assert.equal(await inspect('return document.documentElement.scrollWidth<=innerWidth && document.querySelector("#desktop-preferences").scrollWidth<=document.querySelector("#desktop-preferences").clientWidth+1'),true);
    await screenshot('p4-connections-narrow'); await click('#desktop-provider-disconnect');
    await until(() => inspect('return document.querySelectorAll("#desktop-preferences .desktop-model-panel [data-model-id=\\"fixture/oauth-model\\"]").length===0'), 'final fake credential deleted');
  });
  await checked('Custom endpoint enforces local HTTP opt-in and uses actual pinned loopback transport', async () => {
    const customRequests = [];
    customFixture = createServer(async (req,res) => {
      assert.equal(req.headers.authorization,'Bearer p4-custom-fake-key');
      if(req.url==='/v1/models'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data:[{id:'p4-custom-model'}]}));return;}
      if(req.url==='/v1/chat/completions'){
        let raw='';for await(const chunk of req)raw+=chunk;
        const data=JSON.parse(raw);customRequests.push({model:data.model,messages:data.messages});
        res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(`data: ${JSON.stringify({choices:[{delta:{content:'P4_CUSTOM_REAL_TRANSPORT'},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);return;
      }
      res.writeHead(404);res.end();
    });
    await new Promise(resolve=>customFixture.listen(0,'127.0.0.1',resolve));
    await command('POST','/window/rect',{width:1200,height:850});
    await click('[data-provider-id="custom"]'); await fill('#desktop-provider-key','p4-custom-fake-key');
    await fill('#desktop-provider-endpoint','https://127.0.0.1/v1'); await click('#desktop-provider-connect');
    await until(async()=>/私网|本机|HTTPS|地址|拒绝|不允许|连接失败/.test(await text('#desktop-provider-status')),'private HTTPS rejected');
    const endpoint=`http://127.0.0.1:${customFixture.address().port}/v1`;
    await fill('#desktop-provider-endpoint',endpoint); await fill('#desktop-provider-key','p4-custom-fake-key');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-local-http").checked'),false);
    await click('#desktop-provider-connect'); await until(async()=>/HTTP|允许|本机|地址|连接失败/.test(await text('#desktop-provider-status')),'HTTP without opt-in rejected');
    assert.equal(customRequests.length,0);
    await click('#desktop-provider-local-http');await fill('#desktop-provider-key','p4-custom-fake-key');await click('#desktop-provider-connect');
    await until(()=>find('#desktop-preferences .desktop-model-panel [data-model-id="p4-custom-model"]'),'explicit local custom model');await click('#desktop-preferences .desktop-model-panel [data-model-id="p4-custom-model"]');
    await closeSettings();
    await send('P4自定义本机服务验收');await until(()=>customRequests.length===1,'actual custom inference');await finished();
    assert.ok((await text('#desktopMessages')).includes('P4_CUSTOM_REAL_TRANSPORT'));
    await screenshot('p4-custom-real-transport');
    await openModelSettings();await click('[data-provider-id="custom"]');await click('#desktop-provider-disconnect');
    await writeFile(resolve(run,'custom-requests.json'),JSON.stringify(customRequests,null,2));
  });
}

try {
  if (builtinProvidersMode || allBatchesMode || repairMode || providerAgentMode || restoreMode || projectsMode || workflowMode || connectionsMode || agentMode || handoffMode || healthMode || memoryMode || maintenanceMode || sourcesMode || notificationsMode || readingMode || presentationMode) {
    if ([builtinProvidersMode, allBatchesMode, repairMode, providerAgentMode, restoreMode, projectsMode, workflowMode, connectionsMode, agentMode, handoffMode, healthMode, memoryMode, maintenanceMode, sourcesMode, notificationsMode, readingMode, presentationMode].filter(Boolean).length !== 1) throw new Error('Choose exactly one persistence acceptance mode');
    const pattern = builtinProvidersMode ? /^com\.weappshipmate\.acceptance\.providers\.\d+$/ : (allBatchesMode || repairMode || providerAgentMode || restoreMode) ? /^com\.weappshipmate\.acceptance\.all\.\d+$/ : presentationMode ? /^com\.weappshipmate\.acceptance\.presentation\.\d+$/ : readingMode ? /^com\.weappshipmate\.acceptance\.reading\.\d+$/ : notificationsMode ? /^com\.weappshipmate\.acceptance\.p7notifications\.\d+$/ : sourcesMode ? /^com\.weappshipmate\.acceptance\.p7sources\.\d+$/ : maintenanceMode ? /^com\.weappshipmate\.acceptance\.p7maintenance\.\d+$/ : memoryMode ? /^com\.weappshipmate\.acceptance\.p7memory\.\d+$/ : healthMode ? /^com\.weappshipmate\.acceptance\.p7\.\d+$/ : handoffMode ? /^com\.weappshipmate\.acceptance\.p6\.\d+$/ : agentMode ? /^com\.weappshipmate\.acceptance\.p5\.\d+$/ : connectionsMode ? /^com\.weappshipmate\.acceptance\.p4\.\d+$/ : workflowMode ? /^com\.weappshipmate\.acceptance\.p3\.\d+$/ : /^com\.weappshipmate\.acceptance\.p2\.\d+$/;
    if (!isolated || releaseSmoke || realModel || !pattern.test(expectedIdentifier ?? '')) throw new Error('Persistence acceptance requires --isolated-runtime and the matching dedicated providers/all/p2-p7/p7memory/p7maintenance/p7sources/p7notifications/reading/presentation --expected-identifier; incompatible with release/model modes');
    const bytes = await readFile(application);
    assert.ok(bytes.includes(Buffer.from(expectedIdentifier)), 'expected dedicated identifier must be embedded in the executable before launch');
    projectDatabase = resolve(process.env.APPDATA, expectedIdentifier, 'projects.sqlite3');
    await assert.rejects(stat(projectDatabase), { code: 'ENOENT' }, 'use a new acceptance identifier for each run');
  }
  if (releaseSmoke && (!suppliedApplication || !isAbsolute(suppliedApplication) || isolated || realModel)) throw new Error('--release-smoke requires --application=<absolute installed exe> and cannot combine with isolated/runtime model modes');
  if (suppliedApplication && !isAbsolute(suppliedApplication)) throw new Error('--application must be absolute');
  if (process.platform !== 'win32') throw new Error('This test requires Windows and real WebView2.');
  await mkdir(run, { recursive: true });
  if (workflowMode) await prepareWorkflowFixture();
  if (isolated) {
    isolatedDirectory = await mkdtemp(resolve(tmpdir(), '上线船友 P1 '));
    await cp(application, resolve(isolatedDirectory, 'desktop.exe'));
    await cp(resolve(repo, 'desktop/src-tauri/runtime'), resolve(isolatedDirectory, 'runtime'), { recursive: true });
    application = resolve(isolatedDirectory, 'desktop.exe');
  }
  if (sourcesMode) sourceFixture = await prepareSourceFreshnessFixture({ run, isolatedDirectory });
  const binary = await stat(application);
  if (Date.now() - binary.mtimeMs > 3600000) throw new Error('Build current desktop first: binary is older than one hour.');
  binarySha256 = createHash('sha256').update(await readFile(application)).digest('hex');
  const tools = JSON.parse((await readFile(resolve(artifacts, 'tools/drivers.json'), 'utf8')).replace(/^\uFEFF/, ''));
  // Isolate the deterministic upstream. An inherited test-only Node preload below
  // redirects ONLY the fixed built-in provider origins; production code has no test switch.
  const preload = resolve(run, 'fixture-preload.mjs');
  if (!releaseSmoke) {
  fixture = createServer(async (req, res) => {
    if (providerAgentFixtureHandler && await providerAgentFixtureHandler(req, res)) return;
    if (agentMode && await agentFixture.handle(req, res)) return;
    if (req.method === 'POST' && req.url === '/api/v1/auth/keys') {
      let body = ''; for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      assert.equal(data.code_challenge_method, 'S256');
      assert.match(data.code_verifier, /^[A-Za-z0-9_-]{43}$/u);
      oauthExchanges++;
      const success = data.code === 'fixture-native-oauth-success';
      res.writeHead(success ? 200 : 403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(success ? { key: 'fixture-native-oauth-key' } : { error: 'Synthetic invalid code' })); return;
    }
    if (req.method === 'GET' && ['/api/v1/key', '/api/v1/models'].includes(req.url)) {
      assert.equal(req.headers.authorization, 'Bearer fixture-native-oauth-key');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: req.url.endsWith('/models') ? [{ id: 'fixture/oauth-model', name: 'OAuth acceptance fixture' }] : { label: 'Test only' } })); return;
    }
    if (connectionsMode && req.method === 'POST' && req.url === '/api/v1/chat/completions') {
      assert.equal(req.headers.authorization, 'Bearer fixture-native-oauth-key');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw), entry = { model: data.model, messages: data.messages, completed: false, aborted: false };
      requests.push(entry);
      const hold = holdNext; holdNext = false;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.on('close', () => { if (!entry.completed) entry.aborted = true; });
      for (let i = 0; i < (hold ? 120 : 3); i++) {
        if (res.destroyed) return;
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `P4 fixture ${i} ` }, finish_reason: null }] })}\n\n`);
        await delay(hold ? 100 : 20);
      }
      res.write('data: ' + JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]}) + '\n\n'); res.write('data: [DONE]\n\n'); entry.completed = true; res.end(); return;
    }
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: emptyCatalog ? [] : [{ name: model }] })); return;
    }
    if (req.method !== 'POST' || req.url !== '/api/chat') { res.writeHead(404); res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body), entry = { model: data.model, messages: data.messages, aborted: false, completed: false };
    requests.push(entry);
    if (failNext) { failNext = false; entry.failed = true; res.writeHead(503); res.end('fixture service unavailable'); return; }
    const hold = holdNext; holdNext = false;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.on('close', () => { if (!entry.completed) entry.aborted = true; });
    const codeExample = data.messages.at(-1)?.content === '原生代码展示验收';
    const parts = hold ? Array.from({ length: 120 }, (_, i) => `停止测试片段${i} `)
      : codeExample ? ['代码展示测试（本地协议模拟）：\n\n```js\nconst result =', ' { ok: true };\nconsole.log(result);\n```', '\n\n代码块支持独立复制。']
        : ['原生流式第一段。', ' 第二段已通过真实桌面传输。', ' FIXTURE_COMPLETE'];
    for (const content of parts) {
      if (res.destroyed) return;
      res.write(`${JSON.stringify({ message: { role: 'assistant', content }, done: false })}\n`);
      await delay(450);
    }
    if (!res.destroyed) { entry.completed = true; res.end(`${JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: '' } })}\n`); }
  });
  await new Promise((accept, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', accept); });
  const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
  await writeFile(preload, `// Test-only network fixture; never imported by production entry points.\nconst realFetch = globalThis.fetch;\nglobalThis.fetch = (input, init) => {\n  const original = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;\n  const url = new URL(original);\n  if (['http://127.0.0.1:11434', 'https://openrouter.ai', 'https://api.openai.com', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com', 'https://api.deepseek.com', 'https://open.bigmodel.cn', 'https://api.moonshot.cn'].includes(url.origin)) {\n    const redirected = ${JSON.stringify(fixtureOrigin)} + url.pathname + url.search;\n    return realFetch(input instanceof Request ? new Request(redirected, input) : redirected, init);\n  }\n  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('External network disabled by native acceptance fixture');\n  return realFetch(input, init);\n};\n`);
  }
  // Refuse to attach to an unrelated driver already listening on the test port.
  for (const port of [4444, 4445]) {
    const probe = createServer();
    await new Promise((accept, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', accept); });
    await new Promise(accept => probe.close(accept));
  }
  driverLog = createWriteStream(resolve(run, 'driver.log'));
  driver = spawn(tools.tauriDriver, ['--port', '4444', '--native-port', '4445', '--native-driver', tools.edgeDriver], {
    cwd: isolatedDirectory || repo, windowsHide: true, env: { ...process.env,
      ...((isolated || releaseSmoke) ? { PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`, NODE_PATH: '' } : {}),
      WEBVIEW2_USER_DATA_FOLDER: resolve(run, 'webview-profile'),
      NODE_OPTIONS: releaseSmoke ? '' : realModel ? (process.env.NODE_OPTIONS || '') : `${process.env.NODE_OPTIONS || ''} --import=${pathToFileURL(preload).href}`.trim() },
  });
  driver.stdout.pipe(driverLog); driver.stderr.pipe(driverLog);
  await until(() => wd('GET', '/status'), 'tauri-driver start', 30000);
  await checked('Actual built Tauri app launches with isolated WebView2 profile', launch);
  await screenshot('initial-1000x720');
  await checked('Native capability and CSP reject file opening, arbitrary programs and untrusted inline scripts', async () => {
    for (const [method, args] of [
      ['plugin:opener|open_url', { url: 'file:///C:/Windows/System32/calc.exe' }],
      ['plugin:opener|open_url', { url: 'javascript:alert(1)' }],
      ['plugin:opener|open_path', { path: 'C:/Windows/System32/calc.exe' }],
      ['run_guide', { subject: '--help', runId: 'invalid-subject' }],
      ['run_check', { dir: application, subject: 'personal', runId: 'invalid-directory' }],
    ]) {
      const result = await command('POST', '/execute/async', {
        script: 'const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then(() => done({ok:true}), e => done({ok:false,reason:String(e)}));', args: [method, args],
      });
      assert.equal(result.ok, false, method);
      assert.ok(result.reason);
    }
    // WebDriver evaluates through the debugger, which bypasses page eval CSP.
    // An actual DOM script insertion exercises the document's enforced policy.
    const csp = await command('POST', '/execute/async', {
      script: `const done=arguments[arguments.length-1];
        const script=document.createElement('script');
        const finish=directive=>{ clearTimeout(timer); document.removeEventListener('securitypolicyviolation', listener); script.remove(); done({directive,executed:window.__p1UntrustedScript===true}); };
        const listener=e=>{ if(e.blockedURI==='inline' && e.effectiveDirective.startsWith('script-src')) finish(e.effectiveDirective); };
        const timer=setTimeout(()=>finish('no-violation-observed'),3000);
        document.addEventListener('securitypolicyviolation',listener);
        script.textContent='window.__p1UntrustedScript=true'; document.head.append(script);`, args: [],
    });
    assert.equal(csp.executed, false);
    assert.match(csp.directive, /^script-src/);
  });
  if (builtinProvidersMode) {
    await checkBuiltinProviderFlows({ checked, click, fill, press, inspect, text, find, command, until, screenshot, openModelSettings, send, finished, requests, quit, launch, setFixture: handler => { providerAgentFixtureHandler = handler; } });
  } else if (allBatchesMode || repairMode || restoreMode || providerAgentMode) {
    if (allBatchesMode || restoreMode) await checkProjectRestore({ run, checked, click, fill, find, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests });
    if (allBatchesMode || providerAgentMode) await checkProviderAgentFlows({ checked, click, fill, inspect, text, find, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, openModelSettings, send, finished, requests, run, setFixture: handler => { providerAgentFixtureHandler = handler; } });
    if (allBatchesMode || repairMode) await checkProjectRepairFlows({ run, checked, click, fill, find, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests });
  } else if (presentationMode) {
    await checkPresentationFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, chooseOption, quit, launch, refresh: refreshPresentation, requests });
  } else if (readingMode) {
    await checkReadingFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, refresh: refreshReading, requests });
  } else if (notificationsMode) {
    await checkSystemNotificationFlows({ run, checked, click, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, ownedRuntimeProcesses });
  } else if (sourcesMode) {
    await checkSourceFreshnessFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, quit, launch, requests, sourceFixture, ownedRuntimeProcesses });
  } else if (maintenanceMode) {
    await checkMaintenanceFlows({ run, projectDatabase, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, isolatedDirectory, ownedRuntimeProcesses });
  } else if (memoryMode) {
    await checkMemoryFlows({ run, checked, click, fill, press, inspect, text, command, find, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, connectedModel, send, finished, chooseOption });
  } else if (healthMode) {
    await checkHealthFlows({ run, checked, click, fill, press, inspect, text, command, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests, isolatedDirectory });
  } else if (handoffMode) {
    await checkHandoffFlows({ run, checked, click, fill, press, inspect, text, command, find, until, screenshot, projectInvoke, projectDialog, closeProjects, selectProject, quit, launch, requests });
  } else if (agentMode) {
    await checkAgentFlows();
  } else if (connectionsMode) {
    await checkConnectionsFlows();
  } else if (workflowMode) {
    await checkWorkflowFlows();
  } else if (projectsMode) {
    await checkProjectFlows();
  } else if (releaseSmoke) {
    const settingsRendererRequests = () => inspect('return performance.getEntriesByType("resource").filter(entry => { const path = new URL(entry.name).pathname; return path.includes("/assets/settings-renderer-") && path.endsWith(".js"); }).map(entry => entry.name)');
    await checked('Installed release loads settings on demand and reuses the packaged renderer', async () => {
      const beforeOpen = await settingsRendererRequests();
      assert.deepEqual(beforeOpen, [], 'startup leaves the settings renderer unloaded');
      await openSettingsSection('appearance');
      assert.equal(await text('#preferences-heading'), '设置');
      const firstOpen = await settingsRendererRequests();
      assert.equal(firstOpen.length, 1, 'the packaged renderer is fetched on first open');
      await closeSettings();
      await openSettingsSection('appearance');
      const reopened = await settingsRendererRequests();
      assert.deepEqual(reopened, firstOpen, 'reopening reuses the loaded renderer');
      await screenshot('release-settings');
      await writeFile(resolve(run, 'release-settings-requests.json'), JSON.stringify({ beforeOpen, firstOpen, reopened }, null, 2));
      await closeSettings();
    });
    await checked('Installed release generates a real guide without Node on PATH', async () => {
      await click('#start-guide'); await click('#guide-btn');
      await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#guide-btn").disabled'), 'installed guide completes');
      assert.ok((await text('#report')).length > 50);
      assert.equal(await inspect('return Boolean(document.querySelector("#report h1") && document.querySelector("#report li"))'), true);
      await screenshot('release-guide'); await click('#desktop-tools-close');
    });
    await checked('Installed release native project tool returns actual bundled rejection rules', async () => {
      await click('#start-explain'); await fill('#rjInput', '诱导分享'); await click('#rjBtn');
      await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "matched"'), 'installed rejection lookup');
      assert.ok(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule").length > 0'));
      await screenshot('release-explain'); await press('\uE00C');
    });
    await checked('Installed release model provider catalog and credential validation need no account or paid request', async () => {
      await openModelSettings();
      await until(() => inspect('return document.querySelector("#desktop-preferences").open && !document.querySelector("[data-provider-id=openai]").disabled'), 'installed provider catalog');
      // Rejection lookup now uses a short-lived project CLI. The model settings
      // GET starts the lazy broker; verify its installed file identity here,
      // keeping the exact-path/parent-PID checks and no-Node-on-PATH environment.
      await until(async () => (await ownedRuntimeProcesses()).length > 0, 'broker runs from exact installed runtime path');
      for (const provider of ['openai', 'anthropic', 'google', 'deepseek', 'glm', 'kimi', 'openrouter', 'ollama']) {
        assert.equal(await inspect('return Boolean(document.querySelector(arguments[0]))', [`[data-provider-id="${provider}"]`]), true);
      }
      await click('[data-provider-id="openai"]');
      assert.equal(await inspect('return document.querySelector("#desktop-provider-connect").disabled'), true, 'empty key cannot send external request');
      await screenshot('release-model-catalog'); await press('\uE00C');
    });
    await checked('Installed release denies native tools to a foreign localhost document', async () => {
      const foreign = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Foreign-origin acceptance fixture</title><p id="foreign-fixture">Untrusted local document</p>'); });
      const appUrl = await command('GET', '/url');
      await new Promise((accept, reject) => { foreign.once('error', reject); foreign.listen(0, '127.0.0.1', accept); });
      try {
        await command('POST', '/url', { url: `http://127.0.0.1:${foreign.address().port}/` });
        await until(() => inspect('return Boolean(document.querySelector("#foreign-fixture"))'), 'foreign native document loads');
        const result = await command('POST', '/execute/async', {
          script: `const done=arguments[arguments.length-1];
            if(typeof window.__TAURI_INTERNALS__?.invoke !== 'function') { done({denied:true,reason:'bridge absent'}); return; }
            window.__TAURI_INTERNALS__.invoke('run_guide',{subject:'personal',runId:'foreign-origin-test'}).then(()=>done({denied:false}),e=>done({denied:true,reason:String(e)}));`, args: [],
        });
        assert.equal(result.denied, true); assert.ok(result.reason);
        captures.push({ name: 'foreign-origin-denial', ...result });
      } finally {
        await command('POST', '/url', { url: appUrl });
        foreign.closeAllConnections(); await new Promise(accept => foreign.close(accept));
      }
      await until(() => inspect('return Boolean(document.querySelector("#desktopInput"))'), 'trusted app restored');
    });
    await checked('Installed release shuts down its broker and restarts cleanly', async () => {
      await quit(); await launch();
      assert.deepEqual(await settingsRendererRequests(), [], 'restart still defers settings loading');
      await click('#start-guide'); await click('#guide-btn');
      await until(() => inspect('return document.querySelector("#status").classList.contains("ok")'), 'installed guide after restart');
      assert.ok((await text('#report')).length > 50);
      await screenshot('release-restarted');
    });
  } else if (realModel) {
    await checked('Real installed Ollama model connects through native desktop', async () => { await connectedModel(); await closeSettings(); });
    await checked('Real local model generates a response through native IPC', async () => {
      await send('请只回复：连接成功');
      await until(async () => (await text('#desktopMessages .msg--agent .msg__text'))?.trim(), 'real model response', 120000);
      await until(() => inspect('return document.querySelector("#desktopConversationStatus").dataset.state === "complete"'), 'real model completion', 120000);
      await screenshot('real-local-model-response');
    });
  } else {
  await checked('Conversation has one compact header and a centered bounded composer', async () => {
    await command('POST', '/window/rect', { width: 1280, height: 850 });
    const geometry = await inspect(`const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom }; };
      return { header:rect('.desktop-header'), composer:rect('.agent-composer'), conversation:rect('.desktop-conversation'), input:rect('#desktopInput'), width:innerWidth, height:innerHeight, overflow:document.documentElement.scrollHeight > innerHeight, toolsOpen:document.querySelector('#desktop-tools').open };`);
    assert.ok(geometry.header.height <= 64);
    assert.ok(geometry.composer.width <= 704);
    assert.ok(Math.abs(geometry.composer.x + geometry.composer.width / 2 - (geometry.conversation.x + geometry.conversation.width / 2)) < 2);
    assert.ok(geometry.input.bottom < geometry.height);
    assert.equal(geometry.toolsOpen, false);
    assert.equal(geometry.overflow, false);
    captures.push({ name: 'layout-baseline', ...geometry });
    await screenshot('empty-1280x850');
  });
  await checked('Task home exposes real entry points without seeded progress or model requirements', async () => {
    assert.equal(await inspect('return document.querySelectorAll("#desktopMessages .msg").length'), 0);
    assert.equal((await text('.session-workspace [data-action="new"]')).trim(), '新建会话');
    assert.equal(await inspect('return document.querySelector(".session-workspace [data-action=new]").getAttribute("aria-label")'), '新建会话');
    assert.equal(await text('#session-title'), '新会话');
    assert.doesNotMatch(await text('.desktop-sidebar'), /my-miniprogram|项目阶段|健康监控|新任务/);
    assert.equal(await inspect('return document.querySelectorAll(".session-workspace [data-action=recent-session]").length'), 1);
    const sidebar = await inspect(`const element = document.querySelector('.desktop-sidebar');
      const token = getComputedStyle(element).getPropertyValue('--ds-sidebar-width').trim();
      return { width: element.getBoundingClientRect().width, expected: token ? parseFloat(token) : 228 };`);
    assert.ok(sidebar.width >= 264 && sidebar.width <= 304, 'Sidebar fits the project list and the primary navigation rail');
    assert.ok(Math.abs(sidebar.width - sidebar.expected) < 1, 'Sidebar follows the active design token');
    assert.ok(await inspect('return document.querySelector(".desktop-sidebar-footer").getBoundingClientRect().bottom >= innerHeight - 24'), 'Settings remain anchored at the bottom of the sidebar');
    await click('#start-check');
    assert.equal(await inspect('return document.activeElement.id'), 'pick-btn');
    assert.equal(await inspect('return document.querySelector("#check-btn").disabled'), true);
    assert.equal(requests.length, 0);
    await click('#desktop-tools-close');
    assert.equal(await inspect('return document.activeElement.id'), 'start-check');
    await click('#start-guide');
    assert.equal(await inspect('return document.activeElement.id'), 'subject');
    assert.equal(await inspect('return document.querySelector("#guide-btn").disabled'), false);
    await screenshot('task-guide-entry');
    await click('#desktop-tools-close');
    assert.equal(await inspect('return document.activeElement.id'), 'start-guide');
  });
  await checked('Rejection lookup runs real local rules through native IPC without connecting a model', async () => {
    await click('#start-explain');
    assert.equal(await inspect('return document.activeElement.id'), 'rjInput');
    assert.ok(await inspect('return document.querySelector("#desktop-explain").matches(":modal")'));
    await screenshot('explain-empty');
    await click('#rjSample');
    assert.equal(await inspect('return document.querySelector("#rjResult").hidden'), true);
    await click('#rjBtn');
    await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "matched"'), 'real rejection rules');
    assert.equal(await inspect('return document.activeElement.id'), 'rjResultHeading');
    assert.equal(await inspect('return document.querySelector("#rjQuery").open'), false);
    assert.ok(await inspect('return document.querySelector("#rjResultHeading").getBoundingClientRect().top < innerHeight / 2'), 'result starts in the upper half of the viewport');
    assert.ok(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule").length > 0'));
    assert.equal(await inspect('return document.querySelectorAll("#rjResultItems details[open]").length'), 0);
    await click('#rjResultItems .rj-evidence > summary');
    assert.ok(await inspect('return document.querySelector("#rjResultItems .rj-evidence").open'));
    assert.match(await text('#rjResultItems .rj-evidence'), /仓库核验日期/);
    assert.ok(await inspect('const evidence=document.querySelector("#rjResultItems .rj-evidence");return [...evidence.querySelectorAll("p")].some(p=>p.checkVisibility() && /规则置信度：[高中低]/.test(p.textContent))'));
    assert.match(await text('#rjResultItems .rj-evidence'), /不是命中概率或过审保证/);
    await screenshot('explain-result');
    await press('\uE00C');
    await until(() => inspect('return document.activeElement.id === "start-explain"'), 'lookup returns to home trigger');
    assert.equal(requests.length, 0);
  });
  await checked('Rejection triage uses real rule fields with keyboard recovery and preserved evidence', async () => {
    await openExplainFromMenu();
    const firstRule = await find('#rjResultItems .rj-rule');
    const total = await inspect('return document.querySelectorAll("#rjResultItems .rj-rule").length');
    assert.equal(await inspect('return document.querySelector("[data-rj-filter=all]").getAttribute("aria-pressed")'), 'true');
    await click('[data-rj-filter="action"]');
    assert.equal(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule:not([hidden])").length'), 0, 'privacy sample contains warnings, not blockers');
    assert.equal(await inspect('return document.querySelector(".rj-triage__empty").hidden'), false);
    assert.equal(await inspect('return document.querySelectorAll(".rj-group:not([hidden])").length'), 0);
    await screenshot('explain-triage-empty');
    await press('\uE004'); await press(' ');
    assert.equal(await inspect('return document.activeElement.dataset.rjFilter'), 'manual');
    assert.equal(await inspect('return document.activeElement.getAttribute("aria-pressed")'), 'true');
    assert.equal(await inspect('return document.activeElement.matches(":focus-visible")'), true);
    assert.equal(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule:not([hidden])").length'), total);
    await screenshot('explain-triage-keyboard');
    await click('[data-rj-filter="source"]');
    assert.equal(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule:not([hidden])").length'), 0, 'every privacy match has a stored official URL');
    await click('[data-rj-reset]');
    assert.equal(await inspect('return document.activeElement.dataset.rjFilter'), 'all');
    assert.equal(await find('#rjResultItems .rj-rule'), firstRule, 'filtering reuses existing rule elements');
    assert.equal(await inspect('return document.querySelector("#rjResultItems .rj-evidence").open'), true);
    await click('[data-rj-filter="manual"]');
    await press('\uE00C'); await openExplainFromMenu();
    assert.equal(await inspect('return document.querySelector("[data-rj-filter=manual]").getAttribute("aria-pressed")'), 'true');
    assert.equal(requests.length, 0, 'triage does not issue model calls');
    await click('#desktop-explain-close');
  });
  await checked('Rejection lookup retains input and results on reopen; genuine empty matches recover', async () => {
    await openExplainFromMenu();
    assert.ok((await inspect('return document.querySelector("#rjInput").value')).includes('地理位置'));
    assert.equal(await inspect('return document.querySelector("#rjResult").hidden'), false);
    await editExplainQuery();
    await fill('#rjInput', '不存在的拒因xyz0123'); await click('#rjBtn');
    await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "empty"'), 'honest empty match');
    assert.equal(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule").length'), 0);
    assert.equal(await inspect('return document.querySelector(".rj-triage")'), null);
    await screenshot('explain-no-match');
    await fill('#rjInput', '诱导分享'); await click('#rjBtn');
    await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "matched"'), 'new search recovers');
    assert.match(await text('#rjResultItems'), /诱导/);
    assert.equal(await inspect('return document.querySelector("[data-rj-filter=all]").getAttribute("aria-pressed")'), 'true');
    await click('#desktop-explain-close');
    await until(() => inspect('return document.activeElement.id === "desktop-more"'), 'lookup restores menu trigger');
  });
  await checked('Rejection result downloads a complete local Markdown file through WebView2', async () => {
    const downloads = resolve(run, 'downloads'); await mkdir(downloads, { recursive: true });
    // EdgeDriver's vendor CDP endpoint configures only this isolated test profile.
    // No production download handler or filesystem permission is replaced.
    await command('POST', '/ms/cdp/execute', { cmd: 'Browser.setDownloadBehavior', params: { behavior: 'allow', downloadPath: downloads } });
    await openExplainFromMenu(); await editExplainQuery();
    await fill('#rjInput', '隐私'); await click('#rjBtn');
    await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "matched"'), 'download query ready');
    const original = await inspect('return document.querySelector("#rjInput").value');
    await click('[data-rj-filter="source"]');
    assert.equal(await inspect('return document.querySelectorAll("#rjResultItems .rj-rule:not([hidden])").length'), 0);
    await click('#rjDownload');
    const content = await until(async () => { const value = await readFile(resolve(downloads, 'shipmate-explain.md'), 'utf8'); return value.endsWith('\n') && value; }, 'native Markdown file');
    for (const required of ['# 小程序拒因查询结果', '查询：隐私', '用户信息隐私声明', '手机号隐私声明', '地理位置隐私声明', 'https://developers.weixin.qq.com/', '未实时核验']) assert.ok(content.includes(required), required);
    assert.match(await text('#rjActionStatus'), /已发起下载/);
    assert.equal(await inspect('return document.querySelector("#rjInput").value'), original);
    await screenshot('explain-download'); await click('#desktop-explain-close');
  });
  await checked('Rejection dialog fits a narrow native window with readable results and reachable close', async () => {
    await openExplainFromMenu();
    await click('[data-rj-filter="all"]');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    assert.equal(await inspect('return document.querySelector("#desktop-navigation").open'), false, 'content dialog does not retain an unrelated sidebar');
    assert.ok(await inspect('const d=document.querySelector("#desktop-explain"), b=d.querySelector(".session-workspace-dialog__body"), r=d.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && b.scrollWidth<=b.clientWidth+1'));
    assert.ok(await inspect('return [...document.querySelectorAll(".rj-triage__filter")].every(b => { const r=b.getBoundingClientRect(); return r.height>=44 && r.left>=0 && r.right<=innerWidth; })'));
    assert.ok(await inspect('return new Set([...document.querySelectorAll(".rj-triage__filter")].map(b => b.getBoundingClientRect().top)).size > 1'), 'filters wrap at narrow widths');
    assert.ok(await inspect('const body=document.querySelector("#desktop-explain .session-workspace-dialog__body").getBoundingClientRect(), rule=document.querySelector(".rj-rule:not([hidden]) > p").getBoundingClientRect(); return rule.top < body.bottom - 16'), 'first rule explanation starts within the narrow viewport');
    await screenshot('explain-narrow');
    await click('.rj-triage__help > summary');
    assert.equal(await inspect('return document.querySelector(".rj-triage__hint").checkVisibility()'), true);
    assert.match(await text('.rj-triage__hint'), /筛选仅影响显示/);
    await click('.rj-triage__help > summary');
    await press('\uE00C');
    await until(() => inspect('return document.activeElement.id === "desktop-more"'), 'narrow lookup dismissal');
    await command('POST', '/window/rect', { width: 1280, height: 850 });
  });
  await checked('Open-source menu keyboard actions retain dialog focus and return to the visible trigger', async () => {
    assert.equal(await inspect('return Boolean(document.querySelector("#start-check").shadowRoot?.querySelector("button"))'), true);
    assert.equal(await inspect('return document.querySelector("#home-report").disabled'), false, 'the preceding successful native rejection query leaves a readable saved report');
    assert.match(await text('#home-report-summary'), /已保存的拒因反查报告/);
    await click('#home-report');
    await until(() => inspect('return document.querySelector("#desktop-report-reader").open'), 'saved rejection report opens from home');
    if (!await inspect('return document.querySelector("#report-reader-original").open')) await click('#report-reader-original > summary');
    const savedRejection = await text('#desktop-report-reader .report-markdown');
    assert.match(savedRejection, /为「隐私」匹配到 \d+ 条相关拒审原因，对应 \d+ 条已核验规则/);
    for (const rule of ['privacy.getUserProfile', 'privacy.getPhoneNumber', 'privacy.getLocation']) assert.ok(savedRejection.includes(rule), `saved report retains matched rule ${rule}`);
    assert.ok(savedRejection.includes('https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/'), 'saved report retains the official privacy source');
    assert.match(await text('#report-reader-provenance'), /保存于/);
    await screenshot('home-saved-rejection-report');
    await click('#report-reader-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-report-reader").open && document.activeElement.id === "home-report"'), 'saved rejection report restores home focus');
    await click('#desktop-more');
    await press('\uE015'); // Home -> history
    await press('\uE007');
    await until(() => inspect('return Boolean(document.querySelector(".session-workspace-dialog[data-kind][open] input"))'), 'menu history opens');
    assert.equal(await inspect('return document.activeElement.getAttribute("aria-label")'), '搜索会话');
    await press('\uE00C');
    await until(() => inspect('return document.activeElement.id === "desktop-more"'), 'history restores menu trigger');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await click('#desktop-more');
    await click('#desktop-actions wa-dropdown-item[value="history"]');
    await until(() => inspect('return Boolean(document.querySelector(".session-workspace-dialog[data-kind][open] input"))'), 'narrow menu history');
    await press('\uE00C');
    await until(() => inspect('return document.activeElement.id === "desktop-more"'), 'narrow history return focus');
    assert.equal(await inspect('return document.querySelector("#desktop-more").getBoundingClientRect().width > 0'), true);
    await command('POST', '/window/rect', { width: 1280, height: 850 });
  });
  await checked('Project tools open beside chat, retain a real report and restore focus on close', async () => {
    await click('#desktop-tools-toggle');
    assert.equal(await inspect('return document.querySelector("#desktop-tools").open && !document.querySelector("#desktop-tools").matches(":modal")'), true);
    const panel = await inspect(`const element = document.querySelector('#desktop-tools');
      const token = getComputedStyle(element).getPropertyValue('--ds-panel-width').trim();
      return { width: element.getBoundingClientRect().width, expected: token ? parseFloat(token) : 320 };`);
    assert.ok(panel.width >= 300 && panel.width <= 360, 'Project tools leave usable space beside chat');
    assert.ok(Math.abs(panel.width - panel.expected) < 1, 'Project tools follow the active design token');
    await click('#guide-btn');
    await until(() => inspect('return document.querySelector("#status").classList.contains("ok")'), 'native local guide report');
    const report = await text('#report');
    assert.ok(report.length > 50);
    assert.match(report, /规则置信度：高/);
    assert.match(report, /规则置信度：中/);
    assert.match(report, /不是命中概率或过审保证/);
    assert.equal(await inspect('return Boolean(document.querySelector("#report h1") && document.querySelector("#report li"))'), true, 'real tool Markdown has semantic headings and lists');
    assert.equal(await inspect('return document.querySelector("#report").tagName'), 'DIV');
    await screenshot('tools-with-report');
    await click('#desktop-tools-close');
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-tools-toggle');
    assert.equal(await inspect('return document.querySelector("#home-report").disabled'), false);
    await click('#home-report');
    await until(() => inspect('return document.querySelector("#desktop-report-reader").open'), 'home report opens the reading dialog');
    assert.equal(await inspect('return document.activeElement.id'), 'report-reader-dismiss');
    await click('#report-reader-dismiss');
    await until(() => inspect('return !document.querySelector("#desktop-report-reader").open'), 'home reading closes');
    assert.equal(await inspect('return document.activeElement.id'), 'home-report');
    await click('#desktop-tools-toggle');
    assert.equal(await text('#report'), report);
  });
  if (isolated) {
    // Mutate only this run's copied runtime, never source or the built base runtime.
    const isolatedRoot = await realpath(isolatedDirectory);
    const cli = await realpath(resolve(isolatedRoot, 'runtime/src/project-tool.mjs'));
    const inside = relative(isolatedRoot, cli);
    assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside));
    assert.notEqual(cli, await realpath(resolve(repo, 'desktop/src-tauri/runtime/src/project-tool.mjs')));
    const originalCli = await readFile(cli);
    const baselineReport = await text('#report');
    // Compare report semantics after a new execution; save timestamps and run IDs
    // belong to #report-note and must not be treated as unchanged run identity.
    const reportSemantics = () => inspect('return [...document.querySelectorAll("#report h1,#report h2,#report h3,#report li,#report a")].map(n=>({tag:n.tagName,text:n.textContent,href:n.getAttribute("href")}))');
    const baselineSemantics = await reportSemantics();
    assert.ok(baselineSemantics.length > 0, 'real guide has semantic report content');
    await checked('Isolated slow-tool fixture stops through real IPC and preserves prior report; restored runtime retries', async () => {
      const started = resolve(dirname(cli), 'p1-project-tool-slow-started');
      try {
        await writeFile(cli, `// Labelled P1 E2E slow-tool fixture, isolated copy only.\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('./p1-project-tool-slow-started', import.meta.url), 'started');\nsetTimeout(() => console.log('LATE FIXTURE RESULT MUST NOT REPLACE REPORT'), 60000);\n`);
        await click('#guide-btn');
        await until(async () => (await stat(started)).isFile(), 'isolated slow tool actually spawned');
        assert.equal(await inspect('return document.querySelector("#stop-tool").hidden'), false);
        await click('#stop-tool');
        await until(() => inspect('return !document.querySelector("#guide-btn").disabled && document.querySelector("#stop-tool").hidden'), 'native tool cancellation and acknowledgment settle');
        assert.match(await text('#status'), /已停止/);
        assert.equal(await text('#report'), baselineReport);
        assert.match(await text('#report-note'), /上次.*并非本次/);
        await screenshot('isolated-tool-stopped');
      } finally { await writeFile(cli, originalCli); }
      await click('#guide-btn');
      await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#guide-btn").disabled'), 'restored real guide retries after cancellation');
      assert.deepEqual(await reportSemantics(), baselineSemantics, 'restored project runner reproduces guide findings and sources');
    });
    await checked('Missing isolated project runner gives actionable error, preserves report and recovers after restoration', async () => {
      const backup = resolve(dirname(cli), 'project-tool.mjs.p1-missing-backup');
      await rename(cli, backup);
      try {
        await click('#guide-btn');
        await until(() => inspect('return document.querySelector("#status").classList.contains("error") && !document.querySelector("#guide-btn").disabled'), 'missing runtime error');
        assert.match(await text('#status'), /运行时文件缺失.*重新安装/);
        assert.equal(await text('#report'), baselineReport);
        assert.match(await text('#report-note'), /失败.*上次.*并非本次/);
        await screenshot('isolated-missing-runtime');
      } finally { await rename(backup, cli); }
      await click('#guide-btn');
      await until(() => inspect('return document.querySelector("#status").classList.contains("ok") && !document.querySelector("#guide-btn").disabled'), 'restored runtime recovers after missing-file error');
      assert.deepEqual(await reportSemantics(), baselineSemantics, 'restored project runner reproduces guide findings and sources');
    });
  }
  await checked('Open tools survive narrow modal and wide panel transitions without a second page scroll', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await until(() => inspect('return document.querySelector("#desktop-tools").matches(":modal")'), 'tools becomes modal');
    assert.equal(await inspect('return document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight'), true);
    await screenshot('tools-narrow');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] });
    await until(() => inspect('return !document.querySelector("#desktop-tools").open && document.activeElement.id === "desktop-tools-toggle"'), 'drawer Escape restores focus');
    assert.equal(await inspect('return document.querySelector("#desktopInput").getBoundingClientRect().bottom < innerHeight'), true);
    await screenshot('empty-narrow');
    await click('#desktop-tools-toggle');
    await command('POST', '/window/rect', { width: 1000, height: 720 });
    await until(() => inspect('return document.querySelector("#desktop-tools").open && !document.querySelector("#desktop-tools").matches(":modal")'), 'tools becomes adjacent');
    await click('#desktop-tools-close');
    await command('POST', '/window/rect', { width: 1000, height: 500 });
    assert.equal(await inspect('return document.querySelector("#desktopInput").getBoundingClientRect().bottom < innerHeight && document.documentElement.scrollHeight <= innerHeight'), true);
    await screenshot('empty-short');
    await command('POST', '/window/rect', { width: 1000, height: 720 });
  });
  await checked('Conversation fills available height at intermediate and short window sizes', async () => {
    for (const [width, height] of [[800, 720], [900, 1000], [900, 500], [1000, 500], [390, 500]]) {
      await command('POST', '/window/rect', { width, height });
      const geometry = await inspect(`const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, width:r.width }; };
        return { frame:rect('.desktop-layout'), conversation:rect('.desktop-conversation'), composer:rect('.agent-composer'), height:innerHeight, width:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };`);
      captures.push({ name: `responsive-${width}x${height}`, ...geometry });
      assert.ok(Math.abs(geometry.conversation.bottom - geometry.frame.bottom) <= 2, `Conversation must fill its frame at ${width}x${height}`);
      assert.ok(geometry.composer.top >= geometry.frame.top && geometry.composer.bottom < geometry.height, `Entire composer must remain visible at ${width}x${height}`);
      assert.equal(geometry.overflow, false);
      await screenshot(`empty-${width}x${height}`);
    }
    await command('POST', '/window/rect', { width: 1000, height: 720 });
  });
  await checked('Sending without a connected model preserves draft and opens connections', async () => {
    await send('未连接时保留这份草稿');
    await settingsConnectionsReady();
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '未连接时保留这份草稿');
    assert.equal(requests.length, 0);
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] });
  });
  await checked('Open-source credential controls mask and clear drafts without submitting to a cloud provider', async () => {
    await openModelSettings();
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && !document.querySelector("[data-provider-id=openai]").disabled'), 'credential dialog ready');
    await click('[data-provider-id="openai"]');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").type'), 'password');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-connect").disabled'), true);
    assert.equal(await inspect('return Boolean(document.querySelector("#desktop-provider-connect").shadowRoot?.querySelector("button"))'), true);
    // Deliberately invalid test text; never click the connect/submit action.
    await fill('#desktop-provider-key', 'not-a-real-key-native-ui-test');
    await until(() => inspect('return !document.querySelector("#desktop-provider-connect").disabled'), 'nonempty draft enables connection action');
    await click('#desktop-provider-reveal');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").type'), 'text');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-reveal").textContent.trim()'), '隐藏密钥');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-reveal").getAttribute("aria-pressed")'), null);
    await click('#desktop-provider-reveal');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").type'), 'password');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-reveal").textContent.trim()'), '显示密钥');
    await screenshot('credential-masked');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.activeElement.id === "desktop-preferences-open"'), 'credential Escape returns to settings trigger');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
    await openModelSettings();
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && !document.querySelector("[data-provider-id=openai]").disabled'), 'credential dialog reopens');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").type'), 'password');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-connect").disabled'), true);
    await fill('#desktop-provider-key', 'not-a-real-key-provider-switch');
    await click('#desktop-provider-reveal');
    await click('[data-provider-id="google"]');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").value'), '');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").type'), 'password');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-reveal").textContent.trim()'), '显示密钥');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-connect").disabled'), true);
    assert.equal(requests.length, 0, 'credential UI inspection does not issue inference requests');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.activeElement.id === "desktop-preferences-open"'), 'provider switch dialog returns focus');
  });
  await checked('Manual OAuth remains recoverable after closing settings and never retains a code draft', async () => {
    await openModelSettings();
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && !document.querySelector("[data-provider-id=openrouter]").disabled'), 'OAuth settings ready');
    if (!(await inspect('return document.querySelector("[data-provider-id=openrouter]").getAttribute("aria-pressed") === "true"'))) await click('[data-provider-id="openrouter"]');
    await click('#desktop-provider-oauth-manual');
    await until(() => inspect('return !document.querySelector("#desktop-oauth-code-form").hidden && !document.querySelector("#desktop-provider-oauth-reopen").hidden'), 'manual OAuth waiting');
    assert.equal(await inspect('return document.querySelector("#desktop-oauth-code").type'), 'password');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-connect").disabled'), true);
    await fill('#desktop-oauth-code', 'fixture-native-never-submit');
    await screenshot('oauth-manual-waiting');
    assert.equal(await inspect('return document.querySelector("#desktop-provider-key").closest("form").hidden'), true);
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await fill('#desktop-oauth-code', 'fixture-native-never-submit');
    assert.equal(await inspect('return document.documentElement.scrollWidth <= innerWidth && document.querySelector("#desktop-preferences").scrollWidth <= document.querySelector("#desktop-preferences").clientWidth'), true);
    const authGeometry = await inspect('const r=document.querySelector("#desktop-provider-oauth-complete").getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth};');
    assert.ok(authGeometry.left >= 0 && authGeometry.right <= authGeometry.width);
    await screenshot('oauth-manual-narrow');
    await command('POST', '/window/rect', { width: 1000, height: 720 });
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.querySelector("#desktop-oauth-code").value === ""'), 'closing settings clears the unsent authorization code');
    await openModelSettings();
    await until(() => inspect('return !document.querySelector("#desktop-oauth-code-form").hidden && !document.querySelector("#desktop-provider-oauth-reopen").hidden'), 'OAuth restored after reopen');
    assert.equal(await inspect('return document.querySelector("#desktop-oauth-code").value'), '');
    assert.equal(oauthExchanges, 0);
    await click('#desktop-provider-oauth-cancel');
    await until(() => inspect('return document.querySelector("#desktop-oauth-code-form").hidden'), 'OAuth canceled');
    assert.match(await text('#desktop-oauth-progress'), /取消/);
    await screenshot('oauth-cancelled');
  });
  await checked('Manual OAuth rejection explains failure and permits a new authorization', async () => {
    await click('#desktop-provider-oauth-manual');
    await until(() => inspect('return !document.querySelector("#desktop-oauth-code-form").hidden'), 'new authorization');
    await fill('#desktop-oauth-code', 'fixture-native-oauth-invalid');
    await click('#desktop-provider-oauth-complete');
    await until(() => inspect('return !document.querySelector("#desktop-provider-oauth-manual").disabled && document.querySelector("#desktop-oauth-code-form").hidden'), 'rejection settled');
    assert.equal(oauthExchanges, 1);
    assert.equal(await inspect('return document.querySelector("#desktop-oauth-code").value'), '');
    assert.match((await text('#desktop-oauth-progress')) + (await text('#desktop-provider-status')), /授权|失败|凭据/);
    await screenshot('oauth-error');
  });
  await checked('Manual OAuth completes through native IPC, validates catalog and disconnects without retaining secrets', async () => {
    await click('#desktop-provider-oauth-manual');
    await until(() => inspect('return !document.querySelector("#desktop-oauth-code-form").hidden'), 'retry authorization');
    await fill('#desktop-oauth-code', 'fixture-native-oauth-success');
    await click('#desktop-provider-oauth-complete');
    await until(() => find('[data-model-id="fixture/oauth-model"]'), 'OAuth catalog discovered');
    assert.equal(oauthExchanges, 2);
    assert.equal(await inspect('return document.querySelector("#desktop-oauth-code").value'), '');
    assert.equal(await inspect('return document.querySelector("#desktop-oauth-code-form").hidden'), true);
    assert.match(await text('#desktop-oauth-progress'), /授权完成|授权有效|成功/);
    const storageText = await inspect('return JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });');
    assert.doesNotMatch(storageText, /fixture-native-oauth|code_verifier|authorizationUrl/);
    await screenshot('oauth-connected');
    await click('#desktop-provider-disconnect');
    await until(() => inspect('return document.querySelectorAll("#desktop-preferences .desktop-model-panel [data-model-id=\\"fixture/oauth-model\\"]").length === 0'), 'OAuth disconnected');
    await press('\uE00C');
  });
  await checked('Connect Ollama and select discovered model through production UI', async () => { await connectedModel(); await closeSettings(); });
  await checked('Quick model selection searches, retains selection, handles keyboard and opens settings separately', async () => {
    const anchor = '#desktopComposer .agent-composer__model';
    await click(anchor);
    await until(() => inspect('return document.querySelector("#desktop-model-picker").matches(":popover-open") && document.querySelector(".desktop-picker-option")'), 'compact picker ready');
    assert.equal(await inspect('return document.querySelector("#desktop-preferences").open || document.querySelector("#desktop-model-dialog").open'), false);
    assert.equal(await inspect('return document.activeElement.id'), 'desktop-picker-search');
    assert.equal(await inspect('return document.querySelector(".desktop-picker-option").getAttribute("aria-pressed")'), 'true');
    await screenshot('model-quick-picker');
    await fill('#desktop-picker-search', 'no-such-native-model');
    assert.match(await text('.desktop-picker-status'), /没有匹配/);
    assert.equal(await inspect('return document.querySelectorAll(".desktop-picker-option").length'), 0);
    await fill('#desktop-picker-search', model);
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE015' }, { type: 'keyUp', value: '\uE015' }, { type: 'keyDown', value: '\uE007' }, { type: 'keyUp', value: '\uE007' }] }] });
    await until(() => inspect('return !document.querySelector("#desktop-model-picker").matches(":popover-open") && document.activeElement.classList.contains("agent-composer__model")'), 'keyboard choice restores anchor');
    await click(anchor);
    await click('.desktop-picker-manage');
    await settingsConnectionsReady();
    await until(() => inspect('return document.querySelector("#desktop-preferences").open && document.activeElement.id === "preferences-section-title"'), 'connected settings focuses its section heading');
    assert.match(await text('.desktop-model-note'), /无需 API 密钥/);
    assert.doesNotMatch(await text('.desktop-model-note'), /密钥仅保留/);
    assert.doesNotMatch(await text('#desktopConversationStatus'), /请先连接/);
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] });
    await until(() => inspect('return document.activeElement.matches("#desktopComposer .agent-composer__model")'), 'closing model management restores the composer model trigger');
  });
  await checked('Connected empty catalogs explain the next step and recover through the existing refresh action', async () => {
    emptyCatalog = true;
    try {
      await openModelSettings();
      await until(() => inspect('return !document.querySelector("#desktop-provider-refresh").disabled'), 'catalog refresh ready');
      await click('#desktop-provider-refresh');
      await until(async () => (await text('#desktop-provider-status')).includes('已连接 · 0 个模型'), 'connected empty catalog');
      assert.match(await text('.desktop-model-list'), /尚无本地模型.*下载模型.*刷新目录/);
      assert.equal(await inspect('return document.querySelector("#desktop-provider-refresh").hidden'), false);
      await screenshot('model-catalog-empty');
      await press('\uE00C');
      await click('#desktopComposer .agent-composer__model');
      await until(async () => (await text('.desktop-picker-status')).includes('尚无本地模型'), 'empty quick picker');
      assert.match(await text('.desktop-picker-status'), /下载模型.*管理模型连接.*刷新目录/);
      await fill('#desktop-picker-search', 'missing-model');
      assert.match(await text('.desktop-picker-status'), /尚无本地模型/);
      await fill('#desktop-picker-search', '');
      await screenshot('model-picker-empty');
      await click('.desktop-picker-manage');
      await settingsConnectionsReady();
      await until(() => inspect('return document.querySelector("#desktop-preferences").open'), 'empty catalog management');
    } finally { emptyCatalog = false; }
    await until(() => inspect('return !document.querySelector("#desktop-provider-refresh").disabled'), 'catalog recovery ready');
    await click('#desktop-provider-refresh');
    await until(() => find(`#desktop-preferences .desktop-model-panel [data-model-id="${model}"]`), 'catalog restored after refresh');
    await click(`#desktop-preferences .desktop-model-panel [data-model-id="${model}"]`);
    await until(() => inspect('return document.querySelector("#desktop-preferences .desktop-model-panel [aria-pressed=true][data-model-id]")?.dataset.modelId === arguments[0]', [model]), 'restored model selected');
    await closeSettings();
  });
  await checked('Incremental streaming reaches completion through native IPC', async () => {
    await send('原生验收历史关键词');
    await until(async () => (await text('#desktopMessages')).includes('原生流式第一段。'), 'first streamed delta');
    assert.ok(!(await text('#desktopMessages')).includes('FIXTURE_COMPLETE'), 'first delta visible before final chunk');
    await screenshot('streaming');
    await until(async () => (await text('#desktopMessages')).includes('FIXTURE_COMPLETE'), 'final delta');
    await finished(); assert.equal(requests.at(-1).model, model);
    assert.equal(await inspect('return document.querySelectorAll("#desktopMessages .branch-note").length'), 0, 'transport identity does not repeat above each message');
    await click('#desktopMessages .run-trace > summary');
    assert.match(await text('#desktopMessages .run-trace p'), /ollama.*shipmate-native-fixture/);
    await click('#desktopMessages .run-trace > summary');
  });
  await checkOpenClaudeChat({ run, checked, click, press, inspect, command, until, screenshot, finished, requests });
  await checked('Copy feedback resets without losing keyboard focus or shifting the response', async () => {
    const selector = '#desktopMessages [data-component="message"]:last-child [data-action="copy"]';
    const before = await inspect(`const button = document.querySelector(arguments[0]);
      const message = button.closest('[data-component="message"]');
      return { label: button.getAttribute('aria-label'), title: button.title,
        top: message.getBoundingClientRect().top, height: message.getBoundingClientRect().height,
        width: button.getBoundingClientRect().width };`, [selector]);
    await click(selector);
    await until(() => inspect('return document.querySelector(arguments[0]).dataset.copyState === "success"', [selector]), 'clipboard success');
    assert.equal(await inspect('return document.activeElement === document.querySelector(arguments[0])', [selector]), true);
    assert.equal(await inspect('return getComputedStyle(document.querySelector("#desktopMessages .run-trace")).fontVariantNumeric'), 'tabular-nums');
    await screenshot('copy-feedback-success');
    await until(() => inspect('return !document.querySelector(arguments[0]).hasAttribute("data-copy-state")', [selector]), 'copy feedback restored', 5000);
    assert.equal(await text('#desktopConversationStatus'), '', 'copy success announcement also expires');
    const after = await inspect(`const button = document.querySelector(arguments[0]);
      const message = button.closest('[data-component="message"]');
      return { label: button.getAttribute('aria-label'), title: button.title,
        top: message.getBoundingClientRect().top, height: message.getBoundingClientRect().height,
        width: button.getBoundingClientRect().width };`, [selector]);
    assert.deepEqual(after, before);
    assert.equal(await inspect('return document.activeElement === document.querySelector(arguments[0])', [selector]), true);
    await screenshot('copy-feedback-restored');
  });
  await checked('Code blocks preserve text, expose keyboard focus and restore their own copy label', async () => {
    await send('原生代码展示验收');
    await until(() => requests.at(-1).completed, 'code example completes');
    await finished();
    const selector = '#desktopMessages [data-component="message"]:last-child .markdown-code__header button';
    const state = await inspect(`const button = document.querySelector(arguments[0]);
      const code = button.closest('.markdown-code');
      return { text: code.querySelector('code').textContent,
        overflow: code.scrollWidth > code.clientWidth + 1,
        label: button.getAttribute('aria-label') };`, [selector]);
    assert.equal(state.text, 'const result = { ok: true };\nconsole.log(result);\n');
    assert.equal(state.overflow, false);
    await click(selector);
    await until(() => inspect('return document.querySelector(arguments[0]).dataset.copyState === "success"', [selector]), 'code copied');
    await until(() => inspect('return !document.querySelector(arguments[0]).hasAttribute("data-copy-state")', [selector]), 'code copy restored', 5000);
    assert.equal(await inspect('return document.querySelector(arguments[0]).getAttribute("aria-label")', [selector]), state.label);
    assert.equal(await inspect('return document.activeElement === document.querySelector(arguments[0])', [selector]), true);
    await press('\uE004');
    assert.equal(await inspect('return document.activeElement.matches(".markdown-code pre") && getComputedStyle(document.activeElement).outlineStyle !== "none"'), true);
    await screenshot('code-block-focus');
  });
  await checked('Read-only rejection lookup succeeds during held chat without interrupting transport and restores its result after stop', async () => {
    const count = requests.length;
    holdNext = true; await send('并发只读查询验收');
    await until(() => requests.length === count + 1 && requests.at(-1).messages.at(-1)?.content === '并发只读查询验收', 'new held chat request reaches the fixture');
    const held = requests.at(-1);
    await until(() => inspect('return document.querySelector("#desktopMessages .msg:last-child").textContent.includes("停止测试片段") && document.querySelector("#desktopSend").dataset.mode === "stop"'), 'current held response has streamed');
    await fill('#desktopInput', '并发查询期间保留的聊天草稿');
    await openExplainFromMenu(); await editExplainQuery();
    await fill('#rjInput', '诱导分享'); await click('#rjBtn');
    await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "matched"'), 'local read-only query succeeds independently of chat');
    assert.equal(await inspect('return document.querySelector("#rjInput").value'), '诱导分享');
    const results = await text('#rjResultItems'); assert.match(results, /诱导/);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '并发查询期间保留的聊天草稿');
    assert.equal(await inspect('return document.querySelector("#desktopSend").dataset.mode'), 'stop');
    assert.equal(requests.length, count + 1, 'local lookup does not send a model request');
    assert.equal(held.aborted, false, 'local lookup does not cancel held chat');
    assert.equal(held.completed, false, 'chat remains running while its read-only query completes');
    await screenshot('explain-concurrent-chat');
    await click('#desktop-explain-close'); await click('#desktopSend');
    await until(() => held.aborted, 'explicit stop cancels the same held upstream request'); await finished();
    await openExplainFromMenu();
    assert.equal(await inspect('return document.querySelector("#rjStatus").dataset.state'), 'matched');
    assert.equal(await inspect('return document.querySelector("#rjInput").value'), '诱导分享');
    assert.equal(await text('#rjResultItems'), results, 'completed local results survive close, chat stop and reopen');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '并发查询期间保留的聊天草稿');
    assert.equal(requests.length, count + 1);
    await screenshot('explain-restored-after-chat-stop');
    await click('#desktop-explain-close'); await fill('#desktopInput', '');
  });
  await checked('Stop cancels upstream and preserves partial response', async () => {
    const count = requests.length;
    holdNext = true; await send('请测试停止生成');
    await until(() => requests.length === count + 1 && requests.at(-1).messages.at(-1)?.content === '请测试停止生成', 'new stop-test request reaches upstream');
    const held = requests.at(-1);
    await until(() => inspect('return document.querySelector("#desktopMessages .msg:last-child").textContent.includes("停止测试片段") && document.querySelector("#desktopSend").dataset.mode === "stop"'), 'latest response streams before stop');
    await click('#desktopSend');
    await until(() => held.aborted, 'same upstream request observes cancellation');
    await finished();
    const stopped = await text('#desktopMessages'); await delay(900);
    assert.equal(await text('#desktopMessages'), stopped);
  });
  await checked('Provider failure exposes retry and retry succeeds', async () => {
    failNext = true; await send('请测试错误恢复');
    await until(() => find('#desktopMessages [data-action="retry"]'), 'error retry action');
    assert.equal(await inspect('return document.querySelectorAll(".msg--error [data-action=copy]").length'), 0, 'empty failure has no dead copy action');
    assert.equal(await inspect('return getComputedStyle(document.querySelector("#desktopConversationStatus")).clipPath'), 'inset(50%)', 'duplicate live announcement is accessible but visually quiet');
    await screenshot('error-recovery');
    const count = requests.length; await click('#desktopMessages [data-action="retry"]');
    await until(() => requests.length > count && requests.at(-1).completed, 'successful retried response');
    await finished();
  });
  await checked('New session and historical message search restore the original draft', async () => {
    await fill('#desktopInput', '原生重启后草稿保留');
    await click('.session-workspace [data-action="new"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '');
    await fill('#desktopInput', '第二会话独立草稿');
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', '原生验收历史关键词');
    await click('.session-workspace__results [data-action="session"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    await until(async () => (await text('.session-workspace [data-action="save-status"]')).includes('已保存'), 'persisted before process exit');
  });
  await checked('Sidebar switches real sessions and restores each independent draft', async () => {
    await click('.session-workspace [data-action="recent-session"][aria-current="false"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '第二会话独立草稿');
    assert.equal(await inspect('return document.querySelector("#session-empty").hidden'), false);
    await click('.session-workspace [data-action="recent-session"][aria-current="false"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    assert.equal(await inspect('return document.querySelector("#session-empty").hidden'), true);
    await screenshot('sidebar-session-restore');
  });
  await checked('Reopening the current conversation from Home restores chat and keeps its draft', async () => {
    const activeRow = '.session-workspace [data-action="recent-session"][aria-current="true"]';
    await click('#desktop-home-open');
    assert.equal(await inspect('return document.querySelector("#session-empty").hidden'), false);
    await click(activeRow);
    assert.equal(await inspect('return document.querySelector("#session-empty").hidden'), true);
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await click('#desktop-home-open');
    await click('#desktop-navigation > summary');
    await click('.session-workspace [data-action="history"]');
    await until(() => inspect('return document.querySelector("dialog[data-kind=history]")?.open'), 'history opened from the compact sidebar');
    const results = await text('.session-workspace__results');
    assert.match(results, /有未发送的草稿/);
    assert.ok(!results.includes('第二会话独立草稿'));
    await screenshot('history-conversation-previews');
    await click('.session-workspace__results [data-action=session][aria-current=true]');
    assert.equal(await inspect('return document.querySelector("#session-empty").hidden && !document.querySelector("#desktop-navigation").open'), true);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    await command('POST', '/window/rect', { width: 1000, height: 900 });
  });
  await checked('History supports empty recovery, keyboard selection and two-stage Escape', async () => {
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', '不存在的会话原生验收');
    assert.equal(await inspect('return document.querySelectorAll(".session-workspace__results [data-action=session]").length'), 0);
    await screenshot('history-empty');
    await click('.session-workspace-dialog[data-kind] [data-action="clear-empty"]');
    assert.equal(await inspect('return document.activeElement.getAttribute("aria-label")'), '搜索会话');
    assert.equal(await inspect('return document.querySelector("[aria-label=搜索会话]").value'), '');
    await fill('[aria-label="搜索会话"]', '原生验收历史关键词');
    await press('\uE00C');
    assert.equal(await inspect('return document.querySelector(".session-workspace-dialog[data-kind]").open'), true);
    assert.equal(await inspect('return document.querySelector("[aria-label=搜索会话]").value'), '');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector(".session-workspace-dialog[data-kind]") && document.activeElement.dataset.action === "history"'), 'history Escape returns focus');
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', '原生验收历史关键词');
    await press('\uE015');
    assert.equal(await inspect('return document.activeElement.dataset.action'), 'session');
    await screenshot('history-search');
    await press('\uE007');
    await until(() => inspect('return !document.querySelector(".session-workspace-dialog[data-kind]")'), 'history keyboard choice closes dialog');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
  });
  await checked('Rename validates inline, clears errors on input and persists the title', async () => {
    await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="rename"]');
    await until(() => inspect('return document.querySelector("dialog[data-kind=rename]")?.open'), 'rename opens after menu closes');
    await fill('[aria-label="会话名称"]', '   ');
    await click('.session-workspace-dialog[data-kind] [data-action="confirm"]');
    assert.equal(await inspect('return document.querySelector("[aria-label=会话名称]").getAttribute("aria-invalid")'), 'true');
    assert.equal(await inspect('const field=document.querySelector("[aria-label=会话名称]"); return Boolean(document.getElementById(field.getAttribute("aria-describedby"))?.textContent)'), true);
    await screenshot('rename-validation');
    await fill('[aria-label="会话名称"]', '原生验收：设置与历史');
    assert.notEqual(await inspect('return document.querySelector("[aria-label=会话名称]").getAttribute("aria-invalid")'), 'true');
    await screenshot('rename-ready');
    await press('\uE007');
    await until(() => inspect('return !document.querySelector(".session-workspace-dialog[data-kind]") && document.activeElement.id === "desktop-more"'), 'rename saves and restores focus');
    assert.equal((await text('.session-workspace [data-action="recent-session"][aria-current="true"]')).trim(), '原生验收：设置与历史');
    await until(async () => (await text('.session-workspace [data-action="save-status"]')).includes('已保存'), 'renamed title persisted');
  });
  await checked('Open-source rename save submits its external native form and restores the trigger', async () => {
    for (const title of ['原生验收：开源表单保存', '原生验收：设置与历史']) {
      await click('#desktop-more'); await click('#desktop-actions wa-dropdown-item[value="rename"]');
      await until(() => inspect('return document.querySelector("dialog[data-kind=rename]")?.open'), 'rename opens after menu closes');
      assert.equal(await inspect('const action=document.querySelector(".session-workspace-dialog[data-kind] [data-action=confirm]"); const form=document.getElementById(action.getAttribute("form")); return Boolean(action.shadowRoot?.querySelector("button") && form?.tagName === "FORM" && !form.contains(action));'), true);
      await fill('[aria-label="会话名称"]', title);
      await click('.session-workspace-dialog[data-kind] [data-action="confirm"]');
      await until(() => inspect('return !document.querySelector(".session-workspace-dialog[data-kind]") && document.activeElement.id === "desktop-more"'), 'open-source save closes and restores focus');
      assert.equal((await text('.session-workspace [data-action="recent-session"][aria-current="true"]')).trim(), title);
    }
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    await until(async () => (await text('.session-workspace [data-action="save-status"]')).includes('已保存'), 'external-form title persisted');
  });
  await checked('Archive persists across refresh and restoring retains the original draft', async () => {
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', '原生验收：设置与历史');
    await click('.session-workspace-dialog[data-kind] [data-action="archive-session"]');
    await until(() => inspect('return document.querySelectorAll(".session-workspace__results [data-action=session]").length === 0 && !document.querySelector("[data-action=filter-archived]").disabled'), 'archived row removed after save');
    await click('.session-workspace-dialog[data-kind] [data-action="cancel"]');
    await command('POST', '/refresh', {});
    await until(() => inspect('return document.querySelector("#desktopInput")?.value === "第二会话独立草稿"'), 'archive selected the remaining session durably');
    assert.equal(await inspect('return [...document.querySelectorAll(".session-workspace [data-action=recent-session]")].some(row => row.textContent.includes("原生验收：设置与历史"))'), false);
    await click('.session-workspace [data-action="history"]');
    await click('.session-workspace-dialog[data-kind] [data-action="filter-archived"]');
    await fill('[aria-label="搜索会话"]', '原生验收：设置与历史');
    assert.equal(await inspect('return document.querySelectorAll(".session-workspace__results [data-action=session]").length'), 1);
    await screenshot('archived-history');
    await click('.session-workspace-dialog[data-kind] [data-action="restore-session"]');
    await until(() => inspect('return document.querySelectorAll(".session-workspace__results [data-action=session]").length === 0'), 'restored row leaves archive filter');
    await click('.session-workspace-dialog[data-kind] [data-action="filter-active"]');
    await click('.session-workspace__results [data-action="session"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    assert.ok((await text('#desktopMessages')).includes('FIXTURE_COMPLETE'));
  });
  await checked('Invalid backup is rejected before confirmation without changing the current draft', async () => {
    const invalidPath = resolve(run, 'invalid-session-backup.json');
    await writeFile(invalidPath, '{invalid-json');
    await openDataSettings();
    const fileId = await find('[data-kind="data"] [data-action="backup-file"]');
    await command('POST', `/element/${fileId}/value`, { text: invalidPath });
    await until(async () => (await text('[data-action="data-feedback"]')).includes('原记录未修改'), 'invalid backup rejection');
    assert.equal(await inspect('return document.querySelector("[data-action=import-confirm]").disabled'), true);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    await screenshot('backup-invalid');
    await closeSettings();
  });
  await checked('Validated backup appends once while preserving the current conversation and draft', async () => {
    const backupPath = resolve(run, 'valid-session-backup.json');
    await writeFile(backupPath, JSON.stringify({ version: 1, currentSessionId: 'session-1', sessionSequence: 1, sessions: [{
      id: 'session-1', title: '原生备份追加验收', draft: '备份独立草稿', archived: true,
      messages: [{ id: 'backup-user', role: 'user', text: '原生备份唯一消息' },
        { id: 'backup-answer', role: 'assistant', text: '已保留的历史内容', status: 'streaming', sourceUserId: 'backup-user',
          review: { state: 'pending', kind: 'local-demo-change', sessionId: 'session-1', runId: 1 } }],
    }] }));
    await openDataSettings();
    const fileId = await find('[data-kind="data"] [data-action="backup-file"]');
    await command('POST', `/element/${fileId}/value`, { text: backupPath });
    await until(() => inspect('return !document.querySelector("[data-action=import-confirm]").disabled'), 'validated backup can be confirmed');
    assert.match(await text('.session-workspace__import-preview'), /1 个会话 · 2 条消息/);
    await screenshot('backup-import-preview');
    await click('[data-kind="data"] [data-action="import-confirm"]');
    await until(async () => (await text('[data-action="data-feedback"]')).includes('已追加导入并保存 1 个会话'), 'backup transaction committed');
    await until(() => inspect('return document.activeElement === document.querySelector("[data-kind=data] [data-action=backup]")'), 'completed import restores focus after component enablement');
    assert.equal(await inspect('return document.querySelector("[data-action=import-confirm]").disabled'), true, 'completed import cannot accidentally be submitted again');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    assert.equal((await text('#session-title')).trim(), '原生验收：设置与历史');
    await screenshot('backup-import-saved');
    await closeSettings();
  });
  await checked('Data management fits a narrow native window and returns focus to its entry', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 });
    await openNavigation();
    await openDataSettings();
    const bounds = await inspect('const d=document.querySelector("#desktop-preferences"),r=d.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth>d.clientWidth};');
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height && !bounds.overflow);
    assert.equal(await inspect('const panel=document.querySelector(".session-workspace-data-panel"); return panel.scrollWidth<=panel.clientWidth+1;'), true, 'embedded backup controls do not overflow horizontally');
    const closeLabel = await inspect('const button=document.querySelector("#preferences-content-dismiss"), r=button.getBoundingClientRect(); return {label:button.getAttribute("aria-label"),width:r.width,height:r.height,visible:r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth};');
    assert.equal(closeLabel.label, '关闭设置'); assert.ok(closeLabel.width >= 32 && closeLabel.height >= 32); assert.equal(closeLabel.visible, true);
    await screenshot('backup-data-narrow');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.activeElement.id === "desktop-preferences-open"'), 'data dialog dismisses and restores entry focus');
    await command('POST', '/window/rect', { width: 1000, height: 720 });
  });
  await screenshot('conversation-1000x720');
  await command('POST', '/window/rect', { width: 1280, height: 850 });
  await screenshot('conversation-1280x850');
  await checked('Resizing with a history dialog retains a visible sidebar return target', async () => {
    await click('.session-workspace [data-action="history"]');
    await command('POST', '/window/rect', { width: 390, height: 844 });
    assert.equal(await inspect('return document.querySelector("#desktop-navigation").open'), true);
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector(".session-workspace-dialog[data-kind]")'), 'resized history closes');
    assert.equal(await inspect('return document.activeElement.dataset.action'), 'history');
    assert.equal(await inspect('return document.activeElement.checkVisibility()'), true);
    await screenshot('navigation-focus-after-resize');
    await press('\uE00C');
    await command('POST', '/window/rect', { width: 1280, height: 850 });
  });
  await checked('Narrow native layout and model settings remain usable with keyboard dismissal', async () => {
    await command('POST', '/window/rect', { width: 390, height: 844 });
    assert.equal(await inspect('return document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true);
    await screenshot('conversation-narrow');
    await openNavigation();
    await click('.session-workspace [data-action="history"]');
    const historyBounds = await inspect('const d=document.querySelector(".session-workspace-dialog[data-kind]"),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth>d.clientWidth};');
    assert.ok(historyBounds.left >= 0 && historyBounds.right <= historyBounds.width && historyBounds.top >= 0 && historyBounds.bottom <= historyBounds.height && !historyBounds.overflow);
    await screenshot('history-narrow');
    await press('\uE00C');
    await until(() => inspect('return !document.querySelector(".session-workspace-dialog[data-kind]")'), 'narrow history closes');
    await click('#desktopComposer .agent-composer__model');
    await until(() => inspect('const p = document.querySelector("#desktop-model-picker"); const r = p.getBoundingClientRect(); return p.matches(":popover-open") && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;'), 'narrow anchored picker fits viewport');
    await screenshot('model-picker-narrow');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] });
    assert.equal(await inspect('return document.activeElement.matches("#desktopComposer .agent-composer__model")'), true, 'picker Escape returns focus to its composer anchor');
    await openNavigation();
    await openModelSettings();
    await until(() => inspect('return !document.querySelector("#desktop-provider-connect").disabled'), 'narrow dialog ready');
    const bounds = await inspect('const r = document.querySelector("#desktop-preferences").getBoundingClientRect(); return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,font:getComputedStyle(document.body).fontFamily };');
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height);
    assert.ok(await inspect('const r=document.querySelector("#preferences-content-dismiss").getBoundingClientRect(); return r.height>0 && r.height<48 && r.top>=0 && r.bottom<=innerHeight;'), 'close action remains visible and does not wrap');
    captures.push({ name: 'narrow-layout-measurements', ...bounds });
    await screenshot('model-dialog-narrow');
    await command('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] });
    await until(() => inspect('return !document.querySelector("#desktop-preferences").open && document.activeElement.id === "desktop-preferences-open"'), 'Escape restores dialog trigger focus');
    await command('POST', '/window/rect', { width: 1000, height: 720 });
  });
  await checked('Validated rejection result joins the current conversation once, preserves draft, and remains searchable', async () => {
    const count = requests.length;
    await openExplainFromMenu(); await editExplainQuery();
    await fill('#rjInput', '诱导分享'); await click('#rjBtn');
    await until(() => inspect('return document.querySelector("#rjStatus").dataset.state === "matched"'), 'result ready for handoff');
    const before = await inspect('return document.querySelectorAll("#desktopMessages .msg").length');
    await click('#rjSave');
    await until(() => inspect('return !document.querySelector("#desktop-explain").open && document.activeElement.id === "desktopInput"'), 'save closes results and returns to composer');
    assert.equal(await inspect('return document.querySelectorAll("#desktopMessages .msg").length'), before + 1);
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    assert.ok((await text('#desktopMessages')).includes('小程序拒因查询结果'));
    const reportEntryBounds = await inspect(`const article=document.querySelector('#desktopMessages .msg:last-child'), scroll=document.querySelector('#desktopScroll');
      const bounds = selector => { const r=article.querySelector(selector).getBoundingClientRect(); return { top:r.top,bottom:r.bottom }; };
      const v=scroll.getBoundingClientRect();
      return { viewport:{top:v.top,bottom:v.bottom}, heading:bounds('.msg__text h1'), copy:bounds('[aria-label="复制完整报告"]'), scrollTop:scroll.scrollTop };`);
    captures.push({ name: 'report-entry-measurements', ...reportEntryBounds });
    console.log('Report entry bounds:', JSON.stringify(reportEntryBounds));
    await until(() => inspect(`const article=document.querySelector('#desktopMessages .msg:last-child'), scroll=document.querySelector('#desktopScroll'), heading=article.querySelector('.msg__text h1'), copy=article.querySelector('[aria-label="复制完整报告"]');
      if (!heading || !copy) return false;
      const viewport=scroll.getBoundingClientRect(), h=heading.getBoundingClientRect(), c=copy.getBoundingClientRect();
      return h.top>=viewport.top-1 && h.bottom<viewport.bottom && c.top>=viewport.top-1 && c.bottom<=h.top;`), 'new report begins with visible heading and copy action');
    await screenshot('explain-report-entry');
    await click('#desktopMessages .msg:last-child [aria-label="复制完整报告"]');
    await until(() => inspect('return document.querySelector("#desktopMessages .msg:last-child [data-action=copy]").dataset.copyState === "success"'), 'top report copy');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    await openExplainFromMenu(); await click('#rjSave');
    assert.ok(await inspect('return document.querySelector("#desktop-explain").open'));
    assert.match(await text('#rjActionStatus'), /已在当前会话/);
    await click('#desktop-explain-close');
    assert.equal(await inspect('return document.querySelectorAll("#desktopMessages .msg").length'), before + 1);
    assert.equal(requests.length, count, 'handoff does not send model requests');
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', '小程序拒因查询结果');
    assert.equal(await inspect('return document.querySelectorAll(".session-workspace__results [data-action=session]").length'), 1);
    await click('.session-workspace__results [data-action="session"]');
    await until(async () => (await text('.session-workspace [data-action="save-status"]')).includes('已保存'), 'result persisted');
    await screenshot('explain-saved-conversation');
  });
  await checked('Refresh preserves active conversation, messages and draft', async () => {
    await command('POST', '/refresh', {});
    await until(() => inspect('return document.querySelector("#desktopInput")?.value === "原生重启后草稿保留"'), 'draft hydrated after refresh');
    assert.ok((await text('#desktopMessages')).includes('FIXTURE_COMPLETE'));
    assert.ok((await text('#desktopMessages')).includes('小程序拒因查询结果'));
    assert.equal((await text('.session-workspace [data-action="recent-session"][aria-current="true"]')).trim(), '原生验收：设置与历史');
  });
  await checked('Native app quit and relaunch restores messages and active draft', async () => {
    await quit(); await launch();
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
    assert.ok((await text('#desktopMessages')).includes('原生验收历史关键词'));
    assert.ok((await text('#desktopMessages')).includes('小程序拒因查询结果'));
    assert.ok((await text('#desktopMessages')).includes('FIXTURE_COMPLETE'));
    await screenshot('restored-after-relaunch');
  });
  await checked('Imported archived session survives process restart with independent content and draft', async () => {
    await click('.session-workspace [data-action="history"]');
    await click('.session-workspace-dialog[data-kind] [data-action="filter-archived"]');
    await fill('[aria-label="搜索会话"]', '原生备份唯一消息');
    assert.equal(await inspect('return document.querySelectorAll(".session-workspace__results [data-action=session]").length'), 1);
    await click('.session-workspace__results [data-action="session"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '备份独立草稿');
    assert.ok((await text('#desktopMessages')).includes('已保留的历史内容'));
    assert.equal(await inspect('return document.querySelector("#desktopSend").dataset.mode === "stop"'), false);
    await screenshot('backup-restored-after-relaunch');
    await click('.session-workspace [data-action="history"]');
    await fill('[aria-label="搜索会话"]', '原生验收：设置与历史');
    await click('.session-workspace__results [data-action="session"]');
    assert.equal(await inspect('return document.querySelector("#desktopInput").value'), '原生重启后草稿保留');
  });
  await checked('Reconnection after process restart enables another real transport request', async () => {
    await connectedModel(); await closeSettings(); const count = requests.length;
    await send('重启后重新连接验收');
    await until(() => requests.length > count && requests.at(-1).completed, 'post restart response'); await finished();
  });
  }
} catch (error) {
  checks.push({ name: 'E2E run', passed: false, error: error.stack });
  if (session) {
    try { await screenshot('failure', { settle: false }); } catch { /* preserve original error */ }
    try { await writeFile(resolve(run, 'failure.html'), await command('GET', '/source')); } catch { /* preserve original error */ }
  }
  console.error(error); process.exitCode = 1;
} finally {
  try { await quit(); } catch (error) { checks.push({ name: 'Session cleanup', passed: false, error: error.message }); process.exitCode = 1; }
  try { await sourceFixture?.restore(); } catch (error) { checks.push({ name: 'Source fixture restoration', passed: false, error: error.message }); process.exitCode = 1; }
  driver?.kill(); driverLog?.end();
  if (fixture) { fixture.closeAllConnections(); fixture.close(); }
  if (customFixture) { customFixture.closeAllConnections(); customFixture.close(); }
  await mkdir(run, { recursive: true });
  await writeFile(resolve(run, 'results.json'), JSON.stringify({ application, binarySha256, releaseSmoke, allBatchesMode, restoreMode, providerAgentMode, builtinProvidersMode, builtinProvidersAcceptance: builtinProvidersMode ? { expectedIdentifier, fixture: "Actual Windows WebView2, native IPC, broker, connection, selection, cancellation and retry over synthetic DeepSeek/GLM/Kimi upstreams with isolated fake credentials; not real provider account or billing verification." } : null, repairMode, repairAcceptance: (allBatchesMode || repairMode) ? { expectedIdentifier, projectDatabase, fixture: "Actual Windows WebView2, approved single-file native write, backup, recheck, undo, restart and imported-source refusal over labelled temporary projects. No invoke mocks, model or user source writes. Exclusive recoverable write, not atomic replacement or power-loss proof." } : null, projectRestoreAcceptance: (allBatchesMode || restoreMode) ? { expectedIdentifier, projectDatabase, fixture: "Actual native SQLite, backup preview, append restore, archive and restart in Windows WebView2; labelled local files, no invoke mocks or OS picker. Imported records remain unverified." } : null, providerAgentAcceptance: (allBatchesMode || providerAgentMode) ? { expectedIdentifier, projectDatabase, fixture: "Actual official SDKs, private broker, Rust tools and WebView2; synthetic Anthropic/Google protocol streams with fake isolated credentials. No external accounts, real inference or OS folder picker." } : null, projectsMode, workflowMode, connectionsMode, agentMode, handoffMode, healthMode, memoryMode, maintenanceMode, sourcesMode, notificationsMode, readingMode, presentationMode, maintenanceFrontendErrors, sourceFrontendErrors, notificationFrontendErrors, readingFrontendErrors, presentationFrontendErrors, presentationAcceptance: presentationMode ? { expectedIdentifier, projectDatabase, fixture: "Real native SQLite, workflow projection and WebView2 over a labelled temporary project; home navigation, explicit manual confirmations, local appearance settings, refresh/restart and reversible DOM text stress. No invoke mocks, credentials, model calls, external URLs, OS notification submissions or installed-release claim." } : null, readingAcceptance: readingMode ? { expectedIdentifier, projectDatabase, fixture: "Real native SQLite and bundled check/guide/explain over a labelled temporary project; native report reader, history, original Markdown, clipboard, handoff, restart and presentation overrides. No invoke mocks, external links, model calls or overall WCAG conformance claim." } : null, systemNotificationAcceptance: notificationsMode ? { expectedIdentifier, projectDatabase, fixture: "Actual official Tauri notification plugin, native SQLite preferences, real watcher/scanner and WebView2. Submitted means plugin accepted only; no OS-visible toast, installation identity or permission-prompt verification. No OS policy changes, registration or model requests." } : null, sourceFreshnessAcceptance: sourcesMode ? { expectedIdentifier, projectDatabase, fixture: "Actual Rust, SQLite, isolated Node checkSource core and native WebView2; labelled HTTPS request/DNS adapters in disposable runtime only. No public-network, model inference, OS browser or installed-release acceptance claim." } : null, maintenanceAcceptance: maintenanceMode ? { expectedIdentifier, projectDatabase, fixture: "Actual SQLite, Node fs.watch, bundled scanner and preferences in native WebView2. Labelled source edits and isolated CLI timing-only wrappers; real report comparisons and app-local notices. No model requests or OS notification permission, installed identity or visible delivery claim. Suppression checks use documented bounded observation windows." } : null, memoryAcceptance: memoryMode ? { expectedIdentifier, projectDatabase, fixture: "Real native SQLite and WebView2 UI over labelled projects; explicit-memory CRUD, restart, scope denial, live-reference resolution and actual desktop transport to synthetic local Ollama responses. No external model or account, no OS picker." } : null, healthAcceptance: healthMode ? { expectedIdentifier, projectDatabase, fixture: "Real bundled preflight and native SQLite over labelled temporary projects; UI refresh, historical report, rename/subject changes, directory relocation, failures, stop and restart. Fault fixtures modify only the disposable runtime copy and restore it. No OS picker, external account or model calls." } : null, handoffAcceptance: handoffMode ? { expectedIdentifier, projectDatabase, fixture: "Real bundled preflight over labelled temporary project; native JSON/Markdown downloads and WebDriver file input. No OS picker, external account or model calls." } : null, agentAcceptance: agentMode ? { expectedIdentifier, projectDatabase, fixture: "Synthetic OpenAI Responses via actual AI SDK; actual native tools and isolated project DB; no external model or user credentials" } : null, connectionsAcceptance: connectionsMode ? { expectedIdentifier, projectDatabase, credentialNamespace: `${expectedIdentifier}/model-connections/v1/openrouter`, fixture: "Only fake OpenRouter credentials and synthetic protocol responses; actual Windows vault/native bridge/UI. Report attached via UI; file read boundaries through actual IPC, OS file picker not exercised." } : null, workflowAcceptance: workflowMode ? { expectedIdentifier, projectDatabase, fixtureSetup: "Labelled v1 SQLite migration fixture before app launch in fresh acceptance identifier only; real IPC and DOM for all subsequent operations", boundaries: "Native WebView2 only; no production data, invoke mocks or external model calls" } : null, projectAcceptance: projectsMode ? { expectedIdentifier, projectDatabase, fixtureSetup: 'Two labelled directories and project records created via actual typed native IPC; relocation also via IPC. Native OS folder picker not exercised.', interaction: 'DOM clicks for form save, association, export, history, run and stop; observed native select option set with change event; no invoke mocks.', boundaries: 'Native WebView2 only; not a browser preview or clean Windows installation acceptance.' } : null, processExitChecks, foreignOriginNavigation: releaseSmoke ? 'Controlled native WebView localhost document; see named denial check' : 'Not exercised in this mode', isolation: { enabled: isolated, directory: isolatedDirectory ?? null, runtimeSource: releaseSmoke ? 'Actual installed release; no installation writes' : isolated ? 'Copied exe and runtime under Unicode temp directory; no source checkout resolution' : 'Build output', childPath: (isolated || releaseSmoke) ? 'SystemRoot/System32 and SystemRoot only; NODE_PATH empty' : 'Inherited', toolFixtures: builtinProvidersMode ? 'No runtime source mutation; isolated synthetic DeepSeek/GLM/Kimi protocols redirected by child-only test preload; no external credentials or paid requests' : presentationMode ? 'No runtime mutation; labelled project files only, actual SQLite and workflow, reversible DOM-only text size and spacing stress' : readingMode ? 'No runtime mutation; labelled project files only, actual bundled tool results, reversible DOM-only text size and spacing stress overrides' : notificationsMode ? 'No runtime mutation or notification mocks; labelled project files through actual watcher/scanner and official Windows plugin' : sourcesMode ? 'Source CLI wrapper injects labelled HTTPS/DNS adapters into actual checkSource core; timing and malformed-output faults only in disposable runtime, restored after quit; repository rules and archives unchanged' : maintenanceMode ? 'Timing-only guide/check wrapper limited to disposable runtime copy and restored in finally; original scanner output, labelled project writes and temporary root relocation' : memoryMode ? 'No runtime source mutation; labelled temporary project files and session import only; synthetic local Ollama responses via child-only network preload' : healthMode ? 'Malformed output and cancellation affect only isolated runtime copy and are restored in finally; labelled project directory temporarily relocated and restored' : handoffMode ? 'No runtime mutation; labelled temporary project files only' : isolated ? 'Slow CLI and missing CLI affect only isolated copy and are restored in finally; model protocol fixtures remain separately labelled' : 'None', childExitCheck: releaseSmoke || maintenanceMode || sourcesMode || notificationsMode || readingMode || presentationMode ? 'Exact installed runtime node.exe path; CIM query before/after quit; see processExitChecks' : 'Not separately measured by this harness' }, fixture: builtinProvidersMode ? 'Actual native WebView2, Rust IPC, credential broker and text transport with deterministic DeepSeek/GLM/Kimi protocol fixtures; GLM presets are configured but unverified, no undocumented model discovery endpoint' : presentationMode ? 'Actual SQLite and Windows WebView2; labelled temporary project, explicit UI facts and confirmations, real preferences; no model, external browser or installed-release claim' : readingMode ? 'Actual SQLite, bundled tools and Windows WebView2 report reading; labelled temporary project, no model, OS browser or screenshot-based whole-product conformance claim' : notificationsMode ? 'Actual native settings and official notification submission with real local maintenance; submitted/failed outcomes recorded separately from unverified OS-visible delivery' : sourcesMode ? 'Deterministic HTTPS response adapters through actual source-check core, native Rust validation/SQLite and WebView2 UI; public network checked separately and not claimed here' : maintenanceMode ? 'Actual SQLite, watcher and bundled scanner over labelled temporary projects; app-local notices, real preference UI, restart and scoped shutdown; no model or OS notification delivery' : memoryMode ? 'Labelled temporary projects; actual native SQLite, memory UI, restart and transport; deterministic local Ollama response, not external model inference or OS picker' : healthMode ? 'Labelled temporary projects; actual SQLite, bundled preflight, native maintenance UI and restart; isolated runtime failure/stop injection; no model requests or OS picker' : handoffMode ? 'Labelled temporary project; actual native SQLite, bundled preflight and WebView2 downloads; no model requests or OS picker' : workflowMode ? 'Explicit v1 migration fixture and temporary source files; actual SQLite migration, native IPC, workflow UI and structured bundled tools; malformed tool output limited to isolated runtime copy' : projectsMode ? 'Labelled temporary project directories; actual native SQLite, IPC and bundled guide CLI; isolated slow/missing CLI fault injection restored in finally; no model requests' : releaseSmoke ? 'None: installed release guide, rule lookup and provider catalog; no model requests, preloads or installation mutations' : realModel ? 'None: real installed local Ollama llama3.2:3b; no network preload, paid API or model download' : 'Deterministic Ollama and OpenRouter OAuth protocol fixtures via child-only Node fetch preload; real native IPC, broker and provider parsing; no external account authorization or real LLM', checks, captures, requests }, null, 2));
  console.log(`Evidence: ${run}`);
}
