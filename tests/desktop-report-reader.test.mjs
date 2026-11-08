import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';
import { renderMessageText } from '../desktop/design-previews/components/message-markdown.js';
import * as contract from '../desktop/design-previews/repair-handoff.js';
import { runProjectTool } from '../src/project-artifact.mjs';
const ts = createRequire(new URL('../desktop/package.json', import.meta.url))('typescript');
function harness(options = {}) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [];
  document.createElement = tag => {
    const n = create(tag); n.listeners = {}; n.isConnected = true; n.classList = { add() {} };
    n.addEventListener = (type, listener) => { n.listeners[type] = listener; };
    n.focus = () => { document.activeElement = n; };
    n.getClientRects = () => n.hidden ? [] : [{}];
    n.scrollIntoView = options => { n.scrolled = options; };
    n.showModal = () => { n.open = true; };
    n.close = () => { n.open = false; n.listeners.close?.(); };
    n.replaceChildren = (...children) => { n.textContent = ''; n.append(...children); };
    n.getAttribute = key => n[key] ?? n.attributes[key] ?? null;
    n.closest = () => n.tag === 'a' ? n : null;
    n.contains = other => { for (let current = other; current; current = current.parentNode) if (current === n) return true; return false; };
    nodes.push(n); return n;
  };
  document.body = document.createElement('body');
  const source = readFileSync(new URL('../desktop/src/report-reader.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function', 'function');
  const context = vm.createContext({ ...contract, URL, document, createIcon, renderMessageText, createActionButton: (doc, text) => { const n = doc.createElement('wa-button'); n.textContent = text; return n; } });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  let artifact = { id: 'a', runId: 'r', projectId: null, projectRevision: null, contextRevision: null, kind: 'guide', title: '上线清单', createdAt: 1792700000000, toolVersion: 'test', rulesVersion: 'rules', ...runProjectTool('guide', { subject: 'personal' }) };
  let reads = 0, handoffs = 0;
  const fallback = document.createElement('button'), trigger = document.createElement('button');
  const app = context.mountReportReader({ getArtifact: () => { reads++; return artifact; }, getProject: () => null, getRulesVersion: () => 'rules', returnFocus: () => fallback, onHandoff: () => { assert.equal(node('desktop-report-reader').open, false); handoffs++; }, ...options });
  const node = id => nodes.find(n => n.id === id);
  return { app, node, nodes, document, trigger, fallback, get artifact() { return artifact; }, set artifact(value) { artifact = value; }, get reads() { return reads; }, get handoffs() { return handoffs; } };
}
test('reader shows recorded confidence in evidence and distinguishes imported provenance', () => {
  for (const [confidence, label] of [['high', '高'], ['medium', '中'], ['low', '低']]) {
    for (const imported of [false, true]) {
      const h = harness();
      h.artifact.data.result.items[0].confidence = confidence;
      if (imported) h.artifact.provenance = 'imported';
      h.app.open(h.trigger);
      const evidence = h.nodes.find(n => n.className === 'report-reader-evidence');
      assert.ok(evidence.textContent.includes(`${imported ? '备份记录的' : ''}规则置信度：${label}`));
      assert.match(evidence.textContent, /规则维护者对规则准确性的把握/);
      assert.equal(Boolean(evidence.open), false);
    }
  }
});

test('reader leaves legacy rules unrated and falls back for invalid confidence', () => {
  const h = harness();
  for (const item of [...h.artifact.data.result.items, ...h.artifact.data.result.selfCheck]) delete item.confidence;
  h.app.open(h.trigger);
  assert.doesNotMatch(h.node('report-reader-content').textContent, /规则置信度/);
  h.app.close();
  h.artifact.data.result.items[0].confidence = 'certain';
  h.app.open(h.trigger);
  assert.match(h.node('report-reader-summary').textContent, /未提供有效的结构化摘要/);
  assert.equal(h.node('report-reader-original').open, true);
  assert.doesNotMatch(h.node('report-reader-content').textContent, /规则置信度/);
});

test('reader is passive until opened and holds a validated snapshot with visible requirements', () => {
  const h = harness(); assert.equal(h.reads, 0); h.app.open(h.trigger);
  assert.match(h.node('report-reader-content').textContent, /为何关注|需要核对/);
  assert.match(h.node('report-reader-warning').textContent, /历史快照|未实时/);
  const before = h.node('report-reader-content').textContent; h.artifact.title = 'changed';
  assert.equal(h.node('report-reader-content').textContent, before); assert.equal(h.reads, 1);
});

