import test from 'node:test';
import assert from 'node:assert/strict';
import { runExplain } from '../src/explain.mjs';
import { createExplainArtifact } from '../desktop/design-previews/explain-artifact.js';

test('real explain results export grouped rules with evidence and local matching limits', () => {
  const query = '隐私';
  const result = runExplain(query);
  const before = JSON.stringify(result);
  const artifact = createExplainArtifact(query, result);
  assert.equal(artifact.filename, 'shipmate-explain.md');
  assert.equal(artifact.mimeType, 'text/markdown;charset=utf-8');
  assert.ok(artifact.text.includes(`查询：${query}`));
  assert.match(artifact.text, /本地关键词匹配/);
  assert.match(artifact.text, /未实时核验官方规则/);
  for (const rejectId of new Set(result.items.map(item => item.rejectId))) {
    assert.equal(artifact.text.split(`拒因 ID：${rejectId}`).length - 1, 1);
  }
  for (const item of result.items) {
    assert.ok(artifact.text.includes(item.title));
    assert.ok(artifact.text.includes(`规则 ID：${item.ruleId}`));
    assert.ok(artifact.text.includes(item.last_verified));
    assert.ok(artifact.text.includes(new URL(item.official_url).href));
  }
  assert.equal(JSON.stringify(result), before);
});

test('empty matches retain query, notes and explicit empty state', () => {
  const query = 'no-such-rejection-xyz';
  const result = runExplain(query);
  const artifact = createExplainArtifact(query, result);
  assert.match(artifact.text, /未匹配到已收录的拒因/);
  assert.ok(artifact.text.includes(query));
  assert.match(artifact.text, /## 补充说明/);
  assert.ok(artifact.text.includes(result.notes[0]));
});

test('explain exports separate direct and possible matches with actionable categories', () => {
  const query = '手机号';
  const result = runExplain(query);
  const { text } = createExplainArtifact(query, result);
  assert.match(text, /直接相关/);
  assert.match(text, /匹配依据/);
  assert.match(text, /操作类型/);
  assert.doesNotMatch(text, /需由你本人完成要求与官方后台操作/);
  assert.doesNotMatch(text, /获取地理位置|头像昵称/);
  const broad = createExplainArtifact('测试', runExplain('测试')).text;
  assert.match(broad, /可能相关/);
});

test('invalid, oversized, mismatched and unsafe source results fail without leaking input', () => {
  const result = runExplain('隐私');
  for (const query of ['', ' ', null, 42, 'x'.repeat(4097), 'another query']) {
    assert.throws(() => createExplainArtifact(query, result), /无法生成拒因成果/);
  }
  assert.throws(() => createExplainArtifact('隐私', {}), /无法生成拒因成果/);
  for (const url of ['javascript:alert(1)', 'https://evil.test/private-secret', 'https://developers.weixin.qq.com@evil.test/']) {
    result.items[0].official_url = url;
    assert.throws(() => createExplainArtifact('隐私', result), error => /无法生成拒因成果/.test(error.message) && !error.message.includes('secret'));
  }
});

test('all free text is inert Markdown while trusted sources remain links', () => {
  const query = '诱导分享\n# injected [click](javascript:evil) <img src=x>';
  const result = runExplain(query);
  const item = result.items[0];
  const hostile = 'value\n# injected [click](javascript:evil) <img src=x> &lt;script&gt; **bold**';
  item.rejectSummary = hostile;
  item.title = hostile;
  item.why = `WHY ${hostile}`;
  item.requires = [`REQUIRES ${hostile}`];
  item.warn = `WARN ${hostile}`;
  item.note = `NOTE ${hostile}`;
  item.source_quote = `QUOTE ${hostile}`;
  item.manual_required = true;
  item.official_url = 'https://developers.weixin.qq.com/path?q=<script>';
  result.notes = [`NOTES ${hostile}`];
  const { text } = createExplainArtifact(query, result);
  for (const marker of ['WHY', 'REQUIRES', 'WARN', 'NOTE', 'QUOTE', 'NOTES']) assert.ok(text.includes(marker));
  assert.doesNotMatch(text, /<img|<script>|\n# injected|\[click\]\(javascript/);
  assert.ok(text.includes('\\[click\\]'));
  assert.ok(text.includes('&amp;lt;script&amp;gt;'));
  assert.ok(text.includes('<https://developers.weixin.qq.com/path?q=%3Cscript%3E>'));
  assert.match(text, /人工确认：是/);
});
