import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Every local application IPC handler is registered and explicitly reachable only from the main window', () => {
  const root = new URL('../desktop/src-tauri/', import.meta.url);
  const source = readFileSync(new URL('src/lib.rs', root), 'utf8');
  const handler = source.match(/tauri::generate_handler!\[([\s\S]*?)\]/u)?.[1];
  assert.ok(handler, 'actual Tauri handler registry');
  const commands = handler.split(',').map(value => value.trim().split('::').at(-1)).filter(Boolean);
  const manifest = readFileSync(new URL('build.rs', root), 'utf8');
  const registered = [...manifest.matchAll(/"([a-z_]+)"/gu)].map(match => match[1]);
  assert.deepEqual([...new Set(commands)].sort(), [...new Set(registered)].sort(), 'IPC registry and generated manifest must agree');
  const capability = JSON.parse(readFileSync(new URL('capabilities/default.json', root), 'utf8'));
  assert.deepEqual(capability.windows, ['main']);
  assert.equal(capability.local, true);
  assert.equal(capability.remote, undefined);
  for (const command of commands) assert.ok(capability.permissions.includes(`allow-${command.replaceAll('_', '-')}`), `${command} needs its explicit permission`);
});
