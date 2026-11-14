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
  let options, modelOptions, sendKey = 'enter';
  const modelOpens = [], preferenceRefreshes = [], listeners = new Map();
  const win = {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    fire(type) { for (const listener of listeners.get(type) || []) listener(); },
  };
  const source = readFileSync(new URL('../desktop/src/sessions.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { invoke, MutationObserver,
    mountAgentTools: () => ({ ...grants, destroy: grants.clear }),
    mountChatContext: () => ({ ...chatContext, ...(prepare ? { prepare } : {}), destroy: chatContext.clear }),
    window: win, readSendKey: () => sendKey, SHORTCUTS_EVENT: 'shipmate-shortcuts-change', desktopModelFetch() {},
    streamChat(request) { requests.push(request); }, mountModelConnections: value => { modelOptions = value; return { open(anchor) { modelOpens.push(anchor); }, destroy() {} }; }, document: doc,
    mountComposer: () => composer, mountSessionWorkspace: async value => { options = value; if (fail) throw Error('failed'); return { destroy() {}, conversation: { refreshPreferences: () => preferenceRefreshes.push(options.conversationOptions.getSendShortcut()), getMessages: () => records.map(record => ({ text: record.text, record: { kind: 'report', label: record.label } })), appendRecord: record => { records.push(record); return { ok: true }; } } }; } };
  vm.runInNewContext(script, context);
  return { mount: callbacks => context.mountDesktopSessions(callbacks), nodes, records, hiddenActions, permission, grants, chatContext, requests,
    setBusy(value) { composer.sendButton.dataset.mode = value ? 'stop' : 'send'; for (const observer of observers) if (observer.active) observer.callback(); },
    getOptions: () => options, getModelOptions: () => modelOptions, modelOpens, composer, win, preferenceRefreshes,
    setSendKey(value) { sendKey = value; }, listenerCount: type => listeners.get(type)?.size || 0 };
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

const expectedArtifact = { runId: 'run-a', kind: 'check', projectRevision: 1, contextRevision: 2 };
const nativeArtifact = () => ({ id: 'artifact-a', projectId: 'project-a', ...expectedArtifact, markdown: '本地报告' });

desktopTest('artifact lookup verifies project, successful run, artifact, kind and revisions before opening', async () => {
  let result = nativeArtifact(), failing = false;
  const calls = [], opened = [];
  const app = harness({ invoke: async (command, args) => { calls.push([command, args.artifactId, args.localProjectId]); if (failing) throw Error('lookup failed'); return result; } });
  await app.mount({ onOpenArtifact: artifact => opened.push(artifact) });
  const options = app.getOptions(), lookup = () => options.conversationOptions.onOpenArtifact('artifact-a', expectedArtifact);
  await lookup();
  assert.equal(calls.length, 0);
  assert.match(app.nodes.get('#desktopConversationStatus').textContent, /尚未关联项目/);
  options.onSessionChange(selected());
  await lookup();
  assert.deepEqual(calls, [['project_artifact', 'artifact-a', 'project-a']]); assert.equal(opened.length, 1);
  assert.match(app.nodes.get('#desktopConversationStatus').textContent, /已核验.*本机报告/);
  for (const patch of [{ provenance: 'imported' }, { projectId: 'project-b' }, { id: 'wrong-id' }, { runId: 'other-run' }, { kind: 'guide' }, { projectRevision: 2 }, { contextRevision: 3 }]) {
    result = { ...nativeArtifact(), ...patch }; await lookup(); assert.equal(opened.length, 1, JSON.stringify(patch));
    assert.match(app.nodes.get('#desktopConversationStatus').textContent, /无法核验/);
  }
  result = nativeArtifact();
  failing = true; await lookup(); assert.equal(opened.length, 1);
  assert.match(app.nodes.get('#desktopConversationStatus').textContent, /原设备导出报告.*重新检查/);
});

desktopTest('late exact report lookup cannot open or overwrite status after switching or destruction', async () => {
  for (const action of ['switch', 'destroy']) {
    let resolve, notifyRead; const opened = [], calls = [];
    const readStarted = new Promise(done => { notifyRead = done; });
    const app = harness({ invoke: command => {
      calls.push(command);
      return new Promise(done => { resolve = done; notifyRead(); });
    } });
    const workspace = await app.mount({ onOpenArtifact: artifact => opened.push(artifact) });
    const options = app.getOptions(); options.onSessionChange(selected());
    const pending = options.conversationOptions.onOpenArtifact('artifact-a', expectedArtifact);
    await readStarted;
    if (action === 'switch') options.onSessionChange(selected('project-a', 'session-b')); else workspace.destroy();
    app.nodes.get('#desktopConversationStatus').textContent = '新会话状态';
    resolve(nativeArtifact()); await pending;
    assert.equal(opened.length, 0);
    assert.equal(app.nodes.get('#desktopConversationStatus').textContent, '新会话状态');
    assert.deepEqual(calls, ['project_artifact']);
  }
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



desktopTest('send shortcuts read current preferences and refresh from same-window and storage events until disposal', async () => {
  for (const dispose of ['destroy', 'pagehide']) {
    const app = harness(), session = await app.mount();
    assert.equal(app.getOptions().conversationOptions.getSendShortcut(), 'enter');
    app.setSendKey('mod-enter'); app.win.fire('shipmate-shortcuts-change');
    assert.equal(app.getOptions().conversationOptions.getSendShortcut(), 'mod-enter');
    assert.deepEqual(app.preferenceRefreshes, ['mod-enter']);
    app.setSendKey('enter'); app.win.fire('storage');
    assert.deepEqual(app.preferenceRefreshes, ['mod-enter', 'enter']);
    if (dispose === 'destroy') session.destroy(); else app.win.fire('pagehide');
    assert.equal(app.listenerCount('shipmate-shortcuts-change'), 0); assert.equal(app.listenerCount('storage'), 0);
    app.win.fire('shipmate-shortcuts-change'); app.win.fire('storage');
    assert.deepEqual(app.preferenceRefreshes, ['mod-enter', 'enter']);
  }
});

desktopTest('desktop data navigation forwards the host route until disposal and preserves the standalone fallback', async () => {
  const app = harness(), anchors = [];
  const session = await app.mount({ onOpenDataSettings: anchor => anchors.push(anchor) });
  const anchor = {};
  app.getOptions().onOpenDataSettings(anchor); assert.equal(anchors[0], anchor);
  assert.equal(app.requests.length, 0); assert.equal(app.records.length, 0);
  session.destroy(); app.getOptions().onOpenDataSettings(anchor); assert.equal(anchors.length, 1);
  const standalone = harness(); const fallback = await standalone.mount();
  assert.equal(standalone.getOptions().onOpenDataSettings, undefined); fallback.destroy();
});
