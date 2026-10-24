/* global document, window, URLSearchParams */
import { createConnectionClient } from './model-connection-client.js';
import { SUPPORTED_CHAT_PROVIDERS } from './chat-transport.js';
import { createIcon } from './components/icons.js';
import { createProviderIcon } from './components/provider-icons.js';
import { createActionButton } from './components/ui-kit.js';
import { PROVIDERS, createSettingsDraft } from './settings-state.js';

const draft = createSettingsDraft();
const list = document.getElementById('provider-list');
const detail = document.getElementById('provider-detail');
const search = document.getElementById('provider-search');
const picker = document.getElementById('provider-picker');
const requestedProvider = new URLSearchParams(window.location.search).get('provider');
let selected = PROVIDERS.some(provider => provider.id === requestedProvider) ? requestedProvider : 'openai';
let credentialDialog = null;
let connections = createConnectionClient();
let serviceError = '';
let serviceLoading = false;
let polling = null;
let pageActive = true;
let authorizationForm = null;
const busyProviders = new Map();
const catalogScroll = new Map();
const actionLabels = { connect: '正在连接并读取模型…', refresh: '正在刷新模型目录…', disconnect: '正在断开本机连接…', 'oauth/start': '正在创建授权链接…', 'oauth/cancel': '正在取消授权…', 'oauth/complete': '正在验证授权码…' };
const keyLinks = { openai: 'https://platform.openai.com/api-keys', anthropic: 'https://platform.claude.com/settings/keys', google: 'https://aistudio.google.com/apikey', openrouter: 'https://openrouter.ai/settings/keys' };
const modelQueries = new Map();
const operationErrors = new Map();

function element(tag, className = '', text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, handler, className = '', icon) {
  const primary = className.includes('shipmate-dialog__button--primary');
  const quiet = className.includes('settings-icon-button') || className.includes('provider-disconnect') || className.includes('credential-reveal');
  const node = createActionButton(document, label, {
    className: `shipmate-dialog__button ${className}`.trim(),
    appearance: primary ? 'accent' : quiet ? 'plain' : 'outlined',
  });
  node.dataset.settingsAction = label;
  if (icon) {
    const symbol = createIcon(document, icon);
    symbol.setAttribute('slot', 'start');
    node.append(symbol);
  }
  node.addEventListener('click', handler);
  return node;
}
function section(title) {
  const root = element('section', 'provider-section');
  root.append(element('h3', '', title));
  return root;
}
function status(text, available = false) {
  return element('span', `provider-status${available ? ' provider-status--available' : ''}`, text);
}

// Only the transient input and submitted local request may hold the key in the
// renderer; it never enters drafts or browser storage.
export function clearCredentialField(input) { input.value = ''; input.type = 'password'; }

