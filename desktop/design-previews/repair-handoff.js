import { validateGuideItem } from './guide-contract.js';
import { escapeMarkdown as escape, formatRuleActions, formatRuleConfidence } from './guide-artifact.js';
import { validateMatchEvidence } from './explain-contract.js';
export { formatRuleActions };

export const MAX_HANDOFF_BYTES = 512 * 1024;
const kinds = { check: '代码预检发现', guide: '上线要求核对', explain: '拒因规则匹配' };
const ruleKeys = ['ruleId', 'title', 'stage', 'severity', 'why', 'requires', 'warn', 'official_url', 'source_quote', 'last_verified', 'manual_required', 'note', 'action_categories', 'confidence'];
const sourceKeys = ['artifactId', 'runId', 'projectId', 'projectRevision', 'contextRevision', 'kind', 'title', 'createdAt', 'toolVersion', 'rulesVersion'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, names) => record(value) && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
const optionalKeys = (value, required, optional) => record(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value, max = 512) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const revision = value => value === null || (Number.isSafeInteger(value) && value >= 0);
const error = () => new Error('交接文件格式不受支持或内容不完整，请选择有效的 Shipmate 修复交接 JSON。');

function validate(pack) {
  if (!keys(pack, ['format', 'version', 'source', 'scan', 'items']) || pack.format !== 'shipmate-repair-handoff' || pack.version !== 1) throw error();
  const s = pack.source;
  if (!optionalKeys(s, sourceKeys, ['provenance']) || (Object.hasOwn(s, 'provenance') && s.provenance !== 'imported') || !['artifactId', 'runId', 'title', 'toolVersion', 'rulesVersion'].every(key => text(s[key], key === 'rulesVersion' ? 16384 : 512))
    || !(s.projectId === null || text(s.projectId, 128)) || !revision(s.projectRevision) || !revision(s.contextRevision)
    || typeof s.kind !== 'string' || !Object.hasOwn(kinds, s.kind) || !Number.isSafeInteger(s.createdAt) || s.createdAt <= 0 || s.createdAt > 8640000000000000) throw error();
  if (s.kind === 'check') {
    if (!keys(pack.scan, ['complete', 'filesScanned']) || typeof pack.scan.complete !== 'boolean' || !Number.isSafeInteger(pack.scan.filesScanned) || pack.scan.filesScanned < 0) throw error();
  } else if (pack.scan !== null) throw error();
  if (!Array.isArray(pack.items) || pack.items.length > 500) throw error();
  const seen = new Set();
  for (const item of pack.items) {
    if (!optionalKeys(item, ['rule', 'conditional', 'rejectId', 'rejectSummary'], ['relevance', 'matchEvidence']) || !validateGuideItem(item.rule) || !validateMatchEvidence(item)
      || Object.keys(item.rule).some(key => !ruleKeys.includes(key)) || typeof item.conditional !== 'boolean'
      || (item.conditional && s.kind !== 'guide') || !(item.rejectId === null || text(item.rejectId))
      || !(item.rejectSummary === null || text(item.rejectSummary, 4096))
      || (s.kind !== 'explain' && (item.rejectId !== null || item.rejectSummary !== null || Object.hasOwn(item, 'relevance')))) throw error();
    const id = JSON.stringify([item.rule.ruleId, item.rejectId, item.conditional]);
    if (seen.has(id)) throw error();
    seen.add(id);
  }
  if (new globalThis.TextEncoder().encode(JSON.stringify(pack, null, 2)).byteLength > MAX_HANDOFF_BYTES) throw new Error('交接内容超过 512 KiB，请缩小报告范围后重试。');
  return pack;
}

/** Derive only from a stored structured artifact; never infer execution from prose. */
export function createHandoff(artifact) {
  const data = artifact?.data, result = data?.result;
  if (!record(artifact) || !record(data) || data.schemaVersion !== 1 || data.kind !== artifact.kind || result?.command !== artifact.kind
    || !Array.isArray(result.items) || (artifact.kind === 'guide' && !Array.isArray(result.selfCheck))) throw error();
  const source = Object.fromEntries(sourceKeys.map(key => [key, key === 'artifactId' ? artifact.id : artifact[key]]));
  if (artifact.provenance === 'imported') source.provenance = 'imported';
  const scan = artifact.kind === 'check' ? { complete: result.meta?.scan?.scope?.complete === true, filesScanned: result.meta?.scan?.filesScanned } : null;
  const rows = [...result.items.map(rule => ({ rule, conditional: false })), ...(result.selfCheck || []).map(rule => ({ rule, conditional: true }))];
  const items = rows.map(({ rule, conditional }) => ({
    rule: Object.fromEntries(ruleKeys.filter(key => Object.hasOwn(rule, key)).map(key => [key, rule[key]])),
    conditional, rejectId: rule.rejectId ?? null, rejectSummary: rule.rejectSummary ?? null,
    ...(Object.hasOwn(rule, 'relevance') || Object.hasOwn(rule, 'matchEvidence') ? { relevance: rule.relevance, matchEvidence: rule.matchEvidence } : {}),
  }));
  // Detach arrays from the source snapshot; exported data cannot mutate history.
  return validate(JSON.parse(JSON.stringify({ format: 'shipmate-repair-handoff', version: 1, source, scan, items })));
}

export function parseHandoff(value) {
  if (typeof value !== 'string' || value.length > MAX_HANDOFF_BYTES || new globalThis.TextEncoder().encode(value).byteLength > MAX_HANDOFF_BYTES) throw new Error('请选择不超过 512 KiB 的交接 JSON 文件。');
  let pack;
  try { pack = JSON.parse(value); } catch { throw error(); }
  return validate(pack);
}

