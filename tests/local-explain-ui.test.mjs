import test from 'node:test';
import assert from 'node:assert/strict';
import { runExplain } from '../src/explain.mjs';
import { explainHarness } from './helpers/explain-ui.mjs';

test('download exports only the current validated complete report and invalidates on edit', async () => {
  const downloaded = [];
  const { nodes: n } = explainHarness(undefined, { artifactDownloader: { download: artifact => { downloaded.push(artifact); return true; }, dispose() {} } });
  assert.equal(n.rjDownload.disabled, true); await n.rjDownload.fire('click'); assert.equal(downloaded.length, 0);
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit'); await n.rjDownload.fire('click');
  assert.equal(downloaded.length, 1); assert.equal(downloaded[0].filename, 'shipmate-explain.md');
  assert.equal(downloaded[0].mimeType, 'text/markdown;charset=utf-8');
  assert.match(downloaded[0].text, /用户信息隐私声明/); assert.match(downloaded[0].text, /地理位置隐私声明/);
  assert.match(downloaded[0].text, /https:\/\/developers.weixin.qq.com/);
  assert.match(n.rjActionStatus.textContent, /已发起下载/); assert.doesNotMatch(n.rjActionStatus.textContent, /已保存/);
  assert.equal(n.rjInput.value, '隐私'); assert.equal(n.rjResult.hidden, false);
  n.rjInput.fire('input'); await n.rjDownload.fire('click'); assert.equal(downloaded.length, 1); assert.equal(n.rjDownload.disabled, true);
});

test('download failure supports retry and late copy completion cannot replace its feedback', async () => {
  let attempt = 0, finish;
  const h = explainHarness(undefined, { copyText: () => new Promise(resolve => { finish = resolve; }), artifactDownloader: {
    download() { if (++attempt === 1) throw Error('unavailable'); return attempt > 2; }, dispose() {},
  } });
  const n = h.nodes; n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  const copying = n.rjCopy.fire('click');
  await n.rjDownload.fire('click'); assert.match(n.rjActionStatus.textContent, /未能发起下载/);
  finish(); await copying; assert.match(n.rjActionStatus.textContent, /未能发起下载/); assert.equal(n.rjCopy.disabled, false);
  await n.rjDownload.fire('click'); assert.match(n.rjActionStatus.textContent, /复制/);
  await n.rjDownload.fire('click'); assert.match(n.rjActionStatus.textContent, /已发起下载/);
});

test('page exit releases download resources and teardown removes download actions', async () => {
  let released = 0, downloaded = 0;
  const h = explainHarness(undefined, { artifactDownloader: { download() { downloaded++; return true; }, dispose() { released++; } } });
  h.nodes.rjInput.value = '隐私'; await h.nodes.rjForm.fire('submit'); await h.nodes.rjDownload.fire('click');
  h.suspend(); assert.equal(released, 0, 'closing a dialog must not revoke a just-started download');
  h.win.fire('pagehide'); assert.equal(released, 1);
  h.dispose(); assert.equal(h.nodes.rjDownload.listeners.click, undefined);
  await h.nodes.rjDownload.fire('click'); assert.equal(downloaded, 1);
});

test('completed matches collapse the query; empty and failed queries remain editable', async () => {
  const { nodes: n } = explainHarness();
  assert.equal(n.rjQuery.open, true);
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  assert.equal(n.rjQuery.open, false); assert.equal(n.rjQuerySummary.hidden, false);
  assert.equal(n.rjQueryText.textContent, '隐私');
  assert.equal(n.rjCopy.disabled, false); assert.equal(n.rjSave.hidden, true);
  n.rjInput.value = 'xyz0123'; n.rjInput.fire('input');
  assert.equal(n.rjQuery.open, true); assert.equal(n.rjCopy.disabled, true);
  await n.rjForm.fire('submit'); assert.equal(n.rjQuery.open, true);
});

test('copy retries and late clipboard completion cannot overwrite another result or a closed surface', async () => {
  let fail = true, text;
  const h = explainHarness(undefined, { copyText: async value => { text = value; if (fail) throw Error('denied'); } });
  const n = h.nodes; n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  await n.rjCopy.fire('click'); assert.match(n.rjActionStatus.textContent, /复制失败/);
  fail = false; await n.rjCopy.fire('click'); assert.match(n.rjActionStatus.textContent, /已复制/); assert.match(text, /隐私/);
  for (const action of ['edit', 'close']) {
    let finish;
    const app = explainHarness(undefined, { copyText: () => new Promise(resolve => { finish = resolve; }) });
    app.nodes.rjInput.value = '隐私'; await app.nodes.rjForm.fire('submit');
    const copying = app.nodes.rjCopy.fire('click'); assert.equal(app.nodes.rjCopy.disabled, true);
    if (action === 'edit') app.nodes.rjInput.fire('input'); else app.suspend();
    finish(); await copying; assert.equal(app.nodes.rjActionStatus.textContent, '');
  }
});

