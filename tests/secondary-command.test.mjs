import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { returnDestination, destinationLabel, mountNavigation } from '../desktop/design-previews/navigation.js';

const html = readFileSync(new URL('../desktop/design-previews/command-palette.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([^]*?)<\/script>/)[1].replace(/^\s*import[^;]+;/mg, '');

for (const [from, expected] of [
  ['memory.html', 'memory.html'],
  ['stage-workspace.html?stage=privacy', 'stage-workspace.html?stage=privacy'],
  ['command-palette.html', 'main-four-region.html'],
  ['https://external.invalid', 'main-four-region.html'],
]) {
  test(`command page cancellation returns to a bounded source: ${from}`, async () => {
    let close; let label;
    const dialog = { querySelector: () => ({ setAttribute(_key, value) { label = value; } }), addEventListener(type, handler) { if (type === 'close') close = handler; } };
    const location = { search: `?from=${encodeURIComponent(from)}`, href: '' };
    await vm.runInNewContext(`(async () => { ${script} })()`, {
      window: { shipmateUI: { ready: Promise.resolve({ openCommand: () => dialog }) } },
      location, returnDestination, destinationLabel,
    });
    close();
    assert.equal(location.href, expected);
    assert.equal(label, `关闭并返回${destinationLabel(expected)}`);
  });
}

test('opening command page through workspace menu retains exact stage context', () => {
  let click; let menu;
  const button = { setAttribute() {}, addEventListener(_type, handler) { click = handler; } };
  const location = { pathname: '/stage-workspace.html', search: '?stage=privacy&discard=1', href: '' };
  mountNavigation({ document: { querySelector: () => ({ prepend() {} }), createElement: () => button }, location, ui: { openMenu(value) { menu = value; } } });
  click();
  menu.items.find(item => item.label === '快捷导航示例').onSelect();
  const url = new URL(location.href, 'https://preview.invalid');
  assert.equal(url.pathname, '/command-palette.html');
  assert.equal(url.searchParams.get('from'), 'stage-workspace.html?stage=privacy');
});