export function handoffWarnings(pack, project, rulesVersion) {
  const warnings = [], source = pack.source;
  if (source.provenance === 'imported') warnings.push('外部导入报告 · 内容与执行情况未在本机核验；不能作为本机检查或修改授权。');
  if (source.projectId !== (project?.id ?? null)) warnings.push('当前项目与来源项目不同，无法核对项目版本。');
  else if (project) {
    if (source.projectRevision !== project.revision) warnings.push('项目版本已变化，请重新运行工具。');
    if (source.contextRevision !== project.contextRevision) warnings.push('项目事实已变化，请重新运行工具。');
  }
  if (!rulesVersion) warnings.push('当前规则版本不可用，无法核对来源依据。');
  else if (source.rulesVersion !== rulesVersion) warnings.push('规则资料已变化，请重新生成报告。');
  return warnings;
}

export function renderHandoffSections(value) {
  const pack = validate(value), s = pack.source;
  const basis = [
    '这是一份历史报告的交接建议，不是可执行补丁或操作授权。来源标识可供本机查找，外部文件中的标识本身不能证明真实性。', '',
    `来源：${kinds[s.kind]} · ${escape(s.title)}`, '',
    `成果：${escape(s.artifactId)} · 执行：${escape(s.runId)}`, '',
    `项目：${escape(s.projectId ?? '未归属')} · 项目版本 ${s.projectRevision ?? '无'} · 事实版本 ${s.contextRevision ?? '无'}`, '',
    `报告时间：${new Date(s.createdAt).toISOString()} · 工具 ${escape(s.toolVersion)}`, '',
    `规则版本：${escape(s.rulesVersion)}`, ''];
  const lines = ['报告未重新扫描当前文件，也未核实具体代码行号。处理前请核对当前项目与规则要求。', ''];
  if (s.provenance === 'imported') lines.unshift('外部导入报告 · 内容与执行情况未在本机核验。', '');
  if (pack.scan) lines.push(`扫描范围：${pack.scan.filesScanned} 个文件；${pack.scan.complete ? '当次扫描范围完整（不表示已覆盖全部规则）' : '扫描不完整，请处理扫描限制后重新预检'}。`, '');
  if (!pack.items.length) lines.push('没有可交接条目。这不代表审核通过或项目不存在问题；可重新预检、补充业务事实或更换拒因查询。', '');
  for (const [index, item] of pack.items.entries()) {
    const r = item.rule;
    lines.push(`## ${index + 1}. ${escape(r.title)}`, '',
      `问题 / 核对项：${item.conditional ? '条件自查，适用性尚未确认' : kinds[s.kind]} · ${{ blocker: '阻断', warning: '警告', info: '提示' }[r.severity]} · ${escape(r.ruleId)}`, '',
      `依据：${escape(r.why || '未提供具体发现依据，请人工核对适用性。')}`, '');
    lines.push(`操作类型：${formatRuleActions(r)}`, '');
    if (formatRuleConfidence(r, s.provenance === 'imported')) lines.push(formatRuleConfidence(r, s.provenance === 'imported'), '');
    if (item.rejectSummary) lines.push(`匹配拒因：${escape(item.rejectSummary)}（${escape(item.rejectId ?? '未记录编号')}）`, '');
    if (item.relevance) lines.push(`匹配相关性：${item.relevance === 'direct' ? '直接相关' : '可能相关'}（不表示已确认违规）`, '', `匹配依据：${[...item.matchEvidence.aliases, ...item.matchEvidence.codes, ...item.matchEvidence.partialAliases].map(escape).join('、')}`, '');
    if (r.source_quote) lines.push(`规则摘录：${escape(r.source_quote)}`, '');
    if (r.official_url) lines.push(`官方来源：<${new URL(r.official_url).href.replace(/[\s<>]/g, char => encodeURIComponent(char))}>`, '');
    else lines.push('官方来源：未提供，请自行核对。', '');
    lines.push(`资料记录日期：${escape(r.last_verified || '未记录')}（未实时核验）`, '', '### 期望结果', '',
      ...(r.requires.length ? r.requires.map(text => `- ${escape(text)}`) : ['- 对照官方要求确认适用性与处理方案。']), '', '### 验证步骤', '',
      '- 先核对以上要求与当前项目是否一致；条件不适用时记录原因，不擅自删除项目内容。',
      s.kind === 'check' ? '- 人工实施后重新运行代码预检，对比同一范围的报告，并验证实际功能；“未再检出”不等于修复已被证明。' : '- 逐项核对所需材料与实际业务；更新项目事实后重新生成对应报告。',
      r.manual_required ? '- 涉及官方后台的要求由本人核验，记录结果与证据。' : '- 记录实际验证步骤、结果与未解决项，交接包本身不记录完成状态。', '');
    if (r.warn || r.note) lines.push(`补充：${escape([r.warn, r.note].filter(Boolean).join('；'))}`, '');
  }
  return { basis: basis.join('\n'), content: lines.join('\n') };
}

export function exportHandoff(value, format) {
  const pack = validate(value);
  if (!['json', 'markdown'].includes(format)) throw error();
  const filename = `shipmate-handoff-${pack.source.createdAt}.${format === 'json' ? 'json' : 'md'}`;
  if (format === 'json') return { text: JSON.stringify(pack, null, 2), filename, mimeType: 'application/json;charset=utf-8' };
  const sections = renderHandoffSections(pack);
  return { text: ['# 修复交接', '', '**待人工审阅 · 未修改项目文件 · 未验证修复结果**', '', sections.content, '## 报告来源与版本', '', sections.basis].join('\n'), filename, mimeType: 'text/markdown;charset=utf-8' };
}
