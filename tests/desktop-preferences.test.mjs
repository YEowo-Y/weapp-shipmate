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

function harness({ stored = new Map(), dark = false, reduce = false, readFails = false, writeFails = false, withNotifications = false, overrides = {} } = {}) {
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
  const panels = Object.fromEntries(['models', 'projects', 'data'].map(section => {
    const element = document.createElement('section'); element.id = `test-${section}-panel`;
    const control = document.createElement('button'); control.id = `test-${section}-control`; control.textContent = section; element.append(control);
    let canClose = true;
    return [section, { element, open() { callbacks.push({ name: `${section}Open`, open: node('desktop-preferences').open }); },
      close() { callbacks.push({ name: `${section}Close` }); }, canClose: () => canClose, setCanClose(value) { canClose = value; } }];
  }));
  const options = {
    getPanel: section => panels[section],
    getPrivacy: () => ({ allowRead: false, shareResults: false, busy: false, projectName: null }),
    revokePermissions: () => { callbacks.push({ name: 'Revoke' }); },
    getVersions: () => ({ desktop: '1.0.0', core: '2.0.0', rules: null }),
    onSources: anchor => callbacks.push({ name: 'Sources', anchor, open: node('desktop-preferences').open }),
    onArchives: anchor => callbacks.push({ name: 'Archives', anchor, open: node('desktop-preferences').open }),
    onRepository: () => { callbacks.push({ name: 'Repository' }); },
    ...overrides,
  };
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
  const h = { app, node, anchor, window, storage, stored, writes, callbacks, panels, document, systemTheme, systemMotion, storageListeners, choose, selected, click, fireStorage,
    size: () => document.body.style.getPropertyValue('--message-font-size'), setReadFails(value) { readFails = value; }, setWriteFails(value) { writeFails = value; },
    close() { act(() => node('desktop-preferences').close()); },
    cleanup() { app.destroy(); window.addEventListener = add; window.removeEventListener = remove; document.body.replaceChildren(); },
  };
  activeHarness = h; return h;
}

test('version copy reports completion only after clipboard write and allows retry on failure', async () => {
  let fail = true; const writes = [];
  const h = harness({ overrides: { copyText: async text => { if (fail) throw Error('denied'); writes.push(text); } } });
  h.app.open(h.anchor, 'about'); await act(async () => { await setImmediate(); });
  h.click('settings-copy-versions'); await act(async () => { await setImmediate(); });
  assert.match(h.document.body.textContent, /复制失败/); assert.deepEqual(writes, []);
  fail = false; h.click('settings-copy-versions'); await act(async () => { await setImmediate(); });
  assert.deepEqual(writes, ['上线船友\n桌面应用 1.0.0\n检查核心 2.0.0\n项目规则 尚未加载']);
  assert.match(h.document.body.textContent, /版本信息已复制/);
});

test('About keeps full rule versions in a collapsed disclosure and copies them unchanged', async () => {
  const rules = JSON.stringify({ 'rules/review.yaml': 'a'.repeat(64), 'flow.yaml': 'b'.repeat(64) });
  const writes = [];
  const h = harness({ overrides: { getVersions: () => ({ desktop: '1.0.0', core: '2.0.0', rules }), copyText: async text => { writes.push(text); } } });
  h.app.open(h.anchor, 'about'); await act(async () => { await setImmediate(); });
  const details = h.document.querySelector('.settings-rule-version details');
  assert.equal(details.open, false); assert.equal(details.querySelector('summary').textContent, '查看规则版本');
  act(() => details.querySelector('summary').click()); assert.equal(details.open, true);
  assert.equal(details.querySelector('pre').textContent, rules);
  h.click('settings-copy-versions'); await act(async () => { await setImmediate(); });
  assert.equal(writes[0], `上线船友\n桌面应用 1.0.0\n检查核心 2.0.0\n项目规则 ${rules}`);
});

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

