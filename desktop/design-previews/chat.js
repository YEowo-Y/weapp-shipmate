/* global Blob, CustomEvent, Event, document, location, queueMicrotask, window */
import { createDemoPlan, mountConversation } from './conversation.js';
import { attachFloatingSurface } from './components/floating-surface.js';
import { createIcon } from './components/icons.js';
import { createActionButton } from './components/ui-kit.js';
import { mountComposer } from './components/composer.js';
import { mountReview, updateReview } from './components/review.js';
import { createSessionStore, normalizeSessionSnapshot } from './session-store.js';
import { createSessionPersistence } from './session-persistence.js';
import { sessionMatch } from './session-search.js';
import { installSessionNavigation } from './session-navigation.js';
import { openSessionDataDialog } from './session-data-dialog.js';

mountComposer(document.getElementById('chatComposer'), {
  inputId: 'chatInput', sendId: 'sendButton', label: '对话输入', placeholder: '与船友协作…', combobox: true,
  contextNode: document.querySelector('.ctxbar'),
  leadingActions: [document.getElementById('attachBtn')],
  completionNodes: [document.getElementById('mentionPop'), document.getElementById('slashPop')],
});
const reviewComponent = mountReview(document.getElementById('chatReview'), { delegated: true, returnPath: 'chat-full.html' });

// Demo by default; explicitly selected models use the shared text transport.
const input = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const messageList = document.getElementById('messageList');
const chatScroll = document.getElementById('chatScroll');
const conversationStatus = document.getElementById('conversationStatus');
const jumpLatest = document.getElementById('jumpLatest');
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const clearHistorySearch = document.getElementById('clearHistorySearch');
const historyStatus = document.getElementById('historyStatus');
const chatEmpty = document.getElementById('chatEmpty');
const chatTitle = document.getElementById('chatTitle');
const mentionPop = document.getElementById('mentionPop');
const slashPop = document.getElementById('slashPop');
const contextBar = document.querySelector('.ctxbar');
const reviewButton = document.getElementById('reviewButton');
const artifact = document.querySelector('.artifact');
const chatLayout = document.querySelector('.main--chat3');
const notify = (message) => window.shipmatePreview?.notify(message);
const historyNotice = document.getElementById('historyNotice');
const historyNoticeText = document.getElementById('historyNoticeText');
const historySaveStatus = document.getElementById('historySaveStatus');
const retryHistory = document.getElementById('retryHistory');
const reloadHistory = document.getElementById('reloadHistory');
const temporaryHistory = document.getElementById('temporaryHistory');
const backupHistory = document.getElementById('backupHistory');
const exportHistory = document.getElementById('exportHistory');
const historyFilter = document.getElementById('historyFilter');
const manageHistory = document.getElementById('manageHistory');
let historyMutationBusy = false;
let applyingHistory = false;
let historyStore = createSessionStore();
let persistence = null;
let temporaryMode = false;
let leavingGuard = false;
let restoreComposerFocus = false;

document.getElementById('annotBtn').addEventListener('click', () => {
  document.body.classList.toggle('annot');
});

let completionSurface = null;
let sessionSequence = 2;
let currentSessionId = 'session-1';
let completionComposing = false;
const historyRows = new Map();
let sessions = [
  {
    id: 'session-1', title: '上线预检与修复', draft: '', references: [], pendingScenario: 'normal',
    messages: [
      { id: 'initial-user', role: 'user', text: '请用示例说明上线预检发现阻断后，下一步应该怎么做。', status: 'complete' },
      {
        id: 'initial-agent', role: 'assistant', status: 'complete',
        text: '这是一个固定数据驱动的交互示例。规则示例、AI 建议和待审批差异分别呈现；没有读取或改写真实项目。',
        tool: { label: '本地规则演示', state: 'success', summary: ['使用固定示例数据', '未连接模型服务', '未读取或写入真实项目文件'] },
        fact: { label: '规则示例 · 非项目核验', text: '隐私接口声明应与代码实际调用保持一致。', source: 'audit.html' },
        advice: { text: '先审阅差异与用途说明，再决定是否批准本地改动。' },
        review: { state: 'pending', kind: 'local-demo-change', files: ['app.json'], summary: '示例差异等待审批，尚未写入文件。' },
      },
    ],
  },
  {
    id: 'session-2', title: '服务类目咨询', draft: '类目判断需要我补充哪些业务信息？', references: [], pendingScenario: 'normal',
    messages: [{ id: 'category-intro', role: 'assistant', text: '这个会话有独立草稿。会话与消息保存在此浏览器，刷新后可以继续；不会同步到其他设备。', status: 'complete' }],
  },
];

