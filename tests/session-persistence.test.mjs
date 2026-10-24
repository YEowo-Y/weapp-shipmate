/* global structuredClone */
/* global DOMException */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionPersistence } from '../desktop/design-previews/session-persistence.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let n = 0; n < 6; n++) await Promise.resolve(); };

test('microtask batching persists the latest snapshot and serializes changes made during a transaction', async () => {
  const writes = [], states = []; let snapshot = { text: 'a' };
  const queue = createSessionPersistence({ revision: 4, getSnapshot: () => snapshot, onStatus: state => states.push(state), store: {
    save(value, revision) { const task = deferred(); writes.push({ value: structuredClone(value), revision, task }); return task.promise; },
  } });
  assert.deepEqual(queue.getState(), { state: 'saved', revision: 4, dirty: false });
  queue.schedule(); snapshot.text = 'b'; queue.schedule();
  assert.equal(queue.hasUnsavedChanges(), true); assert.equal(writes.length, 0);
  const flush = queue.flush(); await tick();
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].value, { text: 'b' });
  snapshot.text = 'c'; queue.schedule(); snapshot.text = 'd'; queue.schedule();
  assert.equal(writes.length, 1);
  writes[0].task.resolve({ revision: 5 }); await tick();
  assert.equal(writes.length, 2); assert.deepEqual(writes[1].value, { text: 'd' }); assert.equal(writes[1].revision, 5);
  assert.equal(queue.getState().state, 'saving'); assert.equal(states.some(state => state.state === 'saved'), false);
  writes[1].task.resolve({ revision: 6 });
  assert.deepEqual(await flush, { state: 'saved', revision: 6, dirty: false });
  assert.equal(queue.hasUnsavedChanges(), false);
});

test('transaction failure preserves dirty content and revision until explicit retry succeeds', async () => {
  let fails = true, calls = 0, snapshot = 'first';
  const queue = createSessionPersistence({ revision: 2, getSnapshot: () => snapshot, store: {
    async save(value, revision) { calls++; assert.equal(revision, 2); if (fails) throw Object.assign(new Error('quota'), { code: 'quota' }); assert.equal(value, 'newest'); return { revision: 3 }; },
  } });
  queue.schedule(); assert.deepEqual(await queue.flush(), { state: 'error', code: 'quota', revision: 2, dirty: true });
  snapshot = 'newest'; queue.schedule(); await queue.flush(); await tick(); assert.equal(calls, 1);
  fails = false; assert.deepEqual(await queue.retry(), { state: 'saved', revision: 3, dirty: false }); assert.equal(calls, 2);
});

test('CAS conflict remains dirty and cannot be overwritten by schedule, flush, or retry', async () => {
  let calls = 0;
  const queue = createSessionPersistence({ revision: 7, getSnapshot: () => ({}), store: {
    async save() { calls++; throw Object.assign(new Error('conflict'), { code: 'conflict' }); },
  } });
  queue.schedule(); const failed = await queue.flush();
  assert.deepEqual(failed, { state: 'error', code: 'conflict', revision: 7, dirty: true });
  queue.schedule(); assert.deepEqual(await queue.flush(), failed); assert.deepEqual(await queue.retry(), failed); assert.equal(calls, 1);
});

test('snapshot and synchronous serialization exceptions are caught and retryable', async () => {
  let snapshotFails = true, saveFails = true, calls = 0;
  const queue = createSessionPersistence({ getSnapshot() { if (snapshotFails) throw new Error('snapshot'); return {}; }, store: {
    save() { calls++; if (saveFails) throw Object.assign(new Error('cannot clone'), { code: 'serialization' }); return Promise.resolve({ revision: 1 }); },
  } });
  queue.schedule(); assert.equal((await queue.flush()).code, 'snapshot-failed'); assert.equal(calls, 0);
  snapshotFails = false; assert.equal((await queue.retry()).code, 'serialization'); assert.equal(calls, 1);
  saveFails = false; assert.equal((await queue.retry()).state, 'saved');
});

test('dispose cancels queued work and suppresses notifications without marking dirty content saved', async () => {
  let calls = 0; const statuses = [];
  const queue = createSessionPersistence({ getSnapshot: () => ({}), onStatus: state => statuses.push(state), store: { async save() { calls++; return { revision: 1 }; } } });
  queue.schedule(); const count = statuses.length; queue.dispose(); queue.schedule(); await queue.flush(); await queue.retry();
  assert.equal(calls, 0); assert.equal(statuses.length, count); assert.equal(queue.hasUnsavedChanges(), true); assert.equal(queue.getState().code, 'disposed');
});

