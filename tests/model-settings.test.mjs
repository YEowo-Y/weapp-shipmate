import test from 'node:test';
import { URLSearchParams } from 'node:url';
import { createConnectionClient, isUsableModelConnection } from '../desktop/design-previews/model-connection-client.js';
import { SUPPORTED_CHAT_PROVIDERS } from '../desktop/design-previews/chat-transport.js';
import { settingsHref } from '../desktop/design-previews/navigation.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PROVIDERS, createSettingsDraft, validateEndpoint, validateModelId } from '../desktop/design-previews/settings-state.js';
import { createProviderIcon } from '../desktop/design-previews/components/provider-icons.js';
import { createIcon } from '../desktop/design-previews/components/icons.js';
import { createActionButton } from './helpers/ui-action.mjs';

test('provider drafts are isolated and accept only endpoint and explicit model IDs', () => {
  const draft = createSettingsDraft();
  assert.equal(draft.get('ollama').endpoint, 'http://127.0.0.1:11434');
  assert.equal(PROVIDERS.find(p => p.id === 'ollama').requiresKey, false);
  draft.setEndpoint('openai', 'https://proxy.example/v1');
  assert.equal(draft.addModel('openai', 'my-model').ok, true);
  assert.equal(draft.addModel('openai', 'my-model').ok, false);
  assert.deepEqual(draft.get('anthropic').models, []);
  const snapshot = draft.get('openai');
  snapshot.models.push('should-not-mutate');
  assert.deepEqual(draft.get('openai').models, ['my-model']);
  assert.equal(draft.removeModel('openai', 'my-model'), true);
  assert.deepEqual(draft.get('openai').models, []);
  assert.throws(() => draft.get('__proto__'), /Unknown/);
  assert.equal(draft.setEndpoint('openai', 'https://user:secret@example.com').ok, false);
  assert.equal(draft.get('openai').endpoint, 'https://proxy.example/v1');
});

test('DeepSeek, GLM and Kimi expose fixed provider presets with isolated drafts', () => {
  const draft = createSettingsDraft();
  for (const [id, name, endpoint] of [
    ['deepseek', 'DeepSeek', 'https://api.deepseek.com'],
    ['glm', 'GLM · 智谱', 'https://open.bigmodel.cn/api/paas/v4'],
    ['kimi', 'Kimi', 'https://api.moonshot.cn/v1'],
  ]) {
    const provider = PROVIDERS.find(item => item.id === id);
    assert.equal(provider?.name, name);
    assert.equal(provider.requiresKey, true);
    assert.equal(draft.get(id).endpoint, endpoint);
    assert.equal(SUPPORTED_CHAT_PROVIDERS[id], name);
    assert.equal(draft.addModel(id, `${id}-test-model`).ok, true);
    assert.deepEqual(draft.get(id).models, [`${id}-test-model`]);
  }
});

test('endpoint validation rejects embedded credentials, tokens and remote cleartext', () => {
  for (const url of ['javascript:alert(1)', 'http://remote.example', 'https://u:p@example.com', 'https://example.com?key=secret', 'https://example.com#secret', 'not a url', 'http://127.0.0.1.evil.test']) {
    assert.equal(validateEndpoint(url).ok, false, url);
  }
  for (const url of ['https://api.example.com/v1', 'http://localhost:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434']) assert.equal(validateEndpoint(url).ok, true, url);
});

test('model IDs are bounded literal data; local demo cannot acquire an external model', () => {
  for (const id of ['', 'with spaces', '<script>', 'x'.repeat(201)]) assert.equal(validateModelId(id).ok, false);
  assert.equal(validateModelId('team/model-v1:latest').ok, true);
  const draft = createSettingsDraft();
  assert.equal(draft.addModel('local-demo', 'remote-model').ok, false);
  assert.equal(draft.setEndpoint('local-demo', 'https://example.com').ok, false);
});

test('model chooser exposes the running source and settings without fake effort choices', () => {
  const source = readFileSync(new URL('../desktop/design-previews/ui.js', import.meta.url), 'utf8');
  const fn = source.match(/ {2}function openModel\([^]*?\n {2}}/)[0];
  const context = vm.createContext({ isUsableModelConnection, settingsHref, openMenu: options => options, location: { href: '', pathname: '/chat-full.html' } });
  vm.runInContext(fn, context);
  const trigger = {};
  let selected;
  const menu = context.openModel(trigger, value => { selected = value; });
  assert.equal(menu.trigger, trigger);
  assert.equal(menu.anchor, undefined, 'menu uses the model button, not the whole composer');
  assert.equal(menu.items.filter(item => item.checked).length, 1);
  menu.items[0].onSelect();
  assert.equal(selected.value, 'local-demo');
  assert.equal(menu.items[1].disabled, true);
  menu.items[2].onSelect();
  assert.equal(context.location.href, 'settings.html?from=chat#key');
});