async function loadHistory() {
  for (;;) {
    try { return await historyStore.load(); }
    catch (error) {
      historyNotice.dataset.state = 'error';
      historyNoticeText.textContent = ['invalid', 'version', 'limit'].includes(error.code)
        ? '历史记录暂时无法读取。原有数据未被覆盖；可以重试，或临时使用本页。'
        : '无法读取此浏览器的历史记录。请重试，或临时使用；临时内容不会自动保存。';
      historySaveStatus.textContent = '历史暂不可用';
      retryHistory.hidden = temporaryHistory.hidden = false;
      const choice = await new Promise(resolve => {
        retryHistory.onclick = () => { restoreComposerFocus = true; resolve('retry'); };
        temporaryHistory.onclick = () => { restoreComposerFocus = true; resolve('temporary'); };
      });
      retryHistory.onclick = temporaryHistory.onclick = null;
      retryHistory.hidden = temporaryHistory.hidden = true;
      if (choice === 'temporary') { temporaryMode = true; return { revision: 0, snapshot: null }; }
      historyStore.close();
      historyStore = createSessionStore();
      historyNoticeText.textContent = '正在重新读取历史会话…';
      historyNotice.dataset.state = 'loading';
    }
  }
}

const loadedHistory = await loadHistory();
if (loadedHistory.snapshot) {
  sessions = loadedHistory.snapshot.sessions;
  currentSessionId = loadedHistory.snapshot.currentSessionId;
  sessionSequence = loadedHistory.snapshot.sessionSequence;
}

function currentSession() {
  return sessions.find((session) => session.id === currentSessionId);
}

const conversation = mountConversation({
  input,
  sendButton,
  scroll: chatScroll,
  list: messageList,
  status: conversationStatus,
  jumpButton: jumpLatest,
  initialMessages: currentSession().messages,
  initialScroll: 'top',
  planFactory: planForSession,
  getDraftContext: () => ({ references: [...(currentSession().references || [])], pendingScenario: currentSession().pendingScenario }),
  setDraftContext(context) { Object.assign(currentSession(), context, { references: [...context.references] }); renderReferences(); scheduleHistorySave(); },
  onMessagesChange: updateSessionMessages,
  onModelSelectionChange(selection) { currentSession().modelSelection = selection; scheduleHistorySave(); },
  onDraftChange: scheduleHistorySave,
  onEvent(event) {
    if (event.type === 'state') {
      updateReview(reviewComponent.root, latestReview()?.state || 'stale', { busy: event.state === 'working' || event.state === 'streaming' });
    }
    if (event.type === 'run-start') {
      currentSession().draft = input.value;
      const pendingReview = [...currentSession().messages].reverse().find(message => message.review?.state === 'pending');
      if (pendingReview) {
        const detail = { reason: '新请求已开始', sessionId: currentSessionId, runId: pendingReview.review.runId };
        if (window.shipmateUI?.markReviewStale) window.shipmateUI.markReviewStale(detail);
        else {
          conversation.updateReviewState('stale', detail);
          syncReviewSurface();
        }
      }
    }
    if (event.type === 'complete' && event.result?.review) {
      const detail = {
        sessionId: currentSessionId,
        runId: event.runId,
        kind: event.result.review.kind,
        files: event.result.review.files || [],
        summary: event.result.review.summary,
      };
      queueMicrotask(() => {
        if (window.shipmateUI?.ready) window.shipmateUI.ready.then(() => {
          if (detail.sessionId === currentSessionId) window.shipmateUI.setReviewState?.('pending', detail);
        });
        else window.shipmateUI?.setReviewState?.('pending', detail);
        syncReviewSurface();
      });
    }
  },
});

window.addEventListener('shipmate:regenerate-review', () => {
  const text = '重新生成隐私声明改动示例';
  conversation.submit({ input: text, plan: createDemoPlan(text) });
});

function latestReview(session = currentSession()) {
  return [...session.messages].reverse().find((message) => message.review)?.review || null;
}

function syncReviewSurface({ restore = false } = {}) {
  const review = latestReview();
  const visible = Boolean(review);
  artifact.hidden = !visible;
  reviewButton.hidden = !visible;
  chatLayout.classList.toggle('has-artifact', visible);
  const mobileTrigger = document.querySelector('.mobile-review-trigger');
  const mobileSheet = document.getElementById('mobile-review-sheet');
  if (mobileTrigger) mobileTrigger.hidden = !visible || !window.matchMedia('(max-width: 1100px)').matches;
  if (!visible && mobileSheet?.open) mobileSheet.close();
  document.body.classList.toggle('has-mobile-review', visible);
  if (review) artifact.dataset.reviewState = review.state;
  if (restore && review && window.shipmateUI?.ready) {
    const sessionId = currentSessionId;
    window.shipmateUI.ready.then(ui => {
      if (sessionId === currentSessionId) ui.setReviewState(review.state, { ...review, sessionId });
    });
  }
}

