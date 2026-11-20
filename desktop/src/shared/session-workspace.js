// @ts-check
import { mountConversation } from './conversation.js';
import { createIcon } from './components/icons.js';
import { createActionButton, bindActionMenu } from './components/ui-kit.js';
import { createSessionStore, normalizeSessionSnapshot } from './session-store.js';
import { createSessionPersistence } from './session-persistence.js';
import { literalSessionQuery, sessionMatch } from './session-search.js';
import { openSessionDataDialog, createSessionDataPanel } from './session-data-dialog.js';
export { sessionMatch };

/** @typedef {import('./session-store.js').SessionSnapshot} SessionSnapshot */
/** @typedef {SessionSnapshot['sessions'][number]} Session */
/** @typedef {Pick<Session, 'references' | 'pendingScenario'>} DraftContext */
/** @typedef {typeof import('./conversation.js').CONVERSATION_STATES} ConversationStates */
/** @typedef {{ type: string; state: ConversationStates[keyof ConversationStates]; toolEvent?: { type: string }; [name: string]: unknown }} ConversationEvent */
/** @typedef {{ runId: string; kind: (typeof import('./agent-contract.js').AGENT_KINDS)[number]; projectRevision: number; contextRevision: number }} ArtifactReference */
/** @typedef {HTMLElementTagNameMap & { 'wa-dropdown': HTMLElement; 'wa-dropdown-item': HTMLElement & { disabled: boolean } }} WorkspaceElements */
/** @typedef {HTMLElementEventMap & DocumentEventMap & WindowEventMap} WorkspaceEvents */
/** @typedef {ReturnType<typeof createActionButton>} ActionButton */
/** @typedef {{ row: HTMLButtonElement; container: HTMLDivElement; trigger: ActionButton; dispose: () => void; title: string | null; active: boolean | null }} RecentRow */
/** @typedef {ReturnType<typeof createSessionPersistence<SessionSnapshot>>} SessionPersistence */

/** @param {unknown} error */
function errorCode(error) {
  return (/** @type {{ code?: unknown } | null | undefined} */ (error))?.code;
}

let workspaceSequence = 0;

// The caller owns its mounted composer and passes its existing input/send nodes.
/**
 * @param {{
 *   host: HTMLElement;
 *   input: HTMLTextAreaElement;
 *   sendButton: HTMLButtonElement;
 *   scroll: HTMLElement;
 *   list: HTMLElement;
 *   status: HTMLElement;
 *   jumpButton: HTMLElement;
 *   initialMessages?: Session['messages'];
 *   workspace?: string;
 *   storageLabel?: string;
 *   layout?: string;
 *   projectScoped?: boolean;
 *   onEvent?: (event: ConversationEvent) => void;
 *   onSessionChange?: (session: Session) => void;
 *   onSessionOpen?: (session: Session) => void;
 *   onOpenDataSettings?: (anchor: HTMLElement) => void;
 *   projectNavigation?: HTMLElement | null;
 *   navigationHeader?: HTMLElement | null;
 *   conversationOptions?: {
 *     requireModel?: boolean;
 *     allowRecords?: boolean;
 *     getSendShortcut?: () => string;
 *     transport?: (args: import('./chat-transport.js').ChatArgs) => ReturnType<typeof import('./chat-transport.js').streamChat>;
 *     setDraftContext?: (context: DraftContext) => void;
 *     onDraftChange?: () => void;
 *     onModelSelectionChange?: (selection: NonNullable<Session['modelSelection']> | null) => void;
 *     onMessagesChange?: (messages: Session['messages']) => void;
 *     onEvent?: (event: ConversationEvent) => void;
 *     onModelRequired?: () => void;
 *     onOpenArtifact?: (artifactId: string, expected: ArtifactReference) => Promise<void>;
 *     [key: string]: unknown;
 *   };
 * }} options
 */
