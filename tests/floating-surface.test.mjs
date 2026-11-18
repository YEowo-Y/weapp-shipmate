import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';

const source = readFileSync(new URL('../desktop/src/shared/components/floating-surface.js', import.meta.url), 'utf8');
function harness() {
  const pending = []; let update; let cleaned = 0; const errors = []; const positioned = [];
  const context = vm.createContext({
    computePosition: (anchor, menu, options) => new Promise((resolve, reject) => pending.push({ resolve, reject, options })),
    autoUpdate: (anchor, menu, callback) => { update = callback; callback(); return () => { cleaned++; }; },
    offset: value => ({ name: 'offset', options: value }),
    flip: value => ({ name: 'flip', options: value }),
    shift: value => ({ name: 'shift', options: value }),
    size: value => ({ name: 'size', options: value }),
  });
  vm.runInContext(source.replace(/^import[^;]+;\s*/m, '').replace('export function', 'function'), context);
  const menu = { style: {} };
  const cleanup = context.attachFloatingSurface({}, menu, { matchWidth: true, onError: error => errors.push(error), onPositioned: result => positioned.push({ result, style: { ...menu.style } }) });
  return { pending, menu, cleanup, errors, positioned, update: () => update(), get cleaned() { return cleaned; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('position callback runs after coordinates are written, only for live current updates', async () => {
  const app = harness(); app.update();
  const result = { x: 25, y: 35, placement: 'top-end' };
  app.pending[1].resolve(result); await tick();
  assert.equal(app.positioned.length, 1);
  assert.equal(app.positioned[0].result, result);
  assert.deepEqual(app.positioned[0].style, { left: '25px', top: '35px' });
  app.pending[0].resolve({ x: 80, y: 90 }); await tick();
  assert.equal(app.positioned.length, 1, 'Superseded results do not invoke callbacks');
  app.update(); app.cleanup();
  app.pending[2].resolve({ x: 100, y: 100 }); await tick();
  assert.equal(app.positioned.length, 1, 'Cleanup blocks callbacks');
});
test('adapter uses collision middleware and bounds size to available geometry', async () => {
  const app = harness();
  const options = app.pending[0].options;
  assert.equal(options.strategy, 'fixed');
  assert.equal(options.placement, 'bottom-end');
  assert.deepEqual(Array.from(options.middleware, item => item.name), ['offset', 'flip', 'shift', 'size']);
  options.middleware.at(-1).options.apply({ availableWidth: 180, availableHeight: 800, rects: { reference: { width: 240 } } });
  assert.equal(app.menu.style.width, '180px');
  assert.equal(app.menu.style.maxWidth, '180px');
  assert.equal(app.menu.style.maxHeight, '480px');
  app.pending[0].resolve({ x: 12, y: 40 }); await tick();
  assert.equal(app.menu.style.left, '12px'); assert.equal(app.menu.style.top, '40px');
  app.cleanup();
});
test('superseded computations and size effects cannot overwrite the current surface', async () => {
  const app = harness(); app.update();
  app.pending[1].resolve({ x: 20, y: 30 }); await tick();
  app.pending[0].options.middleware.at(-1).options.apply({ availableWidth: 1, availableHeight: 1, rects: { reference: { width: 1 } } });
  app.pending[0].resolve({ x: 99, y: 99 }); await tick();
  assert.equal(app.menu.style.left, '20px'); assert.equal(app.menu.style.maxWidth, undefined);
  app.cleanup();
});
test('cleanup is idempotent and blocks late writes and errors', async () => {
  const app = harness(); app.cleanup(); app.cleanup();
  app.pending[0].options.middleware.at(-1).options.apply({ availableWidth: 1, availableHeight: 1, rects: { reference: { width: 1 } } });
  app.pending[0].reject(new Error('late')); await tick();
  assert.equal(app.cleaned, 1); assert.equal(Object.keys(app.menu.style).length, 0); assert.equal(app.errors.length, 0);
});
test('current computation failure reports once and stale failures do not report', async () => {
  const app = harness(); app.update();
  app.pending[0].reject(new Error('stale')); app.pending[1].reject(new Error('current')); await tick();
  assert.equal(app.errors.length, 1); assert.equal(app.errors[0].message, 'current'); app.cleanup();
});

async function geometry({ reference, floating, viewport }) {
  const { computePosition, offset, flip, shift, size } = await import('../desktop/src/shared/components/vendor/floating-ui/floating-ui.core.mjs');
  const dimensions = { ...floating }; const effects = [];
  const platform = {
    getElementRects: () => ({ reference, floating: { x: 0, y: 0, ...dimensions } }),
    getClippingRect: () => ({ x: 0, y: 0, width: viewport.width, height: viewport.height }),
    getDimensions: () => dimensions,
    isElement: () => false,
    getDocumentElement: () => ({}),
  };
  const result = await computePosition({}, {}, { placement: 'bottom-end', strategy: 'fixed', platform,
    middleware: [offset(7), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply({ availableWidth, availableHeight }) {
      effects.push({ availableWidth, availableHeight });
      dimensions.width = Math.max(0, Math.min(floating.width, availableWidth));
      dimensions.height = Math.max(0, Math.min(floating.height, 480, availableHeight));
    } })],
  });
  return { ...result, dimensions, effects };
}
test('real Floating UI core flips away from the bottom viewport boundary', async () => {
  const result = await geometry({ reference: { x: 100, y: 260, width: 80, height: 28 }, floating: { width: 180, height: 100 }, viewport: { width: 320, height: 300 } });
  assert.equal(result.placement, 'top-start', 'Flip also resolves the left-edge alignment collision');
  assert.ok(result.x >= 12); assert.ok(result.y >= 12);
  assert.ok(result.y + result.dimensions.height <= 288);
});
test('real core clamps oversized content and recomputes after a viewport resize', async () => {
  const config = { reference: { x: 4, y: 70, width: 100, height: 28 }, floating: { width: 600, height: 700 } };
  const wide = await geometry({ ...config, viewport: { width: 800, height: 900 } });
  const narrow = await geometry({ ...config, viewport: { width: 280, height: 300 } });
  assert.ok(wide.dimensions.height <= 480);
  assert.ok(narrow.dimensions.width <= 256);
  assert.ok(narrow.dimensions.height < wide.dimensions.height);
  assert.ok(narrow.x >= 12); assert.ok(narrow.x + narrow.dimensions.width <= 268);
  assert.ok(narrow.y >= 12); assert.ok(narrow.y + narrow.dimensions.height <= 288);
});
test('vendored release bytes match provenance and only module specifiers were changed', async () => {
  const { createHash } = await import('node:crypto');
  const base = new URL('../desktop/src/shared/components/vendor/floating-ui/', import.meta.url);
  const records = JSON.parse(readFileSync(new URL('provenance.json', base), 'utf8'));
  assert.deepEqual(records.map(record => [record.package, record.version]), [['@floating-ui/dom', '1.8.0'], ['@floating-ui/core', '1.8.0'], ['@floating-ui/utils', '0.2.12']]);
  for (const record of records) {
    assert.equal(record.license, 'MIT'); assert.match(record.integrity, /^sha512-/);
    assert.ok(record.tarballUrl.startsWith('https://registry.npmjs.org/'));
    for (const asset of record.assets) {
      const local = readFileSync(new URL(asset.file, base), 'utf8');
      assert.equal(createHash('sha256').update(local).digest('hex'), asset.localSha256, asset.file);
      const original = local.replaceAll("'./floating-ui.utils.dom.mjs'", "'@floating-ui/utils/dom'").replaceAll("'./floating-ui.utils.mjs'", "'@floating-ui/utils'").replaceAll("'./floating-ui.core.mjs'", "'@floating-ui/core'");
      assert.equal(createHash('sha256').update(original).digest('hex'), asset.originalSha256, asset.file);
      if (asset.file.endsWith('-LICENSE')) assert.match(local, /Permission is hereby granted/);
    }
  }
});
