import { validateAgentResult } from '../agent-contract.js';
import { STAGES } from '../stages.js';
import { validateGuideResult } from '../guide-contract.js';
import { formatRuleActions } from '../guide-artifact.js';
import { validateDemoResult } from '../demo-result.js';
import { getReviewPresentation, getToolPresentation, getToolPhase, getToolOutputPresentation, getRunPresentation, formatTraceLabel } from './presentation.js';
import { createIcon } from './icons.js';
import { renderMessageText } from './message-markdown.js';

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(doc, label, name, messageId) {
  const node = element(doc, 'button', 'message-action', label);
  node.type = 'button';
  node.dataset.action = name;
  node.dataset.messageId = messageId;
  return node;
}
// Tool cards expose one of three visual phases plus why they settled.
function applyToolPhase(card, state) {
  const { phase, settle } = getToolPhase(state);
  card.dataset.toolPhase = phase;
  card.dataset.settle = settle;
}
function toolIndicator(doc, state) {
  const iconName = { success: 'check', fail: 'circle-alert', canceled: 'square' }[state];
  if (iconName) return createIcon(doc, iconName, 'tool-details__icon');
  const pulse = element(doc, 'span', 'tool-details__pulse');
  pulse.setAttribute('aria-hidden', 'true');
  return pulse;
}
function badge(doc, presentation) {
  const node = element(doc, 'span', 'component-status', presentation.label);
  node.dataset.tone = presentation.tone;
  return node;
}
export function updateMessageText(host, value) {
  renderMessageText(host, value);
}

export function updateMessageState(article, message) {
  const state = message.status || 'complete';
  const busy = state === 'working' || state === 'streaming';
  article.dataset.state = state;
  article.className = `msg ${message.role === 'user' ? 'msg--user' : 'msg--agent'} msg--${state}`;
  article.querySelector('.msg__parts')?.setAttribute('aria-busy', String(busy));
  const progress = article.querySelector('.message-progress');
  if (progress) {
    progress.hidden = !busy;
    progress.querySelector('span').textContent = state === 'working' ? '正在准备…' : '正在生成…';
  }
}

export function createToolCard(doc, tool, context = {}) {
  if (tool.kind === 'project') return createProjectToolCard(doc, tool, context);
  const imported = tool.provenance === 'imported' || context.provenance === 'imported';
  const view = imported ? { label: `历史记录：${getToolPresentation(tool.state).label} · 未核验`, tone: 'neutral' } : getToolPresentation(tool.state);
  const card = element(doc, 'details', 'tool-details');
  card.dataset.component = 'tool';
  card.dataset.toolState = tool.state;
  card.dataset.state = tool.state;
  applyToolPhase(card, tool.state);
  card.open = tool.state === 'fail';
  const header = element(doc, 'summary', 'tool-details__header');
  header.append(toolIndicator(doc, tool.state));
  header.append(element(doc, 'span', 'tool-details__title', tool.label), badge(doc, view));
  const body = element(doc, 'div', 'tool-details__body');
  body.append(element(doc, 'p', 'tool-identity', imported ? '导入历史 · 工具输出未在本机核验' : `${tool.name || 'demo_preflight'} · ${tool.kind === 'guide' ? '本机已收录规则 · 未扫描项目' : '只读本地演示'}`));
  const raw = element(doc, 'details', 'tool-details__raw');
  raw.dataset.component = 'tool-raw';
  raw.append(element(doc, 'summary', '', '原始数据'));
  const input = element(doc, 'section', 'tool-details__input');
  input.setAttribute('aria-label', '工具参数');
  const code = element(doc, 'code', 'tool-parameters', JSON.stringify(tool.parameters || {}, null, 2));
  const pre = element(doc, 'pre');
  pre.append(code);
  input.append(element(doc, 'strong', 'component-caption', '输入参数'), pre);
  const outputView = getToolOutputPresentation(tool.state, { ...context, kind: tool.kind });
  const output = element(doc, 'section', 'tool-details__output');
  output.dataset.outputKind = outputView.kind;
  output.setAttribute('aria-label', '工具结果');
  output.append(element(doc, 'strong', 'component-caption', '工具结果'));
  if (outputView.kind === 'result') {
    const counts = context.result.counts;
    output.append(element(doc, 'p', 'tool-output-message', tool.kind === 'guide' ? '清单已生成；工具成功不代表合规通过，仍需人工核对。' : `示例检查完成：${counts.warning} 项提醒，${counts.info} 项说明。未扫描真实项目。`));
    const resultPre = element(doc, 'pre', 'tool-result-json');
    resultPre.tabIndex = 0;
    resultPre.setAttribute('role', 'region');
    resultPre.setAttribute('aria-label', imported ? '导入的工具结果，仅校验格式，可滚动' : '已校验的工具结果，可滚动');
    resultPre.append(element(doc, 'code', '', outputView.text));
    raw.append(resultPre);
  } else {
    output.append(element(doc, 'p', 'tool-output-message', outputView.text));
    if (outputView.code) output.append(element(doc, 'code', 'tool-error-code', outputView.code));
  }
  raw.append(input);
  body.append(output);
  if (tool.summary?.length) {
    const summary = element(doc, 'section', 'tool-details__summary');
    summary.setAttribute('aria-label', '公开执行摘要');
    const items = element(doc, 'ul');
    for (const line of tool.summary) items.append(element(doc, 'li', '', line));
    summary.append(element(doc, 'strong', 'component-caption', '执行摘要'), items);
    body.append(summary);
  }
  body.append(raw);
  card.append(header, body);
  return card;
}