export async function mountSessionWorkspace({ host, input, sendButton, scroll, list, status, jumpButton,
  initialMessages = [], workspace = 'my-miniprogram', storageLabel = '已保存在此浏览器', layout = 'toolbar', projectScoped = false,
  onEvent, onSessionChange, onSessionOpen, onOpenDataSettings, projectNavigation, navigationHeader, conversationOptions = {} }) {
  const doc = host.ownerDocument;
  const defaultView = doc.defaultView;
  if (!defaultView) throw new Error('会话工作区需要页面窗口。');
  const win = defaultView;
  const instanceId = ++workspaceSequence;
  /**
   * @template {keyof WorkspaceElements} Tag
   * @param {Tag} tag
   * @param {string} [className]
   * @param {string} [text]
   */
  const element = (tag, className = '', text) => {
    const node = /** @type {WorkspaceElements[Tag]} */ (doc.createElement(tag)); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  /** @param {string} label @param {string} action @param {string} [icon] */
  function button(label, action, icon) {
    const node = element('button', 'session-workspace__button'); node.type = 'button';
    node.dataset.action = action; node.title = label; node.setAttribute('aria-label', label);
    if (icon) node.append(createIcon(doc, icon));
    node.append(element('span', '', label)); return node;
  }
  /**
   * @param {string} label
   * @param {string} action
   * @param {NonNullable<Parameters<typeof createActionButton>[2]> & { icon?: string }} [opts]
   */
  function actionButton(label, action, { icon, ...options } = {}) {
    const node = createActionButton(doc, icon ? '' : label, {
      className: icon ? 'ui-action-icon' : '', ...options,
    });
    node.dataset.action = action;
    if (icon) {
      node.setAttribute('aria-label', label);
      node.title = label;
      node.append(createIcon(doc, icon));
    }
    return node;
  }
  const sidebar = layout === 'sidebar';
  const root = element('div', `session-workspace${sidebar ? ' session-workspace--sidebar' : ''}`);
  const title = button(sidebar ? '搜索历史' : '历史会话', 'history', sidebar ? 'search' : 'clock');
  const create = button('新建会话', 'new', sidebar ? 'pencil' : 'plus');
  const rename = button(sidebar ? '重命名当前会话' : '重命名', 'rename', 'pencil');
  const recent = sidebar ? element('div', 'session-workspace__recent') : null;
  /** @type {Map<string, RecentRow>} */
  const recentRows = new Map();
  const saved = element('span', 'session-workspace__status', '正在读取历史…');
  saved.dataset.action = 'save-status'; saved.setAttribute('role', 'status');
  const notice = element('div', 'session-workspace__notice'); notice.hidden = true;
  const noticeText = element('p'); noticeText.setAttribute('role', 'status');
  const retry = button('重试', 'retry'), temporary = button('临时使用', 'temporary');
  const backup = button('下载备份', 'backup'), reload = button('重新载入', 'reload');
  notice.append(noticeText, retry, temporary, backup, reload);
  if (recent) {
    const heading = element('div', 'session-workspace__recent-heading');
    const label = element('h2', '', '会话'); label.id = `session-workspace-${instanceId}-recent`;
    recent.setAttribute('role', 'group'); recent.setAttribute('aria-labelledby', label.id);
    heading.append(label, rename);
    if (projectNavigation) {
      recent.removeAttribute('aria-labelledby'); recent.setAttribute('aria-label', '当前项目的会话');
      if (navigationHeader) {
        navigationHeader.append(title);
        root.append(navigationHeader, notice, create, projectNavigation, recent, saved);
      } else root.append(notice, create, title, projectNavigation, recent, saved);
    } else root.append(notice, create, title, heading, recent, saved);
  } else root.append(title, create, rename, saved, notice);
  host.append(root);
  input.disabled = sendButton.disabled = create.disabled = rename.disabled = title.disabled = true;
  let store = createSessionStore({ workspace }), temporaryMode = false;
  /** @type {SessionPersistence | null} */
  let persistence = null;
  /** @type {ReturnType<typeof mountConversation>} */
  let conversation;
  /** @type {HTMLDialogElement | null} */
  let activeDialog = null;
  /** @type {ReturnType<typeof createSessionDataPanel> | null} */
  let dataSettings = null;
  let disposed = false, restoring = false, mutationBusy = false;
  /** @type {Array<() => void>} */
  const bindings = [];
  /**
   * @template {keyof WorkspaceEvents} Type
   * @param {EventTarget} node
   * @param {Type} type
   * @param {(event: WorkspaceEvents[Type]) => void} handler
   * @param {boolean | AddEventListenerOptions} [options]
   */
  function bind(node, type, handler, options) {
    const listener = /** @type {EventListener} */ (handler);
    node.addEventListener(type, listener, options);
    bindings.push(() => node.removeEventListener(type, listener, options));
  }
  let loaded, restoreInputFocus = false;
  for (;;) {
    try { loaded = await store.load(); break; }
    catch {
      saved.textContent = '历史暂不可用'; notice.hidden = false;
      noticeText.textContent = '无法读取历史。原记录未被覆盖；可重试，或临时使用本页。';
      retry.hidden = temporary.hidden = false; backup.hidden = reload.hidden = true;
      const choice = await new Promise(resolve => {
        const retryOnce = () => { clean(); resolve('retry'); };
        const temporaryOnce = () => { clean(); resolve('temporary'); };
        function clean() { retry.removeEventListener('click', retryOnce); temporary.removeEventListener('click', temporaryOnce); }
        retry.addEventListener('click', retryOnce); temporary.addEventListener('click', temporaryOnce);
      });
      restoreInputFocus = true;
      if (choice === 'temporary') { temporaryMode = true; loaded = { revision: 0, snapshot: null }; break; }
      store.close(); store = createSessionStore({ workspace }); saved.textContent = '正在重新读取…';
    }
  }
  /** @type {Session[]} */
  let sessions = loaded.snapshot?.sessions || [{ id: 'session-1', title: '新会话', draft: '', messages: initialMessages,
    references: [], pendingScenario: 'normal', autoTitle: true }];
  let currentSessionId = loaded.snapshot?.currentSessionId || sessions[0].id;
  let sessionSequence = loaded.snapshot?.sessionSequence || 1;
  const current = () => {
    const session = sessions.find(session => session.id === currentSessionId);
    if (!session) throw new Error('当前会话不存在。');
    return session;
  };
  let activeProjectId = current().projectId ?? null;
  /** @type {Set<string> | null} */
  let knownProjects = null;
  let projectCurrentSessions = loaded.snapshot?.projectCurrentSessions || [];
  /** @param {Session} session */
  const inScope = session => !projectScoped || (session.projectId ?? null) === activeProjectId;
  /** @param {SessionSnapshot} snapshot */
  function remember(snapshot) {
    if (!projectScoped) return;
    const { currentSessionId: sessionId } = snapshot;
    const session = snapshot.sessions.find(item => item.id === sessionId);
    if (!session) throw new Error('当前会话不存在。');
    const projectId = session.projectId ?? null;
    snapshot.projectCurrentSessions = (snapshot.projectCurrentSessions || []).filter(ref =>
      ref.projectId !== projectId && snapshot.sessions.some(item => item.id === ref.sessionId && (item.projectId ?? null) === ref.projectId));
    snapshot.projectCurrentSessions.push({ projectId, sessionId });
  }
  const notifySession = () => onSessionChange?.(current());
  function capture() {
    if (conversation) Object.assign(current(), conversation.getDraftState(), {
      messages: conversation.getMessages(), modelSelection: conversation.getModelSelection(), viewState: conversation.getViewState(),
    });
    const snapshot = { version: /** @type {const} */ (1), currentSessionId, sessionSequence, sessions, ...(projectCurrentSessions.length ? { projectCurrentSessions } : {}) };
    remember(snapshot); projectCurrentSessions = snapshot.projectCurrentSessions || [];
    return snapshot;
  }
  function schedule() { if (!disposed && !restoring) persistence?.schedule(); }
  function renderTitle() {
    if (!recent) {
      title.lastElementChild ? title.lastElementChild.textContent = current().title : title.textContent = current().title;
      return;
    }
    // Session identity stays stable while a reply streams, including the focused row.
    const visible = sessions.filter(session => !session.archived && inScope(session));
    for (const [id, entry] of recentRows) {
      if (!visible.some(session => session.id === id)) { entry.dispose(); entry.container.remove(); recentRows.delete(id); }
    }
    for (let index = 0; index < visible.length; index++) {
      const session = visible[index];
      let entry = recentRows.get(session.id);
      if (!entry) {
        const row = button(session.title, 'recent-session', 'message-square');
        row.dataset.sessionId = session.id;
        row.addEventListener('click', () => selectSession(session.id));
        const container = element('div', 'session-workspace__recent-entry');
        const menu = element('wa-dropdown'); menu.setAttribute('placement', 'bottom-end');
        const trigger = actionButton('会话操作', 'session-actions', { icon: 'ellipsis', appearance: 'plain' });
        trigger.setAttribute('slot', 'trigger');
        const renameItem = element('wa-dropdown-item', '', '重命名'); renameItem.setAttribute('value', 'rename');
        const archiveItem = element('wa-dropdown-item', '', '归档'); archiveItem.setAttribute('value', 'archive');
        archiveItem.title = '归档并保留内容；当前回复将停止';
        archiveItem.disabled = temporaryMode;
        menu.append(trigger, renameItem, archiveItem);
        const dispose = bindActionMenu(menu, action => {
          if (disposed || mutationBusy) return;
          if (action === 'rename') renameSession(trigger, session.id);
          else if (action === 'archive') void archiveFromSidebar(session.id, trigger);
        });
        const actions = element('div', 'session-workspace__recent-actions'); actions.append(menu);
        container.append(row, actions);
        recent.insertBefore(container, recent.children[index] || null);
        entry = { row, container, trigger, dispose, title: null, active: null };
        recentRows.set(session.id, entry);
      }
      if (recent.children[index] !== entry.container) recent.insertBefore(entry.container, recent.children[index] || null);
      if (entry.title !== session.title) {
        const label = entry.row.lastElementChild;
        if (label) label.textContent = session.title;
        entry.row.title = session.title;
        entry.row.setAttribute('aria-label', session.title);
        entry.trigger.setAttribute('aria-label', `会话操作：${session.title}`);
        entry.trigger.title = `会话操作：${session.title}`;
        entry.title = session.title;
      }
      const active = session.id === currentSessionId;
      if (entry.active !== active) {
        entry.row.setAttribute('aria-current', String(active));
        entry.active = active;
      }
    }
    const label = `重命名当前会话：${current().title}`;
    if (rename.title !== label) { rename.title = label; rename.setAttribute('aria-label', label); }
  }
  /** @param {Pick<import('./session-persistence.js').SaveStatus, 'state' | 'code'>} state */
  function saveStatus(state) {
    const applyFailed = state.code === 'apply-failed';
    saved.textContent = temporaryMode ? '临时会话 · 未保存' : applyFailed ? '已保存 · 请重新载入' : state.state === 'error' ? '尚未保存' : state.state === 'saving' ? '正在保存…' : storageLabel;
    root.dataset.saveState = state.state;
    const error = state.state === 'error' || temporaryMode;
    const returnFocus = !error && notice.contains(doc.activeElement);
    notice.hidden = !error; temporary.hidden = true;
    const conflict = ['conflict', 'version-change', 'apply-failed'].includes(state.code ?? '');
    retry.hidden = !error || conflict || temporaryMode;
    reload.hidden = !conflict; backup.hidden = !error || applyFailed;
    noticeText.textContent = temporaryMode ? '临时内容不会自动保存，也不会覆盖原历史；离开前请下载备份。'
      : applyFailed ? '会话已保存到本地，但界面未能更新。请重新载入以显示已保存的记录；不要重复导入。'
      : conflict ? '其他窗口已更新历史。当前内容未保存，请先下载备份，再确认重新载入。'
        : '保存失败，当前内容仍在本页。请重试或下载备份；不会覆盖已保存的其他版本。';
    if (returnFocus) input.focus({ preventScroll: true });
  }
  function restore() {
    if (activeDialog?.dataset.kind === 'find' && activeDialog.dataset.sessionId !== currentSessionId) activeDialog.close();
    restoring = true;
    const session = current();
    conversation.replaceMessages(session.messages);
    conversation.setModelSelection(session.modelSelection || null);
    conversation.setDraft(session.draft, session.edit, session.draftView);
    conversation.restoreViewState(session.viewState);
    restoring = false; renderTitle(); notifySession();
  }
  input.disabled = sendButton.disabled = false;
  conversation = mountConversation({ ...conversationOptions, input, sendButton, scroll, list, status, jumpButton,
    initialMessages: current().messages,
    getDraftContext: () => ({ references: [...(current().references || [])], pendingScenario: current().pendingScenario || 'normal' }),
    /** @param {DraftContext} context */
    setDraftContext(context) {
      Object.assign(current(), context, { references: [...(context.references || [])] });
      conversationOptions.setDraftContext?.(context); schedule();
    },
    onDraftChange() { conversationOptions.onDraftChange?.(); schedule(); },
    /** @param {NonNullable<Session['modelSelection']> | null} selection */
    onModelSelectionChange(selection) { current().modelSelection = selection; conversationOptions.onModelSelectionChange?.(selection); schedule(); },
    /** @param {Session['messages']} messages */
    onMessagesChange(messages) {
      current().messages = messages;
      const first = current().autoTitle && messages.find(message => message.role === 'user' && message.text.trim());
      if (first) { current().title = [...first.text.replace(/\s+/g, ' ').trim()].slice(0, 32).join(''); current().autoTitle = false; }
      renderTitle(); conversationOptions.onMessagesChange?.(messages); if (!restoring) notifySession(); schedule();
    },
    /** @param {ConversationEvent} event */
    onEvent(event) { conversationOptions.onEvent?.(event); onEvent?.(event); },
  });
  restore();
  create.disabled = rename.disabled = title.disabled = false;
  if (!temporaryMode) persistence = createSessionPersistence({ store, revision: loaded.revision, getSnapshot: capture, onStatus: saveStatus });
  saveStatus({ state: temporaryMode ? 'error' : 'saved' });
  if (!loaded.snapshot) schedule();
  if (restoreInputFocus) input.focus({ preventScroll: true });

  /** @param {string} label @param {HTMLElement} trigger */
  function dialog(label, trigger, kind = 'confirm') {
    activeDialog?.close();
    const node = element('dialog', 'session-workspace-dialog');
    node.dataset.kind = kind;
    node.setAttribute('aria-label', label);
    const heading = element('h2', '', label), body = element('div', 'session-workspace-dialog__body');
    const header = element('div', 'session-workspace-dialog__header'), dismiss = actionButton('关闭', 'close', { icon: 'x', appearance: 'plain' });
    header.append(heading, dismiss);
    const cancel = actionButton('取消', 'cancel');
    const actions = element('div', 'session-workspace-dialog__actions'); actions.append(cancel);
    node.append(header, body, actions); doc.body.append(node); activeDialog = node;
    let returnFocus = true;
    const close = (restoreFocus = true) => { if (mutationBusy) return; returnFocus = restoreFocus; node.close(); }; cancel.addEventListener('click', () => close());
    dismiss.addEventListener('click', () => close());
    node.addEventListener('cancel', event => { if (mutationBusy) event.preventDefault(); });
    node.addEventListener('close', () => { node.remove(); if (activeDialog === node) activeDialog = null; if (!disposed && returnFocus) trigger?.focus(); });
    node.showModal(); return { node, body, actions, cancel, close };
  }
  /** @param {string} id @param {{ messageId?: string }} [match] */
  function selectSession(id, match) {
    const session = sessions.find(item => item.id === id); if (!session || !inScope(session) || disposed || mutationBusy) return;
    if (id !== currentSessionId) { conversation.stop(); capture(); currentSessionId = id; restore(); }
    onSessionOpen?.(session);
    if (match?.messageId) {
      // The conversation renderer owns the list's HTML message elements.
      const article = /** @type {HTMLElement[]} */ ([...list.children]).find(node => node.dataset.messageId === match.messageId);
      if (article) {
        const top = scroll.scrollTop + article.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16;
        conversation.restoreViewState({ ...conversation.getViewState(), scrollTop: Math.max(0, top), followLatest: false, readingDetails: false, readingAnchor: null });
        article.tabIndex = -1; article.focus({ preventScroll: true }); status.textContent = '已定位到匹配消息。';
      } else input.focus();
    } else input.focus();
    schedule();
  }
  /** @param {Element} node @param {RegExp | null} pattern */
  function highlightMatch(node, pattern) {
    const text = node.textContent ?? '';
    const hit = pattern?.exec(text);
    if (!hit) return;
    node.replaceChildren(doc.createTextNode(text.slice(0, hit.index)), element('mark', '', hit[0]),
      doc.createTextNode(text.slice(hit.index + hit[0].length)));
  }
  /** @param {HTMLElement} [trigger] */
  function openFind(trigger = input) {
    if (disposed || mutationBusy) return;
    capture();
    const sessionId = currentSessionId;
    const surface = dialog('在当前会话中查找', trigger, 'find');
    surface.node.dataset.sessionId = sessionId;
    const search = element('input'); search.type = 'search'; search.placeholder = '查找当前会话消息'; search.setAttribute('aria-label', '查找当前会话消息');
    const searchBox = element('div', 'session-workspace__search');
    const clear = actionButton('清除搜索', 'clear-search', { icon: 'x', appearance: 'plain' });
    searchBox.append(createIcon(doc, 'search'), search, clear);
    const results = element('div', 'session-workspace__results'), count = element('p', 'session-workspace__status'); count.setAttribute('role', 'status');
    const empty = element('div', 'session-workspace__empty'), emptyTitle = element('p'), emptyDescription = element('small');
    empty.append(createIcon(doc, 'search'), emptyTitle, emptyDescription);
    surface.body.append(searchBox, count, results, empty);
    /** @type {HTMLButtonElement[]} */
    let resultRows = [];
    let composing = false;
    function render() {
      if (sessionId !== currentSessionId || disposed) { surface.close(); return; }
      const pattern = literalSessionQuery(search.value);
      clear.hidden = !search.value;
      results.replaceChildren(); resultRows = [];
      if (pattern) for (const message of current().messages) {
        const match = sessionMatch({ title: '', messages: [message] }, search.value, pattern);
        if (!match.matched) continue;
        const label = message.record ? '记录' : message.role === 'user' ? '用户' : '助手';
        const row = button(label, 'find-message', 'message-square'); row.dataset.messageId = message.id;
        row.children[1].className = 'session-workspace__result-title';
        const snippet = element('small', '', match.snippet);
        snippet.id = `session-workspace-${instanceId}-find-${encodeURIComponent(message.id)}`;
        highlightMatch(snippet, pattern);
        row.setAttribute('aria-describedby', snippet.id); row.append(snippet);
        row.addEventListener('click', () => {
          if (disposed || mutationBusy || sessionId !== currentSessionId || !surface.node.open) return;
          surface.close(false); selectSession(sessionId, { messageId: message.id });
        });
        results.append(row); resultRows.push(row);
      }
      count.hidden = !pattern;
      count.textContent = `${resultRows.length} 条匹配消息`;
      empty.hidden = resultRows.length > 0;
      emptyTitle.textContent = pattern ? '没有找到消息' : '查找当前会话中的内容';
      emptyDescription.textContent = pattern ? '试试其他关键词，或清除搜索。' : '输入关键词，定位到匹配消息。';
    }
    function resetSearch() { search.value = ''; render(); search.focus(); }
    clear.addEventListener('click', resetSearch);
    search.addEventListener('compositionstart', () => { composing = true; });
    search.addEventListener('input', event => { if (!composing && !('isComposing' in event && event.isComposing)) render(); });
    search.addEventListener('compositionend', () => { composing = false; render(); });
    surface.node.addEventListener('cancel', event => {
      if (composing || search.value) { event.preventDefault(); if (!composing) resetSearch(); }
    });
    surface.node.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      const index = resultRows.findIndex(row => row === doc.activeElement);
      if (doc.activeElement !== search && index < 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!resultRows.length) return;
        event.preventDefault();
        const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : resultRows.length - 1)
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + resultRows.length) % resultRows.length;
        resultRows[next].focus();
      } else if (event.key === 'Enter' && doc.activeElement === search && resultRows.length) {
        event.preventDefault(); resultRows[0].click();
      }
    });
    render(); search.focus();
  }
  /** @param {HTMLElement} [trigger] @param {'active' | 'archived' | 'all'} [filter] */
  function openHistory(trigger = title, filter = 'active') {
    if (disposed || mutationBusy) return;
    if (!['active', 'archived', 'all'].includes(filter)) filter = 'active';
    capture(); const surface = dialog('历史会话', trigger, 'history');
    const search = element('input'); search.type = 'search'; search.placeholder = '搜索标题或消息'; search.setAttribute('aria-label', '搜索会话');
    const searchBox = element('div', 'session-workspace__search');
    const clear = actionButton('清除搜索', 'clear-search', { icon: 'x', appearance: 'plain' });
    searchBox.append(createIcon(doc, 'search'), search, clear);
    const filters = element('div', 'session-workspace__filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', '会话范围');
    const filterValues = /** @type {const} */ (['active', 'archived', 'all']);
    const filterButtons = filterValues.map((value, index) => {
      const control = button(['活动', '已归档', '全部'][index], `filter-${value}`);
      control.addEventListener('click', () => { if (mutationBusy) return; filter = value; render(); }); filters.append(control); return control;
    });
    const results = element('div', 'session-workspace__results'), count = element('p', 'session-workspace__status'); count.setAttribute('role', 'status');
    const empty = element('div', 'session-workspace__empty'), reset = actionButton('清除搜索', 'clear-empty', { appearance: 'plain' });
    const emptyTitle = element('p'), emptyDescription = element('small');
    empty.append(createIcon(doc, 'message-square'), emptyTitle, emptyDescription, reset);
    const exportButton = actionButton('下载备份', 'backup', { appearance: 'plain' });
    const feedback = element('p', 'session-workspace__status'); feedback.setAttribute('role', 'status');
    exportButton.addEventListener('click', () => download(feedback));
    const dataButton = actionButton('数据与备份', 'data', { appearance: 'plain' });
    dataButton.addEventListener('click', () => { if (disposed || mutationBusy || dataSettings?.canClose() === false) return; surface.close(false); openData(trigger); });
    surface.body.append(searchBox, filters, count, results, empty, feedback);
    surface.actions.replaceChildren(exportButton, dataButton, surface.cancel);
    /** @type {HTMLButtonElement[]} */
    let resultRows = [];
    function render() {
      const pattern = literalSessionQuery(search.value);
      filterButtons.forEach((control, index) => { control.setAttribute('aria-pressed', String(filter === filterValues[index])); control.disabled = mutationBusy; });
      clear.hidden = !search.value;
      reset.hidden = !search.value;
      emptyTitle.textContent = search.value ? '没有找到会话' : filter === 'archived' ? '暂无已归档会话' : '暂无会话';
      emptyDescription.textContent = search.value ? '试试其他关键词，或清除搜索。' : filter === 'archived' ? '归档的会话会保留在这里，随时可以恢复。' : '新建一个会话，开始新的任务。';
      results.replaceChildren(); resultRows = []; let matched = 0;
      for (const session of sessions) {
        if (!inScope(session)) continue;
        if ((filter === 'active' && session.archived) || (filter === 'archived' && !session.archived)) continue;
        const match = sessionMatch(session, search.value, pattern); if (!match.matched) continue;
        matched++;
        const row = button(session.title, 'session', session.archived ? 'folder' : 'message-square'); row.dataset.sessionId = session.id;
        const resultTitle = row.children[1]; resultTitle.className = 'session-workspace__result-title';
        highlightMatch(resultTitle, pattern);
        row.setAttribute('aria-current', String(session.id === currentSessionId));
        if (match.snippet) {
          const snippet = element('small', '', match.snippet);
          if (match.messageId) highlightMatch(snippet, pattern);
          snippet.id = `session-workspace-${instanceId}-${encodeURIComponent(session.id)}-snippet`;
          row.setAttribute('aria-describedby', snippet.id); row.append(snippet);
        }
        if (session.id === currentSessionId) row.append(createIcon(doc, 'check', 'session-workspace__current'));
        row.disabled = mutationBusy;
        row.addEventListener('click', () => { surface.close(false); selectSession(session.id, match); }); resultRows.push(row);
        const entry = element('div', 'session-workspace__result');
        const action = actionButton(session.archived ? '恢复' : '归档', session.archived ? 'restore-session' : 'archive-session', { appearance: 'plain' });
        action.dataset.sessionId = session.id; action.setAttribute('aria-label', `${session.archived ? '恢复' : '归档'}会话：${session.title}`);
        action.title = session.archived ? '恢复到活动会话' : '归档并保留内容；当前回复将停止';
        action.disabled = mutationBusy || temporaryMode;
        action.addEventListener('click', async () => {
          if (mutationBusy || disposed) return;
          setMutationBusy(true); feedback.textContent = '正在保存会话…'; render();
          try {
            const archived = await changeArchived(session.id);
            feedback.textContent = archived ? '已归档，消息和草稿仍保留。可在「已归档」中恢复。' : '已恢复到活动会话。';
          } catch (error) { feedback.textContent = errorCode(error) === 'apply-failed'
            ? '会话更改已保存，但界面未能更新。请关闭此弹窗并重新载入，不要重复操作。'
            : '操作未完成，原会话未归档或更改。请先处理保存错误后重试。'; }
          finally { setMutationBusy(false); if (!disposed) { render(); search.focus(); } }
        });
        entry.append(row, action); results.append(entry);
      }
      count.textContent = `${matched} 个会话`;
      empty.hidden = matched > 0;
    }
    let composing = false;
    function resetSearch() { search.value = ''; render(); search.focus(); }
    clear.addEventListener('click', resetSearch); reset.addEventListener('click', resetSearch);
    search.addEventListener('compositionstart', () => { composing = true; });
    search.addEventListener('input', event => { if (!composing && !('isComposing' in event && event.isComposing)) render(); });
    search.addEventListener('compositionend', () => { composing = false; render(); });
    surface.node.addEventListener('cancel', event => {
      if (composing || search.value) { event.preventDefault(); if (!composing) resetSearch(); }
    });
    surface.node.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      const rows = resultRows, index = rows.findIndex(row => row === doc.activeElement);
      if (doc.activeElement !== search && index < 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!rows.length) return;
        event.preventDefault();
        const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1)
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        rows[next].focus();
      } else if (event.key === 'Enter' && doc.activeElement === search && rows.length) {
        event.preventDefault(); rows[0].click();
      }
    });
    render(); search.focus();
  }
  /** @param {string} id */
  async function changeArchived(id) {
    conversation.stop();
    if (!await flush()) throw new Error('save');
    if (disposed) return;
    const snapshot = normalizeSessionSnapshot(capture());
    const target = snapshot.sessions.find(item => item.id === id && inScope(item));
    if (!target) throw new Error('session-unavailable');
    target.archived = !target.archived;
    if (target.archived && snapshot.currentSessionId === target.id) {
      let next = snapshot.sessions.find(item => !item.archived && inScope(item));
      if (!next) {
        next = { id: `session-${++snapshot.sessionSequence}`, title: '新会话', draft: '', messages: [], references: [], pendingScenario: 'normal', autoTitle: true, ...(projectScoped ? { projectId: activeProjectId } : {}) };
        snapshot.sessions.unshift(next);
      }
      snapshot.currentSessionId = next.id;
    }
    remember(snapshot);
    await commitSnapshot(snapshot);
    return target.archived;
  }
  /** @param {string} id @param {HTMLElement} trigger */
  async function archiveFromSidebar(id, trigger) {
    if (disposed || mutationBusy || temporaryMode) return;
    setMutationBusy(true);
    /** @type {unknown} */
    let failure;
    try { await changeArchived(id); }
    catch (error) { failure = error; }
    finally { setMutationBusy(false); }
    if (disposed) return;
    if (failure) {
      const surface = dialog('未能完成归档', trigger);
      surface.body.append(element('p', '', errorCode(failure) === 'apply-failed'
        ? '会话更改已保存，但界面未能更新。请关闭此弹窗并重新载入，不要重复操作。'
        : '会话仍保留在列表中。请先处理保存错误，再重试归档。'));
      surface.cancel.focus();
    } else {
      (recentRows.get(currentSessionId)?.row || create).focus();
    }
  }
  function createSession() {
    if (disposed || mutationBusy) return;
    conversation.stop(); capture();
    /** @type {SessionSnapshot['sessions'][number]} */
    const session = { id: `session-${++sessionSequence}`, title: '新会话', draft: '', messages: [], references: [], pendingScenario: 'normal', autoTitle: true, ...(projectScoped ? { projectId: activeProjectId } : {}) };
    sessions.unshift(session); currentSessionId = session.id; restore(); schedule(); input.focus(); return session;
  }
  /** @param {HTMLElement} [trigger] @param {string} [sessionId] */
  function renameSession(trigger = projectNavigation ? create : rename, sessionId = currentSessionId) {
    if (disposed || mutationBusy) return;
    const session = sessions.find(item => item.id === sessionId && inScope(item));
    if (!session) return;
    const surface = dialog('重命名会话', trigger, 'rename');
    const field = element('input'); field.type = 'text'; field.value = session.title; field.maxLength = 80; field.setAttribute('aria-label', '会话名称');
    const form = element('form'), submit = actionButton('保存', 'confirm', { type: 'submit', appearance: 'accent' });
    const error = element('p', 'session-workspace__field-error'); error.setAttribute('role', 'status');
    error.id = `session-workspace-${instanceId}-rename-error`; field.setAttribute('aria-describedby', error.id);
    field.setAttribute('aria-invalid', 'false');
    form.id = `session-workspace-${instanceId}-rename`; submit.setAttribute('form', form.id);
    form.append(field, error); surface.body.append(form); surface.actions.replaceChildren(surface.cancel, submit);
    let composing = false; field.addEventListener('compositionstart', () => { composing = true; }); field.addEventListener('compositionend', () => { composing = false; });
    field.addEventListener('input', () => { error.textContent = ''; field.setAttribute('aria-invalid', 'false'); });
    form.addEventListener('submit', event => {
      event.preventDefault(); if (composing) return;
      const value = field.value.replace(/\s+/g, ' ').trim();
      if (!value || value.length > 80) { error.textContent = '请输入 1–80 字的名称。'; field.setAttribute('aria-invalid', 'true'); field.focus(); return; }
      session.title = value; session.autoTitle = false; renderTitle(); schedule(); notifySession(); surface.close();
    }); field.focus(); field.select();
  }
  function download(feedback = noticeText) {
    if (persistence?.getState().code === 'apply-failed') {
      feedback.textContent = '会话已保存，但界面未能更新。请重新载入后下载最新备份。';
      return;
    }
    try {
      const snapshot = normalizeSessionSnapshot(capture(), { mode: 'export' });
      const url = win.URL.createObjectURL(new win.Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = element('a'); link.href = url; link.download = `shipmate-history-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
      feedback.textContent = '已发起备份下载。';
    } catch {
      if (feedback === noticeText) notice.hidden = false;
      feedback.textContent = '无法下载备份。可以重试，或先复制重要内容；当前内容仍保留在本页。';
    }
  }
  /** @type {{ input: boolean; send: boolean } | null} */
  let editorDisabled = null;
  /** @param {boolean} value */
  function setMutationBusy(value) {
    if (value && !mutationBusy) {
      editorDisabled = { input: input.disabled, send: sendButton.disabled };
      input.disabled = sendButton.disabled = true;
    } else if (!value && editorDisabled) {
      input.disabled = editorDisabled.input; sendButton.disabled = editorDisabled.send; editorDisabled = null;
    }
    mutationBusy = value;
    create.disabled = rename.disabled = title.disabled = value;
    for (const entry of recentRows.values()) entry.trigger.disabled = entry.row.disabled = value;
  }
  /** @param {SessionSnapshot} snapshot */
  async function commitSnapshot(snapshot) {
    if (!persistence) throw new Error('会话存储不可用。');
    restoring = true;
    try {
      return await persistence.commitSnapshot(snapshot, savedSnapshot => {
        sessions = savedSnapshot.sessions; currentSessionId = savedSnapshot.currentSessionId; sessionSequence = savedSnapshot.sessionSequence;
        projectCurrentSessions = savedSnapshot.projectCurrentSessions || [];
        if (projectScoped) activeProjectId = current().projectId ?? null;
        if (!disposed) restore();
      });
    } finally { restoring = false; }
  }
  function requireProjectRegistry() {
    if (projectScoped && knownProjects === null) throw Object.assign(new Error('项目列表尚未加载，请先在项目区重试，再追加导入。'), { code: 'projects-unavailable' });
  }
  /** @returns {import('./session-data-dialog.js').SessionDataOptions} */
  function dataOptions() {
    return { document: doc, capture: () => {
      if (persistence?.getState().code === 'apply-failed') throw Object.assign(new Error('重新载入后可下载最新备份。'), { code: 'apply-failed' });
      return capture();
    }, async prepare() {
      if (persistence?.getState().code === 'apply-failed') throw Object.assign(new Error('请先重新载入已保存的会话。'), { code: 'apply-failed' });
      requireProjectRegistry();
      if (temporaryMode) throw new Error('临时模式不能导入，请先恢复会话存储。');
      conversation.stop(); if (!await flush()) throw new Error('当前会话尚未保存，请先处理保存错误。');
    }, commit: async snapshot => {
      requireProjectRegistry();
      if (knownProjects) for (const session of snapshot.sessions) {
        if (!sessions.some(item => item.id === session.id) && session.projectId && !knownProjects.has(session.projectId)) session.projectId = null;
      }
      await commitSnapshot(snapshot);
    }, onBusyChange: setMutationBusy, isDisposed: () => disposed,
    isReloadRequired: () => persistence?.getState().code === 'apply-failed' };
  }
  /** @param {HTMLElement} [trigger] */
  function openData(trigger = title) {
    if (disposed || mutationBusy) return;
    if (persistence?.getState().code === 'apply-failed') { reload.focus(); return; }
    if (dataSettings?.canClose() === false) return;
    if (onOpenDataSettings) { activeDialog?.close(); onOpenDataSettings(trigger); return; }
    dataSettings?.close(); activeDialog?.close();
    const surface = openSessionDataDialog({ ...dataOptions(), trigger,
      onClose(closedNode) { if (activeDialog === closedNode) activeDialog = null; },
    });
    activeDialog = surface.node;
  }
  function getDataSettingsPanel() {
    if (!dataSettings) {
      const panel = createSessionDataPanel(dataOptions());
      dataSettings = { ...panel,
        open() { if (disposed || mutationBusy) return; activeDialog?.close(); panel.open(); },
        canClose: () => !mutationBusy && panel.canClose(),
      };
    }
    return dataSettings;
  }
  /** @param {readonly string[]} ids */
  function setKnownProjects(ids) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 256)) throw new Error('无效的项目列表');
    knownProjects = new Set(ids);
  }
  /** @param {string | null} projectId @param {boolean} associate */
  async function changeProject(projectId, associate) {
    if (!projectScoped || disposed || mutationBusy || temporaryMode ||
        (projectId !== null && (typeof projectId !== 'string' || !projectId.trim() || projectId.length > 256 || !knownProjects?.has(projectId)))) return false;
    setMutationBusy(true);
    try {
      const needsReconcile = sessions.some(session => session.projectId != null && knownProjects?.has(session.projectId) === false);
      if (projectId === activeProjectId && !needsReconcile) return await flush();
      conversation.stop();
      if (!await flush() || disposed) return false;
      const snapshot = normalizeSessionSnapshot(capture());
      if (needsReconcile) {
        for (const session of snapshot.sessions) {
          if (session.projectId != null && knownProjects?.has(session.projectId) === false) session.projectId = null;
        }
        remember(snapshot);
      }
      if (associate) {
        const target = snapshot.sessions.find(item => item.id === snapshot.currentSessionId);
        if (!target) return false;
        target.projectId = projectId;
      } else {
        const remembered = snapshot.projectCurrentSessions?.find(ref => ref.projectId === projectId);
        let target = snapshot.sessions.find(item => item.id === remembered?.sessionId && !item.archived && (item.projectId ?? null) === projectId)
          || snapshot.sessions.find(item => !item.archived && (item.projectId ?? null) === projectId);
        if (!target) {
          target = { id: `session-${++snapshot.sessionSequence}`, projectId, title: '新会话', draft: '', messages: [], references: [], pendingScenario: 'normal', autoTitle: true };
          snapshot.sessions.unshift(target);
        }
        snapshot.currentSessionId = target.id;
      }
      remember(snapshot);
      await commitSnapshot(snapshot);
      activeDialog?.close();
      return true;
    } catch { return false; }
    finally { setMutationBusy(false); }
  }
  /** @param {string | null} projectId */
  const selectProject = projectId => changeProject(projectId, false);
  /** @param {string | null} projectId */
  const associateCurrentSession = projectId => changeProject(projectId, true);
  function confirmReload() {
    const applyFailed = persistence?.getState().code === 'apply-failed';
    const surface = dialog('重新载入历史？', reload);
    surface.body.append(element('p', '', applyFailed ? '会话已保存到本地。重新载入将恢复已保存的记录；本页后续未保存的修改将被放弃。' : '本页尚未保存的修改将被放弃。请先下载备份；其他窗口的记录不会被覆盖。'));
    const exportButton = actionButton('下载备份', 'backup', { appearance: 'plain' }), confirm = actionButton('放弃本页修改并重新载入', 'confirm', { appearance: 'accent', variant: 'danger' });
    const feedback = element('p', 'session-workspace__status'); feedback.setAttribute('role', 'status');
    exportButton.hidden = applyFailed;
    if (applyFailed) confirm.textContent = '重新载入已保存的历史';
    exportButton.addEventListener('click', () => download(feedback));
    confirm.addEventListener('click', () => { persistence?.dispose(); disposed = true; win.removeEventListener('beforeunload', guard); win.location.reload(); });
    surface.body.append(feedback); surface.actions.replaceChildren(exportButton, surface.cancel, confirm);
  }
  async function flush() {
    if (disposed || !persistence) return false;
    schedule(); const state = await persistence.flush(); return state.state === 'saved' && !state.dirty;
  }
  /** @param {BeforeUnloadEvent} event */
  function guard(event) {
    if (mutationBusy || temporaryMode || persistence?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }
  function destroy() {
    if (disposed) return;
    conversation.stop(); capture(); schedule(); conversation.destroy();
    for (const unbind of bindings) unbind();
    for (const entry of recentRows.values()) entry.dispose();
    disposed = true; dataSettings?.destroy(); activeDialog?.close(); root.remove();
    void Promise.resolve(persistence?.flush()).finally(() => { persistence?.dispose(); store.close(); });
  }
  bind(title, 'click', () => openHistory()); bind(create, 'click', createSession); bind(rename, 'click', () => renameSession());
  bind(retry, 'click', () => { void persistence?.retry(); }); bind(backup, 'click', () => download()); bind(reload, 'click', confirmReload);
  for (const type of /** @type {const} */ (['input', 'select', 'scroll'])) bind(input, type, schedule);
  bind(scroll, 'scroll', schedule, { passive: true }); bind(list, 'toggle', schedule, true); bind(list, 'input', schedule);
  bind(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') void flush(); });
  bind(win, 'beforeunload', guard);
  bind(win, 'pageshow', event => {
    if (!event.persisted || disposed || temporaryMode) return;
    if (persistence?.hasUnsavedChanges()) void flush();
    else win.location.reload();
  });
  bind(win, 'pagehide', event => { if (event.persisted) { conversation.stop(); void flush(); } else destroy(); });
  return { conversation, flush, openHistory, openFind, openData, getDataSettingsPanel, createSession, renameSession, getCurrentSession: current, isTemporary: () => temporaryMode, selectProject, associateCurrentSession, setKnownProjects, destroy };
}
