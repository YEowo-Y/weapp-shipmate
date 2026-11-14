import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { settingsHref, commandHref, settingsReturnDestination, getCommandGroups, PAGES } from '../desktop/design-previews/navigation.js';
import { STAGES, stageHref } from '../desktop/design-previews/stages.js';

const source = readFileSync(new URL('../desktop/design-previews/ui.js', import.meta.url), 'utf8');

test('task command search keeps examples behind the catalogue including an inherited command origin', () => {
  for (const [path, search] of [
    ['/main-four-region.html', ''], ['/chat-full.html', ''], ['/settings.html', '?from=workspace'],
    ['/command-palette.html', '?from=main-four-region.html'], ['/explain.html', ''],
  ]) {
    const items = getCommandGroups(path, search).flatMap(group => group[1]);
    assert.deepEqual(items.map(item => item[0]), ['上线工作台', '会话', '拒因反查', '偏好与连接', '设计参考与示例']);
    assert.equal(items.some(item => /阶段|预检示例|改动审阅/.test(item[0])), false);
  }
});

test('command rejection entries retain the original conversation across temporary surfaces', () => {
  for (const [path, search] of [
    ['/chat-full.html', ''], ['/settings.html', '?from=chat'],
    ['/command-palette.html', '?from=chat-full.html'],
  ]) {
    const item = getCommandGroups(path, search).flatMap(group => group[1]).find(row => row[0] === '拒因反查');
    assert.equal(item[1], 'explain.html?from=chat-full.html');
  }
});

const openCommand = source.match(/^ {2}function openCommand\([^]*?^ {2}}/m)?.[0];
assert.ok(openCommand, 'Actual command dialog function exists');

