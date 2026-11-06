import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import './maintenance.css';

type Notice = { id: string; artifactId: string; createdAt: number; newCount: number; read: boolean };
type Snapshot = { projectId: string; revision: number; watchEnabled: boolean; notificationsEnabled: boolean; state: 'off' | 'starting' | 'watching' | 'pending' | 'checking' | 'paused' | 'error'; message: string; runId: string | null; lastCheckedAt: number | null; notices: Notice[] };
type Options = { getProjectId(): string | null; onResult(): Promise<unknown>; onOpenArtifact(id: string): Promise<boolean>; onRevealReport?(): void; onUnread?(count: number): void; onNotifications?(): void };
const labels = { off: '自动维护已关闭', starting: '正在启动监听', watching: '正在监听文件变化', pending: '等待自动预检', checking: '自动预检执行中', paused: '自动维护已暂停', error: '自动维护需要处理' };

export function mountProjectMaintenance(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
  const button = (id: string, label: string) => { const control = createActionButton(document, label); control.id = id; return control; };
  const element = node('section'); element.className = 'maintenance-panel'; element.setAttribute('aria-labelledby', 'maintenance-title');
  const title = node('h3', '自动维护'); title.id = 'maintenance-title';
  const description = node('p', '启用后在应用运行时监听本机项目变化，执行只读预检。应用内提醒保留在下方；系统通知需在偏好设置中单独开启。');
  const toggle = (id: string, text: string) => {
    const label = node('label'); label.className = 'maintenance-toggle'; const input = node('input'); input.id = id; input.type = 'checkbox'; input.checked = false; input.setAttribute('role', 'switch');
    label.append(node('span', text), input); return { label, input };
  };
  const watch = toggle('maintenance-watch', '监听文件变化并自动预检'), notifications = toggle('maintenance-notifications', '应用内新问题通知');
  const state = node('p'); state.id = 'maintenance-state'; state.setAttribute('role', 'status');
  const status = node('p'); status.id = 'maintenance-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const actions = node('div'); actions.className = 'context-actions';
  const save = button('maintenance-save', '保存维护设置'), retry = button('maintenance-retry', '重新加载'), stop = button('maintenance-stop', '停止本次自动预检'), discard = button('maintenance-discard', '放弃更改'); actions.append(save, discard);
  const lastCheck = node('p'); lastCheck.id = 'maintenance-last-check';
  const noticeHeader = node('div'); noticeHeader.className = 'maintenance-notice-header';
  const noticeTitle = node('h4', '项目提醒');
  const filter = node('select'); filter.id = 'maintenance-notice-filter'; filter.setAttribute('aria-label', '筛选项目提醒'); filter.setAttribute('aria-controls', 'maintenance-notices');
  for (const [value, text] of [['all', '全部提醒'], ['unread', '仅未读']]) { const option = node('option', text); option.value = value; filter.append(option); }
  filter.value = 'all';
  const count = node('p'); count.id = 'maintenance-notice-count'; count.setAttribute('role', 'status');
  const reset = button('maintenance-notice-reset', '显示全部');
  noticeHeader.append(noticeTitle, filter);
  const notices = node('div'); notices.id = 'maintenance-notices';
  const notificationSettings = button('maintenance-system-settings', '系统通知设置'); notificationSettings.hidden = !options.onNotifications;
  const readAll = button('maintenance-read-all', '全部标为已读');
  const preferencesGroup = node('div'); preferencesGroup.className = 'preferences-group maintenance-preferences';
  preferencesGroup.append(description, watch.label, notifications.label, actions, status);
  const stateTitle = node('h4', '运行状态');
  const stateGroup = node('div'); stateGroup.className = 'preferences-group maintenance-runtime';
  const stateRow = node('div'); stateRow.className = 'settings-row';
  const stateCopy = node('span'); stateCopy.append(state, lastCheck);
  const stateActions = node('div'); stateActions.className = 'maintenance-runtime-actions'; stateActions.append(retry, stop);
  stateRow.append(stateCopy, stateActions); stateGroup.append(stateRow);
  const noticeGroup = node('div'); noticeGroup.className = 'preferences-group maintenance-notice-group';
  const noticeActions = node('div'); noticeActions.className = 'context-actions'; noticeActions.append(reset, readAll, notificationSettings);
  noticeGroup.append(count, notices, noticeActions);
  element.append(title, preferencesGroup, stateTitle, stateGroup, noticeHeader, noticeGroup);
  let projectId: string | null = null, snapshot: Snapshot | null = null, epoch = 0, eventSequence = 0;
  let disposed = false, pending = false, dirty = false, ready = false, readFailed = false, unsubscribe: (() => void) | undefined;
  const synced = new Set<string>();
  let renderedNotices = '';
  let refreshingResult = false, queuedResult: { token: number; id: string } | null = null;
  const current = (token: number, id: string) => !disposed && token === epoch && id === projectId && id === options.getProjectId();
  function message(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); }
  async function refreshResult(token: number, id: string) {
    queuedResult = { token, id };
    if (refreshingResult) return;
    refreshingResult = true;
    try {
      while (queuedResult) {
        const request = queuedResult; queuedResult = null;
        if (!current(request.token, request.id)) continue;
        try { await options.onResult(); }
        catch { if (current(request.token, request.id)) message('维护状态已更新，但项目记录未能刷新。请刷新项目记录。', true); }
      }
    } finally { refreshingResult = false; }
  }
  function render() {
    const disabled = !projectId || !ready || pending;
    watch.input.disabled = disabled; notifications.input.disabled = disabled;
    save.disabled = disabled || !dirty; discard.disabled = pending || !dirty;
    retry.disabled = !projectId || pending;
    retry.textContent = ready && !readFailed ? '重试自动维护' : '重新加载';
    stop.disabled = disabled || !(snapshot?.state === 'pending' || (snapshot?.state === 'checking' && snapshot.runId));
    state.textContent = snapshot ? `${labels[snapshot.state]}${snapshot.message ? ` · ${snapshot.message}` : ''}` : projectId ? '维护状态尚未读取' : '选择项目后设置自动维护';
    state.dataset.state = snapshot?.state ?? 'off';
    element.setAttribute('aria-busy', String(pending));
    lastCheck.textContent = snapshot?.lastCheckedAt ? `最近预检记录：${new Date(snapshot.lastCheckedAt).toLocaleString('zh-CN')}` : '尚无预检记录';
    lastCheck.hidden = !projectId;
    filter.disabled = disabled;
    reset.disabled = disabled;
    reset.hidden = filter.value !== 'unread';
    notificationSettings.disabled = pending;
    const allNotices = snapshot?.notices ?? [], unread = allNotices.filter(notice => !notice.read);
    const visibleNotices = filter.value === 'unread' ? unread : allNotices;
    count.textContent = `${unread.length} 条未读 · 共 ${allNotices.length} 条提醒`;
    const noticeKey = JSON.stringify([visibleNotices, disabled, filter.value]);
    if (noticeKey !== renderedNotices) {
      const restoreFocus = notices.contains(document.activeElement); const focusedId = (document.activeElement as HTMLElement | null)?.dataset.noticeId;
      renderedNotices = noticeKey; notices.textContent = '';
      if (!visibleNotices.length) notices.append(node('p', filter.value === 'unread' ? '没有未读提醒。' : '暂无提醒。仅在可比较的预检结果中发现新增问题时提醒；这不表示当前文件没有问题。'));
      for (const notice of visibleNotices) {
      const row = node('div'); row.className = 'maintenance-notice'; row.dataset.read = String(notice.read);
      const open = button('', `${notice.read ? '已读' : '未读'} · ${notice.newCount} 个新增问题 · ${new Date(notice.createdAt).toLocaleString('zh-CN')}`);
      open.dataset.noticeId = notice.id; open.disabled = disabled;
        open.addEventListener('click', () => { void openNotice(notice); }); row.append(open); notices.append(row);
        if (restoreFocus && notice.id === focusedId && !disabled) open.focus();
      }
      if (restoreFocus && !disabled && !notices.contains(document.activeElement)) filter.focus();
    }
    readAll.disabled = disabled || !snapshot?.notices.some(notice => !notice.read);
    options.onUnread?.(snapshot?.notices.filter(notice => !notice.read).length ?? 0);
  }
  function accept(value: Snapshot | null, token: number, id: string, sequence: number) {
    if (!current(token, id) || !value || value.projectId !== id || sequence !== eventSequence || (snapshot && value.revision < snapshot.revision)) return false;
    const previous = snapshot; snapshot = value; ready = true;
    if (!dirty) { watch.input.checked = value.watchEnabled; notifications.input.checked = value.notificationsEnabled; }
    render();
    if (previous && (previous.lastCheckedAt !== value.lastCheckedAt || (previous.state === 'checking' && ['watching', 'paused', 'error', 'off'].includes(value.state)))) {
      void refreshResult(token, id);
    }
    return true;
  }
  let listening: Promise<void> | null = null;
  function subscribe() {
    if (unsubscribe) return Promise.resolve();
    if (listening) return listening;
    listening = listen<Snapshot>('project-maintenance', event => {
    const value = event.payload;
    if (disposed || value.projectId !== projectId || value.projectId !== options.getProjectId()) return;
    eventSequence++; accept(value, epoch, value.projectId, eventSequence);
    }).then(off => { if (disposed) off(); else unsubscribe = off; }).finally(() => { listening = null; });
    return listening;
  }
  void subscribe().catch(() => { if (!disposed) { readFailed = true; message('实时状态订阅失败，请重新加载维护状态以重试。', true); render(); } });
  async function read() {
    if (disposed || pending || !projectId) return;
    const id = projectId, token = epoch; pending = true; message('正在读取维护状态…'); render();
    try {
      await subscribe();
      if (!current(token, id)) return;
      if (!synced.has(id)) {
        const sequence = eventSequence;
        const value = await invoke<Snapshot | null>('project_maintenance_sync', { projectId: id });
        if (!current(token, id)) return;
        synced.add(id); accept(value, token, id, sequence);
      }
      const sequence = eventSequence;
      const value = await invoke<Snapshot>('project_maintenance_snapshot', { projectId: id });
      if (!current(token, id)) return;
      const accepted = accept(value, token, id, sequence);
      if (!accepted && !ready) throw new Error('维护状态与当前项目不一致');
      readFailed = false; message('');
    } catch { if (current(token, id)) { readFailed = true; message('维护状态未能读取，已保留设置草稿。请重新加载。', true); } }
    finally { if (current(token, id)) { pending = false; render(); } }
  }
  async function command(name: string, args: Record<string, unknown> = {}, saved = false) {
    if (disposed || pending || !ready || !projectId) return;
    const id = projectId, token = epoch, sequence = eventSequence;
    pending = true; message(''); render();
    try {
      const value = await invoke<Snapshot>(`project_maintenance_${name}`, { projectId: id, ...args });
      if (!current(token, id)) return;
      if (!value || value.projectId !== id) throw new Error('维护响应与当前项目不一致');
      const accepted = accept(value, token, id, sequence);
      // Revision orders configuration only. Preserve newer event state while
      // reconciling a successful save that raced with an operational event.
      if (saved && !accepted && snapshot && value.revision > snapshot.revision) {
        snapshot = { ...snapshot, revision: value.revision, watchEnabled: value.watchEnabled, notificationsEnabled: value.notificationsEnabled };
      }
      if (saved) dirty = false;
      if (!dirty && snapshot) { watch.input.checked = snapshot.watchEnabled; notifications.input.checked = snapshot.notificationsEnabled; }
      message(saved ? '维护设置已保存。' : '');
    } catch { if (current(token, id)) { if (saved) readFailed = true; message('操作未能完成，已保留设置草稿。请重试；版本冲突时先重新加载。', true); } }
    finally { if (current(token, id)) { pending = false; render(); } }
  }
  async function openNotice(notice: Notice) {
    if (disposed || pending || !ready || !projectId) return;
    const id = projectId, token = epoch; pending = true; render();
    try {
      const opened = await options.onOpenArtifact(notice.artifactId);
      if (!current(token, id)) return;
      if (!opened) throw new Error('报告未打开');
      options.onRevealReport?.();
      pending = false;
      if (!notice.read) await command('read', { noticeIds: [notice.id] });
    } catch { if (current(token, id)) message('保存的报告未能打开，通知仍保留未读。请重试。', true); }
    finally { if (current(token, id)) { pending = false; render(); } }
  }
  function discardChanges() {
    if (disposed || pending) return;
    dirty = false; watch.input.checked = snapshot?.watchEnabled ?? false; notifications.input.checked = snapshot?.notificationsEnabled ?? false;
    message('已放弃未保存的维护设置。'); render();
  }
  function canClose() {
    if (pending || dirty) { message(pending ? '正在处理维护操作，请稍候。' : '维护设置尚未保存，请先保存或放弃更改。'); return false; }
    return true;
  }
  for (const input of [watch.input, notifications.input]) input.addEventListener('change', () => {
    dirty = watch.input.checked !== (snapshot?.watchEnabled ?? false) || notifications.input.checked !== (snapshot?.notificationsEnabled ?? false); render();
  });
  filter.addEventListener('change', () => { if (!filter.disabled) render(); });
  reset.addEventListener('click', () => { if (!reset.disabled) { filter.value = 'all'; render(); filter.focus(); } });
  notificationSettings.addEventListener('click', () => { if (!disposed && !notificationSettings.hidden && !notificationSettings.disabled && canClose()) options.onNotifications?.(); });
  discard.addEventListener('click', discardChanges);
  save.addEventListener('click', () => { if (!save.disabled) void command('save', { expectedRevision: snapshot!.revision, watchEnabled: watch.input.checked, notificationsEnabled: notifications.input.checked }, true); });
  retry.addEventListener('click', () => { if (!retry.disabled) void (ready && !readFailed ? command('retry') : read()); });
  stop.addEventListener('click', () => { if (!stop.disabled) void command('stop'); });
  readAll.addEventListener('click', () => { if (!readAll.disabled) void command('read', { noticeIds: snapshot!.notices.filter(notice => !notice.read).map(notice => notice.id) }); });
  render();
  return {
    element, canClose, discardChanges,
    async select() {
      if (disposed) return;
      const id = options.getProjectId();
      if (id === projectId && (ready || pending)) return;
      if (id !== projectId) {
        epoch++; eventSequence++; projectId = id; snapshot = null; pending = false; dirty = false; ready = false; readFailed = false;
        watch.input.checked = false; notifications.input.checked = false; filter.value = 'all'; message(''); render();
      }
      await read();
    },
    refresh: read,
    destroy() { disposed = true; epoch++; queuedResult = null; unsubscribe?.(); if (element.parentNode) element.remove(); },
  };
}
