import { isUsableModelConnection } from '../desktop/design-previews/model-connection-client.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Optional desktop dependencies. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Install desktop dependencies' }, fn);
const settle = () => setImmediate();
function harness(snapshot, selection = null, options = {}) {
  const nodes = new Map(), timers = [];
  let doc;
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.style = {}; this.dataset = {}; this.children = []; this.events = {}; this.value = ''; this.attributes = {}; this.classList = { toggle() {}, add() {} }; }
    set id(value) { this._id = value; nodes.set(`#${value}`, this); }
    get id() { return this._id; }
    setAttribute(k,v) { this.attributes[k] = v; if (k.startsWith('data-')) nodes.set(`[${k}]`, this); }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(k,f) { this.events[k] = f; }
    removeEventListener() {}
    querySelector(s) { if (!nodes.has(s)) { const node = new Element(); if (s === '#desktop-provider-key') node.type = 'password'; nodes.set(s, node); } return nodes.get(s); }
    querySelectorAll() { return this.children; }
    contains(node) { return this.children.includes(node); }
    focus() { doc.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    remove() {}
  }
  doc = { body: new Element(), createElement: tag => new Element(tag), createTextNode: () => new Element(), addEventListener() {}, removeEventListener() {}, activeElement: null };
  const client = { snapshot, ready: true, async load() { return this.snapshot; }, async mutate() {}, dispose() {} };
  const source = readFileSync(new URL('../desktop/src/model-connection.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const quickPicker = { open() { this.opened = true; }, close() { this.opened = false; }, destroy() {} };
  const context = { isUsableModelConnection, mountModelPicker: options => { quickPicker.options = options; options.anchor.addEventListener('click', () => quickPicker.open()); return quickPicker; }, document: doc, HTMLElement: Element, createConnectionClient: () => client, desktopModelFetch() {}, createIcon: () => new Element(), createProviderIcon: () => new Element(), openUrl: async () => {}, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} };
  const actionSource = readFileSync(new URL('../desktop/src/shared/components/ui-kit.js', import.meta.url), 'utf8').match(/^export function createActionButton[^]*?^}/m)[0].replace('export ', '');
  vm.runInNewContext(actionSource, context);
  vm.runInNewContext(script, context);
  const picker = new Element(), button = new Element();
  const app = context.mountModelConnections({ button, picker, select: () => true, getSelection: () => selection, isBusy: () => false, ...options });
  return { app, nodes, timers, client, doc, context, picker, button, quickPicker };
}

desktopTest('provider search filters names and ids without changing the selected connection', async () => {
  const h = harness({ connections: [] }); h.app.open(); await settle();
  const search = h.nodes.get('#desktop-provider-search'), nav = h.nodes.get('nav');
  search.value = '智谱'; search.events.input();
  assert.deepEqual(nav.children.filter(b => !b.hidden).map(b => b.dataset.providerId), ['glm']);
  assert.equal(h.nodes.get('h3').textContent, 'OpenAI');
  search.value = 'missing-provider'; search.events.input(); assert.equal(h.nodes.get('#desktop-provider-empty').hidden, false);
  search.value = ''; search.events.input(); assert.ok(nav.children.filter(b => !b.hidden).length > 5);
  h.app.destroy();
});

for (const [providerId, name] of [['deepseek', 'DeepSeek'], ['glm', 'GLM · 智谱'], ['kimi', 'Kimi']]) {
  desktopTest(`${providerId} opens the native connection form and keeps OAuth exclusive to OpenRouter`, async () => {
    const app = harness({ connections: [] }, { providerId, model: 'model', label: 'Model' });
    app.app.open(); await settle();
    assert.equal(app.nodes.get('h3').textContent, name);
    assert.equal(app.nodes.get('.desktop-oauth-panel').hidden, true);
    assert.equal(app.nodes.get('.desktop-endpoint-field').hidden, true);
    assert.equal(app.nodes.get('#desktop-provider-key').required, true);
    assert.equal(app.nodes.get('nav').children.some(button => button.dataset.providerId === providerId), true);
    app.app.destroy();
  });
}

desktopTest('GLM presets remain visibly unverified until the exact selected model passes an explicit test', async () => {
  const connection = { providerId: 'glm', status: 'configured', catalogSource: 'preset', hasCredential: true, models: [{ id: 'glm-5.2', name: 'GLM 5.2' }, { id: 'glm-4.7', name: 'GLM 4.7' }], inference: { status: 'verified', model: 'glm-5.2' } };
  let selection = { providerId: 'glm', model: 'glm-5.2', label: 'GLM 5.2' };
  const app = harness({ connections: [connection] }, selection, { getSelection: () => selection });
  let mutations = 0; app.client.mutate = async () => { mutations++; };
  app.app.open(); await settle();
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /配置已保存.*已通过推理测试/);
  app.doc.body.children[0].close();
  selection = { providerId: 'glm', model: 'glm-4.7', label: 'GLM 4.7' };
  app.app.open(); await settle();
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /配置已保存.*尚未验证/);
  assert.equal(app.nodes.get('#desktop-inference-status').textContent, '尚未测试 · glm-4.7');
  assert.equal(app.nodes.get('#desktop-provider-status').dataset.tone, 'neutral');
  assert.equal(app.nodes.get('#desktop-provider-refresh').textContent, '重新载入预设');
  assert.equal(app.nodes.get('.desktop-model-catalog > label').textContent, '模型预设（非实时目录）');
  assert.equal(app.nodes.get('.desktop-model-list').children.length, 2);
  assert.equal(mutations, 0, 'opening and selecting never spend tokens');
  assert.equal(app.nodes.get('#desktop-provider-verify').disabled, false);
  app.app.destroy();
});

desktopTest('Kimi filtered catalog explains compatibility instead of claiming the provider returned no models', async () => {
  const app = harness({ connections: [{ providerId: 'kimi', status: 'connected', models: [] }] }, { providerId: 'kimi', model: 'kimi-k2.6', label: 'Kimi K2.6' });
  app.app.open(); await settle();
  assert.match(app.nodes.get('.desktop-model-list').children[0].textContent, /Kimi K2.6.*其他模型暂不兼容/);
  assert.doesNotMatch(app.nodes.get('.desktop-model-list').children[0].textContent, /尚未返回可用模型|刷新目录/);
  app.app.destroy();
});

