import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainHarness } from './helpers/explain-ui.mjs';

test('a real query focuses its visible result without animated scrolling; filling a sample only focuses input', async () => {
  const { nodes } = explainHarness();
  nodes.rjSample.fire('click');
  assert.equal(nodes.rjResult.hidden, true);
  assert.deepEqual(nodes.rjResultHeading.calls, []);
  assert.deepEqual(nodes.rjInput.calls, [['focus', undefined]]);
  await nodes.rjForm.fire('submit');
  assert.equal(nodes.rjResult.hidden, false);
  assert.deepEqual(nodes.rjResultHeading.calls, [['focus', { preventScroll: true }], ['scroll', { block: 'nearest', behavior: 'instant' }]]);
});

test('editing and invalid input never jump focus to a hidden result', async () => {
  const { nodes } = explainHarness();
  nodes.rjInput.value = '隐私'; nodes.rjInput.fire('input');
  assert.equal(nodes.rjResult.hidden, true); assert.deepEqual(nodes.rjResultHeading.calls, []);
  nodes.rjInput.value = ''; await nodes.rjForm.fire('submit');
  assert.deepEqual(nodes.rjResultHeading.calls, []);
  assert.deepEqual(nodes.rjInput.calls, [['focus', undefined]]);
});

test('audit next actions use exact known rule destinations, including payment eligibility', async () => {
  const { auditNextAction } = await import('../desktop/design-previews/audit.js');
  assert.equal(auditNextAction('privacy.getLocation').href, 'diff-review.html?from=audit.html');
  assert.equal(auditNextAction('domain.request-whitelist').href, 'guided-step.html');
  assert.equal(auditNextAction('domain.https-wss-only').href, 'guided-step.html');
  assert.equal(auditNextAction('category.medical-hint').href, 'category-advisor.html');
  assert.equal(auditNextAction('payment.requires-merchant').href, 'https://pay.weixin.qq.com/static/applyment_guide/applyment_index.shtml');
  assert.equal(auditNextAction('privacy.unknown'), null);
  assert.equal(auditNextAction('__proto__'), null);
});

class Node {
  constructor(tag = 'div', className = '') { this.tag = tag; this.className = className; this.children = []; this.open = false; this.textContent = ''; }
  append(...nodes) { for (const node of nodes) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; this.children.push(node); } }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tag === selector) ? [node] : [], ...node.querySelectorAll(selector)]); }
}

test('audit evidence starts closed and remount never resets a user expansion or duplicates next actions', async () => {
  const { mountAudit } = await import('../desktop/design-previews/audit.js');
  const root = new Node(); root.createElement = tag => new Node(tag);
  const body = new Node('div', 'acard__body'), head = new Node(), meta = new Node(), rule = new Node('span', 'rule-id');
  rule.textContent = 'payment.requires-merchant'; meta.append(rule); body.append(head, meta, new Node('details', 'quote-wrap'), new Node('div', 'acard__src')); root.append(body);
  mountAudit(root);
  const evidence = body.querySelector('.audit-evidence'); assert.equal(evidence.open, false);
  const link = body.querySelector('.journey-next').querySelector('a');
  assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
  evidence.open = true; mountAudit(root);
  assert.equal(evidence.open, true); assert.equal(body.querySelectorAll('.audit-evidence').length, 1);
  assert.equal(body.querySelectorAll('.journey-next').length, 1);
});


test('result heading is programmatically focusable and audit no longer registers viewport-driven expansion', () => {
  const explain = readFileSync(new URL('../desktop/design-previews/explain.html', import.meta.url), 'utf8');
  assert.match(explain, /<h2[^>]*id="rjResultHeading"[^>]*tabindex="-1"/u);
  const audit = readFileSync(new URL('../desktop/design-previews/audit.html', import.meta.url), 'utf8');
  assert.match(audit, /<script type="module" src="audit.js"><\/script>/u);
  assert.doesNotMatch(audit, /matchMedia|arrangeEvidence/u);
});
