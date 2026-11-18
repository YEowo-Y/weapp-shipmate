import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TextEncoder } from 'node:util';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createIcon } from '../desktop/design-previews/components/icons.js';
import { renderMessageText } from '../desktop/design-previews/components/message-markdown.js';
import * as contract from '../desktop/design-previews/repair-handoff.js';
import { runProjectTool } from '../src/project-artifact.mjs';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Optional for CLI-only installation. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Install desktop dependencies' }, fn);
function harness({ copyText = async () => {}, getProject = () => null, getRulesVersion = () => 'rules', loadSourceCatalog = async () => null } = {}) {
  const downloads = [];
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [];
  document.createElement = tag => {
    const node = create(tag); node.listeners = {}; node.isConnected = true; node.classList = { add() {} };
    node.addEventListener = (type, listener) => { node.listeners[type] = listener; };
    node.focus = () => { document.activeElement = node; };
    node.showModal = () => { node.open = true; };
    node.close = () => { node.open = false; node.listeners.close?.(); };
    node.prepend = child => { child.parentNode = node; node.children.unshift(child); };
    node.replaceChildren = (...children) => { node.textContent = ''; node.append(...children); };
    nodes.push(node); return node;
  };
  document.body = document.createElement('body');
  const source = readFileSync(new URL('../desktop/src/repair-handoff.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function', 'function');
  const context = vm.createContext({ ...contract, Error, URL, TextEncoder, document, createIcon, renderMessageText, createActionButton: (doc, label) => { const node = doc.createElement('wa-button'); node.textContent = label; return node; }, createArtifactDownloader: () => ({ download: value => { downloads.push(value); return true; }, dispose() {} }) });
  const formatter = new URL('../desktop/src/handoff-summary.ts', import.meta.url);
  const runModule = text => vm.runInContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  runModule(readFileSync(formatter, 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function', 'function'));
  runModule(source);
  const artifact = { id: 'source-1', runId: 'run-1', projectId: null, projectRevision: null, contextRevision: null, kind: 'guide', title: '上线清单', createdAt: 1792700000000, toolVersion: 'test', rulesVersion: 'rules', ...runProjectTool('guide', { subject: 'personal' }) };
  const app = context.mountRepairHandoff({ getArtifact: () => artifact, getProject, getRulesVersion, isBusy: () => false, copyText, loadSourceCatalog });
  const node = id => nodes.find(node => node.id === id), trigger = document.createElement('button');
  const select = text => { node('handoff-file').files = [{ size: 100, text }]; node('handoff-file').listeners.change(); };
  return { app, artifact, node, trigger, select, document, downloads };
}
desktopTest('handoff replaces the empty state and does not duplicate content on reopen', () => {
  const h = harness(); h.app.open(h.trigger, true);
  const text = h.node('handoff-content').textContent;
  assert.doesNotMatch(text, /尚未打开交接内容/); assert.match(text, /期望结果/);
  h.node('desktop-handoff').close(); h.app.open(h.trigger, true);
  assert.equal(h.node('handoff-content').textContent, text);
  assert.equal(h.node('handoff-basis').open, false);
});

desktopTest('shared Markdown reflects the project and rules at sharing time while JSON preserves the report', async () => {
  const project = { id: 'test-project', revision: 1, contextRevision: 1 };
  let rulesVersion = 'rules', copied;
  const h = harness({ getProject: () => project, getRulesVersion: () => rulesVersion, copyText: async text => { copied = text; } });
  Object.assign(h.artifact, { projectId: project.id, projectRevision: 1, contextRevision: 1 });
  h.app.open(h.trigger, true);
  await h.node('handoff-copy').listeners.click();
  assert.doesNotMatch(copied, /分享时的版本核对/);
  project.revision++;
  project.contextRevision++;
  rulesVersion = 'new-rules';
  h.node('handoff-markdown').listeners.click();
  await h.node('handoff-copy').listeners.click();
  assert.equal(copied, h.downloads[0].text);
  assert.match(copied, /分享时的版本核对[\s\S]*项目版本已变化[\s\S]*项目事实已变化[\s\S]*规则资料已变化/);
  h.node('handoff-json').listeners.click();
  assert.deepEqual(contract.parseHandoff(h.downloads[1].text), contract.createHandoff(h.artifact));
});

desktopTest('restored project report retains imported provenance in reading and exported handoff', () => {
  const h = harness(); h.artifact.provenance = 'imported';
  h.app.open(h.trigger, true);
  assert.match(h.node('handoff-provenance').textContent, /外部|导入/);
  assert.match(h.node('handoff-warning').textContent, /未.*核验/);
  const pack = contract.createHandoff(h.artifact);
  assert.equal(pack.source.provenance, 'imported');
  assert.match(contract.exportHandoff(pack, 'markdown').text, /外部.*未.*核验/);
  assert.equal(contract.parseHandoff(contract.exportHandoff(pack, 'json').text).source.provenance, 'imported');
});
desktopTest('external handoff keeps unverified provenance through copy, downloads and reopening', async () => {
  const copied = [];
  const h = harness({ copyText: async value => { copied.push(value); } });
  const original = contract.createHandoff(h.artifact);
  h.app.open(h.trigger, true);
  h.node('handoff-json').listeners.click();
  assert.equal(JSON.parse(h.downloads[0].text).source.provenance, undefined);
  h.select(async () => contract.exportHandoff(original, 'json').text);
  await setImmediate();
  h.node('handoff-json').listeners.click();
  h.node('handoff-markdown').listeners.click();
  const exported = contract.parseHandoff(h.downloads[1].text);
  assert.equal(exported.source.provenance, 'imported');
  assert.deepEqual(exported.items, original.items);
  assert.match(h.downloads[2].text, /外部导入报告.*未在本机核验/);
  assert.match(h.downloads[2].text, /备份记录的规则置信度/);
  await h.node('handoff-copy').listeners.click();
  assert.match(copied[0], /外部文件.*来源未核验/);
  assert.match(copied[0], /备份记录的规则置信度/);
  h.select(async () => h.downloads[1].text);
  await setImmediate();
  assert.match(h.node('handoff-content').textContent, /外部导入报告/);
  h.node('desktop-handoff').close();
  h.app.open(h.trigger, true);
  h.node('handoff-json').listeners.click();
  assert.equal(JSON.parse(h.downloads[3].text).source.provenance, undefined);
  assert.equal(h.artifact.provenance, undefined);
});

desktopTest('late file read cannot replace a newer report after close and reopen', async () => {
  const h = harness(); h.app.open(h.trigger, true);
  let finish;
  h.select(() => new Promise(resolve => { finish = resolve; }));
  assert.equal(h.node('handoff-open').disabled, true);
  h.node('desktop-handoff').close();
  assert.equal(h.document.activeElement, h.trigger);
  h.artifact.id = 'new-source'; h.app.open(h.trigger, true);
  const external = contract.createHandoff({ ...h.artifact, id: 'old-external' });
  finish(contract.exportHandoff(external, 'json').text); await setImmediate();
  assert.match(h.node('handoff-source').textContent, /new-source/);
  assert.doesNotMatch(h.node('handoff-source').textContent, /old-external/);
  assert.match(h.node('handoff-provenance').textContent, /本机/);
  assert.equal(h.node('handoff-open').disabled, false);
});
desktopTest('failed handoff for a different report clears the previous source and disables sharing until recovery', async () => {
  const copied = [];
  const h = harness({ copyText: async value => { copied.push(value); } });
  h.app.open(h.trigger, true);
  const { data } = h.artifact;
  h.node('desktop-handoff').close();
  h.artifact.id = 'source-2';
  h.artifact.data = null;
  h.app.open(h.trigger, true);
  assert.equal(h.node('handoff-copy').disabled, true);
  assert.equal(h.node('handoff-json').disabled, true);
  assert.equal(h.node('handoff-markdown').disabled, true);
  assert.equal(h.node('handoff-open').disabled, false);
  assert.equal(h.node('handoff-basis').hidden, true);
  assert.doesNotMatch(h.node('handoff-source').textContent, /source-1/);
  assert.doesNotMatch(h.node('handoff-content').textContent, /期望结果/);
  assert.match(h.node('handoff-status').textContent, /当前报告/);
  await h.node('handoff-copy').listeners.click();
  h.node('handoff-json').listeners.click();
  assert.deepEqual(copied, []);
  assert.deepEqual(h.downloads, []);
  h.node('desktop-handoff').close();
  h.artifact.data = data;
  h.app.open(h.trigger, true);
  assert.equal(h.node('handoff-json').disabled, false);
  h.node('handoff-json').listeners.click();
  assert.equal(JSON.parse(h.downloads[0].text).source.artifactId, 'source-2');
});

desktopTest('invalid import preserves prior content and valid retry remains external', async () => {
  const h = harness(); h.app.open(h.trigger, true);
  const previous = h.node('handoff-content').textContent;
  h.select(async () => '{broken'); await setImmediate();
  assert.equal(h.node('handoff-content').textContent, previous);
  assert.match(h.node('handoff-status').textContent, /已保留/);
  h.select(async () => contract.exportHandoff(contract.createHandoff(h.artifact), 'json').text); await setImmediate();
  assert.match(h.node('handoff-provenance').textContent, /外部文件.*未核验/);
  assert.match(h.node('handoff-content').textContent, /外部导入报告.*未在本机核验/);
  assert.equal(h.node('handoff-status').dataset.error, 'false');
});
desktopTest('destroy invalidates pending file reads without updating detached content', async () => {
  const h = harness(); h.app.open(h.trigger, true);
  let finish; h.select(() => new Promise(resolve => { finish = resolve; }));
  const before = h.node('handoff-source').textContent;
  h.app.destroy(); finish(contract.exportHandoff(contract.createHandoff({ ...h.artifact, id: 'late' }), 'json').text); await setImmediate();
  assert.equal(h.node('handoff-source').textContent, before);
});

desktopTest('handoff copies complete Markdown only after clipboard success and supports retry', async () => {
  let fail = true; const copied = [];
  const h = harness({ copyText: async value => { if (fail) throw Error('denied'); copied.push(value); } });
  h.app.open(h.trigger, true);
  await h.node('handoff-copy').listeners.click();
  assert.match(h.node('handoff-status').textContent, /复制失败.*重试/);
  assert.equal(h.node('handoff-copy').disabled, false);
  fail = false; await h.node('handoff-copy').listeners.click();
  assert.equal(copied[0], contract.exportHandoff(contract.createHandoff(h.artifact), 'markdown').text);
  assert.match(h.node('handoff-status').textContent, /已复制/);
  assert.equal(h.node('handoff-status').dataset.error, 'false');
  h.select(async () => contract.exportHandoff(contract.createHandoff(h.artifact), 'json').text); await setImmediate();
  await h.node('handoff-copy').listeners.click();
  assert.match(copied[1], /^> 外部文件 · 来源未核验/);
  h.app.destroy();
});

desktopTest('late clipboard completion cannot change feedback after close and reopen', async () => {
  let finish; const h = harness({ copyText: () => new Promise(resolve => { finish = resolve; }) });
  h.app.open(h.trigger, true);
  const copying = h.node('handoff-copy').listeners.click();
  assert.equal(h.node('handoff-copy').disabled, true);
  assert.equal(h.node('handoff-open').disabled, true);
  h.node('desktop-handoff').close(); h.app.open(h.trigger, true);
  finish(); await copying;
  assert.equal(h.node('handoff-status').textContent, '');
  assert.equal(h.node('handoff-copy').disabled, false);
  h.app.destroy();
});

const sourceCatalog = {
  catalog: { schemaVersion: 1, sources: [{
    url: 'https://developers.weixin.qq.com/miniprogram/dev/framework/',
    references: [{ id: 'privacy.getLocation', title: '目录中核验的地点权限', lastVerified: '2026-11-13', draft: false }],
  }] },
};

function summaryHarness(options = {}) {
  const project = { id: 'summary-project', revision: 1, contextRevision: 1 };
  const h = harness({ getProject: () => project, loadSourceCatalog: async () => sourceCatalog, ...options });
  Object.assign(h.artifact, runProjectTool('explain', { query: '地理位置接口没有在隐私保护指引中声明位置信息' }), {
    projectId: project.id, projectRevision: 1, contextRevision: 1, kind: 'explain',
  });
  h.app.open(h.trigger, true);
  return h;
}

desktopTest('agent handoff previews the exact plain text before copying', async () => {
  let reads = 0;
  const copies = [];
  const h = summaryHarness({ loadSourceCatalog: async () => { reads++; return sourceCatalog; }, copyText: async text => { copies.push(text); } });
  const generate = h.node('handoff-agent-generate');
  const copy = h.node('handoff-agent-copy');
  const preview = h.node('handoff-agent-text');
  assert.equal(reads, 0);
  assert.equal(copy.disabled, true);
  generate.focus();
  await generate.listeners.click();
  assert.equal(reads, 1);
  assert.equal(preview.readOnly, true);
  assert.equal(h.document.activeElement, preview);
  assert.equal(preview.selectionStart, 0);
  assert.equal(preview.scrollTop, 0);
  assert.equal(h.node('handoff-agent-preview').hidden, false);
  assert.match(preview.value, /privacy\.getLocation.*目录中核验的地点权限/s);
  assert.doesNotMatch(preview.value, /summary-project|地理位置接口没有在隐私保护指引中声明位置信息/);
  assert.deepEqual(copies, []);
  await copy.listeners.click();
  assert.deepEqual(copies, [preview.value]);
  assert.match(h.node('handoff-agent-status').textContent, /已复制/);
  h.node('desktop-handoff').close();
  assert.equal(h.node('handoff-agent-preview').hidden, true);
  assert.equal(preview.value, '');
  assert.equal(h.document.activeElement, h.trigger);
});

desktopTest('agent handoff reports catalog and clipboard failures and keeps retry available', async () => {
  let catalogUnavailable = true, blocked = true;
  const h = summaryHarness({
    loadSourceCatalog: async () => {
      if (catalogUnavailable) throw Error('internal-catalog-path');
      return sourceCatalog;
    },
    copyText: async () => { if (blocked) throw Error('internal-clipboard-detail'); },
  });
  const generate = h.node('handoff-agent-generate');
  const copy = h.node('handoff-agent-copy');
  const status = h.node('handoff-agent-status');
  await generate.listeners.click();
  assert.match(status.textContent, /规则来源目录/);
  assert.doesNotMatch(status.textContent, /internal-catalog-path/);
  assert.equal(copy.disabled, true);
  catalogUnavailable = false;
  await generate.listeners.click();
  const text = h.node('handoff-agent-text').value;
  await copy.listeners.click();
  assert.match(status.textContent, /复制失败/);
  assert.doesNotMatch(status.textContent, /internal-clipboard-detail/);
  assert.equal(h.node('handoff-agent-text').value, text);
  assert.equal(copy.disabled, false);
  blocked = false;
  await copy.listeners.click();
  assert.match(status.textContent, /已复制/);
});

desktopTest('agent handoff rejects stale previews and results after a project or report change', async () => {
  let currentProject = { id: 'summary-project' }, finish;
  const copies = [];
  const h = summaryHarness({ getProject: () => currentProject, loadSourceCatalog: () => new Promise(resolve => { finish = resolve; }), copyText: async text => { copies.push(text); } });
  const generate = h.node('handoff-agent-generate');
  const copy = h.node('handoff-agent-copy');
  const preview = h.node('handoff-agent-text');
  const pending = generate.listeners.click();
  currentProject = { id: 'other-project' };
  h.app.refresh();
  finish(sourceCatalog); await pending;
  assert.equal(preview.value, '');
  assert.equal(copy.disabled, true);
  assert.equal(h.node('handoff-agent-preview').hidden, true);
  currentProject = { id: 'summary-project' };
  h.app.refresh();
  const next = generate.listeners.click();
  finish(sourceCatalog); await next;
  assert.ok(preview.value);
  h.artifact.id = 'new-report';
  await copy.listeners.click();
  assert.deepEqual(copies, []);
  assert.equal(preview.value, '');
  assert.equal(copy.disabled, true);
});

desktopTest('agent handoff has no copy step for empty and imported reports', async () => {
  let reads = 0;
  const h = summaryHarness({ loadSourceCatalog: async () => { reads++; return { catalog: { schemaVersion: 1, sources: [] } }; } });
  const generate = h.node('handoff-agent-generate');
  await generate.listeners.click();
  assert.match(h.node('handoff-agent-status').textContent, /没有.*规则/);
  assert.equal(h.node('handoff-agent-copy').disabled, true);
  h.select(async () => contract.exportHandoff(contract.createHandoff(h.artifact), 'json').text);
  await setImmediate();
  assert.equal(generate.disabled, true);
  assert.match(h.node('handoff-agent-status').textContent, /外部/);
  await generate.listeners.click();
  assert.equal(reads, 1);
});

desktopTest('closing or reopening during catalog load discards the old handoff preview', async () => {
  let finish;
  const h = summaryHarness({ loadSourceCatalog: () => new Promise(resolve => { finish = resolve; }) });
  const generate = h.node('handoff-agent-generate');
  const pending = generate.listeners.click();
  h.node('desktop-handoff').close();
  h.app.open(h.trigger, true);
  finish(sourceCatalog); await pending;
  assert.equal(h.node('handoff-agent-preview').hidden, true);
  assert.equal(h.node('handoff-agent-status').textContent, '');
  assert.equal(generate.disabled, false);
});

desktopTest('agent and Markdown clipboard writes stay serialized across dialog reopen', async () => {
  let finish;
  const copies = [];
  const h = summaryHarness({ copyText: text => {
    copies.push(text);
    if (copies.length === 1) return new Promise(resolve => { finish = resolve; });
    return Promise.resolve();
  } });
  const legacy = h.node('handoff-copy');
  const copy = h.node('handoff-agent-copy');
  const exporting = legacy.listeners.click();
  h.node('desktop-handoff').close();
  h.app.open(h.trigger, true);
  await h.node('handoff-agent-generate').listeners.click();
  const text = h.node('handoff-agent-text').value;
  assert.ok(text);
  assert.equal(copy.disabled, true);
  await copy.listeners.click();
  assert.equal(copies.length, 1);
  finish(); await exporting;
  assert.equal(copy.disabled, false);
  await copy.listeners.click();
  assert.deepEqual(copies, [contract.exportHandoff(contract.createHandoff(h.artifact), 'markdown').text, text]);
});
