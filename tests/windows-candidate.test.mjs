import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'verify-windows-candidate.ps1');
const candidate = process.env.SHIPMATE_WINDOWS_CANDIDATE || join(root, 'desktop', 'src-tauri', 'target', 'debug', 'desktop.exe');
const windows = process.platform === 'win32';
function invoke(...args) {
  const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, ...args], {
    cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true,
  });
  assert.ifError(result.error);
  return { status: result.status, report: JSON.parse(result.stdout.trim()), stderr: result.stderr };
}
function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), 'shipmate-candidate-'));
  t.after(() => {
    assert.equal(dirname(resolve(path)), resolve(tmpdir()));
    assert.match(path, /shipmate-candidate-/);
    rmSync(path, { recursive: true, force: true });
  });
  return path;
}

test('candidate rejects relative paths and directories without opening a binary', { skip: !windows }, () => {
  for (const path of ['desktop.exe', 'C:desktop.exe', root]) {
    const result = invoke('-FilePath', path);
    assert.equal(result.status, 1);
    assert.equal(result.report.ok, false);
    assert.equal(result.report.releaseReady, false);
    assert.match(result.report.error.code, /invalid_path|not_file/);
  }
});

test('candidate rejects bad metadata and unsupported or renamed text files', { skip: !windows }, t => {
  const path = temporary(t);
  const fake = join(path, 'fake.exe');
  writeFileSync(fake, 'not a Windows executable');
  for (const [args, code] of [
    [['-FilePath', fake], 'invalid_format'],
    [['-FilePath', fake, '-ExpectedSha256', 'bad'], 'invalid_hash'],
    [['-FilePath', fake, '-SourceCommit', 'main'], 'invalid_commit'],
    [['-FilePath', fake, '-SourceDirty', 'maybe'], 'invalid_dirty'],
  ]) {
    const result = invoke(...args);
    assert.equal(result.status, 1);
    assert.equal(result.report.error.code, code);
  }
  const text = join(path, 'candidate.txt');
  writeFileSync(text, 'text');
  assert.equal(invoke('-FilePath', text).report.error.code, 'unsupported_format');
});

test('candidate refuses output overwrite and relative output paths', { skip: !windows }, t => {
  const path = temporary(t);
  const fake = join(path, 'fake.exe');
  writeFileSync(fake, 'original');
  assert.equal(invoke('-FilePath', fake, '-OutputPath', fake).report.error.code, 'output_overwrite');
  const output = join(path, 'report.json');
  writeFileSync(output, 'existing report');
  assert.equal(invoke('-FilePath', fake, '-OutputPath', output).report.error.code, 'output_overwrite');
  assert.equal(readFileSync(fake, 'utf8'), 'original');
  assert.equal(readFileSync(output, 'utf8'), 'existing report');
  assert.equal(invoke('-FilePath', fake, '-OutputPath', 'report.json').report.error.code, 'invalid_output');
});

test('candidate inspects the actual debug EXE, preserves it and writes JSON evidence', {
  skip: !windows || !existsSync(candidate) ? 'requires Windows and an already-built candidate EXE' : false,
}, t => {
  const path = temporary(t);
  const hash = createHash('sha256').update(readFileSync(candidate)).digest('hex');
  const output = join(path, 'candidate.json');
  const result = invoke('-FilePath', candidate, '-ExpectedSha256', hash.toUpperCase(), '-SourceCommit', 'a'.repeat(40), '-SourceDirty', 'true', '-OutputPath', output);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.ok, true);
  assert.equal(result.report.sha256, hash);
  assert.equal(result.report.hashMatches, true);
  assert.equal(result.report.source.commit, 'a'.repeat(40));
  assert.equal(result.report.source.dirty, true);
  assert.equal(result.report.source.verifiedAgainstArtifact, false);
  assert.equal(result.report.releaseReady, false);
  assert.equal(result.report.fileFormat.header, 'PE');
  assert.match(result.report.authenticode.status, /^(Valid|NotSigned|HashMismatch|NotTrusted|UnknownError|NotSupportedFileFormat|Incompatible)$/);
  if (result.report.authenticode.status === 'NotSigned') assert.equal(result.report.authenticode.signer, null);
  assert.match(result.report.checkedAtUtc, /Z$/);
  assert.ok(result.report.sizeBytes > 0);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), result.report);
  assert.equal(createHash('sha256').update(readFileSync(candidate)).digest('hex'), hash);
  const mismatch = invoke('-FilePath', candidate, '-ExpectedSha256', '0'.repeat(64));
  assert.equal(mismatch.status, 2);
  assert.equal(mismatch.report.ok, false);
  assert.equal(mismatch.report.hashMatches, false);
  assert.equal(mismatch.report.sha256, hash);
  assert.equal(mismatch.report.error.code, 'hash_mismatch');
});
