import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import { fetchLatestRelease } from '../desktop/server/release-check.mjs';

const tag = 'v0.2.0';
const metadata = { tag_name: tag, draft: false, prerelease: false };
const failed = { status: 'failed' };

function reply(body, { statusCode = 200, headers = {}, onRequest } = {}) {
  return (url, options, receive) => {
    onRequest?.({ url, ...options });
    const outgoing = new EventEmitter();
    outgoing.end = () => receive(Object.assign(Readable.from([body]), { statusCode, headers }));
    return outgoing;
  };
}

async function localRequest(t, serve) {
  const server = createServer(serve);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  return (_api, options, receive) => httpRequest(`http://127.0.0.1:${server.address().port}/`, options, receive);
}

test('release check makes one anonymous request to the fixed API and projects only the tag', async () => {
  const calls = [];
  const release = { ...metadata, body: 'upstream release notes', html_url: 'https://example.invalid', assets: [{ name: 'installer.exe' }] };
  const result = await fetchLatestRelease(reply(Buffer.from(JSON.stringify(release)), { onRequest: call => calls.push(call) }));
  assert.equal(calls.length, 1);
  const [{ signal, ...request }] = calls;
  assert.ok(signal instanceof globalThis.AbortSignal);
  assert.deepEqual(request, {
    url: 'https://api.github.com/repos/YEowo-Y/weapp-shipmate/releases/latest',
    method: 'GET',
    agent: false,
    headers: { Accept: 'application/vnd.github+json', 'Accept-Encoding': 'identity', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'weapp-shipmate-desktop' },
  });
  assert.deepEqual(result, { status: 'release', tag });
});

test('an unavailable release differs from HTTP failures, including rate limiting', async () => {
  for (const statusCode of [201, 403, 404, 429, 500]) {
    assert.deepEqual(
      await fetchLatestRelease(reply(Buffer.alloc(0), { statusCode })),
      statusCode === 404 ? { status: 'unavailable' } : failed,
    );
  }
  assert.deepEqual(await fetchLatestRelease(() => { throw new Error('Redacted network failure'); }), failed);
});

test('a redirect does not contact its destination', async t => {
  const hits = [];
  const request = await localRequest(t, (req, res) => {
    hits.push(req.url);
    res.writeHead(302, { Location: '/alternative' }).end();
  });
  assert.deepEqual(await fetchLatestRelease(request), failed);
  assert.deepEqual(hits, ['/']);
});

test('HTTP 421 fails without retrying the request', async t => {
  let count = 0;
  const request = await localRequest(t, (_req, res) => {
    count++;
    if (count === 1) res.writeHead(421).end();
    else res.end(JSON.stringify(metadata));
  });
  assert.deepEqual(await fetchLatestRelease(request), failed);
  assert.equal(count, 1);
});

test('rejects draft or prerelease metadata, missing fields and malformed UTF-8 or JSON', async () => {
  for (const data of [
    null,
    { ...metadata, draft: true },
    { ...metadata, prerelease: true },
    { ...metadata, prerelease: null },
    { tag_name: tag, draft: false },
    { ...metadata, tag_name: '' },
    { ...metadata, tag_name: '1'.repeat(65) },
  ]) {
    assert.deepEqual(await fetchLatestRelease(reply(Buffer.from(JSON.stringify(data)))), failed);
  }
  assert.deepEqual(await fetchLatestRelease(reply(Buffer.from('{'))), failed);
  const badUtf8 = Buffer.concat([Buffer.from('{"draft":false,"prerelease":false,"tag_name":"v0.2.0","extra":"'), Buffer.from([255]), Buffer.from('"}')]);
  assert.deepEqual(await fetchLatestRelease(reply(badUtf8)), failed);
});

test('limits the identity response bytes, accepts the exact bound and refuses compressed bodies', async () => {
  const limit = 256 * 1024;
  const data = JSON.stringify({ ...metadata, body: '' });
  const exactLimit = JSON.stringify({ ...metadata, body: 'a'.repeat(limit - Buffer.byteLength(data)) });
  assert.equal(Buffer.byteLength(exactLimit), limit);
  assert.deepEqual(await fetchLatestRelease(reply(Buffer.from(exactLimit))), { status: 'release', tag });
  assert.deepEqual(await fetchLatestRelease(reply(Buffer.from(exactLimit + ' '))), failed);
  assert.deepEqual(await fetchLatestRelease(reply(Buffer.from(data), { headers: { 'content-encoding': 'gzip' } })), failed);
});

test('the single HTTP deadline cancels a response that stalls after headers', { timeout: 3_000 }, async t => {
  const controller = new AbortController();
  let timeout;
  t.mock.method(globalThis.AbortSignal, 'timeout', milliseconds => {
    timeout = milliseconds;
    return controller.signal;
  });
  const request = await localRequest(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"draft":');
  });
  let headersRead = false;
  const result = await fetchLatestRelease((api, options, receive) => request(api, options, partial => {
    headersRead = partial.statusCode === 200;
    setTimeout(() => controller.abort(), 20);
    receive(partial);
  }));
  assert.equal(timeout, 8_000);
  assert.equal(headersRead, true);
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(result, failed);
});