test('dispose during a write records only its committed revision and never starts the next dirty write', async () => {
  const transaction = deferred(); let calls = 0; const statuses = [];
  const queue = createSessionPersistence({ getSnapshot: () => ({}), onStatus: state => statuses.push(state), store: { save() { calls++; return transaction.promise; } } });
  queue.schedule(); const flushed = queue.flush(); await tick(); queue.schedule(); queue.dispose(); const count = statuses.length;
  transaction.resolve({ revision: 1 }); const state = await flushed;
  assert.equal(state.revision, 1); assert.equal(state.dirty, true); assert.equal(state.code, 'disposed');
  assert.equal(calls, 1); assert.equal(statuses.length, count);
});

test('a failed active transaction leaves newer changes dirty and retry captures their latest snapshot', async () => {
  const first = deferred(), writes = []; let snapshot = 'before';
  const queue = createSessionPersistence({ revision: 8, getSnapshot: () => snapshot, store: {
    save(value, revision) { writes.push({ value, revision }); return writes.length === 1 ? first.promise : Promise.resolve({ revision: 9 }); },
  } });
  queue.schedule(); const flushed = queue.flush(); await tick();
  snapshot = 'after'; queue.schedule(); first.reject(new Error('aborted'));
  assert.deepEqual(await flushed, { state: 'error', code: 'save-failed', revision: 8, dirty: true });
  assert.equal(writes.length, 1);
  assert.equal((await queue.retry()).state, 'saved');
  assert.deepEqual(writes, [{ value: 'before', revision: 8 }, { value: 'after', revision: 8 }]);
});

test('presentation failures cannot corrupt committed revisions and clean flush does not write', async () => {
  let calls = 0;
  const queue = createSessionPersistence({ getSnapshot: () => ({}), onStatus() { throw new Error('view unavailable'); }, store: {
    async save() { calls++; return { revision: 1 }; },
  } });
  await queue.flush(); await queue.retry(); assert.equal(calls, 0);
  queue.schedule(); assert.deepEqual(await queue.flush(), { state: 'saved', revision: 1, dirty: false });
  const state = queue.getState(); state.revision = 99;
  assert.equal(queue.getState().revision, 1);
  queue.dispose(); assert.equal(queue.hasUnsavedChanges(), false); assert.equal(queue.getState().state, 'saved');
  queue.schedule(); await queue.flush(); assert.equal(calls, 1);
});

test('snapshot commit waits for pending saves and applies only after durable commit', async () => {
  const writes = []; let current = 'original';
  const queue = createSessionPersistence({ revision: 4, getSnapshot: () => current, store: {
    save(value, revision) { const task = deferred(); writes.push({ value, revision, task }); return task.promise; },
  } });
  queue.schedule(); await tick();
  const committing = queue.commitSnapshot('imported', value => { current = value; });
  assert.equal(writes.length, 1); assert.equal(current, 'original');
  writes[0].task.resolve({ revision: 5 }); await tick();
  assert.equal(writes.length, 2); assert.equal(writes[1].revision, 5);
  assert.equal(queue.hasUnsavedChanges(), true); assert.equal(current, 'original');
  writes[1].task.resolve({ revision: 6 });
  assert.deepEqual(await committing, { state: 'saved', revision: 6, dirty: false });
  assert.equal(current, 'imported');
  queue.schedule(); await tick(); assert.equal(writes[2].value, 'imported'); assert.equal(writes[2].revision, 6);
  writes[2].task.resolve({ revision: 7 }); await queue.flush();
});

test('snapshot write failure never applies and conflict cannot be bypassed', async () => {
  let applied = false, calls = 0;
  const queue = createSessionPersistence({ revision: 3, getSnapshot: () => 'original', store: {
    async save() { calls++; throw Object.assign(new Error('conflict'), { code: 'conflict' }); },
  } });
  await assert.rejects(queue.commitSnapshot('imported', () => { applied = true; }), { code: 'conflict' });
  assert.equal(applied, false); assert.equal(queue.getState().revision, 3);
  assert.equal(queue.hasUnsavedChanges(), false);
  await assert.rejects(queue.commitSnapshot('again', () => {}), { code: 'conflict' });
  await queue.retry(); assert.equal(calls, 1);
});

