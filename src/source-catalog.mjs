import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadData } from './data.mjs';
import { crossChecks, CROSSCHECK_ALL_HIT_SCAN, CROSSCHECK_RULE_IDS } from './crosscheck.mjs';
import { sha256 } from './source-text.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SOURCE_HOSTS = new Set(['developers.weixin.qq.com', 'pay.weixin.qq.com']);
export function officialSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) throw new Error('Invalid official source');
  const url = new URL(value);
  if (url.protocol !== 'https:' || !SOURCE_HOSTS.has(url.hostname) || url.username || url.password || url.port) throw new Error('Invalid official source');
  return url;
}

export function loadSourceReferences({ root = ROOT } = {}) {
  const { rules, flow } = loadData({ root, includeDrafts: true });
  const rejections = yaml.load(readFileSync(join(root, 'rejections.yaml'), 'utf8')).rejections ?? [];
  const cross = crossChecks(CROSSCHECK_ALL_HIT_SCAN).map((item) => ({ ...item, id: item.ruleId }));
  if (CROSSCHECK_RULE_IDS.some((id) => !cross.some((item) => item.id === id))) throw new Error('Incomplete crosscheck source catalog');
  return [...rules, ...cross.map((item) => ({...item, _file: 'src/crosscheck.mjs'})),
    ...flow.map((item) => ({ ...item, id: `flow:${item.stage}`, _file: 'flow.yaml' })),
    ...rejections.map((item) => ({ ...item, id: `rejections:${item.id}`, title: item.summary, _file: 'rejections.yaml' })),
  ];
}

// 引文门禁只核验 YAML 规则和内联核验项，流程及拒绝案例使用各自的来源约定。
export function loadRuleReferences({ includeDrafts = false, root = ROOT } = {}) {
  return loadSourceReferences({ root }).filter((item) =>
    (item._file.startsWith('rules/') || item._file === 'src/crosscheck.mjs') &&
    (includeDrafts || !item.draft));
}

export function createSourceCatalog({ root = ROOT } = {}) {
  const monitored = loadSourceReferences({ root });
  const byRule = new Map(monitored.map((item) => [item.id, item]));
  const items = monitored.flatMap((item) => {
    if (item.official_url) return [item];
    const linked = item.id.startsWith('rejections:') ? (item.rules ?? []).map((id) => byRule.get(id))
      : item.id.startsWith('flow:') ? monitored.filter((rule) => rule._file?.startsWith('rules/') && rule.stage === item.stage) : [];
    const urls = [...new Set(linked.map((rule) => rule?.official_url).filter(Boolean))];
    return urls.map((url) => ({ ...item, official_url: url }));
  });
  const snapshots = JSON.parse(readFileSync(join(root, 'corpus/source-snapshots/index.json'), 'utf8'));
  const baselines = new Map(snapshots.snapshots.map((item) => [item.url, item]));
  const groups = new Map();
  for (const item of items) {
    if (!item.official_url) continue;
    officialSourceUrl(item.official_url);
    const refs = groups.get(item.official_url) ?? [];
    if (!refs.some((ref) => ref.id === item.id)) refs.push({ id: item.id, title: item.title || item.id,
      lastVerified: typeof item.last_verified === 'string' ? item.last_verified : null, draft: Boolean(item.draft) });
    groups.set(item.official_url, refs);
  }
  if (groups.size > 128) throw new Error('Source catalog limit exceeded');
  const sources = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([url, references]) => {
    references.sort((a, b) => a.id.localeCompare(b.id));
    const old = baselines.get(url);
    if (old && (!/^[a-f0-9]{64}$/.test(old.sha256) || !['fetch', 'manual'].includes(old.method) || typeof old.fetched_at !== 'string')) throw new Error('Invalid source baseline');
    return { id: `source-${sha256(url).slice(0, 16)}`, url, title: references[0].title, references,
      baseline: old ? { hash: old.sha256, fetchedAt: old.fetched_at, method: old.method } : null };
  });
  const payload = { schemaVersion: 1, staleDays: 180, sources };
  const inputs = ['flow.yaml', 'rejections.yaml', 'src/crosscheck.mjs', 'corpus/source-snapshots/index.json',
    ...readdirSync(join(root, 'rules')).filter((file) => file.endsWith('.yaml')).map((file) => `rules/${file}`)].sort();
  const files = inputs.map((file) => [file, sha256(readFileSync(join(root, file)))]);
  return { schemaVersion: 1, catalogVersion: sha256(JSON.stringify({ payload, files })), staleDays: 180, sources };
}
