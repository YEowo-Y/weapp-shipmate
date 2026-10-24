import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PAGES, returnDestination, mountNavigation, settingsHref } from '../desktop/design-previews/navigation.js';
import { STAGES, getStage, stageHref } from '../desktop/design-previews/stages.js';

test('every product destination exists and navigation never claims to run an operation', () => {
  assert.equal(new Set(PAGES.map(page => page.href)).size, PAGES.length);
  for (const page of PAGES) {
    assert.ok(existsSync(new URL(`../desktop/design-previews/${page.href}`, import.meta.url)), page.href);
    assert.doesNotMatch(page.label, /运行|执行|已完成/);
  }
});

test('review return routes reject unknown, nested, external, and self destinations', () => {
  for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '../index.html', 'diff-review.html', 'chat-full.html?secret=x', 'stage-workspace.html?stage=unknown', 'stage-workspace.html?stage=privacy&next=https://evil.example']) {
    assert.equal(returnDestination(`?from=${encodeURIComponent(bad)}`), 'main-four-region.html');
  }
  assert.equal(returnDestination('?from=chat-full.html'), 'chat-full.html');
  assert.equal(returnDestination('?from=audit.html'), 'audit.html');
});

test('privacy review returns to the exact originating stage', () => {
  const review = new URL(getStage('privacy').action[0], 'https://preview.invalid/');
  assert.equal(review.pathname, '/diff-review.html');
  assert.equal(returnDestination(review.search), stageHref('privacy'));
});