function renderHistory() {
  let heading = historyList.querySelector('.chgroup');
  if (!heading) {
    heading = document.createElement('div');
    heading.className = 'chgroup';
    historyList.append(heading);
  }
  heading.textContent = historySearch.value.trim() ? '搜索结果' : '历史会话';
  let count = 0;
  for (const session of sessions) {
    let row = historyRows.get(session.id);
    if (!row) {
      row = document.createElement('div');
      row.className = 'history__row';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chitem history__item';
      item.dataset.sessionId = session.id;
      const label = document.createElement('span');
      label.className = 'chitem__t';
      const snippet = document.createElement('small');
      snippet.className = 'history__snippet';
      snippet.id = `history-snippet-${session.id}`;
      item.append(label, snippet);
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'history__more';
      more.dataset.sessionMenu = session.id;
      more.setAttribute('aria-haspopup', 'menu');
      more.append(createIcon(document, 'ellipsis'));
      row.append(item, more);
      // New sessions go first without replacing existing focusable controls.
      const nextRow = sessions.slice(sessions.indexOf(session) + 1).map(next => historyRows.get(next.id)).find(Boolean);
      historyList.insertBefore(row, nextRow || historyList.querySelector('.history__empty'));
      historyRows.set(session.id, row);
    }
    const { matched, snippet } = sessionMatch(session, historySearch.value);
    const inFilter = historyFilter.value === 'all' || Boolean(session.archived) === (historyFilter.value === 'archived');
    row.hidden = !matched || !inFilter;
    if (matched && inFilter) count++;
    const item = row.querySelector('.history__item');
    item.setAttribute('aria-current', String(session.id === currentSessionId));
    item.setAttribute('aria-label', session.title);
    item.title = session.title;
    row.querySelector('.chitem__t').textContent = session.title;
    const excerpt = row.querySelector('.history__snippet');
    excerpt.textContent = snippet;
    excerpt.hidden = !snippet;
    if (matched && snippet) item.setAttribute('aria-describedby', excerpt.id);
    else item.removeAttribute('aria-describedby');
    const more = row.querySelector('.history__more');
    more.setAttribute('aria-label', `${session.title}的会话操作`);
    more.title = '会话操作';
  }
  let empty = historyList.querySelector('.history__empty');
  if (!empty) {
    empty = document.createElement('p');
    empty.className = 'history__empty';
    empty.textContent = '没有匹配的会话。试试其他关键词，或清空搜索。';
    historyList.append(empty);
  }
  empty.hidden = count > 0;
  clearHistorySearch.hidden = !historySearch.value;
  historyStatus.textContent = historySearch.value.trim() ? `${count} 个匹配会话` : `共 ${count} 个会话`;
  chatTitle.textContent = currentSession().title;
  chatTitle.setAttribute('aria-label', `重命名会话：${currentSession().title}`);
}

function switchSession(sessionId) {
  if (historyMutationBusy) return;
  const next = sessions.find(session => session.id === sessionId);
  if (!next) return;
  if (sessionId === currentSessionId) { input.focus({ preventScroll: true }); return; }
  closeComposerSurfaces();
  Object.assign(currentSession(), conversation.getDraftState(), { viewState: conversation.getViewState() });
  conversation.stop();
  currentSessionId = sessionId;
  renderReferences();
  conversation.replaceMessages(next.messages);
  conversation.setModelSelection(next.modelSelection || null);
  chatEmpty.hidden = next.messages.length > 0;
  renderHistory();
  syncReviewSurface({ restore: true });
  conversation.setDraft(currentSession().draft, currentSession().edit, currentSession().draftView);
  if (currentSession().pendingScenario !== 'normal' && !currentSession().edit) conversationStatus.textContent = '已恢复故障演示草稿；发送后运行本地示例。';
  conversation.restoreViewState(currentSession().viewState);
  input.focus({ preventScroll: true });
  scheduleHistorySave();
}

historyList.addEventListener('click', (event) => {
  if (historyMutationBusy) return;
  const more = event.target.closest('[data-session-menu]');
  if (more) {
    window.shipmateUI?.openMenu({ trigger: more, label: '会话操作', items: [
      { label: '重命名', icon: 'pencil', onSelect: () => openSessionRename(more.dataset.sessionMenu, more) },
      { label: sessions.find(session => session.id === more.dataset.sessionMenu)?.archived ? '恢复会话' : '归档会话', icon: 'folder', onSelect: () => { void toggleSessionArchive(more.dataset.sessionMenu); } },
    ] });
    return;
  }
  const item = event.target.closest('[data-session-id]');
  if (item) openHistoryResult(item.dataset.sessionId);
});

function openHistoryResult(sessionId) {
  const session = sessions.find(item => item.id === sessionId);
  if (!session) return;
  const match = sessionMatch(session, historySearch.value);
  switchSession(sessionId);
  if (!match.messageId) return;
  const article = [...messageList.children].find(node => node.dataset.messageId === match.messageId);
  if (!article) return;
  const scrollTop = chatScroll.scrollTop + article.getBoundingClientRect().top - chatScroll.getBoundingClientRect().top - 16;
  conversation.restoreViewState({ ...conversation.getViewState(), scrollTop: Math.max(0, scrollTop), followLatest: false, readingDetails: false, readingAnchor: null });
  article.tabIndex = -1;
  article.focus({ preventScroll: true });
  conversationStatus.textContent = '已定位到匹配消息。';
  scheduleHistorySave();
}

