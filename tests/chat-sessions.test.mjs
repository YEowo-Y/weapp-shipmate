import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import { sessionMatch } from '../desktop/design-previews/session-search.js';
import { createActionButton } from './helpers/ui-action.mjs';

const source = readFileSync(new URL('../desktop/design-previews/chat.js', import.meta.url), 'utf8');

test('archived settings entry reveals mobile history regardless of responsive script order', () => {
  for (const responsiveFirst of [true, false]) {
    const listeners = new Map();
    let drawer = responsiveFirst ? { open: false } : null;
    const focusVisibility = [];
    const context = vm.createContext({
      URL, window: { location: { href: 'http://localhost/chat-full.html?panel=archived' } },
      document: { addEventListener(type, callback) { listeners.set(type, callback); } },
      historyFilter: { value: 'active', closest: () => drawer, focus() { focusVisibility.push(drawer?.open ?? true); } },
      renderHistory() {}, openHistoryData() { assert.fail('must not open backup'); },
    });
    const start = source.indexOf('const requestedPanel =');
    vm.runInContext(source.slice(start, source.indexOf('\nfunction guardUnsavedHistory', start)), context);
    if (!responsiveFirst) {
      drawer = { open: false };
      listeners.get('shipmate:responsive-ready')?.();
    }
    assert.equal(context.historyFilter.value, 'archived');
    assert.equal(drawer.open, true, `responsiveFirst=${responsiveFirst}: history must be visible`);
    assert.equal(focusVisibility.at(-1), true, 'focus happens after the drawer opens');
  }
});

test('ordinary navigation does not reveal mobile history; archived desktop entry needs no drawer', () => {
  for (const archived of [true, false]) {
    const drawer = archived ? null : { open: false };
    let focused = 0;
    const listeners = new Map();
    const context = vm.createContext({
      URL, window: { location: { href: `http://localhost/chat-full.html${archived ? '?panel=archived' : ''}` } },
      document: { addEventListener(type, callback) { listeners.set(type, callback); } },
      historyFilter: { value: 'active', closest: () => drawer, focus() { focused++; } },
      renderHistory() {}, openHistoryData() {},
    });
    const start = source.indexOf('const requestedPanel =');
    vm.runInContext(source.slice(start, source.indexOf('\nfunction guardUnsavedHistory', start)), context);
    listeners.get('shipmate:responsive-ready')?.();
    if (archived) assert.ok(focused > 0);
    else { assert.equal(drawer.open, false); assert.equal(focused, 0); }
  }
});

test('session switches restore only their own explicitly selected model; new sessions start demo', () => {
  const { page, state, sessions } = harness();
  sessions[0].modelSelection = { providerId: 'openai', model: 'a', label: 'A' };
  sessions[1].modelSelection = { providerId: 'ollama', model: 'b', label: 'B' };
  page.switchSession('b');
  assert.equal(state.modelSelection.model, 'b');
  page.switchSession('a');
  assert.equal(state.modelSelection.model, 'a');
  page.createSession();
  assert.equal(state.modelSelection, null);
});
function pageFunction(name) {
  const match = source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `Page function ${name} exists`);
  return match[0];
}

test('save recovery returns focus from hidden controls without stealing active typing', () => {
  const retryHistory = {}, reloadHistory = {}, backupHistory = {};
  const input = { focus() { context.document.activeElement = input; } };
  const context = vm.createContext({
    temporaryMode: false, leavingGuard: false, input, retryHistory, reloadHistory, backupHistory,
    historyNotice: { dataset: {}, contains: node => node === retryHistory }, historyNoticeText: {},
    historySaveStatus: { parentElement: { dataset: {} } },
    document: { activeElement: retryHistory },
    guardUnsavedHistory() {}, window: { addEventListener() {}, removeEventListener() {} },
  });
  vm.runInContext(pageFunction('updateHistorySaveStatus'), context);
  context.updateHistorySaveStatus({ state: 'saving', dirty: true });
  assert.equal(context.document.activeElement, input);
  const elsewhere = {};
  context.document.activeElement = elsewhere;
  context.updateHistorySaveStatus({ state: 'saved', dirty: false });
  assert.equal(context.document.activeElement, elsewhere);
  context.updateHistorySaveStatus({ state: 'error', code: 'version-change', dirty: true });
  assert.equal(retryHistory.hidden, true);
  assert.equal(reloadHistory.hidden, false);
  assert.equal(backupHistory.hidden, false);
  context.updateHistorySaveStatus({ state: 'error', code: 'apply-failed', dirty: false });
  assert.equal(retryHistory.hidden, true);
  assert.equal(reloadHistory.hidden, false);
  assert.equal(backupHistory.hidden, true);
  assert.match(context.historyNoticeText.textContent, /已保存.*重新载入/);
  assert.doesNotMatch(context.historySaveStatus.textContent, /尚未保存/);
});

