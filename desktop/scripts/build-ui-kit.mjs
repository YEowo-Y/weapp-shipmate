import { build } from 'vite';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'design-previews/components/vendor/web-awesome');
const packageRoots = new Set();
await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [{
    name: 'ui-kit-license-inventory',
    async generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const moduleId of Object.keys(chunk.modules)) {
          const match = moduleId.replaceAll('\\', '/').match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)/);
          if (match) packageRoots.add(match[1]);
        }
      }
    },
  }],
  build: {
    outDir,
    emptyOutDir: false,
    minify: 'esbuild',
    cssCodeSplit: false,
    lib: { entry: join(root, 'scripts/ui-kit-entry.js'), formats: ['es'], fileName: () => 'web-awesome.js', cssFileName: 'web-awesome' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const packages = [];
const notices = [];
for (const directory of [...packageRoots].sort()) {
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const licenseNames = (await readdir(directory)).filter(name => /^licen[cs]e(?:\..*)?$/i.test(name));
  if (!licenseNames.length) throw new Error(`Missing bundled license: ${pkg.name}`);
  const license = await readFile(join(directory, licenseNames[0]), 'utf8');
  notices.push(`${pkg.name}@${pkg.version} (${pkg.license})\n${license}`);
  packages.push({ name: pkg.name, version: pkg.version, license: pkg.license });
}
await writeFile(join(outDir, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n--------------------\n\n'));
const files = [];
for (const name of ['web-awesome.js', 'web-awesome.css', 'THIRD-PARTY-NOTICES.txt']) {
  const bytes = await readFile(join(outDir, name));
  files.push({ file: name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify({
  package: '@awesome.me/webawesome', version: '3.14.0', license: 'MIT',
  commit: '201e49fdb9359416f411e4a52b5e4af1ac88f3b8',
  source: 'https://github.com/shoelace-style/webawesome',
  build: 'npm --prefix desktop run build:ui-kit',
  components: ['button', 'badge', 'dropdown', 'dropdown-item', 'tooltip'],
  packages, files,
}, null, 2)}\n`);
console.log(JSON.stringify(files, null, 2));
