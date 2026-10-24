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
    focus() { document.activeElement = this; }
    close() { this.open = false; this.fire('close'); }
    querySelector(selector) { return selector === '.shipmate-dialog__body' ? this.body : null; }
  }
  const document = { createElement: tag => new Node(tag), activeElement: null };
  const composer = new Node(); composer.dataset.liveChat = 'true'; composer.querySelector = () => composer.busy ? {} : null;
  const selected = []; composer.dispatchEvent = event => selected.push(event.detail.selection);
  const trigger = new Node('button'); trigger.closest = () => composer;
  const dialogs = []; const notices = []; const window = new Node();
  const context = vm.createContext({ createActionButton, document, window, AbortController, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
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
const catalog = { connections: [
  { providerId: 'openai', status: 'connected', models: [{ id: 'gpt-test', name: 'Test model' }] },
  { providerId: 'anthropic', status: 'connected', models: [{ id: 'claude-test', name: 'Claude test' }] },
] };
test('live model menu dispatches explicit demo selection and blocks changes while generating', () => {
  const h = harness(); const menu = h.context.openModel(h.trigger);
  menu.items[0].onSelect(); assert.equal(h.selected.length, 1); assert.equal(h.selected[0], null);
  h.composer.busy = true; menu.items[0].onSelect(); assert.equal(h.selected.length, 1);
});
test('connected picker filters supported models and dispatches selection without inference', async () => {
  const h = harness(async () => catalog);
  h.context.openModel(h.trigger).items.find(item => item.label === '选择已连接模型').onSelect(); await h.flush();
  const dialog = h.dialogs[0]; const input = h.all(dialog.body, 'input')[0];
  input.value = 'gpt-test'; input.fire('input');
  const choices = h.all(dialog.body, 'button').filter(button => button.dataset.modelId);
  assert.equal(choices.length, 1); assert.equal(choices[0].dataset.modelId, 'gpt-test');
  choices[0].fire('click'); assert.equal(h.selected[0].providerId, 'openai'); assert.equal(h.selected[0].model, 'gpt-test'); assert.equal(dialog.open, false);
});
test('closing aborts catalog load, late results stay closed, duplicate opens reuse current dialog', async () => {
  let finish; let signal; const h = harness(options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  const open = () => h.context.openModel(h.trigger).items.find(item => item.label === '选择已连接模型').onSelect();
  open(); open(); assert.equal(h.dialogs.length, 1);
  h.dialogs[0].close(); assert.equal(signal.aborted, true); finish(catalog); await h.flush();
  assert.equal(h.dialogs[0].open, false); assert.equal(h.selected.length, 0);
});

test('failure can retry; unsupported-only catalogs remain empty and never select automatically', async () => {
  let attempt = 0;
  const h = harness(async () => { if (++attempt === 1) throw new Error('offline'); return { connections: [{ ...catalog.connections[1], providerId: 'unknown' }] }; });
  h.context.openConnectedModels(h.trigger); await h.flush();
  const dialog = h.dialogs[0];
  assert.ok(dialog.body.children.some(node => node.textContent?.includes('无法加载')));
  const retry = h.all(dialog.body, 'button').find(node => node.textContent === '重新加载目录');
  retry.fire('click'); await h.flush();
  assert.ok(dialog.body.children.some(node => node.textContent?.includes('没有可用于聊天')));
  assert.equal(h.all(dialog.body, 'button').filter(node => node.dataset.modelId).length, 0);
  assert.equal(h.selected.length, 0);
});

for (const [providerId, model] of [['anthropic', 'claude-test'], ['google', 'models/gemini-test']]) {
  test(`${providerId} connected model is searchable and selectable without inference`, async () => {
    const h = harness(async () => ({ connections: [{ providerId, status: 'connected', models: [{ id: model, name: model }] }] }));
    h.context.openConnectedModels(h.trigger); await h.flush();
    const dialog = h.dialogs[0], input = h.all(dialog.body, 'input')[0];
    input.value = providerId; input.fire('input');
    const choices = h.all(dialog.body, 'button').filter(button => button.dataset.modelId);
    assert.equal(choices.length, 1);
    choices[0].fire('click');
    assert.equal(h.selected[0].providerId, providerId); assert.equal(h.selected[0].model, model);
    assert.equal(dialog.open, false);
  });
}

test('picker keeps native modified keys and IME; stale choices cannot switch a running turn', async () => {
  const h = harness(async () => catalog); h.context.openConnectedModels(h.trigger); await h.flush();
  const dialog = h.dialogs[0]; const input = h.all(dialog.body, 'input')[0]; const option = h.all(dialog.body, 'button').find(node => node.dataset.modelId);
  for (const modifiers of [{ isComposing: true }, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    input.fire('keydown', { key: 'ArrowDown', ...modifiers, preventDefault() { assert.fail('native edit key intercepted'); } });
    assert.equal(h.document.activeElement, input);
  }
  input.fire('keydown', { key: 'ArrowDown', preventDefault() {} }); assert.equal(h.document.activeElement, option);
  h.composer.busy = true; option.fire('click'); assert.equal(h.selected.length, 0); assert.equal(dialog.open, true);
  h.composer.busy = false; option.fire('click'); assert.equal(h.selected.length, 1);
});

test('showcase remains demonstration-only and current model comes from controller data', () => {
  const h = harness(); h.composer.dataset.liveChat = 'false';
  assert.equal(h.context.openModel(h.trigger).items.some(item => item.label === '选择已连接模型'), false);
  h.composer.dataset.liveChat = 'true'; h.composer.dataset.modelProvider = 'openai'; h.composer.dataset.modelId = 'chosen'; h.composer.dataset.modelLabel = 'Chosen Model';
  const menu = h.context.openModel(h.trigger); assert.equal(menu.items[0].checked, false);
  assert.equal(menu.items.find(item => item.checked).label, 'Chosen Model');
  h.composer.busy = true; assert.equal(h.context.openConnectedModels(h.trigger), null); assert.equal(h.dialogs.length, 0);
});

for (const [connections, expected] of [
  [[], '尚未连接'],
  [[{ providerId: 'anthropic', status: 'connected', models: [] }], '已连接，但目录为空'],
  [[{ providerId: 'google', status: 'error', models: [] }], '连接异常'],
  [[{ providerId: 'openai', status: 'connecting', models: [] }], '正在连接'],
]) {
  test(`picker explains ${expected} without changing the current selection`, async () => {
    const h = harness(async () => ({ connections }));
    h.context.openConnectedModels(h.trigger); await h.flush();
    assert.ok(h.all(h.dialogs[0].body, 'p').some(node => node.textContent?.includes(expected)));
    assert.equal(h.selected.length, 0);
  });
}

test('partial catalogs explain search scope and clear filtering without a network reload', async () => {
  let loads = 0;
  const h = harness(async () => { loads++; return { connections: [{ ...catalog.connections[0], truncated: true }] }; });
  h.context.openConnectedModels(h.trigger); await h.flush();
  const body = h.dialogs[0].body, input = h.all(body, 'input')[0];
  assert.ok(h.all(body, 'p').some(node => node.textContent?.includes('部分目录')));
  input.value = 'gpt'; input.fire('input');
  assert.equal(h.all(body, 'button').find(node => node.textContent === '清除搜索').hidden, true, 'matching searches use the native search clear affordance');
  input.value = 'missing'; input.fire('input');
  assert.ok(h.all(body, 'p').some(node => node.textContent?.includes('当前已加载目录')));
  const clear = h.all(body, 'button').find(node => node.textContent === '清除搜索');
  assert.equal(clear.hidden, false);
  clear.fire('click');
  assert.equal(input.value, ''); assert.equal(h.document.activeElement, input);
  assert.equal(h.all(body, 'button').filter(node => node.dataset.modelId).length, 1);
  assert.equal(loads, 1); assert.equal(h.selected.length, 0);
});

test('provider groups keep same-id models distinct, expose selection, and retain arrow navigation', async () => {
  const h = harness(async () => ({ connections: [
    { providerId: 'openai', status: 'connected', models: [{ id: 'shared', name: 'shared' }] },
    { providerId: 'anthropic', status: 'connected', models: [{ id: 'shared', name: 'shared' }] },
  ] }));
  h.composer.dataset.modelProvider = 'anthropic'; h.composer.dataset.modelId = 'shared';
  h.context.openConnectedModels(h.trigger); await h.flush();
  const body = h.dialogs[0].body;
  const groups = h.all(body, 'section').filter(node => node.attributes.role === 'group');
  assert.deepEqual(groups.map(node => node.attributes['aria-label']), ['OpenAI', 'Anthropic']);
  const choices = h.all(body, 'button').filter(node => node.dataset.modelId);
  assert.deepEqual(choices.map(node => node.attributes['aria-pressed']), ['false', 'true']);
  assert.equal(h.all(choices[0], 'small').length, 0, 'identical ID must not be shown twice');
  assert.equal(h.all(choices[1], 'svg').filter(node => node.dataset.icon === 'check').length, 1);
  choices[0].fire('keydown', { key: 'ArrowDown', preventDefault() {} });
  assert.equal(h.document.activeElement, choices[1]);
  choices[1].fire('click'); assert.equal(h.selected[0].providerId, 'anthropic');
});

test('same-name models expose their distinct IDs to assistive technology', async () => {
  const h = harness(async () => ({ connections: [{ providerId: 'anthropic', status: 'connected', models: [
    { id: 'claude-version-a', name: 'Claude' }, { id: 'claude-version-b', name: 'Claude' },
  ] }] }));
  h.context.openConnectedModels(h.trigger); await h.flush();
  const choices = h.all(h.dialogs[0].body, 'button').filter(node => node.dataset.modelId);
  assert.deepEqual(choices.map(node => node.attributes['aria-label']), [
    'Anthropic · Claude · claude-version-a', 'Anthropic · Claude · claude-version-b',
  ]);
});
