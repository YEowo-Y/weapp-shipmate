import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { createSourceCatalog, loadSourceReferences } from '../src/source-catalog.mjs';
import { sha256, extractMainText } from '../src/source-text.mjs';
import { sha256 as legacyHash, extractMainText as legacyExtract } from '../scripts/snapshot-sources.mjs';
import { checkSource, validateSourceCatalog, resolveOfficialAddresses } from '../desktop/server/source-check.mjs';

const url = 'https://developers.weixin.qq.com/miniprogram/test.html';
const html = '<main class="page"><p>' + '正文解释 source '.repeat(30) + '</p></main>';
const hash = sha256(extractMainText(html));
function catalog(baseline = { hash, method: 'fetch', fetchedAt: '2026-10-22' }, sourceUrl = url) {
  const source = { id: `source-${sha256(sourceUrl).slice(0, 16)}`, url: sourceUrl, title: '官方来源', references: [{ id: 'rule.x', title: '规则', lastVerified: '2026-10-22', draft: false }], baseline };
  const payload = { schemaVersion: 1, staleDays: 180, sources: [source] };
  return { schemaVersion: 1, catalogVersion: sha256(JSON.stringify(payload)), staleDays: 180, sources: [source] };
}
function transport({ status = 200, headers = { 'content-type': 'text/html' }, body = html, hold = false } = {}) {
  const calls = []; let destroyed = false;
  return { calls, get destroyed() { return destroyed; },
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    request: (requestUrl, options, callback) => {
      calls.push({ requestUrl, options });
      const req = new EventEmitter(); req.destroy = () => { destroyed = true; };
      req.end = () => { if (hold) return; const response = Readable.from([Buffer.from(body)]); response.statusCode = status; response.headers = headers; callback(response); };
      return req;
    },
  };
}
async function run(c = catalog(), fixture = transport(), extra = {}) {
  return checkSource(c, c.sources[0].id, { ...fixture, now: () => 123456, ...extra });
}

test('online quotes use only this GET body and keep source reachability separate from a match', async () => {
  for (const [quote, match] of [['正文解释 source', 'exact'], ['正文解释source', 'whitespace-normalized'], ['正文解释。source', 'missing']]) {
    const fixture = transport();
    const result = await run(catalog(), fixture, { quote });
    assert.equal(fixture.calls.length, 1);
    assert.equal(result.source.state, 'unchanged');
    assert.equal(result.match, match);
    assert.equal(result.quoteHash, sha256(quote));
  }
  for (const fixture of [transport({ status: 404 }), transport({ body: '<title>Sign in</title>' + html }), transport({ body: '<main>正文解释 source</main>' })]) {
    const result = await run(catalog(), fixture, { quote: '正文解释 source' });
    assert.equal(result.match, 'unverified');
    assert.equal(result.source.contentHash, null);
  }
  const manual = transport();
  assert.equal((await run(catalog({ hash, method: 'manual', fetchedAt: '2026-10-22' }), manual, { quote: '正文' })).match, 'unverified');
  assert.equal(manual.calls.length, 0);
  await assert.rejects(run(catalog(), transport(), { quote: ' \u200b ' }), /quote/);
});

test('shared source extraction preserves legacy function identity and normalized hash', () => {
  assert.equal(extractMainText('<main>\n  <p>正文</p></main>'), '正文\n');
  assert.equal(legacyHash, sha256); assert.equal(legacyExtract, extractMainText);
  assert.equal(extractMainText('<main><p>A&amp;B\u200b</p><script>x()</script><style>x</style><p>C&#39;D</p></main>'), 'A&B\nC\'D\n');
});

test('catalog covers all monitored carriers, linked rejections, drafts and only metadata', () => {
  const c = validateSourceCatalog(createSourceCatalog());
  const refs = c.sources.flatMap((source) => source.references);
  for (const item of loadSourceReferences()) assert.ok(refs.some((ref) => ref.id === item.id), item.id);
  assert.ok(refs.some((ref) => ref.id.startsWith('rejections:')));
  assert.equal(c.sources.length, 16);
  assert.ok(c.sources.some((source) => source.baseline?.method === 'manual'));
  assert.ok(!JSON.stringify(c).includes('source_quote'));
  assert.deepEqual(createSourceCatalog(), c);
});

