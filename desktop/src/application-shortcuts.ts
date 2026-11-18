/** Application actions must not steal composition, native dialogs, or repeated keys. */
export function bindApplicationShortcuts(options: {
  newSession(): void;
  search(): void;
  find?(): boolean;
  settings(): void;
  togglePanel?(): void;
  toggleSidebar?(): void;
}) {
  const listener = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.repeat ||
      event.altKey ||
      event.shiftKey ||
      (!event.ctrlKey && !event.metaKey) ||
      document.querySelector('dialog:modal')
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'f') {
      if (options.find?.()) event.preventDefault();
      return;
    }
    const action =
      key === 'n'
        ? options.newSession
        : key === 'k'
          ? options.search
          : event.key === ','
            ? options.settings
            : key === 'j'
              ? options.togglePanel
              : key === 'b'
                ? options.toggleSidebar
                : null;
    if (action) {
      event.preventDefault();
      action();
    }
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
