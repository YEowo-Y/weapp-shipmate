import { autoUpdate, computePosition, offset, flip, shift, size } from './vendor/floating-ui/floating-ui.dom.mjs';

// Keep positioning alive only for this open surface. A later update owns all
// DOM effects, including size middleware executed before computePosition resolves.
/**
 * @param {Element | any} anchor
 * @param {HTMLElement | any} menu
 * @param {{
 *   placement?: string;
 *   matchWidth?: boolean;
 *   onError?: (error?: unknown) => void;
 *   onPositioned?: (result?: any) => void;
 * }} [options]
 */
export function attachFloatingSurface(anchor, menu, { placement = 'bottom-end', matchWidth = false, onError = () => {}, onPositioned = () => {} } = {}) {
  let active = true;
  let revision = 0;
  let stop;
  const cleanup = () => {
    if (!active) return;
    active = false;
    revision++;
    stop?.();
  };
  async function update() {
    if (!active) return;
    const current = ++revision;
    const ownsSurface = () => active && current === revision;
    try {
      const result = await computePosition(anchor, menu, {
        strategy: 'fixed', placement,
        middleware: [offset(7), flip({ padding: 12 }), shift({ padding: 12 }), size({
          padding: 12,
          apply({ availableWidth, availableHeight, rects }) {
            if (!ownsSurface()) return;
            const width = Math.max(0, availableWidth);
            menu.style.maxWidth = `${width}px`;
            menu.style.maxHeight = `${Math.max(0, Math.min(480, availableHeight))}px`;
            if (matchWidth) menu.style.width = `${Math.max(0, Math.min(rects.reference.width, width))}px`;
          },
        })],
      });
      if (!ownsSurface()) return;
      menu.style.left = `${result.x}px`;
      menu.style.top = `${result.y}px`;
      onPositioned(result);
    } catch (error) {
      if (ownsSurface()) { cleanup(); onError(error); }
    }
  }
  try {
    stop = autoUpdate(anchor, menu, update);
    // A synchronous observer setup failure or caller cleanup may deactivate it.
    if (!active) stop?.();
  } catch (error) {
    cleanup(); onError(error);
  }
  return cleanup;
}
