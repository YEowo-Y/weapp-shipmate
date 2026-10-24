/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { validateCustomEndpoint, isPublicAddress, createCustomEndpointFetch } from '../desktop/server/custom-endpoint.mjs';
import { discoverModels } from '../desktop/server/model-providers.mjs';
import { streamChatResponse } from '../desktop/server/chat-stream.mjs';

const endpoint = { baseUrl: 'https://api.example.com/v1', allowLocalHttp: false };
test('endpoint canonicalization binds complete base URL and requires explicit loopback HTTP', () => {
  assert.deepEqual(validateCustomEndpoint({ baseUrl: 'https://API.EXAMPLE.COM:443/v1/', allowLocalHttp: true }), endpoint);
  for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
    assert.equal(validateCustomEndpoint({ baseUrl: `http://${host}:8000/v1`, allowLocalHttp: true }).baseUrl, `http://${host}:8000/v1`);
  }
  for (const baseUrl of ['https://user:password@api.example.com/v1', 'https://api.example.com/v1?key=secret', 'https://api.example.com/v1#fragment', 'https://api.example.com/%2e%2e/v1', 'https://api.example.com/a/../v1', 'https://api.example.com/a/./v1', 'https://api.example.com/\\evil', 'https://api.example.com./v1', 'https://local/v1', 'https://secret.internal/v1', 'https://localhost/v1', 'http://192.168.1.2/v1', 'http://127.1/v1', 'http://2130706433/v1', 'http://0x7f000001/v1', 'http://[::ffff:127.0.0.1]/v1', 'ftp://api.example.com/v1', ' https://api.example.com/v1']) {
    assert.throws(() => validateCustomEndpoint({ baseUrl, allowLocalHttp: true }), { code: 'invalid_endpoint' }, baseUrl);
  }
  assert.throws(() => validateCustomEndpoint({ baseUrl: 'http://localhost/v1', allowLocalHttp: false }), { code: 'invalid_endpoint' });
  assert.throws(() => validateCustomEndpoint({ ...endpoint, fetchImpl: true }), { code: 'invalid_endpoint' });
});

test('public address filter rejects private, reserved, translation and multicast addresses', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.1.1', '127.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.0.1', '192.0.0.8', '192.0.2.1', '198.18.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:8.8.8.8', '::ffff:127.0.0.1', '64:ff9b::0808:0808', 'fc00::1', 'fe80::1', 'ff00::1', '2001:db8::1', '2002:0808:0808::1', '2001::1', '3fff::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
});

test('all DNS records are checked and the vetted address is pinned without disabling TLS', async () => {
  let lookups = 0, requests = 0;
  const fetcher = createCustomEndpointFetch(endpoint, {
    lookup: async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; },
    requestImpl: (url, init, callback) => {
      requests++; assert.equal(url.hostname, 'api.example.com'); assert.equal(init.rejectUnauthorized, true); assert.equal(init.agent, false);
      init.lookup(url.hostname, {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
      init.lookup(url.hostname, { all: true }, (error, entries) => { assert.equal(error, null); assert.deepEqual(entries, [{ address: '8.8.8.8', family: 4 }]); });
      const req = new EventEmitter(); req.end = () => { const response = Readable.from([Buffer.from('{}')]); response.statusCode = 200; response.headers = {}; callback(response); }; return req;
    },
  });
  assert.equal(await (await fetcher(`${endpoint.baseUrl}/models`)).text(), '{}');
  assert.equal(lookups, 1); assert.equal(requests, 1);
  const poisoned = createCustomEndpointFetch(endpoint, { lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], requestImpl: () => assert.fail('No request') });
  await assert.rejects(poisoned(`${endpoint.baseUrl}/models`), { code: 'invalid_endpoint' });
  await assert.rejects(fetcher('https://other.example.com/v1/models'), { code: 'invalid_endpoint' });
  await assert.rejects(fetcher(`${endpoint.baseUrl}/models?key=secret`), { code: 'invalid_endpoint' });
});

async function local(t, handler) {
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, allowLocalHttp: true };
}

test('real loopback custom discovery uses auth and rejects redirects without forwarding credentials', async t => {
  let calls = 0;
  const target = await local(t, (req, res) => {
    calls++; assert.equal(req.headers.authorization, 'Bearer dummy-key');
    if (calls === 1) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'local-model' }] })); }
    else { res.writeHead(302, { location: 'https://evil.example.com/' }); res.end(); }
  });
  const result = await discoverModels('custom', 'dummy-key', { endpoint: target });
  assert.equal(result.models[0].id, 'local-model');
  await assert.rejects(discoverModels('custom', 'dummy-key', { endpoint: target }), { code: 'redirect_rejected' });
  assert.equal(calls, 2);
});

