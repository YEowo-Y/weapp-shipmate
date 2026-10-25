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
function harness() {
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
  const context = vm.createContext({ ...contract, Error, document, createIcon, renderMessageText, createActionButton: (doc, label) => { const node = doc.createElement('wa-button'); node.textContent = label; return node; }, createArtifactDownloader: () => ({ download: () => true, dispose() {} }) });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const artifact = { id: 'source-1', runId: 'run-1', projectId: null, projectRevision: null, contextRevision: null, kind: 'guide', title: '上线清单', createdAt: 1792700000000, toolVersion: 'test', rulesVersion: 'rules', ...runProjectTool('guide', { subject: 'personal' }) };
  const app = context.mountRepairHandoff({ getArtifact: () => artifact, getProject: () => null, getRulesVersion: () => 'rules', isBusy: () => false });
  const node = id => nodes.find(node => node.id === id), trigger = document.createElement('button');
  const select = text => { node('handoff-file').files = [{ size: 100, text }]; node('handoff-file').listeners.change(); };
  return { app, artifact, node, trigger, select, document };
}
desktopTest('handoff replaces the empty state and does not duplicate content on reopen', () => {
  const h = harness(); h.app.open(h.trigger, true);
  const text = h.node('handoff-content').textContent;
  assert.doesNotMatch(text, /尚未打开交接内容/); assert.match(text, /期望结果/);
  h.node('desktop-handoff').close(); h.app.open(h.trigger, true);
  assert.equal(h.node('handoff-content').textContent, text);
  assert.equal(h.node('handoff-basis').open, false);
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
desktopTest('invalid import preserves prior content and valid retry remains external', async () => {
  const h = harness(); h.app.open(h.trigger, true);
  const previous = h.node('handoff-content').textContent;
  h.select(async () => '{broken'); await setImmediate();
  assert.equal(h.node('handoff-content').textContent, previous);
  assert.match(h.node('handoff-status').textContent, /已保留/);
  h.select(async () => contract.exportHandoff(contract.createHandoff(h.artifact), 'json').text); await setImmediate();
  assert.match(h.node('handoff-provenance').textContent, /外部文件.*未核验/);
  assert.equal(h.node('handoff-content').textContent, previous);
  assert.equal(h.node('handoff-status').dataset.error, 'false');
});
desktopTest('destroy invalidates pending file reads without updating detached content', async () => {
  const h = harness(); h.app.open(h.trigger, true);
  let finish; h.select(() => new Promise(resolve => { finish = resolve; }));
  const before = h.node('handoff-source').textContent;
  h.app.destroy(); finish(contract.exportHandoff(contract.createHandoff({ ...h.artifact, id: 'late' }), 'json').text); await setImmediate();
  assert.equal(h.node('handoff-source').textContent, before);
});
