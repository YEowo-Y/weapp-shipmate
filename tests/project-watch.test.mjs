import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { isScanPathEligible } from '../src/scanner.mjs';
import { startProjectWatch, relevantWatchEvent } from '../desktop/server/project-watch.mjs';

function fixture(t) {
  // Windows CI may expose TEMP through an 8.3 alias; watcher roots are canonical.
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'shipmate-watch-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project'); mkdirSync(root);
  return { base, root };
}
function fakeWatch(t, root, options = {}) {
  const messages = []; let listener;
  const watcher = new EventEmitter(); watcher.close = () => watcher.emit('close');
  const controller = startProjectWatch(root, { emit: (m) => messages.push(m),
    watchFactory: (_root, opts, callback) => { assert.equal(opts.recursive, true); listener = callback; return watcher; }, ...options });
  t.after(controller.stop);
  return { messages, watcher, event: (...args) => listener(...args), ...controller };
}
function waitForMessage(child, predicate) {
  return new Promise((resolveMessage, reject) => {
    const timeout = setTimeout(() => done(new Error('watcher message timeout')), 7000);
    const line = (value) => { const message = JSON.parse(value); if (predicate(message)) done(null, message); };
    const exit = () => done(new Error('watcher exited before expected message'));
    function done(error, message) { clearTimeout(timeout); child.lines.off('line', line); child.off('exit', exit); error ? reject(error) : resolveMessage(message); }
    child.lines.on('line', line); child.on('exit', exit);
  });
}
function launch(t, root) {
  const child = spawn(process.execPath, [resolve('desktop/server/project-watch.mjs'), root], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.lines = createInterface({ input: child.stdout });
  child.messages = []; child.lines.on('line', (line) => child.messages.push(JSON.parse(line)));
  child.stderrText = ''; child.stderr.on('data', (chunk) => { child.stderrText += chunk; });
  child.exited = new Promise((resolveExit) => child.on('exit', (code) => resolveExit(code)));
  t.after(() => { child.stdin.end(); if (child.exitCode === null) child.kill(); child.lines.close(); });
  return child;
}

test('watch eligibility reuses scanner directories, secret filters and extensions', () => {
  for (const path of ['node_modules/a.js', 'dist/a.js', '.git/config', 'tests/a.js', 'src/.env', 'src/secret.json', 'src/types.d.ts', 'src/pnpm-lock.yaml']) {
    assert.equal(isScanPathEligible(path.split('/')), false, path);
  }
  assert.equal(isScanPathEligible(['pages', 'tests', 'index.ts']), true);
  assert.equal(isScanPathEligible(['a.css']), false);
  assert.equal(isScanPathEligible(['dist'], 'missing'), false);
});

test('event validation handles missing filenames, deleted files, traversal and junctions without reading content', (t) => {
  const { base, root } = fixture(t);
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'src', 'a.js'), 'secret content');
  assert.equal(relevantWatchEvent(root, null), true);
  assert.equal(relevantWatchEvent(root, 'src/a.js', 'change'), true);
  assert.equal(relevantWatchEvent(root, 'src/deleted.js'), true);
  assert.equal(relevantWatchEvent(root, 'src/deleted.js', 'change'), false);
  for (const name of ['../outside.js', 'src/../../outside.js', 'C:\\outside.js', '/outside.js', 'dist/a.js', 'dist', 'src/.env', 'src/a.js:alternate']) assert.equal(relevantWatchEvent(root, name), false, name);
  const outside = join(base, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'a.js'), 'outside');
  symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(relevantWatchEvent(root, 'linked/a.js'), false);
  assert.equal(relevantWatchEvent(root, 'linked/deleted.js'), false);
});

test('flood coalescing uses one dirty flag, quiet flush and hard maximum', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root } = fixture(t); writeFileSync(join(root, 'a.js'), 'a');
  const state = fakeWatch(t, root);
  for (let step = 0; step < 6; step++) {
    for (let i = 0; i < 500; i++) state.event('change', 'a.js');
    t.mock.timers.tick(450);
  }
  assert.deepEqual(state.messages, [{ type: 'ready' }]);
  state.event('change', 'a.js'); t.mock.timers.tick(300);
  assert.deepEqual(state.messages, [{ type: 'ready' }, { type: 'changed' }]);
  state.event('change', 'a.js'); t.mock.timers.tick(500);
  assert.equal(state.messages.filter((m) => m.type === 'changed').length, 2);
  state.event('change', 'a.js'); state.stop(); t.mock.timers.tick(5000);
  assert.equal(state.messages.length, 3);
});

