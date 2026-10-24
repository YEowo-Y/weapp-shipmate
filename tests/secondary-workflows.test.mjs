import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../desktop/design-previews/${name}.html`, import.meta.url), 'utf8');

test('planned sync journey exposes all six steps in reading order and keeps technical detail optional', () => {
  const html = read('sync-loop');
  const flow = html.match(/<ol class="dflow"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(flow, 'the update path is an ordered list for assistive technology');
  const labels = [...flow.matchAll(/class="dnode__t">([^<]+)/g)].map(match => match[1]);
  assert.deepEqual(labels, ['你改代码', '文件监听', '全量重扫', '结果广播', '写入状态', 'UI 实时更新']);
  assert.equal((flow.match(/<li /g) || []).length, 6);
  assert.doesNotMatch(flow, /Rust|Tauri|IPC/);
  assert.match(html, /<details[^>]*>[\s\S]*?<summary>技术实现说明<\/summary>/);
  assert.match(html, /尚未接入/);
});

test('each guide step ends with its own confirmation, separately from links and examples', () => {
  const html = read('guided-step');
  const steps = [...html.matchAll(/<li class="gstep[^"]*">([\s\S]*?)<\/li>/g)];
  assert.equal(steps.length, 5);
  for (const [, step] of steps) {
    assert.match(step, /<div class="gstep__completion"><label class="gdone"><input type="checkbox" \/>[^<]+<\/label><\/div>\s*$/);
  }
});