async function openCredential(provider, trigger) {
  const ui = await window.shipmateUI?.ready;
  if (!ui || selected !== provider.id || credentialDialog || !connections.ready || busyProviders.has(provider.id) || (provider.id === 'openrouter' && authorizationPending())) return;
  const dialog = ui.makeDialog({ title: `${provider.name} 密钥`, subtitle: '连接服务商并读取可用模型。此步骤不发起模型推理。', trigger });
  dialog.className += ' provider-credential-dialog';
  dialog.querySelector('.shipmate-dialog__title').replaceChildren(createProviderIcon(document, provider.id), element('span', '', `${provider.name} 密钥`));
  credentialDialog = dialog;
  const body = dialog.querySelector('.shipmate-dialog__body');
  const label = element('label', 'credential-label', 'API Key');
  const input = element('input', 'inp');
  input.id = 'provider-key';
  label.htmlFor = input.id;
  input.type = 'password';
  input.placeholder = '输入 API Key';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 4096;
  const message = element('p', 'settings-feedback');
  message.id = 'provider-key-feedback';
  message.setAttribute('role', 'status');
  const hint = element('p', 'credential-hint', '密钥仅保存在本机内存；提交或关闭后清空输入。');
  hint.id = 'provider-key-hint';
  input.setAttribute('aria-describedby', `${hint.id} ${message.id}`);
  const revealLabel = element('span', '', '显示');
  const reveal = button('', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    revealLabel.textContent = input.type === 'password' ? '显示' : '隐藏';
    reveal.title = `${revealLabel.textContent}密钥`;
  }, 'credential-reveal');
  reveal.append(revealLabel, element('span', 'sr-only', '密钥'));
  reveal.title = '显示密钥';
  const row = element('div', 'credential-input');
  row.append(input, reveal);
  const actions = element('div', 'settings-actions');
  const submit = async () => {
    if (!input.value.trim() || input.value.trim().length > 4096 || busyProviders.has(provider.id)) return;
    const apiKey = input.value.trim();
    clearCredentialField(input);
    dialog.close();
    await runConnection(provider.id, 'connect', { apiKey });
  };
  const check = button('连接并读取模型', () => {}, 'shipmate-dialog__button--primary');
  check.type = 'submit';
  check.disabled = true;
  input.addEventListener('input', () => { check.disabled = !input.value.trim(); message.textContent = ''; });
  actions.append(button('取消', () => dialog.close()), check);
  const form = element('form', 'provider-credential-form');
  form.addEventListener('submit', event => { event.preventDefault(); return submit(); });
  const getKey = element('a', 'provider-get-key', `获取 ${provider.name} API Key`);
  getKey.append(createIcon(document, 'external-link'));
  getKey.href = keyLinks[provider.id]; getKey.target = '_blank'; getKey.rel = 'noopener noreferrer';
  form.append(label, row, hint, getKey, message, actions); body.append(form);
  const clearOnPageHide = () => { clearCredentialField(input); dialog.close(); };
  dialog.addEventListener('close', () => {
    clearCredentialField(input); credentialDialog = null;
    window.removeEventListener('pagehide', clearOnPageHide);
  }, { once: true });
  window.addEventListener('pagehide', clearOnPageHide, { once: true });
  ui.showDialog(dialog, input);
}

function renderModels(provider, target) {
  target.replaceChildren();
  const models = draft.get(provider.id).models;
  if (!models.length) {
    const empty = element('div', 'provider-model-empty');
    const copy = element('div');
    copy.append(element('strong', '', '还没有模型'), element('p', '', '填写模型 ID 仅添加本页草稿；尚不支持连接或用于对话。'));
    empty.append(createIcon(document, 'package'), copy);
    target.append(empty);
  }
  for (const id of models) {
    const row = element('div', 'provider-model-row');
    const copy = element('div', 'provider-model-copy');
    copy.append(element('strong', '', id), element('small', '', '配置草稿 · 未连接'));
    const remove = button('', () => {
      draft.removeModel(provider.id, id);
      renderModels(provider, target);
      const modelInput = detail.querySelector('#provider-model-id');
      modelInput?.removeAttribute('aria-invalid');
      modelInput?.focus();
      detail.querySelector('#model-feedback').textContent = '已移除模型草稿。';
    }, 'settings-icon-button');
    remove.setAttribute('aria-label', `移除模型 ${id}`);
    remove.title = `移除模型 ${id}`;
    remove.append(createIcon(document, 'x'));
    row.append(copy, remove);
    target.append(row);
  }
}

