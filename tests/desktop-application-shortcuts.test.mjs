import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom'), ts = require('typescript');

test('application shortcuts respect composition, modifiers, native dialogs, and disposal', () => {
  const dom = new JSDOM('<input>'), document = dom.window.document, calls = [];
  const context = { document };
  const code = readFileSync(new URL('../desktop/src/application-shortcuts.ts', import.meta.url), 'utf8').replace('export function', 'function');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const dispose = context.bindApplicationShortcuts({ newSession: () => calls.push('new'), search: () => calls.push('search'), settings: () => calls.push('settings') });
  const key = (key, extra = {}) => { const event = new dom.window.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...extra }); document.querySelector('input').dispatchEvent(event); return event; };
  key('n'); key('k', { ctrlKey: false, metaKey: true }); key(',');
  assert.deepEqual(calls, ['new', 'search', 'settings']);
  for (const extra of [{ isComposing: true }, { repeat: true }, { altKey: true }, { shiftKey: true }, { ctrlKey: false }]) assert.equal(key('n', extra).defaultPrevented, false);
  const query = document.querySelector.bind(document);
  document.querySelector = selector => selector === 'dialog:modal' ? {} : query(selector);
  assert.equal(key('n').defaultPrevented, false);
  document.querySelector = query; dispose(); key('n');
  assert.deepEqual(calls, ['new', 'search', 'settings']);
});