// Executes the real settings module with a minimal DOM. Browser layout, native
// focus trapping and Escape dispatch are separate verification requirements.
function authorizationFixture(mode = 'callback') {
  const flowId = 'f'.repeat(43);
  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('code_challenge', 'c'.repeat(43));
  url.searchParams.set('code_challenge_method', 'S256');
  if (mode === 'callback') {
    url.searchParams.set('callback_url', `http://127.0.0.1:5501/api/model-connections/oauth/callback/${flowId}`);
    url.searchParams.set('state', 's'.repeat(43));
  }
  return { authorizationUrl: url.href, mode, flowId, expiresAt: '2026-10-20T00:00:00Z' };
}
function settingsHarness({ unavailable = false, holdConnect = null, catalogError = false, search = '', initialOAuth = null, holdAction = null, emptyCatalog = false, actionRender = () => null } = {}) {
  class Node {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.value = ''; this.className = ''; this.textContent = '';
      const render = tag === 'wa-button' && actionRender();
      this.rendered = !render;
      if (render) this.updateComplete = render.then(() => { this.rendered = true; });
    }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    replaceChildren(...children) { if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = null; for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    removeAttribute(name) { delete this.attributes[name]; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    querySelectorAll(selector) {
      const matches = node => selector.startsWith('#') ? node.id === selector.slice(1)
        : selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tag === selector;
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
    removeEventListener(name, callback) { this.listeners.set(name, (this.listeners.get(name) || []).filter(fn => fn !== callback)); }
    async fire(name, event = {}) { for (const fn of [...(this.listeners.get(name) || [])]) await fn({ target: this, preventDefault() {}, ...event }); if (name === 'click' && this.type === 'submit') { let form = this.parentElement; while (form && form.tag !== 'form') form = form.parentElement; await form?.fire('submit'); } }
    focus() { if (!this.rendered) throw new Error('Web Awesome shadow button has not rendered'); document.activeElement = this; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    close() { return this.fire('close'); }
  }
  const nodes = Object.fromEntries(['provider-list', 'provider-detail', 'provider-search', 'provider-empty', 'provider-picker'].map(id => [id, new Node()]));
  const appearance = new Node(); const description = new Node(); description.className = 'desc'; appearance.append(description);
  const document = {
    body: new Node('body'),
    createElement: tag => new Node(tag),
    createElementNS: (_namespace, tag) => new Node(tag),
    getElementById: id => nodes[id],
    querySelectorAll: () => [],
    querySelector: () => appearance,
  };
  const window = new Node(); window.location = { search }; const dialogs = [];
  window.shipmateUI = { ready: Promise.resolve({
    makeDialog({ trigger }) { const dialog = new Node('dialog'); dialog.addEventListener('close', () => { if (trigger?.parentElement) trigger.focus(); }); const title = new Node('h2'); title.className = 'shipmate-dialog__title'; const body = new Node(); body.className = 'shipmate-dialog__body'; dialog.append(title, body); dialogs.push(dialog); return dialog; },
    showDialog(dialog, input) { dialog.open = true; input.focus(); },
  }) };
  const requests = [];
  const timers = new Map(); let timerId = 0;
  const snapshot = { csrfToken: 'test-token', storage: 'memory', connections: PROVIDERS.filter(p => !['custom', 'local-demo'].includes(p.id)).map(p => ({ providerId: p.id, status: 'disconnected', authMethod: null, models: [], error: null })), oauth: initialOAuth };
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (typeof unavailable === 'function' ? unavailable(url, options) : unavailable) throw new Error('offline');
    const [id, action, extra] = url.replace('/api/model-connections', '').split('/').slice(1);
    const connection = snapshot.connections.find(item => item.providerId === id);
    if (options.method === 'POST' && holdAction?.action === [action, extra].filter(Boolean).join('/')) await holdAction.promise;
    if (options.method === 'POST' && action === 'oauth') {
      const flow = authorizationFixture(JSON.parse(options.body).mode || 'callback');
      snapshot.oauth = { providerId: id, status: extra === 'start' ? 'waiting' : extra === 'complete' ? 'success' : 'cancelled', message: '测试授权状态', ...(extra === 'start' ? flow : {}) };
      if (extra === 'complete') {
        if (typeof catalogError === 'function' && catalogError('oauth/complete')) {
          snapshot.oauth.status = 'error'; snapshot.oauth.message = '授权码无效，请重新授权';
          connection.status = 'error'; connection.error = { message: snapshot.oauth.message };
        } else { connection.status = 'connected'; connection.authMethod = 'oauth'; connection.models = [{ id: 'model-one', name: 'Model One' }]; }
      }
      if (extra === 'start') return { ok: true, json: async () => flow };
    } else if (options.method === 'POST') {
      if (action === 'connect' && holdConnect) await holdConnect;
      if ((typeof catalogError === 'function' ? catalogError(action) : catalogError) && action !== 'disconnect') {
        connection.status = 'error'; connection.hasCredential = true; connection.error = { code: 'upstream', message: '目录读取失败，请重试' };
        return { ok: true, json: async () => JSON.parse(JSON.stringify(snapshot)) };
      }
      connection.status = action === 'disconnect' ? 'disconnected' : id === 'glm' ? 'configured' : 'connected';
      if (id === 'glm') { connection.catalogSource = 'preset'; connection.hasCredential = action !== 'disconnect'; }
      connection.authMethod = action === 'disconnect' ? null : id === 'ollama' ? 'local' : 'api-key';
      connection.models = action === 'disconnect' || emptyCatalog ? [] : [{ id: 'model-one', name: 'Model One' }, { id: 'model-two', name: 'Model Two' }];
    }
    return { ok: true, json: async () => JSON.parse(JSON.stringify(snapshot)) };
  };
  const context = vm.createContext({ isUsableModelConnection, document, window, URLSearchParams, SUPPORTED_CHAT_PROVIDERS, PROVIDERS, createSettingsDraft, createProviderIcon, createIcon, createActionButton,
    createConnectionClient: () => createConnectionClient(fetcher),
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
  });
  const source = readFileSync(new URL('../desktop/design-previews/settings.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function', 'function');
  vm.runInContext(source, context);
  const select = async id => nodes['provider-list'].children.find(node => node.dataset.provider === id).fire('click');
  const findButton = (root, text) => [...root.querySelectorAll('button'), ...root.querySelectorAll('wa-button')].find(node => node.textContent === text);
  return { document, nodes, window, dialogs, select, findButton, requests, timers, snapshot, flush: async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }, detail: nodes['provider-detail'] };
}


test('verified service enables credential submission and clears the transient key immediately', async () => {
  const app = settingsHarness(); await app.flush();
  await app.findButton(app.detail, '使用 API Key 连接').fire('click');
  const dialog = app.dialogs.at(-1); const input = dialog.querySelector('input');
  input.value = 'test-only-key'; await input.fire('input');
  await app.findButton(dialog, '连接并读取模型').fire('click');
  assert.equal(input.value, ''); assert.equal(input.type, 'password');
  assert.equal(app.requests.find(request => request.options.method === 'POST').options.headers['X-Shipmate-CSRF'], 'test-token');
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 2);
  const search = app.detail.querySelector('#provider-model-search');
  search.value = 'two'; await search.fire('input');
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 1);
  await app.findButton(app.detail, '断开本机连接').fire('click'); await app.flush();
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 0);
});

