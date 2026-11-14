import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const ts = require('typescript');

function harness() {
  const dom = new JSDOM('<main><button id="trigger">Report</button><section id="host"></section></main><dialog id="first" aria-labelledby="title"><h2 id="title">Report</h2><button>Back</button></dialog><dialog id="second"><button>Back</button></dialog>');
  const { document, HTMLDialogElement, HTMLElement, Event } = dom.window;
  const queued = [], changes = [];
  HTMLElement.prototype.getClientRects = function () { return this.isConnected && !this.hidden ? [{}] : []; };
  HTMLDialogElement.prototype.show = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false; queued.push(() => this.dispatchEvent(new Event('close')));
  };
  const source = readFileSync(new URL('../desktop/src/workspace-pages.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
  const context = { document, HTMLElement };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const node = id => document.getElementById(id);
  const app = context.mountWorkspacePages({ host: node('host'), onChange: page => changes.push(page?.id ?? null) });
  return { app, node, document, changes, flush: () => { while (queued.length) queued.shift()(); },
    escape() { const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(event); return event; } };
}

test('workspace presents the same controller DOM as a nonmodal labelled region', () => {
  const h = harness(), page = h.node('first'), button = page.querySelector('button');
  assert.equal(h.node('host').hidden, true);
  assert.equal(h.app.open(page, h.node('trigger')), true);
  assert.equal(page.parentElement, h.node('host'));
  assert.equal(page.getAttribute('role'), 'region');
  assert.equal(page.getAttribute('aria-labelledby'), 'title');
  assert.equal(page.open, true);
  assert.equal(h.app.current, page);
  assert.equal(page.querySelector('button'), button);
  assert.deepEqual(h.changes, ['first']);
});

test('pending writes prevent switching and Escape; leaving later restores focus', () => {
  const h = harness(); let writing = true;
  h.app.open(h.node('first'), h.node('trigger'), { canLeave: () => !writing });
  h.node('first').querySelector('button').focus();
  assert.equal(h.app.open(h.node('second'), null), false);
  assert.equal(h.app.close(), false);
  assert.equal(h.escape().defaultPrevented, true);
  assert.equal(h.app.current, h.node('first'));
  writing = false;
  assert.equal(h.app.close(), true); h.flush();
  assert.equal(h.node('host').hidden, true);
  assert.equal(h.document.activeElement, h.node('trigger'));
});

test('queued close of a previous page cannot hide or steal focus from the new page', () => {
  const h = harness(); h.app.open(h.node('first'), h.node('trigger'));
  h.app.open(h.node('second'), null); const target = h.node('second').querySelector('button'); target.focus();
  h.flush();
  assert.equal(h.app.current, h.node('second'));
  assert.equal(h.node('host').hidden, false);
  assert.equal(h.document.activeElement, target);
  assert.deepEqual(h.changes, ['first', 'second']);
});

test('Escape still returns from the page after a disabled control loses focus to body', () => {
  const h = harness();
  h.app.open(h.node('first'), h.node('trigger'));
  h.document.body.focus();
  assert.equal(h.escape().defaultPrevented, true);
  assert.equal(h.app.current, null);
  assert.equal(h.document.activeElement, h.node('trigger'));
});

test('controller close and immediate reopen ignore the stale native close event', () => {
  const h = harness(); h.app.open(h.node('first'), h.node('trigger'));
  h.node('first').close(); h.app.open(h.node('first'), null); h.flush();
  assert.equal(h.app.current, h.node('first'));
  assert.equal(h.node('host').hidden, false);
  h.node('first').close(); h.flush();
  assert.equal(h.app.current, null);
  assert.equal(h.node('host').hidden, true);
});

test('Escape belongs to nested dialogs and outside focus; destroy restores original DOM', () => {
  const h = harness(), page = h.node('first'), originalParent = page.parentElement;
  page.setAttribute('role', 'dialog'); h.app.open(page, h.node('trigger'));
  h.node('trigger').focus(); assert.equal(h.escape().defaultPrevented, false);
  const originalQuery = h.document.querySelector.bind(h.document);
  h.document.querySelector = selector => selector === 'dialog:modal' ? h.node('second') : originalQuery(selector);
  page.querySelector('button').focus(); assert.equal(h.escape().defaultPrevented, false);
  h.app.destroy(); h.flush();
  assert.equal(page.parentElement, originalParent);
  assert.equal(page.getAttribute('role'), 'dialog');
  assert.equal(page.classList.contains('workspace-page'), false);
  assert.equal(h.app.open(page, null), false);
});
