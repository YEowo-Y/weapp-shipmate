import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../desktop/design-previews/chat.js', import.meta.url), 'utf8');

function pageFunction(name) {
  const match = source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `Page function ${name} exists`);
  return match[0];
}

// Exercise the actual page functions; native focus/popover behavior is verified in a browser.
function completionHarness() {
  const options = ['app.json', 'pages/index/index.js', 'app.config.ts'].map((text, index) => {
    const attributes = new Map();
    return {
      textContent: text, id: `file-${index}`, hidden: false,
      classList: { toggle() {} }, scrollIntoView() {},
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
    };
  });
  const empty = { hidden: true };
  const menu = {
    querySelectorAll() { return options; },
    querySelector(selector) {
      if (selector === '[data-completion-empty]') return empty;
      return options.find(option => option.getAttribute('aria-selected') === 'true') || null;
    },
  };
  const selected = [];
  const attributes = new Map();
  const context = vm.createContext({
    input: {
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); },
    },
    mentionPop: menu,
    addMention: option => selected.push(option.textContent),
    runSlash: option => selected.push(option.textContent),
  });
  const functions = ['menuItems', 'selectItem', 'filterMenu', 'activateCurrent'].map(pageFunction);
  vm.runInContext(functions.join('\n'), context);
  return { ...context, menu, options, empty, selected, attributes };
}

test('filtered completion activates the visible result and clears hidden selection', () => {
  const page = completionHarness();
  page.selectItem(page.menu);
  page.filterMenu(page.menu, 'pages');
  page.selectItem(page.menu);
  page.activateCurrent(page.menu);
  assert.deepEqual(page.selected, ['pages/index/index.js']);
  assert.equal(page.options[0].getAttribute('aria-selected'), 'false');
  assert.equal(page.attributes.get('aria-activedescendant'), 'file-1');
});

test('no matching completion clears selection and does not activate a hidden file', () => {
  const page = completionHarness();
  page.selectItem(page.menu);
  page.filterMenu(page.menu, 'no-such-file');
  page.selectItem(page.menu);
  page.activateCurrent(page.menu);
  assert.deepEqual(page.selected, []);
  assert.equal(page.attributes.has('aria-activedescendant'), false);
  assert.equal(page.empty.hidden, false);
});

test('Escape consumes only the active completion; Tab dismisses without taking focus', () => {
  const actions = [];
  const context = vm.createContext({
    completionComposing: false,
    activeMenu: () => ({}),
    setOpen: (target, open) => actions.push(['open', target, open]),
    input: { focus: () => actions.push('focus') },
  });
  vm.runInContext(pageFunction('onCompletionKeydown'), context);
  context.onCompletionKeydown({ key: 'Escape', preventDefault: () => actions.push('prevent'), stopPropagation: () => actions.push('stop') });
  assert.deepEqual(actions, ['prevent', 'stop', ['open', null, false], 'focus']);
  actions.length = 0;
  context.onCompletionKeydown({ key: 'Tab' });
  assert.deepEqual(actions, [['open', null, false]]);
  context.activeMenu = () => null;
  actions.length = 0;
  context.onCompletionKeydown({ key: 'Escape' });
  assert.deepEqual(actions, []);
});

test('IME Enter and Shift+Enter never accept a completion', () => {
  const actions = [];
  const context = vm.createContext({
    completionComposing: false, activeMenu: () => ({}),
    activateCurrent: () => actions.push('activate'),
  });
  vm.runInContext(pageFunction('onCompletionKeydown'), context);
  const enter = { key: 'Enter', preventDefault: () => actions.push('prevent') };
  context.onCompletionKeydown({ ...enter, isComposing: true });
  context.onCompletionKeydown({ ...enter, keyCode: 229 });
  context.onCompletionKeydown({ ...enter, shiftKey: true });
  context.completionComposing = true;
  context.onCompletionKeydown(enter);
  assert.deepEqual(actions, []);
});

test('mention tokens use the caret rather than the end of a later sentence', () => {
  const input = { value: '请检查 @pages 后面还有说明', selectionStart: 10, selectionEnd: 10 };
  const mentionPop = {};
  const context = vm.createContext({ input, mentionPop, slashPop: {} });
  vm.runInContext(pageFunction('completionAtCaret'), context);
  const completion = context.completionAtCaret();
  assert.equal(completion.menu, mentionPop);
  assert.equal(completion.query, 'pages');
  assert.equal(input.value.slice(completion.start, completion.end), '@pages');
  input.selectionEnd += 1;
  assert.equal(context.completionAtCaret(), null);
});

