import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createPreferencesStore } from './settings/preferences-store';
import { createShortcutsStore } from './settings/shortcuts-store';
import { SettingsView } from './settings/view';
import type { SettingsOptions, SettingsPanel, SettingsSection } from './settings/types';
import './context.css';
import './settings/tailwind.css';
import './preferences.css';

/** One modal owns focus; embedded panels keep their original business controllers. */
export function mountPreferences(options: SettingsOptions) {
  const store = createPreferencesStore(), shortcuts = createShortcutsStore();
  const dialog = document.createElement('dialog'); dialog.id = 'desktop-preferences'; dialog.className = 'context-dialog preferences-dialog';
  dialog.setAttribute('aria-labelledby', 'preferences-heading'); document.body.append(dialog);
  const root = createRoot(dialog);
  let disposed = false, epoch = 0, anchor: HTMLElement | null = null, section: SettingsSection = 'appearance';
  let active: SettingsPanel | null = null, loading = false, error = '', visit = 0;
  const node = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`);
  function render() {
    if (disposed) return;
    flushSync(() => root.render(createElement(SettingsView, { key: visit, store, shortcuts, options, section, element: active?.element ?? null, loading, error,
      onClose: close, onCanNavigate: allowed, onSection: (next, target) => { void showSection(next, target); }, onRetry: () => { void showSection(section); } })));
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
    active?.close(); active = null; epoch++; anchor?.setAttribute('aria-expanded', 'false');
    if (disposed || !anchor?.isConnected) return;
    const target = anchor.getClientRects().length ? anchor : anchor.closest('details:not([open])')?.querySelector<HTMLElement>('summary');
    target?.focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],wa-button,wa-switch,[tabindex="0"]')].filter(el => !el.hasAttribute('disabled') && !el.closest('[hidden]') && el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    const target = event.shiftKey && document.activeElement === first ? last : !event.shiftKey && document.activeElement === last ? first : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  render();
  return {
    open(opener: HTMLElement | null = null, selected: SettingsSection = 'appearance') {
      if (disposed) return;
      if (dialog.open && !allowed()) return;
      visit++;
      if (!dialog.open) { anchor = opener; dialog.showModal(); anchor?.setAttribute('aria-expanded', 'true'); }
      void showSection(selected);
    }, close,
    destroy() { if (disposed) return; active?.close(); disposed = true; epoch++; anchor?.setAttribute('aria-expanded', 'false'); root.unmount(); store.destroy(); shortcuts.destroy(); options.systemNotifications?.destroy(); dialog.remove(); },
  };
}
