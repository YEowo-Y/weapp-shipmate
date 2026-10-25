/* global structuredClone, queueMicrotask, setImmediate */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore, normalizeSessionSnapshot } from '../desktop/design-previews/session-store.js';
import { parseSessionBackup, mergeSessionBackup } from '../desktop/design-previews/session-transfer.js';
import { createDemoResult } from '../desktop/design-previews/demo-result.js';
import { runGuide } from '../src/guide.mjs';

const snapshot = () => ({ version: 1, currentSessionId: 'session-1', sessionSequence: 2, sessions: [{ id: 'session-1', title: 'Conversation', draft: 'Draft', references: ['app.json'], pendingScenario: 'normal', messages: [{ id: 'u1', role: 'user', text: 'Question', status: 'complete' }] }] });
const code = expected => error => error.code === expected;

test('rich snapshots round-trip as isolated JSON with all continuity fields', () => {
  const value = snapshot(), session = value.sessions[0];
  session.draftView = { selectionStart: 1, selectionEnd: 3, selectionDirection: 'backward', scrollTop: 2 };
  session.edit = { messageId: 'u1', originalDraft: 'Original', originalContext: { references: ['app.json'], pendingScenario: 'timeout' } };
  session.modelSelection = { providerId: 'anthropic', model: 'claude-test', label: 'Claude' };
  session.messages[0].live = { ...session.modelSelection, messages: [{ role: 'user', content: 'Question' }] };
  session.viewState = { scrollTop: 34, followLatest: false, readingDetails: true, readingAnchor: { messageId: 'u1', readingKey: 'code-0' }, disclosures: [{ messageId: 'u1', component: 'trace', open: true }], readingPositions: [{ messageId: 'u1', key: 'code-0', top: 2, left: 3 }], guideResults: [{ messageId: 'u1', state: { query: '备案', disclosures: [{ component: 'guide-stage-filing', open: true }] } }] };
  session.messages.push({ id: 'a1', role: 'assistant', sourceUserId: 'u1', text: 'Answer', status: 'complete', structuredResult: createDemoResult(), parts: [{ type: 'text', text: 'Answer' }], fact: { text: 'Fact', source: 'audit.html' }, advice: { text: 'Advice' }, trace: { runId: 'r1', state: 'complete', elapsedMs: 20 }, review: { state: 'rejected', kind: 'local-demo-change', files: ['app.json'] } });
  const result = normalizeSessionSnapshot(value);
  assert.deepEqual(result, value);
  assert.deepEqual(normalizeSessionSnapshot(JSON.parse(JSON.stringify(result))), value);
  result.sessions[0].messages[0].live.messages[0].content = 'Changed';
  assert.equal(session.messages[0].live.messages[0].content, 'Question');
});

test('allowlists exclude credential, controller, attachment and unknown data at each boundary', () => {
  const value = snapshot(); value.credentials = { apiKey: 'secret' };
  const session = value.sessions[0]; session.oauth = { token: 'secret' }; session.controller = new AbortController();
  session.modelSelection = { providerId: 'openai', model: 'test', label: 'Test', apiKey: 'secret' };
  Object.assign(session.messages[0], { token: 'secret', attachment: 'blob:secret', live: { ...session.modelSelection, messages: [{ role: 'user', content: 'Question', authorization: 'secret' }] } });
  const output = JSON.stringify(normalizeSessionSnapshot(value));
  assert.doesNotMatch(output, /secret|apiKey|credentials|oauth|controller|attachment|authorization/);
});

test('archive metadata is optional for old snapshots and strictly boolean when present', () => {
  const value = snapshot();
  assert.equal(Object.hasOwn(normalizeSessionSnapshot(value).sessions[0], 'archived'), false);
  for (const archived of [true, false]) {
    value.sessions[0].archived = archived;
    assert.equal(normalizeSessionSnapshot(value, { restore: true }).sessions[0].archived, archived);
  }
  value.sessions[0].archived = 'true';
  assert.throws(() => normalizeSessionSnapshot(value), code('invalid'));
});