// Model only the DOM surfaces used by the actual function. Native navigation is
// represented by following the focused anchor after an unconsumed Enter event.
function commandHarness({ dynamic = false } = {}) {
  const document = { activeElement: null, querySelector: () => null, createElement: () => ({}) };
  function element() {
    const listeners = new Map();
    return {
      addEventListener(type, listener) { listeners.set(type, listener); },
      emit(type, event = {}) { listeners.get(type)?.(event); },
      closest() { return null; },
      focus() { document.activeElement = this; },
    };
  }
  const input = Object.assign(element(), { value: '' });
  const status = { textContent: '' };
  let anchors = [];
  const results = { ...element(),
    querySelectorAll() { return anchors; },
    contains(target) { return anchors.includes(target); },
    set innerHTML(html) {
      anchors = [...html.matchAll(/<a class="([^"]+)" href="([^"]+)" data-index="(\d+)">/g)].map(([, classes, href, index]) => {
        const anchor = Object.assign(element(), {
          href, dataset: { index }, active: classes.includes('is-active'),
          closest(selector) { return selector === '[data-index]' ? this : null; },
          scrollIntoView() {},
          focus() { document.activeElement = this; results.emit('focusin', { target: this }); },
        });
        anchor.classList = { toggle(name, active) { if (name === 'is-active') anchor.active = active; } };
        return anchor;
      });
    },
  };
  const body = { querySelector(selector) { return selector === 'input' ? input : selector === '[role="status"]' ? status : results; } };
  const dialog = Object.assign(element(), { querySelector: () => body, getAttribute: () => 'command-title', append() {} });
  const location = { href: '', pathname: '/first-run.html', search: '?status=new' };
  const context = vm.createContext({
    document, location,
    commandGroups: dynamic ? getCommandGroups(location.pathname, location.search) : [['工作区', [['上线工作台', 'main-four-region.html', '阶段'], ['查看预检示例', 'audit.html', '预检']]]],
    getCommandGroups: dynamic ? getCommandGroups : () => [['工作区', [['上线工作台', 'main-four-region.html', '阶段'], ['查看预检示例', 'audit.html', '预检']]]],
    makeDialog: () => dialog, iconMarkup: () => '',
    showDialog: (node, target) => target.focus(),
  });
  vm.runInContext(openCommand, context);
  context.openCommand();
  return {
    document, input, results, status, location,
    reopen() { context.openCommand(); },
    get anchors() { return anchors; },
    search(value) { input.focus(); input.value = value; input.emit('input'); },
    hover(index) { results.emit('mouseover', { target: anchors[index] }); },
    key(key, extra = {}) {
      const event = { key, target: document.activeElement, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
      dialog.emit('keydown', event);
      if (key === 'Enter' && !event.prevented && !event.isComposing && event.target.href && !event.ctrlKey && !event.metaKey && !event.shiftKey) location.href = event.target.href;
      return event;
    },
  };
}

test('pointer selection follows existing result focus so Enter opens the announced item', () => {
  const page = commandHarness();
  page.anchors[1].focus();
  page.hover(0);
  assert.equal(page.document.activeElement, page.anchors[0]);
  assert.match(page.status.textContent, /当前选择：上线工作台/);
  assert.equal(page.anchors[0].active, true);
  assert.equal(page.anchors[1].active, false);
  assert.equal(page.key('Enter').prevented, false, 'Keep native link activation');
  assert.equal(page.location.href, 'main-four-region.html');
});

test('opening commands uses the current onboarding choice instead of its initial URL', () => {
  const page = commandHarness({ dynamic: true });
  page.location.search = '?status=live';
  page.reopen();
  page.search('偏好与连接');
  page.key('Enter');
  assert.equal(new URL(page.location.href, 'https://preview.invalid').searchParams.get('from'), 'first-run.html?status=live');
});

test('hover while typing preserves search focus and Enter activates the selected result', () => {
  const page = commandHarness();
  page.hover(1);
  assert.equal(page.document.activeElement, page.input);
  page.key('Enter');
  assert.equal(page.location.href, 'audit.html');
});

test('empty search does not activate stale rows and clearing restores selection', () => {
  const page = commandHarness();
  page.hover(1);
  page.search('不存在的命令');
  assert.equal(page.anchors.length, 0);
  assert.equal(page.status.textContent, '没有匹配项');
  page.key('ArrowDown');
  page.key('Enter');
  assert.equal(page.location.href, '');
  page.search('');
  assert.equal(page.anchors.length, 2);
  assert.equal(page.anchors[0].active, true);
  page.key('Enter');
  assert.equal(page.location.href, 'main-four-region.html');
});

test('arrow navigation preserves input focus and moves existing result focus', () => {
  const page = commandHarness();
  page.key('ArrowDown');
  assert.equal(page.document.activeElement, page.input);
  assert.equal(page.anchors[1].active, true);
  page.anchors[1].focus();
  page.key('ArrowDown');
  assert.equal(page.document.activeElement, page.anchors[0]);
  page.key('ArrowUp');
  assert.equal(page.document.activeElement, page.anchors[1]);
});

test('IME keys and modified anchor activation are left to native controls', () => {
  const page = commandHarness();
  assert.equal(page.key('ArrowDown', { isComposing: true }).prevented, false);
  assert.equal(page.key('Enter', { isComposing: true }).prevented, false);
  assert.equal(page.key('Enter', { keyCode: 229 }).prevented, false);
  assert.equal(page.location.href, '');
  assert.equal(page.anchors[0].active, true);
  page.anchors[1].focus();
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey']) {
    assert.equal(page.key('Enter', { [modifier]: true }).prevented, false);
    assert.equal(page.location.href, '');
  }
});

test('modified search editing keys never move selection or activate a command', () => {
  const page = commandHarness();
  page.hover(1);
  const announcement = page.status.textContent;
  for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey']) {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter']) {
      assert.equal(page.key(key, { [modifier]: true }).prevented, false, `${modifier}+${key} stays native`);
      assert.equal(page.document.activeElement, page.input);
      assert.equal(page.anchors[1].active, true);
      assert.equal(page.status.textContent, announcement);
      assert.equal(page.location.href, '');
    }
  }
  assert.equal(page.key('ArrowUp').prevented, true);
  assert.equal(page.anchors[0].active, true);
  assert.equal(page.key('ArrowDown').prevented, true);
  assert.equal(page.anchors[1].active, true);
  assert.equal(page.key('Enter').prevented, true);
  assert.equal(page.location.href, 'audit.html');
});

