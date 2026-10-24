import { openUrl } from '@tauri-apps/plugin-opener';
import { mountExplain } from '../design-previews/explain.js';
import { queryExplain } from '../design-previews/explain-transport.js';
import { desktopModelFetch } from './model-fetch';

/** Share the browser controller and validated result renderer over the fixed native bridge. */
export function mountExplainDialog({ saveResult, query }: { saveResult: (text: string) => { ok: boolean; reason?: string; duplicate?: boolean }; query?: (args: {query: string; signal?: AbortSignal}) => Promise<unknown> }) {
  const dialog = document.querySelector<HTMLDialogElement>('#desktop-explain')!;
  const input = dialog.querySelector<HTMLTextAreaElement>('#rjInput')!;
  const linkStatus = dialog.querySelector<HTMLElement>('#rjLinkStatus')!;
  const lifecycle = mountExplain(document, {
    query: query ?? (args => queryExplain(args, { fetcher: desktopModelFetch })),
    saveResult(text) {
      const saved = saveResult(text);
      if (saved.ok && !saved.duplicate) {
        opener = document.querySelector<HTMLElement>('#desktopInput');
        dialog.close();
      }
      return saved;
    },
  });
  let opener: HTMLElement | null = null;
  let linkEpoch = 0;
  function closed() {
    if (dialog.open) return;
    lifecycle?.suspend(); linkEpoch++;
    linkStatus.textContent = '';
    const target = opener?.isConnected && opener.getClientRects().length ? opener : document.querySelector<HTMLElement>('#desktop-more');
    target?.focus({ preventScroll: true });
  }
  dialog.querySelector('#desktop-explain-close')!.addEventListener('click', () => { lifecycle?.suspend(); dialog.close(); });
  dialog.addEventListener('close', closed);
  dialog.addEventListener('cancel', () => lifecycle?.suspend());
  dialog.addEventListener('click', async event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('.rj-evidence a');
    if (!link) return;
    event.preventDefault();
    const epoch = ++linkEpoch; linkStatus.textContent = '';
    try { await openUrl(link.href); }
    catch { if (dialog.open && epoch === linkEpoch) linkStatus.textContent = '未能打开系统浏览器，请重试或复制链接地址。'; }
  });
  window.addEventListener('pagehide', () => { linkEpoch++; lifecycle?.dispose(); }, { once: true });
  return {
    reset() { lifecycle?.reset(); },
    open(trigger: HTMLElement) {
      if (dialog.open) return;
      opener = trigger;
      dialog.showModal();
      const query = dialog.querySelector<HTMLDetailsElement>('#rjQuery')!;
      (query.open ? input : dialog.querySelector<HTMLElement>('#rjResultHeading'))?.focus({ preventScroll: true });
      dialog.querySelector('.session-workspace-dialog__body')!.scrollTop = 0;
    },
  };
}
