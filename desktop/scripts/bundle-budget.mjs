// @ts-check
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// 2026-11-07 baseline: 708,345 bytes / 232,895 gzip bytes. Count the entire
// static import closure so moving code to a shared chunk cannot hide growth.
export const STARTUP_LIMITS = Object.freeze({ bytes: 750_000, gzipBytes: 250_000 });
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const deferredModules = [
  ['Settings renderer', 'desktop/src/settings/settings-renderer.ts'],
  ['Right panel', 'desktop/src/shell/right-panel-renderer.tsx'],
  ['Explanation dialog', 'desktop/src/explain-dialog.ts'],
  ['Repair handoff', 'desktop/src/repair-handoff.ts'],
  ['Source freshness', 'desktop/src/source-freshness.ts'],
  ['Submission materials dialog', 'desktop/src/submission-materials-dialog.tsx'],
  ['Guide transport', 'desktop/src/shared/guide-transport.js'],
];

/** @param {import('vite').Rollup.OutputBundle} bundle */
export function measureBundle(bundle) {
  const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
  const byFile = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const startup = new Set();
  const errors = [];
  /** @param {import('vite').Rollup.OutputChunk} chunk */
  function visit(chunk) {
    if (startup.has(chunk.fileName)) return;
    startup.add(chunk.fileName);
    for (const file of chunk.imports) {
      const dependency = byFile.get(file);
      if (dependency) visit(dependency);
      else errors.push(`Unmeasured startup dependency: ${file}`);
    }
  }
  const entries = chunks.filter(chunk => chunk.isEntry);
  if (!entries.length) errors.push('No JavaScript entry chunk found.');
  entries.forEach(visit);

  const modules = chunks.flatMap(chunk => Object.entries(chunk.modules).map(([id, module]) => ({
    id: id.replaceAll('\\', '/').split('?', 1)[0],
    renderedLength: module.renderedLength,
    startup: startup.has(chunk.fileName),
  })));
  for (const [name, path] of deferredModules) {
    const matches = modules.filter(module => module.id === path || module.id.endsWith(`/${path}`));
    if (!matches.length) errors.push(`${name} chunk is missing (${path}).`);
    else if (matches.some(module => module.startup)) errors.push(`${name} must stay outside startup imports (${path}).`);
  }

  const sizes = chunks.map(chunk => ({
    file: chunk.fileName,
    bytes: Buffer.byteLength(chunk.code),
    gzipBytes: gzipSync(chunk.code).length,
    startup: startup.has(chunk.fileName),
  })).sort((a, b) => a.file.localeCompare(b.file));
  const total = sizes.filter(chunk => chunk.startup).reduce((sum, chunk) => ({
    bytes: sum.bytes + chunk.bytes, gzipBytes: sum.gzipBytes + chunk.gzipBytes,
  }), { bytes: 0, gzipBytes: 0 });
  // Rollup provides per-module rendered lengths. Only the emitted chunks above give final byte counts.
  const startupModules = modules
    .filter(module => module.startup && module.renderedLength > 0 && isAbsolute(module.id))
    .map(module => ({ path: relative(repoRoot, module.id).replaceAll('\\', '/'), renderedLength: module.renderedLength }))
    .filter(module => module.path && !isAbsolute(module.path) && module.path !== '..' && !module.path.startsWith('../'))
    .sort((a, b) => b.renderedLength - a.renderedLength || a.path.localeCompare(b.path));
  const exceeded = /** @type {const} */ (['bytes', 'gzipBytes']).filter(unit => total[unit] > STARTUP_LIMITS[unit]);
  for (const unit of exceeded) errors.push(`Startup ${unit}: ${total[unit]} exceeds ${STARTUP_LIMITS[unit]}.`);
  if (exceeded.length && startupModules.length) {
    const inventory = startupModules.map(module => `  ${module.renderedLength}  ${module.path}`).join('\n');
    errors.push(`Startup modules by rendered length\n${inventory}`);
  }
  return { startup: total, limits: STARTUP_LIMITS, chunks: sizes, startupModules, errors };
}

/** @returns {import('vite').Plugin} */
export function bundleBudget() {
  return {
    name: 'shipmate-bundle-budget',
    apply: /** @type {'build'} */ ('build'),
    generateBundle: {
      // Vite rewrites preload references in generateBundle; measure afterwards.
      order: /** @type {'post'} */ ('post'),
      handler(_options, bundle) {
        const report = measureBundle(bundle);
        if (report.errors.length) this.error(report.errors.join('\n'));
        this.emitFile({ type: 'asset', fileName: '.vite/bundle-budget.json', source: JSON.stringify(report, null, 2) + '\n' });
      },
    },
  };
}
