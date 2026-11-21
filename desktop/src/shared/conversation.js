// @ts-check
/* global navigator, window */
import { AGENT_TOOL_NAME, validateAgentInput, validateAgentResult } from './agent-contract.js';
import { createMessage, updateMessageText, updateMessageState, updateGuideFilter, getGuideViewState, restoreGuideViewState } from './components/message.js';
import { getReviewPresentation, getRunAnnouncement, getRunPresentation, formatTraceLabel } from './components/presentation.js';
import { createIcon } from './components/icons.js';
import { GUIDE_SUBJECTS, validateGuideInput, validateGuideResult } from './guide-contract.js';
import { createGuideArtifact } from './guide-artifact.js';
import { createArtifactDownloader } from './artifact-download.js';
import { SUPPORTED_CHAT_PROVIDERS } from './chat-transport.js';
import { CONVERSATION_STATES, copyLive, createConversationController, createDemoPlan, isConversationActive, normalizePlan } from './conversation-controller.js';

export { CONVERSATION_STATES, createConversationController, createDemoPlan };

/** @typedef {import('./session-store.js').SessionSnapshot['sessions'][number]} StoredSession */
/** @typedef {import('./components/message.js').RenderMessage} RenderMessage */
/** @typedef {ReturnType<typeof createConversationController>} Controller */
/** @typedef {import('./conversation-controller.js').LiveRequest} LiveRequest */
/** @typedef {import('./conversation-controller.js').ConversationControllerOptions} ControllerOptions */
/** @typedef {import('./conversation-controller.js').ConversationState} ConversationState */
/** @typedef {import('./conversation-controller.js').DemoPlanInput} DemoPlanInput */
/** @typedef {import('./guide-contract.js').GuideInput} GuideInput */
/** @typedef {import('./agent-contract.js').AgentResult} AgentResult */
/** @typedef {Omit<RenderMessage, 'live'> & { live?: LiveRequest | null; sourceUserId?: string | null }} ConversationMessage */
/** @typedef {Required<NonNullable<StoredSession['modelSelection']>>} ModelSelection */
/** @typedef {{ providerId: string; model: string; label?: string }} ModelSelectionInput */
/** @typedef {Pick<StoredSession, 'references' | 'pendingScenario'>} DraftContext */
/** @typedef {NonNullable<StoredSession['edit']>} DraftEdit */
/** @typedef {NonNullable<StoredSession['draftView']>} DraftView */
/** @typedef {NonNullable<StoredSession['viewState']>} ViewState */
/** @typedef {NonNullable<ViewState['messageWindow']>} MessageWindow */
/** @typedef {NonNullable<ViewState['readingAnchor']>} ReadingAnchor */
/** @typedef {Pick<AgentResult, 'runId' | 'kind' | 'projectRevision' | 'contextRevision'>} ArtifactReference */
/** @typedef {'pending' | 'success' | 'error'} CopyState */
/** @typedef {{ source: string; guide: boolean; timer?: import('./conversation-controller.js').TimerHandle; announcement?: number }} CopyJob */
/** @typedef {{ label: string | null; title: string; nodes: ChildNode[]; text: string | null }} CopyDefaults */
/** @typedef {{ width: number; height: number; top: number; anchor?: { node: Element; top: number } }} Viewport */
/** @typedef {{ input?: string; plan?: DemoPlanInput; live?: never; guide?: GuideInput | null; retry?: boolean; sourceUserId?: string; branchNote?: string }} SubmitOptions */
/** @typedef {import('./conversation-controller.js').StartResult | { ok: true } | { ok: false; reason: 'destroyed' | 'model-required' | 'record-only' | 'missing-source' }} SubmitResult */
/** @typedef {HTMLElementEventMap & { 'shipmate:model-select': CustomEvent<{ selection?: ModelSelectionInput | null }>; 'shipmate:guide-request': CustomEvent<{ input: unknown; accepted?: boolean }> }} ConversationEvents */
/**
 * @typedef {Omit<ControllerOptions, 'now'> & {
 *   initialMessages?: readonly ConversationMessage[];
 *   initialScroll?: 'top' | 'bottom';
 *   requireModel?: boolean; recordOnly?: boolean; allowRecords?: boolean;
 *   artifactDownloader?: ReturnType<typeof createArtifactDownloader>;
 *   getSendShortcut?: () => string;
 *   getDraftContext?: () => DraftContext;
 *   setDraftContext?: (context: DraftContext) => void;
 *   onDraftChange?: () => void;
 *   onModelSelectionChange?: (selection: ModelSelection | null) => void;
 *   onModelRequired?: () => void;
 *   onMessagesChange?: (messages: ConversationMessage[]) => void;
 *   onCopy?: (message: ConversationMessage, ok: boolean) => void;
 *   onEdit?: (message: ConversationMessage) => void;
 *   onOpenArtifact?: (artifactId: string, expected: ArtifactReference) => Promise<void> | void;
 * }} ConversationOptions
 */

let messageSequence = 0;
const MESSAGES_PER_PAGE = 80;
const fallbackMessagePrefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** @param {ConversationMessage['role']} role */
function nextMessageId(role) {
  const id = globalThis.crypto?.randomUUID?.() || `${fallbackMessagePrefix}-${++messageSequence}`;
  return `${role}-${id}`;
}

/** @param {string} text */
async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** @param {unknown} value @returns {value is GuideInput} */
const isGuideInput = value => validateGuideInput(value).ok;
/** @param {unknown} value @returns {value is AgentResult} */
const isAgentResult = value => validateAgentResult(value).ok;

