import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = requireDesktop('typescript');
const source = readFileSync(new URL('../desktop/src/preferences.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const key = 'shipmate-desktop-preferences';
const defaults = { version: 1, theme: 'system', messageSize: 16, motion: 'system' };

function harness({ stored = new Map(), dark = false, reduce = false, readFails = false, writeFails = false, buttonReady, withNotifications = false } = {}) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [], writes = [], callbacks = [];
  const events = target => {
    target.listeners = new Map();
    target.addEventListener = (name, callback) => { if (!target.listeners.has(name)) target.listeners.set(name, new Set()); target.listeners.get(name).add(callback); };
    target.removeEventListener = (name, callback) => target.listeners.get(name)?.delete(callback);
    target.fire = (name, event = {}) => { for (const callback of target.listeners.get(name) || []) callback(event); };
    return target;
  };
  document.createElement = tag => {
    const node = events(create(tag)); node.isConnected = true; node.classList = { add() {} };
    node.focus = () => { document.activeElement = node; }; node.showModal = () => { node.open = true; };
    node.scrollIntoView = options => { node.scrollRequest = options; };
    node.close = () => { node.open = false; node.fire('close'); };
    node.getAttribute = name => node.attributes[name]; nodes.push(node); return node;
  };
  document.body = document.createElement('body'); document.body.className = 'desktop-app';
  document.body.style = { values: new Map(), setProperty(name, value) { this.values.set(name, value); } };
  const window = events({});
  const systemTheme = events({ matches: dark }), systemMotion = events({ matches: reduce });
  window.matchMedia = query => query.includes('color-scheme') ? systemTheme : systemMotion;
  const storage = { getItem(name) { if (readFails) throw new Error('read denied'); return stored.get(name) ?? null; }, setItem(name, value) { if (writeFails) throw new Error('write denied'); writes.push({ name, value }); stored.set(name, value); } };
  window.localStorage = storage;
  const context = vm.createContext({ document, window, createIcon, createActionButton(doc, label) { const button = doc.createElement('wa-button'); button.textContent = label; button.updateComplete = buttonReady; return button; } });
  vm.runInContext(script, context);
  const options = Object.fromEntries(['Models', 'Data', 'Maintenance', 'Projects', 'Sources'].map(name => [`on${name}`, anchor => callbacks.push({ name, anchor, open: node('desktop-preferences').open })]));
  if (withNotifications) options.systemNotifications = { element: document.createElement('section'), open: async () => { callbacks.push({ name: 'NotificationOpen' }); }, close: () => { callbacks.push({ name: 'NotificationClose' }); }, destroy: () => { callbacks.push({ name: 'NotificationDestroy' }); } };
  const app = context.mountPreferences(options);
  const node = id => nodes.find(item => item.id === id), anchor = document.createElement('button');
  const choose = (group, value) => { const control = nodes.find(item => item.name === group && item.value === value); assert.ok(control, `${group}: ${value}`); control.checked = true; control.fire('change'); return control; };
  return { app, node, nodes, anchor, window, storage, stored, writes, callbacks, document, systemTheme, systemMotion, choose, size: () => document.body.style.values.get('--message-font-size'), selected: name => nodes.find(item => item.name === name && item.checked)?.value, click: id => node(id).fire('click'), setReadFails(value) { readFails = value; }, setWriteFails(value) { writeFails = value; } };
}

test('desktop preferences apply system defaults without writes and react to system changes', () => {
  const h = harness({ dark: true });
  assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.size(), '16px'); assert.equal(h.document.body.dataset.motion, 'system'); assert.deepEqual(h.writes, []);
  h.systemTheme.matches = false; h.systemTheme.fire('change'); assert.equal(h.document.body.dataset.theme, 'light');
  h.systemMotion.matches = true; h.systemMotion.fire('change'); assert.equal(h.document.body.dataset.motion, 'reduce');
  assert.equal(h.selected('desktop-motion'), 'system');
});

