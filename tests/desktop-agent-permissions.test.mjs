import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentPermissions } from '../desktop/design-previews/agent-permissions.js';

const request = { providerId: 'openai', model: 'fixture', messages: [{ role: 'user', content: '检查项目' }] };
const bind = state => { state.select({ id: 'session-a', projectId: 'project-a' }); state.setProvider('openai'); };
test('agent grants default off and reject grants restored from history', () => {
  const state = createAgentPermissions(); bind(state);
  assert.equal(state.prepare({ ...request, agent: { allowRead: true, shareResults: true } }).agent, undefined);
  assert.equal(state.snapshot().allowRead, false);
});
test('reading and sharing are separate, explicit live choices', () => {
  const state = createAgentPermissions(); bind(state);
  state.update({ allowRead: true, shareResults: false });
  assert.deepEqual(state.prepare(request).agent, { projectId: 'project-a', sessionId: 'session-a', allowRead: true, shareResults: false });
  state.update({ allowRead: true, shareResults: true });
  assert.equal(state.prepare(request).agent.shareResults, true);
  state.update({ allowRead: false, shareResults: true });
  assert.equal(state.snapshot().shareResults, false);
  assert.equal(state.prepare(request).agent, undefined);
  assert.equal(request.agent, undefined);
});
test('session and project changes revoke grants, repeated notifications do not', () => {
  const state = createAgentPermissions(); bind(state); state.update({ allowRead: true });
  state.select({ id: 'session-a', projectId: 'project-a' });
  assert.equal(state.snapshot().allowRead, true);
  state.select({ id: 'session-b', projectId: 'project-a' });
  assert.equal(state.prepare(request).agent, undefined);
  bind(state); assert.equal(state.snapshot().allowRead, false);
  state.update({ allowRead: true }); state.select({ id: 'session-a', projectId: 'project-b' });
  assert.equal(state.snapshot().allowRead, false);
});
test('unsupported provider, unbound session and reload never restore access', () => {
  const state = createAgentPermissions(); bind(state); state.update({ allowRead: true });
  assert.equal(state.prepare({ ...request, providerId: 'anthropic' }).agent, undefined);
  state.setProvider('anthropic'); state.update({ allowRead: true, shareResults: true });
  state.setProvider('openai'); assert.equal(state.snapshot().allowRead, false);
  state.select({ id: 'session-a' }); state.update({ allowRead: true });
  assert.equal(state.snapshot().eligible, false);
  state.clear(); bind(state); assert.equal(state.snapshot().allowRead, false);
  const reloaded = createAgentPermissions(); bind(reloaded); assert.equal(reloaded.snapshot().allowRead, false);
});
