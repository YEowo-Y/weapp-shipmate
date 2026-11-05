import { mountConversation } from './conversation.js';
import { createIcon } from './components/icons.js';
import { createActionButton } from './components/ui-kit.js';
import { createSessionStore, normalizeSessionSnapshot } from './session-store.js';
import { createSessionPersistence } from './session-persistence.js';
import { sessionMatch } from './session-search.js';
import { openSessionDataDialog, createSessionDataPanel } from './session-data-dialog.js';
export { sessionMatch };

let workspaceSequence = 0;

// The caller owns its mounted composer and passes its existing input/send nodes.
export async function mountSessionWorkspace({ host, input, sendButton, scroll, list, status, jumpButton,
  initialMessages = [], workspace = 'my-miniprogram', storageLabel = '已保存在此浏览器', layout = 'toolbar', projectScoped = false,
  onEvent, onSessionChange, onOpenDataSettings, conversationOptions = {} }) {
  const doc = host.ownerDocument, win = doc.defaultView;
  const instanceId = ++workspaceSequence;
  const element = (tag, className = '', text) => {
    const node = doc.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function button(label, action, icon) {
    const node = element('button', 'session-workspace__button'); node.type = 'button';
    node.dataset.action = action; node.title = label; node.setAttribute('aria-label', label);
    if (icon) node.append(createIcon(doc, icon));
    node.append(element('span', '', label)); return node;
  }
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
  const create = button('新建会话', 'new', 'plus');
  const rename = button(sidebar ? '重命名当前会话' : '重命名', 'rename', 'pencil');
  const recent = sidebar ? element('div', 'session-workspace__recent') : null;
  const recentRows = new Map();
  const saved = element('span', 'session-workspace__status', '正在读取历史…');
  saved.dataset.action = 'save-status'; saved.setAttribute('role', 'status');
  const notice = element('div', 'session-workspace__notice'); notice.hidden = true;
  const noticeText = element('p'); noticeText.setAttribute('role', 'status');
  const retry = button('重试', 'retry'), temporary = button('临时使用', 'temporary');
  const backup = button('下载备份', 'backup'), reload = button('重新载入', 'reload');
  notice.append(noticeText, retry, temporary, backup, reload);
  if (sidebar) {
    const heading = element('div', 'session-workspace__recent-heading');
    const label = element('h2', '', '会话'); label.id = `session-workspace-${instanceId}-recent`;
    recent.setAttribute('role', 'group'); recent.setAttribute('aria-labelledby', label.id);
    heading.append(label, rename);
    root.append(create, title, heading, recent, saved, notice);
  } else root.append(title, create, rename, saved, notice);
  host.append(root);
  input.disabled = sendButton.disabled = create.disabled = rename.disabled = title.disabled = true;
  let store = createSessionStore({ workspace }), persistence = null, temporaryMode = false;
  let disposed = false, restoring = false, mutationBusy = false, conversation, activeDialog = null, dataSettings = null;
  const bindings = [];
  function bind(node, type, handler, options) {
    node.addEventListener(type, handler, options); bindings.push([node, type, handler, options]);
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
  let sessions = loaded.snapshot?.sessions || [{ id: 'session-1', title: '新会话', draft: '', messages: initialMessages,
    references: [], pendingScenario: 'normal', autoTitle: true }];
  let currentSessionId = loaded.snapshot?.currentSessionId || sessions[0].id;
  let sessionSequence = loaded.snapshot?.sessionSequence || 1;
  const current = () => sessions.find(session => session.id === currentSessionId);
  let activeProjectId = current().projectId ?? null;
  let knownProjects = null;
  let projectCurrentSessions = loaded.snapshot?.projectCurrentSessions || [];
  const inScope = session => !projectScoped || (session.projectId ?? null) === activeProjectId;
  function remember(snapshot, sessionId = snapshot.currentSessionId) {
    if (!projectScoped) return;
    const session = snapshot.sessions.find(item => item.id === sessionId);
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
    const snapshot = { version: 1, currentSessionId, sessionSequence, sessions, ...(projectCurrentSessions.length ? { projectCurrentSessions } : {}) };
    remember(snapshot); projectCurrentSessions = snapshot.projectCurrentSessions || [];
    return snapshot;
  }
  function schedule() { if (!disposed && !restoring) persistence?.schedule(); }
  function renderTitle() {
    if (!sidebar) {
      title.lastElementChild ? title.lastElementChild.textContent = current().title : title.textContent = current().title;
      return;
    }
    // Session identity stays stable while a reply streams, including the focused row.
    const visible = sessions.filter(session => !session.archived && inScope(session));
    for (const [id, entry] of recentRows) {
      if (!visible.some(session => session.id === id)) { entry.row.remove(); recentRows.delete(id); }
    }
    for (let index = 0; index < visible.length; index++) {
      const session = visible[index];
      let entry = recentRows.get(session.id);
      if (!entry) {
        const row = button(session.title, 'recent-session', 'message-square');
        row.dataset.sessionId = session.id;
        row.addEventListener('click', () => selectSession(session.id));
        recent.insertBefore(row, recent.children[index] || null);
        entry = { row, title: session.title, active: null };
        recentRows.set(session.id, entry);
      }
      if (recent.children[index] !== entry.row) recent.insertBefore(entry.row, recent.children[index] || null);
      if (entry.title !== session.title) {
        entry.row.lastElementChild.textContent = session.title;
        entry.row.title = session.title;
        entry.row.setAttribute('aria-label', session.title);
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
  function saveStatus(state) {
    const applyFailed = state.code === 'apply-failed';
    saved.textContent = temporaryMode ? '临时会话 · 未保存' : applyFailed ? '已保存 · 请重新载入' : state.state === 'error' ? '尚未保存' : state.state === 'saving' ? '正在保存…' : storageLabel;
    root.dataset.saveState = state.state;
    const error = state.state === 'error' || temporaryMode;
    const returnFocus = !error && notice.contains(doc.activeElement);
    notice.hidden = !error; temporary.hidden = true;
    const conflict = ['conflict', 'version-change', 'apply-failed'].includes(state.code);
    retry.hidden = !error || conflict || temporaryMode;
    reload.hidden = !conflict; backup.hidden = !error || applyFailed;
    noticeText.textContent = temporaryMode ? '临时内容不会自动保存，也不会覆盖原历史；离开前请下载备份。'
      : applyFailed ? '会话已保存到本地，但界面未能更新。请重新载入以显示已保存的记录；不要重复导入。'
      : conflict ? '其他窗口已更新历史。当前内容未保存，请先下载备份，再确认重新载入。'
        : '保存失败，当前内容仍在本页。请重试或下载备份；不会覆盖已保存的其他版本。';
    if (returnFocus) input.focus({ preventScroll: true });
  }
  function restore() {
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
    setDraftContext(context) {
      Object.assign(current(), context, { references: [...(context.references || [])] });
      conversationOptions.setDraftContext?.(context); schedule();
    },
    onDraftChange() { conversationOptions.onDraftChange?.(); schedule(); },
    onModelSelectionChange(selection) { current().modelSelection = selection; conversationOptions.onModelSelectionChange?.(selection); schedule(); },
    onMessagesChange(messages) {
      current().messages = messages;
      const first = current().autoTitle && messages.find(message => message.role === 'user' && message.text.trim());
      if (first) { current().title = [...first.text.replace(/\s+/g, ' ').trim()].slice(0, 32).join(''); current().autoTitle = false; }
      renderTitle(); conversationOptions.onMessagesChange?.(messages); if (!restoring) notifySession(); schedule();
    },
    onEvent(event) { conversationOptions.onEvent?.(event); onEvent?.(event); },
  });
  restore();
  create.disabled = rename.disabled = title.disabled = false;
  if (!temporaryMode) persistence = createSessionPersistence({ store, revision: loaded.revision, getSnapshot: capture, onStatus: saveStatus });
  saveStatus({ state: temporaryMode ? 'error' : 'saved' });
  if (!loaded.snapshot) schedule();
  if (restoreInputFocus) input.focus({ preventScroll: true });

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
  function selectSession(id, match) {
    const session = sessions.find(item => item.id === id); if (!session || !inScope(session) || disposed || mutationBusy) return;
    if (id !== currentSessionId) { conversation.stop(); capture(); currentSessionId = id; restore(); }
    if (match?.messageId) {
      const article = [...list.children].find(node => node.dataset.messageId === match.messageId);
      if (article) {
        const top = scroll.scrollTop + article.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16;
        conversation.restoreViewState({ ...conversation.getViewState(), scrollTop: Math.max(0, top), followLatest: false, readingDetails: false, readingAnchor: null });
        article.tabIndex = -1; article.focus({ preventScroll: true }); status.textContent = '已定位到匹配消息。';
      } else input.focus();
    } else input.focus();
    schedule();
  }
  function openHistory(trigger = title, filter = 'active') {
    if (disposed || mutationBusy) return;
    if (!['active', 'archived', 'all'].includes(filter)) filter = 'active';
    capture(); const surface = dialog('历史会话', trigger, 'history');
    const search = element('input'); search.type = 'search'; search.placeholder = '搜索标题或消息'; search.setAttribute('aria-label', '搜索会话');
    const searchBox = element('div', 'session-workspace__search');
    const clear = actionButton('清除搜索', 'clear-search', { icon: 'x', appearance: 'plain' });
    searchBox.append(createIcon(doc, 'search'), search, clear);
    const filters = element('div', 'session-workspace__filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', '会话范围');
    const filterButtons = ['active', 'archived', 'all'].map((value, index) => {
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
    let resultRows = [];
    function render() {
      filterButtons.forEach((control, index) => { control.setAttribute('aria-pressed', String(filter === ['active', 'archived', 'all'][index])); control.disabled = mutationBusy; });
      clear.hidden = !search.value;
      reset.hidden = !search.value;
      emptyTitle.textContent = search.value ? '没有找到会话' : filter === 'archived' ? '暂无已归档会话' : '暂无会话';
      emptyDescription.textContent = search.value ? '试试其他关键词，或清除搜索。' : filter === 'archived' ? '归档的会话会保留在这里，随时可以恢复。' : '新建一个会话，开始新的任务。';
      results.replaceChildren(); resultRows = []; let matched = 0;
      for (const session of sessions) {
        if (!inScope(session)) continue;
        if ((filter === 'active' && session.archived) || (filter === 'archived' && !session.archived)) continue;
        const match = sessionMatch(session, search.value); if (!match.matched) continue;
        matched++;
        const row = button(session.title, 'session', session.archived ? 'folder' : 'message-square'); row.dataset.sessionId = session.id;
        row.children[1].className = 'session-workspace__result-title';
        row.setAttribute('aria-current', String(session.id === currentSessionId));
        if (match.snippet) {
          const snippet = element('small', '', match.snippet);
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
            conversation.stop();
            if (!await flush()) throw new Error('save');
            if (disposed) return;
            const snapshot = normalizeSessionSnapshot(capture());
            const target = snapshot.sessions.find(item => item.id === session.id); target.archived = !session.archived;
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
            feedback.textContent = target.archived ? '已归档，消息和草稿仍保留。可在「已归档」中恢复。' : '已恢复到活动会话。';
          } catch (error) { feedback.textContent = error?.code === 'apply-failed'
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
    search.addEventListener('input', event => { if (!composing && !event.isComposing) render(); });
    search.addEventListener('compositionend', () => { composing = false; render(); });
    surface.node.addEventListener('cancel', event => {
      if (composing || search.value) { event.preventDefault(); if (!composing) resetSearch(); }
    });
    surface.node.addEventListener('keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      const rows = resultRows, index = rows.indexOf(doc.activeElement);
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
  function createSession() {
    if (disposed || mutationBusy) return;
    conversation.stop(); capture();
    const session = { id: `session-${++sessionSequence}`, title: '新会话', draft: '', messages: [], references: [], pendingScenario: 'normal', autoTitle: true, ...(projectScoped ? { projectId: activeProjectId } : {}) };
    sessions.unshift(session); currentSessionId = session.id; restore(); schedule(); input.focus(); return session;
  }
  function renameSession() {
    if (disposed || mutationBusy) return;
    const session = current(); const surface = dialog('重命名会话', rename, 'rename');
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
  let editorDisabled = null;
  function setMutationBusy(value) {
    if (value && !mutationBusy) {
      editorDisabled = { input: input.disabled, send: sendButton.disabled };
      input.disabled = sendButton.disabled = true;
    } else if (!value && editorDisabled) {
      input.disabled = editorDisabled.input; sendButton.disabled = editorDisabled.send; editorDisabled = null;
    }
    mutationBusy = value;
    create.disabled = rename.disabled = title.disabled = value;
  }
  async function commitSnapshot(snapshot) {
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
  function setKnownProjects(ids) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 256)) throw new Error('无效的项目列表');
    knownProjects = new Set(ids);
  }
  async function changeProject(projectId, associate) {
    if (!projectScoped || disposed || mutationBusy || temporaryMode ||
        (projectId !== null && (typeof projectId !== 'string' || !projectId.trim() || projectId.length > 256 || !knownProjects?.has(projectId)))) return false;
    setMutationBusy(true);
    try {
      const needsReconcile = knownProjects !== null && sessions.some(session => session.projectId != null && !knownProjects.has(session.projectId));
      if (projectId === activeProjectId && !needsReconcile) return await flush();
      conversation.stop();
      if (!await flush() || disposed) return false;
      const snapshot = normalizeSessionSnapshot(capture());
      if (needsReconcile) {
        for (const session of snapshot.sessions) {
          if (session.projectId != null && !knownProjects.has(session.projectId)) session.projectId = null;
        }
        remember(snapshot);
      }
      if (associate) snapshot.sessions.find(item => item.id === currentSessionId).projectId = projectId;
      else {
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
  const selectProject = projectId => changeProject(projectId, false);
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
    if (disposed || temporaryMode) return false;
    schedule(); const state = await persistence.flush(); return state.state === 'saved' && !state.dirty;
  }
  function guard(event) {
    if (mutationBusy || temporaryMode || persistence?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }
  function destroy() {
    if (disposed) return;
    conversation.stop(); capture(); schedule(); conversation.destroy();
    for (const [node, type, handler, options] of bindings) node.removeEventListener(type, handler, options);
    disposed = true; dataSettings?.destroy(); activeDialog?.close(); root.remove();
    void Promise.resolve(persistence?.flush()).finally(() => { persistence?.dispose(); store.close(); });
  }
  bind(title, 'click', () => openHistory()); bind(create, 'click', createSession); bind(rename, 'click', renameSession);
  bind(retry, 'click', () => { void persistence?.retry(); }); bind(backup, 'click', () => download()); bind(reload, 'click', confirmReload);
  for (const type of ['input', 'select', 'scroll']) bind(input, type, schedule);
  bind(scroll, 'scroll', schedule, { passive: true }); bind(list, 'toggle', schedule, true); bind(list, 'input', schedule);
  bind(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') void flush(); });
  bind(win, 'beforeunload', guard);
  bind(win, 'pageshow', event => {
    if (!event.persisted || disposed || temporaryMode) return;
    if (persistence?.hasUnsavedChanges()) void flush();
    else win.location.reload();
  });
  bind(win, 'pagehide', event => { if (event.persisted) { conversation.stop(); void flush(); } else destroy(); });
  return { conversation, flush, openHistory, openData, getDataSettingsPanel, createSession, getCurrentSession: current, isTemporary: () => temporaryMode, selectProject, associateCurrentSession, setKnownProjects, destroy };
}
