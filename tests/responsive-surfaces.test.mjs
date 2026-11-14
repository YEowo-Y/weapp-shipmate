import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../desktop/design-previews/responsive.js', import.meta.url), 'utf8');

test('responsive ready is emitted after initial layout, not on subsequent viewport changes', () => {
  const changes = [], order = [];
  const start = source.indexOf("  mobile.addEventListener('change'");
  vm.runInNewContext(source.slice(start, source.lastIndexOf('})();')), {
    mobile: { addEventListener(_type, callback) { changes.push(callback); } },
    compactReview: { addEventListener(_type, callback) { changes.push(callback); } },
    syncResponsiveSurfaces() { order.push('layout'); },
    document: { dispatchEvent(event) { order.push(event.type); } },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  assert.deepEqual(order, ['layout', 'shipmate:responsive-ready']);
  changes.forEach(callback => callback());
  assert.deepEqual(order, ['layout', 'shipmate:responsive-ready', 'layout', 'layout']);
});
function node() {
  const classes = new Set();
  return {
    children: [], parentNode: null, open: false,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; },
    append(child) { this.insertBefore(child, null); },
    prepend(child) { this.insertBefore(child, this.children[0]); },
    insertBefore(child, before) { child.remove(); const index = before ? this.children.indexOf(before) : this.children.length; this.children.splice(index, 0, child); child.parentNode = this; },
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
    querySelector() { return { textContent: '' }; },
  };
}
function navigationHarness(withHeader = true) {
  const nav = node(), anchor = node(), details = node(), body = node(), header = withHeader ? node() : null;
  const controls = [node(), node()]; nav.append(anchor); controls.forEach(control => nav.append(control)); details.append(body);
  const record = { nav, anchor, details, body, header, nodes: controls, mobile: false };
  const context = vm.createContext({ navigationLabel: () => 'Current', insertAfter: (anchor, child) => anchor.parentNode.insertBefore(child, anchor.nextSibling) });
  const start = source.indexOf('  function setNavigationMode(');
  vm.runInContext(source.slice(start, source.indexOf('  function createReviewSheet()', start)) + '\nthis.applyMode = setNavigationMode;', context);
  return { record, apply: value => context.applyMode(record, value) };
}
test('mobile navigation reuses controls inside the existing conversation header and restores desktop order', () => {
  const { record, apply } = navigationHarness();
  apply(true);
  assert.equal(record.details.parentNode, record.header);
  assert.deepEqual(record.body.children, record.nodes);
  assert.equal(record.nav.classList.contains('mobile-navigation-source'), true);
  record.details.open = true;
  apply(true);
  assert.equal(record.details.open, true, 'unchanged media state does not reset an open navigation');
  apply(false);
  assert.deepEqual(record.nav.children, [record.anchor, ...record.nodes]);
  assert.equal(record.details.parentNode, null);
  assert.equal(record.nav.classList.contains('mobile-navigation-source'), false);
});
test('non-conversation navigation retains its original mobile rail location', () => {
  const { record, apply } = navigationHarness(false);
  apply(true);
  assert.equal(record.details.parentNode, record.nav);
  apply(false);
  assert.deepEqual(record.nav.children, [record.anchor, ...record.nodes]);
});
test('compact review entrance joins normal composer flow and restores the desktop panel', () => {
  const parent = node(), anchor = node(), target = node(), dialog = node(), trigger = node(), shell = node(), composer = node();
  parent.append(anchor); parent.append(target); shell.append(composer);
  const review = { anchor, target, dialog, trigger, mobile: false };
  const context = vm.createContext({ review, composer, insertAfter: (anchor, child) => anchor.parentNode.insertBefore(child, anchor.nextSibling) });
  const start = source.indexOf('  function setReviewMode(');
  vm.runInContext(source.slice(start, source.indexOf('  function syncResponsiveSurfaces()', start)) + '\nthis.applyMode = setReviewMode;', context);
  context.applyMode(true);
  assert.equal(target.parentNode, dialog);
  assert.deepEqual(shell.children, [trigger, composer]);
  context.applyMode(false);
  assert.equal(target.parentNode, parent);
  assert.equal(trigger.hidden, true);
});

test('Escape dismisses expanded mobile navigation, restores summary focus and consumes the key', () => {
  const details = { open: true, addEventListener(_type, listener) { this.listener = listener; } };
  let focused = 0, prevented = 0, stopped = 0;
  const start = source.indexOf("    details.addEventListener('keydown',");
  vm.runInNewContext(source.slice(start, source.indexOf("    document.addEventListener('pointerdown'", start)), { details, summary: { focus() { focused++; } } });
  details.listener({ key: 'Escape', preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.equal(details.open, false);
  assert.deepEqual([focused, prevented, stopped], [1, 1, 1]);
  details.listener({ key: 'Escape', preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.deepEqual([focused, prevented, stopped], [1, 1, 1], 'closed navigation does not consume another surface Escape');
});

test('mobile navigation leaves composing and already handled Escape events alone', () => {
  const details = { open: true, addEventListener(_type, listener) { this.listener = listener; } };
  const start = source.indexOf("    details.addEventListener('keydown',");
  vm.runInNewContext(source.slice(start, source.indexOf("    document.addEventListener('pointerdown'", start)), {
    details, summary: { focus() { assert.fail('input method must retain focus'); } },
  });
  for (const guard of [{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }]) {
    details.listener({ key: 'Escape', ...guard, preventDefault() { assert.fail('must not consume Escape'); }, stopPropagation() { assert.fail('must not stop composing event'); } });
    assert.equal(details.open, true);
  }
});

test('navigation label follows relocated session controls and their renamed title', () => {
  let selectedTitle = '服务类目咨询', callback;
  const active = { querySelector: () => ({ textContent: selectedTitle }) };
  const nav = { classList: { contains: () => true }, querySelector: () => null };
  const body = { childNodes: [active], querySelector: () => active };
  const label = { textContent: '' };
  const context = vm.createContext({ nav, body, summary: { querySelector: () => label }, MutationObserver: class { constructor(fn) { callback = fn; } observe() {} } });
  const start = source.indexOf('  function navigationLabel(');
  vm.runInContext(source.slice(start, source.indexOf('  const navigationRecords', start)), context);
  const observerStart = source.indexOf('    new MutationObserver(');
  vm.runInContext(source.slice(observerStart, source.indexOf('    return {', observerStart)), context);
  callback();
  assert.equal(label.textContent, '服务类目咨询');
  selectedTitle = '人工重命名后的会话';
  callback();
  assert.equal(label.textContent, selectedTitle);
  body.childNodes = [];
  nav.querySelector = () => active;
  callback();
  assert.equal(label.textContent, selectedTitle, 'desktop restoration reads the original navigation');
});

test('portaled session menus and dialogs keep navigation open for focus restoration; conversation clicks dismiss it', () => {
  const details = { open: true, contains: target => target.inside === true };
  let pointerdown;
  const start = source.indexOf("    document.addEventListener('pointerdown',");
  vm.runInNewContext(source.slice(start, source.indexOf('    new MutationObserver(', start)), {
    details, mobile: { matches: true }, header: {},
    document: { addEventListener(_type, listener) { pointerdown = listener; } },
  });
  for (const surface of ['.shipmate-menu', '.shipmate-dialog', '.session-workspace-dialog', '.mobile-review-sheet']) {
    pointerdown({ target: { closest: selector => selector.split(', ').includes(surface) ? {} : null } });
    assert.equal(details.open, true, `${surface} must preserve the visible opener`);
  }
  pointerdown({ target: { inside: true, closest: () => null } });
  assert.equal(details.open, true);
  pointerdown({ target: { closest: () => null } });
  assert.equal(details.open, false, 'ordinary conversation clicks still dismiss navigation');
});

test('mobile sidebar closes for real shared task actions and stays open for history or rename', () => {
  const details = { open: true, addEventListener(_type, listener) { this.listener = listener; } };
  const mobile = { matches: true };
  const start = source.indexOf("    details.addEventListener('click',");
  vm.runInNewContext(source.slice(start, source.indexOf("    details.addEventListener('keydown',", start)), { details, mobile });
  const click = action => details.listener({ target: { closest: selector => selector.split(', ').includes(`[data-action="${action}"]`) ? {} : null } });
  for (const action of ['new', 'recent-session']) { details.open = true; click(action); assert.equal(details.open, false, action); }
  for (const action of ['history', 'rename']) { details.open = true; click(action); assert.equal(details.open, true, action); }
  mobile.matches = false; click('new'); assert.equal(details.open, true, 'desktop navigation is unaffected');
});
