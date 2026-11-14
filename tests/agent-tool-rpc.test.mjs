import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentToolRpc } from '../desktop/server/agent-tool-rpc.mjs';

const result = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '检查结果', summary: '检查完成', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
const args = { requestId: 'request-1', toolCallId: 'call-1', input: { kind: 'check', query: '' } };
test('private project RPC validates boundaries and accepts exactly one response', async () => {
  const frames = [], rpc = createAgentToolRpc(frame => frames.push(frame));
  const pending = rpc.run(args);
  assert.equal(frames[0].type, 'project-tool');
  assert.deepEqual(frames[0].input, args.input);
  await assert.rejects(rpc.run(args));
  assert.equal(rpc.receive({ type: 'other' }), false);
  rpc.receive({ type: 'project-tool-result', id: frames[0].id, ok: true, result });
  assert.deepEqual(await pending, result);
  rpc.receive({ type: 'project-tool-result', id: frames[0].id, ok: false });
  await assert.rejects(rpc.run({ ...args, input: { ...args.input, directory: 'C:/secret' } }));
  assert.equal(frames.length, 1);
  rpc.close();
});
test('private project RPC rejects invalid output, cancellation and late replies', async () => {
  const frames = [], rpc = createAgentToolRpc(frame => frames.push(frame));
  const first = rpc.run(args);
  rpc.receive({ type: 'project-tool-result', id: frames[0].id, ok: true, result: { ...result, directory: 'secret' } });
  await assert.rejects(first);
  const controller = new AbortController();
  const second = rpc.run({ ...args, signal: controller.signal });
  controller.abort();
  await assert.rejects(second);
  assert.equal(frames.at(-1).type, 'project-tool-cancel');
  rpc.receive({ type: 'project-tool-result', id: frames[1].id, ok: true, result });
  rpc.close();
  await assert.rejects(rpc.run(args));
});
test('private project RPC timeout and owner exit cancel native work', async () => {
  const frames = [], rpc = createAgentToolRpc(frame => frames.push(frame), { timeoutMs: 5 });
  await assert.rejects(rpc.run(args), { code: 'tool_timeout' });
  assert.equal(frames.at(-1).type, 'project-tool-cancel');
  const pending = rpc.run(args);
  rpc.close();
  await assert.rejects(pending, { code: 'canceled' });
});

test('private project RPC preserves typed recovery codes without native diagnostics', async () => {
  const frames = [], rpc = createAgentToolRpc(frame => frames.push(frame));
  for (const code of ['busy', 'tool_timeout', 'not_authorized', 'invalid_request', 'tool_failed', 'canceled']) {
    const pending = rpc.run(args);
    rpc.receive({ type: 'project-tool-result', id: frames.at(-1).id, ok: false, errorCode: code, error: 'C:/private/secret raw stderr' });
    await assert.rejects(pending, error => error.code === code && !/private|stderr/.test(error.message));
  }
  rpc.close();
});
