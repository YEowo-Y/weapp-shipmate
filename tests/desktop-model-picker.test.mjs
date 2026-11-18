import { isUsableModelConnection } from '../desktop/design-previews/model-connection-client.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Optional desktop dependencies. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Install desktop dependencies' }, fn);
function harness() {
  let doc, busy = false, managed = false, selected = null, cleanup = 0;
  const nodes = new Map();
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.style = {}; this.attributes = {}; this.events = {}; this.children = []; this.value = ''; this.classList = { toggle() {} }; }
    set className(value) { this._className = value; if (value) nodes.set(`.${value}`, this); }
    get className() { return this._className; }
    setAttribute(k,v) { this.attributes[k] = v; if (k.startsWith('data-')) nodes.set(`[${k}]`, this); }
    append(...nodes) { this.children.push(...nodes); }
    prepend(...nodes) { this.children.unshift(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(k,f) { this.events[k] = f; }
    removeEventListener(k) { delete this.events[k]; }
    querySelector(s) { if (!nodes.has(s)) nodes.set(s, new Element()); return nodes.get(s); }
    querySelectorAll() { return this.children.filter(c => !c.disabled); }
    get childElementCount() { return this.children.length; }
    contains(node) { return this.children.includes(node); }
    focus() { doc.activeElement = this; }
    showPopover() { this.open = true; this.events.toggle?.(); }
    hidePopover() { this.open = false; this.events.toggle?.(); }
    matches() { return this.open; }
    remove() { this.removed = true; }
  }
  doc = { body: new Element(), createElement: tag => new Element(tag), activeElement: null };
  const context = { isUsableModelConnection, document: doc, createProviderIcon: () => new Element(), createIcon: () => new Element(), attachFloatingSurface: () => () => { cleanup++; } };
  const actionSource = readFileSync(new URL('../desktop/src/shared/components/ui-kit.js', import.meta.url), 'utf8').match(/^export function createActionButton[^]*?^}/m)[0].replace('export ', '');
  vm.runInNewContext(actionSource, context);
  const source = readFileSync(new URL('../desktop/src/model-picker.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const anchor = new Element();
  const connections = [{ providerId: 'openai', status: 'connected', models: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] }, { providerId: 'google', status: 'disconnected', models: [{ id: 'old', name: 'Old' }] }];
  const loader = { run: async () => {} };
  const options = { anchor, providers: [['openai', 'OpenAI']], connections: () => connections, load: () => loader.run(), select: value => { selected = value; return true; }, getSelection: () => ({ providerId: 'openai', model: 'a', label: 'Alpha' }), isBusy: () => busy, manage: () => { managed = true; } };
  const picker = context.mountModelPicker(options);
  return { picker, options, loader, anchor, doc, nodes, surface: doc.body.children[0], setBusy: value => { busy = value; }, get selected() { return selected; }, get managed() { return managed; }, get cleanup() { return cleanup; } };
}
function key(surface, key) { surface.events.keydown({ key, preventDefault() {}, stopPropagation() {} }); }

desktopTest('GLM presets are selectable and only the individually tested model is marked verified', async () => {
  const app = harness();
  const connections = app.options.connections();
  connections.splice(0, connections.length, { providerId: 'glm', status: 'configured', catalogSource: 'preset', hasCredential: true, inference: { status: 'verified', model: 'glm-5.2' }, models: [{ id: 'glm-5.2', name: 'GLM 5.2' }, { id: 'glm-4.7', name: 'GLM 4.7' }] });
  app.picker.open(); await setImmediate();
  const list = app.nodes.get('.desktop-picker-list');
  assert.equal(list.children.length, 2);
  assert.match(list.children[0].children[1].children[1].textContent, /推理已验证/);
  assert.match(list.children[1].children[1].children[1].textContent, /预设，尚未验证/);
  list.children[1].events.click();
  assert.equal(app.selected.providerId, 'glm');
  assert.equal(app.selected.model, 'glm-4.7');
  app.picker.destroy();
});

desktopTest('empty Kimi quick picker explains the supported-model boundary', async () => {
  const app = harness();
  app.options.connections().splice(0, 2, { providerId: 'kimi', status: 'connected', models: [] });
  app.picker.open(); await setImmediate();
  assert.match(app.nodes.get('.desktop-picker-status').textContent, /Kimi K2.6.*暂不兼容/);
  app.picker.destroy();
});

desktopTest('quick picker searches only connected models, keeps check state and selects via buttons', async () => {
  const app = harness(); app.picker.open(); await setImmediate();
  const list = app.nodes.get('.desktop-picker-list');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].attributes['aria-pressed'], 'true');
  const search = app.nodes.get('input'); search.value = 'beta'; search.events.input();
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].dataset.modelId, 'b');
  key(app.surface, 'ArrowDown'); assert.equal(app.doc.activeElement, list.children[0]);
  list.children[0].events.click();
  assert.equal(app.selected.model, 'b'); assert.equal(app.surface.open, false);
  assert.equal(app.doc.activeElement, app.anchor); assert.equal(app.cleanup, 1);
});

