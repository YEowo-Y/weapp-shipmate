// Keep the vendored crate byte-identical to its published source, except for
// the two upstream lines fixing RUSTSEC-2024-0429. No third-party parser needed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const upstreamLines = [
  ['let p: *mut libc::c_char = std::ptr::null_mut();', 'let mut p: *mut libc::c_char = std::ptr::null_mut();'],
  ['                &p,', '                &mut p,'],
];

export function verifyGlibBackport(projectRoot = root) {
  const provenance = JSON.parse(readFileSync(join(projectRoot, 'desktop/security/glib-backport/provenance.json'), 'utf8'));
  assert.equal(provenance.package, 'glib');
  assert.equal(provenance.version, '0.18.5');
  assert.equal(provenance.archive.sha256, '233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5');
  assert.equal(provenance.fixCommit, 'b5a4071e439bef2b5eea76c3aa25e5ae84839e34');
  const vendor = join(projectRoot, 'desktop/src-tauri/vendor/glib');
  const files = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      assert(!entry.isSymbolicLink(), `Unexpected vendor link: ${relative}`);
      if (entry.isDirectory()) visit(join(directory, entry.name), relative + '/');
      else {
        assert(entry.isFile(), `Unexpected vendor file type: ${relative}`);
        files.push(relative);
      }
    }
  }
  visit(vendor);
  assert.deepEqual(files.sort(), Object.keys(provenance.files).sort(), 'Vendored file inventory changed');
  for (const file of files) {
    let bytes = readFileSync(join(vendor, file));
    if (file === 'src/variant_iter.rs') {
      let text = bytes.toString('utf8');
      for (const [before, after] of upstreamLines) {
        assert.equal(text.split(after).length - 1, 1, `Upstream fix missing or ambiguous: ${after}`);
        text = text.replace(after, before);
      }
      bytes = Buffer.from(text);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.files[file], `Upstream source drift: ${file}`);
  }
  const manifest = readFileSync(join(projectRoot, 'desktop/src-tauri/Cargo.toml'), 'utf8');
  assert.match(manifest, /\[patch\.crates-io\]\s*glib\s*=\s*\{\s*path\s*=\s*"vendor\/glib"\s*\}/);
  const lock = readFileSync(join(projectRoot, 'desktop/src-tauri/Cargo.lock'), 'utf8');
  const glibEntries = lock.split('[[package]]').filter(section => /^\s*name = "glib"\r?$/m.test(section));
  assert.equal(glibEntries.length, 1, 'Expected exactly one glib resolution');
  assert.match(glibEntries[0], /^version = "0\.18\.5"\r?$/m);
  assert.doesNotMatch(glibEntries[0], /^source\s*=/m, 'glib must resolve to the local backport');
  return { files: files.length, version: provenance.version, fix: provenance.fixCommit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = verifyGlibBackport();
  console.log(`Verified glib ${result.version}: ${result.files} original files, only the two upstream fix lines differ (${result.fix}).`);
}
