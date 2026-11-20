// @ts-check
export const GUIDE_TOOL_NAME = 'weapp_shipmate_guide';
export const GUIDE_SUBJECTS = Object.freeze({ personal: '个人', individual_business: '个体工商户', enterprise: '企业' });
/** @typedef {{ subject: keyof typeof GUIDE_SUBJECTS; sensitive: boolean; domain: boolean }} GuideInput */
/**
 * @typedef {{
 *   ruleId: string; title: string; stage: string; severity: 'info' | 'warning' | 'blocker';
 *   requires: string[]; manual_required: boolean;
 *   why?: string | null; warn?: string | null; source_quote?: string | null; note?: string | null;
 *   official_url?: string | null; last_verified?: string | null; conditional?: boolean; signal?: unknown;
 *   action_categories?: ('code' | 'console' | 'materials' | 'manual_check')[];
 *   confidence?: 'high' | 'medium' | 'low';
 * }} GuideItem
 */
/** @typedef {{ command: 'guide'; meta: { summary: string }; items: GuideItem[]; selfCheck: GuideItem[]; notes: string[] }} GuideResult */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
/** @param {unknown} value @returns {value is string} */
const text = (value, max = 4096) => typeof value === 'string' && value.length <= max;
/** @param {unknown} value @param {readonly string[]} allowed @returns {value is Record<string, unknown>} */
const keys = (value, allowed, required = allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key));
/** @param {unknown} value */
const strings = (value, count = 100) => Array.isArray(value) && value.length <= count && value.every(item => text(item));
/** @param {string} error @returns {{ ok: false; error: string }} */
const bad = error => ({ ok: false, error });

/** @param {unknown} value @returns {{ ok: true } | ReturnType<typeof bad>} */
export function validateGuideInput(value) {
  return keys(value, ['subject', 'sensitive', 'domain']) && typeof value.subject === 'string' && Object.hasOwn(GUIDE_SUBJECTS, value.subject) && typeof value.sensitive === 'boolean' && typeof value.domain === 'boolean'
    ? { ok: true } : bad('请选择主体，并明确敏感信息和服务器域名选项。');
}
/** @param {unknown} value */
function source(value, preflight = false) {
  if (value === null) return true;
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    const knownHost = ['developers.weixin.qq.com', 'mp.weixin.qq.com', 'www.miit.gov.cn', 'beian.miit.gov.cn'].includes(url.hostname)
      || (preflight === true && url.hostname === 'pay.weixin.qq.com');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && knownHost;
  } catch { return false; }
}
// signal is bounded inert JSON; neither this validator nor the UI executes it.
/**
 * @param {unknown} value
 * @param {number} [depth]
 * @param {{ remaining: number; chars: number; maxString?: number; maxArray?: number }} [budget]
 * @returns {boolean}
 */
function data(value, depth = 0, budget = { remaining: 500, chars: 16384 }) {
  if (--budget.remaining < 0 || depth > 5) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') { budget.chars -= value.length; return budget.chars >= 0 && text(value, budget.maxString || 2048); }
  if (Array.isArray(value)) return value.length <= (budget.maxArray || 100) && value.every(item => data(item, depth + 1, budget));
  return record(value) && Object.keys(value).length <= 32 && Object.entries(value).every(([key, item]) => key.length <= 128 && !['__proto__', 'constructor', 'prototype'].includes(key) && data(item, depth + 1, budget));
}
const itemKeys = ['ruleId', 'title', 'stage', 'severity', 'why', 'requires', 'official_url', 'last_verified', 'manual_required', 'warn', 'source_quote', 'note', 'conditional', 'signal', 'action_categories', 'confidence'];
/** @param {unknown} value @returns {value is GuideItem} */
function item(value, preflight = false) {
  if (!keys(value, itemKeys, ['ruleId', 'title', 'stage', 'severity', 'requires', 'manual_required'])) return false;
  const { ruleId, title, stage, severity } = value;
  if (!text(ruleId, 512) || !ruleId.trim() || !text(title, 512) || !title.trim() || !text(stage, 512) || !stage.trim()
      || typeof severity !== 'string' || !['info', 'warning', 'blocker'].includes(severity) || typeof value.manual_required !== 'boolean' || !strings(value.requires)) return false;
  if (['why', 'warn', 'source_quote', 'note'].some(key => Object.hasOwn(value, key) && value[key] !== null && !text(value[key]))) return false;
  if (!['registration', 'certification', 'filing', 'category', 'privacy', 'domain', 'review', 'release'].includes(stage)) return false;
  if (!ruleId.startsWith('flow.') && !['why', 'official_url', 'last_verified'].every(key => Object.hasOwn(value, key))) return false;
  if (Object.hasOwn(value, 'official_url') && !source(value.official_url, preflight)) return false;
  if (Object.hasOwn(value, 'last_verified')) {
    const verified = value.last_verified;
    if (verified !== null && (typeof verified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(verified) || !Number.isFinite(Date.parse(verified)) || new Date(verified).toISOString().slice(0, 10) !== verified)) return false;
  }
  if (Object.hasOwn(value, 'confidence') && (typeof value.confidence !== 'string' || !['high', 'medium', 'low'].includes(value.confidence))) return false;
  if (Object.hasOwn(value, 'conditional') && typeof value.conditional !== 'boolean') return false;
  if (Object.hasOwn(value, 'action_categories')) {
    const categories = value.action_categories;
    if (!Array.isArray(categories) || !categories.length || categories.length > 4
      || new Set(categories).size !== categories.length
      || !categories.every(category => ['code', 'console', 'materials', 'manual_check'].includes(category))) return false;
  }
  return !Object.hasOwn(value, 'signal') || data(value.signal);
}
/** @param {unknown} value @returns {value is GuideItem[]} */
const items = value => Array.isArray(value) && value.length <= 500 && value.every(entry => item(entry));

/** @param {unknown} value @returns {{ ok: true } | ReturnType<typeof bad>} */
export function validateGuideResult(value) {
  if (!keys(value, ['command', 'meta', 'items', 'selfCheck', 'notes']) || value.command !== 'guide' || !keys(value.meta, ['summary']) || !text(value.meta.summary) || !strings(value.notes)) return bad('上线清单结果格式不正确。');
  const { items: applicable, selfCheck } = value;
  if (!items(applicable) || !items(selfCheck)) return bad('上线清单条目或来源不受支持。');
  const ids = [...applicable, ...selfCheck].map(entry => entry.ruleId);
  if (new Set(ids).size !== ids.length || applicable.some(entry => entry.conditional === true) || selfCheck.some(entry => entry.conditional !== true)) return bad('上线清单分区或条目标识不正确。');
  if (!data(value, -3, { remaining: 20000, chars: 120000, maxString: 4096, maxArray: 500 }) || JSON.stringify(value).length > 120000) return bad('上线清单结果过大。');
  return { ok: true };
}
export { item as validateGuideItem };
/** @param {unknown} value */
export const validatePreflightItem = value => item(value, true);
