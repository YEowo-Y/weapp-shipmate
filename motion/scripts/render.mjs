import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '../desktop/public/tutorials');
mkdirSync(output, { recursive: true });
const cli = resolve(root, 'node_modules/@remotion/cli/remotion-cli.js');
for (const id of ['preflight', 'workflow', 'handoff']) {
  for (const args of [
    ['still', 'src/index.tsx', id, resolve(output, `${id}.jpg`), '--frame=80'],
    ['render', 'src/index.tsx', id, resolve(output, `${id}.mp4`), '--codec=h264', '--crf=23', '--concurrency=2'],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
