import type { ProjectSnapshot } from './projects';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import './context.css';
import './project-health.css';

const attemptLabels = { running: '预检执行中', succeeded: '预检已完成', failed: '最近预检失败', canceled: '最近预检已取消', interrupted: '最近预检意外中断' };
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });

/** A saved execution is evidence about that execution, never a current file-health claim. */
export function deriveProjectHealth(snapshot: ProjectSnapshot | null) {
  const project = snapshot?.projects.find(item => item.id === snapshot.activeProjectId) ?? null;
  // Native insertion order is authoritative, including equal timestamps.
  const attempt = project ? snapshot!.runs.find(item => item.projectId === project.id && item.kind === 'check') ?? null : null;
  const report = project ? snapshot!.artifacts.find(item => item.projectId === project.id && item.kind === 'check') ?? null : null;
  const reasons: string[] = [];
  if (report) {
    if (report.contextRevision == null || project?.contextRevision == null) reasons.push('旧记录无法核对项目事实版本，请重新预检。');
    else if (report.contextRevision !== project.contextRevision) reasons.push('项目事实已变化，包括目录、主体或业务信息，请重新预检。');
    if (!snapshot?.rulesVersion) reasons.push('当前规则版本不可用，无法核对报告依据。');
    else if (report.rulesVersion !== snapshot.rulesVersion) reasons.push('规则资料已变化，请使用当前规则重新预检。');
  }
  const label = !snapshot ? '项目记录尚未就绪' : !project ? '选择一个项目开始'
    : !project.directoryAvailable ? '项目目录不可用'
    : attempt && attempt.state !== 'succeeded' ? attemptLabels[attempt.state]
    : reasons.length ? '待重新预检' : report ? '保存的预检记录' : '尚未预检';
  const description = !snapshot ? '请刷新记录，或进入项目设置重新加载。已有数据不会被清除。' : !project ? '选择或创建项目后，可查看预检记录与需要重新检查的原因。'
    : !project.directoryAvailable ? '重新定位项目目录后再检查。已保存的报告仍可查看。'
    : report ? '以下是上次执行的快照，未检查当前文件。需要确认最新情况时，请重新预检。'
    : attempt ? '未找到可读取的成功报告。可查看运行历史，或重新预检。'
    : '运行一次本地只读预检，检查代码与配置，并将结果保存在此设备。';
  return { project, attempt, report, reasons, label, description, canCheck: Boolean(project?.directoryAvailable && attempt?.state !== 'running') };
}

type Options = {
  getSnapshot(): ProjectSnapshot | null; isBusy(): boolean; reload(): Promise<boolean>;
  onCheck(): void; onReport(id: string): Promise<boolean>; onRevealReport?(): void; onManage(): void;
  onSources?(): void; onHistory?(): void;
  maintenance?: HTMLElement;
  returnFocus?(): HTMLElement | null;
};