test('service failure offers startup guidance and never enables real credential fields', async () => {
  const app = settingsHarness({ unavailable: true }); await app.flush();
  assert.equal(app.findButton(app.detail, '使用 API Key 连接'), undefined);
  assert.match(app.detail.querySelector('.settings-feedback').textContent, /重新启动应用或连接服务/);
  assert.ok(app.findButton(app.detail, '重试连接服务'));
  assert.equal(app.dialogs.length, 0);
});

test('credential fields clear on cancel, provider switch and pagehide', async () => {
  for (const action of ['cancel', 'switch', 'pagehide']) {
    const app = settingsHarness(); await app.flush();
    await app.findButton(app.detail, '使用 API Key 连接').fire('click');
    const dialog = app.dialogs.at(-1); const input = dialog.querySelector('input');
    input.value = 'test-only-key'; await input.fire('input');
    await dialog.querySelector('.credential-reveal').fire('click');
    if (action === 'cancel') await app.findButton(dialog, '取消').fire('click');
    if (action === 'switch') await app.select('anthropic');
    if (action === 'pagehide') await app.window.fire('pagehide');
    assert.equal(input.value, ''); assert.equal(input.type, 'password');
    assert.equal(app.requests.some(request => request.options.method === 'POST'), false);
  }
});

test('custom provider remains non-executable and retains unsubmitted non-secret fields', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('custom');
  let endpoint = app.detail.querySelector('#provider-endpoint');
  endpoint.value = 'unfinished address'; await endpoint.fire('input');
  let model = app.detail.querySelector('#provider-model-id'); model.value = 'unfinished model'; await model.fire('input');
  await app.select('anthropic'); await app.select('custom');
  endpoint = app.detail.querySelector('#provider-endpoint'); model = app.detail.querySelector('#provider-model-id');
  assert.equal(endpoint.value, 'unfinished address'); assert.equal(model.value, 'unfinished model');
  await app.detail.querySelector('.provider-endpoint').fire('submit');
  assert.equal(endpoint.attributes['aria-invalid'], 'true');
  endpoint.value = 'https://example.com'; await endpoint.fire('input');
  assert.notEqual(endpoint.attributes['aria-invalid'], 'true');
  assert.equal(app.detail.querySelector('#endpoint-feedback').textContent, '');
  model.value = 'test-model'; await app.detail.querySelector('.provider-model-form').fire('submit');
  assert.match(app.detail.querySelector('#model-feedback').textContent, /尚不支持连接或用于对话/);
  model.value = 'test-model'; await app.detail.querySelector('.provider-model-form').fire('submit');
  assert.equal(model.attributes['aria-invalid'], 'true');
  await app.detail.querySelector('.settings-icon-button').fire('click');
  assert.notEqual(model.attributes['aria-invalid'], 'true');
  assert.match(app.detail.querySelector('#model-feedback').textContent, /已移除/);
  model.value = 'next'; await model.fire('input');
  assert.equal(app.detail.querySelector('#model-feedback').textContent, '');
  assert.equal(app.findButton(app.detail, '测试连接').disabled, true);
  assert.equal(app.findButton(app.detail, '使用 API Key 连接'), undefined);
});

test('provider selection restores removed list focus without stealing picker or search focus', async () => {
  const app = settingsHarness(); await app.flush();
  const list = app.nodes['provider-list'];
  const old = list.children.find(row => row.dataset.provider === 'anthropic');
  old.focus(); await old.fire('click');
  assert.equal(old.parentElement, null);
  assert.equal(app.document.activeElement, list.children.find(row => row.dataset.provider === 'anthropic'));
  const picker = app.nodes['provider-picker']; picker.focus(); picker.value = 'ollama'; await picker.fire('change');
  assert.equal(app.document.activeElement, picker);
  assert.equal(app.detail.querySelector('#provider-endpoint'), null, 'real provider address is not editable');
  const search = app.nodes['provider-search']; search.focus(); search.value = 'open'; await search.fire('input');
  assert.equal(app.document.activeElement, search);
  assert.equal(picker.value, 'ollama');
  assert.deepEqual(picker.children.map(option => option.value), ['ollama', 'openai', 'openrouter']);
});

test('OpenRouter authorization uses an explicit safe link and polling stops on cancellation or pagehide', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('openrouter');
  await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
  const link = app.detail.querySelectorAll('a').find(item => item.textContent === '继续前往 OpenRouter 授权');
  assert.equal(link.href, authorizationFixture().authorizationUrl); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(app.timers.size, 1);
  await app.findButton(app.detail, '取消授权').fire('click'); await app.flush();
  assert.equal(app.timers.size, 0);
  await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
  assert.equal(app.timers.size, 1);
  await app.window.fire('pagehide'); assert.equal(app.timers.size, 0);
});

test('raw editing rejects secret fields and URL tokens without changing accepted data', () => {
  const draft = createSettingsDraft();
  draft.setEditing('custom', 'endpoint', 'unfinished address'); draft.setEditing('custom', 'model', 'unfinished model');
  assert.equal(draft.setEndpoint('custom', 'unfinished address').ok, false);
  assert.equal(draft.get('custom').endpoint, '');
  draft.setEditing('custom', 'apiKey', 'secret');
  assert.deepEqual(Object.keys(draft.getEditing('custom')).sort(), ['endpoint', 'model']);
  for (const text of ['https://user:secret@example.com', 'https://example.com?key=secret', 'https://example.com#secret']) {
    draft.setEditing('custom', 'endpoint', text); assert.equal(draft.getEditing('custom').endpoint, '');
  }
});


test('late connection results never replace the newly selected provider or move its focus', async () => {
  let finish; const held = new Promise(resolve => { finish = resolve; });
  const app = settingsHarness({ holdConnect: held }); await app.flush();
  await app.findButton(app.detail, '使用 API Key 连接').fire('click');
  const dialog = app.dialogs.at(-1); const key = dialog.querySelector('input'); key.value = 'test-only'; await key.fire('input');
  const connecting = app.findButton(dialog, '连接并读取模型').fire('click');
  await app.select('custom');
  const endpoint = app.detail.querySelector('#provider-endpoint'); endpoint.focus();
  endpoint.value = 'unfinished'; await endpoint.fire('input');
  finish(); await connecting; await app.flush();
  assert.equal(app.detail.querySelector('#provider-endpoint'), endpoint);
  assert.equal(app.document.activeElement, endpoint);
  assert.equal(endpoint.value, 'unfinished');
});

