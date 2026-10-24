/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runExplain } from '../src/explain.mjs';
import { validateExplainInput, validateExplainResult } from '../desktop/design-previews/explain-contract.js';

test('explain accepts bounded text only and never accepts caller-controlled engine options', () => {
  assert.equal(validateExplainInput({ query: '隐私' }).ok, true);
  for (const input of [null, [], {query:''}, {query:'  '}, {query:'x'.repeat(4097)}, {query:42}, {query:'隐私',includeDrafts:true}, {query:'隐私',root:'C:/'}]) assert.equal(validateExplainInput(input).ok, false);
});
test('real engine results and no match pass with request binding and cross-rejection rule reuse', () => {
  for (const query of ['隐私', '诱导分享', '没有这样的拒因xyz']) assert.equal(validateExplainResult(runExplain(query), query).ok, true);
  const result = runExplain('诱导分享');
  result.items.push({...result.items[0], rejectId:'another-rejection'});
  assert.equal(validateExplainResult(result, '诱导分享').ok, true);
  result.items.push({...result.items[0]}); assert.equal(validateExplainResult(result, '诱导分享').ok, false);
});
test('malformed or untrusted result fields cannot enter presentation', () => {
  const original = runExplain('诱导分享');
  const cases = [r=>r.secret='bad', r=>r.meta.query='another', r=>r.items[0].official_url='javascript:alert(1)', r=>r.items[0].official_url='https://evil.example', r=>r.items[0].rejectId='', r=>r.items[0].title='x'.repeat(10000),r=>r.items[0].extra='bad'];
  for(const change of cases){const result=structuredClone(original);change(result);assert.equal(validateExplainResult(result,'诱导分享').ok,false);}
});