export function mountProjectHealth(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const element = document.createElement(tag); element.textContent = text; return element;
  };
  const button = (id: string, label: string, appearance: 'plain' | 'outlined' | 'accent' = 'plain') => {
    const control = createActionButton(document, label, { appearance }); control.id = id; return control;
  };
  const dialog = node('dialog'); dialog.id = 'desktop-health'; dialog.className = 'context-dialog health-dialog';
  dialog.setAttribute('aria-labelledby', 'health-title'); dialog.setAttribute('aria-describedby', 'health-description');
  const header = node('header'); header.className = 'context-header';
  const title = node('h2', '项目维护'); title.id = 'health-title';
  const dismiss = button('health-dismiss', ''); dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭项目维护'); dismiss.append(createIcon(document, 'x'));
  header.append(title, dismiss);
  const body = node('div'); body.className = 'context-body';
  const projectName = node('p'); projectName.id = 'health-project-name'; projectName.className = 'health-eyebrow';
  const summary = node('h3'); summary.id = 'health-summary';
  const description = node('p'); description.id = 'health-description';
  const content = node('div'); content.id = 'health-content';
  const status = node('p'); status.id = 'health-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const actions = node('div'); actions.className = 'health-actions';
  const check = button('health-check', '重新预检', 'accent');
  const report = button('health-report', '查看上次成功报告', 'outlined');
  const manage = button('health-project', '项目设置');
  const history = options.onHistory ? button('health-history', '运行历史') : null;
  actions.append(check, report, manage); if (history) actions.append(history);
  if (options.onSources) {
    const sources = button('health-sources', '规则来源');
    sources.addEventListener('click', () => { dialog.close(); options.onSources?.(); });
    actions.append(sources);
  }
  const footer = node('footer'); footer.className = 'health-footer';
  const reload = button('health-refresh', '刷新记录'); const refreshIcon = createIcon(document, 'rotate-ccw'); refreshIcon.setAttribute('slot', 'start'); reload.append(refreshIcon);
  const done = button('health-done', '完成'); footer.append(reload, done);
  body.append(projectName, summary, description, content, actions, status);
  if (options.maintenance) body.append(options.maintenance);
  dialog.append(header, body, footer); document.body.append(dialog);
  let loading = false, disposed = false, epoch = 0, trigger: HTMLElement | null = null;
  function refresh() {
    if (disposed) return;
    const state = deriveProjectHealth(options.getSnapshot()), blocked = loading || options.isBusy();
    projectName.textContent = state.project?.name ?? '本机工作区'; summary.textContent = state.label; description.textContent = state.description;
    content.textContent = '';
    if (state.project) {
      const list = node('dl'); list.className = 'health-records';
      const row = (title: string, text: string) => { const item = node('div'); item.append(node('dt', title), node('dd', text)); list.append(item); };
      row('最近尝试', state.attempt ? `${attemptLabels[state.attempt.state]} · ${date(state.attempt.startedAt)}` : '尚无预检记录');
      row('成功报告', state.report ? `${date(state.report.createdAt)} · 工具 ${state.report.toolVersion}` : '尚无成功报告');
      row('检查依据', state.reasons.length ? state.reasons.join(' ') : state.report ? '项目事实与规则版本一致；文件内容变化尚未检查。' : '预检后保存当时使用的项目事实与规则版本。');
      const evidence = node('details'); evidence.className = 'health-evidence';
      evidence.append(node('summary', '最近记录与检查依据'), list); content.append(evidence);
      if (state.reasons.length) {
        const reason = node('p', state.reasons.join(' ')); reason.className = 'health-basis-warning'; content.append(reason);
      }
      if (state.attempt?.error) {
        const error = node('p', state.attempt.error); error.className = 'health-error'; error.dataset.state = state.attempt.state; content.append(error);
      }
      const location = node('details'); location.className = 'health-location';
      location.append(node('summary', state.project.directoryAvailable ? '项目目录 · 已定位' : '项目目录 · 不可用'), node('p', state.project.directory)); content.append(location);
    }
    const note = node('p', '预检只读取项目代码与配置，不运行项目脚本，也不调用模型。文件监听需在下方主动开启；规则来源状态可单独查看，不代表政策已重新核验。'); note.className = 'health-note'; content.append(note);
    check.disabled = blocked || !state.canCheck; check.textContent = state.report ? '重新预检' : '运行首次预检';
    report.disabled = blocked || !state.report; manage.disabled = blocked; reload.disabled = blocked; if (history) history.disabled = blocked;
    dialog.setAttribute('aria-busy', String(loading));
  }
  function message(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); }
  async function read() {
    if (disposed || loading || options.isBusy() || !dialog.open) return;
    const token = ++epoch; loading = true; message('正在读取本机记录…'); refresh();
    try {
      const ok = await options.reload();
      if (disposed || token !== epoch || !dialog.open) return;
      message(ok ? '已刷新本机记录；未检查当前文件或在线来源。' : '未能刷新记录，已保留上次读取的内容。请重试或在项目管理中重新加载。', !ok);
    } catch { if (!disposed && token === epoch && dialog.open) message('未能刷新记录，已保留上次读取的内容。请重试。', true); }
    finally { if (!disposed && token === epoch) { loading = false; refresh(); } }
  }
  check.addEventListener('click', () => {
    if (loading || options.isBusy() || !deriveProjectHealth(options.getSnapshot()).canCheck) return;
    dialog.close(); options.onCheck();
  });
  report.addEventListener('click', async () => {
    const state = deriveProjectHealth(options.getSnapshot());
    if (loading || options.isBusy() || !state.report) return;
    const token = ++epoch; loading = true; message('正在打开保存的报告…'); refresh();
    try {
      const ok = await options.onReport(state.report.id);
      if (disposed || token !== epoch || !dialog.open) return;
      if (!ok || state.project?.id !== options.getSnapshot()?.activeProjectId) throw new Error('Report unavailable');
      dialog.close(); options.onRevealReport?.();
    } catch { if (!disposed && token === epoch && dialog.open) message('报告未能打开。原始记录仍保留，请重试或查看运行历史。', true); }
    finally { if (!disposed && token === epoch) { loading = false; refresh(); } }
  });
  manage.addEventListener('click', () => { if (!loading && !options.isBusy()) { dialog.close(); options.onManage(); } });
  history?.addEventListener('click', () => { if (!loading && !options.isBusy()) { dialog.close(); options.onHistory?.(); } });
  reload.addEventListener('click', () => { void read(); });
  dismiss.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    epoch++; loading = false; trigger?.setAttribute('aria-expanded', 'false');
    const visible = trigger?.isConnected && !trigger.hidden && (!trigger.getClientRects || trigger.getClientRects().length > 0);
    if (!disposed) (visible ? trigger : options.returnFocus?.())?.focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  return {
    open(anchor: HTMLElement) {
      if (disposed || dialog.open) return;
      if (options.maintenance) body.append(options.maintenance);
      trigger = anchor; message(options.isBusy() ? '任务执行中，显示上次读取的记录。完成后可刷新。' : ''); refresh();
      dialog.showModal(); anchor.setAttribute('aria-expanded', 'true'); dismiss.focus(); void read();
    },
    refresh,
    restoreMaintenance() { if (!disposed && options.maintenance) body.append(options.maintenance); },
    close() { if (dialog.open) dialog.close(); },
    destroy() { disposed = true; epoch++; dialog.remove(); },
  };
}
