import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGlibAdvisories } from '../scripts/check-glib-advisories.mjs';

const advisory = id => ({ id, affected: [{ package: { name: 'glib', ecosystem: 'crates.io' } }] });
const response = data => ({ ok: true, json: async () => data });
const verify = () => {};

test('glib monitor verifies provenance before querying the original registry identity across pages', async () => {
  let verified = false;
  const requests = [];
  const result = await checkGlibAdvisories({
    verify: () => { verified = true; },
    fetchImpl: async (url, options) => {
      assert(verified);
      assert.equal(url, 'https://api.osv.dev/v1/query');
      assert.equal(options.method, 'POST');
      assert(options.signal);
      requests.push(JSON.parse(options.body));
      return response(requests.length === 1
        ? { vulns: [advisory('RUSTSEC-2024-0429')], next_page_token: 'page-2' }
        : { vulns: [advisory('GHSA-wrw7-89jp-8q8g')] });
    },
  });
  assert.deepEqual(requests, [
    { package: { name: 'glib', ecosystem: 'crates.io' }, version: '0.18.5' },
    { package: { name: 'glib', ecosystem: 'crates.io' }, version: '0.18.5', page_token: 'page-2' },
  ]);
  assert.deepEqual(result.sourceBackported, ['GHSA-wrw7-89jp-8q8g', 'RUSTSEC-2024-0429']);
});

test('glib monitor fails before network access when source verification fails', async () => {
  await assert.rejects(checkGlibAdvisories({
    verify: () => { throw new Error('source drift'); },
    fetchImpl: () => assert.fail('must not query with an unverified backport'),
  }), /source drift/);
});

test('glib monitor refuses new IDs even when they alias the reviewed advisory', async () => {
  await assert.rejects(checkGlibAdvisories({ verify, fetchImpl: async () => response({
    vulns: [{ ...advisory('RUSTSEC-2099-0001'), aliases: ['GHSA-wrw7-89jp-8q8g'] }],
  }) }), /Unreviewed glib 0.18.5 advisories: RUSTSEC-2099-0001/);
});

test('glib monitor requires review when the known registry baseline disappears', async () => {
  await assert.rejects(checkGlibAdvisories({ verify, fetchImpl: async () => response({}) }), /known advisory baseline missing/);
});

test('glib monitor continues through an empty intermediate page', async () => {
  let page = 0;
  const result = await checkGlibAdvisories({ verify, fetchImpl: async () => response(++page === 1
    ? { next_page_token: 'next' }
    : { vulns: [advisory('RUSTSEC-2024-0429')] }) });
  assert.deepEqual(result.sourceBackported, ['RUSTSEC-2024-0429']);
});

test('glib monitor fails closed on outages, invalid JSON, malformed records and incomplete pagination', async () => {
  const cases = [
    async () => { throw new Error('network unavailable'); },
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }),
    async () => response(null),
    async () => response([]),
    async () => response({ error: 'service error' }),
    async () => response({ vulns: {} }),
    async () => response({ vulns: [null] }),
    async () => response({ vulns: [{ id: 'RUSTSEC-2024-0429' }] }),
    async () => response({ vulns: [{ ...advisory('RUSTSEC-2024-0429'), aliases: [null] }] }),
    async () => response({ next_page_token: 123 }),
    async () => response({ next_page_token: 'repeat' }),
  ];
  for (const fetchImpl of cases) await assert.rejects(checkGlibAdvisories({ verify, fetchImpl }));
  let page = 0;
  await assert.rejects(checkGlibAdvisories({ verify, fetchImpl: async () => response({ next_page_token: `page-${++page}` }) }), /results are incomplete/);
});
