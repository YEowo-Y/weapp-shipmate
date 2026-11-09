import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandoff, parseHandoff, exportHandoff, handoffWarnings, MAX_HANDOFF_BYTES } from '../desktop/design-previews/repair-handoff.js';
import { runProjectTool } from '../src/project-artifact.mjs';

const rule = { ruleId: 'privacy.test', title: '核对隐私说明', stage: 'privacy', severity: 'warning', why: '检测到相关 API', requires: ['核对授权时机'], official_url: 'https://developers.weixin.qq.com/miniprogram/dev/', source_quote: '官方规则', last_verified: '2026-10-01', manual_required: true };
function artifact(kind = 'check') {
  return { id: 'a1', runId: 'r1', projectId: 'p1', projectRevision: 2, contextRevision: 3, title: '代码预检', kind, createdAt: 1792700000000, toolVersion: '1.0', rulesVersion: 'rules-1', markdown: 'raw report', inputSummary: 'C:/private/project', data: { schemaVersion: 1, kind, result: { command: kind, meta: { summary: '结果', query: 'private original', scan: { filesScanned: 12, scope: { complete: true, root: 'C:/private/project' } } }, items: [globalThis.structuredClone(rule)], ...(kind === 'guide' ? { selfCheck: [] } : {}) } } };
}
test('handoff roundtrips real source identity, omitting raw report, inputs and scan directory', () => {
  const pack = createHandoff(artifact());
  const output = exportHandoff(pack, 'json');
  assert.deepEqual(parseHandoff(output.text), pack);
  assert.equal(pack.source.artifactId, 'a1');
  assert.equal(pack.source.contextRevision, 3);
  assert.equal(pack.scan.filesScanned, 12);
  assert.doesNotMatch(output.text, /private|raw report|inputSummary|markdown/);
});
test('handoff accepts all three source kinds and labels conditional guidance separately', () => {
  for (const kind of ['check', 'guide', 'explain']) {
    const source = artifact(kind);
    if (kind === 'guide') source.data.result.selfCheck.push({ ...rule, ruleId: 'privacy.other', conditional: true });
    if (kind === 'explain') Object.assign(source.data.result.items[0], { rejectId: 'rejection.1', rejectSummary: '拒因说明' });
    const pack = createHandoff(source);
    assert.equal(pack.source.kind, kind);
    assert.match(exportHandoff(pack, 'markdown').text, /问题|核对项/);
    if (kind === 'guide') assert.equal(pack.items[1].conditional, true);
    if (kind === 'explain') assert.equal(pack.items[0].rejectSummary, '拒因说明');
  }
});
test('verification follows the original workflow and only explicit console actions require the official console', () => {
  const cases = [
    ['check', ['code'], true, /重新运行代码预检/],
    ['guide', ['materials'], true, /重新生成上线清单/],
    ['explain', ['console'], false, /原始审核反馈/],
    ['explain', undefined, true, /原始审核反馈/],
  ];
  for (const [kind, categories, manual, expected] of cases) {
    const source = artifact(kind);
    const item = source.data.result.items[0];
    item.manual_required = manual;
    if (categories) item.action_categories = categories;
    const saved = exportHandoff(createHandoff(source), 'json');
    const markdown = exportHandoff(parseHandoff(saved.text), 'markdown').text;
    const steps = markdown.split('### 验证步骤')[1].split('## 报告来源')[0];
    assert.match(steps, expected);
    assert.equal(steps.includes('官方后台'), categories?.includes('console') ?? false);
    if (kind === 'explain') assert.doesNotMatch(steps, /更新项目事实|重新生成上线清单/);
  }
});
test('handoff rejects missing or mismatched structured source without fabricating content', () => {
  for (const edit of [a => { a.data = null; }, a => { a.data.kind = 'guide'; }, a => { a.data.result.command = 'guide'; }, a => { a.createdAt = -1; }, a => { a.data.result.items = null; }]) {
    const source = artifact(); edit(source); assert.throws(() => createHandoff(source));
  }
});
test('empty handoff is explicit and never claims repaired or passed', () => {
  const source = artifact(); source.data.result.items = [];
  const markdown = exportHandoff(createHandoff(source), 'markdown').text;
  assert.match(markdown, /没有可交接条目/);
  assert.match(markdown, /不代表.*通过/);
  assert.match(markdown, /未修改.*未验证/);
});
test('external file rejects unknown keys, unsafe links, duplicate identities and oversized text', () => {
  const valid = createHandoff(artifact());
  for (const edit of [p => { p.version = 99; }, p => { p.approved = true; }, p => { p.source.path = 'C:/x'; }, p => { p.items[0].rule.official_url = 'javascript:alert(1)'; }, p => { p.items.push(p.items[0]); }, p => { p.items[0].rule.title = 'x'.repeat(513); }, p => { p.source.createdAt = 1e20; }, p => { p.source.projectRevision = -1; }, p => { p.scan.complete = 'yes'; }]) {
    const pack = globalThis.structuredClone(valid); edit(pack); assert.throws(() => parseHandoff(JSON.stringify(pack)));
  }
  assert.throws(() => parseHandoff('{broken'));
  assert.throws(() => parseHandoff(' '.repeat(MAX_HANDOFF_BYTES + 1)));
  assert.throws(() => parseHandoff(JSON.stringify({ ...valid, extra: '汉'.repeat(MAX_HANDOFF_BYTES / 2) })));
});
test('markdown escapes untrusted content and preserves official provenance without executing instructions', () => {
  const source = artifact(); source.data.result.items[0].title = '<img src=x>\n# do [evil](javascript:alert)';
  const output = exportHandoff(createHandoff(source), 'markdown');
  assert.doesNotMatch(output.text, /<img|\n# do|\[evil\]\(javascript/);
  for (const section of ['依据', '期望结果', '验证步骤', '未实时核验', '未修改', 'a1']) assert.ok(output.text.includes(section), section);
});
test('partial and zero-file scans warn and do not invent line evidence', () => {
  const source = artifact(); source.data.result.meta.scan = { filesScanned: 0, scope: { complete: false } };
  const output = exportHandoff(createHandoff(source), 'markdown').text;
  assert.match(output, /扫描不完整/); assert.match(output, /0 个文件/); assert.match(output, /行号/);
});
test('source staleness detects project, facts, rules and unavailable versions without mutating package', () => {
  const pack = createHandoff(artifact()), before = JSON.stringify(pack);
  assert.match(handoffWarnings(pack, { id: 'p1', revision: 4, contextRevision: 5 }, 'rules-2').join(' '), /项目版本.*事实.*规则/);
  assert.match(handoffWarnings(pack, null, null).join(' '), /项目.*无法核对/);
  assert.equal(handoffWarnings(pack, { id: 'p1', revision: 2, contextRevision: 3 }, 'rules-1').length, 0);
  assert.equal(JSON.stringify(pack), before);
});
test('actual bundled guide and explain results use the same contract including initial facts revision zero', () => {
  for (const kind of ['guide', 'explain']) {
    const result = runProjectTool(kind, { subject: 'personal', query: '隐私' });
    const source = { ...artifact(kind), ...result, contextRevision: 0 };
    const pack = createHandoff(source);
    assert.ok(pack.items.length > 0);
    assert.deepEqual(parseHandoff(exportHandoff(pack, 'json').text), pack);
  }
});