test('session mutations queue persistence without saving unsuccessful rename attempts', () => {
  const { page, state, input } = harness();
  page.setSessionTitle('a', '已保存的任务名称');
  assert.equal(state.saves, 1);
  page.setSessionTitle('a', '  ');
  assert.equal(state.saves, 1);
  page.removeReference('app.json');
  assert.equal(state.saves, 2);
  input.value = '刷新后保留的草稿';
  page.syncCompletions();
  assert.equal(state.saves, 3);
  page.switchSession('b');
  assert.ok(state.saves > 3);
  const beforeCreate = state.saves;
  page.createSession();
  assert.ok(state.saves > beforeCreate);
});

test('opening a history text match reveals that message without resetting its draft or disclosures', () => {
  let restored, focused = false, saves = 0, selected;
  const article = { dataset: { messageId: 'matching-message' }, getBoundingClientRect: () => ({ top: 180 }), focus() { focused = true; } };
  const view = { disclosures: [{ messageId: 'matching-message', component: 'tool', open: true }], scrollTop: 800, followLatest: true };
  const context = vm.createContext({
    sessions: [{ id: 'target', title: '任务', messages: [{ id: 'matching-message', text: '可查询的历史正文' }] }],
    historySearch: { value: '历史正文' }, messageList: { children: [article] },
    chatScroll: { scrollTop: 800, getBoundingClientRect: () => ({ top: 100 }) },
    conversationStatus: {}, conversation: { getViewState: () => view, restoreViewState: state => { restored = state; } },
    switchSession: id => { selected = id; }, scheduleHistorySave: () => { saves++; },
  });
  context.sessionMatch = sessionMatch;
  vm.runInContext(pageFunction('openHistoryResult'), context);
  context.openHistoryResult('target');
  assert.equal(selected, 'target');
  assert.equal(restored.scrollTop, 864);
  assert.equal(restored.followLatest, false);
  assert.equal(restored.disclosures, view.disclosures);
  assert.equal(article.tabIndex, -1);
  assert.equal(focused, true);
  assert.equal(saves, 1);
  focused = false;
  context.historySearch.value = '任务';
  context.openHistoryResult('target');
  assert.equal(focused, false, 'title matches preserve the normal session reading position');
});

