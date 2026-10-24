import './model-connection.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import { createConnectionClient } from '../design-previews/model-connection-client.js';
import { createProviderIcon } from '../design-previews/components/provider-icons.js';
import { createIcon } from '../design-previews/components/icons.js';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { desktopModelFetch } from './model-fetch';
import { mountModelPicker } from './model-picker';

type Selection = { providerId: string; model: string; label: string };
const providers = [['openai', 'OpenAI'], ['anthropic', 'Anthropic'], ['google', 'Google'], ['openrouter', 'OpenRouter'], ['ollama', 'Ollama'], ['custom', '自定义服务']];

/** Native dialog and shared provider client; credentials never enter conversation storage. */
export function mountModelConnections({ button, picker, select, isBusy, getSelection, onManage }: {
  button?: HTMLButtonElement; picker: HTMLButtonElement; onManage?: () => void;
  select: (value: Selection) => boolean; isBusy: () => boolean; getSelection: () => Selection | null;
}) {
  const client = createConnectionClient(desktopModelFetch);
  const dialog = document.createElement('dialog');
  dialog.id = 'desktop-model-dialog'; dialog.className = 'desktop-model-dialog';
  dialog.setAttribute('aria-labelledby', 'desktop-model-title');
  dialog.innerHTML = `<header><div><h2 id="desktop-model-title">模型连接</h2><p>选择服务商，连接后在对话中切换模型。</p></div></header><div class="desktop-model-layout"><nav aria-label="模型服务商"></nav><section class="desktop-model-detail"><div class="desktop-provider-heading"><span class="desktop-provider-brand" aria-hidden="true"></span><h3></h3></div><p class="desktop-model-note"></p><p id="desktop-provider-status" role="status" aria-live="polite"></p><div class="desktop-model-actions" data-current-connection-actions></div><div class="desktop-model-catalog"><label for="desktop-model-search">模型目录</label><div class="desktop-catalog-search"><input id="desktop-model-search" type="search" placeholder="搜索模型名称或 ID" autocomplete="off"></div><div class="desktop-model-list" role="group" aria-label="可用模型"></div></div><section class="desktop-inference-panel"><h4>推理测试</h4><p id="desktop-inference-status" class="desktop-field-hint" role="status"></p><p class="desktop-field-hint">向所选模型发送一条简短测试，可能产生服务商费用；不会自动执行。</p><div data-inference-actions></div></section><details id="desktop-connection-editor"><summary id="desktop-connection-editor-toggle">更改密钥或授权方式</summary><form><div class="desktop-endpoint-field"><label for="desktop-provider-endpoint">API 基础地址</label><input id="desktop-provider-endpoint" type="url" placeholder="https://api.example.com/v1" autocomplete="off"><label class="desktop-checkbox"><input id="desktop-provider-local-http" type="checkbox">允许本机 HTTP（仅回环地址）</label><p class="desktop-field-hint">兼容 OpenAI Chat Completions；凭据绑定此地址。更换地址需重新连接。</p></div><div class="desktop-key-field"><label for="desktop-provider-key">API 密钥</label><div class="desktop-key-input"><input id="desktop-provider-key" type="password" autocomplete="off" spellcheck="false" maxlength="4096" placeholder="输入服务商 API 密钥" aria-describedby="desktop-credential-hint"></div><p id="desktop-credential-hint" class="desktop-field-hint">提交或关闭后清空输入；密钥不会写入会话。</p></div><div class="desktop-storage-field"><label for="desktop-provider-storage">凭据保存方式</label><select id="desktop-provider-storage"><option value="memory">仅本次应用运行</option><option value="system">Windows 系统凭据库</option></select><p id="desktop-storage-hint" class="desktop-field-hint"></p></div><div class="desktop-model-actions" data-connection-actions></div></form><section class="desktop-oauth-panel"><h4>OpenRouter 授权</h4><p class="desktop-field-hint">使用浏览器授权，或选择授权码连接；也可以在上方填写 API 密钥。</p><div class="desktop-model-actions" data-oauth-actions></div><p id="desktop-oauth-progress" class="desktop-field-hint" role="status"></p><form id="desktop-oauth-code-form"><label for="desktop-oauth-code">授权码</label><p id="desktop-oauth-code-hint" class="desktop-field-hint">先在浏览器完成授权并复制授权码，再粘贴到此处连接。提交或关闭后清空。</p><input id="desktop-oauth-code" type="password" autocomplete="off" spellcheck="false" maxlength="4096" aria-describedby="desktop-oauth-code-hint" placeholder="粘贴浏览器显示的授权码"><div class="desktop-model-actions" data-oauth-code-actions></div></form></section></details></section></div>`;
  document.body.append(dialog);
  const find = <T extends HTMLElement>(s: string) => dialog.querySelector(s) as T;
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
  find('.desktop-catalog-search').prepend(createIcon(document, 'search'));
  const nav = find('nav'), status = find('#desktop-provider-status'), form = find<HTMLFormElement>('form');
  const key = find<HTMLInputElement>('#desktop-provider-key'), search = find<HTMLInputElement>('#desktop-model-search');
  const list = find('.desktop-model-list');
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
    dialog.dataset.connectionState = connection?.status || 'disconnected';
    find('.desktop-model-note').textContent = selected === 'ollama'
      ? '连接此设备上的 Ollama，无需 API 密钥。请先启动 Ollama 并下载模型。'
      : selected === 'custom' ? '连接你信任的兼容服务。连接读取目录，不代表模型已通过推理测试。' : '连接凭据、模型目录与推理测试分别验证；会话与草稿保留在此设备。';
    find('h3').textContent = providers.find(p => p[0] === selected)![1];
    find('.desktop-provider-brand').replaceChildren(createProviderIcon(document, selected));
    nav.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.providerId === selected)); b.disabled = busy; });
    const auth = client.snapshot?.oauth;
    const pending = oauthPending(), pendingOpenRouter = selected === 'openrouter' && pending;
    const blocked = busy || pendingOpenRouter || isBusy();
    const connected = connection?.status === 'connected';
    const nextEditorState = `${selected}:${connected}`;
    if (editorState !== nextEditorState) { editorState = nextEditorState; editor.open = !connected; }
    if (pendingOpenRouter) editor.open = true;
    editorToggle.hidden = !connected || pendingOpenRouter;
    editorToggle.textContent = selected === 'ollama' ? '重新设置连接' : '更改密钥或授权方式';
    find('.desktop-model-catalog').hidden = !connected;
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
    verify.disabled = blocked || connection?.status !== 'connected' || selection?.providerId !== selected || !connection.models.some(m => m.id === selection?.model);
    const inference = connection?.inference;
    find('#desktop-inference-status').textContent = inference?.status === 'verified' ? `已通过推理测试 · ${inference.model || ''}` : inference?.error?.message || (inference?.status === 'checking' ? '正在测试模型…' : selection?.providerId === selected && connection?.models.some(m => m.id === selection.model) ? `尚未测试 · ${selection.model}` : '尚未测试。请先在目录中选择模型，再打开此页测试。');
    find('#desktop-inference-status').classList.toggle('is-busy', inference?.status === 'checking');
    form.hidden = pendingOpenRouter;
    const visibleError = error || loadError;
    status.hidden = pendingOpenRouter && !visibleError;
    find('.desktop-oauth-panel > .desktop-field-hint').textContent = pendingOpenRouter
      ? '完成当前授权，或取消后选择其他连接方式。'
      : '使用浏览器授权，或选择授权码连接；也可以在上方填写 API 密钥。';
    status.textContent = visibleError || (busy ? '正在处理连接…' : connection?.error?.message || (connection?.status === 'connected' ? `已连接 · ${connection.models.length} 个模型` : connection?.hasCredential ? '凭据已保存，尚未读取模型目录。请重新连接。' : '尚未连接。请添加凭据或连接本机 Ollama。'));
    status.dataset.tone = visibleError || connection?.error ? 'error' : connection?.status === 'connected' ? 'success' : 'neutral';
    status.classList.toggle('is-busy', busy);
    find('.desktop-key-field').hidden = selected === 'ollama';
    key.hidden = selected === 'ollama'; key.disabled = blocked; key.required = selected !== 'ollama';
    reveal.disabled = blocked;
    connect.disabled = blocked || !client.ready || (selected !== 'ollama' && !key.value.trim());
    connect.appearance = connection?.status === 'connected' ? 'outlined' : 'accent';
    connect.textContent = connection?.status === 'connected'
      ? (selected === 'ollama' ? '重新连接' : '更新密钥')
      : (selected === 'ollama' ? '连接本机 Ollama' : '连接并读取模型');
    refresh.textContent = canRestoreCredential ? '重新读取系统凭据' : connection?.status === 'connected' ? '刷新目录' : '重新连接并读取目录';
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
    if (restoreCodeFocus && dialog.open && !busy) (connection?.status === 'connected' ? search : pending ? cancel : manual).focus();
    retry.hidden = client.ready; retry.disabled = busy;
    renderModels();
  }
  function renderModels() {

    const connection = client.snapshot?.connections.find(c => c.providerId === selected);
    const models = connection?.status === 'connected' ? connection.models.filter(m => `${m.id} ${m.name}`.toLowerCase().includes(search.value.trim().toLowerCase())) : [];
    const selection = getSelection();
    const emptyState = connection?.status !== 'connected' ? 'disconnected' : connection.models.length ? 'filtered' : 'empty';
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
      b.addEventListener('click', () => { if (select({ providerId: selected, model: model.id, label: model.name })) dialog.close(); });
      list.append(b);
      if (focusedModel === model.id && dialog.open) { b.focus(); restoredFocus = true; }
    }
    if (!models.length) {
      const empty = document.createElement('p');
      empty.textContent = emptyState === 'disconnected' ? '连接成功后，模型会显示在这里。'
        : emptyState === 'filtered' ? '没有匹配的模型。试试其他关键词。'
        : selected === 'ollama' ? '已连接 Ollama，但尚无本地模型。请先下载模型，再刷新目录。'
        : '已连接，但服务商尚未返回可用模型。请刷新目录。';
      list.append(empty);
    }
    if (focusedModel && !restoredFocus && dialog.open) search.focus();
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
    operation++; clearTimeout(timer); busy = true; error = ''; render();
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
      busy = false; render(); schedule();
      if (action === 'oauth/start' && payload.mode === 'manual' && dialog.open && !reopen.hidden) reopen.focus();
    }
  }
  editor.addEventListener('toggle', () => {
    if (!editor.open) {
      clearKey(); code.value = '';
      if (editor.contains(document.activeElement) && document.activeElement !== editorToggle) editorToggle.focus();
    }
  });
  for (const [id, label] of providers) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.providerId = id;
    b.append(createProviderIcon(document, id), document.createTextNode(label));
    b.addEventListener('click', () => { selected = id; resetScroll(); clearKey(); code.value = ''; search.value = ''; storage.value = 'memory'; endpoint.value = client.snapshot?.connections.find(c => c.providerId === id)?.endpoint?.baseUrl || ''; localHttp.checked = client.snapshot?.connections.find(c => c.providerId === id)?.endpoint?.allowLocalHttp || false; error = ''; render(); }); nav.append(b);
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
  dialog.addEventListener('close', () => { clearKey(); code.value = ''; opener?.focus(); });
  function focusField() {
    const connected = client.snapshot?.connections.find(c => c.providerId === selected)?.status === 'connected';
    const target = selected === 'openrouter' && oauthPending() ? (client.snapshot?.oauth?.mode === 'manual' ? code : cancel) : connected ? search : selected === 'ollama' ? connect : key;
    if (!target.disabled) target.focus();
  }
  function open(anchor?: HTMLElement | null) {
    if (disposed || isBusy()) return;
    opener = anchor ?? (document.activeElement instanceof HTMLElement ? document.activeElement : picker);
    const current = getSelection();
    if (current && providers.some(p => p[0] === current.providerId)) selected = current.providerId;
    search.value = ''; editorState = ''; resetScroll(); render();
    quickPicker.close();
    if (!dialog.open) dialog.showModal();
    nav.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const loading = load(); focusField();
    const initialFocus = document.activeElement;
    void loading.then(() => { if (!disposed && dialog.open && document.activeElement === initialFocus) focusField(); });
  }
  const quickPicker = mountModelPicker({ anchor: picker, providers, connections: () => client.snapshot?.connections || [],
    load: () => client.load(), select, getSelection, isBusy: () => busy || isBusy(), manage: onManage ?? (() => open(picker)) });
  const openFromButton = () => open(button);
  button?.addEventListener('click', openFromButton);
  function shortcut(event: KeyboardEvent) { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') { event.preventDefault(); if (!dialog.open) quickPicker.open(); } }
  document.addEventListener('keydown', shortcut);
  render();
  return { open, destroy() { disposed = true; clearTimeout(timer); client.dispose(); clearKey(); code.value = ''; button?.removeEventListener('click', openFromButton); quickPicker.destroy(); document.removeEventListener('keydown', shortcut); dialog.remove(); } };
}
