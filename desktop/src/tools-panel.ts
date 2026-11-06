/** Keep the same report DOM while switching between an adjacent panel and a drawer. */
export function mountToolsPanel(options: { beforeOpen?(): boolean } = {}) {
  const panel = document.querySelector<HTMLDialogElement>('#desktop-tools');
  const toggle = document.querySelector<HTMLButtonElement>('#desktop-tools-toggle');
  const closeButton = document.querySelector<HTMLButtonElement>('#desktop-tools-close');
  const layout = document.querySelector<HTMLElement>('.desktop-layout');
  if (!panel || !toggle || !layout) return { open(_trigger?: HTMLElement, _focusTarget?: HTMLElement) { return false; }, close() {}, destroy() {} };

  const narrow = window.matchMedia('(max-width: 860px)');
  let expanded = false;
  let destroyed = false;
  let returnFocus: HTMLElement = toggle;
  const reflect = (open: boolean) => {
    expanded = open;
    toggle.setAttribute('aria-expanded', String(open));
    layout.dataset.toolsOpen = String(open);
  };
  const show = () => narrow.matches ? panel.showModal() : panel.show();
  const focusPanel = () => (closeButton ?? panel.querySelector<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]'))?.focus();
  const restoreFocus = () => (returnFocus.closest?.("[hidden]") ? toggle : returnFocus).focus();
  const close = () => {
    if (!expanded) return;
    reflect(false);
    panel.close();
    restoreFocus();
  };
  const open = (trigger: HTMLElement = toggle, focusTarget?: HTMLElement) => {
    if (destroyed || options.beforeOpen?.() === false) return false;
    returnFocus = trigger;
    if (!expanded) { show(); reflect(true); }
    if (focusTarget && panel.contains(focusTarget)) focusTarget.focus();
    else focusPanel();
    return true;
  };
  const onToggle = () => {
    if (expanded) { close(); return; }
    open(toggle);
  };
  const onClose = () => {
    // close events are queued: a responsive reopen may already be visible again.
    if (panel.open || !expanded) return;
    reflect(false);
    restoreFocus();
  };
  const onCancel = (event: Event) => { event.preventDefault(); close(); };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || narrow.matches || !expanded) return;
    const modal = document.querySelector('dialog:modal');
    if (modal && modal !== panel) return;
    if (!panel.contains(document.activeElement)) return;
    event.preventDefault();
    close();
  };
  const onBreakpoint = () => {
    if (!expanded) return;
    // Reopening with showModal would raise background tools over the active reader.
    if (document.querySelector('dialog:modal:not(#desktop-tools)')) {
      reflect(false);
      panel.close();
      return;
    }
    const focused = document.activeElement;
    panel.close();
    show();
    if (focused instanceof HTMLElement && panel.contains(focused)) focused.focus();
    else if (narrow.matches) focusPanel();
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    toggle.removeEventListener('click', onToggle);
    closeButton?.removeEventListener('click', close);
    panel.removeEventListener('close', onClose);
    panel.removeEventListener('cancel', onCancel);
    document.removeEventListener('keydown', onKeydown);
    narrow.removeEventListener('change', onBreakpoint);
    window.removeEventListener('pagehide', destroy);
    reflect(false);
    if (panel.open) panel.close();
  };
  if (panel.open) panel.close();
  reflect(false);
  toggle.addEventListener('click', onToggle);
  closeButton?.addEventListener('click', close);
  panel.addEventListener('close', onClose);
  panel.addEventListener('cancel', onCancel);
  document.addEventListener('keydown', onKeydown);
  narrow.addEventListener('change', onBreakpoint);
  window.addEventListener('pagehide', destroy);
  return { open, close, destroy };
}