test('HTTP success with failed catalog stays an error and offers refresh for retained credentials', async () => {
  const app = settingsHarness({ catalogError: true }); await app.flush(); await app.select('ollama');
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  assert.equal(app.detail.querySelector('.provider-status').textContent, '连接失败');
  assert.match(app.detail.querySelector('.settings-feedback').textContent, /目录读取失败/);
  assert.ok(app.findButton(app.detail, '刷新目录'));
  assert.ok(app.findButton(app.detail, '断开本机连接'));
});


test('cross-provider OAuth load cannot strand a late successful connection in connecting state', async () => {
  let finish; const held = new Promise(resolve => { finish = resolve; });
  const app = settingsHarness({ holdConnect: held }); await app.flush();
  await app.findButton(app.detail, '使用 API Key 连接').fire('click');
  const dialog = app.dialogs.at(-1); const input = dialog.querySelector('input'); input.value = 'test-only'; await input.fire('input');
  const connecting = app.findButton(dialog, '连接并读取模型').fire('click');
  await app.select('openrouter'); await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
  finish(); await connecting; await app.flush(); await app.select('openai');
  assert.equal(app.detail.querySelector('.provider-status').textContent, '目录已验证');
});

test('refresh preserves its action focus but never steals focus from the provider search', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('ollama');
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  const refresh = app.findButton(app.detail, '刷新目录'); refresh.focus();
  await refresh.fire('click'); await app.flush();
  assert.equal(app.document.activeElement, app.findButton(app.detail, '刷新目录'));
  const next = app.findButton(app.detail, '刷新目录'); next.focus();
  const running = next.fire('click'); app.nodes['provider-search'].focus(); await running; await app.flush();
  assert.equal(app.document.activeElement, app.nodes['provider-search']);
});


test('disconnect provides a next action and authorization polling retains catalog search selection', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('ollama');
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  const disconnect = app.findButton(app.detail, '断开本机连接'); disconnect.focus();
  await disconnect.fire('click'); await app.flush();
  assert.equal(app.document.activeElement, app.findButton(app.detail, '连接本机 Ollama'));
  await app.select('openrouter');
  const state = app.snapshot.connections.find(item => item.providerId === 'openrouter');
  state.status = 'connected'; state.authMethod = 'oauth'; state.models = [{ id: 'model-one', name: 'Model One' }];
  await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
  const search = app.detail.querySelector('#provider-model-search'); search.value = 'model'; await search.fire('input'); search.focus(); search.setSelectionRange(1, 3);
  app.snapshot.oauth.message = '正在等待授权确认';
  const poll = [...app.timers.values()][0]; await poll(); await app.flush();
  const updated = app.detail.querySelector('#provider-model-search');
  assert.equal(app.document.activeElement, updated); assert.equal(updated.value, 'model');
  assert.equal(updated.selectionStart, 1); assert.equal(updated.selectionEnd, 3);
});


test('focused busy credential action cannot reopen a key dialog during a slow connection', async () => {
  let finish; const held = new Promise(resolve => { finish = resolve; });
  const app = settingsHarness({ holdConnect: held }); await app.flush();
  const trigger = app.findButton(app.detail, '使用 API Key 连接'); trigger.focus(); await trigger.fire('click');
  const dialog = app.dialogs.at(-1); const input = dialog.querySelector('input'); input.value = 'test-only'; await input.fire('input');
  const pending = app.findButton(dialog, '连接并读取模型').fire('click');
  await app.flush();
  const busy = app.findButton(app.detail, '使用 API Key 连接');
  assert.equal(app.document.activeElement, app.detail.querySelector('h3'));
  assert.equal(busy.disabled, true, 'busy action retains real component disabled semantics');
  await busy.fire('click'); await app.flush();
  assert.equal(app.dialogs.length, 1, 'busy guard blocks activation after awaiting UI readiness');
  finish(); await pending; await app.flush();
});

test('credential submission waits for action rendering without blocking requests or stealing later focus', async () => {
  for (const destination of ['action', 'search', 'replaced', 'completed-search', 'completed-switch']) {
    let finishConnect; const connection = new Promise(resolve => { finishConnect = resolve; });
    let finishRender; const rendering = new Promise(resolve => { finishRender = resolve; });
    let delayActions = false;
    const app = settingsHarness({ holdConnect: connection, actionRender: () => delayActions ? rendering : null });
    await app.flush();
    const trigger = app.findButton(app.detail, '使用 API Key 连接'); trigger.focus(); await trigger.fire('click');
    const dialog = app.dialogs.at(-1); const input = dialog.querySelector('input');
    input.value = 'test-only'; await input.fire('input');
    delayActions = true;
    const pending = dialog.querySelector('form').fire('submit');
    await app.flush();
    const busy = app.findButton(app.detail, '使用 API Key 连接');
    assert.equal(busy.rendered, false);
    assert.ok(app.requests.some(request => request.url.endsWith('/connect')), 'request starts before action finishes rendering');
    assert.equal(input.value, '', 'Enter submission clears the credential immediately');
    if (destination === 'search') app.nodes['provider-search'].focus();
    if (destination === 'replaced' || destination.startsWith('completed-')) { finishConnect(); await pending; await app.flush(); }
    if (destination === 'completed-search') app.nodes['provider-search'].focus();
    if (destination === 'completed-switch') await app.select('anthropic');
    finishRender(); await app.flush();
    if (destination === 'action') assert.equal(app.document.activeElement, app.detail.querySelector('h3'));
    if (destination === 'search') assert.equal(app.document.activeElement, app.nodes['provider-search']);
    if (destination === 'replaced') assert.notEqual(app.document.activeElement, busy, 'detached action never receives delayed focus');
    if (destination === 'completed-search') assert.equal(app.document.activeElement, app.nodes['provider-search'], 'render completion cannot reclaim user focus');
    if (destination === 'completed-switch') assert.equal(app.detail.dataset.provider, 'anthropic');
    finishConnect(); await pending; await app.flush();
    if (destination !== 'completed-switch') assert.ok(app.findButton(app.detail, '刷新目录'), 'connection completes and leaves busy state');
  }
});


