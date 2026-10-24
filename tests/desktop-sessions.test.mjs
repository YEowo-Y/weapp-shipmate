import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createAgentPermissions } from '../desktop/design-previews/agent-permissions.js';
import { createChatContext } from '../desktop/design-previews/chat-context.js';
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Desktop dependencies are optional for CLI users. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Run npm install in desktop to test desktop sessions' }, fn);

function harness({ fail = false, invoke = async () => { throw Error('missing artifact'); }, prepare } = {}) {
  const nodes = new Map();
  for (const id of ['sessionHost', 'desktopComposer', 'desktopScroll', 'desktopMessages', 'desktopConversationStatus', 'desktopJump', 'session-title', 'session-empty', 'desktop-model-settings']) nodes.set('#' + id, { textContent: '', hidden: false });
  const doc = { querySelector: key => nodes.get(key), createElement: () => ({}) };
  const hiddenActions = [{ remove() { this.removed = true; } }, { remove() { this.removed = true; } }];
  const permission = { textContent: '' };
  const composer = { input: {}, sendButton: { dataset: {}, setAttribute() {} }, root: { querySelector: selector => selector === '.agent-composer__add' ? hiddenActions[0] : permission } };
  const records = [];
  const grants = createAgentPermissions(), chatContext = createChatContext(), requests = [], observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  let options, modelOptions;
  const modelOpens = [];
  const source = readFileSync(new URL('../desktop/src/sessions.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { invoke, MutationObserver,
    mountAgentTools: () => ({ ...grants, destroy: grants.clear }),
    mountChatContext: () => ({ ...chatContext, ...(prepare ? { prepare } : {}), destroy: chatContext.clear }),
    window: { addEventListener() {}, removeEventListener() {} }, desktopModelFetch() {},
    streamChat(request) { requests.push(request); }, mountModelConnections: value => { modelOptions = value; return { open(anchor) { modelOpens.push(anchor); }, destroy() {} }; }, document: doc,
    mountComposer: () => composer, mountSessionWorkspace: async value => { options = value; if (fail) throw Error('failed'); return { destroy() {}, conversation: { getMessages: () => records.map(record => ({ text: record.text, record: { kind: 'report', label: record.label } })), appendRecord: record => { records.push(record); return { ok: true }; } } }; } };
  vm.runInNewContext(script, context);
  return { mount: callbacks => context.mountDesktopSessions(callbacks), nodes, records, hiddenActions, permission, grants, chatContext, requests,
    setBusy(value) { composer.sendButton.dataset.mode = value ? 'stop' : 'send'; for (const observer of observers) if (observer.active) observer.callback(); },
    getOptions: () => options, getModelOptions: () => modelOptions, modelOpens, composer };
}

desktopTest('model recovery and management enter unified settings without the removed sidebar button', async () => {
  const app = harness(), anchors = [];
  app.nodes.delete('#desktop-model-settings');
  const session = await app.mount({ onOpenSettings: anchor => anchors.push(anchor) });
  assert.ok(session);
  assert.equal(app.getModelOptions().button, undefined);
  app.getOptions().conversationOptions.onModelRequired();
  app.getModelOptions().onManage();
  assert.equal(anchors[0], app.composer.input);
  assert.equal(anchors[1], app.getModelOptions().picker);
  assert.equal(app.modelOpens.length, 0);
  assert.equal(app.requests.length, 0);
  const settingsAnchor = {};
  session.openModels(settingsAnchor);
  assert.equal(app.modelOpens[0], settingsAnchor, 'settings connection link opens details without recursing');
  app.setBusy(true); app.getModelOptions().onManage();
  assert.equal(anchors.length, 2);
  session.destroy(); app.setBusy(false); app.getOptions().conversationOptions.onModelRequired();
  assert.equal(anchors.length, 2);
});

desktopTest('standalone session model management retains its connection-dialog fallback', async () => {
  const app = harness(); await app.mount();
  app.getOptions().conversationOptions.onModelRequired();
  app.getModelOptions().onManage();
  assert.equal(app.modelOpens[0], app.composer.input);
  assert.equal(app.modelOpens[1], app.getModelOptions().picker);
});

desktopTest('desktop sessions require real models while retaining shared workspace and inert reports', async () => {
  const app = harness();
  const session = await app.mount();
  assert.equal(app.getOptions().conversationOptions.requireModel, true);
  assert.equal(app.getOptions().conversationOptions.allowRecords, true);
  assert.equal(typeof app.getOptions().conversationOptions.transport, 'function');
  assert.equal(app.getOptions().workspace, 'desktop-local');
  assert.equal(app.getOptions().layout, 'sidebar');
  assert.equal(app.getOptions().projectScoped, true);
  assert.equal(session.isBusy(), false);
  app.getOptions().onSessionChange({ title: '已保存的任务', messages: [{ text: '保留消息' }] });
  assert.equal(app.nodes.get('#session-title').textContent, '已保存的任务');
  assert.equal(app.nodes.get('#session-empty').hidden, true);
  app.getOptions().onSessionChange({ title: '新任务', messages: [] });
  assert.equal(app.nodes.get('#session-empty').hidden, false);
  assert.equal(app.getOptions().storageLabel, '已保存在此设备');
  assert.equal(app.hiddenActions[0].removed, undefined);

  session.appendReport({ text: '<script>report</script>', type: '代码预检' });
  assert.equal(app.records[0].text, '<script>report</script>');
  assert.match(app.records[0].label, /代码预检/);
});

desktopTest('desktop workspace startup failure is visible and does not fabricate a session', async () => {
  const app = harness({ fail: true });
  assert.equal(await app.mount(), null);
  assert.match(app.nodes.get('#desktopConversationStatus').textContent, /会话.*失败/);
});

desktopTest('result handoff deduplicates against the current conversation and refuses oversized records', async () => {
  const app = harness(), session = await app.mount();
  const result = { text: '查询结果', type: '拒因反查', deduplicate: true };
  assert.equal(session.appendReport(result).ok, true);
  assert.equal(session.appendReport(result).duplicate, true);
  assert.equal(app.records.length, 1);
  app.records.length = 0; // A different current conversation has independent records.
  assert.equal(session.appendReport(result).ok, true);
  assert.equal(session.appendReport({ ...result, text: 'a'.repeat(2 * 1024 * 1024 + 1) }).reason, 'limit');
  while (app.records.length < 2000) app.records.push({ text: 'other', label: '其他' });
  assert.equal(session.appendReport({ ...result, text: 'new' }).reason, 'limit');
  assert.equal(app.records.length, 2000);
});

const selected = (projectId = 'project-a', id = 'session-a') => ({ id, projectId, title: '项目会话', messages: [] });
desktopTest('desktop transport uses current context and live consent, never historical grants', async () => {
  const app = harness(); await app.mount(); const options = app.getOptions();
  options.onSessionChange(selected()); app.grants.setProvider('openai');
  app.chatContext.add({ id: 'file-a', title: 'README', kind: 'file', text: '明确选中的资料', bytes: 24 });
  const request = { providerId: 'openai', model: 'fixture', messages: [{ role: 'user', content: '检查' }], agent: { projectId: 'forged', allowRead: true } };
  await options.conversationOptions.transport(request);
  assert.equal(app.requests[0].agent, undefined);
  assert.match(app.requests[0].messages[0].content, /明确选中的资料/);
  app.grants.update({ allowRead: true, shareResults: false });
  await options.conversationOptions.transport(request);
  assert.equal(app.requests[1].agent.projectId, 'project-a');
  assert.equal(app.requests[1].agent.shareResults, false);
  options.onSessionChange(selected('project-b', 'session-b'));
  await options.conversationOptions.transport(request);
  assert.equal(app.requests[2].agent, undefined);
  assert.equal(app.requests[2].messages.length, 1);
});

desktopTest('artifact handoff only opens matching native records and surfaces recoverable failures', async () => {
  let result = { id: 'artifact-a', projectId: 'project-a', markdown: '本地报告' }, failing = false;
  const calls = [], opened = [];
  const app = harness({ invoke: async (command, args) => { calls.push([command, args.artifactId]); if (failing) throw Error('offline'); return result; } });
  await app.mount({ onOpenArtifact: artifact => opened.push(artifact) });
  const options = app.getOptions();
  await options.conversationOptions.onOpenArtifact('artifact-a');
  assert.equal(calls.length, 0, 'unbound conversation cannot request a report');
  options.onSessionChange(selected());
  await options.conversationOptions.onOpenArtifact('artifact-a');
  assert.deepEqual(calls, [['project_artifact', 'artifact-a']]); assert.equal(opened.length, 1);
  result = { ...result, projectId: 'project-b' };
  await options.conversationOptions.onOpenArtifact('artifact-a');
  assert.equal(opened.length, 1); assert.match(app.nodes.get('#desktopConversationStatus').textContent, /项目历史中重试/);
  result = { ...result, projectId: 'project-a', id: 'wrong-id' };
  await options.conversationOptions.onOpenArtifact('artifact-a'); assert.equal(opened.length, 1);
  failing = true;
  await options.conversationOptions.onOpenArtifact('artifact-a'); assert.equal(opened.length, 1);
  assert.match(app.nodes.get('#desktopConversationStatus').textContent, /无法打开/);
});

desktopTest('late artifact reads cannot open after session switches or destruction', async () => {
  let resolve; const opened = [];
  const app = harness({ invoke: () => new Promise(done => { resolve = done; }) });
  const workspace = await app.mount({ onOpenArtifact: artifact => opened.push(artifact) });
  const options = app.getOptions(); options.onSessionChange(selected());
  const pending = options.conversationOptions.onOpenArtifact('artifact-a');
  options.onSessionChange(selected('project-a', 'session-b'));
  resolve({ id: 'artifact-a', projectId: 'project-a' }); await pending; assert.equal(opened.length, 0);
  const next = options.conversationOptions.onOpenArtifact('artifact-a'); workspace.destroy();
  resolve({ id: 'artifact-a', projectId: 'project-a' }); await next; assert.equal(opened.length, 0);
});

desktopTest('tool results refresh project history once after streaming, never during active generation', async () => {
  let refreshes = 0;
  const app = harness(); const workspace = await app.mount({ onToolResults: async () => { refreshes++; } });
  const options = app.getOptions(); app.setBusy(true);
  options.onEvent({ type: 'agent-tool', toolEvent: { type: 'tool-input-available' } });
  app.setBusy(false); assert.equal(refreshes, 0);
  app.setBusy(true);
  options.onEvent({ type: 'agent-tool', toolEvent: { type: 'tool-output-available' } });
  options.onEvent({ type: 'agent-tool', toolEvent: { type: 'tool-output-available' } });
  app.setBusy(true); assert.equal(refreshes, 0);
  app.setBusy(false); assert.equal(refreshes, 1);
  app.setBusy(false); assert.equal(refreshes, 1);
  app.setBusy(true); options.onEvent({ type: 'agent-tool', toolEvent: { type: 'tool-output-available' } });
  workspace.destroy(); app.setBusy(false); assert.equal(refreshes, 1);
});

desktopTest('failed history refresh preserves the report and explains how to retry', async () => {
  const app = harness(); await app.mount({ onToolResults: async () => { throw Error('unavailable'); } });
  app.setBusy(true); app.getOptions().onEvent({ type: 'agent-tool', toolEvent: { type: 'tool-output-available' } });
  app.setBusy(false); await Promise.resolve();
  assert.match(app.nodes.get('#desktopConversationStatus').textContent, /报告已保存在本机.*项目历史刷新失败/);
});

desktopTest('late context resolution cannot send after switching, stopping, or destroying the workspace', async () => {
  for (const action of ['switch', 'abort', 'destroy']) {
    let resolve;
    const app = harness({ prepare: () => new Promise(done => { resolve = done; }) });
    const workspace = await app.mount(), options = app.getOptions(); options.onSessionChange(selected());
    const controller = new AbortController();
    const request = { signal: controller.signal, model: 'fixture', messages: [{ role: 'user', content: 'question' }] };
    const pending = options.conversationOptions.transport(request);
    if (action === 'switch') options.onSessionChange(selected('project-b', 'session-b'));
    if (action === 'abort') controller.abort();
    if (action === 'destroy') workspace.destroy();
    resolve(request);
    await assert.rejects(pending, { name: 'AbortError' }); assert.equal(app.requests.length, 0, action);
  }
});

desktopTest('unavailable or disabled memory fails the send without falling back to stale content', async () => {
  const app = harness({ prepare: async () => { throw Error('记忆已停用，请移除引用'); } });
  await app.mount(); app.getOptions().onSessionChange(selected());
  await assert.rejects(app.getOptions().conversationOptions.transport({ messages: [] }), /记忆已停用/);
  assert.equal(app.requests.length, 0);
});

