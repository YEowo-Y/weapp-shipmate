import { createPreferencesStore } from './settings/preferences-store';
import { createShortcutsStore } from './settings/shortcuts-store';
import type { SettingsOptions, SettingsPanel, SettingsSection } from './settings/types';
import './context.css';
import './settings/tailwind.css';
import './preferences.css';

/** One modal owns focus; embedded panels keep their original business controllers. */
export function mountPreferences(options: SettingsOptions, loadRenderer = () => import('./settings/settings-renderer')) {
  const store = createPreferencesStore(), shortcuts = createShortcutsStore();
  const dialog = document.createElement('dialog'); dialog.id = 'desktop-preferences'; dialog.className = 'context-dialog preferences-dialog';
  dialog.setAttribute('aria-labelledby', 'preferences-heading'); document.body.append(dialog);
  let renderer: ReturnType<Awaited<ReturnType<typeof loadRenderer>>['createSettingsRenderer']> | undefined;
  let loadingModule: ReturnType<typeof loadRenderer> | undefined;
  let disposed = false, epoch = 0, anchor: HTMLElement | null = null, section: SettingsSection = 'appearance';
  let active: SettingsPanel | null = null, loading = false, error = '', visit = 0;
  const node = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`);
  function render() {
    if (disposed) return;
    renderer?.render({ store, shortcuts, options, section, element: active?.element ?? null, loading, error,
      onClose: close, onCanNavigate: allowed, onSection: (next, target) => { void showSection(next, target); }, onRetry: () => { void showSection(section); } }, visit);
  }
  function allowed() {
    if (active?.canClose?.() === false) { error = '请先保存或放弃当前更改；正在执行的操作完成后即可离开。'; render(); return false; }
    return true;
  }
  function reveal(target?: string) {
    const element = target ? active?.searchTarget?.(target) ?? node(target) : node('preferences-section-title');
    if (!element) return;
    if (!element.matches('button,input,select,textarea,[tabindex]')) element.tabIndex = -1;
    element.scrollIntoView?.({ block: 'nearest' }); element.focus({ preventScroll: true });
    if (target) { element.classList.add('settings-search-highlight'); window.setTimeout(() => element.classList.remove('settings-search-highlight'), 1800); }
  }
  async function showSection(next: SettingsSection, target?: string) {
    if (disposed || !allowed()) return;
    const token = ++epoch; active?.close(); active = null; error = ''; loading = false;
    section = next === 'notifications' && !options.systemNotifications ? 'appearance' : next; dialog.dataset.section = section;
    render(); node('preferences-body')!.scrollTop = 0;
    const focusAtStart = document.activeElement;
    if (section === 'notifications' || ['models', 'projects', 'data'].includes(section)) {
      loading = true; render();
      try {
        const panel = section === 'notifications' ? options.systemNotifications : await options.getPanel(section as 'models' | 'projects' | 'data');
        if (disposed || token !== epoch || !dialog.open) return;
        if (!panel) throw Error('设置面板暂不可用，请重试。');
        active = panel; render(); await panel.open();
        if (disposed || token !== epoch || !dialog.open) return;
      } catch (cause) { if (disposed || token !== epoch) return; error = cause instanceof Error ? cause.message : '设置读取失败，请重试。'; }
      loading = false; render();
    }
    if (dialog.open && document.activeElement === focusAtStart) reveal(target);
  }
  function close() {
    if (disposed) return false;
    if (dialog.open && !allowed()) return false;
    if (dialog.open) dialog.close();
    return true;
  }
  dialog.addEventListener('cancel', event => { if (!allowed()) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    active?.close(); active = null; epoch++; anchor?.setAttribute('aria-expanded', 'false');
    if (disposed || !anchor?.isConnected) return;
    const target = anchor.getClientRects().length ? anchor : anchor.closest('details:not([open])')?.querySelector<HTMLElement>('summary');
    target?.focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,wa-button,wa-switch,[tabindex="0"]')].filter(el => {
      const collapsed = el.closest('details:not([open])');
      return !el.hasAttribute('disabled') && !el.closest('[hidden]') && el.getClientRects().length &&
        (!collapsed || collapsed.querySelector('summary') === el);
    });
    const first = controls[0], last = controls[controls.length - 1];
    const target = event.shiftKey && document.activeElement === first ? last : !event.shiftKey && document.activeElement === last ? first : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  function showLoadStatus(failed: boolean, selected: SettingsSection) {
    dialog.setAttribute('aria-busy', String(!failed));
    const container = document.createElement('section'); container.className = 'preferences-load';
    const heading = document.createElement('h2'); heading.id = 'preferences-heading'; heading.textContent = '设置';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    status.textContent = failed ? '设置未能加载，请重试。' : '正在加载设置…';
    const dismiss = document.createElement('button'); dismiss.id = 'preferences-load-close'; dismiss.textContent = '关闭设置'; dismiss.onclick = close;
    container.append(heading, status, dismiss);
    if (failed) {
      const retry = document.createElement('button'); retry.id = 'preferences-load-retry'; retry.textContent = '重新加载';
      retry.onclick = () => { void open(anchor, selected); }; container.append(retry);
    }
    dialog.replaceChildren(container);
    if (dialog.open) (container.lastElementChild as HTMLElement).focus();
  }
  async function open(opener: HTMLElement | null = null, selected: SettingsSection = 'appearance') {
    if (disposed || (dialog.open && !allowed())) return;
    const currentVisit = ++visit;
    if (!renderer) showLoadStatus(false, selected);
    if (!dialog.open) { anchor = opener; dialog.showModal(); anchor?.setAttribute('aria-expanded', 'true'); }
    if (!renderer) {
      try {
        loadingModule ??= loadRenderer().finally(() => { loadingModule = undefined; });
        const module = await loadingModule;
        if (disposed || currentVisit !== visit || !dialog.open) return;
        dialog.replaceChildren();
        renderer = module.createSettingsRenderer(dialog);
        dialog.removeAttribute('aria-busy');
      } catch {
        if (!disposed && currentVisit === visit && dialog.open) showLoadStatus(true, selected);
        return;
      }
    }
    await showSection(selected);
  }
  return {
    open, close,
    destroy() { if (disposed) return; active?.close(); disposed = true; epoch++; anchor?.setAttribute('aria-expanded', 'false'); renderer?.destroy(); store.destroy(); shortcuts.destroy(); options.systemNotifications?.destroy(); dialog.remove(); },
  };
}
