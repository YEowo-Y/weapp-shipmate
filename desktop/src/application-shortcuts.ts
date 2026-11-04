/** Application actions must not steal composition, native dialogs, or repeated keys. */
export function bindApplicationShortcuts(options: { newSession(): void; search(): void; settings(): void }) {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey || (!event.ctrlKey && !event.metaKey) || document.querySelector('dialog:modal')) return;
    const action = event.key.toLowerCase() === 'n' ? options.newSession : event.key.toLowerCase() === 'k' ? options.search : event.key === ',' ? options.settings : null;
    if (action) { event.preventDefault(); action(); }
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
