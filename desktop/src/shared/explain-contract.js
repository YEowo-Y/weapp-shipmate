// @ts-check
import { validateGuideItem } from './guide-contract.js';

/** @typedef {import('./guide-contract.js').GuideItem} GuideItem */
/** @typedef {{ aliases: string[]; codes: string[]; partialAliases: string[] }} MatchEvidence */
/** @typedef {{ relevance: 'direct' | 'possible'; matchEvidence: MatchEvidence } | { relevance?: never; matchEvidence?: never }} MatchClassification */
/** @typedef {GuideItem & { rejectId: string; rejectSummary: string } & MatchClassification} ExplainItem */
/** @typedef {{ command: 'explain'; meta: { summary: string; query: string }; items: ExplainItem[]; notes: string[] }} ExplainResult */
/** @typedef {{ ok: true } | { ok: false; error: string }} ExplainValidation */

export const EXPLAIN_QUERY_MAX = 4096;
export const EXPLAIN_RESULT_MAX = 200000;
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
/**
 * @template {string} Key
 * @param {unknown} value
 * @param {readonly Key[]} expected
 * @returns {value is Record<Key, unknown>}
 */
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
/** @param {unknown} value @param {number} max @returns {value is string} */
const text = (value, max) => typeof value === 'string' && value.length <= max;
/** @param {string} error @returns {{ ok: false; error: string }} */
const bad = error => ({ ok: false, error });
/** @param {unknown} value @returns {ExplainValidation} */
export function validateExplainInput(value) {
  return keys(value, ['query']) && text(value.query, EXPLAIN_QUERY_MAX) && value.query.trim()
    ? { ok: true } : bad('请输入审核反馈或关键词，最多 4096 个字符。');
}

/** @param {unknown} list @returns {list is string[]} */
const evidenceList = list => Array.isArray(list) && list.length <= 100 && new Set(list).size === list.length
  && list.every(value => text(value, 512) && value.trim());

/** @param {Record<string, unknown>} entry */
export function validateMatchEvidence(entry) {
  const hasRelevance = Object.hasOwn(entry, 'relevance');
  const hasEvidence = Object.hasOwn(entry, 'matchEvidence');
  if (!hasRelevance && !hasEvidence) return true;
  if (!hasRelevance || !hasEvidence || (entry.relevance !== 'direct' && entry.relevance !== 'possible')
    || !keys(entry.matchEvidence, ['aliases', 'codes', 'partialAliases'])) return false;
  const { aliases, codes, partialAliases } = entry.matchEvidence;
  if (!evidenceList(aliases) || !evidenceList(codes) || !evidenceList(partialAliases)) return false;
  if (!aliases.length && !codes.length && !partialAliases.length) return false;
  return entry.relevance !== 'direct' || aliases.length > 0 || codes.length > 0;
}

/** @param {unknown} value @param {string} query @returns {ExplainValidation} */
export function validateExplainResult(value, query) {
  if (!keys(value, ['command', 'meta', 'items', 'notes']) || value.command !== 'explain'
    || !keys(value.meta, ['summary', 'query']) || !text(value.meta.summary, 8192)
    || !validateExplainInput({query:value.meta.query}).ok || value.meta.query !== query
    || !Array.isArray(value.notes) || value.notes.length > 100 || !(/** @type {unknown[]} */ (value.notes)).every(note => text(note, 4096))
    || !Array.isArray(value.items) || value.items.length > 500) return bad('拒因查询结果格式不正确。');
  const ids = new Set();
  for (const entry of /** @type {unknown[]} */ (value.items)) {
    if (!record(entry)) return bad('拒因规则格式不正确。');
    if (!validateMatchEvidence(entry)) return bad('拒因匹配依据不受支持。');
    const { rejectId, rejectSummary, relevance: _relevance, matchEvidence: _matchEvidence, ...rule } = entry;
    if (!text(rejectId, 512) || !rejectId.trim() || !text(rejectSummary, 4096) || !rejectSummary.trim() || !validateGuideItem(rule)) return bad('拒因规则或来源不受支持。');
    const id = JSON.stringify([rejectId, rule.ruleId]);
    if (ids.has(id)) return bad('拒因规则重复。');
    ids.add(id);
  }
  return JSON.stringify(value).length <= EXPLAIN_RESULT_MAX ? { ok: true } : bad('拒因查询结果过大。');
}

/** @param {unknown} value @param {string} query @returns {value is ExplainResult} */
export function isExplainResult(value, query) {
  return validateExplainResult(value, query).ok;
}