test('model, project and data controllers stay in the same settings dialog with one active panel', async () => {
  const h = harness(); h.app.open(h.anchor);
  for (const section of ['models', 'projects', 'data']) {
    await act(async () => { h.click(`preferences-nav-${section}`); await setImmediate(); });
    assert.equal(h.node('desktop-preferences').open, true);
    assert.equal(h.document.querySelectorAll('dialog[open]').length, 1);
    assert.equal(h.node(`test-${section}-panel`), h.panels[section].element);
    assert.equal(h.node('preferences-body').contains(h.panels[section].element), true);
    assert.equal(h.callbacks.at(-1).name, `${section}Open`);
    assert.equal(h.callbacks.at(-1).open, true);
    for (const other of ['models', 'projects', 'data'].filter(value => value !== section)) assert.equal(h.panels[other].element.isConnected, false);
  }
  assert.ok(h.callbacks.some(call => call.name === 'modelsClose')); assert.ok(h.callbacks.some(call => call.name === 'projectsClose'));
  h.click('preferences-dismiss'); assert.equal(h.callbacks.at(-1).name, 'dataClose'); assert.equal(h.document.activeElement, h.anchor);
});

test('pending opening work cannot steal moved focus or focus a closed dialog', async () => {
  const h = harness(); h.app.open(h.anchor); const field = h.node('desktop-theme-system'); field.focus(); await act(async () => { await setImmediate(); }); assert.equal(h.document.activeElement, field);
  h.click('preferences-dismiss'); assert.equal(h.document.activeElement, h.anchor); h.app.open(h.anchor); h.click('preferences-dismiss'); await act(async () => { await setImmediate(); }); assert.equal(h.document.activeElement, h.anchor);
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

test('optional notification panel activates only in its section and retains controller ownership', async () => {
  const h = harness({ withNotifications: true }); assert.deepEqual(h.callbacks, []);
  h.app.open(h.anchor); await act(async () => { await setImmediate(); }); assert.deepEqual(h.callbacks, []);
  await act(async () => { h.click('preferences-nav-notifications'); await setImmediate(); });
  const panel = h.document.querySelector('.preferences-panel-host > section');
  assert.equal(panel?.textContent, '系统通知'); assert.equal(h.callbacks.at(-1).name, 'NotificationOpen');
  h.click('preferences-nav-appearance'); assert.equal(h.callbacks.at(-1).name, 'NotificationClose'); assert.equal(panel.isConnected, false);
  await act(async () => { h.click('preferences-nav-notifications'); await setImmediate(); });
  assert.equal(h.document.querySelector('.preferences-panel-host > section'), panel);
  h.click('preferences-dismiss'); assert.equal(h.callbacks.at(-1).name, 'NotificationClose'); h.app.destroy(); assert.equal(h.callbacks.at(-1).name, 'NotificationDestroy');
});

test('closing preferences after a compact navigation collapse restores its visible summary', async () => {
  const h = harness(); const navigation = h.document.createElement('details'), summary = h.document.createElement('summary'); summary.textContent = '导航'; navigation.open = true; navigation.append(summary, h.anchor); h.document.body.append(navigation);
  h.anchor.getClientRects = () => navigation.open ? [{}] : []; summary.getClientRects = () => [{}]; h.app.open(h.anchor); await act(async () => { await setImmediate(); }); navigation.open = false; h.close();
  assert.equal(h.document.activeElement, summary); assert.equal(navigation.open, false); assert.equal(h.anchor.getAttribute('aria-expanded'), 'false');
});

test('preferences keeps the visible original opener as focus target when navigation stays expanded', async () => {
  const h = harness(); h.app.open(h.anchor); await act(async () => { await setImmediate(); }); h.click('preferences-dismiss'); assert.equal(h.document.activeElement, h.anchor);
});

test('section navigation exposes all available categories and only one active section', async () => {
  const h = harness({ withNotifications: true }); h.app.open(h.anchor);
  const sections = ['appearance', 'notifications', 'shortcuts', 'models', 'projects', 'data', 'privacy', 'about'];
  for (const section of sections) {
    h.node('preferences-body').scrollTop = 300;
    await act(async () => { h.click(`preferences-nav-${section}`); await setImmediate(); });
    assert.equal(h.node('desktop-preferences').dataset.section, section);
    assert.equal(h.document.activeElement, h.node('preferences-section-title')); assert.equal(h.node('preferences-body').scrollTop, 0);
    for (const other of sections) assert.equal(h.node(`preferences-nav-${other}`).getAttribute('aria-current'), other === section ? 'page' : null);
    assert.equal(h.document.querySelectorAll('#preferences-section-title').length, 1);
  }
  assert.deepEqual(h.writes, []); assert.equal(harness().node('preferences-nav-notifications'), null);
});

test('settings open directly at models and return to appearance on ordinary reopen', async () => {
  const h = harness(); await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  assert.equal(h.node('preferences-heading').textContent, '设置'); assert.equal(h.node('test-models-panel'), h.panels.models.element);
  assert.equal(h.node('preferences-nav-models').getAttribute('aria-current'), 'page'); assert.equal(h.node('preferences-appearance'), null);
  h.click('preferences-dismiss'); h.app.open(h.anchor);
  assert.ok(h.node('preferences-appearance')); assert.equal(h.node('test-models-panel'), null); assert.equal(h.node('preferences-nav-appearance').getAttribute('aria-current'), 'page');
  h.click('preferences-dismiss'); h.app.open(h.anchor, 'notifications'); assert.ok(h.node('preferences-appearance'));
});

test('reopening settings resets scroll and preserves automatically saved choices without a Done action', () => {
  const h = harness(); h.app.open(h.anchor); h.choose('desktop-theme', 'dark'); h.node('preferences-body').scrollTop = 800; h.click('preferences-dismiss'); h.app.open(h.anchor);
  assert.equal(h.node('preferences-body').scrollTop, 0); assert.equal(h.selected('desktop-theme'), 'dark'); assert.match(h.node('preferences-status').textContent, /已保存/);
  assert.equal(h.node('preferences-done'), null); assert.equal(h.node('preferences-body').contains(h.node('preferences-status')), true);
});

test('theme previews are decorative and theme radio choices retain accessible names', () => {
  const h = harness();
  for (const [value, name] of [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) {
    const radio = h.node(`desktop-theme-${value}`); assert.equal(radio.getAttribute('role'), 'radio'); const label = radio.closest('label') || h.document.querySelector(`label[for="${radio.id}"]`);
    assert.ok(label?.textContent.includes(name) || radio.getAttribute('aria-label') === name || radio.textContent.includes(name), `${name}: radio has its visible name`);
    const preview = label?.querySelector('.preferences-theme-preview') || radio.querySelector('.preferences-theme-preview'); assert.equal(preview?.getAttribute('aria-hidden'), 'true');
  }
});

test('settings separates persistent navigation and search from the scrolling content', () => {
  const h = harness({ withNotifications: true }); const sidebar = h.document.querySelector('.preferences-sidebar'), main = h.document.querySelector('.preferences-main');
  assert.equal(sidebar?.tagName, 'ASIDE'); assert.ok(main); assert.equal(sidebar.parentNode, main.parentNode);
  assert.ok(sidebar.contains(h.node('preferences-dismiss'))); assert.ok(sidebar.contains(h.node('preferences-heading'))); assert.ok(sidebar.contains(h.node('preferences-search'))); assert.ok(sidebar.querySelector('nav[aria-label]'));
  assert.ok(sidebar.querySelector('.preferences-sidebar-footer').contains(h.node('preferences-dismiss')));
  assert.equal(sidebar.querySelector('nav').contains(h.node('preferences-search')), false);
  assert.ok(main.contains(h.node('preferences-body'))); assert.ok(main.contains(h.node('preferences-content-dismiss'))); assert.equal(h.node('preferences-done'), null);
});

test('return to app is named, restores its opener and preserves saved choices', async () => {
  const h = harness(); h.app.open(h.anchor); const back = h.node('preferences-dismiss'); assert.match(back.textContent, /返回应用/); assert.equal(back.getAttribute('aria-label') ?? back.textContent, '返回应用');
  h.choose('desktop-message-size', '18'); const saved = h.stored.get(key), writes = h.writes.length;
  await act(async () => { h.click('preferences-nav-models'); await setImmediate(); }); h.click('preferences-dismiss');
  assert.equal(h.node('desktop-preferences').open, false); assert.equal(h.document.activeElement, h.anchor); assert.equal(h.anchor.getAttribute('aria-expanded'), 'false'); assert.equal(h.stored.get(key), saved); assert.equal(h.writes.length, writes);
  h.app.open(h.anchor); assert.equal(h.selected('desktop-message-size'), '18');
});

test('settings choice groups retain names, applicable descriptions and radio semantics', () => {
  const h = harness(); const groups = [...h.document.querySelectorAll('#desktop-preferences [role=radiogroup]')]; assert.equal(groups.length, 3);
  for (const label of h.document.querySelectorAll('#desktop-preferences label')) assert.ok(label.querySelectorAll('button,input:not([type=hidden]),select,textarea').length <= 1, 'a label cannot wrap both the Base UI button and its hidden input');
  for (const group of groups) {
    const field = group.closest('fieldset'); assert.ok(field?.querySelector('legend')?.textContent || h.node(group.getAttribute('aria-labelledby'))?.textContent, 'group has an accessible name');
    const description = group.getAttribute('aria-describedby') || field?.getAttribute('aria-describedby');
    if (group.getAttribute('aria-labelledby') === 'desktop-theme-label') assert.equal(description, null, 'self-explanatory theme previews have no dangling description');
    else assert.ok(h.node(description)?.textContent, 'reading options retain their scope explanation');
    assert.ok(group.querySelectorAll('[role=radio]').length >= 2);
  }
});

test('radio keyboard navigation changes the setting and keeps focus on the selected choice', async () => {
  const h = harness(); h.app.open(h.anchor); await act(async () => { await setImmediate(); }); const first = h.node('desktop-theme-system'); act(() => first.focus());
  await act(async () => { first.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true })); await setImmediate(); });
  assert.equal(h.document.activeElement.id, 'desktop-theme-light'); assert.equal(h.selected('desktop-theme'), 'light'); assert.equal(JSON.parse(h.stored.get(key)).theme, 'light');
});