test('saving only uses the validated current result; busy and duplicate saves are explicit', async () => {
  const records = []; let busy = true;
  const { nodes: n } = explainHarness(undefined, { saveResult: text => {
    if (busy) return { ok: false, reason: 'busy' };
    if (records.includes(text)) return { ok: true, duplicate: true };
    records.push(text); return { ok: true };
  } });
  assert.equal(n.rjSave.hidden, false); await n.rjSave.fire('click'); assert.equal(records.length, 0);
  n.rjInput.value = '诱导分享'; await n.rjForm.fire('submit');
  await n.rjSave.fire('click'); assert.match(n.rjActionStatus.textContent, /完成当前/);
  busy = false; await n.rjSave.fire('click'); await n.rjSave.fire('click');
  assert.equal(records.length, 1); assert.match(records[0], /诱导分享/);
  assert.match(n.rjActionStatus.textContent, /已在当前会话/);
  n.rjInput.fire('input'); await n.rjSave.fire('click'); assert.equal(records.length, 1);
});

test('sample fills input only; real submission renders evidence and focuses its heading', async () => {
  let calls = 0;
  const { nodes: n } = explainHarness(async ({ query }) => { calls++; return runExplain(query); });
  n.rjSample.fire('click'); assert.equal(calls, 0); assert.equal(n.rjResult.hidden, true);
  assert.equal(n.rjInput.calls.length, 1);
  await n.rjForm.fire('submit');
  assert.equal(calls, 1); assert.equal(n.rjResult.hidden, false); assert.equal(n.rjStatus.dataset.state, 'matched');
  assert.match(n.rjResultItems.text, /官方原文|核验日期/);
  assert.deepEqual(n.rjResultHeading.calls, [['focus', { preventScroll: true }], ['scroll', { block: 'nearest', behavior: 'instant' }]]);
  const links = n.rjResultItems.descendants.filter(node => node.tag === 'a');
  assert.ok(links.length); assert.ok(links.every(link => link.rel === 'noopener noreferrer' && link.href.startsWith('https://')));
  assert.ok(n.rjResultItems.descendants.filter(node => node.tag === 'details').every(node => !node.open));
});

test('different input uses its actual rules and unmatched input never reuses prior results', async () => {
  const { nodes: n } = explainHarness();
  n.rjInput.value = '诱导分享'; await n.rjForm.fire('submit');
  assert.match(n.rjResultItems.text, /诱导/);
  n.rjInput.value = 'nothingxyz'; n.rjInput.fire('input'); assert.equal(n.rjResult.hidden, true);
  await n.rjForm.fire('submit');
  assert.equal(n.rjStatus.dataset.state, 'empty'); assert.match(n.rjResultItems.text, /关键词|未匹配/);
  assert.equal(n.rjResultItems.descendants.filter(node => node.tag === 'article').length, 0);
});

test('empty or excessive input is invalid and retry retains the submitted text', async () => {
  let fail = true, calls = 0;
  const { nodes: n } = explainHarness(async ({ query }) => { calls++; if (fail) throw new Error('本地服务不可用，请重试。'); return runExplain(query); });
  for (const value of [' ', 'x'.repeat(4097)]) { n.rjInput.value = value; await n.rjForm.fire('submit'); assert.equal(n.rjInput.attributes['aria-invalid'], 'true'); }
  assert.equal(calls, 0);
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  assert.equal(n.rjResult.hidden, true); assert.equal(n.rjStatus.dataset.state, 'error'); assert.equal(n.rjInput.value, '隐私');
  assert.equal(n.rjBtn.textContent, '重试查询');
  fail = false; await n.rjForm.fire('submit'); assert.equal(n.rjStatus.dataset.state, 'matched');
});

