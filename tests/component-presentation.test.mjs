import test from 'node:test';
import assert from 'node:assert/strict';
import { getReviewPresentation, getToolPresentation, getToolOutputPresentation, getRunPresentation, getRunAnnouncement, formatTraceLabel } from '../desktop/design-previews/components/presentation.js';
import { createDemoResult } from '../desktop/design-previews/demo-result.js';
import { createToolCard, createMessageActions, createApprovalCard } from '../desktop/design-previews/components/message.js';

test('preparing a real reply announces its provider and model without calling it a demo', () => {
  const live = { providerId: 'openai', model: 'model-a', label: 'Model A' };
  const text = getRunAnnouncement('working', { live });
  assert.match(text, /openai.*Model A/);
  assert.doesNotMatch(text, /演示/);
  assert.match(getRunAnnouncement('working', {}), /本地演示/);
  assert.equal(getRunAnnouncement('complete', { live }), '生成完成。');
});

test('only pending approval exposes approval and rejection; terminal actions are explicit', () => {
  for (const state of ['pending', 'accepted', 'rejected', 'stale']) {
    const view = getReviewPresentation(state);
    assert.equal(view.canApprove, state === 'pending');
    assert.equal(view.canReject, state === 'pending');
    assert.equal(view.canRollback, state === 'accepted');
    assert.equal(view.canRegenerate, ['rejected', 'stale'].includes(state));
    assert.ok(view.label && view.summary && view.tone);
    assert.equal(Object.isFrozen(view), true);
  }
});
test('tool and run states have consistent explicit labels and tones', () => {
  for (const [state, label] of Object.entries({ running: '执行中', success: '成功', fail: '失败', canceled: '已停止' })) {
    assert.equal(getToolPresentation(state).label, label);
    assert.ok(getToolPresentation(state).tone);
  }
  for (const state of ['idle', 'working', 'streaming', 'complete', 'stopped', 'error']) {
    assert.ok(getRunPresentation(state).label && getRunPresentation(state).announcement);
  }
});
test('unknown and prototype states never silently acquire approval or successful presentation', () => {
  for (const lookup of [getReviewPresentation, getToolPresentation, getRunPresentation]) {
    for (const state of ['approved', 'failed', 'toString', '__proto__', '', undefined]) {
      assert.throws(() => lookup(state), /Unknown/);
    }
  }
});
test('trace labels preserve terminal states and bound invalid elapsed values', () => {
  assert.equal(formatTraceLabel({ state: 'stopped', elapsedMs: 1250 }), '运行记录 · 已停止 · 1.3 秒');
  assert.equal(formatTraceLabel({ state: 'error', elapsedMs: -10 }), '运行记录 · 失败 · 0.0 秒');
  assert.equal(formatTraceLabel({ state: 'complete', elapsedMs: NaN }), '运行记录 · 已完成 · 0.0 秒');
});

test('tool output only exposes validated results for success, never stale terminal payloads', () => {
  const result = createDemoResult();
  const error = { message: 'A stale failure', code: 'stale_error' };
  const success = getToolOutputPresentation('success', { result, error });
  assert.equal(success.kind, 'result');
  assert.deepEqual(JSON.parse(success.text), result);
  for (const state of ['running', 'canceled']) {
    const view = getToolOutputPresentation(state, { result, error });
    assert.equal(view.kind, 'empty');
    assert.ok(view.text.length > 0);
    assert.equal(view.text.includes('stale'), false);
    assert.equal(view.text.includes('DEMO-'), false);
  }
  const failed = getToolOutputPresentation('fail', { result, error });
  assert.equal(failed.kind, 'error');
  assert.equal(failed.text, error.message);
  assert.equal(failed.code, error.code);
});

test('missing and malformed tool results are unavailable without exposing their payload', () => {
  for (const result of [undefined, null, {}, { ...createDemoResult(), secret: 'must-not-render' }]) {
    const view = getToolOutputPresentation('success', { result });
    assert.equal(view.kind, 'unavailable');
    assert.equal(view.text.includes('must-not-render'), false);
  }
  assert.equal(getToolOutputPresentation('fail').kind, 'error');
  assert.equal(getToolOutputPresentation('fail', { error: { message: {}, code: {} } }).code, undefined);
  assert.throws(() => getToolOutputPresentation('__proto__'), /Unknown/);
});

