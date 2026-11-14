import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createActionButton } from './helpers/ui-action.mjs';

const source = readFileSync(new URL('../desktop/design-previews/ui.js', import.meta.url), 'utf8');
function actual(name) {
  const match = source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
  assert.ok(match, `Actual ${name} function exists`);
  return match[0];
}

// Executes real UI handlers against a small DOM model. Native top-layer, layout,
// focus trapping and screen-reader behavior still require browser verification.
function harness() {
  const doc = { activeElement: null, dispatchEvent() {} };
  function node(tag = 'div') {
    const attributes = new Map(), listeners = new Map();
    const element = {
      tag, children: [], parentElement: null, style: {}, dataset: {}, className: '',
      disabled: false, hidden: false, open: false, textContent: '',
      get tabIndex() { return attributes.has('tabindex') ? Number(attributes.get('tabindex')) : ['button', 'input', 'select', 'textarea', 'summary'].includes(tag) || (tag === 'a' && attributes.has('href')) ? 0 : -1; },
      get isConnected() { return this === doc.body || Boolean(this.parentElement?.isConnected); },
      setAttribute(key, value) { attributes.set(key, String(value)); },
      getAttribute(key) { return attributes.get(key) ?? null; },
      removeAttribute(key) { attributes.delete(key); },
      append(...children) { children.forEach(child => { child.remove(); this.children.push(child); child.parentElement = this; }); },
      remove() { const parent = this.parentElement; if (parent) parent.children.splice(parent.children.indexOf(this), 1); this.parentElement = null; },
      contains(other) { return other === this || this.children.some(child => child.contains(other)); },
      matches(selectors) {
        return selectors.split(',').some(selector => {
          selector = selector.trim();
          if (selector === ':popover-open') return this.open && this.getAttribute('popover') === 'auto';
          if (selector === 'dialog[open]') return tag === 'dialog' && this.open;
          if (selector === '[hidden]') return this.hidden;
          if (selector === 'button:not([disabled])' || selector === 'wa-button:not([disabled])') return tag === selector.split(':')[0] && !this.disabled;
          if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
          const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
          if (attribute) return attribute[2] === undefined ? attributes.has(attribute[1]) : this.getAttribute(attribute[1]) === attribute[2];
          return tag === selector;
        });
      },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      cloneNode() { const clone = node(tag); clone.className = this.className; return clone; },
      addEventListener(type, callback, options = {}) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push({ callback, once: options.once }); },
      emit(type, fields = {}) {
        const event = { target: this, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...fields };
        for (const listener of [...(listeners.get(type) || [])]) { if (listener.once) listeners.get(type).splice(listeners.get(type).indexOf(listener), 1); listener.callback(event); }
        return event;
      },
      click() { this.emit('click'); },
      focus() { doc.activeElement = this; },
      scrollIntoView(options) { this.lastScroll = options; this.scrollCalls = (this.scrollCalls || 0) + 1; },
      getBoundingClientRect() { return { x: 20, y: 20, left: 20, right: 300, top: 20, bottom: 180, width: 280, height: 160 }; },
      getClientRects() { return this.isConnected && !this.hidden ? [this.getBoundingClientRect()] : []; },
      showPopover() { this.open = true; },
      hidePopover() { this.open = false; this.emit('toggle', { newState: 'closed' }); },
      showModal() { this.open = true; },
      close(value = '') { this.open = false; this.returnValue = value; this.emit('close'); },
      set innerHTML(html) {
        // Parse only makeDialog's constant skeleton; no general HTML renderer.
        assert.match(html, /^<div class="shipmate-dialog__head">/);
        const head = node(), copy = node(), title = node('h2'), sub = node('p'), body = node();
        head.className = 'shipmate-dialog__head'; title.className = 'shipmate-dialog__title';
        sub.className = 'shipmate-dialog__sub'; body.className = 'shipmate-dialog__body';
        title.id = html.match(/id="([^"]+-title)"/)[1]; sub.id = html.match(/id="([^"]+-description)"/)[1];
        copy.append(title, sub); head.append(copy); this.append(head, body);
      },
    };
    return element;
  }
  doc.body = node('body');
  doc.createElement = node;
  doc.querySelector = selector => doc.body.querySelector(selector);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  const bindings = [];
  const context = vm.createContext({
    document: doc, activeMenu: null, surfaceSequence: 0, menuOpenFocus: null,
    window: { getComputedStyle: () => ({ visibility: 'visible' }), innerWidth: 900, innerHeight: 600, addEventListener() {}, removeEventListener() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    createIcon: () => node('svg'), createActionButton, iconMarkup: () => '', notify() {},
    attachFloatingSurface(anchor, menu, options) {
      const binding = { anchor, menu, options, cleanups: 0 }; bindings.push(binding);
      return () => { binding.cleanups += 1; };
    },
  });
  vm.runInContext(['closeMenu', 'openMenu', 'makeDialog', 'showDialog', 'confirmAction', 'isUsableFocusTarget'].map(actual).join('\n'), context);
  const trigger = node('button'); doc.body.append(trigger); trigger.focus();
  const items = [{ label: 'Unavailable', disabled: true }, { label: 'Alpha' }, { label: 'Beta', checked: true }, { label: 'Bravo' }];
  return { ...context, doc, node, trigger, bindings, context, items,
    open(options = {}) { return context.openMenu({ trigger, label: 'Actions', items, ...options }); },
    invokerKey(key, target = trigger, extra = {}) {
      vm.runInContext(actual('onMenuInvokerKeydown'), context);
      const event = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      context.onMenuInvokerKeydown(event); return event;
    },
  };
}