test('dialog boundary cycles Tab between its first and last visible controls', () => {
  const h = harness(); h.app.open(h.anchor);
  const controls = [...h.node('desktop-preferences').querySelectorAll('button,input,select,textarea,a[href],wa-button,wa-switch,[tabindex="0"]')].filter(node => !node.hasAttribute('disabled') && !node.closest('[hidden]') && node.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  const pressTab = (target, shiftKey) => act(() => { target.focus(); target.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })); });
  assert.equal(first.id, 'preferences-search');
  pressTab(last, false); assert.equal(h.document.activeElement, first); pressTab(first, true); assert.equal(h.document.activeElement, last);
});

test('busy embedded changes block navigation, close actions and Escape until the controller allows leaving', async () => {
  const h = harness(); await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  h.panels.models.setCanClose(false); h.click('preferences-nav-data');
  assert.equal(h.node('desktop-preferences').dataset.section, 'models'); assert.equal(h.node('test-models-panel'), h.panels.models.element);
  assert.match(h.document.querySelector('[role=alert]').textContent, /保存|完成/); assert.equal(h.callbacks.some(call => call.name === 'dataOpen'), false);
  h.click('preferences-dismiss'); h.click('preferences-content-dismiss'); assert.equal(h.node('desktop-preferences').open, true);
  const cancel = new h.window.Event('cancel', { cancelable: true }); act(() => h.node('desktop-preferences').dispatchEvent(cancel));
  assert.equal(cancel.defaultPrevented, true); assert.equal(h.callbacks.some(call => call.name === 'modelsClose'), false);
  h.panels.models.setCanClose(true); await act(async () => { h.click('preferences-nav-data'); await setImmediate(); });
  assert.equal(h.node('desktop-preferences').dataset.section, 'data'); assert.equal(h.callbacks.filter(call => call.name === 'modelsClose').length, 1);
  h.click('preferences-content-dismiss'); assert.equal(h.node('desktop-preferences').open, false); assert.equal(h.document.activeElement, h.anchor);
});