test('catalog revision covers maintained dates and baseline metadata', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'shipmate-catalog-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['flow.yaml', 'rejections.yaml', 'rules', 'src/crosscheck.mjs', 'corpus/source-snapshots/index.json']) cpSync(resolve(path), join(root, path), { recursive: true });
  const initial = createSourceCatalog({ root });
  const assertions = join(root, 'rules/privacy-apis.yaml');
  writeFileSync(assertions, readFileSync(assertions, 'utf8') + '\n# rule package revision without date changes\n');
  assert.notEqual(createSourceCatalog({ root }).catalogVersion, initial.catalogVersion);
  const ruleFile = join(root, 'rules/privacy-apis.yaml');
  const ruleData = yaml.load(readFileSync(ruleFile, 'utf8')); ruleData.rules[0].draft = true;
  writeFileSync(ruleFile, yaml.dump(ruleData));
  assert.ok(createSourceCatalog({ root }).sources.flatMap((source) => source.references).some((ref) => ref.id === ruleData.rules[0].id && ref.draft));
  const beforeAssertion = createSourceCatalog({ root }).catalogVersion;
  ruleData.rules[0].source_quote += ' changed assertion';
  writeFileSync(ruleFile, yaml.dump(ruleData));
  assert.notEqual(createSourceCatalog({ root }).catalogVersion, beforeAssertion, 'changed assertion without changing title or verification date invalidates cached evidence');
  const file = join(root, 'flow.yaml'); writeFileSync(file, readFileSync(file, 'utf8').replace('2026-10-22', '2026-10-21'));
  assert.notEqual(createSourceCatalog({ root }).catalogVersion, initial.catalogVersion);
  const index = join(root, 'corpus/source-snapshots/index.json');
  const data = JSON.parse(readFileSync(index, 'utf8')); data.snapshots[0].fetched_at = '2026-10-20'; writeFileSync(index, JSON.stringify(data));
  const newer = createSourceCatalog({ root }); assert.notEqual(newer.catalogVersion, initial.catalogVersion);
});

test('matching, changed and unarchived bodies report evidence without changing metadata', async () => {
  const c = catalog(); const before = JSON.stringify(c);
  assert.deepEqual(await run(c), { schemaVersion: 1, catalogVersion: c.catalogVersion, sourceId: c.sources[0].id, checkedAt: 123456, state: 'unchanged', reason: 'same', httpStatus: 200, contentHash: hash });
  assert.equal(JSON.stringify(c), before);
  assert.equal((await run(c, transport({ body: html.replace('正文', '变化') }))).state, 'changed');
  const reachable = await run(catalog(null)); assert.equal(reachable.state, 'reachable'); assert.equal(reachable.reason, 'no_baseline');
});

test('manual archives never resolve DNS or request', async () => {
  const result = await run(catalog({ hash, fetchedAt: '2026-10-22', method: 'manual' }), { lookup: () => assert.fail('DNS'), request: () => assert.fail('request') });
  assert.equal(result.state, 'manual'); assert.equal(result.contentHash, null); assert.equal(result.httpStatus, null);
});

test('unknown IDs, fields, metadata drift and arbitrary addresses are rejected before DNS', async () => {
  const fixture = { lookup: () => assert.fail('DNS'), request: () => assert.fail('request') };
  const c = catalog(); await assert.rejects(checkSource(c, 'source-0000000000000000', fixture));
  for (const invalid of [{ ...c, evil: true }, { ...c, catalogVersion: 'invalid' }, { ...c, sources: [{ ...c.sources[0], evil: true }] }]) await assert.rejects(run(invalid, fixture));
  for (const invalid of ['http://developers.weixin.qq.com/', 'https://evil.com/', 'https://developers.weixin.qq.com.evil.com/', 'https://user:password@developers.weixin.qq.com/', 'https://developers.weixin.qq.com:444/']) await assert.rejects(run(catalog(null, invalid), fixture));
});

