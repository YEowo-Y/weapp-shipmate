import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';

const { JSDOM } = requireDesktop('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' });
installDesktopDom(dom.window);
const { searchSettings, settingsSections } = loadDesktopModule('src/settings/catalog.ts');
const { createShortcutsStore, readSendKey, SHORTCUTS_EVENT } = loadDesktopModule('src/settings/shortcuts-store.ts');
const key = 'shipmate-desktop-shortcuts';
const stores = new Set();
afterEach(() => { for (const store of stores) store.destroy(); stores.clear(); });
after(() => dom.window.close());

function harness({ stored = new Map(), readFails = false, writeFails = false } = {}) {
  const writes = [], storage = {
    getItem(name) { if (readFails) throw Error('read denied'); return stored.get(name) ?? null; },
    setItem(name, value) { if (writeFails) throw Error('write denied'); writes.push({ name, value }); stored.set(name, value); },
  };
  Object.defineProperty(dom.window, 'localStorage', { configurable: true, value: storage });
  const store = createShortcutsStore(); stores.add(store);
  return { store, stored, storage, writes, setReadFails(value) { readFails = value; }, setWriteFails(value) { writeFails = value; },
    fireStorage(values) { const event = new dom.window.Event('storage'); for (const [name, value] of Object.entries(values)) Object.defineProperty(event, name, { value }); dom.window.dispatchEvent(event); },
  };
}

test('settings catalog provides the eight sections and searches labels, synonyms and all query terms', () => {
  assert.deepEqual(settingsSections.map(item => item.id), ['appearance', 'notifications', 'shortcuts', 'models', 'projects', 'data', 'privacy', 'about']);
  assert.deepEqual(searchSettings('   '), []);
  assert.deepEqual(searchSettings('this-setting-does-not-exist'), []);
  assert.ok(searchSettings('  API   KEY  ').some(item => item.section === 'models' && item.title === '服务商与凭据'));
  assert.ok(searchSettings('字体').some(item => item.target === 'desktop-message-size-16'));
  assert.deepEqual(searchSettings('备份 项目').map(item => item.title), ['项目备份与恢复']);
  assert.ok(searchSettings('隐私 权限').some(item => item.target === 'settings-permissions'));
  assert.ok(searchSettings('keyboard').some(item => item.section === 'shortcuts'));
});

test('settings search excludes unavailable notifications and never produces duplicate destinations', () => {
  assert.ok(searchSettings('通知').some(item => item.section === 'notifications'));
  assert.equal(searchSettings('通知', false).some(item => item.section === 'notifications'), false);
  const results = searchSettings('设置');
  assert.equal(new Set(results.map(item => item.target)).size, results.length);
});

test('send shortcut defaults preserve Enter behavior without writing device storage', () => {
  const h = harness();
  assert.equal(readSendKey(), 'enter'); assert.equal(h.store.getSnapshot().sendKey, 'enter'); assert.deepEqual(h.writes, []);
});

test('send shortcut persists only its schema and publishes a change only after saving', () => {
  const h = harness({ stored: new Map([['unrelated', 'untouched']]) });
  let changes = 0, notifications = 0;
  const changed = () => { changes++; }, unsubscribe = h.store.subscribe(() => { notifications++; });
  dom.window.addEventListener(SHORTCUTS_EVENT, changed);
  try {
    h.store.save('mod-enter');
    assert.deepEqual(JSON.parse(h.stored.get(key)), { version: 1, sendKey: 'mod-enter' });
    assert.equal(h.stored.get('unrelated'), 'untouched'); assert.equal(readSendKey(), 'mod-enter');
    assert.equal(changes, 1); assert.equal(notifications, 1); assert.match(h.store.getSnapshot().status, /已保存/);
    unsubscribe(); h.store.save('enter'); assert.equal(notifications, 1);
  } finally { dom.window.removeEventListener(SHORTCUTS_EVENT, changed); }
});

