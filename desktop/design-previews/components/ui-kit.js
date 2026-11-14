/* global document, MutationObserver */
import './vendor/web-awesome/web-awesome.js';

const syncTheme = () => {
  const dark = document.body.dataset.theme === 'dark';
  document.body.classList.toggle('wa-dark', dark);
  document.body.classList.toggle('wa-light', !dark);
};
syncTheme();
new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

// Keep action semantics in one place; upstream owns disabled, focus and forms.
// Navigation and selectable result rows remain native semantic controls.
export function createActionButton(doc, label, { className = '', appearance = 'outlined', variant = 'neutral', type = 'button' } = {}) {
  const button = doc.createElement('wa-button');
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
export function bindActionMenu(menu, handler) {
  let pending = null;
  const select = event => {
    if (event.target !== menu || !event.detail?.item) return;
    pending = event.detail.item;
  };
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
