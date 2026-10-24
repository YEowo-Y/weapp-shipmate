import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoResult, validateDemoResult } from '../desktop/design-previews/demo-result.js';

test('fixed preview result is validated without mutating its input', () => {
  const result = createDemoResult();
  const before = JSON.parse(JSON.stringify(result));
  assert.equal(validateDemoResult(result).ok, true);
  assert.deepEqual(result, before);
});

test('severity must be a primitive string enum without invoking property-key coercion', () => {
  let coerced = false;
  for (const severity of [['warning'], { toString() { coerced = true; return 'warning'; } }, null, 1, true]) {
    const result = createDemoResult();
    result.issues[0].severity = severity;
    assert.equal(validateDemoResult(result).ok, false);
  }
  assert.equal(coerced, false);
});

test('rejects untrusted result shape, false simulation, and inconsistent counts', () => {
  const mutations = [
    value => { value.simulation = false; },
    value => { value.counts.warning = 0; },
    value => { value.issues[0].severity = 'critical'; },
    value => { value.issues[0].ruleId = ''; },
    value => { value.issues[0].file = '../../secret'; },
    value => { value.issues[0].title = 'x'.repeat(241); },
    value => { value.extra = true; },
    value => { value.issues.push({ ...value.issues[0] }); },
  ];
  for (const mutate of mutations) {
    const result = createDemoResult();
    mutate(result);
    assert.equal(validateDemoResult(result).ok, false);
  }
  for (const value of [null, [], 'result', {}]) assert.equal(validateDemoResult(value).ok, false);
});
