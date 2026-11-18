import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleBudget, measureBundle, STARTUP_LIMITS } from '../desktop/scripts/bundle-budget.mjs';

const deferredModules = {
  'settings.js': 'desktop/src/settings/settings-renderer.ts',
  'right-panel.js': 'desktop/src/shell/right-panel-renderer.tsx',
  'explain.js': 'desktop/src/explain-dialog.ts',
  'handoff.js': 'desktop/src/repair-handoff.ts',
  'sources.js': 'desktop/src/source-freshness.ts',
  'materials.js': 'desktop/src/submission-materials-dialog.tsx',
  'guide.js': 'desktop/src/shared/guide-transport.js',
};

function chunk(fileName, { code = 'export {};', imports = [], isEntry = false, modules = {} } = {}) {
  return { type: 'chunk', fileName, code, imports, isEntry, modules };
}
function bundle() {
  const deferredChunks = Object.entries(deferredModules).map(([file, path]) => {
    const id = `D:/repo/${path}`.replaceAll('/', '\\');
    return [file, chunk(file, { modules: { [id]: {} } })];
  });
  return {
    'main.js': chunk('main.js', { isEntry: true, imports: ['shared.js'] }),
    'shared.js': chunk('shared.js'),
    ...Object.fromEntries(deferredChunks),
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
  assert.equal(report.chunks.length, startup.length + Object.keys(deferredModules).length);
});

test('moving oversized code into a static shared chunk still fails the raw budget', () => {
  const input = bundle();
  input['shared.js'].code = 'x'.repeat(STARTUP_LIMITS.bytes);
  const id = fileURLToPath(new URL('../desktop/src/shared/conversation.js', import.meta.url)).replaceAll('/', '\\');
  input['shared.js'].modules[id] = { renderedLength: STARTUP_LIMITS.bytes };
  const report = measureBundle(input);
  assert.deepEqual(report.startupModules, [{ path: 'desktop/src/shared/conversation.js', renderedLength: STARTUP_LIMITS.bytes }]);
  const errors = report.errors.join('\n');
  assert.match(errors, /Startup bytes:.*exceeds 750000/);
  assert.match(errors, /desktop\/src\/shared\/conversation\.js/);
  assert.ok(!errors.includes(id));
});

test('overage names a smaller module added to startup and reports portable paths', () => {
  const input = bundle();
  const ordinaryRoot = fileURLToPath(new URL('../desktop/src/', import.meta.url)).replaceAll('\\', '/');
  const mixedCaseRoot = process.platform === 'win32' ? ordinaryRoot.toLowerCase() : ordinaryRoot;
  const existing = Array.from({ length: 6 }, (_, index) => [`${ordinaryRoot}existing-${index}.js`, { renderedLength: 120_000 }]);
  const newModule = 'desktop/src/new-startup-module.js';
  input['main.js'].code = 'x'.repeat(720_000);
  input['main.js'].modules = Object.fromEntries(existing);
  input['shared.js'].code = 'x'.repeat(30_001);
  input['shared.js'].modules = {
    [`${mixedCaseRoot}new-startup-module.js`]: { renderedLength: 30_001 },
    [fileURLToPath(new URL('../../outside-checkout.js', import.meta.url))]: { renderedLength: 100 },
  };

  const report = measureBundle(input);
  assert.equal(report.startup.bytes, STARTUP_LIMITS.bytes + 1);
  assert.equal(report.startupModules.length, 7);
  assert.deepEqual(report.startupModules.at(-1), { path: newModule, renderedLength: 30_001 });
  assert.ok(report.errors.join('\n').includes('30001  desktop/src/new-startup-module.js'));
});

test('compressed startup has its own budget', () => {
  const input = bundle();
  input['shared.js'].code = randomBytes(300_000).toString('base64');
  const report = measureBundle(input);
  assert.ok(report.startup.bytes < STARTUP_LIMITS.bytes);
  assert.match(report.errors.join('\n'), /Startup gzipBytes:.*exceeds 250000/);
});

test('eagerly importing any deferred module fails even below both size limits', () => {
  for (const [file, path] of Object.entries(deferredModules)) {
    const input = bundle();
    input['shared.js'].imports = [file];
    const { startup, errors } = measureBundle(input);
    assert.ok(startup.bytes < STARTUP_LIMITS.bytes);
    assert.ok(startup.gzipBytes < STARTUP_LIMITS.gzipBytes);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes(path), `expected an error naming ${path}`);
    assert.match(errors[0], /must stay outside startup imports/);
  }
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
  const routes = Object.values(deferredModules).map(path => `virtual:/${path}`);
  const result = await build({
    configFile: false, logLevel: 'silent', publicDir: false,
    plugins: [bundleBudget(), {
      name: 'budget-fixture',
      resolveId: id => id.startsWith('virtual:') ? id : null,
      load(id) {
        if (id === entry) return `export const open = [${routes.map(route => `() => import('${route}')`).join(', ')}];`;
        return routes.includes(id) ? 'export const render = () => "deferred";' : null;
      },
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
