// @ts-check
import { isExplainAbort, queryExplain } from './explain-transport.js';
import { isExplainResult, validateExplainInput } from './explain-contract.js';
import { createIcon } from './components/icons.js';
import { createExplainArtifact } from './explain-artifact.js';
import { formatRuleActions, formatRuleConfidence } from './guide-artifact.js';
import { createArtifactDownloader } from './artifact-download.js';

export const REJECTION_SAMPLE = '您的小程序使用了地理位置接口，但未在《用户隐私保护指引》中声明收集"位置信息"的相关条款，请补充后重新提交。';

/** @typedef {'preflight' | 'materials'} ExplainFollowUp */
/** @typedef {import('./explain-contract.js').ExplainResult} ExplainResult */
/** @typedef {import('./explain-contract.js').ExplainItem} ExplainItem */
/** @typedef {import('./explain-transport.js').ExplainRequest} ExplainRequest */
/** @typedef {ReturnType<typeof createExplainArtifact>} ExplainArtifact */
/** @typedef {'idle' | 'invalid' | 'running' | 'stopped' | 'error' | 'matched' | 'empty'} ExplainStatus */
/** @typedef {{ key: ExplainFollowUp | 'edit'; label: string; activate: () => void }} FollowUpControl */
/** @typedef {{ key: string; label: string; accepts: (item: ExplainItem) => boolean }} ResultFilter */
/** @typedef {HTMLElement & { disabled: boolean }} ExplainButton */
/**
 * @typedef {{ rjInput: HTMLTextAreaElement; rjQuery: HTMLDetailsElement }
 *   & Record<'rjBtn' | 'rjStop' | 'rjSample' | 'rjCopy' | 'rjSave' | 'rjDownload', ExplainButton>
 *   & Record<'rjResult' | 'rjStatus' | 'rjResultHeading' | 'rjResultItems' | 'rjQuerySummary' | 'rjQueryText' | 'rjActionStatus', HTMLElement>} ExplainElements
 */

/**
 * @param {Document} root
 * @param {HTMLElement} container
 * @param {ExplainResult} output
 * @param {FollowUpControl[]} followUps
 */
