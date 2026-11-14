import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import { createChatContext, contextMetadata } from '../design-previews/chat-context.js';
import type { ProjectSnapshot } from './projects';
import { mountProjectMemory, type MemorySnapshot } from './project-memory';
import type { ChatArgs } from '../design-previews/chat-transport.js';
import './context.css';

type Session = { id: string; projectId?: string | null };
export type ContextItem = { id: string; kind: 'file' | 'report' | 'memory'; title: string; text: string; bytes: number; createdAt?: number; contextRevision?: number };
export function mountChatContext(host: HTMLElement, button: HTMLButtonElement, isBusy: () => boolean) {
  const state = createChatContext();
  let current: Session | null = null, revision = 0, disposed = false, pending = false;
  const memoryManager = mountProjectMemory({ getProjectId: () => current?.projectId ?? null, isBusy, onChange: () => { if (dialog.open) void loadSources(); } });
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const dialog = element('dialog'); dialog.id = 'desktop-context-dialog'; dialog.className = 'context-dialog';
  dialog.setAttribute('aria-labelledby', 'desktop-context-title');
  const heading = element('h2', '发送前查看上下文'); heading.id = 'desktop-context-title';
  const header = element('header'); header.className = 'context-header';
  const dismiss = createActionButton(document, '', { appearance: 'plain' });
  dismiss.id = 'desktop-context-dismiss'; dismiss.classList.add('ui-action-icon');
  dismiss.setAttribute('aria-label', '关闭上下文预览'); dismiss.title = '关闭上下文预览';
  dismiss.append(createIcon(document, 'x')); header.append(heading, dismiss);
  const note = element('p', '仅发送明确选择的资料，重启后需重新选择。文件和报告使用所选快照，项目记忆在每次发送前读取最新版本。全部资料合计最多 24 KiB。请在发送前检查敏感信息。');
  const status = element('p'); status.id = 'desktop-context-status'; status.setAttribute('role', 'status');
  const files = createActionButton(document, '选择项目内文本文件'); files.id = 'desktop-context-file';
  const reports = element('select'); reports.id = 'desktop-context-report'; reports.setAttribute('aria-label', '选择项目报告');
  const add = createActionButton(document, '附加报告'); add.id = 'desktop-context-add-report';
  const memories = element('select'); memories.id = 'desktop-context-memory'; memories.setAttribute('aria-label', '选择项目记忆');
  const addMemory = createActionButton(document, '引用记忆'); addMemory.id = 'desktop-context-add-memory';
  const manageMemory = createActionButton(document, '管理项目记忆', { appearance: 'plain' }); manageMemory.id = 'desktop-context-manage-memory';
  const close = createActionButton(document, '完成'); close.id = 'desktop-context-close';
  const list = element('div'); list.id = 'desktop-context-items';
  const actions = element('div'); actions.className = 'context-actions'; actions.append(files, reports, add);
  const memoryActions = element('div'); memoryActions.className = 'context-actions context-memory-actions'; memoryActions.append(memories, addMemory, manageMemory);
  const body = element('div'); body.className = 'context-body';
  body.append(note, actions, memoryActions, status, list, close);
  dialog.append(header, body); document.body.append(dialog);
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', dialog.id); button.title = '选择要发送的项目资料';
  const blocked = () => disposed || pending || isBusy() || !current?.projectId;
  function render() {
    host.replaceChildren(); list.replaceChildren();
    const items = state.list();
    if (!items.length) list.append(element('p', '未附加资料。已有本地报告不会自动发送给模型。'));
    for (const item of items) {
      const row = element('details'); row.className = 'context-preview';
      const summary = element('summary', `${item.title} · ${item.bytes.toLocaleString()} 字节`);
      const preview = element('pre', item.text); preview.className = 'context-text';
      const metadata = element('p', contextMetadata(item) + (item.kind === 'memory' ? ' · 此处为选择时预览，发送时重新校验' : '')); metadata.className = 'context-metadata'; metadata.hidden = !metadata.textContent;
      const remove = createActionButton(document, '移除'); remove.setAttribute('aria-label', `移除 ${item.title}`); remove.dataset.contextRemove = item.id;
      remove.addEventListener('click', () => { if (isBusy()) return; state.remove(item.id); render(); });
      row.append(summary, metadata, preview, remove); list.append(row);
      const chip = element('button', item.title); chip.type = 'button'; chip.className = 'context-chip'; chip.prepend(createIcon(document, 'file-text')); chip.addEventListener('click', show); host.append(chip);
    }
    host.hidden = !items.length;
    files.disabled = blocked(); add.disabled = blocked() || !reports.value; addMemory.disabled = blocked() || !memories.value; manageMemory.disabled = blocked();
  }
  async function show() {
    if (disposed || isBusy() || dialog.open) return;
    dialog.showModal(); button.setAttribute('aria-expanded', 'true');
    await loadSources();
  }
  async function loadSources() {
    const generation = ++revision;
    status.textContent = current?.projectId ? '正在读取项目资料…' : '请先选择项目，再附加资料。';
    reports.replaceChildren(new Option('选择已保存的报告', '')); memories.replaceChildren(new Option('选择允许引用的记忆', '')); render();
    if (!current?.projectId) return;
    const projectId = current.projectId;
    try {
      const [reportsResult, memoryResult] = await Promise.allSettled([invoke<ProjectSnapshot>('project_snapshot'), invoke<MemorySnapshot>('project_memory_snapshot', { projectId })]);
      if (disposed || generation !== revision || !dialog.open) return;
      if (reportsResult.status === 'fulfilled') for (const report of reportsResult.value.artifacts.filter(item => item.projectId === current?.projectId)) reports.add(new Option(`${report.title} · ${new Date(report.createdAt).toLocaleString('zh-CN', { hour12: false })} · 已保存快照`, report.id));
      if (memoryResult.status === 'fulfilled' && memoryResult.value.projectId === projectId) for (const entry of memoryResult.value.entries.filter(item => item.enabled)) memories.add(new Option(entry.title, entry.id));
      status.textContent = reports.options.length === 1 && memories.options.length === 1 ? '暂无可引用的报告或记忆。可先运行预检，或在管理项目记忆中保存并允许引用。' : '引用后可展开查看正文；记忆停用或删除后，请移除相应引用。';
      if (reportsResult.status === 'rejected' || memoryResult.status === 'rejected') status.textContent = [reportsResult.status === 'rejected' ? '报告读取失败，请重新打开重试。' : '', memoryResult.status === 'rejected' ? '记忆读取失败，可在管理项目记忆中重新读取。' : '', '其余可用资料仍可选择。'].filter(Boolean).join(' ');
      render();
    } catch { if (generation === revision) status.textContent = '项目资料加载失败，请关闭后重试。'; }
  }
  async function attach(kind: 'file' | 'report' | 'memory') {
    if (blocked()) return;
    const generation = revision, projectId = current!.projectId;
    pending = true;
    render();
    try {
      const path = kind === 'file' ? await open({ multiple: false, directory: false, title: '选择当前项目内的 UTF-8 文本（最多 16 KiB）' }) : null;
      if (disposed || generation !== revision || !dialog.open || isBusy() || (kind === 'file' && typeof path !== 'string')) return;
      const item = kind === 'memory' ? (await invoke<ContextItem[]>('project_memory_context', { projectId, entryIds: [memories.value] }))[0] : await invoke<ContextItem>(kind === 'file' ? 'project_context_file' : 'project_context_report', kind === 'file' ? { projectId, path } : { projectId, artifactId: reports.value });
      if (disposed || generation !== revision || !dialog.open || isBusy()) return;
      state.add(item); status.textContent = '已附加快照。移除会阻止后续发送，但无法撤回已发送的内容。';
    } catch (error) { if (generation === revision) status.textContent = String(error instanceof Error ? error.message : error); }
    finally { pending = false; if (!disposed) render(); }
  }
  const onClose = () => { revision++; button.setAttribute('aria-expanded', 'false'); button.focus(); };
  button.addEventListener('click', show); dialog.addEventListener('close', onClose);
  files.addEventListener('click', () => void attach('file')); add.addEventListener('click', () => void attach('report'));
  addMemory.addEventListener('click', () => void attach('memory')); memories.addEventListener('change', render);
  manageMemory.addEventListener('click', () => { if (blocked()) return; dialog.close(); memoryManager.open(button); });
  reports.addEventListener('change', render); close.addEventListener('click', () => dialog.close());
  dismiss.addEventListener('click', () => dialog.close());
  return {
    select(session: Session) { current = session; revision++; state.select(session); memoryManager.selectChanged(); if (dialog.open) dialog.close(); render(); },
    openMemory(anchor?: HTMLElement | null) { if (!disposed && !isBusy()) memoryManager.open(anchor ?? button); },
    async prepare(request: ChatArgs) {
      const generation = revision, projectId = current?.projectId;
      const aborted = () => disposed || request.signal?.aborted || generation !== revision || projectId !== current?.projectId;
      if (aborted()) throw Object.assign(new Error('发送已停止或会话已切换。'), { name: 'AbortError' });
      const entryIds = state.list().filter(item => item.kind === 'memory').map(item => item.id.slice('memory:'.length));
      const fresh = entryIds.length ? await invoke<ContextItem[]>('project_memory_context', { projectId, entryIds }) : [];
      if (aborted()) throw Object.assign(new Error('发送已停止或会话已切换。'), { name: 'AbortError' });
      return state.prepare(request, fresh);
    },
    destroy() { disposed = true; revision++; memoryManager.destroy(); state.clear(); button.removeEventListener('click', show); dialog.remove(); host.replaceChildren(); },
  };
}
