import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';

const { JSDOM } = requireDesktop('jsdom');
const dom = new JSDOM('<!doctype html><body class="desktop-app"></body>', { url: 'http://localhost', pretendToBeVisual: true });
installDesktopDom(dom.window);
const { act } = requireDesktop('react');
const { mountPreferences } = loadDesktopModule('src/preferences.ts');
const key = 'shipmate-desktop-preferences';
const defaults = { version: 1, theme: 'system', messageSize: 16, motion: 'system' };
let activeHarness;
afterEach(() => { activeHarness?.cleanup(); activeHarness = null; });
after(() => dom.window.close());

function harness({ stored = new Map(), dark = false, reduce = false, readFails = false, writeFails = false, withNotifications = false } = {}) {
  activeHarness?.cleanup();
  const { window } = dom, { document } = window;
  document.body.replaceChildren(); document.body.removeAttribute('style'); document.body.removeAttribute('data-theme'); document.body.removeAttribute('data-motion');
  const writes = [], callbacks = [], storageListeners = new Set();
  const events = target => {
    target.listeners = new Map();
    target.addEventListener = (name, callback) => { if (!target.listeners.has(name)) target.listeners.set(name, new Set()); target.listeners.get(name).add(callback); };
    target.removeEventListener = (name, callback) => target.listeners.get(name)?.delete(callback);
    target.fire = (name, event = {}) => act(() => { for (const callback of target.listeners.get(name) || []) callback(event); });
    return target;
  };
  const systemTheme = events({ matches: dark }), systemMotion = events({ matches: reduce });
  window.matchMedia = query => query.includes('color-scheme') ? systemTheme : systemMotion;
  const storage = {
    getItem(name) { if (readFails) throw new Error('read denied'); return stored.get(name) ?? null; },
    setItem(name, value) { if (writeFails) throw new Error('write denied'); writes.push({ name, value }); stored.set(name, value); },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  window.addEventListener = (name, callback, options) => { if (name === 'storage') storageListeners.add(callback); add(name, callback, options); };
  window.removeEventListener = (name, callback, options) => { if (name === 'storage') storageListeners.delete(callback); remove(name, callback, options); };
  const node = id => document.getElementById(id);
  const anchor = document.createElement('button'); anchor.textContent = '设置'; document.body.append(anchor);
  const options = Object.fromEntries(['Models', 'Data', 'Maintenance', 'Projects', 'Sources'].map(name => [`on${name}`, anchor => callbacks.push({ name, anchor, open: node('desktop-preferences').open })]));
  if (withNotifications) {
    const element = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = '系统通知'; element.append(heading);
    options.systemNotifications = { element, open: async () => { callbacks.push({ name: 'NotificationOpen' }); }, close: () => { callbacks.push({ name: 'NotificationClose' }); }, destroy: () => { callbacks.push({ name: 'NotificationDestroy' }); } };
  }
  let mounted, destroyed = false;
  act(() => { mounted = mountPreferences(options); });
  const app = { open: (...args) => act(() => mounted.open(...args)), destroy: () => { if (!destroyed) { act(() => mounted.destroy()); destroyed = true; } } };
  const click = id => act(() => { assert.ok(node(id), `missing control ${id}`); node(id).click(); });
  const choose = (group, value) => { const control = node(`${group}-${value}`); assert.ok(control, `${group}: ${value}`); act(() => control.click()); return control; };
  const selected = name => [...document.querySelectorAll(`[id^="${name}-"][role=radio]`)].find(control => control.getAttribute('aria-checked') === 'true')?.id.slice(name.length + 1);
  const fireStorage = values => act(() => { const event = new window.Event('storage'); for (const [name, value] of Object.entries(values)) Object.defineProperty(event, name, { value }); window.dispatchEvent(event); });
  const h = { app, node, anchor, window, storage, stored, writes, callbacks, document, systemTheme, systemMotion, storageListeners, choose, selected, click, fireStorage,
    size: () => document.body.style.getPropertyValue('--message-font-size'), setReadFails(value) { readFails = value; }, setWriteFails(value) { writeFails = value; },
    close() { act(() => node('desktop-preferences').close()); },
    cleanup() { app.destroy(); window.addEventListener = add; window.removeEventListener = remove; document.body.replaceChildren(); },
  };
  activeHarness = h; return h;
}

test('desktop preferences apply system defaults without writes and react to system changes', () => {
  const h = harness({ dark: true });
  assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.size(), '16px'); assert.equal(h.document.body.dataset.motion, 'system'); assert.deepEqual(h.writes, []);
  h.systemTheme.matches = false; h.systemTheme.fire('change'); assert.equal(h.document.body.dataset.theme, 'light');
  h.systemMotion.matches = true; h.systemMotion.fire('change'); assert.equal(h.document.body.dataset.motion, 'reduce'); assert.equal(h.selected('desktop-motion'), 'system');
});

