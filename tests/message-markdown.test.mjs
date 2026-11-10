import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMessageText } from '../desktop/design-previews/components/message.js';
import { messageSearchText } from '../desktop/design-previews/components/message-markdown.js';
import { createPreviewDocument } from './helpers/preview-dom.mjs';

const descendants = node => [node, ...node.children.flatMap(descendants)];
function host(role = 'assistant') {
  const node = createPreviewDocument().createElement('div');
  Object.assign(node.dataset, { role, messageId: 'reply-1', partIndex: '2' });
  return node;
}
test('search text agrees with rendered inline content, including inert markup and image labels', () => {
  const node = host();
  const source = '仅为**待你确认**的导航建议 &amp; <b>literal</b> [safe](https://example.com/target) [relative](/settings) [invalid](javascript:alert(1)) ![**alt**](https://example.com/x.png)';
  updateMessageText(node, source);
  assert.equal(messageSearchText(source), node.children[0].textContent);
  assert.match(messageSearchText(source), /仅为待你确认的导航建议/);
  assert.doesNotMatch(messageSearchText(source), /example\.com|\/settings/);
});

test('search text keeps code and line breaks without copy controls or Markdown fences', () => {
  const node = host(), source = '> before\n> next\n\n```js\n  **literal**\n\n  [code](target)\n```';
  updateMessageText(node, source);
  const code = descendants(node).find(item => item.tag === 'pre').textContent;
  const extracted = messageSearchText(source);
  assert.ok(extracted.includes(code));
  assert.match(extracted, /before\nnext/);
  assert.doesNotMatch(extracted, /复制代码|```|> /);
  assert.equal(messageSearchText('**user**\r\n\r\n  next\n', 'user'), '**user**\n\n  next');
});

test('assistant Markdown renders semantic typography, decoded entities, lists and tables', () => {
  const node = host();
  updateMessageText(node, '# Title &amp; text\n\n**strong** *em* ~~gone~~ `code`\n\n> Quote\n\n1. one\n2. two\n\n| A | B |\n| --- | --- |\n| X | Y |');
  const tags = descendants(node).map(item => item.tag);
  for (const tag of ['h1', 'strong', 'em', 's', 'code', 'blockquote', 'ol', 'li', 'table', 'th', 'td']) assert.ok(tags.includes(tag), tag);
  assert.equal(node.children[0].textContent, 'Title & text');
});
test('untrusted output remains inert and only explicit safe external links navigate', () => {
  const node = host();
  updateMessageText(node, '<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) [relative](/settings) [host](//example.com) [safe](https://example.com)\n\n![remote](https://example.com/a.png)');
  const nodes = descendants(node);
  assert.equal(nodes.some(item => ['img', 'script', 'iframe'].includes(item.tag)), false);
  const links = nodes.filter(item => item.tag === 'a');
  assert.deepEqual(links.map(item => item.attributes.href), ['https://example.com/', 'https://example.com/a.png']);
  assert.ok(links.every(item => item.attributes.rel === 'noopener noreferrer'));
  assert.match(node.textContent, /<img src=x onerror=alert\(1\)>/);
});
test('streaming keeps stable paragraphs and active code elements, including unfinished fences', () => {
  const node = host();
  updateMessageText(node, 'Before\n\n```js\nconst x =');
  const first = node.children[0];
  const pre = descendants(node).find(item => item.tag === 'pre');
  pre.scrollLeft = 70;
  updateMessageText(node, 'Before\n\n```js\nconst x = 1;\n```\n\nAfter');
  assert.equal(node.children[0], first);
  assert.equal(descendants(node).find(item => item.tag === 'pre'), pre);
  assert.equal(pre.scrollLeft, 70);
  assert.equal(pre.children[0].textContent, 'const x = 1;\n');
  const button = descendants(node).find(item => item.tag === 'button');
  assert.equal(button.dataset.action, 'copy-code');
  assert.equal(button.dataset.messageId, 'reply-1');
  assert.ok(button.dataset.blockKey.startsWith('2:'));
  assert.equal(pre.attributes.tabindex, '0');
});
test('user Markdown stays literal and empty updates remove prior content', () => {
  const node = host('user');
  updateMessageText(node, '**literal**\r\nnext');
  assert.equal(node.textContent, '**literal**\nnext');
  assert.equal(descendants(node).some(item => item.tag === 'strong'), false);
  updateMessageText(node, '');
  assert.equal(node.children.length, 0);
});

test('streaming supports nested blocks, unique reading keys and preserves local copy feedback', () => {
  const node = host();
  const source = '> ```ts\n> first\n> ```\n\n```js\nsecond\n```';
  updateMessageText(node, source);
  const buttons = descendants(node).filter(item => item.tag === 'button');
  assert.equal(new Set(buttons.map(button => button.dataset.blockKey)).size, 2);
  buttons[0].dataset.copyState = 'success';
  buttons[0].textContent = '已复制';
  updateMessageText(node, source + '\n\nMore');
  assert.equal(descendants(node).filter(item => item.tag === 'button')[0], buttons[0]);
  assert.equal(buttons[0].textContent, '已复制');
});

test('streamed token structure converges with one-shot parsing across every character', () => {
  const source = '## Heading\n\n- **bold** and `code`\n- [safe](https://example.com)\n\n```js\n<script>literal</script>\n```\n\n| A | B |\n| :--- | ---: |\n| 1 | 2 |';
  const streamed = host();
  for (let length = 1; length <= source.length; length++) updateMessageText(streamed, source.slice(0, length));
  const complete = host();
  updateMessageText(complete, source);
  const snapshot = node => ({ tag: node.tag, attrs: node.attributes, text: node.textContent, children: node.children.map(snapshot) });
  assert.deepEqual(snapshot(streamed), snapshot(complete));
});

test('data URLs, credentials, relative and protocol-relative image destinations stay inert', () => {
  const node = host();
  updateMessageText(node, '[data](data:text/html,hello) [vb](vbscript:bad) [obfuscated](jav&#x61;script:bad) [credentials](https://name:password@example.com) ![relative](../secret) ![host](//example.com/x)');
  assert.equal(descendants(node).some(item => item.tag === 'a' || item.tag === 'img'), false);
});

test('unfinished fences preserve whitespace and tight nested lists omit hidden paragraph wrappers', () => {
  const node = host();
  updateMessageText(node, '```js\r\n  line\r\n\r\n');
  assert.equal(descendants(node).find(item => item.tag === 'code').textContent, '  line\n\n');
  updateMessageText(node, '> - parent\n>   - child\n>   - another');
  const nodes = descendants(node);
  assert.equal(nodes.filter(item => item.tag === 'ul').length, 2);
  assert.equal(nodes.filter(item => item.tag === 'li').length, 3);
  assert.equal(nodes.filter(item => item.tag === 'p').length, 0);
});
