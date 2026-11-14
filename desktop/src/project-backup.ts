import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Project } from './projects';
import './project-backup.css';

type Capacity = { projects: number; runs: number; confirmations: number; artifactBytes: number; projectLimit: number; runLimit: number; confirmationLimit: number; artifactByteLimit: number; warning: boolean; blocked: boolean };
type Preview = { projectName: string; sourceProjectId: string; runs: number; artifacts: number; memoryEntries: number; warnings: string[] };
type Archive = { token: string; projectName: string; runs: number; artifacts: number; expiresAt: number };
type Options = {
  getProject(): Project | null; isBusy(): boolean; isOpen?(): boolean;
  operation(action: () => Promise<void>): Promise<boolean>; refresh(): Promise<void>;
  archive(projectId: string, token: string): Promise<{ backupPath: string }>;
};
const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

/** Native code owns validation, atomic restore and durable archive; this controller only collects intent. */
export function mountProjectBackup(options: Options) {
  const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = node<HTMLDialogElement>('desktop-projects');
  const file = node<HTMLInputElement>('project-import-file');
  const status = node('project-backup-status');
  let disposed = false, working = false, mutating = false, epoch = 0, storageEpoch = 0;
  let restore: { json: string; preview: Preview; directory: string; requestId: string } | null = null;
  let archive: (Archive & { projectId: string }) | null = null;
  let focusTarget: HTMLElement | null = null;
  const listeners: (() => void)[] = [];
  const listen = (element: HTMLElement, event: string, listener: EventListener, capture = false) => {
    element.addEventListener(event, listener, capture);
    listeners.push(() => element.removeEventListener(event, listener, capture));
  };
  const blocked = () => disposed || working || options.isBusy();
  const isOpen = () => options.isOpen?.() ?? dialog.open;
  function close() { if (mutating) return; epoch++; restore = null; archive = null; sync(); }
  function message(value: string, error = false) { status.textContent = value; status.dataset.tone = error ? 'error' : 'neutral'; }
  function finishFocus(token: number) { if (current(token)) focusTarget?.focus(); focusTarget = null; }
  function sync() {
    if (disposed) return;
    if (archive && options.getProject()?.id !== archive.projectId) archive = null;
    const disabled = blocked();
    for (const id of ['project-import', 'project-import-directory', 'project-import-path', 'project-storage-refresh']) (node(id) as HTMLButtonElement).disabled = disabled;
    (node('project-archive') as HTMLButtonElement).disabled = disabled || !options.getProject();
    (node('project-import-confirm') as HTMLButtonElement).disabled = disabled || !restore?.directory;
    (node('project-archive-confirm') as HTMLButtonElement).disabled = disabled || !archive;
    (node('project-import-cancel') as HTMLButtonElement).disabled = mutating;
    (node('project-archive-cancel') as HTMLButtonElement).disabled = mutating;
    node('project-import-review').hidden = !restore;
    node('project-archive-review').hidden = !archive;
    node('project-backup').setAttribute('aria-busy', String(working));
  }
  async function execute(action: (token: number) => Promise<void>, mutation = false) {
    if (blocked() || !isOpen()) return;
    const token = ++epoch; working = true; mutating = mutation; focusTarget = null; sync();
    try {
      const started = await options.operation(async () => {
        try { await action(token); }
        catch (error) { if (!disposed && epoch === token) message(`${error instanceof Error ? error.message : String(error)} 请核对项目状态后重试；原始备份文件不会被修改。`, true); }
      });
      if (!started && !disposed && token === epoch) message('当前项目尚未就绪或正在运行，请稍后重试。', true);
    } finally { working = false; mutating = false; sync(); finishFocus(token); }
  }
  const current = (token: number) => !disposed && token === epoch && isOpen();
  async function refreshStorage() {
    const token = ++storageEpoch;
    node('project-storage-status').textContent = '正在读取本机容量…';
    try {
      const value = await invoke<Capacity>('project_storage_status');
      if (disposed || token !== storageEpoch) return;
      const mib = (bytes: number) => (bytes / 1024 / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
      node('project-storage-status').textContent = `项目 ${value.projects}/${value.projectLimit} · 运行 ${value.runs}/${value.runLimit} · 阶段记录 ${value.confirmations}/${value.confirmationLimit} · 成果 ${mib(value.artifactBytes)}/${mib(value.artifactByteLimit)} MiB。${value.blocked ? '已达到容量限制，请先归档不再使用的项目。' : value.warning ? '容量接近上限，建议归档暂不使用的项目。' : '容量充足。'}`;
      node('project-storage-status').dataset.tone = value.blocked || value.warning ? 'warning' : 'neutral';
    } catch (error) {
      if (!disposed && token === storageEpoch) { node('project-storage-status').textContent = `容量读取失败：${error instanceof Error ? error.message : String(error)}。可以重新读取。`; node('project-storage-status').dataset.tone = 'error'; }
    }
  }
  listen(node('project-storage-refresh'), 'click', () => { if (!blocked()) void refreshStorage(); });
  listen(node('project-import'), 'click', () => { if (!blocked()) file.click(); });
  listen(file, 'change', () => {
    const selected = file.files?.[0]; file.value = '';
    if (!selected) return;
    void execute(async token => {
      if (selected.size > MAX_BACKUP_BYTES) throw Error('文件过大，请选择不超过 80 MiB 的项目 JSON 备份。');
      message('正在验证备份内容…');
      const json = await selected.text();
      if (!current(token)) return;
      if (new TextEncoder().encode(json).length > MAX_BACKUP_BYTES) throw Error('文件内容超过 80 MiB，请检查备份。');
      const preview = await invoke<Preview>('project_import_preview', { backupJson: json });
      if (!current(token)) return;
      restore = { json, preview, directory: '', requestId: crypto.randomUUID() }; archive = null;
      node('project-import-summary').textContent = `${preview.projectName} · ${preview.runs} 条运行 · ${preview.artifacts} 份成果 · ${preview.memoryEntries} 条记忆。`;
      node('project-import-warnings').textContent = ['追加为新项目，不覆盖本机数据。导入记录为外部历史，需重新检查；不会恢复执行权限、监听、人工阶段确认或记忆启用状态。', ...preview.warnings].join(' ');
      node<HTMLInputElement>('project-import-path').value = '';
      message('备份格式已验证。请选择此设备上的源码文件夹；备份不包含源码、会话或密钥。');
      sync(); focusTarget = node('project-import-directory');
    });
  });
  listen(node('project-import-path'), 'input', () => {
    if (blocked() || !restore) return;
    const directory = node<HTMLInputElement>('project-import-path').value.trim();
    if (directory !== restore.directory) { restore.directory = directory; restore.requestId = crypto.randomUUID(); }
    message(directory ? '确认后将核验此源码路径并追加恢复项目，当前会话保持不变。' : '请选择或输入此设备上的源码文件夹。');
    sync();
  });
  listen(node('project-import-directory'), 'click', () => {
    if (!restore) return;
    void execute(async token => {
      const directory = await open({ directory: true, multiple: false });
      if (!current(token) || !restore || typeof directory !== 'string') return;
      if (directory !== restore.directory) restore.requestId = crypto.randomUUID();
      restore.directory = directory; node<HTMLInputElement>('project-import-path').value = directory;
      message('已选择源码位置。确认后将追加恢复项目，当前会话保持不变。');
    });
  });
  listen(node('project-import-confirm'), 'click', () => {
    if (!restore?.directory) return;
    const selected = restore;
    void execute(async token => {
      message('正在追加恢复项目…');
      const result = await invoke<{ projectId: string; alreadyImported: boolean }>('project_import', { backupJson: selected.json, directory: selected.directory, requestId: selected.requestId });
      restore = null;
      try { await options.refresh(); }
      catch { if (current(token)) message('项目已恢复，但项目列表刷新失败。请重新加载，勿重复选择备份导入。', true); return; }
      if (!current(token)) return;
      message(`${result.alreadyImported ? '此备份已恢复，无需重复导入。' : '项目已追加恢复。'}未切换当前会话。请在项目选择器中打开恢复的项目，并重新检查源码。`);
      await refreshStorage();
    }, true);
  });
  listen(node('project-import-cancel'), 'click', () => { if (!mutating) { epoch++; restore = null; sync(); message('已取消恢复，现有项目未改变。'); node('project-import').focus(); } });
  listen(node('project-archive'), 'click', () => {
    const project = options.getProject(); if (!project) return;
    void execute(async token => {
      message('正在准备可恢复的项目归档…');
      const prepared = await invoke<Archive>('project_archive_prepare', { projectId: project.id });
      if (!current(token) || project.id !== options.getProject()?.id) return;
      archive = { ...prepared, projectId: project.id }; restore = null;
      node('project-archive-summary').textContent = `归档「${prepared.projectName}」：${prepared.runs} 条运行、${prepared.artifacts} 份成果将移出当前项目库。应用会先保存并校验恢复文件；源码不删除，会话内容保留。本机修复备份和撤销记录不随项目恢复文件导出；归档后无法通过恢复项目继续撤销旧改动。`;
      message('请确认具体项目。归档后会退出该项目；需要时可以通过恢复文件重新导入。');
      sync(); focusTarget = node('project-archive-cancel');
    });
  });
  listen(node('project-archive-confirm'), 'click', () => {
    const prepared = archive;
    if (!prepared || prepared.projectId !== options.getProject()?.id) return;
    void execute(async token => {
      message('正在保存恢复文件并归档…');
      const result = await options.archive(prepared.projectId, prepared.token);
      archive = null;
      try { await options.refresh(); }
      catch { if (current(token)) message(`项目已归档，恢复文件：${result.backupPath}。项目列表刷新失败，请重新加载。`, true); return; }
      if (!current(token)) return;
      message(`项目已归档。恢复文件：${result.backupPath}。会话内容保留；可选择此 JSON 重新导入项目。`);
      await refreshStorage();
    }, true);
  });
  listen(node('project-archive-cancel'), 'click', () => { if (!mutating) { epoch++; archive = null; sync(); message('已取消归档，现有项目未改变。'); node('project-archive').focus(); } });
  listen(dialog, 'cancel', event => { if (mutating) event.preventDefault(); });
  listen(node('project-close'), 'click', event => { if (mutating) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  listen(dialog, 'close', () => { if (!isOpen()) close(); });
  sync();
  return { sync, refreshStorage, close, canClose: () => !working, destroy() { disposed = true; epoch++; storageEpoch++; listeners.forEach(remove => remove()); } };
}
