// Fixed preview-only contract. Production tool results must be validated at the server boundary.
export function createDemoResult() {
  return {
    simulation: true,
    subject: 'personal',
    counts: { warning: 1, info: 1 },
    issues: [
      { severity: 'warning', ruleId: 'DEMO-PRIVACY-001', title: '示例位置接口缺少用途声明', file: 'app.json' },
      { severity: 'info', ruleId: 'DEMO-SUBJECT-001', title: '示例主体为个人，请核对服务类目', file: 'project.config.json' },
    ],
  };
}

export function validateDemoResult(value) {
  const record = item => item !== null && typeof item === 'object' && !Array.isArray(item) && Object.getPrototypeOf(item) === Object.prototype;
  const keys = (item, expected) => record(item) && Object.keys(item).length === expected.length && expected.every(key => Object.hasOwn(item, key));
  const invalid = () => ({ ok: false, error: '本地演示结果格式校验失败；未生成结果卡或审批请求。' });
  if (!keys(value, ['simulation', 'subject', 'counts', 'issues']) || value.simulation !== true || value.subject !== 'personal') return invalid();
  if (!keys(value.counts, ['warning', 'info']) || !Array.isArray(value.issues) || value.issues.length > 20) return invalid();
  const counts = { warning: 0, info: 0 };
  const ruleIds = new Set();
  for (const issue of value.issues) {
    if (!keys(issue, ['severity', 'ruleId', 'title', 'file']) || typeof issue.severity !== 'string' || !Object.hasOwn(counts, issue.severity)) return invalid();
    if (typeof issue.ruleId !== 'string' || !/^DEMO-[A-Z]+-\d{3}$/.test(issue.ruleId) || ruleIds.has(issue.ruleId)) return invalid();
    if (typeof issue.title !== 'string' || !issue.title.trim() || issue.title.length > 240) return invalid();
    if (!['app.json', 'project.config.json'].includes(issue.file)) return invalid();
    ruleIds.add(issue.ruleId);
    counts[issue.severity] += 1;
  }
  if (Object.keys(counts).some(key => !Number.isInteger(value.counts[key]) || value.counts[key] !== counts[key])) return invalid();
  return { ok: true };
}
