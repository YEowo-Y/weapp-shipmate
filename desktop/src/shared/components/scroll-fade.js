// @ts-check
// Scroll-edge fade adapted from Caho1/open-claude-ui (MIT) code-examples/ScrollFadeContainer.tsx
// at c1f923ae. Upstream re-renders React state per scroll; here a single delegated
// controller toggles data attributes and CSS owns the 7-stop mask (see src/product-polish.css 8a).
// An edge only fades when content is actually hidden beyond it, so short regions
// and the reading start/end stay fully crisp.

const EDGE_TOLERANCE = 2;
/** @type {ReadonlyArray<readonly [selector: string, orientation: string]>} */
export const SCROLL_FADE_SELECTORS = Object.freeze([
  ['#desktopScroll', 'y'],
  ['.session-workspace__recent', 'y'],
  ['.desktop-tools-body', 'y'],
  ['.desktop-picker-list', 'y'],
  ['.desktop-model-list', 'y'],
  ['.tool-result-json', 'y'],
  ['.markdown-code pre', 'x'],
  ['.markdown-table', 'x'],
]);

/**
 * @param {HTMLElement} element
 * @param {string} name
 * @param {boolean} on
 */
function setFlag(element, name, on) {
  if (on) element.setAttribute(name, '');
  else element.removeAttribute(name);
}

/**
 * Pure edge computation.
 * @param {Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'scrollLeft' | 'scrollWidth' | 'clientHeight' | 'clientWidth'>} metrics
 */
export function getScrollFadeEdges(metrics, orientation = 'y') {
  const edges = { top: false, bottom: false, left: false, right: false };
  if (orientation === 'y' || orientation === 'both') {
    edges.top = metrics.scrollTop > EDGE_TOLERANCE;
    edges.bottom = metrics.scrollTop + metrics.clientHeight < metrics.scrollHeight - EDGE_TOLERANCE;
  }
  if (orientation === 'x' || orientation === 'both') {
    const left = Math.abs(metrics.scrollLeft || 0);
    edges.left = left > EDGE_TOLERANCE;
    edges.right = left + metrics.clientWidth < metrics.scrollWidth - EDGE_TOLERANCE;
  }
  return edges;
}

/** @param {HTMLElement} element */
export function updateScrollFade(element) {
  const orientation = element.dataset.scrollFade;
  if (!orientation) return;
  const edges = getScrollFadeEdges(element, orientation);
  setFlag(element, 'data-fade-top', edges.top);
  setFlag(element, 'data-fade-bottom', edges.bottom);
  setFlag(element, 'data-fade-left', edges.left);
  setFlag(element, 'data-fade-right', edges.right);
}

/**
 * Attach fades to every current and future matching scroll region below root.
 * Returns a disposer. Missing browser observers degrade to scroll-only updates.
 * @param {HTMLElement} root
 */
export function mountScrollFades(root, selectors = SCROLL_FADE_SELECTORS) {
  const view = root?.ownerDocument?.defaultView;
  if (!root || !view) return () => {};
  /** @type {Set<HTMLElement>} */
  const tracked = new Set();
  // Scroll-driven animations (CSS, see product-polish.css 8a) own the edges when
  // supported; then this controller only tags regions and never runs per scroll.
  const cssDriven = Boolean(view.CSS?.supports?.('animation-timeline: scroll(self block)'));
  const resize = !cssDriven && view.ResizeObserver ? new view.ResizeObserver(entries => {
    for (const entry of entries) updateScrollFade(/** @type {HTMLElement} */ (entry.target));
  }) : null;
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = view.requestAnimationFrame(() => { frame = 0; scan(); });
  };
  function scan() {
    for (const element of tracked) if (!element.isConnected) { tracked.delete(element); resize?.unobserve(element); }
    for (const [selector, orientation] of selectors) {
      for (const element of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(selector))) {
        if (!tracked.has(element)) {
          tracked.add(element);
          element.dataset.scrollFade = orientation;
          resize?.observe(element);
        }
      }
    }
    // Streaming text changes scrollHeight without resizing the viewport.
    if (!cssDriven) for (const element of tracked) updateScrollFade(element);
  }
  /** @param {Event} event */
  const onScroll = event => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (target?.dataset?.scrollFade) updateScrollFade(target);
  };
  if (!cssDriven) root.addEventListener('scroll', onScroll, { capture: true, passive: true });
  const mutations = view.MutationObserver ? new view.MutationObserver(schedule) : null;
  mutations?.observe(root, cssDriven
    ? { childList: true, subtree: true }
    : { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  scan();
  return () => {
    root.removeEventListener('scroll', onScroll, { capture: true });
    mutations?.disconnect(); resize?.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    tracked.clear();
  };
}
