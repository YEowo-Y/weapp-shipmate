import { invoke } from '@tauri-apps/api/core';
import type { ProjectSnapshot } from './projects';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import './context.css';
import './project-memory.css';

export type MemoryEntry = { id: string; title: string; text: string; enabled: boolean; source: 'user'; createdAt: number; updatedAt: number };
export type MemorySnapshot = { projectId: string; revision: number; entries: MemoryEntry[] };
type Draft = Pick<MemoryEntry, 'id' | 'title' | 'text' | 'enabled'>;
type Options = { getProjectId(): string | null; isBusy(): boolean; onChange(): void };

/** Saved project notes are reference material. Saving never sends them to a model. */
export function mountProjectMemory(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const item = document.createElement(tag); item.textContent = text; return item; };
  const button = (id: string, label: string, appearance: 'plain' | 'outlined' | 'accent' = 'plain') => {
    const item = createActionButton(document, label, { appearance }); item.id = id; return item;
  };
  const dialog = node('dialog'); dialog.id = 'desktop-memory'; dialog.className = 'context-dialog memory-dialog';
  dialog.setAttribute('aria-labelledby', 'memory-heading'); dialog.setAttribute('aria-describedby', 'memory-description');
  const header = node('header'); header.className = 'context-header';
  const heading = node('h2', '项目记忆'); heading.id = 'memory-heading';
  const dismiss = button('memory-dismiss', ''); dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭项目记忆'); dismiss.append(createIcon(document, 'x')); header.append(heading, dismiss);
  const body = node('div'); body.className = 'context-body';
  const scope = node('p'); scope.id = 'memory-scope'; scope.className = 'memory-scope';
  const description = node('p', '保存项目背景、偏好或约定，仅作用于当前项目。保存后不会自动发送；允许引用的条目仍需在对话中明确附加。'); description.id = 'memory-description';
  const toolbar = node('div'); toolbar.className = 'memory-toolbar';
  const count = node('span'); count.id = 'memory-count';
  const add = button('memory-new', '新增记忆', 'outlined'); const plus = createIcon(document, 'plus'); plus.setAttribute('slot', 'start'); add.append(plus); toolbar.append(count, add);
  const list = node('div'); list.id = 'memory-list'; list.className = 'memory-list';
  const editor = node('section'); editor.id = 'memory-editor'; editor.className = 'memory-editor'; editor.hidden = true; editor.setAttribute('aria-labelledby', 'memory-editor-heading');
  const editorHeading = node('h3'); editorHeading.id = 'memory-editor-heading';
  const titleLabel = node('label', '名称'); titleLabel.htmlFor = 'memory-title';
  const title = node('input'); title.id = 'memory-title'; title.type = 'text'; title.maxLength = 80; title.placeholder = '例如：发布约定';
  const textLabel = node('label', '内容'); textLabel.htmlFor = 'memory-text';
  const text = node('textarea'); text.id = 'memory-text'; text.rows = 5; text.placeholder = '记录希望在此项目中保留的背景或偏好'; text.setAttribute('aria-describedby', 'memory-byte-count memory-reference-note');
  const bytes = node('p'); bytes.id = 'memory-byte-count'; bytes.className = 'memory-count';
  const permission = node('label'); permission.className = 'memory-permission';
  const enabled = node('input'); enabled.type = 'checkbox'; enabled.id = 'memory-enabled';
  permission.append(enabled, node('span', '允许在对话中引用'));
  const referenceNote = node('p', '停用或删除会阻止后续引用，无法撤回已经发送的内容；已有聊天记录不会被清除。请勿保存密码或 API 密钥。'); referenceNote.id = 'memory-reference-note';
  const metadata = node('p'); metadata.id = 'memory-metadata';
  const editorActions = node('div'); editorActions.className = 'memory-editor-actions';
  const remove = button('memory-delete', '删除'); const cancelEdit = button('memory-cancel-edit', '取消编辑'); const save = button('memory-save', '保存', 'accent'); editorActions.append(remove, cancelEdit, save);
  editor.append(editorHeading, titleLabel, title, textLabel, text, bytes, permission, referenceNote, metadata, editorActions);
  const prompt = node('div'); prompt.id = 'memory-prompt'; prompt.className = 'memory-prompt'; prompt.hidden = true; prompt.setAttribute('role', 'group'); prompt.setAttribute('aria-labelledby', 'memory-prompt-text');
  const promptText = node('p'); promptText.id = 'memory-prompt-text';
  const promptActions = node('div'); promptActions.className = 'memory-editor-actions';
  const keep = button('memory-keep-editing', '继续编辑', 'outlined'); const confirm = button('memory-confirm', ''); promptActions.append(keep, confirm); prompt.append(promptText, promptActions);
  const status = node('p'); status.id = 'memory-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const footer = node('footer'); footer.className = 'memory-footer';
  const refresh = button('memory-refresh', '重新读取'); const done = button('memory-done', '完成'); footer.append(refresh, done);
  body.append(scope, description, toolbar, list, editor, prompt, status); dialog.append(header, body, footer); document.body.append(dialog);

  let projectId: string | null = null, snapshot: MemorySnapshot | null = null, current: Draft | null = null;
  let baseline = '', expectedRevision = 0, epoch = 0, disposed = false, pending: 'read' | 'write' | null = null;
  let anchor: HTMLElement | null = null, guarded: (() => void) | null = null;
  let entryButtons: ReturnType<typeof createActionButton>[] = [];
  const drafts = new Map<string, { draft: Draft; baseline: string; revision: number }>();
  const draft = (): Draft => ({ id: current!.id, title: title.value, text: text.value, enabled: enabled.checked });
  const dirty = () => Boolean(current && JSON.stringify(draft()) !== baseline);
  const scoped = () => projectId !== null && projectId === options.getProjectId();
  const blocked = () => disposed || !dialog.open || pending !== null || options.isBusy() || !scoped() || snapshot === null || guarded !== null;
  const byteCount = () => new TextEncoder().encode(text.value).length;
  const valid = () => Boolean(current && title.value.trim() && [...title.value].length <= 80 && text.value.trim() && byteCount() <= 4096);
  function message(value: string, error = false) { status.textContent = value; status.dataset.error = String(error); }
  function controls() {
    const unavailable = blocked(); dialog.setAttribute('aria-busy', String(pending !== null));
    dialog.dataset.editing = String(current !== null);
    add.disabled = unavailable || (snapshot?.entries.length ?? 0) >= 20;
    refresh.disabled = Boolean(disposed || pending || options.isBusy() || !scoped() || guarded);
    save.disabled = unavailable || !valid() || !dirty();
    remove.disabled = unavailable || !current || !snapshot?.entries.some(item => item.id === current?.id);
    cancelEdit.disabled = unavailable; title.disabled = unavailable; text.disabled = unavailable; enabled.disabled = unavailable;
    confirm.disabled = pending !== null; keep.disabled = pending !== null;
    done.disabled = pending === 'write'; dismiss.disabled = pending === 'write';
    for (const row of entryButtons) row.disabled = unavailable;
    bytes.textContent = `${byteCount().toLocaleString()} / 4,096 字节`; bytes.dataset.error = String(byteCount() > 4096);
    count.textContent = snapshot ? `${snapshot.entries.length} / 20 条 · 保存在此设备` : '保存在此设备';
  }
  function renderList() {
    list.replaceChildren(); entryButtons = [];
    if (!snapshot) { list.append(node('p', projectId ? '读取项目记忆后可查看或编辑。' : '选择项目后可管理独立的记忆。')); return; }
    if (!snapshot.entries.length) { list.append(node('p', '暂无项目记忆。可从一条明确的项目背景或偏好开始。')); return; }
    for (const entry of snapshot.entries) {
      const row = button(`memory-entry-${entry.id}`, ''); row.classList.add('memory-entry');
      row.setAttribute('aria-label', `编辑 ${entry.title}`); row.setAttribute('aria-pressed', String(current?.id === entry.id));
      const content = node('span'); content.className = 'memory-entry-content';
      const name = node('span', entry.title); name.className = 'memory-entry-title';
      const details = node('span', `${entry.enabled ? '允许手动引用' : '未允许引用'} · 用户保存 · ${new Date(entry.updatedAt).toLocaleString('zh-CN', { hour12: false })}`); details.className = 'memory-entry-detail';
      content.append(name, details); row.append(content, createIcon(document, 'chevron-right'));
      entryButtons.push(row);
      row.addEventListener('click', () => { if (!blocked()) protect(() => edit(entry)); }); list.append(row);
    }
  }
  function clearEditor() {
    current = null; baseline = ''; title.value = ''; text.value = ''; enabled.checked = false; editor.hidden = true; renderList(); controls();
  }
  function edit(entry?: MemoryEntry) {
    if (projectId) drafts.delete(projectId);
    current = entry ? { id: entry.id, title: entry.title, text: entry.text, enabled: entry.enabled } : { id: crypto.randomUUID(), title: '', text: '', enabled: false };
    baseline = JSON.stringify(current); expectedRevision = snapshot!.revision;
    title.value = current.title; text.value = current.text; enabled.checked = current.enabled; editor.hidden = false;
    editorHeading.textContent = entry ? '编辑记忆' : '新增记忆';
    metadata.textContent = entry ? `来源：用户保存 · 更新于 ${new Date(entry.updatedAt).toLocaleString('zh-CN', { hour12: false })}` : '来源：用户保存 · 尚未保存';
    remove.hidden = !entry; message(''); renderList(); controls(); title.focus();
  }
  function ask(action: () => void, value: string, label: string) {
    guarded = action; promptText.textContent = value; confirm.textContent = label; prompt.hidden = false; controls(); keep.focus();
  }
  function protect(action: () => void) {
    if (dirty()) ask(action, '当前修改尚未保存。放弃修改后继续？', '放弃修改'); else action();
  }
  function active(token: number, id: string) { return !disposed && token === epoch && dialog.open && projectId === id && options.getProjectId() === id; }
  async function read() {
    if (disposed || pending || !dialog.open || options.isBusy() || !scoped()) return;
    const id = projectId!, token = ++epoch; pending = 'read'; snapshot = null; clearEditor(); message('正在读取项目记忆…'); controls();
    try {
      const [projects, result] = await Promise.all([invoke<ProjectSnapshot>('project_snapshot'), invoke<MemorySnapshot>('project_memory_snapshot', { projectId: id })]);
      if (!active(token, id)) return;
      const project = projects.projects.find(item => item.id === id);
      if (!project || result.projectId !== id) throw new Error('项目已变化，请关闭后重新选择项目。');
      snapshot = result; scope.textContent = `当前项目 · ${project.name}`; renderList(); message('');
      const saved = drafts.get(id);
      if (saved) {
        current = saved.draft; baseline = saved.baseline; expectedRevision = saved.revision;
        title.value = current.title; text.value = current.text; enabled.checked = current.enabled; editor.hidden = false;
        editorHeading.textContent = '未保存的修改'; metadata.textContent = '已恢复切换项目之前的本次应用内草稿。';
        remove.hidden = !snapshot.entries.some(item => item.id === current?.id);
        message('已恢复未保存的修改。保存时将核对原始版本，避免覆盖其他更改。');
      }
    } catch (error) { if (active(token, id)) { message(`读取失败：${String(error instanceof Error ? error.message : error).slice(0, 400)} 可重新读取。`, true); renderList(); } }
    finally { if (active(token, id)) { pending = null; controls(); } }
  }
  async function persist(kind: 'save' | 'delete') {
    if (blocked() || !current || (kind === 'save' && (!valid() || !dirty()))) return;
    if (kind === 'delete' && !snapshot!.entries.some(item => item.id === current?.id)) return;
    const id = projectId!, token = ++epoch, value = draft(); pending = 'write'; message(kind === 'save' ? '正在保存…' : '正在删除…'); controls();
    try {
      const result = await invoke<MemorySnapshot>(kind === 'save' ? 'project_memory_save' : 'project_memory_delete', kind === 'save'
        ? { projectId: id, expectedRevision, entry: value } : { projectId: id, expectedRevision, entryId: value.id });
      if (result.projectId !== id) throw new Error('返回的项目不匹配，请重新读取。');
      drafts.delete(id); if (!disposed) options.onChange();
      if (!active(token, id)) return;
      snapshot = result; pending = null; clearEditor(); message(kind === 'save' ? '已保存到此设备。需要引用时，请在对话的项目资料中明确附加。' : '已删除。后续不能再引用此条；已发送内容和聊天记录仍保留。'); add.focus();
    } catch (error) {
      if (active(token, id)) message(`${kind === 'save' ? '未能保存，修改仍在编辑区。' : '未能删除，原条目仍保留。'} ${String(error instanceof Error ? error.message : error).slice(0, 400)}`, true);
    } finally { if (active(token, id)) { pending = null; controls(); } }
  }
  function close() {
    if (pending === 'write' || guarded) return;
    protect(() => { if (projectId) drafts.delete(projectId); dialog.close(); });
  }
  add.addEventListener('click', () => { if (!blocked() && snapshot!.entries.length < 20) protect(() => edit()); });
  refresh.addEventListener('click', () => { if (!pending && !guarded && !options.isBusy() && scoped()) protect(() => { if (projectId) drafts.delete(projectId); void read(); }); });
  save.addEventListener('click', () => { void persist('save'); });
  remove.addEventListener('click', () => {
    if (blocked() || !current) return;
    const entry = snapshot!.entries.find(item => item.id === current?.id); if (!entry) return;
    ask(() => { void persist('delete'); }, `删除「${entry.title}」？此条将从当前项目移除，未保存的编辑也会放弃。已发送内容和聊天记录不受影响。`, '删除记忆');
  });
  cancelEdit.addEventListener('click', () => { if (!blocked()) protect(() => { if (projectId) drafts.delete(projectId); clearEditor(); add.focus(); }); });
  confirm.addEventListener('click', () => { if (pending || !guarded) return; const action = guarded; guarded = null; prompt.hidden = true; action(); controls(); });
  keep.addEventListener('click', () => { guarded = null; prompt.hidden = true; controls(); (current ? title : add).focus(); });
  title.addEventListener('input', controls); text.addEventListener('input', controls); enabled.addEventListener('change', controls);
  dismiss.addEventListener('click', close); done.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (guarded) { guarded = null; prompt.hidden = true; controls(); title.focus(); } else close(); });
  dialog.addEventListener('close', () => { epoch++; pending = null; guarded = null; prompt.hidden = true; anchor?.setAttribute('aria-expanded', 'false'); if (!disposed && anchor?.isConnected) anchor.focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || pending === 'write') return;
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  return {
    open(opener: HTMLElement | null = null) {
      if (disposed || dialog.open) return;
      anchor = opener; projectId = options.getProjectId(); snapshot = null; current = null; pending = null; guarded = null; prompt.hidden = true; editor.hidden = true;
      title.value = ''; text.value = ''; enabled.checked = false; scope.textContent = projectId ? '当前项目 · 读取中' : '未选择项目';
      dialog.showModal(); anchor?.setAttribute('aria-expanded', 'true'); renderList(); controls(); dismiss.focus();
      message(!projectId ? '请先选择项目，再管理项目记忆。' : options.isBusy() ? '任务执行中，完成后可重新读取记忆。' : ''); void read();
    },
    selectChanged() {
      if (disposed || projectId === options.getProjectId()) return;
      if (projectId && current && dirty()) drafts.set(projectId, { draft: draft(), baseline, revision: expectedRevision });
      epoch++; pending = null; if (dialog.open) dialog.close(); snapshot = null; current = null; projectId = options.getProjectId();
    },
    destroy() { disposed = true; epoch++; drafts.clear(); dialog.remove(); },
  };
}