function createProjectToolCard(doc, tool, context) {
  const imported = tool.provenance === 'imported' || context.provenance === 'imported';
  const card = element(doc, 'details', 'tool-details');
  card.dataset.component = `project-tool-${tool.toolCallId}`;
  card.dataset.toolState = tool.state; card.dataset.state = tool.state;
  applyToolPhase(card, tool.state);
  card.open = tool.state === 'fail';
  const header = element(doc, 'summary', 'tool-details__header');
  header.append(toolIndicator(doc, tool.state));
  header.append(element(doc, 'span', 'tool-details__title', tool.label), badge(doc, imported ? { label: `历史记录：${getToolPresentation(tool.state).label} · 未核验`, tone: 'neutral' } : tool.state === 'running' ? { label: '请求本机执行', tone: 'neutral' } : getToolPresentation(tool.state)));
  const body = element(doc, 'div', 'tool-details__body');
  body.append(element(doc, 'p', 'tool-identity', imported ? '导入历史 · 尚未核验本机报告' : '项目只读工具 · 打开报告前将核验本机记录'));
  const result = context.result;
  if (tool.state === 'success' && validateAgentResult(result).ok) {
    body.append(element(doc, 'strong', '', result.title), element(doc, 'p', 'tool-output-message', result.summary));
    body.append(element(doc, 'p', 'component-caption', `共 ${result.itemCount} 项${result.truncated ? ' · 当前展示部分摘要' : ''} · 项目版本 ${result.projectRevision} · 事实版本 ${result.contextRevision}`));
    if (result.scopeComplete === false) body.append(element(doc, 'p', 'component-caption', '本次扫描范围不完整，请在报告中核对限制。'));
    const items = element(doc, 'ul', 'structured-result__issues');
    for (const item of result.items) {
      const row = element(doc, 'li', 'structured-result__issue');
      row.append(element(doc, 'span', '', `${item.ruleId} · ${item.title}`));
      if (item.sourceUrl) {
        const link = element(doc, 'a', '', '来源'); link.href = item.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link);
      }
      items.append(row);
    }
    body.append(items);
    const open = action(doc, '查找并核验本机报告', 'open-artifact', context.messageId || '');
    open.dataset.artifactId = result.artifactId; body.append(open);
    body.append(element(doc, 'p', 'component-caption', imported ? '以上为备份中的历史摘要，不证明本机已执行或报告仍存在。会话备份不包含完整本机成果；如无法找到，请在原设备导出报告，或关联项目后重新检查。' : '以上为工具返回的摘要；本机成果关联将在打开时核验，不能替代人工核对。'));
  } else body.append(element(doc, 'p', 'tool-output-message', context.error?.message || (tool.state === 'canceled' ? '已停止；未完成的工具不会自动重试。' : tool.state === 'fail' ? '工具未完成，请查看执行错误。' : '等待本机工具返回结果…')));
  card.append(header, body); return card;
}

