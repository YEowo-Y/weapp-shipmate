import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionClient, isUsableModelConnection } from '../desktop/design-previews/model-connection-client.js';
const snapshot = (token = 'csrf') => ({ csrfToken: token, storage: 'memory', connections: [], oauth: null });
const response = value => ({ ok: true, json: async () => value });
test('only credential-backed GLM presets may be selected before remote verification', async () => {
  const configured = { providerId: 'glm', status: 'configured', catalogSource: 'preset', hasCredential: true, models: [{ id: 'glm-5.2', name: 'GLM 5.2' }] };
  const client = createConnectionClient(async () => response({ ...snapshot(), connections: [configured] }));
  await client.load();
  assert.equal(isUsableModelConnection(client.snapshot.connections[0]), true);
  for (const invalid of [undefined, { ...configured, hasCredential: false }, { ...configured, providerId: 'deepseek' }, { ...configured, catalogSource: 'remote' }]) {
    assert.equal(isUsableModelConnection(invalid), false);
    if (!invalid) continue;
    const badClient = createConnectionClient(async () => response({ ...snapshot(), connections: [invalid] }));
    await assert.rejects(badClient.load(), /本地连接服务/);
  }
});
const authorization = (mode = 'manual') => {
  const flowId = 'f'.repeat(43);
  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('code_challenge', 'c'.repeat(43));
  url.searchParams.set('code_challenge_method', 'S256');
  if (mode === 'callback') {
    url.searchParams.set('callback_url', `http://127.0.0.1:5512/api/model-connections/oauth/callback/${flowId}`);
    url.searchParams.set('state', 's'.repeat(43));
  }
  return { mode, flowId, authorizationUrl: url.href, expiresAt: new Date(Date.now() + 600000).toISOString() };
};
test('mutations require a verified snapshot and use same-origin CSRF without persisting keys', async () => {
  const requests = [];
  const client = createConnectionClient(async (url, options) => { requests.push({ url, options }); return response(snapshot()); });
  await assert.rejects(client.mutate('/openai/connect', { apiKey: 'test-only' }), /服务/);
  await client.load(); await client.mutate('/openai/connect', { apiKey: 'test-only' });
  assert.equal(requests[1].options.headers['X-Shipmate-CSRF'], 'csrf');
  assert.equal(requests[1].options.credentials, 'same-origin');
  assert.equal(requests[1].options.cache, 'no-store');
  assert.equal(requests[1].options.body, '{"apiKey":"test-only"}');
  assert.equal(JSON.stringify(client.snapshot).includes('test-only'), false);
});
test('unavailable or malformed service cannot enable credential entry', async () => {
  for (const fetcher of [async () => { throw new Error('network'); }, async () => response({}), async () => ({ ok: false, json: async () => ({ message: 'secret upstream body' }) })]) {
    const client = createConnectionClient(fetcher);
    await assert.rejects(client.load(), /本地连接服务/);
    assert.equal(client.ready, false);
  }
});
test('late snapshots cannot overwrite more recent results and disposal aborts requests', async () => {
  const pending = [];
  const client = createConnectionClient((_url, options) => new Promise(resolve => pending.push({ resolve, options })));
  const first = client.load(); const second = client.load();
  pending[1].resolve(response(snapshot('new'))); await second;
  pending[0].resolve(response(snapshot('old'))); await first;
  assert.equal(client.snapshot.csrfToken, 'new');
  const third = client.load(); client.dispose();
  assert.equal(pending[2].options.signal.aborted, true);
  pending[2].resolve(response(snapshot('ignored'))); await assert.rejects(third, /本地连接服务/);
  assert.equal(client.ready, false);
});


test('authorization rejects unsafe destinations and exposes no raw service error body', async () => {
  for (const authorizationUrl of ['javascript:alert(1)', 'https://evil.test/auth', 'https://openrouter.ai:444/auth', 'https://openrouter.ai/other', 'https://user:secret@openrouter.ai/auth']) {
    const client = createConnectionClient(async (_url, options) => response(options.method === 'GET' ? snapshot() : { authorizationUrl }));
    await client.load(); await assert.rejects(client.mutate('/openrouter/oauth/start'), /连接操作未完成/);
  }
});

