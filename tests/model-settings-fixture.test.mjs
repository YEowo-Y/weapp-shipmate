/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createFixtureServer } from '../scripts/model-settings-fixture.mjs';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';

async function harness(t) {
  const fixture = createFixtureServer({ slowMs: 20, streamDelayMs: 2, stopDelayMs: 2 });
  assert.equal(fixture.server.listening, false);
  fixture.server.listen(0, '127.0.0.1');
  await once(fixture.server, 'listening');
  t.after(() => fixture.close());
  const origin = `http://127.0.0.1:${fixture.server.address().port}`;
  const response = await fetch(origin + '/api/model-connections');
  const initial = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Shipmate-CSRF': initial.csrfToken };
  return { fixture, origin, headers, post: (path, body = {}) => fetch(origin + '/api/model-connections' + path, { method: 'POST', headers, body: JSON.stringify(body) }) };
}
const openai = snapshot => snapshot.connections.find(value => value.providerId === 'openai');

test('fixture uses actual session/CSRF broker and synthetic success/error/empty catalogs', async t => {
  const app = await harness(t);
  for (const [key, status, count, code] of [
    ['fixture-success', 'connected', 36], ['fixture-auth-error', 'error', 0, 'authentication_failed'],
    ['fixture-rate-limit', 'error', 0, 'rate_limited'], ['fixture-empty', 'connected', 0],
    ['fixture-slow', 'connected', 36], ['not-a-fixture-key', 'error', 0, 'authentication_failed'],
  ]) {
    await app.post('/openai/disconnect');
    const response = await app.post('/openai/connect', { apiKey: key });
    const snapshot = await response.json();
    const connection = openai(snapshot);
    assert.equal(connection.status, status);
    assert.equal(connection.models.length, count);
    if (code) assert.equal(connection.error.code, code);
    assert.equal(JSON.stringify(snapshot).includes(key), false);
    assert.ok(connection.models.every(model => model.id.startsWith('fixture-demo-model-')));
  }
  assert.equal(app.fixture.upstreamCalls, 6);
  const invalid = await fetch(app.origin + '/api/model-connections/openai/connect', {
    method: 'POST', headers: { ...app.headers, 'X-Shipmate-CSRF': '' }, body: JSON.stringify({ apiKey: 'fixture-success' }),
  });
  assert.equal(invalid.status, 403);
  assert.equal(app.fixture.upstreamCalls, 6);
});

test('fixture serves identical product modules and marks HTML without editing production files', async t => {
  const app = await harness(t);
  const html = await (await fetch(app.origin + '/settings.html')).text();
  const original = await readFile(new URL('../desktop/design-previews/settings.html', import.meta.url), 'utf8');
  assert.match(html, /data-fixture-banner/u);
  assert.equal(html.replace(/<aside data-fixture-banner[\s\S]*?<\/aside>/u, ''), original);
  const script = await (await fetch(app.origin + '/settings.js')).text();
  assert.equal(script, await readFile(new URL('../desktop/design-previews/settings.js', import.meta.url), 'utf8'));
  const client = await (await fetch(app.origin + '/model-connection-client.js')).text();
  assert.equal(client, await readFile(new URL('../desktop/design-previews/model-connection-client.js', import.meta.url), 'utf8'));
  assert.equal((await fetch(app.origin + '/%2e%2e%2fpackage.json')).status, 403);
  assert.equal(app.fixture.upstreamCalls, 0);
});

test('OAuth start/cancel preserves real URL allowlist and never exchanges or calls a network', async t => {
  const app = await harness(t);
  const start = await (await app.post('/openrouter/oauth/start')).json();
  const authorization = new URL(start.authorizationUrl);
  assert.equal(authorization.origin, 'https://openrouter.ai');
  assert.equal(authorization.pathname, '/auth');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  const canceled = await (await app.post('/openrouter/oauth/cancel')).json();
  assert.equal(canceled.oauth.status, 'cancelled');
  assert.equal(app.fixture.upstreamCalls, 0);
});

test('manual OAuth fixture exercises real PKCE broker, failure recovery and one-use completion', async t => {
  const app = await harness(t);
  const failedFlow = await (await app.post('/openrouter/oauth/start', { mode: 'manual' })).json();
  assert.equal(new URL(failedFlow.authorizationUrl).searchParams.has('callback_url'), false);
  const failed = await (await app.post('/openrouter/oauth/complete', { flowId: failedFlow.flowId, code: 'fixture-oauth-invalid' })).json();
  assert.equal(failed.oauth.status, 'error');
  const flow = await (await app.post('/openrouter/oauth/start', { mode: 'manual' })).json();
  const result = await (await app.post('/openrouter/oauth/complete', { flowId: flow.flowId, code: 'fixture-oauth-success' })).json();
  assert.equal(result.oauth.status, 'success');
  const connected = result.connections.find(value => value.providerId === 'openrouter');
  assert.equal(connected.authMethod, 'oauth');
  assert.equal(connected.models.length, 36);
  assert.doesNotMatch(JSON.stringify(result), /fixture-success|fixture-oauth-success|code_verifier/u);
  assert.equal(result.oauth.authorizationUrl, undefined);
  assert.equal((await app.post('/openrouter/oauth/complete', { flowId: flow.flowId, code: 'fixture-oauth-success' })).ok, false);
  assert.equal(app.fixture.upstreamCalls, 4);
});