test('guide results reuse their schema and retain safe tool/result display', () => {
  const value = snapshot(); const result = runGuide({ subject_type: 'personal', collects_sensitive: false, has_server_domain: true });
  value.sessions[0].messages.push({ id: 'g1', role: 'assistant', text: 'Guide', status: 'complete', guide: { subject: 'personal', sensitive: false, domain: true }, tool: { kind: 'guide', name: 'weapp_shipmate_guide', parameters: { subject: 'personal', sensitive: false, domain: true }, label: 'Guide', state: 'success' }, structuredResult: result });
  assert.deepEqual(normalizeSessionSnapshot(value).sessions[0].messages[1].structuredResult, result);
  result.items[0].signal = { pattern: ['备案'], present: true };
  assert.deepEqual(normalizeSessionSnapshot(value).sessions[0].messages[1].structuredResult, result);
  value.sessions[0].messages[1].structuredResult.items[0].severity = 'fabricated';
  assert.throws(() => normalizeSessionSnapshot(value), code('invalid'));
});

test('restore interrupts all active display states and expires approvals without changing stored input', () => {
  const value = snapshot();
  value.sessions[0].messages.push({ id: 'a1', role: 'assistant', text: 'Partial', status: 'streaming', trace: { runId: 'r1', state: 'working', elapsedMs: 10 }, tool: { label: 'Tool', state: 'running' }, parts: [{ type: 'text', text: 'Partial' }, { type: 'tool', tool: { label: 'Tool', state: 'running' } }], review: { state: 'accepted', files: ['app.json'], kind: 'local-demo-change' } });
  const message = normalizeSessionSnapshot(value, { restore: true }).sessions[0].messages[1];
  assert.equal(message.status, 'stopped'); assert.equal(message.trace.state, 'stopped'); assert.equal(message.tool.state, 'canceled');
  assert.equal(message.parts[1].tool.state, 'canceled'); assert.equal(message.review.state, 'stale');
  assert.equal(message.branchNote, '页面刷新中断了上次回复；已保留已有内容。');
  assert.equal(value.sessions[0].messages[1].status, 'streaming');
});

for (const [name, mutate, expected = 'invalid'] of [
  ['version', value => { value.version = 2; }, 'version'],
  ['duplicate sessions', value => value.sessions.push(structuredClone(value.sessions[0]))],
  ['duplicate messages', value => value.sessions[0].messages.push(structuredClone(value.sessions[0].messages[0]))],
  ['unknown active session', value => { value.currentSessionId = 'absent'; }],
  ['counter collision', value => { value.sessionSequence = 0; }],
  ['invalid role', value => { value.sessions[0].messages[0].role = 'system'; }],
  ['invalid status', value => { value.sessions[0].messages[0].status = 'fake'; }],
  ['invalid number', value => { value.sessions[0].draftView = { scrollTop: NaN }; }],
  ['unsafe fact URL', value => { value.sessions[0].messages[0].fact = { text: 'Fact', source: 'blob:secret' }; }],
  ['invalid structure', value => { value.sessions[0].messages[0].structuredResult = { simulation: true }; }],
  ['session limit', value => { value.sessions = Array.from({ length: 201 }, (_, i) => ({ ...value.sessions[0], id: `s${i}` })); }, 'limit'],
]) test(`rejects ${name} as a whole archive`, () => { const value = snapshot(); mutate(value); assert.throws(() => normalizeSessionSnapshot(value), code(expected)); });