export function createResultCard(doc, result) {
  if (!validateDemoResult(result).ok) throw new Error('Cannot render an invalid demo result');
  const card = element(doc, 'section', 'structured-result');
  card.dataset.component = 'result';
  card.dataset.simulation = 'true';
  card.setAttribute('aria-label', '预检结果示例');
  const head = element(doc, 'div', 'structured-result__head');
  head.append(element(doc, 'strong', '', '预检结果示例'), element(doc, 'span', 'component-caption', '非项目扫描'));
  card.append(head, element(doc, 'p', 'structured-result__counts', `个人主体 · ${result.counts.warning} 项待核对 · ${result.counts.info} 项说明`));
  const issues = element(doc, 'ul', 'structured-result__issues');
  for (const issue of result.issues) {
    const item = element(doc, 'li', 'structured-result__issue');
    item.dataset.severity = issue.severity;
    const copy = element(doc, 'div', 'structured-result__copy');
    copy.append(element(doc, 'span', 'structured-result__title', issue.title), element(doc, 'small', '', `${issue.ruleId} · 示例文件 ${issue.file}`));
    item.append(badge(doc, { label: issue.severity === 'warning' ? '提醒' : '说明', tone: issue.severity === 'warning' ? 'warning' : 'neutral' }), copy);
    issues.append(item);
  }
  card.append(issues);
  card.append(element(doc, 'p', 'structured-result__next', '下一步：核对涉及的接口与用途，再审阅改动建议。'));
  return card;
}

