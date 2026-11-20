import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { runGuide as coreGuide } from '../src/guide.mjs';
import { mountConversation } from '../desktop/design-previews/conversation.js';
import { createMessage } from '../desktop/design-previews/components/message.js';
import { createDemoResult } from '../desktop/design-previews/demo-result.js';

const flushLive = () => new Promise(resolve => setImmediate(resolve));

test('an empty workbench restores its heading and never offers a latest-message jump', () => {
  const app = harness([]);
  app.scroll.scrollHeight = 1400;
  app.scroll.clientHeight = 500;
  app.view.restoreViewState({ followLatest: true, scrollTop: 900 });
  assert.equal(app.scroll.scrollTop, 0);
  assert.equal(app.jumpButton.hidden, true);
  app.scroll.scrollTop = 200;
  app.scroll.dispatch('scroll');
  assert.equal(app.jumpButton.hidden, true);
});

test('desktop record-only submissions keep notes without starting an agent or model', () => {
  let requests = 0;
  const app = harness([], { recordOnly: true, transport: () => { requests++; } });
  app.view.setModelSelection({ providerId: 'openai', model: 'test', label: 'Test' });
  app.view.setDraft('本地备注');
  assert.equal(app.sendButton.getAttribute('aria-label'), '保存记录');
  assert.equal(app.view.submit().ok, true);
  app.drain();
  assert.equal(app.view.getMessages().length, 1);
  assert.equal(app.view.getMessages()[0].branchNote, '本地记录 · 未调用模型');
  assert.deepEqual(app.view.getMessages()[0].record, { kind: 'note', label: '本地记录' });
  assert.equal(app.list.querySelector('.msg__meta').textContent, '你 · 本地记录');
  assert.equal(app.view.getMessages()[0].live, undefined);
  assert.equal(app.view.getDraftState().draft, '');
  assert.equal(requests, 0);
  assert.equal(app.view.controller.getSnapshot().state, 'idle');
  assert.equal(app.view.submit({ input: '不应调用工具', guide: { subject: 'personal', sensitive: false, domain: true } }).ok, false);
});

test('desktop reports append inert records while retaining drafts and never exposing regenerate', () => {
  const app = harness([{ id: 'note', role: 'user', text: '项目备注' }], { recordOnly: true });
  app.view.setDraft('尚未发送的草稿');
  assert.equal(app.view.appendRecord({ text: '真实本机报告内容', label: '流程导航 · 本机规则' }).ok, true);
  assert.equal(app.view.getDraftState().draft, '尚未发送的草稿');
  const report = app.view.getMessages().at(-1);
  assert.equal(report.role, 'assistant');
  assert.equal(report.tool, undefined);
  assert.deepEqual(report.record, { kind: 'report', label: '流程导航 · 本机规则' });
  const rendered = createMessage(app.list.ownerDocument, report, { canRegenerate: true });
  assert.equal(rendered.querySelector('.msg__meta').textContent, '本机工具 · 流程导航 · 本机规则');
  assert.equal(rendered.querySelectorAll('[data-action="regenerate"]').length, 0);
  assert.equal(rendered.querySelectorAll('[data-component="tool"]').length, 0);
  const failed = createMessage(app.list.ownerDocument, { ...report, status: 'error', error: { message: 'Archived failure', retryable: true } }, { canRegenerate: true });
  assert.equal(failed.querySelectorAll('[data-action="retry"]').length, 0);
  assert.equal(app.list.querySelectorAll('[data-action="regenerate"]').length, 0);
  assert.equal(app.view.appendRecord({ text: '', label: '空报告' }).ok, false);
  app.action('edit', 'note');
  app.input.value = '更正备注';
  app.view.submit();
  assert.equal(app.view.getDraftState().draft, '尚未发送的草稿');
  assert.equal(app.view.getMessages().length, 3);
  app.view.destroy();
  assert.equal(app.view.appendRecord({ text: 'late', label: 'late' }).ok, false);
});

test('saved report opens at its beginning and offers one full-source copy before its body', async () => {
  let copied;
  await withClipboard(async value => { copied = value; }, async () => {
    const app = harness(turns(), { allowRecords: true });
    app.scroll.scrollHeight = 3200; app.scroll.clientHeight = 400;
    app.scroll.scrollTop = 400;
    app.scroll.getBoundingClientRect = () => ({ top: 80 });
    const append = app.list.append.bind(app.list);
    app.list.append = (...nodes) => {
      append(...nodes);
      for (const node of nodes) node.getBoundingClientRect = () => ({ top: 80 + 1200 - app.scroll.scrollTop, bottom: 80 + 3000 - app.scroll.scrollTop });
    };
    app.view.setDraft('Preserve this draft');
    const text = '# 完整报告\n\n' + '正文与来源\n'.repeat(200);
    assert.equal(app.view.appendRecord({ text, label: '桌面工具 · 拒因反查' }).ok, true);
    assert.equal(app.scroll.scrollTop, 1200);
    assert.equal(app.view.getViewState().followLatest, false);
    const report = app.view.getMessages().at(-1);
    const article = app.list.children.at(-1);
    const actions = article.querySelector('[data-component="message-actions"]');
    assert.ok(article.children.indexOf(actions) < article.children.indexOf(article.querySelector('.msg__parts')));
    assert.equal(article.querySelectorAll('[data-action="copy"]').length, 1);
    assert.equal(actions.querySelector('[data-action="copy"]').getAttribute('aria-label'), '复制完整报告');
    assert.equal(article.querySelector('.msg__meta').textContent, '本机工具 · 拒因反查');
    assert.equal(report.record.label, '桌面工具 · 拒因反查');
    app.action('copy', report.id); await flushCopy();
    assert.equal(copied, text);
    assert.equal(app.view.getDraftState().draft, 'Preserve this draft');
    const saved = app.view.getViewState();
    app.view.restoreViewState(saved);
    assert.equal(app.scroll.scrollTop, 1200);
    app.view.submit({ input: 'Continue chatting' }); app.drain();
    assert.equal(app.view.getViewState().followLatest, true);
    app.view.destroy();
  });
});

function guideMessage(status = 'complete') {
  return { id: 'guide-result', role: 'assistant', text: 'Short summary', status,
    guide: { subject: 'personal', sensitive: false, domain: true },
    structuredResult: coreGuide({ subject_type: 'personal', collects_sensitive: false, has_server_domain: true }),
    tool: { kind: 'guide', state: 'success', label: '上线清单' },
  };
}

test('restored legacy message IDs remain unique and new replies link to their new source', () => {
  const history = [
    { id: 'user-1', role: 'user', text: 'Saved question', status: 'complete' },
    { id: 'assistant-2', role: 'assistant', sourceUserId: 'user-1', text: 'Saved answer', status: 'complete' },
  ];
  const app = harness(history);
  app.input.value = 'A new question';
  assert.equal(app.view.submit().ok, true);
  const messages = app.view.getMessages();
  assert.equal(new Set(messages.map(message => message.id)).size, 4);
  app.drain();
  assert.equal(messages[0].id, 'user-1');
  assert.equal(messages[1].sourceUserId, 'user-1');
  assert.equal(messages[3].sourceUserId, messages[2].id);
  app.view.destroy();
});

test('message IDs stay unique without the platform UUID API', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    const first = harness([]);
    first.view.submit({ input: 'First session' }); first.drain();
    const history = first.view.getMessages();
    first.view.destroy();
    const second = harness(history);
    second.view.submit({ input: 'Another session' }); second.drain();
    const messages = second.view.getMessages();
    assert.equal(new Set(messages.map(message => message.id)).size, 4);
    assert.equal(messages[3].sourceUserId, messages[2].id);
    second.view.destroy();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete globalThis.crypto;
  }
});

test('programmatic draft changes notify after draft and edit state settle without input events', () => {
  const changes = [];
  let app;
  app = harness([{ id: 'saved-user', role: 'user', text: 'Saved question', status: 'complete' }], {
    onDraftChange() { changes.push(app.view.getDraftState()); },
  });
  let inputEvents = 0;
  app.input.addEventListener('input', () => inputEvents++);
  app.view.setDraft('Unsent draft');
  app.action('edit', 'saved-user');
  app.cancelEdit.dispatch('click');
  assert.deepEqual(changes.map(({ draft, edit }) => [draft, edit?.messageId || null]), [
    ['Unsent draft', null], ['Saved question', 'saved-user'], ['Unsent draft', null],
  ]);
  app.action('edit', 'saved-user');
  app.input.value = 'Revised question';
  app.view.submit(); app.drain();
  assert.equal(changes.at(-1).draft, 'Unsent draft');
  assert.equal(changes.at(-1).edit, null);
  app.view.submit(); app.drain();
  assert.equal(changes.at(-1).draft, '');
  const count = changes.length;
  app.view.submit();
  app.view.submit({ input: 'Independent page action' }); app.drain();
  assert.equal(changes.length, count, 'rejected and independent submits do not change the draft');
  assert.equal(inputEvents, 0);
  app.view.destroy(); app.view.setDraft('Ignored');
  assert.equal(changes.length, count);
});

test('ordinary guide copy copies the entire canonical checklist rather than the summary', async () => {
  let copied;
  await withClipboard(async text => { copied = text; }, async () => {
    const message = guideMessage();
    const app = harness([message]);
    app.action('copy', message.id); await flushCopy();
    assert.ok(copied.includes(message.structuredResult.items[0].ruleId));
    assert.ok(copied.includes(message.structuredResult.items.at(-1).ruleId));
    assert.notEqual(copied, message.text);
    assert.match(app.status.textContent, /完整清单/);
    app.view.destroy();
  });
});

test('guide download uses full canonical data despite filtering, reports failures, and releases resources', () => {
  const downloads = []; let disposed = 0; let allow = false;
  const message = guideMessage();
  const app = harness([message], { artifactDownloader: { download(artifact) { downloads.push(artifact); return allow; }, dispose() { disposed++; } } });
  const search = app.list.querySelector('[data-guide-search]'); search.value = 'No matching entries';
  app.list.dispatch('input', { target: search });
  app.action('download-guide-markdown', message.id);
  assert.match(app.status.textContent, /无法发起下载/);
  assert.ok(downloads[0].text.includes(message.structuredResult.items.at(-1).ruleId));
  allow = true; app.action('download-guide-json', message.id);
  assert.match(app.status.textContent, /已发起.*下载/);
  assert.doesNotMatch(app.status.textContent, /已保存|磁盘/);
  assert.deepEqual(JSON.parse(downloads[1].text), message.structuredResult);
  app.view.replaceMessages([message]); assert.equal(disposed, 1);
  app.action('download-guide-json', message.id); assert.equal(downloads.length, 3);
  app.view.destroy(); assert.equal(disposed, 2);
});

