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
