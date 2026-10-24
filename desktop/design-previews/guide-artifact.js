import { GUIDE_SUBJECTS, validateGuideInput, validateGuideResult } from './guide-contract.js';
import { STAGES } from './stages.js';

// Match the CLI report's inline escaping without importing its filesystem-based
// rule loader. Newlines/control characters cannot introduce Markdown blocks.
export function escapeMarkdown(value) {
  return String(value).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([`*_[\]{}()#+!|~])/g, '\\$1');
}
function renderItem(item, conditional) {
  const lines = [`#### ${escapeMarkdown(item.title)}`, '', `规则 ID：${escapeMarkdown(item.ruleId)}`, '',
    `级别：${{ blocker: '阻断', warning: '警告', info: '提示' }[item.severity]}；${conditional ? '是否适用尚未确认，请按业务自查。' : '按所填输入列出，仍需逐项确认。'}`, ''];
  for (const [field, label] of [['why', '原因'], ['warn', '提醒'], ['note', '说明']]) {
    if (item[field]) lines.push(`${label}：${escapeMarkdown(item[field])}`, '');
  }
  lines.push('要求：', '', ...(item.requires.length ? item.requires.map(requirement => `- ${escapeMarkdown(requirement)}`) : ['- 未提供细化要求，请按官方指引人工核对。']), '');
  if (item.source_quote) lines.push(`官方原文摘录：${escapeMarkdown(item.source_quote)}`, '');
  if (item.signal !== undefined) lines.push(`自查线索（仅供人工判断）：${escapeMarkdown(JSON.stringify(item.signal))}`, '');
  // The shared validator has already restricted the origin and HTTPS scheme.
  const url = item.official_url ? new URL(item.official_url).href.replace(/[\s<>]/g, char => encodeURIComponent(char)) : null;
  lines.push(`官方来源：${url ? `<${url}>` : '未提供，请自行核对官方指引。'}`, '',
    `仓库记录的核验日期：${escapeMarkdown(item.last_verified || '未记录')}（未实时核验）`, '',
    `人工确认：${item.manual_required ? '需由你本人完成要求与官方后台操作。' : '仍需结合实际项目核对；本清单不记录完成状态。'}`, '');
  return lines;
}
function renderSection(title, items, conditional) {
  const lines = [`## ${title}`, '', conditional ? '以下条目是否适用尚未确认，不作为已确认的阻断或完成结果。' : '以下条目按输入生成，尚未核对项目实际实现。', ''];
  if (!items.length) lines.push('暂无条目。', '');
  for (const { id, title: stageTitle } of STAGES) {
    const stageItems = items.filter(item => item.stage === id);
    if (!stageItems.length) continue;
    lines.push(`### ${escapeMarkdown(stageTitle)}`, '');
    for (const item of stageItems) lines.push(...renderItem(item, conditional));
  }
  return lines;
}
export function createGuideArtifact(input, result, format) {
  if (!['markdown', 'json'].includes(format) || !validateGuideInput(input).ok || !validateGuideResult(result).ok) throw new Error('无法生成清单成果，请重新生成有效清单后重试。');
  if (format === 'json') return { text: JSON.stringify(result, null, 2), mimeType: 'application/json;charset=utf-8', filename: `shipmate-guide-${input.subject}.json` };
  const lines = ['# 小程序上线清单', '',
    '本清单依据仓库收录规则生成，未扫描项目，未实时核验官方规则。不构成合规担保，不表示已合规或保证过审；提交、认证、备案和发布需由你本人完成。', '',
    `主体：${GUIDE_SUBJECTS[input.subject]}`, '', `收集敏感信息：${input.sensitive ? '是' : '否'}`, '', `使用服务器域名：${input.domain ? '是' : '否'}`, '',
    `摘要：${escapeMarkdown(result.meta.summary)}`, '',
    ...renderSection('适用项', result.items, false), ...renderSection('条件自查项', result.selfCheck, true)];
  if (result.notes.length) lines.push('## 补充说明', '', ...result.notes.map(note => `- ${escapeMarkdown(note)}`), '');
  return { text: lines.join('\n'), mimeType: 'text/markdown;charset=utf-8', filename: `shipmate-guide-${input.subject}.md` };
}
