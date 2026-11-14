export type Preferences = { version: 1; theme: 'system' | 'light' | 'dark'; messageSize: 14 | 16 | 18; motion: 'system' | 'reduce' };
export type PreferencesSnapshot = { preferences: Preferences; blocked: boolean; status: string; error: boolean };
export const PREFERENCES_KEY = 'shipmate-desktop-preferences';
const DEFAULTS: Preferences = { version: 1, theme: 'system', messageSize: 16, motion: 'system' };

function valid(value: unknown): value is Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 4 && item.version === 1 && ['system', 'light', 'dark'].includes(item.theme as string)
    && [14, 16, 18].includes(item.messageSize as number) && ['system', 'reduce'].includes(item.motion as string);
}
function decode(raw: string | null): Preferences {
  if (raw === null) return { ...DEFAULTS };
  if (raw.length > 1024) throw new Error('invalid');
  const value: unknown = JSON.parse(raw);
  if (!valid(value)) throw new Error('invalid');
  return value;
}

/** The existing bounded device record remains the only source of persisted appearance. */
export function createPreferencesStore(win: Window = window, doc: Document = document) {
  let snapshot: PreferencesSnapshot = { preferences: { ...DEFAULTS }, blocked: false, status: '', error: false };
  let disposed = false;
  const listeners = new Set<() => void>();
  const systemTheme = win.matchMedia('(prefers-color-scheme: dark)'), systemMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  function publish(status: string, error = false, blocked = snapshot.blocked) {
    snapshot = { ...snapshot, status, error, blocked };
    for (const listener of listeners) listener();
  }
  function apply() {
    const { preferences } = snapshot;
    doc.body.dataset.theme = preferences.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preferences.theme;
    doc.body.dataset.motion = preferences.motion === 'reduce' || systemMotion.matches ? 'reduce' : 'system';
    doc.body.style.setProperty('--message-font-size', `${preferences.messageSize}px`);
  }
  function read() {
    if (disposed) return;
    let raw: string | null;
    try { raw = win.localStorage.getItem(PREFERENCES_KEY); }
    catch { publish('未能读取本机外观设置，当前外观保持不变。请重新读取；恢复默认只会写入外观设置。', true, true); return; }
    try {
      snapshot = { ...snapshot, preferences: decode(raw) }; apply();
      publish(raw === null ? '当前使用默认外观：跟随系统、标准正文、系统动效。' : '已读取此设备的外观设置。', false, false);
    } catch { publish('本机外观设置损坏或版本不受支持，当前外观保持不变。可重新读取或明确恢复外观默认；原记录尚未改写。', true, true); }
  }
  function save(next: unknown, resetting = false) {
    if (disposed || (snapshot.blocked && !resetting) || !valid(next)) return;
    try { win.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); }
    catch { publish('未能保存外观设置，已保持原来的实际外观。可重新选择后重试，或重新读取本机记录。', true); return; }
    snapshot = { ...snapshot, preferences: { ...next } }; apply();
    publish(resetting ? '已恢复外观默认并保存在此设备。会话、项目与凭据未更改。' : '外观已保存到此设备，并立即生效。', false, false);
  }
  function storageChanged(event: StorageEvent) {
    if (disposed || (event.key !== PREFERENCES_KEY && event.key !== null)) return;
    try { if (event.storageArea !== win.localStorage) return; } catch { return; }
    try {
      snapshot = { ...snapshot, preferences: decode(event.key === null ? null : event.newValue) }; apply();
      publish('已同步其他窗口的外观设置。', false, false);
    } catch { publish('其他窗口的外观设置损坏或版本不受支持，当前外观保持不变。请重新读取或恢复外观默认。', true, true); }
  }
  const systemChanged = () => { if (!disposed) apply(); };
  systemTheme.addEventListener('change', systemChanged); systemMotion.addEventListener('change', systemChanged); win.addEventListener('storage', storageChanged);
  apply(); read();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    read, save,
    reset: () => save({ ...DEFAULTS }, true),
    destroy() { disposed = true; listeners.clear(); systemTheme.removeEventListener('change', systemChanged); systemMotion.removeEventListener('change', systemChanged); win.removeEventListener('storage', storageChanged); },
  };
}
export type PreferencesStore = ReturnType<typeof createPreferencesStore>;
