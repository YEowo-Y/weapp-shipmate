// Path dependencies can disappear from lockfile scanners. Query the original
// registry identity explicitly; only the independently verified backport is known.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyGlibBackport } from './verify-glib-backport.mjs';

const endpoint = 'https://api.osv.dev/v1/query';
const knownIds = new Set(['RUSTSEC-2024-0429', 'GHSA-wrw7-89jp-8q8g']);
const query = { package: { name: 'glib', ecosystem: 'crates.io' }, version: '0.18.5' };

// OSV names the Rust ecosystem "crates.io", not "Cargo".
// Contract: https://google.github.io/osv.dev/post-v1-query/
export async function checkGlibAdvisories({ fetchImpl = fetch, verify = verifyGlibBackport } = {}) {
  verify();
  const reviewed = new Set();
  const unknown = new Set();
  const tokens = new Set();
  let token;
  for (let page = 0; page < 20; page++) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...query, ...(token ? { page_token: token } : {}) }),
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    assert(response.ok, `OSV unavailable: HTTP ${response.status}`);
    const data = await response.json();
    assert(data && typeof data === 'object' && !Array.isArray(data), 'Malformed OSV response');
    assert(!('error' in data), 'OSV returned an error');
    assert(data.vulns === undefined || Array.isArray(data.vulns), 'Malformed OSV vulnerabilities');
    assert(data.next_page_token === undefined || typeof data.next_page_token === 'string', 'Malformed OSV pagination');
    for (const advisory of data.vulns ?? []) {
      assert(advisory && typeof advisory.id === 'string' && advisory.id.length > 0, 'Malformed OSV advisory identity');
      assert(Array.isArray(advisory.affected) && advisory.affected.some(entry => entry?.package?.name === 'glib' && entry.package.ecosystem === 'crates.io'), `Unexpected OSV package: ${advisory.id}`);
      assert(advisory.aliases === undefined || (Array.isArray(advisory.aliases) && advisory.aliases.every(alias => typeof alias === 'string')), 'Malformed OSV aliases');
      // Deliberately do not allow an unfamiliar ID merely because it has a known
      // alias. A new identity requires human review, even for a possible duplicate.
      (knownIds.has(advisory.id) ? reviewed : unknown).add(advisory.id);
    }
    token = data.next_page_token;
    if (!token) {
      assert.equal(unknown.size, 0, `Unreviewed glib 0.18.5 advisories: ${[...unknown].sort().join(', ')}`);
      assert(reviewed.size > 0, 'OSV known advisory baseline missing for glib 0.18.5; review the registry response');
      return { package: query.package.name, version: query.version, sourceBackported: [...reviewed].sort() };
    }
    assert(!tokens.has(token), 'OSV repeated a pagination token');
    tokens.add(token);
  }
  throw new Error('OSV pagination limit reached; results are incomplete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkGlibAdvisories();
    console.log(JSON.stringify(result));
    console.log('Original registry version checked; listed advisories are source-backported, not dismissed. Local provenance verified. This does not certify absence of undisclosed vulnerabilities.');
  } catch (error) {
    console.error(`glib advisory check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
