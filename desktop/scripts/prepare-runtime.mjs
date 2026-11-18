// @ts-check
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorkflowCatalog } from '../../src/project-artifact.mjs';
import { createSourceCatalog } from '../../src/source-catalog.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
export const runtimeLock = await json(join(ROOT, 'desktop/runtime-lock.json'));

export function verifyBytes(bytes, expected, label) {
  if (sha256(bytes) !== expected) throw new Error(`Runtime integrity mismatch: ${label}`);
  return bytes;
}

async function verifiedAsset(asset, cache, name) {
  const path = join(cache, name);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe runtime cache: ${name}`);
    return verifyBytes(await readFile(path), asset.sha256, name);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(asset.url, { redirect: 'error', signal: globalThis.AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Runtime download failed: ${name} (${response.status})`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 120_000_000) throw new Error(`Runtime download exceeds size limit: ${name}`);
    chunks.push(chunk);
  }
  const bytes = verifyBytes(Buffer.concat(chunks), asset.sha256, name);
  await mkdir(cache, { recursive: true });
  await writeFile(path, bytes);
  return bytes;
}

async function copyAllowed(source, destination, accept) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Runtime source must not be a link: ${source}`);
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) {
      await copyAllowed(join(source, name), join(destination, name), accept);
    }
  } else if (stat.isFile() && accept(source)) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function inventory(root, sub = '') {
  const result = {};
  for (const name of (await readdir(join(root, sub))).sort()) {
    const relative = sub ? `${sub}/${name}` : name;
    const file = join(root, relative);
    if ((await lstat(file)).isDirectory()) Object.assign(result, await inventory(root, relative));
    else result[relative] = sha256(await readFile(file));
  }
  return result;
}

/** Build only the explicit runtime surface; never copy profiles, settings, or all node_modules. */
export async function prepareRuntime({ root = ROOT, output = join(root, 'desktop/src-tauri/runtime'), cache = join(root, '.omx/cache/node-runtime', runtimeLock.version) } = {}) {
  output = resolve(output);
  if (basename(output) !== 'runtime') throw new Error('Runtime output directory must be named runtime');
  // Reject a redirected output before any removal or replacement.
  try { if (!(await lstat(output)).isDirectory() || (await lstat(output)).isSymbolicLink()) throw new Error('Unsafe runtime output'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const binary = await verifiedAsset(runtimeLock.binary, cache, 'node.exe');
  const license = await verifiedAsset(runtimeLock.license, cache, 'LICENSE.node');
  await mkdir(dirname(output), { recursive: true });
  const temporary = await mkdtemp(join(dirname(output), '.runtime-stage-'));
  const backup = `${temporary}-previous`;
  let movedPrevious = false;
  try {
    await writeFile(join(temporary, 'node.exe'), binary);
    await writeFile(join(temporary, 'LICENSE.node'), license);
    for (const name of ['package.json', 'LICENSE', 'flow.yaml', 'rejections.yaml', 'src/private-files.json']) {
      await copyAllowed(join(root, name), join(temporary, name), () => true);
    }
    for (const name of ['bin', 'src', 'desktop/server']) {
      await copyAllowed(join(root, name), join(temporary, name), path => path.endsWith('.mjs'));
    }
    await copyAllowed(join(root, 'rules'), join(temporary, 'rules'), path => /\.ya?ml$/.test(path));
    for (const name of ['guide-contract.js', 'explain-contract.js', 'agent-contract.js']) {
      await copyAllowed(join(root, 'desktop/src/shared', name), join(temporary, 'desktop/src/shared', name), () => true);
    }
    const lock = await json(join(root, 'package-lock.json'));
    const dependencyFiles = {
      'js-yaml': ['package.json', 'LICENSE', 'index.js', 'lib', 'dist', 'bin'],
      argparse: ['package.json', 'LICENSE', 'argparse.js', 'lib'],
    };
    const application = await json(join(root, 'package.json'));
    for (const name of Object.keys(application.dependencies || {})) {
      if (!(name in dependencyFiles)) throw new Error(`Unreviewed application runtime dependency: ${name}`);
    }
    const dependencies = {};
    for (const [name, files] of Object.entries(dependencyFiles)) {
      const source = join(root, 'node_modules', name);
      const pkg = await json(join(source, 'package.json'));
      if (pkg.version !== lock.packages[`node_modules/${name}`]?.version) throw new Error(`Install locked dependency before packaging: ${name}`);
      for (const dependency of Object.keys(pkg.dependencies || {})) {
        if (!(dependency in dependencyFiles)) throw new Error(`Unreviewed runtime dependency: ${dependency}`);
      }
      dependencies[name] = pkg.version;
      for (const file of files) await copyAllowed(join(source, file), join(temporary, 'node_modules', name, file), () => true);
    }
    // Desktop-only SDK closure: explicit reviewed packages; never ship the UI dependency tree.
    const desktopLock = await json(join(root, 'desktop/package-lock.json'));
    const sdkFiles = {
      ai: ['dist', 'LICENSE'],
      '@ai-sdk/openai': ['dist', 'LICENSE'],
      '@ai-sdk/anthropic': ['dist', 'LICENSE'],
      '@ai-sdk/google': ['dist', 'LICENSE'],
      '@ai-sdk/provider': ['dist', 'LICENSE'],
      '@ai-sdk/provider-utils': ['dist'],
      '@ai-sdk/gateway': ['dist', 'LICENSE'],
      '@vercel/oidc': ['dist', 'LICENSE'],
      '@standard-schema/spec': ['dist', 'LICENSE'],
      '@opentelemetry/api': ['dist', 'LICENSE'],
      'eventsource-parser': ['dist', 'LICENSE'],
      'json-schema': ['lib', 'LICENSE'],
      undici: ['index.js', 'index-fetch.js', 'lib', 'LICENSE'],
      zod: ['index.js', 'index.cjs', 'v3', 'v4', 'LICENSE'],
    };
    const notices = [];
    for (const [name, files] of Object.entries(sdkFiles)) {
      const source = join(root, 'desktop/node_modules', name);
      const pkg = await json(join(source, 'package.json'));
      if (pkg.version !== desktopLock.packages[`node_modules/${name}`]?.version) throw new Error(`Install locked desktop dependency before packaging: ${name}`);
      for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
        if (!pkg.peerDependenciesMeta?.[dependency]?.optional && !(dependency in sdkFiles)) throw new Error(`Unreviewed desktop runtime dependency: ${dependency}`);
      }
      dependencies[name] = pkg.version;
      notices.push(`${name}@${pkg.version}: ${pkg.license}`);
      for (const file of ['package.json', ...files]) {
        await copyAllowed(join(source, file), join(temporary, 'node_modules', name, file), path =>
          /(?:\.(?:js|mjs|cjs|json|wasm)|LICENSE)$/.test(path) && !/[\\/]dist[\\/](?:test|experimental)[\\/]/.test(path));
      }
    }
    // provider-utils' published tarball omits LICENSE; it uses the same monorepo Apache license.
    await copyFile(join(root, 'desktop/node_modules/ai/LICENSE'), join(temporary, 'node_modules/@ai-sdk/provider-utils/LICENSE'));
    await writeFile(join(temporary, 'DESKTOP-DEPENDENCIES.txt'), notices.join('\n') + '\n');
    await writeFile(join(temporary, 'workflow-catalog.json'), JSON.stringify(createWorkflowCatalog({ root }), null, 2) + '\n');
    await writeFile(join(temporary, 'source-catalog.json'), JSON.stringify(createSourceCatalog({ root }), null, 2) + '\n');
    const manifest = { node: runtimeLock.version, platform: runtimeLock.platform, arch: runtimeLock.arch, dependencies, files: await inventory(temporary) };
    await writeFile(join(temporary, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    try { await rename(output, backup); movedPrevious = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(temporary, output); }
    catch (error) { if (movedPrevious) await rename(backup, output); movedPrevious = false; throw error; }
    if (movedPrevious) await rm(backup, { recursive: true });
    return manifest;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.platform !== runtimeLock.platform || process.arch !== runtimeLock.arch) throw new Error('Desktop runtime currently supports Windows x64 only');
    const manifest = await prepareRuntime();
    console.log(`Prepared Node ${manifest.node} (${manifest.platform}-${manifest.arch}), ${Object.keys(manifest.files).length} runtime files`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

