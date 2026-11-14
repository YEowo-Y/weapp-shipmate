import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { createChatContext, contextMetadata } from '../desktop/design-previews/chat-context.js';
const ts = createRequire(new URL('../desktop/package.json', import.meta.url))('typescript');
const source = readFileSync(new URL('../desktop/src/context.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const entry = { id: 'note', title: '偏好', text: '本机保存的最新资料', enabled: true };
const item = () => ({ ...entry, id: 'memory:note', kind: 'memory', bytes: 30 });
const request = signal => ({ signal, model: 'fixture', messages: [{ role: 'user', content: 'question' }] });
function harness({ memoryReadFails = false } = {}) {
  const document = createPreviewDocument(), create = document.createElement.bind(document), nodes = [];
  document.createElement = tag => {
    const n = create(tag); n.listeners = {}; n.classList = { add() {} }; n.value = '';
    n.addEventListener = (name, handler) => { n.listeners[name] = handler; }; n.removeEventListener = () => {};
    n.replaceChildren = (...children) => { n.textContent = ''; n.append(...children); if (tag === 'select') n.value = children[0]?.value ?? ''; };
    n.prepend = child => { n.children.unshift(child); }; n.add = child => n.append(child);
    Object.defineProperty(n, 'options', { get: () => n.children });
    n.showModal = () => { n.open = true; }; n.close = () => { n.open = false; n.listeners.close?.(); }; n.focus = () => { document.activeElement = n; };
    nodes.push(n); return n;
  };
  document.body = document.createElement('body'); const host = document.createElement('div'), button = document.createElement('button');
  let resolveContext = async () => [item()], reads = 0;
  const context = vm.createContext({ document, createChatContext, contextMetadata, createIcon: () => document.createElement('svg'),
    Option: function (text, value) { const o = document.createElement('option'); o.textContent = text; o.value = value; return o; },
    createActionButton: (doc, text) => { const b = doc.createElement('wa-button'); b.textContent = text; return b; },
    mountProjectMemory: () => ({ open() {}, destroy() {}, selectChanged() {} }),
    invoke: async name => {
      if (name === 'project_snapshot') return { artifacts: [{ id: 'r', projectId: 'p', title: '已有报告', createdAt: 1792700000000 }] };
      if (name === 'project_memory_snapshot') { if (memoryReadFails) throw Error('unsupported memory'); return { projectId: 'p', revision: 1, entries: [entry] }; }
      if (name === 'project_memory_context') { reads++; return resolveContext(); }
      throw Error(name);
    }, open: async () => null,
  });
  vm.runInContext(script, context); const app = context.mountChatContext(host, button, () => false);
  app.select({ id: 's', projectId: 'p' });
  const node = id => nodes.find(n => n.id === id);
  return { app, node, show: () => button.listeners.click(), reads: () => reads, resolver(value) { resolveContext = value; },
    async attach() { await button.listeners.click(); node('desktop-context-memory').value = 'note'; node('desktop-context-add-memory').listeners.click(); await setImmediate(); node('desktop-context-dialog').close(); },
  };
}
test('desktop context re-reads explicitly selected memory for each send and retry', async () => {
  const h = harness(); const original = request();
  assert.equal((await h.app.prepare(original)).messages.length, 1); assert.equal(h.reads(), 0);
  await h.attach(); assert.equal(h.reads(), 1);
  h.resolver(async () => [{ ...item(), text: 'edited' }]);
  assert.match((await h.app.prepare(original)).messages[0].content, /edited/);
  assert.equal(h.reads(), 2); assert.equal(original.messages.length, 1);
  h.resolver(async () => { throw Error('记忆已停用'); });
  await assert.rejects(h.app.prepare(original), /记忆已停用/);
  h.app.select({ id: 's', projectId: 'other' });
  assert.equal((await h.app.prepare(original)).messages.length, 1); assert.equal(h.reads(), 3);
});
test('memory read failure preserves independent report selection and recovery entry', async () => {
  const h = harness({ memoryReadFails: true }); await h.show();
  assert.equal(h.node('desktop-context-report').options.length, 2);
  assert.equal(h.node('desktop-context-report').options[1].value, 'r');
  assert.equal(h.node('desktop-context-manage-memory').disabled, false);
  assert.match(h.node('desktop-context-status').textContent, /记忆读取失败.*其余可用资料/);
});
test('desktop memory resolution is canceled after stop, session change and disposal', async () => {
  for (const action of ['stop', 'switch', 'destroy']) {
    const h = harness(); await h.attach(); let resolve;
    h.resolver(() => new Promise(done => { resolve = done; }));
    const abort = new AbortController(), pending = h.app.prepare(request(abort.signal));
    if (action === 'stop') abort.abort();
    if (action === 'switch') h.app.select({ id: 's2', projectId: 'p' });
    if (action === 'destroy') h.app.destroy();
    resolve([item()]); await assert.rejects(pending, { name: 'AbortError' });
  }
});