test('desktop choices persist the bounded schema and restore across a fresh mount', () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark'); h.choose('desktop-message-size', '18'); h.choose('desktop-motion', 'reduce');
  assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.size(), '18px'); assert.equal(h.document.body.dataset.motion, 'reduce');
  assert.deepEqual(JSON.parse(h.stored.get(key)), { ...defaults, theme: 'dark', messageSize: 18, motion: 'reduce' });
  assert.match(h.node('preferences-status').textContent, /已保存/);
  const restored = harness({ stored: h.stored }); assert.equal(restored.document.body.dataset.theme, 'dark'); assert.equal(restored.size(), '18px'); assert.deepEqual(restored.writes, []);
  restored.systemTheme.matches = false; restored.systemTheme.fire('change'); assert.equal(restored.document.body.dataset.theme, 'dark');
  restored.systemMotion.matches = false; restored.systemMotion.fire('change'); assert.equal(restored.document.body.dataset.motion, 'reduce');
});

test('save failure keeps the previous applied values and checked state and can retry', () => {
  const h = harness({ writeFails: true }); h.app.open(); h.choose('desktop-theme', 'dark');
  assert.equal(h.document.body.dataset.theme, 'light'); assert.equal(h.selected('desktop-theme'), 'system'); assert.equal(h.stored.has(key), false);
  assert.match(h.node('preferences-status').textContent, /未能保存.*保持/);
  h.setWriteFails(false); h.choose('desktop-theme', 'dark'); assert.equal(h.document.body.dataset.theme, 'dark'); assert.match(h.node('preferences-status').textContent, /已保存/);
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
  assert.deepEqual(JSON.parse(h.stored.get(key)), defaults); assert.equal(h.stored.get('connection-config'), 'untouched'); assert.equal(h.stored.get('shipmate-preview-theme'), 'dark'); assert.equal(h.callbacks.length, 0);
  assert.match(h.node('preferences-status').textContent, /恢复.*默认/);
});

test('failed reset retains selected appearance and stored bytes', () => {
  const original = JSON.stringify({ ...defaults, theme: 'dark' }); const h = harness({ stored: new Map([[key, original]]), writeFails: true }); h.app.open(); h.click('preferences-reset');
  assert.equal(h.stored.get(key), original); assert.equal(h.document.body.dataset.theme, 'dark'); assert.match(h.node('preferences-status').textContent, /未能保存/);
});

test('unchecked and tampered choice values do not change appearance or storage', () => {
  const h = harness(); h.app.open(); const radio = h.nodes.find(item => item.name === 'desktop-message-size' && item.value === '18');
  radio.checked = false; radio.fire('change'); assert.deepEqual(h.writes, []);
  radio.checked = true; radio.value = '999'; radio.fire('change'); assert.deepEqual(h.writes, []); assert.equal(h.size(), '16px');
});

test('cross-window events apply validated changes and clears without write-back; other stores are ignored', () => {
  const h = harness(); h.app.open();
  h.window.fire('storage', { key, storageArea: {}, newValue: JSON.stringify({ ...defaults, theme: 'dark' }) }); assert.equal(h.document.body.dataset.theme, 'light');
  h.window.fire('storage', { key, storageArea: h.storage, newValue: JSON.stringify({ ...defaults, theme: 'dark', messageSize: 14 }) }); assert.equal(h.document.body.dataset.theme, 'dark'); assert.equal(h.size(), '14px');
  h.window.fire('storage', { key, storageArea: h.storage, newValue: 'corrupt' }); assert.equal(h.document.body.dataset.theme, 'dark'); assert.match(h.node('preferences-status').textContent, /损坏/);
  h.window.fire('storage', { key: null, storageArea: h.storage, newValue: null }); assert.equal(h.document.body.dataset.theme, 'light'); assert.equal(h.size(), '16px'); assert.deepEqual(h.writes, []);
});

