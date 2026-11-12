import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { deriveWorkflow } from '../../src/workflow.mjs';
import { createIcon } from '../design-previews/components/icons.js';
import type { Project, ProjectFacts } from './projects';
import { createWorkflowArtifact } from '../design-previews/workflow-artifact.js';
import { createArtifactDownloader } from '../design-previews/artifact-download.js';
import './workflow.css';

type Snapshot = { project: Project; catalog: unknown; rulesVersion: string; confirmations: unknown[] };
export type MissingFact = 'collectsSensitive' | 'hasServerDomain';
type Options = { openPage?(dialog: HTMLDialogElement, trigger: HTMLElement | null): boolean; getProject(): Project | null; isBusy(): boolean; onProjectChanged(): Promise<void>; onGenerateGuide?(projectId: string): Promise<void>; onReadGuide?(trigger: HTMLElement): void };
const labels: Record<string, string> = { confirmed: '人工已确认', not_applicable: '人工不适用', pending: '待确认', unknown: '事实待补充', stale: '待重检' };

/** Native storage owns facts and confirmations; the shared domain projection owns stage state. */
export function mountWorkflow(options: Options) {
  const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
  const dialog = el<HTMLDialogElement>('desktop-workflow');
  const downloader = createArtifactDownloader({ documentRef: document });
  const status = el('workflow-status');
  const content = el('workflow-content');
  let snapshot: Snapshot | null = null, pending = false, busy = false, destroyed = false, epoch = 0;
  let opener: HTMLElement | null = null;
  let reloadAfterPending = false;
  // Drafts belong to this controller session and project, never to native confirmation records.
  const drafts = new Map<string, { facts: Partial<ProjectFacts>; factsBasis?: string; notes: Map<string, string>; noteBases: Map<string, string>; expanded: Set<string>; factsOpen?: boolean }>();
  const draftFor = (projectId: string) => {
    if (!drafts.has(projectId)) drafts.set(projectId, { facts: {}, notes: new Map(), noteBases: new Map(), expanded: new Set() });
    return drafts.get(projectId)!;
  };
  const factsBasis = (basis: Snapshot) => JSON.stringify([basis.project.contextRevision, basis.project.facts?.businessType ?? '', basis.project.facts?.hasPayment ?? null, basis.project.facts?.collectsSensitive ?? null, basis.project.facts?.hasServerDomain ?? null]);
  const noteBasis = (basis: Snapshot, stageId: string) => JSON.stringify([basis.project.contextRevision, basis.rulesVersion, deriveWorkflow(basis).stages.find(stage => stage.id === stageId)?.confirmation ?? null]);
  const factsConflict = (basis: Snapshot) => { const draft = draftFor(basis.project.id); return draft.factsBasis !== undefined && draft.factsBasis !== factsBasis(basis); };
  const noteConflict = (basis: Snapshot, stageId: string) => { const original = draftFor(basis.project.id).noteBases.get(stageId); return original !== undefined && original !== noteBasis(basis, stageId); };
  const listeners: (() => void)[] = [];
  function listen(node: HTMLElement, event: string, fn: EventListener) { node.addEventListener(event, fn); listeners.push(() => node.removeEventListener(event, fn)); }
  const blocked = () => destroyed || pending || busy || options.isBusy();
  function message(text: string, error = false) { status.textContent = text; status.dataset.tone = error ? 'error' : 'neutral'; }
  function controls() {
    dialog.setAttribute('aria-busy', String(pending));
    for (const field of content.querySelectorAll<HTMLInputElement>('input,textarea,select,button,wa-button')) field.disabled = blocked() || !snapshot || snapshot.project.id !== options.getProject()?.id || field.dataset.workflowBlocked === 'true';
    el<HTMLButtonElement>('workflow-export').disabled = blocked() || !snapshot || snapshot.project.id !== options.getProject()?.id;
    const hasDraft = !!snapshot && Object.keys(draftFor(snapshot.project.id).facts).length > 0;
    el<HTMLButtonElement>('workflow-generate-guide').hidden = !options.onGenerateGuide;
    el<HTMLButtonElement>('workflow-generate-guide').disabled = blocked() || !snapshot || snapshot.project.id !== options.getProject()?.id || hasDraft;
    el('workflow-guide-note').textContent = hasDraft ? '请先保存项目事实，再更新上线清单。' : '根据已保存事实生成新清单；历史报告保留原有内容。';
    el<HTMLButtonElement>('workflow-retry').disabled = blocked();
    el<HTMLButtonElement>('workflow-save-facts').disabled = blocked() || !snapshot || snapshot.project.id !== options.getProject()?.id || factsConflict(snapshot);
  }
  const text = (tag: string, value: string, className?: string) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
  const factsConflictPanel = text('div', '', 'workflow-conflict'); factsConflictPanel.id = 'workflow-facts-conflict'; factsConflictPanel.hidden = true; factsConflictPanel.setAttribute('role', 'status');
  const factsConflictMessage = text('p', '');
  const discardFacts = text('wa-button', '放弃草稿，使用已加载事实'); discardFacts.id = 'workflow-facts-discard'; discardFacts.setAttribute('appearance', 'outlined'); discardFacts.setAttribute('size', 's'); discardFacts.setAttribute('type', 'button');
  factsConflictPanel.append(factsConflictMessage, discardFacts); el('workflow-facts-form').append(factsConflictPanel);
  listen(discardFacts, 'click', () => {
    const basis = currentBasis(); if (!basis || blocked()) return;
    const draft = draftFor(basis.project.id); draft.facts = {}; delete draft.factsBasis;
    render(); message('已放弃事实草稿，显示本次加载的已保存事实。'); el('workflow-businessType').focus();
  });
  function sourceLink(container: HTMLElement, url: string, label = '官方来源') {
    try { const target = new URL(url); if (target.protocol !== 'https:') return; } catch { return; }
    const link = document.createElement('a'); link.href = url; link.textContent = label;
    link.addEventListener('click', event => { event.preventDefault(); void openUrl(url).catch(() => message('无法打开系统浏览器，请重试。', true)); }); container.append(link);
  }
  function render() {
    if (!snapshot) return;
    const renderedBasis = snapshot;
    const { project } = snapshot;
    const draft = draftFor(project.id);
    const conflict = factsConflict(snapshot);
    factsConflictPanel.hidden = !conflict;
    if (conflict) {
      const value = (item: boolean | null | undefined) => item == null ? '尚未确认' : item ? '是' : '否';
      factsConflictMessage.textContent = `已保存事实或项目依据已变化，草稿保留但暂不能保存。当前已保存：业务「${project.facts?.businessType || '未填写'}」；涉及支付：${value(project.facts?.hasPayment)}；敏感信息：${value(project.facts?.collectsSensitive)}；服务器域名：${value(project.facts?.hasServerDomain)}。请先复制需要保留的草稿，再放弃草稿并重新核对。`;
    }
    el('workflow-title').textContent = project.name;
    el<HTMLTextAreaElement>('workflow-businessType').value = draft.facts.businessType ?? project.facts?.businessType ?? '';
    for (const key of ['hasPayment', 'collectsSensitive', 'hasServerDomain'] as const) {
      const value = Object.prototype.hasOwnProperty.call(draft.facts, key) ? draft.facts[key] : project.facts?.[key];
      el<HTMLSelectElement>(`workflow-${key}`).value = value == null ? 'unknown' : String(value);
    }
    const model = deriveWorkflow(snapshot);
    const confirmed = model.stages.filter(stage => stage.status === 'confirmed').length;
    const notApplicable = model.stages.filter(stage => stage.status === 'not_applicable').length;
    el('workflow-overview').textContent = `${model.stages.length} 个阶段 · 人工确认 ${confirmed} · 不适用 ${notApplicable} · 待处理 ${model.stages.length - confirmed - notApplicable}`;
    const unknownFacts = ['hasPayment', 'collectsSensitive', 'hasServerDomain'].filter(key => project.facts?.[key as keyof ProjectFacts] == null).length + (project.facts?.businessType?.trim() ? 0 : 1);
    el('workflow-facts-summary').textContent = conflict ? '已保存事实已变化 · 草稿待核对' : `${unknownFacts ? `${unknownFacts} 项待补充` : '已填写，仍需人工核对'}${Object.keys(draft.facts).length ? ' · 有未保存更改' : ''}`;
    el<HTMLDetailsElement>('workflow-facts').open = conflict || (draft.factsOpen ?? (unknownFacts > 0));
    el('workflow-next').textContent = model.nextAction ? `下一步 · ${model.nextAction.title}：${model.nextAction.description}` : '所有阶段已人工标记。请仍以官方平台的实际状态为准。';
    el('workflow-next-open').hidden = !model.nextAction;
    el('workflow-next-open').textContent = model.stages.find(stage => stage.id === model.nextAction?.stageId)?.applicability === null ? '补充项目事实' : '查看下一步';
    el('workflow-coverage').textContent = '以下是人工准备进度；预检发现请在项目成果中查看。未匹配到规则不表示无需资质或没有风险。';
    const stages = el('workflow-stages');
    const focusedId = stages.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.id : null;
    stages.textContent = '';
    for (const [index, stage] of model.stages.entries()) {
      const row = document.createElement('details'); row.className = 'workflow-stage'; row.dataset.stage = stage.id; row.dataset.state = stage.status; row.open = draft.expanded.has(stage.id);
      row.addEventListener('toggle', () => { if (row.open) draft.expanded.add(stage.id); else draft.expanded.delete(stage.id); });
      const summary = document.createElement('summary'); summary.id = `workflow-stage-${stage.id}`;
      const number = text('span', String(index + 1).padStart(2, '0'), 'workflow-stage-number'); number.setAttribute('aria-hidden', 'true');
      summary.append(number, text('strong', stage.title), text('span', labels[stage.status] ?? stage.status, 'workflow-stage-state'));
      summary.append(createIcon(document, 'chevron-down'));
      if (stage.id === model.nextAction?.stageId) summary.setAttribute('aria-current', 'step');
      row.append(summary);
      row.append(text('p', stage.action));
      if (stage.blockedBy.length) row.append(text('p', `前置阶段待核对：${stage.blockedBy.map((id: string) => model.stages.find((item: {id: string}) => item.id === id)?.title ?? id).join('、')}`, 'desktop-field-hint'));
      row.append(text('p', stage.coverage.note, 'desktop-field-hint'));
      const actions = document.createElement('ul');
      for (const item of stage.items) {
        const entry = document.createElement('li'); entry.append(text('strong', item.title));
        if (item.conditional) entry.append(text('p', item.signal.length ? `条件线索：${item.signal.join('、')}；请人工判断是否适用。` : '请先核对是否使用相关接口、组件或配置；条件成立时再处理本项要求。', 'desktop-field-hint'));
        for (const requirement of item.requires) entry.append(text('p', requirement)); actions.append(entry);
      }
      row.append(actions);
      const sources = document.createElement('div'); sources.className = 'workflow-sources';
      const seen = new Set<string>();
      for (const source of stage.sources) { if (seen.has(source.url)) continue; seen.add(source.url); const line = document.createElement('p'); sourceLink(line, source.url); if (source.lastVerified) line.append(text('span', ` · 来源核对 ${source.lastVerified}`)); sources.append(line); }
      row.append(sources);
      if (stage.confirmation) row.append(text('p', `上次记录：${new Date(stage.confirmation.recordedAt).toLocaleString('zh-CN', {hour12:false})} · ${stage.confirmation.note || '无备注'}`, 'desktop-field-hint'));
      const note = document.createElement('textarea'); note.id = `workflow-note-${stage.id}`; note.rows = 2; note.maxLength = 2000; note.placeholder = '核对备注；标记不适用时必须填写原因';
      note.value = draft.notes.get(stage.id) ?? '';
      note.addEventListener('input', () => { if (!draft.noteBases.has(stage.id)) draft.noteBases.set(stage.id, noteBasis(renderedBasis, stage.id)); draft.notes.set(stage.id, note.value); });
      const label = document.createElement('label'); label.htmlFor = note.id; label.textContent = '核对备注或不适用原因';
      const staleNote = noteConflict(snapshot, stage.id);
      const noteHint = text('p', staleNote ? '项目依据、规则或本阶段记录已变化。旧备注已保留，暂不能提交；请先复制需要保留的文字，放弃旧备注后重新核对。' : '未保存的备注仅在本次应用运行期间保留。', 'desktop-field-hint'); noteHint.id = `workflow-note-hint-${stage.id}`; note.setAttribute('aria-describedby', noteHint.id); row.append(label, note, noteHint);
      if (staleNote) {
        const discard = text('wa-button', '放弃旧备注，重新核对'); discard.id = `workflow-note-discard-${stage.id}`; discard.setAttribute('appearance', 'outlined'); discard.setAttribute('size', 's');
        discard.addEventListener('click', () => { if (blocked() || snapshot?.project.id !== project.id || options.getProject()?.id !== project.id) return; draft.notes.delete(stage.id); draft.noteBases.delete(stage.id); render(); document.getElementById(note.id)?.focus(); }); row.append(discard);
      }
      const buttons = document.createElement('div'); buttons.className = 'project-form-actions';
      for (const [state, id, title] of [['confirmed', 'confirm', '人工确认'], ['not_applicable', 'not-applicable', '标记不适用'], ['pending', 'reset', '撤销确认']] as const) {
        const button = document.createElement('wa-button'); button.id = `workflow-${id}-${stage.id}`; button.setAttribute('appearance', 'plain'); button.setAttribute('size', 's'); button.textContent = title;
        if (staleNote || (state !== 'pending' && (stage.blockedBy.length || stage.applicability !== (state === 'confirmed')))) { button.dataset.workflowBlocked = 'true'; button.setAttribute('disabled', ''); button.setAttribute('title', staleNote ? '请先处理旧备注并重新核对。' : '请先确认适用事实并完成前置阶段；仅不适用阶段可标记不适用。'); }
        button.addEventListener('click', () => { if (state === 'not_applicable' && !note.value.trim()) { message('请填写不适用原因，再保存。', true); note.focus(); return; } void saveStage(stage.id, state, note.value.trim()); }); buttons.append(button);
      }
      row.append(buttons); stages.append(row);
    }
    const categories = el('workflow-categories'); categories.textContent = '';
    if (!model.categoryCandidates.length) categories.append(text('p', '暂无匹配线索。请根据实际业务对照官方服务类目，未匹配不表示无需资质。', 'desktop-field-hint'));
    for (const candidate of model.categoryCandidates) { const row = document.createElement('article'); row.append(text('h4', candidate.title), text('p', candidate.reason)); for (const requirement of candidate.requires) row.append(text('p', requirement)); if (candidate.official_url) sourceLink(row, candidate.official_url); categories.append(row); }
    content.hidden = false; controls();
    if (focusedId) document.getElementById(focusedId)?.focus({preventScroll:true});
  }
  async function load() {
    const current = options.getProject(); const token = ++epoch;
    el('workflow-title').textContent = current?.name ?? '尚未选择项目';
    snapshot = null; content.hidden = true; controls();
    if (!current) { message('请先在侧栏选择或创建项目，再整理上线进度。'); return; }
    message('正在读取项目事实与上线阶段…');
    const next = await invoke<Snapshot>('project_workflow', { projectId: current.id });
    if (destroyed || token !== epoch || options.getProject()?.id !== current.id) return;
    if (next.project.id !== current.id) throw new Error('返回的项目与当前选择不符，请重新加载。');
    snapshot = next;
    try { render(); } catch (error) { invalidate(); throw error; }
    message(factsConflict(next) ? '已保存事实已变化，草稿已保留。请在项目事实中处理冲突后再保存。' : '', factsConflict(next));
  }
  async function operation(action: () => Promise<void>) {
    if (blocked()) return;
    pending = true; controls();
    try { await action(); } catch (error) { if (!destroyed) message(String(error instanceof Error ? error.message : error), true); }
    finally { pending = false; if (!destroyed) controls(); drainReload(); }
  }
  function invalidate() { epoch++; snapshot = null; content.hidden = true; controls(); }
  function drainReload() {
    if (reloadAfterPending && !blocked() && dialog.open) { reloadAfterPending = false; void operation(load); }
  }
  async function refresh() {
    if (destroyed || !dialog.open) return;
    if (blocked()) {
      if (!pending || snapshot?.project.id !== options.getProject()?.id) {
        invalidate(); reloadAfterPending = true; message('正在切换项目或等待当前操作完成…');
      }
      return;
    }
    reloadAfterPending = false; await operation(load);
  }
  function currentBasis() {
    if (snapshot && snapshot.project.id === options.getProject()?.id) return snapshot;
    invalidate(); reloadAfterPending = true; message('项目已切换，请等待当前项目加载完成。'); drainReload(); return null;
  }
  async function saved() { await options.onProjectChanged(); await load(); message('已保存。人工标记仅用于本项目准备记录。'); }
  async function saveStage(stageId: string, state: string, note: string) {
    const basis = currentBasis(); if (!basis) return;
    if (noteConflict(basis, stageId)) { message('旧备注的依据已变化，请先放弃旧备注并重新核对。', true); return; }
    const stage = deriveWorkflow(basis).stages.find(item => item.id === stageId);
    if (state !== 'pending' && (!stage || stage.blockedBy.length || stage.applicability !== (state === 'confirmed'))) { message('请先确认适用事实并完成前置阶段；仅不适用阶段可标记不适用。', true); return; }
    await operation(async () => { await invoke('project_stage_confirm', { projectId: basis.project.id, expectedRevision: basis.project.revision, expectedRulesVersion: basis.rulesVersion, stageId, state, note }); const draft = draftFor(basis.project.id); draft.notes.delete(stageId); draft.noteBases.delete(stageId); await saved(); });
  }
  for (const key of ['businessType', 'hasPayment', 'collectsSensitive', 'hasServerDomain'] as const) {
    listen(el(`workflow-${key}`), key === 'businessType' ? 'input' : 'change', () => {
      if (!snapshot || snapshot.project.id !== options.getProject()?.id || blocked()) return;
      const field = el<HTMLInputElement>(`workflow-${key}`), draft = draftFor(snapshot.project.id);
      draft.factsBasis ??= factsBasis(snapshot);
      if (key === 'businessType') draft.facts.businessType = field.value;
      else draft.facts[key] = field.value === 'unknown' ? null : field.value === 'true';
      el('workflow-facts-summary').textContent = factsConflict(snapshot) ? '已保存事实已变化 · 草稿待核对' : '有未保存更改 · 仅在本次应用运行期间保留';
      controls();
    });
  }
  listen(el('workflow-facts'), 'toggle', () => { if (snapshot && snapshot.project.id === options.getProject()?.id) draftFor(snapshot.project.id).factsOpen = el<HTMLDetailsElement>('workflow-facts').open; });
  listen(el('workflow-facts-open'), 'click', () => {
    if (!snapshot || blocked()) return;
    el<HTMLDetailsElement>('workflow-facts').open = true; draftFor(snapshot.project.id).factsOpen = true;
    el('workflow-businessType').focus();
  });
  listen(el('workflow-next-open'), 'click', () => {
    if (!snapshot || blocked()) return;
    if (snapshot.project.id !== options.getProject()?.id) return;
    const model = deriveWorkflow(snapshot), next = model.nextAction;
    if (!next) return;
    if (model.stages.find(stage => stage.id === next.stageId)?.applicability === null) {
      el<HTMLDetailsElement>('workflow-facts').open = true; draftFor(snapshot.project.id).factsOpen = true;
      // These two catalog stages depend on the corresponding saved boolean facts.
      const field = next.stageId === 'privacy' ? 'collectsSensitive' : next.stageId === 'domain' ? 'hasServerDomain' : 'businessType';
      const target = el(`workflow-${field}`); target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' });
      return;
    }
    const summary = document.getElementById(`workflow-stage-${next.stageId}`);
    if (!summary) return;
    (summary.parentNode as HTMLDetailsElement).open = true; draftFor(snapshot.project.id).expanded.add(next.stageId);
    summary.focus({ preventScroll: true }); summary.scrollIntoView({ block: 'nearest' });
  });
  listen(el('workflow-facts-form'), 'submit', event => {
    event.preventDefault(); const basis = currentBasis(); if (!basis) return;
    if (factsConflict(basis)) { message('已保存事实已变化，草稿已保留。请先处理冲突，不能覆盖新事实。', true); return; }
    const facts: ProjectFacts = { businessType: el<HTMLTextAreaElement>('workflow-businessType').value.trim(), hasPayment: null, collectsSensitive: null, hasServerDomain: null };
    for (const key of ['hasPayment', 'collectsSensitive', 'hasServerDomain'] as const) { const value = el<HTMLSelectElement>(`workflow-${key}`).value; facts[key] = value === 'unknown' ? null : value === 'true'; }
    void operation(async () => { await invoke('project_facts_save', { projectId: basis.project.id, expectedRevision: basis.project.revision, facts }); const draft = draftFor(basis.project.id); draft.facts = {}; delete draft.factsBasis; await saved(); if (snapshot?.project.id === basis.project.id) message('项目事实已保存。请更新上线清单，旧报告仍保留保存时的内容。'); });
  });
  listen(el('workflow-generate-guide'), 'click', () => {
    if (blocked() || !dialog.open || !options.onGenerateGuide) return;
    const basis = currentBasis();
    if (!basis) return;
    if (Object.keys(draftFor(basis.project.id).facts).length) { message('请先保存项目事实，再更新上线清单。', true); return; }
    void (async () => {
      let generated = false;
      await operation(async () => {
        message('正在根据已保存事实生成上线清单…');
        await options.onGenerateGuide!(basis.project.id);
        generated = true;
      });
      if (generated && !destroyed && dialog.open && options.getProject()?.id === basis.project.id) {
        message('新上线清单已保存，历史报告仍可在项目成果中查看。');
        options.onReadGuide?.(el('workflow-generate-guide'));
      }
    })();
  });
  listen(el('workflow-export'), 'click', () => {
    if (blocked() || !dialog.open || !snapshot) return;
    const basis = currentBasis();
    if (!basis) return;
    try {
      const requested = downloader.download(createWorkflowArtifact(basis));
      message(requested ? '已发起下载，清单包含已保存的事实与确认记录。' : '无法下载准备清单，请重试。', !requested);
    } catch { message('无法下载准备清单，请重新加载后重试。', true); }
  });
  listen(el('workflow-retry'), 'click', () => { void refresh(); });
  listen(el('workflow-close'), 'click', () => { if (!pending) dialog.close(); });
  listen(dialog, 'close', () => { if (!dialog.open && !options.openPage && !destroyed && (document.activeElement === document.body || dialog.contains(document.activeElement))) opener?.focus({preventScroll:true}); });
  function open(trigger: HTMLElement, field?: MissingFact) {
    if (destroyed || dialog.open) return false;
    opener = trigger;
    if (options.openPage) { if (!options.openPage(dialog, trigger)) return false; } else dialog.showModal();
    const dismiss = el('workflow-close'); dismiss.focus(); invalidate();
    const projectId = options.getProject()?.id;
    const loading = refresh(), token = epoch;
    void loading.then(() => {
      if (!field || destroyed || !dialog.open || epoch !== token || blocked() || !snapshot || snapshot.project.id !== projectId || options.getProject()?.id !== projectId) return;
      el<HTMLDetailsElement>('workflow-facts').open = true; draftFor(snapshot.project.id).factsOpen = true;
      if (document.activeElement === dismiss) {
        const target = el(`workflow-${field}`); target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' });
      }
    });
    return true;
  }
  return {
    open,
    openFacts(projectId: string, field: MissingFact, trigger: HTMLElement) {
      if (blocked() || options.getProject()?.id !== projectId) return false;
      return open(trigger, field);
    },
    refresh, element: dialog, canClose: () => !pending,
    close() { if (!pending && dialog.open) dialog.close(); },
    setBusy(value: boolean) { busy = value; if (snapshot && snapshot.project.id !== options.getProject()?.id) { invalidate(); reloadAfterPending = true; } controls(); drainReload(); },
    destroy() { destroyed = true; epoch++; downloader.dispose(); drafts.clear(); for (const dispose of listeners) dispose(); if (dialog.open) dialog.close(); },
  };
}
