// @ts-check
import { validateGuideResult } from '../guide-contract.js';
import { validateDemoResult } from '../demo-result.js';

/** @typedef {import('../session-store.js').SessionSnapshot['sessions'][number]['messages'][number]} SessionMessage */
/** @typedef {Pick<NonNullable<SessionMessage['live']>, 'providerId' | 'model' | 'label'>} LiveModel */

// Canonical presentation of the existing preview states. No transport protocol.
const reviews = Object.freeze({
  pending: Object.freeze({ label: '等待审批', summary: '示例差异等待审批，尚未写入文件。', tone: 'warning', canApprove: true, canReject: true, canRegenerate: false, canRollback: false }),
  accepted: Object.freeze({ label: '示例已批准 · 未写入文件', summary: '示例已批准；仍未执行写入。', tone: 'success', canApprove: false, canReject: false, canRegenerate: false, canRollback: true }),
  rejected: Object.freeze({ label: '已拒绝', summary: '示例改动已拒绝；没有写入文件。', tone: 'neutral', canApprove: false, canReject: false, canRegenerate: true, canRollback: false }),
  stale: Object.freeze({ label: '差异已失效', summary: '差异已失效；请基于最新内容重新生成。', tone: 'warning', canApprove: false, canReject: false, canRegenerate: true, canRollback: false }),
});
const tools = Object.freeze({
  running: Object.freeze({ label: '执行中', tone: 'active' }),
  success: Object.freeze({ label: '成功', tone: 'success' }),
  fail: Object.freeze({ label: '失败', tone: 'danger' }),
  canceled: Object.freeze({ label: '已停止', tone: 'neutral' }),
});
const runs = Object.freeze({
  idle: Object.freeze({ label: '准备就绪', announcement: '准备就绪', tone: 'neutral' }),
  working: Object.freeze({ label: '准备中', announcement: '正在准备本地演示…', tone: 'active' }),
  streaming: Object.freeze({ label: '生成中', announcement: '正在生成…', tone: 'active' }),
  complete: Object.freeze({ label: '已完成', announcement: '生成完成。', tone: 'success' }),
  stopped: Object.freeze({ label: '已停止', announcement: '已停止，已保留生成内容。', tone: 'neutral' }),
  error: Object.freeze({ label: '失败', announcement: '运行失败，可重试本次请求。', tone: 'danger' }),
});
/**
 * @template {Record<string, unknown>} Table
 * @param {Table} table
 * @param {unknown} state
 * @param {string} kind
 */
function lookup(table, state, kind) {
  const key = /** @type {keyof Table} */ (state);
  if (!Object.hasOwn(table, key)) throw new Error(`Unknown ${kind} state: ${String(state)}`);
  return table[key];
}
/** @param {unknown} state */
export const getReviewPresentation = state => lookup(reviews, state, 'review');
/** @param {unknown} state */
export const getToolPresentation = state => lookup(tools, state, 'tool');
// Three visual phases (open-claude-ui McpToolDecisionCard): running → success | error.
// A user stop settles as a quiet error-phase card, like upstream `user_denied`.
const toolPhases = Object.freeze({
  running: Object.freeze({ phase: 'running', settle: 'pending' }),
  success: Object.freeze({ phase: 'success', settle: 'completed' }),
  fail: Object.freeze({ phase: 'error', settle: 'failed' }),
  canceled: Object.freeze({ phase: 'error', settle: 'canceled' }),
});
/** @param {unknown} state */
export const getToolPhase = state => lookup(toolPhases, state, 'tool');
/**
 * @param {unknown} state
 * @param {{ result?: unknown; error?: { message?: unknown; code?: unknown } | null; kind?: string }} [options]
 * @returns {{ kind: 'empty' | 'error' | 'unavailable' | 'result'; text: string; code?: string }}
 */
export function getToolOutputPresentation(state, { result, error, kind } = {}) {
  getToolPresentation(state);
  if (state === 'running') return { kind: 'empty', text: '等待工具返回结果…' };
  if (state === 'canceled') return { kind: 'empty', text: '执行已停止，本次没有生成可展示的结果。' };
  if (state === 'fail') {
    return {
      kind: 'error',
      text: typeof error?.message === 'string' && error.message.trim() ? error.message : '工具执行失败，本次没有生成可展示的结果。',
      code: typeof error?.code === 'string' && error.code.trim() ? error.code : undefined,
    };
  }
  if (!(kind === 'guide' ? validateGuideResult(result) : validateDemoResult(result)).ok) return { kind: 'unavailable', text: '结果不可用：本次未提供通过校验的数据。' };
  return { kind: 'result', text: JSON.stringify(result, null, 2) };
}
/** @param {unknown} state */
export const getRunPresentation = state => lookup(runs, state, 'run');
/**
 * @param {unknown} state
 * @param {{ text?: string; guide?: unknown; live?: LiveModel | null; error?: { retryable?: boolean } | null } | null} [message]
 */
export function getRunAnnouncement(state, message) {
  if (state === 'idle') return '';
  if (state === 'working' && message?.guide) return '正在整理本机已收录规则…';
  if (state === 'working' && message?.live) return `正在等待 ${message.live.providerId} · ${message.live.label || message.live.model} 回复…`;
  if (state === 'error' && message?.error?.retryable === false) return '本次执行失败，请检查错误说明。';
  if (state === 'stopped' && !message?.text) return '已在输出前停止。';
  return getRunPresentation(state).announcement;
}
/** @param {{ state: unknown; elapsedMs?: number }} trace */
export function formatTraceLabel(trace) {
  const elapsed = typeof trace.elapsedMs === 'number' && Number.isFinite(trace.elapsedMs) ? Math.max(0, trace.elapsedMs) : 0;
  return `运行记录 · ${getRunPresentation(trace.state).label} · ${(elapsed / 1000).toFixed(1)} 秒`;
}