test('guide copying has pending/error retry feedback and ignores late clipboard completion', async () => {
  let finish; let reject; let calls = 0;
  await withClipboard(() => { calls++; return new Promise((done, fail) => { finish = done; reject = fail; }); }, async () => {
    const message = guideMessage(); const app = harness([message]);
    app.action('copy-guide', message.id); app.action('copy-guide', message.id);
    assert.equal(calls, 1);
    const control = app.list.querySelector('[data-action="copy-guide"]');
    assert.match(control.getAttribute('aria-label'), /完整清单/);
    reject(new Error('Denied')); await flushCopy();
    assert.equal(control.dataset.copyState, 'error');
    app.action('copy-guide', message.id); assert.equal(calls, 2);
    app.view.replaceMessages([]); app.status.textContent = 'Another conversation';
    finish(); await flushCopy();
    assert.equal(app.status.textContent, 'Another conversation'); app.view.destroy();
  });
});

test('invalid and incomplete guide results cannot copy or download even through forged actions', async () => {
  let copied = 0; let downloaded = 0;
  await withClipboard(async () => { copied++; }, async () => {
    for (const state of ['working', 'stopped', 'error', 'bad-input', 'bad-result']) {
      const message = guideMessage(['bad-input', 'bad-result'].includes(state) ? 'complete' : state);
      if (state === 'bad-input') message.guide = { subject: 'unknown' };
      if (state === 'bad-result') message.structuredResult = null;
      const app = harness([message], { artifactDownloader: { download() { downloaded++; return true; }, dispose() {} } });
      for (const action of ['copy', 'copy-guide', 'download-guide-markdown', 'download-guide-json']) {
        const control = app.list.ownerDocument.createElement('button'); control.dataset.action = action; control.dataset.messageId = message.id;
        app.list.append(control); app.list.dispatch('click', { target: control });
      }
      await flushCopy(); app.view.destroy();
    }
  });
  assert.equal(copied, 0); assert.equal(downloaded, 0);
});

test('guide search waits for IME, preserves focused DOM through patch, and restores per-message state', () => {
  const message = { ...guideMessage(), review: { state: 'pending' } };
  const app = harness([message]);
  const search = app.list.querySelector('[data-guide-search]');
  const card = search.closest('[data-component="guide-result"]');
  const stage = card.querySelector('details'); stage.open = false;
  app.scroll.scrollTop = 120; search.focus();
  app.list.dispatch('compositionstart', { target: search });
  search.value = '不存在的条目'; app.list.dispatch('input', { target: search, isComposing: true });
  assert.equal(app.view.getViewState().guideResults[0].state.query, '');
  app.list.dispatch('compositionend', { target: search });
  assert.equal(app.view.getViewState().guideResults[0].state.query, search.value);
  assert.equal(app.scroll.scrollTop, 120);
  search.selectionStart = 2; search.selectionEnd = 3;
  app.view.updateReviewState('accepted');
  assert.equal(app.list.querySelector('[data-guide-search]'), search);
  assert.equal(app.list.ownerDocument.activeElement, search); assert.equal(search.selectionStart, 2);
  const saved = app.view.getViewState();
  app.view.replaceMessages([{ ...message, id: 'other' }]); app.view.restoreViewState(saved);
  assert.equal(app.list.querySelector('[data-guide-search]').value, '');
  app.view.replaceMessages([message]); app.view.restoreViewState(saved);
  const restored = app.list.querySelector('[data-guide-search]');
  assert.equal(restored.value, '不存在的条目');
  restored.value = ''; app.list.dispatch('input', { target: restored });
  assert.equal(app.list.querySelector('details').open, false);
  app.view.destroy();
});

test('restoring a filtered guide preserves manual folds and its pre-search disclosure baseline', () => {
  const message = guideMessage();
  const app = harness([message]);
  const card = app.list.querySelector('[data-component="guide-result"]');
  const stages = card.querySelectorAll('details[data-component]');
  stages.forEach(stage => { stage.open = false; });
  const search = card.querySelector('[data-guide-search]');
  search.value = '备案'; app.list.dispatch('input', { target: search });
  const matching = stages.filter(stage => !stage.hidden && stage.open);
  assert.ok(matching.length > 0, 'Search automatically opens matching stages');
  matching[0].open = false;
  const saved = app.view.getViewState();
  app.view.destroy();
  const restored = harness([message]);
  restored.view.restoreViewState(saved);
  assert.equal(restored.list.querySelector('[data-guide-search]').value, '备案');
  assert.deepEqual(restored.view.getViewState().disclosures, saved.disclosures);
  const restoredSearch = restored.list.querySelector('[data-guide-search]');
  restoredSearch.value = ''; restored.list.dispatch('input', { target: restoredSearch });
  const restoredStages = restored.list.querySelector('[data-component="guide-result"]').querySelectorAll('details[data-component]');
  assert.ok(restoredStages.every(stage => !stage.open), 'Clearing search restores the pre-search baseline');
  restored.view.destroy();
});

test('guide event preserves draft/model/references and retries original parameters without model traffic', async () => {
  const calls = [];
  let modelCalls = 0;
  let context = { references: ['private.json'], pendingScenario: 'timeout' };
  const app = harness([], {
    getDraftContext: () => context, setDraftContext: next => { context = next; },
    transport: async () => { modelCalls++; },
    guideTransport: async args => { calls.push(args); args.onToolStart({ toolCallId: `g${calls.length}`, input: args.input }); return coreGuide({ subject_type: args.input.subject }); },
  });
  app.view.setModelSelection({ providerId: 'openai', model: 'a', label: 'A' });
  app.input.value = 'Unsent draft';
  const guide = { subject: 'personal', sensitive: false, domain: true };
  const detail = { input: guide, accepted: false };
  app.input.closest('.composer').dispatch('shipmate:guide-request', { detail });
  assert.equal(detail.accepted, true);
  guide.subject = 'enterprise';
  await flushLive();
  assert.equal(app.input.value, 'Unsent draft');
  assert.deepEqual(context.references, ['private.json']);
  assert.equal(context.pendingScenario, 'timeout');
  assert.equal(app.view.getModelSelection().model, 'a');
  const reply = app.view.getMessages().at(-1);
  assert.equal(reply.trace.kind, 'guide'); assert.equal(reply.tool.kind, 'guide');
  assert.equal(reply.structuredResult.command, 'guide');
  app.action('regenerate', reply.id); await flushLive();
  assert.equal(calls[1].input.subject, 'personal');
  assert.equal(app.view.getModelSelection().model, 'a');
  assert.equal(modelCalls, 0);
  app.view.retry(); await flushLive();
  assert.equal(calls[2].input.subject, 'personal');
  app.view.destroy();
});

test('guide busy rejection and session replacement cannot publish late results', async () => {
  let pending; let resolve;
  const app = harness([], { guideTransport: args => { pending = args; return new Promise(done => { resolve = done; }); } });
  const guide = { subject: 'personal', sensitive: false, domain: true };
  app.view.runGuide(guide); await flushLive();
  const detail = { input: guide, accepted: false };
  app.input.closest('.composer').dispatch('shipmate:guide-request', { detail });
  assert.equal(detail.accepted, false);
  pending.onToolStart({ toolCallId: 'g', input: pending.input });
  app.view.replaceMessages([]);
  assert.equal(pending.signal.aborted, true);
  resolve(coreGuide({ subject_type: 'personal' })); await flushLive();
  assert.equal(app.view.getMessages().length, 0);
  app.view.destroy();
});

test('live text branches exclude demo, references and later turns; retry uses original model', async () => {
  const requests = [];
  const app = harness([{ id: 'demo', role: 'assistant', text: 'Never upload demo', status: 'complete' }], {
    getDraftContext: () => ({ references: ['private.json'], pendingScenario: 'normal' }),
    transport: async args => { requests.push(args); args.onDelta(`reply ${requests.length}`); },
  });
  const model = { providerId: 'openai', model: 'model-a', label: 'Model A' };
  app.view.setModelSelection(model);
  app.input.value = 'First'; app.view.submit(); await flushLive();
  assert.deepEqual(requests[0].messages, [{ role: 'user', content: 'First' }]);
  const firstUser = app.view.getMessages().find(message => message.role === 'user');
  const firstReply = app.view.getMessages().at(-1);
  assert.deepEqual(firstUser.references, []);
  assert.equal(firstReply.branchNote, undefined);
  assert.equal(firstReply.live.label, 'Model A');
  assert.equal(firstReply.tool, null); assert.equal(firstReply.review, null);
  app.input.value = 'Second'; app.view.submit(); await flushLive();
  assert.deepEqual(requests[1].messages.map(message => message.content), ['First', 'reply 1', 'Second']);
  app.view.setModelSelection({ providerId: 'ollama', model: 'model-b', label: 'B' });
  app.action('regenerate', firstReply.id); await flushLive();
  assert.equal(requests[2].model, 'model-a');
  assert.equal(app.view.getModelSelection().model, 'model-a');
  assert.deepEqual(requests[2].messages.map(message => message.content), ['First']);
  app.action('edit', firstUser.id); app.input.value = 'Edited'; app.view.submit(); await flushLive();
  assert.equal(requests[3].model, 'model-a');
  assert.deepEqual(requests[3].messages.map(message => message.content), ['Edited']);
  app.view.destroy();
});

test('editing a real message obeys current model selection including returning to demo', async () => {
  const requests = [];
  const app = harness([], { transport: async args => { requests.push(args); args.onDelta('reply'); } });
  app.view.setModelSelection({ providerId: 'openai', model: 'a', label: 'A' });
  app.input.value = 'First'; app.view.submit(); await flushLive();
  app.input.value = 'Second'; app.view.submit(); await flushLive();
  const user = app.view.getMessages().find(message => message.text === 'Second');
  app.view.setModelSelection({ providerId: 'ollama', model: 'b', label: 'B' });
  app.action('edit', user.id); app.input.value = 'Edited B'; app.view.submit(); await flushLive();
  assert.equal(requests[2].model, 'b');
  assert.deepEqual(requests[2].messages.map(message => message.content), ['Edited B']);
  app.view.setModelSelection(null);
  app.action('edit', user.id); app.input.value = 'Edited demo'; app.view.submit(); app.drain(); await flushLive();
  assert.equal(requests.length, 3);
  assert.equal(app.view.getMessages().at(-1).live, null);
  app.view.destroy();
});

test('top-level retry restores original model before transport resumes', async () => {
  const app = harness([], { transport: async () => { throw new Error('Retry'); } });
  app.view.setModelSelection({ providerId: 'openai', model: 'a', label: 'A' });
  app.input.value = 'First'; app.view.submit(); await flushLive();
  const retry = app.list.querySelectorAll('[data-action]').find(node => node.dataset.action === 'retry');
  assert.match(retry.getAttribute('aria-label'), /原模型.*A/);
  app.view.setModelSelection(null);
  app.view.retry();
  assert.equal(app.input.closest('.composer').dataset.modelId, 'a');
  await flushLive(); app.view.destroy();
});