desktopTest('Escape restores focus and a dismissed pending load never reopens the picker', async () => {
  const app = harness(); let resolve;
  app.loader.run = () => new Promise(done => { resolve = done; });
  app.picker.open(); key(app.surface, 'Escape'); await setImmediate();
  assert.equal(app.surface.open, false); assert.equal(app.doc.activeElement, app.anchor);
  assert.equal(app.anchor.attributes['aria-expanded'], 'false');
  resolve(); await setImmediate();
  assert.equal(app.surface.open, false);
  app.setBusy(true); app.picker.open(); assert.equal(app.surface.open, false);
});

desktopTest('connection management closes the surface and delegates to the shared settings', async () => {
  const app = harness(); app.picker.open(); await setImmediate();
  assert.equal(app.nodes.get('.desktop-picker-manage').tagName, 'WA-BUTTON');
  app.nodes.get('.desktop-picker-manage').events.click();
  assert.equal(app.managed, true); assert.equal(app.surface.open, false);
  assert.equal(app.doc.activeElement, app.anchor);
  app.picker.destroy(); assert.equal(app.surface.removed, true);
  assert.equal(app.anchor.events.click, undefined);
});


desktopTest('failed catalog load offers retry and recovers without forcing credential settings', async () => {
  const app = harness(); app.loader.run = async () => { throw Error('offline'); };
  app.picker.open(); await setImmediate();
  assert.equal(app.nodes.get('[data-retry]').hidden, false);
  assert.equal(app.nodes.get('[data-retry]').tagName, 'WA-BUTTON');
  assert.match(app.nodes.get('.desktop-picker-status').textContent, /无法读取模型/);
  app.loader.run = async () => {};
  app.nodes.get('[data-retry]').events.click(); await setImmediate();
  assert.equal(app.nodes.get('[data-retry]').hidden, true);
  assert.equal(app.managed, false);
});

desktopTest('catalog refresh preserves an option the user focused while loading', async () => {
  const app = harness(); let resolve;
  app.loader.run = () => new Promise(done => { resolve = done; });
  app.picker.open(); key(app.surface, 'ArrowDown'); key(app.surface, 'ArrowDown');
  assert.equal(app.doc.activeElement.dataset.modelId, 'b');
  resolve(); await setImmediate();
  assert.equal(app.doc.activeElement.dataset.modelId, 'b');
});

desktopTest('catalog removal returns focus to search without stealing focus from management', async () => {
  for (const focusedRow of [true, false]) {
    const app = harness(); let resolve;
    app.loader.run = () => new Promise(done => { resolve = done; });
    app.picker.open();
    if (focusedRow) key(app.surface, 'ArrowDown');
    else app.nodes.get('.desktop-picker-manage').focus();
    app.options.connections()[0].status = 'disconnected';
    resolve(); await setImmediate();
    assert.equal(app.nodes.get('.desktop-picker-list').children.length, 0);
    assert.equal(app.doc.activeElement, app.nodes.get(focusedRow ? 'input' : '.desktop-picker-manage'));
  }
});

desktopTest('picker distinguishes missing connections, empty catalogs and unmatched searches', async () => {
  const app = harness();
  const connections = app.options.connections();
  connections[0].status = 'disconnected';
  app.picker.open(); await setImmediate();
  const status = app.nodes.get('.desktop-picker-status'), search = app.nodes.get('input');
  assert.match(status.textContent, /先连接服务商/);
  connections[0].status = 'connected'; connections[0].models = [];
  search.events.input();
  assert.match(status.textContent, /已连接.*未返回.*刷新目录/);
  assert.doesNotMatch(status.textContent, /先连接服务商/);
  connections[0].models = [{ id: 'alpha', name: 'Alpha' }];
  search.value = 'missing'; search.events.input();
  assert.match(status.textContent, /没有匹配.*关键词/);
  search.value = ''; search.events.input();
  assert.equal(status.hidden, true);
  assert.equal(app.nodes.get('.desktop-picker-list').children.length, 1);
});

desktopTest('empty Ollama picker directs users to download and refresh via existing management', async () => {
  const app = harness();
  app.options.connections().splice(0, 2, { providerId: 'ollama', status: 'connected', models: [] });
  app.picker.open(); await setImmediate();
  assert.match(app.nodes.get('.desktop-picker-status').textContent, /下载模型.*刷新目录/);
  app.nodes.get('.desktop-picker-manage').events.click();
  assert.equal(app.managed, true);
});

desktopTest('saved credentials remain unavailable until an explicit reconnect reads the catalog', async () => {
  const app = harness();
  app.options.connections().splice(0, 2, { providerId: 'custom', status: 'disconnected', hasCredential: true, models: [] });
  app.picker.open(); await setImmediate();
  assert.equal(app.nodes.get('.desktop-picker-list').children.length, 0);
  assert.match(app.nodes.get('.desktop-picker-status').textContent, /凭据已保存.*重新连接/);
  assert.equal(app.selected, null);
});