function createSession() {
  if (historyMutationBusy) return;
  closeComposerSurfaces();
  Object.assign(currentSession(), conversation.getDraftState(), { viewState: conversation.getViewState() });
  conversation.stop();
  const session = {
    id: `session-${++sessionSequence}`,
    title: `新会话 ${sessionSequence - 2}`,
    draft: '',
    references: [], pendingScenario: 'normal', autoTitle: true,
    messages: [],
  };
  sessions.unshift(session);
  currentSessionId = session.id;
  historySearch.value = '';
  historyFilter.value = 'active';
  renderReferences();
  conversation.replaceMessages(session.messages);
  conversation.setModelSelection(null);
  chatEmpty.hidden = false;
  renderHistory();
  syncReviewSurface({ restore: true });
  conversation.setDraft(currentSession().draft, currentSession().edit, currentSession().draftView);
  if (currentSession().pendingScenario !== 'normal' && !currentSession().edit) conversationStatus.textContent = '已恢复故障演示草稿；发送后运行本地示例。';
  conversation.restoreViewState(currentSession().viewState);
  input.focus({ preventScroll: true });
  scheduleHistorySave();
}

function planForSession(text, request = {}) {
  if (request.context) return createDemoPlan(text, { scenario: request.context.pendingScenario || 'normal' });
  const session = currentSession();
  const scenario = session.pendingScenario || 'normal';
  session.pendingScenario = 'normal';
  return createDemoPlan(text, { scenario });
}

function updateSessionMessages(messages) {
  const session = currentSession();
  const changed = session.messages.length !== messages.length || session.messages.at(-1)?.status !== messages.at(-1)?.status;
  session.messages = messages;
  const firstInput = session.autoTitle && messages.find(message => message.role === 'user' && message.text.trim());
  if (firstInput) {
    const text = firstInput.text.replace(/\s+/g, ' ').trim();
    session.title = [...text].slice(0, 32).join('') + ([...text].length > 32 ? '…' : '');
    session.autoTitle = false;
  }
  chatEmpty.hidden = messages.length > 0;
  // Reuse controls while active searches also pick up new streamed text.
  if (changed || firstInput || historySearch.value.trim()) renderHistory();
  scheduleHistorySave();
}

function setSessionTitle(sessionId, value) {
  const session = sessions.find(item => item.id === sessionId);
  const title = value.replace(/\s+/g, ' ').trim();
  if (!session || !title || title.length > 80) return false;
  session.title = title;
  session.autoTitle = false;
  renderHistory();
  scheduleHistorySave();
  return true;
}

function openSessionRename(sessionId, trigger) {
  const session = sessions.find(item => item.id === sessionId);
  const ui = window.shipmateUI;
  if (!session || !ui) return;
  const dialog = ui.makeDialog({ title: '重命名会话', subtitle: '为这个会话取一个方便查找的名称。', className: 'shipmate-rename', trigger });
  const form = document.createElement('form');
  form.className = 'session-rename__form';
  form.noValidate = true;
  let composing = false;
  const label = document.createElement('label');
  label.textContent = '会话名称';
  const field = document.createElement('input');
  field.type = 'text';
  field.value = session.title;
  field.maxLength = 80;
  field.required = true;
  field.autocomplete = 'off';
  field.addEventListener('compositionstart', () => { composing = true; });
  field.addEventListener('compositionend', () => { composing = false; });
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  const error = document.createElement('p');
  error.id = `rename-error-${sessionId}`;
  error.className = 'session-rename__error';
  error.setAttribute('role', 'status');
  error.hidden = true;
  field.setAttribute('aria-describedby', error.id);
  label.append(field);
  const actions = document.createElement('div');
  actions.className = 'session-rename__actions';
  const cancel = createActionButton(document, '取消', { className: 'shipmate-dialog__button' });
  cancel.addEventListener('click', () => dialog.close('cancel'));
  const save = createActionButton(document, '保存', { type: 'submit', appearance: 'accent', className: 'shipmate-dialog__button' });
  actions.append(cancel, save);
  form.append(label, error, actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing) return;
    if (!setSessionTitle(sessionId, field.value)) {
      error.hidden = false;
      error.textContent = '请输入 1–80 个字符的会话名称。';
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      return;
    }
    dialog.close('saved');
    notify('会话名称已更新。');
  });
  field.addEventListener('input', () => { field.removeAttribute('aria-invalid'); error.hidden = true; });
  dialog.addEventListener('close', () => {
    // Filtering may remove the renamed row from view before the dialog closes.
    if (trigger.closest?.('[hidden]')) historySearch.focus({ preventScroll: true });
  });
  dialog.querySelector('.shipmate-dialog__body').append(form);
  ui.showDialog(dialog, field);
  field.select();
}

function useStarter(text, scenario = 'normal') {
  if (currentSession().messages.length) return;
  if (input.value.trim()) {
    input.focus();
    notify('已保留当前草稿。清空输入后可选择其他任务建议。');
    return;
  }
  currentSession().draft = text;
  currentSession().pendingScenario = scenario;
  conversation.setDraft(text);
  if (scenario !== 'normal') conversationStatus.textContent = '已选择故障演示；发送后运行，不会访问真实工具。';
  input.focus();
}