for (const providerId of ['anthropic', 'google']) {
  test(`${providerId} selection streams, stops without late text, and retries the original request`, async () => {
    const requests = [];
    const app = harness([], { transport: args => { requests.push(args); return new Promise(() => {}); } });
    const model = providerId === 'google' ? 'models/gemini-test' : 'claude-test';
    assert.equal(app.view.setModelSelection({ providerId, model, label: model }), true);
    app.input.value = 'First'; app.view.submit(); await flushLive();
    assert.equal(requests[0].providerId, providerId);
    requests[0].onDelta('partial');
    app.view.stop(); await flushLive();
    assert.equal(requests[0].signal.aborted, true);
    requests[0].onDelta('late'); await flushLive();
    assert.equal(app.view.getMessages().at(-1).text, 'partial');
    app.view.retry(); await flushLive();
    assert.equal(requests[1].providerId, providerId);
    assert.deepEqual(requests[1].messages, [{ role: 'user', content: 'First' }]);
    app.view.destroy();
  });
}

test('model selection is explicit, refuses busy changes and resets session history', async () => {
  const requests = [];
  const app = harness([], { transport: args => { requests.push(args); return new Promise(() => {}); } });
  const composer = app.input.closest('.composer');
  assert.equal(composer.dataset.liveChat, 'true');
  assert.equal(app.view.getModelSelection(), null);
  composer.dispatch('shipmate:model-select', { detail: { selection: { providerId: 'openrouter', model: 'a', label: 'A' } } });
  assert.equal(composer.dataset.modelProvider, 'openrouter');
  app.input.value = 'One'; app.view.submit(); await flushLive();
  assert.equal(app.view.setModelSelection(null), false);
  app.view.replaceMessages([]);
  assert.equal(requests[0].signal.aborted, true);
  app.view.setModelSelection(null);
  assert.equal(composer.dataset.modelId, '');
  requests[0].onDelta('late');
  assert.equal(app.view.getMessages().length, 0);
  app.view.destroy();
});

// Exercise the public mounted view and its real event handlers. This small DOM
// surface models message ownership and controls; browser focus/layout is separate.
function documentStub() {
  const doc = { activeElement: null };
  doc.createElement = tag => {
    const listeners = new Map();
    const attributes = new Map();
    let text = '';
    const node = {
      tag, ownerDocument: doc, children: [], parentElement: null,
      dataset: {}, style: {}, className: '', value: '',
      get textContent() { return text + this.children.map(child => child.textContent).join(''); },
      set textContent(value) { text = String(value); this.children.forEach(child => { child.parentElement = null; }); this.children = []; },
      set innerHTML(_) { throw new Error('Untrusted HTML must stay inactive'); },
      disabled: false, hidden: false, scrollTop: 0, scrollLeft: 0,
      scrollHeight: 400, clientHeight: 400,
      setAttribute(name, value) {
        attributes.set(name, String(value));
        if (name === 'class') this.className = String(value);
        if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = String(value);
      },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) {
        attributes.delete(name);
        if (name === 'class') this.className = '';
        if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())];
      },
      append(...nodes) {
        for (const child of nodes) {
          child.remove();
          child.parentElement = this;
          this.children.push(child);
        }
      },
      replaceChildren(...nodes) {
        this.children.forEach(child => { child.parentElement = null; });
        this.children = [];
        this.append(...nodes);
      },
      replaceWith(next) {
        const parent = this.parentElement;
        next.remove();
        parent.children.splice(parent.children.indexOf(this), 1, next);
        next.parentElement = parent;
        this.parentElement = null;
      },
      remove() {
        const parent = this.parentElement;
        if (parent) parent.children.splice(parent.children.indexOf(this), 1);
        this.parentElement = null;
      },
      contains(other) { return this === other || this.children.some(child => child.contains(other)); },
      matches(selector) {
        return selector.split(',').some(candidate => {
          const simple = candidate.trim().split(/\s+>\s+|\s+/).at(-1);
          const compound = simple.match(/^([a-z]+)(\[data-[^\]]+\])$/);
          if (compound) return this.tag === compound[1] && this.matches(compound[2]);
          if (simple.startsWith('.')) return this.className.split(/\s+/).includes(simple.slice(1));
          const data = simple.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/);
          if (data) {
            const key = data[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
            return Object.hasOwn(this.dataset, key) && (data[2] === undefined || this.dataset[key] === data[2]);
          }
          return this.tag === simple;
        });
      },
      closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
      querySelectorAll(selector) {
        return this.children.flatMap(child => [
          ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
        ]);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      removeEventListener(type, listener) {
        listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
      },
      listenerCount() { return [...listeners.values()].reduce((count, items) => count + items.length, 0); },
      dispatch(type, details = {}) {
        const event = { type, target: this, defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...details };
        for (const listener of listeners.get(type) || []) listener(event);
        return event;
      },
      focus() { doc.activeElement = this; },
      setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; },
      getBoundingClientRect() { return { top: this.rectTop || 0, bottom: 0, height: 0 }; },
    };
    return node;
  };
  doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
  return doc;
}

function harness(initialMessages, options = {}) {
  const doc = documentStub();
  if (options.documentView) doc.defaultView = options.documentView;
  const nodes = Object.fromEntries(['input', 'sendButton', 'scroll', 'list', 'status', 'jumpButton']
    .map(name => [name, doc.createElement(name === 'input' ? 'textarea' : 'div')]));
  const composer = doc.createElement('div');
  composer.className = 'composer';
  const editBar = doc.createElement('div');
  editBar.className = 'agent-composer__edit';
  editBar.hidden = true;
  const editLabel = doc.createElement('span');
  const cancelEdit = doc.createElement('button');
  cancelEdit.className = 'agent-composer__cancel-edit';
  editBar.append(editLabel, cancelEdit);
  const hint = doc.createElement('p'); hint.className = 'agent-composer__hint';
  composer.append(editBar, nodes.input, nodes.sendButton, hint);
  const tasks = new Map();
  let sequence = 0;
  const events = [];
  const view = mountConversation({
    ...nodes, initialMessages, eventTarget: null,
    planFactory: () => ({ chunks: ['A local reply'], workingDelayMs: 1, chunkDelayMs: 1 }),
    schedule(callback) { const id = ++sequence; tasks.set(id, callback); return id; },
    cancelSchedule(id) { tasks.delete(id); },
    onEvent(event) { events.push(event); },
    ...options,
  });
  function action(name, messageId) {
    const control = nodes.list.querySelectorAll('[data-action]')
      .find(node => node.dataset.action === name && node.dataset.messageId === messageId);
    assert.ok(control, `${name} action exists for ${messageId}`);
    if (!control.disabled) nodes.list.dispatch('click', { target: control });
  }
  function drain() {
    let steps = 0;
    while (tasks.size) {
      assert.ok(++steps < 100, 'deterministic conversation must settle');
      const [id, callback] = tasks.entries().next().value;
      tasks.delete(id);
      callback();
    }
  }
  function step() {
    const entry = tasks.entries().next().value;
    if (!entry) return false;
    tasks.delete(entry[0]);
    entry[1]();
    return true;
  }
  return { ...nodes, editBar, cancelEdit, view, events, action, drain, step, tasks };
}

const turns = () => [
  { id: 'user-a', role: 'user', text: 'Question A', status: 'complete' },
  { id: 'assistant-a', role: 'assistant', text: 'Answer A', status: 'complete' },
  { id: 'user-b', role: 'user', text: 'Question B', status: 'complete' },
  { id: 'assistant-b', role: 'assistant', text: 'Answer B', status: 'complete' },
];

test('a submit rejected during terminal notification keeps the composer draft and history', () => {
  let attempted;
  const app = harness([], { onEvent(event) {
    if (event.type === 'state' && event.state === 'complete') attempted = app.view.submit();
  } });
  app.view.submit({ input: 'Original request' });
  app.input.value = 'New unsent draft';
  app.drain();
  assert.deepEqual(attempted, { ok: false, reason: 'busy' });
  assert.equal(app.input.value, 'New unsent draft');
  assert.deepEqual(app.view.getMessages().map(message => message.text), ['Original request', 'A local reply']);
  assert.equal(app.view.submit().ok, true);
  app.view.destroy();
});

test('review updates preserve nested raw data, evidence expansion, scroll and focused summary', () => {
  const app = harness([
    { id: 'user-a', role: 'user', text: 'Check' },
    { id: 'assistant-a', role: 'assistant', text: 'Result', status: 'complete',
      tool: { state: 'success', label: 'Demo' }, structuredResult: createDemoResult(),
      fact: { text: 'Example evidence' }, review: { state: 'pending', runId: 1 } },
  ]);
  const article = app.list.children[1];
  for (const disclosure of article.querySelectorAll('details')) disclosure.open = true;
  const raw = article.querySelector('.tool-details__raw');
  raw.querySelector('summary').focus();
  article.querySelector('.tool-result-json').scrollTop = 55;
  app.view.updateReviewState('accepted', { runId: 1 });
  const next = app.list.children[1];
  assert.equal(next.querySelector('.tool-details__raw').open, true);
  assert.equal(next.querySelector('.fact-block').open, true);
  assert.equal(next.querySelector('.tool-result-json').scrollTop, 55);
  assert.equal(next.ownerDocument.activeElement, next.querySelector('.tool-details__raw').querySelector('summary'));
});

test('editing a user message enables send immediately from an empty draft', () => {
  const app = harness(turns());
  assert.equal(app.sendButton.disabled, true);
  app.action('edit', 'user-a');
  assert.equal(app.input.value, 'Question A');
  assert.equal(app.sendButton.disabled, false);
});

for (const firstAction of ['regenerate', 'retry']) {
  test(`repeating an older ${firstAction} stays attached to its source user`, () => {
    const messages = turns();
    if (firstAction === 'retry') {
      messages[1].status = 'error';
      messages[1].error = { message: 'A failed', retryable: true };
    }
    const app = harness(messages);
    app.action(firstAction, 'assistant-a');
    app.drain();
    const regenerated = app.view.getMessages().at(-1);
    app.action('regenerate', regenerated.id);
    app.drain();
    assert.deepEqual(app.events.filter(event => event.type === 'run-start').map(event => event.input),
      ['Question A', 'Question A']);
  });
}

test('replacing a conversation does not label its next normal message as an old edit', () => {
  const app = harness(turns());
  app.action('edit', 'user-a');
  app.view.replaceMessages([{ id: 'welcome', role: 'assistant', text: 'A different conversation', status: 'complete' }]);
  app.view.setDraft('A fresh question');
  app.view.submit();
  const user = app.view.getMessages().find(message => message.role === 'user');
  assert.equal(user.text, 'A fresh question');
  assert.equal(user.branchNote, undefined);
});

for (const cancelWith of ['Escape', 'button']) {
  test(`canceling an edit with ${cancelWith} restores the previous draft`, () => {
    const app = harness(turns());
    app.view.setDraft('An unfinished next question');
    app.action('edit', 'user-a');
    app.input.value = 'A revision not sent';
    app.input.dispatch('input');
    assert.equal(app.editBar.hidden, false);
    if (cancelWith === 'Escape') app.input.dispatch('keydown', { key: 'Escape' });
    else app.cancelEdit.dispatch('click');
    assert.equal(app.input.value, 'An unfinished next question');
    assert.equal(app.view.getDraftState().edit, null);
    assert.equal(app.editBar.hidden, true);
    assert.equal(app.view.getMessages().length, 4);
    assert.equal(app.sendButton.disabled, false);
  });
}