test('manual and callback authorization recover from a validated server snapshot without storing secrets', async () => {
  for (const mode of ['manual', 'callback']) {
    const flow = authorization(mode);
    let waiting = false;
    const client = createConnectionClient(async (_url, options) => response(options.method === 'POST'
      ? (waiting = true, flow) : { ...snapshot(), oauth: waiting ? { ...flow, status: 'waiting' } : null }));
    await client.load();
    assert.deepEqual(await client.mutate('/openrouter/oauth/start', { mode }), flow);
    await client.load();
    assert.equal(client.snapshot.oauth.authorizationUrl, flow.authorizationUrl);
    assert.equal(client.snapshot.oauth.mode, mode);
    assert.doesNotMatch(JSON.stringify(client.snapshot), /code_verifier|apiKey/u);
  }
});

test('start and recovered links reject downgraded PKCE, mixed modes and unsafe callbacks', async () => {
  const malformed = [
    value => { value.authorizationUrl += '&code_challenge_method=plain'; },
    value => { value.authorizationUrl = value.authorizationUrl.replace('S256', 'plain'); },
    value => { value.mode = 'manual'; },
    value => { value.expiresAt = 'unknown'; },
    value => { value.flowId = 'old-flow'; },
    value => { const url = new URL(value.authorizationUrl); url.searchParams.set('callback_url', 'https://evil.test/callback'); value.authorizationUrl = url.href; },
    value => { value.authorizationUrl += '#fragment'; },
  ];
  for (const corrupt of malformed) {
    const flow = authorization('callback'); corrupt(flow);
    const client = createConnectionClient(async (_url, options) => response(options.method === 'GET' ? snapshot() : flow));
    await client.load(); await assert.rejects(client.mutate('/openrouter/oauth/start'));
    const recovery = createConnectionClient(async () => response({ ...snapshot(), oauth: { ...flow, status: 'waiting' } }));
    await assert.rejects(recovery.load()); assert.equal(recovery.ready, false);
  }
  const terminal = createConnectionClient(async () => response({ ...snapshot(), oauth: { ...authorization(), status: 'success' } }));
  await assert.rejects(terminal.load());
});


test('local request timeout aborts and clears its timer', async () => {
  let timeout; let signal; let cleared = 0;
  const client = createConnectionClient((_url, options) => { signal = options.signal; return new Promise(() => {}); }, {
    setTimer: callback => { timeout = callback; return 7; }, clearTimer: id => { assert.equal(id, 7); cleared++; },
  });
  const request = client.load(); timeout();
  await assert.rejects(request, /超时/); assert.equal(signal.aborted, true); assert.equal(cleared, 1); assert.equal(client.ready, false);
});

test('expired CSRF disables credential entry until a fresh GET recovers the session', async () => {
  let expired = false;
  const client = createConnectionClient(async (_url, options) => options.method === 'POST' && !expired
    ? (expired = true, { ok: false, status: 403 }) : response(snapshot(expired ? 'new-token' : 'old-token')));
  await client.load(); await assert.rejects(client.mutate('/openai/refresh'), /会话已失效/);
  assert.equal(client.ready, false);
  await client.load(); assert.equal(client.snapshot.csrfToken, 'new-token'); assert.equal(client.ready, true);
});

test('system capability and saved custom credential metadata are accepted without a key', async () => {
  const value = { ...snapshot(), storage: 'system', connections: [{ providerId: 'custom', status: 'disconnected', hasCredential: true, credentialStorage: 'system', models: [] }] };
  const client = createConnectionClient(async () => response(value));
  await client.load(); assert.equal(client.snapshot.connections[0].credentialStorage, 'system');
  client.dispose();
});