test('OAuth callback selects its allowlisted provider without consuming navigation parameters', async () => {
  const search = '?provider=openrouter&from=chat';
  const app = settingsHarness({ search }); await app.flush();
  assert.equal(app.nodes['provider-picker'].value, 'openrouter');
  assert.ok(app.findButton(app.detail, '通过 OpenRouter 授权'));
  assert.equal(app.window.location.search, search);
  for (const provider of ['unknown', '__proto__', 'https://evil.test', 'OpenRouter']) {
    const invalid = settingsHarness({ search: `?provider=${encodeURIComponent(provider)}` }); await invalid.flush();
    assert.equal(invalid.nodes['provider-picker'].value, 'openai');
  }
});

test('credential dialog uses a bounded native form and an official key link', async () => {
  const app = settingsHarness(); await app.flush();
  await app.findButton(app.detail, '使用 API Key 连接').fire('click');
  const dialog = app.dialogs.at(-1); const input = dialog.querySelector('input');
  assert.equal(dialog.querySelector('.shipmate-dialog__title').children.at(-1).textContent, 'OpenAI 密钥');
  assert.equal(dialog.querySelector('.credential-label').textContent, 'API Key');
  assert.equal(input.maxLength, 4096);
  assert.equal(input.attributes['aria-describedby'], 'provider-key-hint provider-key-feedback');
  assert.match(dialog.querySelector('.credential-hint').textContent, /本机内存/);
  assert.equal(app.findButton(dialog, '连接并读取模型').tag, 'wa-button');
  assert.equal(app.findButton(dialog, '连接并读取模型').attributes.appearance, 'accent');
  const reveal = dialog.querySelector('.credential-reveal');
  assert.equal(reveal.attributes.appearance, 'plain');
  assert.equal(reveal.children.map(node => node.textContent).join(''), '显示密钥');
  assert.equal(reveal.querySelector('.sr-only').textContent, '密钥');
  assert.equal(reveal.attributes['aria-pressed'], undefined);
  await reveal.fire('click');
  assert.equal(input.type, 'text');
  assert.equal(reveal.children.map(node => node.textContent).join(''), '隐藏密钥');
  assert.equal(reveal.title, '隐藏密钥');
  await reveal.fire('click');
  assert.equal(input.type, 'password');
  assert.equal(dialog.querySelector('a').href, 'https://platform.openai.com/api-keys');
  assert.equal(dialog.querySelector('a').textContent, '获取 OpenAI API Key');
  assert.equal(dialog.querySelector('a').querySelector('svg').attributes['aria-hidden'], 'true');
  const form = dialog.querySelector('form'); assert.ok(form);
  input.value = '   '; await form.fire('submit');
  assert.equal(app.requests.some(item => item.options.method === 'POST'), false);
  input.value = 'k'.repeat(600); await input.fire('input'); await form.fire('submit'); await app.flush();
  assert.equal(input.value, '');
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 2);
});

test('GLM browser settings save a clearly unverified preset and offer returning to chat without fake discovery', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('glm');
  await app.findButton(app.detail, '设置 API Key').fire('click');
  const dialog = app.dialogs.at(-1);
  assert.equal(dialog.querySelector('a').href, 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys');
  assert.ok(app.findButton(dialog, '保存配置'));
  dialog.querySelector('input').value = 'glm-test-key';
  await dialog.querySelector('form').fire('submit'); await app.flush();
  assert.ok(app.findButton(app.detail, '重新载入预设'));
  assert.equal(app.detail.querySelector('.provider-status').textContent, '配置已保存，尚未验证');
  assert.match(app.detail.querySelector('.provider-description').textContent, /官方文档预设.*不验证密钥/);
  assert.ok(app.detail.querySelector('.provider-chat-link'));
  assert.equal(app.requests.filter(item => item.options.method === 'POST').length, 1);
});

test('provider navigation stays native while guarded connection actions use shared open-source buttons', async () => {
  const app = settingsHarness(); await app.flush();
  assert.ok(app.nodes['provider-list'].children.every(row => row.tag === 'button'));
  const connect = app.findButton(app.detail, '使用 API Key 连接');
  assert.equal(connect.tag, 'wa-button');
  assert.equal(connect.dataset.uiControl, 'action');
  assert.equal(connect.type, 'button');
  await app.select('custom');
  assert.equal(app.findButton(app.detail, '检查并保留草稿').type, 'submit');
  assert.equal(app.findButton(app.detail, '添加模型').type, 'submit');
  assert.equal(app.findButton(app.detail, '测试连接').disabled, true);
});

test('catalog filtering reports matches and preserves query and scroll across refresh and provider changes', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('ollama');
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  const input = app.detail.querySelector('#provider-model-search'); input.value = 'two'; await input.fire('input');
  assert.equal(input.parentElement.tag, 'label');
  assert.equal(input.parentElement.querySelector('svg').attributes['aria-hidden'], 'true');
  assert.equal(app.detail.querySelector('.provider-model-copy').querySelector('strong').textContent, 'Model Two');
  assert.equal(app.detail.querySelector('.provider-model-id').textContent, 'model-two');
  assert.match(app.detail.querySelector('.provider-catalog-count').textContent, /1.*2/);
  app.detail.querySelector('.provider-catalog').scrollTop = 123;
  await app.findButton(app.detail, '刷新目录').fire('click'); await app.flush();
  assert.equal(app.detail.querySelector('.provider-catalog').scrollTop, 123);
  await app.select('openai'); await app.select('ollama');
  assert.equal(app.detail.querySelector('#provider-model-search').value, 'two');
  assert.equal(app.detail.querySelector('.provider-catalog').scrollTop, 123);
  await app.findButton(app.detail, '清除搜索').fire('click');
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 2);
  assert.equal(app.document.activeElement, app.detail.querySelector('#provider-model-search'));
  const currentInput = app.detail.querySelector('#provider-model-search');
  currentInput.value = 'no-such-model'; await currentInput.fire('input');
  const empty = app.detail.querySelector('.provider-model-empty');
  assert.equal(empty.querySelector('strong').textContent, '没有匹配的模型');
  assert.match(empty.querySelector('p').textContent, /清除搜索/);
  assert.equal(empty.querySelector('svg').attributes['aria-hidden'], 'true');
  await app.findButton(app.detail, '清除搜索').fire('click');
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 2);
});

