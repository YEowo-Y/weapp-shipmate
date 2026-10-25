import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { mountProjectBackup } from './project-backup';

export type ProjectFacts = { businessType: string; hasPayment: boolean | null; collectsSensitive: boolean | null; hasServerDomain: boolean | null };
export type Project = { id: string; name: string; directory: string; subject: string; revision: number; createdAt: number; updatedAt: number; directoryAvailable: boolean; facts?: ProjectFacts; contextRevision?: number };
export type Run = { id: string; projectId: string | null; kind: 'check' | 'guide' | 'explain'; state: 'running' | 'succeeded' | 'failed' | 'canceled' | 'interrupted'; startedAt: number; finishedAt: number | null; error: string | null; projectRevision: number | null; contextRevision?: number | null; toolVersion: string; rulesVersion: string; inputSummary: string; provenance?: 'imported'; sourceState?: string };
export type Artifact = { id: string; runId: string; projectId: string | null; kind: 'check' | 'guide' | 'explain'; title: string; markdown: string; data?: { schemaVersion: 1; kind: 'check' | 'guide' | 'explain'; result: unknown; scope: unknown } | null; createdAt: number; projectRevision: number | null; contextRevision?: number | null; toolVersion: string; rulesVersion: string; inputSummary: string; provenance?: 'imported' };
export type ProjectSnapshot = { rulesVersion?: string | null; projects: Project[]; activeProjectId: string | null; runs: Run[]; artifacts: Omit<Artifact, 'markdown' | 'data'>[] };
type Options = { onRegistry(ids: string[]): void | Promise<void>; beforeSelect(id: string | null): Promise<boolean>; onChange(project: Project | null): void; onSnapshot?(snapshot: ProjectSnapshot): void; onArtifact(artifact: Artifact, reveal?: boolean): void; isBusy(): boolean; associateSession(id: string | null): Promise<boolean>; onPending?(value: boolean): void };
const stateLabels = { running: '执行中', succeeded: '已完成', failed: '失败', canceled: '已取消', interrupted: '意外中断' };
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });

