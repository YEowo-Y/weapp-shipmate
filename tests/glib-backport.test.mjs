import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGlibBackport } from '../scripts/verify-glib-backport.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('glib backport keeps the published crate and resolves the exact upstream fix', () => {
  assert.equal(verifyGlibBackport().files, 121);
});

test('glib provenance gate rejects missing fix, unrelated drift and registry fallback', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'shipmate-glib-provenance-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const path of ['desktop/security/glib-backport', 'desktop/src-tauri/vendor/glib', 'desktop/src-tauri/Cargo.toml', 'desktop/src-tauri/Cargo.lock']) {
    cpSync(join(root, path), join(fixture, path), { recursive: true });
  }
  const variantFile = join(fixture, 'desktop/src-tauri/vendor/glib/src/variant_iter.rs');
  const variant = readFileSync(variantFile, 'utf8');
  writeFileSync(variantFile, variant.replace('                &mut p,', '                &p,'));
  assert.throws(() => verifyGlibBackport(fixture), /Upstream fix missing/);
  writeFileSync(variantFile, variant + '\n// unrelated modification\n');
  assert.throws(() => verifyGlibBackport(fixture), /Upstream source drift/);
  writeFileSync(variantFile, variant);
  const lockFile = join(fixture, 'desktop/src-tauri/Cargo.lock');
  writeFileSync(lockFile, readFileSync(lockFile, 'utf8').replace('name = "glib"', 'name = "glib"\nsource = "registry+https://github.com/rust-lang/crates.io-index"'));
  assert.throws(() => verifyGlibBackport(fixture), /local backport/);
});
