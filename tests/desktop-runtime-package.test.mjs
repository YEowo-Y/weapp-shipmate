import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareRuntime, runtimeLock, verifyBytes } from '../desktop/scripts/prepare-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, '.omx/cache/node-runtime', runtimeLock.version);
const digest = value => createHash('sha256').update(value).digest('hex');

test('runtime integrity rejects modified bytes', () => {
  const trusted = Buffer.from('trusted release');
  assert.equal(verifyBytes(trusted, digest(trusted), 'fixture'), trusted);
  assert.throws(() => verifyBytes(Buffer.from('modified'), digest(trusted), 'fixture'), /integrity mismatch/);
});

test('corrupt cached runtime fails closed and preserves previous stage', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'shipmate-runtime-integrity-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const output = join(workspace, 'runtime');
  const corrupt = join(workspace, 'cache');
  await mkdir(output); await mkdir(corrupt);
  await writeFile(join(output, 'previous.txt'), 'previous working runtime');
  await writeFile(join(corrupt, 'node.exe'), 'modified');
  await assert.rejects(prepareRuntime({ output, cache: corrupt }), /integrity mismatch/);
  assert.equal(await readFile(join(output, 'previous.txt'), 'utf8'), 'previous working runtime');
});

test('relocated Windows runtime executes local entrypoints with empty PATH', async t => {
  if (process.platform !== 'win32' || process.arch !== 'x64') return t.skip('Windows x64 runtime execution requires Windows x64');
  try { await access(join(cache, 'node.exe')); await access(join(cache, 'LICENSE.node')); }
  catch { return t.skip('Run npm --prefix desktop run prepare:runtime before portable-runtime integration acceptance'); }
  const workspace = await mkdtemp(join(tmpdir(), '船友 portable runtime '));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const output = join(workspace, 'runtime');
  const first = await prepareRuntime({ output, cache });
  await writeFile(join(output, 'stale.txt'), 'must not survive regeneration');
  const second = await prepareRuntime({ output, cache });
  assert.deepEqual(second, first, 'same source produces identical manifest without stale files');
  await assert.rejects(access(join(output, 'stale.txt')));
  assert.deepEqual(await readdir(join(output, 'node_modules')), ['@ai-sdk', '@opentelemetry', '@standard-schema', '@vercel', 'ai', 'argparse', 'eventsource-parser', 'js-yaml', 'json-schema', 'undici', 'zod']);
  assert.equal(first.dependencies.ai, '6.0.313');
  assert.equal(first.dependencies['@ai-sdk/anthropic'], '3.0.135');
  assert.equal(first.dependencies['@ai-sdk/google'], '3.0.138');
  assert.ok(first.files['node_modules/@ai-sdk/anthropic/LICENSE']);
  assert.ok(first.files['node_modules/@ai-sdk/google/LICENSE']);
  assert.ok(first.files['node_modules/@ai-sdk/provider-utils/LICENSE']);
  assert.ok(first.files['DESKTOP-DEPENDENCIES.txt']);
  assert.ok(!Object.keys(first.files).some(path => /node_modules\/(?:@awesome|@tauri|vite|typescript)\//.test(path)));
  assert.equal(first.files['node.exe'], runtimeLock.binary.sha256);
  assert.ok(first.files['LICENSE.node']);
  assert.ok(first.files['desktop/design-previews/explain-contract.js']);
  assert.ok(first.files['desktop/design-previews/agent-contract.js']);
  assert.ok(first.files['workflow-catalog.json']);
  assert.ok(first.files['source-catalog.json']);
  assert.ok(first.files['desktop/server/source-check.mjs']);
  assert.ok(first.files['src/source-text.mjs']);
  assert.ok(!Object.keys(first.files).some(path => path.startsWith('corpus/')));
  assert.ok(first.files['src/project-tool.mjs']);
  const catalog = JSON.parse(await readFile(join(output, 'workflow-catalog.json'), 'utf8'));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.stages.length, 8);
  assert.ok(catalog.rules.every(rule => !rule.draft));
  assert.ok(Object.keys(first.files).every(path => !/(?:^|\/)(?:\.env|tests|profiles|settings|\.git)(?:\.|\/|$)/.test(path)));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:path|node_options|node_path)$/i.test(key)));
  env.PATH = '';
  const run = args => spawnSync(join(output, 'node.exe'), args, { cwd: workspace, env, encoding: 'utf8', timeout: 20_000, windowsHide: true });
  const version = run(['--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), `v${runtimeLock.version}`);
  const sources = JSON.parse(await readFile(join(output, 'source-catalog.json'), 'utf8'));
  const manual = sources.sources.find(source => source.baseline?.method === 'manual');
  assert.ok(manual, 'portable fixture has an offline-only manual source');
  const manualCheck = run([join(output, 'desktop/server/source-check.mjs'), manual.id]);
  assert.equal(manualCheck.status, 0, manualCheck.stderr);
  assert.equal(JSON.parse(manualCheck.stdout).state, 'manual');
  assert.equal(JSON.parse(manualCheck.stdout).catalogVersion, sources.catalogVersion);
  const rejectedSource = run([join(output, 'desktop/server/source-check.mjs'), 'https://localhost/']);
  assert.equal(rejectedSource.status, 1);
  assert.equal(rejectedSource.stdout, '');
  assert.equal(rejectedSource.stderr, '');
  const fixture = join(workspace, '小程序');
  await mkdir(fixture);
  await writeFile(join(fixture, 'app.json'), JSON.stringify({ pages: [] }));
  const projectResult = run([join(output, 'src/project-tool.mjs'), 'check', JSON.stringify({ directory: fixture })]);
  assert.equal(projectResult.status, 0, projectResult.stderr);
  assert.equal(JSON.parse(projectResult.stdout).data.scope.complete, true);
  for (const args of [['guide', '--json'], ['explain', '隐私', '--json'], ['check', fixture, '--json']]) {
    const result = run([join(output, 'bin/weapp-shipmate.mjs'), ...args]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).command, args[0]);
  }
  const broker = run(['--input-type=module', '-e', `
    const { createDesktopBridge } = await import(${JSON.stringify(pathToFileURL(join(output, 'desktop/server/desktop-bridge.mjs')).href)});
    const { streamText, jsonSchema, stepCountIs } = await import(${JSON.stringify(pathToFileURL(join(output, 'node_modules/ai/dist/index.mjs')).href)});
    const { createOpenAI } = await import(${JSON.stringify(pathToFileURL(join(output, 'node_modules/@ai-sdk/openai/dist/index.mjs')).href)});
    const { createAnthropic } = await import(${JSON.stringify(pathToFileURL(join(output, 'node_modules/@ai-sdk/anthropic/dist/index.mjs')).href)});
    const { createGoogleGenerativeAI } = await import(${JSON.stringify(pathToFileURL(join(output, 'node_modules/@ai-sdk/google/dist/index.mjs')).href)});
    if (![streamText, jsonSchema, stepCountIs, createOpenAI, createAnthropic, createGoogleGenerativeAI].every(value => typeof value === 'function')) throw new Error('SDK dependency closure failed');
    const events = [];
    const bridge = await createDesktopBridge({ emit: value => events.push(value) });
    try {
      await bridge.request({ id: 'list', method: 'GET', path: '/api/model-connections' });
      if (!events.some(event => event.type === 'headers' && event.status === 200)) throw new Error('Broker bootstrap failed');
      const { executeExplain } = await import(${JSON.stringify(pathToFileURL(join(output, 'desktop/server/explain-query.mjs')).href)});
      const result = await executeExplain('隐私');
      if (result.command !== 'explain') throw new Error('Explain dependency closure failed');
    } finally { await bridge.close(); }
  `]);
  assert.equal(broker.status, 0, broker.stderr);
});
