/** Same-origin surfaces hand off only after their latest draft and stopped run commit. */
export function installSessionNavigation({ document, window, flush, stop, onBlocked }) {
  let navigating = false;
  async function navigate(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const current = new URL(window.location.href);
    const next = new URL(link.href, current);
    if (next.origin !== current.origin || !/(?:^|\/)(?:chat-full|main-four-region)\.html$/.test(next.pathname)) return;
    event.preventDefault();
    if (navigating) return;
    navigating = true;
    try {
      stop();
      if (await flush()) window.location.assign(next.href);
      else onBlocked?.();
    } catch { onBlocked?.(); }
    finally { navigating = false; }
  }
  document.addEventListener('click', navigate);
  return () => document.removeEventListener('click', navigate);
}