test('desktop choices persist the bounded schema and restore across a fresh React mount', () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark'); h.choose('desktop-message-size', '18'); h.choose('desktop-motion', 'reduce');
  assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.size(), '18px'); assert.equal(h.document.body.dataset.motion, 'reduce');
  assert.deepEqual(JSON.parse(h.stored.get(key)), { ...defaults, theme: 'dark', messageSize: 18, motion: 'reduce' }); assert.match(h.node('preferences-status').textContent, /已保存/);
  const restored = harness({ stored: h.stored }); assert.equal(restored.document.body.dataset.theme, 'dark'); assert.equal(restored.size(), '18px'); assert.deepEqual(restored.writes, []);
  restored.systemTheme.matches = false; restored.systemTheme.fire('change'); assert.equal(restored.document.body.dataset.theme, 'dark');
  restored.systemMotion.matches = false; restored.systemMotion.fire('change'); assert.equal(restored.document.body.dataset.motion, 'reduce');
});

test('save failure restores the controlled radio and applied appearance; selecting again can retry', () => {
  const h = harness({ writeFails: true }); h.app.open(); h.choose('desktop-theme', 'dark');
  assert.equal(h.document.body.dataset.theme, 'light'); assert.equal(h.selected('desktop-theme'), 'system'); assert.equal(h.stored.has(key), false);
  assert.equal(h.node('desktop-theme-dark').getAttribute('aria-checked'), 'false'); assert.match(h.node('preferences-status').textContent, /未能保存.*保持/);
  h.setWriteFails(false); h.choose('desktop-theme', 'dark'); assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.selected('desktop-theme'), 'dark'); assert.match(h.node('preferences-status').textContent, /已保存/);
});

test('corrupt and unknown settings cannot be overwritten by normal choices; explicit reset recovers', () => {
  for (const value of ['broken', '[]', JSON.stringify({ ...defaults, version: 2 }), JSON.stringify({ ...defaults, messageSize: '18' }), JSON.stringify({ ...defaults, unexpected: true }), JSON.stringify({ ...defaults, motion: 'full' })]) {
    const h = harness({ stored: new Map([[key, value]]) }); h.app.open();
    assert.match(h.node('preferences-status').textContent, /损坏|版本/); assert.equal(h.size(), '16px'); h.choose('desktop-theme', 'dark'); assert.deepEqual(h.writes, []);
    assert.equal(h.stored.get(key), value); h.click('preferences-reset'); assert.deepEqual(JSON.parse(h.stored.get(key)), defaults); assert.equal(h.node('preferences-status').dataset.error, 'false');
  }
});

test('storage read denial provides retry without writes; recovering reads the saved appearance', () => {
  const h = harness({ readFails: true, stored: new Map([[key, JSON.stringify({ ...defaults, theme: 'dark' })]]) }); h.app.open();
  assert.match(h.node('preferences-status').textContent, /读取/); h.choose('desktop-message-size', '18'); assert.equal(h.size(), '16px'); assert.deepEqual(h.writes, []);
  h.setReadFails(false); h.click('preferences-retry'); assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.selected('desktop-theme'), 'dark'); assert.deepEqual(h.writes, []);
});

test('reset changes only appearance and preserves all unrelated keys and data', () => {
  const stored = new Map([[key, JSON.stringify({ ...defaults, theme: 'dark', messageSize: 18, motion: 'reduce' })], ['connection-config', 'untouched'], ['shipmate-preview-theme', 'dark']]);
  const h = harness({ stored }); h.app.open(); h.click('preferences-reset');
  assert.deepEqual(JSON.parse(h.stored.get(key)), defaults); assert.equal(stored.get('connection-config'), 'untouched'); assert.equal(stored.get('shipmate-preview-theme'), 'dark'); assert.equal(h.callbacks.length, 0); assert.match(h.node('preferences-status').textContent, /恢复.*默认/);
});

