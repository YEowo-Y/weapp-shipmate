import { deriveWorkflow } from '../../src/workflow.mjs';
import { escapeMarkdown as escape, formatRuleConfidence } from './guide-artifact.js';
import { GUIDE_SUBJECTS } from './guide-contract.js';

const states = {confirmed:'人工已确认', not_applicable:'人工不适用', pending:'待确认', unknown:'事实待补充', stale:'待重检'};
const fact = value => value == null ? '尚未确认' : value ? '是' : '否';
function sourceLines(source) {
  const lines = [];
  try {
    const url = new URL(source.url);
    if (url.protocol === 'https:' && !url.username && !url.password) lines.push(`官方来源：<${url.href.replace(/[\s<>]/g, char => encodeURIComponent(char))}>`);
  } catch { /* Missing or invalid links are not rendered as clickable sources. */ }
  if (source.quote) lines.push(`规则摘录：${escape(source.quote)}`);
  lines.push(`资料记录日期：${escape(source.lastVerified || '未记录')}（未实时核验）`, '');
  return lines;
}

/** Export the loaded saved snapshot only; never infer confirmation from draft input. */
export function createWorkflowArtifact(snapshot, exportedAt = Date.now()) {
  const model = deriveWorkflow(snapshot), {project, rulesVersion, catalog} = snapshot;
  const facts = project.facts || {};
  const manifests = new Map();
  function versionLabel(version) {
    if (!version) return '未记录';
    if (manifests.has(version)) return manifests.get(version).label;
    let files;
    try { files = Object.entries(JSON.parse(version)); } catch { return escape(version); }
    if (!files.length || !files.every(([, hash]) => typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash))) return escape(version);
    const label = `清单 ${manifests.size + 1}（见文末）`;
    manifests.set(version, {label, files});
    return label;
  }
  const lines = ['# 上线准备清单', '',
    '本清单为已加载的保存记录快照；未保存草稿不包含。人工确认不代表官方审核或发布完成。未重新扫描项目，也未实时核验官方规则。', '',
    `项目：${escape(project.name)}`, '', `导出时间：${new Date(exportedAt).toISOString()}`, '',
    `项目版本：${project.revision} · 事实版本：${project.contextRevision ?? 0}`, '',
    `规则版本：${versionLabel(rulesVersion)}`, '', '## 已保存的项目事实', '',
    `主体：${GUIDE_SUBJECTS[project.subject] || '尚未确认'}`, '',
    `实际业务：${escape(facts.businessType || '尚未填写')}`, '',
    `涉及支付：${fact(facts.hasPayment)}`, '', `收集敏感信息：${fact(facts.collectsSensitive)}`, '',
    `服务器域名：${fact(facts.hasServerDomain)}`, '', '## 下一步', '',
    model.nextAction ? `${escape(model.nextAction.title)}：${escape(model.nextAction.description)}` : '所有阶段已人工标记，仍需以官方平台实际状态为准。', ''];
  const rules = new Map(catalog.rules.map(rule => [rule.id, rule]));
  for (const stage of model.stages) {
    lines.push(`## ${escape(stage.title)}`, '', `状态：${states[stage.status]}`, '', escape(stage.coverage.note), '');
    if (stage.status !== 'confirmed' && stage.status !== 'not_applicable') lines.push(escape(stage.action), '');
    const stageSource = catalog.stages.find(entry => entry.stage === stage.id);
    if (stageSource.official_url) lines.push(...sourceLines({url:stageSource.official_url, quote:stageSource.source_quote, lastVerified:stageSource.last_verified}));
    if (stage.blockedBy.length) lines.push(`前置阶段待处理：${stage.blockedBy.map(id => escape(model.stages.find(item => item.id === id)?.title || id)).join('、')}`, '');
    if (stage.confirmation) {
      const record = stage.confirmation;
      const imported = record.provenance === 'imported';
      const history = imported ? `备份记录（未在本机核验）：${['confirmed', 'pending', 'not_applicable'].includes(record.sourceState) ? states[record.sourceState] : '未记录'}` : `历史记录：${states[record.state]}`;
      const recordedAt = new Date(record.recordedAt);
      lines.push(`${history} · ${Number.isFinite(recordedAt.getTime()) ? recordedAt.toISOString() : '记录日期未知'}`, '',
        `记录依据：事实版本 ${record.contextRevision} · 规则版本 ${versionLabel(record.rulesVersion)}`, '',
        `${imported ? '备份备注' : '核对备注'}：${escape(record.note || '无备注')}`, '');
    }
    for (const item of stage.items) {
      lines.push(`### ${escape(item.title)}`, '', `规则 ID：${escape(item.ruleId)}`, '',
        item.conditional ? '条件要求：适用性尚未确认，请按实际业务核对。' : '准备要求：仍需逐项人工核对。', '');
      if (item.signal?.length) lines.push(`条件线索：${item.signal.map(escape).join('、')}`, '');
      const rule = rules.get(item.ruleId);
      const confidence = formatRuleConfidence(rule);
      if (confidence) lines.push(confidence, '');
      lines.push(...item.requires.map(value => `- ${escape(value)}`), '',
        ...sourceLines({url:rule.official_url, quote:rule.source_quote, lastVerified:rule.last_verified}));
    }
  }
  lines.push('## 类目与资质线索', '', '以下仅为待核对线索，不是类目判定。未匹配不表示无需资质。', '');
  if (!model.categoryCandidates.length) lines.push('暂无匹配线索，请根据实际业务对照官方服务类目。', '');
  for (const item of model.categoryCandidates) {
    lines.push(`### ${escape(item.title)}`, '', `规则 ID：${escape(item.ruleId)}`, '', escape(item.reason), '',
      ...item.requires.map(value => `- ${escape(value)}`), '',
      ...sourceLines({url:item.official_url,lastVerified:item.last_verified}));
  }
  if (manifests.size) lines.push('## 规则版本明细', '');
  for (const [index, {files}] of [...manifests.values()].entries()) {
    lines.push(`### 清单 ${index + 1}`, '', ...files.map(([name, hash]) => `- ${escape(name)} · ${hash}`), '');
  }
  return {text:lines.join('\n'), filename:`shipmate-workflow-${exportedAt}.md`, mimeType:'text/markdown;charset=utf-8'};
}
