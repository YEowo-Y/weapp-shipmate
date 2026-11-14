import { validateExplainInput, validateExplainResult } from './explain-contract.js';
import { escapeMarkdown, formatRuleActions, formatRuleConfidence } from './guide-artifact.js';

function renderRule(item) {
  const lines = [`### ${escapeMarkdown(item.title)}`, '',
    `规则 ID：${escapeMarkdown(item.ruleId)}`, '',
    `级别：${{ blocker: '阻断', warning: '警告', info: '提示' }[item.severity]}`, '', `操作类型：${formatRuleActions(item)}`, ''];
  if (formatRuleConfidence(item)) lines.push(formatRuleConfidence(item), '');
  if (item.matchEvidence) lines.push(`匹配依据：${[...item.matchEvidence.aliases, ...item.matchEvidence.codes, ...item.matchEvidence.partialAliases].map(escapeMarkdown).join('、')}`, '');
  for (const [field, label] of [['why', '原因'], ['warn', '提醒'], ['note', '说明']]) {
    if (item[field]) lines.push(`${label}：${escapeMarkdown(item[field])}`, '');
  }
  lines.push('要求：', '', ...(item.requires.length
    ? item.requires.map(requirement => `- ${escapeMarkdown(requirement)}`)
    : ['- 未提供细化要求，请按官方指引人工核对。']), '',
  `人工确认：${item.manual_required ? '是，按操作类型处理后核对实际结果。' : '否，仍需结合实际项目核对；不表示已完成。'}`, '');
  if (item.source_quote) lines.push(`官方原文摘录：${escapeMarkdown(item.source_quote)}`, '');
  // Validation restricts sources to supported official HTTPS origins.
  const url = item.official_url ? new URL(item.official_url).href.replace(/[\s<>]/g, char => encodeURIComponent(char)) : null;
  lines.push(`官方来源：${url ? `<${url}>` : '未提供，请自行核对官方指引。'}`, '',
    `仓库记录的核验日期：${escapeMarkdown(item.last_verified || '未记录')}（未实时核验）`, '');
  return lines;
}

export function createExplainArtifact(query, result) {
  if (!validateExplainInput({ query }).ok || !validateExplainResult(result, query).ok) {
    throw new Error('无法生成拒因成果，请重新查询有效结果后重试。');
  }
  const lines = ['# 小程序拒因查询结果', '',
    '本结果依据仓库收录规则进行本地关键词匹配，未扫描项目，未实时核验官方规则。匹配仅供定位，不表示已确认拒因、已合规或保证过审；相关要求与官方后台操作需由你本人核对。', '',
    `查询：${escapeMarkdown(query)}`, '', `摘要：${escapeMarkdown(result.meta.summary)}`, ''];
  const groups = new Map();
  for (const item of [...result.items].sort((a, b) => Number(b.relevance === 'direct') - Number(a.relevance === 'direct'))) {
    if (!groups.has(item.rejectId)) groups.set(item.rejectId, []);
    groups.get(item.rejectId).push(item);
  }
  let relevance;
  for (const [rejectId, items] of groups) {
    const next = items[0].relevance === 'direct' ? '直接相关' : '可能相关';
    if (next !== relevance) { lines.push(`## ${next}`, '', '相关性仅说明文本匹配，不表示已确认项目违规。', ''); relevance = next; }
    lines.push(`### ${escapeMarkdown(items[0].rejectSummary)}`, '', `拒因 ID：${escapeMarkdown(rejectId)}`, '');
    for (const item of items) lines.push(...renderRule(item));
  }
  if (!result.items.length) lines.push('未匹配到已收录的拒因，请尝试审核反馈中的关键词。', '');
  if (result.notes.length) lines.push('## 补充说明', '', ...result.notes.map(note => `- ${escapeMarkdown(note)}`), '');
  return { text: lines.join('\n'), mimeType: 'text/markdown;charset=utf-8', filename: 'shipmate-explain.md' };
}
