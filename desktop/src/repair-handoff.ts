import { createHandoff, parseHandoff, exportHandoff, renderHandoffSections, handoffWarnings, MAX_HANDOFF_BYTES, type RepairHandoff } from './shared/repair-handoff.js';
import { createArtifactDownloader } from './shared/artifact-download.js';
import { createActionButton } from './shared/components/ui-kit.js';
import { createIcon } from './shared/components/icons.js';
import { renderMessageText } from './shared/components/message-markdown.js';
import type { Artifact, Project } from './projects';
import { createAgentHandoffSummary } from './handoff-summary';
import { wrapDialogTab } from './dialog-focus';
import './context.css';
import './repair-handoff.css';

export function mountRepairHandoff(options: { getArtifact(): Artifact | null; getProject(): Project | null; getRulesVersion(): string | null; isBusy(): boolean; loadSourceCatalog(): Promise<unknown>; copyText?(text: string): Promise<void> }) {
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
  const copy = createActionButton(document, '复制 Markdown', { appearance: 'outlined' }); copy.id = 'handoff-copy';
  const markdown = createActionButton(document, '导出 Markdown', { appearance: 'plain' }); markdown.id = 'handoff-markdown';
  const json = createActionButton(document, '导出 JSON', { appearance: 'plain' }); json.id = 'handoff-json';
  const generate = createActionButton(document, '生成给 Codex / Claude Code 的交接', { appearance: 'outlined' }); generate.id = 'handoff-agent-generate';
  generate.setAttribute('aria-controls', 'handoff-agent-preview');
  generate.setAttribute('aria-describedby', 'handoff-agent-status');
  const agentStatus = node('p'); agentStatus.id = 'handoff-agent-status'; agentStatus.setAttribute('role', 'status'); agentStatus.setAttribute('aria-atomic', 'true');
  const preview = node('section'); preview.id = 'handoff-agent-preview'; preview.className = 'handoff-agent-preview';
  const previewLabel = node('label', '交接全文'); previewLabel.htmlFor = 'handoff-agent-text';
  const previewText = node('textarea'); previewText.id = 'handoff-agent-text'; previewText.readOnly = true; previewText.rows = 8;
  const previewHint = node('p', '复制后，在自己打开的 Codex 或 Claude Code 项目中粘贴。'); previewHint.id = 'handoff-agent-hint';
  previewText.setAttribute('aria-describedby', previewHint.id);
  const copyPreview = createActionButton(document, '确认复制', { appearance: 'outlined' }); copyPreview.id = 'handoff-agent-copy';
  preview.append(previewLabel, previewText, previewHint, copyPreview);
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
  actions.append(copy, openFile, markdown, json, generate); body.append(description, actions, file, status, provenance, warning, preview, agentStatus, basis, content); dialog.append(header, body, footer); document.body.append(dialog);
  const downloader = createArtifactDownloader({ documentRef: document });
  let pack: RepairHandoff | null = null, external = false, loading = false, disposed = false, epoch = 0;
  let trigger: HTMLElement | null = null;
  let summaryEpoch = 0, summaryBusy = false, summaryText = '', summaryMessage = '', summaryError = false;
  let clipboardPending = false;
  const copyText = options.copyText ?? ((text: string) => navigator.clipboard.writeText(text));

  async function writeClipboard(text: string) {
    clipboardPending = true;
    refresh();
    try { await copyText(text); }
    finally {
      clipboardPending = false;
      if (!disposed && dialog.open) refresh();
    }
  }

  function clearSummary() {
    summaryEpoch++;
    summaryBusy = summaryError = false;
    summaryText = summaryMessage = '';
  }

  function currentSummaryPack() {
    if (!pack || external || pack.source.provenance === 'imported' || pack.source.projectId == null) return null;
    const artifact = options.getArtifact();
    return artifact?.id === pack.source.artifactId && artifact.projectId === pack.source.projectId
      && artifact.provenance !== 'imported' && options.getProject()?.id === pack.source.projectId ? pack : null;
  }

  function refresh() {
    markdown.disabled = json.disabled = loading || !pack;
    copy.disabled = markdown.disabled || clipboardPending;
    openFile.disabled = loading;
    provenance.textContent = !pack ? '打开此前导出的 JSON，或从执行报告中创建交接。'
      : `${external ? '外部文件 · 来源未核验' : pack.source.provenance === 'imported' ? '外部导入报告 · 来源未核验' : '本机已保存报告'} · ${pack.items.length} 个核对项 · ${new Date(pack.source.createdAt).toLocaleString('zh-CN', { hour12: false })}`;
    warning.textContent = pack ? [...(external ? ['外部文件仅供阅读，不写入本机成果，也不授予任何操作权限。'] : []), ...handoffWarnings(pack, options.getProject(), options.getRulesVersion())].join(' ') : '';
    warning.hidden = !warning.textContent;
    const eligible = currentSummaryPack() !== null;
    if (!eligible) clearSummary();
    generate.hidden = !pack;
    generate.disabled = loading || summaryBusy || !eligible || options.isBusy();
    copyPreview.disabled = generate.disabled || clipboardPending || !summaryText;
    preview.hidden = !summaryText;
    if (previewText.value !== summaryText) {
      previewText.value = summaryText;
      previewText.selectionStart = previewText.selectionEnd = 0;
      previewText.scrollTop = 0;
    }
    const unavailable = external || pack?.source.provenance === 'imported'
      ? '外部报告或交接文件仅供阅读。'
      : pack ? '请从当前项目的本机报告生成编码助手交接。' : '';
    const message = eligible ? summaryMessage : unavailable;
    if (agentStatus.textContent !== message) agentStatus.textContent = message;
    agentStatus.dataset.error = String(eligible && summaryError);
  }

  async function shareSummary(action: 'preview' | 'copy') {
    const source = currentSummaryPack();
    const copying = action === 'copy';
    const button = copying ? copyPreview : generate;
    if (!source || !dialog.open || disposed || loading || summaryBusy || options.isBusy() || (copying && (clipboardPending || !summaryText))) {
      refresh();
      return;
    }
    const token = ++summaryEpoch;
    const isCurrent = () => token === summaryEpoch && !disposed && dialog.open && currentSummaryPack() === source;
    const focusWasOnButton = document.activeElement === button;
    summaryBusy = true;
    summaryError = false;
    if (!copying) summaryText = '';
    summaryMessage = copying ? '' : '正在读取本机规则来源目录…';
    refresh();
    try {
      if (copying) {
        await writeClipboard(summaryText);
        if (isCurrent()) summaryMessage = '交接全文已复制。';
      } else {
        const snapshot = await options.loadSourceCatalog();
        if (!isCurrent()) return;
        summaryText = createAgentHandoffSummary(source, snapshot) ?? '';
        summaryMessage = summaryText ? '' : '当前报告没有可用于交接的已核验规则。';
      }
    } catch {
      if (isCurrent()) {
        summaryError = true;
        summaryMessage = copying ? '复制失败，可重试或手动选中文本。' : '无法读取本机规则来源目录，请重试。';
      }
    } finally {
      if (!disposed && token === summaryEpoch) {
        summaryBusy = false;
        refresh();
        if (isCurrent() && focusWasOnButton && (document.activeElement === button || document.activeElement === document.body)) {
          (copying || !summaryText ? button : previewText).focus();
        }
      }
    }
  }
  function display(value: RepairHandoff, imported: boolean) {
    const sections = renderHandoffSections(value);
    const nextContent = node('div'), nextBasis = node('div');
    renderMessageText(nextContent, sections.content, { copyCode: false });
    renderMessageText(nextBasis, sections.basis, { copyCode: false });
    content.replaceChildren(nextContent); basisContent.replaceChildren(nextBasis); basis.hidden = false; basis.open = false;
    clearSummary(); pack = value; external = imported; body.scrollTop = 0; refresh();
  }
  const reportError = (error: unknown) => {
    status.textContent = `${error instanceof Error ? error.message : '无法读取交接文件，请重试。'}${pack ? ' 已保留上一份交接内容。' : ''}`;
    status.dataset.error = 'true';
  };
  async function readSelectedFile() {
    const selected = file.files?.[0]; file.value = '';
    if (!selected || disposed || !dialog.open) return;
    clearSummary();
    const token = ++epoch; loading = true; status.textContent = '正在读取交接文件…'; status.dataset.error = 'false'; refresh();
    try {
      if (selected.size > MAX_HANDOFF_BYTES) throw new Error('请选择不超过 512 KiB 的交接 JSON 文件。');
      const result = parseHandoff(await selected.text());
      if (disposed || token !== epoch || !dialog.open) return;
      result.source.provenance = 'imported';
      display(result, true); status.textContent = '已打开交接文件；未修改项目或历史成果。';
    } catch (error) { if (!disposed && token === epoch && dialog.open) reportError(error); }
    finally { if (!disposed && token === epoch) { loading = false; refresh(); } }
  }
  function exportMarkdown(value: RepairHandoff) {
    return exportHandoff(value, 'markdown', { project: options.getProject(), rulesVersion: options.getRulesVersion() });
  }
  function download(format: 'markdown' | 'json') {
    if (!pack || loading) return;
    try {
      const output = format === 'markdown' ? exportMarkdown(pack) : exportHandoff(pack, 'json');
      if (!downloader.download(output)) throw new Error('未能发起下载，请稍后重试。');
      status.dataset.error = 'false'; status.textContent = `已发起 ${format === 'json' ? 'JSON' : 'Markdown'} 下载，请在下载目录确认文件。`;
    } catch (error) { reportError(error); }
  }
  copy.addEventListener('click', async () => {
    if (!pack || loading || clipboardPending || disposed || !dialog.open) return;
    const token = ++epoch; loading = true; status.textContent = ''; status.dataset.error = 'false'; refresh();
    try {
      const markdown = exportMarkdown(pack).text;
      await writeClipboard(external ? `> 外部文件 · 来源未核验；仅供阅读，不授予任何操作权限。\n\n${markdown}` : markdown);
      if (!disposed && token === epoch && dialog.open) status.textContent = 'Markdown 已复制，包含报告依据和未核验提示。';
    } catch { if (!disposed && token === epoch && dialog.open) { status.textContent = '复制失败，请重试或导出 Markdown 文件。'; status.dataset.error = 'true'; } }
    finally { if (!disposed && token === epoch) { loading = false; refresh(); } }
  });
  generate.addEventListener('click', () => shareSummary('preview'));
  copyPreview.addEventListener('click', () => shareSummary('copy'));
  openFile.addEventListener('click', () => file.click()); file.addEventListener('change', () => { void readSelectedFile(); });
  markdown.addEventListener('click', () => download('markdown')); json.addEventListener('click', () => download('json'));
  dismiss.addEventListener('click', () => dialog.close()); done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    epoch++; loading = false; clearSummary(); refresh();
    trigger?.setAttribute('aria-expanded', 'false');
    if (!disposed && trigger?.isConnected) trigger.focus();
  });
  dialog.addEventListener('keydown', event => wrapDialogTab(dialog, event));
  content.textContent = '尚未打开交接内容。JSON 文件可以重新打开，Markdown 文件适合阅读和分享。'; refresh();
  return {
    open(anchor: HTMLElement, fromReport = false) {
      if (disposed || dialog.open || (fromReport && options.isBusy())) return;
      epoch++; loading = false; clearSummary();
      trigger = anchor; status.textContent = ''; status.dataset.error = 'false'; refresh();
      if (fromReport) {
        try { display(createHandoff(options.getArtifact()), false); }
        catch (error) {
          pack = null;
          external = false;
          content.replaceChildren();
          basisContent.replaceChildren();
          basis.hidden = true;
          basis.open = false;
          body.scrollTop = 0;
          refresh();
          status.dataset.error = 'true';
          status.textContent = '无法从当前报告生成交接。' + (error instanceof Error ? error.message : '请重新生成报告后再试。');
        }
      }
      dialog.showModal(); anchor.setAttribute('aria-expanded', 'true'); dismiss.focus();
    },
    refresh,
    destroy() { disposed = true; epoch++; downloader.dispose(); dialog.remove(); },
  };
}