function renderResult(root, container, output, followUps) {
  /** @template {keyof HTMLElementTagNameMap} Tag @param {Tag} tag @param {string} [text] */
  const node = (tag, text, className = '') => {
    const element = root.createElement(tag);
    if (text) element.textContent = text;
    element.className = className;
    return element;
  };
  container.replaceChildren();
  if (followUps.length) {
    const next = node('section', '', 'rj-follow-up');
    const title = node('h3', '下一步');
    title.id = 'rjFollowUpHeading';
    next.setAttribute('aria-labelledby', title.id);
    const actions = node('div', '', 'rj-follow-up__actions');
    for (const { key, label, activate } of followUps) {
      const button = node('button', label);
      button.type = 'button'; button.dataset.rjFollowUp = key;
      button.addEventListener('click', activate);
      actions.append(button);
    }
    next.append(title, actions);
    container.append(next);
  }
  /** @type {Map<string, HTMLElement>} */
  const groups = new Map();
  /** @type {{ item: ExplainItem; article: HTMLElement }[]} */
  const matches = [];
  const triage = output.items.length ? node('section', '', 'rj-triage') : null;
  if (triage) container.append(triage);
  for (const item of output.items) {
    let section = groups.get(item.rejectId);
    if (!section) {
      section = node('section', '', 'rj-group');
      section.append(node('h3', `${item.relevance === 'direct' ? '直接相关' : '可能相关'} · ${item.rejectSummary}`, 'rj-group__title'));
      container.append(section); groups.set(item.rejectId, section);
    }
    const article = node('article', '', 'rj-rule');
    matches.push({ item, article });
    const head = node('div', '', 'rj-rule__head');
    const label = { blocker: '需处理', warning: '需核对', info: '参考' }[item.severity];
    head.append(node('h4', item.title), node('span', label, 'rj-rule__level'));
    article.append(head, node('p', item.why || '请结合官方要求核对这条规则。'));
    article.append(node('p', `操作类型：${formatRuleActions(item)}`, 'rj-rule__meta'));
    if (item.matchEvidence) article.append(node('p', `匹配依据：${[...item.matchEvidence.aliases, ...item.matchEvidence.codes, ...item.matchEvidence.partialAliases].join('、')}。相关性不表示已确认违规。`, 'rj-rule__note'));
    if (item.requires.length) {
      const list = node('ol', '', 'rj-rule__steps');
      item.requires.forEach(requirement => list.append(node('li', requirement)));
      article.append(list);
    }
    for (const text of [item.warn, item.note]) if (text) article.append(node('p', text, 'rj-rule__note'));
    if (item.manual_required) article.append(node('p', '按操作类型处理后核对实际结果。', 'rj-rule__note'));
    const evidence = node('details', '', 'rj-evidence');
    const summary = node('summary');
    summary.append(createIcon(root, 'file-text'), node('span', '官方原文与规则依据'));
    evidence.append(summary);
    if (formatRuleConfidence(item)) evidence.append(node('p', formatRuleConfidence(item), 'rj-rule__meta'));
    if (item.source_quote) evidence.append(node('blockquote', item.source_quote));
    evidence.append(node('p', `规则 ${item.ruleId}`, 'rj-rule__meta'));
    evidence.append(node('p', `仓库核验日期：${item.last_verified || '未记录'} · 未实时核验`, 'rj-rule__meta'));
    if (item.official_url) {
      const link = node('a', '查看官方来源');
      link.href = item.official_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.append(createIcon(root, 'external-link')); evidence.append(link);
    } else evidence.append(node('p', '未收录官方链接，请自行核对官方要求。', 'rj-rule__meta'));
    article.append(evidence); section.append(article);
  }
  if (triage) {
    /** @type {ResultFilter[]} */
    const filters = [
      { key: 'all', label: '全部', accepts: () => true },
      { key: 'direct', label: '直接相关', accepts: item => item.relevance === 'direct' },
      { key: 'possible', label: '可能相关', accepts: item => item.relevance !== 'direct' },
      { key: 'action', label: '需处理', accepts: item => item.severity === 'blocker' },
      { key: 'manual', label: '需本人确认', accepts: item => item.manual_required },
      { key: 'source', label: '缺少官方来源', accepts: item => !item.official_url },
    ];
    triage.setAttribute('aria-label', '处理重点');
    triage.append(node('h3', '处理重点'));
    const controls = node('div', '', 'rj-triage__filters');
    const hint = node('p', '分类可重叠；缺少官方来源表示未收录官方链接。筛选仅影响显示，复制、下载和加入会话始终包含完整结果。', 'rj-triage__hint');
    const help = node('details', '', 'rj-triage__help');
    help.append(node('summary', '筛选与导出说明'), hint);
    const status = node('p', '', 'rj-triage__status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const empty = node('div', '', 'rj-triage__empty');
    empty.append(node('p', '当前分类没有匹配项，可查看全部结果继续核对。'));
    const reset = node('button', '查看全部'); reset.type = 'button'; reset.dataset.rjReset = '';
    empty.append(reset);
    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map();
    /** @param {ResultFilter} filter */
    function select(filter) {
      let count = 0;
      const visibleGroups = new Set();
      for (const { item, article } of matches) {
        article.hidden = !filter.accepts(item);
        if (!article.hidden) { count++; visibleGroups.add(item.rejectId); }
      }
      for (const [id, section] of groups) section.hidden = !visibleGroups.has(id);
      for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === filter.key));
      status.textContent = `${filter.label} · 显示 ${count} / ${matches.length} 个匹配项`;
      empty.hidden = count > 0;
    }
    for (const filter of filters) {
      const button = node('button', '', 'rj-triage__filter'); button.type = 'button'; button.dataset.rjFilter = filter.key;
      button.append(node('span', filter.label), node('span', String(output.items.filter(filter.accepts).length), 'rj-triage__count'));
      button.addEventListener('click', () => select(filter));
      controls.append(button); buttons.set(filter.key, button);
    }
    reset.addEventListener('click', () => { select(filters[0]); buttons.get('all')?.focus({ preventScroll: true }); });
    triage.append(controls, help, status, empty);
    select(filters[0]);
  }
  output.notes.forEach(note => container.append(node('p', note, 'rj-result__note')));
  if (!output.items.length && !output.notes.length) container.append(node('p', '未匹配到已收录的拒因，请尝试审核反馈中的关键词。', 'rj-result__note'));
}

/**
 * @param {Document} root
 * @param {{
 *   query?: (args: ExplainRequest) => Promise<unknown>;
 *   copyText?: (text: string) => Promise<void>;
 *   saveResult?: (text: string) => { ok: boolean; reason?: string; duplicate?: boolean };
 *   onFollowUp?: (action: ExplainFollowUp, isCurrent: () => boolean) => string | void | Promise<string | void>;
 *   artifactDownloader?: ReturnType<typeof createArtifactDownloader>;
 * }} [options]
 */