test('duplicate submit is ignored and editing or stopping discards late results without moving focus', async () => {
  for (const action of ['edit', 'stop', 'pagehide']) {
    let finish, signal, calls = 0;
    const { nodes: n, win } = explainHarness(options => { calls++; signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
    n.rjInput.value = '隐私'; const pending = n.rjForm.fire('submit');
    assert.equal(n.rjBtn.disabled, true); assert.equal(n.rjStop.hidden, false); assert.ok(n.rjStatus.classes.has('is-working'));
    await n.rjForm.fire('submit'); assert.equal(calls, 1);
    if (action === 'edit') { n.rjInput.value = '诱导分享'; n.rjInput.fire('input'); }
    else if (action === 'stop') n.rjStop.fire('click');
    else win.fire('pagehide');
    assert.equal(signal.aborted, true); assert.equal(n.rjBtn.disabled, false);
    finish(runExplain('隐私')); await pending;
    assert.equal(n.rjResult.hidden, true); assert.equal(n.rjResultHeading.calls.length, 0);
    assert.equal(n.rjStop.hidden, true); assert.equal(n.rjStatus.classes.has('is-working'), false);
  }
});

test('rule content is inert text and unvalidated output never renders', async () => {
  const output = runExplain('隐私'); output.items[0].title = '<img src=x onerror=alert(1)>';
  const { nodes: n } = explainHarness(async () => output);
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  assert.match(n.rjResultItems.text, /<img/);
  assert.equal(n.rjResultItems.descendants.some(node => node.tag === 'img'), false);
  await filterNode(n, 'manual').fire('click'); await filterNode(n, 'all').fire('click');
  assert.match(n.rjResultItems.text, /<img/);
  assert.equal(n.rjResultItems.descendants.some(node => node.tag === 'img'), false);
  output.items[0].official_url = 'javascript:alert(1)'; await n.rjForm.fire('submit');
  assert.equal(n.rjResult.hidden, true); assert.equal(n.rjStatus.dataset.state, 'error');
});

test('returning from page cache can run a new query and disposed forms cannot', async () => {
  const { nodes: n, win, dispose } = explainHarness(); n.rjInput.value = '隐私';
  win.fire('pagehide'); await n.rjForm.fire('submit'); assert.equal(n.rjStatus.dataset.state, 'matched');
  dispose(); assert.equal(n.rjForm.listeners.submit, undefined);
});

test('closing a native surface cancels pending work without clearing input or moving focus; completed results remain', async () => {
  let finish, signal;
  const h = explainHarness(options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  h.nodes.rjInput.value = '隐私'; const pending = h.nodes.rjForm.fire('submit');
  h.suspend(); assert.ok(signal.aborted); assert.equal(h.nodes.rjInput.value, '隐私');
  finish(runExplain('隐私')); await pending;
  assert.equal(h.nodes.rjResult.hidden, true); assert.equal(h.nodes.rjResultHeading.calls.length, 0);
  const done = explainHarness(); done.nodes.rjInput.value = '隐私'; await done.nodes.rjForm.fire('submit');
  done.suspend(); assert.equal(done.nodes.rjResult.hidden, false);
});

test('switching projects clears a completed rejection report and discards pending results while preserving the query', async () => {
  const saved = [];
  const done = explainHarness(undefined, { saveResult: text => { saved.push(text); return { ok: true }; } });
  done.nodes.rjInput.value = '隐私'; await done.nodes.rjForm.fire('submit');
  done.reset();
  assert.equal(done.nodes.rjInput.value, '隐私');
  assert.equal(done.nodes.rjResult.hidden, true);
  assert.equal(done.nodes.rjSave.disabled, true);
  assert.match(done.nodes.rjStatus.textContent, /项目已切换/);
  await done.nodes.rjSave.fire('click'); assert.equal(saved.length, 0);

  let finish, signal;
  const pending = explainHarness(options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  pending.nodes.rjInput.value = '隐私'; const request = pending.nodes.rjForm.fire('submit');
  pending.reset(); assert.equal(signal.aborted, true);
  finish(runExplain('隐私')); await request;
  assert.equal(pending.nodes.rjInput.value, '隐私');
  assert.equal(pending.nodes.rjResult.hidden, true);
  assert.equal(pending.nodes.rjResultHeading.calls.length, 0);
});

test('stop and failure return keyboard focus to input; pagehide does not steal focus', async () => {
  for (const action of ['stop', 'error', 'pagehide']) {
    let reject;
    const { nodes: n, root, win } = explainHarness(() => new Promise((_resolve, fail) => { reject = fail; }));
    n.rjInput.value = '隐私'; const pending = n.rjForm.fire('submit');
    n.rjStop.focus();
    if (action === 'stop') n.rjStop.fire('click');
    if (action === 'pagehide') win.fire('pagehide');
    reject(new Error('查询失败，请重试。')); await pending;
    assert.equal(n.rjStop.hidden, true);
    assert.equal(root.activeElement, action === 'pagehide' ? n.rjStop : n.rjInput);
  }
});

function triageOutput(query = '隐私') {
  const output = runExplain(query);
  const base = runExplain('隐私').items[0];
  output.items = [
    { ...base, rejectId: 'reject.one', ruleId: 'rule.one', title: '交叉匹配', severity: 'blocker', manual_required: true, official_url: null },
    { ...base, rejectId: 'reject.one', ruleId: 'rule.two', title: '普通提示', severity: 'warning', manual_required: false },
    { ...base, rejectId: 'reject.two', ruleId: 'rule.one', title: '另一拒因同规则', severity: 'info', manual_required: true },
  ];
  return output;
}
const classNode = (n, name) => n.rjResultItems.descendants.find(node => node.className === name);
const filterNode = (n, name) => n.rjResultItems.descendants.find(node => node.dataset.rjFilter === name);
const rules = n => n.rjResultItems.descendants.filter(node => node.className === 'rj-rule');

test('triage counts overlapping matching items and filters existing groups without stealing focus or disclosure state', async () => {
  const h = explainHarness(async ({ query }) => triageOutput(query)); const n = h.nodes;
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  assert.match(n.rjResultHeading.textContent, /3.*匹配项/);
  for (const [key, count] of [['all', 3], ['action', 1], ['manual', 2], ['source', 1]]) {
    const button = filterNode(n, key); assert.ok(button);
    assert.equal(button.tag, 'button'); assert.equal(button.type, 'button');
    assert.match(button.text, new RegExp(String(count)));
    assert.equal(button.attributes['aria-pressed'], String(key === 'all'));
  }
  const original = rules(n); const evidence = original[2].descendants.find(node => node.tag === 'details'); evidence.open = true;
  const action = filterNode(n, 'action'); action.focus(); await action.fire('click');
  assert.equal(h.root.activeElement, action);
  assert.deepEqual(original.map(node => node.hidden), [false, true, true]);
  assert.deepEqual(n.rjResultItems.descendants.filter(node => node.className === 'rj-group').map(node => node.hidden), [false, true]);
  await filterNode(n, 'manual').fire('click');
  assert.deepEqual(original.map(node => node.hidden), [false, true, false]);
  await filterNode(n, 'source').fire('click');
  assert.deepEqual(original.map(node => node.hidden), [false, true, true]);
  assert.match(classNode(n, 'rj-triage__hint').text, /未收录官方链接/);
  assert.match(original[0].text, /未收录官方链接/);
  assert.equal(original[0].descendants.some(node => node.tag === 'a'), false);
  assert.equal(classNode(n, 'rj-triage__status').text, '缺少官方来源 · 显示 1 / 3 个匹配项');
  await filterNode(n, 'all').fire('click');
  assert.deepEqual(rules(n), original); assert.equal(evidence.open, true);
  const status = classNode(n, 'rj-triage__status');
  assert.equal(status.attributes.role, 'status'); assert.equal(status.attributes['aria-live'], 'polite');
});

test('empty filter offers a focused reset and does not imply that all requirements have passed', async () => {
  const output = triageOutput(); output.items.forEach(item => { item.severity = 'info'; });
  const h = explainHarness(async () => output); const n = h.nodes;
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit'); await filterNode(n, 'action').fire('click');
  const empty = classNode(n, 'rj-triage__empty'); assert.equal(empty.hidden, false);
  assert.match(empty.text, /没有|暂无/); assert.doesNotMatch(empty.text, /通过|合规/);
  const reset = empty.descendants.find(node => 'rjReset' in node.dataset); assert.ok(reset);
  reset.focus(); await reset.fire('click');
  assert.equal(empty.hidden, true); assert.equal(h.root.activeElement, filterNode(n, 'all'));
  assert.ok(rules(n).every(node => !node.hidden));
});

test('filtered results still copy download and save the complete validated artifact', async () => {
  let copied, downloaded, saved;
  const h = explainHarness(async ({ query }) => triageOutput(query), {
    copyText: async text => { copied = text; }, saveResult: text => { saved = text; return { ok: true }; },
    artifactDownloader: { download(artifact) { downloaded = artifact.text; return true; }, dispose() {} },
  });
  const n = h.nodes; n.rjInput.value = '隐私'; await n.rjForm.fire('submit');
  await filterNode(n, 'source').fire('click');
  assert.match(classNode(n, 'rj-triage__hint').text, /筛选仅影响显示/);
  await n.rjCopy.fire('click'); await n.rjDownload.fire('click'); await n.rjSave.fire('click');
  assert.equal(copied, downloaded); assert.equal(copied, saved);
  for (const title of ['交叉匹配', '普通提示', '另一拒因同规则']) assert.ok(copied.includes(title));
});

test('triage survives closing completed results but edit and new queries reset it; empty results omit it', async () => {
  const h = explainHarness(async ({ query }) => query === 'empty' ? runExplain('empty') : triageOutput(query)); const n = h.nodes;
  n.rjInput.value = '隐私'; await n.rjForm.fire('submit'); await filterNode(n, 'manual').fire('click');
  h.suspend(); assert.equal(filterNode(n, 'manual').attributes['aria-pressed'], 'true');
  await n.rjForm.fire('submit'); assert.equal(filterNode(n, 'all').attributes['aria-pressed'], 'true');
  n.rjInput.value = 'empty'; await n.rjInput.fire('input');
  assert.equal(n.rjResult.hidden, true); assert.equal(filterNode(n, 'all'), undefined);
  await n.rjForm.fire('submit'); assert.equal(classNode(n, 'rj-triage'), undefined);
});
