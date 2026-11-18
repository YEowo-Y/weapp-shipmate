import type { RepairHandoff } from './shared/repair-handoff.js';

const reportKinds = { check: '项目预检', explain: '拒因反查', guide: '上线清单' };
const maxRules = 20;
const maxBytes = 8 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidCatalog = () => new Error('无法读取本机规则来源目录，请重试。');

function catalogRules(snapshot: unknown) {
  const catalog = isRecord(snapshot) ? snapshot.catalog : null;
  if (!isRecord(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.sources)) throw invalidCatalog();

  const rules = new Map<string, { title: string; url: string; date: string }>();
  for (const source of catalog.sources as unknown[]) {
    if (!isRecord(source) || typeof source.url !== 'string' || !Array.isArray(source.references)) throw invalidCatalog();
    // Match the packaged catalog's official source policy, with exact HTTPS authorities.
    if (!/^https:\/\/(?:developers|pay)\.weixin\.qq\.com(?:[/?#]|$)/.test(source.url) || /[\s\\]/u.test(source.url)) throw invalidCatalog();
    for (const ref of source.references as unknown[]) {
      if (!isRecord(ref) || typeof ref.id !== 'string' || typeof ref.title !== 'string'
        || !ref.title.trim() || /[\r\n\u2028\u2029]/u.test(ref.title) || typeof ref.draft !== 'boolean'
        || (ref.lastVerified !== null && typeof ref.lastVerified !== 'string')) throw invalidCatalog();
      if (ref.draft || !ref.lastVerified || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(ref.lastVerified)) continue;
      const date = new Date(ref.lastVerified);
      if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== ref.lastVerified) continue;
      // Other catalog reference types use namespaced IDs, such as "flow:review".
      if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(ref.id) && !rules.has(ref.id)) {
        rules.set(ref.id, { title: ref.title, url: source.url, date: ref.lastVerified });
      }
    }
  }
  return rules;
}

export function createAgentHandoffSummary(pack: RepairHandoff, snapshot: unknown): string | null {
  const { kind, provenance, projectId } = pack.source;
  if (provenance !== undefined || !projectId || !Object.hasOwn(reportKinds, kind) || !pack.items.length) return null;

  const rules = catalogRules(snapshot);
  const ids = new Set<string>(pack.items.map(item => item.rule.ruleId));
  const matched: string[] = [];
  for (const id of ids) {
    const entry = rules.get(id);
    if (entry) matched.push(`- ${id} · ${entry.title} · ${entry.url} · 仓库核验日期 ${entry.date}`);
  }
  if (!matched.length) return null;

  const unmatched = ids.size - matched.length;
  const rows = matched.slice(0, maxRules);
  const compose = () => [
    '小程序上线核对任务',
    `报告类型 · ${reportKinds[kind]}`,
    '',
    '1. 在已打开的小程序项目中逐条核对下列规则，记录适用情况和需要调整的地方。',
    '2. 给出修改建议和复验步骤，把需在微信平台确认的事项列为人工核对。',
    '3. 核验日期来自本机仓库记录，请复核官方来源中的当前要求。',
    '',
    '规则清单',
    ...rows,
    ...(unmatched ? [`另有 ${unmatched} 个不同规则 ID 未在目录中找到可用来源。`] : []),
    ...(rows.length < matched.length ? [`因篇幅限制省略 ${matched.length - rows.length} 条规则。`] : []),
  ].join('\n');

  const encoder = new TextEncoder();
  let summary = compose();
  while (rows.length && encoder.encode(summary).byteLength > maxBytes) {
    rows.pop();
    summary = compose();
  }
  return rows.length ? summary : null;
}