test('reader labels imported project results and preserves specific action categories', () => {
  const h = harness(); h.artifact.provenance = 'imported'; h.app.open(h.trigger);
  assert.match(h.node('report-reader-warning').textContent, /导入|外部/);
  assert.match(h.node('report-reader-warning').textContent, /未.*核验/);
  assert.match(h.node('report-reader-content').textContent, /操作类型/);
  assert.doesNotMatch(h.node('report-reader-content').textContent, /需要本人在官方后台核验/);
});
test('reader falls back to complete original for malformed structured data without inventing a summary', () => {
  const h = harness(); h.artifact = { ...h.artifact, data: null, markdown: '# 历史原文\n保留所有内容' }; h.app.open(h.trigger);
  assert.match(h.node('report-reader-summary').textContent, /未提供.*结构化/);
  assert.match(h.node('report-reader-original').textContent, /保留所有内容/);
  assert.equal(h.node('report-reader-original').open, true);
});
test('reader outline focuses actual item heading without motion', () => {
  const h = harness(); h.app.open(h.trigger);
  const link = h.nodes.find(n => n.tag === 'a' && n.href?.startsWith('#reader-item-'));
  let prevented = false; link.listeners.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.document.activeElement.id, link.href.slice(1));
  assert.equal(h.document.activeElement.scrolled.behavior, 'instant');
});
test('reader empty state has no fake summary or handoff and closes to visible fallback', () => {
  const h = harness(); h.artifact = null; h.app.open(h.trigger);
  assert.match(h.node('report-reader-content').textContent, /尚无报告/); assert.equal(h.node('report-reader-handoff').hidden, true);
  h.trigger.hidden = true; h.app.close(); assert.equal(h.document.activeElement, h.fallback);
});
test('reader renders hostile title as inert text and handoff only on explicit action', () => {
  const h = harness(); h.artifact.data.result.items[0].title = '<img src=x onerror=alert(1)>';
  h.app.open(h.trigger); assert.match(h.node('report-reader-content').textContent, /<img src=x/);
  assert.equal(h.handoffs, 0); h.node('report-reader-handoff').listeners.click(); assert.equal(h.handoffs, 1);
});
test('reader zero item partial scan remains a warning rather than a pass', () => {
  const h = harness(); h.artifact = { ...h.artifact, kind: 'check', data: { schemaVersion: 1, kind: 'check', result: { command: 'check', items: [], meta: { scan: { filesScanned: 0, scope: { complete: false } } } } } };
  h.app.open(h.trigger); assert.match(h.node('report-reader-warning').textContent, /扫描不完整/);
  assert.match(h.node('report-reader-content').textContent, /不代表.*通过/);
});
test('reader exposes explicit repair only for local project checks and rejects a changed reading snapshot', () => {
  let repairs = 0;
  const h = harness({ onRepair: () => { assert.equal(h.node('desktop-report-reader').open, false); repairs++; } });
  h.artifact = { ...h.artifact, projectId: 'p', projectRevision: 1, kind: 'check', data: { schemaVersion: 1, kind: 'check', result: { command: 'check', items: [], meta: { scan: { filesScanned: 1, scope: { complete: true } } } } } };
  h.app.open(h.trigger);
  assert.equal(h.node('report-reader-repair').hidden, false);
  h.artifact = { ...h.artifact, id: 'changed' };
  h.node('report-reader-repair').listeners.click();
  assert.equal(repairs, 0); assert.equal(h.node('desktop-report-reader').open, true);
  h.app.close(); h.app.open(h.trigger); h.node('report-reader-repair').listeners.click();
  assert.equal(repairs, 1);
  h.artifact = { ...h.artifact, provenance: 'imported' }; h.app.open(h.trigger);
  assert.equal(h.node('report-reader-repair').hidden, true);
  h.node('report-reader-repair').listeners.click(); assert.equal(repairs, 1);
});
test('reader stops a handoff when the selected report changes while reading', () => {
  const h = harness(); h.app.open(h.trigger); h.artifact = { ...h.artifact, id: 'another-report' };
  h.node('report-reader-handoff').listeners.click();
  assert.equal(h.handoffs, 0); assert.equal(h.node('desktop-report-reader').open, true);
  assert.match(h.node('report-reader-warning').textContent, /报告已经变化/);
});
test('reader preserves safe original content and rejects unsafe structured links', () => {
  const h = harness(); h.artifact.data.result.items[0].official_url = 'javascript:alert(1)';
  h.artifact.markdown = '[unsafe](javascript:alert(1))\n![remote](https://example.com/a.png)'; h.app.open(h.trigger);
  assert.match(h.node('report-reader-summary').textContent, /未提供.*结构化/);
  assert.equal(h.nodes.some(n => n.tag === 'img'), false);
  assert.equal(h.nodes.some(n => n.href?.startsWith('javascript:') || n.attributes.href?.startsWith('javascript:')), false);
});
test('reader announces stale rules and closing/reopening rereads the selected snapshot', () => {
  const h = harness(); h.artifact.rulesVersion = 'old'; h.app.open(h.trigger);
  assert.match(h.node('report-reader-warning').textContent, /规则资料已变化/);
  h.app.close(); assert.equal(h.document.activeElement, h.trigger);
  h.artifact.title = '新报告'; h.app.open(h.trigger); assert.equal(h.node('report-reader-title').textContent, '新报告');
  h.app.destroy(); h.app.open(h.trigger); assert.equal(h.reads, 2);
});
test('reader exposes validated saved time and source versions without exposing another project name', () => {
  const h = harness({ getProject: () => ({ id: 'unrelated', name: '不要错误显示此项目', revision: 0 }) });
  h.artifact.projectId = 'source-project'; h.app.open(h.trigger);
  assert.match(h.node('report-reader-provenance').textContent, /保存于.*来源项目 source-project/);
  assert.doesNotMatch(h.node('report-reader-provenance').textContent, /不要错误/);
  assert.match(h.node('report-reader-versions').textContent, /工具 test.*规则版本 rules/s);
});
test('reader routes explicit external clicks including original links and leaves outline anchors alone', async () => {
  const opened = [], h = harness({ onOpenSource: async url => { opened.push(url); } });
  h.artifact.markdown = '[原文依据](https://example.com/source)'; h.app.open(h.trigger);
  assert.deepEqual(opened, []);
  const body = h.nodes.find(n => n.className === 'report-reader-body');
  const external = h.nodes.find(n => n.attributes.href === 'https://example.com/source');
  let prevented = false; body.listeners.click({ target: external, preventDefault() { prevented = true; } }); await setImmediate();
  assert.equal(prevented, true); assert.deepEqual(opened, ['https://example.com/source']);
  const outline = h.nodes.find(n => n.href?.startsWith('#reader-item-'));
  body.listeners.click({ target: outline, preventDefault() { assert.fail('Outline must retain its own behavior'); } }); await setImmediate();
  assert.equal(opened.length, 1);
});
test('reader external failure is retryable and an old pending failure cannot change a reopened snapshot', async () => {
  let fail;
  const h = harness({ onOpenSource: () => new Promise((_, reject) => { fail = reject; }) }); h.app.open(h.trigger);
  const body = h.nodes.find(n => n.className === 'report-reader-body');
  const link = h.nodes.find(n => n.href?.startsWith('https://'));
  body.listeners.click({ target: link, preventDefault() {} }); await setImmediate(); fail(new Error('no browser')); await setImmediate();
  assert.match(h.node('report-reader-link-status').textContent, /再次点击.*重试/);
  body.listeners.click({ target: link, preventDefault() {} }); await setImmediate();
  h.app.close(); h.app.open(h.trigger); fail(new Error('late')); await setImmediate();
  assert.equal(h.node('report-reader-link-status').textContent, '');
});
test('reader keeps real guide unknown facts and conditional business signals outside disclosures', () => {
  const h = harness(); h.app.open(h.trigger);
  assert.match(h.node('report-reader-context').textContent, /事实尚未确认.*未知不等于不适用/);
  assert.match(h.node('report-reader-content').textContent, /业务自查线索：变更、改名、/);
  const clue = h.nodes.find(n => n.tag === 'p' && n.textContent.startsWith('业务自查线索：变更'));
  assert.equal(clue.parentNode.tag, 'article');
});
test('reader keeps real check parse errors, dynamic URLs and item notes visible', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shipmate-reader-'));
  try {
    writeFileSync(join(directory, 'app.json'), '{broken');
    writeFileSync(join(directory, 'app.js'), "wx.request({url: baseURL + '/data'}); wx.getLocation({});");
    const h = harness(); h.artifact = { ...h.artifact, kind: 'check', ...runProjectTool('check', { directory, subject: 'personal' }) }; h.app.open(h.trigger);
    assert.match(h.node('report-reader-context').textContent, /配置文件读取\/解析失败/);
    assert.match(h.node('report-reader-context').textContent, /动态拼接.*漏报/);
    for (const item of h.artifact.data.result.items.filter(item => item.note)) {
      const paragraph = h.nodes.find(n => n.tag === 'p' && n.textContent.includes(item.note));
      assert.equal(paragraph?.parentNode.tag, 'article');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('reader keeps real guide skipped-stage and explain limitations visible', () => {
  const h = harness(); h.artifact = { ...h.artifact, ...runProjectTool('guide', { subject: 'personal', facts: { collectsSensitive: false, hasServerDomain: false } }) }; h.app.open(h.trigger);
  assert.match(h.node('report-reader-context').textContent, /按你的输入跳过阶段/);
  h.app.close(); h.artifact = { ...h.artifact, kind: 'explain', ...runProjectTool('explain', { query: '完全不匹配的陌生拒绝内容 xyz' }) }; h.app.open(h.trigger);
  for (const note of h.artifact.data.result.notes) assert.ok(h.node('report-reader-context').textContent.includes(note));
});
test('reader opens original when run context or conditional signals cannot be validated', () => {
  for (const mutate of [result => { delete result.notes; }, result => { result.notes = ['x'.repeat(4097)]; }, result => { result.selfCheck[0].signal = { unsupported: true }; }]) {
    const h = harness(); mutate(h.artifact.data.result); h.app.open(h.trigger);
    assert.equal(h.node('report-reader-original').open, true);
    assert.match(h.node('report-reader-warning').textContent, /摘要仅涵盖已验证条目/);
    assert.equal(h.node('report-reader-context').hidden, true);
  }
});
