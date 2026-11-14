import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';
const ts = createRequire(new URL('../desktop/package.json', import.meta.url))('typescript');
const source = readFileSync(new URL('../desktop/src/source-freshness.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const result = (extra = {}) => ({ schemaVersion: 1, catalogVersion: 'a'.repeat(64), sourceId: 'official', checkedAt: 2000, state: 'unchanged', reason: 'same', httpStatus: 200, contentHash: 'hash', ...extra });
const snapshot = () => ({ catalog: { schemaVersion: 1, catalogVersion: 'a'.repeat(64), staleDays: 180, sources: [{ id: 'official', url: 'https://example.org/official', title: '官方来源', references: [{ id: 'R-01', title: '规则', lastVerified: '2024-01-01', draft: false }], baseline: { hash: 'hash', fetchedAt: '2024-02-01', method: 'fetch' } }, { id: 'manual', url: 'https://example.org/manual', title: '人工来源', references: [], baseline: { hash: 'hash', fetchedAt: '2024-02-01', method: 'manual' } }] }, checks: [{ sourceId: 'official', latest: result(), lastEvidence: result() }] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness(handle) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [], calls = [];
  document.createElement = tag => { const node = create(tag); node.listeners = {}; node.isConnected = true; node.classList = { add() {} }; node.addEventListener = (name, fn) => { node.listeners[name] = fn; }; node.focus = () => { document.activeElement = node; }; node.showModal = () => { node.open = true; }; node.close = () => { node.open = false; node.listeners.close?.(); }; nodes.push(node); return node; };
  document.body = document.createElement('body'); let ids = 0;
  const context = vm.createContext({ document, createIcon, crypto: { randomUUID: () => `owned-${++ids}` }, createActionButton: (doc, text) => { const b = doc.createElement('wa-button'); b.textContent = text; return b; } });
  vm.runInContext(script, context);
  const app = context.mountSourceFreshness({ invoke: async (name, args) => { calls.push({ name, args }); const value = await (handle ? handle(name, args) : name === 'source_freshness_snapshot' ? snapshot() : result()); return name === 'source_freshness_check' && value?.schemaVersion ? { sourceId: value.sourceId, latest: value, lastEvidence: value.contentHash ? value : result() } : value; } });
  const node = id => nodes.find(n => n.id === id), anchor = document.createElement('button');
  const check = () => node('source-freshness-list').children[0].children[1].children.find(n => n.tag === 'wa-button');
  return { app, node, calls, anchor, document, open: async () => { app.open(anchor); await setImmediate(); }, click: async id => { node(id).listeners.click(); await setImmediate(); }, check: async () => { check().listeners.click(); await setImmediate(); } };
}
test('open and refresh are offline; sources are compact and dates/evidence separated', async () => {
  const h = harness(); await h.open(); await h.click('source-freshness-reload');
  assert.deepEqual(h.calls.map(c => c.name), ['source_freshness_snapshot', 'source_freshness_snapshot']);
  const rows = h.node('source-freshness-list').children; assert.equal(rows.length, 2); assert.equal(rows[0].open, false);
  assert.match(rows[0].textContent, /维护核验日期/); assert.match(rows[0].textContent, /正文归档日期/); assert.match(rows[0].textContent, /上次在线尝试/); assert.match(rows[0].textContent, /保留的有效正文证据/);
  assert.match(rows[1].textContent, /需人工核验/); assert.equal(rows[1].children[1].children.some(n => n.tag === 'wa-button'), false);
});

test('source search combines title URL and rule matching with state filtering without requests or row replacement', async () => {
  const h = harness(); await h.open(); const calls = h.calls.length;
  const rows = h.node('source-freshness-list').children;
  rows[0].open = true; rows[0].listeners.toggle();
  const search = value => { h.node('source-freshness-search').value = value; h.node('source-freshness-search').listeners.input(); };
  const filter = value => { h.node('source-freshness-filter').value = value; h.node('source-freshness-filter').listeners.change(); };
  search(' r-01 '); assert.equal(rows[0].hidden, false); assert.equal(rows[1].hidden, true);
  assert.equal(h.node('source-freshness-count').textContent, '1 / 2 个来源');
  search('EXAMPLE.ORG/MANUAL'); assert.equal(rows[0].hidden, true); assert.equal(rows[1].hidden, false);
  search('官方'); filter('manual'); assert.equal(h.node('source-freshness-empty').hidden, false);
  assert.equal(h.node('source-freshness-count').textContent, '0 / 2 个来源');
  await h.click('source-freshness-clear');
  assert.equal(h.node('source-freshness-filter').value, 'all'); assert.equal(h.node('source-freshness-search').value, '');
  assert.equal(h.node('source-freshness-empty').hidden, true); assert.equal(rows[0].open, true);
  assert.equal(h.node('source-freshness-list').children[0], rows[0]); assert.equal(h.document.activeElement, h.node('source-freshness-search'));
  assert.equal(h.calls.length, calls);
});

test('source check completion updates filtered counts and returns hidden-row focus to search', async () => {
  const pending = deferred(); const h = harness(name => name === 'source_freshness_snapshot' ? snapshot() : pending.promise); await h.open();
  h.node('source-freshness-filter').value = 'unchanged'; h.node('source-freshness-filter').listeners.change();
  await h.check();
  h.node('source-freshness-list').children[0].children[0].focus();
  pending.resolve(result({ state: 'changed', reason: 'different' })); await setImmediate();
  assert.equal(h.node('source-freshness-count').textContent, '0 / 2 个来源');
  assert.equal(h.node('source-freshness-empty').hidden, false);
  assert.equal(h.document.activeElement, h.node('source-freshness-search'));
  assert.equal(h.calls.filter(call => call.name === 'source_freshness_check').length, 1);
  await h.click('source-freshness-clear');
  assert.match(h.node('source-freshness-list').textContent, /正文与归档不同/);
});
test('explicit source check uses only catalog source ID and owned run ID, renders persisted result', async () => {
  const h = harness((name) => name === 'source_freshness_snapshot' ? snapshot() : result({ state: 'changed', reason: 'different' })); await h.open(); await h.check();
  const call = h.calls.find(c => c.name === 'source_freshness_check'); assert.equal(call.args.sourceId, 'official'); assert.equal(call.args.runId, 'owned-1'); assert.equal(Object.keys(call.args).length, 2);
  assert.match(h.node('source-freshness-status').textContent, /正文与归档不同/); assert.match(h.node('source-freshness-description').textContent, /不代表政策已更新/);
});
test('failed read retains saved content and reload recovers', async () => {
  let fail = false; const h = harness(() => { if (fail) throw new Error('sqlite'); return snapshot(); }); await h.open(); fail = true; await h.click('source-freshness-reload');
  assert.match(h.node('source-freshness-status').textContent, /保留/); assert.equal(h.node('source-freshness-list').children.length, 2);
  fail = false; await h.click('source-freshness-reload'); assert.equal(h.node('source-freshness-status').dataset.error, 'false');
});
test('network failure retains last body evidence and can retry', async () => {
  let fail = true; const h = harness(name => { if (name === 'source_freshness_snapshot') return snapshot(); if (fail) throw new Error('network'); return result({ state: 'unavailable', reason: 'network', contentHash: null }); });
  await h.open(); await h.check(); assert.match(h.node('source-freshness-status').textContent, /未能完成/);
  fail = false; await h.check(); assert.match(h.node('source-freshness-list').textContent, /本次无法读取/); assert.match(h.node('source-freshness-list').textContent, /保留的有效正文证据/);
});
test('stop cancels only owned run and ignores late completion', async () => {
  const pending = deferred(); const h = harness(name => name === 'source_freshness_snapshot' ? snapshot() : name === 'source_freshness_check' ? pending.promise : null);
  await h.open(); await h.check(); assert.equal(h.node('source-freshness-stop').disabled, false); await h.click('source-freshness-stop');
  assert.equal(h.calls.find(c => c.name === 'run_cancel').args.runId, 'owned-1'); pending.resolve(result({ state: 'changed', reason: 'different' })); await setImmediate();
  assert.match(h.node('source-freshness-status').textContent, /已停止/); assert.equal(h.node('source-freshness-reload').disabled, false);
});
test('close cancels check, restores focus and reopening reloads SQLite without late UI writes', async () => {
  const pending = deferred(); let reads = 0;
  const h = harness(name => { if (name === 'source_freshness_snapshot') { reads++; return snapshot(); } return name === 'source_freshness_check' ? pending.promise : null; });
  await h.open(); await h.check(); h.app.close(); assert.equal(h.document.activeElement, h.anchor); await h.open();
  pending.resolve(result({ state: 'changed', reason: 'different' })); await setImmediate(); assert.equal(reads, 2); assert.match(h.node('source-freshness-status').textContent, /未发起在线/);
  assert.equal(h.calls.filter(c => c.name === 'run_cancel').length, 1); h.app.destroy(); assert.equal(h.document.body.children.length, 0);
});
test('old snapshot cannot replace reopened snapshot and destroy cancels active work', async () => {
  const pending = deferred(); let reads = 0; const h = harness(name => name === 'source_freshness_snapshot' ? ++reads === 1 ? pending.promise : snapshot() : new Promise(() => {}));
  await h.open(); h.app.close(); await h.open(); pending.reject(new Error('old')); await setImmediate(); assert.equal(h.node('source-freshness-status').dataset.error, 'false');
  await h.check(); h.app.destroy(); assert.equal(h.calls.filter(c => c.name === 'run_cancel').length, 1);
});
test('stop failure remains recoverable and mismatched result never replaces saved record', async () => {
  const pending = deferred(); const h = harness(name => { if (name === 'source_freshness_snapshot') return snapshot(); if (name === 'run_cancel') throw new Error('cancel'); return pending.promise; });
  await h.open(); await h.check(); await h.click('source-freshness-stop'); assert.equal(h.node('source-freshness-stop').disabled, false);
  pending.resolve(result({ sourceId: 'wrong' })); await setImmediate(); assert.match(h.node('source-freshness-status').textContent, /未能完成/); assert.match(h.node('source-freshness-list').textContent, /正文与归档一致/);
});

test('stop acknowledgement keeps controls blocked until the owned check settles', async () => {
  const pending = deferred(); const h = harness(name => name === 'source_freshness_snapshot' ? snapshot() : name === 'source_freshness_check' ? pending.promise : null);
  await h.open(); await h.check(); await h.click('source-freshness-stop');
  assert.equal(h.node('source-freshness-reload').disabled, true); assert.equal(h.node('source-freshness-stop').disabled, true);
  await h.check(); assert.equal(h.calls.filter(c => c.name === 'source_freshness_check').length, 1);
  pending.reject(new Error('canceled')); await setImmediate(); assert.equal(h.node('source-freshness-reload').disabled, false);
});
test('pure dates remain calendar dates; invalid/future dates demand review and manual records are not online attempts', async () => {
  const saved = snapshot(); saved.catalog.sources[0].references.push({ id: 'bad', title: '坏日期', lastVerified: '2024-02-30', draft: false }, { id: 'future', title: '未来日期', lastVerified: '2099-01-01', draft: false });
  saved.checks.push({ sourceId: 'manual', latest: result({ sourceId: 'manual', state: 'manual', reason: 'manual', contentHash: null }), lastEvidence: null });
  const h = harness(() => saved); await h.open(); const rows = h.node('source-freshness-list').children;
  assert.match(rows[0].textContent, /维护核验日期：2024-01-01/); assert.match(rows[0].textContent, /正文归档日期：2024-02-01/);
  assert.equal((rows[0].textContent.match(/日期异常，需人工核验/g) ?? []).length, 2);
  assert.match(rows[1].textContent, /上次人工状态记录/); assert.doesNotMatch(rows[1].textContent, /上次在线尝试/);
});
test('row redraw restores matching keyboard focus without stealing focus from footer', async () => {
  const pending = deferred(); const h = harness(name => name === 'source_freshness_snapshot' ? snapshot() : pending.promise); await h.open();
  const first = h.node('source-freshness-list').children[0]; first.children[1].children.find(n => n.tag === 'wa-button').focus();
  await h.check(); assert.equal(h.document.activeElement, h.node('source-freshness-list').children[0].children[0]);
  h.node('source-freshness-done').focus(); pending.resolve(result()); await setImmediate(); assert.equal(h.document.activeElement, h.node('source-freshness-done'));
});
test('native check envelope supplies authoritative last evidence', async () => {
  const envelope = { sourceId: 'official', latest: result({ state: 'unavailable', reason: 'access', contentHash: null }), lastEvidence: result({ state: 'changed', reason: 'different', checkedAt: 1234 }) };
  const h = harness(name => name === 'source_freshness_snapshot' ? snapshot() : envelope); await h.open(); await h.check();
  assert.match(h.node('source-freshness-list').textContent, /保留的有效正文证据：.*正文与归档不同/);
});
test('completion preserves official source link focus after tabbing there during a pending check', async () => {
  const pending = deferred(); const h = harness(name => name === 'source_freshness_snapshot' ? snapshot() : pending.promise);
  await h.open(); await h.check();
  const before = h.node('source-freshness-list').children[0].children[1].children.find(n => n.tag === 'a'); before.focus();
  pending.resolve(result()); await setImmediate();
  const after = h.node('source-freshness-list').children[0].children[1].children.find(n => n.tag === 'a');
  assert.notEqual(before, after); assert.equal(h.document.activeElement, after); assert.equal(after.href, 'https://example.org/official');
});
