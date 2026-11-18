import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceCatalog } from '../src/source-catalog.mjs';
import { loadDesktopModule } from './helpers/react-desktop.mjs';

const { createAgentHandoffSummary } = loadDesktopModule('src/handoff-summary.ts');
const official = 'https://developers.weixin.qq.com/miniprogram/product/reject.html';
const date = '2026-11-13';
const privateText = 'private-fixture-canary';
const reference = (id, title = '测试账号要求') => ({ id, title, draft: false, lastVerified: date });
const snapshot = references => ({ catalog: { schemaVersion: 1, sources: [{ url: official, references }] } });
const pack = (kind = 'check', ids = ['review.test-account']) => ({
  format: 'shipmate-repair-handoff',
  version: 1,
  source: { kind, projectId: privateText, title: privateText, rulesVersion: privateText },
  scan: { scope: privateText, project: privateText },
  items: ids.map(ruleId => ({
    rule: {
      ruleId, title: privateText, why: privateText, requires: [privateText], warn: privateText,
      official_url: privateText, source_quote: privateText, last_verified: privateText,
    },
    conditional: false, rejectSummary: privateText, matchEvidence: privateText,
  })),
  inputSummary: privateText,
  markdown: privateText,
});
const listed = text => text.split('\n').filter(line => line.startsWith('- '));

test('copies only packaged fields for each report kind, retaining human review steps', () => {
  const fixtures = [['check', '项目预检'], ['explain', '拒因反查'], ['guide', '上线清单']];
  for (const [kind, label] of fixtures) {
    const output = createAgentHandoffSummary(pack(kind), snapshot([reference('review.test-account')]));
    assert.ok(output.includes(label));
    assert.ok(output.includes('仓库'));
    assert.ok(output.includes('人工核对'));
    assert.equal(listed(output).length, 1);
    for (const expected of ['review.test-account', '测试账号要求', official, date]) {
      assert.ok(listed(output)[0].includes(expected));
    }
    assert.ok(!output.includes(privateText));
  }
});

test('deduplicates by rule ID and counts omitted references without echoing their IDs', () => {
  const ids = ['review.test-account', 'review.test-account', privateText, privateText, 'draft.test', 'missing.date', 'flow:review'];
  const known = snapshot([
    reference('review.test-account'),
    { ...reference('draft.test'), draft: true },
    { ...reference('missing.date'), lastVerified: null },
    reference('flow:review'),
  ]);
  known.catalog.sources.push({
    url: 'https://pay.weixin.qq.com/index.php',
    references: [reference('review.test-account', 'alternate-catalog-title')],
  });
  const output = createAgentHandoffSummary(pack('explain', ids), known);
  assert.equal(listed(output).length, 1);
  assert.match(output, /另有 4 个不同规则 ID/);
  for (const omitted of [privateText, 'draft.test', 'missing.date', 'flow:review', 'alternate-catalog-title']) {
    assert.ok(!output.includes(omitted));
  }
});

test('imported, unassigned, unsupported and empty reports yield no preview', () => {
  const fixture = snapshot([reference('review.test-account')]);
  const imported = pack();
  imported.source.provenance = 'imported';
  const unassigned = pack();
  unassigned.source.projectId = null;
  for (const input of [imported, unassigned, pack('toString'), pack('check', []), pack('check', [privateText])]) {
    assert.equal(createAgentHandoffSummary(input, fixture), null);
  }
});

test('invalid catalog data produces the same safe error without inserting its content', () => {
  const wrongSource = url => ({ catalog: { schemaVersion: 1, sources: [{ url, references: [] }] } });
  const malformedReference = snapshot([{ ...reference('review.test-account'), title: null }]);
  const broken = [
    null,
    { catalog: { schemaVersion: 9, sources: [] } },
    { catalog: { schemaVersion: 1, sources: [{ url: official, references: {} }] } },
    wrongSource('https://developers.weixin.qq.com.test.invalid/' + privateText),
    wrongSource('https://user@developers.weixin.qq.com/'),
    wrongSource('http://developers.weixin.qq.com/'),
    malformedReference,
  ];
  for (const input of broken) {
    assert.throws(() => createAgentHandoffSummary(pack(), input), error =>
      error instanceof Error && error.message.includes('本机规则来源目录') && !error.message.includes(privateText));
  }
});

test('at most 20 rules are displayed with a count of excess rules', () => {
  const ids = Array.from({ length: 24 }, (_, index) => 'rule.sample-' + index);
  const output = createAgentHandoffSummary(pack('guide', ids), snapshot(ids.map(id => reference(id))));
  assert.equal(listed(output).length, 20);
  assert.match(output, /省略 4 条规则/);
  assert.doesNotMatch(output, /rule\.sample-20\b/);
});

test('the UTF-8 budget counts multibyte titles and keeps complete lines', () => {
  const ids = Array.from({ length: 8 }, (_, index) => 'rule.big-' + index);
  const title = '验'.repeat(1000);
  const output = createAgentHandoffSummary(pack('guide', ids), snapshot(ids.map(id => reference(id, title))));
  assert.equal(listed(output).length, 2);
  assert.ok(Buffer.byteLength(output, 'utf8') <= 8192);
  for (const row of listed(output)) assert.ok(row.includes(title));
  assert.match(output, /省略 6 条规则/);
});

test('the current bundled catalog supplies official links and dates for real rule IDs', () => {
  const ids = ['privacy.getLocation', 'review.test-account', 'security.hardcoded-secret'];
  const output = createAgentHandoffSummary(pack('check', ids), { catalog: createSourceCatalog() });
  assert.equal(listed(output).length, ids.length);
  for (const id of ids) assert.ok(listed(output).some(row => row.includes(id)));
});