// This fake models serialized transactions and rollback, not browser storage internals.
function fakeIDB() {
  const records = new Map(), queue = []; let running = false;
  const api = { records, failNext: null, block: false, connections: [], commits: 0, releaseCommit: null, holdCommit: false };
  function pump() { if (running || !queue.length) return; running = true; queue.shift()(); }
  const next = () => { running = false; queueMicrotask(pump); };
  api.open = () => {
    const request = {};
    queueMicrotask(() => {
      if (api.block) { request.onblocked?.(); return; }
      const db = { closed: false, objectStoreNames: { contains: () => true }, close() { this.closed = true; }, transaction() {
        if (this.closed) throw new Error('Closed');
        const tx = { aborted: false, error: null, abort() { if (this.aborted) return; this.aborted = true; queueMicrotask(() => { this.onabort?.(); }); } };
        let staged; let key; let requestGet;
        tx.objectStore = () => ({ get(value) { key = value; requestGet = {}; return requestGet; }, put(value, target) { staged = structuredClone(value); key = target; return {}; } });
        queue.push(() => { queueMicrotask(() => {
          if (tx.aborted) { next(); return; }
          requestGet.result = structuredClone(records.get(key)); requestGet.onsuccess?.();
          const commit = () => {
            if (tx.aborted) { next(); return; }
            if (api.failNext) { tx.error = { name: api.failNext }; api.failNext = null; tx.abort(); next(); return; }
            if (staged !== undefined) { records.set(key, staged); api.commits++; }
            tx.oncomplete?.(); next();
          };
          if (api.holdCommit) api.releaseCommit = commit; else queueMicrotask(commit);
        }); }); queueMicrotask(pump); return tx;
      } };
      api.connections.push(db); request.result = db; request.onsuccess?.();
    }); return request;
  };
  return api;
}

test('appended backups persist archive metadata, drafts and remapped messages after reopening', async () => {
  const indexedDB = fakeIDB();
  const store = createSessionStore({ indexedDB });
  const original = snapshot();
  await store.save(original, 0);
  const backup = snapshot(); backup.sessions[0].archived = true; backup.sessions[0].title = 'Imported archive';
  const merged = mergeSessionBackup(original, parseSessionBackup(JSON.stringify(backup)));
  await store.save(merged.snapshot, 1); store.close();
  const reopened = createSessionStore({ indexedDB });
  const loaded = await reopened.load();
  assert.equal(loaded.revision, 2); assert.equal(loaded.snapshot.currentSessionId, original.currentSessionId);
  assert.equal(loaded.snapshot.sessions.length, 2);
  const added = loaded.snapshot.sessions.find(session => session.title === 'Imported archive');
  assert.equal(added.archived, true); assert.equal(added.draft, 'Draft');
  assert.notEqual(added.messages[0].id, 'u1');
  reopened.close();
});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('writes acknowledge only commit and survive closing/reopening by workspace', async () => {
  const db = fakeIDB(), store = createSessionStore({ indexedDB: db });
  assert.deepEqual(await store.load(), { revision: 0, snapshot: null });
  db.holdCommit = true; let done = false;
  const pending = store.save(snapshot(), 0).then(result => { done = true; return result; });
  await tick(); assert.equal(done, false); assert.equal(db.commits, 0);
  db.holdCommit = false; db.releaseCommit(); assert.deepEqual(await pending, { revision: 1 });
  store.close(); const reopened = createSessionStore({ indexedDB: db });
  assert.deepEqual(await reopened.load(), { revision: 1, snapshot: snapshot() });
  assert.deepEqual(await createSessionStore({ indexedDB: db, workspace: 'other' }).load(), { revision: 0, snapshot: null });
  reopened.close();
});

test('concurrent stale writers use transaction CAS and never overwrite the winner', async () => {
  const db = fakeIDB(), a = createSessionStore({ indexedDB: db }), b = createSessionStore({ indexedDB: db });
  const first = snapshot(), second = snapshot(); second.sessions[0].title = 'Other';
  const outcomes = await Promise.allSettled([a.save(first, 0), b.save(second, 0)]);
  assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].reason.code, 'conflict');
  assert.equal((await a.load()).snapshot.sessions[0].title, 'Conversation'); a.close(); b.close();
});

