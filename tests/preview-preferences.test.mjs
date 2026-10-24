import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../desktop/design-previews/preview.js', import.meta.url), 'utf8');
const THEME = 'shipmate-preview-theme';
const SIZE = 'shipmate-preview-message-size';

function harness({ stored = new Map(), storageFails = false, path = 'settings.html', ownReturn = true } = {}) {
  function node() {
    const attributes = new Map();
    const events = new Map();
    const classes = new Set();
    return {
      textContent: '', value: '', checked: false, children: [], attributes, events,
      style: { values: new Map(), setProperty(key, value) { this.values.set(key, value); } },
      classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: key => attributes.get(key),
      addEventListener: (key, fn) => events.set(key, fn),
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      insertBefore(child) { this.children.push(child); },
      querySelector: () => null,
      fire: (type, event = {}) => events.get(type)?.(event),
    };
  }
  const theme = ['system', 'light', 'dark'].map(value => Object.assign(node(), { value }));
  const sizes = ['14', '16', '18'].map(value => Object.assign(node(), { value }));
  const body = node();
  const chrome = node();
  const feedback = node();
  const themeButton = node();
  const window = node();
  const system = Object.assign(node(), { matches: false });
  const writes = [];
  const localStorage = {
    getItem(key) { if (storageFails) throw new Error('storage denied'); return stored.get(key) ?? null; },
    setItem(key, value) { if (storageFails) throw new Error('storage denied'); writes.push([key, value]); stored.set(key, value); },
  };
  const document = {
    body, head: node(), createElement: node,
    querySelector: selector => selector === '.chrome' ? chrome : selector === '[data-settings-return]' && ownReturn ? node() : null,
    getElementById: id => id === 'appearance-feedback' && path === 'settings.html' ? feedback : id === 'themeBtn' ? themeButton : null,
    querySelectorAll: selector => selector === 'input[name="theme"]' ? theme : selector === 'input[name="font-size"]' ? sizes : [],
    addEventListener() {},
  };
  vm.runInNewContext(source, {
    document, window, location: { pathname: '/' + path }, localStorage,
    matchMedia: () => system, MutationObserver: class { observe() {} },
    setTimeout: () => 1, clearTimeout() {},
  });
  return { api: window.shipmatePreview, window, body, chrome, feedback, theme, themeButton, sizes, system, writes, stored, localStorage,
    size: () => body.style.values.get('--message-font-size'),
  };
}

test('appearance preferences restore across pages without overwriting storage on startup', () => {
  const stored = new Map([[THEME, 'dark'], [SIZE, '18']]);
  for (const path of ['settings.html', 'chat-full.html', 'main-four-region.html']) {
    const h = harness({ stored, path });
    assert.equal(h.body.getAttribute('data-theme'), 'dark');
    assert.equal(h.size(), '18px');
    assert.equal(h.sizes.find(control => control.checked)?.value, '18');
    assert.deepEqual(h.writes, []);
  }
});

test('real rejection lookup is identified as local rules rather than fixture data', () => {
  const h = harness({ path: 'explain.html' });
  const status = h.chrome.children.find(node => node.className === 'preview-status');
  assert.equal(status.textContent, '本地规则查询');
  assert.match(status.getAttribute('aria-label'), /未实时核验/);
});

test('font size controls apply only checked valid values and keep changes after reload', () => {
  const h = harness();
  const large = h.sizes[2];
  large.fire('change');
  assert.equal(h.size(), '16px');
  large.checked = true;
  large.fire('change');
  assert.equal(h.size(), '18px');
  assert.equal(h.stored.get(SIZE), '18');
  assert.match(h.feedback.textContent, /已保存在本机/);
  assert.equal(harness({ stored: h.stored }).size(), '18px');
  for (const invalid of ['300', 'url(evil)', '__proto__', 18, null]) h.api.setFontSize(invalid);
  assert.equal(h.size(), '18px');
  assert.equal(h.writes.length, 1);
});

test('blocked storage keeps the current preference usable and reports that it was not saved', () => {
  const h = harness({ storageFails: true });
  assert.equal(h.size(), '16px');
  h.api.setFontSize('14');
  assert.equal(h.size(), '14px');
  assert.match(h.feedback.textContent, /未能保存/);
  h.api.setTheme('dark');
  assert.equal(h.body.getAttribute('data-theme'), 'dark');
  assert.match(h.feedback.textContent, /仅本页生效/);
});

test('the header theme action reports save failures even outside the appearance panel', () => {
  for (const path of ['settings.html', 'chat-full.html', 'memory.html']) {
    const h = harness({ path, storageFails: true });
    // The default settings panel is models; its appearance status is not visible.
    h.feedback.hidden = true;
    h.themeButton.fire('click');
    const toast = h.body.children.find(child => child.className === 'preview-toast');
    assert.equal(toast.classList.contains('show'), true);
    assert.match(toast.textContent, /未能保存/);
    assert.equal(h.body.getAttribute('data-theme'), 'dark');
  }
});

test('cross-page storage updates apply and reset preferences without write-back loops', () => {
  const h = harness({ stored: new Map([[SIZE, '18'], [THEME, 'dark']]) });
  h.window.fire('storage', { storageArea: h.localStorage, key: SIZE, newValue: '14' });
  assert.equal(h.size(), '14px');
  h.window.fire('storage', { storageArea: h.localStorage, key: THEME, newValue: 'system' });
  h.system.matches = true;
  h.system.fire('change');
  assert.equal(h.body.getAttribute('data-theme'), 'dark');
  h.window.fire('storage', { storageArea: {}, key: SIZE, newValue: '18' });
  assert.equal(h.size(), '14px');
  h.window.fire('storage', { storageArea: h.localStorage, key: SIZE, newValue: '999px' });
  assert.equal(h.size(), '16px');
  h.window.fire('storage', { storageArea: h.localStorage, key: null, newValue: null });
  assert.equal(h.theme.find(control => control.checked)?.value, 'system');
  assert.equal(h.size(), '16px');
  assert.deepEqual(h.writes, []);
});

test('a page with its own return path does not gain a second generic workbench link', () => {
  const settings = harness();
  assert.equal(settings.chrome.children.filter(child => child.className === 'preview-index-link').length, 0);
  assert.equal(settings.chrome.children.filter(child => child.className === 'preview-status').length, 1);
  const other = harness({ path: 'memory.html', ownReturn: false });
  assert.equal(other.chrome.children.filter(child => child.className === 'preview-index-link').length, 1);
});

test('workspace capability label distinguishes local guide execution from native folder checks', () => {
  const workspace = harness({ path: 'main-four-region.html' });
  const badge = workspace.chrome.children.find(child => child.className === 'preview-status');
  assert.equal(badge.textContent, '本机工作台预览');
  assert.match(badge.getAttribute('aria-label'), /上线清单通过本机服务生成/);
  assert.match(badge.getAttribute('aria-label'), /项目目录预检需使用桌面端/);
});
