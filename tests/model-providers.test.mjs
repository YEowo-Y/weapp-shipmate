/* global Response, ReadableStream */
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverModels, exchangeOpenRouterCode, ConnectionError, PROVIDER_CONFIGS } from '../desktop/server/model-providers.mjs';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
test('OpenAI discovery uses only fixed endpoint and bearer auth, rejects redirects', async () => {
  const result = await discoverModels('openai', 'test-key', { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.redirect, 'error');
    return json({ data: [{ id: 'sample-model' }] });
  } });
  assert.deepEqual(result, { models: [{ id: 'sample-model', name: 'sample-model' }], truncated: false });
});

test('provider configuration is immutable and unsupported identities never make requests', async () => {
  assert.ok(Object.isFrozen(PROVIDER_CONFIGS.openai));
  for (const provider of ['__proto__', 'https://attacker.invalid', null, ['openai']]) {
    await assert.rejects(discoverModels(provider, 'key', { fetchImpl: () => assert.fail('No network') }), { code: 'unsupported_provider' });
  }
  for (const key of ['', 'key\r\nHeader: injected', null, 'x'.repeat(4097)]) {
    await assert.rejects(discoverModels('openai', key, { fetchImpl: () => assert.fail('No network') }), { code: 'invalid_key' });
  }
});

test('Anthropic uses documented headers and bounded cursor pagination', async () => {
  let calls = 0;
  const result = await discoverModels('anthropic', 'test-key', { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers['x-api-key'], 'test-key');
    assert.equal(options.headers['anthropic-version'], '2023-06-01');
    assert.equal(new URL(url).searchParams.get('after_id'), calls > 1 ? `model-${calls - 1}` : null);
    return json({ data: [{ id: `model-${calls}`, display_name: `Model ${calls}` }], has_more: true, last_id: `model-${calls}` });
  } });
  assert.equal(calls, 3); assert.equal(result.truncated, true); assert.equal(result.models.length, 3);
});

test('Google credentials stay in headers and page tokens cannot change fixed origin', async () => {
  let calls = 0;
  const result = await discoverModels('google', 'test-secret', { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers['x-goog-api-key'], 'test-secret');
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://generativelanguage.googleapis.com');
    assert.equal(parsed.searchParams.has('key'), false);
    if (calls === 2) assert.equal(parsed.searchParams.get('pageToken'), 'https://evil.invalid/?x=1');
    return json({ models: [{ name: 'models/gemini-test', displayName: 'Gemini test', supportedGenerationMethods: ['generateContent'] }], ...(calls === 1 ? { nextPageToken: 'https://evil.invalid/?x=1' } : {}) });
  } });
  assert.equal(calls, 2); assert.equal(result.models.length, 1); assert.equal(result.truncated, false);
});

test('OpenRouter authenticates before fetching its public catalog', async () => {
  const calls = [];
  const result = await discoverModels('openrouter', 'secret', { fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(options.headers.Authorization, 'Bearer secret');
    return json(calls.length === 1 ? { data: { label: 'test-key' } } : { data: [{ id: 'vendor/model', name: 'Model' }] });
  } });
  assert.deepEqual(calls, ['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/models']);
  assert.equal(result.models[0].id, 'vendor/model');
});

test('Ollama only queries fixed loopback and never sends an API key', async () => {
  assert.deepEqual(await discoverModels('ollama', 'ignored-secret', { fetchImpl: async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    assert.equal(options.headers.Authorization, undefined);
    return json({ models: [] });
  } }), { models: [], truncated: false });
});

test('upstream errors and network exceptions never expose upstream text or credentials', async () => {
  for (const [status, code] of [[401, 'authentication_failed'], [403, 'permission_denied'], [429, 'rate_limited'], [500, 'upstream_error'], [302, 'upstream_error']]) {
    let calls = 0;
    await assert.rejects(discoverModels('openrouter', 'secret-marker', { fetchImpl: async () => {
      calls++; return new Response('secret-marker', { status });
    } }), error => error instanceof ConnectionError && error.code === code && !error.message.includes('secret-marker'));
    assert.equal(calls, 1);
  }
  await assert.rejects(discoverModels('openai', 'secret-marker', { fetchImpl: async () => { throw new Error('secret-marker'); } }), { code: 'network_error' });
});

