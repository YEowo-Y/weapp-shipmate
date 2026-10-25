import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createPreferencesStore } from './settings/preferences-store';
import { SettingsView, type SettingsRoute, type SettingsSection } from './settings/view';
import './context.css';
import './settings/tailwind.css';
import './preferences.css';

type Options = { onModels(anchor: HTMLElement | null): void; onData(anchor: HTMLElement | null): void; onMaintenance(anchor: HTMLElement | null): void; onProjects(anchor: HTMLElement | null): void; onSources(anchor: HTMLElement | null): void; systemNotifications?: { element: HTMLElement; open(): Promise<void>; close(): void; destroy(): void } };

/** React owns settings content; the native dialog retains desktop focus and Escape semantics. */
export function mountPreferences(options: Options) {
  const store = createPreferencesStore();
  const dialog = document.createElement('dialog'); dialog.id = 'desktop-preferences'; dialog.className = 'context-dialog preferences-dialog';
  dialog.setAttribute('aria-labelledby', 'preferences-heading'); dialog.setAttribute('aria-describedby', 'preferences-description');
  document.body.append(dialog);
  const root = createRoot(dialog);
  let disposed = false, epoch = 0, anchor: HTMLElement | null = null, section: SettingsSection = 'appearance';
  const node = (id: string) => dialog.querySelector<HTMLElement>(`#${id}`);
  const routes: Record<SettingsRoute, (anchor: HTMLElement | null) => void> = { models: options.onModels, data: options.onData, maintenance: options.onMaintenance, projects: options.onProjects, sources: options.onSources };
  function render() {
    flushSync(() => root.render(createElement(SettingsView, {
      store, section, notifications: options.systemNotifications?.element,
      onClose: () => { if (!disposed && dialog.open) dialog.close(); },
      onSection: next => { if (!disposed && dialog.open) showSection(next, true); },
      onRoute: route => { if (disposed || !dialog.open || section !== 'connections') return; const opener = anchor; dialog.close(); routes[route](opener?.isConnected ? opener : null); },
    })));
  }
  function showSection(next: SettingsSection, focus = false) {
    section = next === 'notifications' && !options.systemNotifications ? 'appearance' : next;
    dialog.dataset.section = section; render();
    node('preferences-body')!.scrollTop = 0;
    if (focus) node(section === 'appearance' ? 'preferences-appearance-title' : section === 'connections' ? 'preferences-links-heading' : 'preferences-notifications')?.focus({ preventScroll: true });
  }
  dialog.addEventListener('close', () => {
    options.systemNotifications?.close(); epoch++; anchor?.setAttribute('aria-expanded', 'false');
    if (disposed || !anchor?.isConnected) return;
    const visible = (element: HTMLElement | null | undefined) => element?.isConnected && !element.hidden && element.getClientRects().length > 0;
    const target = visible(anchor) ? anchor : anchor.closest('details:not([open])')?.querySelector<HTMLElement>('summary');
    if (visible(target)) target!.focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const dismiss = node('preferences-dismiss'), done = node('preferences-done');
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  showSection('appearance');
  return {
    open(opener: HTMLElement | null = null, selected: SettingsSection = 'appearance') {
      if (disposed || dialog.open) return;
      anchor = opener; const token = ++epoch; showSection(selected); dialog.showModal();
      void options.systemNotifications?.open(); anchor?.setAttribute('aria-expanded', 'true');
      const focused = document.activeElement;
      void Promise.resolve().then(() => { if (!disposed && token === epoch && dialog.open && document.activeElement === focused) node('preferences-dismiss')?.focus(); });
    },
    destroy() {
      if (disposed) return;
      disposed = true; epoch++; anchor?.setAttribute('aria-expanded', 'false');
      root.unmount(); store.destroy(); options.systemNotifications?.destroy(); dialog.remove();
    },
  };
}