test('sending an edited message retains its original and restores the previous composer draft', () => {
  const app = harness(turns());
  app.view.setDraft('Next question still in progress');
  app.action('edit', 'user-a');
  app.input.value = 'Revised question A';
  app.input.dispatch('input');
  app.view.submit();
  app.drain();
  const messages = app.view.getMessages();
  const revised = messages.find(message => message.text === 'Revised question A');
  assert.equal(messages.find(message => message.id === 'user-a').text, 'Question A');
  assert.ok(revised.branchNote);
  assert.equal(messages.at(-1).sourceUserId, revised.id);
  assert.equal(app.input.value, 'Next question still in progress');
  assert.equal(app.view.getDraftState().edit, null);
});

test('an editing draft can be restored to its own conversation without leaking to another one', () => {
  const app = harness(turns());
  app.view.setDraft('Original draft before editing A');
  app.action('edit', 'user-a');
  app.input.value = 'Unsent revision of A';
  app.input.dispatch('input');
  const savedDraft = app.view.getDraftState();
  const savedMessages = app.view.getMessages();
  app.view.replaceMessages([{ id: 'welcome', role: 'assistant', text: 'Different session', status: 'complete' }]);
  app.view.setDraft('Different session draft');
  assert.equal(app.view.getDraftState().edit, null);
  app.view.replaceMessages(savedMessages);
  app.view.setDraft(savedDraft.draft, savedDraft.edit);
  assert.equal(app.input.value, 'Unsent revision of A');
  assert.equal(app.editBar.hidden, false);
  app.input.dispatch('keydown', { key: 'Escape' });
  assert.equal(app.input.value, 'Original draft before editing A');
});

test('an active run does not allow editing an earlier message to overwrite the draft', () => {
  const app = harness(turns());
  app.view.setDraft('A draft kept while waiting');
  app.view.submit({ input: 'A request started from a page action' });
  app.action('edit', 'user-a');
  assert.equal(app.input.value, 'A draft kept while waiting');
  assert.equal(app.view.getDraftState().edit, null);
  assert.equal(app.view.controller.getSnapshot().state, 'working');
  app.view.stop();
  assert.equal(app.input.value, 'A draft kept while waiting');
});

test('a page action sends its own request without consuming a pending edit or its previous draft', () => {
  const app = harness(turns());
  app.view.setDraft('Previous composer draft');
  app.action('edit', 'user-a');
  app.input.value = 'Unsent edited A';
  app.input.dispatch('input');
  const before = app.view.getDraftState();
  app.view.submit({ input: 'A separate page request' });
  app.drain();
  assert.deepEqual(app.view.getDraftState(), before);
  const pageRequest = app.view.getMessages().find(message => message.text === 'A separate page request');
  assert.equal(pageRequest.branchNote, undefined);
  app.input.dispatch('keydown', { key: 'Escape' });
  assert.equal(app.input.value, 'Previous composer draft');
});

test('an explicitly invalid assistant source never falls back to a neighboring question', () => {
  for (const sourceUserId of ['missing-user', 'assistant-b', null, undefined]) {
    const messages = turns();
    messages[1].sourceUserId = sourceUserId;
    const app = harness(messages);
    assert.equal(app.list.querySelectorAll('[data-action="regenerate"]')
      .some(control => control.dataset.messageId === 'assistant-a'), false);
    messages[1].status = 'error';
    messages[1].error = { message: 'Failed source', retryable: true };
    app.view.replaceMessages(messages);
    app.action('retry', 'assistant-a');
    assert.equal(app.events.some(event => event.type === 'run-start'), false);
  }
});

test('selecting another message to edit preserves the draft from before the first edit', () => {
  const app = harness(turns());
  app.view.setDraft('The original draft');
  app.action('edit', 'user-a');
  app.input.value = 'An intermediate A revision';
  app.input.dispatch('input');
  app.action('edit', 'user-b');
  assert.equal(app.input.value, 'Question B');
  app.cancelEdit.dispatch('click');
  assert.equal(app.input.value, 'The original draft');
});

test('Escape leaves a pending edit intact while a completion or IME owns the key', () => {
  const app = harness(turns());
  app.view.setDraft('Original draft');
  app.action('edit', 'user-a');
  const before = app.view.getDraftState();
  app.input.setAttribute('aria-expanded', 'true');
  app.input.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual(app.view.getDraftState(), before);
  app.input.setAttribute('aria-expanded', 'false');
  app.input.dispatch('keydown', { key: 'Escape', defaultPrevented: true });
  assert.deepEqual(app.view.getDraftState(), before);
  app.input.dispatch('keydown', { key: 'Escape', isComposing: true });
  assert.deepEqual(app.view.getDraftState(), before);
  app.input.dispatch('compositionstart');
  app.input.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual(app.view.getDraftState(), before);
  app.input.dispatch('compositionend');
  app.input.dispatch('keydown', { key: 'Escape' });
  assert.equal(app.input.value, 'Original draft');
  assert.equal(app.view.getDraftState().edit, null);
});

test('restoring an edit validates its source against the current session', () => {
  const app = harness(turns());
  for (const messageId of ['another-session-user', 'assistant-a']) {
    app.view.setDraft('A preserved draft', { messageId, originalDraft: 'Wrong session draft' });
    assert.equal(app.input.value, 'A preserved draft');
    assert.equal(app.view.getDraftState().edit, null);
    assert.equal(app.editBar.hidden, true);
  }
});

test('switching sessions clears the prior editing announcement even when both runs are idle', () => {
  const app = harness(turns());
  app.action('edit', 'user-a');
  assert.match(app.status.textContent, /正在编辑/);
  app.view.replaceMessages([{ id: 'welcome', role: 'assistant', text: 'Another session', status: 'complete' }]);
  app.view.setDraft('Other session draft');
  assert.doesNotMatch(app.status.textContent, /正在编辑/);
  assert.equal(app.editBar.hidden, true);
});

test('restoring a valid editing draft announces the editing state again', () => {
  const app = harness(turns());
  app.view.setDraft('Original draft');
  app.action('edit', 'user-a');
  const draft = app.view.getDraftState();
  const messages = app.view.getMessages();
  app.view.replaceMessages(messages);
  app.status.textContent = '';
  app.view.setDraft(draft.draft, draft.edit);
  assert.match(app.status.textContent, /正在编辑/);
  assert.equal(app.editBar.hidden, false);
});

test('a retry request with an explicit invalid source cannot reuse the last active question', () => {
  const app = harness(turns());
  app.view.submit({ input: 'Last active question' });
  app.drain();
  const count = app.events.filter(event => event.type === 'run-start').length;
  for (const sourceUserId of [null, undefined, 'missing', 'assistant-a']) {
    assert.deepEqual(app.view.submit({ input: 'Wrong question', retry: true, sourceUserId }),
      { ok: false, reason: 'missing-source' });
  }
  assert.equal(app.events.filter(event => event.type === 'run-start').length, count);
});

async function withClipboard(writeText, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText } } });
  try { await run(); } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
}
const flushCopy = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('copying an older reply while generating reports success beside that reply and copies source text', async () => {
  let copied;
  await withClipboard(async value => { copied = value; }, async () => {
    const messages = turns();
    messages[1].text = '**Answer A**';
    const app = harness(messages);
    app.view.submit({ input: 'Keep working' });
    app.action('copy', 'assistant-a');
    await flushCopy();
    const control = app.list.querySelectorAll('[data-action="copy"]').find(node => node.dataset.messageId === 'assistant-a');
    assert.equal(copied, '**Answer A**');
    assert.equal(control.dataset.copyState, 'success');
    assert.equal(control.getAttribute('aria-label'), '已复制');
    assert.equal(control.disabled, false);
    app.view.stop();
  });
});

test('copy failure stays visible on its control and allows retry without duplicate pending requests', async () => {
  let reject;
  let calls = 0;
  await withClipboard(() => { calls++; return new Promise((_resolve, fail) => { reject = fail; }); }, async () => {
    const app = harness(turns());
    const control = app.list.querySelectorAll('[data-action="copy"]').find(node => node.dataset.messageId === 'assistant-a');
    app.status.dataset.state = 'error';
    app.status.dataset.announcement = 'run';
    app.action('copy', 'assistant-a');
    app.action('copy', 'assistant-a');
    assert.equal(calls, 1);
    assert.equal(control.dataset.copyState, 'pending');
    reject(new Error('Clipboard denied'));
    await flushCopy();
    assert.equal(control.dataset.copyState, 'error');
    assert.equal(app.status.dataset.announcement, 'action');
    assert.match(app.status.textContent, /无法复制/);
    assert.match(control.getAttribute('aria-label'), /复制失败/);
    assert.equal(control.disabled, false);
    app.action('copy', 'assistant-a');
    assert.equal(calls, 2);
    reject(new Error('Still denied'));
    await flushCopy();
  });
});

for (const end of ['replaceMessages', 'destroy']) {
  test(`late clipboard completion after ${end} cannot announce into another view`, async () => {
    let resolve;
    let notices = 0;
    await withClipboard(() => new Promise(done => { resolve = done; }), async () => {
      const app = harness(turns(), { onCopy() { notices++; } });
      app.action('copy', 'assistant-a');
      if (end === 'replaceMessages') app.view.replaceMessages(turns());
      else app.view.destroy();
      app.status.textContent = 'New view';
      resolve();
      await flushCopy();
      assert.equal(app.status.textContent, 'New view');
      assert.equal(notices, 0);
      if (end === 'replaceMessages') assert.equal(app.list.querySelector('[data-copy-state]'), null);
    });
  });
}

test('code and table reading positions survive a review update without moving focus to the first code button', () => {
  const app = harness([{ id: 'a', role: 'assistant', status: 'complete', review: { state: 'pending', runId: 9 },
    text: '```js\nfirst\n```\n\n```json\n  second\n```\n\n| A | B |\n| --- | --- |\n| long | table |' }]);
  const code = app.list.querySelectorAll('pre')[1];
  const table = app.list.querySelector('.markdown-table');
  const copy = app.list.querySelectorAll('[data-action="copy-code"]')[1];
  assert.ok(code && table && copy);
  code.scrollLeft = 48;
  code.scrollTop = 24;
  table.scrollLeft = 96;
  copy.focus();
  app.view.updateReviewState('accepted', { runId: 9 });
  assert.equal(app.list.querySelectorAll('pre')[1], code);
  assert.equal(app.list.querySelector('.markdown-table'), table);
  assert.equal(code.scrollLeft, 48);
  assert.equal(code.scrollTop, 24);
  assert.equal(table.scrollLeft, 96);
  assert.equal(app.list.ownerDocument.activeElement, copy);
});