test('capability and provider list reflect text chat and connected states', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('anthropic');
  assert.match(app.detail.querySelector('.provider-capability').textContent, /文本聊天/);
  await app.select('ollama');
  assert.match(app.detail.querySelector('.provider-capability').textContent, /文本聊天/);
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  assert.equal(app.nodes['provider-list'].children.find(row => row.dataset.provider === 'ollama').querySelector('.provider-select-status').textContent, '目录已验证');
});

for (const providerId of ['anthropic', 'google']) {
  test(`${providerId} verified connection offers the existing choose-model next step`, async () => {
    const app = settingsHarness(); await app.flush(); await app.select(providerId);
    assert.match(app.detail.querySelector('.provider-capability').textContent, /文本聊天/);
    await app.findButton(app.detail, '使用 API Key 连接').fire('click');
    const dialog = app.dialogs.at(-1), input = dialog.querySelector('input');
    input.value = 'fixture-only'; await input.fire('input');
    await dialog.querySelector('form').fire('submit'); await app.flush();
    assert.equal(app.detail.querySelector('.provider-status').textContent, '目录已验证');
    assert.ok(app.detail.querySelector('.provider-chat-link'));
    assert.equal(app.detail.querySelector('.provider-chat-link').textContent, '返回对话选择模型');
    assert.equal(app.detail.querySelector('.provider-chat-link').querySelector('svg').attributes['aria-hidden'], 'true');
  });
}


test('OAuth waiting with a missing server link has explicit cancel-and-restart recovery', async () => {
  const app = settingsHarness({ search: '?provider=openrouter', initialOAuth: { providerId: 'openrouter', status: 'waiting', message: '等待授权' } }); await app.flush();
  assert.match(app.detail.querySelector('.provider-oauth-recovery').textContent, /取消此次授权/);
  assert.equal(app.detail.querySelectorAll('a').some(link => link.textContent === '继续前往 OpenRouter 授权'), false);
  await app.findButton(app.detail, '取消授权').fire('click'); await app.flush();
  assert.equal(app.findButton(app.detail, '通过 OpenRouter 授权').disabled, false);
  await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
  assert.ok(app.detail.querySelectorAll('a').find(link => link.textContent === '继续前往 OpenRouter 授权'));
});

test('reopening settings restores manual authorization and polling preserves the code field and selection', async () => {
  const flow = { providerId: 'openrouter', status: 'waiting', ...authorizationFixture('manual') };
  const app = settingsHarness({ search: '?provider=openrouter', initialOAuth: flow }); await app.flush();
  assert.equal(app.detail.querySelectorAll('a').find(link => link.dataset.settingsAction === 'oauth-continue').href, flow.authorizationUrl);
  assert.match(app.detail.querySelector('.provider-oauth-deadline').textContent, /10 分钟.*截止/);
  const input = app.detail.querySelector('#provider-authorization-code');
  assert.equal(input.type, 'password'); assert.equal(input.autocomplete, 'off');
  input.value = 'test-code'; await input.fire('input'); input.focus(); input.setSelectionRange(2, 5);
  app.snapshot.oauth.message = '等待完成授权码连接';
  await [...app.timers.values()][0](); await app.flush();
  assert.equal(app.detail.querySelector('#provider-authorization-code'), input);
  assert.equal(input.value, 'test-code'); assert.equal(app.document.activeElement, input);
  assert.equal(input.selectionStart, 2); assert.equal(input.selectionEnd, 5);
  assert.equal(app.findButton(app.detail, '使用 API Key 连接'), undefined);
  assert.equal(app.findButton(app.detail, '通过 OpenRouter 授权'), undefined);
  const root = app.detail.querySelector('.provider-connection');
  assert.ok(root.children.indexOf(root.querySelector('.settings-actions')) < root.children.indexOf(root.querySelector('.provider-authorization-form')));
  assert.ok(root.children.indexOf(root.querySelector('.provider-authorization-form')) < root.children.indexOf(root.querySelector('.provider-setting-row')));
});

test('manual authorization submits the current flow once and clears the code before the request settles', async () => {
  let finish; const promise = new Promise(resolve => { finish = resolve; });
  const app = settingsHarness({ holdAction: { action: 'oauth/complete', promise } }); await app.flush(); await app.select('openrouter');
  await app.findButton(app.detail, '使用授权码连接').fire('click'); await app.flush();
  assert.deepEqual(JSON.parse(app.requests.find(request => request.url.endsWith('/oauth/start')).options.body), { mode: 'manual' });
  const form = app.detail.querySelector('.provider-authorization-form');
  const input = app.detail.querySelector('#provider-authorization-code');
  assert.equal(app.findButton(form, '验证授权码并连接').disabled, true);
  input.value = 'fixture-code'; await input.fire('input');
  const pending = form.fire('submit'); await app.flush();
  assert.equal(input.value, ''); assert.equal(input.disabled, true);
  await form.fire('submit');
  const requests = app.requests.filter(request => request.url.endsWith('/oauth/complete'));
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), { flowId: authorizationFixture('manual').flowId, code: 'fixture-code' });
  finish(); await pending; await app.flush();
  assert.equal(app.detail.querySelector('#provider-authorization-code'), null);
  assert.ok(app.detail.querySelector('.provider-chat-link'));
  assert.equal(app.detail.querySelectorAll('a').some(link => link.dataset.settingsAction === 'oauth-continue'), false);
});

test('manual code clears on cancellation, switching, page exit, and terminal polling states', async () => {
  for (const action of ['cancel', 'switch', 'pagehide', 'expired', 'error', 'denied']) {
    const app = settingsHarness(); await app.flush(); await app.select('openrouter');
    await app.findButton(app.detail, '使用授权码连接').fire('click'); await app.flush();
    const input = app.detail.querySelector('#provider-authorization-code'); input.value = 'never-store-this-code'; await input.fire('input');
    if (action === 'cancel') await app.findButton(app.detail, '取消授权').fire('click');
    else if (action === 'switch') await app.select('anthropic');
    else if (action === 'pagehide') await app.window.fire('pagehide');
    else { app.snapshot.oauth = { providerId: 'openrouter', status: action, message: `授权${action}` }; await [...app.timers.values()][0](); }
    await app.flush(); assert.equal(input.value, '');
    assert.equal(app.requests.some(request => request.url.endsWith('/oauth/complete')), false);
  }
});

