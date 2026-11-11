import { createHandoff, handoffWarnings, formatRuleActions, formatRuleConfidence, type RepairHandoff } from '../design-previews/repair-handoff.js';
import { createActionButton } from '../design-previews/components/ui-kit.js';
import { createIcon } from '../design-previews/components/icons.js';
import { renderMessageText } from '../design-previews/components/message-markdown.js';
import type { Artifact, Project } from './projects';
import type { QuoteRow } from './report-quote-checks';
import './context.css';
import './report-reader.css';

// createHandoff validates these fields before this presentation-only narrowing.
type ReadingItem = { conditional: boolean; rejectSummary: string | null; relevance?: 'direct' | 'possible'; matchEvidence?: { aliases: string[]; codes: string[]; partialAliases: string[] }; rule: { ruleId: string; title: string; severity: 'blocker' | 'warning' | 'info'; why?: string | null; requires: string[]; official_url?: string | null; source_quote?: string | null; last_verified?: string | null; manual_required: boolean; warn?: string | null; note?: string | null; action_categories?: string[]; confidence?: 'high' | 'medium' | 'low' } };
type Options = { openPage?(dialog: HTMLDialogElement, trigger: HTMLElement | null): boolean; getArtifact(): Artifact | null; getProject(): Project | null; getRulesVersion(): string | null; onHandoff?(anchor: HTMLElement): void; onRepair?(anchor: HTMLElement): void; onOpenSource?(url: string): Promise<unknown>; mountQuoteChecks?(rulesVersion: string, rows: QuoteRow[]): () => void; returnFocus?(): HTMLElement | null };

// The export contract intentionally omits run notes and business signals. Validate
// only these additional reading fields; never derive execution state from prose.
function readingContext(artifact: Artifact) {
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const strings = (value: unknown, max = 4096): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(text => typeof text === 'string' && text.length <= max);
  const result = artifact.data?.result;
  if (!record(result) || !record(result.meta) || typeof result.meta.summary !== 'string' || result.meta.summary.length > 8192 || !strings(result.notes)) return null;
  const signals = new Map<string, string[]>();
  let size = result.meta.summary.length + result.notes.join('').length;
  if (artifact.kind === 'guide') {
    if (!Array.isArray(result.selfCheck) || result.selfCheck.length > 500) return null;
    for (const item of result.selfCheck) {
      if (!record(item) || typeof item.ruleId !== 'string' || !strings(item.signal, 2048)) return null;
      signals.set(item.ruleId, [...item.signal]); size += item.signal.join('').length;
    }
  }
  return size <= 120000 ? { summary: result.meta.summary, notes: [...result.notes], signals } : null;
}