document.getElementById('newChat').addEventListener('click', createSession);
chatTitle.addEventListener('click', () => openSessionRename(currentSessionId, chatTitle));
historySearch.addEventListener('input', renderHistory);
clearHistorySearch.addEventListener('click', () => { historySearch.value = ''; renderHistory(); historySearch.focus(); });
historySearch.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229 && historySearch.value) {
    event.preventDefault(); event.stopPropagation(); historySearch.value = ''; renderHistory();
  }
});
chatEmpty.addEventListener('click', event => {
  const starter = event.target.closest('[data-starter]');
  if (starter) useStarter(starter.dataset.starter, starter.dataset.scenario || 'normal');
});

function menuItems(menu, visibleOnly = true) {
  return [...menu.querySelectorAll('.mentionitem, .slashitem')].filter((item) => !visibleOnly || !item.hidden);
}

for (const menu of [mentionPop, slashPop]) {
  menuItems(menu, false).forEach((item, index) => {
    item.id = `${menu.id}-option-${index + 1}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.tabIndex = -1;
  });
}

function selectItem(menu, selectedIndex = 0, scrollSelection = true) {
  const items = menuItems(menu);
  const selected = items[selectedIndex];
  menuItems(menu, false).forEach((item) => {
    const isSelected = item === selected;
    item.classList.toggle('on', isSelected);
    item.setAttribute('aria-selected', String(isSelected));
  });
  if (selected) {
    input.setAttribute('aria-activedescendant', selected.id);
    if (scrollSelection) selected.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  } else input.removeAttribute('aria-activedescendant');
}

function closeCompletionSurface() {
  const entry = completionSurface;
  completionSurface = null;
  if (entry) {
    entry.cleanup?.();
    entry.menu.removeEventListener('beforetoggle', entry.onToggle);
    entry.menu.removeEventListener('pointerdown', entry.onPointerDown);
    document.removeEventListener('click', dismissCompletionsOutside);
    document.removeEventListener('focusin', dismissCompletionsOutside);
    if (!entry.nativeClosing && entry.menu.matches(':popover-open')) entry.menu.hidePopover();
    entry.menu.hidden = true;
  }
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-controls');
  input.removeAttribute('aria-activedescendant');
}

function setOpen(target, open) {
  if (!open || !target) { closeCompletionSurface(); return; }
  if (completionSurface?.menu === target) { selectItem(target, 0); return; }
  closeCompletionSurface();
  window.shipmateUI?.closeMenu?.({ restoreFocus: false });
  for (const menu of [mentionPop, slashPop]) menu.hidden = menu !== target;
  const entry = { menu: target, cleanup: null };
  completionSurface = entry;
  entry.onToggle = event => {
    if (event.newState === 'closed' && completionSurface === entry) {
      entry.nativeClosing = true;
      closeCompletionSurface();
    }
  };
  entry.onPointerDown = event => {
    if (event.button === 0 && event.target.closest('.mentionitem, .slashitem')) event.preventDefault();
  };
  target.setAttribute('popover', 'auto');
  target.addEventListener('beforetoggle', entry.onToggle);
  target.addEventListener('pointerdown', entry.onPointerDown);
  document.addEventListener('click', dismissCompletionsOutside);
  document.addEventListener('focusin', dismissCompletionsOutside);
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', target.id);
  selectItem(target, 0, false);
  const fail = () => {
    if (completionSurface !== entry) return;
    closeCompletionSurface();
    notify('无法显示补全菜单；输入内容已保留，请稍后重试。');
  };
  try {
    target.dataset.positioned = 'false';
    target.showPopover({ source: input });
    let positioned = false;
    const cleanup = attachFloatingSurface(input.closest('.agent-composer'), target, {
      placement: 'top-start', matchWidth: true, onError: fail,
      onPositioned() {
        if (completionSurface !== entry || positioned) return;
        positioned = true;
        target.dataset.positioned = 'true';
        target.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      },
    });
    if (completionSurface === entry) entry.cleanup = cleanup;
    else cleanup();
  } catch { fail(); }
}

function activeMenu() {
  if (!mentionPop.hidden) return mentionPop;
  if (!slashPop.hidden) return slashPop;
  return null;
}

function filterMenu(menu, query) {
  const normalized = query.toLocaleLowerCase('zh-CN');
  for (const item of menuItems(menu, false)) item.hidden = normalized ? !item.textContent.toLocaleLowerCase('zh-CN').includes(normalized) : false;
  menu.querySelector('[data-completion-empty]').hidden = menuItems(menu).length > 0;
}

function closeComposerSurfaces() {
  setOpen(null, false);
  window.shipmateUI?.closeMenu?.({ restoreFocus: false });
}

function completionAtCaret() {
  if (input.selectionStart !== input.selectionEnd) return null;
  const end = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, end);
  const mention = before.match(/(?:^|\s)(@[^\s@]*)$/);
  if (mention) return { menu: mentionPop, query: mention[1].slice(1), start: end - mention[1].length, end };
  const slash = before.match(/^\s*\/(.*)$/);
  if (slash) return { menu: slashPop, query: slash[1], start: before.indexOf('/'), end };
  return null;
}

function syncCompletions() {
  currentSession().draft = input.value;
  if (!completionComposing && !input.value.trim()) currentSession().pendingScenario = 'normal';
  scheduleHistorySave();
  const completion = completionComposing ? null : completionAtCaret();
  if (!completion) { setOpen(null, false); return; }
  filterMenu(completion.menu, completion.query);
  setOpen(completion.menu, true);
}

function addMention(item) {
  const path = item.querySelector('.mentionitem__path').textContent.trim();
  const session = currentSession();
  const existing = session.references.includes(path);
  if (!existing) {
    session.references.push(path);
    renderReferences();
  }
  const completion = completionAtCaret();
  if (completion?.menu === mentionPop) {
    input.setRangeText('', completion.start, completion.end, 'end');
  }
  session.draft = input.value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  setOpen(null, false);
  input.focus();
  notify(existing ? `示例上下文已包含 ${path}，未重复添加。` : `已将 ${path} 加入示例上下文；未读取真实文件内容。`);
}

function renderReferences() {
  contextBar.replaceChildren();
  for (const path of currentSession().references) {
    const chip = document.createElement('span');
    chip.className = 'ctxchip at';
    chip.dataset.path = path;
    chip.append(`@${path}`);
    const remove = document.createElement('button');
    remove.className = 'x';
    remove.type = 'button';
    remove.setAttribute('aria-label', `移除文件引用 ${path}`);
    remove.append(createIcon(document, 'x'));
    remove.title = `移除引用 ${path}`;
    chip.append(remove);
    contextBar.append(chip);
  }
}

function removeReference(path) {
  const session = currentSession();
  const index = session.references.indexOf(path);
  if (index < 0) return;
  session.references.splice(index, 1);
  renderReferences();
  scheduleHistorySave();
  const buttons = contextBar.querySelectorAll('button');
  (buttons[Math.min(index, buttons.length - 1)] || input).focus({ preventScroll: true });
}

function runSlash(item) {
  if (item.dataset.href) {
    location.href = item.dataset.href;
    return;
  }
  currentSession().pendingScenario = item.dataset.scenario || 'normal';
  input.value = currentSession().pendingScenario === 'timeout' ? '演示一次工具超时，并给出重试方式。' : '演示一次工具失败，并重新执行本次请求。';
  currentSession().draft = input.value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  setOpen(null, false);
  input.focus();
  conversationStatus.textContent = '已选择故障演示；发送后运行，不会访问真实工具。';
}

function activateCurrent(menu) {
  const items = menuItems(menu);
  const selected = items.find(item => item.getAttribute('aria-selected') === 'true') || items[0];
  if (!selected) return;
  if (menu === mentionPop) addMention(selected);
  else runSlash(selected);
}

function openReferencePicker() {
  filterMenu(mentionPop, '');
  setOpen(mentionPop, true);
  input.focus();
}
document.getElementById('chatComposer').addEventListener('shipmate:reference-request', openReferencePicker);

input.addEventListener('input', syncCompletions);
input.addEventListener('click', syncCompletions);
function onCompletionKeyup(event) {
  if (event.isComposing || completionComposing || event.keyCode === 229) return;
  const modified = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || (modified && ['ArrowUp', 'ArrowDown'].includes(event.key))) syncCompletions();
}
input.addEventListener('keyup', onCompletionKeyup);
input.addEventListener('compositionstart', () => { completionComposing = true; setOpen(null, false); });
input.addEventListener('compositionend', () => { completionComposing = false; syncCompletions(); });

function onCompletionKeydown(event) {
  if (event.isComposing || completionComposing || event.keyCode === 229) return;
  const menu = activeMenu();
  if (event.key === 'Escape' && menu) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(null, false);
    input.focus();
    return;
  }
  if (!menu) return;
  if (event.key === 'Tab') { setOpen(null, false); return; }
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const items = menuItems(menu);
    if (!items.length) return;
    const current = Math.max(0, items.findIndex((item) => item.getAttribute('aria-selected') === 'true'));
    selectItem(menu, (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    activateCurrent(menu);
  }
}
input.addEventListener('keydown', onCompletionKeydown);

mentionPop.addEventListener('click', (event) => {
  const item = event.target.closest('.mentionitem');
  if (item && !item.hidden && !completionComposing) addMention(item);
});
slashPop.addEventListener('click', (event) => {
  const item = event.target.closest('.slashitem');
  if (item && !item.hidden && !completionComposing) runSlash(item);
});

contextBar.addEventListener('click', (event) => {
  const remove = event.target.closest('.ctxchip .x');
  if (remove) removeReference(remove.closest('.ctxchip').dataset.path);
});

function dismissCompletionsOutside(event) {
  // A menu selection removes its own row before opening the reference picker.
  if (!event.target.isConnected) return;
  if (!event.target.closest('#mentionPop, #slashPop, #chatInput')) setOpen(null, false);
}
window.addEventListener('pagehide', event => {
  scheduleHistorySave();
  closeComposerSurfaces();
  if (event.persisted) conversation.stop();
  else conversation.destroy();
  void persistence?.flush();
});
document.addEventListener('shipmate:surface-opening', () => setOpen(null, false));

reviewButton.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('shipmate:open-review', { detail: { sessionId: currentSessionId, source: 'chat-header' } }));
});

window.addEventListener('shipmate:review-state', (event) => {
  const detail = event.detail || {};
  if (detail.sessionId && detail.sessionId !== currentSessionId) return;
  conversation.updateReviewState(detail.state, detail);
  syncReviewSurface();
});

window.addEventListener('shipmate:simulate-error', (event) => {
  const state = conversation.controller.getSnapshot().state;
  if (state === 'working' || state === 'streaming') {
    notify('请先停止当前回复，再演示故障。');
    return;
  }
  const message = event.detail?.message || '演示一次可恢复的请求失败。';
  const result = conversation.submit({ input: message, plan: createDemoPlan(message, { scenario: 'tool-failure' }) });
  if (result.ok) notify('已开始故障与重试演示。');
});

renderHistory();
renderReferences();
chatEmpty.hidden = currentSession().messages.length > 0;
conversation.setModelSelection(currentSession().modelSelection || null);
conversation.setDraft(currentSession().draft, currentSession().edit, currentSession().draftView);
conversation.restoreViewState(currentSession().viewState);
syncReviewSurface({ restore: true });
chatLayout.inert = false;
exportHistory.disabled = false;
if (restoreComposerFocus) input.focus({ preventScroll: true });
if (temporaryMode) updateHistorySaveStatus({ state: 'error', code: 'temporary', dirty: false });
else {
  persistence = createSessionPersistence({ store: historyStore, revision: loadedHistory.revision, getSnapshot: captureHistorySnapshot, onStatus: updateHistorySaveStatus });
  scheduleHistorySave();
}

function captureHistorySnapshot() {
  Object.assign(currentSession(), conversation.getDraftState(), { viewState: conversation.getViewState() });
  return { version: 1, currentSessionId, sessionSequence, sessions };
}

function scheduleHistorySave() { if (!applyingHistory) persistence?.schedule(); }

function setHistoryBusy(busy) {
  historyMutationBusy = busy;
  chatLayout.inert = busy;
}

async function prepareHistoryChange() {
  if (!persistence || temporaryMode) throw new Error('临时会话无法导入或归档。请先备份并恢复本地存储。');
  closeComposerSurfaces(); conversation.stop(); scheduleHistorySave();
  const state = await persistence.flush();
  if (state.state !== 'saved' || state.dirty) throw new Error('当前内容尚未保存，请先重试或下载备份。');
}

function applyHistorySnapshot(snapshot) {
  sessions = snapshot.sessions; sessionSequence = snapshot.sessionSequence; currentSessionId = snapshot.currentSessionId;
  const session = currentSession();
  conversation.replaceMessages(session.messages);
  conversation.setModelSelection(session.modelSelection || null);
  renderReferences(); renderHistory(); syncReviewSurface({ restore: true });
  chatEmpty.hidden = session.messages.length > 0;
  conversation.setDraft(session.draft, session.edit, session.draftView);
  conversation.restoreViewState(session.viewState);
}

async function commitHistorySnapshot(snapshot) {
  applyingHistory = true;
  try { return await persistence.commitSnapshot(snapshot, applyHistorySnapshot); }
  finally { applyingHistory = false; }
}

async function toggleSessionArchive(id) {
  if (historyMutationBusy || !sessions.some(session => session.id === id)) return;
  setHistoryBusy(true);
  try {
    await prepareHistoryChange();
    const snapshot = normalizeSessionSnapshot(captureHistorySnapshot());
    const target = snapshot.sessions.find(session => session.id === id);
    target.archived = !target.archived;
    if (target.archived && snapshot.currentSessionId === id) {
      let next = snapshot.sessions.find(session => !session.archived);
      if (!next) {
        next = { id: `session-${++snapshot.sessionSequence}`, title: '新会话', draft: '', messages: [], references: [], pendingScenario: 'normal', autoTitle: true };
        snapshot.sessions.unshift(next);
      }
      snapshot.currentSessionId = next.id;
    }
    await commitHistorySnapshot(snapshot);
    historyStatus.textContent = target.archived ? '已归档。可在“已归档”中恢复。' : '已恢复到活动会话。';
  } catch (error) { notify(error?.code === 'apply-failed'
    ? '会话更改已保存，但界面未能更新。请重新载入，不要重复操作。'
    : error.message || '操作未保存，原会话仍保留。'); }
  finally { setHistoryBusy(false); historyFilter.focus({ preventScroll: true }); }
}

function openHistoryData() {
  if (historyMutationBusy) return;
  if (persistence?.getState().code === 'apply-failed') { reloadHistory.focus(); return; }
  openSessionDataDialog({ document, trigger: manageHistory, capture: captureHistorySnapshot,
    prepare: prepareHistoryChange, commit: commitHistorySnapshot, onBusyChange: setHistoryBusy });
}

historyFilter.addEventListener('change', renderHistory);
manageHistory.addEventListener('click', openHistoryData);
const requestedPanel = new URL(window.location.href).searchParams.get('panel');
if (requestedPanel === 'archived') {
  historyFilter.value = 'archived';
  renderHistory();
  const revealHistory = () => {
    const navigation = historyFilter.closest('details.mobile-navigation');
    if (navigation) navigation.open = true;
    historyFilter.focus();
  };
  // The classic responsive script may relocate history before or after this module initializes.
  document.addEventListener('shipmate:responsive-ready', revealHistory, { once: true });
  revealHistory();
}
if (requestedPanel === 'data') openHistoryData();

function guardUnsavedHistory(event) {
  if (!persistence?.hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
}

function updateHistorySaveStatus(state) {
  const error = state.state === 'error';
  const applyFailed = state.code === 'apply-failed';
  const returnFocus = !error && historyNotice.contains(document.activeElement);
  historySaveStatus.textContent = applyFailed ? '已保存 · 请重新载入' : error ? (temporaryMode ? '临时会话 · 未保存' : '尚未保存') : state.state === 'saving' ? '正在保存…' : '已保存在此浏览器';
  historySaveStatus.parentElement.dataset.state = state.state;
  historyNotice.hidden = !error;
  historyNotice.dataset.state = state.state;
  const needsReload = ['conflict', 'version-change', 'apply-failed'].includes(state.code);
  retryHistory.hidden = !error || needsReload || state.code === 'temporary';
  reloadHistory.hidden = !error || !needsReload;
  backupHistory.hidden = !error || applyFailed;
  if (error) {
    const messages = {
      'apply-failed': '会话已保存到本地，但界面未能更新。请重新载入以显示已保存的记录；不要重复导入。',
      conflict: '另一个窗口已更新历史。当前内容尚未保存，请先下载备份，再重新载入；不会覆盖其他窗口的记录。',
      'version-change': '历史存储已在其他窗口升级。请先下载当前内容，再重新载入此页面。',
      quota: '浏览器存储空间不足，当前内容尚未保存。请下载备份，释放空间后重试。',
      temporary: '正在临时使用。当前内容不会自动保存，也不会覆盖原有历史；离开前可下载备份。',
      limit: '会话内容已超出本地保存上限。旧记录仍保留，请下载当前内容。',
    };
    historyNoticeText.textContent = messages[state.code] || '暂时无法保存，当前内容仍在本页。请重试，或先下载备份。';
  }
  if (state.dirty && !leavingGuard) { window.addEventListener('beforeunload', guardUnsavedHistory); leavingGuard = true; }
  else if (!state.dirty && leavingGuard) { window.removeEventListener('beforeunload', guardUnsavedHistory); leavingGuard = false; }
  if (returnFocus) input.focus({ preventScroll: true });
}

function downloadHistory() {
  if (persistence?.getState().code === 'apply-failed') {
    notify('会话已保存，但界面未能更新。请重新载入后下载最新备份。'); return;
  }
  try {
    const snapshot = normalizeSessionSnapshot(captureHistorySnapshot(), { mode: 'export' });
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `shipmate-history-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { notify('无法生成会话备份。当前内容仍保留在页面中，请先复制重要内容。'); }
}
retryHistory.addEventListener('click', () => { void persistence?.retry(); });
backupHistory.addEventListener('click', downloadHistory);
exportHistory.addEventListener('click', downloadHistory);
reloadHistory.addEventListener('click', async () => {
  const ui = await window.shipmateUI?.ready;
  if (!ui) return;
  const message = persistence?.getState().code === 'apply-failed'
    ? '会话已保存到本地。重新载入将恢复已保存的记录；本页后续未保存的修改将被放弃。'
    : '本窗口尚未保存的修改将被放弃。请先下载备份；其他窗口已保存的历史不会被修改。';
  const confirmed = await ui.confirm({ title: '重新载入历史？', message, confirmLabel: '重新载入', trigger: reloadHistory });
  if (!confirmed) return;
  window.removeEventListener('beforeunload', guardUnsavedHistory);
  persistence?.dispose();
  location.reload();
});
for (const type of ['select', 'scroll']) input.addEventListener(type, scheduleHistorySave);
chatScroll.addEventListener('scroll', scheduleHistorySave, { passive: true });
messageList.addEventListener('toggle', scheduleHistorySave, true);
messageList.addEventListener('input', scheduleHistorySave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { scheduleHistorySave(); void persistence?.flush(); }
});

installSessionNavigation({ document, window, stop: () => conversation.stop(),
  async flush() {
    if (!persistence || temporaryMode) return false;
    scheduleHistorySave();
    const state = await persistence.flush();
    return state.state === 'saved' && !state.dirty;
  },
  onBlocked: () => notify('当前内容尚未保存，请先重试或下载备份。'),
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (!temporaryMode && !persistence?.hasUnsavedChanges()) location.reload();
  else void persistence?.flush();
});