test('settings links close before handoff and return the persistent opener as focus anchor', () => {
  const h = harness();
  for (const [id, name] of [['models', 'Models'], ['data', 'Data'], ['maintenance', 'Maintenance'], ['projects', 'Projects'], ['sources', 'Sources']]) {
    h.app.open(h.anchor, 'connections'); h.click(`preferences-${id}`); const call = h.callbacks.at(-1);
    assert.equal(call.name, name); assert.equal(call.open, false); assert.equal(call.anchor, h.anchor);
  }
});

test('late button readiness cannot steal moved focus or focus a closed dialog', async () => {
  let finish; const ready = new Promise(resolve => { finish = resolve; }); const h = harness({ buttonReady: ready });
  h.app.open(h.anchor); const field = h.nodes.find(item => item.name === 'desktop-theme'); field.focus(); finish(); await setImmediate(); assert.equal(h.document.activeElement, field);
  h.click('preferences-done'); assert.equal(h.document.activeElement, h.anchor);
  let finishClosed; const closed = harness({ buttonReady: new Promise(resolve => { finishClosed = resolve; }) }); closed.app.open(closed.anchor); closed.click('preferences-dismiss'); finishClosed(); await setImmediate(); assert.equal(closed.document.activeElement, closed.anchor);
});

test('Escape preserves saved values and destroy removes global listeners and stale callbacks', async () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark');
  const cancel = { prevented: false, preventDefault() { this.prevented = true; } }; h.node('desktop-preferences').fire('cancel', cancel);
  if (!cancel.prevented) h.node('desktop-preferences').close(); assert.equal(h.node('desktop-preferences').open, false); assert.equal(h.document.activeElement, h.anchor);
  h.app.destroy(); assert.equal(h.document.body.children.length, 0); assert.equal(h.window.listeners.get('storage')?.size, 0); assert.equal(h.systemTheme.listeners.get('change')?.size, 0); assert.equal(h.systemMotion.listeners.get('change')?.size, 0);
  h.app.open(); await setImmediate(); assert.equal(h.node('desktop-preferences').open, false);
});