for (const [pathname, from] of [['/chat-full.html', 'chat'], ['/main-four-region.html', 'workspace']]) {
  test(`settings entry points preserve ${from} return context`, () => {
    let menu;
    const location = { pathname, href: '' };
    const context = vm.createContext({ location, settingsHref, getCommandGroups, openMenu: value => { menu = value; } });
    const groups = source.match(/^ {4}const commandGroups = getCommandGroups[^\n]+/m)[0];
    const model = source.match(/^ {2}function openModel\([^]*?^ {2}}/m)[0];
    const add = source.match(/^ {2}function openAddMenu\([^]*?^ {2}}/m)[0];
    vm.runInContext(`${groups}\n${model}\n${add}`, context);
    const settingsCommand = vm.runInContext('commandGroups.flatMap(group => group[1]).find(item => item[0] === "偏好与连接")[1]', context);
    assert.equal(settingsCommand, `settings.html?from=${from}`);
    context.openModel({});
    menu.items.find(item => item.label === '管理模型服务').onSelect();
    assert.equal(location.href, `settings.html?from=${from}#key`);
    context.openAddMenu({ closest: () => null });
    menu.items.find(item => item.label === '偏好与连接').onSelect();
    assert.equal(location.href, `settings.html?from=${from}`);
  });
}

test('command search discovers every product destination and every configured stage', () => {
  const rows = getCommandGroups('/stage-workspace.html', '?stage=privacy').flatMap(group => group[1]);
  for (const page of PAGES.filter(page => page.href !== 'command-palette.html')) {
    const row = rows.find(item => item[0] === page.label);
    assert.ok(row, page.label);
    assert.equal(row[1].split('?')[0], page.href);
  }
  for (const stage of STAGES) assert.ok(rows.some(row => row[1] === stageHref(stage.id)), stage.title);
  assert.equal(new Set(rows.map(row => row[1])).size, rows.length);
  assert.equal(new URL(rows.find(row => row[0] === '偏好与连接')[1], 'https://preview.invalid').searchParams.get('from'), stageHref('privacy'));
});

test('temporary navigation surfaces keep the underlying task as their return destination', () => {
  for (const origin of ['stage-workspace.html?stage=privacy', 'first-run.html?status=live', 'memory.html', 'chat-full.html']) {
    const command = new URL(commandHref(`/${origin.split('?')[0]}`, origin.includes('?') ? `?${origin.split('?')[1]}` : ''), 'https://preview.invalid');
    const settings = new URL(settingsHref(command.pathname, 'key', command.search), command);
    assert.equal(settingsReturnDestination(settings.search), origin);
    assert.equal(settings.hash, '#key');
    const nextCommand = new URL(commandHref(settings.pathname, settings.search), settings);
    assert.equal(nextCommand.searchParams.get('from'), origin);
    assert.equal(settingsReturnDestination(new URL(settingsHref(settings.pathname, '', settings.search), settings).search), origin);
  }
});

test('transient return context cannot carry external URLs, nested context or another transient page', () => {
  for (const from of ['https://external.invalid', '//external.invalid', 'settings.html', 'command-palette.html', 'settings.html?from=memory.html', 'stage-workspace.html?stage=privacy&from=memory.html']) {
    for (const path of ['/command-palette.html', '/settings.html']) {
      const next = new URL(settingsHref(path, '', `?from=${encodeURIComponent(from)}`), 'https://preview.invalid');
      assert.equal(settingsReturnDestination(next.search), 'main-four-region.html');
    }
  }
});