// Runs page lifecycle functions together. Native dialog layout/focus needs browser verification.
function harness({ callbacks = false } = {}) {
  const doc = {
    activeElement: null,
    createElement(tag) {
      const listeners = new Map();
      const node = {
        tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, value: '', textContent: '', hidden: false,
        append(...items) { items.forEach(item => { if (typeof item === 'string') item = { textContent: item }; item.parentNode = this; this.children.push(item); }); },
        insertBefore(item, next) { item.parentNode = this; const index = this.children.indexOf(next); this.children.splice(index < 0 ? this.children.length : index, 0, item); },
        replaceChildren(...items) { this.children = []; this.append(...items); },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name]; },
        removeAttribute(name) { delete this.attributes[name]; },
        focus(options) { doc.activeElement = this; this.focusOptions = options; }, select() {},
        closest(selector) { return selector === '[hidden]' && this.hidden ? this : this.parentNode?.closest?.(selector) || null; },
        addEventListener(name, fn) { listeners.set(name, fn); },
        dispatchEvent(event) { listeners.get(event.type)?.(event); },
        querySelector(selector) {
          return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
          const all = this.children.flatMap(child => [child, ...(child.querySelectorAll?.('*') || [])]);
          if (selector === '*') return all;
          if (selector.startsWith('.')) return all.filter(child => selector.slice(1).split('.').every(cls => child.className?.split(' ').includes(cls)));
          return all.filter(child => child.tagName === selector.toUpperCase());
        },
        close(value) { this.returnValue = value; listeners.get('close')?.(); },
      };
      return node;
    },
  };
  const input = doc.createElement('textarea');
  input.value = 'A 的草稿';
  input.setRangeText = () => {};
  const sessions = [
    { id: 'a', title: '预检说明', draft: '', references: ['app.json'], pendingScenario: 'timeout', messages: [{ role: 'user', text: '核对隐私声明' }] },
    { id: 'b', title: '服务类目', draft: 'B 的草稿', references: ['pages/index/index.js'], pendingScenario: 'normal', messages: [{ role: 'assistant', text: '需要补充业务信息' }] },
  ];
  const state = { stopped: [], displayed: sessions[0].messages, dialog: null, submitted: 0, saves: 0 };
  const context = vm.createContext({
    document: doc, input, sessions, currentSessionId: 'a', sessionSequence: 2, pendingScenario: 'normal', completionComposing: false,
    historyMutationBusy: false, historyFilter: { value: 'active' },
    contextBar: doc.createElement('div'), chatTitle: doc.createElement('button'), chatEmpty: doc.createElement('section'),
    historySearch: doc.createElement('input'), clearHistorySearch: doc.createElement('button'), conversationStatus: doc.createElement('p'),
    historyList: doc.createElement('div'), historyStatus: doc.createElement('p'), historyRows: new Map(),
    createIcon: () => doc.createElement('svg'), createActionButton, Event: class { constructor(type) { this.type = type; } },
    completionAtCaret: () => null, setOpen() {}, mentionPop: {}, notify() {}, closeComposerSurfaces() {}, syncReviewSurface() {},
    scheduleHistorySave() { state.saves++; },
    createDemoPlan: (text, options) => ({ text, ...options }),
    conversation: {
      getViewState: () => ({ scrollTop: 650, followLatest: false }),
      restoreViewState(value) { state.viewState = value; },
      getDraftState: () => ({ draft: input.value, draftView: { selectionStart: input.selectionStart, selectionEnd: input.selectionEnd, selectionDirection: input.selectionDirection, scrollTop: input.scrollTop }, edit: { messageId: 'edit-a', originalDraft: '原草稿' } }),
      stop() {
        state.stopped.push(context.currentSessionId);
        if (callbacks) context.updateSessionMessages(context.currentSession().messages.map(message => ({ ...message, status: 'stopped' })));
      },
      replaceMessages(messages) { state.displayed = messages; if (callbacks) context.updateSessionMessages(messages); },
      setDraft(value, edit, draftView) { input.value = value; state.edit = edit; Object.assign(input, draftView || { selectionStart: 0, selectionEnd: 0, selectionDirection: 'none', scrollTop: 0 }); },
      setModelSelection(value) { state.modelSelection = value; },
      submit() { state.submitted++; },
    },
    window: { shipmateUI: {
      makeDialog() { const dialog = doc.createElement('dialog'); const body = doc.createElement('div'); body.className = 'shipmate-dialog__body'; dialog.append(body); state.dialog = dialog; return dialog; },
      showDialog(dialog, target) { target.focus(); return dialog; },
    } },
  });
  context.sessionMatch = sessionMatch;
  const names = ['currentSession', 'renderHistory', 'renderReferences', 'removeReference', 'switchSession', 'createSession', 'addMention', 'runSlash', 'planForSession', 'updateSessionMessages', 'setSessionTitle', 'openSessionRename', 'useStarter', 'syncCompletions'];
  vm.runInContext(names.map(pageFunction).join('\n'), context);
  return { page: context, state, doc, sessions, input };
}

test('switching A/B preserves draft, edit and distinct references; invalid IDs are harmless', () => {
  const { page, state, sessions, input } = harness();
  page.switchSession('b');
  assert.equal(sessions[0].draft, 'A 的草稿');
  assert.equal(input.value, 'B 的草稿');
  assert.deepEqual(page.contextBar.children.map(chip => chip.dataset.path), ['pages/index/index.js']);
  input.value = 'B 新草稿';
  page.switchSession('a');
  assert.equal(input.value, 'A 的草稿');
  assert.equal(state.edit.messageId, 'edit-a');
  assert.deepEqual(page.contextBar.children.map(chip => chip.dataset.path), ['app.json']);
  page.switchSession('missing');
  assert.equal(page.currentSessionId, 'a');
  assert.deepEqual(state.stopped, ['a', 'b']);
});