test('concurrent snapshot commit and changes while waiting reject before writing stale candidate', async () => {
  const task = deferred(); let calls = 0, current = 'one';
  const queue = createSessionPersistence({ getSnapshot: () => current, store: {
    save() { calls++; return calls === 1 ? task.promise : Promise.resolve({ revision: 2 }); },
  } });
  queue.schedule(); await tick();
  const pending = queue.commitSnapshot('imported', () => { throw new Error('must not apply'); });
  await assert.rejects(queue.commitSnapshot('other', () => {}), { code: 'busy' });
  current = 'two'; queue.schedule(); task.resolve({ revision: 1 });
  await assert.rejects(pending, { code: 'changed' });
  assert.equal(calls, 2); assert.equal(queue.getState().revision, 2);
});

test('lifecycle schedules during commit run after apply and preserve the new snapshot', async () => {
  const task = deferred(), writes = []; let current = 'original';
  const queue = createSessionPersistence({ getSnapshot: () => current, store: {
    save(value, revision) { writes.push({ value, revision }); return writes.length === 1 ? task.promise : Promise.resolve({ revision: 2 }); },
  } });
  const pending = queue.commitSnapshot('imported', value => { current = value; }); await tick();
  queue.schedule(); queue.schedule();
  assert.equal(writes.length, 1);
  task.resolve({ revision: 1 }); await pending; await queue.flush();
  assert.deepEqual(writes, [{ value: 'imported', revision: 0 }, { value: 'imported', revision: 1 }]);
  assert.equal(queue.getState().dirty, false);
});

test('quota snapshot failure allows a new validated attempt without importing failed data', async () => {
  let calls = 0, current = 'original';
  const queue = createSessionPersistence({ getSnapshot: () => current, store: {
    async save() { if (++calls === 1) throw Object.assign(new Error('quota'), { code: 'quota' }); return { revision: 1 }; },
  } });
  await assert.rejects(queue.commitSnapshot('failed', value => { current = value; }), { code: 'quota' });
  assert.equal(current, 'original');
  await queue.retry();
  await queue.commitSnapshot('retry', value => { current = value; });
  assert.equal(current, 'retry'); assert.equal(calls, 2);
});

test('disposed snapshot transactions never apply to a torn-down view', async () => {
  const task = deferred(); let applied = false;
  const queue = createSessionPersistence({ getSnapshot: () => 'original', store: { save: () => task.promise } });
  const pending = queue.commitSnapshot('imported', () => { applied = true; }); await tick();
  queue.dispose(); task.resolve({ revision: 1 });
  await assert.rejects(pending, { code: 'disposed' });
  assert.equal(applied, false); assert.equal(queue.getState().revision, 1);
});

test('apply failure preserves the committed revision and requires reload instead of stale overwrite', async () => {
  let calls = 0;
  const queue = createSessionPersistence({ getSnapshot: () => 'original', store: {
    async save() { calls++; return { revision: 1 }; },
  } });
  await assert.rejects(queue.commitSnapshot('imported', () => { throw new Error('view failed'); }), { code: 'apply-failed' });
  queue.schedule(); await queue.retry();
  assert.equal(calls, 1); assert.equal(queue.getState().revision, 1);
  await assert.rejects(queue.commitSnapshot('another', () => {}), { code: 'apply-failed' });
});

for (const error of [new DOMException('View failed', 'NotFoundError'), Object.assign(new Error('View failed'), { code: 'quota' })]) {
  test(`coded apply failure (${error.code}) cannot overwrite an already committed import`, async () => {
    const writes = [];
    const queue = createSessionPersistence({ getSnapshot: () => 'old UI snapshot', store: {
      async save(value) { writes.push(value); return { revision: writes.length }; },
    } });
    await assert.rejects(queue.commitSnapshot('new imported snapshot', () => { throw error; }), { code: 'apply-failed' });
    queue.schedule(); await queue.flush(); await queue.retry();
    await assert.rejects(queue.commitSnapshot('duplicate import', () => {}), { code: 'apply-failed' });
    assert.deepEqual(writes, ['new imported snapshot']);
    assert.equal(queue.getState().revision, 1);
  });
}
