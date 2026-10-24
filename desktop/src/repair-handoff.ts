import { createHandoff, parseHandoff, exportHandoff, renderHandoffSections, handoffWarnings, MAX_HANDOFF_BYTES, type RepairHandoff } from '../design-previews/repair-handoff.js';
import { createArtifactDownloader } from '../design-previews/artifact-download.js';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import { renderMessageText } from '../design-previews/components/message-markdown.js';
import type { Artifact, Project } from './projects';
import './context.css';
import './repair-handoff.css';

export function mountRepairHandoff(options: { getArtifact(): Artifact | null; getProject(): Project | null; getRulesVersion(): string | null; isBusy(): boolean }) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
    const element = document.createElement(tag); element.textContent = text; return element;
  };
  const dialog = node('dialog'); dialog.id = 'desktop-handoff'; dialog.className = 'context-dialog handoff-dialog';
  dialog.setAttribute('aria-labelledby', 'handoff-title'); dialog.setAttribute('aria-describedby', 'handoff-description');
  const header = node('header'); header.className = 'context-header';
  const title = node('h2', '修复交接'); title.id = 'handoff-title';
  const dismiss = createActionButton(document, '', { appearance: 'plain' }); dismiss.id = 'handoff-dismiss';
  dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭修复交接'); dismiss.append(createIcon(document, 'x'));
  header.append(title, dismiss);
  const body = node('div'); body.className = 'context-body';
  const description = node('p', '将报告整理为问题依据、期望结果和验证步骤，交给自己或协作者处理。'); description.id = 'handoff-description';
  const actions = node('div'); actions.className = 'handoff-actions';
  const openFile = createActionButton(document, '打开交接文件', { appearance: 'outlined' }); openFile.id = 'handoff-open';
  openFile.prepend(createIcon(document, 'folder'));
  const markdown = createActionButton(document, '导出 Markdown', { appearance: 'outlined' }); markdown.id = 'handoff-markdown';
  const json = createActionButton(document, '导出 JSON', { appearance: 'plain' }); json.id = 'handoff-json';
  const file = node('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; file.id = 'handoff-file';
  const status = node('p'); status.id = 'handoff-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
  const provenance = node('p'); provenance.id = 'handoff-provenance';
  const warning = node('p'); warning.id = 'handoff-warning';
  const content = node('section'); content.id = 'handoff-content'; content.tabIndex = 0; content.setAttribute('aria-label', '交接内容'); content.className = 'handoff-content report-markdown';
  const basis = node('details'); basis.className = 'context-preview handoff-basis'; basis.id = 'handoff-basis'; basis.hidden = true;
  const basisTitle = node('summary', '报告来源与版本'); const basisContent = node('div'); basisContent.id = 'handoff-source'; basisContent.className = 'report-markdown'; basis.append(basisTitle, basisContent);
  const footer = node('footer'); footer.className = 'handoff-footer';
  const note = node('p', '只读建议 · 未修改项目文件');
  const done = createActionButton(document, '完成', { appearance: 'plain' }); done.id = 'handoff-done'; footer.append(note, done);
  actions.append(openFile, markdown, json); body.append(description, actions, file, status, provenance, warning, basis, content); dialog.append(header, body, footer); document.body.append(dialog);
  const downloader = createArtifactDownloader({ documentRef: document });
  let pack: RepairHandoff | null = null, external = false, loading = false, disposed = false, epoch = 0;
  let trigger: HTMLElement | null = null;
  function refresh() {
    markdown.disabled = json.disabled = loading || !pack;
    openFile.disabled = loading;
    provenance.textContent = !pack ? '打开此前导出的 JSON，或从执行报告中创建交接。'
      : `${external ? '外部文件 · 来源未核验' : '本机已保存报告'} · ${pack.items.length} 个核对项 · ${new Date(pack.source.createdAt).toLocaleString('zh-CN', { hour12: false })}`;
    warning.textContent = pack ? [...(external ? ['外部文件仅供阅读，不写入本机成果，也不授予任何操作权限。'] : []), ...handoffWarnings(pack, options.getProject(), options.getRulesVersion())].join(' ') : '';
    warning.hidden = !warning.textContent;
  }
  function display(value: RepairHandoff, imported: boolean) {
    const sections = renderHandoffSections(value);
    const nextContent = node('div'), nextBasis = node('div');
    renderMessageText(nextContent, sections.content, { copyCode: false });
    renderMessageText(nextBasis, sections.basis, { copyCode: false });
    content.replaceChildren(nextContent); basisContent.replaceChildren(nextBasis); basis.hidden = false; basis.open = false;
    pack = value; external = imported; body.scrollTop = 0; refresh();
  }
  const reportError = (error: unknown) => {
    status.textContent = `${error instanceof Error ? error.message : '无法读取交接文件，请重试。'}${pack ? ' 已保留上一份交接内容。' : ''}`;
    status.dataset.error = 'true';
  };
  async function readSelectedFile() {
    const selected = file.files?.[0]; file.value = '';
    if (!selected || disposed || !dialog.open) return;
    const token = ++epoch; loading = true; status.textContent = '正在读取交接文件…'; status.dataset.error = 'false'; refresh();
    try {
      if (selected.size > MAX_HANDOFF_BYTES) throw new Error('请选择不超过 512 KiB 的交接 JSON 文件。');
      const result = parseHandoff(await selected.text());
      if (disposed || token !== epoch || !dialog.open) return;
      display(result, true); status.textContent = '已打开交接文件；未修改项目或历史成果。';
    } catch (error) { if (!disposed && token === epoch && dialog.open) reportError(error); }
    finally { if (!disposed && token === epoch) { loading = false; refresh(); } }
  }
  function download(format: 'markdown' | 'json') {
    if (!pack || loading) return;
    try {
      if (!downloader.download(exportHandoff(pack, format))) throw new Error('未能发起下载，请稍后重试。');
      status.dataset.error = 'false'; status.textContent = `已发起 ${format === 'json' ? 'JSON' : 'Markdown'} 下载，请在下载目录确认文件。`;
    } catch (error) { reportError(error); }
  }
  openFile.addEventListener('click', () => file.click()); file.addEventListener('change', () => { void readSelectedFile(); });
  markdown.addEventListener('click', () => download('markdown')); json.addEventListener('click', () => download('json'));
  dismiss.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { epoch++; loading = false; trigger?.setAttribute('aria-expanded', 'false'); if (!disposed && trigger?.isConnected) trigger.focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.shiftKey && document.activeElement === dismiss ? done : !event.shiftKey && document.activeElement === done ? dismiss : null;
    if (target) { event.preventDefault(); target.focus(); }
  });
  content.textContent = '尚未打开交接内容。JSON 文件可以重新打开，Markdown 文件适合阅读和分享。'; refresh();
  return {
    open(anchor: HTMLElement, fromReport = false) {
      if (disposed || dialog.open || (fromReport && options.isBusy())) return;
      trigger = anchor; status.textContent = ''; status.dataset.error = 'false'; refresh();
      if (fromReport) {
        try { display(createHandoff(options.getArtifact()), false); }
        catch (error) { reportError(error); }
      }
      dialog.showModal(); anchor.setAttribute('aria-expanded', 'true'); dismiss.focus();
    },
    refresh,
    destroy() { disposed = true; epoch++; downloader.dispose(); dialog.remove(); },
  };
}