test('private/mixed DNS and malformed families fail closed; successful lookup is pinned', async () => {
  for (const addresses of [[{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 6 }], []]) {
    const result = await run(catalog(), { lookup: async () => addresses, request: () => assert.fail('request') });
    assert.equal(result.reason, 'access'); assert.equal(result.contentHash, null);
  }
  const fixture = transport(); await run(catalog(), fixture);
  const options = fixture.calls[0].options;
  assert.equal(options.agent, false); assert.equal(options.maxHeaderSize, 16384); assert.equal(options.servername, 'developers.weixin.qq.com');
  assert.equal(options.headers['accept-encoding'], 'identity'); assert.equal(options.headers.authorization, undefined);
  options.lookup('ignored', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
});

test('redirect, missing, denied and server failures preserve uncertainty', async () => {
  for (const [status, state, reason] of [[302, 'unknown', 'redirect'], [404, 'unavailable', 'not_found'], [410, 'unavailable', 'not_found'], [403, 'unknown', 'access'], [429, 'unknown', 'access'], [500, 'unknown', 'access']]) {
    const fixture = transport({ status }); const result = await run(catalog(), fixture);
    assert.equal(result.state, state); assert.equal(result.reason, reason); assert.equal(result.httpStatus, status); assert.equal(result.contentHash, null); assert.equal(fixture.calls.length, 1); assert.equal(fixture.destroyed, true);
  }
});

test('login walls, unsuitable bodies, compressed and oversized responses never become evidence', async () => {
  for (const fixture of [transport({ body: '<title>请登录</title>' + html }), transport({ body: '<input type="password">' + html }), transport({ headers: { 'content-type': 'application/json' } }), transport({ headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' } }), transport({ body: '<main>small</main>' }), transport({ body: html.replace('正文', '&#999999999999;') }), transport({ body: 'x'.repeat(2 * 1024 * 1024 + 1) })]) {
    const result = await run(catalog(), fixture); assert.equal(result.state, 'unknown'); assert.equal(result.contentHash, null); assert.equal(fixture.destroyed, true);
  }
});

test('timeout spans DNS and body and cancellation destroys active request', async () => {
  const dns = await run(catalog(), { lookup: () => new Promise(() => {}), request: () => assert.fail('late request') }, { timeoutMs: 5 }); assert.equal(dns.reason, 'timeout');
  const fixture = transport({ hold: true }); assert.equal((await run(catalog(), fixture, { timeoutMs: 5 })).reason, 'timeout'); assert.equal(fixture.destroyed, true);
  const controller = new AbortController(); controller.abort();
  const canceled = await run(catalog(), { lookup: () => assert.fail('DNS') }, { signal: controller.signal }); assert.equal(canceled.reason, 'network');
  const failed = await run(catalog(), { lookup: async () => { throw new Error('secret'); } }); assert.equal(failed.reason, 'network'); assert.ok(!JSON.stringify(failed).includes('secret'));
});

test('dedicated DNS resolver cancellation releases both queries on timeout or abort', async () => {
  const controller = new AbortController(); const pending = []; let canceled = 0;
  const resolver = { resolve4: () => new Promise((_, reject) => pending.push(reject)), resolve6: () => new Promise((_, reject) => pending.push(reject)), cancel: () => { canceled++; for (const reject of pending) reject(Object.assign(new Error('canceled'), { code: 'ECANCELLED' })); } };
  const operation = resolveOfficialAddresses('developers.weixin.qq.com', { signal: controller.signal, resolver }); controller.abort();
  await assert.rejects(operation, /canceled/); assert.ok(canceled > 0);
  const found = await resolveOfficialAddresses('developers.weixin.qq.com', { resolver: { resolve4: async () => ['8.8.8.8'], resolve6: async () => { throw Object.assign(new Error(), { code: 'ENODATA' }); }, cancel() {} } });
  assert.deepEqual(found, [{ address: '8.8.8.8', family: 4 }]);
});

test('partial responses and active cancellation never retain a content hash', async () => {
  let release, destroyed = false;
  let signalReady;
  const ready = new Promise((resolveReady) => { signalReady = resolveReady; });
  const fixture = { lookup: async () => [{ address: '8.8.8.8', family: 4 }], request: (_url, _options, callback) => {
    const req = new EventEmitter(); req.destroy = () => { destroyed = true; };
    req.end = () => {
      const response = new Readable({ read() {} }); response.statusCode = 200; response.headers = { 'content-type': 'text/html' };
      callback(response); response.push(Buffer.from(html)); release = () => response.emit('aborted'); signalReady();
    }; return req;
  } };
  const checking = run(catalog(), fixture);
  await ready;
  release(); const partial = await checking;
  assert.equal(partial.state, 'unknown'); assert.equal(partial.reason, 'network'); assert.equal(partial.contentHash, null); assert.equal(destroyed, true);
  const controller = new AbortController(); const hold = transport({ hold: true });
  let requestReady;
  const started = new Promise((resolveReady) => { requestReady = resolveReady; });
  const canceled = run(catalog(), { ...hold, request: (...args) => { const req = hold.request(...args); requestReady(); return req; } }, { signal: controller.signal });
  await started; controller.abort();
  assert.equal((await canceled).contentHash, null); assert.equal(hold.destroyed, true);
});
