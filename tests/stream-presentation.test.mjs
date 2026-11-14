import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessage, updateMessageText } from '../desktop/design-previews/components/message.js';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { iconMarkup } from '../desktop/design-previews/components/icons.js';

function textHost() { return createPreviewDocument().createElement('div'); }

test('streamed paragraphs keep their nodes and match a completed render across chunk boundaries', () => {
  const streamed = textHost();
  let text = '';
  let first;
  for (const chunk of ['第一段', '\n', '\n第二段', '\n换行', '\n\n', '最后 🧭']) {
    text += chunk;
    updateMessageText(streamed, text);
    first ??= streamed.children[0];
    assert.equal(streamed.children[0], first);
  }
  const complete = textHost();
  updateMessageText(complete, text);
  assert.deepEqual(streamed.children.map(p => p.textContent), ['第一段', '第二段换行', '最后 🧭']);
  assert.deepEqual(streamed.children.map(p => p.textContent), complete.children.map(p => p.textContent));
  updateMessageText(streamed, '');
  assert.equal(streamed.children.length, 0);
});

test('stream text preserves literal HTML and normalizes CRLF without introducing markup', () => {
  const host = textHost();
  host.dataset.role = 'user';
  updateMessageText(host, '<img src=x onerror=alert(1)>\r\n\r\n**literal**\nline');
  assert.deepEqual(host.children.map(p => p.textContent), ['<img src=x onerror=alert(1)>', '**literal**\nline']);
});

const documentStub = createPreviewDocument;
const descendants = node => [node, ...node.children.flatMap(descendants)];

test('message parts preserve prose/tool/prose order, state semantics and failure actions', () => {
  const doc = documentStub();
  const parts = [
    { type: 'text', text: '开始检查。' },
    { type: 'tool', tool: { name: 'demo_preflight', label: '本地演示', state: 'canceled' } },
    { type: 'text', text: '保留的输出。' },
  ];
  for (const state of ['working', 'streaming', 'complete', 'stopped', 'error']) {
    const message = createMessage(doc, { id: 'run-1', role: 'assistant', status: state, text: '开始检查。保留的输出。', parts,
      ...(state === 'error' ? { error: { retryable: false, message: '需要检查输入' } } : {}),
    }, { canRegenerate: true });
    const nodes = descendants(message);
    const body = nodes.find(node => node.className === 'msg__parts');
    assert.deepEqual(body.children.map(node => node.tag), ['div', 'details', 'div']);
    assert.equal(body.attributes['aria-busy'], String(['working', 'streaming'].includes(state)));
    assert.equal(nodes.find(node => node.className === 'message-progress').hidden, !['working', 'streaming'].includes(state));
    assert.equal(nodes.some(node => node.dataset.action === 'regenerate'), ['complete', 'stopped'].includes(state));
    assert.equal(nodes.some(node => node.dataset.action === 'retry'), false);
    assert.equal(nodes.filter(node => node.tag === 'svg').every(node => node.attributes['aria-hidden'] === 'true'), true);
  }
});

test('icon renderer rejects non-whitelisted names and escapes attribute data', () => {
  assert.throws(() => iconMarkup('__proto__'), /Unknown icon/);
  assert.throws(() => iconMarkup('<svg onload=alert(1)>'), /Unknown icon/);
  assert.match(iconMarkup('check', '" onload="bad'), /&quot;/);
  assert.doesNotMatch(iconMarkup('check', '" onload="bad'), / onload="/);
});

test('user messages retain literal reference paths without creating file links or executable markup', () => {
  const path = '<img src=x onerror=alert(1)>/示例.js';
  const references = [path, 'src/app.ts', '', null, path];
  const message = createMessage(documentStub(), { id: 'with-refs', role: 'user', text: '查看这些示例', references });
  references[0] = 'changed-after-render';
  const nodes = descendants(message);
  const list = nodes.find(node => node.className === 'message-references__list');
  assert.ok(list);
  assert.deepEqual(list.children.map(node => node.textContent), [path, 'src/app.ts']);
  assert.equal(nodes.some(node => ['img', 'a'].includes(node.tag)), false);
  assert.match(message.textContent, /引用的示例路径 · 未读取文件/);
  const assistant = createMessage(documentStub(), { id: 'assistant-refs', role: 'assistant', text: '内容', references });
  assert.equal(descendants(assistant).some(node => node.className === 'message-references__list'), false);
});

test('running message and tool indicators use text without redundant spinner graphics', () => {
  const message = createMessage(documentStub(), { id: 'running', role: 'assistant', status: 'working', text: '',
    tool: { name: 'demo_preflight', label: '正在检查示例', state: 'running' },
  });
  const nodes = descendants(message);
  for (const className of ['message-progress', 'tool-details__header']) {
    const indicator = nodes.find(node => node.className === className);
    assert.equal(descendants(indicator).some(node => node.tag === 'svg'), false);
    assert.ok(indicator.textContent.length > 0);
  }
});
