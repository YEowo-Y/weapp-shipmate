import { validateGuideItem } from './guide-contract.js';

export const EXPLAIN_QUERY_MAX = 4096;
export const EXPLAIN_RESULT_MAX = 200000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === 'string' && value.length <= max;
const bad = error => ({ ok: false, error });
export function validateExplainInput(value) {
  return keys(value, ['query']) && text(value.query, EXPLAIN_QUERY_MAX) && value.query.trim()
    ? { ok: true } : bad('请输入审核反馈或关键词，最多 4096 个字符。');
}
export function validateExplainResult(value, query) {
  if (!keys(value, ['command', 'meta', 'items', 'notes']) || value.command !== 'explain'
    || !keys(value.meta, ['summary', 'query']) || !text(value.meta.summary, 8192)
    || !validateExplainInput({query:value.meta.query}).ok || value.meta.query !== query
    || !Array.isArray(value.notes) || value.notes.length > 100 || !value.notes.every(note => text(note, 4096))
    || !Array.isArray(value.items) || value.items.length > 500) return bad('拒因查询结果格式不正确。');
  const ids = new Set();
  for (const entry of value.items) {
    if (!record(entry)) return bad('拒因规则格式不正确。');
    const { rejectId, rejectSummary, ...rule } = entry;
    if (!text(rejectId, 512) || !rejectId.trim() || !text(rejectSummary, 4096) || !rejectSummary.trim() || !validateGuideItem(rule)) return bad('拒因规则或来源不受支持。');
    const id = JSON.stringify([rejectId, rule.ruleId]);
    if (ids.has(id)) return bad('拒因规则重复。');
    ids.add(id);
  }
  return JSON.stringify(value).length <= EXPLAIN_RESULT_MAX ? { ok: true } : bad('拒因查询结果过大。');
}