test('unknown or corrupted shortcut settings preserve bytes until explicit reset', () => {
  for (const value of ['broken', '[]', 'null', JSON.stringify({ version: 2, sendKey: 'enter' }), JSON.stringify({ version: 1, sendKey: 'shift-enter' }), JSON.stringify({ version: 1, sendKey: 'enter', extra: true })]) {
    const h = harness({ stored: new Map([[key, value], ['unrelated', 'untouched']]) });
    assert.match(h.store.getSnapshot().error, /无法读取/); assert.equal(readSendKey(), 'enter');
    h.store.save('mod-enter'); assert.equal(h.stored.get(key), value); assert.deepEqual(h.writes, []);
    h.store.reset(); assert.deepEqual(JSON.parse(h.stored.get(key)), { version: 1, sendKey: 'enter' });
    assert.equal(h.store.getSnapshot().error, ''); assert.equal(h.stored.get('unrelated'), 'untouched');
    h.store.destroy(); stores.delete(h.store);
  }
});

test('shortcut read failures can retry without overwriting the stored choice', () => {
  const h = harness({ readFails: true, stored: new Map([[key, JSON.stringify({ version: 1, sendKey: 'mod-enter' })]]) });
  assert.match(h.store.getSnapshot().error, /无法读取/); h.store.save('enter'); assert.deepEqual(h.writes, []);
  h.setReadFails(false); h.store.read();
  assert.equal(h.store.getSnapshot().sendKey, 'mod-enter'); assert.equal(h.store.getSnapshot().error, ''); assert.deepEqual(h.writes, []);
});

test('shortcut write failure keeps the previous send behavior and allows retry', () => {
  const h = harness({ writeFails: true });
  let changes = 0; const changed = () => { changes++; }; dom.window.addEventListener(SHORTCUTS_EVENT, changed);
  try {
    h.store.save('mod-enter'); assert.equal(h.store.getSnapshot().sendKey, 'enter'); assert.equal(readSendKey(), 'enter');
    assert.match(h.store.getSnapshot().status, /保存失败/); assert.equal(changes, 0);
    h.setWriteFails(false); h.store.save('mod-enter'); assert.equal(readSendKey(), 'mod-enter'); assert.equal(changes, 1);
    const bytes = h.stored.get(key); h.store.save('invalid'); assert.equal(h.stored.get(key), bytes); assert.equal(changes, 1);
  } finally { dom.window.removeEventListener(SHORTCUTS_EVENT, changed); }
});

test('corrupted cross-window shortcut data displays the actual fallback without overwriting it', () => {
  const h = harness(); h.store.save('mod-enter'); h.stored.set(key, 'corrupt');
  h.fireStorage({ key, storageArea: h.storage });
  assert.equal(h.store.getSnapshot().sendKey, readSendKey()); assert.equal(readSendKey(), 'enter');
  assert.match(h.store.getSnapshot().error, /当前使用 Enter/); assert.equal(h.stored.get(key), 'corrupt');
});

test('shortcut cross-window synchronization ignores unrelated storage and stops after disposal', () => {
  const h = harness(); let notifications = 0; h.store.subscribe(() => { notifications++; });
  h.stored.set(key, JSON.stringify({ version: 1, sendKey: 'mod-enter' }));
  h.fireStorage({ key: 'unrelated', storageArea: h.storage }); h.fireStorage({ key, storageArea: {} });
  assert.equal(h.store.getSnapshot().sendKey, 'enter'); assert.equal(notifications, 0);
  h.fireStorage({ key, storageArea: h.storage }); assert.equal(h.store.getSnapshot().sendKey, 'mod-enter');
  h.stored.delete(key); h.fireStorage({ key: null, storageArea: h.storage }); assert.equal(h.store.getSnapshot().sendKey, 'enter'); assert.equal(notifications, 2); assert.deepEqual(h.writes, []);
  h.store.destroy(); h.stored.set(key, JSON.stringify({ version: 1, sendKey: 'mod-enter' })); h.fireStorage({ key, storageArea: h.storage });
  assert.equal(h.store.getSnapshot().sendKey, 'enter'); assert.equal(notifications, 2);
});