function connectionFor(id) { return connections.snapshot?.connections.find(connection => connection.providerId === id); }
function connectionLabel(id) {
  if (busyProviders.has(id)) return actionLabels[busyProviders.get(id)];
  if (id === 'openrouter' && ['waiting', 'exchanging'].includes(connections.snapshot?.oauth?.status)) return connections.snapshot.oauth.status === 'waiting' ? '等待授权' : '正在验证授权';
  return ({ disconnected: '未连接', connecting: '正在连接', connected: '目录已验证', error: '连接失败' })[connectionFor(id)?.status] || '等待本地服务';
}
function stopPolling() { if (polling !== null) clearTimeout(polling); polling = null; }
function schedulePolling() {
  stopPolling();
  if (!pageActive || !['waiting', 'exchanging'].includes(connections.snapshot?.oauth?.status)) return;
  polling = setTimeout(async () => {
    polling = null;
    const before = JSON.stringify(connections.snapshot);
    try {
      await connections.load();
      if (!pageActive) return;
      if (before !== JSON.stringify(connections.snapshot)) { renderProviders(); if (selected === 'openrouter') renderDetail(); }
      schedulePolling();
    } catch (error) {
      if (!pageActive) return;
      serviceError = error.message;
      // A failed read invalidates the shared snapshot, including other providers.
      renderProviders();
      if (!['custom', 'local-demo'].includes(selected)) renderDetail();
    }
  }, 1500);
}
async function loadConnections() {
  if (serviceLoading) return;
  serviceLoading = true; serviceError = '';
  try { await connections.load(); }
  catch (error) { serviceError = error.message; }
  finally {
    serviceLoading = false;
    if (pageActive) { renderProviders(); if (!['custom', 'local-demo'].includes(selected)) renderDetail(); schedulePolling(); }
  }
}
async function runConnection(id, action, payload = {}) {
  if (busyProviders.has(id) || (id === 'openrouter' && authorizationPending() && ['connect', 'refresh', 'disconnect'].includes(action))) return;
  busyProviders.set(id, action); operationErrors.delete(id);
  renderProviders();
  if (selected === id) renderDetail();
  try {
    await connections.mutate(`/${id}/${action}`, payload);
    // Reconcile concurrent provider operations or authorization polling after the mutation settles.
    if (pageActive) await connections.load();
  }
  catch (error) { operationErrors.set(id, error.message); if (!connections.ready) serviceError = error.message; }
  finally {
    busyProviders.delete(id);
    if (pageActive) { renderProviders(); if (selected === id) renderDetail(); }
    schedulePolling();
  }
}
function authorizationPending() { return ['waiting', 'exchanging'].includes(connections.snapshot?.oauth?.status); }
function clearAuthorizationForm() {
  if (authorizationForm) clearCredentialField(authorizationForm.input);
  authorizationForm = null;
}
async function startAuthorization(mode = 'callback') {
  if (busyProviders.has('openrouter') || authorizationPending()) return;
  clearAuthorizationForm();
  busyProviders.set('openrouter', 'oauth/start'); operationErrors.delete('openrouter');
  renderProviders(); if (selected === 'openrouter') renderDetail();
  try {
    await connections.mutate('/openrouter/oauth/start', { mode });
    await connections.load();
  } catch (error) { operationErrors.set('openrouter', error.message); if (!connections.ready) serviceError = error.message; }
  finally {
    busyProviders.delete('openrouter');
    if (pageActive) { renderProviders(); if (selected === 'openrouter') renderDetail(); }
    schedulePolling();
  }
}
async function cancelAuthorization() {
  stopPolling(); clearAuthorizationForm();
  await runConnection('openrouter', 'oauth/cancel');
}
function renderAuthorizationForm(oauth, busy) {
  if (authorizationForm?.flowId !== oauth.flowId) clearAuthorizationForm();
  if (!authorizationForm) {
    const form = element('form', 'provider-authorization-form');
    const label = element('label', 'credential-label', '授权码'); label.htmlFor = 'provider-authorization-code';
    const input = element('input', 'inp'); input.id = label.htmlFor;
    input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 4096;
    input.placeholder = '粘贴 OpenRouter 显示的授权码';
    input.setAttribute('aria-describedby', 'provider-authorization-hint');
    const hint = element('p', 'settings-muted', '在授权页面复制一次性授权码，再返回这里完成连接。提交或离开此服务商时清空，不保存到浏览器。');
    hint.id = 'provider-authorization-hint';
    const submit = button('验证授权码并连接', () => {}, 'shipmate-dialog__button--primary'); submit.type = 'submit';
    const sync = () => { submit.disabled = input.disabled || !input.value.trim() || input.value.trim().length > 4096; };
    input.addEventListener('input', sync);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const current = connections.snapshot?.oauth;
      if (busyProviders.has('openrouter') || current?.status !== 'waiting' || current.mode !== 'manual' || current.flowId !== oauth.flowId || !input.value.trim() || input.value.trim().length > 4096) return;
      // WA submits through a temporary light-DOM button that it removes after
      // this event. Move focus off that transient submitter before rendering.
      if (form.contains(document.activeElement) || (document.activeElement === document.body && event.submitter && form.contains(event.submitter))) {
        const heading = detail.querySelector('h3');
        heading.tabIndex = -1;
        heading.dataset.settingsAction = '验证授权码并连接';
        heading.focus({ preventScroll: true });
      }
      // Let renderDetail capture the focused submit action before it disables
      // the form; disabling here would move browser focus back to the body.
      const code = input.value.trim(); clearCredentialField(input);
      await runConnection('openrouter', 'oauth/complete', { flowId: oauth.flowId, code });
    });
    const actions = element('div', 'settings-actions'); actions.append(submit);
    form.append(label, input, hint, actions);
    authorizationForm = { form, input, flowId: oauth.flowId, sync };
  }
  authorizationForm.input.disabled = busy || oauth.status !== 'waiting';
  if (oauth.status !== 'waiting') clearCredentialField(authorizationForm.input);
  authorizationForm.sync();
  return authorizationForm.form;
}
function renderConnection(provider) {
  const root = element('section', 'provider-connection');
  root.append(element('h3', 'sr-only', '连接方式'));
  detail.append(root);
  if (!connections.ready) {
    clearAuthorizationForm();
    const feedback = element('p', 'settings-feedback', serviceLoading ? '正在检查本地连接服务…' : serviceError || '正在检查本地连接服务…');
    feedback.setAttribute('role', 'status');
    root.append(feedback);
    if (!serviceLoading) root.append(button('重试连接服务', () => void loadConnections(), '', 'rotate-ccw'));
    return;
  }
  const connection = connectionFor(provider.id);
  const busy = busyProviders.has(provider.id);
  const pendingAuthorization = provider.id === 'openrouter' && authorizationPending();
  const address = element('div', 'provider-setting-row');
  address.append(element('strong', '', '服务地址'), element('code', 'provider-fixed-endpoint', provider.endpoint));
  const actions = element('div', 'settings-actions');
  if (provider.requiresKey && !pendingAuthorization) {
    const key = button(connection?.status === 'connected' ? '更换 API Key' : '使用 API Key 连接', () => openCredential(provider, key), provider.id === 'openrouter' || connection?.status === 'connected' ? '' : 'shipmate-dialog__button--primary');
    key.disabled = busy || (provider.id === 'openrouter' && ['waiting', 'exchanging'].includes(connections.snapshot.oauth?.status)); actions.append(key);
  } else if (!provider.requiresKey) {
    const local = button('连接本机 Ollama', () => void runConnection(provider.id, 'connect'), connection?.status === 'connected' ? '' : 'shipmate-dialog__button--primary');
    local.disabled = busy; actions.append(local);
  }
  if (provider.id === 'openrouter') {
    const oauth = connections.snapshot.oauth;
    const pending = ['waiting', 'exchanging'].includes(oauth?.status);
    if (!pending) {
      const authorize = button('通过 OpenRouter 授权', () => void startAuthorization(), connection?.status === 'connected' ? '' : 'shipmate-dialog__button--primary');
      authorize.disabled = busy; actions.append(authorize);
      const manual = button('使用授权码连接', () => void startAuthorization('manual'));
      manual.disabled = busy; actions.append(manual);
      root.append(element('p', 'settings-muted', '浏览器授权后自动返回；无法返回时，可改用授权码连接。两种方式均使用你的 OpenRouter 账户。'));
    }
    if (oauth) {
      const progress = element('p', `settings-feedback${pending ? ' provider-authorization-pending' : ''}`, oauth.message || ({ waiting: '等待你在 OpenRouter 完成授权', exchanging: '正在验证授权', success: '授权成功，模型目录已读取', cancelled: '授权已取消', denied: '你已拒绝授权，可重新开始或使用 API Key', expired: '授权已过期，请重新授权', error: '授权失败，请重试' })[oauth.status]);
      progress.setAttribute('role', 'status'); root.append(progress);
    }
    if (pending) {
      if (oauth.authorizationUrl && oauth.status === 'waiting') {
        const link = element('a', 'shipmate-dialog__button', '继续前往 OpenRouter 授权');
        link.dataset.settingsAction = 'oauth-continue';
        link.href = oauth.authorizationUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.append(link);
      }
      if (oauth.expiresAt) root.append(element('p', 'settings-muted provider-oauth-deadline', `本次授权有效期 10 分钟，截止 ${new Date(oauth.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}（本地时间）。过期后请重新授权。`));
      if (!oauth.authorizationUrl && oauth.status === 'waiting') root.append(element('p', 'settings-muted provider-oauth-recovery', '授权链接不可用。请取消此次授权，再重新开始。'));
      const cancel = button('取消授权', () => void cancelAuthorization()); cancel.disabled = busy; actions.append(cancel);
    }
    if (!(pending && oauth.mode === 'manual' && oauth.flowId)) clearAuthorizationForm();
  }
  if ((connection?.hasCredential || connection?.authMethod) && !pendingAuthorization) {
    const refresh = button('刷新目录', () => void runConnection(provider.id, 'refresh'), '', 'rotate-ccw');
    const disconnect = button('断开本机连接', () => void runConnection(provider.id, 'disconnect'), 'provider-disconnect');
    refresh.disabled = busy || (provider.id === 'openrouter' && authorizationPending()); disconnect.disabled = refresh.disabled; actions.append(refresh, disconnect);
  }
  root.append(actions);
  const oauth = connections.snapshot.oauth;
  if (provider.id === 'openrouter' && authorizationPending() && oauth.mode === 'manual' && oauth.flowId) root.append(renderAuthorizationForm(oauth, busy));
  root.append(address, element('p', 'provider-description', provider.description));
  if (provider.id === 'openrouter') {
    const manage = element('a', 'provider-manage-keys', '在 OpenRouter 管理或撤销密钥');
    manage.append(createIcon(document, 'external-link'));
    manage.href = 'https://openrouter.ai/settings/keys'; manage.target = '_blank'; manage.rel = 'noopener noreferrer';
    root.append(manage);
  }
  const error = operationErrors.get(provider.id) || (!pendingAuthorization && connection?.error?.message);
  if (error && !(provider.id === 'openrouter' && error === oauth?.message)) { const feedback = element('p', 'settings-feedback', error); feedback.setAttribute('role', 'alert'); root.append(feedback); }
  if (busy) { const progress = element('p', 'settings-feedback provider-authorization-pending', actionLabels[busyProviders.get(provider.id)]); progress.setAttribute('role', 'status'); root.append(progress); }
  if (connection?.hasCredential || connection?.authMethod) root.append(element('p', 'settings-muted', '断开仅清除本机内存凭据，不会撤销服务商侧的密钥或授权。'));
  if (connection?.status === 'connected' && connection.models.length > 0 && Object.hasOwn(SUPPORTED_CHAT_PROVIDERS, provider.id)) {
    const back = element('a', 'provider-chat-link shipmate-dialog__button shipmate-dialog__button--primary', '返回对话选择模型');
    back.append(createIcon(document, 'arrow-right'));
    const returnHref = document.querySelector('[data-settings-return]')?.getAttribute?.('href');
    back.href = ['chat-full.html', 'main-four-region.html'].includes(returnHref) ? returnHref : 'chat-full.html';
    root.append(back);
  }
  const models = connection?.models || [];
  if (connection?.status === 'connected' || models.length) {
    const catalog = section('模型目录');
    if (connection.status === 'error') catalog.append(element('p', 'settings-muted provider-catalog-stale', '刷新未完成，以下为上次读取的目录；不代表当前连接可用。'));
    const count = element('p', 'settings-muted provider-catalog-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    const input = element('input', 'inp'); input.id = 'provider-model-search'; input.type = 'search'; input.placeholder = '搜索模型名称或 ID'; input.setAttribute('aria-label', '搜索模型目录'); input.value = modelQueries.get(provider.id) || '';
    const results = element('div', 'provider-catalog');
    const clear = button('清除搜索', () => { input.value = ''; render(); input.focus(); }, 'provider-search-clear');
    const render = () => {
      const query = input.value.trim().toLocaleLowerCase(); modelQueries.set(provider.id, input.value);
      results.replaceChildren();
      const matching = models.filter(model => `${model.id} ${model.name}`.toLocaleLowerCase().includes(query));
      count.textContent = `${matching.length} / ${models.length} 个模型${connection.truncated ? ' · 仅显示部分目录' : ''}`;
      clear.hidden = !query;
      if (!matching.length) {
        const empty = element('div', 'provider-model-empty');
        const copy = element('div');
        copy.append(element('strong', '', models.length ? '没有匹配的模型' : '服务商返回了空目录'), element('p', '', models.length ? '试试其他名称或模型 ID，也可以清除搜索。' : '请确认服务商已有可用模型，然后刷新目录。'));
        empty.append(createIcon(document, models.length ? 'search' : 'package'), copy);
        results.append(empty);
      }
      for (const model of matching) {
        const row = element('div', 'provider-model-row'); const copy = element('div', 'provider-model-copy');
        copy.append(element('strong', '', model.name || model.id));
        if (model.name && model.name !== model.id) copy.append(element('small', 'provider-model-id', model.id)); row.append(copy); results.append(row);
      }
    };
    input.addEventListener('input', render); input.addEventListener('search', render);
    const searchRow = element('div', 'provider-catalog-search');
    const searchField = element('label', 'provider-catalog-search-field');
    searchField.append(createIcon(document, 'search'), input);
    searchRow.append(searchField, clear);
    catalog.append(count, searchRow, results); detail.append(catalog); render();
    results.scrollTop = catalogScroll.get(provider.id) || 0;
  } else {
    const catalog = section('模型目录');
    const empty = element('div', 'provider-model-empty');
    const copy = element('div');
    copy.append(element('strong', '', '等待连接服务商'), element('p', '', '连接后将在这里显示服务商返回的模型。'));
    empty.append(createIcon(document, 'package'), copy);
    catalog.append(empty); detail.append(catalog);
  }
}

function rememberCatalogScroll() {
  const catalog = detail.querySelector('.provider-catalog');
  if (catalog && detail.dataset.provider) catalogScroll.set(detail.dataset.provider, catalog.scrollTop || 0);
}
function renderDetail() {
  rememberCatalogScroll();
  const active = document.activeElement;
  const keepFocus = detail.dataset.provider === selected && detail.contains(active);
  const identity = keepFocus ? { id: active.id, action: active.dataset.settingsAction, start: active.selectionStart, end: active.selectionEnd } : null;
  renderDetailContent();
  detail.dataset.provider = selected;
  if (!identity) return;
  // WA briefly clones its attributes onto a light-DOM submitter. Prefer the
  // persistent component when both share the same action or ID during submit.
  const actions = [...detail.querySelectorAll('wa-button'), ...detail.querySelectorAll('button')];
  const controls = [...detail.querySelectorAll('input'), ...actions, ...detail.querySelectorAll('a')];
  let replacement = controls.find(node => identity.id ? node.id === identity.id : identity.action && node.dataset.settingsAction === identity.action);
  if (!replacement || (replacement.disabled && !busyProviders.has(selected))) {
    const completedAuthorization = identity.action === '验证授权码并连接' && !busyProviders.has(selected);
    replacement = (completedAuthorization && (detail.querySelector('.provider-chat-link') || controls.find(node => node.dataset.settingsAction === '使用授权码连接')))
      || controls.find(node => node.dataset.settingsAction === 'oauth-continue')
      || controls.find(node => node.dataset.settingsAction === '取消授权' && !node.disabled)
      || actions.find(node => !node.disabled);
  }
  if (!replacement) return;
  // Keep real disabled semantics while preserving a stable focus destination.
  // The heading remembers the action so completion can restore its replacement.
  if (replacement.disabled && busyProviders.has(selected)) {
    replacement = detail.querySelector('h3');
    replacement.tabIndex = -1;
    replacement.dataset.settingsAction = identity.action || (identity.id === 'provider-authorization-code' ? '验证授权码并连接' : '');
  }
  const focusAfterRender = document.activeElement;
  const provider = selected;
  const restoreFocus = () => {
    if (!pageActive || selected !== provider || !detail.contains(replacement) || replacement.disabled || document.activeElement !== focusAfterRender) return;
    replacement.focus({ preventScroll: true });
    if (typeof identity.start === 'number' && typeof replacement.setSelectionRange === 'function') replacement.setSelectionRange(identity.start, identity.end);
  };
  // Web Awesome's focus method requires its first shadow render. Do not block
  // the connection request or reclaim focus if the user has moved elsewhere.
  if (replacement.updateComplete) void replacement.updateComplete.then(restoreFocus).catch(() => {});
  else restoreFocus();
}
function renderDetailContent() {
  const provider = PROVIDERS.find(p => p.id === selected);
  detail.replaceChildren();
  const head = element('div', 'provider-detail-head');
  const identity = element('div', 'provider-identity');
  identity.append(createProviderIcon(document, provider.id), element('h3', '', provider.name));
  head.append(identity, status(selected === 'local-demo' ? '可体验' : selected === 'custom' ? '仅草稿' : connectionLabel(provider.id), selected === 'local-demo' || connectionFor(provider.id)?.status === 'connected'));
  detail.append(head);
  if (selected !== 'custom' && Object.hasOwn(SUPPORTED_CHAT_PROVIDERS, selected)) detail.append(element('p', 'provider-capability', '文本聊天 · 连接后在对话中选择模型'));
  else detail.append(element('p', 'provider-description', provider.description));
  if (selected === 'local-demo') {
    const local = section('无需配置');
    const rows = element('div', 'provider-local-info');
    rows.append(element('p', '', '体验流式回复、停止生成、工具成功与失败，以及改动审批。所有结果来自固定示例。'), element('p', 'settings-muted', '不会读取项目、调用模型或写入文件。'));
    const link = element('a', 'shipmate-dialog__button', '打开演示对话');
    link.href = 'chat-full.html';
    rows.append(link); local.append(rows); detail.append(local); return;
  }
  if (provider.id !== 'custom') { renderConnection(provider); return; }
  const auth = section('自定义服务草稿');
  const authRow = element('div', 'provider-setting-row');
  const authCopy = element('div');
  authCopy.append(element('strong', '', provider.requiresKey ? 'API Key' : '本地服务'), element('p', '', provider.requiresKey ? '未添加凭据' : '此本地配置不要求 API Key'));
  authRow.append(authCopy);
  authCopy.replaceChildren(element('p', '', '自定义目的地尚未开放连接。以下仅保留非敏感文本草稿，不发送请求。'));
  auth.append(authRow);
  const connection = section('连接地址');
  const form = element('form', 'provider-endpoint');
  const label = element('label', '', 'API Base URL');
  label.htmlFor = 'provider-endpoint';
  const endpoint = element('input', 'inp mono');
  endpoint.id = 'provider-endpoint';
  endpoint.type = 'url'; endpoint.autocomplete = 'off'; endpoint.spellcheck = false;
  endpoint.value = draft.getEditing(selected).endpoint;
  endpoint.addEventListener('input', () => {
    draft.setEditing(provider.id, 'endpoint', endpoint.value);
    endpoint.removeAttribute('aria-invalid');
    feedback.textContent = '';
  });
  endpoint.placeholder = 'https://api.example.com/v1';
  endpoint.maxLength = 2048;
  const feedback = element('p', 'settings-feedback');
  feedback.id = 'endpoint-feedback'; feedback.setAttribute('role', 'status');
  endpoint.setAttribute('aria-describedby', feedback.id);
  const actions = element('div', 'settings-actions');
  const validate = button('检查并保留草稿', () => {}); validate.type = 'submit';
  const connect = button('测试连接', () => {}); connect.disabled = true;
  connect.title = '模型服务尚未接入，当前无法发送连接测试';
  connect.setAttribute('aria-describedby', 'connection-note');
  actions.append(validate, connect);
  form.noValidate = true;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const result = draft.setEndpoint(provider.id, endpoint.value);
    endpoint.setAttribute('aria-invalid', String(!result.ok));
    feedback.textContent = result.ok ? '地址格式正确，已保留本页草稿。尚未发送连接请求。' : result.message;
    if (!result.ok) endpoint.focus();
  });
  const note = element('p', 'settings-muted', '当前仅检查格式，不发送连接请求。');
  note.id = 'connection-note';
  form.append(label, endpoint, feedback, actions, note); connection.append(form);
  const models = section('模型');
  const modelRows = element('div', 'provider-models');
  const addForm = element('form', 'provider-model-form');
  const modelLabel = element('label', 'sr-only', '模型 ID'); modelLabel.htmlFor = 'provider-model-id';
  const modelInput = element('input', 'inp mono'); modelInput.id = 'provider-model-id'; modelInput.maxLength = 200; modelInput.autocomplete = 'off'; modelInput.placeholder = '输入服务商提供的模型 ID';
  modelInput.value = draft.getEditing(provider.id).model;
  modelInput.addEventListener('input', () => {
    draft.setEditing(provider.id, 'model', modelInput.value);
    modelInput.removeAttribute('aria-invalid');
    modelFeedback.textContent = '';
  });
  modelInput.setAttribute('aria-describedby', 'model-feedback');
  const add = button('添加模型', () => {}, 'shipmate-dialog__button--primary'); add.type = 'submit';
  const modelFeedback = element('p', 'settings-feedback'); modelFeedback.id = 'model-feedback'; modelFeedback.setAttribute('role', 'status');
  addForm.addEventListener('submit', event => {
    event.preventDefault();
    const result = draft.addModel(provider.id, modelInput.value);
    modelInput.setAttribute('aria-invalid', String(!result.ok));
    modelFeedback.textContent = result.ok ? '已添加本页模型草稿；尚不支持连接或用于对话。' : result.message;
    if (result.ok) { modelInput.value = ''; draft.setEditing(provider.id, 'model', ''); renderModels(provider, modelRows); }
    modelInput.focus();
  });
  addForm.append(modelLabel, modelInput, add);
  models.append(modelRows, addForm, modelFeedback); renderModels(provider, modelRows);
  detail.append(auth, connection, models);
}

