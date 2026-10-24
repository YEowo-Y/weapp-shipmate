import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialRpc } from '../desktop/server/credential-rpc.mjs';

test('private credential replies are consumed once and never exposed as transport events', async () => {
  const frames = [];
  const rpc = createCredentialRpc(frame => frames.push(frame));
  const loaded = rpc.store.load('openai');
  assert.equal(frames[0].type, 'credential');
  assert.equal(frames[0].operation, 'load');
  assert.equal(rpc.receive({ type: 'chunk', id: frames[0].id }), false);
  assert.equal(rpc.receive({ type: 'credential-result', id: frames[0].id, ok: true, record: { key: 'private', method: 'api-key' } }), true);
  assert.deepEqual(await loaded, { key: 'private', method: 'api-key' });
  assert.equal(rpc.receive({ type: 'credential-result', id: frames[0].id, ok: true, record: 'duplicate' }), true);
  const save = rpc.store.save('openai', { key: 'private', method: 'api-key' });
  rpc.receive({ type: 'credential-result', id: frames[1].id, ok: false, error: 'private reflected' });
  await assert.rejects(save, error => !error.message.includes('reflected'));
  rpc.close();
  await assert.rejects(rpc.store.load('openai'));
});

test('private credential timeout, shutdown, invalid provider and write failure are bounded', async () => {
  const rpc = createCredentialRpc(() => {}, { timeoutMs: 5 });
  await assert.rejects(rpc.store.load('unknown'));
  await assert.rejects(rpc.store.load('openai'));
  const pending = rpc.store.delete('openai'); rpc.close(); await assert.rejects(pending);
  const broken = createCredentialRpc(() => { throw new Error('pipe private'); });
  await assert.rejects(broken.store.load('openai'), error => !error.message.includes('pipe private'));
  broken.close();
});
