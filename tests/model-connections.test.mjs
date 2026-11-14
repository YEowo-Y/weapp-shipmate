/* global Response, structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createCredentialRpc } from '../desktop/server/credential-rpc.mjs';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';

async function harness(t, options = {}) {
  const handler = createModelConnectionHandler(options);
  const server = createServer(async (req, res) => {
    if (!await handler(req, res)) { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const initial = await fetch(`${origin}/api/model-connections`);
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const snapshot = await initial.json();
  const headers = { cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Shipmate-CSRF': snapshot.csrfToken };
  return { origin, cookie, snapshot, headers, cookieHeader: initial.headers.get('set-cookie'),
    get: () => fetch(`${origin}/api/model-connections`, { headers: { cookie } }),
    post: (path, body = {}, overrides = {}) => fetch(`${origin}/api/model-connections${path}`, { method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(body) }),
  };
}

test('local broker bootstraps an HTTP-only session and rejects cross-origin mutations', async t => {
  const app = await harness(t);
  assert.equal(app.snapshot.storage, 'memory');
  assert.equal(app.snapshot.connections.length, 9);
  assert.ok(app.snapshot.connections.every(c => c.status === 'disconnected'));
  assert.match(app.cookieHeader, /HttpOnly; SameSite=Lax; Path=\/api\/model-connections/);
  const bad = await app.post('/openai/connect', { apiKey: 'test-key' }, { Origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal((await app.post('/openai/disconnect', {}, { 'X-Shipmate-CSRF': '' })).status, 403);
  const response = await app.get();
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const find = (snapshot, id) => snapshot.connections.find(connection => connection.providerId === id);

test('domestic credentials restore privately and GLM presets stay explicitly unverified', async t => {
  const records = new Map();
  let requests = 0;
  const options = {
    credentialStore: {
      load: async id => records.get(id) ?? null,
      save: async (id, record) => records.set(id, structuredClone(record)),
      delete: async id => records.delete(id),
    },
    fetchImpl: async url => {
      requests++;
      assert.ok(!url.includes('bigmodel.cn'));
      return json({ data: [{ id: url.includes('moonshot') ? 'kimi-k2.6' : 'deepseek-flash' }] });
    },
  };
  const app = await harness(t, options);
  for (const provider of ['deepseek', 'glm', 'kimi']) {
    const connected = await (await app.post(`/${provider}/connect`, { apiKey: `fake-${provider}-secret`, storage: 'system' })).json();
    const entry = find(connected, provider);
    assert.equal(entry.status, provider === 'glm' ? 'configured' : 'connected');
    assert.equal(entry.credentialStorage, 'system');
    assert.equal(entry.inference.status, 'unverified');
    assert.doesNotMatch(JSON.stringify(connected), /-secret/);
    if (provider === 'glm') {
      assert.equal(entry.catalogSource, 'preset');
      assert.equal(entry.checkedAt, null);
    }
  }
  assert.equal(requests, 2);
  const restarted = await harness(t, options);
  for (const provider of ['deepseek', 'glm', 'kimi']) {
    const restored = find(restarted.snapshot, provider);
    assert.equal(restored.hasCredential, true);
    assert.equal(restored.status, 'disconnected');
    await restarted.post(`/${provider}/refresh`);
    await restarted.post(`/${provider}/disconnect`);
    assert.equal(records.has(provider), false);
  }
  assert.equal(requests, 4);
});
async function startOAuth(app) {
  const result = await (await app.post('/openrouter/oauth/start')).json();
  const authorization = new URL(result.authorizationUrl);
  const callback = new URL(authorization.searchParams.get('callback_url'));
  callback.searchParams.set('state', authorization.searchParams.get('state'));
  callback.searchParams.set('code', 'test-authorization-code');
  return { authorization, callback };
}
const callbackRequest = (app, url) => fetch(url, { headers: { cookie: app.cookie }, redirect: 'manual' });

test('real provider catalog connection, refresh and disconnect keep credentials server-only', async t => {
  const requests = [];
  const app = await harness(t, { fetchImpl: async (url, options) => {
    requests.push({ url, options }); return json({ data: [{ id: 'test-model' }] });
  } });
  const connected = await (await app.post('/openai/connect', { apiKey: 'test-secret' })).json();
  assert.equal(find(connected, 'openai').status, 'connected');
  assert.deepEqual(find(connected, 'openai').models, [{ id: 'test-model', name: 'test-model' }]);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(JSON.stringify(connected).includes('test-secret'), false);
  await app.post('/openai/refresh'); assert.equal(requests.length, 2);
  const disconnected = await (await app.post('/openai/disconnect')).json();
  assert.equal(find(disconnected, 'openai').hasCredential, false);
  assert.equal((await app.post('/openai/refresh')).status, 409);
});

test('session, request schema and fixed-destination boundaries reject unsafe callers', async t => {
  let calls = 0;
  const app = await harness(t, { fetchImpl: async () => { calls++; return json({ data: [] }); } });
  assert.equal((await app.post('/openai/connect', { apiKey: 'key', endpoint: 'https://evil.example' })).status, 400);
  assert.equal((await app.post('/ollama/connect', { apiKey: 'key' })).status, 400);
  assert.equal((await app.post('/openai/connect', { apiKey: ' space' })).status, 400);
  assert.equal((await app.post('/custom/connect', { apiKey: 'key' })).status, 400);
  assert.equal((await app.post('/openai/connect', { apiKey: 'x'.repeat(20000) })).status, 413);
  assert.equal((await app.post('/openai/connect', null)).status, 400);
  const noSession = await fetch(`${app.origin}/api/model-connections/openai/connect`, { method: 'POST', headers: { ...app.headers, cookie: '' }, body: '{}' });
  assert.equal(noSession.status, 401);
  const invalidHost = await new Promise(resolve => {
    const req = request(`${app.origin}/api/model-connections`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(invalidHost, 403);
  assert.equal(calls, 0);
});

test('upstream failure never returns provider body or credentials as a success', async t => {
  const app = await harness(t, { fetchImpl: async () => json({ error: 'test-secret reflected' }, 401) });
  const result = await (await app.post('/openai/connect', { apiKey: 'test-secret' })).json();
  assert.equal(find(result, 'openai').status, 'error');
  assert.equal(find(result, 'openai').error.code, 'authentication_failed');
  assert.equal(find(result, 'openai').hasCredential, false);
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('OAuth uses S256, session-bound state and a one-use callback without returning keys', async t => {
  let challenge; let exchanges = 0;
  const app = await harness(t, { fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/keys')) {
      exchanges++; const body = JSON.parse(options.body);
      assert.equal(body.code, 'test-authorization-code');
      assert.equal(body.code_challenge_method, 'S256');
      assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), challenge);
      return json({ key: 'oauth-test-key' });
    }
    if (url.endsWith('/key')) return json({ data: { label: 'local-test' } });
    return json({ data: [{ id: 'test/model', name: 'Test Model' }] });
  } });
  const { authorization, callback } = await startOAuth(app);
  challenge = authorization.searchParams.get('code_challenge');
  assert.equal(authorization.origin, 'https://openrouter.ai');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  const pending = await (await app.get()).json();
  assert.equal(pending.oauth.status, 'waiting');
  assert.equal(pending.oauth.authorizationUrl, authorization.href);
  assert.equal(pending.oauth.mode, 'callback');
  assert.equal('verifier' in pending.oauth, false);
  const wrong = new URL(callback); wrong.searchParams.set('state', 'invalid-state');
  assert.equal((await callbackRequest(app, wrong)).status, 400);
  assert.equal((await fetch(callback, { redirect: 'manual' })).status, 401);
  assert.equal(exchanges, 0);
  const complete = await callbackRequest(app, callback);
  assert.equal(complete.status, 303);
  assert.equal(complete.headers.get('location'), '/settings.html?provider=openrouter#key');
  const result = await (await app.get()).json();
  assert.equal(result.oauth.status, 'success');
  assert.equal(find(result, 'openrouter').authMethod, 'oauth');
  assert.equal(find(result, 'openrouter').status, 'connected');
  assert.equal(JSON.stringify(result).includes('oauth-test-key'), false);
  assert.equal((await callbackRequest(app, callback)).status, 400);
  assert.equal(exchanges, 1);
});

test('expired, replaced and cancelled OAuth callbacks cannot exchange codes', async t => {
  let time = Date.parse('2026-10-17T00:00:00Z'); let calls = 0;
  const app = await harness(t, { now: () => time, fetchImpl: async () => { calls++; return json({}); } });
  const first = await startOAuth(app);
  const second = await startOAuth(app);
  assert.equal((await callbackRequest(app, first.callback)).status, 400);
  time += 10 * 60_000;
  assert.equal((await callbackRequest(app, second.callback)).status, 400);
  assert.equal((await (await app.get()).json()).oauth.status, 'expired');
  const third = await startOAuth(app);
  await app.post('/openrouter/oauth/cancel');
  assert.equal((await callbackRequest(app, third.callback)).status, 400);
  assert.equal(calls, 0);
});

test('replacement OAuth retires the previous account even when authorization is denied', async t => {
  const app = await harness(t, { fetchImpl: async url => url.endsWith('/key') ? json({ data: { label: 'test' } }) : json({ data: [] }) });
  await app.post('/openrouter/connect', { apiKey: 'old-test-key' });
  const { callback } = await startOAuth(app);
  callback.search = '?error=access_denied&error_description=secret-reflected';
  assert.equal((await callbackRequest(app, callback)).status, 303);
  const snapshot = await (await app.get()).json();
  assert.equal(snapshot.oauth.status, 'error');
  assert.equal(find(snapshot, 'openrouter').status, 'disconnected');
  assert.equal(JSON.stringify(snapshot).includes('secret-reflected'), false);
});

test('disconnect aborts in-flight discovery and a late result cannot restore credentials', async t => {
  let release; let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const app = await harness(t, { fetchImpl: async () => { ready(); return new Promise(resolve => { release = resolve; }); } });
  const pending = app.post('/openai/connect', { apiKey: 'test-key' });
  await started;
  await app.post('/openai/disconnect');
  release(json({ data: [{ id: 'late' }] }));
  await pending;
  const snapshot = await (await app.get()).json();
  assert.equal(find(snapshot, 'openai').status, 'disconnected');
  assert.equal(find(snapshot, 'openai').hasCredential, false);
  assert.equal((await app.post('/openai/refresh')).status, 409);
});

test('cancelling OAuth during catalog discovery cannot adopt the exchanged credential', async t => {
  let release; let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const app = await harness(t, { fetchImpl: async url => {
    if (url.endsWith('/auth/keys')) return json({ key: 'new-test-key' });
    ready(); return new Promise(resolve => { release = resolve; });
  } });
  const { callback } = await startOAuth(app);
  const pending = callbackRequest(app, callback);
  await started;
  await app.post('/openrouter/oauth/cancel');
  release(json({ data: { label: 'late' } })); await pending;
  const snapshot = await (await app.get()).json();
  assert.equal(snapshot.oauth.status, 'cancelled');
  assert.equal(find(snapshot, 'openrouter').hasCredential, false);
  assert.equal((await app.post('/openrouter/refresh')).status, 409);
});

test('OAuth catalog failure preserves the key for a deliberate refresh, not fake success', async t => {
  let authenticated = false;
  const app = await harness(t, { fetchImpl: async url => {
    if (url.endsWith('/auth/keys')) return json({ key: 'oauth-test-key' });
    if (!authenticated) return json({ error: 'unavailable' }, 503);
    return url.endsWith('/key') ? json({ data: { label: 'test' } }) : json({ data: [] });
  } });
  const { callback } = await startOAuth(app);
  await callbackRequest(app, callback);
  const snapshot = await (await app.get()).json();
  assert.equal(find(snapshot, 'openrouter').status, 'error');
  assert.equal(find(snapshot, 'openrouter').hasCredential, true);
  authenticated = true;
  const refreshed = await (await app.post('/openrouter/refresh')).json();
  assert.equal(find(refreshed, 'openrouter').status, 'connected');
  assert.equal(refreshed.oauth.status, 'success');
});

test('browser sessions cannot exchange each other’s OAuth transaction or share credentials', async t => {
  let exchanges = 0;
  const app = await harness(t, { fetchImpl: async () => { exchanges++; return json({ data: [] }); } });
  const otherResponse = await fetch(`${app.origin}/api/model-connections`);
  const otherCookie = otherResponse.headers.get('set-cookie').split(';')[0];
  const { callback } = await startOAuth(app);
  assert.equal((await fetch(callback, { headers: { cookie: otherCookie }, redirect: 'manual' })).status, 400);
  await app.post('/openai/connect', { apiKey: 'test-secret' });
  const other = await (await fetch(`${app.origin}/api/model-connections`, { headers: { cookie: otherCookie } })).json();
  assert.equal(find(other, 'openai').status, 'disconnected');
  assert.equal(other.oauth, null);
  assert.equal(exchanges, 1, 'only the explicit API-key discovery ran');
});

test('session expiry clears credentials and bounds anonymous session allocation', async t => {
  let time = 0;
  const app = await harness(t, { now: () => time, maxSessions: 1, fetchImpl: async () => json({ data: [] }) });
  await app.post('/openai/connect', { apiKey: 'test-key' });
  assert.equal((await fetch(`${app.origin}/api/model-connections`)).status, 429);
  time = 60 * 60_000;
  assert.equal((await app.post('/openai/refresh')).status, 401);
  const replacement = await (await app.get()).json();
  assert.equal(find(replacement, 'openai').status, 'disconnected');
  assert.notEqual(replacement.csrfToken, app.snapshot.csrfToken);
});

test('cancel during code exchange drops the late credential before model discovery', async t => {
  let release; let ready; let calls = 0;
  const started = new Promise(resolve => { ready = resolve; });
  const app = await harness(t, { fetchImpl: async () => { calls++; ready(); return new Promise(resolve => { release = resolve; }); } });
  const { callback } = await startOAuth(app);
  const pending = callbackRequest(app, callback);
  await started;
  await app.post('/openrouter/oauth/cancel');
  release(json({ key: 'late-test-key' })); await pending;
  assert.equal(calls, 1);
  assert.equal(find(await (await app.get()).json(), 'openrouter').hasCredential, false);
});

test('OAuth exchange timeout returns an actionable failure without storing a credential', async t => {
  const app = await harness(t, { timeoutMs: 20, fetchImpl: () => new Promise(() => {}) });
  const { callback } = await startOAuth(app);
  assert.equal((await callbackRequest(app, callback)).status, 303);
  const snapshot = await (await app.get()).json();
  assert.equal(snapshot.oauth.status, 'error');
  assert.equal(find(snapshot, 'openrouter').error.code, 'timeout');
  assert.equal(find(snapshot, 'openrouter').hasCredential, false);
});

test('session expiry during a request aborts work and cannot restore the old connection', async t => {
  let time = 0; let ready; let release;
  const started = new Promise(resolve => { ready = resolve; });
  const app = await harness(t, { now: () => time, fetchImpl: async () => { ready(); return new Promise(resolve => { release = resolve; }); } });
  const pending = app.post('/openai/connect', { apiKey: 'test-key' });
  await started;
  time = 60 * 60_000;
  const replacement = await (await app.get()).json();
  release(json({ data: [{ id: 'late' }] })); await pending;
  assert.equal(find(replacement, 'openai').hasCredential, false);
  assert.equal((await app.post('/openai/refresh')).status, 401);
});

test('refresh preserves the last verified catalog through polling and failure, then replaces it on retry', async t => {
  let calls = 0, release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const app = await harness(t, { fetchImpl: async () => {
    calls++;
    if (calls === 2) { started(); await gate; return json({}, 503); }
    return json({ data: [{ id: calls === 1 ? 'old-model' : 'new-model' }] });
  } });
  const initial = find(await (await app.post('/openai/connect', { apiKey: 'key' })).json(), 'openai');
  const pending = app.post('/openai/refresh'); await entered;
  const during = find(await (await app.get()).json(), 'openai');
  assert.equal(during.status, 'connecting'); assert.deepEqual(during.models, initial.models);
  release();
  const failed = find(await (await pending).json(), 'openai');
  assert.equal(failed.status, 'error'); assert.deepEqual(failed.models, initial.models);
  assert.equal(failed.checkedAt, initial.checkedAt); assert.equal(failed.hasCredential, true);
  const retried = find(await (await app.post('/openai/refresh')).json(), 'openai');
  assert.equal(retried.status, 'connected'); assert.equal(retried.error, null);
  assert.deepEqual(retried.models, [{ id: 'new-model', name: 'new-model' }]);
});

test('replacing a credential never exposes the previous account catalog after failure', async t => {
  let calls = 0;
  const app = await harness(t, { fetchImpl: async () => ++calls === 1 ? json({ data: [{ id: 'previous-account' }] }) : json({}, 401) });
  await app.post('/openai/connect', { apiKey: 'old-key' });
  const result = find(await (await app.post('/openai/connect', { apiKey: 'new-key' })).json(), 'openai');
  assert.equal(result.status, 'error'); assert.deepEqual(result.models, []); assert.equal(result.checkedAt, null);
});

test('superseded refresh cannot overwrite a newer successful catalog with stale failure', async t => {
  let calls = 0, release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const app = await harness(t, { fetchImpl: async () => {
    calls++;
    if (calls === 2) { started(); await gate; return json({}, 503); }
    return json({ data: [{ id: calls === 1 ? 'old' : 'latest' }] });
  } });
  await app.post('/openai/connect', { apiKey: 'key' });
  const oldRefresh = app.post('/openai/refresh'); await entered;
  await app.post('/openai/refresh'); release(); await oldRefresh;
  const result = find(await (await app.get()).json(), 'openai');
  assert.equal(result.status, 'connected'); assert.equal(result.error, null);
  assert.deepEqual(result.models, [{ id: 'latest', name: 'latest' }]);
});

test('custom session cookie names reject unsafe header syntax before creating a handler', () => {
  for (const cookieName of ['', 'name=value', 'name; Secure', 'bad\r\nSet-Cookie: x', 'x'.repeat(65), null]) {
    assert.throws(() => createModelConnectionHandler({ cookieName }), /Invalid session cookie name/);
  }
});

const startManual = async app => (await app.post('/openrouter/oauth/start', { mode: 'manual' })).json();
const finishManual = (app, flowId, code = 'manual-test-code') => app.post('/openrouter/oauth/complete', { flowId, code });

test('manual OAuth restores only waiting metadata, exchanges S256 once and redacts terminal snapshots', async t => {
  let challenge, exchanges = 0;
  const app = await harness(t, { fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/keys')) {
      exchanges++;
      const body = JSON.parse(options.body);
      assert.equal(body.code, 'manual-test-code');
      assert.equal(body.code_challenge_method, 'S256');
      assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), challenge);
      return json({ key: 'manual-secret' });
    }
    return url.endsWith('/key') ? json({ data: { label: 'fixture' } }) : json({ data: [{ id: 'manual/model' }] });
  } });
  const flow = await startManual(app);
  const auth = new URL(flow.authorizationUrl);
  challenge = auth.searchParams.get('code_challenge');
  assert.equal(flow.mode, 'manual'); assert.match(flow.flowId, /^[\w-]{43}$/);
  assert.equal(auth.searchParams.has('callback_url'), false); assert.equal(auth.searchParams.has('state'), false);
  const waiting = (await (await app.get()).json()).oauth;
  for (const key of ['mode', 'flowId', 'authorizationUrl', 'expiresAt']) assert.equal(waiting[key], flow[key]);
  const result = await (await finishManual(app, flow.flowId)).json();
  assert.equal(result.oauth.status, 'success'); assert.equal(find(result, 'openrouter').status, 'connected');
  for (const key of ['mode', 'flowId', 'authorizationUrl', 'verifier', 'code']) assert.equal(key in result.oauth, false);
  assert.equal(JSON.stringify(result).includes('manual-secret'), false);
  assert.equal((await finishManual(app, flow.flowId)).status, 409); assert.equal(exchanges, 1);
});

test('manual completion rejects schema, CSRF, wrong sessions, expired and replaced flows', async t => {
  let time = 0, calls = 0;
  const app = await harness(t, { now: () => time, fetchImpl: async () => { calls++; return json({}); } });
  for (const body of [{ mode: null }, { mode: 'device' }, { mode: 'manual', endpoint: 'evil' }]) assert.equal((await app.post('/openrouter/oauth/start', body)).status, 400);
  const flow = await startManual(app);
  for (const code of ['', 'bad code', 'x'.repeat(4097), '\u0000', '中文', null]) assert.equal((await finishManual(app, flow.flowId, code)).status, 400);
  assert.equal((await app.post('/openrouter/oauth/complete', { flowId: flow.flowId, code: 'code', apiKey: 'bad' })).status, 400);
  assert.equal((await app.post('/openrouter/oauth/complete', { flowId: flow.flowId, code: 'code' }, { 'X-Shipmate-CSRF': '' })).status, 403);
  const otherResponse = await fetch(`${app.origin}/api/model-connections`);
  const otherCookie = otherResponse.headers.get('set-cookie').split(';')[0];
  const other = await otherResponse.json();
  assert.equal((await app.post('/openrouter/oauth/complete', { flowId: flow.flowId, code: 'code' }, { cookie: otherCookie, 'X-Shipmate-CSRF': other.csrfToken })).status, 409);
  const replacement = await startManual(app);
  assert.equal((await finishManual(app, flow.flowId)).status, 409);
  time += 600000;
  assert.equal((await finishManual(app, replacement.flowId)).status, 409);
  assert.equal((await (await app.get()).json()).oauth.status, 'expired');
  const callback = await startOAuth(app);
  assert.equal((await finishManual(app, new URL(callback.callback).pathname.split('/').at(-1))).status, 409);
  assert.equal(calls, 0);
});

for (const phase of ['exchange', 'catalog']) for (const action of ['cancel', 'replace', 'expire', 'disconnect']) {
  test(`manual ${phase} late result cannot revive ${action} flow and parallel completion is refused`, async t => {
    let time = 0, release, ready;
    const entered = new Promise(resolve => { ready = resolve; });
    const app = await harness(t, { now: () => time, fetchImpl: async url => {
      if (phase === 'catalog' && url.endsWith('/auth/keys')) return json({ key: 'late-secret' });
      ready(); return new Promise(resolve => { release = resolve; });
    } });
    const flow = await startManual(app);
    const pending = finishManual(app, flow.flowId); await entered;
    assert.equal((await finishManual(app, flow.flowId)).status, 409);
    assert.equal('authorizationUrl' in (await (await app.get()).json()).oauth, false);
    if (action === 'expire') time += 600000; // No poll/sweep: committing must itself enforce expiry.
    else if (action === 'replace') await startManual(app);
    else await app.post(action === 'cancel' ? '/openrouter/oauth/cancel' : '/openrouter/disconnect');
    release(phase === 'exchange' ? json({ key: 'late-secret' }) : json({}, 503));
    const result = await (await pending).json();
    assert.equal(find(result, 'openrouter').hasCredential, false);
    assert.equal(result.oauth?.status ?? null, { cancel: 'cancelled', replace: 'waiting', expire: 'expired', disconnect: null }[action]);
  });
}

test('ambiguous callback parameters do not consume the valid authorization', async t => {
  let calls = 0;
  const app = await harness(t, { fetchImpl: async () => { calls++; return json({}); } });
  const { callback } = await startOAuth(app);
  for (const [name, value] of [['code', 'second'], ['state', 'second'], ['error', 'access_denied'], ['unknown', 'value']]) {
    const malformed = new URL(callback); malformed.searchParams.append(name, value);
    assert.equal((await callbackRequest(app, malformed)).status, 400);
    assert.equal((await (await app.get()).json()).oauth.status, 'waiting');
  }
  const denial = new URL(callback); denial.search = '?error=access_denied&error=other';
  assert.equal((await callbackRequest(app, denial)).status, 400);
  assert.equal(calls, 0);
  denial.search = '?error=access_denied';
  assert.equal((await callbackRequest(app, denial)).status, 303);
});

test('manual exchange timeout clears recovery link and allows a fresh flow', async t => {
  const app = await harness(t, { timeoutMs: 20, fetchImpl: () => new Promise(() => {}) });
  const flow = await startManual(app);
  const result = await (await finishManual(app, flow.flowId)).json();
  assert.equal(result.oauth.status, 'error');
  assert.equal(find(result, 'openrouter').error.code, 'timeout');
  assert.equal(find(result, 'openrouter').hasCredential, false);
  assert.equal('authorizationUrl' in result.oauth, false);
  const retry = await startManual(app);
  assert.notEqual(retry.flowId, flow.flowId);
  assert.equal((await (await app.get()).json()).oauth.status, 'waiting');
});

for (const exchangeSucceeds of [false, true]) {
  test(`refresh after replacement OAuth ${exchangeSucceeds ? 'catalog' : 'exchange'} failure only completes the matching authorization`, async t => {
    let round = 0, catalogFails = false;
    const usedKeys = [];
    const app = await harness(t, { fetchImpl: async (url, options) => {
      if (url.endsWith('/auth/keys')) {
        round++;
        if (round === 2 && !exchangeSucceeds) return json({}, 401);
        return json({ key: round === 1 ? 'account-A-key' : 'account-B-key' });
      }
      usedKeys.push(options.headers.Authorization);
      if (catalogFails) return json({}, 503);
      return url.endsWith('/key') ? json({ data: { label: 'fixture' } }) : json({ data: [{ id: 'fixture/model' }] });
    } });
    const first = await startManual(app);
    assert.equal((await (await finishManual(app, first.flowId)).json()).oauth.status, 'success');
    const second = await startManual(app);
    catalogFails = exchangeSucceeds;
    const failed = await (await finishManual(app, second.flowId)).json();
    assert.equal(failed.oauth.status, 'error');
    assert.equal('recoveryCredential' in failed.oauth, false);
    catalogFails = false;
    const refreshResponse = await app.post('/openrouter/refresh');
    if (!exchangeSucceeds) { assert.equal(refreshResponse.status, 409); return; }
    const refreshed = await refreshResponse.json();
    assert.equal(find(refreshed, 'openrouter').status, 'connected');
    assert.equal(usedKeys.at(-1), exchangeSucceeds ? 'Bearer account-B-key' : 'Bearer account-A-key');
    assert.equal(refreshed.oauth.status, exchangeSucceeds ? 'success' : 'error');
    assert.equal(JSON.stringify(refreshed).includes('account-A-key'), false);
    assert.equal(JSON.stringify(refreshed).includes('account-B-key'), false);
  });
}

test('manual OAuth credential powers OpenRouter chat through the real stream adapter', async t => {
  const chatRequests = [];
  const app = await harness(t, { fetchImpl: async (url, options) => {
    if (url.endsWith('/auth/keys')) return json({ key: 'new-manual-chat-key' });
    if (url.endsWith('/key')) return json({ data: { label: 'fixture' } });
    if (url.endsWith('/models')) return json({ data: [{ id: 'fixture/chat-model' }] });
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    chatRequests.push({ headers: options.headers, body: JSON.parse(options.body) });
    const frames = [
      { choices: [{ delta: { content: '授权后' }, finish_reason: null }] },
      { choices: [{ delta: { content: '回复' }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ].map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('');
    return new Response(`${frames}data: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  // Replacing an existing key proves chat does not silently use a stale account.
  await app.post('/openrouter/connect', { apiKey: 'previous-account-key' });
  const flow = await startManual(app);
  assert.equal((await (await finishManual(app, flow.flowId)).json()).oauth.status, 'success');
  const response = await app.post('/openrouter/chat', { model: 'fixture/chat-model', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-vercel-ai-ui-message-stream'), 'v1');
  const text = await response.text();
  const events = text.split('\n\n').filter(Boolean).map(frame => frame.slice('data: '.length)).map(data => data === '[DONE]' ? data : JSON.parse(data));
  assert.deepEqual(events.filter(event => event.type === 'text-delta').map(event => event.delta), ['授权后', '回复']);
  assert.deepEqual(events.map(event => typeof event === 'string' ? event : event.type), ['start', 'text-start', 'text-delta', 'text-delta', 'text-end', 'finish', '[DONE]']);
  assert.equal(chatRequests.length, 1);
  assert.equal(chatRequests[0].headers.Authorization, 'Bearer new-manual-chat-key');
  assert.equal(chatRequests[0].body.stream, true);
  assert.equal(chatRequests[0].body.model, 'fixture/chat-model');
  assert.deepEqual(chatRequests[0].body.messages, [{ role: 'user', content: 'hello' }]);
  assert.equal(text.includes('new-manual-chat-key'), false);
  assert.equal(text.includes('previous-account-key'), false);
});

const memoryVault = () => {
  const records = new Map();
  return { records, async load(id) { return records.get(id) ?? null; }, async save(id, record) { records.set(id, structuredClone(record)); }, async delete(id) { records.delete(id); } };
};

test('system credentials restore disconnected after restart without catalog or inference requests', async t => {
  const store = memoryVault(); let calls = 0;
  const options = { credentialStore: store, fetchImpl: async () => { calls++; return json({ data: [{ id: 'fixture' }] }); } };
  const first = await harness(t, options);
  const saved = await (await first.post('/openai/connect', { apiKey: 'persisted-secret', storage: 'system' })).json();
  assert.equal(find(saved, 'openai').credentialStorage, 'system');
  assert.equal(calls, 1);
  const restarted = await harness(t, options);
  assert.equal(calls, 1);
  const connection = find(restarted.snapshot, 'openai');
  assert.equal(connection.status, 'disconnected'); assert.equal(connection.hasCredential, true);
  assert.deepEqual(connection.models, []); assert.equal(connection.inference.status, 'unverified');
  assert.equal(JSON.stringify(restarted.snapshot).includes('persisted-secret'), false);
  assert.equal((await restarted.post('/openai/refresh', {}, { 'X-Shipmate-CSRF': first.snapshot.csrfToken })).status, 403);
  assert.equal(calls, 1);
  assert.equal(find(await (await restarted.post('/openai/refresh')).json(), 'openai').status, 'connected');
  await restarted.post('/openai/disconnect'); assert.equal(store.records.has('openai'), false);
  assert.equal(find((await harness(t, options)).snapshot, 'openai').hasCredential, false);
});

test('temporary replacement removes saved account and cannot restore it after failed discovery', async t => {
  const store = memoryVault(); store.records.set('openai', { key: 'old-secret', method: 'api-key' });
  const app = await harness(t, { credentialStore: store, fetchImpl: async () => json({}, 401) });
  const snapshot = await (await app.post('/openai/connect', { apiKey: 'new-secret' })).json();
  assert.equal(find(snapshot, 'openai').hasCredential, false);
  assert.equal(store.records.has('openai'), false);
  assert.equal(find(await (await app.post('/openai/refresh')).json(), 'openai').status, 'disconnected');
});

test('unavailable, corrupt, and failed system stores never fall back to a working temporary key', async t => {
  const app = await harness(t);
  assert.equal((await app.post('/openai/connect', { apiKey: 'key', storage: 'system' })).status, 409);
  let calls = 0;
  const broken = await harness(t, { credentialStore: { async load() { return { key: 'secret', method: 'unknown' }; }, async save() { throw new Error('secret leaked'); }, async delete() { throw new Error('secret leaked'); } }, fetchImpl: async () => { calls++; return json({ data: [] }); } });
  assert.ok(broken.snapshot.connections.every(c => c.error.code === 'credential_store_failed' && !c.hasCredential));
  const result = await (await broken.post('/openai/connect', { apiKey: 'new-secret' })).json();
  assert.equal(find(result, 'openai').error.code, 'credential_store_failed'); assert.equal(calls, 0);
  assert.equal(JSON.stringify(result).includes('secret leaked'), false);
  const store = memoryVault(); store.save = async () => { throw new Error('private'); };
  const saveFailure = await harness(t, { credentialStore: store, fetchImpl: async () => json({ data: [{ id: 'fixture' }] }) });
  const failed = find(await (await saveFailure.post('/openai/connect', { apiKey: 'key', storage: 'system' })).json(), 'openai');
  assert.equal(failed.status, 'error'); assert.equal(failed.hasCredential, false);
  assert.equal(find(await (await saveFailure.post('/openai/refresh')).json(), 'openai').status, 'disconnected');
});

test('disconnect serializes behind a slow save and prevents late credential resurrection', async t => {
  const store = memoryVault(); let release, started;
  const saving = new Promise(resolve => { started = resolve; });
  store.save = async (id, record) => { started(); await new Promise(resolve => { release = resolve; }); store.records.set(id, record); };
  const app = await harness(t, { credentialStore: store, fetchImpl: async () => json({ data: [{ id: 'fixture' }] }) });
  const connect = app.post('/openai/connect', { apiKey: 'late-secret', storage: 'system' });
  await saving;
  const disconnect = app.post('/openai/disconnect');
  // Polling gives the broker a deterministic observation that disconnect took ownership.
  for (let tries = 0; tries < 100; tries++) {
    if (!find(await (await app.get()).json(), 'openai').hasCredential) break;
  }
  release(); await connect; await disconnect;
  assert.equal(store.records.has('openai'), false);
  assert.equal(find(await (await app.get()).json(), 'openai').hasCredential, false);
});

test('OAuth persists the exchanged key before failed catalog and refresh does not replay the code', async t => {
  const store = memoryVault(); let exchanges = 0, failCatalog = true;
  const app = await harness(t, { credentialStore: store, fetchImpl: async url => {
    if (url.endsWith('/auth/keys')) { exchanges++; return json({ key: 'oauth-saved-secret' }); }
    assert.equal(store.records.get('openrouter')?.key, 'oauth-saved-secret');
    if (failCatalog) return json({}, 503);
    return url.endsWith('/key') ? json({ data: { label: 'fixture' } }) : json({ data: [{ id: 'fixture', name: 'Fixture' }] });
  } });
  const flow = await (await app.post('/openrouter/oauth/start', { mode: 'manual', storage: 'system' })).json();
  const result = await (await finishManual(app, flow.flowId)).json();
  assert.equal(result.oauth.status, 'error'); assert.equal(find(result, 'openrouter').credentialStorage, 'system');
  failCatalog = false;
  assert.equal(find(await (await app.post('/openrouter/refresh')).json(), 'openrouter').status, 'connected');
  assert.equal(exchanges, 1);
  assert.equal((await finishManual(app, flow.flowId)).status, 409);
});

test('inference is an explicit bounded request independent from catalog success', async t => {
  let inference = 0, fail = false;
  const app = await harness(t, { fetchImpl: async (url, init) => {
    if (url.endsWith('/models')) return json({ data: [{ id: 'fixture' }] });
    inference++;
    assert.equal(JSON.parse(init.body).max_output_tokens, 32);
    if (fail) return json({ error: 'private account body' }, 403);
    return new Response('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  } });
  const connected = await (await app.post('/openai/connect', { apiKey: 'key' })).json();
  assert.equal(inference, 0); assert.equal(find(connected, 'openai').inference.status, 'unverified');
  assert.equal((await app.post('/openai/verify', { model: 'other' })).status, 400);
  const verified = await (await app.post('/openai/verify', { model: 'fixture' })).json();
  assert.equal(find(verified, 'openai').inference.status, 'verified');
  fail = true;
  const failure = await (await app.post('/openai/verify', { model: 'fixture' })).json();
  assert.equal(find(failure, 'openai').status, 'connected');
  assert.equal(find(failure, 'openai').inference.status, 'error');
  assert.equal(JSON.stringify(failure).includes('private account body'), false);
});

test('a save with uncertain acknowledgement is deleted before reporting failure or restoring', async t => {
  const records = new Map(); const order = [];
  const app = await harness(t, { credentialStore: {
    async load(id) { return records.get(id) ?? null; },
    async delete(id) { order.push('delete'); records.delete(id); },
    async save(id, record) { records.set(id, record); order.push('save'); throw new Error('acknowledgement lost'); },
  }, fetchImpl: async () => json({ data: [{ id: 'fixture' }] }) });
  const result = await (await app.post('/openai/connect', { apiKey: 'secret', storage: 'system' })).json();
  assert.deepEqual(order, ['delete', 'save', 'delete']);
  assert.equal(records.size, 0); assert.equal(find(result, 'openai').hasCredential, false);
  assert.equal(find(result, 'openai').error.code, 'credential_store_failed');
});

test('cancelled persisted OAuth cannot erase the following saved account', async t => {
  const store = memoryVault(); let releaseCatalog, catalogStarted;
  const started = new Promise(resolve => { catalogStarted = resolve; });
  const app = await harness(t, { credentialStore: store, fetchImpl: async (url, init) => {
    if (url.endsWith('/auth/keys')) return json({ key: 'cancelled-oauth' });
    if (init.headers.Authorization === 'Bearer cancelled-oauth') {
      catalogStarted(); await new Promise(resolve => { releaseCatalog = resolve; });
    }
    return url.endsWith('/key') ? json({ data: { label: 'fixture' } }) : json({ data: [{ id: 'fixture', name: 'Fixture' }] });
  } });
  const flow = await (await app.post('/openrouter/oauth/start', { mode: 'manual', storage: 'system' })).json();
  const completing = finishManual(app, flow.flowId); await started;
  await app.post('/openrouter/oauth/cancel');
  const replacement = await (await app.post('/openrouter/connect', { apiKey: 'replacement-key', storage: 'system' })).json();
  releaseCatalog(); await completing;
  assert.equal(find(replacement, 'openrouter').status, 'connected');
  assert.equal(store.records.get('openrouter').key, 'replacement-key');
});

test('private RPC lost save acknowledgement triggers compensating deletion without leaking its secret', async t => {
  const records = new Map(); const frames = [];
  const rpc = createCredentialRpc(frame => {
    frames.push({ type: frame.type, operation: frame.operation });
    if (frame.operation === 'save') { records.set(frame.providerId, frame.record); return; }
    if (frame.operation === 'delete') records.delete(frame.providerId);
    setTimeout(() => rpc.receive({ type: 'credential-result', id: frame.id, ok: true, record: frame.operation === 'load' ? records.get(frame.providerId) ?? null : null }), 0);
  }, { timeoutMs: 25 });
  t.after(() => rpc.close());
  const app = await harness(t, { credentialStore: rpc.store, fetchImpl: async () => json({ data: [{ id: 'fixture' }] }) });
  const result = await (await app.post('/openai/connect', { apiKey: 'private-rpc-secret', storage: 'system' })).json();
  assert.equal(find(result, 'openai').status, 'error'); assert.equal(records.size, 0);
  assert.deepEqual(frames.slice(-3).map(frame => frame.operation), ['delete', 'save', 'delete']);
  assert.equal(JSON.stringify(result).includes('private-rpc-secret'), false);
});

test('cancel during system save exposes later cleanup failure and allows explicit deletion recovery', async t => {
  const store = memoryVault(); let release, startSave, failDelete = false;
  const started = new Promise(resolve => { startSave = resolve; });
  store.save = async (id, record) => { startSave(); await new Promise(resolve => { release = resolve; }); store.records.set(id, record); };
  store.delete = async id => { if (failDelete) throw new Error('vault locked'); store.records.delete(id); };
  const app = await harness(t, { credentialStore: store, fetchImpl: async () => json({ key: 'late-oauth' }) });
  const flow = await (await app.post('/openrouter/oauth/start', { mode: 'manual', storage: 'system' })).json();
  const completing = finishManual(app, flow.flowId); await started;
  await app.post('/openrouter/oauth/cancel'); failDelete = true; release(); await completing;
  const snapshot = await (await app.get()).json(), connection = find(snapshot, 'openrouter');
  assert.equal(connection.status, 'error'); assert.equal(connection.error.code, 'credential_cleanup_failed');
  assert.equal(connection.credentialStorage, 'system'); assert.equal(connection.hasCredential, false);
  assert.equal(store.records.has('openrouter'), true);
  failDelete = false; await app.post('/openrouter/disconnect');
  assert.equal(store.records.has('openrouter'), false);
  assert.equal(find(await (await app.get()).json(), 'openrouter').status, 'disconnected');
});

test('explicit refresh recovers a previously unavailable vault without replaying authentication', async t => {
  const store = memoryVault(); store.records.set('openai', { key: 'recoverable-key', method: 'api-key' });
  let unavailable = true, calls = 0;
  store.load = async id => { if (unavailable) throw new Error('locked'); return store.records.get(id) ?? null; };
  const app = await harness(t, { credentialStore: store, fetchImpl: async (_url, init) => {
    calls++; assert.equal(init.headers.Authorization, 'Bearer recoverable-key');
    return json({ data: [{ id: 'fixture' }] });
  } });
  assert.equal(find(app.snapshot, 'openai').error.code, 'credential_store_failed');
  unavailable = false; await app.get(); assert.equal(calls, 0);
  const recovered = await (await app.post('/openai/refresh')).json();
  assert.equal(find(recovered, 'openai').status, 'connected'); assert.equal(calls, 1);
  assert.equal(JSON.stringify(recovered).includes('recoverable-key'), false);
  store.records.delete('openai');
  const removed = await (await app.post('/openai/refresh')).json();
  assert.equal(find(removed, 'openai').status, 'disconnected'); assert.equal(calls, 1);
});

test('concurrent browser memory sessions retain independent same-provider connection ownership', async t => {
  let release, started;
  const slow = new Promise(resolve => { started = resolve; });
  const app = await harness(t, { fetchImpl: async (_url, init) => {
    if (init.headers.Authorization === 'Bearer account-A') { started(); await new Promise(resolve => { release = resolve; }); }
    return json({ data: [{ id: init.headers.Authorization.endsWith('account-A') ? 'model-A' : 'model-B' }] });
  } });
  const initialB = await fetch(`${app.origin}/api/model-connections`);
  const cookieB = initialB.headers.get('set-cookie').split(';')[0], snapshotB = await initialB.json();
  const pendingA = app.post('/openai/connect', { apiKey: 'account-A' }); await slow;
  const connectedB = await (await app.post('/openai/connect', { apiKey: 'account-B' }, { cookie: cookieB, 'X-Shipmate-CSRF': snapshotB.csrfToken })).json();
  release(); const connectedA = await (await pendingA).json();
  assert.equal(find(connectedA, 'openai').status, 'connected'); assert.equal(find(connectedB, 'openai').status, 'connected');
  assert.equal(find(connectedA, 'openai').models[0].id, 'model-A'); assert.equal(find(connectedB, 'openai').models[0].id, 'model-B');
});

test('system OAuth superseded by another session reaches a terminal state without blocking local tools', async t => {
  const store = memoryVault(); let release, started;
  const catalogStarted = new Promise(resolve => { started = resolve; });
  const app = await harness(t, { credentialStore: store, fetchImpl: async (url, init) => {
    if (url.endsWith('/auth/keys')) return json({ key: 'superseded-oauth-key' });
    if (init.headers.Authorization === 'Bearer superseded-oauth-key' && url.endsWith('/key')) {
      started(); await new Promise(resolve => { release = resolve; });
    }
    return url.endsWith('/key') ? json({ data: { label: 'fixture' } }) : json({ data: [{ id: 'fixture', name: 'Fixture' }] });
  } });
  const initialB = await fetch(`${app.origin}/api/model-connections`);
  const cookieB = initialB.headers.get('set-cookie').split(';')[0], snapshotB = await initialB.json();
  const flow = await (await app.post('/openrouter/oauth/start', { mode: 'manual', storage: 'system' })).json();
  const completing = finishManual(app, flow.flowId); await catalogStarted;
  const newer = await (await app.post('/openrouter/connect', { apiKey: 'newer-account', storage: 'system' }, { cookie: cookieB, 'X-Shipmate-CSRF': snapshotB.csrfToken })).json();
  assert.equal(find(newer, 'openrouter').status, 'connected');
  release(); const superseded = await (await completing).json();
  assert.equal(superseded.oauth.status, 'error');
  assert.equal(find(superseded, 'openrouter').error.code, 'credential_store_superseded');
  assert.equal(store.records.get('openrouter').key, 'newer-account');
  assert.equal((await app.post('/tools/explain', { query: '隐私' })).status, 200);
});