test('write abort and quota failures preserve previous record and revision', async () => {
  const db = fakeIDB(), store = createSessionStore({ indexedDB: db }); await store.save(snapshot(), 0);
  for (const [failure, expected] of [['QuotaExceededError', 'quota'], ['AbortError', 'unavailable']]) {
    db.failNext = failure; await assert.rejects(store.save(snapshot(), 1), code(expected));
    assert.equal((await store.load()).revision, 1);
  }
  store.close();
});

test('invalid stored records are preserved and cannot be overwritten by a fresh save', async () => {
  const db = fakeIDB(); db.records.set('my-miniprogram', { revision: 4, snapshot: { version: 2 } });
  const store = createSessionStore({ indexedDB: db });
  await assert.rejects(store.load(), code('version')); await assert.rejects(store.save(snapshot(), 4), code('version'));
  assert.equal(db.records.get('my-miniprogram').revision, 4); store.close();
});

test('missing/blocked storage and versionchange reject promptly and close connections', async () => {
  await assert.rejects(createSessionStore({ indexedDB: null }).load(), code('unavailable'));
  const blocked = fakeIDB(); blocked.block = true;
  await assert.rejects(createSessionStore({ indexedDB: blocked }).load(), code('unavailable'));
  const db = fakeIDB(), store = createSessionStore({ indexedDB: db }); await store.load();
  db.connections[0].onversionchange(); assert.equal(db.connections[0].closed, true);
  await assert.rejects(store.save(snapshot(), 0), code('version-change'));
});

test('numeric controller run IDs and tool metadata survive without changing identity', () => {
  const value = snapshot();
  value.sessions[0].messages.push({ id: 'a1', role: 'assistant', text: '', status: 'working', trace: { runId: 1, state: 'working', elapsedMs: 0 }, review: { state: 'pending', runId: 1 }, tool: { name: 'demo_preflight', label: 'Demo', state: null, parameters: { subject: 'personal', source: 'fixed-example', readOnly: true } } });
  assert.equal(normalizeSessionSnapshot(value).sessions[0].messages[1].trace.runId, 1);
});

test('oversized message counts and UTF-8 archives reject rather than truncate', () => {
  let value = snapshot(); value.sessions[0].messages = Array.from({ length: 2001 }, (_, i) => ({ id: `u${i}`, role: 'user', text: '' }));
  assert.throws(() => normalizeSessionSnapshot(value), code('limit'));
  value = snapshot(); value.sessions[0].messages = Array.from({ length: 8 }, (_, i) => ({ id: `u${i}`, role: 'user', text: '字'.repeat(1024 * 1024) }));
  assert.throws(() => normalizeSessionSnapshot(value), code('limit'));
  assert.equal(normalizeSessionSnapshot(value, { maxBytes: Infinity }).sessions[0].messages.length, 8);
});

test('close aborts pending writes and future calls reject without mutating the record', async () => {
  const db = fakeIDB(), store = createSessionStore({ indexedDB: db }); await store.save(snapshot(), 0);
  db.holdCommit = true; const pending = store.save(snapshot(), 1); await tick(); store.close();
  await assert.rejects(pending, code('unavailable')); db.releaseCommit();
  assert.equal(db.records.get('my-miniprogram').revision, 1);
  await assert.rejects(store.load(), code('unavailable'));
});

test('export mode retains oversized counts and strings while validating and stripping unknown keys', () => {
  const value = snapshot();
  value.sessions = Array.from({ length: 201 }, (_, i) => ({ id: `archive-${i}`, title: 'Title', draft: '', messages: [] }));
  value.currentSessionId = 'archive-0';
  value.sessions[0].messages = Array.from({ length: 2001 }, (_, i) => ({ id: `message-${i}`, role: 'user', text: '' }));
  value.sessions[0].draft = 'x'.repeat(2 * 1024 * 1024 + 1); value.apiKey = 'secret';
  assert.throws(() => normalizeSessionSnapshot(value), code('limit'));
  const exported = normalizeSessionSnapshot(value, { mode: 'export' });
  assert.equal(exported.sessions.length, 201); assert.equal(exported.sessions[0].messages.length, 2001);
  assert.equal(exported.sessions[0].draft, value.sessions[0].draft); assert.equal(exported.apiKey, undefined);
  value.sessions[0].messages[0].role = 'system';
  assert.throws(() => normalizeSessionSnapshot(value, { mode: 'export' }), code('invalid'));
});