test('refresh failure retains previous 36 models including a long unbroken ID and retries successfully', async t => {
  const app = await harness(t);
  const connected = openai(await (await app.post('/openai/connect', { apiKey: 'fixture-refresh-error' })).json());
  assert.equal(connected.status, 'connected');
  assert.equal(connected.models.length, 36);
  assert.ok(connected.models.some(model => model.id.length === 256 && !/\s/u.test(model.id)));
  const failed = openai(await (await app.post('/openai/refresh')).json());
  assert.equal(failed.status, 'error');
  assert.equal(failed.error.code, 'rate_limited');
  assert.deepEqual(failed.models, connected.models);
  const recovered = openai(await (await app.post('/openai/refresh')).json());
  assert.equal(recovered.status, 'connected');
  assert.deepEqual(recovered.models, connected.models);
});

test('fixture cookie coexists with default broker cookie without reading or replacing its credentials', async t => {
  const app = await harness(t);
  const production = createModelConnectionHandler({ fetchImpl: async () => {
    return new Response(JSON.stringify({ data: [{ id: 'production-test-only-model' }] }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const server = createServer((req, res) => { void production(req, res); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { production.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = await fetch(origin + '/api/model-connections');
  const originalCookie = bootstrap.headers.get('set-cookie').split(';')[0];
  const original = await bootstrap.json();
  await fetch(origin + '/api/model-connections/openai/connect', { method: 'POST',
    headers: { cookie: originalCookie, Origin: origin, 'Content-Type': 'application/json', 'X-Shipmate-CSRF': original.csrfToken },
    body: JSON.stringify({ apiKey: 'production-test-only-key' }),
  });
  assert.match(originalCookie, /^shipmate_models=/u);
  assert.match(app.headers.cookie, /^shipmate_model_fixture=/u);
  const fixtureInitial = await fetch(app.origin + '/api/model-connections', { headers: { cookie: originalCookie } });
  assert.match(fixtureInitial.headers.get('set-cookie'), /^shipmate_model_fixture=/u);
  assert.ok((await fixtureInitial.json()).connections.every(connection => !connection.hasCredential));
  await app.post('/openai/connect', { apiKey: 'fixture-success' });
  const sharedCookie = `${originalCookie}; ${app.headers.cookie}`;
  const productionAgain = await fetch(origin + '/api/model-connections', { headers: { cookie: sharedCookie } });
  assert.equal(productionAgain.headers.get('set-cookie'), null);
  const originalAgain = await productionAgain.json();
  assert.equal(originalAgain.csrfToken, original.csrfToken);
  assert.equal(openai(originalAgain).status, 'connected');
  assert.deepEqual(openai(originalAgain).models, [{ id: 'production-test-only-model', name: 'production-test-only-model' }]);
  const fixtureAgain = await fetch(app.origin + '/api/model-connections', { headers: { cookie: sharedCookie } });
  assert.equal(fixtureAgain.headers.get('set-cookie'), null);
  assert.equal(openai(await fixtureAgain.json()).status, 'connected');
  assert.equal(app.fixture.upstreamCalls, 1);
});

for (const provider of ['anthropic', 'google']) {
  test(`${provider} fixture streams, fails once, recovers, and cancels through actual broker`, async t => {
    const app = await harness(t);
    const connected = await (await app.post(`/${provider}/connect`, { apiKey: 'fixture-success' })).json();
    const catalog = connected.connections.find(value => value.providerId === provider);
    assert.equal(catalog.status, 'connected');
    assert.equal(catalog.models.length, 36);
    assert.ok(catalog.models.every(model => !model.id.includes('embedding')));
    const body = content => ({ model: catalog.models[0].id, messages: [{ role: 'user', content }] });
    const chat = content => app.post(`/${provider}/chat`, body(content));
    const output = await (await chat('hello')).text();
    assert.match(output, /"type":"text-delta"/u);
    assert.match(output, /模拟/u);
    assert.match(output, /"type":"finish"/u);
    for (const prompt of ['[fixture-retry]', '[fixture-rate]']) {
      const failed = await (await chat(prompt)).text();
      assert.match(failed, /"type":"error"/u);
      assert.doesNotMatch(failed, /"type":"finish"/u);
      const recovered = await (await chat(prompt)).text();
      assert.match(recovered, /"type":"finish"/u);
    }
    const truncated = await (await chat('[fixture-truncate]')).text();
    assert.match(truncated, /"type":"error"/u);
    assert.doesNotMatch(truncated, /"type":"finish"/u);
    const stopped = await chat('[fixture-stop]');
    const reader = stopped.body.getReader();
    let partial = '';
    while (!partial.includes('text-delta')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      partial += Buffer.from(chunk.value).toString();
    }
    await reader.cancel();
    for (let attempt = 0; attempt < 100 && app.fixture.chatStats.cancelled === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(app.fixture.chatStats.cancelled, 1);
    assert.equal(app.fixture.chatStats.requests, 7);
    assert.equal(app.fixture.chatStats.active, 0);
    const afterStop = await (await chat('continue after stop')).text();
    assert.match(afterStop, /"type":"finish"/u);
    assert.doesNotMatch(afterStop, /"type":"error"/u);
    assert.equal(app.fixture.chatStats.requests, 8);
  });
}
