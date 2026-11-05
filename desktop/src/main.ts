import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import corePackage from '../../package.json';
import type { SettingsPanel } from './settings/types';
import { openUrl } from "@tauri-apps/plugin-opener";
import { mountProjects, type Artifact, type Project } from "./projects";
import { mountDesktopSessions } from "./sessions";
import { mountToolsPanel } from "./tools-panel";
import { mountWorkspacePages } from './workspace-pages';
import { bindApplicationShortcuts } from './application-shortcuts';
import { mountExplainDialog } from "./explain-dialog";
import { createProjectExplain } from "./project-explain";
import { mountWorkflow } from "./workflow";
import { mountRepairHandoff } from "./repair-handoff";
import { mountReportReader } from "./report-reader";
import { mountProjectRepair } from "./project-repair";
import { mountProjectHealth } from "./project-health";
import { mountProjectMaintenance } from "./maintenance";
import { mountPreferences } from "./preferences";
import { mountSourceFreshness } from "./source-freshness";
import { mountSystemNotifications } from "./system-notifications";
import { createIcon } from '../design-previews/components/icons.js';
import { renderMessageText } from '../design-previews/components/message-markdown.js';
import { bindActionMenu } from '../design-previews/components/ui-kit.js';
import { mountScrollFades } from '../design-previews/components/scroll-fade.js';
// Product polish must evaluate after every feature stylesheet imported above.
import "./product-polish.css";

let sessions: Awaited<ReturnType<typeof mountDesktopSessions>> = null;
let projects: ReturnType<typeof mountProjects> | null = null;
let workflow: ReturnType<typeof mountWorkflow> | null = null;
let explainPanel: ReturnType<typeof mountExplainDialog> | null = null;
let handoff: ReturnType<typeof mountRepairHandoff> | null = null;
let reader: ReturnType<typeof mountReportReader> | null = null;
let repair: ReturnType<typeof mountProjectRepair> | null = null;
let health: ReturnType<typeof mountProjectHealth> | null = null;
let maintenance: ReturnType<typeof mountProjectMaintenance> | null = null;
let preferences: ReturnType<typeof mountPreferences> | null = null;
let sources: ReturnType<typeof mountSourceFreshness> | null = null;
let displayedProjectId: string | null = null;
let explainProjectId: string | null | undefined;
let dir = "";
let busy = false;
type ToolRun = { id: string; canceled: boolean; settled: boolean; stopping: boolean; stopPromise: Promise<void> | null; stopFailed: boolean };
let activeRun: ToolRun | null = null;
let lastSuccessful: { text: string; type: string; projectId: string | null; artifact: Artifact } | null = null;
let copyEpoch = 0;
let copying = false;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function setStatus(msg: string, kind: "" | "busy" | "error" | "ok" = "") {
  const el = $("#status");
  el.textContent = msg;
  el.className = "status " + kind;
}

function setBusy(value: boolean) {
  busy = value;
  projects?.setBusy(value);
  workflow?.setBusy(value);
  health?.refresh();
  for (const id of ["pick-btn", "guide-btn", "subject"]) {
    $<HTMLButtonElement | HTMLSelectElement>(`#${id}`).disabled = value;
  }
  $<HTMLButtonElement>("#check-btn").disabled = value || !dir || projects?.getActive()?.directoryAvailable === false;
  updateStopControl();
  updateCopyControl();
  repair?.sync();
}

function updateStopControl() {
  const control = $<HTMLButtonElement>("#stop-tool");
  control.hidden = !activeRun;
  control.disabled = !activeRun || activeRun.stopping || activeRun.settled || (activeRun.canceled && !activeRun.stopFailed);
  control.textContent = activeRun?.canceled && !activeRun.stopFailed ? "正在停止…" : "停止执行";
}

