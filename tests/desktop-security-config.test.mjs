import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../desktop/src-tauri/${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('tauri.conf.json'));
const capability = JSON.parse(read('capabilities/default.json'));

test('desktop production policy blocks remote scripts, frames and direct provider traffic', () => {
  assert.equal(typeof config.app.security.csp, 'string');
  const directives = Object.fromEntries(config.app.security.csp.split(';').map(value => value.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...values]) => [name, values]));
  assert.deepEqual(directives['script-src'], ["'self'"]);
  for (const name of ['object-src', 'base-uri', 'frame-src', 'form-action']) assert.deepEqual(directives[name], ["'none'"]);
  assert.ok(directives['connect-src'].includes('ipc:'));
  assert.ok(directives['connect-src'].every(value => ["'self'", 'ipc:', 'http://ipc.localhost', 'https://ipc.localhost'].includes(value)));
  assert.doesNotMatch(config.app.security.csp, /unsafe-eval/);
});

test('only local main window receives explicit tool and model permissions', () => {
  assert.deepEqual(config.app.security.capabilities, ['default']);
  assert.deepEqual(capability.windows, ['main']);
  assert.equal(capability.local, true);
  assert.equal(capability.remote, undefined);
  const build = read('build.rs');
  for (const command of ['run_check', 'run_guide', 'run_cancel', 'model_request', 'model_cancel', 'project_snapshot', 'project_save', 'project_select', 'project_artifact', 'project_export', 'project_run', 'project_facts_save', 'project_workflow', 'project_stage_confirm', 'project_compare', 'project_context_file', 'project_context_report']) {
    assert.ok(build.includes(`"${command}"`), `${command} must be ACL registered`);
    assert.ok(capability.permissions.includes(`allow-${command.replaceAll('_', '-')}`));
  }
  assert.match(build, /AppManifest::new\(\)\.commands/);
  assert.ok(!capability.permissions.some(permission => typeof permission === 'string' && /^(shell:|fs:|opener:default|dialog:default)/.test(permission)));
  assert.ok(capability.permissions.includes('dialog:allow-open'));
});

test('the DevTools probe is restricted to the authorized desktop IPC', () => {
  const build = read('build.rs');
  const root = read('src/lib.rs');
  const command = read('src/devtools_status.rs');
  assert.ok(build.includes('"devtools_status"'));
  assert.ok(capability.permissions.includes('allow-devtools-status'));
  assert.ok(root.includes('devtools_status::devtools_status'));
  assert.match(command, /pub async fn devtools_status\([^)]*\)[\s\S]*?authorize\(&window\)\?/);
  assert.doesNotMatch(command, /\bCommand::|model_bridge/);
});

test('external references only open web URLs, without file or arbitrary application scopes', () => {
  const scope = capability.permissions.find(value => value.identifier === 'opener:allow-open-url');
  assert.ok(scope);
  assert.deepEqual(scope.allow, [{ url: 'https://*' }, { url: 'http://*' }]);
  assert.ok(!capability.permissions.some(value => /(?:open-path|reveal-item|allow-default-urls)/.test(typeof value === 'string' ? value : value.identifier)));
});

test('dev and build prepare the same complete bundled runtime', () => {
  assert.match(config.build.beforeDevCommand, /prepare:runtime/);
  assert.match(config.build.beforeBuildCommand, /prepare:runtime/);
  assert.deepEqual(config.bundle.resources, { 'runtime/': 'runtime/' });
});