function selectProvider(id) {
  if (selected === id || !PROVIDERS.some(provider => provider.id === id)) return;
  const restoreListFocus = list.contains(document.activeElement);
  credentialDialog?.close();
  clearAuthorizationForm();
  selected = id;
  renderProviders();
  renderDetail();
  if (restoreListFocus) [...list.children].find(control => control.dataset.provider === id)?.focus({ preventScroll: true });
}

function renderProviders() {
  const focusedProvider = list.contains(document.activeElement) ? document.activeElement?.dataset.provider : null;
  list.replaceChildren();
  picker?.replaceChildren();
  const query = search.value.trim().toLocaleLowerCase();
  const matches = PROVIDERS.filter(p => `${p.name} ${p.id}`.toLocaleLowerCase().includes(query));
  // Keep the current detail identifiable even when its name does not match a search.
  if (picker && !matches.some(provider => provider.id === selected)) {
    const current = PROVIDERS.find(provider => provider.id === selected);
    const option = element('option', '', `${current.name}（当前选择）`);
    option.value = current.id; picker.append(option);
  }
  for (const provider of matches) {
    // Provider rows are navigation choices; action controls use Web Awesome.
    const row = element('button', 'shipmate-dialog__button provider-select');
    row.type = 'button';
    row.addEventListener('click', () => selectProvider(provider.id));
    row.dataset.provider = provider.id;
    row.setAttribute('aria-pressed', String(selected === provider.id));
    row.setAttribute('aria-controls', 'provider-detail');
    const copy = element('span', 'provider-select-copy');
    copy.append(element('span', '', provider.name), element('small', 'provider-select-status', provider.id === 'custom' ? '仅草稿' : provider.id === 'local-demo' ? '本地示例' : connectionLabel(provider.id)));
    if (busyProviders.has(provider.id)) copy.children[1].className += ' provider-authorization-pending';
    row.append(createProviderIcon(document, provider.id), copy); list.append(row);
    if (picker) {
      const option = element('option', '', provider.name);
      option.value = provider.id; picker.append(option);
    }
  }
  if (picker) picker.value = selected;
  if (focusedProvider) [...list.children].find(row => row.dataset.provider === focusedProvider)?.focus({ preventScroll: true });
  document.getElementById('provider-empty').hidden = matches.length > 0;
  const count = document.getElementById('provider-count');
  if (count) count.textContent = query ? `${matches.length} / ${PROVIDERS.length}` : String(PROVIDERS.length);
}

if (list && detail && search) {
  document.getElementById('default-provider-icon')?.append(createProviderIcon(document, 'local-demo'));
  document.getElementById('provider-search-icon')?.append(createIcon(document, 'search'));
  search.addEventListener('input', renderProviders);
  search.addEventListener('search', renderProviders);
  picker?.addEventListener('change', () => selectProvider(picker.value));
  renderProviders(); renderDetail();
  void loadConnections();
  window.addEventListener('pagehide', () => {
    pageActive = false; stopPolling(); credentialDialog?.close(); clearAuthorizationForm(); connections.dispose();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    pageActive = true; connections = createConnectionClient(); void loadConnections();
  });
}
