import { isUsableModelConnection } from '../desktop/design-previews/model-connection-client.js';
import { createActionButton } from './helpers/ui-action.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SUPPORTED_CHAT_PROVIDERS } from '../desktop/design-previews/chat-transport.js';
import { readFileSync } from 'node:fs';
function harness(loader = async () => ({ connections: [] })) {
  class Node {
    constructor(tag = 'div') { this.tag = tag; this.dataset = {}; this.children = []; this.events = new Map(); this.value = ''; this.attributes = {}; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    removeEventListener(name, fn) { if (this.events.get(name) === fn) this.events.delete(name); }
    fire(name, event = {}) { return this.events.get(name)?.({ target: this, ...event }); }
    focus() { if (!this.disabled && !this.hidden) { document.activeElement = this; this.focusCount = (this.focusCount || 0) + 1; } }
    set disabled(value) { this.isDisabled = value; if (value && document.activeElement === this) document.activeElement = null; }
    get disabled() { return this.isDisabled; }
    set hidden(value) { this.isHidden = value; if (value && document.activeElement === this) document.activeElement = null; }
    get hidden() { return this.isHidden; }
    close() { this.open = false; this.fire('close'); }
    querySelector(selector) { return selector === '.shipmate-dialog__body' ? this.body : null; }
  }
  const document = { createElement: tag => new Node(tag), activeElement: null };
  const composer = new Node(); composer.dataset.liveChat = 'true'; composer.querySelector = () => composer.busy ? {} : null;
  const selected = []; composer.dispatchEvent = event => selected.push(event.detail.selection);
  const trigger = new Node('button'); trigger.closest = () => composer;
  const dialogs = []; const notices = []; const window = new Node();
  const context = vm.createContext({ isUsableModelConnection, createActionButton, document, window, AbortController, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    SUPPORTED_CHAT_PROVIDERS, loadChatConnections: loader,
    createProviderIcon: (_document, provider) => { const node = new Node('span'); node.dataset.provider = provider; return node; },
    createIcon: (_document, name) => { const node = new Node('svg'); node.dataset.icon = name; return node; },
    notify: message => notices.push(message), openMenu: options => options, settingsHref: () => 'settings.html', location: {},
    makeDialog: () => { const dialog = new Node('dialog'); dialog.body = new Node(); dialogs.push(dialog); return dialog; },
    showDialog: (dialog, focus) => { dialog.open = true; focus?.focus(); return dialog; },
  });
  const source = readFileSync(new URL('../desktop/design-previews/ui.js', import.meta.url), 'utf8');
  const start = source.includes('  let modelPicker =') ? source.indexOf('  let modelPicker =') : source.indexOf('  function openModel(');
  vm.runInContext(source.slice(start, source.indexOf('  function openAddMenu(', start)), context);
  const all = (node, tag) => node.children.flatMap(child => [...((child.tag === tag || tag === 'button' && child.tag === 'wa-button') ? [child] : []), ...all(child, tag)]);
  return { context, composer, trigger, selected, dialogs, notices, document, window, all, flush: async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); } };
}
const catalog = { connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'gpt-test', name: 'Test model' }] }] };
async function failedPicker() {
  const pending = [];
  const h = harness(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const dialog = h.context.openConnectedModels(h.trigger);
  pending.shift().reject(new Error('offline')); await h.flush();
  const input = h.all(dialog.body, 'input')[0];
  const buttons = h.all(dialog.body, 'button');
  return { ...h, pending, dialog, input, retry: buttons.find(node => node.textContent === '重新加载目录'), clear: buttons.find(node => node.textContent === '清除搜索'), manage: h.all(dialog.body, 'a')[0] };
}
for (const query of ['gpt', 'missing']) {
  test(`focused retry preserves ${query} search and moves focus before disabling or hiding`, async () => {
    const h = await failedPicker();
    h.input.value = query; h.input.fire('input'); h.retry.focus(); h.retry.fire('click');
    assert.equal(h.document.activeElement, h.input);
    assert.equal(h.retry.disabled, true);
    h.pending.shift().resolve(catalog); await h.flush();
    assert.equal(h.input.value, query);
    assert.equal(h.document.activeElement, h.input);
    assert.equal(h.retry.hidden, true);
    assert.equal(h.clear.hidden, query === 'gpt');
  });
}
test('repeat failed retries remain recoverable and never steal a new focus on completion', async () => {
  const h = await failedPicker(); h.input.value = 'gpt'; h.input.fire('input');
  for (let index = 0; index < 2; index++) {
    h.retry.focus(); h.retry.fire('click'); assert.equal(h.document.activeElement, h.input);
    h.manage.focus(); h.pending.shift().reject(new Error('offline')); await h.flush();
    assert.equal(h.document.activeElement, h.manage);
    assert.equal(h.retry.disabled, false); assert.equal(h.retry.hidden, false);
  }
  h.retry.focus(); h.retry.fire('click'); h.manage.focus();
  h.pending.shift().resolve(catalog); await h.flush();
  assert.equal(h.document.activeElement, h.manage); assert.equal(h.input.value, 'gpt');
});
test('successful retry recovers focus only when a focused clear action becomes hidden', async () => {
  const h = await failedPicker(); h.input.value = 'gpt'; h.input.fire('input');
  h.retry.focus(); h.retry.fire('click'); h.clear.focus();
  h.pending.shift().resolve(catalog); await h.flush();
  assert.equal(h.clear.hidden, true); assert.equal(h.document.activeElement, h.input);
});
test('successful retry with no matches leaves focus on the still-visible clear action', async () => {
  const h = await failedPicker(); h.input.value = 'missing'; h.input.fire('input');
  h.retry.focus(); h.retry.fire('click'); h.clear.focus();
  h.pending.shift().resolve(catalog); await h.flush();
  assert.equal(h.clear.hidden, false); assert.equal(h.document.activeElement, h.clear);
  assert.equal(h.input.value, 'missing');
});
test('closing a pending retry never focuses or renders into the closed dialog', async () => {
  const h = await failedPicker(); h.retry.focus(); h.retry.fire('click');
  h.dialog.close(); h.trigger.focus(); const focusCount = h.input.focusCount;
  h.pending.shift().resolve(catalog); await h.flush();
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.input.focusCount, focusCount); assert.equal(h.dialog.open, false);
});