/** @param {ConversationOptions & { input: HTMLTextAreaElement; sendButton: HTMLButtonElement; scroll: HTMLElement; list: HTMLElement; status: HTMLElement; jumpButton: HTMLElement }} options */
export function mountConversation(options) {
  const { input, sendButton, scroll, list, status, jumpButton } = options;
  if (!input || !sendButton || !scroll || !list || !status || !jumpButton) {
    throw new Error('mountConversation requires input, sendButton, scroll, list, status, and jumpButton.');
  }
  const documentRef = list.ownerDocument;
  const view = documentRef.defaultView;
  const jumpLabel = documentRef.createElement('span');
  jumpLabel.textContent = '回到最新';
  jumpButton.replaceChildren(jumpLabel, createIcon(documentRef, 'arrow-down'));
  jumpButton.setAttribute('aria-label', '回到最新消息');
  jumpButton.title = '回到最新消息';
  let messages = (options.initialMessages || []).map((message) => ({ ...message }));
  let messageWindow = initialMessageWindow();
  /** @type {ViewState | null | undefined} */
  let savedMessageView = null;
  const earlierPage = pageButton('上一页消息', 'earlier-messages');
  const laterPage = pageButton('下一页消息', 'later-messages');
  let composing = false;
  let followLatest = true;
  let readingDetails = false;
  /** @type {ReadingAnchor | null} */
  let readingAnchor = null;
  /** @type {string | null} */
  let activeAssistantId = null;
  /** @type {Set<number>} */
  const dirtyTextParts = new Set();
  /** @type {number | null} */
  let streamFrame = null;
  /** @type {string | null} */
  let activeSourceUserId = null;
  /** @type {import('./conversation-controller.js').RunResult | null} */
  let lastPlan = null;
  /** @type {DraftEdit | null} */
  let pendingEdit = null;
  let viewEpoch = 0;
  let destroyed = false;
  /** @type {ModelSelection | null} */
  let modelSelection = null;
  const composer = /** @type {HTMLElement | null} */ (input.closest('.composer'));
  if (composer) composer.dataset.liveChat = 'true';
  /** @type {Viewport | null} */
  let viewport = null;
  let announcementVersion = 0;
  /** @type {Map<string, CopyState>} */
  const copyStates = new Map();
  /** @type {Map<string, CopyJob>} */
  const copyJobs = new Map();
  /** @type {WeakMap<HTMLButtonElement, CopyDefaults>} */
  const copyDefaults = new WeakMap();
  const feedbackClock = documentRef.defaultView || globalThis;

  // The list contains mounted articles and the available paging controls.
  const messageArticles = () => [.../** @type {HTMLCollectionOf<HTMLElement>} */ (list.children)]
    .filter(node => node !== earlierPage && node !== laterPage);
  /** @param {string} messageId */
  const findArticle = messageId => messageArticles().find(node => node.dataset.messageId === messageId);
  /** @param {HTMLElement} container */
  const actionControls = container => /** @type {NodeListOf<HTMLButtonElement>} */ (container.querySelectorAll('[data-action]'));

  /** @param {string} key */
  function resetCopy(key) {
    const job = copyJobs.get(key);
    if (job?.timer !== undefined) feedbackClock.clearTimeout(job.timer);
    if (job?.announcement === announcementVersion) announce('');
    copyJobs.delete(key);
    copyStates.delete(key);
    for (const control of actionControls(list)) {
      if (copyKey(control) !== key) continue;
      const original = copyDefaults.get(control);
      if (!original) continue;
      delete control.dataset.copyState;
      control.removeAttribute('aria-busy');
      if (original.label === null) control.removeAttribute('aria-label');
      else control.setAttribute('aria-label', original.label);
      control.title = original.title;
      if (original.nodes.length) control.replaceChildren(...original.nodes);
      else control.textContent = original.text;
      copyDefaults.delete(control);
    }
  }

  function clearCopyFeedback() {
    for (const key of copyJobs.keys()) resetCopy(key);
    copyStates.clear();
  }

  function invalidateChangedCopies() {
    if (!copyJobs.size) return;
    for (const control of actionControls(list)) {
      const key = copyKey(control);
      const job = copyJobs.get(key);
      if (!job || job.guide || copyStates.get(key) === 'error') continue;
      const source = control.dataset.action === 'copy-code'
        ? control.closest('.markdown-code')?.querySelector('code')?.textContent
        : messages.find(message => message.id === control.dataset.messageId)?.text;
      if (source !== job.source) resetCopy(key);
    }
  }
  /** @type {WeakMap<Element, unknown>} */
  const guideCardResults = new WeakMap();
  /** @type {WeakSet<HTMLInputElement>} */
  const guideComposing = new WeakSet();
  const artifactDownloader = options.artifactDownloader || createArtifactDownloader({ documentRef });
  const hint = composer?.querySelector('.agent-composer__hint');
  const editBar = /** @type {HTMLElement | null | undefined} */ (composer?.querySelector('.agent-composer__edit'));
  /** @param {DraftContext} [context] @returns {DraftContext} */
  const copyContext = context => ({ pendingScenario: 'normal', ...context, references: [...(context?.references || [])] });
  const cancelEditButton = editBar?.querySelector('.agent-composer__cancel-edit');
  const editAnnouncement = '正在编辑较早消息；发送后会保留原版本。';

  /** @param {string} text */
  function announce(text, kind = 'action') {
    status.textContent = text;
    status.dataset.announcement = kind;
    return ++announcementVersion;
  }

  /** @param {ModelSelectionInput | null} selection */
  function setModelSelection(selection) {
    if (destroyed || isConversationActive(controller.getSnapshot().state)) {
      announce('请先停止当前回复，再切换模型。');
      return false;
    }
    if (selection && (!Object.hasOwn(SUPPORTED_CHAT_PROVIDERS, selection.providerId) || typeof selection.model !== 'string' || !selection.model.trim())) return false;
    modelSelection = selection ? { providerId: /** @type {ModelSelection['providerId']} */ (selection.providerId), model: selection.model, label: String(selection.label || selection.model) } : null;
    if (composer) {
      composer.dataset.modelProvider = modelSelection?.providerId || '';
      composer.dataset.modelId = modelSelection?.model || '';
      composer.dataset.modelLabel = modelSelection?.label || '';
      const button = composer.querySelector('.agent-composer__model');
      const label = button?.querySelector('.agent-composer__provider');
      if (label) label.textContent = modelSelection?.label || (options.requireModel ? '选择模型' : '本地演示');
      button?.setAttribute('aria-label', `选择模型，当前：${modelSelection?.label || (options.requireModel ? '选择模型' : '本地演示')}`);
      const permission = composer.querySelector('.agent-composer__permission span');
      if (permission) permission.textContent = modelSelection ? '真实文本对话' : (options.requireModel ? '连接模型后开始' : '只读演示');
    }
    updateControls(controller.getSnapshot().state);
    if (modelSelection && status.dataset.announcement === 'model-required') announce('');
    options.onModelSelectionChange?.(modelSelection ? { ...modelSelection } : null);
    return true;
  }

  /** @param {CustomEvent<{ selection?: ModelSelectionInput | null }>} event */
  function onModelSelect(event) { setModelSelection(event.detail?.selection || null); }
  /** @param {unknown} guide */
  function runGuide(guide) {
    if (!isGuideInput(guide)) return { ok: false, reason: /** @type {const} */ ('invalid-guide') };
    return submit({ input: `生成${GUIDE_SUBJECTS[guide.subject]}上线清单（敏感信息：${guide.sensitive ? '是' : '否'}；服务器域名：${guide.domain ? '是' : '否'}）`, guide });
  }
  /** @param {CustomEvent<{ input: unknown; accepted?: boolean }>} event */
  function onGuideRequest(event) {
    if (!event.detail || event.detail.accepted) return;
    const result = runGuide(event.detail.input);
    event.detail.accepted = result.ok;
    if (!result.ok) announce(result.reason === 'busy' ? '请先停止当前回复，再生成上线清单。' : '清单参数无效，请检查后重试。');
  }

  /** @param {string} label @param {string} action */
  function pageButton(label, action) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'conversation-history-page';
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  function latestMessageWindow() {
    return { start: Math.max(0, messages.length - MESSAGES_PER_PAGE), end: messages.length };
  }

  /** @param {ViewState | null} [saved] @returns {MessageWindow} */
  function initialMessageWindow(saved) {
    if (saved ? saved.followLatest : options.initialScroll === 'bottom') return latestMessageWindow();
    const previous = saved?.messageWindow;
    if (previous && previous.start < previous.end && previous.end <= messages.length) {
      return { start: previous.start, end: Math.min(previous.end, previous.start + MESSAGES_PER_PAGE) };
    }
    // Pixel offsets from older backups refer to the full conversation.
    if (saved?.scrollTop || saved?.readingDetails) return { start: 0, end: messages.length };
    return { start: 0, end: Math.min(messages.length, MESSAGES_PER_PAGE) };
  }

  function isNearBottom() {
    return messageWindow.end === messages.length && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 88;
  }

  function rememberViewport() {
    let anchor;
    if (!followLatest || readingDetails) {
      const top = scroll.getBoundingClientRect().top;
      anchor = [...list.children].find(node => node.getBoundingClientRect().bottom > top);
    }
    viewport = { width: scroll.clientWidth, height: scroll.clientHeight, top: scroll.scrollTop,
      anchor: anchor && { node: anchor, top: anchor.getBoundingClientRect().top } };
  }

  function viewportResized() {
    return viewport && (viewport.width !== scroll.clientWidth || viewport.height !== scroll.clientHeight);
  }

  function compensateViewportResize() {
    if (!viewport || !viewportResized()) return;
    // A real upward scroll can arrive before the resize notification. Only a
    // browser clamp to the new scroll range is considered a layout movement.
    const clampedTop = Math.min(viewport.top, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    const movedUp = scroll.scrollTop < clampedTop - 1;
    if (movedUp) followLatest = false;
    if (!movedUp && !followLatest && viewport.width !== scroll.clientWidth && viewport.anchor?.node.parentElement === list) {
      scroll.scrollTop += viewport.anchor.node.getBoundingClientRect().top - viewport.anchor.top;
    }
  }

  function settleViewportResize() {
    if (!viewportResized()) return false;
    settleScroll();
    return true;
  }

  function captureReadingAnchor() {
    const anchor = readingAnchor;
    if (!readingDetails || !anchor) return null;
    const article = findArticle(anchor.messageId);
    const detail = anchor.readingKey
      ? [...(/** @type {NodeListOf<HTMLElement> | undefined} */ (article?.querySelectorAll('[data-reading-key]')) || [])].find(node => node.dataset.readingKey === anchor.readingKey)
      : [...(/** @type {NodeListOf<HTMLElement> | undefined} */ (article?.querySelectorAll('[data-component]')) || [])].find(node => node.dataset.component === anchor.component);
    return detail ? { detail, top: detail.getBoundingClientRect().top } : null;
  }

  /** @param {ReturnType<typeof captureReadingAnchor>} previous */
  function restoreReadingAnchor(previous) {
    if (!previous) return;
    const current = captureReadingAnchor();
    if (current) scroll.scrollTop += current.top - previous.top;
  }

  function emitMessages() {
    options.onMessagesChange?.(messages.map((message) => ({ ...message })));
  }

  /** @param {ConversationMessage} message */
  function sourceUserMessage(message) {
    // Legacy records have no source ID. Explicit IDs must never fall back to a different question.
    if (Object.hasOwn(message, 'sourceUserId')) {
      return messages.find(item => item.role === 'user' && item.id === message.sourceUserId);
    }
    return messages.slice(0, messages.indexOf(message)).reverse().find(item => item.role === 'user');
  }

  /** @param {ConversationMessage} message */
  function renderMessage(message) {
    const article = createMessage(documentRef, message, {
      canRegenerate: !options.recordOnly && Boolean(sourceUserMessage(message)),
    });
    const guideCard = article.querySelector('[data-component="guide-result"]');
    if (guideCard) guideCardResults.set(guideCard, message.structuredResult);
    for (const control of actionControls(article)) {
      if (message.role === 'assistant' && message.guide && ['copy', 'copy-guide'].includes(control.dataset.action ?? '')) control.dataset.copyGuide = 'true';
      if (control.dataset.action === 'retry' || control.dataset.action === 'regenerate') {
        const source = sourceUserMessage(message);
        const label = source?.guide ? '使用原参数重新生成上线清单' : source?.live ? `使用原模型 ${source.live.label || source.live.model} ${control.dataset.action === 'retry' ? '重试' : '重新生成'}` : '重新运行本地演示';
        control.setAttribute('aria-label', label);
        control.title = label;
      }
      const state = copyStates.get(copyKey(control));
      if (state) showCopyState(control, state);
    }
    return article;
  }

  /** @param {HTMLButtonElement} control */
  function copyKey(control) {
    return JSON.stringify([control.dataset.messageId, control.dataset.action, control.dataset.blockKey || '']);
  }

  /** @param {HTMLButtonElement} control @param {CopyState} state */
  function showCopyState(control, state) {
    if (!copyDefaults.has(control)) copyDefaults.set(control, {
      label: control.getAttribute('aria-label'), title: control.title,
      nodes: [...(control.childNodes || control.children)], text: control.textContent,
    });
    const label = control.dataset.copyGuide === 'true'
      ? { pending: '正在复制完整清单', success: '已复制完整清单', error: '清单复制失败，重试' }[state]
      : { pending: '复制中', success: '已复制', error: '复制失败，重试' }[state];
    control.dataset.copyState = state;
    control.setAttribute('aria-label', label);
    control.setAttribute('aria-busy', String(state === 'pending'));
    control.title = state === 'error' ? '复制失败，可重试或手动选择文本' : label;
    const feedback = documentRef.createElement('span');
    feedback.className = 'message-action__feedback';
    feedback.textContent = label;
    control.replaceChildren(createIcon(documentRef, { pending: 'copy', success: 'check', error: 'circle-alert' }[state], 'message-action__icon'), feedback);
  }

  /** @param {HTMLButtonElement} control @param {ConversationMessage} message */
  async function copyFromControl(control, message) {
    const key = copyKey(control);
    if (copyStates.get(key) === 'pending') return;
    const isCode = control.dataset.action === 'copy-code';
    const isGuide = control.dataset.action === 'copy-guide' || (!isCode && message.role === 'assistant' && Boolean(message.guide));
    const artifact = isGuide ? guideArtifact(message, 'markdown') : null;
    if (isGuide && !artifact) return;
    if (isGuide) control.dataset.copyGuide = 'true';
    const source = isGuide && artifact ? artifact.text : isCode ? control.closest('.markdown-code')?.querySelector('code')?.textContent : message.text;
    if (typeof source !== 'string') return;
    const epoch = viewEpoch;
    resetCopy(key);
    /** @type {CopyJob} */
    const job = { source, guide: isGuide };
    copyJobs.set(key, job);
    copyStates.set(key, 'pending');
    showCopyState(control, 'pending');
    const ok = await copyText(source);
    if (epoch !== viewEpoch || copyJobs.get(key) !== job) return;
    // Code copy compares against rendered text, which may still have a frame queued.
    if (isCode && message.id === activeAssistantId && dirtyTextParts.size) drawStreamText(message);
    else invalidateChangedCopies();
    if (copyJobs.get(key) !== job) return;
    const state = ok ? 'success' : 'error';
    copyStates.set(key, state);
    const currentControl = [...actionControls(list)].find(item => copyKey(item) === key);
    if (currentControl) showCopyState(currentControl, state);
    if (ok) {
      job.timer = feedbackClock.setTimeout(() => {
        if (epoch === viewEpoch && copyJobs.get(key) === job) resetCopy(key);
      }, 2500);
      if (typeof job.timer === 'object') (/** @type {{ unref?: () => void }} */ (job.timer)).unref?.();
    }
    const announcement = announce(ok ? (isGuide ? '已复制完整清单，包含全部条目。' : isCode ? '已复制代码。' : '已复制消息。') : '当前环境无法复制，请重试或手动选择文本。');
    if (ok) job.announcement = announcement;
    if (!isCode) options.onCopy?.(message, ok);
  }

  /** @param {ConversationMessage} message @param {'markdown' | 'json'} format */
  function guideArtifact(message, format) {
    if (message.role !== 'assistant' || message.status !== 'complete' || !validateGuideInput(message.guide).ok || !validateGuideResult(message.structuredResult).ok) {
      announce('仅能导出已完成且有效的上线清单。');
      return null;
    }
    try { return createGuideArtifact(message.guide, message.structuredResult, format, { provenance: message.provenance }); }
    catch { announce('清单导出失败，请重试。'); return null; }
  }

  /** @param {ConversationMessage} message @param {'markdown' | 'json'} format */
  function downloadGuide(message, format) {
    const artifact = guideArtifact(message, format);
    if (!artifact) return;
    let started = false;
    try { started = artifactDownloader.download(artifact); } catch { /* Report a recoverable browser failure. */ }
    announce(started ? '已发起完整清单下载，请在浏览器下载列表中查看。' : '无法发起下载，请重试或复制完整清单。');
  }

  function render({ forceBottom = false } = {}) {
    const shouldFollow = forceBottom || (!readingDetails && (followLatest || isNearBottom()));
    if (forceBottom) readingDetails = false;
    const nodes = messages.slice(messageWindow.start, messageWindow.end).map(renderMessage);
    if (messageWindow.start > 0) nodes.unshift(earlierPage);
    if (messageWindow.end < messages.length) nodes.push(laterPage);
    list.replaceChildren(...nodes);
    if (shouldFollow) {
      scroll.scrollTop = messages.length ? scroll.scrollHeight : 0;
      followLatest = true;
      jumpButton.hidden = true;
    } else {
      jumpButton.hidden = !messages.length;
    }
    rememberViewport();
  }

  function settleScroll(forceBottom = false) {
    compensateViewportResize();
    if (forceBottom) readingDetails = false;
    if (forceBottom || (followLatest && !readingDetails)) {
      scroll.scrollTop = messages.length ? scroll.scrollHeight : 0;
      followLatest = true;
      jumpButton.hidden = true;
    } else {
      jumpButton.hidden = !messages.length;
    }
    rememberViewport();
  }

  function appendLatestMessage(forceBottom = false) {
    const message = messages.at(-1);
    if (!message) return;
    const mountedCount = messageWindow.end - messageWindow.start;
    if (messageWindow.end < messages.length - 1 || mountedCount > MESSAGES_PER_PAGE) {
      showMessagePage(latestMessageWindow());
      settleScroll(forceBottom);
      return findArticle(message.id);
    }
    if (mountedCount === MESSAGES_PER_PAGE) {
      const oldest = messageArticles()[0];
      savedMessageView = collectMessageViewState([oldest]);
      if (messageWindow.start === 0) list.insertBefore(earlierPage, oldest);
      if (oldest.contains(documentRef.activeElement)) input.focus({ preventScroll: true });
      oldest.remove();
      messageWindow.start++;
    }
    messageWindow.end = messages.length;
    const article = renderMessage(message);
    list.append(article);
    settleScroll(forceBottom);
    return article;
  }

  /** @param {MessageWindow} range */
  function showMessagePage(range) {
    const saved = getViewState();
    cancelStreamFrame();
    clearCopyFeedback();
    messageWindow = range;
    render();
    restoreMessageViewState(saved);
  }

  /** @param {string} messageId */
  function focusMessage(messageId) {
    if (destroyed) return false;
    const index = messages.findIndex(message => message.id === messageId);
    if (index < 0) return false;
    if (index < messageWindow.start || index >= messageWindow.end) {
      const start = Math.floor(index / MESSAGES_PER_PAGE) * MESSAGES_PER_PAGE;
      showMessagePage({ start, end: Math.min(messages.length, start + MESSAGES_PER_PAGE) });
    }
    const article = findArticle(messageId);
    if (!article) return false;
    const top = scroll.scrollTop + article.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16;
    readingDetails = false;
    readingAnchor = null;
    scroll.scrollTop = Math.max(0, top);
    followLatest = isNearBottom();
    jumpButton.hidden = followLatest;
    rememberViewport();
    article.tabIndex = -1;
    article.focus({ preventScroll: true });
    return true;
  }

  /** @param {boolean} earlier */
  function turnMessagePage(earlier) {
    const { start, end } = messageWindow;
    const range = earlier
      ? { start: Math.max(0, start - MESSAGES_PER_PAGE), end: start }
      : { start: end, end: Math.min(messages.length, end + MESSAGES_PER_PAGE) };
    if (range.start === range.end) return;
    showMessagePage(range);
    focusMessage(messages[earlier ? range.end - 1 : range.start].id);
  }

  function cancelStreamFrame() {
    if (streamFrame !== null) view?.cancelAnimationFrame?.(streamFrame);
    streamFrame = null;
    dirtyTextParts.clear();
  }

  /** @param {ConversationMessage} message */
  function drawStreamText(message) {
    if (!dirtyTextParts.size) return;
    const anchor = captureReadingAnchor();
    const article = findArticle(message.id);
    const parts = article?.querySelector('.msg__parts');
    if (parts) {
      for (const partIndex of dirtyTextParts) {
        const part = message.parts?.[partIndex];
        if (part?.type !== 'text') continue;
        let text = /** @type {HTMLDivElement | null} */ (parts.querySelector(`[data-part-index="${partIndex}"]`));
        if (!text) {
          text = documentRef.createElement('div');
          text.className = 'msg__text';
          text.dataset.partIndex = String(partIndex);
          text.dataset.messageId = message.id;
          text.dataset.role = message.role;
          parts.append(text);
        }
        updateMessageText(text, part.text);
      }
    }
    dirtyTextParts.clear();
    const copy = /** @type {HTMLButtonElement | null | undefined} */ (article?.querySelector('[data-action="copy"]'));
    if (copy) copy.disabled = !message.text;
    invalidateChangedCopies();
    restoreReadingAnchor(anchor);
    settleScroll();
  }

  /** @param {ConversationMessage} message */
  function patchMessage(message) {
    if (message.id === activeAssistantId && streamFrame !== null) {
      // Settle any reflow while the article can still anchor the viewport.
      settleViewportResize();
      cancelStreamFrame();
    }
    const article = findArticle(message.id);
    if (!article) return;
    const anchor = captureReadingAnchor();
    const activeElement = /** @type {HTMLElement | null} */ (documentRef.activeElement);
    const focused = activeElement && article.contains(activeElement) ? activeElement : null;
    const focusedControl = /** @type {HTMLButtonElement | null | undefined} */ (focused?.closest('[data-action]'));
    const focusedAction = focusedControl?.dataset.action;
    const focusedDisclosure = focused?.matches('summary')
      ? focused.parentElement?.dataset.component
      : null;
    const focusedLink = focused?.matches('a') ? focused.getAttribute('href') : null;
    const previousResult = /** @type {HTMLElement | null} */ (article.querySelector('.tool-result-json'));
    const focusedResult = focused === previousResult;
    const resultScroll = previousResult ? { top: previousResult.scrollTop, left: previousResult.scrollLeft } : null;
    const readers = /** @type {NodeListOf<HTMLElement>} */ (article.querySelectorAll('[data-reading-key]'));
    const readingPositions = Array.from(readers, node => ({ node, top: node.scrollTop, left: node.scrollLeft }));
    // Live process accordions are force-opened; never persist that as a reader choice.
    const expanded = new Map([.../** @type {NodeListOf<HTMLDetailsElement>} */ (article.querySelectorAll('details[data-component]'))]
      .filter(node => node.dataset.live !== 'true')
      .map(node => [node.dataset.component, node.open]));
    const replacement = renderMessage(message);
    const previousGuide = article.querySelector('[data-component="guide-result"]');
    const nextGuide = replacement.querySelector('[data-component="guide-result"]');
    if (message.status === 'complete' && previousGuide && nextGuide && guideCardResults.get(previousGuide) === message.structuredResult) nextGuide.replaceWith(previousGuide);
    // Keep the live text subtrees: code scroll, selection, and in-flight copy
    // controls belong to the content, not to a tool/status update around it.
    const textParts = /** @type {NodeListOf<HTMLDivElement>} */ (replacement.querySelectorAll('.msg__text'));
    for (const nextText of textParts) {
      const previousText = [.../** @type {NodeListOf<HTMLDivElement>} */ (article.querySelectorAll('.msg__text'))]
        .find(node => node.dataset.partIndex === nextText.dataset.partIndex);
      if (!previousText) continue;
      const part = message.parts?.[Number(nextText.dataset.partIndex)];
      updateMessageText(previousText, part?.type === 'text' ? part.text : message.text);
      nextText.replaceWith(previousText);
    }
    const disclosures = /** @type {NodeListOf<HTMLDetailsElement>} */ (replacement.querySelectorAll('details[data-component]'));
    for (const disclosure of disclosures) {
      const open = expanded.get(disclosure.dataset.component);
      if (open !== undefined) disclosure.open = open;
    }
    const details = /** @type {HTMLDetailsElement | null} */ (replacement.querySelector('.tool-details'));
    if (details && message.tool?.state === 'fail') details.open = true;
    const projects = /** @type {NodeListOf<HTMLDetailsElement>} */ (replacement.querySelectorAll('[data-component^="project-tool-"]'));
    for (const detail of projects) if (detail.dataset.toolState === 'fail') detail.open = true;
    article.replaceWith(replacement);
    const nextResult = /** @type {HTMLElement | null} */ (replacement.querySelector('.tool-result-json'));
    if (resultScroll && nextResult) {
      nextResult.scrollTop = resultScroll.top;
      nextResult.scrollLeft = resultScroll.left;
    }
    if (focused) {
      let nextFocus;
      if (replacement.contains(focused)) {
        nextFocus = focused;
      } else if (focusedAction) {
        nextFocus = [...actionControls(replacement)]
          .find(control => control.dataset.action === focusedAction && control.dataset.blockKey === focused.dataset.blockKey && control.dataset.artifactId === focused.dataset.artifactId && !control.disabled);
      } else if (focusedDisclosure) {
        nextFocus = [.../** @type {NodeListOf<HTMLElement>} */ (replacement.querySelectorAll('details[data-component] > summary'))]
          .find(summary => summary.parentElement?.dataset.component === focusedDisclosure);
      } else if (focusedLink) {
        nextFocus = [...replacement.querySelectorAll('a')]
          .find(link => link.getAttribute('href') === focusedLink);
      } else if (focusedResult) {
        nextFocus = nextResult;
      }
      // A removed approval action keeps keyboard position at the updated message.
      if (!nextFocus) {
        replacement.tabIndex = -1;
        nextFocus = replacement;
      }
      nextFocus.focus({ preventScroll: true });
    }
    // WebView2 clears the scroll offsets of retained code and table readers during reparenting.
    for (const { node, top, left } of readingPositions) {
      if (!replacement.contains(node)) continue;
      node.scrollTop = top;
      node.scrollLeft = left;
    }
    invalidateChangedCopies();
    restoreReadingAnchor(anchor);
    settleScroll();
  }

  /** @param {ConversationState} state */
  function updateHint(state) {
    if (!hint) return;
    const busy = isConversationActive(state), sendKey = options.getSendShortcut?.() === 'mod-enter' ? 'Ctrl / ⌘ + Enter' : 'Enter';
    hint.textContent = busy ? '可继续写草稿，回复完成后发送 · Shift + Enter 换行' : pendingEdit ? `${sendKey} 发送修改 · Esc 取消 · 原版本保留` : `${sendKey} 发送 · Shift + Enter 换行`;
    if (modelSelection) hint.textContent += ` · ${modelSelection.label} · 仅发送本会话真实文本，不发送引用文件`;
    if (busy && assistantMessage()?.guide) hint.textContent = '正在本机生成上线清单 · 不调用模型 · 草稿和模型选择保持不变';
    if (options.recordOnly) hint.textContent = pendingEdit ? `${sendKey} 保存修改 · Esc 取消 · 原版本保留` : `${sendKey} 保存记录 · Shift + Enter 换行 · 不调用模型`;
  }

  /** @param {ConversationState} state */
  function updateControls(state) {
    const busy = isConversationActive(state);
    if (options.requireModel) {
      const picker = /** @type {HTMLButtonElement | null | undefined} */ (composer?.querySelector('.agent-composer__model'));
      if (picker) picker.disabled = busy;
    }
    updateHint(state);
    const sendLabel = busy ? '停止生成' : options.recordOnly ? (pendingEdit ? '保存修改' : '保存记录') : pendingEdit ? '发送修改' : '发送消息';
    sendButton.dataset.mode = busy ? 'stop' : 'send';
    sendButton.setAttribute('aria-label', sendLabel);
    sendButton.title = sendLabel;
    sendButton.disabled = !busy && !input.value.trim();
    if (editBar) editBar.hidden = !pendingEdit;
    const controls = /** @type {NodeListOf<HTMLButtonElement>} */ (list.querySelectorAll('[data-action="regenerate"], [data-action="retry"], [data-action="edit"]'));
    controls.forEach(control => { control.disabled = busy; });
    composer?.setAttribute('data-chat-state', state);
    input.closest('.conversation-shell, .center')?.setAttribute('data-chat-state', state);
    status.setAttribute('aria-atomic', 'true');
    const announcement = getRunAnnouncement(state, assistantMessage());
    if (status.dataset.state !== state) announce(announcement, 'run');
    status.dataset.state = state;
  }

  function assistantMessage() {
    return messages.find((message) => message.id === activeAssistantId);
  }

  /** @param {import('./conversation-controller.js').ConversationEvent} event */
  function handleEvent(event) {
    if (destroyed) return;
    options.onEvent?.(event);
    if (destroyed) return;
    if (event.type === 'run-start') {
      lastPlan = event.result;
      activeAssistantId = nextMessageId('assistant');
      messages.push({ id: activeAssistantId, role: 'assistant', sourceUserId: activeSourceUserId, text: '', parts: [], status: event.state, tool: null,
        live: event.live,
        guide: event.guide,
        trace: { runId: event.runId ?? undefined, state: event.state, elapsedMs: event.elapsedMs, ...(event.guide ? { kind: 'guide' } : {}) } });
      emitMessages();
      appendLatestMessage(true);
    }
    const current = assistantMessage();
    if (current?.trace && current.trace.runId === event.runId) {
      current.trace = { runId: event.runId, state: event.state, elapsedMs: event.elapsedMs, ...(event.guide ? { kind: 'guide' } : {}) };
      if (current.tool) current.tool.state = event.toolState;
      const article = findArticle(current.id);
      const summary = article?.querySelector('.run-trace summary');
      if (summary) {
        const label = summary.querySelector?.('.run-trace__label');
        (label || summary).textContent = formatTraceLabel(current.trace);
        const trace = /** @type {HTMLDetailsElement} */ (summary.parentElement);
        trace.dataset.state = current.trace.state;
        trace.dataset.tone = getRunPresentation(current.trace.state).tone;
        // A settled run hands the accordion back to the reader, folded.
        const live = ['working', 'streaming'].includes(current.trace.state);
        if (trace.dataset.live === 'true' && !live) trace.open = false;
        trace.dataset.live = String(live);
      }
    }
    if (current?.parts && event.type === 'agent-tool') {
      const value = event.toolEvent;
      let part = current.parts.find(part => part.type === 'tool' && part.tool.toolCallId === value.toolCallId);
      if (!part && ['tool-input-start', 'tool-input-available', 'tool-input-error'].includes(value.type)) {
        part = { type: 'tool', tool: { name: AGENT_TOOL_NAME, kind: 'project', toolCallId: value.toolCallId, state: 'running', label: '正在准备项目只读工具' } };
        current.parts.push(part);
      }
      if (part?.type !== 'tool') return;
      if (value.type === 'tool-input-available' && validateAgentInput(value.input).ok) {
        part.tool.parameters = value.input;
        part.tool.label = { check: '检查当前项目', guide: '生成项目上线清单', explain: '查询项目规则' }[value.input.kind];
      }
      if (value.type === 'tool-output-available' && validateAgentResult(value.output).ok) {
        part.tool.state = 'success'; part.result = value.output;
      }
      if (value.type === 'tool-input-error' || value.type === 'tool-output-error') {
        part.tool.state = 'fail'; part.error = { code: 'project_tool_error', message: value.errorText, retryable: false };
      }
      if (value.type !== 'tool-input-delta') { emitMessages(); patchMessage(current); }
    }
    if (current?.parts && event.type === 'tool-start') {
      current.tool = { ...event.tool, state: event.toolState };
      current.parts.push({ type: 'tool', tool: current.tool });
      emitMessages();
      patchMessage(current);
      announce(event.guide ? '正在生成本机上线清单…' : '正在运行本地规则演示…');
    }
    if (current && event.type === 'tool-result') {
      current.structuredResult = event.structuredResult;
      const part = current.parts?.find(part => part.type === 'tool');
      if (part) part.result = event.structuredResult;
      emitMessages();
      patchMessage(current);
      announce(event.guide ? '本机上线清单已生成。' : '工具演示已完成，正在生成说明…');
    }
    if (event.type === 'chunk') {
      const message = assistantMessage();
      if (message?.parts) {
        message.text += event.chunk;
        let part = event.textId ? message.parts.find(part => part.type === 'text' && part.textId === event.textId) : message.parts.at(-1);
        if (!part || part.type !== 'text') {
          part = { type: 'text', text: '', ...(event.textId ? { textId: event.textId } : {}) };
          message.parts.push(part);
        }
        part.text += event.chunk;
        // Keep the message current for persistence, and paint each dirty part once per frame.
        dirtyTextParts.add(message.parts.indexOf(part));
        if (!view?.requestAnimationFrame || !isConversationActive(message.status ?? CONVERSATION_STATES.IDLE)) {
          drawStreamText(message);
        } else if (streamFrame === null) {
          const frame = view.requestAnimationFrame(() => {
            if (streamFrame !== frame) return;
            streamFrame = null;
            drawStreamText(message);
          });
          streamFrame = frame;
        }
      }
      emitMessages();
    }
    if (event.type === 'complete') {
      const message = assistantMessage();
      if (message) {
        for (const previous of messages) {
          if (previous !== message && previous.review?.state === 'pending') {
            previous.review = { ...previous.review, state: 'stale', summary: '已被新方案替代；不能继续审批。' };
            patchMessage(previous);
          }
        }
        message.status = 'complete';
        message.fact = event.result?.fact;
        message.advice = event.result?.advice;
        message.structuredResult = event.result?.structuredResult;
        message.review = event.result?.review ? { ...event.result.review, runId: event.runId ?? undefined } : null;
      }
      emitMessages();
      if (message) patchMessage(message);
    }
    if (event.type === 'stopped') {
      const message = assistantMessage();
      if (message) {
        message.status = 'stopped';
        for (const part of message.parts || []) if (part.type === 'tool' && part.tool.state === 'running') part.tool.state = 'canceled';
      }
      emitMessages();
      if (message) patchMessage(message);
    }
    if (event.type === 'error') {
      const message = assistantMessage();
      if (message) {
        message.status = 'error';
        message.error = event.error;
        for (const item of message.parts || []) if (item.type === 'tool' && item.tool.kind === 'project' && item.tool.state === 'running') { item.tool.state = 'fail'; item.error = event.error; }
        const part = message.parts?.find(part => part.type === 'tool');
        if (part && message.tool?.state === 'fail') part.error = event.error;
      }
      emitMessages();
      if (message) patchMessage(message);
    }
    if (event.type === 'state') {
      if (current) {
        current.status = event.state;
        if (event.error) current.error = event.error;
        const article = findArticle(current.id);
        if (article) updateMessageState(article, current);
      }
      updateControls(event.state);
    }
  }

  const controller = createConversationController({
    planFactory: options.planFactory || createDemoPlan,
    onEvent: handleEvent,
    eventTarget: options.eventTarget,
    schedule: options.schedule,
    cancelSchedule: options.cancelSchedule,
    transport: options.transport,
    guideTransport: options.guideTransport,
  });

  function autosize() {
    if (destroyed) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
    settleViewportResize();
  }

  function cancelEdit() {
    if (!pendingEdit) return;
    input.value = pendingEdit.originalDraft;
    if (pendingEdit.originalContext) options.setDraftContext?.(copyContext(pendingEdit.originalContext));
    pendingEdit = null;
    autosize();
    updateControls(controller.getSnapshot().state);
    announce('已取消编辑，恢复之前的草稿。');
    input.focus();
    options.onDraftChange?.();
  }

  /** @param {SubmitOptions} [submitOptions] @returns {SubmitResult} */
  function submit(submitOptions = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    const retry = Boolean(submitOptions.retry);
    const text = String(submitOptions.input ?? input.value).trim();
    if (!text) {
      updateControls(controller.getSnapshot().state);
      return { ok: false, reason: 'empty' };
    }
    if (controller.isBusy()) return { ok: false, reason: 'busy' };
    if (options.requireModel && !modelSelection && !retry) {
      announce('请先连接并选择模型。草稿已保留。', 'model-required');
      options.onModelRequired?.();
      return { ok: false, reason: 'model-required' };
    }
    if (options.recordOnly) {
      if (retry || submitOptions.live || submitOptions.guide || submitOptions.plan) return { ok: false, reason: 'record-only' };
      const fromComposer = submitOptions.input === undefined;
      const editing = fromComposer && pendingEdit;
      messages.push({ id: nextMessageId('user'), role: 'user', text, status: 'complete',
        record: { kind: 'note', label: '本地记录' },
        branchNote: `本地记录 · 未调用模型${editing ? ' · 修改后的版本；原记录保留' : ''}` });
      if (fromComposer) {
        input.value = pendingEdit?.originalDraft || '';
        if (pendingEdit?.originalContext) options.setDraftContext?.(copyContext(pendingEdit.originalContext));
        pendingEdit = null;
        autosize();
        options.onDraftChange?.();
      }
      emitMessages();
      appendLatestMessage(true);
      updateControls(CONVERSATION_STATES.IDLE);
      announce('已加入本地会话。');
      return { ok: true };
    }
    if (!submitOptions.plan && submitOptions.guide && !validateGuideInput(submitOptions.guide).ok) return { ok: false, reason: 'invalid-guide' };
    /** @type {DraftContext} */
    let requestContext = submitOptions.input === undefined ? copyContext(options.getDraftContext?.()) : { references: [], pendingScenario: 'normal' };
    /** @type {LiveRequest | null} */
    let live = null;
    /** @type {Readonly<GuideInput> | null} */
    let guide = !submitOptions.plan && submitOptions.guide ? Object.freeze({ ...submitOptions.guide }) : null;
    if (retry) {
      const sourceId = Object.hasOwn(submitOptions, 'sourceUserId') ? submitOptions.sourceUserId : activeSourceUserId;
      const source = messages.find(message => message.role === 'user' && message.id === sourceId);
      if (!source) return { ok: false, reason: 'missing-source' };
      if (options.requireModel && !source.live) return { ok: false, reason: 'model-required' };
      activeSourceUserId = source.id;
      requestContext = { references: [...(source.references || [])], pendingScenario: 'normal' };
      live = !submitOptions.plan ? source.live ?? null : null;
      const savedGuide = !submitOptions.plan ? source.guide : null;
      if (savedGuide && !isGuideInput(savedGuide)) return { ok: false, reason: 'invalid-guide' };
      guide = savedGuide ?? null;
      if (!guide) setModelSelection(live || null);
    } else {
      // Explicit page actions are independent of the unsent composer draft.
      const fromComposer = submitOptions.input === undefined;
      const currentEdit = fromComposer ? pendingEdit : null;
      const edited = currentEdit ? messages.find(message => message.id === currentEdit.messageId) : null;
      const previous = [...messages].reverse().find(message => !message.record);
      const selection = modelSelection;
      if (!submitOptions.plan && !guide && selection && (!requestContext.pendingScenario || requestContext.pendingScenario === 'normal')) {
        const history = edited ? (edited.live?.providerId === selection.providerId && edited.live?.model === selection.model ? edited.live.messages.slice(0, -1) : [])
          : previous?.role === 'assistant' && previous.status === 'complete' && previous.live?.providerId === selection.providerId && previous.live?.model === selection.model
            ? [...previous.live.messages, { role: 'assistant', content: previous.text }] : [];
        live = copyLive({ ...selection, messages: [...history, { role: 'user', content: text }] });
        requestContext = { references: [], pendingScenario: 'normal' };
      }
      const branchNote = submitOptions.branchNote || (fromComposer && pendingEdit ? '由较早消息编辑后生成；原版本已保留。' : undefined);
      activeSourceUserId = nextMessageId('user');
      messages.push({
        id: activeSourceUserId,
        role: 'user',
        text,
        status: 'complete',
        branchNote: guide ? '本机上线清单 · 不调用模型、不读取项目文件' : branchNote,
        live,
        guide,
        references: [...requestContext.references],
      });
      if (fromComposer) {
        input.value = pendingEdit?.originalDraft || '';
        options.setDraftContext?.(pendingEdit?.originalContext ? copyContext(pendingEdit.originalContext) : { ...requestContext, pendingScenario: 'normal' });
        pendingEdit = null;
        autosize();
        options.onDraftChange?.();
      }
      emitMessages();
      appendLatestMessage(true);
    }
    const result = controller.start({ input: text, plan: submitOptions.plan, live, guide, retry, context: requestContext });
    updateControls(controller.getSnapshot().state);
    input.focus();
    return result;
  }

  /**
   * @param {{ plan?: DemoPlanInput }} [retryOptions]
   * @returns {ReturnType<Controller['retry']> | { ok: false; reason: 'destroyed' }}
   */
  function retry(retryOptions = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    if (controller.isBusy()) return { ok: false, reason: 'busy' };
    const plan = retryOptions.plan || (!controller.getSnapshot().live && !controller.getSnapshot().guide && lastPlan ? normalizePlan({ ...lastPlan, failAt: null }) : undefined);
    if (!controller.getSnapshot().guide || plan) setModelSelection(plan ? null : controller.getSnapshot().live);
    const result = controller.retry({ plan });
    updateControls(controller.getSnapshot().state);
    input.focus();
    return result;
  }

  function onSend() {
    if (isConversationActive(controller.getSnapshot().state)) {
      controller.stop();
      input.focus();
    }
    else submit();
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.isComposing || event.keyCode === 229 || composing || event.defaultPrevented || input.getAttribute('aria-expanded') === 'true') return;
    if (event.key === 'Escape' && pendingEdit) {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.altKey) return;
    if (options.getSendShortcut?.() === 'mod-enter' && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (!isConversationActive(controller.getSnapshot().state)) submit();
    else {
      announce(input.value.trim() ? '草稿已保留，尚未发送；回复完成或停止后可发送。' : '正在生成回复；可继续写草稿，完成后发送。');
      if (hint) hint.textContent = input.value.trim() ? '草稿已保留，尚未发送；回复完成后可发送。' : '正在生成回复；可继续写草稿，完成后发送。';
    }
  }

  /** @param {MouseEvent} event */
  function onActions(event) {
    const target = /** @type {Element | null} */ (event.target);
    const control = /** @type {HTMLButtonElement | null | undefined} */ (target?.closest?.('[data-action]'));
    if (!control || control.disabled) return;
    if (control === earlierPage || control === laterPage) {
      turnMessagePage(control === earlierPage);
      return;
    }
    const message = messages.find((item) => item.id === control.dataset.messageId);
    if (!message) return;
    if (control.dataset.action === 'open-artifact') {
      const parts = message.parts || (message.tool ? [{ type: /** @type {const} */ ('tool'), tool: message.tool, result: message.structuredResult }] : []);
      const part = parts.find(item => item.type === 'tool' && item.tool.kind === 'project'
        && item.result && typeof item.result === 'object' && 'artifactId' in item.result && item.result.artifactId === control.dataset.artifactId);
      const result = part?.type === 'tool' ? part.result : undefined;
      if (isAgentResult(result)) {
        announce('正在查找并核验本机报告…');
        Promise.resolve().then(() => {
          if (!options.onOpenArtifact) throw new Error('Artifact host unavailable');
          return options.onOpenArtifact(result.artifactId, { runId: result.runId, kind: result.kind, projectRevision: result.projectRevision, contextRevision: result.contextRevision });
        }).catch(() => {
          if (!destroyed) announce('无法打开本机报告，请从项目历史中重试。');
        });
      }
    }
    if (['copy', 'copy-code', 'copy-guide'].includes(control.dataset.action ?? '')) void copyFromControl(control, message);
    if (control.dataset.action === 'download-guide-markdown') downloadGuide(message, 'markdown');
    if (control.dataset.action === 'download-guide-json') downloadGuide(message, 'json');
    if (control.dataset.action === 'edit') {
      if (message.role !== 'user' || message.guide || isConversationActive(controller.getSnapshot().state)) return;
      pendingEdit = { messageId: message.id, originalDraft: pendingEdit?.originalDraft ?? input.value,
        ...(options.getDraftContext ? { originalContext: copyContext(pendingEdit?.originalContext || options.getDraftContext()) } : {}) };
      options.setDraftContext?.({ references: [...(message.references || [])], pendingScenario: 'normal' });
      input.value = message.text;
      autosize();
      updateControls(controller.getSnapshot().state);
      input.focus();
      announce(editAnnouncement);
      options.onDraftChange?.();
      options.onEdit?.(message);
    }
    if (control.dataset.action === 'regenerate' || control.dataset.action === 'retry') {
      const user = sourceUserMessage(message);
      if (user) submit({ input: user.text, sourceUserId: user.id, retry: true, ...(user.live || user.guide ? {} : { plan: createDemoPlan(user.text, { recovery: true }) }) });
    }
    if (control.dataset.action === 'open-review') {
      const view = documentRef.defaultView;
      if (view?.CustomEvent) view.dispatchEvent(new view.CustomEvent('shipmate:open-review', { detail: { messageId: message.id, review: message.review } }));
    }
  }

  // Keep the detail being read in place as streamed text above it grows.
  /** @param {MouseEvent} event */
  function onDisclosureClick(event) {
    const target = /** @type {Element | null} */ (event.target);
    const summary = target?.closest?.('summary');
    const detail = /** @type {HTMLDetailsElement | null | undefined} */ (summary?.parentElement);
    const messageId = (/** @type {HTMLElement | null | undefined} */ (summary?.closest('[data-message-id]')))?.dataset.messageId;
    if (!summary || !detail || !list.contains(summary) || messageId === undefined) return;
    // While a run is live its process accordion stays open (no viewport jumps).
    if (detail.dataset.live === 'true') { event.preventDefault?.(); return; }
    readingDetails = !detail.open;
    readingAnchor = readingDetails ? {
      messageId,
      component: detail.dataset.component,
    } : null;
    followLatest = !readingDetails && isNearBottom();
    jumpButton.hidden = followLatest;
    rememberViewport();
  }
  /** @param {FocusEvent} event */
  function onReadingFocus(event) {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (target?.matches?.('[data-guide-search]')) { lockGuideReading(target); return; }
    if (!target?.matches?.('.tool-result-json, [data-reading-key]')) return;
    const messageId = (/** @type {HTMLElement | null} */ (target.closest('[data-message-id]')))?.dataset.messageId;
    if (messageId === undefined) return;
    readingDetails = true;
    readingAnchor = {
      messageId,
      component: (/** @type {HTMLDetailsElement | null} */ (target.closest('details')))?.dataset.component,
      readingKey: target.dataset.readingKey,
    };
    followLatest = false;
    jumpButton.hidden = false;
    rememberViewport();
  }
  /** @param {HTMLElement | null} target */
  function guideSearchCard(target) {
    if (!target?.matches?.('[data-guide-search]') || !list.contains(target)) return null;
    const card = /** @type {HTMLElement | null} */ (target.closest('[data-component="guide-result"]'));
    return card && card.dataset.messageId === target.dataset.messageId ? card : null;
  }
  /** @param {HTMLElement} target */
  function lockGuideReading(target) {
    if (!guideSearchCard(target) || target.dataset.messageId === undefined) return;
    readingDetails = true;
    readingAnchor = { messageId: target.dataset.messageId, component: 'guide-result' };
    followLatest = false;
    jumpButton.hidden = false;
    rememberViewport();
  }
  /** @param {{ target: EventTarget | null; isComposing?: boolean }} event */
  function onGuideSearch(event) {
    const target = /** @type {HTMLInputElement | null} */ (event.target);
    const card = guideSearchCard(target);
    if (!card || !target || event.isComposing || guideComposing.has(target)) return;
    lockGuideReading(target);
    const top = scroll.scrollTop;
    updateGuideFilter(card, target.value);
    scroll.scrollTop = top;
    rememberViewport();
  }
  /** @param {CompositionEvent} event */
  function onGuideCompositionStart(event) {
    const target = /** @type {HTMLInputElement | null} */ (event.target);
    if (target && guideSearchCard(target)) guideComposing.add(target);
  }
  /** @param {CompositionEvent} event */
  function onGuideCompositionEnd(event) {
    const target = /** @type {HTMLInputElement | null} */ (event.target);
    if (!target) return;
    guideComposing.delete(target);
    onGuideSearch({ target });
  }
  function onScroll() {
    if (settleViewportResize()) return;
    followLatest = !readingDetails && isNearBottom();
    jumpButton.hidden = !messages.length || followLatest;
    rememberViewport();
  }
  function onJump() {
    if (messageWindow.end < messages.length) {
      showMessagePage(latestMessageWindow());
      input.focus({ preventScroll: true });
    }
    readingDetails = false;
    followLatest = true;
    scroll.scrollTop = scroll.scrollHeight;
    jumpButton.hidden = true;
    rememberViewport();
  }

  /** @param {HTMLElement[]} articles */
  function collectMessageViewState(articles) {
    const mountedIds = new Set(articles.map(article => article.dataset.messageId));
    const regions = {
      guideResults: (savedMessageView?.guideResults || []).filter(item => !mountedIds.has(item.messageId)),
      readingPositions: (savedMessageView?.readingPositions || []).filter(item => !mountedIds.has(item.messageId)),
      disclosures: (savedMessageView?.disclosures || []).filter(item => !mountedIds.has(item.messageId)),
    };
    for (const article of articles) {
      const { messageId } = article.dataset;
      if (messageId === undefined) continue;
      for (const card of article.querySelectorAll('[data-component="guide-result"]')) {
        const state = getGuideViewState(card);
        if (state) regions.guideResults.push({ messageId, state });
      }
      const readers = /** @type {NodeListOf<HTMLElement>} */ (article.querySelectorAll('.tool-result-json, [data-reading-key]'));
      for (const node of readers) {
        regions.readingPositions.push({ messageId, key: node.dataset.readingKey || 'tool-result-json', top: node.scrollTop, left: node.scrollLeft });
      }
      const details = /** @type {NodeListOf<HTMLDetailsElement>} */ (article.querySelectorAll('details[data-component]'));
      for (const node of details) {
        const { component } = node.dataset;
        if (component !== undefined && node.dataset.live !== 'true') regions.disclosures.push({ messageId, component, open: Boolean(node.open) });
      }
    }
    return regions;
  }

  /** @returns {Required<Omit<ViewState, 'messageWindow'>> & Pick<ViewState, 'messageWindow'>} */
  function getViewState() {
    const partial = messageWindow.start > 0 || messageWindow.end < messages.length;
    return { scrollTop: scroll.scrollTop, followLatest, readingDetails, readingAnchor: readingAnchor ? { ...readingAnchor } : null,
      ...(partial ? { messageWindow: { ...messageWindow } } : {}), ...collectMessageViewState(messageArticles()) };
  }
  /** @param {ViewState | null} [saved] */
  function restoreMessageViewState(saved) {
    savedMessageView = saved;
    const byId = new Map(messageArticles().map(article => [article.dataset.messageId, article]));
    for (const item of saved?.guideResults || []) {
      const article = byId.get(item.messageId);
      const card = article?.querySelector('[data-component="guide-result"]');
      if (card) restoreGuideViewState(card, item.state);
    }
    // Filtering opens matching stages; restore the user's current folds after its baseline.
    for (const item of saved?.disclosures || []) {
      const article = byId.get(item.messageId);
      const details = /** @type {NodeListOf<HTMLDetailsElement> | undefined} */ (article?.querySelectorAll('details[data-component]'));
      const detail = [...(details || [])].find(node => node.dataset.component === item.component);
      if (detail && detail.dataset.live !== 'true') detail.open = item.open;
    }
    for (const item of saved?.readingPositions || []) {
      const article = byId.get(item.messageId);
      const readers = /** @type {NodeListOf<HTMLElement> | undefined} */ (article?.querySelectorAll('.tool-result-json, [data-reading-key]'));
      const region = [...(readers || [])].find(node => (node.dataset.readingKey || 'tool-result-json') === item.key);
      if (region) { region.scrollTop = item.top; region.scrollLeft = item.left; }
    }
  }

  /** @param {ViewState | null} [saved] */
  function restoreViewState(saved) {
    if (destroyed) return;
    restoreMessageViewState(saved);
    readingDetails = Boolean(saved?.readingDetails);
    readingAnchor = saved?.readingAnchor ? { ...saved.readingAnchor } : null;
    followLatest = saved ? Boolean(saved.followLatest) : options.initialScroll === 'bottom';
    scroll.scrollTop = !messages.length ? 0 : followLatest ? scroll.scrollHeight : Math.max(0, Number(saved?.scrollTop) || 0);
    if (!readingDetails && isNearBottom()) followLatest = true;
    jumpButton.hidden = !messages.length || followLatest;
    rememberViewport();
  }
  function onInput() { autosize(); updateControls(controller.getSnapshot().state); }
  function onCompositionStart() { composing = true; }
  function onCompositionEnd() { composing = false; }
  /** @type {Array<() => void>} */
  const unbind = [];
  /**
   * @template {keyof ConversationEvents} Type
   * @param {Element | null | undefined} node
   * @param {Type} type
   * @param {(event: ConversationEvents[Type]) => void} handler
   */
  function bind(node, type, handler) {
    if (!node) return;
    const listener = /** @type {EventListener} */ (handler);
    node.addEventListener(type, listener);
    unbind.push(() => node.removeEventListener(type, listener));
  }
  bind(composer, 'shipmate:model-select', onModelSelect);
  bind(composer, 'shipmate:guide-request', onGuideRequest);
  bind(sendButton, 'click', onSend);
  bind(cancelEditButton, 'click', cancelEdit);
  bind(input, 'keydown', onKeydown);
  bind(input, 'input', onInput);
  bind(input, 'compositionstart', onCompositionStart);
  bind(input, 'compositionend', onCompositionEnd);
  bind(list, 'click', onActions);
  bind(list, 'click', onDisclosureClick);
  bind(list, 'focusin', onReadingFocus);
  bind(list, 'input', onGuideSearch);
  bind(list, 'compositionstart', onGuideCompositionStart);
  bind(list, 'compositionend', onGuideCompositionEnd);
  bind(scroll, 'scroll', onScroll);
  bind(jumpButton, 'click', onJump);
  // Width changes rewrap text; ignore height notifications from autosize itself.
  /** @type {number | undefined} */
  let observedWidth;
  /** @type {number | null} */
  let resizeFrame = null;
  const ResizeObserver = view?.ResizeObserver;
  const resizeObserver = ResizeObserver ? new ResizeObserver(entries => {
    if (destroyed) return;
    const shell = /** @type {HTMLElement | null} */ (scroll.closest('.conversation-shell'));
    if (shell) {
      const offset = Math.ceil(shell.getBoundingClientRect().bottom - scroll.getBoundingClientRect().bottom + 14);
      shell.style.setProperty('--conversation-jump-offset', `${Math.max(14, offset)}px`);
    }
    const width = entries.find(entry => !entry.target || entry.target === input)?.contentRect.width;
    if (width !== undefined && Number.isFinite(width) && width > 0 && width !== observedWidth) {
      observedWidth = width;
      // Resizing an observed textarea during delivery can resize its parent
      // reader again. Coalesce that write into the next frame; direct typing
      // still autosizes synchronously in the input handler.
      if (!view?.requestAnimationFrame) autosize();
      else if (resizeFrame === null) resizeFrame = view.requestAnimationFrame(() => {
        resizeFrame = null;
        autosize();
      });
    }
    settleViewportResize();
  }) : null;
  resizeObserver?.observe(scroll);
  resizeObserver?.observe(input);

  render({ forceBottom: true });
  if (options.initialScroll !== 'bottom') {
    scroll.scrollTop = 0;
    followLatest = isNearBottom();
    jumpButton.hidden = !messages.length || followLatest;
  }
  autosize();
  rememberViewport();
  updateControls(CONVERSATION_STATES.IDLE);

  return {
    controller,
    /**
     * @param {{ text?: string; label?: string }} [record]
     * @returns {{ ok: true } | { ok: false; reason: 'destroyed' | 'not-record-mode' | 'busy' | 'empty' }}
     */
    appendRecord({ text, label } = {}) {
      if (destroyed) return { ok: false, reason: 'destroyed' };
      if (!options.recordOnly && !options.allowRecords) return { ok: false, reason: 'not-record-mode' };
      if (isConversationActive(controller.getSnapshot().state)) return { ok: false, reason: 'busy' };
      if (typeof text !== 'string' || !text.trim() || typeof label !== 'string' || !label.trim()) return { ok: false, reason: 'empty' };
      /** @type {ConversationMessage} */
      const message = { id: nextMessageId('assistant'), role: 'assistant', text, status: 'complete',
        branchNote: '本机执行报告 · 未调用模型；保存不会重新执行', record: { kind: 'report', label: label.trim() } };
      messages.push(message);
      emitMessages();
      const article = appendLatestMessage();
      readingDetails = false;
      readingAnchor = null;
      if (article) scroll.scrollTop += article.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      followLatest = isNearBottom();
      jumpButton.hidden = followLatest;
      rememberViewport();
      announce('报告已加入本地会话。');
      return { ok: true };
    },
    refreshPreferences() { if (!destroyed) updateHint(controller.getSnapshot().state); },
    setModelSelection,
    getModelSelection: () => modelSelection ? { ...modelSelection } : null,
    submit,
    runGuide,
    retry,
    /** @returns {ReturnType<Controller['stop']> | { ok: false; reason: 'destroyed' }} */
    stop: () => destroyed ? { ok: false, reason: 'destroyed' } : controller.stop(),
    /** @param {readonly ConversationMessage[]} nextMessages @param {ViewState | null} [saved] */
    replaceMessages(nextMessages, saved) {
      if (destroyed) return;
      viewEpoch++;
      cancelStreamFrame();
      clearCopyFeedback();
      artifactDownloader.dispose();
      if (isConversationActive(controller.getSnapshot().state)) controller.stop('session-switch');
      controller.dispose();
      messages = nextMessages.map((message) => ({ ...message }));
      messageWindow = initialMessageWindow(saved);
      activeAssistantId = null;
      activeSourceUserId = null;
      lastPlan = null;
      pendingEdit = null;
      announce('');
      render({ forceBottom: true });
      restoreViewState(saved);
      updateControls(CONVERSATION_STATES.IDLE);
      emitMessages();
    },
    getViewState,
    restoreViewState,
    focusMessage,
    getMessages: () => messages.map((message) => ({ ...message })),
    getDraftState: () => ({ draft: input.value, draftView: { selectionStart: input.selectionStart, selectionEnd: input.selectionEnd, selectionDirection: input.selectionDirection, scrollTop: input.scrollTop }, edit: pendingEdit ? { ...pendingEdit, ...(pendingEdit.originalContext ? { originalContext: copyContext(pendingEdit.originalContext) } : {}) } : null }),
    /**
     * @param {string} text
     * @param {DraftEdit | null} [edit]
     * @param {DraftView | null} [draftView]
     */
    setDraft(text, edit = null, draftView = null) {
      if (destroyed) return;
      pendingEdit = edit && typeof edit.originalDraft === 'string'
        && messages.some(message => message.role === 'user' && message.id === edit.messageId)
        ? { messageId: edit.messageId, originalDraft: edit.originalDraft, ...(edit.originalContext ? { originalContext: copyContext(edit.originalContext) } : {}) } : null;
      input.value = text || '';
      autosize();
      const length = input.value.length;
      const { selectionStart, selectionEnd, selectionDirection, scrollTop } = draftView ?? {};
      const start = selectionStart !== undefined && Number.isFinite(selectionStart) ? Math.max(0, Math.min(length, Math.trunc(selectionStart))) : length;
      const end = selectionEnd !== undefined && Number.isFinite(selectionEnd) ? Math.max(start, Math.min(length, Math.trunc(selectionEnd))) : length;
      const direction = selectionDirection === 'forward' || selectionDirection === 'backward' ? selectionDirection : 'none';
      input.setSelectionRange?.(start, end, direction);
      // Selection and autosizing can scroll the textarea; apply its saved viewport last.
      input.scrollTop = scrollTop !== undefined && Number.isFinite(scrollTop) ? Math.max(0, Math.min(scrollTop, input.scrollHeight - input.clientHeight)) : 0;
      updateControls(controller.getSnapshot().state);
      announce(pendingEdit ? editAnnouncement : getRunAnnouncement(controller.getSnapshot().state, assistantMessage()));
      options.onDraftChange?.();
    },
    /** @param {NonNullable<ConversationMessage['review']>['state']} state @param {Partial<NonNullable<ConversationMessage['review']>>} [detail] */
    updateReviewState(state, detail = {}) {
      if (destroyed) return false;
      const reversed = [...messages].reverse();
      const message = detail.runId
        ? reversed.find((item) => item.review?.runId === detail.runId)
        : reversed.find(item => item.review);
      if (!message?.review) return false;
      message.review = { ...message.review, ...detail, state, summary: getReviewPresentation(state).summary };
      emitMessages();
      patchMessage(message);
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      viewEpoch++;
      cancelStreamFrame();
      clearCopyFeedback();
      artifactDownloader.dispose();
      controller.dispose();
      resizeObserver?.disconnect();
      if (resizeFrame !== null) view?.cancelAnimationFrame?.(resizeFrame);
      for (const remove of unbind) remove();
    },
  };
}

if (typeof window !== 'undefined') {
  Object.assign(window, { shipmateConversation: {
    CONVERSATION_STATES,
    createConversationController,
    createDemoPlan,
    mountConversation,
  } });
}