test('copy code preserves whitespace and feedback survives a status update while the clipboard is pending', async () => {
  let copied;
  let resolve;
  await withClipboard(value => { copied = value; return new Promise(done => { resolve = done; }); }, async () => {
    const app = harness([{ id: 'a', role: 'assistant', status: 'complete', review: { state: 'pending', runId: 9 },
      text: 'Explanation\n\n```js\n  const x = 1;\n\n```' }]);
    app.action('copy-code', 'a');
    app.view.updateReviewState('accepted', { runId: 9 });
    assert.equal(app.list.querySelector('[data-action="copy-code"]').dataset.copyState, 'pending');
    resolve();
    await flushCopy();
    assert.equal(copied, '  const x = 1;\n\n');
    assert.equal(app.list.querySelector('[data-action="copy-code"]').dataset.copyState, 'success');
  });
});

for (const terminal of ['complete', 'stopped']) {
  test(`streaming code retains its element and reading lock through ${terminal}`, () => {
    const app = harness([], { planFactory: () => ({ chunks: ['```js\n  const x =', ' 1;\n', '```\n\nDone'], workingDelayMs: 1, chunkDelayMs: 1 }) });
    app.view.submit({ input: 'Stream code' });
    while (!app.list.querySelector('pre')) assert.equal(app.step(), true);
    const pre = app.list.querySelector('pre');
    pre.scrollLeft = 23;
    pre.focus();
    app.list.dispatch('focusin', { target: pre });
    app.scroll.scrollTop = 40;
    assert.equal(app.step(), true);
    assert.equal(app.scroll.scrollTop, 40);
    if (terminal === 'complete') app.drain();
    else app.view.stop();
    assert.equal(app.list.querySelector('pre'), pre);
    assert.equal(pre.scrollLeft, 23);
    assert.match(pre.textContent, /const x = 1;/);
    assert.equal(app.list.ownerDocument.activeElement, pre);
    assert.equal(app.jumpButton.hidden, false);
    app.jumpButton.dispatch('click');
    assert.equal(app.scroll.scrollTop, app.scroll.scrollHeight);
    assert.equal(app.jumpButton.hidden, true);
  });
}


test('destroy removes every mounted listener and makes public mutations inert', () => {
  const app = harness(turns());
  app.view.setDraft('Ready');
  app.view.submit();
  const queuedCallbacks = [...app.tasks.values()];
  app.view.destroy();
  app.view.destroy();
  const before = app.view.getMessages();
  const eventCount = app.events.length;
  for (const node of [app.input, app.sendButton, app.list, app.scroll, app.jumpButton, app.cancelEdit]) {
    assert.equal(node.listenerCount(), 0);
  }
  app.view.submit({ input: 'late request' });
  app.view.retry();
  app.view.setDraft('late draft');
  app.view.replaceMessages([]);
  assert.equal(app.tasks.size, 0);
  for (const callback of queuedCallbacks) callback();
  app.drain();
  assert.deepEqual(app.view.getMessages(), before);
  assert.equal(app.events.length, eventCount);
});

test('IME keyCode 229 neither sends Enter nor cancels editing with Escape', () => {
  const app = harness(turns());
  app.view.setDraft('Draft');
  const enter = app.input.dispatch('keydown', { key: 'Enter', keyCode: 229 });
  assert.equal(enter.defaultPrevented, false);
  assert.equal(app.view.getMessages().length, 4);
  app.action('edit', 'user-a');
  const escape = app.input.dispatch('keydown', { key: 'Escape', keyCode: 229 });
  assert.equal(escape.defaultPrevented, false);
  assert.equal(app.view.getDraftState().edit.messageId, 'user-a');
});

test('autosize caps at 144 and observes width without reacting to its own height', () => {
  let observer;
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.disconnects = 0; observer = this; }
    observe(node) { this.node = node; }
    disconnect() { this.disconnects++; }
  }
  const app = harness([], { documentView: { ResizeObserver } });
  assert.equal(app.input.style.height, '144px');
  assert.equal(observer.node, app.input);
  app.input.scrollHeight = 110;
  observer.callback([{ contentRect: { width: 600 } }]);
  assert.equal(app.input.style.height, '110px');
  app.input.scrollHeight = 130;
  observer.callback([{ contentRect: { width: 600 } }]);
  assert.equal(app.input.style.height, '110px');
  observer.callback([{ contentRect: { width: 400 } }]);
  assert.equal(app.input.style.height, '130px');
  app.view.destroy();
  app.view.destroy();
  assert.equal(observer.disconnects, 1);
  app.input.scrollHeight = 160;
  observer.callback([{ contentRect: { width: 300 } }]);
  assert.equal(app.input.style.height, '130px');
});


test('session view restoration preserves scroll and expanded details with an accurate latest control', () => {
  const app = harness(turns());
  app.scroll.scrollHeight = 2400; app.scroll.clientHeight = 400; app.scroll.scrollTop = 650;
  app.scroll.dispatch('scroll');
  const saved = app.view.getViewState();
  app.view.replaceMessages(turns()); app.view.restoreViewState(saved);
  assert.equal(app.scroll.scrollTop, 650); assert.equal(app.jumpButton.hidden, false);
  app.jumpButton.dispatch('click');
  const bottom = app.view.getViewState();
  app.view.replaceMessages(turns()); app.view.restoreViewState(bottom);
  assert.equal(app.scroll.scrollTop, 2400); assert.equal(app.jumpButton.hidden, true);
  app.view.destroy();
});
test('busy Enter explicitly preserves an unsent draft and IME does not announce it', () => {
  const app = harness(turns()); app.view.submit({ input: 'Run' });
  app.input.value = 'Next draft';
  app.input.dispatch('keydown', { key: 'Enter', isComposing: true });
  assert.doesNotMatch(app.status.textContent, /未发送/);
  app.input.dispatch('keydown', { key: 'Enter' });
  assert.match(app.status.textContent, /草稿.*未发送/);
  assert.match(app.input.closest('.composer').querySelector('.agent-composer__hint').textContent, /草稿已保留，尚未发送/);
  assert.equal(app.input.value, 'Next draft'); app.view.destroy();
});
test('editing snapshots original references and restores the independent scenario draft', () => {
  let context = { references: ['draft.json'], pendingScenario: 'timeout' }; const requests = [];
  const app = harness([{ id: 'original', role: 'user', text: 'Original', references: ['old.json'], status: 'complete' }], {
    getDraftContext: () => context, setDraftContext: value => { context = value; },
    planFactory: (input, request) => { requests.push(request.context); return { chunks: ['done'] }; },
  });
  app.input.value = 'Timeout draft'; app.action('edit', 'original');
  assert.deepEqual(context.references, ['old.json']); assert.equal(context.pendingScenario, 'normal');
  app.input.value = 'Edited'; app.view.submit(); app.drain();
  assert.equal(requests[0].pendingScenario, 'normal');
  assert.equal(context.pendingScenario, 'timeout'); assert.deepEqual(context.references, ['draft.json']);
  assert.equal(app.input.value, 'Timeout draft');
  const edited = app.view.getMessages().filter(message => message.role === 'user').at(-1);
  assert.deepEqual(edited.references, ['old.json']);
  app.view.submit(); app.drain();
  assert.equal(requests[1].pendingScenario, 'timeout'); assert.equal(context.pendingScenario, 'normal');
  context.references.push('later.json');
  assert.deepEqual(app.view.getMessages().filter(message => message.role === 'user').at(-1).references, ['draft.json']);
  app.view.destroy();
});

test('view snapshots restore nested disclosure and scrolling content independently', () => {
  const app = harness([{ id: 'result', role: 'assistant', text: 'Result', status: 'complete', tool: { state: 'success', label: 'Demo' }, structuredResult: createDemoResult(), fact: { text: 'Evidence' } }]);
  const article = app.list.children[0];
  article.querySelector('.tool-details__raw').open = true;
  article.querySelector('.fact-block').open = true;
  article.querySelector('.tool-result-json').scrollTop = 55;
  const saved = app.view.getViewState();
  app.view.replaceMessages(app.view.getMessages()); app.view.restoreViewState(saved);
  assert.equal(app.list.children[0].querySelector('.tool-details__raw').open, true);
  assert.equal(app.list.children[0].querySelector('.fact-block').open, true);
  assert.equal(app.list.children[0].querySelector('.tool-result-json').scrollTop, 55);
  app.view.destroy();
});
test('canceling a restored edit recovers its own references and scenario; regeneration keeps source', () => {
  let context = { references: ['draft.json'], pendingScenario: 'tool-failure' };
  const app = harness([{ id: 'u', role: 'user', text: 'Old', references: ['source.json'] }, { id: 'a', role: 'assistant', text: 'Old reply', sourceUserId: 'u', status: 'complete' }], {
    getDraftContext: () => context, setDraftContext: value => { context = value; },
  });
  app.input.value = 'Draft'; app.action('edit', 'u');
  const saved = app.view.getDraftState(); const messages = app.view.getMessages();
  app.view.replaceMessages([]); app.view.setDraft('Other');
  app.view.replaceMessages(messages); app.view.setDraft(saved.draft, saved.edit);
  app.cancelEdit.dispatch('click');
  assert.equal(app.input.value, 'Draft'); assert.equal(context.pendingScenario, 'tool-failure');
  assert.deepEqual(context.references, ['draft.json']);
  app.action('regenerate', 'a'); app.drain();
  assert.equal(app.view.getMessages().at(-1).sourceUserId, 'u');
  assert.deepEqual(app.view.getMessages().find(message => message.id === 'u').references, ['source.json']);
  assert.equal(context.pendingScenario, 'tool-failure'); app.view.destroy();
});
test('visible composer hint reflects idle, edit and busy state without promising a queue', () => {
  const app = harness(turns()); const hint = app.input.closest('.composer').querySelector('.agent-composer__hint');
  assert.match(hint.textContent, /Enter 发送/);
  app.action('edit', 'user-a'); assert.match(hint.textContent, /发送修改/);
  app.view.submit(); assert.match(hint.textContent, /回复完成后发送/);
  app.view.stop(); assert.match(hint.textContent, /Enter 发送/); app.view.destroy();
});

test('explicit page requests do not borrow the unsent draft scenario or references', () => {
  let context = { references: ['draft-only.json'], pendingScenario: 'timeout' }; let request;
  const app = harness(turns(), {
    getDraftContext: () => context, setDraftContext: value => { context = value; },
    planFactory: (input, value) => { request = value; return { chunks: ['done'] }; },
  });
  app.input.value = 'Unsent'; app.view.submit({ input: 'Page task' }); app.drain();
  assert.equal(request.context.pendingScenario, 'normal');
  assert.deepEqual(app.view.getMessages().filter(message => message.role === 'user').at(-1).references, []);
  assert.equal(context.pendingScenario, 'timeout'); assert.deepEqual(context.references, ['draft-only.json']);
  assert.equal(app.input.value, 'Unsent'); app.view.destroy();
});