test('late panel resolution cannot replace the latest section or open after closing', async () => {
  let finish, h;
  const pending = new Promise(resolve => { finish = resolve; });
  h = harness({ overrides: { getPanel: section => section === 'models' ? pending : h.panels[section] } });
  h.app.open(h.anchor, 'models');
  await act(async () => { h.click('preferences-nav-data'); await setImmediate(); });
  const field = h.node('test-data-control'); field.focus();
  await act(async () => { finish(h.panels.models); await setImmediate(); });
  assert.equal(h.node('desktop-preferences').dataset.section, 'data'); assert.equal(h.node('test-models-panel'), null); assert.equal(h.document.activeElement, field);
  assert.equal(h.callbacks.some(call => call.name === 'modelsOpen'), false);
  let finishClosed; const closed = new Promise(resolve => { finishClosed = resolve; });
  h = harness({ overrides: { getPanel: () => closed } }); h.app.open(h.anchor, 'models'); h.click('preferences-dismiss');
  await act(async () => { finishClosed(h.panels.models); await setImmediate(); });
  assert.equal(h.node('desktop-preferences').open, false); assert.equal(h.callbacks.some(call => call.name === 'modelsOpen'), false); assert.equal(h.document.activeElement, h.anchor);
});

test('late panel activation cannot steal focus after navigation and active disposal closes exactly once', async () => {
  const h = harness(); let finish;
  h.panels.models.open = () => new Promise(resolve => { finish = resolve; });
  await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  await act(async () => { h.click('preferences-nav-projects'); await setImmediate(); });
  const field = h.node('test-projects-control'); field.focus();
  await act(async () => { finish(); await setImmediate(); });
  assert.equal(h.node('desktop-preferences').dataset.section, 'projects'); assert.equal(h.document.activeElement, field);
  assert.equal(h.callbacks.filter(call => call.name === 'modelsClose').length, 1);
  h.app.destroy(); h.app.destroy();
  assert.equal(h.callbacks.filter(call => call.name === 'projectsClose').length, 1); assert.equal(h.node('desktop-preferences'), null); assert.equal(h.panels.projects.element.isConnected, false);
  assert.equal(h.storageListeners.size, 0);
});

