import './workspace-pages.css';

type LeaveGuard = { canLeave?: () => boolean };

/** Present existing controllers without duplicating their DOM or stored state. */
export function mountWorkspacePages(options: { host: HTMLElement; onChange?(page: HTMLDialogElement | null): void; returnFocus?(): HTMLElement | null }) {
  const { host } = options;
  let active: HTMLDialogElement | null = null, trigger: HTMLElement | null = null;
  let guard: LeaveGuard = {}, destroyed = false;
  const origins = new Map<HTMLDialogElement, { marker: Comment; role: string | null; listener: () => void }>();
  host.hidden = true;
  function finish(restoreFocus: boolean) {
    const previous = active, anchor = trigger;
    active = null; trigger = null; guard = {}; host.hidden = true;
    options.onChange?.(null);
    const target = anchor?.isConnected && anchor.getClientRects().length ? anchor : options.returnFocus?.();
    if (restoreFocus && target?.isConnected && target.getClientRects().length && (!previous || previous.contains(document.activeElement) || document.activeElement === document.body)) target.focus({ preventScroll: true });
  }
  function close() {
    if (!active) return true;
    if (guard.canLeave?.() === false) return false;
    const previous = active;
    previous.close(); finish(true); return true;
  }
  function open(page: HTMLDialogElement, anchor: HTMLElement | null, nextGuard: LeaveGuard = {}) {
    if (destroyed) return false;
    if (active === page && page.open) return true;
    if (active && guard.canLeave?.() === false) return false;
    if (active && active !== page) active.close();
    if (!origins.has(page)) {
      const marker = document.createComment('workspace page'); page.before(marker);
      const listener = () => { if (active === page && !page.open) finish(true); };
      origins.set(page, { marker, role: page.getAttribute('role'), listener });
      page.addEventListener('close', listener);
    }
    active = page; trigger = anchor; guard = nextGuard;
    host.append(page); host.hidden = false;
    page.classList.add('workspace-page'); page.setAttribute('role', 'region');
    if (!page.open) page.show();
    options.onChange?.(page); return true;
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !active || (document.activeElement !== document.body && !active.contains(document.activeElement)) || document.querySelector('dialog:modal')) return;
    event.preventDefault(); close();
  };
  document.addEventListener('keydown', keydown);
  return { open, close, get current() { return active; }, destroy() {
    if (destroyed) return;
    destroyed = true; document.removeEventListener('keydown', keydown);
    active = null;
    for (const [page, origin] of origins) {
      page.removeEventListener('close', origin.listener); if (page.open) page.close();
      origin.marker.replaceWith(page); page.classList.remove('workspace-page');
      if (origin.role === null) page.removeAttribute('role'); else page.setAttribute('role', origin.role);
    }
    origins.clear(); host.hidden = true;
  } };
}