test('malformed JSON, model fields and oversized field collections are rejected', async () => {
  for (const response of [new Response('{bad'), json([]), json({ data: null }), json({ data: [{ id: ['bad'] }] }), json({ data: [{ id: 'x'.repeat(257) }] }), json({ data: [], ...Object.fromEntries(Array.from({ length: 130 }, (_, n) => [`field${n}`, 0])) })]) {
    await assert.rejects(discoverModels('openai', 'key', { fetchImpl: async () => response }), { code: 'invalid_response' });
  }
  await assert.rejects(discoverModels('anthropic', 'key', { fetchImpl: async () => json({ data: [], has_more: true, last_id: null }) }), { code: 'invalid_response' });
});

test('response limits cover announced and streamed bytes', async () => {
  for (const response of [new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }), new Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    await assert.rejects(discoverModels('openai', 'key', { fetchImpl: async () => response }), { code: 'response_too_large' });
  }
});

test('timeouts cover fetch and body reading even if the upstream does not finish', async () => {
  let requestSignal;
  await assert.rejects(discoverModels('openai', 'key', { timeoutMs: 10, fetchImpl: async (_url, options) => {
    requestSignal = options.signal; return new Promise(() => {});
  } }), { code: 'timeout' });
  assert.equal(requestSignal.aborted, true);
  let canceled = false;
  await assert.rejects(discoverModels('openai', 'key', { timeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ cancel() { canceled = true; } })) }), { code: 'timeout' });
  assert.equal(canceled, true);
});

test('pre-canceled and in-flight canceled work cannot return a catalog', async () => {
  const first = new AbortController(); first.abort();
  await assert.rejects(discoverModels('openai', 'key', { signal: first.signal, fetchImpl: () => assert.fail('No network') }), { code: 'canceled' });
  const controller = new AbortController();
  await assert.rejects(discoverModels('openai', 'key', { signal: controller.signal, fetchImpl: async () => {
    controller.abort(); return json({ data: [] });
  } }), { code: 'canceled' });
});

test('OpenRouter code exchange sends S256 verifier only to its fixed endpoint', async () => {
  const verifier = 'v'.repeat(43);
  const key = await exchangeOpenRouterCode('test-code', verifier, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/auth/keys');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { code: 'test-code', code_verifier: verifier, code_challenge_method: 'S256' });
    return json({ key: 'new-test-key' });
  } });
  assert.equal(key, 'new-test-key');
  await assert.rejects(exchangeOpenRouterCode('code', 'short'), { code: 'invalid_oauth' });
  await assert.rejects(exchangeOpenRouterCode('code', verifier, { fetchImpl: async () => json({ key: 'bad\nkey' }) }), { code: 'invalid_response' });
});

test('repeated cursors fail closed and a redirected success is not trusted', async () => {
  let calls = 0;
  await assert.rejects(discoverModels('google', 'key', { fetchImpl: async () => {
    calls++; return json({ models: [], nextPageToken: 'same' });
  } }), { code: 'invalid_response' });
  assert.equal(calls, 2);
  const response = json({ data: [] });
  Object.defineProperty(response, 'redirected', { value: true });
  await assert.rejects(discoverModels('openai', 'key', { fetchImpl: async () => response }), { code: 'upstream_error' });
});

test('Google catalog admits only safe generateContent resource names', async () => {
  const result = await discoverModels('google', 'key', { fetchImpl: async () => json({ models: [
    { name: 'models/gemini-test', supportedGenerationMethods: ['generateContent', 'countTokens'] },
    { name: 'models/embedding-test', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/unknown' },
  ] }) });
  assert.deepEqual(result.models, [{ id: 'models/gemini-test', name: 'models/gemini-test' }]);
  for (const name of ['models/../x', 'models/x?key=evil', 'models/x:predict', 'models/x/y', 'models/x%2fy', 'https://evil.invalid']) {
    await assert.rejects(discoverModels('google', 'key', { fetchImpl: async () => json({ models: [{ name, supportedGenerationMethods: ['generateContent'] }] }) }), { code: 'invalid_response' });
  }
});

