export type SendKey = 'enter' | 'mod-enter';
const KEY = 'shipmate-desktop-shortcuts';
export const SHORTCUTS_EVENT = 'shipmate-shortcuts-change';
function decode(raw: string | null): SendKey {
  if (raw === null) return 'enter';
  if (raw.length > 1024) throw Error('invalid shortcuts');
  const value = JSON.parse(raw);
  if (!value || Object.keys(value).length !== 2 || value.version !== 1 || !['enter', 'mod-enter'].includes(value.sendKey)) throw Error('invalid shortcuts');
  return value.sendKey;
}
/** Preserve the existing Enter behavior when device storage is unavailable. The settings page reports the read error. */
export function readSendKey(): SendKey {
  try { return decode(window.localStorage.getItem(KEY)); } catch { return 'enter'; }
}
export function createShortcutsStore() {
  let snapshot: { sendKey: SendKey; error: string; status: string } = { sendKey: 'enter', error: '', status: '' };
  const listeners = new Set<() => void>();
  const publish = () => listeners.forEach(listener => listener());
  function read() {
    try { snapshot = { sendKey: decode(window.localStorage.getItem(KEY)), error: '', status: '' }; }
    catch { snapshot = { sendKey: 'enter', error: '无法读取快捷键设置，当前使用 Enter 发送。可重新读取或恢复默认。', status: '' }; }
    publish();
  }
  function save(sendKey: SendKey, reset = false) {
    if (!['enter', 'mod-enter'].includes(sendKey) || (snapshot.error && !reset)) return;
    try { window.localStorage.setItem(KEY, JSON.stringify({ version: 1, sendKey })); }
    catch { snapshot = { ...snapshot, status: '保存失败，发送方式保持不变。请重试。' }; publish(); return; }
    snapshot = { sendKey, error: '', status: reset ? '已恢复默认发送方式。' : '发送方式已保存。' };
    publish(); window.dispatchEvent(new Event(SHORTCUTS_EVENT));
  }
  function storage(event: StorageEvent) {
    if (event.key !== KEY && event.key !== null) return;
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    read();
  }
  window.addEventListener('storage', storage); read();
  return { getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    read, save, reset: () => save('enter', true), destroy() { window.removeEventListener('storage', storage); listeners.clear(); } };
}
export type ShortcutsStore = ReturnType<typeof createShortcutsStore>;
