import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mountReview } from '../desktop/design-previews/components/review.js';

const source = page => readFileSync(new URL(`../desktop/design-previews/${page}.js`, import.meta.url), 'utf8');
function listener(page, type, context) {
  const pageSource = source(page).replace(/\r\n/g, '\n');
  const start = pageSource.indexOf(`window.addEventListener('${type}',`);
  assert.ok(start >= 0, `${page} ${type} listener exists`);
  const tail = pageSource.slice(start);
  const closing = tail.split('\n')[0].includes('=>') ? '\n});' : ';';
  const code = tail.slice(0, tail.indexOf(closing) + closing.length);
  let callback;
  vm.runInNewContext(code, { ...context, window: { ...context.window, addEventListener(_type, fn) { callback = fn; } } });
  return callback;
}

test('chat pagehide stops cached runs, destroys discarded views, and closes composer surfaces', () => {
  const calls = [];
  let pendingSave = false;
  const callback = listener('chat', 'pagehide', {
    scheduleHistorySave() { pendingSave = true; calls.push('schedule'); },
    persistence: { flush() {
      assert.equal(pendingSave, true, 'Leaving must schedule a fresh snapshot before flushing');
      assert.ok(['stop', 'destroy'].includes(calls.at(-1)), 'Flush includes the terminal run state');
      pendingSave = false; calls.push('flush');
    } },
    closeCompletionSurface() { calls.push('completion'); },
    closeComposerSurfaces() { calls.push('menus'); },
    conversation: { stop() { calls.push('stop'); }, destroy() { calls.push('destroy'); } },
  });
  callback({ persisted: true });
  callback({ persisted: true });
  callback({ persisted: false });
  assert.deepEqual(calls, [
    'schedule', 'menus', 'stop', 'flush',
    'schedule', 'menus', 'stop', 'flush',
    'schedule', 'menus', 'destroy', 'flush',
  ]);
  assert.equal(pendingSave, false);
});

for (const page of ['chat', 'main']) {
  test(`${page}: failure demonstration never interrupts a running reply or falsely announces success`, () => {
    const calls = [];
    let state = 'working';
    let ok = true;
    const view = {
      controller: { getSnapshot: () => ({ state }) },
      stop() { calls.push('stop'); },
      submit(options) { calls.push(options.plan.scenario); return { ok }; },
    };
    const notify = message => calls.push(message);
    const callback = listener(page, 'shipmate:simulate-error', {
      conversation: view, view, running: true, notify,
      window: { shipmatePreview: { notify } },
      createDemoPlan: (_input, options) => options,
    });
    for (state of ['working', 'streaming']) callback({ detail: {} });
    assert.deepEqual(calls, ['请先停止当前回复，再演示故障。', '请先停止当前回复，再演示故障。']);
    calls.length = 0;
    state = 'idle';
    callback({ detail: {} });
    assert.deepEqual(calls, ['tool-failure', '已开始故障与重试演示。']);
    calls.length = 0;
    ok = false;
    callback({ detail: {} });
    assert.deepEqual(calls, ['tool-failure']);
  });
}

test('review full preview preserves a whitelisted return path and rejects external destinations', () => {
  const doc = {
    createElement(tag) {
      return { tag, ownerDocument: doc, dataset: {}, children: [], className: '',
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; },
        setAttribute() {},
        querySelector(selector) {
          const flatten = node => node.children.flatMap(child => [child, ...flatten(child)]);
          return flatten(this).find(node => node.className.split(' ').includes(selector.slice(1)));
        },
      };
    },
  };
  for (const [returnPath, expected] of [
    ['chat-full.html', 'chat-full.html'], ['main-four-region.html', 'main-four-region.html'],
    ['https://evil.example/', 'main-four-region.html'], ['diff-review.html', 'main-four-region.html'],
  ]) {
    const host = doc.createElement('div');
    const { root } = mountReview(host, { returnPath });
    const full = root.querySelector('.agent-review__actions').children.find(node => node.tag === 'a');
    assert.equal(full.href, `diff-review.html?from=${encodeURIComponent(expected)}`);
  }
  assert.match(source('chat'), /returnPath:\s*'chat-full\.html'/);
  assert.match(source('main'), /returnPath:\s*'main-four-region\.html'/);
});