function lifecycleHarness() {
  const events = new Map();
  const document = {
    addEventListener(type, callback) { events.set(type, callback); },
    removeEventListener(type, callback) { if (events.get(type) === callback) events.delete(type); },
  };
  const makeMenu = id => {
    const handlers = new Map();
    return { id, hidden: true, opened: false, attributes: {}, dataset: {}, handlers,
      setAttribute(name, value) { this.attributes[name] = value; },
      matches() { return this.opened; },
      addEventListener(type, callback) { handlers.set(type, callback); },
      removeEventListener(type, callback) { if (handlers.get(type) === callback) handlers.delete(type); },
      showPopover() { this.opened = true; },
      hidePopover() { this.opened = false; handlers.get('beforetoggle')?.({ newState: 'closed' }); },
      querySelector() { return null; },
    };
  };
  const mentionPop = makeMenu('mentionPop'), slashPop = makeMenu('slashPop');
  const attributes = new Map(), positions = [], notices = [], calls = [];
  const input = { setAttribute(name, value) { attributes.set(name, value); }, removeAttribute(name) { attributes.delete(name); }, closest: () => ({ id: 'composer' }) };
  const context = vm.createContext({ document, mentionPop, slashPop, input, completionSurface: null,
    window: { shipmateUI: { closeMenu: options => calls.push(options.restoreFocus) } },
    attachFloatingSurface(anchor, menu, options) { const entry = { anchor, menu, options, cleaned: 0 }; positions.push(entry); return () => { entry.cleaned++; }; },
    notify: text => notices.push(text), selectItem() {},
  });
  vm.runInContext(['setOpen', 'closeCompletionSurface', 'dismissCompletionsOutside'].map(pageFunction).join('\n'), context);
  return { context, mentionPop, slashPop, attributes, positions, notices, events, calls };
}
test('completion opens a top-layer surface once and cleans subscriptions on close', () => {
  const app = lifecycleHarness(); app.context.setOpen(app.mentionPop, true);
  assert.equal(app.mentionPop.opened, true); assert.equal(app.mentionPop.attributes.popover, 'auto');
  assert.equal(app.positions[0].options.placement, 'top-start'); assert.equal(app.positions[0].options.matchWidth, true);
  app.context.setOpen(app.mentionPop, true); assert.equal(app.positions.length, 1);
  assert.equal(app.attributes.get('aria-controls'), 'mentionPop');
  assert.equal(app.mentionPop.dataset.positioned, 'false');
  app.positions[0].options.onPositioned();
  assert.equal(app.mentionPop.dataset.positioned, 'true');
  app.context.setOpen(app.mentionPop, true);
  assert.equal(app.mentionPop.dataset.positioned, 'true');
  app.context.setOpen(null, false);
  assert.equal(app.positions[0].cleaned, 1); assert.equal(app.events.size, 0);
  assert.equal(app.mentionPop.hidden, true); assert.equal(app.attributes.get('aria-expanded'), 'false');
});
test('dismissal and stale positioning callbacks cannot close a replacement completion', () => {
  const app = lifecycleHarness(); app.context.setOpen(app.mentionPop, true);
  app.context.setOpen(app.slashPop, true); assert.equal(app.positions[0].cleaned, 1);
  app.positions[0].options.onError(new Error('old'));
  assert.equal(app.slashPop.opened, true); assert.equal(app.notices.length, 0);
  app.slashPop.hidePopover(); assert.equal(app.positions[1].cleaned, 1);
  assert.equal(app.attributes.get('aria-expanded'), 'false');
  app.context.setOpen(app.mentionPop, true); app.positions[2].options.onError(new Error('current'));
  assert.equal(app.mentionPop.opened, false); assert.equal(app.notices.length, 1);
});
test('modified editing keys and native Home/End are not intercepted', () => {
  const context = vm.createContext({ completionComposing: false, activeMenu: () => ({}) });
  vm.runInContext(pageFunction('onCompletionKeydown'), context);
  for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter']) {
    for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
      context.onCompletionKeydown({ key, [modifier]: true, preventDefault() { assert.fail('Native editing key was consumed'); } });
    }
  }
  for (const key of ['Home', 'End']) context.onCompletionKeydown({ key, preventDefault() { assert.fail('Native caret movement was consumed'); } });
});

