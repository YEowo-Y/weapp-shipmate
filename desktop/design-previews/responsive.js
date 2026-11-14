/* global window, document, MutationObserver, ResizeObserver, HTMLElement, CustomEvent */
// Mobile-only navigation and review surfaces for the static design previews.
// Existing interactive nodes are moved, never cloned, so their event handlers survive.
(() => {
  const mobile = window.matchMedia('(max-width: 700px)');
  const compactReview = window.matchMedia('(max-width: 1100px)');

  function insertAfter(anchor, node) {
    anchor.parentNode.insertBefore(node, anchor.nextSibling);
  }

  function navigationLabel(nav, content = nav) {
    if (nav.classList.contains('chside')) {
      const active = content.querySelector('.chitem.on, .chitem[aria-current="page"], .chitem[aria-current="true"]');
      return active?.querySelector('.chitem__t')?.textContent?.trim()
        || active?.textContent?.trim()
        || '上线预检与修复';
    }

    if (nav.classList.contains('task-rail')) return '任务与历史';
    const current = content.querySelector('.stg--cur .stg__t');
    if (current) return `当前阶段 · ${current.textContent.trim()}`;
    if (content.querySelectorAll('.stg--done').length >= 8) return '上线航程 · 8 / 8 已完成';
    return '上线航程与项目导航';
  }

  const navigationRecords = Array.from(document.querySelectorAll('.main > aside.rail, .main > aside.chside')).map((nav, index) => {
    const anchor = document.createComment(`mobile-navigation-${index}`);
    nav.insertBefore(anchor, nav.firstChild);

    const header = nav.parentNode.querySelector('.conversation-shell > .chat-head, .conversation-shell > .workspace-head');
    const details = document.createElement('details');
    details.className = 'mobile-navigation';
    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="mobile-navigation__copy">
        <span class="mobile-navigation__eyebrow">项目导航</span>
        <span class="mobile-navigation__title"></span>
      </span>
      <svg class="mobile-navigation__chevron" viewBox="0 0 24 24" aria-hidden="true">
        ${header ? '<use href="components/icons.svg#folder"></use>' : '<path d="m6 9 6 6 6-6" />'}
      </svg>`;
    summary.setAttribute('aria-label', '项目导航');
    summary.title = '项目导航';
    summary.querySelector('.mobile-navigation__title').textContent = navigationLabel(nav);

    const body = document.createElement('div');
    body.className = 'mobile-navigation__body';
    details.append(summary, body);
    details.addEventListener('click', event => {
      if (mobile.matches && event.target.closest('.chitem, #newChat, [data-action="new"], [data-action="recent-session"]')) details.open = false;
    });
    details.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
      if (event.key === 'Escape' && details.open) {
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
        summary.focus();
      }
    });
    document.addEventListener('pointerdown', event => {
      // Portaled actions still belong to this navigation; retain their focus return target.
      if (event.target.closest('.shipmate-menu, .shipmate-dialog, .session-workspace-dialog, .mobile-review-sheet')) return;
      if (mobile.matches && header && details.open && !details.contains(event.target)) details.open = false;
    });
    new MutationObserver(() => {
      summary.querySelector('.mobile-navigation__title').textContent = navigationLabel(nav, body.childNodes.length ? body : nav);
    }).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });

    return {
      anchor,
      header,
      body,
      details,
      nav,
      nodes: Array.from(nav.childNodes).filter(node => node !== anchor),
      mobile: false
    };
  });

  function setNavigationMode(record, isMobile) {
    if (record.mobile === isMobile) return;

    if (isMobile) {
      record.details.open = false;
      record.details.querySelector('.mobile-navigation__title').textContent = navigationLabel(record.nav);
      if (record.header) {
        record.header.prepend(record.details);
        record.header.classList.add('mobile-conversation-header');
        record.nav.classList.add('mobile-navigation-source');
      } else insertAfter(record.anchor, record.details);
      record.nodes.forEach(node => record.body.append(node));
    } else {
      record.nodes.forEach(node => record.nav.append(node));
      record.details.remove();
      record.nav.classList.remove('mobile-navigation-source');
      record.header?.classList.remove('mobile-conversation-header');
    }

    record.mobile = isMobile;
  }

  function createReviewSheet() {
    const target = document.querySelector('body.workspace-preview .main--3 > .side')
      || document.querySelector('.main--chat3 > .artifact');
    if (!target) return null;

    const workspace = document.body.classList.contains('workspace-preview');
    const anchor = document.createComment('mobile-review-panel');
    target.parentNode.insertBefore(anchor, target);

    const dialog = document.createElement('dialog');
    dialog.className = 'mobile-review-sheet';
    dialog.id = 'mobile-review-sheet';
    dialog.setAttribute('aria-labelledby', 'mobile-review-title');
    dialog.setAttribute('aria-describedby', 'mobile-review-description');
    dialog.innerHTML = `
      <div class="mobile-review-sheet__intro">
        <div>
          <span class="mobile-review-sheet__eyebrow">交互原型 · 当前任务</span>
          <h2 id="mobile-review-title">审阅本次改动</h2>
          <p id="mobile-review-description">查看示例差异后再决定是否批准；此原型不会写入项目。</p>
        </div>
        <button class="mobile-review-sheet__close" type="button" aria-label="关闭审批面板" title="关闭审批面板" autofocus>
          <svg class="app-icon " width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
      </div>`;

    const trigger = document.createElement('button');
    trigger.className = 'mobile-review-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', dialog.id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span><span class="mobile-review-trigger__dot"></span><span class="mobile-review-trigger__label">待审批 · 1 项改动</span></span>
      <strong>打开核对</strong>`;

    document.body.append(dialog, trigger);
    document.body.classList.add('has-mobile-review');
    const decisionHeading = target.querySelector('.side__hd, .artifact__sub');
    if (decisionHeading) {
      new MutationObserver(() => {
        trigger.querySelector('.mobile-review-trigger__label').textContent = decisionHeading.textContent.includes('待批准')
          ? '待审批 · 1 项改动' : decisionHeading.textContent;
      }).observe(decisionHeading, { childList: true, characterData: true, subtree: true });
    }

    const close = () => {
      if (dialog.open) dialog.close();
    };
    let lastOpener = trigger;
    const openReview = () => {
      lastOpener = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
      if (!compactReview.matches) {
        target.hidden = false;
        target.scrollIntoView({ block: 'nearest' });
        const control = target.querySelector('button');
        control?.focus();
        return;
      }
      if (!dialog.open) {
        window.shipmateUI?.closeMenu?.();
        document.dispatchEvent(new CustomEvent('shipmate:surface-opening'));
        target.hidden = false;
        dialog.showModal();
        trigger.setAttribute('aria-expanded', 'true');
      }
    };
    trigger.addEventListener('click', openReview);
    window.addEventListener(workspace ? 'shipmate:review-open-validated' : 'shipmate:open-review', openReview);
    if (workspace) window.addEventListener('shipmate:close-review', () => { close(); target.hidden = true; trigger.hidden = true; });
    dialog.querySelector('.mobile-review-sheet__close').addEventListener('click', close);
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    let startedOutside = false;
    dialog.addEventListener('pointerdown', event => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => {
      if (event.target === dialog && startedOutside && outside(event)) close();
    });
    dialog.addEventListener('close', () => {
      trigger.setAttribute('aria-expanded', 'false');
      if (workspace) { target.hidden = true; trigger.hidden = true; }
      if (compactReview.matches) {
        const destination = lastOpener.isConnected && lastOpener.getClientRects().length ? lastOpener : trigger;
        destination.focus();
      }
    });

    const existingClose = target.querySelector('.artifact__close, #workspaceReviewClose');
    existingClose?.addEventListener('click', () => {
      if (compactReview.matches) close();
      else {
        target.hidden = true;
        const destination = lastOpener.isConnected && lastOpener.getClientRects().length ? lastOpener : document.querySelector('#workspaceHome, #reviewButton');
        destination?.focus();
      }
    });

    return { anchor, dialog, target, trigger, mobile: false };
  }

  const review = createReviewSheet();
  const composer = document.querySelector('.conversation-shell > [data-composer-host], .conversation-shell > .composer-shell');
  const turnStatus = document.querySelector('.conversation-shell > .turn-status');
  function syncComposerReserve() {
    const shell = composer?.closest('.conversation-shell');
    const scroll = shell?.querySelector('.conversation-scroll, .conv');
    if (shell && scroll) {
      const offset = Math.ceil(shell.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom + 14);
      shell.style.setProperty('--conversation-jump-offset', `${offset}px`);
    }
    if (!composer || !compactReview.matches) {
      document.body.style.removeProperty('--conversation-composer-reserve');
      return;
    }
    const reserve = Math.ceil(window.innerHeight - composer.getBoundingClientRect().top + (turnStatus?.offsetHeight || 0) + 8);
    document.body.style.setProperty('--conversation-composer-reserve', `${reserve}px`);
  }
  if (composer) {
    const observer = new ResizeObserver(syncComposerReserve);
    observer.observe(composer);
    observer.observe(composer.closest('.conversation-shell'));
    if (turnStatus) observer.observe(turnStatus);
    window.addEventListener('resize', syncComposerReserve);
    window.addEventListener('scroll', syncComposerReserve, { passive: true });
  }

  function setReviewMode(isMobile) {
    if (!review || review.mobile === isMobile) return;

    if (isMobile) {
      review.dialog.append(review.target);
      if (composer) composer.parentNode.insertBefore(review.trigger, composer);
      review.trigger.hidden = review.target.hidden;
    } else {
      if (review.dialog.open) review.dialog.close();
      insertAfter(review.anchor, review.target);
      review.trigger.hidden = true;
    }

    review.mobile = isMobile;
  }

  function syncResponsiveSurfaces() {
    navigationRecords.forEach(record => setNavigationMode(record, mobile.matches));
    setReviewMode(compactReview.matches);
    syncComposerReserve();
  }

  mobile.addEventListener('change', syncResponsiveSurfaces);
  compactReview.addEventListener('change', syncResponsiveSurfaces);
  syncResponsiveSurfaces();
  document.dispatchEvent(new CustomEvent('shipmate:responsive-ready'));
})();