test('manual exchange failure clears the submitted code and allows a fresh retry without replaying it', async () => {
  let fail = true;
  const app = settingsHarness({ unavailable: url => fail && url.endsWith('/oauth/complete') });
  await app.flush(); await app.select('openrouter');
  await app.findButton(app.detail, '使用授权码连接').fire('click'); await app.flush();
  const form = app.detail.querySelector('.provider-authorization-form'), input = app.detail.querySelector('#provider-authorization-code');
  input.value = 'first-code'; await input.fire('input'); await form.fire('submit'); await app.flush();
  assert.equal(input.value, ''); assert.equal(input.disabled, false);
  assert.equal(app.findButton(form, '验证授权码并连接').disabled, true);
  assert.ok(app.detail.querySelectorAll('.settings-feedback').some(node => node.attributes.role === 'alert'));
  await form.fire('submit');
  assert.equal(app.requests.filter(request => request.url.endsWith('/oauth/complete')).length, 1);
  fail = false; input.value = 'replacement-code'; await input.fire('input'); await form.fire('submit'); await app.flush();
  assert.ok(app.detail.querySelector('.provider-chat-link'));
});

test('manual completion restores useful focus after terminal results without reclaiming moved focus', async () => {
  for (const outcome of ['success', 'error', 'moved', 'temporary-submitter', 'temporary-submitter-error']) {
    const temporarySubmission = outcome.startsWith('temporary-submitter');
    const failed = outcome === 'error' || outcome === 'temporary-submitter-error';
    let finish; const promise = new Promise(resolve => { finish = resolve; });
    const app = settingsHarness({ holdAction: { action: 'oauth/complete', promise }, catalogError: action => failed && action === 'oauth/complete' });
    await app.flush(); await app.select('openrouter');
    await app.findButton(app.detail, '使用授权码连接').fire('click'); await app.flush();
    const form = app.detail.querySelector('.provider-authorization-form'), input = app.detail.querySelector('#provider-authorization-code');
    input.value = 'fixture-code'; await input.fire('input');
    const submit = app.findButton(form, '验证授权码并连接'); submit.focus();
    const temporary = app.document.createElement('button');
    if (temporarySubmission) {
      // WA copies every host attribute into its temporary native submitter,
      // including the same action identity used by focus reconciliation.
      temporary.dataset = { ...submit.dataset };
      temporary.type = 'submit'; temporary.disabled = false;
      form.append(temporary); app.document.activeElement = app.document.body;
    }
    const pending = form.fire('submit', { submitter: temporarySubmission ? temporary : submit }); await app.flush();
    assert.equal(app.document.activeElement, app.detail.querySelector('h3'));
    if (temporarySubmission) {
      assert.equal(submit.disabled, true);
      assert.equal(temporary.disabled, false);
      assert.notEqual(app.document.activeElement, temporary, 'never focus the enabled native clone before WA removes it');
      temporary.parentElement.children = temporary.parentElement.children.filter(node => node !== temporary);
      temporary.parentElement = null;
    }
    if (outcome === 'moved') app.nodes['provider-search'].focus();
    finish(); await pending; await app.flush();
    assert.equal(app.document.activeElement, outcome === 'moved' ? app.nodes['provider-search'] : failed ? app.findButton(app.detail, '使用授权码连接') : app.detail.querySelector('.provider-chat-link'));
    if (failed) {
      assert.equal(app.detail.querySelectorAll('.settings-feedback').filter(node => node.textContent === '授权码无效，请重新授权').length, 1);
      await app.findButton(app.detail, '使用授权码连接').fire('click'); await app.flush();
      assert.equal(app.detail.querySelectorAll('.settings-feedback').some(node => node.textContent === '授权码无效，请重新授权'), false, 'new waiting flow suppresses stale connection failure');
    }
  }
});

test('waiting authorization blocks catalog and credential mutations on an already connected provider', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('openrouter');
  await app.findButton(app.detail, '使用 API Key 连接').fire('click');
  const dialog = app.dialogs.at(-1), input = dialog.querySelector('input');
  input.value = 'fixture-key'; await input.fire('input'); await dialog.querySelector('form').fire('submit'); await app.flush();
  const labels = ['更换 API Key', '刷新目录', '断开本机连接', '通过 OpenRouter 授权', '使用授权码连接'];
  const previousActions = labels.map(label => app.findButton(app.detail, label));
  await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
  for (const [index, label] of labels.entries()) {
    assert.equal(app.findButton(app.detail, label), undefined);
    await previousActions[index].fire('click');
  }
  assert.equal(app.dialogs.length, 1, 'stale credential action cannot reopen the dialog');
  assert.equal(app.requests.filter(request => request.options.method === 'POST').length, 2);
});

test('authorization and disconnect expose their own immediate busy state and guard duplicate activation', async () => {
  for (const [action, provider, label, message] of [
    ['oauth/start', 'openrouter', '通过 OpenRouter 授权', '正在创建授权链接…'],
    ['oauth/cancel', 'openrouter', '取消授权', '正在取消授权…'],
    ['disconnect', 'ollama', '断开本机连接', '正在断开本机连接…'],
    ['refresh', 'ollama', '刷新目录', '正在刷新模型目录…'],
  ]) {
    let finish; const promise = new Promise(resolve => { finish = resolve; });
    const app = settingsHarness({ holdAction: { action, promise } }); await app.flush(); await app.select(provider);
    if (action === 'oauth/cancel') { await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush(); }
    if (provider === 'ollama') { await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush(); }
    const trigger = app.findButton(app.detail, label); trigger.focus(); const pending = trigger.fire('click'); await app.flush();
    assert.equal(app.detail.querySelector('.provider-status').textContent, message);
    assert.ok(app.detail.querySelectorAll('.provider-authorization-pending').some(node => node.textContent === message));
    await app.findButton(app.detail, label).fire('click'); await app.flush();
    assert.equal(app.requests.filter(request => request.options.method === 'POST' && request.url.endsWith('/' + action)).length, 1);
    finish(); await pending; await app.flush();
  }
});