/** Project metadata lives in native storage; conversation content remains in its existing workspace. */
export function mountProjects(options: Options) {
  const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
  const selector = el<HTMLSelectElement>('desktop-project-select');
  const dialog = el<HTMLDialogElement>('desktop-projects');
  const editor = el<HTMLFormElement>('project-form');
  const name = el<HTMLInputElement>('project-name');
  const directory = el<HTMLInputElement>('project-directory');
  const subject = el<HTMLSelectElement>('project-subject');
  const target = el<HTMLSelectElement>('project-association-target');
  const status = el<HTMLElement>('project-status');
  const sidebarStatus = el<HTMLElement>('desktop-project-status');
  const history = el<HTMLElement>('project-history');
  let snapshot: ProjectSnapshot = { projects: [], activeProjectId: null, runs: [], artifacts: [] };
  let ready = false, pending = false, externalBusy = false, destroyed = false, pendingLatestRestore = false;
  let editing: Project | null = null, opener: HTMLElement | null = null;
  let backup: ReturnType<typeof mountProjectBackup> | undefined;
  const listeners: (() => void)[] = [];
  const downloads = new Map<string, ReturnType<typeof setTimeout>>();
  function listen(node: HTMLElement, event: string, handler: EventListener) {
    node.addEventListener(event, handler); listeners.push(() => node.removeEventListener(event, handler));
  }
  const active = () => snapshot.projects.find(project => project.id === snapshot.activeProjectId) ?? null;
  const blocked = () => pending || externalBusy || options.isBusy() || !ready || destroyed;
  function message(text: string, error = false) {
    status.textContent = text; status.dataset.tone = error ? 'error' : 'neutral';
    sidebarStatus.textContent = error || !ready ? text : '';
  }
  function controls() {
    const disabled = blocked();
    selector.disabled = disabled;
    for (const id of ['project-new', 'project-choose-directory', 'project-save', 'project-associate', 'project-association-target', 'project-name', 'project-directory', 'project-subject']) {
      (el(id) as HTMLButtonElement).disabled = disabled;
    }
    el<HTMLButtonElement>('project-export').disabled = disabled || !active();
    el<HTMLButtonElement>('project-compare').disabled = disabled || !active() || snapshot.artifacts.filter(a => a.projectId === snapshot.activeProjectId && a.kind === 'check' && a.provenance !== 'imported').length < 2;
    for (const id of ['project-compare-before', 'project-compare-after']) el<HTMLSelectElement>(id).disabled = disabled;
    el<HTMLButtonElement>('project-retry').disabled = pending || externalBusy || options.isBusy();
    for (const button of history.querySelectorAll<HTMLButtonElement>('button')) button.disabled = disabled;
    dialog.setAttribute('aria-busy', String(pending));
    backup?.sync();
  }
  async function operation(action: () => Promise<void>, allowUnready = false) {
    if (pending || externalBusy || options.isBusy() || destroyed || (!ready && !allowUnready)) return false;
    pending = true; options.onPending?.(true); controls();
    try { await action(); return !destroyed; }
    catch (error) { if (!destroyed) message(String(error instanceof Error ? error.message : error), true); return false; }
    finally { pending = false; options.onPending?.(false); if (!destroyed) controls(); }
  }
  function populateSelect(select: HTMLSelectElement, selected: string | null) {
    select.textContent = '';
    const all = document.createElement('option'); all.value = ''; all.textContent = '未归属项目'; select.append(all);
    for (const project of snapshot.projects) { const option = document.createElement('option'); option.value = project.id; option.textContent = project.name; select.append(option); }
    select.value = selected ?? '';
  }
  function fill(project: Project | null) {
    editing = project; name.value = project?.name ?? ''; directory.value = project?.directory ?? ''; subject.value = project?.subject ?? 'personal';
    el('project-editor-title').textContent = project ? '项目设置' : '新建项目';
    directoryNote(project);
  }
  function directoryNote(project: Project | null) {
    el('project-directory-note').textContent = project && !project.directoryAvailable ? '原目录不可用，请选择新的位置。历史报告会保留。' : '仅保存目录位置；检查时读取本机文件。';
  }
  function render(preserveEditor = false) {
    populateSelect(selector, snapshot.activeProjectId); populateSelect(target, snapshot.activeProjectId);
    if (preserveEditor) directoryNote(editing ? active() : null);
    else fill(active());
    history.textContent = '';
    const rows = snapshot.runs.filter(run => run.projectId === snapshot.activeProjectId);
    el('project-history-title').textContent = active() ? `${active()!.name} · 运行与成果` : '未归属项目 · 运行与成果';
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'desktop-field-hint'; empty.textContent = '暂无已保存结果。运行预检或生成清单后，成果会自动保存在此处。'; history.append(empty); }
    for (const run of rows) {
      const row = document.createElement('li'); row.className = 'project-run';
      const heading = document.createElement('strong'); heading.textContent = `${({ check: '项目预检', guide: '上线清单', explain: '拒因反查' })[run.kind]} · ${run.provenance === 'imported' ? '导入历史 · 未在本机核验' : stateLabels[run.state]}`;
      const time = document.createElement('time'); time.dateTime = new Date(run.startedAt).toISOString(); time.textContent = date(run.startedAt);
      row.append(heading, time);
      if (run.provenance === 'imported' && run.sourceState) { const source = document.createElement('p'); source.textContent = `备份记录状态：${stateLabels[run.sourceState as keyof typeof stateLabels] ?? '未知'}。此状态不代表已在本机重新执行。`; row.append(source); }
      if (run.error) { const error = document.createElement('p'); error.textContent = run.error; error.className = 'project-run-error'; row.append(error); }
      const artifact = snapshot.artifacts.find(item => item.runId === run.id);
      if (artifact) {
        const details = document.createElement('details'); details.className = 'project-run-basis';
        const summary = document.createElement('summary'); summary.textContent = artifact.provenance === 'imported' ? '查看备份中的原始依据' : '查看执行依据';
        const input = document.createElement('p'); input.textContent = artifact.inputSummary;
        const version = document.createElement('p'); version.textContent = `工具 ${artifact.toolVersion} · 项目修订 ${artifact.projectRevision ?? '未归属'}`;
        const rules = document.createElement('p');
        try {
          const entries = Object.entries(JSON.parse(artifact.rulesVersion) as Record<string, string>);
          rules.textContent = `${entries.length} 个规则文件 · ${entries.slice(0, 3).map(([path, hash]) => `${path}: ${String(hash).slice(0, 12)}`).join('；')}。完整摘要包含在项目导出中。`;
        } catch { rules.textContent = '规则摘要格式不可读取；可导出原始记录核对。'; }
        details.append(summary, input, version, rules); row.append(details);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'desktop-action'; button.textContent = '查看保存的报告';
        button.addEventListener('click', () => { void operation(async () => { await showArtifact(artifact.id, true); }); }); row.append(button);
      }
      history.append(row);
    }
    for (const id of ['project-compare-before', 'project-compare-after']) {
      const select = el<HTMLSelectElement>(id); select.textContent = '';
      // Native snapshots use descending insertion order, including equal timestamps.
      const reports = snapshot.artifacts.filter(a => a.projectId === snapshot.activeProjectId && a.kind === 'check' && a.provenance !== 'imported').reverse();
      for (const [index, report] of reports.entries()) { const option = document.createElement('option'); option.value = report.id; option.textContent = `报告 ${index + 1} · ${date(report.createdAt)} · ${report.title}`; select.append(option); }
      if (reports.length) select.value = reports[id.endsWith('before') ? Math.max(0, reports.length - 2) : reports.length - 1].id;
    }
    el('project-comparison').textContent = '选择同一项目的两份预检。只有检查范围与依据一致时才可比较；旧版纯文本报告无法比较。';
    controls();
    options.onSnapshot?.(snapshot);
  }
  async function showArtifact(id: string, reveal = false) {
    const artifact = await invoke<Artifact>('project_artifact', { artifactId: id });
    if (!destroyed && artifact.projectId === snapshot.activeProjectId) {
      if (reveal) dialog.close();
      options.onArtifact(artifact, reveal);
    }
  }
  async function showLatest() {
    const latest = snapshot.artifacts.filter(item => item.projectId === snapshot.activeProjectId && item.provenance !== 'imported').sort((a, b) => b.createdAt - a.createdAt)[0];
    pendingLatestRestore = true;
    if (latest) await showArtifact(latest.id);
    pendingLatestRestore = false;
  }
  async function select(id: string | null, associate = false) {
    const old = snapshot.activeProjectId;
    await invoke('project_select', { projectId: id });
    try {
      if (!await (associate ? options.associateSession(id) : options.beforeSelect(id))) throw new Error('会话尚未保存，项目未切换。请重试。');
    } catch (error) {
      try { await invoke('project_select', { projectId: old }); }
      catch { ready = false; throw new Error('项目切换未完成，且回退失败。请点击重新加载以同步状态。'); }
      selector.value = old ?? ''; throw error;
    }
    if (destroyed) return;
    snapshot.activeProjectId = id; render(); options.onChange(active()); await showLatest();
  }
  async function load() {
    const next = await invoke<ProjectSnapshot>('project_snapshot');
    if (destroyed) return;
    const registryChanged = next.projects.length !== snapshot.projects.length || next.projects.some(project => !snapshot.projects.some(previous => previous.id === project.id));
    await options.onRegistry(next.projects.map(project => project.id));
    if (destroyed) return;
    const nextActive = next.projects.find(project => project.id === next.activeProjectId);
    const changed = !ready || next.activeProjectId !== snapshot.activeProjectId || nextActive?.revision !== active()?.revision || nextActive?.directoryAvailable !== active()?.directoryAvailable;
    // Removing an inactive project can orphan saved sessions even when the current
    // project stays null. Reconcile against the trusted registry through the same CAS path.
    if ((changed || registryChanged) && !await options.beforeSelect(next.activeProjectId)) { ready = false; throw new Error('会话尚未保存或项目归属未能同步。请先处理会话保存提示，再重新加载项目。'); }
    // Run/history refreshes must not replace an open draft or reset a new-project editor.
    const preserveEditor = dialog.open && next.activeProjectId === snapshot.activeProjectId
      && nextActive?.revision === active()?.revision && nextActive?.contextRevision === active()?.contextRevision
      && (!editing || name.value !== editing.name || directory.value !== editing.directory || subject.value !== editing.subject);
    snapshot = next; ready = true; render(preserveEditor); message('');
    if (changed) options.onChange(active());
    if (changed || pendingLatestRestore) await showLatest();
    void backup?.refreshStorage();
  }
  function openEditor() {
    opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    fill(active()); name.focus();
    void backup?.refreshStorage();
  }
  listen(el('desktop-project-manage'), 'click', () => openEditor());
  listen(el('project-close'), 'click', () => dialog.close());
  listen(dialog, 'close', () => { if (!destroyed && (document.activeElement === document.body || dialog.contains(document.activeElement))) (opener?.isConnected ? opener : el('desktop-project-manage')).focus({ preventScroll: true }); });
  listen(selector, 'change', () => { const id = selector.value || null; selector.value = snapshot.activeProjectId ?? ''; void operation(() => select(id)); });
  listen(el('project-retry'), 'click', () => { void operation(load, true); });
  listen(el('project-new'), 'click', () => { if (!blocked()) { fill(null); name.focus(); } });
  listen(el('project-choose-directory'), 'click', () => { void operation(async () => { const path = await open({ directory: true, multiple: false }); if (!destroyed && typeof path === 'string') { directory.value = path; if (!name.value.trim()) name.value = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''; } }); });
  listen(editor, 'submit', event => {
    event.preventDefault();
    if (!editor.reportValidity()) return;
    void operation(async () => {
      const project = await invoke<Project>('project_save', { project: { id: editing?.id ?? crypto.randomUUID(), name: name.value.trim(), directory: directory.value, subject: subject.value, ...(editing ? { expectedRevision: editing.revision } : {}) } });
      snapshot.projects = [...snapshot.projects.filter(item => item.id !== project.id), project];
      options.onRegistry(snapshot.projects.map(item => item.id));
      render();
      await select(project.id); message('项目已保存。');
    });
  });
  listen(el('project-associate'), 'click', () => { const id = target.value || null; void operation(async () => { await select(id, true); message('当前会话的项目归属已保存。'); }); });
  listen(el('project-compare'), 'click', () => { void operation(async () => {
    const output = el('project-comparison'); output.textContent = '正在核对检查依据…';
    try {
      const result = await invoke<{ comparable: boolean; reason: string; added: {ruleId: string; title: string}[]; remaining: {ruleId: string; title: string}[]; notDetected: {ruleId: string; title: string}[] }>('project_compare', { projectId: active()!.id, beforeArtifactId: el<HTMLSelectElement>('project-compare-before').value, afterArtifactId: el<HTMLSelectElement>('project-compare-after').value });
      if (destroyed) return;
      output.textContent = '';
      if (!result.comparable) { output.textContent = `无法比较：${result.reason}`; return; }
      for (const [title, items] of [['新增', result.added], ['仍存在', result.remaining], ['未再检出', result.notDetected]] as const) {
        const section = document.createElement('section'); const heading = document.createElement('h4'); heading.textContent = `${title} · ${items.length}`; section.append(heading);
        const list = document.createElement('ul');
        for (const item of items) { const row = document.createElement('li'); row.textContent = `${item.title}（${item.ruleId}）`; list.append(row); }
        if (!items.length) { const empty = document.createElement('p'); empty.textContent = '无'; section.append(empty); }
        section.append(list); output.append(section);
      }
      const note = document.createElement('p'); note.textContent = '“未再检出”仅表示此次扫描未命中，不代表问题已修复或官方审核通过。'; output.append(note);
    } catch (error) { output.textContent = '比较未完成。请重试，原始报告仍保留。'; throw error; }
  }); });
  listen(el('project-export'), 'click' , () => { void operation(async () => {
    const id = snapshot.activeProjectId; if (!id) return;
    const text = await invoke<string>('project_export', { projectId: id });
    if (destroyed) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `shipmate-project-${Date.now()}.json`; link.hidden = true;
    try { document.body.append(link); link.click(); message('已请求保存项目数据；会话和密钥不包含在此文件中。'); }
    finally { link.remove(); downloads.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 30000)); }
  }); });
  backup = mountProjectBackup({ getProject: active, isBusy: blocked, operation, refresh: load,
    async archive(projectId, token) {
      if (snapshot.activeProjectId !== projectId) throw Error('当前项目已改变，请重新准备归档。');
      // Existing selection saves the outgoing draft before a project can be removed.
      try { await select(null); return await invoke<{ backupPath: string }>('project_archive_commit', { projectId, token }); }
      catch (error) {
        try { if (snapshot.activeProjectId !== projectId) await select(projectId); }
        catch { ready = false; throw Error('归档结果或项目选择暂时无法确认。请重新加载项目数据，并核对归档恢复文件。'); }
        throw error;
      }
    },
  });
  const controller = {
    ready: operation(load, true), getSnapshot: () => ready && !destroyed ? snapshot : null, getActive: active, getRulesVersion: () => snapshot.rulesVersion ?? null, getActiveId: () => snapshot.activeProjectId, isReady: () => ready && !destroyed,
    refresh: () => operation(load, true),
    openArtifact: (id: string) => operation(async () => {
      if (!snapshot.artifacts.some(item => item.id === id && item.projectId === snapshot.activeProjectId)) throw new Error('报告不属于当前项目，请从运行历史重新选择。');
      await showArtifact(id);
    }),
    openManager: openEditor,
    async pickFolder() { if (!blocked()) openEditor(); },
    async saveSubject(value: string) {
      let saved = false;
      await operation(async () => {
        const project = active(); if (!project) { saved = true; return; }
        const updated = await invoke<Project>('project_save', { project: { id: project.id, name: project.name, directory: project.directory, subject: value, expectedRevision: project.revision } });
        snapshot.projects = snapshot.projects.map(item => item.id === updated.id ? updated : item); render(); options.onChange(updated); saved = true;
      }); return saved;
    },
    setBusy(value: boolean) { externalBusy = value; controls(); },
    destroy() { destroyed = true; backup?.destroy(); listeners.forEach(remove => remove()); for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.clear(); if (dialog.open) dialog.close(); },
  };
  return controller;
}