test('reader resize preserves following before a layout scroll and respects user scrolling', () => {
  let observer;
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observer = this; this.nodes = []; }
    observe(node) { this.nodes.push(node); }
    disconnect() {}
  }
  const app = harness(turns(), { documentView: { ResizeObserver } });
  app.scroll.scrollHeight = 2400; app.scroll.clientHeight = 400; app.scroll.scrollTop = 2000;
  app.scroll.dispatch('scroll');
  assert.ok(observer.nodes.includes(app.scroll));
  app.scroll.clientHeight = 300;
  app.scroll.dispatch('scroll'); // Layout event may precede ResizeObserver.
  assert.equal(app.view.getViewState().followLatest, true);
  assert.equal(app.scroll.scrollTop, 2400);
  app.scroll.scrollTop = 1800;
  app.scroll.dispatch('scroll');
  observer.callback([{ target: app.scroll, contentRect: { width: 600, height: 300 } }]);
  assert.equal(app.scroll.scrollTop, 1800);
  assert.equal(app.jumpButton.hidden, false);
  app.scroll.clientHeight = 250;
  observer.callback([{ target: app.scroll, contentRect: { width: 600, height: 250 } }]);
  assert.equal(app.scroll.scrollTop, 1800);
  assert.equal(app.view.getViewState().followLatest, false);
  app.view.destroy();
  app.scroll.clientHeight = 200;
  observer.callback([{ target: app.scroll, contentRect: { width: 600, height: 200 } }]);
  assert.equal(app.scroll.scrollTop, 1800);
});

test('upward user scroll during a pending viewport resize is never pulled to the bottom', () => {
  const app = harness(turns());
  app.scroll.scrollHeight = 2400; app.scroll.clientHeight = 400; app.scroll.scrollTop = 2000;
  app.scroll.dispatch('scroll');
  app.scroll.clientHeight = 300; app.scroll.scrollTop = 1700;
  app.scroll.dispatch('scroll');
  assert.equal(app.scroll.scrollTop, 1700);
  assert.equal(app.view.getViewState().followLatest, false);
});

test('width reflow preserves the visible message anchor while reading earlier content', () => {
  let observer;
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  }
  const app = harness(turns(), { documentView: { ResizeObserver } });
  const article = app.list.children[0];
  let articleTop = -40;
  article.getBoundingClientRect = () => ({ top: articleTop, bottom: articleTop + 300 });
  app.scroll.clientWidth = 700; app.scroll.scrollHeight = 2400;
  observer.callback([{ target: app.scroll, contentRect: { width: 700, height: 400 } }]);
  app.scroll.scrollTop = 700;
  app.scroll.dispatch('scroll');
  app.scroll.clientWidth = 500; articleTop = 60;
  observer.callback([{ target: app.scroll, contentRect: { width: 500, height: 400 } }]);
  assert.equal(app.scroll.scrollTop, 800);
  assert.equal(app.jumpButton.hidden, false);
});

test('textarea growth settles the bottom synchronously before the observer or scroll event', () => {
  const app = harness(turns());
  app.scroll.scrollHeight = 2400; app.scroll.clientHeight = 400; app.scroll.scrollTop = 2000;
  app.scroll.dispatch('scroll');
  Object.defineProperty(app.input.style, 'height', { configurable: true, set(value) {
    if (value !== 'auto') app.scroll.clientHeight = 300;
  } });
  app.input.scrollHeight = 168;
  app.input.dispatch('input');
  assert.equal(app.scroll.scrollTop, 2400);
  assert.equal(app.view.getViewState().followLatest, true);
  assert.equal(app.jumpButton.hidden, true);
});

// Model browser clamping and geometry changes caused by scrolling, rather than
// accepting impossible scrollTop values beyond the scroll range.
function clampReader(scroll) {
  let position = Math.min(scroll.scrollTop, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
  Object.defineProperty(scroll, 'scrollTop', { configurable: true,
    get() { return Math.min(position, Math.max(0, this.scrollHeight - this.clientHeight)); },
    set(value) { position = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
  });
}

test('stream updates reconcile pending width reflow before replacing the saved reading anchor', () => {
  let observer;
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  }
  const app = harness(turns(), { documentView: { ResizeObserver },
    planFactory: () => ({ chunks: ['one', 'two', 'three'], workingDelayMs: 1, chunkDelayMs: 1 }) });
  app.scroll.scrollHeight = 2400; app.scroll.clientWidth = 700;
  clampReader(app.scroll);
  observer.callback([{ target: app.scroll, contentRect: { width: 700, height: 400 } }]);
  app.input.value = 'Another question'; app.view.submit(); app.step();
  const article = app.list.children[0];
  let documentTop = 660;
  article.getBoundingClientRect = () => ({ top: documentTop - app.scroll.scrollTop, bottom: documentTop + 300 - app.scroll.scrollTop });
  app.scroll.scrollTop = 700; app.scroll.dispatch('scroll');
  app.scroll.clientWidth = 500; documentTop = 760;
  app.step(); // A stream chunk runs before ResizeObserver delivery.
  assert.equal(app.scroll.scrollTop, 800);
  assert.equal(article.getBoundingClientRect().top, -40);
  observer.callback([{ target: app.scroll, contentRect: { width: 500, height: 400 } }]);
  app.scroll.dispatch('scroll'); // Delayed scroll caused by compensation.
  assert.equal(app.scroll.scrollTop, 800);
  assert.equal(app.view.getViewState().followLatest, false);
  app.drain();
  assert.equal(app.scroll.scrollTop, 800);
});

test('bottom-following stream chunks do not measure historical message rectangles', () => {
  const app = harness(turns(), { planFactory: () => ({ chunks: ['one', 'two', 'three'], workingDelayMs: 1, chunkDelayMs: 1 }) });
  app.scroll.scrollHeight = 2400;
  clampReader(app.scroll);
  app.input.value = 'Another question'; app.view.submit();
  let rectangles = 0;
  for (const article of app.list.children) article.getBoundingClientRect = () => { rectangles++; return { top: 0, bottom: 300 }; };
  app.drain();
  assert.equal(rectangles, 0);
  assert.equal(app.scroll.scrollTop, 2000);
});

for (const interaction of ['focus', 'disclosure']) {
  test(`entering ${interaction} reading captures an anchor even before a scroll event`, () => {
    let observer;
    class ResizeObserver {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      disconnect() {}
    }
    const app = harness(turns(), { documentView: { ResizeObserver } });
    app.scroll.scrollHeight = 2400; app.scroll.clientWidth = 700;
    clampReader(app.scroll);
    observer.callback([{ target: app.scroll, contentRect: { width: 700, height: 400 } }]);
    app.jumpButton.dispatch('click');
    const article = app.list.children[0];
    let documentTop = 1960;
    article.getBoundingClientRect = () => ({ top: documentTop - app.scroll.scrollTop, bottom: documentTop + 300 - app.scroll.scrollTop });
    const doc = app.list.ownerDocument;
    if (interaction === 'focus') {
      const pre = doc.createElement('pre'); pre.dataset.readingKey = 'code-test'; article.append(pre);
      app.list.dispatch('focusin', { target: pre });
    } else {
      const details = doc.createElement('details'); details.dataset.component = 'run-trace';
      const summary = doc.createElement('summary'); details.append(summary); article.append(details);
      app.list.dispatch('click', { target: summary });
    }
    app.scroll.clientWidth = 500; app.scroll.scrollHeight = 2600; documentTop = 2060;
    observer.callback([{ target: app.scroll, contentRect: { width: 500, height: 400 } }]);
    assert.equal(app.scroll.scrollTop, 2100);
    assert.equal(article.getBoundingClientRect().top, -40);
    app.scroll.dispatch('scroll');
    assert.equal(app.view.getViewState().followLatest, false);
    assert.equal(app.scroll.scrollTop, 2100);
  });
}

test('draft snapshots restore selection direction and textarea scroll after autosize without focusing', () => {
  const app = harness([]); app.view.setDraft('first line\nsecond line\nthird line');
  Object.assign(app.input, { selectionStart: 3, selectionEnd: 19, selectionDirection: 'backward', scrollTop: 48, scrollHeight: 300, clientHeight: 144 });
  const saved = app.view.getDraftState();
  assert.deepEqual(saved.draftView, { selectionStart: 3, selectionEnd: 19, selectionDirection: 'backward', scrollTop: 48 });
  app.view.setDraft('Other');
  const doc = app.input.ownerDocument; app.sendButton.focus();
  Object.defineProperty(app.input.style, 'height', { configurable: true, set() { app.input.scrollTop = 0; } });
  app.view.setDraft(saved.draft, saved.edit, saved.draftView);
  assert.equal(app.input.selectionStart, 3); assert.equal(app.input.selectionEnd, 19);
  assert.equal(app.input.selectionDirection, 'backward'); assert.equal(app.input.scrollTop, 48);
  assert.equal(doc.activeElement, app.sendButton);
  app.view.destroy();
});

test('restored draft view clamps invalid ranges and scroll; legacy setters start at the end', () => {
  const app = harness([]); app.input.scrollHeight = 240; app.input.clientHeight = 144;
  app.view.setDraft('Hello', null, { selectionStart: -2, selectionEnd: 999, selectionDirection: 'backward', scrollTop: 999 });
  assert.equal(app.input.selectionStart, 0); assert.equal(app.input.selectionEnd, 5); assert.equal(app.input.scrollTop, 96);
  app.view.setDraft('Hello', null, { selectionStart: 4, selectionEnd: 2, selectionDirection: 'invalid', scrollTop: -1 });
  assert.equal(app.input.selectionStart, 4); assert.equal(app.input.selectionEnd, 4);
  assert.equal(app.input.selectionDirection, 'none'); assert.equal(app.input.scrollTop, 0);
  app.view.setDraft('Hello', null, { selectionStart: NaN, selectionEnd: Infinity, scrollTop: NaN });
  assert.equal(app.input.selectionStart, 5); assert.equal(app.input.selectionEnd, 5); assert.equal(app.input.scrollTop, 0);
  app.view.setDraft('Fresh'); assert.equal(app.input.selectionStart, 5); assert.equal(app.input.selectionEnd, 5);
  app.view.setDraft(''); assert.equal(app.input.selectionStart, 0); assert.equal(app.input.scrollTop, 0);
  app.view.destroy();
});

test('native real-model mode retains draft and requests connection instead of running demo', () => {
  let required = 0, requests = 0;
  const app = harness([], { requireModel: true, onModelRequired: () => required++, transport: () => requests++ });
  app.view.setDraft('需要真实回复');
  assert.deepEqual(app.view.submit(), { ok: false, reason: 'model-required' });
  app.drain();
  assert.equal(required, 1);
  assert.equal(requests, 0);
  assert.equal(app.view.getMessages().length, 0);
  assert.equal(app.view.getDraftState().draft, '需要真实回复');
  assert.equal(app.status.dataset.announcement, 'model-required');
  app.view.setModelSelection({ providerId: 'ollama', model: 'local', label: 'Local' });
  assert.equal(app.status.textContent, '');
  assert.equal(app.view.getDraftState().draft, '需要真实回复');
});

test('native real-model mode keeps imported local reports out of outgoing model context', async () => {
  let request;
  const app = harness([], { requireModel: true, allowRecords: true, transport: async args => { request = args; args.onDelta('真实响应'); } });
  assert.equal(app.view.appendRecord({ text: '不自动发送的报告', label: '预检' }).ok, true);
  app.view.setModelSelection({ providerId: 'ollama', model: 'local', label: 'Local' });
  app.view.setDraft('只发送这个问题');
  assert.equal(app.view.submit().ok, true);
  await flushLive(); app.drain(); await flushLive();
  assert.deepEqual(request.messages, [{ role: 'user', content: '只发送这个问题' }]);
  assert.equal(app.view.getMessages()[0].record.kind, 'report');
});

test('native chat retains prior real turns across an inert imported report', async () => {
  const requests = [];
  const app = harness([], { requireModel: true, allowRecords: true, transport: async args => { requests.push(args.messages); args.onDelta('真实回答'); } });
  app.view.setModelSelection({ providerId: 'ollama', model: 'local', label: 'Local' });
  app.view.setDraft('第一个问题'); app.view.submit();
  await flushLive(); app.drain(); await flushLive();
  app.view.appendRecord({ text: '不要发送的报告', label: '预检' });
  app.view.setDraft('第二个问题'); app.view.submit();
  await flushLive(); app.drain(); await flushLive();
  assert.deepEqual(requests[1], [{ role: 'user', content: '第一个问题' }, { role: 'assistant', content: '真实回答' }, { role: 'user', content: '第二个问题' }]);
});

function feedbackClock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    tick(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
  };
}

