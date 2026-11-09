import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
function harness({ copyText = async () => {}, getProject = () => null, getRulesVersion = () => 'rules' } = {}) {
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
  const context = vm.createContext({ ...contract, Error, document, createIcon, renderMessageText, createActionButton: (doc, label) => { const node = doc.createElement('wa-button'); node.textContent = label; return node; }, createArtifactDownloader: () => ({ download: value => { downloads.push(value); return true; }, dispose() {} }) });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const artifact = { id: 'source-1', runId: 'run-1', projectId: null, projectRevision: null, contextRevision: null, kind: 'guide', title: '上线清单', createdAt: 1792700000000, toolVersion: 'test', rulesVersion: 'rules', ...runProjectTool('guide', { subject: 'personal' }) };
  const app = context.mountRepairHandoff({ getArtifact: () => artifact, getProject, getRulesVersion, isBusy: () => false, copyText });
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
