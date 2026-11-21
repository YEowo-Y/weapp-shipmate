// @ts-check
/* global document, MutationObserver */
import './vendor/web-awesome/web-awesome.js';

const syncTheme = () => {
  const dark = document.body.dataset.theme === 'dark';
  document.body.classList.toggle('wa-dark', dark);
  document.body.classList.toggle('wa-light', !dark);
};
syncTheme();
new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

/** @typedef {HTMLElement & { disabled: boolean; type: string; appearance?: string; variant?: string; updateComplete?: Promise<boolean> }} ActionButton */
/** @typedef {{ value: string }} ActionMenuItem */

// Keep action semantics in one place; upstream owns disabled, focus and forms.
// Navigation and selectable result rows remain native semantic controls.
/**
 * @param {Document} doc
 * @param {string} label
 * @param {{ className?: string; appearance?: string; variant?: string; type?: string }} [options]
 * @returns {ActionButton}
 */
export function createActionButton(doc, label, { className = '', appearance = 'outlined', variant = 'neutral', type = 'button' } = {}) {
  const button = /** @type {ActionButton} */ (doc.createElement('wa-button'));
  button.className = className;
  button.textContent = label;
  button.type = type;
  button.setAttribute('size', 's');
  button.setAttribute('appearance', appearance);
  button.setAttribute('variant', variant);
  button.dataset.uiControl = 'action';
  return button;
}

// Web Awesome restores trigger focus after wa-select. Open dialogs only after
// that lifecycle has completed, so focus remains inside the new dialog.
/**
 * @param {HTMLElement} menu
 * @param {(value: string, item: ActionMenuItem) => void} handler
 */
export function bindActionMenu(menu, handler) {
  /** @type {ActionMenuItem | null} */
  let pending = null;
  /** @param {Event} event */
  const select = event => {
    if (event.target !== menu) return;
    const selection = /** @type {Event & { detail?: { item?: ActionMenuItem } }} */ (event);
    const item = selection.detail?.item;
    if (typeof item?.value === 'string') pending = item;
  };
  /** @param {Event} event */
  const hidden = event => {
    if (event.target !== menu || !pending) return;
    const item = pending;
    pending = null;
    handler(item.value, item);
  };
  menu.addEventListener('wa-select', select);
  menu.addEventListener('wa-after-hide', hidden);
  return () => {
    pending = null;
    menu.removeEventListener('wa-select', select);
    menu.removeEventListener('wa-after-hide', hidden);
  };
}