test('failed refresh keeps old catalog visibly stale and successful connection has one primary next step', async () => {
  const app = settingsHarness({ catalogError: action => action === 'refresh' }); await app.flush(); await app.select('ollama');
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  assert.equal(app.findButton(app.detail, '连接本机 Ollama').className.includes('shipmate-dialog__button--primary'), false);
  assert.ok(app.detail.querySelector('.provider-chat-link').className.includes('shipmate-dialog__button--primary'));
  await app.findButton(app.detail, '刷新目录').fire('click'); await app.flush();
  assert.equal(app.detail.querySelector('.provider-status').textContent, '连接失败');
  assert.equal(app.detail.querySelectorAll('.provider-model-row').length, 2);
  assert.match(app.detail.querySelector('.provider-catalog-stale').textContent, /上次读取/);
  assert.equal(app.detail.querySelector('.provider-chat-link'), null);
});


test('empty verified catalog offers refresh without a misleading choose-model next step', async () => {
  const app = settingsHarness({ emptyCatalog: true }); await app.flush(); await app.select('ollama');
  await app.findButton(app.detail, '连接本机 Ollama').fire('click'); await app.flush();
  assert.equal(app.detail.querySelector('.provider-status').textContent, '目录已验证');
  assert.equal(app.detail.querySelector('.provider-chat-link'), null);
  assert.equal(app.detail.querySelector('.provider-catalog-count').textContent, '0 / 0 个模型');
  assert.ok(app.findButton(app.detail, '刷新目录'));
});

test('OAuth start moves focus to an actionable continuation while the provider list reports waiting', async () => {
  const app = settingsHarness(); await app.flush(); await app.select('openrouter');
  const start = app.findButton(app.detail, '通过 OpenRouter 授权'); start.focus();
  await start.fire('click'); await app.flush();
  const continuation = app.detail.querySelectorAll('a').find(link => link.textContent === '继续前往 OpenRouter 授权');
  assert.equal(app.document.activeElement, continuation);
  assert.equal(app.nodes['provider-list'].children.find(row => row.dataset.provider === 'openrouter').querySelector('.provider-select-status').textContent, '等待授权');
  app.snapshot.oauth.status = 'exchanging';
  delete app.snapshot.oauth.authorizationUrl;
  await [...app.timers.values()][0](); await app.flush();
  assert.equal(app.document.activeElement, app.findButton(app.detail, '取消授权'));
  assert.equal(app.nodes['provider-list'].children.find(row => row.dataset.provider === 'openrouter').querySelector('.provider-select-status').textContent, '正在验证授权');
});


test('provider connection actions precede secondary endpoint details without losing provider guidance', async () => {
  const app = settingsHarness(); await app.flush();
  for (const providerId of ['openai', 'anthropic', 'google', 'ollama', 'openrouter']) {
    await app.select(providerId);
    const root = app.detail.querySelector('.provider-connection');
    const actions = root.querySelector('.settings-actions');
    const address = root.querySelector('.provider-setting-row');
    assert.ok(root.children.indexOf(actions) < root.children.indexOf(address), `${providerId}: connection action comes before endpoint`);
    const description = app.detail.querySelector('.provider-description');
    assert.equal(description.textContent, PROVIDERS.find(provider => provider.id === providerId).description);
    assert.equal(description.parentElement, root, 'provider guidance is secondary to the connection action');
    assert.equal(root.querySelector('h3').className, 'sr-only', 'connection heading does not add a redundant visible row');
    assert.match(app.detail.querySelector('.provider-capability').textContent, /文本聊天/);
  }
  assert.ok(app.findButton(app.detail, '通过 OpenRouter 授权'));
  assert.ok(app.findButton(app.detail, '使用 API Key 连接'));
});


test('OAuth polling failure refreshes the selected other provider and recovers without replaying writes', async () => {
  for (const focusTarget of ['search', 'action']) {
    let failReads = false;
    const app = settingsHarness({ unavailable: (_url, options) => failReads && options.method === 'GET' });
    await app.flush(); await app.select('openrouter');
    await app.findButton(app.detail, '通过 OpenRouter 授权').fire('click'); await app.flush();
    assert.equal(app.timers.size, 1);
    await app.select('anthropic');
    const search = app.nodes['provider-search']; search.value = 'anth'; await search.fire('input');
    const connect = app.findButton(app.detail, '使用 API Key 连接');
    (focusTarget === 'search' ? search : connect).focus();
    const postCount = app.requests.filter(request => request.options.method === 'POST').length;
    failReads = true;
    const [timerId, poll] = app.timers.entries().next().value; app.timers.delete(timerId);
    await poll(); await app.flush();
    assert.equal(app.findButton(app.detail, '使用 API Key 连接'), undefined, 'stale connection action must be removed');
    const retry = app.findButton(app.detail, '重试连接服务'); assert.ok(retry);
    assert.match(app.detail.querySelector('.settings-feedback').textContent, /本地连接服务不可用/);
    assert.equal(app.nodes['provider-list'].children[0].querySelector('.provider-select-status').textContent, '等待本地服务');
    assert.equal(app.nodes['provider-picker'].value, 'anthropic');
    assert.equal(search.value, 'anth');
    assert.equal(app.document.activeElement, focusTarget === 'search' ? search : retry);
    assert.equal(app.timers.size, 0, 'failed polling does not spin without an explicit retry');
    failReads = false; await retry.fire('click'); await app.flush();
    const recovered = app.findButton(app.detail, '使用 API Key 连接'); assert.ok(recovered);
    assert.equal(app.findButton(app.detail, '重试连接服务'), undefined);
    assert.equal(app.nodes['provider-picker'].value, 'anthropic');
    assert.equal(app.nodes['provider-list'].children[0].querySelector('.provider-select-status').textContent, '未连接');
    assert.equal(search.value, 'anth');
    assert.equal(app.document.activeElement, focusTarget === 'search' ? search : recovered);
    assert.equal(app.requests.filter(request => request.options.method === 'POST').length, postCount);
    assert.equal(app.timers.size, 1, 'successful recovery resumes pending authorization polling');
  }
});
