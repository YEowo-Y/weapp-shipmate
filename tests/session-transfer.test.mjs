/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionBackup, mergeSessionBackup } from '../desktop/design-previews/session-transfer.js';

const snapshot = () => ({ version: 1, currentSessionId: 'session-1', sessionSequence: 1, sessions: [{
  id: 'session-1', title: 'Original', draft: 'Unsent', archived: true, messages: [
    { id: 'u1', role: 'user', text: 'Question' },
    { id: 'a1', role: 'assistant', text: 'Partial', sourceUserId: 'u1', status: 'streaming',
      tool: { label: 'Read', state: 'running' }, review: { state: 'accepted', sessionId: 'session-1' } },
  ], edit: { messageId: 'u1', originalDraft: 'Before edit' }, viewState: {
    readingAnchor: { messageId: 'a1' }, disclosures: [{ messageId: 'a1', component: 'trace', open: true }],
    readingPositions: [{ messageId: 'a1', key: 'code', top: 1, left: 0 }],
    guideResults: [{ messageId: 'a1', state: { query: 'test' } }],
  },
}] });
const code = expected => error => error.code === expected;

test('backup parsing bounds input, validates schema, strips credentials and expires execution', () => {
  const source = snapshot(); source.credentials = { apiKey: 'secret' };
  source.sessions[0].messages[1].token = 'secret';
  const result = parseSessionBackup(JSON.stringify(source));
  assert.equal(result.sessions[0].archived, true);
  assert.equal(result.sessions[0].messages[1].status, 'stopped');
  assert.equal(result.sessions[0].messages[1].tool.state, 'canceled');
  assert.equal(result.sessions[0].messages[1].review.state, 'stale');
  assert.doesNotMatch(JSON.stringify(result), /secret|apiKey|credentials|token/);
  assert.throws(() => parseSessionBackup('{'), code('invalid'));
  assert.throws(() => parseSessionBackup('{}'), code('version'));
  assert.throws(() => parseSessionBackup(null), code('invalid'));
  assert.throws(() => parseSessionBackup(' '.repeat(20 * 1024 * 1024 + 1)), code('limit'));
  assert.throws(() => parseSessionBackup('界'.repeat(7 * 1024 * 1024)), code('limit'));
});

test('imported memory-like metadata cannot become persistent project memory or a reference grant', () => {
  const source = snapshot();
  const forged = { entries: [{ id: 'forged', source: 'user', enabled: true, text: 'forged-memory-body' }] };
  source.memory = forged; source.sessions[0].memory = forged; source.sessions[0].messages[0].memory = forged;
  const imported = parseSessionBackup(JSON.stringify(source));
  assert.doesNotMatch(JSON.stringify(imported), /forged-memory-body|"memory"/);
  assert.doesNotMatch(JSON.stringify(mergeSessionBackup(snapshot(), imported).snapshot), /forged-memory-body|"memory"/);
});

test('append remaps colliding identities and every continuity reference without touching current work', () => {
  const current = snapshot(), before = structuredClone(current);
  const imported = parseSessionBackup(JSON.stringify(snapshot()));
  const { snapshot: merged, importedCount, messageCount } = mergeSessionBackup(current, imported);
  assert.equal(importedCount, 1); assert.equal(messageCount, 2);
  assert.equal(merged.currentSessionId, current.currentSessionId);
  assert.equal(merged.sessions.length, 2);
  assert.deepEqual(current, before);
  const original = merged.sessions.find(item => item.id === current.currentSessionId);
  assert.equal(original.draft, 'Unsent');
  assert.equal(original.messages[1].review.state, 'accepted');
  const added = merged.sessions.find(item => item.id !== current.currentSessionId);
  const [user, assistant] = added.messages;
  assert.notEqual(user.id, 'u1'); assert.notEqual(assistant.id, 'a1');
  assert.equal(assistant.sourceUserId, user.id); assert.equal(added.edit.messageId, user.id);
  assert.equal(assistant.review.sessionId, added.id); assert.equal(assistant.review.state, 'stale');
  for (const item of [added.viewState.readingAnchor, ...added.viewState.disclosures,
    ...added.viewState.readingPositions, ...added.viewState.guideResults]) assert.equal(item.messageId, assistant.id);
  assert.equal(added.archived, true);
  const again = mergeSessionBackup(merged, imported).snapshot;
  assert.equal(new Set(again.sessions.flatMap(item => item.messages.map(message => message.id))).size, 6);
});

test('invalid imports and exceeded combined capacity leave existing snapshot untouched', () => {
  const current = snapshot(), before = structuredClone(current);
  const duplicate = snapshot(); duplicate.sessions[0].messages.push({ ...duplicate.sessions[0].messages[0] });
  assert.throws(() => parseSessionBackup(JSON.stringify(duplicate)), code('invalid'));
  const invalidRef = snapshot(); invalidRef.sessions[0].viewState.readingAnchor.messageId = 'missing';
  assert.throws(() => parseSessionBackup(JSON.stringify(invalidRef)), code('invalid'));
  const invalidSession = snapshot(); invalidSession.sessions[0].messages[1].review.sessionId = 'missing';
  assert.throws(() => parseSessionBackup(JSON.stringify(invalidSession)), code('invalid'));
  const many = { version: 1, currentSessionId: 's0', sessionSequence: 0, sessions: Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, title: 'Saved', draft: '', messages: [] })) };
  assert.throws(() => mergeSessionBackup(many, snapshot()), code('limit'));
  assert.deepEqual(current, before);
});