test('reference removal survives switching; adding is deduplicated by full path', () => {
  const { page, sessions } = harness();
  const item = { querySelector: () => ({ textContent: 'app.json' }) };
  page.addMention(item);
  assert.deepEqual(sessions[0].references, ['app.json']);
  page.removeReference('app.json');
  page.switchSession('b'); page.switchSession('a');
  assert.equal(page.contextBar.children.length, 0);
  page.addMention(item);
  assert.deepEqual([...sessions[0].references], ['app.json']);
  assert.deepEqual(sessions[1].references, ['pages/index/index.js']);
});

test('scenario follows its session draft and is consumed only once', () => {
  const { page } = harness();
  page.runSlash({ dataset: { scenario: 'timeout' } });
  page.switchSession('b');
  assert.equal(page.planForSession('普通任务').scenario, 'normal');
  page.switchSession('a');
  assert.equal(page.planForSession(page.input.value).scenario, 'timeout');
  assert.equal(page.planForSession('下一次').scenario, 'normal');
});

test('new session starts empty and does not inherit references or scenario', () => {
  const { page, sessions, state } = harness();
  page.historySearch.value = '不会匹配新会话';
  page.createSession();
  assert.equal(page.currentSession().messages.length, 0);
  assert.equal(page.currentSession().references.length, 0);
  assert.equal(page.currentSession().pendingScenario, 'normal');
  assert.equal(page.historySearch.value, '');
  assert.equal(state.displayed.length, 0);
  assert.equal(sessions.find(s => s.id === 'a').draft, 'A 的草稿');
});

test('first user message supplies a bounded title; later messages and manual names stay stable', () => {
  const { page } = harness();
  page.createSession();
  page.updateSessionMessages([{ role: 'user', text: '  请核对\n 隐私声明  ', status: 'complete' }]);
  assert.equal(page.currentSession().title, '请核对 隐私声明');
  page.updateSessionMessages([{ role: 'user', text: '另一条消息', status: 'complete' }]);
  assert.equal(page.currentSession().title, '请核对 隐私声明');
  assert.equal(page.setSessionTitle(page.currentSessionId, '  我的小程序  '), true);
  page.updateSessionMessages([{ role: 'user', text: '再次变化', status: 'complete' }]);
  assert.equal(page.chatTitle.textContent, '我的小程序');
  assert.equal(page.setSessionTitle(page.currentSessionId, ' \n '), false);
  assert.equal(page.setSessionTitle('missing', '名称'), false);
  assert.equal(page.setSessionTitle(page.currentSessionId, 'x'.repeat(81)), false);
});

test('search finds title or literal message text, never an unrelated tool or hidden trace', () => {
  const { page, sessions } = harness();
  assert.equal(page.sessionMatch(sessions[0], '  预检 ').matched, true);
  assert.equal(page.sessionMatch(sessions[0], '隐私').matched, true);
  assert.match(page.sessionMatch(sessions[0], '隐私').snippet, /隐私/);
  assert.equal(page.sessionMatch(sessions[0], '权限').matched, false);
  const session = { title: 'Demo', messages: [{ role: 'assistant', text: 'Use API <script>', tool: { summary: ['secret'] } }] };
  assert.equal(page.sessionMatch(session, 'api').matched, true);
  assert.equal(page.sessionMatch(session, '<script>').matched, true);
  assert.equal(page.sessionMatch(session, 'secret').matched, false);
  assert.equal(page.sessionMatch(session, '').matched, true);
});

