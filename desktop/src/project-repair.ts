import { invoke } from '@tauri-apps/api/core';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import type { Artifact } from './projects';
import './context.css';
import './project-repair.css';

type RepairPlan = { planId: string; expiresAt: number; projectId: string; file: 'app.json'; before: string; after: string; missingApis: string[]; evidence: { file: string; apis: string[] }[]; warnings: string[]; kind: 'apply' | 'undo' | 'recovery' };
type RepairResult = { operationId: string; projectId: string; createdAt: number; kind: RepairPlan['kind']; writeState: 'applied' | 'not_applied' | 'recovery_required' | 'undone'; recheckState: 'required' | 'not_required' | 'completed'; recheckArtifactId?: string; undoAvailable: boolean; recoveryAvailable: boolean; backupPath: string; message: string };
type Options = { getProjectId(): string | null; isBusy(): boolean; onRecheck(projectId: string): Promise<Artifact> };
type Source = { kind: 'apply'; artifactId: string } | { kind: 'undo' | 'recovery'; operationId: string };
const writeLabels = { applied: '已写入 app.json', not_applied: '未写入文件', recovery_required: '需要恢复文件', undone: '已恢复原文件' };
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });

/** Writes only invoke native, hash-bound plans after an explicit local approval. */
export function mountProjectRepair(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', id = '') => {
    const element = document.createElement(tag); element.textContent = text; if (id) element.id = id; return element;
  };
  const button = (label: string, id: string, appearance: 'plain' | 'outlined' | 'accent' = 'outlined') => {
    const control = createActionButton(document, label, { appearance }); control.id = id; return control;
  };
  const dialog = node('dialog', '', 'desktop-repair'); dialog.className = 'context-dialog project-repair-dialog';
  dialog.setAttribute('aria-labelledby', 'repair-title'); dialog.setAttribute('aria-describedby', 'repair-description');
  const header = node('header'); header.className = 'context-header';
  const title = node('h2', '受限修复', 'repair-title');
  const dismiss = button('', 'repair-dismiss', 'plain'); dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭受限修复'); dismiss.append(createIcon(document, 'x'));
  header.append(title, dismiss);
  const body = node('div'); body.className = 'context-body';
  const description = node('p', '只补齐原生小程序 app.json 的隐私接口声明。请先确认接口是业务确实需要的；声明不能替代用户授权或官方审核。', 'repair-description');
  const status = node('p', '', 'repair-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const preview = node('section', '', 'repair-preview'); preview.hidden = true; preview.setAttribute('aria-labelledby', 'repair-preview-title');
  const previewTitle = node('h3', '确认文件改动', 'repair-preview-title');
  const basis = node('p', '', 'repair-basis');
  const apis = node('p', '', 'repair-apis');
  const evidence = node('ul', '', 'repair-evidence'); evidence.setAttribute('aria-label', '扫描文件与接口证据');
  const warning = node('p', '', 'repair-warnings'); warning.className = 'project-repair-warning';
  const comparison = node('div'); comparison.className = 'project-repair-comparison';
  for (const [id, label] of [['repair-before', '修改前 · 完整文件'], ['repair-after', '修改后 · 完整文件']]) {
    const section = node('section'); const heading = node('h4', label, `${id}-title`);
    const code = node('pre', '', id); code.tabIndex = 0; code.setAttribute('aria-labelledby', heading.id); section.append(heading, code); comparison.append(section);
  }
  const business = node('label'); business.className = 'project-repair-business'; business.htmlFor = 'repair-business-confirm';
  const businessCheck = node('input', '', 'repair-business-confirm'); businessCheck.type = 'checkbox';
  business.append(businessCheck, node('span', '我已核对上述接口属于当前业务确实需要的能力，并确认这份 app.json 改动。'));
  preview.append(previewTitle, basis, apis, evidence, warning, comparison, business);
  const result = node('p', '', 'repair-result'); result.setAttribute('role', 'status'); result.setAttribute('aria-atomic', 'true');
  const recheckStatus = node('p', '', 'repair-recheck-status'); recheckStatus.setAttribute('role', 'status'); recheckStatus.tabIndex = -1;
  const resultNote = node('p', '写入不是原子替换：应用先保存备份，再独占写入文件。普通撤销不会覆盖后续编辑。若写入被中断，请从修复记录重新预览并确认恢复；恢复将使用备份中的完整内容。', 'repair-method-note');
  const historySection = node('section'); historySection.className = 'project-repair-history'; historySection.setAttribute('aria-labelledby', 'repair-history-title');
  const historyHeader = node('div'); historyHeader.className = 'project-repair-history-header';
  const reload = button('刷新修复记录', 'repair-history-refresh', 'plain'); historyHeader.append(node('h3', '本机修复记录', 'repair-history-title'), reload);
  const filters = node('div'); filters.className = 'project-repair-filters';
  const filterLabel = node('label', '记录状态'); filterLabel.htmlFor = 'repair-history-filter';
  const filter = node('select', '', 'repair-history-filter');
  for (const [value, label] of [['all', '全部记录'], ...Object.entries(writeLabels)]) { const option = node('option', label); option.value = value; filter.append(option); }
  const historyCount = node('span', '', 'repair-history-count'); historyCount.setAttribute('role', 'status');
  const resetFilter = button('显示全部', 'repair-history-reset', 'plain'); resetFilter.hidden = true;
  filters.append(filterLabel, filter, historyCount, resetFilter);
  const history = node('div', '', 'repair-history'); historySection.append(historyHeader, filters, history);
  body.append(description, status, preview, result, recheckStatus, resultNote, historySection);
  const footer = node('footer'); footer.className = 'project-repair-footer';
  const refreshPlan = button('重新预览', 'repair-refresh-plan', 'plain');
  const confirm = button('确认写入 app.json', 'repair-confirm', 'accent');
  const done = button('关闭', 'repair-done', 'plain'); footer.append(refreshPlan, confirm, done);
  dialog.append(header, body, footer); document.body.append(dialog);
  let disposed = false, busy = false, writing = false, epoch = 0;
  let projectId: string | null = null, plan: RepairPlan | null = null, source: Source | null = null, requestId = '';
  let opener: HTMLElement | null = null, operations: RepairResult[] = [];
  const available = () => !disposed && dialog.open && projectId !== null && projectId === options.getProjectId();
  const blocked = () => !available() || busy || options.isBusy();
  const message = (text: string, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  function sync() {
    if (disposed) return;
    if (dialog.open && projectId !== options.getProjectId()) {
      plan = null; source = null; businessCheck.checked = false;
      message('当前项目已切换，请关闭此窗口后重新打开对应项目的修复记录。', true);
    }
    const disabled = blocked(), expired = !!plan && plan.expiresAt <= Date.now();
    dismiss.disabled = done.disabled = writing;
    confirm.disabled = disabled || !plan || expired || (plan.kind === 'apply' && !businessCheck.checked);
    refreshPlan.disabled = disabled || !source;
    reload.disabled = filter.disabled = resetFilter.disabled = disabled;
    businessCheck.disabled = disabled || !plan || expired;
    dialog.setAttribute('aria-busy', String(busy));
    for (const control of history.querySelectorAll<HTMLElement>('[data-repair-action]')) (control as HTMLElement & { disabled: boolean }).disabled = disabled;
  }
  const current = (token: number) => token === epoch && available();
  function renderPlan(value: RepairPlan) {
    if (value.projectId !== projectId || value.file !== 'app.json') throw Error('修复计划与当前项目或文件不一致，请重新检查。');
    plan = value; requestId = crypto.randomUUID(); businessCheck.checked = false;
    preview.hidden = false; business.hidden = value.kind !== 'apply';
    previewTitle.textContent = value.kind === 'apply' ? '确认文件改动' : value.kind === 'recovery' ? '确认从备份恢复文件' : '确认撤销文件改动';
    confirm.textContent = value.kind === 'apply' ? '确认写入 app.json' : value.kind === 'recovery' ? '确认从备份恢复' : '确认撤销';
    basis.textContent = `app.json · 本次预览有效至 ${date(value.expiresAt)}。写入前会重新核对文件是否改变。`;
    apis.textContent = value.missingApis.length ? `本次补齐：${value.missingApis.join('、')}` : '按下方完整内容恢复文件，不合并之后的手动改动。';
    evidence.replaceChildren(...value.evidence.map(item => node('li', `${item.file}：${item.apis.join('、')}`)));
    warning.textContent = value.warnings.join(' '); warning.hidden = !warning.textContent;
    document.getElementById('repair-before')!.textContent = value.before;
    document.getElementById('repair-after')!.textContent = value.after;
    message(value.expiresAt <= Date.now() ? '方案已过期，请重新预览后再确认。' : value.kind === 'apply' ? '请阅读完整改动与接口证据，再确认业务需要。' : '请核对恢复前后内容，确认后才会修改文件。', value.expiresAt <= Date.now());
  }
  async function loadHistory(token: number) {
    const snapshot = await invoke<{ operations: RepairResult[] }>('project_repair_snapshot', { projectId });
    if (!current(token)) return;
    operations = snapshot.operations; renderHistory();
  }
  const canRecheck = (operation: RepairResult) => operation.projectId === projectId && operation.recheckState === 'required'
    && (operation.kind === 'apply' ? operation.writeState === 'applied' : operation.writeState === 'undone');
  function renderHistory() {
    history.replaceChildren();
    const visible = operations.filter(operation => filter.value === 'all' || operation.writeState === filter.value);
    historyCount.textContent = `${visible.length} / ${operations.length} 条记录`;
    resetFilter.hidden = filter.value === 'all';
    if (!operations.length) { history.append(node('p', '尚无本机修复记录。预览不会修改文件或建立成功记录。')); return; }
    if (!visible.length) { history.append(node('p', '此状态下没有修复记录。')); return; }
    for (const operation of visible) {
      const row = node('article'); row.className = 'project-repair-operation'; row.dataset.writeState = operation.writeState;
      row.append(node('h4', `${writeLabels[operation.writeState]} · ${date(operation.createdAt)}`), node('p', operation.message));
      if (operation.backupPath) row.append(node('p', `备份：${operation.backupPath}`));
      if (operation.recheckState === 'completed') row.append(node('p', '写入后的本机源码复检已完成并关联报告；这不代表官方审核通过。'));
      if (operation.recheckState === 'required') row.append(node('p', canRecheck(operation) ? '本次文件操作尚未关联复检报告。可重新复检当前源码，原修复记录与备份保留。' : '本次操作未关联复检报告，请查看后续恢复记录或项目最新预检报告。'));
      if (canRecheck(operation)) {
        const retry = button('重新复检', ''); retry.dataset.repairAction = 'recheck'; retry.dataset.operationId = operation.operationId;
        retry.addEventListener('click', () => { void retryRecheck(operation, retry); }); row.append(retry);
      }
      if (operation.projectId === projectId && (operation.undoAvailable || operation.recoveryAvailable)) {
        const kind = operation.recoveryAvailable ? 'recovery' : 'undo';
        const action = button(kind === 'recovery' ? '预览中断恢复' : '预览撤销', ''); action.dataset.repairAction = `${kind}-preview`; action.dataset.operationId = operation.operationId;
        action.addEventListener('click', () => { if (!blocked()) void prepare({ kind, operationId: operation.operationId }); }); row.append(action);
      }
      history.append(row);
    }
  }
  async function prepare(next: Source) {
    if (blocked()) return;
    const token = ++epoch; busy = true; source = next; plan = null; businessCheck.checked = false; preview.hidden = true; sync(); message('正在运行本机预检并核对文件，准备修改预览…');
    try {
      const value = await invoke<RepairPlan>(`project_repair_${next.kind === 'apply' ? 'prepare' : next.kind === 'undo' ? 'undo_prepare' : 'recovery_prepare'}`, next.kind === 'apply' ? { projectId, artifactId: next.artifactId } : { operationId: next.operationId });
      if (!current(token)) return;
      if (value.kind !== next.kind) throw Error('返回的修复操作与预览请求不一致。');
      renderPlan(value);
    } catch (error) { if (current(token)) message(`${String(error instanceof Error ? error.message : error)} 预览未修改文件。`, true); }
    finally { if (token === epoch) { busy = false; sync(); } }
  }
  async function readHistory() {
    if (blocked()) return;
    const token = ++epoch; busy = true; sync(); message('正在读取本机修复记录…');
    try { await loadHistory(token); if (current(token)) message('记录已更新。撤销或恢复都需要重新预览并确认，不会自动执行。'); }
    catch (error) { if (current(token)) message(`修复记录读取失败：${String(error instanceof Error ? error.message : error)}。可重试，原文件状态未由此次读取改变。`, true); }
    finally { if (token === epoch) { busy = false; sync(); } }
  }
  async function checkAndRecord(operation: RepairResult, token: number) {
    recheckStatus.textContent = '文件操作已完成，正在运行本机源码复检…';
    let checked = false;
    try {
      const artifact = await options.onRecheck(operation.projectId); checked = true;
      if (!current(token)) return;
      await invoke('project_repair_record_recheck', { operationId: operation.operationId, artifactId: artifact.id });
      if (current(token)) recheckStatus.textContent = '本机源码复检已完成并关联报告，请阅读新报告；这不代表官方审核通过。';
    } catch (error) {
      if (current(token)) recheckStatus.textContent = `文件操作已完成，但${checked ? '复检报告关联未完成' : '复检未完成'}：${String(error instanceof Error ? error.message : error)}。可在本条修复记录中重新复检；撤销或恢复仍需另外预览并确认。`;
    }
  }
  async function retryRecheck(operation: RepairResult, trigger: HTMLElement) {
    if (blocked() || !operations.includes(operation) || !canRecheck(operation)) return;
    const token = ++epoch;
    busy = true; plan = null; source = null; businessCheck.checked = false; preview.hidden = true;
    result.textContent = `${writeLabels[operation.writeState]}。${operation.message}`;
    sync(); message('正在复检当前源码，本次操作不会再次写入项目文件。');
    try {
      await checkAndRecord(operation, token);
      if (current(token)) {
        await loadHistory(token);
        if (current(token)) message('请核对本次复检状态与报告。');
      }
    } catch {
      if (current(token)) message('复检状态已返回，但修复记录刷新失败。请刷新修复记录核对。', true);
    } finally {
      if (token === epoch) { busy = false; sync(); }
      if (current(token) && (document.activeElement === trigger || document.activeElement === document.body)) recheckStatus.focus();
    }
  }
  async function commit() {
    if (blocked() || !plan) return;
    if (plan.expiresAt <= Date.now()) { plan = null; message('方案已过期，请重新预览后再确认。', true); sync(); return; }
    if (plan.kind === 'apply' && !businessCheck.checked) return;
    const selected = plan, selectedRequest = requestId, token = ++epoch;
    busy = writing = true; sync(); message('正在保存备份并执行已确认的文件改动…'); recheckStatus.textContent = '';
    try {
      const outcome = await invoke<RepairResult>(`project_repair_${selected.kind === 'apply' ? 'apply' : 'undo'}`, { planId: selected.planId, requestId: selectedRequest, ...(selected.kind === 'apply' ? { businessConfirmed: true } : {}) });
      plan = null; source = null; businessCheck.checked = false;
      if (!current(token)) return;
      result.textContent = `${writeLabels[outcome.writeState]}。${outcome.message}${outcome.backupPath ? ` 备份：${outcome.backupPath}` : ''}`;
      if (outcome.projectId !== projectId) throw Error('操作结果项目不一致，请刷新对应项目的修复记录核对。');
      if (outcome.recheckState === 'required' && ['applied', 'undone'].includes(outcome.writeState)) {
        await checkAndRecord(outcome, token);
      } else if (outcome.writeState === 'recovery_required') recheckStatus.textContent = '文件需要恢复。请先查看修复记录中的中断恢复预览，暂不要继续编辑此文件。';
      if (current(token)) {
        message('请核对文件操作结果与后续检查状态。');
        try { await loadHistory(token); }
        catch { if (current(token)) message('文件操作结果已返回，但修复记录刷新失败。请点击刷新修复记录，不要重复写入。', true); }
      }
    } catch (error) {
      plan = null; source = null; businessCheck.checked = false;
      if (current(token)) message(`未能确认本次文件操作结果：${String(error instanceof Error ? error.message : error)}。请刷新修复记录核对，勿重复操作或直接覆盖文件。`, true);
    } finally { if (token === epoch) { busy = writing = false; sync(); } }
  }
  function open(anchor?: HTMLElement | null) {
    if (disposed || dialog.open || writing || options.isBusy()) return false;
    opener = anchor ?? document.activeElement as HTMLElement | null; projectId = options.getProjectId();
    plan = null; source = null; preview.hidden = true; businessCheck.checked = false; result.textContent = recheckStatus.textContent = ''; operations = []; filter.value = 'all'; renderHistory(); epoch++;
    dialog.showModal(); opener?.setAttribute('aria-expanded', 'true'); dismiss.focus(); sync();
    if (!projectId) message('请先选择一个本机项目，再打开修复记录。', true);
    return true;
  }
  const close = () => { if (!writing && dialog.open) dialog.close(); };
  dismiss.addEventListener('click', close); done.addEventListener('click', close);
  reload.addEventListener('click', () => { void readHistory(); });
  filter.addEventListener('change', () => { if (!blocked()) { renderHistory(); sync(); } });
  resetFilter.addEventListener('click', () => { if (!blocked()) { filter.value = 'all'; renderHistory(); sync(); filter.focus(); } });
  refreshPlan.addEventListener('click', () => { if (source) void prepare(source); });
  confirm.addEventListener('click', () => { void commit(); }); businessCheck.addEventListener('change', sync);
  dialog.addEventListener('cancel', event => { if (writing) event.preventDefault(); });
  dialog.addEventListener('close', () => { epoch++; if (!writing) busy = false; plan = null; source = null; businessCheck.checked = false; opener?.setAttribute('aria-expanded', 'false'); if (!disposed && opener?.isConnected) opener.focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target && !target.disabled) { event.preventDefault(); target.focus(); }
  });
  sync();
  return {
    openForArtifact(artifact: Artifact, anchor?: HTMLElement | null) {
      if (!open(anchor)) return;
      if (!projectId || artifact.projectId !== projectId || artifact.kind !== 'check' || artifact.provenance === 'imported') { message('受限修复只接受当前项目的本机预检报告。导入历史或其他项目报告不能授予文件写入权限，请重新运行本机预检。', true); return; }
      void prepare({ kind: 'apply', artifactId: artifact.id });
    },
    openHistory(anchor?: HTMLElement | null) { if (open(anchor) && projectId) void readHistory(); },
    sync,
    destroy() { disposed = true; epoch++; plan = null; source = null; opener?.setAttribute('aria-expanded', 'false'); dialog.remove(); },
  };
}