const guideViews = new WeakMap();
export function getGuideViewState(card) {
  const view = guideViews.get(card);
  if (!view) return null;
  return { query: view.query, disclosures: view.stages.map(({ detail }) => ({ component: detail.dataset.component, open: view.query.trim() ? view.baseline.get(detail.dataset.component) === true : detail.open === true })) };
}
export function updateGuideFilter(card, query) {
  const view = guideViews.get(card);
  if (!view) return;
  const next = typeof query === 'string' ? query.slice(0, 200) : '';
  if (!view.query.trim() && next.trim()) view.baseline = new Map(view.stages.map(({ detail }) => [detail.dataset.component, detail.open === true]));
  const needle = next.trim().toLocaleLowerCase();
  let count = 0;
  for (const { detail, rows } of view.stages) {
    let matches = 0;
    for (const { row, text } of rows) { row.hidden = Boolean(needle) && !text.includes(needle); if (!row.hidden) matches++; }
    detail.hidden = matches === 0;
    count += matches;
    if (needle) detail.open = matches > 0;
    else if (view.query.trim()) detail.open = view.baseline.get(detail.dataset.component) === true;
  }
  view.query = next;
  if (view.input.value !== next) view.input.value = next;
  view.status.textContent = needle ? `找到 ${count} 项，共 ${view.total} 项` : `共 ${view.total} 项`;
  view.empty.hidden = count > 0;
}
export function restoreGuideViewState(card, saved) {
  const view = guideViews.get(card);
  if (!view || !saved || typeof saved !== 'object') return;
  const disclosures = new Map((Array.isArray(saved.disclosures) ? saved.disclosures : []).filter(item => item && typeof item.component === 'string' && typeof item.open === 'boolean').map(item => [item.component, item.open]));
  view.query = '';
  for (const { detail } of view.stages) detail.open = disclosures.get(detail.dataset.component) === true;
  updateGuideFilter(card, saved.query);
}
export function createGuideResultCard(doc, result, context = {}) {
  if (!validateGuideResult(result).ok) throw new Error('Cannot render an invalid guide result');
  const card = element(doc, 'section', 'structured-result guide-result');
  card.dataset.component = 'guide-result';
  card.dataset.messageId = context.messageId || '';
  const view = { query: '', stages: [], baseline: new Map(), total: result.items.length + result.selfCheck.length };
  guideViews.set(card, view);
  const imported = context.provenance === 'imported';
  card.setAttribute('aria-label', imported ? '导入历史上线清单' : '本机规则上线清单');
  card.append(element(doc, 'h3', '', '上线清单'), element(doc, 'p', '', imported ? '本清单来自外部会话备份；规则内容、来源和执行情况未在本机核验，不证明使用了本机当前规则，不代表合规通过。' : '根据本机已收录规则整理；未扫描项目、未调用模型、未实时核验，不代表合规通过。'));
  const toolbar = element(doc, 'div', 'guide-result__actions');
  toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', '完整清单操作');
  for (const [label, name] of [['复制完整清单', 'copy-guide'], ['下载 Markdown', 'download-guide-markdown'], ['导出 JSON', 'download-guide-json']]) toolbar.append(action(doc, label, name, context.messageId || ''));
  const search = element(doc, 'label', 'guide-result__search', '搜索清单');
  view.input = element(doc, 'input'); view.input.type = 'search'; view.input.maxLength = 200; view.input.value = ''; view.input.dataset.guideSearch = ''; view.input.dataset.messageId = context.messageId || ''; search.append(view.input);
  view.status = element(doc, 'p', 'component-caption'); view.status.setAttribute('role', 'status'); view.status.setAttribute('aria-live', 'polite');
  view.empty = element(doc, 'p', 'guide-result__empty', '没有匹配条目，请尝试其他关键词。');
  card.append(toolbar, element(doc, 'p', 'component-caption', '搜索仅影响显示；复制和下载始终导出完整清单。'), search, view.status, view.empty);
  for (const [label, items] of [['适用规则', result.items], ['条件待确认', result.selfCheck]]) {
    const section = element(doc, 'section', 'guide-result__section');
    section.append(element(doc, 'h4', '', `${label} · ${items.length} 项`));
    if (label === '条件待确认') section.append(element(doc, 'p', 'component-caption', '请先确认是否适用；这些条目不计为已确认阻断。'));
    if (!items.length) section.append(element(doc, 'p', 'component-caption', '此分组没有条目。'));
    const stages = new Map();
    for (const item of items) {
      if (!stages.has(item.stage)) stages.set(item.stage, []);
      stages.get(item.stage).push(item);
    }
    for (const [stage, entries] of stages) {
      const detail = element(doc, 'details', 'guide-result__stage');
      const stageTitle = STAGES.find(entry => entry.id === stage)?.title || stage;
      detail.dataset.component = `guide-${label === '适用规则' ? 'applicable' : 'conditional'}-${stage}`;
      const stageView = { detail, rows: [] }; view.stages.push(stageView);
      detail.append(element(doc, 'summary', '', `${stageTitle} · ${entries.length} 项`));
      const list = element(doc, 'ul', 'guide-result__items');
      for (const item of entries) {
        const row = element(doc, 'li', 'guide-result__item');
        stageView.rows.push({ row, text: [item.title, item.ruleId, stageTitle, item.why, item.warn, item.note, ...item.requires, item.source_quote].filter(Boolean).join(' ').toLocaleLowerCase() });
        row.append(element(doc, 'strong', '', item.title), element(doc, 'small', 'component-caption', `${item.ruleId} · 操作类型：${formatRuleActions(item)}`));
        for (const value of [item.why, item.warn, item.note]) if (value) row.append(element(doc, 'p', '', value));
        const requirements = element(doc, 'ul');
        for (const requirement of item.requires) requirements.append(element(doc, 'li', '', requirement));
        if (item.requires.length) row.append(element(doc, 'span', 'component-caption', '要求'), requirements);
        if (item.source_quote) row.append(element(doc, 'blockquote', '', item.source_quote));
        if (item.official_url) {
          const link = element(doc, 'a', '', '查看官方来源');
          link.href = item.official_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link);
        } else row.append(element(doc, 'span', 'component-caption', '尚无可展示的官方来源'));
        row.append(element(doc, 'small', 'component-caption', `${imported ? '备份记录的核验日期' : '规则收录的核验日期'}：${item.last_verified || '未记录'} · 非本次实时核验`));
        list.append(row);
      }
      detail.append(list); section.append(detail);
    }
    card.append(section);
  }
  for (const note of result.notes) card.append(element(doc, 'p', 'component-caption', note));
  updateGuideFilter(card, '');
  return card;
}