test('history opens the matching saved message even when its title also matches', () => {
  const term = '[A+B]  🚢';
  const session = { title: '检查 ' + term, messages: [
    { id: 'earlier', role: 'assistant', text: 'before🚢' + '前'.repeat(15) + term + '后'.repeat(15) + '🚢after' },
    { id: 'latest', role: 'user', text: '最近的请求' },
  ] };
  const match = sessionMatch(session, '  [a+b]  🚢 ');
  assert.equal(match.messageId, 'earlier');
  assert.equal(match.snippet, '…🚢' + '前'.repeat(15) + term + '后'.repeat(15) + '🚢…');
  assert.deepEqual(sessionMatch(session, '检查'), { matched: true, snippet: '最近的请求' });
  assert.deepEqual(sessionMatch(session, '  '), { matched: true, snippet: '最近的请求' });
});

test('rename dialog validates whitespace, saves exact targeted session and supports cancel', () => {
  const { page, state, sessions } = harness();
  page.openSessionRename('a', page.chatTitle);
  let dialog = state.dialog;
  const field = dialog.querySelector('input');
  const form = dialog.querySelector('form');
  const actions = dialog.querySelectorAll('wa-button');
  assert.equal(actions.length, 2);
  assert.equal(actions[0].type, 'button');
  assert.equal(actions[1].type, 'submit');
  field.value = '  ';
  form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(sessions[0].title, '预检说明');
  field.value = '新的预检名称';
  page.currentSessionId = 'b';
  form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(sessions[0].title, '新的预检名称');
  assert.equal(sessions[1].title, '服务类目');
  assert.equal(dialog.returnValue, 'saved');
  page.openSessionRename('b', page.chatTitle);
  dialog = state.dialog;
  dialog.querySelector('input').value = '尚未保存';
  dialog.querySelector('wa-button').dispatchEvent({ type: 'click' });
  assert.equal(dialog.returnValue, 'cancel');
  assert.equal(sessions[1].title, '服务类目');
});

test('starter fills an editable draft without executing a request', () => {
  const { page, input, state } = harness();
  page.createSession();
  page.useStarter('请说明隐私声明需要核对哪些信息。');
  assert.equal(input.value, '请说明隐私声明需要核对哪些信息。');
  assert.equal(page.currentSession().draft, input.value);
  assert.equal(state.submitted, 0);
});

test('search reuses row controls, renders literal excerpts and clears empty results', () => {
  const { page, doc } = harness();
  page.renderHistory();
  const row = page.historyRows.get('a');
  const control = row.querySelector('.history__item');
  control.focus();
  page.historySearch.value = '隐私';
  page.renderHistory();
  assert.equal(row.hidden, false);
  assert.equal(page.historyRows.get('b').hidden, true);
  assert.equal(page.historyRows.get('a').querySelector('.history__item'), control);
  assert.equal(doc.activeElement, control);
  assert.match(row.querySelector('.history__snippet').textContent, /隐私/);
  page.historySearch.value = '没有这种内容';
  page.renderHistory();
  assert.equal(page.historyList.querySelector('.history__empty').hidden, false);
  assert.equal(page.historyStatus.textContent, '0 个匹配会话');
  page.historySearch.value = '';
  page.renderHistory();
  assert.equal(page.historyList.querySelector('.history__empty').hidden, true);
  assert.equal(page.clearHistorySearch.hidden, true);
});

test('new rows insert first without replacing prior controls; streaming preserves sidebar focus', () => {
  const { page, doc } = harness();
  page.renderHistory();
  const original = page.historyRows.get('a');
  page.createSession();
  const row = page.historyRows.get(page.currentSessionId);
  assert.equal(page.historyList.children[1], row);
  assert.equal(page.historyRows.get('a'), original);
  page.updateSessionMessages([{ role: 'user', text: '<script>长任务</script>', status: 'complete' }, { role: 'assistant', text: '', status: 'streaming' }]);
  const more = row.querySelector('.history__more');
  more.focus();
  for (let index = 1; index <= 10; index++) page.updateSessionMessages([
    { role: 'user', text: '<script>长任务</script>', status: 'complete' },
    { role: 'assistant', text: 'chunk '.repeat(index), status: 'streaming' },
  ]);
  assert.equal(row.querySelector('.chitem__t').textContent, '<script>长任务</script>');
  assert.equal(row.querySelector('.history__more'), more);
  assert.equal(doc.activeElement, more);
});