for (const action of ['copy', 'copy-code']) {
  test(`${action} success restores its original control after 2500ms without losing focus`, async () => {
    const clock = feedbackClock();
    await withClipboard(async () => {}, async () => {
      const app = harness([{ id: 'a', role: 'assistant', status: 'complete', review: { state: 'pending', runId: 9 }, text: '```js\nconst x = 1;\n```' }], { documentView: clock });
      let control = app.list.querySelector(`[data-action="${action}"]`);
      const original = { label: control.getAttribute('aria-label'), title: control.title, text: control.textContent };
      app.action(action, 'a'); await flushCopy();
      control.focus();
      app.view.updateReviewState('accepted', { runId: 9 });
      control = app.list.querySelector(`[data-action="${action}"]`);
      clock.tick(2499); assert.equal(control.dataset.copyState, 'success');
      clock.tick(1);
      assert.equal(control.dataset.copyState, undefined);
      assert.equal(control.getAttribute('aria-label'), original.label);
      assert.equal(control.title, original.title);
      assert.equal(control.textContent, original.text);
      assert.equal(app.list.ownerDocument.activeElement, control);
      app.view.destroy();
    });
  });
}

test('copy feedback cancels old deadlines on retry and preserves errors until retried', async () => {
  const clock = feedbackClock();
  let resolve, reject;
  await withClipboard(() => new Promise((done, fail) => { resolve = done; reject = fail; }), async () => {
    const app = harness(turns(), { documentView: clock });
    const control = app.list.querySelector('[data-action="copy"]');
    app.action('copy', 'user-a'); resolve(); await flushCopy();
    const oldTimer = [...clock.timers.values()][0]?.callback;
    clock.tick(1000); app.action('copy', 'user-a');
    oldTimer?.(); clock.tick(1500);
    assert.equal(control.dataset.copyState, 'pending');
    reject(new Error('denied')); await flushCopy(); clock.tick(10000);
    assert.equal(control.dataset.copyState, 'error');
    app.action('copy', 'user-a'); resolve(); await flushCopy();
    clock.tick(2499); assert.equal(control.dataset.copyState, 'success');
    clock.tick(1); assert.equal(control.dataset.copyState, undefined);
    app.view.destroy(); assert.equal(clock.timers.size, 0);
  });
});

for (const pending of [false, true]) {
  test(`streaming code changes invalidate ${pending ? 'pending' : 'successful'} copy snapshots`, async () => {
    let resolve;
    await withClipboard(() => new Promise(done => { resolve = done; }), async () => {
      const app = harness([], { documentView: feedbackClock(), planFactory: () => ({ chunks: ['```js\nconst x =', ' 1;\n```'], workingDelayMs: 1, chunkDelayMs: 1 }) });
      app.view.submit({ input: 'code' });
      while (!app.list.querySelector('code')) assert.equal(app.step(), true);
      const id = app.view.getMessages().at(-1).id;
      app.action('copy-code', id);
      if (!pending) { resolve(); await flushCopy(); }
      app.drain();
      if (pending) { resolve(); await flushCopy(); }
      const control = app.list.querySelector('[data-action="copy-code"]');
      assert.equal(control.dataset.copyState, undefined);
      assert.equal(control.getAttribute('aria-label'), '复制代码');
      assert.doesNotMatch(app.status.textContent, /已复制/);
      app.view.destroy();
    });
  });
}

for (const action of ['copy', 'copy-guide']) {
  test(`guide ${action} success restores its full original semantics`, async () => {
    const clock = feedbackClock();
    await withClipboard(async () => {}, async () => {
      const message = guideMessage();
      const app = harness([message], { documentView: clock });
      const control = app.list.querySelector(`[data-action="${action}"]`);
      const label = control.getAttribute('aria-label');
      const text = control.textContent;
      app.action(action, message.id); await flushCopy();
      assert.match(control.getAttribute('aria-label'), /已复制完整清单/);
      clock.tick(2500);
      assert.equal(control.getAttribute('aria-label'), label);
      assert.equal(control.textContent, text);
      assert.equal(control.dataset.copyGuide, 'true');
      app.view.destroy();
    });
  });
}

for (const end of ['replaceMessages', 'destroy']) {
  test(`copy success timeout is disposed by ${end} and stale callbacks cannot clear a new copy`, async () => {
    const clock = feedbackClock();
    await withClipboard(async () => {}, async () => {
      const app = harness(turns(), { documentView: clock });
      app.action('copy', 'assistant-a'); await flushCopy();
      const stale = [...clock.timers.values()][0].callback;
      if (end === 'replaceMessages') app.view.replaceMessages(turns()); else app.view.destroy();
      assert.equal(clock.timers.size, 0);
      if (end === 'replaceMessages') {
        app.action('copy', 'assistant-a'); await flushCopy();
        stale();
        const control = app.list.querySelectorAll('[data-action="copy"]').find(node => node.dataset.messageId === 'assistant-a');
        assert.equal(control.dataset.copyState, 'success');
        clock.tick(2500); assert.equal(control.dataset.copyState, undefined);
        app.view.destroy();
      } else { stale(); assert.equal(clock.timers.size, 0); }
    });
  });
}

test('copy success survives later streaming prose when the copied code has not changed', async () => {
  const clock = feedbackClock();
  await withClipboard(async () => {}, async () => {
    const app = harness([], { documentView: clock, planFactory: () => ({ chunks: ['```js\nconst x = 1;\n```', '\n\nLater explanation'], workingDelayMs: 1, chunkDelayMs: 1 }) });
    app.view.submit({ input: 'code' });
    while (!app.list.querySelector('code')) assert.equal(app.step(), true);
    app.action('copy-code', app.view.getMessages().at(-1).id); await flushCopy();
    app.drain();
    assert.equal(app.list.querySelector('[data-action="copy-code"]').dataset.copyState, 'success');
    clock.tick(2500);
    assert.equal(app.list.querySelector('[data-action="copy-code"]').dataset.copyState, undefined);
    app.view.destroy();
  });
});

test('an outdated clipboard promise cannot overwrite a newer copy of the completed code', async () => {
  const resolves = [];
  await withClipboard(() => new Promise(done => { resolves.push(done); }), async () => {
    const app = harness([], { documentView: feedbackClock(), planFactory: () => ({ chunks: ['```js\nconst x =', ' 1;\n```'], workingDelayMs: 1, chunkDelayMs: 1 }) });
    app.view.submit({ input: 'code' });
    while (!app.list.querySelector('code')) assert.equal(app.step(), true);
    const id = app.view.getMessages().at(-1).id;
    app.action('copy-code', id);
    app.drain();
    app.action('copy-code', id);
    assert.equal(resolves.length, 2);
    resolves[0](); await flushCopy();
    assert.equal(app.list.querySelector('[data-action="copy-code"]').dataset.copyState, 'pending');
    resolves[1](); await flushCopy();
    assert.equal(app.list.querySelector('[data-action="copy-code"]').dataset.copyState, 'success');
    app.view.destroy();
  });
});

test('copy success announcement expires with its button feedback', async () => {
  const clock = feedbackClock();
  await withClipboard(async () => {}, async () => {
    const app = harness(turns(), { documentView: clock });
    app.action('copy', 'assistant-a'); await flushCopy();
    assert.equal(app.status.textContent, '已复制消息。');
    clock.tick(2500); assert.equal(app.status.textContent, '');
    app.view.destroy();
  });
});

test('an older copy deadline cannot clear an identical newer copy announcement', async () => {
  const clock = feedbackClock();
  await withClipboard(async () => {}, async () => {
    const app = harness(turns(), { documentView: clock });
    app.action('copy', 'assistant-a'); await flushCopy(); clock.tick(1000);
    app.action('copy', 'assistant-b'); await flushCopy(); clock.tick(1500);
    assert.equal(app.status.textContent, '已复制消息。');
    clock.tick(1000); assert.equal(app.status.textContent, '');
    app.view.destroy();
  });
});

for (const later of ['failure', 'run']) {
  test(`copy success timeout preserves a later ${later} announcement`, async () => {
    const clock = feedbackClock(); let fail = false;
    await withClipboard(async () => { if (fail) throw new Error('denied'); }, async () => {
      const app = harness(turns(), { documentView: clock });
      app.action('copy', 'assistant-a'); await flushCopy();
      if (later === 'failure') { fail = true; app.action('copy', 'assistant-b'); await flushCopy(); }
      else app.view.submit({ input: 'Another question' });
      const latest = app.status.textContent;
      assert.ok(latest); assert.notEqual(latest, '已复制消息。');
      clock.tick(2500); assert.equal(app.status.textContent, latest);
      app.view.destroy();
    });
  });
}

test('stream source changes clear their own successful copy announcement immediately', async () => {
  await withClipboard(async () => {}, async () => {
    const app = harness([], { documentView: feedbackClock(), planFactory: () => ({ chunks: ['```js\nconst x =', ' 1;', '\n```'], workingDelayMs: 1, chunkDelayMs: 1 }) });
    app.view.submit({ input: 'code' });
    while (!app.list.querySelector('code')) assert.equal(app.step(), true);
    app.action('copy-code', app.view.getMessages().at(-1).id); await flushCopy();
    assert.equal(app.status.textContent, '已复制代码。');
    app.step(); assert.equal(app.status.textContent, '');
    app.view.destroy();
  });
});

