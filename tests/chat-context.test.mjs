import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatContext } from '../desktop/design-previews/chat-context.js';
const request = () => ({ model: 'example', messages: [{ role: 'user', content: 'question' }] });
const item = { id: 'report:r1', kind: 'report', title: 'Report', text: 'selected contents', bytes: 17 };
test('explicit context is isolated by project/session and never mutates persisted messages', () => {
  const context = createChatContext(); context.select({ id: 's1', projectId: 'p1' }); context.add(item);
  const original = request(), sent = context.prepare(original);
  assert.equal(sent.messages.length, 2); assert.match(sent.messages[0].content, /selected contents/); assert.equal(original.messages.length, 1);
  context.select({ id: 's1', projectId: 'p2' }); assert.equal(context.prepare(request()).messages.length, 1);
  context.select({ id: 's2', projectId: 'p1' }); assert.equal(context.list().length, 0);
  context.select({ id: 's1', projectId: 'p1' }); assert.equal(context.list().length, 1);
  context.remove(item.id); assert.equal(context.prepare(request()).messages.length, 1);
  context.add(item); context.clear(); context.select({ id: 's1', projectId: 'p1' }); assert.equal(context.list().length, 0);
});
test('context snapshots cannot be mutated through returned lists; retries use current selection', () => {
  const context = createChatContext(); context.select({ id: 's1', projectId: 'p1' }); context.add(item);
  context.list()[0].text = 'changed'; assert.equal(context.list()[0].text, item.text);
  assert.match(context.prepare(request()).messages[0].content, /selected contents/);
  context.remove(item.id); assert.equal(context.prepare(request()).messages[0].content, 'question');
});
test('context rejects limits without truncation including UTF-8 transport size', () => {
  const context = createChatContext(); context.select({ id: 's' });
  assert.throws(() => context.add({ ...item, text: '汉'.repeat(8193) }), /24 KiB/);
  assert.throws(() => context.prepare({ model: 'm', messages: [{ role: 'user', content: '汉'.repeat(24000) }] }), /发送上限/);
  context.add(item);
  assert.throws(() => context.prepare({ model: 'm', messages: Array.from({ length: 100 }, () => ({ role: 'user', content: 'a' })) }), /发送上限/);
});
test('saved report provenance is structured and preserved in preview/transport without changing body', async () => {
  const { contextMetadata } = await import('../desktop/design-previews/chat-context.js');
  const saved = { ...item, createdAt: Date.UTC(2026, 9, 22, 12, 30), contextRevision: 3 };
  const label = contextMetadata(saved);
  assert.match(label, /已保存报告.*2026.*事实版本 3/);
  assert.doesNotMatch(label, /AM|PM|1792/);
  assert.equal(contextMetadata({ ...saved, kind: 'file' }), '');
  assert.match(contextMetadata(item), /时间未记录.*事实版本 未记录/);
  const context = createChatContext(); context.select({ id: 's' }); context.add(saved);
  const sent = context.prepare(request()).messages[0].content;
  assert.ok(sent.includes(label)); assert.ok(sent.includes(`\n${item.text}\n`));
  assert.equal(context.list()[0].title, item.title); assert.equal(context.list()[0].text, item.text);
});

test('memory references require fresh native resolution on every send and never mutate history', () => {
  const context = createChatContext(); context.select({ id: 's', projectId: 'p' });
  const memory = { ...item, id: 'memory:m1', kind: 'memory', text: 'old preview', createdAt: 1792700000000, contextRevision: 1 };
  context.add(memory);
  assert.throws(() => context.prepare(request()), /记忆.*重新/);
  assert.throws(() => context.prepare(request(), []), /记忆.*重新/);
  assert.throws(() => context.prepare(request(), [{ ...memory, id: 'memory:other' }]), /记忆.*重新/);
  const original = request();
  const sent = context.prepare(original, [{ ...memory, text: 'latest saved value', contextRevision: 2 }]);
  assert.match(sent.messages[0].content, /用户保存.*记忆版本 2/);
  assert.match(sent.messages[0].content, /latest saved value/);
  assert.doesNotMatch(sent.messages[0].content, /old preview/);
  assert.equal(original.messages.length, 1);
  assert.throws(() => context.prepare(request()), /记忆.*重新/);
  context.remove(memory.id); assert.equal(context.prepare(request()).messages.length, 1);
});

test('fresh memory content shares the attachment budget and cannot enter another session', () => {
  const context = createChatContext(); context.select({ id: 's', projectId: 'p' });
  const memory = { ...item, id: 'memory:m', kind: 'memory' }; context.add(memory);
  context.add({ ...item, id: 'file:f', kind: 'file', text: 'x'.repeat(24000) });
  assert.throws(() => context.prepare(request(), [{ ...memory, text: 'x'.repeat(1000) }]), /24 KiB/);
  context.select({ id: 's', projectId: 'other' });
  assert.throws(() => context.prepare(request(), [memory]), /记忆.*重新/);
  assert.equal(context.prepare(request()).messages.length, 1);
});