test('reference picker opens all references and focuses the composer', () => {
  const calls = [];
  const mentionPop = {};
  const context = vm.createContext({
    mentionPop,
    filterMenu: (menu, query) => calls.push(['filter', menu, query]),
    setOpen: (menu, open) => calls.push(['open', menu, open]),
    input: { focus: () => calls.push('focus') },
  });
  vm.runInContext(pageFunction('openReferencePicker'), context);
  context.openReferencePicker();
  assert.deepEqual(calls, [['filter', mentionPop, ''], ['open', mentionPop, true], 'focus']);
});

test('the removed add-menu row does not dismiss the reference picker it just opened', () => {
  const calls = [];
  const context = vm.createContext({ setOpen: (menu, open) => calls.push([menu, open]) });
  vm.runInContext(pageFunction('dismissCompletionsOutside'), context);
  context.dismissCompletionsOutside({ target: { isConnected: false, closest: () => null } });
  context.dismissCompletionsOutside({ target: { isConnected: true, closest: () => ({}) } });
  assert.deepEqual(calls, []);
  context.dismissCompletionsOutside({ target: { isConnected: true, closest: () => null } });
  assert.deepEqual(calls, [[null, false]]);
});

test('synchronous positioning failure cleans its returned observer and preserves input ownership', () => {
  const app = lifecycleHarness(); let cleaned = 0;
  app.context.attachFloatingSurface = (anchor, menu, options) => { options.onError(new Error('setup')); return () => { cleaned++; }; };
  app.context.setOpen(app.mentionPop, true);
  assert.equal(cleaned, 1); assert.equal(app.events.size, 0);
  assert.equal(app.mentionPop.opened, false); assert.equal(app.attributes.get('aria-expanded'), 'false');
  assert.equal(app.notices.length, 1);
});
test('pagehide releases the open completion and a bfcache return can open it again', () => {
  const app = lifecycleHarness(); const listeners = new Map();
  const lifecycle = [];
  app.context.scheduleHistorySave = () => lifecycle.push('schedule');
  app.context.persistence = { flush: () => lifecycle.push('flush') };
  app.context.conversation = { stop: () => lifecycle.push('stop'), destroy: () => lifecycle.push('destroy') };
  app.context.window.addEventListener = (type, listener) => listeners.set(type, listener);
  const registration = source.match(/^window.addEventListener\('pagehide', event => \{[^]*?^\}\);/m)?.[0];
  assert.ok(registration);
  vm.runInContext(`${pageFunction('closeComposerSurfaces')}\n${registration}`, app.context);
  app.context.setOpen(app.mentionPop, true); listeners.get('pagehide')({ persisted: true });
  assert.equal(app.positions[0].cleaned, 1); assert.equal(app.events.size, 0);
  assert.deepEqual(lifecycle, ['schedule', 'stop', 'flush']);
  assert.equal(app.calls.at(-1), false, 'Closing menus must not restore focus while leaving');
  app.context.setOpen(app.mentionPop, true); assert.equal(app.positions.length, 2);
  const pointer = { button: 0, target: { closest: () => ({}) }, preventDefault() { this.prevented = true; } };
  app.mentionPop.handlers.get('pointerdown')(pointer);
  assert.equal(pointer.prevented, true, 'Pointer option selection keeps the textarea focused');
  listeners.get('pagehide')({ persisted: false });
  assert.equal(app.positions[1].cleaned, 1); assert.equal(app.events.size, 0);
  assert.deepEqual(lifecycle, ['schedule', 'stop', 'flush', 'schedule', 'destroy', 'flush']);
});

test('native caret movement refreshes or closes completion without resetting menu navigation', () => {
  let updates = 0;
  const context = vm.createContext({ completionComposing: false, syncCompletions: () => { updates++; } });
  vm.runInContext(pageFunction('onCompletionKeyup'), context);
  context.onCompletionKeyup({ key: 'Home' }); context.onCompletionKeyup({ key: 'End' });
  context.onCompletionKeyup({ key: 'ArrowUp', shiftKey: true });
  assert.equal(updates, 3);
  context.onCompletionKeyup({ key: 'ArrowUp' });
  context.onCompletionKeyup({ key: 'Home', isComposing: true });
  assert.equal(updates, 3);
});
