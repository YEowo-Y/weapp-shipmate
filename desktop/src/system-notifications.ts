import { createActionButton } from '../design-previews/components/ui-kit.js';
import './system-notifications.css';

type Snapshot = { schemaVersion: 1; revision: number; enabled: boolean; permission: 'granted' | 'denied' | 'prompt' | 'unknown'; delivery: 'idle' | 'submitted' | 'failed' | 'disabled' | 'permission_required'; message: string | null; installationRequired: boolean; lastAttempt?: { kind: 'test' | 'notice'; noticeId: string | null; attemptedAt: number; outcome: 'submitted' | 'failed' | 'permission_required' } | null };
type Options = { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>; onProjectSettings?(anchor: HTMLElement): void };

/** Device settings are persisted natively; reading never requests permission or sends a notification. */
export function mountSystemNotifications(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
  const button = (id: string, text: string) => { const el = createActionButton(document, text); el.id = id; return el; };
  const element = node('section'); element.className = 'system-notifications'; element.setAttribute('aria-labelledby', 'system-notifications-title');
  const title = node('h3', '系统通知'); title.id = 'system-notifications-title';
  const description = node('p', '仅在启用时请求系统权限；项目内提醒单独设置。'); description.id = 'system-notifications-description';
  const label = node('label'); label.className = 'system-notifications-toggle';
  const toggle = node('input'); toggle.id = 'system-notifications-enabled'; toggle.type = 'checkbox'; toggle.checked = false; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-describedby', description.id);
  label.append(node('span', '允许应用发送系统通知'), toggle);
  const details = node('dl'); details.className = 'system-notifications-details';
  const permissionRow = node('div'), attemptRow = node('div');
  const permission = node('dd'); permission.id = 'system-notifications-permission';
  const installation = node('p'); installation.id = 'system-notifications-installation';
  const lastAttempt = node('dd'); lastAttempt.id = 'system-notifications-last-attempt';
  permissionRow.append(node('dt', '发送状态'), permission); attemptRow.append(node('dt', '最近尝试'), lastAttempt);
  details.append(permissionRow, attemptRow);
  const actions = node('div'); actions.className = 'context-actions';
  const test = button('system-notifications-test', '发送测试通知'), reload = button('system-notifications-reload', '重新读取状态'); actions.append(test, reload);
  const project = button('system-notifications-project', '项目提醒设置'); project.hidden = !options.onProjectSettings; actions.append(project);
  const status = node('p'); status.id = 'system-notifications-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  element.append(title, label, description, details, installation, actions, status);
  let snapshot: Snapshot | null = null, disposed = false, visible = false, epoch = 0, ready = false;
  let pending: Promise<void> | null = null;
  const current = (token: number) => !disposed && visible && token === epoch;
  function message(text: string, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function render() {
    toggle.checked = snapshot?.enabled ?? false;
    toggle.disabled = !visible || !ready || Boolean(pending);
    test.disabled = toggle.disabled || !snapshot?.enabled || snapshot.permission !== 'granted';
    reload.disabled = !visible || Boolean(pending);
    project.disabled = disposed || !visible || Boolean(pending);
    element.setAttribute('aria-busy', String(Boolean(pending))); status.dataset.running = String(Boolean(pending));
    const permissions = { granted: '系统通知权限已允许', denied: '系统通知权限未允许；可在系统设置中调整后重新读取。', prompt: '尚未请求系统权限；启用时才会请求。', unknown: '系统权限状态暂不可用；请重新读取。' };
    permission.textContent = !snapshot ? '通知设置尚未读取' : snapshot.installationRequired
      ? `${snapshot.enabled ? '已启用应用发送' : '应用发送已关闭'}；是否显示由 Windows 通知设置和勿扰控制。`
      : `${snapshot.enabled ? '应用发送已启用' : '应用发送已关闭'} · ${permissions[snapshot.permission]}`;
    installation.hidden = !snapshot?.installationRequired;
    installation.textContent = 'Windows 系统通知需要安装版应用身份。此提示不是安装状态检测；接口成功也不代表通知已显示。';
    const attempt = snapshot?.lastAttempt;
    attemptRow.hidden = !attempt;
    const outcomes = { submitted: '已提交给系统，不代表实际显示', failed: '提交失败', permission_required: '权限未允许，未提交' };
    lastAttempt.textContent = attempt ? `最近${attempt.kind === 'test' ? '测试通知' : '维护通知'}尝试：${new Date(attempt.attemptedAt).toLocaleString('zh-CN')} · ${outcomes[attempt.outcome]}` : '';
  }
  function operation(command: string, args?: Record<string, unknown>) {
    if (disposed || !visible || pending) return Promise.resolve();
    const token = epoch;
    const task = (async () => {
      // Yield so pending is assigned before a synchronous IPC adapter can settle.
      await Promise.resolve();
      try {
        const value = await options.invoke<Snapshot>(command, args);
        if (!current(token)) return;
        if (value.schemaVersion !== 1 || !Number.isInteger(value.revision) || typeof value.enabled !== 'boolean' || !['granted', 'denied', 'prompt', 'unknown'].includes(value.permission)) throw new Error('invalid notification state');
        snapshot = value; ready = true;
        if (command === 'system_notifications_test') message(value.delivery === 'submitted' ? '测试通知已提交给系统；是否显示请查看系统通知设置与勿扰状态。' : value.message ?? '测试通知未提交，请检查权限或稍后重试。', value.delivery !== 'submitted');
        else if (command === 'system_notifications_save') message(value.enabled ? '已保存：允许应用发送系统通知。是否显示由系统控制。' : value.permission === 'denied' ? '系统权限未允许，应用发送保持关闭。可调整系统设置后重试。' : '已保存：应用发送已关闭。', value.permission === 'denied' && args?.enabled === true);
        else message('已读取本机通知设置；未请求权限或发送通知。');
      } catch { if (current(token)) { if (command === 'system_notifications_snapshot') ready = false; message('操作未能完成，保留上次已读取的设置。请重新读取状态后重试。', true); } }
      finally { pending = null; if (current(token)) render(); }
    })();
    pending = task; message(command === 'system_notifications_snapshot' ? '正在读取通知设置…' : command === 'system_notifications_test' ? '正在提交测试通知…' : '正在保存通知设置…'); render(); return task;
  }
  toggle.addEventListener('change', () => { const enabled = toggle.checked; if (toggle.disabled || !snapshot) { render(); return; } void operation('system_notifications_save', { expectedRevision: snapshot.revision, enabled }); });
  reload.addEventListener('click', () => { if (!reload.disabled) void operation('system_notifications_snapshot'); });
  test.addEventListener('click', () => { if (!test.disabled) void operation('system_notifications_test'); });
  project.addEventListener('click', () => { if (!disposed && visible && !pending && !project.disabled && !project.hidden) options.onProjectSettings?.(project); });
  render();
  return {
    element,
    async open() {
      if (disposed) return;
      visible = true; const token = ++epoch; ready = false; render();
      if (pending) await pending;
      if (current(token)) await operation('system_notifications_snapshot');
    },
    close() { visible = false; epoch++; ready = false; render(); },
    destroy() { disposed = true; visible = false; epoch++; if (element.parentNode) element.remove(); },
  };
}
