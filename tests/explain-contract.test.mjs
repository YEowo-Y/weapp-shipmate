import test from 'node:test';
import assert from 'node:assert/strict';
import { runExplain } from '../src/explain.mjs';
import { validateExplainResult } from '../desktop/design-previews/explain-contract.js';

const clone = value => JSON.parse(JSON.stringify(value));
test('explain contract accepts new evidence and legacy results without new optional fields', () => {
  for (const query of ['手机号', '测试', '页面空白，功能无法体验', 'xyz-unrecognized-789']) {
    const result = runExplain(query);
    assert.equal(validateExplainResult(result, query).ok, true);
    for (const item of result.items) {
      delete item.relevance; delete item.matchEvidence; delete item.action_categories;
    }
    assert.equal(validateExplainResult(result, query).ok, true);
  }
});

test('explain relevance and bounded evidence must be paired and structurally complete', () => {
  const original = runExplain('手机号');
  const mutations = [
    i => { delete i.relevance; }, i => { delete i.matchEvidence; },
    i => { i.relevance = 'certain'; }, i => { i.relevance = null; },
    i => { i.matchEvidence = null; }, i => { i.matchEvidence = []; },
    i => { delete i.matchEvidence.codes; }, i => { i.matchEvidence.extra = []; },
    i => { i.matchEvidence.aliases = '手机号'; }, i => { i.matchEvidence.aliases = [null]; },
    i => { i.matchEvidence.aliases = ['']; }, i => { i.matchEvidence.aliases = [' ']; },
    i => { i.matchEvidence.codes = ['x'.repeat(513)]; },
    i => { i.matchEvidence.partialAliases = Array.from({length:101}, (_,n) => String(n)); },
    i => { i.matchEvidence.aliases = ['手机号', '手机号']; },
    i => { i.matchEvidence = {aliases:[],codes:[],partialAliases:[]}; },
    i => { i.matchEvidence = {aliases:[],codes:[],partialAliases:['手机号']}; },
    i => { i.action_categories = ['code','unknown']; },
    i => { i.runCommand = 'unexpected'; },
  ];
  for (const mutate of mutations) {
    const result = clone(original); mutate(result.items[0]);
    assert.equal(validateExplainResult(result, '手机号').ok, false, mutate.toString());
  }
});
