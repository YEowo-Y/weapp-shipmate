import { openUrl } from '@tauri-apps/plugin-opener';
import { mountExplain, type ExplainFollowUp } from './shared/explain.js';
import { queryExplain } from './shared/explain-transport.js';
import { desktopModelFetch } from './model-fetch';

type FollowUpDestination = string | (() => boolean | void);
type ExplainDialogOptions = {
  saveResult(text: string): { ok: boolean; reason?: string; duplicate?: boolean };
  query?(args: { query: string; signal?: AbortSignal }): Promise<unknown>;
  prepareFollowUp?(action: ExplainFollowUp, opener: HTMLElement | null, isCurrent: () => boolean): Promise<FollowUpDestination>;
};

/** Share the browser controller and validated result renderer over the fixed native bridge. */
export function mountExplainDialog({ saveResult, query, prepareFollowUp }: ExplainDialogOptions) {
  const dialog = document.querySelector<HTMLDialogElement>('#desktop-explain')!;
  const input = dialog.querySelector<HTMLTextAreaElement>('#rjInput')!;
  const linkStatus = dialog.querySelector<HTMLElement>('#rjLinkStatus')!;
  let opener: HTMLElement | null = null;
  let linkEpoch = 0;
  let restoreOpener = true;
  const lifecycle = mountExplain(document, {
    query: query ?? (args => queryExplain(args, { fetcher: desktopModelFetch })),
    onFollowUp: prepareFollowUp ? async (action, isCurrent) => {
      const stillOpen = () => dialog.open && isCurrent();
      const destination = await prepareFollowUp(action, opener, stillOpen);
      if (!stillOpen()) return;
      if (typeof destination === 'string') return destination;
      const focused = document.activeElement as HTMLElement | null;
      restoreOpener = false;
      dialog.close();
      try {
        if (destination() !== false) {
          suspend();
          return;
        }
      } catch { /* Reopen the current result so the navigation can be retried. */ }
      restoreOpener = true;
      dialog.showModal();
      focused?.focus({ preventScroll: true });
      return '未能打开下一步，请重试。';
    } : undefined,
    saveResult(text) {
      const saved = saveResult(text);
      if (saved.ok && !saved.duplicate) {
        opener = document.querySelector<HTMLElement>('#desktopInput');
        dialog.close();
      }
      return saved;
    },
  });
  function suspend() {
    lifecycle?.suspend(); linkEpoch++;
    linkStatus.textContent = '';
  }
  function closed() {
    if (dialog.open || !restoreOpener) return;
    suspend();
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
      restoreOpener = true;
      dialog.showModal();
      const query = dialog.querySelector<HTMLDetailsElement>('#rjQuery')!;
      (query.open ? input : dialog.querySelector<HTMLElement>('#rjResultHeading'))?.focus({ preventScroll: true });
      dialog.querySelector('.session-workspace-dialog__body')!.scrollTop = 0;
    },
  };
}