export function mountReportReader(options: Options) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', id = '') => {
    const element = document.createElement(tag); element.textContent = text; if (id) element.id = id; return element;
  };
  const dialog = node('dialog', '', 'desktop-report-reader'); dialog.className = 'context-dialog report-reader';
  dialog.setAttribute('aria-labelledby', 'report-reader-title');
  const header = node('header'); header.className = 'context-header';
  const title = node('h2', '报告阅读', 'report-reader-title');
  const button = (label: string, id: string) => { const b = createActionButton(document, label, { appearance: 'plain' }); b.id = id; return b; };
  const dismiss = button('', 'report-reader-dismiss'); dismiss.classList.add('ui-action-icon'); dismiss.setAttribute('aria-label', '关闭报告阅读'); dismiss.append(createIcon(document, 'arrow-left')); header.append(title, dismiss);
  const body = node('div'); body.className = 'report-reader-body';
  const summary = node('div', '', 'report-reader-summary');
  const priority = node('section', '', 'report-reader-priority'); priority.setAttribute('aria-label', '建议先核对');
  const filterStatus = node('p', '', 'report-reader-filter-status');
  filterStatus.setAttribute('role', 'status'); filterStatus.setAttribute('aria-atomic', 'true');
  const provenance = node('p', '', 'report-reader-provenance');
  const versions = node('details', '', 'report-reader-versions'); versions.append(node('summary', '报告标识与版本'));
  const versionText = node('p'); versions.append(versionText);
  const linkStatus = node('p', '', 'report-reader-link-status'); linkStatus.setAttribute('role', 'status'); linkStatus.setAttribute('aria-live', 'polite');
  const warning = node('p', '', 'report-reader-warning'); warning.className = 'report-reader-warning';
  const context = node('section', '', 'report-reader-context'); context.setAttribute('aria-label', '本次报告的范围与限制');
  const layout = node('div'); layout.className = 'report-reader-layout';
  const outline = node('details', '', 'report-reader-outline'); outline.open = true;
  outline.append(node('summary', '报告目录'));
  const nav = node('nav'); nav.setAttribute('aria-label', '报告核对项目录'); outline.append(nav);
  const column = node('div'); column.className = 'report-reader-column';
  const content = node('section', '', 'report-reader-content'); content.setAttribute('aria-label', '报告核对项');
  const original = node('details', '', 'report-reader-original'); original.append(node('summary', '完整原报告'));
  const originalContent = node('div'); originalContent.className = 'report-markdown'; original.append(originalContent);
  column.append(content, original, versions); layout.append(outline, column); body.append(summary, filterStatus, priority, provenance, warning, context, linkStatus, layout);
  const footer = node('footer'); footer.className = 'report-reader-footer';
  const repair = button('检查可用修复', 'report-reader-repair');
  const handoff = button('准备修复交接', 'report-reader-handoff'); footer.append(repair, handoff);
  dialog.append(header, body, footer); document.body.append(dialog);
  let trigger: HTMLElement | null = null, disposed = false, snapshotId: string | null = null, epoch = 0;
  let disposeChecks: (() => void) | undefined;
  const visible = (element: HTMLElement | null | undefined): element is HTMLElement => !!element?.isConnected && element.getClientRects().length > 0;
  function render(artifact = options.getArtifact()) {
    disposeChecks?.(); disposeChecks = undefined;
    snapshotId = artifact?.id ?? null;
    filterStatus.textContent = ''; priority.replaceChildren(); priority.hidden = true;
    summary.replaceChildren(); summary.removeAttribute('role'); summary.removeAttribute('aria-label');
    provenance.textContent = ''; versions.hidden = true; versions.open = false; versionText.textContent = ''; linkStatus.textContent = '';
    warning.removeAttribute('role');
    content.replaceChildren(); nav.replaceChildren(); originalContent.replaceChildren(); context.replaceChildren(); context.hidden = true;
    title.textContent = artifact?.title || '报告阅读'; original.hidden = !artifact; original.open = false; outline.hidden = true;
    handoff.hidden = true; repair.hidden = true;
    warning.textContent = artifact ? artifact.provenance === 'imported' ? '外部导入报告：内容与执行情况未在本机核验，不能作为本机已完成检查的证据。' : '历史快照：打开时读取已保存内容，未重新扫描当前项目。生成报告时官方依据未实时核验，可在每条规则下核对引文。' : '';
    warning.hidden = !artifact;
    if (!artifact) { summary.textContent = '尚未选择已保存报告。'; content.append(node('p', '尚无报告可供阅读。运行项目预检、生成上线清单，或从项目历史打开报告。')); return; }
    renderMessageText(originalContent, artifact.markdown, { copyCode: false });
    let pack: RepairHandoff;
    try { pack = createHandoff(artifact); }
    catch { summary.textContent = '此报告未提供有效的结构化摘要，以下保留完整原文。'; original.open = true; return; }
    const project = options.getProject(), source = pack.source;
    provenance.textContent = `保存于 ${new Date(source.createdAt).toLocaleString('zh-CN', { hour12: false })} · ${source.projectId === null ? '未归属项目' : project?.id === source.projectId ? project.name : `来源项目 ${source.projectId}`}`;
    versions.hidden = false;
    versionText.textContent = `报告 ${source.artifactId} · 执行 ${source.runId}\n项目版本 ${source.projectRevision ?? '未记录'} · 事实版本 ${source.contextRevision ?? '未记录'}\n工具 ${source.toolVersion}\n规则版本 ${source.rulesVersion}`;
    warning.textContent += ` ${handoffWarnings(pack, project, options.getRulesVersion()).join(' ')}`;
    if (pack.scan) warning.textContent += ` 当次扫描 ${pack.scan.filesScanned} 个文件；${pack.scan.complete ? '扫描范围完整不表示覆盖所有规则。' : '扫描不完整，请处理扫描限制后重新预检。'}`;
    const reading = readingContext(artifact);
    if (reading) {
      context.hidden = false; context.append(node('h3', '本次范围与限制'), node('p', reading.summary));
      if (reading.notes.length) { const notes = node('ul'); for (const note of reading.notes) notes.append(node('li', note)); context.append(notes); }
    } else {
      warning.textContent += ' 此报告的范围说明或业务线索未能完整验证，以下摘要仅涵盖已验证条目；完整原报告已展开，请同时阅读其中的限制。';
      original.open = true;
    }
    const items = pack.items as ReadingItem[];
    const labels = { blocker: '阻断', warning: '警告', info: '提示' };
    const rows: { category: keyof typeof labels | 'conditional'; article: HTMLElement; entry: HTMLLIElement; heading: HTMLHeadingElement }[] = [];
    handoff.hidden = !options.onHandoff;
    repair.hidden = !options.onRepair || artifact.kind !== 'check' || artifact.provenance === 'imported' || !artifact.projectId;
    if (!items.length) {
      summary.textContent = '0 个核对项'; outline.hidden = true;
      content.append(node('p', '本次报告没有结构化核对项。这不代表审核通过或项目不存在问题，请确认扫描范围与业务事实。'));
      return;
    }
    outline.hidden = false;
    const list = node('ol'); nav.append(list);
    const quoteRows: QuoteRow[] = [];
    for (const [index, item] of items.entries()) {
      const r = item.rule, article = node('article'); article.dataset.readerItem = String(index); article.className = 'report-reader-item';
      const heading = node('h3', `${index + 1}. ${r.title}`, `reader-item-${index}`); heading.tabIndex = -1;
      const severity = node('p', item.conditional ? '条件自查 · 适用性尚未确认' : labels[r.severity]); severity.className = 'report-reader-meta';
      if (item.conditional) severity.textContent += ` · ${labels[r.severity]}`;
      article.append(heading, severity, node('h4', '为何关注'), node('p', r.why || '未提供具体发现依据，请人工核对适用性。'));
      if (item.conditional) {
        const signal = reading?.signals.get(r.ruleId);
        article.append(node('p', signal?.length ? `业务自查线索：${signal.join('、')}。这些线索不代表已在项目中发现相关功能。` : '业务自查线索未提供或未能验证，请结合完整原报告人工判断适用性。'));
      }
      if (item.rejectSummary) article.append(node('p', `匹配拒因：${item.rejectSummary}`));
      if (item.relevance && item.matchEvidence) article.append(node('p', `${item.relevance === 'direct' ? '直接相关' : '可能相关'} · 匹配依据：${[...item.matchEvidence.aliases, ...item.matchEvidence.codes, ...item.matchEvidence.partialAliases].join('、')}。相关性不表示已确认违规。`));
      article.append(node('p', `操作类型：${formatRuleActions(r)}`));
      article.append(node('h4', '需要核对'));
      const requirements = node('ul'); for (const text of r.requires.length ? r.requires : ['对照官方要求确认适用性与处理方案。']) requirements.append(node('li', text)); article.append(requirements);
      if (r.manual_required) article.append(node('p', '按操作类型处理后核对实际结果，并记录验证依据。'));
      if (r.warn) article.append(node('p', `注意：${r.warn}`));
      if (r.note && r.note !== r.warn) article.append(node('p', `补充核对：${r.note}`));
      if (r.official_url) { const link = node('a', '查看官方依据（在浏览器中打开）'); link.href = r.official_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link); }
      else article.append(node('p', '此项未提供官方链接，请自行核对。'));
      const evidence = node('details'); evidence.className = 'report-reader-evidence'; evidence.append(node('summary', '规则摘录与资料记录'), node('p', `规则编号 ${r.ruleId}`));
      const confidence = formatRuleConfidence(r, source.provenance === 'imported');
      if (confidence) evidence.append(node('p', confidence));
      if (r.source_quote) evidence.append(node('blockquote', r.source_quote));
      evidence.append(node('p', `资料记录日期：${r.last_verified || '未记录'} · 生成报告时未实时核验`));
      if (options.mountQuoteChecks) {
        const status = node('span', '读取核验记录…'), detail = node('span');
        const feedback = node('div'); feedback.className = 'report-quote-status'; feedback.setAttribute('role', 'status'); feedback.append(status, detail);
        const button = node('button', '在线核验引文'); button.type = 'button'; button.hidden = true;
        button.setAttribute('aria-label', `在线核验引文 · ${r.title}`);
        const panel = node('div'); panel.className = 'report-quote-check'; panel.append(feedback, button); article.append(panel);
        quoteRows.push({ query: { ruleId: r.ruleId, url: r.official_url ?? '', quote: r.source_quote ?? '' }, status, detail, button });
      }
      article.append(evidence); content.append(article);
      const entry = node('li'), link = node('a', r.title); link.href = `#${heading.id}`;
      link.addEventListener('click', event => { event.preventDefault(); heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start', behavior: 'instant' }); }); entry.append(link); list.append(entry);
      rows.push({ category: item.conditional ? 'conditional' : r.severity, article, entry, heading });
    }

    disposeChecks = options.mountQuoteChecks?.(source.rulesVersion, quoteRows);

    summary.setAttribute('role', 'group'); summary.setAttribute('aria-label', '筛选报告核对项');
    const filters: HTMLButtonElement[] = [];
    for (const [key, label] of Object.entries({ all: '全部', ...labels, conditional: '条件自查' })) {
      const count = key === 'all' ? rows.length : rows.filter(row => row.category === key).length;
      if (!count) continue;
      const filter = node('button', `${label} ${count}`);
      filter.type = 'button'; filter.dataset.readerFilter = key;
      filter.setAttribute('aria-pressed', String(key === 'all'));
      filter.setAttribute('aria-controls', 'report-reader-content report-reader-outline');
      filter.addEventListener('click', () => selectFilter(key, label, count));
      filters.push(filter); summary.append(filter);
    }
    function selectFilter(key: string, label: string, count: number) {
      for (const control of filters) control.setAttribute('aria-pressed', String(control.dataset.readerFilter === key));
      for (const row of rows) {
        const hidden = key !== 'all' && row.category !== key;
        row.article.hidden = hidden; row.entry.hidden = hidden;
      }
      filterStatus.textContent = key === 'all' ? `已显示全部 ${rows.length} 项` : `显示${label} ${count} 项，共 ${rows.length} 项`;
      outline.scrollTop = 0;
    }
    const first = ['blocker', 'warning', 'info'].map(severity => items.findIndex(item => !item.conditional && item.rule.severity === severity)).find(index => index >= 0) ?? 0;
    const item = items[first], rule = item.rule;
    priority.hidden = false;
    priority.append(node('h3', item.conditional ? '先判断是否适用' : '建议先核对'), node('p', rule.title));
    priority.append(node('p', item.conditional ? '这是条件自查项，请先核对业务线索，再决定是否处理相关要求。' : rule.requires[0] || '对照官方要求确认适用性与处理方案。'));
    const jump = node('button', '查看核对要求'); jump.type = 'button'; jump.setAttribute('aria-controls', rows[first].heading.id);
    jump.addEventListener('click', () => {
      if (disposed || !dialog.open) return;
      selectFilter('all', '全部', rows.length);
      const heading = rows[first].heading; heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    priority.append(jump);
  }
  function close() { if (dialog.open) dialog.close(); }
  body.addEventListener('click', event => {
    if (!options.onOpenSource || !dialog.open || disposed || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    const link = target?.closest<HTMLAnchorElement>('a[href]');
    if (!link || !body.contains(link)) return;
    const href = link.getAttribute('href');
    if (!href || !/^https?:\/\//i.test(href)) return;
    let url: URL;
    try { url = new URL(href); } catch { return; }
    if (url.username || url.password || !url.hostname) { event.preventDefault(); return; }
    event.preventDefault(); const token = epoch; linkStatus.textContent = '';
    void Promise.resolve().then(() => {
      if (!disposed && dialog.open && epoch === token) return options.onOpenSource!(url.href);
    }).catch(() => {
      if (!disposed && dialog.open && epoch === token) linkStatus.textContent = '无法打开外部页面，请检查系统默认浏览器后再次点击该链接重试。';
    });
  });
  dismiss.addEventListener('click', close);
  repair.addEventListener('click', () => {
    if (!dialog.open || repair.hidden || disposed) return;
    if (options.getArtifact()?.id !== snapshotId) {
      warning.textContent = '当前选中的报告已经变化，请重新打开本机预检报告再检查可用修复。';
      warning.hidden = false; warning.setAttribute('role', 'status'); warning.tabIndex = -1; warning.focus(); return;
    }
    options.onRepair?.(repair);
  });
  handoff.addEventListener('click', () => {
    if (!dialog.open || handoff.hidden || disposed) return;
    if (options.getArtifact()?.id !== snapshotId) {
      warning.textContent = '当前选中的报告已经变化。此处仍保留打开时的阅读快照；请关闭并重新打开最新报告后准备修复交接。';
      warning.hidden = false; warning.setAttribute('role', 'status'); warning.tabIndex = -1;
      warning.focus({ preventScroll: true }); warning.scrollIntoView({ block: 'start', behavior: 'instant' }); return;
    }
    options.onHandoff?.(handoff);
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    disposeChecks?.(); disposeChecks = undefined;
    epoch++;
    trigger?.setAttribute('aria-expanded', 'false');
    if (disposed) return;
    const target = visible(trigger) ? trigger : options.returnFocus?.(); if (!options.openPage && visible(target)) target.focus();
  });
  return {
    open(anchor: HTMLElement | null) {
      if (disposed || dialog.open) return;
      epoch++; trigger = anchor; render(); if (options.openPage) { if (!options.openPage(dialog, anchor)) return; } else dialog.showModal();
      // A hidden dialog has no scroll box: reset after it participates in layout.
      body.scrollTop = 0; outline.scrollTop = 0;
      trigger?.setAttribute('aria-expanded', 'true'); dismiss.focus();
    },
    showRecheck(artifact: Artifact) {
      if (!dialog.open || disposed || options.getArtifact()?.id !== artifact.id) return;
      epoch++;
      render(artifact);
      body.scrollTop = 0; outline.scrollTop = 0;
    },
    close, element: dialog, canClose: () => true,
    destroy() { disposed = true; epoch++; disposeChecks?.(); disposeChecks = undefined; trigger?.setAttribute('aria-expanded', 'false'); dialog.remove(); },
  };
}