desktopTest('new provider key buttons open only fixed official destinations and explain browser failure', async () => {
  for (const [providerId, url] of [['deepseek', 'https://platform.deepseek.com/api_keys'], ['glm', 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'], ['kimi', 'https://platform.kimi.com/console/api-keys']]) {
    const app = harness({ connections: [] }, { providerId, model: 'model', label: 'Model' });
    const opened = []; app.context.openUrl = async value => opened.push(value);
    app.app.open(); await settle();
    const button = app.nodes.get('#desktop-provider-get-key');
    assert.equal(button.hidden, false);
    await button.events.click(); assert.deepEqual(opened, [url]);
    app.context.openUrl = async () => { throw new Error('raw browser failure'); };
    await button.events.click();
    assert.match(app.nodes.get('#desktop-provider-status').textContent, /未能打开服务商密钥页面/);
    app.app.destroy();
  }
});
desktopTest('model controller mounts without a global button and delegates management without loading credentials', async () => {
  let managed = 0;
  const app = harness({ connections: [] }, null, { button: undefined, onManage: () => { managed++; } });
  let loaded = 0; app.client.load = async () => { loaded++; return app.client.snapshot; };
  app.quickPicker.options.manage(); await settle();
  assert.equal(managed, 1);
  assert.equal(loaded, 0);
  assert.equal(app.doc.body.children[0].open, undefined);
  app.app.destroy();
});

desktopTest('explicit settings origin takes priority over current focus and survives dialog closure', async () => {
  const app = harness({ connections: [] }, null, { button: undefined });
  app.picker.focus();
  app.app.open(app.button); await settle();
  app.doc.body.children[0].close();
  assert.equal(app.doc.activeElement, app.button);
  app.doc.activeElement = null;
  app.app.open(); await settle(); app.doc.body.children[0].close();
  assert.equal(app.doc.activeElement, app.picker, 'composer is the available fallback when no global button exists');
});
for (const [providerId, authMethod] of [['openai', 'api-key'], ['openrouter', 'oauth']]) {
  desktopTest(`native model dialog retains refresh and disconnect after ${authMethod} catalog failure`, async () => {
    const app = harness({ connections: [{ providerId, status: 'connected', hasCredential: true, authMethod, models: [] }] }, { providerId, model: 'saved', label: 'Saved' });
    app.app.open(); await settle();
    assert.equal(app.nodes.get('#desktop-provider-refresh').hidden, false);
    app.client.snapshot.connections[0].status = 'error';
    app.client.snapshot.connections[0].error = { message: 'Catalog unavailable' };
    app.app.open(); await settle();
    assert.equal(app.nodes.get('#desktop-provider-refresh').hidden, false);
    assert.equal(app.nodes.get('#desktop-provider-disconnect').hidden, false);
    assert.equal(app.nodes.get('#desktop-provider-status').textContent, 'Catalog unavailable');
  });
}
desktopTest('OAuth polling keeps model nodes and focused controls stable without disabling providers', async () => {
  const app = harness({ oauth: { status: 'waiting' }, connections: [{ providerId: 'openai', status: 'connected', hasCredential: true, models: [{ id: 'saved', name: 'Saved' }] }] }, { providerId: 'openai', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  const model = app.nodes.get('.desktop-model-list').children[0]; model.focus();
  assert.equal(model.attributes['aria-pressed'], 'true');
  app.timers.at(-1)();
  assert.ok(app.nodes.get('nav').children.every(b => !b.disabled));
  await settle();
  assert.equal(app.nodes.get('.desktop-model-list').children[0], model);
  assert.equal(app.doc.activeElement, model);
});
desktopTest('unavailable native service explains bundled runtime recovery', async () => {
  const app = harness({ connections: [] });
  app.client.load = async () => { throw Error('unavailable'); };
  app.app.open(); await settle();
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /重启应用或修复安装/);
});
desktopTest('connection action reflects the actual provider state without replacing retry actions', async () => {
  const app = harness({ connections: [{ providerId: 'ollama', status: 'connected', authMethod: 'local', models: [] }] }, { providerId: 'ollama', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  assert.equal(app.nodes.get('#desktop-provider-connect').textContent, '重新连接');
  assert.equal(app.nodes.get('#desktop-provider-refresh').hidden, false);
  app.client.snapshot.connections[0].status = 'disconnected';
  app.app.open(); await settle();
  assert.equal(app.nodes.get('#desktop-provider-connect').textContent, '连接本机 Ollama');
});
desktopTest('failed refresh is presented as an error even when a connected snapshot is retained', async () => {
  const app = harness({ connections: [{ providerId: 'openai', status: 'connected', hasCredential: true, models: [{ id: 'saved', name: 'Saved' }] }] });
  app.app.open(); await settle();
  assert.equal(app.nodes.get('#desktop-provider-status').dataset.tone, 'success');
  app.client.mutate = async () => { throw Error('transport unavailable'); };
  app.nodes.get('#desktop-provider-refresh').events.click(); await settle();
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /连接操作失败/);
  assert.equal(app.nodes.get('#desktop-provider-status').dataset.tone, 'error');
  assert.equal(app.client.snapshot.connections[0].status, 'connected');
  assert.equal(app.nodes.get('#desktop-provider-disconnect').hidden, false);
});
desktopTest('failed OS browser launch refreshes authoritative OAuth state and leaves cancel available', async () => {
  const app = harness({ connections: [] }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  app.context.openUrl = async () => { throw Error('OS launch failed'); };
  let started = false;
  app.client.mutate = async () => { started = true; return { authorizationUrl: 'https://openrouter.ai/auth' }; };
  app.client.load = async () => { if (started) app.client.snapshot = { connections: [], oauth: { status: 'waiting' } }; return app.client.snapshot; };
  app.nodes.get('#desktop-provider-oauth').events.click(); await settle();
  assert.equal(app.nodes.get('#desktop-provider-oauth-cancel').hidden, false);
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /在浏览器中打开授权页面/);
  assert.ok(app.timers.length > 0);
});


desktopTest('composer opens quick selection while header retains credential settings', async () => {
  const app = harness({ connections: [] });
  app.picker.events.click();
  assert.equal(app.quickPicker.opened, true);
  assert.equal(app.doc.body.children[0].open, undefined);
  app.button.events.click(); await settle();
  assert.equal(app.doc.body.children[0].open, true);
  assert.equal(app.quickPicker.opened, false);
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-provider-key'));
});

desktopTest('connected settings focus model search and local settings explain no-key connection', async () => {
  const app = harness({ connections: [{ providerId: 'ollama', status: 'connected', models: [] }] }, { providerId: 'ollama', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-model-search'));
  assert.match(app.nodes.get('.desktop-model-note').textContent, /无需 API 密钥/);
  app.client.snapshot.connections[0].status = 'disconnected';
  app.app.open(); await settle();
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-provider-connect'));
});

desktopTest('late settings load does not steal focus from a control the user chose', async () => {
  const app = harness({ connections: [] });
  let resolve;
  app.client.load = () => new Promise(done => { resolve = done; });
  app.app.open();
  const close = app.nodes.get('[data-close]'); close.focus();
  resolve(); await settle();
  assert.equal(app.doc.activeElement, close);
});

desktopTest('background catalog removal restores model search focus without focusing a closed dialog', async () => {
  const app = harness({ oauth: { status: 'waiting' }, connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'saved', name: 'Saved' }] }] });
  app.app.open(); await settle();
  app.nodes.get('.desktop-model-list').children[0].focus();
  app.client.snapshot.connections[0].models = [];
  app.timers.at(-1)(); await settle();
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-model-search'));

  app.client.snapshot.connections[0].models = [{ id: 'next', name: 'Next' }];
  app.timers.at(-1)(); await settle();
  app.nodes.get('.desktop-model-list').children[0].focus();
  app.doc.body.children[0].close();
  app.button.focus();
  app.client.snapshot.connections[0].models = [];
  app.timers.at(-1)(); await settle();
  assert.equal(app.doc.activeElement, app.button);
});

desktopTest('credential actions use the open-source control and block empty or repeated submissions', async () => {
  const app = harness({ connections: [] });
  app.app.open(); await settle();
  const connect = app.nodes.get('#desktop-provider-connect'), key = app.nodes.get('#desktop-provider-key');
  assert.equal(connect.tagName, 'WA-BUTTON');
  assert.equal(connect.type, 'submit');
  assert.equal(connect.disabled, true);
  const calls = [];
  let finish;
  app.client.mutate = (path, payload) => { calls.push([path, payload]); return new Promise(resolve => { finish = resolve; }); };
  const submit = () => app.nodes.get('form').events.submit({ preventDefault() {} });
  submit();
  assert.equal(calls.length, 0);
  key.value = 'test-only-credential'; key.events.input();
  assert.equal(connect.disabled, false);
  submit(); submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/openai/connect');
  assert.equal(key.value, '');
  assert.equal(connect.disabled, true);
  finish(); await settle();
  assert.equal(connect.disabled, true, 'cleared credential must be entered again before reconnect');
});

desktopTest('manual OAuth resumes, blocks conflicting actions and clears submitted codes', async () => {
  const auth = { status: 'waiting', mode: 'manual', flowId: 'flow-test', authorizationUrl: 'https://openrouter.ai/auth', expiresAt: Date.now() + 60000 };
  const app = harness({ connections: [], oauth: auth }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  const code = app.nodes.get('#desktop-oauth-code');
  assert.equal(app.nodes.get('#desktop-oauth-code-form').hidden, false);
  assert.equal(app.doc.activeElement, code);
  assert.equal(app.nodes.get('#desktop-provider-key').disabled, true);
  assert.equal(app.nodes.get('#desktop-provider-connect').disabled, true);
  assert.equal(app.nodes.get('form').hidden, true);
  assert.equal(app.nodes.get('#desktop-provider-status').hidden, true);
  assert.doesNotMatch(app.nodes.get('.desktop-oauth-panel > .desktop-field-hint').textContent, /上方/);
  const opened = [], calls = [];
  app.context.openUrl = async url => opened.push(url);
  app.client.mutate = async (path, payload) => { calls.push([path, payload]); app.client.snapshot.oauth = { status: 'connected' }; };
  app.nodes.get('#desktop-provider-oauth-reopen').events.click(); await settle();
  assert.deepEqual(opened, [auth.authorizationUrl]);
  app.nodes.get('#desktop-provider-refresh').events.click();
  app.nodes.get('#desktop-provider-key').value = 'must-not-submit';
  app.nodes.get('form').events.submit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  code.value = 'manual-code-fixture'; code.events.input();
  assert.equal(app.nodes.get('#desktop-provider-oauth-complete').disabled, false);
  app.nodes.get('#desktop-oauth-code-form').events.submit({ preventDefault() {} });
  assert.equal(code.value, '');
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/openrouter/oauth/complete');
  assert.equal(calls[0][1].flowId, 'flow-test');
  assert.equal(calls[0][1].code, 'manual-code-fixture');
  assert.equal(app.nodes.get('#desktop-provider-oauth-reopen').hidden, true);
  assert.equal(app.nodes.get('#desktop-oauth-code-form').hidden, true);
  assert.equal(app.nodes.get('form').hidden, false);
  assert.equal(app.nodes.get('#desktop-provider-status').hidden, false);
});

desktopTest('manual OAuth clears code on close and expiry without claiming a connection', async () => {
  const app = harness({ connections: [], oauth: { status: 'waiting', mode: 'manual', flowId: 'flow-test' } }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  const code = app.nodes.get('#desktop-oauth-code');
  code.value = 'discard-on-close';
  app.nodes.get('[data-close]').events.click();
  assert.equal(code.value, '');
  app.app.open(); await settle(); code.value = 'discard-on-expiry';
  app.client.snapshot.oauth = { status: 'expired' };
  app.timers.at(-1)(); await settle();
  assert.equal(code.value, '');
  assert.equal(app.nodes.get('#desktop-oauth-code-form').hidden, true);
  assert.match(app.nodes.get('#desktop-oauth-progress').textContent, /过期/);
  assert.equal(app.doc.body.children[0].dataset.connectionState, 'disconnected');
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-provider-oauth-manual'));
});

desktopTest('cancelling pending authorization restores focus to an available authorization action', async () => {
  const app = harness({ connections: [], oauth: { status: 'waiting', mode: 'callback' } }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  const cancel = app.nodes.get('#desktop-provider-oauth-cancel');
  assert.equal(app.doc.activeElement, cancel);
  app.client.mutate = async () => { app.client.snapshot.oauth = { status: 'cancelled' }; };
  cancel.events.click(); await settle();
  assert.equal(app.nodes.get('form').hidden, false);
  assert.equal(cancel.hidden, true);
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-provider-oauth-manual'));
});

desktopTest('narrow OAuth actions wrap within the responsive dialog without a duplicate password control', () => {
  const styles = readFileSync(new URL('../desktop/src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.desktop-model-actions\s*\{[^}]*flex-wrap:wrap/s);
  assert.match(styles, /\.desktop-model-actions wa-button\s*\{[^}]*max-width:100%/s);
  assert.match(styles, /\.desktop-model-actions wa-button::part\(button\)\s*\{[^}]*white-space:normal/s);
  assert.match(styles, /#desktop-oauth-code::-ms-reveal\s*\{\s*display:none;/);
});

desktopTest('failed code exchange reloads terminal state and allows a new authorization', async () => {
  const app = harness({ connections: [], oauth: { status: 'waiting', mode: 'manual', flowId: 'flow-test' } }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  app.client.mutate = async () => { throw Error('exchange rejected'); };
  app.client.load = async () => { app.client.snapshot.oauth = { status: 'error', message: '授权码已失效，请重新授权。' }; return app.client.snapshot; };
  const code = app.nodes.get('#desktop-oauth-code');
  code.value = 'rejected-code';
  app.nodes.get('#desktop-oauth-code-form').events.submit({ preventDefault() {} }); await settle();
  assert.equal(code.value, '');
  assert.equal(app.nodes.get('#desktop-oauth-code-form').hidden, true);
  assert.equal(app.nodes.get('#desktop-provider-oauth-manual').hidden, false);
  assert.equal(app.nodes.get('#desktop-provider-oauth-manual').disabled, false);
  assert.match(app.nodes.get('#desktop-oauth-progress').textContent, /已失效/);
});

desktopTest('manual start requests its mode and waits for an explicit browser action', async () => {
  const app = harness({ connections: [] }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  let payload;
  app.client.mutate = async (path, value) => {
    assert.equal(path, '/openrouter/oauth/start'); payload = value;
    app.client.snapshot.oauth = { status: 'waiting', mode: 'manual', flowId: 'flow-test', authorizationUrl: 'https://openrouter.ai/auth' };
    return { authorizationUrl: 'https://openrouter.ai/auth' };
  };
  let opened = 0;
  app.context.openUrl = async () => { opened++; throw Error('cannot open'); };
  app.nodes.get('#desktop-provider-oauth-manual').events.click(); await settle();
  assert.equal(payload.mode, 'manual');
  assert.equal(app.nodes.get('#desktop-provider-oauth-reopen').hidden, false);
  assert.equal(app.nodes.get('#desktop-provider-oauth-cancel').hidden, false);
  assert.equal(app.nodes.get('#desktop-oauth-code-form').hidden, false);
  assert.equal(opened, 0);
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-provider-oauth-reopen'));
  app.nodes.get('#desktop-provider-oauth-reopen').events.click(); await settle();
  assert.equal(opened, 1);
  assert.equal(app.nodes.get('#desktop-provider-oauth-reopen').hidden, false);
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /系统浏览器/);
});

desktopTest('revealed credentials are cleared and masked on close and provider change', async () => {
  const app = harness({ connections: [] });
  app.app.open(); await settle();
  const key = app.nodes.get('#desktop-provider-key'), reveal = app.nodes.get('#desktop-provider-reveal');
  key.value = 'test-only-credential'; reveal.events.click();
  assert.equal(key.type, 'text');
  assert.equal(reveal.children.map(node => node.textContent).join(''), '隐藏密钥');
  assert.equal(reveal.children[1].className, 'sr-only');
  assert.equal(reveal.attributes['aria-pressed'], undefined);
  assert.equal(reveal.attributes['aria-label'], undefined);
  app.nodes.get('nav').children.find(node => node.dataset.providerId === 'google').events.click();
  assert.equal(key.value, ''); assert.equal(key.type, 'password');
  key.value = 'another-test-only-credential'; reveal.events.click();
  app.nodes.get('[data-close]').events.click();
  assert.equal(key.value, ''); assert.equal(key.type, 'password');
  assert.equal(reveal.children.map(node => node.textContent).join(''), '显示密钥');
});

desktopTest('OAuth polling clears recovered read errors without resetting pending authorization', async () => {
  const app = harness({ connections: [], oauth: { status: 'waiting', mode: 'callback' } }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  app.client.load = async () => { throw Error('temporary outage'); };
  app.timers.at(-1)(); await settle();
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /桌面模型服务不可用/);
  assert.equal(app.nodes.get('#desktop-provider-status').hidden, false);
  app.client.load = async () => app.client.snapshot;
  app.timers.at(-1)(); await settle();
  assert.doesNotMatch(app.nodes.get('#desktop-provider-status').textContent, /桌面模型服务不可用/);
  assert.equal(app.nodes.get('#desktop-provider-status').hidden, true);
  assert.equal(app.nodes.get('#desktop-provider-oauth-cancel').hidden, false);
});

desktopTest('successful OAuth polls preserve an unresolved system-browser action error', async () => {
  const app = harness({ connections: [], oauth: { status: 'waiting', mode: 'callback', authorizationUrl: 'https://openrouter.ai/auth' } }, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  app.context.openUrl = async () => { throw Error('OS launch failed'); };
  app.nodes.get('#desktop-provider-oauth-reopen').events.click(); await settle();
  app.client.load = async () => { throw Error('temporary outage'); };
  app.timers.at(-1)(); await settle();
  app.client.load = async () => app.client.snapshot;
  app.timers.at(-1)(); await settle();
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /系统浏览器/);
  assert.equal(app.nodes.get('#desktop-provider-status').hidden, false);
  assert.equal(app.nodes.get('#desktop-provider-status').dataset.tone, 'error');
});

desktopTest('catalog distinguishes disconnected, empty and filtered states as search is cleared', async () => {
  const app = harness({ connections: [] });
  app.app.open(); await settle();
  const list = app.nodes.get('.desktop-model-list'), search = app.nodes.get('#desktop-model-search');
  assert.match(list.children[0].textContent, /连接成功后/);
  app.client.snapshot.connections = [{ providerId: 'openai', status: 'connected', models: [] }];
  app.app.open(); await settle();
  assert.match(list.children[0].textContent, /已连接.*未返回.*刷新目录/);
  assert.doesNotMatch(list.children[0].textContent, /关键词/);
  app.client.snapshot.connections[0].models = [{ id: 'alpha', name: 'Alpha' }];
  search.value = 'missing'; search.events.input();
  assert.match(list.children[0].textContent, /没有匹配.*关键词/);
  app.client.snapshot.connections[0].models = [];
  search.value = ''; search.events.input();
  assert.match(list.children[0].textContent, /已连接.*未返回.*刷新目录/);
});

desktopTest('empty connected Ollama catalog explains downloading models before refresh', async () => {
  const app = harness({ connections: [{ providerId: 'ollama', status: 'connected', authMethod: 'local', models: [] }] }, { providerId: 'ollama', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  assert.match(app.nodes.get('.desktop-model-list').children[0].textContent, /下载模型.*刷新目录/);
  assert.equal(app.nodes.get('#desktop-provider-refresh').hidden, false);
});

desktopTest('explicit service retry restores OAuth polling after a failed read clears the client snapshot', async () => {
  const snapshot = { connections: [], oauth: { status: 'waiting', mode: 'callback', authorizationUrl: 'https://openrouter.ai/auth' } };
  const app = harness(snapshot, { providerId: 'openrouter', model: 'saved', label: 'Saved' });
  app.app.open(); await settle();
  const scheduled = app.timers.length;
  app.client.load = async () => {
    app.client.snapshot = null;
    app.client.ready = false;
    throw Error('local service unavailable');
  };
  app.timers.at(-1)(); await settle();
  const retry = app.nodes.get('#desktop-provider-retry');
  assert.equal(retry.hidden, false);
  assert.equal(retry.disabled, false);
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /桌面模型服务不可用/);
  assert.equal(app.timers.length, scheduled, 'cleared OAuth state must not schedule another poll');
  let reads = 0;
  app.client.load = async () => {
    reads++;
    app.client.snapshot = snapshot;
    app.client.ready = true;
    return snapshot;
  };
  retry.events.click(); await settle();
  assert.equal(reads, 1);
  assert.equal(retry.hidden, true);
  assert.doesNotMatch(app.nodes.get('#desktop-provider-status').textContent, /桌面模型服务不可用/);
  assert.equal(app.nodes.get('#desktop-provider-status').hidden, true);
  assert.equal(app.nodes.get('#desktop-provider-oauth-cancel').hidden, false);
  assert.equal(app.timers.length, scheduled + 1, 'authoritative pending OAuth state resumes polling');
  app.timers.at(-1)(); await settle();
  assert.equal(reads, 2);
  assert.equal(app.timers.length, scheduled + 2);
});

desktopTest('system storage is opt-in and saved credentials reconnect without key readback or inference', async () => {
  const app = harness({ storage: 'system', connections: [{ providerId: 'openai', status: 'disconnected', credentialStorage: 'system', hasCredential: true, models: [] }] });
  const calls = []; app.client.mutate = async (path, payload) => { calls.push({ path, payload }); };
  app.app.open(); await settle();
  assert.equal(app.nodes.get('#desktop-provider-storage').value, 'memory');
  assert.equal(app.nodes.get('#desktop-provider-key').value, '');
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /已保存.*重新连接/);
  assert.equal(calls.length, 0);
  app.nodes.get('#desktop-provider-refresh').events.click(); await settle();
  assert.deepEqual(calls.map(c => c.path), ['/openai/refresh']);
  assert.match(app.nodes.get('#desktop-provider-disconnect').textContent, /删除保存的凭据/);
});

desktopTest('custom connections submit explicit endpoint and storage while inference is separate', async () => {
  const app = harness({ storage: 'system', connections: [] });
  app.app.open(); await settle();
  app.nodes.get('nav').children.find(n => n.dataset.providerId === 'custom').events.click();
  app.nodes.get('#desktop-provider-key').value = 'test-only';
  app.nodes.get('#desktop-provider-storage').value = 'system';
  app.nodes.get('#desktop-provider-endpoint').value = 'https://models.example/v1';
  app.nodes.get('#desktop-provider-local-http').checked = false;
  const calls = []; app.client.mutate = async (path, payload) => { calls.push({ path, payload }); };
  app.nodes.get('form').events.submit({ preventDefault() {} }); await settle();
  assert.equal(calls[0].path, '/custom/connect');
  assert.equal(calls[0].payload.storage, 'system');
  assert.equal(calls[0].payload.endpoint.baseUrl, 'https://models.example/v1');
  assert.equal(calls[0].payload.endpoint.allowLocalHttp, false);
  assert.equal(app.nodes.get('#desktop-provider-key').value, '');
  assert.equal(calls.length, 1);
});

desktopTest('inference test is explicit, uses the selected model and is never retried after failure', async () => {
  const app = harness({ storage: 'system', connections: [{ providerId: 'openai', status: 'connected', hasCredential: true, models: [{ id: 'alpha', name: 'Alpha' }], inference: { status: 'unverified' } }] }, { providerId: 'openai', model: 'alpha', label: 'Alpha' });
  const calls = []; app.client.mutate = async (path, payload) => { calls.push({ path, payload }); throw Error('timed out'); };
  app.app.open(); await settle();
  assert.equal(calls.length, 0);
  const verify = app.nodes.get('#desktop-provider-verify'); assert.equal(verify.disabled, false);
  verify.events.click(); await settle();
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/openai/verify'); assert.equal(calls[0].payload.model, 'alpha');
  assert.match(app.nodes.get('#desktop-provider-status').textContent, /不会自动重试/);
  assert.equal(app.client.snapshot.connections[0].inference.status, 'unverified');
});

desktopTest('memory-only broker cannot submit a system persistence choice', async () => {
  const app = harness({ storage: 'memory', connections: [] }); app.app.open(); await settle();
  assert.equal(app.nodes.get('#desktop-provider-storage').disabled, true);
  assert.equal(app.nodes.get('#desktop-provider-storage').value, 'memory');
  assert.match(app.nodes.get('#desktop-storage-hint').textContent, /仅支持临时/);
});

desktopTest('failed vault restoration keeps deletion recovery available without pretending credentials loaded', async () => {
  const connection = { providerId: 'openai', status: 'error', hasCredential: false, authMethod: null, models: [], error: { code: 'credential_store_failed', message: '无法读取系统凭据，请删除此连接后重新设置。' } };
  const app = harness({ storage: 'system', connections: [connection] });
  app.app.open(); await settle();
  const disconnect = app.nodes.get('#desktop-provider-disconnect');
  assert.equal(disconnect.hidden, false); assert.equal(disconnect.disabled, false);
  assert.equal(app.nodes.get('#desktop-provider-refresh').hidden, false);
  assert.equal(app.nodes.get('#desktop-provider-refresh').textContent, '重新读取系统凭据');
  assert.match(app.nodes.get('#desktop-storage-hint').textContent, /未确认.*删除/);
  const calls = []; app.client.mutate = async path => { calls.push(path); };
  app.client.load = async () => { calls.push('GET'); app.client.snapshot.connections = [{ providerId: 'openai', status: 'disconnected', hasCredential: false, models: [] }]; return app.client.snapshot; };
  disconnect.events.click(); await settle();
  assert.deepEqual(calls, ['/openai/disconnect', 'GET']);
  assert.equal(disconnect.hidden, true);
});

desktopTest('vault read retry uses refresh without new credentials or automatic inference', async () => {
  const app = harness({ storage: 'system', connections: [{ providerId: 'openai', status: 'error', hasCredential: false, authMethod: null, models: [], error: { code: 'credential_store_failed', message: '读取失败' } }] });
  app.app.open(); await settle();
  const calls = []; app.client.mutate = async (path, payload) => { calls.push({ path, payload }); };
  app.nodes.get('#desktop-provider-refresh').events.click(); await settle();
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/openai/refresh');
  assert.deepEqual(Object.keys(calls[0].payload), []);
});

desktopTest('connected settings prioritize catalog and collapse replacement credentials until explicitly expanded', async () => {
  const app = harness({ storage: 'system', connections: [{ providerId: 'openrouter', status: 'connected', hasCredential: true, models: [{ id: 'alpha', name: 'Alpha' }] }] }, { providerId: 'openrouter', model: 'alpha', label: 'Alpha' });
  app.app.open(); await settle();
  const details = app.nodes.get('#desktop-connection-editor');
  assert.equal(details.open, false);
  assert.equal(app.nodes.get('.desktop-model-catalog').hidden, false);
  assert.equal(app.nodes.get('#desktop-provider-refresh').hidden, false);
  details.open = true; details.events.toggle();
  app.nodes.get('#desktop-provider-key').value = 'temporary-key';
  details.open = false; details.events.toggle();
  assert.equal(app.nodes.get('#desktop-provider-key').value, '');
  app.client.snapshot.oauth = { status: 'waiting', mode: 'callback' };
  app.app.open(); await settle();
  assert.equal(details.open, true);
  assert.equal(app.nodes.get('#desktop-provider-oauth-cancel').hidden, false);
});

desktopTest('provider changes and reopening reset detail scroll while initial setup remains expanded', async () => {
  const app = harness({ storage: 'memory', connections: [] });
  app.app.open(); await settle();
  assert.equal(app.nodes.get('#desktop-connection-editor').open, true);
  const detail = app.nodes.get('.desktop-model-detail'); detail.scrollTop = 400;
  app.nodes.get('nav').children.find(n => n.dataset.providerId === 'google').events.click();
  assert.equal(detail.scrollTop, 0);
  detail.scrollTop = 300; app.nodes.get('[data-close]').events.click(); app.app.open(); await settle();
  assert.equal(detail.scrollTop, 0);
});

desktopTest('collapsing credential editor clears secrets and returns keyboard focus to its native summary', async () => {
  const app = harness({ connections: [{ providerId: 'openai', status: 'connected', hasCredential: true, models: [] }] });
  app.app.open(); await settle();
  const editor = app.nodes.get('#desktop-connection-editor'), key = app.nodes.get('#desktop-provider-key');
  editor.children.push(key); editor.open = true; key.value = 'test-key'; key.focus();
  editor.open = false; editor.events.toggle();
  assert.equal(key.value, '');
  assert.equal(app.doc.activeElement, app.nodes.get('#desktop-connection-editor-toggle'));
});

desktopTest('model dialog wraps keyboard boundaries without stealing interior or modified Tab navigation', async () => {
  const app = harness({ connections: [{ providerId: 'kimi', status: 'connected', hasCredential: true, models: [] }] });
  app.app.open(); await settle();
  const dialog = app.doc.body.children[0], first = app.nodes.get('[data-close]');
  const middle = app.nodes.get('#desktop-model-search'), last = app.nodes.get('#desktop-connection-editor-toggle');
  const hidden = app.nodes.get('#desktop-provider-key'), disabled = app.nodes.get('#desktop-provider-connect');
  const controls = [first, middle, last, hidden, disabled];
  for (const node of controls) {
    node.tabIndex = node === first ? -1 : 0;
    node.closest = () => null;
    node.hasAttribute = name => name === 'disabled' && Boolean(node.disabled);
    node.matches = selector => selector === 'wa-button' ? node.tagName === 'WA-BUTTON' : Boolean(node.disabled);
    node.getClientRects = () => [{}];
  }
  // Chromium may retain layout boxes inside a closed details element.
  const editor = app.nodes.get('#desktop-connection-editor');
  editor.children.push(last, hidden); editor.open = false;
  disabled.disabled = true;
  dialog.querySelectorAll = () => controls;
  app.context.window = { getComputedStyle: () => ({ visibility: 'visible' }) };
  function tab(node, options = {}) {
    node.focus(); let prevented = false;
    dialog.events.keydown?.({ key: 'Tab', target: node, preventDefault() { prevented = true; }, ...options });
    return prevented;
  }
  assert.equal(tab(last), true); assert.equal(app.doc.activeElement, first);
  assert.equal(tab(first, { shiftKey: true }), true); assert.equal(app.doc.activeElement, last);
  assert.equal(tab(middle), false); assert.equal(app.doc.activeElement, middle);
  for (const options of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { defaultPrevented: true }]) assert.equal(tab(last, options), false);
  dialog.close(); assert.equal(tab(last), false);
});


/** Real DOM coverage for moving the same model controls between their two hosts. */
function embeddedHarness(snapshot, initialSelection = null, options = {}) {
  const { JSDOM } = requireDesktop('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><button id="settings-anchor">设置</button><button id="model-anchor">模型</button><main id="settings-host"></main></body></html>');
  const { document } = dom.window;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { if (!this.open) return; this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  let selection = initialSelection, loads = 0, disposed = 0;
  const timers = [];
  const client = { snapshot, ready: true, async load() { loads++; return this.snapshot; }, async mutate() {}, dispose() { disposed++; } };
  const quickPicker = { open() { this.opened = true; }, close() { this.opened = false; }, destroy() {} };
  const context = {
    document, window: dom.window, HTMLElement: dom.window.HTMLElement, isUsableModelConnection,
    mountModelPicker: options => { quickPicker.options = options; return quickPicker; },
    createConnectionClient: () => client, desktopModelFetch() {},
    createIcon: () => document.createElement('span'), createProviderIcon: () => document.createElement('span'),
    openUrl: async () => {}, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
  };
  const actionSource = readFileSync(new URL('../desktop/src/shared/components/ui-kit.js', import.meta.url), 'utf8').match(/^export function createActionButton[^]*?^}/m)[0].replace('export ', '');
  vm.runInNewContext(actionSource, context);
  const source = readFileSync(new URL('../desktop/src/model-connection.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const app = context.mountModelConnections({
    picker: document.querySelector('#model-anchor'), isBusy: options.isBusy ?? (() => false),
    select(value) { selection = value; return true; }, getSelection: () => selection,
  });
  return { app, client, quickPicker, context, timers, dom, document, get loads() { return loads; }, get disposed() { return disposed; }, get selection() { return selection; } };
}

desktopTest('embedded model settings reuse one content tree and select without opening or closing a dialog', async () => {
  const app = embeddedHarness({ connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'alpha', name: 'Alpha' }] }] });
  const { element } = app.app.settings;
  app.document.querySelector('#settings-host').append(element);
  await app.app.settings.open();
  const dialog = app.document.querySelector('#desktop-model-dialog');
  assert.equal(dialog.open, false);
  assert.equal(element.tagName, 'SECTION');
  assert.equal(element.querySelector('#desktop-model-title').textContent, '模型连接');
  assert.equal(element.querySelector('#desktop-model-close').hidden, true);
  assert.equal(app.document.querySelectorAll('#desktop-provider-key').length, 1);
  assert.equal(element.querySelector('#desktop-provider-status').closest('.preferences-group'), element.querySelector('.desktop-connection-state'));
  assert.equal(element.querySelector('#desktop-provider-refresh').closest('.preferences-group'), element.querySelector('.desktop-connection-state'));
  assert.equal(element.querySelector('#desktop-provider-key').closest('form').classList.contains('preferences-group'), true);
  assert.equal(element.querySelector('#desktop-provider-verify').closest('.preferences-group').contains(element.querySelector('#desktop-inference-status')), true);
  assert.equal(element.querySelector('#desktop-model-search').closest('.preferences-group').contains(element.querySelector('.desktop-model-list')), true);
  assert.equal(app.loads, 1);
  const model = element.querySelector('[data-model-id="alpha"]'); model.focus(); model.click();
  assert.equal(app.selection.model, 'alpha');
  assert.equal(element.querySelector('[data-model-id="alpha"]').getAttribute('aria-pressed'), 'true');
  assert.match(element.querySelector('#desktop-provider-status').textContent, /当前模型.*Alpha/);
  assert.equal(dialog.open, false);
  assert.equal(app.document.activeElement.dataset.modelId, 'alpha');
  app.app.destroy(); assert.equal(app.disposed, 1); app.dom.window.close();
});

desktopTest('embedded settings remain inspectable while a chat is running without allowing model changes', async () => {
  const app = embeddedHarness({ connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'alpha', name: 'Alpha' }] }] }, null, { isBusy: () => true });
  app.document.querySelector('#settings-host').append(app.app.settings.element);
  await app.app.settings.open();
  const model = app.app.settings.element.querySelector('[data-model-id="alpha"]');
  assert.ok(model, 'the embedded panel is populated while the chat is busy');
  assert.equal(model.disabled, true); model.click(); assert.equal(app.selection, null);
  assert.equal(app.document.querySelector('#desktop-provider-refresh').disabled, true);
  assert.equal(app.document.querySelector('#desktop-model-dialog').open, false);
  assert.equal(app.app.settings.canClose(), true);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('embedded model activation leaves initial focus to the settings shell before and after loading', async () => {
  for (const connections of [[], [{ providerId: 'openai', status: 'connected', models: [{ id: 'alpha', name: 'Alpha' }] }]]) {
    const app = embeddedHarness({ connections });
    app.document.querySelector('#settings-host').append(app.app.settings.element);
    const anchor = app.document.querySelector('#settings-anchor'); anchor.focus();
    let finish; app.client.load = () => new Promise(resolve => { finish = resolve; });
    const opening = app.app.settings.open();
    assert.equal(app.document.activeElement.id, anchor.id, 'activation must not compete with shell search focus');
    finish(app.client.snapshot); await opening;
    assert.equal(app.document.activeElement.id, anchor.id, 'metadata completion must leave search navigation to the shell');
    const target = app.document.querySelector(connections.length ? '#desktop-model-search' : '#desktop-provider-key');
    target.focus(); assert.equal(app.document.activeElement.id, target.id, 'the shell can focus its requested destination');
    app.app.destroy(); app.dom.window.close();
  }
});

desktopTest('model settings search resolves disconnected catalog and credential results to visible connection controls', async () => {
  const app = embeddedHarness({ connections: [] }); let mutations = 0; app.client.mutate = async () => { mutations++; };
  app.document.querySelector('#settings-host').append(app.app.settings.element); await app.app.settings.open();
  for (const [provider, expected] of [['openai', 'desktop-provider-key'], ['ollama', 'desktop-provider-connect']]) {
    app.document.querySelector(`[data-provider-id="${provider}"]`).click();
    for (const id of ['desktop-connection-editor-toggle', 'desktop-model-search']) {
      const editor = app.document.querySelector('#desktop-connection-editor'); editor.open = false;
      const target = app.app.settings.searchTarget(id);
      assert.equal(target.id, expected); assert.equal(target.closest('[hidden]'), null); assert.equal(editor.open, true);
    }
    const status = app.document.querySelector('#desktop-provider-status'); assert.match(status.textContent, /请先连接.*模型目录/); assert.equal(status.hidden, false);
  }
  assert.equal(app.selection, null); assert.equal(mutations, 0); assert.equal(app.app.settings.searchTarget('missing-setting'), null);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('connected model search keeps its catalog target and expands credentials only when requested', async () => {
  const selection = { providerId: 'openai', model: 'alpha', label: 'Alpha' };
  const app = embeddedHarness({ connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'alpha', name: 'Alpha' }] }] }, selection);
  app.document.querySelector('#settings-host').append(app.app.settings.element); await app.app.settings.open();
  const editor = app.document.querySelector('#desktop-connection-editor'); assert.equal(editor.open, false);
  const catalog = app.app.settings.searchTarget('desktop-model-search'); assert.equal(catalog.id, 'desktop-model-search'); assert.equal(catalog.closest('[hidden]'), null); assert.equal(editor.open, false);
  catalog.focus(); assert.equal(app.document.activeElement.id, catalog.id);
  const credentials = app.app.settings.searchTarget('desktop-connection-editor-toggle'); assert.equal(credentials.id, 'desktop-connection-editor-toggle'); assert.equal(credentials.hidden, false); assert.equal(editor.open, true);
  editor.open = false; assert.equal(app.app.settings.searchTarget('desktop-provider-key').id, 'desktop-provider-key'); assert.equal(editor.open, true);
  assert.equal(app.selection, selection); app.app.settings.close(); assert.equal(app.app.settings.searchTarget('desktop-model-search'), null);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('model search during pending OAuth resolves to a visible authorization control without altering the flow', async () => {
  const oauth = { status: 'waiting', mode: 'manual', flowId: 'search-flow', authorizationUrl: 'https://openrouter.ai/auth' };
  const app = embeddedHarness({ connections: [], oauth }); let mutations = 0; app.client.mutate = async () => { mutations++; };
  app.document.querySelector('#settings-host').append(app.app.settings.element); await app.app.settings.open(); app.document.querySelector('[data-provider-id="openrouter"]').click();
  const target = app.app.settings.searchTarget('desktop-model-search');
  assert.equal(target.id, 'desktop-oauth-code'); assert.equal(target.closest('[hidden]'), null);
  assert.match(app.document.querySelector('#desktop-provider-status').textContent, /完成当前授权/); assert.equal(app.client.snapshot.oauth, oauth); assert.equal(mutations, 0);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('leaving embedded settings clears revealed credentials and authorization code without restoring outside focus', async () => {
  const app = embeddedHarness({ connections: [] });
  app.document.querySelector('#settings-host').append(app.app.settings.element);
  await app.app.settings.open();
  const key = app.document.querySelector('#desktop-provider-key'), code = app.document.querySelector('#desktop-oauth-code');
  key.value = 'ephemeral-key'; app.document.querySelector('#desktop-provider-reveal').click(); code.value = 'ephemeral-code';
  const destination = app.document.querySelector('#settings-anchor'); destination.focus();
  app.app.settings.close();
  assert.equal(key.value, ''); assert.equal(key.type, 'password'); assert.equal(code.value, '');
  assert.equal(app.document.activeElement, destination);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('embedded settings guard in-flight mutations while leaving read-only loads dismissible', async () => {
  const app = embeddedHarness({ connections: [{ providerId: 'openai', status: 'connected', models: [{ id: 'alpha', name: 'Alpha' }] }] }, { providerId: 'openai', model: 'alpha', label: 'Alpha' });
  app.document.querySelector('#settings-host').append(app.app.settings.element);
  let finishLoad; app.client.load = () => new Promise(resolve => { finishLoad = resolve; });
  const opening = app.app.settings.open();
  assert.equal(app.app.settings.canClose(), true, 'reading metadata does not lock navigation');
  finishLoad(app.client.snapshot); await opening;
  app.client.load = async () => app.client.snapshot;
  let finishMutation; app.client.mutate = () => new Promise(resolve => { finishMutation = resolve; });
  app.document.querySelector('#desktop-provider-verify').click();
  assert.equal(app.app.settings.canClose(), false);
  finishMutation({}); await settle();
  assert.equal(app.app.settings.canClose(), true);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('embedded settings discard stale opening focus after leaving and do not capture Tab or quick-picker shortcuts', async () => {
  const app = embeddedHarness({ connections: [] });
  const panel = app.app.settings.element; app.document.querySelector('#settings-host').append(panel);
  let finish; app.client.load = () => new Promise(resolve => { finish = resolve; });
  const opening = app.app.settings.open();
  const target = app.document.querySelector('#settings-anchor'); target.focus(); app.app.settings.close();
  finish(app.client.snapshot); await opening;
  assert.equal(app.document.activeElement, target);
  app.client.load = async () => app.client.snapshot; await app.app.settings.open();
  const tab = new app.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); panel.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  app.document.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', { key: 'm', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  assert.notEqual(app.quickPicker.opened, true, 'the composer picker stays behind the settings workspace');
  app.app.settings.close();
  app.document.dispatchEvent(new app.dom.window.KeyboardEvent('keydown', { key: 'm', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(app.quickPicker.opened, true);
  app.app.destroy(); app.dom.window.close();
});

desktopTest('legacy model dialog and embedded settings transfer the same form without duplicate controls', async () => {
  const app = embeddedHarness({ connections: [] });
  app.document.querySelector('#settings-host').append(app.app.settings.element);
  await app.app.settings.open();
  const key = app.document.querySelector('#desktop-provider-key'); app.app.settings.close();
  const anchor = app.document.querySelector('#settings-anchor'); app.app.open(anchor); await settle();
  const dialog = app.document.querySelector('#desktop-model-dialog');
  assert.equal(dialog.open, true); assert.equal(dialog.querySelector('#desktop-provider-key'), key);
  assert.equal(app.document.activeElement.id, key.id);
  assert.equal(dialog.querySelector('#desktop-model-close').hidden, false);
  dialog.close(); assert.equal(app.document.activeElement, anchor);
  await app.app.settings.open();
  assert.equal(dialog.open, false);
  assert.equal(app.app.settings.element.querySelector('#desktop-provider-key'), key);
  assert.equal(app.document.querySelectorAll('#desktop-provider-key').length, 1);
  app.app.destroy(); app.dom.window.close();
});