test('tool result and error markup is rendered as text, with no retry action in the disclosure', () => {
  const doc = {
    createElementNS(_namespace, tag) { return this.createElement(tag); },
    createElement(tag) {
      return { tag, dataset: {}, children: [], attributes: {},
        set innerHTML(_) { throw new Error('HTML injection is forbidden'); },
        setAttribute(name, value) { this.attributes[name] = value; },
        append(...children) { this.children.push(...children); },
      };
    },
  };
  const flatten = node => [node, ...node.children.flatMap(flatten)];
  const result = createDemoResult();
  result.issues[0].title = '<img src=x onerror=alert(1)>';
  const nodes = flatten(createToolCard(doc, { state: 'success', label: 'Demo' }, { result }));
  assert.ok(nodes.some(node => node.tag === 'code' && node.textContent.includes(result.issues[0].title)));
  const failed = flatten(createToolCard(doc, { state: 'fail', label: 'Demo' }, { error: { message: '<script>bad()</script>', retryable: true } }));
  assert.ok(failed.some(node => node.textContent === '<script>bad()</script>'));
  assert.equal(failed.some(node => node.tag === 'button'), false);
});

test('tool summary precedes raw data and failed tools never expose stale result JSON', () => {
  const doc = {
    createElementNS(_namespace, tag) { return this.createElement(tag); },
    createElement(tag) { return { tag, dataset: {}, children: [], setAttribute() {}, append(...nodes) { this.children.push(...nodes); } }; },
  };
  const flatten = node => [node, ...node.children.flatMap(flatten)];
  for (const state of ['success', 'fail', 'canceled', 'running']) {
    const card = createToolCard(doc, { state, label: 'Demo', summary: ['Readable summary'] }, { result: createDemoResult() });
    const all = flatten(card);
    const raw = all.find(node => node.dataset.component === 'tool-raw');
    const body = all.find(node => node.className === 'tool-details__body');
    assert.equal(Boolean(raw.open), false);
    assert.equal(body.children.at(-1), raw);
    assert.ok(body.children.some(node => node.className === 'tool-details__summary'));
    assert.equal(flatten(raw).some(node => node.className === 'tool-result-json'), state === 'success');
    if (state === 'fail') assert.equal(card.open, true);
  }
});

test('message icon actions retain accessible names, routing and generation availability', () => {
  const doc = {
    createElementNS(_namespace, tag) { return this.createElement(tag); },
    createElement(tag) {
      return { tag, dataset: {}, children: [], attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        append(...children) { this.children.push(...children); },
      };
    },
  };
  const user = createMessageActions(doc, { id: 'user-1', role: 'user', text: 'Hello' });
  assert.deepEqual(user.children.map(button => button.dataset.action), ['copy', 'edit']);
  for (const button of user.children) {
    assert.equal(button.type, 'button');
    assert.equal(button.dataset.messageId, 'user-1');
    assert.ok(button.attributes['aria-label']);
    assert.equal(button.title, button.attributes['aria-label']);
    assert.equal(button.children[0].attributes['aria-hidden'], 'true');
  }
  const empty = createMessageActions(doc, { id: 'agent-1', role: 'assistant', text: '', status: 'streaming' }, { canRegenerate: true });
  assert.equal(empty.children.length, 0);
  const complete = createMessageActions(doc, { id: 'agent-1', role: 'assistant', text: 'Done', status: 'complete' }, { canRegenerate: true });
  assert.deepEqual(complete.children.map(button => button.dataset.action), ['copy', 'regenerate']);
  const stopped = createMessageActions(doc, { id: 'agent-2', role: 'assistant', text: 'Partial', status: 'stopped' }, { canRegenerate: true });
  assert.deepEqual(stopped.children.map(button => button.dataset.action), ['copy', 'regenerate']);
  const approval = createApprovalCard(doc, { state: 'pending' }, { messageId: 'agent-1' });
  const reviewButton = approval.children.at(-1).children[0];
  assert.equal(reviewButton.textContent, '查看改动');
  assert.equal(reviewButton.dataset.action, 'open-review');
});

test('announcements reflect empty stops and non-retryable errors without promising unavailable actions', () => {
  assert.equal(getRunAnnouncement('idle'), '');
  assert.equal(getRunAnnouncement('stopped', { text: '' }), '已在输出前停止。');
  assert.match(getRunAnnouncement('stopped', { text: 'partial' }), /保留/);
  assert.doesNotMatch(getRunAnnouncement('error', { error: { retryable: false } }), /重试/);
  assert.match(getRunAnnouncement('error', { error: { retryable: true } }), /重试/);
});
