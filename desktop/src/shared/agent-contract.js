// @ts-check
/* global TextEncoder */
// Fixed project-tool data, shared by the native broker, renderer and session store.
// These validators never grant permissions or accept paths/identities from the model.
export const AGENT_TOOL_NAME = 'project_read';
export const AGENT_PROVIDERS = Object.freeze(['openai', 'anthropic', 'google']);
export const AGENT_KINDS = Object.freeze(/** @type {const} */ (['check', 'guide', 'explain']));
/** @typedef {(typeof AGENT_KINDS)[number]} AgentKind */
/** @typedef {{ kind: 'check' | 'guide'; query: '' } | { kind: 'explain'; query: string }} AgentInput */
/**
 * @typedef {{
 *   schemaVersion: 1; kind: AgentKind; runId: string; artifactId: string; title: string; summary: string;
 *   itemCount: number; items: { ruleId: string; title: string; severity: 'blocker' | 'warning' | 'info' | 'error'; sourceUrl: string }[];
 *   truncated: boolean; scopeComplete: boolean | null; projectRevision: number; contextRevision: number;
 * }} AgentResult
 */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/**
 * @template {string} Key
 * @param {unknown} value
 * @param {readonly Key[]} keys
 * @returns {value is Record<Key, unknown>}
 */
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
/** @param {unknown} value */
const kind = value => AGENT_KINDS.some(allowed => value === allowed);
/** @param {unknown} value @param {number} max @returns {value is string} */
// eslint-disable-next-line no-control-regex -- Deliberately reject non-whitespace control characters at the data boundary.
const text = (value, max, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
/** @param {unknown} value */
const id = value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value);
/** @param {unknown} value @returns {value is number} */
const integer = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** @param {string} error @returns {{ ok: false; error: string }} */
const invalid = error => ({ ok: false, error });

/** @param {unknown} value @returns {{ ok: true } | ReturnType<typeof invalid>} */
export function validateAgentInput(value) {
  if (!exact(value, ['kind', 'query']) || !kind(value.kind) || !text(value.query, 4096, value.kind !== 'explain') || (value.kind !== 'explain' && value.query !== '')) {
    return invalid('项目工具参数无效；只能使用检查、上线清单或拒因解释。');
  }
  return { ok: true };
}

/** @param {unknown} value @returns {{ ok: true } | ReturnType<typeof invalid>} */
export function validateAgentResult(value) {
  const keys = /** @type {const} */ (['schemaVersion', 'kind', 'runId', 'artifactId', 'title', 'summary', 'itemCount', 'items', 'truncated', 'scopeComplete', 'projectRevision', 'contextRevision']);
  if (!exact(value, keys) || value.schemaVersion !== 1 || !kind(value.kind)
      || !id(value.runId) || !id(value.artifactId) || !text(value.title, 120) || !text(value.summary, 1000)
      || !integer(value.itemCount) || value.itemCount > 100000 || !integer(value.projectRevision) || !integer(value.contextRevision)
      || typeof value.truncated !== 'boolean' || !(value.scopeComplete === null || typeof value.scopeComplete === 'boolean')
      || !Array.isArray(value.items) || value.items.length > 20 || value.items.length > value.itemCount
      || value.truncated !== (value.items.length < value.itemCount)
      || (value.kind !== 'check' && value.scopeComplete !== null)) return invalid('项目工具结果格式无效，未展示未经校验的内容。');
  for (const item of /** @type {unknown[]} */ (value.items)) {
    if (!exact(item, ['ruleId', 'title', 'severity', 'sourceUrl']) || !text(item.ruleId, 120) || !text(item.title, 240)
        || typeof item.severity !== 'string' || !['blocker', 'warning', 'info', 'error'].includes(item.severity) || !text(item.sourceUrl, 2048, true)) return invalid('项目工具条目格式无效。');
    if (item.sourceUrl) {
      try {
        const url = new URL(item.sourceUrl);
        if (url.protocol !== 'https:' || url.username || url.password) return invalid('项目工具来源链接无效。');
      } catch { return invalid('项目工具来源链接无效。'); }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 24000) return invalid('项目工具摘要超过显示限制。');
  return { ok: true };
}
