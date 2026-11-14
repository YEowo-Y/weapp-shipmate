import { getReviewPresentation } from './presentation.js';
import { returnDestination } from '../navigation.js';

const EXAMPLE_LINES = [
  ['context', '  "pages": ["pages/index/index"],'],
  ['context', '  "window": { ... },'],
  ['added', '  "requiredPrivateInfos": ["getLocation"],'],
  ['added', '  "__note": "位置用途：附近门店定位",'],
  ['context', '  "sitemapLocation": "sitemap.json"'],
];

/** One review surface, embedded in either workspace shell. No file execution. */
export function mountReview(host, { approveId, rejectId, statusId, delegated = false, returnPath = 'main-four-region.html' } = {}) {
  const doc = host.ownerDocument;
  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = el('section', 'agent-review');
  root.dataset.component = 'review';
  root.setAttribute('aria-label', 'app.json 示例改动');
  const header = el('div', 'agent-review__header');
  header.append(el('strong', '', 'app.json'), el('span', 'agent-review__count', '+2 −0'));
  const caption = el('p', 'agent-review__caption', '新增隐私声明 · 固定差异示例');
  const diff = el('div', 'agent-review__diff');
  diff.setAttribute('aria-label', '文件差异');
  for (const [kind, text] of EXAMPLE_LINES) {
    const row = el('div', 'agent-review__line');
    row.dataset.change = kind;
    const marker = el('span', 'agent-review__marker', kind === 'added' ? '+' : ' ');
    marker.setAttribute('aria-label', kind === 'added' ? '新增' : '上下文');
    row.append(marker, el('code', '', text));
    diff.append(row);
  }
  const actions = el('div', 'agent-review__actions artifact__act');
  const button = (text, action, hook) => {
    const control = el('button', `agent-review__button ${delegated ? 'abtn ' : ''}${hook || ''}`, text);
    control.type = 'button';
    control.dataset.reviewAction = action;
    return control;
  };
  const reject = button('拒绝', 'reject', 'reject');
  const approve = button('批准示例', 'approve', 'approve');
  if (approveId) approve.id = approveId;
  if (rejectId) reject.id = rejectId;
  const full = el('a', 'agent-review__button', '完整预览');
  full.href = `diff-review.html?from=${encodeURIComponent(returnDestination(`?from=${encodeURIComponent(returnPath)}`))}`;
  actions.append(reject, full, approve);
  const status = el('p', 'agent-review__status');
  status.setAttribute('role', 'status');
  if (statusId) status.id = statusId;
  const reset = el('div', 'agent-review__reset artifact__ckpt');
  const undo = button('撤销批准', 'undo', 'roll');
  reset.append(el('span', '', '仅记录本页审批，不写入文件'), undo);
  root.append(header, caption, diff, actions, status, reset);
  host.replaceChildren(root);
  updateReview(root, 'pending');
  return { root, approve, reject, status, undo };
}

export function updateReview(root, state, { busy = false } = {}) {
  if (!root) return;
  const presentation = getReviewPresentation(state);
  root.dataset.reviewState = state;
  root.dataset.tone = presentation.tone;
  const approve = root.querySelector('.approve');
  const reject = root.querySelector('.reject');
  const undo = root.querySelector('.roll');
  approve.textContent = presentation.canApprove ? '批准示例' : presentation.canRegenerate ? '重新生成示例' : '已批准';
  approve.dataset.reviewAction = presentation.canApprove ? 'approve' : 'regenerate';
  approve.disabled = busy || (!presentation.canApprove && !presentation.canRegenerate);
  reject.disabled = busy || !presentation.canReject;
  undo.disabled = busy || !presentation.canRollback;
  undo.setAttribute('aria-disabled', String(undo.disabled));
  root.querySelector('.agent-review__status').textContent = presentation.summary;
}
