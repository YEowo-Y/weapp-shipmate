import './model-connection.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import { createConnectionClient, isUsableModelConnection } from '../design-previews/model-connection-client.js';
import { createProviderIcon } from '../design-previews/components/provider-icons.js';
import { createIcon } from '../design-previews/components/icons.js';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { desktopModelFetch } from './model-fetch';
import { mountModelPicker } from './model-picker';

type Selection = { providerId: string; model: string; label: string };
const providers = [['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['google', 'Google'], ['deepseek', 'DeepSeek'], ['glm', 'GLM · 智谱'], ['kimi', 'Kimi'], ['openrouter', 'OpenRouter'], ['ollama', 'Ollama'], ['custom', '自定义服务']];
const providerHelp: Record<string, { keyUrl: string; note: string }> = {
  deepseek: { keyUrl: 'https://platform.deepseek.com/api_keys', note: '使用 DeepSeek 开放平台 API 密钥。当前支持非思考文本聊天；连接读取目录，不会自动发起付费推理。' },
  glm: { keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys', note: '使用智谱开放平台 API 密钥。此入口使用按量计费 API，不是 Coding Plan 专用地址。模型列表为官方文档预设；保存配置不验证密钥，可主动测试所选模型。' },
  kimi: { keyUrl: 'https://platform.kimi.com/console/api-keys', note: '使用 Kimi API 开放平台密钥。当前支持非思考文本聊天模型（如 Kimi K2.6）；需要保留思考过程的模型暂不列入目录。' },
};

/** Shared model controls support either the native dialog or the settings workspace. */
export function mountModelConnections({ button, picker, select, isBusy, getSelection, onManage }: {
  button?: HTMLButtonElement; picker: HTMLButtonElement; onManage?: () => void;
  select: (value: Selection) => boolean; isBusy: () => boolean; getSelection: () => Selection | null;
}) {
  const client = createConnectionClient(desktopModelFetch);
  const dialog = document.createElement('dialog');
  dialog.id = 'desktop-model-dialog'; dialog.className = 'desktop-model-dialog';
  dialog.setAttribute('aria-labelledby', 'desktop-model-title');
  dialog.innerHTML = `<header><div><h2 id="desktop-model-title">模型连接</h2><p>选择服务商，连接后在对话中切换模型。</p></div></header><div class="desktop-model-layout"><div class="desktop-provider-picker"><label for="desktop-provider-search">服务商</label><input id="desktop-provider-search" type="search" placeholder="搜索服务商" autocomplete="off" aria-controls="desktop-provider-list"><nav id="desktop-provider-list" aria-label="模型服务商"></nav><p id="desktop-provider-empty" role="status" hidden>没有匹配的服务商。</p></div><section class="desktop-model-detail"><div class="desktop-provider-heading"><span class="desktop-provider-brand" aria-hidden="true"></span><h3></h3></div><p class="desktop-model-note"></p><p id="desktop-provider-status" role="status" aria-live="polite"></p><div class="desktop-model-actions" data-current-connection-actions></div><div class="desktop-model-catalog"><label for="desktop-model-search">模型目录</label><div class="desktop-catalog-search"><input id="desktop-model-search" type="search" placeholder="搜索模型名称或 ID" autocomplete="off"></div><div class="desktop-model-list" role="group" aria-label="可用模型"></div></div><section class="desktop-inference-panel"><h4>推理测试</h4><p id="desktop-inference-status" class="desktop-field-hint" role="status"></p><p class="desktop-field-hint">向所选模型发送一条简短测试，可能产生服务商费用；不会自动执行。</p><div data-inference-actions></div></section><details id="desktop-connection-editor"><summary id="desktop-connection-editor-toggle">更改密钥或授权方式</summary><form><div class="desktop-endpoint-field"><label for="desktop-provider-endpoint">API 基础地址</label><input id="desktop-provider-endpoint" type="url" placeholder="https://api.example.com/v1" autocomplete="off"><label class="desktop-checkbox"><input id="desktop-provider-local-http" type="checkbox">允许本机 HTTP（仅回环地址）</label><p class="desktop-field-hint">兼容 OpenAI Chat Completions；凭据绑定此地址。更换地址需重新连接。</p></div><div class="desktop-key-field"><label for="desktop-provider-key">API 密钥</label><div class="desktop-key-input"><input id="desktop-provider-key" type="password" autocomplete="off" spellcheck="false" maxlength="4096" placeholder="输入服务商 API 密钥" aria-describedby="desktop-credential-hint"></div><p id="desktop-credential-hint" class="desktop-field-hint">提交或关闭后清空输入；密钥不会写入会话。</p></div><div class="desktop-storage-field"><label for="desktop-provider-storage">凭据保存方式</label><select id="desktop-provider-storage"><option value="memory">仅本次应用运行</option><option value="system">Windows 系统凭据库</option></select><p id="desktop-storage-hint" class="desktop-field-hint"></p></div><div class="desktop-model-actions" data-connection-actions></div></form><section class="desktop-oauth-panel"><h4>OpenRouter 授权</h4><p class="desktop-field-hint">使用浏览器授权，或选择授权码连接；也可以在上方填写 API 密钥。</p><div class="desktop-model-actions" data-oauth-actions></div><p id="desktop-oauth-progress" class="desktop-field-hint" role="status"></p><form id="desktop-oauth-code-form"><label for="desktop-oauth-code">授权码</label><p id="desktop-oauth-code-hint" class="desktop-field-hint">先在浏览器完成授权并复制授权码，再粘贴到此处连接。提交或关闭后清空。</p><input id="desktop-oauth-code" type="password" autocomplete="off" spellcheck="false" maxlength="4096" aria-describedby="desktop-oauth-code-hint" placeholder="粘贴浏览器显示的授权码"><div class="desktop-model-actions" data-oauth-code-actions></div></form></section></details></section></div>`;
  document.body.append(dialog);
  const panel = document.createElement('section');
  panel.className = 'desktop-model-panel'; panel.setAttribute('aria-labelledby', 'desktop-model-title');
  let contentHost: HTMLElement = dialog, embedded = false, activation = 0, mutationPending = false;
  const isOpen = () => embedded || dialog.open;
  const find = <T extends HTMLElement>(s: string) => contentHost.querySelector(s) as T;
  const content = [find('header'), find('.desktop-model-layout')];
  function moveContent(target: HTMLElement) {
    if (contentHost === target) return;
    target.append(...content); contentHost = target;
  }
  const action = (id: string, label: string, appearance: 'accent' | 'outlined' | 'plain' = 'outlined') => {
    const control = createActionButton(document, label, { appearance });
    control.id = id;
    return control;
  };
  const closeButton = action('desktop-model-close', '', 'plain');
  closeButton.classList.add('ui-action-icon');
  closeButton.setAttribute('data-close', '');
  closeButton.setAttribute('aria-label', '关闭模型连接');
  closeButton.replaceChildren(createIcon(document, 'x'));
  closeButton.title = '关闭模型连接';
  find('header').append(closeButton);
  const connect = action('desktop-provider-connect', '连接并读取模型', 'accent'); connect.type = 'submit';
  const refresh = action('desktop-provider-refresh', '刷新目录');
  const disconnect = action('desktop-provider-disconnect', '断开并删除保存的凭据', 'plain');
  find('[data-connection-actions]').append(connect);
  find('[data-current-connection-actions]').append(refresh, disconnect);
  const verify = action('desktop-provider-verify', '测试所选模型');
  find('[data-inference-actions]').append(verify);
  const oauth = action('desktop-provider-oauth', '浏览器授权');
  const manual = action('desktop-provider-oauth-manual', '授权码连接');
  const reopen = action('desktop-provider-oauth-reopen', '在浏览器中打开授权页面', 'plain');
  const complete = action('desktop-provider-oauth-complete', '验证授权码并连接', 'accent'); complete.type = 'submit';
  find('[data-oauth-code-actions]').append(complete);
  const cancel = action('desktop-provider-oauth-cancel', '取消授权');
  find('[data-oauth-actions]').append(oauth, manual, reopen, cancel);
  const retry = action('desktop-provider-retry', '重新检查连接服务');
  find('.desktop-model-detail').append(retry);
  for (const control of [refresh, retry]) {
    const icon = createIcon(document, 'rotate-ccw'); icon.setAttribute('slot', 'start'); control.prepend(icon);
  }
  const reveal = action('desktop-provider-reveal', '显示', 'plain');
  paintReveal(false);
  find('.desktop-key-input').append(reveal);
  const getKey = action('desktop-provider-get-key', '获取 API 密钥', 'plain');
  find('.desktop-key-field').append(getKey);
  find('.desktop-catalog-search').prepend(createIcon(document, 'search'));
  const nav = find('nav'), status = find('#desktop-provider-status'), form = find<HTMLFormElement>('form');
  const key = find<HTMLInputElement>('#desktop-provider-key'), search = find<HTMLInputElement>('#desktop-model-search');
  const list = find('.desktop-model-list');
  const providerSearch = find<HTMLInputElement>('#desktop-provider-search');
  const providerEmpty = find('#desktop-provider-empty');
  function filterProviders() {
    const query = providerSearch.value.trim().toLowerCase();
    let matches = 0;
    nav.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      const provider = providers.find(([id]) => id === button.dataset.providerId);
      button.hidden = !provider?.join(' ').toLowerCase().includes(query);
      if (!button.hidden) matches++;
    });
    providerEmpty.hidden = matches > 0;
  }
  providerSearch.addEventListener('input', filterProviders);
  const editor = find<HTMLDetailsElement>('#desktop-connection-editor');
  const editorToggle = find<HTMLElement>('#desktop-connection-editor-toggle');
  let editorState = '';
  function resetScroll() { dialog.scrollTop = 0; find('.desktop-model-detail').scrollTop = 0; }
  const storage = find<HTMLSelectElement>('#desktop-provider-storage'); storage.value = 'memory';
  const endpoint = find<HTMLInputElement>('#desktop-provider-endpoint');
  const localHttp = find<HTMLInputElement>('#desktop-provider-local-http');
  const codeForm = find<HTMLFormElement>('#desktop-oauth-code-form'), code = find<HTMLInputElement>('#desktop-oauth-code');
  let codeFlow = '';
  const oauthPending = () => ['waiting', 'exchanging'].includes(client.snapshot?.oauth?.status || '');
  let selected = 'openai', busy = false, disposed = false, error = '', loadError = '', opener: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listSignature = '', operation = 0;
  function paintReveal(visible: boolean) {
    const label = document.createElement('span');
    label.textContent = visible ? '隐藏' : '显示';
    const qualifier = document.createElement('span');
    qualifier.className = 'sr-only'; qualifier.textContent = '密钥';
    reveal.replaceChildren(label, qualifier);
  }
  function clearKey() {
    key.value = ''; key.type = 'password';
    paintReveal(false);
  }
  function render() {
    if (disposed) return;
    const connection = client.snapshot?.connections.find(c => c.providerId === selected);
    contentHost.dataset.connectionState = connection?.status || 'disconnected';
    find('.desktop-model-note').textContent = selected === 'ollama'
      ? '连接此设备上的 Ollama，无需 API 密钥。请先启动 Ollama 并下载模型。'
      : selected === 'custom' ? '连接你信任的兼容服务。连接读取目录，不代表模型已通过推理测试。' : providerHelp[selected]?.note || '连接凭据、模型目录与推理测试分别验证；会话与草稿保留在此设备。';
    find('h3').textContent = providers.find(p => p[0] === selected)![1];
    find('.desktop-provider-brand').replaceChildren(createProviderIcon(document, selected));
    nav.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.providerId === selected)); b.disabled = busy; });
    filterProviders();
    const auth = client.snapshot?.oauth;
    const pending = oauthPending(), pendingOpenRouter = selected === 'openrouter' && pending;
    const blocked = busy || pendingOpenRouter || isBusy();
    const connected = isUsableModelConnection(connection);
    const nextEditorState = `${selected}:${connected}`;
    if (editorState !== nextEditorState) { editorState = nextEditorState; editor.open = !connected; }
    if (pendingOpenRouter) editor.open = true;
    editorToggle.hidden = !connected || pendingOpenRouter;
    editorToggle.textContent = selected === 'ollama' ? '重新设置连接' : '更改密钥或授权方式';
    find('.desktop-model-catalog').hidden = !connected;
    find('.desktop-model-catalog > label').textContent = selected === 'glm' ? '模型预设（非实时目录）' : '模型目录';
    find('.desktop-inference-panel').hidden = !connected;
    find('.desktop-endpoint-field').hidden = selected !== 'custom';
    if (selected === 'custom' && !endpoint.value && connection?.endpoint) { endpoint.value = connection.endpoint.baseUrl; localHttp.checked = connection.endpoint.allowLocalHttp; }
    endpoint.disabled = blocked; endpoint.required = selected === 'custom'; localHttp.disabled = blocked;
    find('.desktop-storage-field').hidden = selected === 'ollama';
    const systemAvailable = client.snapshot?.storage === 'system';
    const canRestoreCredential = !connection?.hasCredential && Boolean(connection?.error?.code?.startsWith('credential_store_'));
    const credentialUncertain = connection?.error?.code?.startsWith('credential_store_') || connection?.error?.code === 'credential_cleanup_failed';
    storage.disabled = blocked || !systemAvailable;
    if (!systemAvailable) storage.value = 'memory';
    find('#desktop-storage-hint').textContent = credentialUncertain ? '系统凭据状态未确认。可重新读取，或断开并删除保存的凭据；删除失败时可再次重试。' : connection?.credentialStorage === 'system' ? '当前凭据已保存在系统凭据库。重新连接将替换已保存凭据；失败后需重新输入。断开连接会删除保存的凭据。' : systemAvailable ? '默认仅本次使用。选择系统凭据库可在重启后重新连接；密钥不会返回界面。' : '此连接服务仅支持临时凭据；退出后需重新输入。';
    const selection = getSelection();
    verify.disabled = blocked || !isUsableModelConnection(connection) || selection?.providerId !== selected || !connection.models.some(m => m.id === selection?.model);
    const inference = connection?.inference;
    const inferenceMatchesSelection = selection?.providerId === selected && inference?.model === selection.model;
    const verifiedSelection = inferenceMatchesSelection && inference?.status === 'verified';
    find('#desktop-inference-status').textContent = verifiedSelection ? `已通过推理测试 · ${inference.model || ''}` : (inferenceMatchesSelection && inference?.error?.message) || (inference?.status === 'checking' && inferenceMatchesSelection ? '正在测试模型…' : selection?.providerId === selected && connection?.models.some(m => m.id === selection.model) ? `尚未测试 · ${selection.model}` : '尚未测试。请先在目录中选择模型。');
    find('#desktop-inference-status').classList.toggle('is-busy', inference?.status === 'checking');
    form.hidden = pendingOpenRouter;
    const visibleError = error || loadError;
    status.hidden = pendingOpenRouter && !visibleError;
    find('.desktop-oauth-panel > .desktop-field-hint').textContent = pendingOpenRouter
      ? '完成当前授权，或取消后选择其他连接方式。'
      : '使用浏览器授权，或选择授权码连接；也可以在上方填写 API 密钥。';
    status.textContent = visibleError || (busy ? '正在处理连接…' : connection?.error?.message || (connection?.status === 'configured' ? `配置已保存 · ${verifiedSelection ? '所选模型已通过推理测试' : '所选模型尚未验证'}` : connection?.status === 'connected' ? `已连接 · ${connection.models.length} 个模型` : connection?.hasCredential ? '凭据已保存，尚未读取模型目录。请重新连接。' : '尚未连接。请添加凭据或连接本机 Ollama。'));
    if (embedded && !visibleError && !connection?.error && !busy && connected && selection?.providerId === selected && connection?.models.some(m => m.id === selection.model)) status.textContent += ` · 当前模型：${selection.label}`;
    status.dataset.tone = visibleError || connection?.error ? 'error' : connection?.status === 'connected' ? 'success' : 'neutral';
    status.classList.toggle('is-busy', busy);
    find('.desktop-key-field').hidden = selected === 'ollama';
    key.hidden = selected === 'ollama'; key.disabled = blocked; key.required = selected !== 'ollama';
    reveal.disabled = blocked;
    getKey.hidden = !providerHelp[selected]; getKey.disabled = blocked;
    getKey.textContent = `获取 ${providers.find(p => p[0] === selected)![1]} API 密钥`;
    connect.disabled = blocked || !client.ready || (selected !== 'ollama' && !key.value.trim());
    connect.appearance = connection?.status === 'connected' ? 'outlined' : 'accent';
    connect.textContent = selected === 'glm' ? (connected ? '更新配置' : '保存配置') : connection?.status === 'connected'
      ? (selected === 'ollama' ? '重新连接' : '更新密钥')
      : (selected === 'ollama' ? '连接本机 Ollama' : '连接并读取模型');
    refresh.textContent = canRestoreCredential ? '重新读取系统凭据' : selected === 'glm' ? '重新载入预设' : connection?.status === 'connected' ? '刷新目录' : '重新连接并读取目录';
    refresh.hidden = !(connection?.hasCredential || connection?.authMethod || canRestoreCredential); refresh.disabled = blocked;
    disconnect.hidden = !(connection?.hasCredential || connection?.authMethod || connection?.credentialStorage === 'system' || credentialUncertain); disconnect.disabled = blocked;
    find('.desktop-oauth-panel').hidden = selected !== 'openrouter';
    for (const control of [oauth, manual]) { control.hidden = pending; control.disabled = busy || !client.ready; }
    reopen.hidden = auth?.status !== 'waiting' || !auth.authorizationUrl; reopen.disabled = busy;
    cancel.hidden = !pending; cancel.disabled = busy;
    const manualWaiting = auth?.mode === 'manual' && auth.status === 'waiting';
    const restoreCodeFocus = (!manualWaiting && (document.activeElement === code || document.activeElement === complete))
      || (!pending && (document.activeElement === cancel || document.activeElement === reopen));
    codeForm.hidden = !manualWaiting; code.disabled = busy || !manualWaiting;
    const nextFlow = manualWaiting ? auth.flowId || '' : '';
    if (codeFlow !== nextFlow) { code.value = ''; codeFlow = nextFlow; }
    complete.disabled = busy || !manualWaiting || !code.value.trim();
    const expiry = auth?.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const terminal: Record<string, string> = { cancelled: '授权已取消。可以重新授权或使用 API 密钥。', expired: '授权已过期，请重新开始。', error: '授权失败，请重新开始或使用 API 密钥。', failed: '授权失败，请重新开始或使用 API 密钥。', denied: '授权未获批准，可以重新开始。' };
    find('#desktop-oauth-progress').textContent = pending
      ? `${auth?.message || (manualWaiting ? '等待粘贴浏览器中的授权码。' : '等待在浏览器完成授权…')}${expiry ? ` · 有效至 ${expiry}` : ''}`
      : auth?.message || terminal[auth?.status || ''] || '';
    if (restoreCodeFocus && isOpen() && !busy) (isUsableModelConnection(connection) ? search : pending ? cancel : manual).focus();
    retry.hidden = client.ready; retry.disabled = busy;
    renderModels();
  }
  function renderModels() {

    const connection = client.snapshot?.connections.find(c => c.providerId === selected);
    const models = isUsableModelConnection(connection) ? connection.models.filter(m => `${m.id} ${m.name}`.toLowerCase().includes(search.value.trim().toLowerCase())) : [];
    const selection = getSelection();
    const emptyState = !isUsableModelConnection(connection) ? 'disconnected' : connection.models.length ? 'filtered' : 'empty';
    const signature = JSON.stringify([selected, connection?.status, models, selection, emptyState]);
    if (signature === listSignature) {
      list.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = busy || isBusy(); });
      return;
    }
    const focusedModel = list.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.modelId : undefined;
    let restoredFocus = false;
    listSignature = signature; list.replaceChildren();
    for (const model of models) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.modelId = model.id;
      b.setAttribute('aria-pressed', String(selection?.providerId === selected && selection.model === model.id));
      const name = document.createElement('strong'); name.textContent = model.name;
      const id = document.createElement('small'); id.textContent = model.id; id.hidden = model.id === model.name;
      const check = createIcon(document, 'check', 'desktop-model-check');
      check.style.visibility = selection?.providerId === selected && selection.model === model.id ? 'visible' : 'hidden';
      b.append(createProviderIcon(document, selected), name, id, check); b.disabled = busy || isBusy();
      b.addEventListener('click', () => {
        if (busy || disposed || isBusy() || !select({ providerId: selected, model: model.id, label: model.name })) return;
        if (embedded) render(); else dialog.close();
      });
      list.append(b);
      if (focusedModel === model.id && isOpen()) { b.focus(); restoredFocus = true; }
    }
    if (!models.length) {
      const empty = document.createElement('p');
      empty.textContent = emptyState === 'disconnected' ? '连接成功后，模型会显示在这里。'
        : emptyState === 'filtered' ? '没有匹配的模型。试试其他关键词。'
        : selected === 'ollama' ? '已连接 Ollama，但尚无本地模型。请先下载模型，再刷新目录。'
        : selected === 'kimi' ? '当前账号未返回本应用支持的 Kimi K2.6；其他模型暂不兼容。可前往 Kimi 开放平台确认账号的模型权限。'
        : '已连接，但服务商尚未返回可用模型。请刷新目录。';
      list.append(empty);
    }
    if (focusedModel && !restoredFocus && isOpen()) search.focus();
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed && ['waiting', 'exchanging'].includes(client.snapshot?.oauth?.status || '')) timer = setTimeout(() => void load(true), 1500);
  }
  async function load(background = false) {
    if (disposed || busy) return;
    const version = operation;
    if (!background) { busy = true; loadError = ''; render(); }
    try { await client.load(); if (version === operation) loadError = ''; }
    catch { if (version === operation) loadError = '桌面模型服务不可用。请重新检查连接；若仍失败，请重启应用或修复安装。'; }
    finally {
      if (!background) busy = false;
      if (version === operation) { render(); schedule(); }
    }
  }
  async function mutate(action: string, payload: Record<string, unknown> = {}) {
    if (busy || disposed || isBusy() || (selected === 'openrouter' && oauthPending() && !['oauth/cancel', 'oauth/complete'].includes(action))) return;
    operation++; clearTimeout(timer); busy = true; mutationPending = true; error = ''; render();
    try {
      const result = await client.mutate(`/${selected}/${action}`, payload);
      if (action === 'oauth/start' && payload.mode !== 'manual') {
        try { await openUrl(result.authorizationUrl); } catch { error = '未能打开系统浏览器。请点击“在浏览器中打开授权页面”重试，或取消授权。'; } finally { await client.load(); loadError = ''; }
      } else { await client.load(); loadError = ''; }
    } catch {
      if (action !== 'oauth/start') {
        try { await client.load(); loadError = ''; } catch { /* Keep the retry affordance when the local service is unavailable. */ }
      }
      error = action === 'oauth/start' ? '无法开始授权。请检查网络后重试，或使用 API 密钥。'
        : action === 'oauth/complete' ? '授权码未能完成连接。请查看授权状态，重新授权或重试。'
        : action === 'verify' ? '推理测试未完成，请查看连接状态。不会自动重试，以免重复计费。' : '连接操作失败。请检查凭据、网络与本机服务后重试。';
    }
    finally {
      busy = false; mutationPending = false; render(); schedule();
      if (action === 'oauth/start' && payload.mode === 'manual' && isOpen() && !reopen.hidden) reopen.focus();
    }
  }
  editor.addEventListener('toggle', () => {
    if (!editor.open) {
      clearKey(); code.value = '';
      if (isOpen() && editor.contains(document.activeElement) && document.activeElement !== editorToggle) editorToggle.focus();
    }
  });
  for (const [id, label] of providers) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.providerId = id;
    b.append(createProviderIcon(document, id), document.createTextNode(label));
    b.addEventListener('click', () => { selected = id; resetScroll(); clearKey(); code.value = ''; search.value = ''; storage.value = 'memory'; endpoint.value = client.snapshot?.connections.find(c => c.providerId === id)?.endpoint?.baseUrl || ''; localHttp.checked = client.snapshot?.connections.find(c => c.providerId === id)?.endpoint?.allowLocalHttp || false; error = ''; render(); b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }); nav.append(b);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const apiKey = key.value.trim();
    if (busy || disposed || isBusy() || (selected === 'openrouter' && oauthPending()) || !client.ready || (selected !== 'ollama' && (!apiKey || apiKey.length > 4096))) return;
    if (selected === 'custom' && !endpoint.value.trim()) return;
    const payload = selected === 'ollama' ? {} : { apiKey, storage: storage.value, ...(selected === 'custom' ? { endpoint: { baseUrl: endpoint.value.trim(), allowLocalHttp: localHttp.checked } } : {}) };
    clearKey(); void mutate('connect', payload);
  });
  key.addEventListener('input', () => { connect.disabled = busy || (selected === 'openrouter' && oauthPending()) || !client.ready || !key.value.trim(); });
  reveal.addEventListener('click', () => {
    key.type = key.type === 'password' ? 'text' : 'password';
    paintReveal(key.type === 'text');
  });
  refresh.addEventListener('click', () => void mutate('refresh'));
  getKey.addEventListener('click', async () => {
    const help = providerHelp[selected];
    if (!help || getKey.disabled) return;
    try { await openUrl(help.keyUrl); }
    catch { error = '未能打开服务商密钥页面，请稍后重试。'; render(); }
  });
  verify.addEventListener('click', () => { const selection = getSelection(); if (!verify.disabled && selection?.providerId === selected) void mutate('verify', { model: selection.model }); });
  disconnect.addEventListener('click', () => void mutate('disconnect'));
  oauth.addEventListener('click', () => { clearKey(); void mutate('oauth/start', { mode: 'callback', storage: storage.value }); });
  manual.addEventListener('click', () => { clearKey(); void mutate('oauth/start', { mode: 'manual', storage: storage.value }); });
  reopen.addEventListener('click', async () => {
    const auth = client.snapshot?.oauth;
    if (busy || auth?.status !== 'waiting' || !auth.authorizationUrl) return;
    error = ''; busy = true; render();
    try { await openUrl(auth.authorizationUrl); }
    catch { error = '未能打开系统浏览器。请重试，或取消授权。'; }
    finally { busy = false; render(); schedule(); }
  });
  code.addEventListener('input', () => { complete.disabled = busy || !code.value.trim(); });
  codeForm.addEventListener('submit', event => {
    event.preventDefault();
    const auth = client.snapshot?.oauth, value = code.value.trim();
    if (busy || disposed || isBusy() || selected !== 'openrouter' || auth?.status !== 'waiting' || auth.mode !== 'manual' || !auth.flowId || !value || value.length > 4096) return;
    code.value = ''; void mutate('oauth/complete', { flowId: auth.flowId, code: value });
  });
  cancel.addEventListener('click', () => { code.value = ''; void mutate('oauth/cancel'); });
  retry.addEventListener('click', () => void load());
  search.addEventListener('input', renderModels);
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { activation++; clearKey(); code.value = ''; opener?.focus(); });
  dialog.addEventListener('keydown', event => {
    // Match the shared dialog boundary wrap; native semantics own interior
    // navigation and Escape. WebView2 must not tab into browser chrome.
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || embedded || !dialog.open) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, wa-button, input, select, textarea, a[href], summary, [tabindex]')]
      .filter(node => (node.tabIndex >= 0 || node.matches('wa-button')) && !node.matches(':disabled')
        && !node.hasAttribute('disabled') && !node.closest('[hidden], [inert]')
        && (!editor.contains(node) || editor.open || node === editorToggle)
        && node.getClientRects().length > 0 && window.getComputedStyle(node).visibility !== 'hidden');
    const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
    const target = event.shiftKey && active === first ? last : !event.shiftKey && active === last ? first : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  function focusField() {
    const connected = isUsableModelConnection(client.snapshot?.connections.find(c => c.providerId === selected));
    const target = selected === 'openrouter' && oauthPending() ? (client.snapshot?.oauth?.mode === 'manual' ? code : cancel) : connected ? search : selected === 'ollama' ? connect : key;
    if (!target.disabled) target.focus();
  }
  function activate() {
    const version = ++activation;
    const current = getSelection();
    if (current && providers.some(p => p[0] === current.providerId)) selected = current.providerId;
    search.value = ''; editorState = ''; resetScroll(); render();
    quickPicker.close();
    if (!embedded && !dialog.open) dialog.showModal();
    nav.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const loading = load(); if (!embedded) focusField();
    const initialFocus = document.activeElement;
    return loading.then(() => { if (!disposed && !embedded && version === activation && dialog.open && document.activeElement === initialFocus) focusField(); });
  }
  function closeEmbedded() {
    embedded = false; activation++; clearKey(); code.value = '';
  }
  function open(anchor?: HTMLElement | null) {
    if (disposed || isBusy() || mutationPending) return;
    if (embedded) closeEmbedded();
    moveContent(dialog); closeButton.hidden = false;
    opener = anchor ?? (document.activeElement instanceof HTMLElement ? document.activeElement : picker);
    void activate();
  }
  const settings = {
    element: panel,
    open() {
      if (disposed || embedded) return;
      opener = null;
      if (dialog.open) dialog.close();
      moveContent(panel); embedded = true; closeButton.hidden = true;
      return activate();
    },
    close: closeEmbedded,
    canClose: () => !mutationPending,
    searchTarget(target: string): HTMLElement | null {
      if (disposed || !embedded) return null;
      let node = panel.querySelector<HTMLElement>(`#${target}`);
      if (!node) return null;
      const missingCatalog = node === search && find('.desktop-model-catalog').hidden;
      if (missingCatalog || (node === editorToggle && editorToggle.hidden)) {
        const pending = selected === 'openrouter' && oauthPending();
        node = pending ? (codeForm.hidden ? cancel : code) : selected === 'ollama' ? connect : key;
        if (missingCatalog) {
          const hint = pending ? '请先完成当前授权，再查看模型目录。' : '请先连接服务商，再查看模型目录。';
          if (!status.textContent?.includes(hint)) status.textContent += ` ${hint}`;
          status.hidden = false;
        }
      }
      if (editor.contains(node)) editor.open = true;
      if (node.closest('[hidden]') || node.hasAttribute('disabled') || ('disabled' in node && node.disabled === true)) {
        status.hidden = false; return status;
      }
      return node;
    },
  };
  const quickPicker = mountModelPicker({ anchor: picker, providers, connections: () => client.snapshot?.connections || [],
    load: () => client.load(), select, getSelection, isBusy: () => busy || isBusy(), manage: onManage ?? (() => open(picker)) });
  const openFromButton = () => open(button);
  button?.addEventListener('click', openFromButton);
  function shortcut(event: KeyboardEvent) { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') { event.preventDefault(); if (!isOpen()) quickPicker.open(); } }
  document.addEventListener('keydown', shortcut);
  render();
  return { open, settings, destroy() { disposed = true; closeEmbedded(); clearTimeout(timer); client.dispose(); button?.removeEventListener('click', openFromButton); quickPicker.destroy(); document.removeEventListener('keydown', shortcut); panel.remove(); dialog.remove(); } };
}
