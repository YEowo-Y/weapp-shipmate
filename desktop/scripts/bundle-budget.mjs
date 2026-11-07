import { gzipSync } from 'node:zlib';

// 2026-11-07 baseline: 708,345 bytes / 232,895 gzip bytes. Count the entire
// static import closure so moving code to a shared chunk cannot hide growth.
export const STARTUP_LIMITS = Object.freeze({ bytes: 750_000, gzipBytes: 250_000 });
const settingsModule = '/src/settings/settings-renderer.ts';

export function measureBundle(bundle) {
  const chunks = Object.values(bundle).filter(item => item.type === 'chunk');
  const byFile = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
  const startup = new Set();
  const errors = [];
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
  const settings = chunks.filter(chunk => Object.keys(chunk.modules).some(id => id.replaceAll('\\', '/').endsWith(settingsModule)));
  if (!settings.length) errors.push('Settings renderer chunk is missing.');
  else if (settings.some(chunk => startup.has(chunk.fileName))) errors.push('Settings renderer must stay outside startup imports.');

  const sizes = chunks.map(chunk => ({
    file: chunk.fileName,
    bytes: Buffer.byteLength(chunk.code),
    gzipBytes: gzipSync(chunk.code).length,
    startup: startup.has(chunk.fileName),
  })).sort((a, b) => a.file.localeCompare(b.file));
  const total = sizes.filter(chunk => chunk.startup).reduce((sum, chunk) => ({
    bytes: sum.bytes + chunk.bytes, gzipBytes: sum.gzipBytes + chunk.gzipBytes,
  }), { bytes: 0, gzipBytes: 0 });
  for (const [unit, limit] of Object.entries(STARTUP_LIMITS)) {
    if (total[unit] > limit) errors.push(`Startup ${unit}: ${total[unit]} exceeds ${limit}.`);
  }
  return { startup: total, limits: STARTUP_LIMITS, chunks: sizes, errors };
}

export function bundleBudget() {
  return {
    name: 'shipmate-bundle-budget',
    apply: 'build',
    generateBundle: {
      // Vite rewrites preload references in generateBundle; measure afterwards.
      order: 'post',
      handler(_options, bundle) {
        const report = measureBundle(bundle);
        if (report.errors.length) this.error(report.errors.join('\n'));
        this.emitFile({ type: 'asset', fileName: '.vite/bundle-budget.json', source: JSON.stringify(report, null, 2) + '\n' });
      },
    },
  };
}
