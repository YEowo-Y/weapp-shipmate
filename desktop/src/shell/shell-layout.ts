import { attachFloatingSurface } from '../shared/components/floating-surface.js';

export type ShellLayoutOptions = {
  onMenuAction?(value: string, trigger: HTMLElement): void;
  onPanelDrawerModeChange?(isDrawerOpen: boolean): void;
};

export function mountShellLayout(options: ShellLayoutOptions = {}) {
  const layout = document.querySelector<HTMLElement>('.desktop-layout');
  const sidebar = document.getElementById('desktop-sidebar');
  const main = document.getElementById('desktop-main');
  const rightPanel = document.getElementById('desktop-right-panel');
  const backdrop = document.getElementById('desktop-shell-backdrop');
  const panelToggle = document.getElementById('desktop-panel-toggle') as HTMLButtonElement | null;
  const sidebarToggle = document.getElementById('desktop-sidebar-toggle') as HTMLButtonElement | null;
  const sidebarExpand = document.getElementById('desktop-sidebar-expand') as HTMLButtonElement | null;
  const moreTrigger = document.getElementById('desktop-more') as HTMLButtonElement | null;
  const actionsMenu = document.getElementById('desktop-actions');

  if (!layout || !sidebar || !main || !rightPanel) {
    return {
      togglePanel() {},
      openPanel(_trigger?: HTMLElement | null) {},
      closePanel() {},
      closePanelDrawer() {},
      toggleSidebar() {},
      closeSidebarDrawer() {},
      isSidebarDrawerOpen: () => false,
      destroy() {},
    };
  }

  const panelQuery = window.matchMedia('(max-width: 1180px)');
  const sidebarQuery = window.matchMedia('(max-width: 820px)');

  let destroyed = false;
  let wideSidebarOpen = true;
  let widePanelOpen = true;
  let activeDrawer: 'sidebar' | 'panel' | null = null;
  let drawerReturnFocus: HTMLElement | null = null;
  const cleanups: (() => void)[] = [];

  const listen = <K extends keyof HTMLElementEventMap>(
    target: EventTarget | null | undefined,
    type: K | string,
    handler: EventListener,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    if (!target) return;
    target.addEventListener(type, handler, opts);
    cleanups.push(() => target.removeEventListener(type, handler, opts));
  };

  function setInert(el: HTMLElement, value: boolean) {
    (el as HTMLElement & { inert?: boolean }).inert = value;
    if (value) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }

  function hasOwnedSidebarModal() {
    if (document.querySelector('.session-workspace-dialog[data-kind]:modal, #desktop-model-dialog:modal')) {
      return true;
    }
    return Boolean(
      document.querySelector(
        '#desktop-preferences:modal, #desktop-explain:modal, #desktop-handoff:modal, #desktop-repair:modal, #desktop-health:modal, #desktop-source-freshness:modal, #desktop-projects:modal',
      ),
    );
  }

  function sync() {
    if (destroyed) return;
    const sidebarDrawerMode = sidebarQuery.matches;
    const panelDrawerMode = panelQuery.matches;
    const sidebarOpen = sidebarDrawerMode ? activeDrawer === 'sidebar' : wideSidebarOpen;
    const panelOpen = panelDrawerMode ? activeDrawer === 'panel' : widePanelOpen;

    layout!.dataset.sidebar = sidebarOpen ? 'open' : 'closed';
    layout!.dataset.panel = panelOpen ? 'open' : 'closed';
    layout!.dataset.sidebarMode = sidebarDrawerMode ? 'drawer' : 'inline';
    layout!.dataset.panelMode = panelDrawerMode ? 'drawer' : 'inline';

    if (sidebarDrawerMode && sidebarOpen) {
      sidebar!.setAttribute('role', 'dialog');
      sidebar!.setAttribute('aria-modal', 'true');
    } else {
      sidebar!.removeAttribute('role');
      sidebar!.removeAttribute('aria-modal');
    }

    if (panelDrawerMode && panelOpen) {
      rightPanel!.setAttribute('role', 'dialog');
      rightPanel!.setAttribute('aria-modal', 'true');
    } else {
      rightPanel!.removeAttribute('role');
      rightPanel!.removeAttribute('aria-modal');
    }

    sidebarToggle?.setAttribute('aria-expanded', String(sidebarOpen));
    if (sidebarExpand) {
      sidebarExpand.hidden = sidebarOpen;
      sidebarExpand.setAttribute('aria-expanded', String(sidebarOpen));
    }

    panelToggle?.setAttribute('aria-expanded', String(panelOpen));
    panelToggle?.setAttribute('aria-pressed', String(panelOpen));

    const modalDrawer = sidebarDrawerMode && sidebarOpen ? 'sidebar' : panelDrawerMode && panelOpen ? 'panel' : null;
    setInert(main!, modalDrawer !== null);
    setInert(sidebar!, modalDrawer === 'panel');
    setInert(rightPanel!, modalDrawer === 'sidebar');
    if (backdrop) backdrop.hidden = modalDrawer === null;

    options.onPanelDrawerModeChange?.(panelDrawerMode && panelOpen);
  }

  function closeDrawer(restoreFocus = true) {
    if (!activeDrawer) return false;
    const closing = activeDrawer;
    const fallback = closing === 'panel' ? panelToggle : sidebarExpand;
    const candidate = drawerReturnFocus;
    activeDrawer = null;
    drawerReturnFocus = null;
    sync();
    if (restoreFocus) {
      const validCandidate =
        candidate?.isConnected &&
        !candidate.hasAttribute('disabled') &&
        !(closing === 'sidebar' && sidebar!.contains(candidate)) &&
        !(closing === 'panel' && rightPanel!.contains(candidate));
      (validCandidate ? candidate : fallback)?.focus({ preventScroll: true });
    }
    return true;
  }

  function openPanel(trigger: HTMLElement | null = panelToggle) {
    if (destroyed) return;
    if (panelQuery.matches) {
      activeDrawer = 'panel';
      drawerReturnFocus = trigger ?? panelToggle;
      sync();
      const target = rightPanel!.querySelector<HTMLElement>(
        '#desktop-panel-close, [role="tab"][aria-selected="true"], button:not([disabled])',
      );
      target?.focus({ preventScroll: true });
    } else {
      widePanelOpen = true;
      sync();
    }
  }

  function closePanel(restoreFocus = true) {
    if (destroyed) return;
    if (panelQuery.matches) {
      if (activeDrawer === 'panel') closeDrawer(restoreFocus);
    } else if (widePanelOpen) {
      const hadFocus = rightPanel!.contains(document.activeElement);
      widePanelOpen = false;
      sync();
      if (restoreFocus && hadFocus) panelToggle?.focus({ preventScroll: true });
    }
  }

  function closePanelDrawer() {
    if (activeDrawer !== 'panel') return;
    const hadFocus = rightPanel!.contains(document.activeElement);
    closeDrawer(false);
    if (hadFocus && rightPanel!.contains(document.activeElement)) {
      panelToggle?.focus({ preventScroll: true });
    }
  }

  function closeSidebarDrawer() {
    if (activeDrawer !== 'sidebar') return;
    const hadFocus = sidebar!.contains(document.activeElement);
    closeDrawer(false);
    if (hadFocus && sidebar!.contains(document.activeElement)) {
      sidebarExpand?.focus({ preventScroll: true });
    }
  }

  function togglePanel(trigger: HTMLElement | null = panelToggle) {
    if (destroyed) return;
    const isOpen = panelQuery.matches ? activeDrawer === 'panel' : widePanelOpen;
    if (isOpen) closePanel(true);
    else openPanel(trigger);
  }

  function toggleSidebar(trigger?: HTMLElement | null) {
    if (destroyed) return;
    if (sidebarQuery.matches) {
      if (activeDrawer === 'sidebar') {
        closeDrawer(true);
      } else {
        activeDrawer = 'sidebar';
        drawerReturnFocus = trigger ?? sidebarExpand;
        sync();
        (sidebarToggle ?? sidebar!.querySelector<HTMLElement>('button:not([disabled])'))?.focus({ preventScroll: true });
      }
      return;
    }
    const wasOpen = wideSidebarOpen;
    const hadSidebarFocus = sidebar!.contains(document.activeElement);
    const hadExpandFocus = document.activeElement === sidebarExpand;
    wideSidebarOpen = !wasOpen;
    sync();
    if (!wideSidebarOpen && hadSidebarFocus) sidebarExpand?.focus({ preventScroll: true });
    else if (wideSidebarOpen && hadExpandFocus) sidebarToggle?.focus({ preventScroll: true });
  }

  const onPanelMedia = () => {
    const hadPanelFocus = rightPanel!.contains(document.activeElement);
    if (panelQuery.matches) {
      if (activeDrawer === 'panel') activeDrawer = null;
    } else if (activeDrawer === 'panel') {
      widePanelOpen = true;
      activeDrawer = null;
    }
    sync();
    if (panelQuery.matches && hadPanelFocus) {
      panelToggle?.focus({ preventScroll: true });
    }
  };

  const onSidebarMedia = () => {
    if (sidebarQuery.matches) {
      const keepOpen =
        sidebar!.contains(document.activeElement) ||
        ((wideSidebarOpen || activeDrawer === 'sidebar') && hasOwnedSidebarModal());
      if (keepOpen) {
        activeDrawer = 'sidebar';
        drawerReturnFocus ??= sidebarExpand;
      } else if (activeDrawer === 'sidebar') {
        activeDrawer = null;
      }
    } else if (activeDrawer === 'sidebar') {
      wideSidebarOpen = true;
      activeDrawer = null;
    }
    sync();
  };

  listen(panelQuery, 'change', onPanelMedia);
  listen(sidebarQuery, 'change', onSidebarMedia);
  listen(panelToggle, 'click', () => togglePanel(panelToggle));
  listen(sidebarToggle, 'click', () => toggleSidebar(sidebarToggle));
  listen(sidebarExpand, 'click', () => toggleSidebar(sidebarExpand));
  listen(backdrop, 'click', () => closeDrawer(true));

  // Selecting a session from the history/archive modal releases narrow drawers before focusing composer
  listen(
    document,
    'click',
    event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.session-workspace-dialog[data-kind="history"] [data-action="session"]')) {
        closeSidebarDrawer();
        closePanelDrawer();
      }
    },
    true,
  );

  // Header overflow menu (`popover="auto"` + `focusgroup="menu nomemory"` + progressive fallbacks)
  let menuOpen = false;
  let floatingCleanup: (() => void) | null = null;
  const menuGroup = actionsMenu?.querySelector<HTMLElement>('[focusgroup~="menu"]') ?? actionsMenu;
  const hasNativePopover = Boolean(actionsMenu && typeof (actionsMenu as HTMLElement & { showPopover?: unknown }).showPopover === 'function');
  const hasNativeInvoker = Boolean(moreTrigger && 'commandForElement' in HTMLButtonElement.prototype);
  const hasNativeFocusGroup = typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

  if (menuGroup && !hasNativeFocusGroup) {
    menuGroup.setAttribute('role', 'menu');
    menuGroup.querySelectorAll<HTMLButtonElement>('button:not([role])').forEach(btn => {
      btn.setAttribute('role', 'menuitem');
    });
  }

  function enabledMenuItems() {
    if (!menuGroup) return [];
    return [...menuGroup.querySelectorAll<HTMLButtonElement>('button')].filter(
      item => !item.disabled && item.getAttribute('aria-disabled') !== 'true' && !item.hidden,
    );
  }

  function setMenuOpen(next: boolean, focusFirst = false, restoreTrigger = false) {
    if (!actionsMenu || !moreTrigger) return;
    if (menuOpen === next) {
      if (next && focusFirst) enabledMenuItems()[0]?.focus({ preventScroll: true });
      return;
    }
    menuOpen = next;
    moreTrigger.setAttribute('aria-expanded', String(next));
    actionsMenu.dataset.open = String(next);
    if (hasNativePopover) {
      try {
        if (next && !actionsMenu.matches(':popover-open')) {
          const popoverEl = actionsMenu as HTMLElement & { showPopover(opts?: { source?: HTMLElement }): void };
          try { popoverEl.showPopover({ source: moreTrigger }); }
          catch { popoverEl.showPopover(); }
        } else if (!next && actionsMenu.matches(':popover-open')) {
          (actionsMenu as HTMLElement & { hidePopover(): void }).hidePopover();
        }
      } catch {
        // Ignore already-matching top-layer transitions.
      }
    }
    floatingCleanup?.();
    floatingCleanup = null;
    if (next && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('position-area: block-end')) {
      floatingCleanup = attachFloatingSurface(moreTrigger, actionsMenu, { placement: 'bottom-end' });
    }
    if (next && focusFirst) {
      enabledMenuItems()[0]?.focus({ preventScroll: true });
    } else if (!next && restoreTrigger) {
      moreTrigger.focus({ preventScroll: true });
    }
  }

  if (moreTrigger && actionsMenu) {
    if (hasNativePopover && !hasNativeInvoker) {
      moreTrigger.setAttribute('popovertarget', actionsMenu.id);
    } else if (!hasNativeInvoker) {
      listen(moreTrigger, 'click', event => {
        event.preventDefault();
        const keyboardActivated = (event as MouseEvent).detail === 0;
        setMenuOpen(!menuOpen, !menuOpen && keyboardActivated, menuOpen);
      });
    }

    listen(actionsMenu, 'toggle', event => {
      const next = (event as Event & { newState?: string }).newState === 'open';
      menuOpen = next;
      moreTrigger.setAttribute('aria-expanded', String(next));
      actionsMenu.dataset.open = String(next);
      floatingCleanup?.();
      floatingCleanup = null;
      if (next && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('position-area: block-end')) {
        floatingCleanup = attachFloatingSurface(moreTrigger, actionsMenu, { placement: 'bottom-end' });
      }
    });

    listen(moreTrigger, 'keydown', event => {
      const ke = event as KeyboardEvent;
      if (ke.key === 'ArrowDown') {
        ke.preventDefault();
        setMenuOpen(true, true, false);
      }
    });

    listen(
      menuGroup,
      'keydown',
      event => {
        const ke = event as KeyboardEvent;
        if (ke.key === 'Tab') {
          setMenuOpen(false, false, false);
          return;
        }
        if (ke.key === 'Escape') {
          ke.preventDefault();
          ke.stopPropagation();
          setMenuOpen(false, false, true);
          return;
        }
        if (hasNativeFocusGroup || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ke.key)) return;
        const items = enabledMenuItems();
        if (!items.length) return;
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex =
          ke.key === 'Home'
            ? 0
            : ke.key === 'End'
              ? items.length - 1
              : current < 0
                ? 0
                : (current + (ke.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        ke.preventDefault();
        ke.stopImmediatePropagation();
        items[nextIndex].focus({ preventScroll: true });
      },
      true,
    );

    listen(actionsMenu, 'click', event => {
      const item = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-menu-value]');
      if (!item || item.disabled) return;
      const value = item.dataset.menuValue!;
      const keyboardActivated = (event as MouseEvent).detail === 0;
      const toolsClosedByToggle =
        value === 'tools' && !(document.getElementById('desktop-tools') as HTMLDialogElement | null)?.open;
      setMenuOpen(false, false, toolsClosedByToggle || (keyboardActivated && value !== 'tools'));
      if (value !== 'tools') {
        options.onMenuAction?.(value, moreTrigger);
      }
    });

    listen(document, 'pointerdown', event => {
      if (!menuOpen) return;
      const target = event.target as Node | null;
      if (target && (actionsMenu.contains(target) || moreTrigger.contains(target))) return;
      setMenuOpen(false, false, false);
    });

    listen(document, 'focusin', event => {
      if (!menuOpen) return;
      const target = event.target as Node | null;
      if (target && (actionsMenu.contains(target) || moreTrigger.contains(target))) return;
      setMenuOpen(false, false, false);
    });
  }

  listen(document, 'keydown', event => {
    const ke = event as KeyboardEvent;
    if (ke.key !== 'Escape' || ke.defaultPrevented || document.querySelector('dialog:modal')) return;
    if (menuOpen) {
      ke.preventDefault();
      setMenuOpen(false, false, true);
      return;
    }
    if (activeDrawer !== null) {
      ke.preventDefault();
      closeDrawer(true);
    }
  });

  if (sidebarQuery.matches || panelQuery.matches) {
    activeDrawer = null;
  }
  sync();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    floatingCleanup?.();
    floatingCleanup = null;
    while (cleanups.length) cleanups.pop()!();
    setInert(main, false);
    setInert(sidebar, false);
    setInert(rightPanel, false);
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    rightPanel.removeAttribute('role');
    rightPanel.removeAttribute('aria-modal');
    if (backdrop) backdrop.hidden = true;
  };

  listen(window, 'pagehide', destroy, { once: true });

  return {
    togglePanel,
    openPanel,
    closePanel,
    closePanelDrawer,
    toggleSidebar,
    closeSidebarDrawer,
    isSidebarDrawerOpen: () => sidebarQuery.matches && activeDrawer === 'sidebar',
    destroy,
  };
}