test('missing references and scenario receive explicit safe defaults for sessions and edit context', () => {
  const value = snapshot(); delete value.sessions[0].references; delete value.sessions[0].pendingScenario;
  value.sessions[0].edit = { messageId: 'u1', originalDraft: '', originalContext: {} };
  const session = normalizeSessionSnapshot(value).sessions[0];
  assert.deepEqual(session.references, []); assert.equal(session.pendingScenario, 'normal');
  assert.deepEqual(session.edit.originalContext, { references: [], pendingScenario: 'normal' });
});

test('unexpected database close permits reopening with the same CAS revision', async () => {
  const db = fakeIDB(), store = createSessionStore({ indexedDB: db }); await store.save(snapshot(), 0);
  db.connections[0].closed = true; db.connections[0].onclose();
  assert.deepEqual(await store.save(snapshot(), 1), { revision: 2 });
  assert.equal(db.connections.length, 2); assert.equal((await store.load()).revision, 2);
  store.close(); await assert.rejects(store.load(), code('unavailable'));
});

test('local note and tool report identities round-trip and reject unsupported record kinds', () => {
  const value = snapshot();
  value.sessions[0].messages[0].record = { kind: 'note', label: '本地记录' };
  value.sessions[0].messages.push({ id: 'report-1', role: 'assistant', text: 'Local tool output', status: 'complete', record: { kind: 'report', label: '真实本机检查' } });
  const restored = normalizeSessionSnapshot(JSON.parse(JSON.stringify(normalizeSessionSnapshot(value))), { restore: true });
  assert.deepEqual(restored.sessions[0].messages, value.sessions[0].messages);
  value.sessions[0].messages[1].record.kind = 'model';
  assert.throws(() => normalizeSessionSnapshot(value), code('invalid'));
});

test('project metadata preserves legacy snapshots and validates remembered scope', () => {
  const value = snapshot();
  assert.equal(normalizeSessionSnapshot(value).sessions[0].projectId, undefined);
  value.sessions[0].projectId = 'project-a';
  value.projectCurrentSessions = [{ projectId: 'project-a', sessionId: 'session-1' }];
  assert.deepEqual(normalizeSessionSnapshot(value), value);
  value.projectCurrentSessions[0].projectId = 'project-b';
  assert.throws(() => normalizeSessionSnapshot(value), code('invalid'));
});

test('import provenance persists through committed storage reopen and export/import without restoring grants', async () => {
  const db = fakeIDB(), store = createSessionStore({ indexedDB: db });
  const source = snapshot();
  source.sessions[0].messages.push({ id: 'a1', role: 'assistant', text: '外部说明', provenance: 'verified',
    tool: { label: '历史工具', state: 'success', provenance: 'local' }, review: { state: 'accepted' },
    agent: { allowRead: true }, attachment: { text: 'private-attachment' } });
  const imported = mergeSessionBackup(snapshot(), parseSessionBackup(JSON.stringify(source))).snapshot;
  await store.save(imported, 0); store.close();
  const reopened = createSessionStore({ indexedDB: db });
  const restored = (await reopened.load()).snapshot;
  const historical = restored.sessions.at(-1).messages.at(-1);
  assert.equal(historical.provenance, 'imported');
  assert.equal(historical.tool.provenance, 'imported');
  assert.equal(historical.review.state, 'stale');
  assert.equal(restored.sessions[0].messages[0].provenance, undefined, 'existing local messages stay local');
  const exported = JSON.stringify(normalizeSessionSnapshot(restored, { mode: 'export' }));
  assert.doesNotMatch(exported, /allowRead|private-attachment/);
  assert.equal(parseSessionBackup(exported).sessions.at(-1).messages.at(-1).provenance, 'imported');
  reopened.close();
});