export function createApprovalCard(doc, review, { messageId = '' } = {}) {
  const view = getReviewPresentation(review.state);
  const card = element(doc, 'section', 'approval-card');
  card.dataset.component = 'approval';
  card.dataset.reviewState = review.state;
  card.dataset.tone = view.tone;
  const header = element(doc, 'div', 'approval-card__header');
  header.append(element(doc, 'strong', '', '本地改动建议'), badge(doc, view));
  card.append(header, element(doc, 'p', '', review.summary || view.summary));
  if (view.canApprove) {
    const actions = element(doc, 'div', 'approval-card__actions');
    actions.append(action(doc, '查看改动', 'open-review', messageId));
    card.append(actions);
  }
  return card;
}

// Process accordion adapted from open-claude-ui ThinkingAccordion (MIT): while the run
// is live it stays open and cannot be collapsed (no viewport jumps); once settled it
// folds back and the user owns the toggle. It lists only public execution steps —
// private model reasoning is intentionally never published to the UI.
const LIVE_RUN_STATES = new Set(['working', 'streaming']);
const TOOL_STATES = new Set(['running', 'success', 'fail', 'canceled']);
export function isLiveRun(state) { return LIVE_RUN_STATES.has(state); }
export function getTraceSteps(message) {
  const live = isLiveRun(message.status);
  const parts = message.parts || (message.tool ? [{ type: 'tool', tool: message.tool }] : []);
  const steps = [{ label: '已接收请求', phase: 'success' }];
  for (const part of parts) {
    if (part.type !== 'tool' || !part.tool || !TOOL_STATES.has(part.tool.state)) continue;
    steps.push({ label: `${part.tool.label || '工具'} · ${getToolPresentation(part.tool.state).label}`, phase: getToolPhase(part.tool.state).phase });
  }
  const hasText = parts.some(part => part.type === 'text' && typeof part.text === 'string' && part.text.trim()) || Boolean(message.text?.trim());
  if (live) steps.push({ label: hasText ? '正在撰写回答' : '正在准备', phase: 'running' });
  else if (hasText) steps.push({ label: '已生成回答', phase: 'success' });
  if (message.status === 'stopped') steps.push({ label: '已停止', phase: 'error' });
  if (message.status === 'error' || message.error) steps.push({ label: '本次执行未完成', phase: 'error' });
  return steps;
}
export function createRunTrace(doc, trace, live, steps = [], imported = false) {
  const card = element(doc, 'details', 'run-trace');
  const running = isLiveRun(trace.state);
  card.dataset.component = 'run-trace';
  card.dataset.state = trace.state;
  card.dataset.tone = getRunPresentation(trace.state).tone;
  card.dataset.live = String(running);
  card.open = running;
  const summary = element(doc, 'summary');
  const indicator = element(doc, 'span', 'run-trace__indicator');
  indicator.setAttribute('aria-hidden', 'true');
  indicator.append(element(doc, 'span'), element(doc, 'span'), element(doc, 'span'));
  summary.append(indicator, element(doc, 'span', 'run-trace__label', formatTraceLabel(trace)), createIcon(doc, 'chevron-right', 'run-trace__chevron'));
  const body = element(doc, 'div', 'run-trace__body');
  if (steps.length) {
    const list = element(doc, 'ol', 'run-trace__steps');
    list.setAttribute('aria-label', '公开执行步骤');
    for (const step of steps) {
      const item = element(doc, 'li', 'run-trace__step', step.label);
      item.dataset.phase = step.phase;
      list.append(item);
    }
    body.append(list);
  }
  card.append(summary, body);
  body.append(element(doc, 'p', 'run-trace__source', `运行 #${trace.runId} · ${imported ? '导入历史 · 未核验' : live ? `真实模型 · ${live.providerId} · ${live.label || live.model}` : trace.kind === 'guide' ? '本机规则工具' : trace.kind === 'model' ? '真实模型' : '本地演示'} · 会话记录，不含可恢复的执行检查点`));
  return card;
}

