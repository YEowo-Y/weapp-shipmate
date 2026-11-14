/* global Event, EventTarget */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const componentRoot = new URL('../desktop/design-previews/components/', import.meta.url);
const vendorRoot = new URL('vendor/web-awesome/', componentRoot);

test('local UI kit assets match pinned package, licenses and integrity manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', vendorRoot), 'utf8'));
  const packageJson = JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, packageJson.dependencies['@awesome.me/webawesome']);
  assert.equal(manifest.license, 'MIT');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  const notices = readFileSync(new URL('THIRD-PARTY-NOTICES.txt', vendorRoot), 'utf8');
  for (const pkg of manifest.packages) {
    assert.ok(['MIT', 'BSD-3-Clause'].includes(pkg.license), `${pkg.name}: review license`);
    assert.ok(notices.includes(`${pkg.name}@${pkg.version} (${pkg.license})`));
  }
  for (const file of manifest.files) {
    assert.match(file.file, /^[a-zA-Z0-9.-]+$/);
    const bytes = readFileSync(new URL(file.file, vendorRoot));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
});

test('UI kit imports are bundled locally and the remote icon fallback is disabled', () => {
  const bundle = readFileSync(new URL('web-awesome.js', vendorRoot), 'utf8');
  assert.doesNotMatch(bundle, /(?:import|export)[^;\n]*from\s*['"](?:https?:|@)/);
  assert.doesNotMatch(bundle, /\bimport\s*\(\s*['"]https?:/);
  const css = readFileSync(new URL('web-awesome.css', vendorRoot), 'utf8');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/);
  const entry = readFileSync(new URL('../desktop/scripts/ui-kit-entry.js', import.meta.url), 'utf8');
  assert.match(entry, /registerIconLibrary\('default', \{ resolver: \(\) => '' \}\)/);
  assert.doesNotMatch(entry, /webawesome\.css|styles\/native/);
});

function harness() {
  const classes = new Set();
  const body = { dataset: { theme: 'light' }, classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } } };
  let observeTheme;
  const context = vm.createContext({
    document: { body },
    MutationObserver: class { constructor(callback) { observeTheme = callback; } observe() {} },
  });
  const source = readFileSync(new URL('ui-kit.js', componentRoot), 'utf8').replace(/^import .*;$/m, '').replace(/^export /gm, '');
  vm.runInContext(`${source}\nglobalThis.bindActionMenu = bindActionMenu;`, context);
  return { classes, body, observeTheme, bindActionMenu: context.bindActionMenu };
}

test('UI kit follows the existing data-theme without overriding product theme state', () => {
  const { classes, body, observeTheme } = harness();
  assert.deepEqual([...classes], ['wa-light']);
  body.dataset.theme = 'dark';
  observeTheme();
  assert.deepEqual([...classes], ['wa-dark']);
  body.dataset.theme = 'light';
  observeTheme();
  assert.deepEqual([...classes], ['wa-light']);
});

test('action buttons preserve explicit native form intent and let the component own state', async () => {
  const { createActionButton } = await import('./helpers/ui-action.mjs');
  const doc = { createElement(tag) { return { tag, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }; } };
  const cancel = createActionButton(doc, '取消');
  assert.equal(cancel.tag, 'wa-button');
  assert.equal(cancel.type, 'button');
  assert.equal(cancel.dataset.uiControl, 'action');
  const submit = createActionButton(doc, '保存', { type: 'submit', appearance: 'accent', className: 'save' });
  assert.equal(submit.type, 'submit');
  assert.equal(submit.attributes.appearance, 'accent');
  assert.equal(submit.className, 'save');
  assert.equal(submit.textContent, '保存');
});

test('menu actions wait for focus restoration and cleanup prevents stale dialog opens', () => {
  const { bindActionMenu } = harness();
  const menu = new EventTarget();
  const called = [];
  const dispose = bindActionMenu(menu, (value, item) => called.push([value, item]));
  const item = { value: 'models' };
  const select = new Event('wa-select');
  Object.defineProperty(select, 'detail', { value: { item } });
  menu.dispatchEvent(select);
  assert.equal(called.length, 0);
  menu.dispatchEvent(new Event('wa-after-hide'));
  assert.deepEqual(called, [['models', item]]);
  menu.dispatchEvent(new Event('wa-after-hide'));
  assert.equal(called.length, 1);
  menu.dispatchEvent(select);
  dispose();
  menu.dispatchEvent(new Event('wa-after-hide'));
  assert.equal(called.length, 1);
});