test('shared menus release positioning once on dismissal and preserve new menu ownership', () => {
  const page = harness(), menu = page.open();
  assert.equal(page.bindings.length, 1);
  assert.equal(page.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(page.doc.activeElement.textContent, '', 'Label is rendered with textContent in a child');
  page.closeMenu({ restoreFocus: true });
  assert.equal(page.bindings[0].cleanups, 1);
  assert.equal(page.doc.activeElement, page.trigger);
  assert.equal(page.trigger.getAttribute('aria-expanded'), 'false');
  const next = page.open();
  menu.emit('toggle', { newState: 'closed' });
  assert.equal(page.trigger.getAttribute('aria-controls'), next.id);
  page.closeMenu();
  assert.equal(page.bindings[1].cleanups, 1);
});

test('menu navigation skips disabled items, wraps and restores focus on Escape/Tab', () => {
  const page = harness(), menu = page.open(), buttons = menu.querySelectorAll('button');
  assert.equal(page.doc.activeElement, buttons[2]);
  menu.emit('keydown', { key: 'End' }); assert.equal(page.doc.activeElement, buttons[3]);
  menu.emit('keydown', { key: 'ArrowDown' }); assert.equal(page.doc.activeElement, buttons[1]);
  menu.emit('keydown', { key: 'ArrowUp' }); assert.equal(page.doc.activeElement, buttons[3]);
  const escape = menu.emit('keydown', { key: 'Escape' });
  assert.equal(escape.stopped, true); assert.equal(page.doc.activeElement, page.trigger);
  const tab = page.open().emit('keydown', { key: 'Tab' });
  assert.equal(tab.defaultPrevented, false); assert.equal(page.doc.activeElement, page.trigger);
});

test('IME keys do not move or close menus and incremental typeahead selects labels', () => {
  const page = harness(), menu = page.open(), buttons = menu.querySelectorAll('button');
  for (const key of ['ArrowDown', 'Escape']) {
    menu.emit('keydown', { key, isComposing: true });
    menu.emit('keydown', { key, keyCode: 229 });
    assert.equal(page.doc.activeElement, buttons[2]); assert.equal(menu.isConnected, true);
  }
  menu.emit('keydown', { key: 'b' }); assert.equal(page.doc.activeElement, buttons[3]);
  menu.emit('keydown', { key: 'b' }); assert.equal(page.doc.activeElement, buttons[2]);
  menu.emit('keydown', { key: 'r' }); assert.equal(page.doc.activeElement, buttons[3]);
});

test('all menu invokers accept ArrowUp/Down and only the active modal can open menus', () => {
  const page = harness(); page.trigger.setAttribute('aria-haspopup', 'menu');
  page.trigger.addEventListener('click', () => page.open());
  page.invokerKey('ArrowUp'); assert.equal(page.doc.activeElement, page.context.activeMenu.menu.querySelectorAll('button').at(-1));
  page.closeMenu();
  page.invokerKey('ArrowDown'); assert.equal(page.doc.activeElement, page.context.activeMenu.menu.querySelectorAll('button')[1]);
  page.closeMenu();
  const modal = page.makeDialog({ title: 'Options', trigger: page.trigger }); page.showDialog(modal);
  assert.equal(page.invokerKey('ArrowDown').defaultPrevented, false); assert.equal(page.context.activeMenu, null);
  const inside = page.node('button'); inside.setAttribute('aria-haspopup', 'menu'); modal.append(inside);
  inside.addEventListener('click', () => page.open({ trigger: inside }));
  page.invokerKey('ArrowDown', inside); assert.equal(page.context.activeMenu.menu.parentElement, modal);
  modal.close(); assert.equal(page.context.activeMenu, null); assert.equal(page.bindings.at(-1).cleanups, 1);
});

test('Web Awesome menus retain keyboard ownership without legacy synthetic clicks', () => {
  const page = harness(), dropdown = page.node('wa-dropdown');
  page.doc.body.append(dropdown);
  dropdown.append(page.trigger);
  page.trigger.setAttribute('aria-haspopup', 'menu');
  let clicks = 0;
  page.trigger.addEventListener('click', () => { clicks += 1; page.open(); });
  for (const key of ['ArrowDown', 'ArrowUp']) {
    assert.equal(page.invokerKey(key).defaultPrevented, false);
  }
  assert.equal(clicks, 0);
  assert.equal(page.context.activeMenu, null);
});

test('initial menu focus is revealed after sizing without resetting later reading scroll', () => {
  const page = harness(), menu = page.open({ initialFocus: 'last' });
  const last = menu.querySelectorAll('button').at(-1);
  assert.equal(last.lastScroll, undefined);
  page.bindings[0].options.onPositioned();
  assert.equal(last.lastScroll.block, 'nearest'); assert.equal(last.lastScroll.behavior, 'instant');
  page.bindings[0].options.onPositioned(); assert.equal(last.scrollCalls, 1);
});

test('confirmation keeps long text in the scroll body, focuses cancel and resolves only on confirmation', async () => {
  const page = harness();
  const pending = page.confirmAction({ title: 'Remove session?', message: 'Long explanation '.repeat(100), trigger: page.trigger });
  const dialog = page.doc.querySelector('dialog');
  const body = dialog.querySelector('.shipmate-dialog__body');
  assert.ok(body); assert.equal(body.querySelector('.shipmate-dialog__sub').textContent.length, 1700);
  assert.equal(page.doc.activeElement.dataset.choice, 'cancel');
  dialog.close('dismiss'); assert.equal(await pending, false); assert.equal(page.doc.activeElement, page.trigger);
});

test('dialog waits for the real control to render and does not reclaim focus after dismissal', async () => {
  for (const dismissBeforeRender of [false, true]) {
    const page = harness();
    const dialog = page.makeDialog({ title: 'Confirm', trigger: page.trigger });
    const action = page.node('wa-button');
    let rendered;
    action.updateComplete = new Promise(resolve => { rendered = resolve; });
    const actualFocus = action.focus.bind(action);
    let ready = false;
    action.focus = () => { assert.equal(ready, true, 'shadow control must exist before focus'); actualFocus(); };
    dialog.append(action);
    page.showDialog(dialog, action);
    assert.notEqual(page.doc.activeElement, action);
    if (dismissBeforeRender) dialog.close();
    ready = true; rendered(); await action.updateComplete;
    assert.equal(page.doc.activeElement, dismissBeforeRender ? page.trigger : action);
  }
});

test('backdrop drag from inside does not dismiss, and removed invokers fall back to the underlying dialog', () => {
  const page = harness(), parent = page.makeDialog({ title: 'Parent', trigger: page.trigger }); page.showDialog(parent);
  const invoker = page.node('button'); parent.append(invoker);
  const child = page.makeDialog({ title: 'Child', trigger: invoker }); page.showDialog(child);
  child.emit('pointerdown', { clientX: 30, clientY: 30 }); child.emit('click', { clientX: 0, clientY: 0 }); assert.equal(child.open, true);
  invoker.remove(); child.emit('pointerdown', { clientX: 0, clientY: 0 }); child.emit('click', { clientX: 0, clientY: 0 });
  assert.equal(child.isConnected, false); assert.equal(page.doc.activeElement, parent.querySelector('wa-button'));
});

test('modal Tab wraps at usable boundaries without intercepting middle controls or popover traversal', () => {
  const page = harness(), dialog = page.makeDialog({ title: 'API Key' });
  const input = page.node('input'), hidden = page.node('wa-button'), disabled = page.node('wa-button'), last = page.node('wa-button');
  hidden.hidden = true; disabled.disabled = true;
  const inert = page.node(); inert.setAttribute('inert', ''); inert.append(page.node('button'));
  const excluded = page.node('button'); excluded.setAttribute('tabindex', '-1');
  dialog.append(input, last, hidden, disabled, inert, excluded); page.showDialog(dialog, last);
  const first = dialog.querySelector('.shipmate-dialog__close');
  assert.equal(dialog.emit('keydown', { key: 'Tab', target: last }).defaultPrevented, true);
  assert.equal(page.doc.activeElement, first);
  assert.equal(dialog.emit('keydown', { key: 'Tab', shiftKey: true, target: first }).defaultPrevented, true);
  assert.equal(page.doc.activeElement, last);
  input.focus(); assert.equal(dialog.emit('keydown', { key: 'Tab', target: input }).defaultPrevented, false);
  last.focus();
  const popover = page.node(); popover.setAttribute('popover', 'auto'); const menuItem = page.node('button'); popover.append(menuItem);
  assert.equal(dialog.emit('keydown', { key: 'Tab', target: menuItem }).defaultPrevented, false);
  assert.equal(dialog.emit('keydown', { key: 'Escape', target: last }).defaultPrevented, false);
});