test('stop callbacks stay with the outgoing session before replacement callbacks run', () => {
  const { page, sessions } = harness({ callbacks: true });
  page.switchSession('b');
  assert.equal(sessions[0].messages[0].status, 'stopped');
  assert.equal(sessions[1].messages[0].text, '需要补充业务信息');
  assert.equal(sessions[1].messages[0].status, undefined);
  page.createSession();
  assert.equal(sessions.find(s => s.id === 'b').messages[0].status, 'stopped');
  assert.equal(page.currentSession().messages.length, 0);
});

test('rename is IME safe and focuses search if its filtered result disappears', () => {
  const { page, state, doc } = harness();
  page.historySearch.value = '预检';
  page.renderHistory();
  const more = page.historyRows.get('a').querySelector('.history__more');
  page.openSessionRename('a', more);
  const field = state.dialog.querySelector('input');
  const form = state.dialog.querySelector('form');
  field.value = '全新名称';
  field.dispatchEvent({ type: 'compositionstart' });
  let prevented = false;
  field.dispatchEvent({ type: 'keydown', key: 'Enter', isComposing: true, preventDefault() { prevented = true; } });
  form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(prevented, true);
  assert.equal(page.currentSession().title, '预检说明');
  field.dispatchEvent({ type: 'compositionend' });
  form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(page.historyRows.get('a').hidden, true);
  assert.equal(doc.activeElement, page.historySearch);
});

test('clearing a scenario draft or accepting a normal starter resets it; preserving a draft preserves its scenario', () => {
  const { page, input } = harness();
  page.createSession();
  page.runSlash({ dataset: { scenario: 'timeout' } });
  page.useStarter('不能覆盖已有草稿');
  assert.equal(page.currentSession().pendingScenario, 'timeout');
  input.value = '';
  page.syncCompletions();
  assert.equal(page.currentSession().pendingScenario, 'normal');
  page.currentSession().pendingScenario = 'timeout';
  page.useStarter('普通任务');
  assert.equal(page.planForSession(input.value).scenario, 'normal');
  input.value = '';
  page.useStarter('失败示例', 'tool-failure');
  assert.equal(page.planForSession(input.value).scenario, 'tool-failure');
});

test('an active search picks up streamed matches without moving focus from the query', () => {
  const { page, doc } = harness();
  page.historySearch.value = '完成';
  page.historySearch.focus();
  page.updateSessionMessages([{ role: 'assistant', text: '正在', status: 'streaming' }]);
  assert.equal(page.historyRows.get('a').hidden, true);
  page.updateSessionMessages([{ role: 'assistant', text: '正在完成', status: 'streaming' }]);
  assert.equal(page.historyRows.get('a').hidden, false);
  assert.equal(doc.activeElement, page.historySearch);
  assert.match(page.chatTitle.getAttribute('aria-label'), /预检说明/);
});

test('session switching stores and restores the matching reading snapshot', () => {
  const { page, sessions, state } = harness();
  page.switchSession('b');
  assert.equal(sessions[0].viewState.scrollTop, 650);
  assert.equal(state.viewState, undefined);
  page.switchSession('a'); assert.equal(state.viewState.scrollTop, 650);
});
test('captured request scenario does not consume a restored original draft scenario', () => {
  const { page, sessions } = harness();
  const plan = page.planForSession('Edited request', { context: { pendingScenario: 'normal', references: ['old.json'] } });
  assert.equal(plan.scenario, 'normal'); assert.equal(sessions[0].pendingScenario, 'timeout');
});

for (const action of ['switch', 'new']) {
  test(`${action} restores reading after composer and review layout settle without scrolling focus`, () => {
    const { page, sessions, input } = harness();
    const layout = { clientHeight: 600, scrollHeight: 1200, scrollTop: 0 }; const calls = [];
    sessions[1].viewState = { followLatest: true };
    page.conversation.setDraft = value => { input.value = value; layout.clientHeight = 400; calls.push('draft'); };
    page.syncReviewSurface = () => { layout.scrollHeight = 1600; calls.push('review'); };
    page.conversation.restoreViewState = saved => {
      layout.scrollTop = saved?.followLatest ? layout.scrollHeight - layout.clientHeight : 0;
      calls.push('restore');
    };
    input.focus = options => { if (!options?.preventScroll) layout.scrollTop = 99; calls.push('focus'); };
    if (action === 'switch') page.switchSession('b'); else page.createSession();
    assert.deepEqual(calls, ['review', 'draft', 'restore', 'focus']);
    assert.equal(layout.scrollTop, action === 'switch' ? 1200 : 0);
  });
}

