import test from 'node:test';
import assert from 'node:assert/strict';
import { runGuide } from '../src/guide.mjs';
import { GUIDE_SUBJECTS, GUIDE_TOOL_NAME, validateGuideInput, validateGuideResult } from '../desktop/design-previews/guide-contract.js';
test('guide contract accepts actual rule results for every supported input combination', () => {
  assert.equal(GUIDE_TOOL_NAME, 'weapp_shipmate_guide');
  for (const subject of Object.keys(GUIDE_SUBJECTS)) for (const sensitive of [false, true]) for (const domain of [false, true]) {
    assert.deepEqual(validateGuideInput({ subject, sensitive, domain }), { ok: true });
    assert.deepEqual(validateGuideResult(runGuide({ subject_type: subject, collects_sensitive: sensitive, has_server_domain: domain }, { includeDrafts: false })), { ok: true });
  }
});
test('guide input does not coerce values or permit execution options', () => {
  for (const input of [null, [], {}, { subject: 'personal', sensitive: 'false', domain: true }, { subject: 'admin', sensitive: false, domain: false }, { subject: 'personal', sensitive: false, domain: false, includeDrafts: true }]) assert.equal(validateGuideInput(input).ok, false);
});
test('result rejects unsafe sources, unknown fields, invalid severity and oversized structures', () => {
  const original = runGuide({ subject_type: 'personal' });
  for (const mutate of [r => { r.items[0].official_url = 'https://developers.weixin.qq.com.evil.test/x'; }, r => { r.items[0].official_url = 'javascript:alert(1)'; }, r => { r.items[0].severity = ['info']; }, r => { r.meta.secret = 'x'; }, r => { r.items[0].title = 'x'.repeat(10000); }, r => { r.items = Array(501).fill(r.items[0]); }, r => { r.items[0].signal = { nested: { nested: { nested: { nested: { nested: { nested: {} } } } } } }; }]) {
    const value = JSON.parse(JSON.stringify(original)); mutate(value); assert.equal(validateGuideResult(value).ok, false);
  }
});

test('guide preserves stage and conditional-section meaning with unique rule identifiers', () => {
  const original = runGuide({ subject_type: 'personal' });
  for (const mutate of [r => { r.items[0].stage = 'unknown'; }, r => { r.selfCheck[0].conditional = false; }, r => { r.items[0].conditional = true; }, r => { r.items.push(r.items[0]); }, r => { r.items[0].last_verified = '2026-02-31'; }, r => { r.notes = Array(100).fill('x'.repeat(1500)); }]) {
    const value = JSON.parse(JSON.stringify(original)); mutate(value); assert.equal(validateGuideResult(value).ok, false);
  }
});