test('project agent preserves ordered multi-tool facts and text, opens local artifact, and stops only pending tools', async () => {
  let active;
  const opened = [];
  const app = harness([], { requireModel: true, onOpenArtifact: id => opened.push(id), transport: args => { active = args; return new Promise(() => {}); } });
  app.view.setModelSelection({ providerId: 'openai', model: 'test', label: 'Test' });
  app.view.setDraft('检查项目'); app.view.submit(); await flushLive();
  const result = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '检查报告', summary: '请核对范围', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
  active.onDelta('先检查', { textId: 't1' });
  active.onToolEvent({ type: 'tool-input-start', toolCallId: 'one', toolName: 'project_read' });
  active.onToolEvent({ type: 'tool-input-available', toolCallId: 'one', toolName: 'project_read', input: { kind: 'check', query: '' } });
  active.onToolEvent({ type: 'tool-output-available', toolCallId: 'one', output: result });
  active.onDelta('再说明', { textId: 't2' });
  active.onToolEvent({ type: 'tool-input-start', toolCallId: 'two', toolName: 'project_read' });
  active.onDelta('补充', { textId: 't2' });
  const message = app.view.getMessages().at(-1);
  assert.deepEqual(message.parts.map(part => part.type), ['text', 'tool', 'text', 'tool']);
  assert.equal(message.parts[2].text, '再说明补充');
  assert.equal(message.parts[1].tool.state, 'success');
  app.action('open-artifact', message.id); await flushLive(); assert.deepEqual(opened, ['artifact-1']);
  app.view.stop();
  assert.equal(message.parts[1].tool.state, 'success');
  assert.equal(message.parts[3].tool.state, 'canceled');
  active.onToolEvent({ type: 'tool-output-available', toolCallId: 'two', output: result });
  assert.equal(message.parts[3].tool.state, 'canceled');
  assert.doesNotMatch(app.list.textContent, /演示|示例/);
});

test('project artifact open failure remains recoverable and tool summaries are inert text', async () => {
  const result = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '<script>report</script>', summary: '<img src=x onerror=alert(1)>', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
  const message = { id: 'a1', role: 'assistant', text: '', status: 'complete', live: { providerId: 'openai', model: 'test', messages: [] }, parts: [{ type: 'tool', tool: { kind: 'project', name: 'project_read', toolCallId: 'one', state: 'success', label: '检查项目', parameters: { kind: 'check', query: '' } }, result }] };
  const app = harness([message], { onOpenArtifact() { return Promise.reject(new Error('private failure')); } });
  assert.equal(app.list.querySelector('script'), null);
  assert.equal(app.list.querySelector('img'), null);
  app.action('open-artifact', 'a1'); await flushLive();
  assert.match(app.status.textContent, /无法打开本机报告/);
  assert.doesNotMatch(app.status.textContent, /private failure/);
  assert.equal(app.view.getMessages()[0].parts[0].tool.state, 'success');
});


test('imported legacy tool lookup passes the schema-validated run association without claiming verification', async () => {
  const result = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '报告', summary: '历史摘要', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 2 };
  const message = { id: 'import-a', role: 'assistant', text: '历史说明', status: 'complete', provenance: 'imported',
    tool: { kind: 'project', name: 'project_read', toolCallId: 'one', state: 'success', label: '检查项目', parameters: { kind: 'check', query: '' }, provenance: 'imported' }, structuredResult: result };
  const opened = [];
  const app = harness([message], { onOpenArtifact: (...args) => opened.push(args) });
  assert.match(app.list.textContent, /导入历史/);
  assert.match(app.list.textContent, /查找并核验本机报告/);
  app.action('open-artifact', message.id); await flushLive();
  assert.deepEqual(opened, [['artifact-1', { runId: 'run-1', kind: 'check', projectRevision: 1, contextRevision: 2 }]]);
  assert.equal(app.view.getMessages()[0].provenance, 'imported');
  assert.doesNotMatch(app.list.textContent, /完整报告保存在本机|以上为工具事实摘要/);
  app.view.destroy();
});

test('artifact actions replace a completed run announcement before host lookup settles', async () => {
  const result = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '报告', summary: '摘要', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 0 };
  let finish;
  const message = { id: 'local', role: 'assistant', text: '', status: 'complete', tool: { kind: 'project', name: 'project_read', state: 'success', label: '检查项目' }, structuredResult: result };
  const app = harness([message], { onOpenArtifact: () => new Promise(resolve => { finish = resolve; }) });
  app.status.dataset.state = 'complete'; app.status.dataset.announcement = 'run';
  app.action('open-artifact', message.id);
  assert.equal(app.status.dataset.announcement, 'action', 'host lookup feedback must not inherit the visually hidden run announcement');
  assert.match(app.status.textContent, /核验/);
  await flushLive(); finish(); await flushLive();
  app.view.destroy();
});

test('jump control stays above the reader boundary when recovery feedback changes height', () => {
  let observer;
  class ResizeObserver {
    constructor(callback) { observer = this; this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  const app = harness(turns(), { documentView: { ResizeObserver } });
  const offsets = [];
  const shell = { getBoundingClientRect: () => ({ bottom: 850 }), style: { setProperty: (_, value) => offsets.push(value) } };
  app.scroll.closest = () => shell;
  app.scroll.getBoundingClientRect = () => ({ top: 80, bottom: 610 });
  observer.callback([{ target: app.scroll, contentRect: { width: 700, height: 530 } }]);
  assert.equal(offsets.at(-1), '254px');
  app.scroll.getBoundingClientRect = () => ({ top: 80, bottom: 550 });
  observer.callback([{ target: app.scroll, contentRect: { width: 700, height: 470 } }]);
  assert.equal(offsets.at(-1), '314px');
  app.view.destroy();
});

test('observer-driven textarea resizing coalesces outside the notification and cancels on disposal', () => {
  let observer, sequence = 0;
  const frames = new Map();
  class ResizeObserver {
    constructor(callback) { observer = this; this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  const app = harness([], { documentView: { ResizeObserver,
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  } });
  const before = app.input.style.height;
  app.input.scrollHeight = 110;
  observer.callback([{ target: app.input, contentRect: { width: 700 } }]);
  assert.equal(app.input.style.height, before, 'do not change observed geometry during notification delivery');
  observer.callback([{ target: app.input, contentRect: { width: 500 } }]);
  assert.equal(frames.size, 1, 'coalesce width changes in one frame');
  const draw = [...frames.values()][0]; frames.clear(); draw();
  assert.equal(app.input.style.height, '110px');
  observer.callback([{ target: app.input, contentRect: { width: 400 } }]);
  assert.equal(frames.size, 1);
  app.view.destroy();
  assert.equal(frames.size, 0);
});

test('imported guide copy and both download formats preserve the provenance warning', async () => {
  const copied = [], downloads = [];
  await withClipboard(async text => { copied.push(text); }, async () => {
    const message = { ...guideMessage(), provenance: 'imported' };
    const app = harness([message], { artifactDownloader: { download(artifact) { downloads.push(artifact); return true; }, dispose() {} } });
    app.action('copy', message.id); await flushCopy();
    app.action('copy-guide', message.id); await flushCopy();
    app.action('download-guide-markdown', message.id);
    app.action('download-guide-json', message.id);
    for (const text of [...copied, downloads[0].text]) {
      assert.match(text, /导入历史.*未在本机核验/);
      assert.doesNotMatch(text, /本清单依据仓库收录规则生成/);
    }
    assert.equal(copied.length, 2);
    assert.match(JSON.parse(downloads[1].text).notes[0], /导入历史.*未在本机核验/);
    app.view.destroy();
  });
});


test('send shortcut preference controls Enter while Shift, Alt and IME keep ownership of input', () => {
  for (const sendKey of ['enter', 'mod-enter']) {
    const cases = [
      [{}, sendKey === 'enter'], [{ ctrlKey: true }, true], [{ metaKey: true }, true],
      [{ shiftKey: true }, false], [{ shiftKey: true, ctrlKey: true }, false],
      [{ altKey: true }, false], [{ ctrlKey: true, altKey: true }, false],
      [{ isComposing: true, ctrlKey: true }, false], [{ keyCode: 229, metaKey: true }, false],
      [{ defaultPrevented: true, ctrlKey: true }, false],
    ];
    for (const [modifiers, submits] of cases) {
      const app = harness([], { getSendShortcut: () => sendKey });
      app.view.setDraft('Send this draft');
      const event = app.input.dispatch('keydown', { key: 'Enter', ...modifiers });
      assert.equal(app.view.getMessages().some(message => message.role === 'user'), submits, JSON.stringify({ sendKey, modifiers }));
      assert.equal(event.defaultPrevented, submits || !!modifiers.defaultPrevented);
      if (!submits) assert.equal(app.input.value, 'Send this draft');
      app.view.destroy();
    }
  }
});

test('live shortcut refresh updates idle and edit hints without touching draft, focus or disabled controls', () => {
  let sendKey = 'enter';
  const app = harness(turns(), { getSendShortcut: () => sendKey });
  const hint = app.input.closest('.composer').querySelector('.agent-composer__hint');
  app.view.setDraft('Keep draft'); app.input.focus(); app.sendButton.disabled = true;
  sendKey = 'mod-enter'; app.view.refreshPreferences();
  assert.match(hint.textContent, /Ctrl \/ ⌘ \+ Enter 发送/);
  assert.equal(app.input.value, 'Keep draft'); assert.equal(app.input.ownerDocument.activeElement, app.input);
  assert.equal(app.sendButton.disabled, true);
  app.action('edit', 'user-a'); assert.match(hint.textContent, /Ctrl \/ ⌘ \+ Enter 发送修改/);
  sendKey = 'enter'; app.view.refreshPreferences(); assert.match(hint.textContent, /^Enter 发送修改/);
  assert.equal(app.view.getDraftState().edit.messageId, 'user-a');
  app.view.destroy(); const previous = hint.textContent;
  sendKey = 'mod-enter'; app.view.refreshPreferences(); assert.equal(hint.textContent, previous);
});

test('modifier send shortcut preserves busy drafts and refreshes record-only hints', () => {
  const app = harness([], { getSendShortcut: () => 'mod-enter' });
  app.view.submit({ input: 'Running' }); app.view.setDraft('Next draft');
  const plain = app.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(plain.defaultPrevented, false); assert.doesNotMatch(app.status.textContent, /未发送/);
  app.input.dispatch('keydown', { key: 'Enter', ctrlKey: true });
  assert.match(app.status.textContent, /草稿.*未发送/); assert.equal(app.input.value, 'Next draft');
  app.view.destroy();
  let sendKey = 'mod-enter';
  const records = harness([], { recordOnly: true, getSendShortcut: () => sendKey });
  const hint = records.input.closest('.composer').querySelector('.agent-composer__hint');
  assert.match(hint.textContent, /Ctrl \/ ⌘ \+ Enter 保存记录/);
  sendKey = 'enter'; records.view.refreshPreferences(); assert.match(hint.textContent, /^Enter 保存记录/);
  records.view.destroy();
});