test('disposal during panel resolution rejects stale activation and a failed load remains retryable', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const disposed = harness({ overrides: { getPanel: () => pending } }); disposed.app.open(disposed.anchor, 'models'); disposed.app.destroy();
  await act(async () => { finish(disposed.panels.models); await setImmediate(); });
  assert.equal(disposed.node('desktop-preferences'), null); assert.deepEqual(disposed.callbacks, []);
  let failed = true, h;
  h = harness({ overrides: { getPanel: async section => { if (failed) throw Error('读取失败'); return h.panels[section]; } } });
  await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  const alert = h.document.querySelector('[role=alert]'); assert.match(alert.textContent, /读取失败/); assert.equal(h.node('desktop-preferences').open, true);
  failed = false; await act(async () => { alert.querySelector('button').click(); await setImmediate(); });
  assert.equal(h.document.querySelector('[role=alert]'), null); assert.equal(h.node('test-models-panel'), h.panels.models.element);
});

function search(h, query) {
  act(() => {
    const input = h.node('preferences-search');
    Object.getOwnPropertyDescriptor(h.window.HTMLInputElement.prototype, 'value').set.call(input, query);
    input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  });
}

test('settings search locates a real control and retains the query for returning to its results', async () => {
  const h = harness(); h.app.open(h.anchor); search(h, '字体');
  assert.equal(h.node('preferences-section-title').textContent, '搜索结果');
  const result = [...h.document.querySelectorAll('.preferences-search-result')].find(node => node.textContent.includes('正文大小')); assert.ok(result);
  await act(async () => { result.click(); await setImmediate(); });
  assert.equal(h.node('desktop-preferences').dataset.section, 'appearance'); assert.equal(h.document.activeElement, h.node('desktop-message-size-16'));
  assert.equal(h.node('preferences-search').value, '字体'); assert.equal(h.node('desktop-message-size-16').classList.contains('settings-search-highlight'), true);
  act(() => h.document.querySelector('.preferences-back-results').click()); assert.equal(h.node('preferences-section-title').textContent, '搜索结果');
  search(h, 'no-matching-setting'); assert.match(h.document.querySelector('.preferences-results [role=status]').textContent, /未找到/); assert.equal(h.document.querySelectorAll('.preferences-search-result').length, 0);
  search(h, ''); assert.equal(h.node('preferences-section-title').textContent, '外观与阅读'); assert.deepEqual(h.writes, []);
});