async function stopTool() {
  const run = activeRun;
  if (!run || run.stopping || run.settled || (run.canceled && !run.stopFailed)) return;
  run.canceled = true;
  run.stopping = true;
  run.stopFailed = false;
  updateStopControl();
  setStatus("正在停止工具，等待执行结束…", "busy");
  run.stopPromise = (async () => {
    try {
      await invoke("run_cancel", { runId: run.id });
    } catch {
      run.stopFailed = true;
      setStatus("停止请求失败，仍在等待执行结束。可重试停止。", "error");
    } finally {
      run.stopping = false;
      updateStopControl();
    }
  })();
  await run.stopPromise;
}

function updateCopyControl() {
  $<HTMLButtonElement>("#copy-report").disabled = busy || copying || !lastSuccessful;
  $<HTMLButtonElement>("#save-report").disabled = busy || !lastSuccessful || !sessions;
  $<HTMLButtonElement>("#handoff-report").disabled = busy || !lastSuccessful;
  $<HTMLButtonElement>("#repair-report").disabled = busy || !lastSuccessful || lastSuccessful.artifact.kind !== 'check' || lastSuccessful.artifact.provenance === 'imported';
  $<HTMLButtonElement>("#desktop-repair-history").disabled = busy || !projects?.getActiveId();
  handoff?.refresh();
  for (const id of ["read-report", "home-report", "desktop-menu-report"]) {
    const control = $<HTMLButtonElement>(`#${id}`);
    if (control) control.disabled = busy || !lastSuccessful;
  }
  const summary = $("#home-report-summary");
  if (summary) summary.textContent = lastSuccessful
    ? `已保存的${lastSuccessful.type}报告。${busy ? "正在运行工具，暂不可打开。" : "可查看、复制或加入当前会话。"}`
    : "尚未生成报告。运行工具后，可阅读并加入当前会话。";
  const nextAction = $('#start-check-label');
  if (nextAction) nextAction.textContent = busy ? '查看执行状态' : !dir ? '配置预检' : projects?.getActive()?.directoryAvailable === false ? '重新定位项目' : lastSuccessful ? '重新预检' : '开始预检';
}

function resetCopy() {
  copyEpoch++;
  copying = false;
  $("#copy-status").textContent = "";
  $("#copy-report").textContent = "复制报告";
  updateCopyControl();
}

async function copyReport() {
  if (busy || copying || !lastSuccessful) return;
  const epoch = copyEpoch;
  const text = lastSuccessful.text;
  copying = true;
  updateCopyControl();
  $("#copy-report").textContent = "复制中…";
  $("#copy-status").textContent = "正在复制报告…";
  try {
    await navigator.clipboard.writeText(text);
    if (epoch !== copyEpoch) return;
    $("#copy-status").textContent = "已复制报告。";
  } catch {
    if (epoch !== copyEpoch) return;
    $("#copy-status").textContent = "复制失败，可重试或在报告中手动选择文本。";
  } finally {
    if (epoch === copyEpoch) {
      copying = false;
      $("#copy-report").textContent = "复制报告";
      updateCopyControl();
    }
  }
}

function resetReport() {
  lastSuccessful = null;
  reader?.close();
  resetCopy();
  $("#report-title").textContent = "执行报告";
  $("#report-note").textContent = "尚未生成报告。";
  $("#report").textContent = "报告将显示在这里。选择主体类型后，可运行代码预检或流程导航。";
}

