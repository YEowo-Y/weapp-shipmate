import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { bundleBudget, measureBundle, STARTUP_LIMITS } from '../desktop/scripts/bundle-budget.mjs';

function chunk(fileName, { code = 'export {};', imports = [], isEntry = false, modules = {} } = {}) {
  return { type: 'chunk', fileName, code, imports, isEntry, modules };
}
function bundle() {
  return {
    'main.js': chunk('main.js', { isEntry: true, imports: ['shared.js'] }),
    'shared.js': chunk('shared.js'),
    'settings.js': chunk('settings.js', { modules: { 'D:\\repo\\desktop\\src\\settings\\settings-renderer.ts': {} } }),
    'app.css': { type: 'asset', fileName: 'app.css', source: 'body {}' },
  };
}

test('startup includes transitive static imports once, excluding deferred chunks and assets', () => {
  const input = bundle();
  input['main.js'].code = '你好';
  input['shared.js'].imports = ['main.js']; // Cycles must terminate.
  input['second.js'] = chunk('second.js', { isEntry: true, imports: ['shared.js'] });
  input['settings.js'].code = 'x'.repeat(STARTUP_LIMITS.bytes + 1);
  const report = measureBundle(input);
  assert.deepEqual(report.errors, []);
  const startup = ['main.js', 'shared.js', 'second.js'].map(name => input[name].code);
  assert.equal(report.startup.bytes, startup.reduce((sum, code) => sum + Buffer.byteLength(code), 0));
  assert.equal(report.startup.gzipBytes, startup.reduce((sum, code) => sum + gzipSync(code).length, 0));
  assert.equal(report.chunks.find(item => item.file === 'settings.js').startup, false);
  assert.equal(report.chunks.length, 4);
});

test('moving oversized code into a static shared chunk still fails the raw budget', () => {
  const input = bundle();
  input['shared.js'].code = 'x'.repeat(STARTUP_LIMITS.bytes);
  assert.match(measureBundle(input).errors.join('\n'), /Startup bytes:.*exceeds 750000/);
});

test('compressed startup has its own budget', () => {
  const input = bundle();
  input['shared.js'].code = randomBytes(300_000).toString('base64');
  const report = measureBundle(input);
  assert.ok(report.startup.bytes < STARTUP_LIMITS.bytes);
  assert.match(report.errors.join('\n'), /Startup gzipBytes:.*exceeds 250000/);
});

test('eager settings rendering fails even when the bundle is small', () => {
  const input = bundle();
  input['shared.js'].imports = ['settings.js'];
  assert.match(measureBundle(input).errors.join('\n'), /Settings renderer must stay outside startup imports/);
});

test('missing entry, settings module or static dependency fails instead of undercounting', () => {
  assert.match(measureBundle({}).errors.join('\n'), /No JavaScript entry/);
  const input = bundle();
  delete input['settings.js'];
  assert.match(measureBundle(input).errors.join('\n'), /Settings renderer chunk is missing/);
  input['shared.js'].imports = ['missing.js'];
  assert.match(measureBundle(input).errors.join('\n'), /Unmeasured startup dependency: missing.js/);
});

test('build plugin emits a machine-readable report and fails the build on regressions', () => {
  const plugin = bundleBudget();
  const output = [];
  const context = { emitFile: asset => output.push(asset), error: message => { throw new Error(message); } };
  plugin.generateBundle.handler.call(context, {}, bundle());
  assert.equal(output[0].fileName, '.vite/bundle-budget.json');
  assert.deepEqual(JSON.parse(output[0].source).errors, []);
  assert.throws(() => plugin.generateBundle.handler.call(context, {}, {}), /No JavaScript entry/);
  assert.equal(output.length, 1);
});

test('Vite integration measures final emitted bytes after preload and other bundle rewrites', async () => {
  const { build } = await import('../desktop/node_modules/vite/dist/node/index.js');
  const entry = 'virtual:entry';
  const settings = 'virtual:/src/settings/settings-renderer.ts';
  const result = await build({
    configFile: false, logLevel: 'silent', publicDir: false,
    plugins: [bundleBudget(), {
      name: 'budget-fixture',
      resolveId: id => id.startsWith('virtual:') ? id : null,
      load: id => id === entry ? `export const open = () => import('${settings}');` : id === settings ? 'export const render = () => "settings";' : null,
      generateBundle(_options, output) {
        for (const item of Object.values(output)) {
          if (item.type === 'chunk') item.code += '\n// final rewrite';
        }
      },
    }],
    build: { write: false, rollupOptions: { input: entry, preserveEntrySignatures: 'strict' } },
  });
  const report = JSON.parse(result.output.find(item => item.fileName === '.vite/bundle-budget.json').source);
  for (const item of report.chunks) {
    const emitted = result.output.find(chunk => chunk.fileName === item.file);
    assert.equal(item.bytes, Buffer.byteLength(emitted.code));
    assert.equal(item.gzipBytes, gzipSync(emitted.code).length);
  }
  assert.equal(report.chunks.filter(item => item.startup).length, 1);
  assert.deepEqual(report.errors, []);
});