test('closing search and reopening settings at a requested section starts a fresh navigation visit', async () => {
  const h = harness(); h.app.open(h.anchor); search(h, '字体'); assert.ok(h.document.querySelector('.preferences-results'));
  h.click('preferences-dismiss');
  await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  assert.equal(h.node('preferences-search').value, ''); assert.equal(h.document.querySelector('.preferences-results'), null);
  assert.equal(h.node('desktop-preferences').dataset.section, 'models'); assert.equal(h.node('test-models-panel')?.id, h.panels.models.element.id);
  search(h, 'no-matching-setting'); h.click('preferences-content-dismiss'); h.app.open(h.anchor, 'shortcuts');
  assert.equal(h.node('preferences-search').value, ''); assert.equal(h.node('preferences-section-title').textContent, '快捷键'); assert.ok(h.node('settings-send-key'));
});

test('search keeps an embedded panel connected and hidden so delayed controller updates retain their targets', async () => {
  const h = harness(); let finish;
  const status = h.document.createElement('p'); status.id = 'test-data-status'; h.panels.data.element.append(status);
  h.panels.data.open = async () => {
    await new Promise(resolve => { finish = resolve; });
    const target = h.document.getElementById('test-data-status'); assert.ok(target, 'the controller can still resolve its mounted DOM'); target.textContent = '更新完成';
  };
  await act(async () => { h.app.open(h.anchor, 'data'); await setImmediate(); });
  h.node('preferences-search').focus(); search(h, '备份');
  assert.equal(h.panels.data.element.isConnected, true); assert.ok(h.panels.data.element.closest('[hidden]')); assert.equal(h.node('test-data-status'), status);
  await act(async () => { finish(); await setImmediate(); });
  assert.equal(status.textContent, '更新完成'); assert.equal(h.document.activeElement.id, 'preferences-search');
  assert.equal(h.callbacks.some(call => call.name === 'dataClose'), false);
  h.click('preferences-nav-appearance'); assert.equal(h.callbacks.at(-1).name, 'dataClose'); assert.equal(h.panels.data.element.isConnected, false);
});

test('privacy subscriptions refresh running and permission states and unsubscribe when leaving or destroying', async () => {
  let notify, subscribed = 0, unsubscribed = 0;
  let privacy = { allowRead: true, shareResults: true, busy: true, projectName: 'Project A' };
  const h = harness({ overrides: {
    getPrivacy: () => privacy,
    subscribePrivacy(listener) { subscribed++; notify = listener; return () => { unsubscribed++; }; },
  } });
  h.app.open(h.anchor); assert.equal(subscribed, 0);
  await act(async () => { h.click('preferences-nav-privacy'); await setImmediate(); });
  assert.equal(subscribed, 1); assert.equal(h.node('settings-revoke').disabled, true); assert.match(h.node('settings-permissions').textContent, /Project A/);
  privacy = { ...privacy, busy: false };
  await act(async () => { notify(); await setImmediate(); }); assert.equal(h.node('settings-revoke').disabled, false);
  privacy = { allowRead: false, shareResults: false, busy: false, projectName: 'Project B' };
  await act(async () => { notify(); await setImmediate(); }); assert.equal(h.node('settings-revoke').disabled, true); assert.match(h.node('settings-permissions').textContent, /Project B/);
  h.click('preferences-nav-shortcuts'); assert.equal(unsubscribed, 1);
  await act(async () => { h.click('preferences-nav-privacy'); await setImmediate(); }); assert.equal(subscribed, 2);
  h.app.destroy(); assert.equal(unsubscribed, 2);
});