function requireDesktopBridge() {
  const bridge = (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  if (typeof bridge?.invoke === "function") return true;
  setStatus("此操作需要在桌面应用中运行；当前浏览器仍可保存会话记录。", "error");
  return false;
}

async function pickFolder() {
  if (busy || !requireDesktopBridge()) return;
  await projects?.pickFolder();
}

function applyProject(project: Project | null) {
  if (displayedProjectId !== (project?.id ?? null)) {
    explainPanel?.reset();
    explainProjectId = undefined;
  }
  displayedProjectId = project?.id ?? null;
  dir = project?.directory || "";
  $("#dir").textContent = dir || "尚未选择项目文件夹";
  const homeName = $("#home-project-name"), homeSummary = $("#home-project-summary");
  if (homeName) homeName.textContent = project?.name || "未选择项目";
  if (homeSummary) {
    const subjects: Record<string, string> = { personal: "个人", individual_business: "个体工商户", enterprise: "企业" };
    homeSummary.textContent = project
      ? `${subjects[project.subject] ?? "待确认主体"} · ${project.directoryAvailable === false ? "目录不可用，请在项目设置中重新选择位置。历史报告仍保留。" : "项目已载入，可开始预检或继续整理上线准备。"}`
      : "选择项目后可预检代码；也可先按主体整理上线清单。";
  }
  $<HTMLSelectElement>("#subject").value = project?.subject || "personal";
  resetReport();
  setStatus(project?.directoryAvailable === false
    ? "项目目录不可用。请重新定位目录；历史报告仍可查看。"
    : project ? "项目已载入，可运行预检或查看历史成果。" : "当前为未归属工作区，可生成上线清单。", project?.directoryAvailable === false ? "error" : "");
  if (sessions?.isTemporary()) $("#status").textContent += " 当前对话为临时模式，不会关联或自动保存；项目成果仍由本机独立保存。";
  setBusy(busy);
  void workflow?.refresh();
}

function showArtifact(artifact: Artifact) {
  if (artifact.projectId !== (projects?.getActiveId() ?? null)) return;
  if (typeof artifact.markdown !== "string" || !artifact.markdown.trim()) throw new Error("执行未返回有效报告，请重试。");
  const type = artifact.kind === "check" ? "代码预检" : artifact.kind === "explain" ? "拒因反查" : "流程导航";
  lastSuccessful = { text: artifact.markdown, type, projectId: artifact.projectId, artifact };
  resetCopy();
  $("#report-title").textContent = type;
  $("#report-note").textContent = `保存于 ${new Date(artifact.createdAt).toLocaleString('zh-CN', { hour12: false })} · 工具 ${artifact.toolVersion} · 项目版本 ${artifact.projectRevision ?? "未归属"}。这是历史执行快照，未重新检查当前文件。`;
  if (artifact.provenance === 'imported') $("#report-note").textContent = `外部导入报告 · 内容与执行情况未在本机核验。${$("#report-note").textContent}`;
  const currentContext = projects?.getActive()?.contextRevision;
  if (artifact.contextRevision != null && currentContext != null && artifact.contextRevision !== currentContext)
    $("#report-note").textContent += " 项目事实已变化，请重新运行工具。";
  const currentRules = projects?.getRulesVersion();
  if (currentRules && artifact.rulesVersion !== currentRules)
    $("#report-note").textContent += " 规则资料已更新，请重新运行工具。";
  else if (!currentRules)
    $("#report-note").textContent += " 当前规则版本不可用，无法核对这份历史报告的依据。";
  const report = $("#report");
  report.textContent = "";
  renderMessageText(report, artifact.markdown, { copyCode: false });
  report.scrollTop = 0;
  report.scrollLeft = 0;
}

async function run(cmd: "run_check" | "run_guide"): Promise<Artifact | null> {
  if (busy || !requireDesktopBridge()) return null;
  if (!projects?.isReady()) {
    setStatus("项目存储尚未就绪，请在项目管理中重试加载后再运行。", "error");
    return null;
  }
  if (cmd === "run_check" && !dir) {
    setStatus("请先选择小程序项目文件夹。", "error");
    return null;
  }
  const subject = ($("#subject") as HTMLSelectElement).value;
  const projectId = projects.getActiveId();
  const kind = cmd === "run_check" ? "check" : "guide";
  const trigger = $(cmd === "run_check" ? "#check-btn" : "#guide-btn");
  const report = $("#report");
  const type = cmd === "run_check" ? "代码预检" : "流程导航";
  const currentRun: ToolRun = { id: crypto.randomUUID(), canceled: false, settled: false, stopping: false, stopPromise: null, stopFailed: false };
  activeRun = currentRun;
  resetCopy();
  setBusy(true);
  report.setAttribute("aria-busy", "true");
  setStatus(`正在运行${type}…`, "busy");
  $("#report-title").textContent = lastSuccessful?.type || type;
  $("#report-note").textContent = lastSuccessful
    ? `正在运行${type}；下方为上次成功的${lastSuccessful.type}报告。`
    : `正在运行${type}，结果将在完成后显示。`;
  if (!lastSuccessful) report.textContent = "等待执行结果…";
  let completed = false;
  try {
    const artifact = await invoke<Artifact>("project_run", { projectId, kind, subject, runId: currentRun.id });
    currentRun.settled = true;
    if (currentRun.canceled) return null;
    if (artifact?.runId !== currentRun.id || artifact.projectId !== projectId || artifact.kind !== kind
      || projectId !== projects.getActiveId()) throw new Error("返回成果与当前项目或运行不匹配，请从历史成果重新查看。");
    showArtifact(artifact);
    completed = true;
    setStatus(`${type}完成，报告已保存到本机。报告仅供参考，不构成合规担保。`, "ok");
    return artifact;
  } catch (e) {
    if (currentRun.canceled) return null;
    if (!lastSuccessful) report.textContent = "未生成报告。请检查错误提示后重试。";
    $("#report-note").textContent = lastSuccessful
      ? `本次${type}失败；下方保留上次成功的${lastSuccessful.type}报告，并非本次结果。`
      : `本次${type}失败，尚无可用报告。`;
    setStatus(`${type}失败：${String(e)}`, "error");
    return null;
  } finally {
    currentRun.settled = true;
    updateStopControl();
    // Acknowledgment alone is not execution completion; retain the lock until both settle.
    await currentRun.stopPromise;
    if (currentRun.canceled) {
      if (!lastSuccessful) report.textContent = "执行已结束，未生成报告。可重新运行。";
      $("#report-note").textContent = lastSuccessful
        ? `本次${type}已停止；下方保留上次成功的${lastSuccessful.type}报告，并非本次结果。`
        : `本次${type}已停止，尚无可用报告。`;
      setStatus(currentRun.stopFailed ? "执行已结束；停止请求未成功，本次结果已丢弃，可重新运行。" : "执行已停止，可重新运行。", currentRun.stopFailed ? "error" : "");
    }
    activeRun = null;
    report.setAttribute("aria-busy", "false");
    setBusy(false);
    await projects.refresh();
    await workflow?.refresh();
    // Do not take focus from a user who moved elsewhere while waiting.
    if (completed && (document.activeElement === trigger || document.activeElement === document.body)) {
      report.focus({ preventScroll: true });
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(node => {
    node.replaceChildren(createIcon(document, node.dataset.icon!));
  });
  // Fade only scroll edges that hide content (open-claude-ui ScrollFadeContainer).
  mountScrollFades(document.body);
  const workspace = mountWorkspacePages({ host: $('#desktop-workspace'), returnFocus: () => $('#desktop-more'), onChange(page) {
    $('.desktop-conversation').dataset.workspaceOpen = String(!!page);
    for (const [id, pageId] of [['desktop-home-open', null], ['desktop-workflow-open', 'desktop-workflow'], ['desktop-results-open', 'desktop-project-results']]) {
      const control = $(`#${id}`);
      if (page && page.id === pageId) control?.setAttribute('aria-current', 'page');
      else control?.removeAttribute('aria-current');
    }
    if (page) { tools.close(); if (navigation && compactNavigation?.matches) navigation.open = false; }
  } });
  const tools = mountToolsPanel({ beforeOpen: () => workspace.close() });
  handoff = mountRepairHandoff({ getArtifact: () => lastSuccessful?.artifact ?? null, getProject: () => projects?.getActive() ?? null, getRulesVersion: () => projects?.getRulesVersion() ?? null, isBusy: () => busy });
  repair = mountProjectRepair({
    getProjectId: () => projects?.getActiveId() ?? null,
    isBusy: () => busy,
    onRecheck: async projectId => {
      if (busy || projects?.getActiveId() !== projectId) throw new Error('当前项目已改变或正在运行，请返回原项目后重新预检。');
      const artifact = await run('run_check');
      if (!artifact || artifact.kind !== 'check' || artifact.projectId !== projectId) throw new Error('源码复检未完成。文件写入状态不受影响，可稍后重新预检。');
      return artifact;
    },
  });
  reader = mountReportReader({
    openPage: (page, trigger) => workspace.open(page, trigger),
    getArtifact: () => lastSuccessful?.artifact ?? null,
    getProject: () => projects?.getActive() ?? null,
    getRulesVersion: () => projects?.getRulesVersion() ?? null,
    onOpenSource: openUrl,
    onHandoff: () => {
      const readButton = $("#read-report");
      handoff?.open(readButton.getClientRects().length ? readButton : $("#desktop-more"), true);
    },
    onRepair: () => { if (lastSuccessful) repair?.openForArtifact(lastSuccessful.artifact, $("#read-report")); },
    returnFocus: () => $("#desktop-more"),
  });
  $("#handoff-report").addEventListener('click', () => handoff?.open($("#handoff-report"), true));
  $("#repair-report").addEventListener('click', () => { if (lastSuccessful) repair?.openForArtifact(lastSuccessful.artifact, $("#repair-report")); });
  window.addEventListener('pagehide', () => { reader?.destroy(); handoff?.destroy(); repair?.destroy(); }, { once: true });
  const nativeExplain = createProjectExplain({
    invoke, getProjectId: () => projects?.getActiveId() ?? null,
    isReady: () => Boolean(projects?.isReady()), isBusy: () => busy, setBusy,
    onArtifact: artifact => { explainProjectId = artifact.projectId; showArtifact(artifact); },
    onStopError: message => setStatus(message, 'error'),
    onSettled: async () => { await projects?.refresh(); await workflow?.refresh(); },
  });
  const explain = mountExplainDialog({ query: nativeExplain.query, saveResult: text => {
    if (busy || explainProjectId === undefined || explainProjectId !== (projects?.getActiveId() ?? null)
      || explainProjectId !== (sessions?.getCurrentSession()?.projectId ?? null)) return { ok: false, reason: 'scope' };
    return sessions?.appendReport({ text, type: '拒因反查', deduplicate: true }) ?? { ok: false, reason: 'unavailable' };
  } });
  explainPanel = explain;
  $("#start-explain").addEventListener("click", () => explain.open($("#start-explain")));
  $("#start-check").addEventListener("click", () => tools.open($("#start-check"), $(dir && !busy && projects?.getActive()?.directoryAvailable !== false ? "#check-btn" : "#pick-btn")));
  $("#start-guide").addEventListener("click", () => tools.open($("#start-guide"), $("#subject")));
  const showHome = () => {
    if (!workspace.close()) return;
    $("#session-empty").hidden = false;
    $("#session-empty").scrollIntoView({ block: "start" });
    $("#start-check").focus();
    if (compactNavigation?.matches && navigation) navigation.open = false;
  };
  const showReport = (trigger: HTMLElement) => {
    if (busy || !lastSuccessful) return;
    reader?.open(trigger);
  };
  $("#read-report")?.addEventListener("click", () => showReport($("#read-report")));
  $("#home-report")?.addEventListener("click", () => showReport($("#home-report")));
  $("#desktop-home-open")?.addEventListener("click", showHome);
  $("#home-sources")?.addEventListener("click", () => sources?.open($("#home-sources")));
  $("#home-memory")?.addEventListener("click", () => sessions?.openMemory($("#home-memory")));
  $("#home-project-manage")?.addEventListener("click", () => projects?.openManager());
  const actionMenu = $("#desktop-actions");
  if (actionMenu) bindActionMenu(actionMenu, value => {
    if (value === "home") showHome();
    if (value === "history" && workspace.close()) sessions?.openHistory($("#desktop-more"));
    if (value === "archived" && workspace.close()) sessions?.openHistory($("#desktop-more"), "archived");
    if (value === "report") showReport($("#desktop-more"));
    if (value === "handoff") handoff?.open($("#desktop-more"));
    if (value === "repairs") repair?.openHistory($("#desktop-more"));
    if (value === "health") health?.open($("#desktop-more"));
    if (value === "sources") sources?.open($("#desktop-more"));
    if (value === "memory") sessions?.openMemory($("#desktop-more"));
    if (value === "explain") explain.open($("#desktop-more"));
  });
  const navigation = $<HTMLDetailsElement>("#desktop-navigation");
  const compactNavigation = navigation ? window.matchMedia('(max-width: 640px)') : null;
  if (navigation && compactNavigation) {
    const syncNavigation = () => {
      // Keep the active control visible when a desktop sidebar becomes a drawer.
      navigation.open = !compactNavigation.matches || navigation.contains(document.activeElement)
        || (navigation.open && Boolean(document.querySelector(".session-workspace-dialog[data-kind]:modal, #desktop-model-dialog:modal")));
    };
    syncNavigation();
    compactNavigation.addEventListener('change', syncNavigation);
    window.addEventListener('pagehide', () => compactNavigation.removeEventListener('change', syncNavigation), { once: true });
  }
  navigation?.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape" && navigation.open && compactNavigation?.matches) {
      navigation.open = false;
      navigation.querySelector<HTMLElement>("summary")?.focus();
      event.preventDefault();
    }
  });
  $("#sessionHost")?.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="new"], [data-action="recent-session"]') && navigation && compactNavigation?.matches) navigation.open = false;
  });
  resetReport();
  updateStopControl();
  const sessionsReady = mountDesktopSessions({
    onOpenDataSettings: () => { window.setTimeout(() => preferences?.open($('#desktop-preferences-open'), 'data'), 0); },
    onOpenSettings: anchor => preferences?.open(anchor, 'models'),
    onOpenArtifact: artifact => { showArtifact(artifact); tools.open($("#desktop-project-manage"), $("#report")); },
    onToolResults: async () => { await projects?.refresh(); },
  }).then(value => { sessions = value; updateCopyControl(); return value; });
  const showResults = () => {
    preferences?.close();
    window.setTimeout(() => {
      if (!$<HTMLDialogElement>('#desktop-preferences')?.open) projects?.results.open($('#desktop-results-open'));
    }, 0);
  };
  $('#desktop-results-open')?.addEventListener('click', showResults);
  $('#home-results')?.addEventListener('click', showResults);
  projects = mountProjects({
    onOpenResults: showResults,
    openResultsPage: (page, trigger) => workspace.open(page, trigger, { canLeave: () => projects?.results.canClose() ?? true }),
    onOpenData: () => preferences?.open(null, 'data'),
    canChangeProject: () => (maintenance?.canClose() ?? true) && (workflow?.canClose() ?? true),
    isBusy: () => busy,
    onPending: setBusy,
    onRegistry: ids => sessionsReady.then(value => { value?.setKnownProjects(ids); }),
    beforeSelect: async projectId => {
      const workspace = await sessionsReady;
      // Native project tools remain available if the independent conversation store failed.
      return workspace && !workspace.isTemporary() ? workspace.selectProject(projectId) : true;
    },
    associateSession: async projectId => sessions ? sessions.associateCurrentSession(projectId) : false,
    onChange: applyProject,
    onSnapshot: () => { health?.refresh(); void maintenance?.select(); },
    onArtifact: (artifact, reveal) => {
      showArtifact(artifact);
      if (reveal) window.setTimeout(() => { preferences?.close(); tools.open($("#desktop-project-manage"), $("#report")); }, 0);
    },
  });
  maintenance = mountProjectMaintenance({
    onNotifications: () => { health?.close(); window.setTimeout(() => preferences?.open($('#desktop-preferences-open'), 'notifications'), 0); },
    getProjectId: () => projects?.getActiveId() ?? null,
    onResult: async () => { if (projects && !await projects.refresh()) throw new Error('项目记录未能刷新'); },
    onOpenArtifact: async id => await projects?.openArtifact(id) ?? false,
    onRevealReport: () => { health?.close(); window.setTimeout(() => { preferences?.close(); tools.open($("#desktop-more"), $("#report")); }, 0); },
    onUnread: count => {
      const control = $("#desktop-maintenance-open"), label = $("#desktop-maintenance-count");
      if (control) { control.hidden = count === 0; control.setAttribute('aria-label', `项目维护，${count} 条未读提醒`); }
      if (label) label.textContent = `${count} 条提醒`;
    },
  });
  sources = mountSourceFreshness({ invoke, onOpenSource: openUrl });
  health = mountProjectHealth({
    getSnapshot: () => projects?.getSnapshot() ?? null, isBusy: () => busy,
    reload: async () => { const ok = await projects?.refresh() ?? false; await maintenance?.refresh(); return ok; },
    onCheck: () => { tools.open($("#desktop-more"), $("#check-btn")); void run("run_check"); },
    onReport: async id => await projects?.openArtifact(id) ?? false,
    onRevealReport: () => tools.open($("#desktop-more"), $("#report")),
    onManage: () => { window.setTimeout(() => preferences?.open($('#desktop-more'), 'projects'), 0); },
    onHistory: showResults,
    onSources: () => sources?.open($("#desktop-more")),
    maintenance: maintenance.element,
    returnFocus: () => $("#desktop-more"),
  });
  void projects.ready.then(() => maintenance?.select());
  const projectSettings: SettingsPanel = {
    element: document.createElement('div'),
    async open() { this.element.append(projects!.settings.element, maintenance!.element); projects!.settings.open(); await maintenance!.select(); },
    close() { projects!.settings.close(); health!.restoreMaintenance(); },
    canClose: () => projects!.settings.canClose() && maintenance!.canClose(),
  };
  let dataSettings: SettingsPanel | null = null;
  preferences = mountPreferences({
    systemNotifications: mountSystemNotifications({ invoke, onProjectSettings: () => preferences?.open(null, 'projects') }),
    async getPanel(section) {
      if (section === 'projects') { await projects!.ready; return projectSettings; }
      const sessionWorkspace = await sessionsReady;
      if (!sessionWorkspace) throw new Error('会话初始化失败，请重新打开应用。');
      if (section === 'models') return sessionWorkspace.getModelSettingsPanel();
      await projects!.ready;
      if (!dataSettings) {
        const sessionData = sessionWorkspace.getDataSettingsPanel(), backup = projects!.backupSettings;
        const element = document.createElement('div'); element.className = 'settings-data';
        const wrap = (id: string, child: HTMLElement) => { const host = document.createElement('section'); host.id = id; host.append(child); return host; };
        const archives = document.createElement('button'); archives.id = 'settings-archives'; archives.className = 'settings-button settings-button--outline'; archives.textContent = '查看归档会话';
        archives.addEventListener('click', () => { if (dataSettings?.canClose?.() !== false && workspace.close()) sessionWorkspace.openHistory(archives, 'archived'); });
        element.append(wrap('settings-session-data', sessionData.element), wrap('settings-project-backup', backup.element), archives);
        dataSettings = { element, open() { sessionData.open(); backup.open(); }, close() { sessionData.close(); backup.close(); }, canClose: () => sessionData.canClose() && backup.canClose() };
      }
      return dataSettings;
    },
    async getPrivacy() {
      const workspace = await sessionsReady; if (!workspace) throw new Error('会话不可用');
      const state = workspace.getPrivacy();
      return { ...state, projectName: projects?.getSnapshot()?.projects.find(project => project.id === state.projectId)?.name ?? null };
    },
    async revokePermissions() { const workspace = await sessionsReady; if (!workspace) throw new Error('会话不可用'); workspace.revokePermissions(); },
    subscribePrivacy(listener) { const observer = new MutationObserver(listener); observer.observe($('#desktopComposer'), { attributes: true, subtree: true, attributeFilter: ['data-mode', 'data-model-provider', 'data-enabled'] }); return () => observer.disconnect(); },
    async getVersions() { return { desktop: await getVersion(), core: corePackage.version, rules: projects?.getRulesVersion() ?? null }; },
    onSources: anchor => sources?.open(anchor ?? $("#desktop-preferences-open")),
    onArchives: anchor => { if (dataSettings?.canClose?.() !== false && workspace.close()) sessions?.openHistory(anchor, 'archived'); },
    onRepository: () => openUrl('https://github.com/YEowo-Y/weapp-shipmate'),
  });
  const disposeShortcuts = bindApplicationShortcuts({
    newSession: () => { if (workspace.close()) sessions?.createSession(); },
    search: () => { if (workspace.close()) sessions?.openHistory($('#desktop-more')); },
    settings: () => preferences?.open($('#desktop-preferences-open')),
  });
  $('#sessionHost')?.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-action="new"], [data-action="recent-session"], [data-action="history"]') && !workspace.close()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pagehide', () => { disposeShortcuts(); workspace.destroy(); }, { once: true });
  $("#desktop-preferences-open")?.addEventListener('click', () => preferences?.open($("#desktop-preferences-open")));
  $("#desktop-maintenance-open")?.addEventListener('click', () => health?.open($("#desktop-maintenance-open")));
  $("#home-health")?.addEventListener('click', () => health?.open($("#home-health")));
  window.addEventListener('pagehide', () => { health?.destroy(); maintenance?.destroy(); preferences?.destroy(); sources?.destroy(); }, { once: true });
  workflow = mountWorkflow({ openPage: (page, trigger) => workspace.open(page, trigger, { canLeave: () => workflow?.canClose() ?? true }), getProject: () => projects?.getActive() ?? null, isBusy: () => busy, onProjectChanged: async () => { await projects?.refresh(); } });
  for (const id of ['desktop-workflow-open', 'home-workflow']) {
    $(`#${id}`)?.addEventListener('click', () => workflow?.open($(`#${id}`)));
  }
  window.addEventListener('pagehide', () => workflow?.destroy(), { once: true });
  $("#save-report").addEventListener("click", () => {
    if (busy || !lastSuccessful || !sessions) return;
    if ((sessions.getCurrentSession?.()?.projectId ?? null) !== lastSuccessful.projectId) {
      $("#copy-status").textContent = "报告与当前会话所属项目不一致，请切换到报告对应的项目后再加入。";
      return;
    }
    const result = sessions.appendReport({ text: lastSuccessful.text, type: lastSuccessful.type });
    $("#copy-status").textContent = result.ok ? "报告已加入当前会话；保存状态见会话区。" : "未能加入会话，请先完成当前操作后重试。";
  });
  $("#copy-report").addEventListener("click", copyReport);
  $("#stop-tool").addEventListener("click", stopTool);
  $("#pick-btn").addEventListener("click", pickFolder);
  $("#check-btn").addEventListener("click", () => run("run_check"));
  $("#guide-btn").addEventListener("click", () => run("run_guide"));
  $("#subject").addEventListener("change", async () => {
    if (busy) return;
    const subject = $<HTMLSelectElement>("#subject").value;
    if (projects?.getActive() && !await projects.saveSubject(subject)) {
      $<HTMLSelectElement>("#subject").value = projects.getActive()!.subject;
      return;
    }
    resetReport();
    setStatus("主体类型已更新，请重新生成报告。");
  });
});