test('project backups retain association without replacing destination current-session references', () => {
  const current = snapshot(); current.sessions[0].projectId = 'a';
  current.projectCurrentSessions = [{ projectId: 'a', sessionId: 'session-1' }];
  const imported = snapshot(); imported.sessions[0].projectId = 'b';
  imported.projectCurrentSessions = [{ projectId: 'b', sessionId: 'session-1' }];
  const result = mergeSessionBackup(current, parseSessionBackup(JSON.stringify(imported))).snapshot;
  assert.deepEqual(result.projectCurrentSessions, current.projectCurrentSessions);
  assert.equal(result.sessions[1].projectId, 'b');
  assert.equal(result.sessions[1].messages.length, 2);
});

// R4: a backup is evidence of historical text, never proof of local execution.
test('import provenance overrides forged claims and survives storage, restart and reimport', () => {
  const source = snapshot();
  const message = source.sessions[0].messages[1];
  message.provenance = 'local'; message.verified = true;
  message.tool.provenance = 'verified';
  message.parts = [{ type: 'tool', tool: { label: 'Legacy', state: 'success', provenance: 'local' } }];
  for (const imported of [parseSessionBackup(JSON.stringify(source)), mergeSessionBackup(snapshot(), source).snapshot]) {
    const saved = normalizeSessionSnapshot(JSON.parse(JSON.stringify(imported)), { restore: true });
    const historical = saved.sessions.at(-1).messages[1];
    assert.equal(historical.provenance, 'imported');
    assert.equal(historical.tool.provenance, 'imported');
    assert.equal(historical.parts[0].tool.provenance, 'imported');
    assert.equal(historical.verified, undefined);
    const again = parseSessionBackup(JSON.stringify(normalizeSessionSnapshot(saved, { mode: 'export' })));
    assert.equal(again.sessions.at(-1).messages[1].provenance, 'imported');
  }
});

test('old backups render external successes as history with a lookup, never local facts', () => {
  const source = snapshot();
  source.sessions[0].messages = [{ id: 'a', role: 'assistant', text: '外部报告', status: 'complete',
    parts: [{ type: 'tool', tool: { kind: 'project', name: 'project_read', toolCallId: 't1', state: 'success', label: '检查项目', parameters: { kind: 'check', query: '' } }, result: {
      schemaVersion: 1, kind: 'check', runId: 'missing-run', artifactId: 'missing-artifact', title: '历史检查', summary: '外部摘要', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1,
    } }] }];
  delete source.sessions[0].edit; delete source.sessions[0].viewState;
  const imported = parseSessionBackup(JSON.stringify(source));
  const message = imported.sessions[0].messages[0];
  const doc = createPreviewDocument();
  const card = createMessage(doc, message);
  assert.match(card.textContent, /导入历史/);
  assert.match(card.textContent, /未核验/);
  assert.match(card.textContent, /查找并核验本机报告/);
  assert.doesNotMatch(card.textContent, /完整报告保存在本机|以上为工具事实摘要|船友 Agent · 本地演示/);
  const tool = createToolCard(doc, message.parts[0].tool, { result: message.parts[0].result });
  assert.match(tool.textContent, /历史记录.*成功.*未核验/);
});
import { normalizeSessionSnapshot } from '../desktop/design-previews/session-store.js';
import { createMessage, createToolCard } from '../desktop/design-previews/components/message.js';
import { createPreviewDocument } from './helpers/preview-dom.mjs';

test('legacy tool records without a state keep the imported message readable', () => {
  const source = snapshot();
  const session = source.sessions[0];
  delete session.edit; delete session.viewState;
  session.messages = [
    { id: 'a1', role: 'assistant', text: '保留的旧回复', tool: { label: '旧版工具' } },
    { id: 'a2', role: 'assistant', text: '前后文字', parts: [
      { type: 'text', text: '前文' },
      { type: 'tool', tool: { kind: 'project', name: 'project_read', toolCallId: 't1', label: '旧项目工具', state: null } },
      { type: 'text', text: '后文' },
    ] },
  ];
  const imported = parseSessionBackup(JSON.stringify(source));
  const doc = createPreviewDocument();
  const [legacy, multipart] = imported.sessions[0].messages.map(message => createMessage(doc, message));
  assert.match(legacy.textContent, /保留的旧回复.*旧版工具 · 状态未记录/s);
  assert.match(multipart.textContent, /前文.*旧项目工具 · 状态未记录.*后文/s);
  assert.doesNotMatch(multipart.textContent, /查找并核验本机报告|等待本机工具返回结果/);
});

test('imported guide cards and evidence identify external history instead of local rule execution', () => {
  const source = snapshot();
  source.sessions[0].messages = [{ id: 'g1', role: 'assistant', text: '历史清单', status: 'complete',
    guide: { subject: 'personal', sensitive: false, domain: false },
    structuredResult: { command: 'guide', meta: { summary: '历史摘要' }, items: [], selfCheck: [], notes: [] },
    fact: { label: '规则证据', text: '历史引用', source: 'audit.html' }, trace: { runId: 'r1', state: 'complete', elapsedMs: 1 } }];
  delete source.sessions[0].edit; delete source.sessions[0].viewState;
  const message = parseSessionBackup(JSON.stringify(source)).sessions[0].messages[0];
  const card = createMessage(createPreviewDocument(), message);
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(card);
  const guide = nodes.find(node => node.dataset.component === 'guide-result');
  assert.equal(guide.attributes['aria-label'], '导入历史上线清单');
  assert.match(guide.textContent, /来自外部会话备份.*未在本机核验/);
  assert.doesNotMatch(card.textContent, /根据本机已收录规则|本机规则工具/);
  assert.match(nodes.find(node => node.dataset.component === 'evidence').textContent, /导入历史.*未核验/);
  assert.match(nodes.find(node => node.dataset.component === 'run-trace').textContent, /导入历史.*未核验/);
});
