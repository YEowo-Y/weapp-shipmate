import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuide } from '../src/guide.mjs';
import { createGuideArtifact } from '../desktop/design-previews/guide-artifact.js';
import { GUIDE_SUBJECTS } from '../desktop/design-previews/guide-contract.js';
const input = { subject: 'personal', sensitive: true, domain: true };
const resultFor = input => runGuide({ subject_type: input.subject, collects_sensitive: input.sensitive, has_server_domain: input.domain }, { includeDrafts: false });
test('all twelve input combinations export every rule and preserve the original JSON without mutation', () => {
  for (const subject of Object.keys(GUIDE_SUBJECTS)) for (const sensitive of [true, false]) for (const domain of [true, false]) {
    const input = { subject, sensitive, domain }; const result = resultFor(input); const before = JSON.stringify({ input, result });
    const md = createGuideArtifact(input, result, 'markdown');
    assert.equal(md.filename, `shipmate-guide-${subject}.md`); assert.equal(md.mimeType, 'text/markdown;charset=utf-8');
    assert.match(md.text, /## 适用项/); assert.match(md.text, /## 条件自查项/); assert.match(md.text, /是否适用尚未确认/);
    for (const item of [...result.items, ...result.selfCheck]) assert.equal(md.text.split(`规则 ID：${item.ruleId}`).length - 1, 1, item.ruleId);
    assert.ok(md.text.includes(`主体：${GUIDE_SUBJECTS[subject]}`));
    assert.ok(md.text.includes(`收集敏感信息：${sensitive ? '是' : '否'}`));
    assert.ok(md.text.includes(`使用服务器域名：${domain ? '是' : '否'}`));
    assert.match(md.text, /未扫描项目/); assert.match(md.text, /未实时核验/);
    const json = createGuideArtifact(input, result, 'json');
    assert.equal(json.filename, `shipmate-guide-${subject}.json`); assert.equal(json.mimeType, 'application/json;charset=utf-8');
    assert.equal(json.text, JSON.stringify(result, null, 2)); assert.equal(JSON.stringify({ input, result }), before);
  }
});
test('all explanatory fields remain available and markdown cannot inject HTML, links, or headings', () => {
  const result = resultFor(input); const item = result.items[0];
  item.title = '<img src=x onerror=alert(1)> [click](javascript:evil)'; item.why = 'WHY'; item.warn = 'WARN'; item.note = 'NOTE'; item.source_quote = 'QUOTE';
  item.requires = ['first\n# injected', '&lt;script&gt;', '**bold**']; item.official_url = 'https://developers.weixin.qq.com/path?q=<script>';
  const md = createGuideArtifact(input, result, 'markdown');
  for (const word of ['WHY', 'WARN', 'NOTE', 'QUOTE']) assert.ok(md.text.includes(word));
  assert.doesNotMatch(md.text, /<img|<script>|\n# injected|\[click\]\(javascript/);
  assert.ok(md.text.includes('&lt;img')); assert.ok(md.text.includes('\\[click\\]'));
  assert.ok(md.text.includes('first \\# injected')); assert.ok(md.text.includes('&amp;lt;script&amp;gt;'));
  assert.ok(md.text.includes('<https://developers.weixin.qq.com/path?q=%3Cscript%3E>'));
  assert.ok(md.text.includes(item.last_verified)); assert.match(md.text, /人工确认/);
});
test('invalid inputs, results, source URLs and formats fail with safe errors', () => {
  const result = resultFor(input);
  for (const args of [[{}, result, 'markdown'], [input, {}, 'json'], [input, result, 'html'], [input, result, undefined]]) assert.throws(() => createGuideArtifact(...args), /无法生成清单成果/);
  result.items[0].official_url = 'https://evil.test/private-secret';
  assert.throws(() => createGuideArtifact(input, result, 'markdown'), error => /无法生成清单成果/.test(error.message) && !error.message.includes('secret'));
});


test('exports preserve section membership and do not import sample stage completion states', () => {
  const result = resultFor(input);
  const md = createGuideArtifact(input, result, 'markdown').text;
  const split = md.indexOf('## 条件自查项');
  for (const item of result.items) assert.ok(md.indexOf(`规则 ID：${item.ruleId}`) < split);
  for (const item of result.selfCheck) assert.ok(md.indexOf(`规则 ID：${item.ruleId}`) > split);
  assert.doesNotMatch(md, /status:|status：|状态：已完成/);
  const empty = { command: 'guide', meta: { summary: 'empty' }, items: [], selfCheck: [], notes: [] };
  assert.equal(createGuideArtifact(input, empty, 'markdown').text.split('暂无条目。').length - 1, 2);
});


test('imported guide exports retain external provenance without changing local exports or input', () => {
  const result = resultFor(input), before = JSON.stringify(result);
  const md = createGuideArtifact(input, result, 'markdown', { provenance: 'imported' });
  assert.match(md.text, /导入历史.*外部会话备份.*未在本机核验/);
  assert.doesNotMatch(md.text, /本清单依据仓库收录规则生成|仓库记录的核验日期/);
  const json = JSON.parse(createGuideArtifact(input, result, 'json', { provenance: 'imported' }).text);
  assert.match(json.notes[0], /导入历史.*外部会话备份.*未在本机核验/);
  assert.deepEqual(json.items, result.items);
  assert.deepEqual(json.notes.slice(1), result.notes);
  assert.equal(JSON.stringify(result), before);
  assert.equal(createGuideArtifact(input, result, 'json').text, JSON.stringify(result, null, 2));
  assert.match(createGuideArtifact(input, result, 'markdown').text, /本清单依据仓库收录规则生成/);
});