test('session navigation forwards distinct selection and input scroll through new and existing sessions', () => {
  const { page, input } = harness();
  Object.assign(input, { selectionStart: 1, selectionEnd: 3, selectionDirection: 'backward', scrollTop: 48 });
  page.switchSession('b');
  Object.assign(input, { selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward', scrollTop: 12 });
  page.switchSession('a');
  assert.equal(input.selectionStart, 1); assert.equal(input.selectionEnd, 3);
  assert.equal(input.selectionDirection, 'backward'); assert.equal(input.scrollTop, 48);
  page.createSession();
  assert.equal(input.value, ''); assert.equal(input.scrollTop, 0);
  page.switchSession('b'); assert.equal(input.selectionEnd, 4); assert.equal(input.scrollTop, 12);
  page.switchSession('a'); assert.equal(input.selectionEnd, 3); assert.equal(input.scrollTop, 48);
});

test('choosing the current session focuses the composer without resetting or stopping it', () => {
  const { page, input, doc, state } = harness();
  input.selectionStart = 2; input.selectionEnd = 4; input.scrollTop = 32;
  page.chatTitle.focus(); page.switchSession('a');
  assert.equal(doc.activeElement, input); assert.equal(input.focusOptions.preventScroll, true);
  assert.equal(input.value, 'A 的草稿'); assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 4); assert.equal(input.scrollTop, 32);
  assert.equal(state.stopped.length, 0);
});

test('archive filter combines with literal search and keeps existing row controls', () => {
  const { page, sessions } = harness();
  sessions[0].archived = true;
  page.renderHistory();
  assert.equal(page.historyRows.get('a').hidden, true);
  assert.equal(page.historyRows.get('b').hidden, false);
  const row = page.historyRows.get('a');
  page.historyFilter.value = 'archived'; page.renderHistory();
  assert.equal(row.hidden, false);
  assert.equal(page.historyRows.get('b').hidden, true);
  page.historySearch.value = '不存在'; page.renderHistory();
  assert.equal(row.hidden, true);
  page.historySearch.value = ''; page.historyFilter.value = 'all'; page.renderHistory();
  assert.equal(page.historyRows.get('a'), row);
  assert.equal(row.hidden, false);
  assert.equal(page.historyRows.get('b').hidden, false);
});

test('pending durable history mutation prevents switching or creating sessions', () => {
  const { page, sessions, state } = harness();
  page.historyMutationBusy = true;
  page.switchSession('b'); page.createSession();
  assert.equal(page.currentSessionId, 'a');
  assert.equal(sessions.length, 2);
  assert.equal(state.stopped.length, 0);
});

for (const failCommit of [false, true]) {
  test(`archive ${failCommit ? 'failure leaves source untouched' : 'commits draft and switches current only after storage succeeds'}`, async () => {
    const original = { version: 1, currentSessionId: 'a', sessionSequence: 2, sessions: [
      { id: 'a', title: 'A', draft: '未发送', messages: [{ id: 'msg-a', role: 'user', text: '记录' }] },
      { id: 'b', title: 'B', draft: '另一个草稿', messages: [] },
    ] };
    const order = []; let applied;
    const context = vm.createContext({
      historyMutationBusy: false, sessions: original.sessions,
      setHistoryBusy(value) { context.historyMutationBusy = value; order.push(value ? 'lock' : 'unlock'); },
      async prepareHistoryChange() { order.push('flush'); },
      normalizeSessionSnapshot: snapshot => JSON.parse(JSON.stringify(snapshot)),
      captureHistorySnapshot: () => original,
      async commitHistorySnapshot(snapshot) {
        assert.equal(original.sessions[0].archived, undefined);
        assert.equal(original.currentSessionId, 'a');
        order.push('commit');
        if (failCommit) throw new Error('conflict');
        applied = snapshot;
      },
      historyStatus: {}, notify: message => order.push(message), historyFilter: { focus() {} },
    });
    vm.runInContext(pageFunction('toggleSessionArchive'), context);
    await context.toggleSessionArchive('a');
    assert.deepEqual(order.slice(0, 3), ['lock', 'flush', 'commit']);
    assert.equal(order.at(-1), 'unlock');
    assert.equal(original.sessions[0].archived, undefined);
    if (failCommit) { assert.equal(applied, undefined); assert.ok(order.includes('conflict')); }
    else {
      assert.equal(applied.currentSessionId, 'b');
      assert.equal(applied.sessions[0].archived, true);
      assert.equal(applied.sessions[0].draft, '未发送');
      assert.equal(applied.sessions[0].messages[0].text, '记录');
    }
  });
}

test('archiving the last active session creates an empty destination and restoring keeps all original content', async () => {
  let snapshot = { version: 1, currentSessionId: 'session-1', sessionSequence: 1, sessions: [
    { id: 'session-1', title: 'Only', draft: '草稿', messages: [] },
  ] };
  const context = vm.createContext({
    historyMutationBusy: false, sessions: snapshot.sessions,
    setHistoryBusy(value) { context.historyMutationBusy = value; }, async prepareHistoryChange() {},
    normalizeSessionSnapshot: value => JSON.parse(JSON.stringify(value)), captureHistorySnapshot: () => snapshot,
    async commitHistorySnapshot(value) { snapshot = value; context.sessions = value.sessions; },
    historyStatus: {}, notify(message) { assert.fail(message); }, historyFilter: { focus() {} },
  });
  vm.runInContext(pageFunction('toggleSessionArchive'), context);
  await context.toggleSessionArchive('session-1');
  assert.equal(snapshot.currentSessionId, 'session-2');
  assert.equal(snapshot.sessions[0].draft, '');
  await context.toggleSessionArchive('session-1');
  assert.equal(snapshot.sessions[1].archived, false);
  assert.equal(snapshot.sessions[1].draft, '草稿');
  assert.equal(snapshot.currentSessionId, 'session-2');
});

test('archive UI apply failure after storage commit reports saved state and reload recovery', async () => {
  const original = { version: 1, currentSessionId: 'a', sessionSequence: 2,
    sessions: [{ id: 'a', title: 'A', draft: '', messages: [] }, { id: 'b', title: 'B', draft: '', messages: [] }] };
  let saved, notice;
  const context = vm.createContext({ historyMutationBusy: false, sessions: original.sessions,
    setHistoryBusy(value) { context.historyMutationBusy = value; }, async prepareHistoryChange() {},
    normalizeSessionSnapshot: value => JSON.parse(JSON.stringify(value)), captureHistorySnapshot: () => original,
    async commitHistorySnapshot(value) { saved = value; throw Object.assign(new Error('UI failed'), { code: 'apply-failed' }); },
    historyStatus: {}, notify(value) { notice = value; }, historyFilter: { focus() {} },
  });
  vm.runInContext(pageFunction('toggleSessionArchive'), context); await context.toggleSessionArchive('a');
  assert.equal(saved.sessions[0].archived, true); assert.match(notice, /已保存.*重新载入/);
  assert.doesNotMatch(notice, /操作未保存|UI failed/); assert.equal(context.historyMutationBusy, false);
});

test('long literal matches remain complete with bounded context and an accessible stable description', () => {
  const { page, sessions } = harness();
  const term = '<script>' + '匹配'.repeat(50) + '</script>';
  sessions[0].messages = [{ text: '前'.repeat(60) + term + '后'.repeat(60) }];
  page.historySearch.value = term; page.renderHistory();
  const row = page.historyRows.get('a'), item = row.querySelector('.history__item');
  const excerpt = row.querySelector('.history__snippet');
  assert.ok(excerpt.textContent.includes(term));
  assert.ok(excerpt.textContent.length <= term.length + 34);
  assert.ok(excerpt.id); assert.equal(item.getAttribute('aria-describedby'), excerpt.id);
  const id = excerpt.id; page.renderHistory(); assert.equal(excerpt.id, id);
  assert.equal(excerpt.children.length, 0);
  page.historySearch.value = '预检'; page.renderHistory();
  assert.equal(excerpt.hidden, true); assert.equal(item.getAttribute('aria-describedby'), undefined);
});
