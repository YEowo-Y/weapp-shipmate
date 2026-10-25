import { isUsableModelConnection } from '../design-previews/model-connection-client.js';
import { createProviderIcon } from '../design-previews/components/provider-icons.js';
import { createIcon } from '../design-previews/components/icons.js';
import { attachFloatingSurface } from '../design-previews/components/floating-surface.js';
import { createActionButton } from '../design-previews/components/ui-kit.js';

type Selection = { providerId: string; model: string; label: string };
type Connection = { providerId: string; status: string; hasCredential?: boolean; catalogSource?: string; inference?: { status: string; model: string | null }; models: { id: string; name: string }[] };

/** A read-only view of the connection client's catalog; credentials stay in settings. */
export function mountModelPicker({ anchor, providers, connections, load, select, getSelection, isBusy, manage }: {
  anchor: HTMLButtonElement; providers: string[][]; connections: () => Connection[];
  load: () => Promise<unknown>; select: (selection: Selection) => boolean;
  getSelection: () => Selection | null; isBusy: () => boolean; manage: () => void;
}) {
  const surface = document.createElement('div');
  surface.id = 'desktop-model-picker'; surface.className = 'desktop-model-picker'; surface.popover = 'auto';
  surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-label', '选择模型');
  surface.innerHTML = '<div class="desktop-picker-search"><input id="desktop-picker-search" type="search" aria-label="搜索已连接的模型" placeholder="搜索模型…" autocomplete="off"></div><p class="desktop-picker-status" role="status" aria-live="polite"></p><div class="desktop-picker-list" role="group" aria-label="已连接的模型"></div><footer class="desktop-picker-footer"></footer>';
  document.body.append(surface);
  const search = surface.querySelector<HTMLInputElement>('input')!;
  surface.querySelector('.desktop-picker-search')!.prepend(createIcon(document, 'search'));
  const list = surface.querySelector<HTMLElement>('.desktop-picker-list')!;
  const status = surface.querySelector<HTMLElement>('.desktop-picker-status')!;
  const retry = createActionButton(document, '重新加载', { appearance: 'plain' }); retry.setAttribute('data-retry', '');
  const management = createActionButton(document, '管理模型连接', { appearance: 'plain', className: 'desktop-picker-manage' });
  const manageIcon = createIcon(document, 'sliders-horizontal'); manageIcon.setAttribute('slot', 'start'); management.prepend(manageIcon);
  surface.querySelector('footer')!.append(retry, management);
  let opened = false, disposed = false, loading = false, error = '', revision = 0;
  let cleanup: (() => void) | undefined;
  anchor.setAttribute('aria-haspopup', 'dialog'); anchor.setAttribute('aria-controls', surface.id); anchor.setAttribute('aria-expanded', 'false');
  function render() {
    const focused = list.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusedModel = focused?.dataset.modelId, focusedProvider = focused?.dataset.providerId;
    let restoredFocus = false;
    const query = search.value.trim().toLowerCase();
    const selection = getSelection();
    const available = connections().filter(isUsableModelConnection);
    list.replaceChildren();
    for (const connection of available) {
      const provider = providers.find(p => p[0] === connection.providerId)?.[1] || connection.providerId;
      for (const model of connection.models) {
        if (!`${model.name} ${model.id} ${provider}`.toLowerCase().includes(query)) continue;
        const option = document.createElement('button'); option.type = 'button'; option.className = 'desktop-picker-option';
        option.dataset.modelId = model.id; option.dataset.providerId = connection.providerId;
        const selected = selection?.providerId === connection.providerId && selection.model === model.id;
        option.setAttribute('aria-pressed', String(selected)); option.disabled = isBusy();
        const label = document.createElement('span'); label.className = 'desktop-picker-label';
        const title = document.createElement('strong'); title.textContent = model.name;
        const subtitle = document.createElement('small'); subtitle.textContent = connection.status === 'configured' ? `${provider} · ${connection.inference?.status === 'verified' && connection.inference.model === model.id ? '推理已验证' : '预设，尚未验证'}` : provider;
        label.append(title, subtitle);
        const check = createIcon(document, 'check', 'desktop-model-check'); check.style.visibility = selected ? 'visible' : 'hidden';
        option.append(createProviderIcon(document, connection.providerId), label, check);
        option.addEventListener('click', () => {
          if (!isBusy() && select({ providerId: connection.providerId, model: model.id, label: model.name })) close(true);
        }); list.append(option);
        if (focusedModel === model.id && focusedProvider === connection.providerId) { option.focus(); restoredFocus = true; }
      }
    }
    const emptyMessage = !available.length ? (connections().some(c => c.hasCredential) ? '凭据已保存，请在管理模型连接中重新连接并读取目录。' : '尚无可用模型，请先连接服务商。')
      : available.some(connection => connection.models.length) ? '没有匹配的模型，试试其他关键词。'
      : available.every(connection => connection.providerId === 'ollama') ? '已连接 Ollama，但尚无本地模型。请先下载模型，再到管理模型连接中刷新目录。'
      : available.some(connection => connection.providerId === 'kimi') ? '当前账号未返回本应用支持的 Kimi K2.6；其他 Kimi 模型暂不兼容。请在管理模型连接中确认账号权限。'
      : '已连接，但服务商尚未返回可用模型。请到管理模型连接中刷新目录。';
    status.textContent = error || (loading ? '正在读取模型…' : list.childElementCount ? '' : emptyMessage);
    status.hidden = !status.textContent; status.classList.toggle('is-busy', loading); status.dataset.tone = error ? 'error' : 'neutral';
    retry.hidden = !error; retry.disabled = loading;
    // A refreshed catalog may remove the row the reader was navigating.
    // Keep keyboard control inside the open surface without stealing focus otherwise.
    if (opened && focused && !restoredFocus) search.focus();
  }
  async function refresh() {
    const version = ++revision; loading = true; error = ''; render();
    try { await load(); } catch { if (version === revision) error = '无法读取模型，请重试或检查连接。'; }
    finally { if (!disposed && opened && version === revision) { loading = false; render(); } }
  }
  function closed() { opened = false; revision++; cleanup?.(); cleanup = undefined; anchor.setAttribute('aria-expanded', 'false'); }
  function close(restore = false) {
    if (!opened) return;
    surface.hidePopover(); closed(); if (restore) anchor.focus();
  }
  function open() {
    if (disposed || isBusy()) return;
    if (opened) { close(true); return; }
    search.value = ''; opened = true; render(); surface.showPopover(); anchor.setAttribute('aria-expanded', 'true');
    cleanup = attachFloatingSurface(anchor, surface, { placement: 'top-end', onError: () => close(true) });
    if (opened) { search.focus(); void refresh(); }
  }
  surface.addEventListener('toggle', () => { if (!surface.matches(':popover-open') && opened) closed(); });
  surface.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const options = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!options.length) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault(); options[current < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
  });
  search.addEventListener('input', render); retry.addEventListener('click', () => void refresh());
  management.addEventListener('click', () => { close(true); manage(); });
  anchor.addEventListener('click', open);
  return { open, close, destroy() { close(); disposed = true; revision++; anchor.removeEventListener('click', open); surface.remove(); } };
}