export function createMessageActions(doc, message, { canRegenerate = false } = {}) {
  function iconAction(label, name) {
    const control = action(doc, '', name, message.id);
    control.setAttribute('aria-label', label);
    control.title = label;
    control.append(createIcon(doc, { copy: 'copy', edit: 'pencil', regenerate: 'rotate-ccw' }[name], 'message-action__icon'));
    return control;
  }
  const actions = element(doc, 'div', 'msg__actions');
  actions.dataset.component = 'message-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', message.role === 'user' ? '用户消息操作' : '回复操作');
  if (message.text) actions.append(iconAction(message.record?.kind === 'report' ? '复制完整报告' : '复制', 'copy'));
  if (message.role === 'user' && !message.guide) actions.append(iconAction('编辑并分支', 'edit'));
  if (!message.record && message.role === 'assistant' && ['complete', 'stopped'].includes(message.status) && canRegenerate) actions.append(iconAction(message.guide ? '重新生成上线清单' : '重新生成', 'regenerate'));
  return actions;
}

export function createMessage(doc, message, { canRegenerate = false } = {}) {
  const article = element(doc, 'article', `msg ${message.role === 'user' ? 'msg--user' : 'msg--agent'} msg--${message.status || 'complete'}`);
  article.dataset.component = 'message';
  article.dataset.messageId = message.id;
  article.dataset.state = message.status || 'complete';
  const imported = message.provenance === 'imported';
  const report = message.record?.kind === 'report';
  const recordLabel = report ? message.record.label.replace(/^桌面工具 · /, '') : message.record?.label;
  article.append(element(doc, 'div', 'msg__meta', imported ? '导入历史 · 内容与工具结果未在本机核验' : message.record ? (report ? `本机工具 · ${recordLabel}` : `你 · ${recordLabel}`) : message.role === 'user' ? '你' : message.guide ? '船友 · 本机规则工具' : message.live ? `真实模型 · ${message.live.providerId} · ${message.live.label || message.live.model}` : '船友 Agent · 本地演示'));
  if (message.branchNote) article.append(element(doc, 'p', 'branch-note', message.branchNote));
  if (report) article.append(createMessageActions(doc, message, { canRegenerate }));
  if (message.role === 'user' && Array.isArray(message.references)) {
    const paths = [...new Set(message.references.filter(path => typeof path === 'string' && path.trim()))];
    if (paths.length) {
      const references = element(doc, 'section', 'message-references');
      references.setAttribute('aria-label', '本次消息的示例引用');
      references.append(element(doc, 'p', 'message-references__caption', '引用的示例路径 · 未读取文件'));
      const list = element(doc, 'ul', 'message-references__list');
      for (const path of paths) list.append(element(doc, 'li', 'message-references__path', path));
      references.append(list);
      article.append(references);
    }
  }
  const parts = element(doc, 'div', 'msg__parts');
  parts.setAttribute('aria-busy', String(['working', 'streaming'].includes(message.status)));
  const content = message.parts || [
    { type: 'text', text: message.text },
    ...(message.tool ? [{ type: 'tool', tool: message.tool, result: message.structuredResult, error: message.error }] : []),
  ];
  content.forEach((part, index) => {
    let node;
    if (part.type === 'text') {
      node = element(doc, 'div', 'msg__text');
      node.dataset.role = message.role;
      node.dataset.messageId = message.id;
      node.dataset.partIndex = String(index);
      updateMessageText(node, part.text);
    } else if (part.type === 'tool') {
      node = createToolCard(doc, part.tool, { result: part.result, error: part.error, messageId: message.id, provenance: message.provenance });
    }
    if (node) {
      node.dataset.partIndex = String(index);
      parts.append(node);
    }
  });
  article.append(parts);
  if (message.role === 'assistant') {
    const progress = element(doc, 'div', 'message-progress');
    progress.setAttribute('aria-hidden', 'true');
    progress.hidden = !['working', 'streaming'].includes(message.status);
    progress.append(element(doc, 'span', '', message.status === 'working' ? '正在准备…' : '正在生成…'));
    article.append(progress);
  }
  if (message.status === 'stopped') article.append(element(doc, 'p', 'branch-note', message.text ? '已停止 · 已保留生成内容' : '已在输出前停止'));
  if (message.status === 'complete' && message.guide && validateGuideResult(message.structuredResult).ok) article.append(createGuideResultCard(doc, message.structuredResult, { messageId: message.id, input: message.guide, provenance: message.provenance }));
  if (!message.guide && message.status === 'complete' && message.structuredResult && validateDemoResult(message.structuredResult).ok) article.append(createResultCard(doc, message.structuredResult));
  if (message.fact) {
    const fact = element(doc, 'details', 'fact-block');
    fact.dataset.component = 'evidence';
    fact.dataset.verification = imported ? 'imported' : 'example';
    fact.append(element(doc, 'summary', '', imported ? '导入历史引用 · 未核验' : message.fact.label || '规则示例'), element(doc, 'p', '', message.fact.text || ''));
    if (typeof message.fact.source === 'string' && /^(?:[a-z0-9-]+\.html)(?:#[a-z0-9_-]+)?$/i.test(message.fact.source)) {
      const source = element(doc, 'a', '', imported ? '查看备份记录的示例链接（未核验）' : '查看规则示例来源');
      source.href = message.fact.source;
      fact.append(source);
    }
    article.append(fact);
  }
  if (message.advice) {
    const advice = element(doc, 'section', 'advice-block');
    advice.dataset.component = 'advice';
    advice.append(element(doc, 'strong', '', '处理建议 · 供你判断'), element(doc, 'p', '', message.advice.text || ''));
    article.append(advice);
  }
  if (message.review) article.append(createApprovalCard(doc, message.review, { messageId: message.id }));
  if (message.error) {
    const error = element(doc, 'div', 'error-card');
    error.dataset.component = 'error';
    error.append(element(doc, 'strong', '', '本次执行未完成'), element(doc, 'p', '', message.error.message));
    if (!message.record && message.error.retryable) error.append(action(doc, '重试本次请求', 'retry', message.id));
    article.append(error);
  }
  if (message.trace) article.append(createRunTrace(doc, { ...message.trace, kind: message.guide ? 'guide' : message.live ? 'model' : message.trace.kind }, message.live, getTraceSteps(message), imported));
  if (!report) article.append(createMessageActions(doc, message, { canRegenerate }));
  return article;
}
