import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { renderMessageText } from '../desktop/design-previews/components/message-markdown.js';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Desktop dependencies are optional for CLI users. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Run npm install in desktop to test the desktop entrypoint' }, fn);

function harness({ open = async () => null, invoke = async () => 'report', writeText = async () => {}, sessions = null, bridgeAvailable = true, tools = { open() {} }, explain = { open() {} }, navigation = false, workspaceClose = () => true, projectReady = true, rulesVersion = '{}' } = {}) {
  if (sessions && !sessions.isTemporary) sessions.isTemporary = () => false;
  const nodes = new Map(), scheduled = [];
  const previewDocument = createPreviewDocument();
  const document = { activeElement: null, querySelector: selector => nodes.get(selector), querySelectorAll: () => [],
    createElement(tag) {
      const element = previewDocument.createElement(tag); element.listeners = {};
      element.addEventListener = (name, listener) => { element.listeners[name] = listener; };
      element.click = () => element.listeners.click?.(); return element;
    },
  };
  for (const id of ['stop-tool', 'pick-btn', 'check-btn', 'guide-btn', 'subject', 'status', 'dir', 'report', 'report-title', 'report-note', 'copy-report', 'copy-status', 'handoff-report', 'read-report', 'repair-report', 'desktop-repair-history', 'save-report', 'start-check', 'start-guide', 'start-explain', 'home-report', 'home-report-summary', 'desktop-menu-report', 'home-project-name', 'home-project-summary', 'home-project-manage', 'desktop-preferences-open', 'home-sources', 'sessionHost']) {
    nodes.set(`#${id}`, Object.assign(id === 'report' ? createPreviewDocument().createElement('div') : {}, {
      disabled: id === 'check-btn', value: 'personal', textContent: '', className: '',
      scrollTop: 0, scrollLeft: 0, attributes: {}, listeners: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      focus() { document.activeElement = this; },
      getClientRects() { return [{}]; },
    }));
  }
  const media = { matches: false, listener: null, addEventListener(_event, listener) { this.listener = listener; }, removeEventListener() {} };
  const navControl = {};
  if (navigation) nodes.set('#desktop-navigation', { open: false, contains: node => node === navControl, addEventListener() {} });
  const source = readFileSync(new URL('../desktop/src/main.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  let project = null, sessionOptions, projectOptions, maintenanceOptions, healthOptions, notificationOptions, preferencesOptions, readerOptions, repairOptions;
  const integration = { selects: 0, refreshes: 0, healthClosed: 0, maintenanceRestores: 0, sourceOpens: 0, readerOpens: [], readerCloses: 0, repairOpens: [], repairSyncs: 0, projectOpens: 0, preferenceOpens: [], preferenceSections: [], preferenceCloses: 0, settingsCalls: [], shortcuts: null };
  const panel = name => ({ element: document.createElement('section'), open() { integration.settingsCalls.push(`${name}Open`); }, close() { integration.settingsCalls.push(`${name}Close`); }, canClose: () => true });
  const maintenance = { element: document.createElement('section'), select: async () => { integration.selects++; }, refresh: async () => {}, canClose: () => true, destroy() {} };
  const projects = {
    ready: Promise.resolve(), isReady: () => projectReady, getActive: () => project, getActiveId: () => project?.id ?? null, getRulesVersion: () => rulesVersion,
    settings: panel('project'), backupSettings: panel('backup'), getSnapshot: () => ({ projects: project ? [project] : [] }),
    refresh: async () => { integration.refreshes++; return true; }, setBusy() {}, openManager: () => { integration.projectOpens++; },
    async pickFolder() {
      projectOptions.onPending(true);
      try {
        const picked = await open();
        if (picked) {
          project = { id: picked, directory: picked, directoryAvailable: true, subject: 'personal', revision: 1 };
          projectOptions.onChange(project);
        }
      } catch (error) { nodes.get('#status').textContent = String(error); }
      finally { projectOptions.onPending(false); }
    },
    async saveSubject(subject) { if (project) { project = { ...project, subject, revision: project.revision + 1 }; projectOptions.onChange(project); } return true; },
  };
  const nativeInvoke = async (cmd, args) => {
    const result = await invoke(cmd, args);
    if (cmd !== 'project_run' || typeof result !== 'string') return result;
    return { id: args.runId, runId: args.runId, projectId: args.projectId, kind: args.kind, title: args.kind === 'check' ? '代码预检' : '流程导航', markdown: result, createdAt: Date.now(), projectRevision: project?.revision ?? null, toolVersion: 'test', rulesVersion: '{}', inputSummary: '本地测试' };
  };
  if (!explain.reset) explain.reset = () => {};
  vm.runInNewContext(script, { mountWorkspacePages: () => ({ close: workspaceClose, open: () => true, destroy() {} }), bindApplicationShortcuts: options => { integration.shortcuts = options; return () => {}; }, crypto: { randomUUID: () => 'test-run-' + (++harness.runSequence) }, document, open, getVersion: async () => 'desktop-test', corePackage: { version: 'core-test' }, openUrl() {}, mountSystemNotifications: options => { notificationOptions = options; return { element: null, open() {}, close() {}, destroy() {} }; }, mountScrollFades: () => () => {}, invoke: nativeInvoke, renderMessageText, mountProjects: options => { projectOptions = options; return projects; }, createProjectExplain: () => ({ query() {} }), mountProjectMaintenance: options => { maintenanceOptions = options; return maintenance; }, mountPreferences: options => { preferencesOptions = options; return { open(anchor, section) { integration.preferenceOpens.push(anchor); integration.preferenceSections.push(section); }, close() { integration.preferenceCloses++; }, destroy() {} }; }, mountSourceFreshness: () => ({ open() { integration.sourceOpens++; }, close() {}, destroy() {} }), mountProjectHealth: options => { healthOptions = options; return ({ open() {}, close() { integration.healthClosed++; }, restoreMaintenance() { integration.maintenanceRestores++; }, refresh() {}, destroy() {} }); }, mountReportReader: options => { readerOptions = options; return { open(anchor) { integration.readerOpens.push({ anchor, artifact: options.getArtifact() }); }, close() { integration.readerCloses++; }, destroy() {} }; }, mountProjectRepair: options => { repairOptions = options; return { openForArtifact(artifact, anchor) { integration.repairOpens.push({ artifact, anchor }); }, openHistory() {}, sync() { integration.repairSyncs++; }, destroy() {} }; }, mountRepairHandoff: () => ({ open() {}, refresh() {}, destroy() {} }), mountWorkflow: () => ({ refresh() {}, setBusy() {}, destroy() {}, open() {} }), mountExplainDialog: () => explain, mountToolsPanel: () => tools, mountDesktopSessions: async options => { sessionOptions = options; return sessions; }, navigator: { clipboard: { writeText } }, window: { setTimeout: callback => { scheduled.push(callback); return scheduled.length; }, __TAURI_INTERNALS__: bridgeAvailable ? { invoke } : undefined, matchMedia: () => media, addEventListener: (event, ready) => { if (event === "DOMContentLoaded") ready(); } } });
  return { flushTimers() { for (const callback of scheduled.splice(0)) callback(); }, selectProject(value) { project = value; projectOptions.onChange(value); }, integration, panels: { projects: projects.settings, backup: projects.backupSettings, maintenance }, repairOptions: () => repairOptions, readerOptions: () => readerOptions, sessionOptions: () => sessionOptions, notificationOptions: () => notificationOptions, healthOptions: () => healthOptions, maintenanceOptions: () => maintenanceOptions, preferencesOptions: () => preferencesOptions, node: id => nodes.get(`#${id}`), click: id => nodes.get(`#${id}`).listeners.click(), document, navControl, projectOptions: () => projectOptions, setModal(value, sidebar = true) { const selector = sidebar ? ".session-workspace-dialog[data-kind]:modal, #desktop-model-dialog:modal" : "dialog:modal"; if (value) nodes.set(selector, value); else nodes.delete(selector); }, resizeNavigation(narrow) { media.matches = narrow; media.listener(); } };
}

desktopTest('desktop selection enables checks and passes the selected directory and subject', async () => {
  let request;
  const app = harness({ open: async () => 'C:/project', invoke: async (cmd, args) => { request = { cmd, ...args }; return 'checked'; } });
  await app.click('pick-btn');
  assert.equal(app.node('check-btn').disabled, false);
  app.node('subject').value = 'enterprise';
  await app.click('check-btn');
  assert.match(request.runId, /^[A-Za-z0-9_-]{1,80}$/);
  assert.deepEqual({ ...request, runId: undefined }, { cmd: 'project_run', projectId: 'C:/project', kind: 'check', subject: 'enterprise', runId: undefined });
  assert.equal(app.node('report').textContent, 'checked');
});

desktopTest('desktop guide remains usable without selecting a folder and renders output as text', async () => {
  const app = harness({ invoke: async () => '<script>untrusted output</script>' });
  await app.click('guide-btn');
  assert.equal(app.node('report').textContent, '<script>untrusted output</script>');
  assert.equal(app.node('check-btn').disabled, true);
});

desktopTest('repair entry passes the successful check and recheck returns a fresh matching artifact', async () => {
  const app = harness({ open: async () => 'C:/project', invoke: async () => 'check result' });
  assert.equal(app.node('repair-report').disabled, true);
  await app.click('pick-btn');
  await app.click('check-btn');
  assert.equal(app.node('repair-report').disabled, false);
  await app.click('repair-report');
  const first = app.integration.repairOpens[0];
  assert.equal(first.artifact.projectId, 'C:/project');
  assert.equal(first.artifact.kind, 'check');
  assert.equal(first.anchor, app.node('repair-report'));
  const checked = await app.repairOptions().onRecheck('C:/project');
  assert.equal(checked.projectId, 'C:/project');
  assert.equal(checked.kind, 'check');
  assert.notEqual(checked.id, first.artifact.id);
  await app.readerOptions().onRepair();
  assert.equal(app.integration.repairOpens[1].artifact.id, checked.id);
  await app.click('guide-btn');
  assert.equal(app.node('repair-report').disabled, true);
});

desktopTest('repair recheck rejects failures and changed projects instead of returning an older success', async () => {
  let failed = false;
  const app = harness({ open: async () => 'C:/project', invoke: async () => {
    if (failed) throw new Error('read failed');
    return 'previous success';
  } });
  await app.click('pick-btn');
  await app.click('check-btn');
  failed = true;
  await assert.rejects(app.repairOptions().onRecheck('C:/project'), /复检未完成/);
  assert.equal(app.node('report').textContent, 'previous success');
  await assert.rejects(app.repairOptions().onRecheck('C:/other'), /当前项目已改变/);
});

desktopTest('historical reports distinguish changed and unavailable current rules without hiding content', async () => {
  for (const [rulesVersion, notice] of [['updated-rules', /规则资料已更新/], [null, /当前规则版本不可用/]]) {
    const app = harness({ rulesVersion, invoke: async () => 'retained historical result' });
    await app.click('guide-btn');
    assert.match(app.node('report-note').textContent, notice);
    assert.equal(app.node('report').textContent, 'retained historical result');
  }
});

desktopTest('workbench report entries enable only after success and invalidate with project context', async () => {
  const app = harness({ invoke: async () => 'real local report', open: async () => 'C:/new-project' });
  assert.equal(app.node('home-report').disabled, true);
  await app.click('guide-btn');
  assert.equal(app.node('home-report').disabled, false);
  assert.equal(app.node('desktop-menu-report').disabled, false);
  await app.click('pick-btn');
  assert.equal(app.node('home-report').disabled, true);
  assert.equal(app.node('desktop-menu-report').disabled, true);
  assert.match(app.node('home-report-summary').textContent, /尚未/);
});

desktopTest('report renders semantic Markdown while copy and conversation preserve the exact source', async () => {
  const source = '# 上线清单\n\n**需要核对**\n\n- 一\n- 二\n\n```text\n示例\n```';
  const copied = [], saved = [];
  const app = harness({ invoke: async () => source, writeText: async value => copied.push(value), sessions: { appendReport: value => { saved.push(value.text); return { ok: true }; } } });
  await Promise.resolve();
  await app.click('guide-btn');
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const tags = descendants(app.node('report')).map(node => node.tag);
  for (const tag of ['h1', 'strong', 'ul', 'li', 'pre', 'code']) assert.ok(tags.includes(tag), tag);
  assert.equal(tags.includes('button'), false, 'report uses its whole-report copy action');
  await app.click('copy-report');
  await app.click('save-report');
  assert.deepEqual(copied, [source]);
  assert.deepEqual(saved, [source]);
});

desktopTest('report reading opens the saved snapshot without rerunning a tool and clears on project changes', async () => {
  let runs = 0;
  const app = harness({ invoke: async () => { runs++; return '# Saved report'; }, open: async () => 'C:/another-project' });
  await app.click('read-report');
  assert.equal(app.integration.readerOpens.length, 0);
  await app.click('guide-btn');
  assert.equal(app.node('read-report').disabled, false);
  await app.click('read-report');
  await app.click('home-report');
  assert.equal(runs, 1);
  assert.equal(app.integration.readerOpens.length, 2);
  assert.equal(app.integration.readerOpens[0].anchor, app.node('read-report'));
  assert.equal(app.integration.readerOpens[1].anchor, app.node('home-report'));
  assert.equal(app.integration.readerOpens[0].artifact, app.integration.readerOpens[1].artifact);
  assert.equal(app.integration.readerOpens[0].artifact.markdown, '# Saved report');
  const closes = app.integration.readerCloses;
  await app.click('pick-btn');
  assert.ok(app.integration.readerCloses > closes);
  assert.equal(app.readerOptions().getArtifact(), null);
  assert.equal(app.node('read-report').disabled, true);
  await app.click('home-report');
  assert.equal(app.integration.readerOpens.length, 2);
});

desktopTest('desktop serializes folder selection and commands and restores controls after rejection', async () => {
  let reject;
  let calls = 0;
  const app = harness({ open: () => new Promise((_resolve, fail) => { reject = fail; }), invoke: async () => { calls++; } });
  const pending = app.click('pick-btn');
  for (const id of ['pick-btn', 'check-btn', 'guide-btn', 'subject']) assert.equal(app.node(id).disabled, true);
  await app.click('guide-btn');
  await app.click('pick-btn');
  assert.equal(calls, 0);
  reject(new Error('dialog failed'));
  await pending;
  assert.match(app.node('status').textContent, /dialog failed/);
  assert.equal(app.node('pick-btn').disabled, false);
  assert.equal(app.node('guide-btn').disabled, false);
  assert.equal(app.node('subject').disabled, false);
  assert.equal(app.node('check-btn').disabled, true);
});

desktopTest('desktop prevents competing report replacement and exposes the completed report for keyboard reading', async () => {
  let finish;
  let calls = 0;
  let picks = 0;
  const app = harness({ open: async () => { picks++; return 'C:/project'; }, invoke: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  await app.click('pick-btn');
  app.node('check-btn').focus();
  const pending = app.click('check-btn');
  await app.click('guide-btn');
  await app.click('pick-btn');
  assert.equal(calls, 1);
  assert.equal(picks, 1);
  assert.equal(app.node('report').attributes['aria-busy'], 'true');
  app.node('report').scrollTop = 100;
  finish('first report');
  await pending;
  assert.equal(app.node('report').textContent, 'first report');
  assert.equal(app.node('report').scrollTop, 0);
  assert.equal(app.document.activeElement, app.node('report'));
  assert.equal(app.node('report').attributes['aria-busy'], 'false');
  assert.equal(app.node('check-btn').disabled, false);
});

desktopTest('desktop canceled selection preserves the existing project; failures permit retries without stale reports', async () => {
  let picked = 'C:/project';
  let failed = true;
  const app = harness({ open: async () => picked, invoke: async () => { if (failed) throw new Error('command failed'); return 'retry report'; } });
  await app.click('pick-btn');
  picked = null;
  await app.click('pick-btn');
  assert.equal(app.node('dir').textContent, 'C:/project');
  assert.equal(app.node('check-btn').disabled, false);
  await app.click('check-btn');
  assert.match(app.node('status').textContent, /command failed/);
  assert.equal(app.node('report').attributes['aria-busy'], 'false');
  assert.equal(app.node('check-btn').disabled, false);
  failed = false;
  await app.click('check-btn');
  assert.equal(app.node('report').textContent, 'retry report');
  app.node('subject').listeners.change();
  assert.notEqual(app.node('report').textContent, 'retry report');
});

desktopTest('desktop report completion does not steal focus after the reader moves elsewhere', async () => {
  let finish;
  const app = harness({ invoke: () => new Promise(resolve => { finish = resolve; }) });
  const pending = app.click('guide-btn');
  app.node('dir').focus();
  finish('report');
  await pending;
  assert.equal(app.document.activeElement, app.node('dir'));
  await app.click('check-btn');
  assert.match(app.node('status').textContent, /请先选择/);
});

desktopTest('failed reruns keep the last successful result and label its original type', async () => {
  let reject;
  let calls = 0;
  const app = harness({ open: async () => 'C:/project', invoke: async () => {
    if (++calls === 1) return 'successful guide';
    return new Promise((_resolve, fail) => { reject = fail; });
  } });
  await app.click('pick-btn');
  await app.click('guide-btn');
  const pending = app.click('check-btn');
  assert.equal(app.node('report').textContent, 'successful guide');
  assert.match(app.node('report-title').textContent, /流程导航/);
  assert.match(app.node('report-note').textContent, /上次/);
  assert.match(app.node('status').textContent, /代码预检/);
  reject(new Error('failed run')); await pending;
  assert.equal(app.node('report').textContent, 'successful guide');
  assert.match(app.node('report-note').textContent, /代码预检.*失败.*上次.*流程导航/);
});

desktopTest('copy reports success only after write completion, failure can retry independently', async () => {
  let fail = true;
  const copied = [];
  const app = harness({ writeText: async text => { copied.push(text); if (fail) throw new Error('denied'); } });
  await app.click('guide-btn');
  const status = app.node('status').textContent;
  await app.click('copy-report');
  assert.match(app.node('copy-status').textContent, /复制失败/);
  assert.equal(app.node('copy-report').disabled, false);
  fail = false; await app.click('copy-report');
  assert.match(app.node('copy-status').textContent, /已复制/);
  assert.deepEqual(copied, ['report', 'report']);
  assert.equal(app.node('status').textContent, status);
});

desktopTest('context changes invalidate report and pending copy feedback', async () => {
  let finish;
  let picked = 'C:/first';
  const app = harness({ open: async () => picked, writeText: () => new Promise(resolve => { finish = resolve; }) });
  await app.click('pick-btn'); await app.click('check-btn');
  const copy = app.click('copy-report');
  picked = 'C:/second'; await app.click('pick-btn');
  assert.notEqual(app.node('report').textContent, 'report');
  assert.equal(app.node('copy-report').disabled, true);
  finish(); await copy;
  assert.equal(app.node('copy-status').textContent, '');
  await app.click('guide-btn');
  app.node('subject').value = 'enterprise'; app.node('subject').listeners.change();
  assert.notEqual(app.node('report').textContent, 'report');
  assert.equal(app.node('copy-report').disabled, true);
  assert.equal(app.node('copy-status').textContent, '');
});

desktopTest('failed first run has no copyable report and empty output is not success', async () => {
  const app = harness({ invoke: async () => '   ' });
  await app.click('guide-btn');
  assert.match(app.node('report-note').textContent, /流程导航失败.*尚无/);
  assert.match(app.node('report').textContent, /未生成报告/);
  assert.match(app.node('status').textContent, /失败/);
  assert.equal(app.node('copy-report').disabled, true);
});

desktopTest('late copy completion cannot overwrite feedback for a replacement report', async () => {
  let completeFirst;
  let writes = 0;
  let runs = 0;
  const copied = [];
  const app = harness({ invoke: async () => `report ${++runs}`, writeText: text => {
    copied.push(text);
    return ++writes === 1 ? new Promise(resolve => { completeFirst = resolve; }) : Promise.resolve();
  } });
  await app.click('guide-btn');
  const pending = app.click('copy-report');
  assert.match(app.node('copy-status').textContent, /正在复制/);
  assert.equal(app.node('copy-report').disabled, true);
  await app.click('copy-report');
  assert.equal(writes, 1);
  await app.click('guide-btn');
  assert.equal(app.node('copy-status').textContent, '');
  await app.click('copy-report');
  const feedback = app.node('copy-status').textContent;
  completeFirst(); await pending;
  assert.equal(app.node('copy-status').textContent, feedback);
  assert.deepEqual(copied, ['report 1', 'report 2']);
});


desktopTest('successful native reports require an explicit action to join the current local session', async () => {
  const reports = [];
  const app = harness({ sessions: { appendReport: report => { reports.push({ ...report }); return { ok: true }; } } });
  await Promise.resolve();
  assert.equal(app.node('save-report').disabled, true);
  await app.click('guide-btn');
  assert.equal(reports.length, 0);
  assert.equal(app.node('save-report').disabled, false);
  await app.click('save-report');
  assert.deepEqual(reports, [{ text: 'report', type: '流程导航' }]);
  assert.match(app.node('copy-status').textContent, /已加入当前会话/);
  app.node('subject').listeners.change();
  assert.equal(app.node('save-report').disabled, true);
  await app.click('save-report');
  assert.equal(reports.length, 1);
});

desktopTest('unavailable session storage never disables native report and copy workflows', async () => {
  const app = harness();
  await app.click('guide-btn');
  assert.equal(app.node('save-report').disabled, true);
  assert.equal(app.node('copy-report').disabled, false);
  await app.click('copy-report');
  assert.match(app.node('copy-status').textContent, /已复制/);
});


desktopTest('browser-only native actions explain the desktop requirement without attempting IPC', async () => {
  let calls = 0;
  const app = harness({ bridgeAvailable: false, invoke: async () => { calls++; }, open: async () => { calls++; } });
  for (const action of ['guide-btn', 'pick-btn', 'check-btn']) {
    await app.click(action);
    assert.match(app.node('status').textContent, /此操作需要在桌面应用中运行.*浏览器仍可保存会话记录/);
  }
  assert.equal(calls, 0);
  assert.equal(app.node('guide-btn').disabled, false);
});

 desktopTest('homepage tools open configuration without running commands or selecting a folder', async () => {
  const opened = []; let commands = 0; let folders = 0;
  const app = harness({ tools: { open: (...args) => opened.push(args) }, invoke: async () => { commands++; }, open: async () => { folders++; } });
  await app.click('start-check');
  await app.click('start-guide');
  assert.deepEqual(opened, [[app.node('start-check'), app.node('pick-btn')], [app.node('start-guide'), app.node('subject')]]);
  assert.equal(commands, 0);
  assert.equal(folders, 0);
});

desktopTest('responsive navigation keeps focused sidebar controls visible when narrowing', () => {
  const app = harness({ navigation: true });
  const nav = app.node('desktop-navigation');
  assert.equal(nav.open, true);
  app.document.activeElement = app.navControl;
  app.resizeNavigation(true);
  assert.equal(nav.open, true);
  assert.equal(app.document.activeElement, app.navControl);
  app.resizeNavigation(false);
  app.document.activeElement = app.node('start-check');
  app.resizeNavigation(true);
  assert.equal(nav.open, false);
});

desktopTest('responsive navigation preserves modal return targets while a portaled dialog is open', () => {
  const app = harness({ navigation: true });
  const modal = {};
  app.document.activeElement = modal;
  app.setModal(modal);
  app.resizeNavigation(true);
  assert.equal(app.node('desktop-navigation').open, true);
  app.setModal(null);
  app.document.activeElement = app.navControl;
  assert.equal(app.node('desktop-navigation').open, true, 'modal close can restore focus to a visible navigation control');
  app.resizeNavigation(true);
  assert.equal(app.node('desktop-navigation').open, true);
});

desktopTest('project tools modal does not keep unrelated navigation expanded after narrowing', () => {
  const app = harness({ navigation: true });
  const projectTools = {};
  app.document.activeElement = projectTools;
  app.setModal(projectTools, false);
  app.resizeNavigation(true);
  assert.equal(app.node('desktop-navigation').open, false);
});


harness.runSequence = 0;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

desktopTest('unavailable project persistence prevents running a tool without a durable record', async () => {
  let calls = 0;
  const app = harness({ projectReady: false, invoke: async () => { calls++; return 'report'; } });
  await app.click('guide-btn');
  assert.equal(calls, 0);
  assert.match(app.node('status').textContent, /项目.*存储/);
});

desktopTest('unavailable conversation storage does not block native project selection', async () => {
  const app = harness({ sessions: null });
  assert.equal(await app.projectOptions().beforeSelect('project-without-chat'), true);
});

desktopTest('temporary conversations do not disable independent native project tools or acquire an association', async () => {
  let selected = 0;
  const app = harness({ sessions: { isTemporary: () => true, selectProject: async () => { selected++; return false; } } });
  assert.equal(await app.projectOptions().beforeSelect('durable-project'), true);
  assert.equal(selected, 0);
});

desktopTest('report cannot be appended to a different project conversation', async () => {
  let appended = 0;
  const app = harness({ sessions: { getCurrentSession: () => ({ projectId: 'different-project' }), appendReport: () => { appended++; return { ok: true }; } } });
  await Promise.resolve();
  await app.click('guide-btn');
  await app.click('save-report');
  assert.equal(appended, 0);
  assert.match(app.node('copy-status').textContent, /项目.*不一致/);
});

desktopTest('a mismatched persisted artifact is never displayed as the current run result', async () => {
  const app = harness({ invoke: async (_cmd, args) => ({ id: 'unexpected', runId: args.runId, kind: args.kind, projectId: 'other', markdown: 'wrong report' }) });
  await app.click('guide-btn');
  assert.notEqual(app.node('report').textContent, 'wrong report');
  assert.match(app.node('status').textContent, /不匹配/);
});

desktopTest('stop only appears for a tool, never the folder picker', async () => {
  const picker = deferred();
  const app = harness({ open: () => picker.promise });
  assert.equal(app.node('stop-tool').hidden, true);
  const pending = app.click('pick-btn');
  assert.equal(app.node('stop-tool').hidden, true);
  picker.resolve(null); await pending;
});

for (const rejectRun of [false, true]) desktopTest(`canceled tool ignores late ${rejectRun ? 'rejection' : 'success'} and waits for stop acknowledgment`, async () => {
  const result = deferred(), stop = deferred(); const requests = [];
  const app = harness({ invoke: (cmd, args) => { requests.push({ cmd, ...args }); return cmd === 'run_cancel' ? stop.promise : result.promise; } });
  const running = app.click('guide-btn');
  assert.equal(app.node('stop-tool').hidden, false);
  app.node('dir').focus();
  const stopping = app.click('stop-tool');
  await app.click('stop-tool');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].runId, requests[1].runId);
  if (rejectRun) result.reject('cancelled'); else result.resolve('late report');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(app.node('guide-btn').disabled, true);
  stop.resolve(); await stopping; await running;
  assert.equal(app.node('guide-btn').disabled, false);
  assert.equal(app.node('stop-tool').hidden, true);
  assert.match(app.node('status').textContent, /已停止/);
  assert.notEqual(app.node('report').textContent, 'late report');
  assert.equal(app.node('copy-report').disabled, true);
  assert.equal(app.document.activeElement, app.node('dir'));
});

desktopTest('stop acknowledgment does not permit another run until execution settles; prior report stays distinct', async () => {
  const result = deferred(); let count = 0; const ids = [];
  const app = harness({ invoke: (cmd, args) => { if (cmd === 'run_cancel') return Promise.resolve(); ids.push(args.runId); return ++count === 2 ? result.promise : Promise.resolve(`report ${count}`); } });
  await app.click('guide-btn');
  const running = app.click('guide-btn'); await app.click('stop-tool');
  await app.click('guide-btn'); assert.equal(count, 2);
  result.resolve('stale'); await running;
  assert.equal(app.node('report').textContent, 'report 1');
  assert.match(app.node('report-note').textContent, /已停止.*上次.*并非本次/);
  await app.click('guide-btn');
  assert.equal(app.node('report').textContent, 'report 3');
  assert.equal(new Set(ids).size, 3);
});

desktopTest('stop failure retains busy state and can retry cancellation without accepting a stale result', async () => {
  const result = deferred(); let stops = 0;
  const app = harness({ invoke: cmd => cmd === 'run_cancel' ? (++stops === 1 ? Promise.reject('transport unavailable') : Promise.resolve()) : result.promise });
  const running = app.click('guide-btn'); await app.click('stop-tool');
  assert.match(app.node('status').textContent, /停止请求失败/);
  assert.equal(app.node('guide-btn').disabled, true);
  assert.equal(app.node('stop-tool').disabled, false);
  await app.click('stop-tool'); assert.equal(stops, 2);
  result.resolve('late'); await running;
  assert.match(app.node('status').textContent, /已停止/);
});


desktopTest('failed stop followed by execution completion unlocks retry without publishing its result', async () => {
  const result = deferred(); let runs = 0;
  const app = harness({ invoke: cmd => cmd === 'run_cancel' ? Promise.reject('stop failed') : (++runs === 1 ? result.promise : Promise.resolve('retry report')) });
  const running = app.click('guide-btn'); await app.click('stop-tool');
  result.resolve('discarded'); await running;
  assert.match(app.node('status').textContent, /停止请求未成功.*结果已丢弃/);
  assert.equal(app.node('guide-btn').disabled, false);
  assert.equal(app.node('copy-report').disabled, true);
  await app.click('guide-btn');
  assert.equal(app.node('report').textContent, 'retry report');
});


desktopTest('maintenance results refresh saved records without replacing the report or moving focus', async () => {
  const opens = [];
  const app = harness({ tools: { open: (...args) => opens.push(args) } });
  await Promise.resolve();
  assert.equal(app.integration.selects, 1, 'initial registry readiness synchronizes the watcher');
  await app.click('guide-btn');
  app.node('dir').focus();
  const report = app.node('report').textContent;
  const before = app.integration.refreshes;
  await app.maintenanceOptions().onResult();
  assert.equal(app.integration.refreshes, before + 1);
  assert.equal(app.node('report').textContent, report);
  assert.equal(app.document.activeElement, app.node('dir'));
  assert.equal(opens.length, 0);
  app.projectOptions().onSnapshot();
  assert.equal(app.integration.selects, 2, 'a registry update lets the controller detect project changes');
  const reveal = app.maintenanceOptions().onRevealReport(() => true);
  assert.equal(app.integration.healthClosed, 1); assert.equal(opens.length, 0);
  app.flushTimers(); await reveal; assert.equal(app.integration.preferenceCloses, 1);
  assert.equal(opens.length, 1, 'opening a saved notice is the explicit report action');
});

desktopTest('settings reuse the existing model and data panels and combine data lifecycles with project backup', async () => {
  const calls = [], histories = [], doc = createPreviewDocument();
  const model = { element: doc.createElement('section'), open() {}, close() {}, canClose: () => true };
  const data = { element: doc.createElement('section'), open() { calls.push('open'); }, close() { calls.push('close'); }, canClose: () => true };
  const app = harness({ sessions: { getModelSettingsPanel: () => model, getDataSettingsPanel: () => data, openHistory: (anchor, filter) => histories.push({ anchor, filter }) } });
  const options = app.preferencesOptions();
  assert.equal(await options.getPanel('models'), model);
  const combined = await options.getPanel('data'); assert.equal(await options.getPanel('data'), combined);
  assert.equal(combined.element.children[0].id, 'settings-session-data'); assert.equal(combined.element.children[0].children[0], data.element);
  assert.equal(combined.element.children[1].id, 'settings-project-backup'); assert.equal(combined.element.children[1].children[0], app.panels.backup.element);
  combined.open(); assert.deepEqual(calls, ['open']); assert.deepEqual(app.integration.settingsCalls, ['backupOpen']);
  assert.equal(combined.canClose(), true); data.canClose = () => false; assert.equal(combined.canClose(), false);
  data.canClose = () => true; app.panels.backup.canClose = () => false; assert.equal(combined.canClose(), false);
  combined.close(); assert.deepEqual(calls, ['open', 'close']); assert.deepEqual(app.integration.settingsCalls, ['backupOpen', 'backupClose']);
  const archiveSection = combined.element.children[2]; assert.equal(archiveSection.id, 'settings-session-archives');
  const archives = archiveSection.children[1].children[0].children[1]; archives.click(); options.onArchives(app.node('dir'));
  assert.deepEqual(histories, [], 'neither archive entry may interrupt a pending project backup');
  app.panels.backup.canClose = () => true;
  archives.click(); assert.equal(histories[0].anchor, archives); assert.equal(histories[0].filter, 'archived');
  options.onArchives(app.node('dir')); assert.equal(histories[1].anchor, app.node('dir')); assert.equal(histories[1].filter, 'archived');
  assert.equal(app.integration.projectOpens, 0); assert.equal(app.integration.sourceOpens, 0);
});

desktopTest('project settings combine the existing project editor and maintenance with both exit guards', async () => {
  const app = harness(); const combined = await app.preferencesOptions().getPanel('projects');
  const openProject = app.panels.projects.open;
  app.panels.projects.open = () => {
    assert.equal(app.panels.projects.element.parentNode, combined.element, 'mount the project controls before their controller resolves DOM IDs');
    assert.equal(app.panels.maintenance.element.parentNode, combined.element, 'mount both panels before activating the project controller');
    openProject();
  };
  const selects = app.integration.selects; await combined.open();
  assert.equal(combined.element.children[0], app.panels.projects.element); assert.equal(combined.element.children[1], app.panels.maintenance.element);
  assert.equal(app.integration.selects, selects + 1); assert.deepEqual(app.integration.settingsCalls, ['projectOpen']);
  assert.equal(combined.canClose(), true); app.panels.projects.canClose = () => false; assert.equal(combined.canClose(), false);
  app.panels.projects.canClose = () => true; app.panels.maintenance.canClose = () => false; assert.equal(combined.canClose(), false);
  combined.close(); assert.deepEqual(app.integration.settingsCalls, ['projectOpen', 'projectClose']); assert.equal(app.integration.maintenanceRestores, 1);
  app.projectOptions().onOpenData(); assert.equal(app.integration.preferenceSections.at(-1), 'data');
});

desktopTest('settings privacy and versions resolve their current owners without running tools', async () => {
  let revoked = 0, runs = 0;
  const state = { allowRead: true, shareResults: false, busy: false, projectId: 'p1' };
  const app = harness({ sessions: { getPrivacy: () => state, revokePermissions: () => { revoked++; } }, invoke: async () => { runs++; }, rulesVersion: 'rules-test' });
  app.selectProject({ id: 'p1', name: 'Named project', directory: 'C:/project', directoryAvailable: true, subject: 'personal' });
  assert.deepEqual({ ...await app.preferencesOptions().getPrivacy() }, { ...state, projectName: 'Named project' });
  await app.preferencesOptions().revokePermissions(); assert.equal(revoked, 1);
  assert.deepEqual({ ...await app.preferencesOptions().getVersions() }, { desktop: 'desktop-test', core: 'core-test', rules: 'rules-test' }); assert.equal(runs, 0);
});

desktopTest('unavailable sessions report settings load failures without fabricating model or data panels', async () => {
  const app = harness();
  for (const section of ['models', 'data']) await assert.rejects(app.preferencesOptions().getPanel(section), /会话初始化失败/);
  await assert.rejects(app.preferencesOptions().getPrivacy(), /会话不可用/); await assert.rejects(app.preferencesOptions().revokePermissions(), /会话不可用/);
});

desktopTest('preferences route uses the single source-status dialog without starting a check', () => {
  const app = harness();
  app.preferencesOptions().onSources(app.node('dir'));
  assert.equal(app.integration.sourceOpens, 1);
  assert.equal(app.integration.refreshes, 0);
});


desktopTest('home context reflects selected project and points unavailable directories to recovery without execution', async () => {
  const opened = []; let executions = 0;
  const app = harness({ tools: { open: (...args) => opened.push(args) }, invoke: async () => { executions++; } });
  app.selectProject(null);
  assert.match(app.node('home-project-name').textContent, /未选择项目/);
  assert.match(app.node('home-project-summary').textContent, /清单/);
  app.selectProject({ id: 'p1', name: '<Project & test>', directory: 'C:/project', directoryAvailable: true, subject: 'enterprise' });
  assert.equal(app.node('home-project-name').textContent, '<Project & test>');
  assert.match(app.node('home-project-summary').textContent, /企业/);
  await app.click('start-check');
  assert.equal(opened.at(-1)[1], app.node('check-btn'));
  app.selectProject({ id: 'p1', name: 'Project', directory: 'C:/missing', directoryAvailable: false, subject: 'enterprise' });
  assert.match(app.node('home-project-summary').textContent, /目录不可用/);
  await app.click('start-check');
  assert.equal(opened.at(-1)[1], app.node('pick-btn'));
  await app.click('home-project-manage');
  assert.equal(app.integration.projectOpens, 1);
  assert.equal(executions, 0);
});

test('desktop exposes one persistent settings entry while retaining business destinations', () => {
  const html = readFileSync(new URL('../desktop/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/id="desktop-preferences-open"/g) || []).length, 1);
  assert.match(html, /<nav class="desktop-primary-navigation" aria-labelledby="desktop-workspace-heading">\s*<h2 id="desktop-workspace-heading">工作区<\/h2>/);
  for (const id of ['desktop-model-settings', 'desktop-data-settings', 'home-models', 'home-preferences']) assert.ok(!html.includes(`id="${id}"`), `${id} must not duplicate settings`);
  for (const value of ['models', 'data', 'preferences']) assert.ok(!html.includes(`<wa-dropdown-item value="${value}"`));
  assert.match(html, /<\/details>\s*<div class="desktop-sidebar-footer">\s*<button id="desktop-preferences-open"/);
  for (const id of ['desktop-home-open', 'desktop-workflow-open', 'home-health', 'home-memory', 'home-sources', 'home-report']) assert.ok(html.includes(`id="${id}"`));
});

desktopTest('history shortcuts and sidebar navigation release the workpage through its pending guard', async () => {
  let allowed = false, closes = 0, histories = 0;
  const app = harness({ workspaceClose: () => { closes++; return allowed; }, sessions: { openHistory() { histories++; } } });
  await Promise.resolve();
  app.integration.shortcuts.search();
  assert.equal(histories, 0);
  let prevented = false, stopped = false;
  const event = { target: { closest: selector => selector.includes('[data-action="history"]') }, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } };
  app.node('sessionHost').listeners.click(event);
  assert.equal(prevented && stopped, true);
  allowed = true;
  app.integration.shortcuts.search();
  assert.equal(histories, 1);
  app.preferencesOptions().onArchives(null);
  assert.equal(histories, 2);
  assert.equal(closes, 4);
});

desktopTest('global settings and home source actions open their existing surfaces without execution', async () => {
  let executions = 0;
  const app = harness({ invoke: async () => { executions++; } });
  await app.click('desktop-preferences-open');
  assert.deepEqual(app.integration.preferenceOpens, [app.node('desktop-preferences-open')]);
  await app.click('home-sources');
  assert.equal(app.integration.sourceOpens, 1);
  assert.equal(executions, 0);
});

desktopTest('maintenance configuration opens the project settings category after closing its dialog', () => {
  const app = harness();
  app.healthOptions().onManage();
  assert.equal(app.integration.preferenceOpens.length, 0);
  app.flushTimers();
  assert.equal(app.integration.preferenceSections.at(-1), 'projects');
  assert.equal(app.integration.projectOpens, 0);
});

desktopTest('maintenance and notification links select the matching settings workspace category', () => {
  const app = harness();
  app.maintenanceOptions().onNotifications();
  assert.equal(app.integration.healthClosed, 1);
  assert.deepEqual(app.integration.preferenceSections, []);
  app.flushTimers();
  assert.deepEqual(app.integration.preferenceSections, ['notifications']);
  app.notificationOptions().onProjectSettings();
  assert.deepEqual(app.integration.preferenceSections, ['notifications', 'projects']);
  assert.equal(app.integration.projectOpens, 0);
});

desktopTest('history data navigation waits for dialog closure and opens data settings with a stable return target', () => {
  const app = harness();
  app.sessionOptions().onOpenDataSettings({ isConnected: false });
  assert.deepEqual(app.integration.preferenceSections, []);
  app.flushTimers();
  assert.deepEqual(app.integration.preferenceSections, ['data']);
  assert.equal(app.integration.preferenceOpens[0], app.node('desktop-preferences-open'));
});