test('health module respects the shared annotation default and labels its history destination honestly', () => {
  const health = readFileSync(new URL('../desktop/design-previews/health-dashboard.html', import.meta.url), 'utf8');
  assert.doesNotMatch(health, /classList\.add\(['"]annot['"]\)/);
  const historyAction = health.match(/class="feed__act"[^]*?<\/a>/)?.[0];
  assert.match(historyAction, /href="explain\.html\?from=health-dashboard\.html"/);
  assert.match(historyAction, /拒因反查/);
  assert.doesNotMatch(historyAction, /查看变更/);
});

test('navigation marks current page and only selected destinations navigate', () => {
  let click; let options;
  const trigger = { setAttribute() {}, addEventListener(_name, handler) { click = handler; } };
  const location = { pathname: '/audit.html', href: '' };
  mountNavigation({ document: { querySelector: () => ({ prepend() {} }), createElement: () => trigger }, location, ui: { openMenu(value) { options = value; } } });
  click();
  assert.equal(options.items.filter(item => item.checked).length, 1);
  options.items.find(item => item.checked).onSelect();
  assert.equal(location.href, '');
  options.items.find(item => item.label === '会话').onSelect();
  assert.equal(location.href, 'chat-full.html');
});

test('settings navigation carries a bounded source back to the task surface', () => {
  for (const [pathname, source] of [['/chat-full.html', 'chat'], ['/main-four-region.html', 'workspace'], ['/audit.html', 'audit.html']]) {
    let click; let options;
    const trigger = { setAttribute() {}, addEventListener(_name, handler) { click = handler; } };
    const location = { pathname, href: '' };
    mountNavigation({ document: { querySelector: () => ({ prepend() {} }), createElement: () => trigger }, location, ui: { openMenu(value) { options = value; } } });
    click();
    options.items.find(item => item.label === '偏好与连接').onSelect();
    assert.equal(location.href, `settings.html?from=${source}`);
  }
});

test('task surfaces expose daily destinations and a labelled example catalogue', () => {
  for (const pathname of ['/main-four-region.html', '/chat-full.html', '/settings.html', '/explain.html']) {
    let click, options;
    const trigger = { setAttribute() {}, addEventListener(_name, handler) { click = handler; } };
    const location = { pathname, href: '' };
    mountNavigation({ document: { querySelector: () => ({ prepend() {} }), createElement: () => trigger }, location, ui: { openMenu(value) { options = value; } } });
    click();
    assert.deepEqual(options.items.map(item => item.label), ['上线工作台', '会话', '拒因反查', '偏好与连接', '设计参考与示例']);
    options.items.find(item => item.label === '设计参考与示例').onSelect();
    assert.equal(location.href, 'index.html');
  }
});

test('live rejection entry preserves a bounded origin and never opens a demo report', () => {
  for (const [pathname, search, expected] of [
    ['/main-four-region.html', '', 'main-four-region.html'],
    ['/chat-full.html', '', 'chat-full.html'],
    ['/settings.html', '?from=chat', 'chat-full.html'],
    ['/settings.html', '?from=https://evil.test', 'main-four-region.html'],
  ]) {
    let click, options;
    const trigger = { setAttribute() {}, addEventListener(_name, handler) { click = handler; } };
    const location = { pathname, search, href: '' };
    mountNavigation({ document: { querySelector: () => ({ prepend() {} }), createElement: () => trigger }, location, ui: { openMenu(value) { options = value; } } });
    click();
    options.items.find(item => item.label === '拒因反查').onSelect();
    const target = new URL(location.href, 'https://preview.invalid');
    assert.equal(target.pathname, '/explain.html');
    assert.equal(target.searchParams.get('from'), expected);
  }
});

test('live chat and rejection pages keep project and phase demos behind the design catalogue', () => {
  const chat = readFileSync(new URL('../desktop/design-previews/chat-full.html', import.meta.url), 'utf8');
  assert.doesNotMatch(chat, /<button[^>]*class="proj"/);
  assert.doesNotMatch(chat, /项目独立空间|my-miniprogram/);
  const explain = readFileSync(new URL('../desktop/design-previews/explain.html', import.meta.url), 'utf8');
  const related = explain.match(/<nav class="explain-related"[^]*?<\/nav>/)?.[0];
  assert.match(related, /href="index\.html"/);
  assert.doesNotMatch(related, /href="(?:audit|stage-workspace)\.html/);
});

test('settings links preserve exact stages and onboarding choices without carrying arbitrary parameters', () => {
  for (const stage of STAGES) {
    const link = new URL(settingsHref('/stage-workspace.html', 'key', `?stage=${stage.id}&secret=discard`), 'https://preview.invalid/');
    assert.equal(link.searchParams.get('from'), stageHref(stage.id));
    assert.equal(link.hash, '#key');
  }
  for (const status of ['new', 'live']) {
    const link = new URL(settingsHref('/first-run.html', 'key', `?status=${status}`), 'https://preview.invalid/');
    assert.equal(link.searchParams.get('from'), `first-run.html?status=${status}`);
  }
  assert.equal(settingsHref('/unknown.html'), 'settings.html?from=workspace');
  assert.equal(settingsHref('/settings.html'), 'settings.html?from=workspace');
});

test('stage and health follow-up tools retain an allowlisted return path', () => {
  for (const [id, target] of [['review', 'explain.html'], ['release', 'health-dashboard.html']]) {
    const action = new URL(getStage(id).action[0], 'https://preview.invalid/');
    assert.equal(action.pathname, `/${target}`);
    assert.equal(returnDestination(action.search), stageHref(id));
  }
  const health = readFileSync(new URL('../desktop/design-previews/health-dashboard.html', import.meta.url), 'utf8');
  assert.match(health, /href="explain\.html\?from=health-dashboard\.html"/);
});

test('follow-up return controls keep their source and reject self or external destinations', () => {
  for (const [from, expected, title] of [
    [stageHref('review'), stageHref('review'), '提交审核'],
    ['health-dashboard.html', 'health-dashboard.html', '上线后检查'],
    ['explain.html', 'main-four-region.html', '上线工作台'],
    ['https://evil.test', 'main-four-region.html', '上线工作台'],
  ]) {
    const link = { setAttribute() {} };
    const document = { querySelectorAll: () => [link], querySelector: () => null };
    mountNavigation({ document, location: { pathname: '/explain.html', search: `?from=${encodeURIComponent(from)}` }, ui: null });
    assert.equal(link.href, expected);
    assert.match(link.textContent, new RegExp(title));
  }
});