test('failed reset retains selected appearance and stored bytes', () => {
  const original = JSON.stringify({ ...defaults, theme: 'dark' }); const h = harness({ stored: new Map([[key, original]]), writeFails: true }); h.app.open(); h.click('preferences-reset');
  assert.equal(h.stored.get(key), original); assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.selected('desktop-theme'), 'dark'); assert.match(h.node('preferences-status').textContent, /未能保存/);
});

test('invalid preference values never change the applied appearance or stored record', () => {
  const h = harness(); const { createPreferencesStore } = loadDesktopModule('src/settings/preferences-store.ts'); const store = createPreferencesStore(h.window, h.document);
  try {
    for (const next of [{ ...defaults, messageSize: 999 }, { ...defaults, theme: 'invalid' }, { ...defaults, motion: 'full' }, { ...defaults, version: 2 }]) act(() => store.save(next));
    assert.deepEqual(h.writes, []); assert.equal(h.size(), '16px'); assert.equal(h.document.body.dataset.theme, 'light');
  } finally { store.destroy(); }
});

test('cross-window events apply validated changes and clears without write-back; other stores are ignored', () => {
  const h = harness(); h.app.open();
  h.fireStorage({ key, storageArea: {}, newValue: JSON.stringify({ ...defaults, theme: 'dark' }) }); assert.equal(h.document.body.dataset.theme, 'light');
  h.fireStorage({ key, storageArea: h.storage, newValue: JSON.stringify({ ...defaults, theme: 'dark', messageSize: 14 }) }); assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.size(), '14px'); assert.equal(h.selected('desktop-message-size'), '14');
  h.fireStorage({ key, storageArea: h.storage, newValue: 'corrupt' }); assert.equal(h.document.body.dataset.theme, 'dark'); assert.match(h.node('preferences-status').textContent, /损坏/);
  h.fireStorage({ key: null, storageArea: h.storage, newValue: null }); assert.equal(h.document.body.dataset.theme, 'light'); assert.equal(h.size(), '16px'); assert.deepEqual(h.writes, []);
});

test('settings links close before handoff and return the persistent opener as focus anchor', () => {
  const h = harness();
  for (const [id, name] of [['models', 'Models'], ['data', 'Data'], ['maintenance', 'Maintenance'], ['projects', 'Projects'], ['sources', 'Sources']]) {
    h.app.open(h.anchor, 'connections'); h.click(`preferences-${id}`); const call = h.callbacks.at(-1); assert.equal(call.name, name); assert.equal(call.open, false); assert.equal(call.anchor, h.anchor);
  }
});

test('pending opening work cannot steal moved focus or focus a closed dialog', async () => {
  const h = harness(); h.app.open(h.anchor); const field = h.node('desktop-theme-system'); field.focus(); await act(async () => { await setImmediate(); }); assert.equal(h.document.activeElement, field);
  h.click('preferences-done'); assert.equal(h.document.activeElement, h.anchor); h.app.open(h.anchor); h.click('preferences-dismiss'); await act(async () => { await setImmediate(); }); assert.equal(h.document.activeElement, h.anchor);
});

test('Escape preserves saved values and destroy removes global listeners and stale callbacks', async () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark'); const dialog = h.node('desktop-preferences');
  act(() => { const cancel = new h.window.Event('cancel', { cancelable: true }); if (dialog.dispatchEvent(cancel)) dialog.close(); });
  assert.equal(dialog.open, false); assert.equal(h.document.activeElement, h.anchor); assert.equal(JSON.parse(h.stored.get(key)).theme, 'dark');
  h.app.destroy(); assert.equal(h.node('desktop-preferences'), null); assert.equal(h.storageListeners.size, 0); assert.equal(h.systemTheme.listeners.get('change')?.size, 0); assert.equal(h.systemMotion.listeners.get('change')?.size, 0);
  h.app.open(); await act(async () => { await setImmediate(); }); assert.equal(h.node('desktop-preferences'), null);
});

