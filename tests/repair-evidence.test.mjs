import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repairEvidence } from '../src/repair-evidence.mjs';
function fixture(t) { const dir = mkdtempSync(join(tmpdir(), 'shipmate-repair-evidence-')); t.after(() => rmSync(dir, { recursive: true, force: true })); writeFileSync(join(dir, 'app.json'), '{"pages":[]}'); writeFileSync(join(dir, 'app.js'), 'wx.getLocation({}); // wx.choosePoi()\nconst label="wx.chooseAddress";'); return dir; }
test('native evidence reuses comment/string-aware scanner and hashes contents', t => {
  const dir = fixture(t), first = repairEvidence(dir);
  assert.deepEqual(first.missingApis, ['getLocation']);
  assert.deepEqual(first.evidence, [{ file: 'app.js', apis: ['getLocation'] }]);
  writeFileSync(join(dir, 'app.js'), 'wx.getLocation({type:"wgs84"});');
  assert.notEqual(repairEvidence(dir).fingerprint, first.fingerprint);
});
test('framework, nested roots, incomplete JSON and root redirection fail closed', t => {
  for (const [name, text] of [['manifest.json', '{}'], ['app.config.ts', 'export default {}'], ['view.vue', '<script>wx.getLocation()</script>'], ['project.config.json', '{"miniprogramRoot":"sub"}']]) {
    const dir = fixture(t); writeFileSync(join(dir, name), text); assert.throws(() => repairEvidence(dir));
  }
  const dir = fixture(t); mkdirSync(join(dir, 'sub')); writeFileSync(join(dir, 'sub/app.json'), '{}'); assert.throws(() => repairEvidence(dir));
  const bad = fixture(t); writeFileSync(join(bad, 'app.json'), '{'); assert.throws(() => repairEvidence(bad));
});
test('non-native API and empty result do not produce a writable plan', t => {
  const dir = fixture(t); writeFileSync(join(dir, 'app.js'), 'uni.getLocation({});'); assert.throws(() => repairEvidence(dir));
  writeFileSync(join(dir, 'app.js'), '// wx.getLocation()'); assert.throws(() => repairEvidence(dir));
});
