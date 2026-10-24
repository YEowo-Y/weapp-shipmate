import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountSettingsNavigation } from '../desktop/design-previews/settings-navigation.js';

test('settings page mounts the shared controller and provides exactly the supported panels', () => {
  const html = readFileSync(new URL('../desktop/design-previews/settings.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="settings-navigation\.js"><\/script>/);
  assert.match(html, /href="components\/ui-kit\.css"/);
  assert.match(html, /<wa-button[^>]*data-settings-clear>清除搜索<\/wa-button>/);
  const ids = [...html.matchAll(/<section class="set-panel(?: on)?" data-p="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ['key', 'data', 'appear', 'cap', 'sec', 'scan', 'rules', 'about']);
});

class Control {
  constructor(id = '', text = '') {
    this.dataset = { p: id };
    this.textContent = text;
    this.value = '';
    this.hidden = false;
    this.style = {};
    this.attributes = {};
    this.events = new Map();
    this.classes = new Set();
    this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
  }
  addEventListener(name, handler) { this.events.set(name, handler); }
  setAttribute(name, value) { this.attributes[name] = value; }
  insertAdjacentHTML(position, html) { this.insertedHTML = { position, html }; }
  fire(name, event = {}) { this.events.get(name)?.(event); }
  closest() { return this; }
  focus() { throw new Error('Filtering must not move focus'); }
}

function harness(hash = '', searchParams = '') {
  const ids = ['key', 'appear', 'cap', 'sec', 'scan', 'rules', 'about', 'data'];
  const panels = ids.map(id => new Control(id, id === 'about' ? '上线船友 GitHub' : id));
  panels[0].classes.add('on');
  const nav = new Control();
  const search = new Control();
  const buttons = ids.map(id => new Control(id));
  const groups = Array.from({ length: 4 }, () => new Control());
  const status = new Control();
  const theme = new Control();
  const content = { scrollTop: 90 };
  const empty = new Control();
  const clear = new Control();
  empty.querySelector = () => clear;
  const unavailable = new Control();
  const previewLink = new Control();
  const exitLink = new Control();
  const notice = new Control();
  const unavailableTitle = new Control();
  const host = new Control();
  host.location = { hash, search: searchParams };
  const back = new Control();
  const themes = [];
  host.shipmatePreview = { setTheme: value => themes.push(value) };
  nav.querySelector = () => search;
  nav.querySelectorAll = selector => selector === '.set-nav__group' ? groups : buttons.filter(button => nav.innerHTML.includes('data-p="' + button.dataset.p + '"'));
  nav.append = () => {};
  nav.contains = node => buttons.includes(node);
  const root = {
    activeElement: null,
    getElementById: () => nav,
    createElement: () => status,
    querySelector: selector => selector === '[data-settings-unavailable]' ? unavailable : selector === '[data-settings-preview-link]' ? previewLink : selector === '[data-settings-preview-exit]' ? exitLink : selector === '[data-settings-preview-notice]' ? notice : selector === '[data-settings-unavailable-title]' ? unavailableTitle : selector === '[data-settings-empty]' ? empty : selector.startsWith('.set-panel') ? panels.find(panel => selector.includes('"' + panel.dataset.p + '"')) : content,
    querySelectorAll: selector => selector === '.set-panel' ? panels : selector === '[data-settings-return]' ? [back] : selector === '[data-session-management]' ? [] : [theme],
  };
  buttons.forEach(button => { button.focus = () => { root.activeElement = button; }; });
  search.focus = () => { root.activeElement = search; };
  mountSettingsNavigation(root, host);
  return { unavailable, previewLink, exitLink, notice, unavailableTitle, root, nav, search, buttons, panels, status, theme, themes, host, content, back, empty, clear,
    visible: () => panels.filter(panel => !panel.hidden && panel.classes.has('on')).map(panel => panel.dataset.p),
    click: id => nav.fire('click', { target: buttons.find(button => button.dataset.p === id) }),
    filter: (value, event = 'input') => { search.value = value; search.fire(event); },
  };
}

test('settings deep link selects appearance and unknown hashes fall back to models', () => {
  const h = harness('#appear');
  assert.deepEqual(h.visible(), ['appear']);
  assert.equal(h.buttons[1].attributes['aria-current'], 'page');
  for (const hash of ['#unknown', '#__proto__', '#constructor', '#appear?x=1']) {
    assert.deepEqual(harness(hash).visible(), ['key']);
  }
});

test('content empty state offers explicit recovery to the original section and search focus', () => {
  const h = harness('#appear');
  assert.equal(h.empty.hidden, true);
  h.filter('不存在的设置');
  assert.equal(h.empty.hidden, false);
  h.root.activeElement = h.clear;
  h.clear.fire('click');
  assert.equal(h.empty.hidden, true);
  assert.equal(h.search.value, '');
  assert.equal(h.root.activeElement, h.search);
  assert.equal(h.host.location.hash, '#appear');
  assert.deepEqual(h.visible(), ['appear']);
});

test('history restoration moves focus out of a disappearing empty-state action', () => {
  const h = harness('#appear');
  h.filter('不存在的设置');
  h.empty.contains = node => node === h.clear;
  h.root.activeElement = h.clear;
  h.host.location.hash = '#about';
  h.host.fire('hashchange');
  assert.equal(h.empty.hidden, true);
  assert.equal(h.root.activeElement, h.buttons.find(button => button.dataset.p === 'about'));
});

test('settings clicks update hash and browser history changes restore the panel', () => {
  const h = harness('#appear', '?preview=settings');
  h.click('rules');
  assert.equal(h.host.location.hash, 'rules');
  assert.deepEqual(h.visible(), ['rules']);
  h.host.location.hash = '#appear';
  h.host.fire('hashchange');
  assert.deepEqual(h.visible(), ['appear']);
  assert.equal(h.content.scrollTop, 0);
});

test('search includes navigation labels and selects a matching content panel without changing history', () => {
  const h = harness('#appear');
  h.filter('关于');
  assert.deepEqual(h.visible(), ['about']);
  assert.equal(h.buttons.find(button => button.dataset.p === 'about').hidden, false);
  assert.equal(h.host.location.hash, '#appear');
  assert.match(h.nav.innerHTML, /type="search"/);
});

test('no results hides unrelated content and native search clear restores the selected section', () => {
  const h = harness('#appear');
  h.filter('不存在的设置');
  assert.deepEqual(h.visible(), []);
  assert.match(h.status.textContent, /没有匹配/);
  assert.ok(h.buttons.filter(button => ['key', 'data', 'appear', 'about'].includes(button.dataset.p)).every(button => button.hidden));
  h.filter('', 'search');
  assert.deepEqual(h.visible(), ['appear']);
  assert.equal(h.status.textContent, '');
  assert.ok(h.buttons.filter(button => ['key', 'data', 'appear', 'about'].includes(button.dataset.p)).every(button => !button.hidden));
});

test('selecting a search result commits its section and clearing search keeps that content', () => {
  const h = harness();
  h.filter('关于');
  h.click('about');
  assert.deepEqual(h.visible(), ['about']);
  h.filter('');
  assert.deepEqual(h.visible(), ['about']);
  h.filter('关于');
  h.host.location.hash = '#sec';
  h.host.fire('hashchange');
  assert.equal(h.search.value, '');
  assert.deepEqual(h.visible(), []);
  assert.equal(h.unavailable.hidden, false);
});

test('theme changes apply only checked controls', () => {
  const h = harness();
  h.theme.value = 'dark';
  h.theme.checked = false;
  h.theme.fire('change');
  assert.deepEqual(h.themes, []);
  h.theme.checked = true;
  h.theme.fire('change');
  assert.deepEqual(h.themes, ['dark']);
});

test('narrow layout preserves the search and empty-state recovery controls', () => {
  const css = readFileSync(new URL('../desktop/design-previews/settings.css', import.meta.url), 'utf8');
  const narrow = css.split('@media (max-width: 700px)')[1]?.split('@media')[0];
  assert.ok(narrow, 'settings keeps an explicit narrow-screen layout');
  for (const [, selectors, declarations] of narrow.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    if (/display\s*:\s*none/.test(declarations)) assert.doesNotMatch(selectors, /\.set-search|\.hint\b(?!:empty)/);
  }
  // Controller recovery is still available after the viewport changes.
  const h = harness('#appear');
  h.filter('不存在的设置');
  assert.deepEqual(h.visible(), []);
  h.filter('', 'search');
  assert.deepEqual(h.visible(), ['appear']);
});

test('settings return links preserve allowlisted destinations and old aliases', () => {
  for (const [search, expected] of [['?from=chat', 'chat-full.html'], ['?from=workspace', 'main-four-region.html'], ['?from=https://evil.test', 'main-four-region.html'], ['', 'main-four-region.html'], ['?from=health-dashboard.html', 'health-dashboard.html'], ['?from=stage-workspace.html%3Fstage%3Dprivacy', 'stage-workspace.html?stage=privacy'], ['?from=first-run.html%3Fstatus%3Dlive', 'first-run.html?status=live'], ['?from=settings.html', 'main-four-region.html'], ['?from=first-run.html%3Fstatus%3Dunknown', 'main-four-region.html']]) {
    const h = harness('', search);
    assert.equal(h.back.href, expected);
    assert.equal(h.back.insertedHTML.position, 'afterbegin');
    assert.match(h.back.insertedHTML.html, /<svg[^>]*aria-hidden="true"/);
    assert.equal(h.back.attributes['aria-label'], h.back.textContent);
    assert.match(h.back.textContent, /^返回/);
  }
});

test('history changes move only focus that would otherwise be hidden with the previous panel', () => {
  const h = harness('#key');
  const field = {};
  h.panels[0].contains = node => node === field;
  h.root.activeElement = field;
  h.host.location.hash = '#appear';
  h.host.fire('hashchange');
  assert.equal(h.root.activeElement, h.buttons[1]);
  assert.equal(h.panels[0].hidden, true);
  h.search.focus();
  h.host.location.hash = '#key';
  h.host.fire('hashchange');
  assert.equal(h.root.activeElement, h.search);
  const external = {};
  h.root.activeElement = external;
  h.host.location.hash = '#appear';
  h.host.fire('hashchange');
  assert.equal(h.root.activeElement, external);
});


test('choosing a search result clears the query with or without a hash change', () => {
  for (const hash of ['#about', '#appear']) {
    const h = harness(hash);
    h.filter('关于'); h.click('about');
    assert.equal(h.search.value, '');
    assert.deepEqual(h.visible(), ['about']);
    assert.ok(h.buttons.filter(button => ['key', 'data', 'appear', 'about'].includes(button.dataset.p)).every(button => !button.hidden));
  }
});


test('normal navigation and search exclude all design-only settings', () => {
  const h = harness();
  assert.deepEqual([...h.nav.innerHTML.matchAll(/data-p="([^"]+)"/g)].map(m => m[1]), ['key', 'data', 'appear', 'about']);
  for (const query of ['工程体检', '隐私与安全', '项目与扫描', '规则库']) {
    h.filter(query);
    assert.deepEqual(h.visible(), []);
    assert.equal(h.empty.hidden, false);
  }
});

test('legacy unavailable links explain the boundary before opt-in, with safe return targets', () => {
  for (const id of ['cap', 'sec', 'scan', 'rules']) {
    const h = harness('#' + id, '?from=chat');
    assert.deepEqual(h.visible(), []);
    assert.equal(h.unavailable.hidden, false);
    assert.equal(h.empty.hidden, true);
    assert.match(h.unavailableTitle.textContent, /尚未接入/);
    assert.equal(h.previewLink.href, 'settings.html?from=chat-full.html&preview=settings#' + id);
    h.host.location.hash = '#key'; h.host.fire('hashchange');
    assert.equal(h.unavailable.hidden, true);
    assert.deepEqual(h.visible(), ['key']);
  }
});

test('design preview requires exact opt-in, announces itself and has a safe exit', () => {
  const h = harness('#rules', '?from=https://evil.test&preview=settings');
  assert.deepEqual(h.visible(), ['rules']);
  assert.equal(h.notice.hidden, false);
  assert.equal(h.exitLink.href, 'settings.html?from=main-four-region.html#key');
  for (const query of ['', '?preview=1', '?preview=SETTINGS']) {
    const normal = harness('#rules', query);
    assert.deepEqual(normal.visible(), []);
    assert.equal(normal.notice.hidden, true);
  }
});

test('search and history recover from unavailable deep links without stranding focus', () => {
  const h = harness('#rules');
  h.unavailable.contains = node => node === h.previewLink;
  h.root.activeElement = h.previewLink;
  h.host.location.hash = '#appear'; h.host.fire('hashchange');
  assert.equal(h.root.activeElement, h.buttons.find(button => button.dataset.p === 'appear'));
  h.host.location.hash = '#rules'; h.host.fire('hashchange');
  h.search.focus(); h.filter('关于');
  assert.deepEqual(h.visible(), ['about']);
  assert.equal(h.unavailable.hidden, true);
  assert.equal(h.root.activeElement, h.search);
  h.filter('');
  assert.equal(h.unavailable.hidden, false);
  assert.deepEqual(h.visible(), []);
  h.click('cap');
  assert.equal(h.host.location.hash, '#rules', 'unavailable controls cannot bypass opt-in');
});

test('unimplemented controls are disabled in HTML before any script or model service loads', () => {
  const html = readFileSync(new URL('../desktop/design-previews/settings.html', import.meta.url), 'utf8');
  for (const id of ['cap', 'sec', 'scan', 'rules']) {
    const panel = html.match(new RegExp('<section class="set-panel" data-p="' + id + '"[^>]*>([\\s\\S]*?)</section>'))?.[1];
    assert.ok(panel, id);
    for (const [tag] of panel.matchAll(/<(?:input|select|button|wa-button)\b[^>]*>/g)) assert.match(tag, /\bdisabled(?:\s|>|\/)/, tag);
  }
  assert.match(html, /data-settings-unavailable/);
  assert.match(html, /data-settings-preview-notice/);
  const source = readFileSync(new URL('../desktop/design-previews/settings.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /markUnavailableSettings/);
});
