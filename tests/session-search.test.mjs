import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { literalSessionQuery, sessionMatch } from '../desktop/src/shared/session-search.js';

const session = (...messages) => ({ title: 'Conversation', messages });
const assistant = text => ({ id: 'reply', role: 'assistant', text });

test('assistant search follows visible headings, quotes, emphasis and link labels', () => {
  const saved = session(assistant('# 上线**检查**\n\n> 核对 [隐私声明](https://example.com/hidden-target) 与 ~~旧内容~~'));
  for (const query of ['上线检查', '隐私声明', '旧内容']) {
    const result = sessionMatch(saved, query);
    assert.equal(result.messageId, 'reply');
    assert.match(result.snippet, literalSessionQuery(query));
    assert.doesNotMatch(result.snippet, /\*\*|~~|\]\(|^#|> /);
  }
  for (const query of ['hidden-target', 'https://example.com', '**', '](', '# ']) {
    assert.equal(sessionMatch(saved, query).matched, false, query);
  }
});

test('user content remains literal while assistant code and HTML keep visible syntax', () => {
  const user = session({ id: 'request', role: 'user', text: '**literal**  [link](https://example.com)\r\nnext' });
  for (const query of ['**literal**', 'https://example.com', '**  [', '\nnext']) assert.equal(sessionMatch(user, query).messageId, 'request');
  const saved = session(assistant('```js\n  **literal**  [link](target)\n```\n\n`a+b` <b>literal &amp; text</b>'));
  for (const query of ['**literal**  [link](target)', 'a+b', '<b>literal & text</b>']) assert.equal(sessionMatch(saved, query).messageId, 'reply');
  assert.equal(sessionMatch(saved, '```').matched, false);
});

test('assistant image labels and decoded entities match the renderer without searching destinations', () => {
  const saved = session(assistant('![检查图](https://example.com/private.png) ![本地图](../secret.png) &amp; &#x1f6a2;'));
  for (const query of ['图片：检查图（打开链接）', '图片：本地图', '& 🚢']) assert.equal(sessionMatch(saved, query).messageId, 'reply');
  for (const query of ['private.png', 'secret.png', '&amp;']) assert.equal(sessionMatch(saved, query).matched, false);
});

test('search cache invalidates when the same message streams or changes role', () => {
  const message = assistant('**First**'), saved = session(message);
  assert.equal(sessionMatch(saved, '**').matched, false);
  assert.equal(sessionMatch(saved, 'first').messageId, 'reply');
  message.text = '**Second**';
  assert.equal(sessionMatch(saved, 'first').matched, false);
  assert.equal(sessionMatch(saved, 'second').messageId, 'reply');
  message.role = 'user';
  assert.equal(sessionMatch(saved, '**').messageId, 'reply');
});

test('repeated queries reuse parsed message text and streamed edits replace the cached version', () => {
  let parses = 0;
  const context = vm.createContext({ messageSearchText: value => { parses++; return value; } });
  const source = readFileSync(new URL('../desktop/src/shared/session-search.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  const message = assistant('first version'), saved = session(message);
  context.sessionMatch(saved, 'first'); context.sessionMatch(saved, 'version'); context.sessionMatch(saved, 'missing');
  assert.equal(parses, 1);
  message.text = 'second version'; context.sessionMatch(saved, 'second');
  assert.equal(parses, 2);
  message.text = 'first version'; context.sessionMatch(saved, 'first');
  assert.equal(parses, 3, 'The cache retains only the latest text for each live message');
});

test('visible snippets preserve literal matching, emoji boundaries and message identity', () => {
  const saved = session(assistant('🚢' + 'x'.repeat(15) + '**A+B**' + 'y'.repeat(15) + '🚢'));
  const result = sessionMatch(saved, 'a+b');
  assert.equal(result.messageId, 'reply');
  assert.equal(result.snippet, '🚢' + 'x'.repeat(15) + 'A+B' + 'y'.repeat(15) + '🚢');
  assert.equal(literalSessionQuery('a+b').exec(result.snippet)[0], 'A+B');
  assert.equal(sessionMatch(saved, 'ab').matched, false);
});

test('messages with missing or empty display text do not create search results', () => {
  const saved = session({ id: 'pending', role: 'assistant' }, assistant(''));
  assert.equal(sessionMatch(saved, 'needle').matched, false);
});

test('block boundaries do not merge separate visible paragraphs or table cells', () => {
  const saved = session(assistant('First\n\nSecond\n\n| Left | Right |\n| --- | --- |\n| One | Two |'));
  for (const query of ['FirstSecond', 'LeftRight', 'OneTwo']) assert.equal(sessionMatch(saved, query).matched, false, query);
  assert.equal(sessionMatch(saved, 'Second').messageId, 'reply');
});