export function mountExplain(root, {
  query = queryExplain,
  copyText = async text => {
    const clipboard = root.defaultView?.navigator.clipboard;
    if (!clipboard) throw new Error('Clipboard unavailable.');
    await clipboard.writeText(text);
  },
  saveResult, onFollowUp, artifactDownloader = createArtifactDownloader({ documentRef: root }),
} = {}) {
  const formElement = root.getElementById('rjForm');
  if (!formElement) return;
  const form = formElement;
  /** @template {keyof ExplainElements} Id @param {Id} id @returns {ExplainElements[Id]} */
  function control(id) {
    const element = root.getElementById(id);
    if (!element) throw new Error(`Missing rejection lookup control: ${id}`);
    return /** @type {ExplainElements[Id]} */ (element);
  }
  const input = control('rjInput'), result = control('rjResult');
  const status = control('rjStatus'), heading = control('rjResultHeading');
  const submit = control('rjBtn'), stop = control('rjStop'), sample = control('rjSample');
  const items = control('rjResultItems');
  const queryPanel = control('rjQuery'), querySummary = control('rjQuerySummary'), queryText = control('rjQueryText');
  const copy = control('rjCopy'), save = control('rjSave'), download = control('rjDownload'), actionStatus = control('rjActionStatus');
  /** @type {AbortController | null} */
  let active = null;
  /** @type {ExplainArtifact | null} */
  let artifact = null;
  let actionEpoch = 0;
  result.hidden = true; stop.hidden = true;
  queryPanel.open = true; querySummary.hidden = true;
  copy.disabled = save.disabled = download.disabled = true; save.hidden = !saveResult;
  for (const [button, name] of /** @type {const} */ ([[copy, 'copy'], [save, 'message-square'], [download, 'arrow-down']])) {
    const icon = createIcon(root, name); icon.setAttribute('slot', 'start'); button.append(icon);
  }
  function resetActions(clearResult = false) {
    actionEpoch++; actionStatus.textContent = ''; actionStatus.dataset.state = '';
    if (clearResult) artifact = null;
    copy.disabled = save.disabled = download.disabled = !artifact;
  }
  /** @param {string} text @param {'' | 'success' | 'error' | 'working'} [state] */
  function feedback(text, state = 'success') { actionStatus.textContent = text; actionStatus.dataset.state = state; }
  /** @param {ExplainFollowUp} action @param {ExplainArtifact} currentArtifact */
  async function followUp(action, currentArtifact) {
    if (!onFollowUp || artifact !== currentArtifact) return;
    const epoch = ++actionEpoch;
    const isCurrent = () => epoch === actionEpoch && artifact === currentArtifact;
    copy.disabled = false;
    feedback('正在打开…', 'working');
    try {
      const refused = await onFollowUp(action, isCurrent);
      if (isCurrent()) feedback(refused || '', refused ? 'error' : '');
    } catch {
      if (isCurrent()) feedback('未能打开下一步，请重试。', 'error');
    }
  }
  async function copyResult() {
    if (!artifact || copy.disabled) return;
    const epoch = ++actionEpoch;
    copy.disabled = true; feedback('正在复制…', 'working');
    try { await copyText(artifact.text); if (epoch === actionEpoch) feedback('结果已复制，包含审核反馈、处理要求和官方来源。'); }
    catch { if (epoch === actionEpoch) feedback('复制失败，请重试，或选择结果正文手动复制。', 'error'); }
    finally { if (epoch === actionEpoch) copy.disabled = false; }
  }
  function downloadResult() {
    if (!artifact || download.disabled) return;
    actionEpoch++; copy.disabled = false;
    let started = false;
    try { started = artifactDownloader.download(artifact); } catch { /* Keep the validated result available for retry/copy. */ }
    feedback(started ? '已发起下载 shipmate-explain.md，请在下载列表中确认。' : '未能发起下载，请重试或复制结果。', started ? 'success' : 'error');
  }
  function saveToConversation() {
    if (!artifact || !saveResult) return;
    actionEpoch++; copy.disabled = false;
    try {
      const saved = saveResult(artifact.text);
      if (!saved?.ok) {
        feedback(saved?.reason === 'limit' ? '结果或会话已达到保存上限，请复制结果并新建会话。' : '未能加入会话，请先完成当前操作后重试。', 'error'); return;
      }
      feedback(saved.duplicate ? '结果已在当前会话中，无需重复加入。' : '已加入当前会话；保存状态见会话区。');
    } catch { feedback('未能加入会话，请重试；结果仍保留在此处。', 'error'); }
  }
  /** @param {ExplainStatus} state @param {string} message */
  function present(state, message, restoreFocus = true) {
    const returnFocus = restoreFocus && ['stopped', 'error'].includes(state) && root.activeElement === stop;
    status.dataset.state = state; status.textContent = message;
    const busy = state === 'running';
    status.classList.toggle('is-working', busy);
    submit.disabled = busy; sample.disabled = busy; stop.hidden = !busy;
    submit.textContent = state === 'error' ? '重试查询' : '查询处理方向';
    form.setAttribute('aria-busy', String(busy));
    if (returnFocus) input.focus();
  }
  /** @param {ExplainStatus} state @param {string} message */
  function invalidate(state, message, restoreFocus = true) {
    const previous = active; active = null; previous?.abort();
    resetActions(true); queryPanel.open = true;
    result.hidden = true; items.replaceChildren(); present(state, message, restoreFocus);
  }
  function edited() {
    input.removeAttribute('aria-invalid');
    invalidate('idle', '输入已变化，请重新查询。');
  }
  function fillSample() {
    input.value = REJECTION_SAMPLE; edited();
    present('idle', '示例已填入，点击查询以检索本地规则库。'); input.focus();
  }
  function cancelled() { invalidate('stopped', '查询已停止，输入已保留。'); }
  function pageHidden() { invalidate('stopped', '查询已停止，输入已保留。', false); artifactDownloader.dispose(); }
  /** @param {Event} event */
  async function submitQuery(event) {
    event.preventDefault();
    if (active) return;
    if (!validateExplainInput({ query: input.value }).ok) {
      invalidate('invalid', '请输入 1–4096 字的拒因原文或关键词。');
      input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    input.removeAttribute('aria-invalid');
    const request = input.value.trim();
    resetActions(true); queryPanel.open = true; queryText.textContent = request;
    const controller = new AbortController(); active = controller;
    result.hidden = true; items.replaceChildren(); present('running', '正在查询本地规则库…');
    try {
      const output = await query({ query: request, signal: controller.signal });
      if (active !== controller) return;
      if (!isExplainResult(output, request)) throw new Error('查询结果未通过校验，请重试。');
      const currentArtifact = createExplainArtifact(request, output);
      artifact = currentArtifact;
      /** @type {FollowUpControl[]} */
      const next = [];
      if (!output.items.length) {
        next.push({ key: 'edit', label: '修改关键词', activate() {
          if (artifact !== currentArtifact) return;
          queryPanel.open = true;
          input.focus();
        } });
      } else if (onFollowUp) {
        const categories = new Set(output.items.flatMap(item => item.action_categories || []));
        if (categories.has('code')) next.push({ key: 'preflight', label: '前往项目预检', activate: () => followUp('preflight', currentArtifact) });
        if (categories.has('materials')) next.push({ key: 'materials', label: '打开提审材料包', activate: () => followUp('materials', currentArtifact) });
      }
      renderResult(root, items, output, next);
      const groups = new Set(output.items.map(item => item.rejectId)).size;
      heading.textContent = output.items.length ? `找到 ${groups} 类相关拒因 · ${output.items.length} 个匹配项` : '未找到相关拒因';
      result.hidden = false;
      resetActions();
      queryPanel.open = !output.items.length; querySummary.hidden = false;
      present(output.items.length ? 'matched' : 'empty', output.items.length ? '已查询本地规则库。匹配仅供定位，请逐项核对实际情况。' : '本地规则库暂未命中。试试审核反馈中更短的关键词。');
      heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    } catch (error) {
      if (active !== controller) return;
      if (isExplainAbort(error)) present('stopped', '查询已停止，输入已保留。');
      else {
        const message = error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message : '';
        present('error', message || '查询失败，请重试。');
      }
    } finally { if (active === controller) active = null; }
  }
  form.addEventListener('submit', submitQuery);
  input.addEventListener('input', edited);
  sample.addEventListener('click', fillSample);
  stop.addEventListener('click', cancelled);
  copy.addEventListener('click', copyResult); save.addEventListener('click', saveToConversation);
  download.addEventListener('click', downloadResult);
  root.defaultView?.addEventListener('pagehide', pageHidden);
  function dispose() {
    pageHidden(); form.removeEventListener('submit', submitQuery); input.removeEventListener('input', edited);
    sample.removeEventListener('click', fillSample); stop.removeEventListener('click', cancelled);
    copy.removeEventListener('click', copyResult); save.removeEventListener('click', saveToConversation);
    download.removeEventListener('click', downloadResult);
    root.defaultView?.removeEventListener('pagehide', pageHidden);
  }
  return { dispose, suspend() { resetActions(); if (active) pageHidden(); }, reset() { invalidate('idle', '项目已切换，输入已保留，请重新查询。', false); } };
}
