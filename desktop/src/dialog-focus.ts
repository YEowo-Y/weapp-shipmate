import type { ActionButton } from './shared/components/ui-kit.js';

export function wrapDialogTab(dialog: HTMLDialogElement, event: KeyboardEvent) {
  if (!dialog.open || event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;

  const controls = [...dialog.querySelectorAll<HTMLElement>('button, wa-button, input, select, textarea, a[href], details > summary:first-of-type, [tabindex]')]
    .flatMap(control => {
      const isAction = control.localName === 'wa-button';
      // Web Awesome delegates focus to its shadow button. The host has no default tabIndex.
      const order = isAction && !control.hasAttribute('tabindex') ? 0 : control.tabIndex;
      if (order < 0 || control.matches(':disabled') || (isAction && (control as ActionButton).disabled)
        || control.closest('[hidden], [inert]') || !control.checkVisibility({ visibilityProperty: true })) return [];
      return [{ control, order }];
    })
    // Positive tab indices precede the remaining controls in DOM order.
    .sort((a, b) => (a.order || Number.MAX_SAFE_INTEGER) - (b.order || Number.MAX_SAFE_INTEGER));
  const first = controls[0]?.control;
  const last = controls.at(-1)?.control;
  const boundary = event.shiftKey ? first : last;
  const target = event.shiftKey ? last : first;

  if (target && dialog.ownerDocument.activeElement === boundary) {
    event.preventDefault();
    target.focus();
  }
}