test('explicit reduced motion restores readable static status text and scopes overrides to desktop', () => {
  const css = readFileSync(new URL('../desktop/src/preferences.css', import.meta.url), 'utf8');
  assert.match(css, /body\.desktop-app\[data-motion=["']?reduce/); assert.match(css, /-webkit-text-fill-color:\s*currentColor/); assert.match(css, /animation:\s*none/); assert.match(css, /prefers|wa-transition/);
});

test('optional notification panel follows preferences open close and destroy lifecycle', async () => {
  const h = harness({ withNotifications: true }); assert.deepEqual(h.callbacks, []);
  h.app.open(h.anchor); await setImmediate(); assert.equal(h.callbacks.at(-1).name, 'NotificationOpen');
  h.click('preferences-done'); assert.equal(h.callbacks.at(-1).name, 'NotificationClose');
  h.app.open(h.anchor); h.app.destroy(); assert.equal(h.callbacks.at(-1).name, 'NotificationDestroy');
});
test('closing preferences after a compact navigation collapse restores its visible summary', async () => {
  const h = harness();
  const summary = h.document.createElement('summary'); summary.getClientRects = () => [{}];
  const navigation = h.document.createElement('details'); navigation.open = true; navigation.querySelector = selector => selector === 'summary' ? summary : null;
  h.anchor.closest = selector => selector === 'details:not([open])' && !navigation.open ? navigation : null;
  h.anchor.getClientRects = () => navigation.open ? [{}] : [];
  h.app.open(h.anchor); await setImmediate(); navigation.open = false;
  h.node('desktop-preferences').close();
  assert.equal(h.document.activeElement, summary); assert.equal(navigation.open, false); assert.equal(h.anchor.attributes['aria-expanded'], 'false');
});
test('preferences keeps the visible original opener as focus target when navigation stays expanded', async () => {
  const h = harness(); h.anchor.getClientRects = () => [{}]; h.anchor.closest = () => null;
  h.app.open(h.anchor); await setImmediate(); h.click('preferences-done');
  assert.equal(h.document.activeElement, h.anchor);
});

test('section navigation displays only the selected section with a current item and moves focus without changing settings', async () => {
  const h = harness({ withNotifications: true }); h.app.open(h.anchor); await setImmediate();
  const notificationCalls = h.callbacks.length;
  const panels = [['appearance', 'preferences-appearance', 'preferences-appearance-title'], ['notifications', 'preferences-notifications', 'preferences-notifications'], ['connections', 'preferences-connections', 'preferences-links-heading']];
  for (const [id, panelId, targetId] of panels) {
    h.node('preferences-body').scrollTop = 300;
    h.click(`preferences-nav-${id}`);
    const target = h.node(targetId);
    assert.equal(h.document.activeElement, target);
    assert.equal(h.node('preferences-body').scrollTop, 0);
    assert.equal(h.node(`preferences-nav-${id}`).attributes['aria-controls'], panelId);
    assert.equal(h.node(`preferences-nav-${id}`).attributes['aria-current'], 'page');
    for (const [otherId, otherPanel] of panels) {
      assert.equal(h.node(otherPanel).hidden, otherId !== id);
      if (otherId !== id) assert.equal(h.node(`preferences-nav-${otherId}`).attributes['aria-current'], undefined);
    }
  }
  assert.deepEqual(h.writes, []); assert.equal(h.callbacks.length, notificationCalls);
  h.click('preferences-done'); h.anchor.focus(); h.click('preferences-nav-appearance');
  assert.equal(h.document.activeElement, h.anchor);
  assert.equal(harness().node('preferences-nav-notifications'), undefined);
});

test('settings can open directly at connections and defaults back to appearance on ordinary reopen', async () => {
  const h = harness(); h.app.open(h.anchor, 'connections'); await setImmediate();
  assert.equal(h.node('preferences-heading').textContent, '设置');
  assert.equal(h.node('preferences-connections').hidden, false); assert.equal(h.node('preferences-appearance').hidden, true);
  assert.equal(h.node('preferences-nav-connections').attributes['aria-current'], 'page');
  h.click('preferences-done'); h.app.open(h.anchor); await setImmediate();
  assert.equal(h.node('preferences-appearance').hidden, false); assert.equal(h.node('preferences-connections').hidden, true);
  assert.equal(h.node('preferences-nav-appearance').attributes['aria-current'], 'page');
  h.click('preferences-models'); assert.deepEqual(h.callbacks, []); assert.equal(h.node('desktop-preferences').open, true);
  h.click('preferences-done'); h.app.open(h.anchor, 'notifications');
  assert.equal(h.node('preferences-appearance').hidden, false);
});

test('reopening settings starts at appearance while keeping persisted choices and feedback outside the scrolling content', () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark');
  h.node('preferences-body').scrollTop = 800; h.click('preferences-done'); h.app.open(h.anchor);
  assert.equal(h.node('preferences-body').scrollTop, 0);
  assert.equal(h.selected('desktop-theme'), 'dark'); assert.match(h.node('preferences-status').textContent, /已保存/);
  assert.equal(h.node('preferences-status').parentNode.parentNode.tag, 'footer');
  assert.equal(h.node('preferences-retry').parentNode, h.node('preferences-status').parentNode);
});

test('theme previews are decorative and retain the original labeled native radio groups', () => {
  const h = harness();
  for (const [value, name] of [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) {
    const radio = h.node(`desktop-theme-${value}`);
    assert.equal(radio.type, 'radio'); assert.equal(radio.name, 'desktop-theme');
    assert.equal(radio.parentNode.tag, 'label'); assert.equal(radio.parentNode.textContent, name);
    assert.equal(radio.parentNode.children[1].children[0].attributes['aria-hidden'], 'true');
  }
});
