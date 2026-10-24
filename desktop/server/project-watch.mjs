import { watch, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isScanPathEligible } from '../../src/scanner.mjs';

const plainPath = (path) => path.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
const samePath = (a, b) => process.platform === 'win32'
  ? plainPath(a).toLowerCase() === plainPath(b).toLowerCase()
  : a === b;

function rootIdentity(root) {
  const stat = lstatSync(root, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(realpathSync.native(root), resolve(root))) throw new Error('root');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

// Never read event content. Existing ancestors must be ordinary in-root directories.
// A deleted link is indistinguishable from a deleted file: it may cause one extra
// dirty signal, but cannot supply content or authorize traversal by the scanner.
export function relevantWatchEvent(root, filename, event = 'rename') {
  if (filename == null) return true;
  if (typeof filename !== 'string' || filename.length > 32768 || isAbsolute(filename)) return false;
  const parts = filename.split(/[\\/]/);
  if (!isScanPathEligible(parts, 'directory')) return false;
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return event === 'rename' && isScanPathEligible(parts, 'missing');
      throw error;
    }
    if (stat.isSymbolicLink()) return false;
    const canonical = realpathSync.native(current);
    const rel = relative(process.platform === 'win32' ? plainPath(root) : root, canonical);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || !samePath(canonical, resolve(current))) return false;
    if (index < parts.length - 1 && !stat.isDirectory()) return false;
    if (index === parts.length - 1) return isScanPathEligible(parts, stat.isDirectory() ? 'directory' : 'file');
  }
  return false;
}

export function startProjectWatch(root, {
  emit, watchFactory = watch, quietMs = 500, maxDelayMs = 3000, rootCheckMs = 1000,
} = {}) {
  let watcher, quietTimer, maxTimer, rootTimer;
  let stopped = false, dirty = false, identity;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(quietTimer); clearTimeout(maxTimer); clearTimeout(rootTimer);
    watcher?.close();
  };
  const send = (message) => { if (emit(message) === false) stop(); };
  const fail = (code) => { if (!stopped) { stop(); send({ type: 'error', code }); } };
  const check = () => {
    try { if (rootIdentity(root) !== identity) { fail('root_changed'); return false; } }
    catch { fail('root_unavailable'); return false; }
    return true;
  };
  const flush = () => {
    clearTimeout(quietTimer); clearTimeout(maxTimer);
    quietTimer = maxTimer = undefined;
    if (stopped || !dirty || !check()) return;
    dirty = false;
    send({ type: 'changed' });
  };
  const onEvent = (event, filename) => {
    if (stopped || !check()) return;
    try {
      if (!relevantWatchEvent(root, filename, event)) return;
      dirty = true;
      clearTimeout(quietTimer);
      quietTimer = setTimeout(flush, quietMs);
      maxTimer ??= setTimeout(flush, maxDelayMs);
    } catch { fail('watch_failed'); }
  };
  const pollRoot = () => {
    if (!stopped && check()) rootTimer = setTimeout(pollRoot, rootCheckMs);
  };
  try {
    if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('root');
    identity = rootIdentity(root);
    root = realpathSync.native(root);
    watcher = watchFactory(root, { recursive: true, encoding: 'utf8' }, onEvent);
    watcher.on('error', () => fail('watch_failed'));
    watcher.on('close', () => { if (!stopped) fail('watch_closed'); });
    if (check()) { send({ type: 'ready' }); if (!stopped) rootTimer = setTimeout(pollRoot, rootCheckMs); }
  } catch { fail('watch_unavailable'); }
  return { stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let controller;
  const shutdown = () => { controller?.stop(); process.stdin.destroy(); };
  process.stdout.on('error', shutdown);
  const emit = (message) => {
    const accepted = process.stdout.write(`${JSON.stringify(message)}\n`);
    if (message.type === 'error' || !accepted) { process.exitCode = 1; process.stdin.destroy(); }
    return accepted;
  };
  if (process.argv.length !== 3) { emit({ type: 'error', code: 'invalid_arguments' }); }
  else {
    controller = startProjectWatch(process.argv[2], { emit });
    process.stdin.on('end', shutdown);
    process.stdin.on('error', shutdown);
    // Any control input is a stop request; never accumulate or interpret commands.
    process.stdin.on('data', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    if (!process.exitCode) process.stdin.resume();
  }
}
