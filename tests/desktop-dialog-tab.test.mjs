import assert from 'node:assert/strict';
import test from 'node:test';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';
import { createActionButton } from './helpers/ui-action.mjs';

const { JSDOM } = requireDesktop('jsdom');
const overrides = { './shared/components/ui-kit.js': () => ({ createActionButton }) };
const emptyCatalog = { catalog: { schemaVersion: 1, catalogVersion: 'fixture', staleDays: 180, sources: [] }, checks: [] };
const dialogs = [
  ['source-freshness', () => loadDesktopModule('src/source-freshness.ts', overrides).mountSourceFreshness({
    invoke: async () => emptyCatalog,
  })],
  ['handoff', () => loadDesktopModule('src/repair-handoff.ts', overrides).mountRepairHandoff({
    getArtifact: () => null, getProject: () => null, getRulesVersion: () => null, isBusy: () => false,
    loadSourceCatalog: async () => emptyCatalog,
  })],
];

for (const [name, mount] of dialogs) {
  test(`${name} wraps Tab around the current enabled and visible controls`, t => {
    const { window } = new JSDOM('<button id="opener">Open</button>');
    installDesktopDom(window);
    // Keep focus on the host as the real Web Awesome shadow button does.
    window.customElements.define('wa-button', class extends window.HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' }).append(window.document.createElement('button'));
      }
      focus() {
        if (!this.disabled) this.shadowRoot.querySelector('button').focus();
      }
    });
    window.HTMLElement.prototype.checkVisibility = function () {
      return this.getClientRects().length > 0 && window.getComputedStyle(this).visibility === 'visible';
    };
    const { document } = window;
    const app = mount();
    t.after(() => { app.destroy(); window.close(); });
    app.open(document.getElementById('opener'));
    const dialog = document.querySelector('dialog[open]');
    const dismiss = document.getElementById(`${name}-dismiss`);
    const done = document.getElementById(`${name}-done`);
    const first = document.createElement('button');
    const last = document.createElement('button');
    const inert = document.createElement('div');
    inert.setAttribute('inert', '');
    inert.append(document.createElement('button'));
    const disabled = document.createElement('button');
    disabled.disabled = true;
    const disabledAction = createActionButton(document, 'Disabled');
    disabledAction.disabled = true;
    const invisible = document.createElement('button');
    invisible.style.visibility = 'hidden';
    const excluded = document.createElement('button');
    excluded.tabIndex = -1;
    dialog.prepend(disabled, first);
    dialog.append(last, inert, invisible, excluded, disabledAction);

    const tab = (element, options = {}) => {
      element.focus();
      const event = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...options });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };

    assert.equal(tab(done), false, 'the footer button is now an interior control');
    assert.equal(tab(dismiss, { shiftKey: true }), false, 'the close button is now an interior control');
    assert.equal(tab(last), true);
    assert.equal(document.activeElement, first);
    assert.equal(tab(first, { shiftKey: true }), true);
    assert.equal(document.activeElement, last);
    assert.equal(tab(last, { ctrlKey: true }), false);
    assert.equal(tab(last, { isComposing: true }), false);
    last.addEventListener('keydown', event => event.preventDefault(), { once: true });
    assert.equal(tab(last), true);
    assert.equal(document.activeElement, last, 'the dialog respects a canceled key event');

    first.tabIndex = 2;
    last.tabIndex = 1;
    assert.equal(tab(done), true, 'positive tab indices come before the natural sequence');
    assert.equal(document.activeElement, last);
    assert.equal(tab(last, { shiftKey: true }), true);
    assert.equal(document.activeElement, done);
    first.disabled = true;
    last.hidden = true;
    assert.equal(tab(done), true);
    assert.equal(document.activeElement, dismiss);
    assert.equal(tab(dismiss, { shiftKey: true }), true);
    assert.equal(document.activeElement, done);
  });
}