test('generated changes do not signal and unknown events stay coalesced', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root } = fixture(t); mkdirSync(join(root, 'dist')); writeFileSync(join(root, 'dist', 'a.js'), 'a');
  const state = fakeWatch(t, root);
  state.event('change', 'dist/a.js'); state.event('rename', 'node_modules'); t.mock.timers.tick(600);
  assert.deepEqual(state.messages, [{ type: 'ready' }]);
  state.event('rename', null); state.event('rename', null); t.mock.timers.tick(500);
  assert.deepEqual(state.messages, [{ type: 'ready' }, { type: 'changed' }]);
});

test('root move or replacement stops without silent recreation, discarding pending changes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { base, root } = fixture(t);
  const state = fakeWatch(t, root); state.event('rename', null);
  renameSync(root, join(base, 'moved')); mkdirSync(root);
  t.mock.timers.tick(1000);
  assert.deepEqual(state.messages, [{ type: 'ready' }, { type: 'error', code: 'root_changed' }]);
  state.event('rename', null); t.mock.timers.tick(5000); assert.equal(state.messages.length, 2);
});

test('watch errors are bounded sanitized and close the watch', (t) => {
  const { root } = fixture(t); const state = fakeWatch(t, root);
  state.watcher.emit('error', new Error('sensitive path / secret'));
  state.watcher.emit('error', new Error('again'));
  assert.deepEqual(state.messages, [{ type: 'ready' }, { type: 'error', code: 'watch_failed' }]);
});

test('real recursive watcher signals a source write and exits on EOF', { timeout: 10000 }, async (t) => {
  const { root } = fixture(t); mkdirSync(join(root, 'src'));
  const child = launch(t, root); await waitForMessage(child, (m) => m.type === 'ready');
  const changed = waitForMessage(child, (m) => m.type === 'changed');
  writeFileSync(join(root, 'src', 'a.js'), 'wx.getLocation()'); await changed;
  child.stdin.end(); assert.equal(await child.exited, 0); assert.equal(child.stderrText, '');
  assert.deepEqual(child.messages, [{ type: 'ready' }, { type: 'changed' }]);
});

test('real watcher accepts stop input without interpreting it', { timeout: 10000 }, async (t) => {
  const { root } = fixture(t); const child = launch(t, root);
  await waitForMessage(child, (m) => m.type === 'ready'); child.stdin.write('stop\n');
  assert.equal(await child.exited, 0); assert.equal(child.stderrText, '');
  assert.deepEqual(child.messages, [{ type: 'ready' }]);
});

test('real watcher detects directory move by identity check', { timeout: 10000 }, async (t) => {
  const { base, root } = fixture(t); const child = launch(t, root);
  await waitForMessage(child, (m) => m.type === 'ready');
  const error = waitForMessage(child, (m) => m.type === 'error'); renameSync(root, join(base, 'moved'));
  const message = await error; assert.ok(['root_unavailable', 'watch_failed'].includes(message.code));
  assert.equal(await child.exited, 1); assert.equal(child.stderrText, '');
});

test('canonical namespaced Windows root works while symlink root is rejected', (t) => {
  const { base, root } = fixture(t);
  writeFileSync(join(root, 'a.js'), 'a');
  if (process.platform === 'win32') {
    const namespaced = `\\\\?\\${root}`;
    assert.equal(relevantWatchEvent(namespaced, 'a.js'), true);
    const state = fakeWatch(t, namespaced);
    assert.deepEqual(state.messages, [{ type: 'ready' }]);
  }
  const linked = join(base, 'linked');
  symlinkSync(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const rejected = fakeWatch(t, linked);
  assert.deepEqual(rejected.messages, [{ type: 'error', code: 'watch_unavailable' }]);
});

test('output backpressure closes watcher and prevents further buffered signals', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { root } = fixture(t); const messages = [];
  const state = fakeWatch(t, root, { emit: (message) => { messages.push(message); return false; } });
  state.event('rename', null); t.mock.timers.tick(5000);
  assert.deepEqual(messages, [{ type: 'ready' }]);
});