test('about opens the repository through the provided native action', async () => {
  const h = harness(); await act(async () => { h.app.open(h.anchor, 'about'); await setImmediate(); });
  const button = [...h.node('settings-licenses').querySelectorAll('button')].find(node => node.textContent.includes('项目源码')); assert.ok(button);
  await act(async () => { button.click(); await setImmediate(); }); assert.equal(h.callbacks.at(-1).name, 'Repository');
});

test('search waits for an embedded panel before focusing its destination', async () => {
  const h = harness(); const field = h.document.createElement('input'); field.id = 'desktop-model-search'; h.panels.models.element.append(field);
  let finish; h.panels.models.open = () => new Promise(resolve => { finish = resolve; });
  h.app.open(h.anchor); search(h, '模型目录');
  await act(async () => { h.document.querySelector('.preferences-search-result').click(); await setImmediate(); });
  assert.notEqual(h.document.activeElement, field);
  await act(async () => { finish(); await setImmediate(); });
  assert.equal(h.document.activeElement, field); assert.equal(h.node('desktop-preferences').open, true); assert.equal(field.classList.contains('settings-search-highlight'), true);
});

test('pending embedded activation preserves focus the user moved to another settings control', async () => {
  const h = harness(); let finish;
  h.panels.models.open = () => new Promise(resolve => { finish = resolve; });
  await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  const search = h.node('preferences-search'); search.focus();
  await act(async () => { finish(); await setImmediate(); });
  assert.equal(h.document.activeElement.id, search.id);
});

test('settings search cannot hide a panel that has unfinished changes', async () => {
  const h = harness(); await act(async () => { h.app.open(h.anchor, 'models'); await setImmediate(); });
  h.panels.models.setCanClose(false); search(h, '字体');
  assert.equal(h.node('test-models-panel')?.id, h.panels.models.element.id);
  assert.equal(h.document.querySelector('.preferences-results'), null); assert.equal(h.callbacks.some(call => call.name === 'modelsClose'), false);
  assert.match(h.document.querySelector('[role=alert]').textContent, /保存|完成/);
  h.panels.models.setCanClose(true); search(h, '字体 大小'); assert.ok(h.document.querySelector('.preferences-results'));
});

test('the shortcut control saves its bounded preference and restores the default explicitly', () => {
  const h = harness(); h.app.open(h.anchor, 'shortcuts'); const select = h.node('settings-send-key');
  assert.equal(select.value, 'enter');
  act(() => { select.value = 'mod-enter'; select.dispatchEvent(new h.window.Event('change', { bubbles: true })); });
  assert.equal(select.value, 'mod-enter'); assert.deepEqual(JSON.parse(h.stored.get('shipmate-desktop-shortcuts')), { version: 1, sendKey: 'mod-enter' });
  assert.equal(h.stored.has(key), false);
  const reset = [...h.document.querySelectorAll('button')].find(node => node.textContent === '恢复默认发送方式'); act(() => reset.click());
  assert.equal(select.value, 'enter'); assert.deepEqual(JSON.parse(h.stored.get('shipmate-desktop-shortcuts')), { version: 1, sendKey: 'enter' });
});

test('corrupt shortcut data disables ordinary changes and exposes explicit recovery', () => {
  const h = harness({ stored: new Map([['shipmate-desktop-shortcuts', 'broken']]) }); h.app.open(h.anchor, 'shortcuts');
  const select = h.node('settings-send-key'); assert.equal(select.disabled, true); assert.match(h.document.querySelector('[role=alert]').textContent, /无法读取/); assert.deepEqual(h.writes, []);
  const reset = [...h.document.querySelectorAll('button')].find(node => node.textContent === '恢复默认发送方式'); act(() => reset.click());
  assert.equal(select.disabled, false); assert.equal(select.value, 'enter'); assert.equal(h.document.querySelector('[role=alert]'), null);
});