test('custom stream reuses strict chat-completions framing and bounded inference tokens', async t => {
  const target = await local(t, async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, 'Bearer dummy-key');
    let raw = ''; for await (const part of req) raw += part;
    const payload = JSON.parse(raw); assert.equal(payload.max_tokens, 32); assert.equal(payload.stream, true);
    res.setHeader('content-type', 'text/event-stream');
    res.end('data: {"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  let output = '';
  const res = { destroyed: false, writeHead() {}, write(value) { output += value; return true; }, end() {} };
  await streamChatResponse(res, 'custom', 'dummy-key', { model: 'local-model', messages: [{ role: 'user', content: 'Hi' }] }, { endpoint: target, maxOutputTokens: 32 });
  assert.match(output, /"delta":"你好"/); assert.match(output, /"type":"finish"/); assert.doesNotMatch(output, /"type":"error"/);
});

test('custom discovery cancellation and timeout abort hanging sockets', async t => {
  const target = await local(t, () => {});
  const controller = new AbortController();
  const pending = discoverModels('custom', 'dummy-key', { endpoint: target, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, { code: 'canceled' });
  await assert.rejects(discoverModels('custom', 'dummy-key', { endpoint: target, timeoutMs: 20 }), { code: 'timeout' });
});

test('custom fixtures are explicit private options; generic fetch cannot bypass endpoint validation', async () => {
  await assert.rejects(discoverModels('custom', 'dummy-key', { endpoint: { baseUrl: 'https://127.0.0.1/v1', allowLocalHttp: false }, fetchImpl: () => assert.fail('No generic fetch'), customFetchImpl: () => assert.fail('No fixture') }), { code: 'invalid_endpoint' });
  const result = await discoverModels('custom', 'dummy-key', { endpoint, customFetchImpl: async () => new Response('{"data":[]}') });
  assert.equal(result.models.length, 0);
});

test('DNS cancellation cannot make a late request and re-resolution checks rebinding', async () => {
  const controller = new AbortController(); let finishLookup;
  const fetcher = createCustomEndpointFetch(endpoint, { lookup: () => new Promise(resolve => { finishLookup = resolve; }), requestImpl: () => assert.fail('No request after cancel') });
  const pending = fetcher(`${endpoint.baseUrl}/models`, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { code: 'canceled' });
  finishLookup([{ address: '8.8.8.8', family: 4 }]);
  let lookups = 0;
  const rebinding = createCustomEndpointFetch(endpoint, { lookup: async () => [{ address: ++lookups === 1 ? '8.8.8.8' : '169.254.169.254', family: 4 }], requestImpl: () => { throw new Error('first vetted request'); } });
  await assert.rejects(rebinding(`${endpoint.baseUrl}/models`), /first vetted request/);
  await assert.rejects(rebinding(`${endpoint.baseUrl}/models`), { code: 'invalid_endpoint' });
  assert.equal(lookups, 2);
});

test('custom transport enforces catalog byte limits and actionable authorization errors', async t => {
  let status = 401;
  const target = await local(t, (_req, res) => { res.writeHead(status, status === 200 ? { 'content-length': '2097153' } : {}); res.end('private upstream secret'); });
  for (const [code, next] of [['authentication_failed', 401], ['permission_denied', 403], ['rate_limited', 429], ['response_too_large', 200]]) {
    status = next;
    await assert.rejects(discoverModels('custom', 'dummy-key', { endpoint: target }), error => error.code === code && !error.message.includes('private upstream'));
  }
});

test('unsupported HTTP status closes its response and a subsequent catalog request recovers', async t => {
  let calls = 0, rejectedClosed;
  const closed = new Promise(resolve => { rejectedClosed = resolve; });
  const target = await local(t, (_req, res) => {
    if (++calls === 1) {
      res.on('close', rejectedClosed);
      res.writeHead(600, { 'content-type': 'application/json' });
      res.write('private upstream content'); // Keep open: the client must release it.
    } else {
      res.setHeader('content-type', 'application/json');
      res.end('{"data":[{"id":"recovered-model"}]}');
    }
  });
  await assert.rejects(discoverModels('custom', 'dummy-key', { endpoint: target }), error => error.code === 'invalid_response' && error.status === 502 && !error.message.includes('private'));
  await closed;
  const result = await discoverModels('custom', 'dummy-key', { endpoint: target });
  assert.equal(result.models[0].id, 'recovered-model');
  assert.equal(calls, 2);
});

test('invalid response headers are caught inside the asynchronous response callback', async () => {
  let response;
  const fetcher = createCustomEndpointFetch(endpoint, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    requestImpl: (_url, _init, callback) => {
      const req = new EventEmitter();
      req.end = () => setTimeout(() => {
        response = Readable.from([Buffer.from('private')]);
        response.statusCode = 200; response.headers = { 'invalid header': 'private' }; callback(response);
      }, 0);
      return req;
    },
  });
  await assert.rejects(fetcher(`${endpoint.baseUrl}/models`), { code: 'invalid_response', status: 502 });
  assert.equal(response.destroyed, true);
});

test('custom text stream rejects missing stop and tool output, safely differentiates 401/403/429', async () => {
  const request = { model: 'model', messages: [{ role: 'user', content: 'Hi' }] };
  for (const [status, content, expected] of [
    [401, 'secret', /授权失效/], [403, 'secret', /访问权限/], [429, 'secret', /频率或额度/],
    [200, 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n', /未完成/],
    [200, 'data: {"choices":[{"delta":{"tool_calls":[{}]}}]}\n\n', /未完成/],
  ]) {
    let output = '';
    const res = { destroyed: false, writeHead() {}, write(value) { output += value; return true; }, end() {} };
    await streamChatResponse(res, 'custom', 'dummy-key', request, { endpoint, customFetchImpl: async () => new Response(content, { status, headers: { 'content-type': 'text/event-stream' } }) });
    assert.match(output, expected); assert.match(output, /"type":"error"/); assert.doesNotMatch(output, /"type":"finish"|secret/);
  }
});