test('explicit reduced motion restores readable static status text and scopes overrides to desktop', () => {
  const css = readFileSync(new URL('../desktop/src/preferences.css', import.meta.url), 'utf8');
  assert.match(css, /body\.desktop-app\[data-motion=["']?reduce/); assert.match(css, /-webkit-text-fill-color:\s*currentColor/); assert.match(css, /animation:\s*none/); assert.match(css, /prefers|wa-transition/);
});

test('optional notification panel follows preferences open close and destroy lifecycle without being cloned', async () => {
  const h = harness({ withNotifications: true }); const panel = h.node('preferences-notifications'); assert.deepEqual(h.callbacks, []);
  h.app.open(h.anchor); await act(async () => { await setImmediate(); }); assert.equal(h.callbacks.at(-1).name, 'NotificationOpen'); h.click('preferences-nav-notifications'); assert.equal(h.node('preferences-notifications'), panel);
  h.click('preferences-done'); assert.equal(h.callbacks.at(-1).name, 'NotificationClose'); h.app.open(h.anchor); h.app.destroy(); assert.equal(h.callbacks.at(-1).name, 'NotificationDestroy');
});

test('closing preferences after a compact navigation collapse restores its visible summary', async () => {
  const h = harness(); const navigation = h.document.createElement('details'), summary = h.document.createElement('summary'); summary.textContent = '导航'; navigation.open = true; navigation.append(summary, h.anchor); h.document.body.append(navigation);
  h.anchor.getClientRects = () => navigation.open ? [{}] : []; summary.getClientRects = () => [{}]; h.app.open(h.anchor); await act(async () => { await setImmediate(); }); navigation.open = false; h.close();
  assert.equal(h.document.activeElement, summary); assert.equal(navigation.open, false); assert.equal(h.anchor.getAttribute('aria-expanded'), 'false');
});

test('preferences keeps the visible original opener as focus target when navigation stays expanded', async () => {
  const h = harness(); h.app.open(h.anchor); await act(async () => { await setImmediate(); }); h.click('preferences-done'); assert.equal(h.document.activeElement, h.anchor);
});

test('section navigation displays one current section and moves focus without changing settings', async () => {
  const h = harness({ withNotifications: true }); h.app.open(h.anchor); await act(async () => { await setImmediate(); }); const notificationCalls = h.callbacks.length;
  const panels = [['appearance', 'preferences-appearance', 'preferences-appearance-title'], ['notifications', 'preferences-notifications', 'preferences-notifications'], ['connections', 'preferences-connections', 'preferences-links-heading']];
  for (const [id, panelId, targetId] of panels) {
    h.node('preferences-body').scrollTop = 300; h.click(`preferences-nav-${id}`); assert.equal(h.document.activeElement, h.node(targetId)); assert.equal(h.node('preferences-body').scrollTop, 0);
    assert.equal(h.node(`preferences-nav-${id}`).getAttribute('aria-controls'), panelId); assert.equal(h.node(`preferences-nav-${id}`).getAttribute('aria-current'), 'page');
    for (const [otherId, otherPanel] of panels) { assert.equal(h.node(otherPanel).hidden, otherId !== id); if (otherId !== id) assert.equal(h.node(`preferences-nav-${otherId}`).getAttribute('aria-current'), null); }
  }
  assert.deepEqual(h.writes, []); assert.equal(h.callbacks.length, notificationCalls); h.click('preferences-done'); h.anchor.focus(); h.click('preferences-nav-appearance'); assert.equal(h.document.activeElement, h.anchor);
  assert.equal(harness().node('preferences-nav-notifications'), null);
});

test('settings can open directly at connections and defaults back to appearance on ordinary reopen', () => {
  const h = harness(); h.app.open(h.anchor, 'connections'); assert.equal(h.node('preferences-heading').textContent, '设置'); assert.equal(h.node('preferences-connections').hidden, false); assert.equal(h.node('preferences-appearance').hidden, true);
  assert.equal(h.node('preferences-nav-connections').getAttribute('aria-current'), 'page'); h.click('preferences-done'); h.app.open(h.anchor);
  assert.equal(h.node('preferences-appearance').hidden, false); assert.equal(h.node('preferences-connections').hidden, true); assert.equal(h.node('preferences-nav-appearance').getAttribute('aria-current'), 'page');
  h.click('preferences-models'); assert.deepEqual(h.callbacks, []); assert.equal(h.node('desktop-preferences').open, true); h.click('preferences-done'); h.app.open(h.anchor, 'notifications'); assert.equal(h.node('preferences-appearance').hidden, false);
});

test('reopening settings resets scroll while preserving choices and persistent feedback', () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark'); h.node('preferences-body').scrollTop = 800; h.click('preferences-done'); h.app.open(h.anchor);
  assert.equal(h.node('preferences-body').scrollTop, 0); assert.equal(h.selected('desktop-theme'), 'dark'); assert.match(h.node('preferences-status').textContent, /已保存/);
  assert.ok(h.node('preferences-status').closest('footer')); assert.equal(h.node('preferences-body').contains(h.node('preferences-status')), false); assert.equal(h.node('preferences-retry').parentNode, h.node('preferences-status').parentNode);
});

test('theme previews are decorative and theme radio choices retain accessible names', () => {
  const h = harness();
  for (const [value, name] of [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) {
    const radio = h.node(`desktop-theme-${value}`); assert.equal(radio.getAttribute('role'), 'radio'); const label = radio.closest('label') || h.document.querySelector(`label[for="${radio.id}"]`);
    assert.ok(label?.textContent.includes(name) || radio.getAttribute('aria-label') === name || radio.textContent.includes(name), `${name}: radio has its visible name`);
    const preview = label?.querySelector('.preferences-theme-preview') || radio.querySelector('.preferences-theme-preview'); assert.equal(preview?.getAttribute('aria-hidden'), 'true');
  }
});

test('settings separates persistent navigation from its scrolling content and footer', () => {
  const h = harness({ withNotifications: true }); const sidebar = h.document.querySelector('.preferences-sidebar'), main = h.document.querySelector('.preferences-main');
  assert.equal(sidebar?.tagName, 'ASIDE'); assert.ok(main); assert.equal(sidebar.parentNode, main.parentNode); assert.ok(sidebar.contains(h.node('preferences-dismiss'))); assert.ok(sidebar.contains(h.node('preferences-heading'))); assert.ok(sidebar.querySelector('nav[aria-label]'));
  assert.ok(main.contains(h.node('preferences-body'))); assert.ok(main.contains(h.node('preferences-done'))); assert.ok(main.contains(h.node('preferences-status')));
});

test('return to app is named, restores its opener and preserves saved choices', () => {
  const h = harness(); h.app.open(h.anchor); const back = h.node('preferences-dismiss'); assert.match(back.textContent, /返回应用/); assert.equal(back.getAttribute('aria-label') ?? back.textContent, '返回应用');
  h.choose('desktop-message-size', '18'); const saved = h.stored.get(key), writes = h.writes.length; h.click('preferences-nav-connections'); h.click('preferences-dismiss');
  assert.equal(h.node('desktop-preferences').open, false); assert.equal(h.document.activeElement, h.anchor); assert.equal(h.anchor.getAttribute('aria-expanded'), 'false'); assert.equal(h.stored.get(key), saved); assert.equal(h.writes.length, writes); assert.deepEqual(h.callbacks, []);
  h.app.open(h.anchor); assert.equal(h.selected('desktop-message-size'), '18');
});

test('all settings choice groups retain visible names, explanatory text and radio semantics', () => {
  const h = harness(); const groups = [...h.document.querySelectorAll('#desktop-preferences [role=radiogroup]')]; assert.equal(groups.length, 3);
  for (const label of h.document.querySelectorAll('#desktop-preferences label')) assert.ok(label.querySelectorAll('button,input:not([type=hidden]),select,textarea').length <= 1, 'a label cannot wrap both the Base UI button and its hidden input');
  for (const group of groups) {
    const field = group.closest('fieldset'); assert.ok(field?.querySelector('legend')?.textContent || h.node(group.getAttribute('aria-labelledby'))?.textContent, 'group has an accessible name');
    const description = group.getAttribute('aria-describedby') || field?.getAttribute('aria-describedby'); assert.ok(h.node(description)?.textContent, 'group exposes its explanation'); assert.ok(group.querySelectorAll('[role=radio]').length >= 2);
  }
});

test('radio keyboard navigation changes the setting and keeps focus on the selected choice', async () => {
  const h = harness(); h.app.open(h.anchor); await act(async () => { await setImmediate(); }); const first = h.node('desktop-theme-system'); act(() => first.focus());
  await act(async () => { first.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true })); await setImmediate(); });
  assert.equal(h.document.activeElement.id, 'desktop-theme-light'); assert.equal(h.selected('desktop-theme'), 'light'); assert.equal(JSON.parse(h.stored.get(key)).theme, 'light');
});

test('dialog boundary cycles Tab in both directions between the named return and done actions', () => {
  const h = harness(); h.app.open(h.anchor); const pressTab = (target, shiftKey) => act(() => { target.focus(); target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })); });
  pressTab(h.node('preferences-done'), false); assert.equal(h.document.activeElement, h.node('preferences-dismiss')); pressTab(h.node('preferences-dismiss'), true); assert.equal(h.document.activeElement, h.node('preferences-done'));
});
