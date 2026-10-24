/* global CustomEvent, navigator, window */
// Shared lifecycle: deterministic demo by default, explicit model selection for text transport.
import { AGENT_TOOL_NAME, validateAgentInput, validateAgentResult } from './agent-contract.js';
import { createDemoResult, validateDemoResult } from './demo-result.js';
import { createMessage, updateMessageText, updateMessageState, updateGuideFilter, getGuideViewState, restoreGuideViewState } from './components/message.js';
import { getReviewPresentation, getRunAnnouncement, getRunPresentation, formatTraceLabel } from './components/presentation.js';
import { createIcon } from './components/icons.js';
import { GUIDE_TOOL_NAME, GUIDE_SUBJECTS, validateGuideInput, validateGuideResult } from './guide-contract.js';
import { createGuideArtifact } from './guide-artifact.js';
import { createArtifactDownloader } from './artifact-download.js';
import { SUPPORTED_CHAT_PROVIDERS } from './chat-transport.js';

export const CONVERSATION_STATES = Object.freeze({
  IDLE: 'idle',
  WORKING: 'working',
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  STOPPED: 'stopped',
  ERROR: 'error',
});

const ACTIVE_STATES = new Set([
  CONVERSATION_STATES.WORKING,
  CONVERSATION_STATES.STREAMING,
]);

let messageSequence = 0;
const fallbackMessagePrefix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function copyLive(request) {
  return request ? Object.freeze({ providerId: request.providerId, model: request.model, label: request.label,
    messages: Object.freeze(request.messages.map(({ role, content }) => Object.freeze({ role, content }))) }) : null;
}

function nextMessageId(role) {
  const id = globalThis.crypto?.randomUUID?.() || `${fallbackMessagePrefix}-${++messageSequence}`;
  return `${role}-${id}`;
}

function normalizePlan(plan = {}) {
  return {
    workingDelayMs: Math.max(0, Number(plan.workingDelayMs) || 0),
    chunkDelayMs: Math.max(0, Number(plan.chunkDelayMs) || 0),
    chunks: Array.isArray(plan.chunks) ? plan.chunks.map(String) : [],
    failAt: Number.isInteger(plan.failAt) ? plan.failAt : null,
    failure: plan.failure || null,
    tool: plan.tool || null,
    toolStartAt: Math.max(0, Number.isInteger(plan.toolStartAt) ? plan.toolStartAt : 0),
    toolDelayMs: Math.max(0, Number(plan.toolDelayMs) || 0),
    toolFailure: plan.toolFailure || null,
    fact: plan.fact || null,
    advice: plan.advice || null,
    review: plan.review || null,
    structuredResult: plan.structuredResult ?? null,
  };
}

export function createDemoPlan(input, options = {}) {
  const scenario = options.scenario || 'normal';
  const recovery = Boolean(options.recovery);
  const failure = scenario === 'timeout'
    ? { code: 'demo_timeout', message: '演示工具等待超时；没有文件被读取或修改。', retryable: true }
    : { code: 'demo_tool_failure', message: '演示工具返回失败；没有文件被读取或修改。', retryable: true };

  return normalizePlan({
    workingDelayMs: options.workingDelayMs ?? 420,
    chunkDelayMs: options.chunkDelayMs ?? 210,
    chunks: recovery
      ? [
          '已重新执行本次请求。',
          '本地演示没有持久化检查点，',
          '这次从固定示例重新开始。\n\n',
          '公开执行摘要已更新，',
          '没有读取真实项目文件，',
          '也没有连接模型服务。\n\n',
          '本次演示已经完成。',
          '请查看下方规则示例与 AI 建议，',
          '再决定是否批准本地演示改动。',
        ]
      : [
          '先检查隐私声明与代码调用是否一致，',
          '再确认接口用途说明是否清楚。\n\n',
          '### 示例发现\n\n这个固定示例中，**位置能力需要声明**。',
          '对应差异会放到右侧供你审阅。\n\n',
          '规则示例只说明检查方式，',
          '不能代替对真实项目的扫描结果。\n\n',
          '### 需要你确认\n\n1. 核对差异是否符合实际业务用途。\n',
          '2. 用途相符时，可以批准这项本地修改建议。\n',
          '3. 如果用途不符，应先调整说明或拒绝。\n\n',
          '备案、提审和发布属于官方后台动作，',
          '仍需由你本人核对并完成。\n\n',
          '**下一步：**查看规则示例、AI 建议和差异。',
        ],
    toolStartAt: recovery ? 3 : 2,
    toolDelayMs: options.toolDelayMs ?? 900,
    toolFailure: scenario === 'normal' ? null : failure,
    failure,
    tool: {
      name: 'demo_preflight',
      parameters: { subject: 'personal', source: 'fixed-example', readOnly: true },
      label: recovery ? '重新运行本地规则演示' : '运行本地规则演示',
      summary: [
        '使用固定示例输入，未连接模型服务',
        '未读取、写入或上传任何真实项目文件',
        `请求摘要：${String(input).trim().slice(0, 80)}`,
      ],
    },
    structuredResult: createDemoResult(),
    fact: {
      label: '规则示例 · 非项目核验',
      text: 'requiredPrivateInfos 应与代码实际调用的隐私接口保持一致。',
    },
    advice: {
      text: '先审阅差异与用途说明，再决定是否批准本地修改。',
    },
    review: {
      state: 'pending',
      kind: 'local-demo-change',
      files: ['app.json'],
      summary: '示例差异等待审批，尚未写入文件。',
    },
  });
}

export function createConversationController(options = {}) {
  const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
  const cancelSchedule = options.cancelSchedule || ((handle) => clearTimeout(handle));
  const planFactory = options.planFactory || createDemoPlan;
  const now = options.now || Date.now;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const eventTarget = options.eventTarget || (typeof window !== 'undefined' ? window : null);
  let state = CONVERSATION_STATES.IDLE;
  let runSequence = 0;
  let activeRun = null;
  let lastRun = null;
  let lastRequest = null;
  const timers = new Set();

  function snapshot(extra = {}) {
    const run = activeRun || lastRun;
    return {
      state,
      runId: run?.id ?? null,
      input: activeRun?.input ?? lastRequest?.input ?? '',
      output: run?.output ?? '',
      retry: Boolean(run?.retry),
      startedAt: run?.startedAt ?? null,
      elapsedMs: run ? Math.max(0, (run.endedAt ?? now()) - run.startedAt) : 0,
      toolState: run?.toolState ?? null,
      live: run?.live ?? null,
      guide: run?.guide ?? null,
      ...extra,
    };
  }

  function emit(type, extra = {}) {
    const event = snapshot({ type, ...extra });
    onEvent(event);
    if (eventTarget?.dispatchEvent && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent('shipmate:conversation', { detail: event }));
    }
    return event;
  }

  function setState(nextState, extra = {}) {
    const previousState = state;
    state = nextState;
    emit('state', { previousState, ...extra });
  }

  function clearTimers() {
    for (const handle of timers) cancelSchedule(handle);
    timers.clear();
  }

  function later(runId, callback, delay) {
    const handle = schedule(() => {
      timers.delete(handle);
      if (!activeRun || activeRun.id !== runId) return;
      callback();
    }, delay);
    timers.add(handle);
  }

  function finishError(run, failure) {
    if (!activeRun || activeRun.id !== run.id) return;
    clearTimers();
    run.endedAt = now();
    if (run.toolState === 'running') run.toolState = 'fail';
    const error = {
      code: failure?.code || 'demo_error',
      message: failure?.message || '本地演示运行失败。',
      retryable: failure?.retryable !== false,
    };
    setState(CONVERSATION_STATES.ERROR, { error });
    emit('error', { error });
    activeRun = null;
  }

  function streamNext(run, index) {
    if (!activeRun || activeRun.id !== run.id) return;
    if (run.plan.failAt === index) {
      finishError(run, run.plan.failure);
      return;
    }
    // This is a fixed local demo step, not a provider/tool transport protocol.
    // Keep its position and result explicit so the view never parses prose.
    if (run.plan.tool && run.toolState === null && index >= Math.min(run.plan.toolStartAt, run.plan.chunks.length)) {
      run.toolState = 'running';
      emit('tool-start', { tool: run.plan.tool });
      later(run.id, () => {
        if (run.plan.toolFailure) {
          finishError(run, run.plan.toolFailure);
          return;
        }
        const validation = validateDemoResult(run.plan.structuredResult);
        if (!validation.ok) {
          finishError(run, { code: 'invalid_demo_result', message: validation.error, retryable: true });
          return;
        }
        run.toolState = 'success';
        emit('tool-result', { tool: run.plan.tool, structuredResult: run.plan.structuredResult });
        streamNext(run, index);
      }, run.plan.toolDelayMs);
      return;
    }
    if (index >= run.plan.chunks.length) {
      if (run.plan.tool || run.plan.structuredResult !== null) {
        const validation = validateDemoResult(run.plan.structuredResult);
        if (!validation.ok) {
          finishError(run, { code: 'invalid_demo_result', message: validation.error, retryable: true });
          return;
        }
      }
      run.endedAt = now();
      setState(CONVERSATION_STATES.COMPLETE, { result: run.plan });
      emit('complete', { result: run.plan });
      activeRun = null;
      return;
    }
    const chunk = run.plan.chunks[index];
    run.output += chunk;
    emit('chunk', { chunk, chunkIndex: index });
    later(run.id, () => streamNext(run, index + 1), run.plan.chunkDelayMs);
  }

  function start(request = {}) {
    const input = String(request.input ?? '').trim();
    if (!input) return { ok: false, reason: 'empty' };
    if (ACTIVE_STATES.has(state)) return { ok: false, reason: 'busy' };
    if (!request.plan && request.guide && request.live) return { ok: false, reason: 'ambiguous-source' };
    if (!request.plan && request.guide && !validateGuideInput(request.guide).ok) return { ok: false, reason: 'invalid-guide' };

    clearTimers();
    const retry = Boolean(request.retry);
    const live = !request.plan && request.live ? copyLive(request.live) : null;
    const guide = !request.plan && request.guide ? Object.freeze({ ...request.guide }) : null;
    let plan;
    let planError;
    try {
      plan = live || guide ? {} : normalizePlan(request.plan || planFactory(input, request));
    } catch (cause) {
      planError = { code: 'plan_error', message: cause?.message || '无法创建演示计划。', retryable: true };
      plan = normalizePlan();
    }

    const run = {
      id: ++runSequence,
      input,
      output: '',
      retry,
      plan,
      startedAt: now(),
      endedAt: null,
      toolState: null,
      live,
      guide,
      abort: live || guide ? new AbortController() : null,
    };
    activeRun = run;
    lastRun = run;
    lastRequest = { input, plan: live || guide || planError ? undefined : plan, live, guide };
    const previousState = state;
    state = CONVERSATION_STATES.WORKING;
    emit('run-start', { previousState, result: planError ? null : plan });
    emit('state', { previousState, phase: 'run-start', result: planError ? null : plan });
    if (planError) {
      finishError(run, planError);
      return { ok: false, reason: 'plan-error', error: planError, runId: run.id };
    }
    if (guide) {
      const transport = options.guideTransport || (args => import('./guide-transport.js').then(module => module.streamGuide(args)));
      let tool;
      Promise.resolve().then(() => {
        if (activeRun !== run) return;
        return transport({ input: guide, signal: run.abort.signal, onToolStart({ toolCallId }) {
          if (activeRun !== run || run.abort.signal.aborted || tool) return;
          tool = { name: GUIDE_TOOL_NAME, kind: 'guide', toolCallId, parameters: guide, label: '生成本机上线清单' };
          run.toolState = 'running';
          emit('tool-start', { tool });
        } });
      }).then(result => {
        if (activeRun !== run) return;
        if (!tool || !validateGuideResult(result).ok) throw new Error('上线清单结果无效，请重试。');
        run.toolState = 'success';
        emit('tool-result', { tool, structuredResult: result });
        const chunk = `已根据本机收录规则生成${GUIDE_SUBJECTS[guide.subject]}上线清单。请核对适用项和条件自查项；这不表示项目已通过审核。`;
        run.output = chunk;
        emit('chunk', { chunk });
        run.endedAt = now();
        setState(CONVERSATION_STATES.COMPLETE, { result: { structuredResult: result } });
        emit('complete', { result: { structuredResult: result } });
        activeRun = null;
      }).catch(error => {
        if (activeRun !== run) return;
        finishError(run, { code: 'guide_error', message: error?.message || '上线清单生成失败，请重试。', retryable: true });
      });
      return { ok: true, runId: run.id };
    }
    if (live) {
      const transport = options.transport || (args => import('./chat-transport.js').then(module => module.streamChat(args)));
      Promise.resolve().then(() => {
        if (activeRun !== run) return;
        return transport({ ...live, signal: run.abort.signal, onToolEvent(event) {
          if (activeRun !== run || run.abort.signal.aborted) return;
          emit('agent-tool', { toolEvent: event });
        }, onDelta(chunk, metadata) {
          if (activeRun !== run || run.abort.signal.aborted) return;
          if (state !== CONVERSATION_STATES.STREAMING) setState(CONVERSATION_STATES.STREAMING);
          run.output += chunk;
          emit('chunk', { chunk, textId: metadata?.textId });
        } });
      }).then(() => {
        if (activeRun !== run) return;
        run.endedAt = now();
        setState(CONVERSATION_STATES.COMPLETE, { result: {} });
        emit('complete', { result: {} });
        activeRun = null;
      }).catch(error => {
        if (activeRun !== run) return;
        finishError(run, { code: 'model_error', message: error?.message || '模型连接失败，请重试。', retryable: true });
      });
      return { ok: true, runId: run.id };
    }
    later(run.id, () => {
      setState(CONVERSATION_STATES.STREAMING, { result: plan });
      streamNext(run, 0);
    }, plan.workingDelayMs);
    return { ok: true, runId: run.id };
  }

  function retry(overrides = {}) {
    if (!lastRequest) return { ok: false, reason: 'no-request' };
    return start({
      input: lastRequest.input,
      live: lastRequest.live,
      guide: lastRequest.guide,
      plan: overrides.plan || lastRequest.plan,
      retry: true,
    });
  }

  function stop(reason = 'user') {
    if (!activeRun || !ACTIVE_STATES.has(state)) return { ok: false, reason: 'not-running' };
    const stoppedRun = activeRun;
    stoppedRun.abort?.abort();
    stoppedRun.endedAt = now();
    if (stoppedRun.toolState === 'running') stoppedRun.toolState = 'canceled';
    clearTimers();
    setState(CONVERSATION_STATES.STOPPED, { reason });
    emit('stopped', { reason, output: stoppedRun.output });
    activeRun = null;
    return { ok: true, runId: stoppedRun.id, output: stoppedRun.output };
  }

  function dispose() {
    activeRun?.abort?.abort();
    clearTimers();
    activeRun = null;
    lastRequest = null;
    lastRun = null;
    state = CONVERSATION_STATES.IDLE;
  }

  return { start, retry, stop, getSnapshot: () => snapshot(), dispose };
}

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

export function mountConversation(options) {
  const { input, sendButton, scroll, list, status, jumpButton } = options;
  if (!input || !sendButton || !scroll || !list || !status || !jumpButton) {
    throw new Error('mountConversation requires input, sendButton, scroll, list, status, and jumpButton.');
  }
  const documentRef = list.ownerDocument;
  const jumpLabel = documentRef.createElement('span');
  jumpLabel.textContent = '回到最新';
  jumpButton.replaceChildren(jumpLabel, createIcon(documentRef, 'arrow-down'));
  jumpButton.setAttribute('aria-label', '回到最新消息');
  jumpButton.title = '回到最新消息';
  let messages = (options.initialMessages || []).map((message) => ({ ...message }));
  let composing = false;
  let followLatest = true;
  let readingDetails = false;
  let readingAnchor = null;
  let activeAssistantId = null;
  let activeSourceUserId = null;
  let lastPlan = null;
  let pendingEdit = null;
  let viewEpoch = 0;
  let destroyed = false;
  let modelSelection = null;
  const composer = input.closest('.composer');
  if (composer) composer.dataset.liveChat = 'true';
  let viewport = null;
  let announcementVersion = 0;
  const copyStates = new Map();
  const copyJobs = new Map();
  const copyDefaults = new WeakMap();
  const feedbackClock = documentRef.defaultView || globalThis;

  function resetCopy(key) {
    const job = copyJobs.get(key);
    if (job?.timer !== undefined) feedbackClock.clearTimeout(job.timer);
    if (job?.announcement === announcementVersion) announce('');
    copyJobs.delete(key);
    copyStates.delete(key);
    for (const control of list.querySelectorAll('[data-action]')) {
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
    for (const control of list.querySelectorAll('[data-action]')) {
      const key = copyKey(control);
      const job = copyJobs.get(key);
      if (!job || job.guide || copyStates.get(key) === 'error') continue;
      const source = control.dataset.action === 'copy-code'
        ? control.closest('.markdown-code')?.querySelector('code')?.textContent
        : messages.find(message => message.id === control.dataset.messageId)?.text;
      if (source !== job.source) resetCopy(key);
    }
  }
  const guideCardResults = new WeakMap();
  const guideComposing = new WeakSet();
  const artifactDownloader = options.artifactDownloader || createArtifactDownloader({ documentRef });
  const hint = input.closest('.composer')?.querySelector('.agent-composer__hint');
  const editBar = input.closest('.composer')?.querySelector('.agent-composer__edit');
  const copyContext = context => ({ ...context, references: [...(context?.references || [])] });
  const cancelEditButton = editBar?.querySelector('.agent-composer__cancel-edit');
  const editAnnouncement = '正在编辑较早消息；发送后会保留原版本。';

  function announce(text, kind = 'action') {
    status.textContent = text;
    status.dataset.announcement = kind;
    return ++announcementVersion;
  }

  function setModelSelection(selection) {
    if (destroyed || ACTIVE_STATES.has(controller.getSnapshot().state)) {
      announce('请先停止当前回复，再切换模型。');
      return false;
    }
    if (selection && (!Object.hasOwn(SUPPORTED_CHAT_PROVIDERS, selection.providerId) || typeof selection.model !== 'string' || !selection.model.trim())) return false;
    modelSelection = selection ? { providerId: selection.providerId, model: selection.model, label: String(selection.label || selection.model) } : null;
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

  function onModelSelect(event) { setModelSelection(event.detail?.selection || null); }
  function runGuide(guide) {
    if (!validateGuideInput(guide).ok) return { ok: false, reason: 'invalid-guide' };
    return submit({ input: `生成${GUIDE_SUBJECTS[guide.subject]}上线清单（敏感信息：${guide.sensitive ? '是' : '否'}；服务器域名：${guide.domain ? '是' : '否'}）`, guide });
  }
  function onGuideRequest(event) {
    if (!event.detail || event.detail.accepted) return;
    const result = runGuide(event.detail.input);
    event.detail.accepted = result.ok;
    if (!result.ok) announce(result.reason === 'busy' ? '请先停止当前回复，再生成上线清单。' : '清单参数无效，请检查后重试。');
  }

  function isNearBottom() {
    return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 88;
  }

  function rememberViewport() {
    let anchor;
    if (!followLatest || readingDetails) {
      const top = scroll.getBoundingClientRect().top;
      anchor = [...list.children].find(node => node.getBoundingClientRect().bottom > top);
    }
    viewport = { width: scroll.clientWidth, height: scroll.clientHeight, top: scroll.scrollTop,
      anchor, anchorTop: anchor?.getBoundingClientRect().top };
  }

  function viewportResized() {
    return viewport && (viewport.width !== scroll.clientWidth || viewport.height !== scroll.clientHeight);
  }

  function compensateViewportResize() {
    if (!viewportResized()) return;
    // A real upward scroll can arrive before the resize notification. Only a
    // browser clamp to the new scroll range is considered a layout movement.
    const clampedTop = Math.min(viewport.top, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    const movedUp = scroll.scrollTop < clampedTop - 1;
    if (movedUp) followLatest = false;
    if (!movedUp && !followLatest && viewport.width !== scroll.clientWidth && viewport.anchor?.parentElement === list) {
      scroll.scrollTop += viewport.anchor.getBoundingClientRect().top - viewport.anchorTop;
    }
  }

  function settleViewportResize() {
    if (!viewportResized()) return false;
    settleScroll();
    return true;
  }

  function captureReadingAnchor() {
    if (!readingDetails || !readingAnchor) return null;
    const article = [...list.children].find(node => node.dataset.messageId === readingAnchor.messageId);
    const detail = readingAnchor.readingKey
      ? [...(article?.querySelectorAll('[data-reading-key]') || [])].find(node => node.dataset.readingKey === readingAnchor.readingKey)
      : [...(article?.querySelectorAll('[data-component]') || [])].find(node => node.dataset.component === readingAnchor.component);
    return detail ? { detail, top: detail.getBoundingClientRect().top } : null;
  }

  function restoreReadingAnchor(previous) {
    if (!previous) return;
    const current = captureReadingAnchor();
    if (current) scroll.scrollTop += current.top - previous.top;
  }

  function emitMessages() {
    options.onMessagesChange?.(messages.map((message) => ({ ...message })));
  }

  function sourceUserMessage(message) {
    // Legacy records have no source ID. Explicit IDs must never fall back to a different question.
    if (Object.hasOwn(message, 'sourceUserId')) {
      return messages.find(item => item.role === 'user' && item.id === message.sourceUserId);
    }
    return messages.slice(0, messages.indexOf(message)).reverse().find(item => item.role === 'user');
  }

  function renderMessage(message) {
    const article = createMessage(documentRef, message, {
      canRegenerate: !options.recordOnly && Boolean(sourceUserMessage(message)),
    });
    const guideCard = article.querySelector('[data-component="guide-result"]');
    if (guideCard) guideCardResults.set(guideCard, message.structuredResult);
    for (const control of article.querySelectorAll('[data-action]')) {
      if (message.role === 'assistant' && message.guide && ['copy', 'copy-guide'].includes(control.dataset.action)) control.dataset.copyGuide = 'true';
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

  function copyKey(control) {
    return JSON.stringify([control.dataset.messageId, control.dataset.action, control.dataset.blockKey || '']);
  }

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

  async function copyFromControl(control, message) {
    const key = copyKey(control);
    if (copyStates.get(key) === 'pending') return;
    const isCode = control.dataset.action === 'copy-code';
    const isGuide = control.dataset.action === 'copy-guide' || (!isCode && message.role === 'assistant' && Boolean(message.guide));
    const artifact = isGuide ? guideArtifact(message, 'markdown') : null;
    if (isGuide && !artifact) return;
    if (isGuide) control.dataset.copyGuide = 'true';
    const source = isGuide ? artifact.text : isCode ? control.closest('.markdown-code')?.querySelector('code')?.textContent : message.text;
    if (typeof source !== 'string') return;
    const epoch = viewEpoch;
    resetCopy(key);
    const job = { source, guide: isGuide };
    copyJobs.set(key, job);
    copyStates.set(key, 'pending');
    showCopyState(control, 'pending');
    const ok = await copyText(source);
    if (epoch !== viewEpoch || copyJobs.get(key) !== job) return;
    invalidateChangedCopies();
    if (copyJobs.get(key) !== job) return;
    const state = ok ? 'success' : 'error';
    copyStates.set(key, state);
    const currentControl = [...list.querySelectorAll('[data-action]')].find(item => copyKey(item) === key);
    if (currentControl) showCopyState(currentControl, state);
    if (ok) {
      job.timer = feedbackClock.setTimeout(() => {
        if (epoch === viewEpoch && copyJobs.get(key) === job) resetCopy(key);
      }, 2500);
      job.timer?.unref?.();
    }
    const announcement = announce(ok ? (isGuide ? '已复制完整清单，包含全部条目。' : isCode ? '已复制代码。' : '已复制消息。') : '当前环境无法复制，请重试或手动选择文本。');
    if (ok) job.announcement = announcement;
    if (!isCode) options.onCopy?.(message, ok);
  }

  function guideArtifact(message, format) {
    if (message.role !== 'assistant' || message.status !== 'complete' || !validateGuideInput(message.guide).ok || !validateGuideResult(message.structuredResult).ok) {
      announce('仅能导出已完成且有效的上线清单。');
      return null;
    }
    try { return createGuideArtifact(message.guide, message.structuredResult, format); }
    catch { announce('清单导出失败，请重试。'); return null; }
  }

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
    list.replaceChildren(...messages.map(renderMessage));
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
    if (message) list.append(renderMessage(message));
    settleScroll(forceBottom);
  }

  function patchMessage(message) {
    const article = [...list.children].find((node) => node.dataset.messageId === message.id);
    if (!article) return;
    const anchor = captureReadingAnchor();
    const focused = documentRef.activeElement;
    const hadFocus = article.contains(focused);
    const focusedAction = hadFocus ? focused.closest('[data-action]')?.dataset.action : null;
    const focusedDisclosure = hadFocus && focused.matches('summary')
      ? focused.parentElement.dataset.component
      : null;
    const focusedLink = hadFocus && focused.matches('a') ? focused.getAttribute('href') : null;
    const previousResult = article.querySelector('.tool-result-json');
    const focusedResult = hadFocus && focused === previousResult;
    const resultScroll = previousResult ? { top: previousResult.scrollTop, left: previousResult.scrollLeft } : null;
    const expanded = new Map([...article.querySelectorAll('details[data-component]')]
      .map(node => [node.dataset.component, node.open]));
    const replacement = renderMessage(message);
    const previousGuide = article.querySelector('[data-component="guide-result"]');
    const nextGuide = replacement.querySelector('[data-component="guide-result"]');
    if (message.status === 'complete' && previousGuide && nextGuide && guideCardResults.get(previousGuide) === message.structuredResult) nextGuide.replaceWith(previousGuide);
    // Keep the live text subtrees: code scroll, selection, and in-flight copy
    // controls belong to the content, not to a tool/status update around it.
    for (const nextText of replacement.querySelectorAll('.msg__text')) {
      const previousText = [...article.querySelectorAll('.msg__text')]
        .find(node => node.dataset.partIndex === nextText.dataset.partIndex);
      if (!previousText) continue;
      const part = message.parts?.[Number(nextText.dataset.partIndex)];
      updateMessageText(previousText, part ? part.text : message.text);
      nextText.replaceWith(previousText);
    }
    for (const disclosure of replacement.querySelectorAll('details[data-component]')) {
      if (expanded.has(disclosure.dataset.component)) disclosure.open = expanded.get(disclosure.dataset.component);
    }
    const details = replacement.querySelector('.tool-details');
    if (details && message.tool?.state === 'fail') details.open = true;
    for (const detail of replacement.querySelectorAll('[data-component^="project-tool-"]')) if (detail.dataset.toolState === 'fail') detail.open = true;
    article.replaceWith(replacement);
    const nextResult = replacement.querySelector('.tool-result-json');
    if (resultScroll && nextResult) {
      nextResult.scrollTop = resultScroll.top;
      nextResult.scrollLeft = resultScroll.left;
    }
    if (hadFocus) {
      let nextFocus;
      if (replacement.contains(focused)) {
        nextFocus = focused;
      } else if (focusedAction) {
        nextFocus = [...replacement.querySelectorAll('[data-action]')]
          .find(control => control.dataset.action === focusedAction && control.dataset.blockKey === focused.dataset.blockKey && control.dataset.artifactId === focused.dataset.artifactId && !control.disabled);
      } else if (focusedDisclosure) {
        nextFocus = [...replacement.querySelectorAll('details[data-component] > summary')]
          .find(summary => summary.parentElement.dataset.component === focusedDisclosure);
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
    invalidateChangedCopies();
    restoreReadingAnchor(anchor);
    settleScroll();
  }

  function updateControls(state) {
    const busy = ACTIVE_STATES.has(state);
    if (options.requireModel) { const picker = composer?.querySelector('.agent-composer__model'); if (picker) picker.disabled = busy; }
    if (hint) hint.textContent = busy ? '可继续写草稿，回复完成后发送 · Shift + Enter 换行' : pendingEdit ? 'Enter 发送修改 · Esc 取消 · 原版本保留' : 'Enter 发送 · Shift + Enter 换行';
    if (hint && modelSelection) hint.textContent += ` · ${modelSelection.label} · 仅发送本会话真实文本，不发送引用文件`;
    if (hint && busy && assistantMessage()?.guide) hint.textContent = '正在本机生成上线清单 · 不调用模型 · 草稿和模型选择保持不变';
    if (hint && options.recordOnly) hint.textContent = pendingEdit ? 'Enter 保存修改 · Esc 取消 · 原版本保留' : 'Enter 保存记录 · Shift + Enter 换行 · 不调用模型';
    const sendLabel = busy ? '停止生成' : options.recordOnly ? (pendingEdit ? '保存修改' : '保存记录') : pendingEdit ? '发送修改' : '发送消息';
    sendButton.dataset.mode = busy ? 'stop' : 'send';
    sendButton.setAttribute('aria-label', sendLabel);
    sendButton.title = sendLabel;
    sendButton.disabled = !busy && !input.value.trim();
    if (editBar) editBar.hidden = !pendingEdit;
    list.querySelectorAll('[data-action="regenerate"], [data-action="retry"], [data-action="edit"]').forEach(control => { control.disabled = busy; });
    input.closest('.composer')?.setAttribute('data-chat-state', state);
    input.closest('.conversation-shell, .center')?.setAttribute('data-chat-state', state);
    status.setAttribute('aria-atomic', 'true');
    const announcement = getRunAnnouncement(state, assistantMessage());
    if (status.dataset.state !== state) announce(announcement, 'run');
    status.dataset.state = state;
  }

  function assistantMessage() {
    return messages.find((message) => message.id === activeAssistantId);
  }

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
        trace: { runId: event.runId, state: event.state, elapsedMs: event.elapsedMs, ...(event.guide ? { kind: 'guide' } : {}) } });
      emitMessages();
      appendLatestMessage(true);
    }
    const current = assistantMessage();
    if (current?.trace && current.trace.runId === event.runId) {
      current.trace = { runId: event.runId, state: event.state, elapsedMs: event.elapsedMs, ...(event.guide ? { kind: 'guide' } : {}) };
      if (current.tool) current.tool.state = event.toolState;
      const article = [...list.children].find(node => node.dataset.messageId === current.id);
      const summary = article?.querySelector('.run-trace summary');
      if (summary) {
        summary.textContent = formatTraceLabel(current.trace);
        summary.parentElement.dataset.state = current.trace.state;
        summary.parentElement.dataset.tone = getRunPresentation(current.trace.state).tone;
      }
    }
    if (current && event.type === 'agent-tool') {
      const value = event.toolEvent;
      let part = current.parts.find(part => part.type === 'tool' && part.tool.toolCallId === value.toolCallId);
      if (!part && ['tool-input-start', 'tool-input-available', 'tool-input-error'].includes(value.type)) {
        part = { type: 'tool', tool: { name: AGENT_TOOL_NAME, kind: 'project', toolCallId: value.toolCallId, state: 'running', label: '正在准备项目只读工具' } };
        current.parts.push(part);
      }
      if (!part) return;
      if (value.type === 'tool-input-available' && validateAgentInput(value.input).ok) {
        part.tool.parameters = value.input;
        part.tool.label = { check: '检查当前项目', guide: '生成项目上线清单', explain: '查询项目规则' }[value.input.kind];
      }
      if (value.type === 'tool-output-available' && validateAgentResult(value.output).ok) {
        part.tool.state = 'success'; part.result = value.output;
      }
      if (['tool-input-error', 'tool-output-error'].includes(value.type)) {
        part.tool.state = 'fail'; part.error = { code: 'project_tool_error', message: value.errorText, retryable: false };
      }
      if (value.type !== 'tool-input-delta') { emitMessages(); patchMessage(current); }
    }
    if (current && event.type === 'tool-start') {
      current.tool = { ...event.tool, state: event.toolState };
      current.parts.push({ type: 'tool', tool: current.tool });
      emitMessages();
      patchMessage(current);
      announce(event.guide ? '正在生成本机上线清单…' : '正在运行本地规则演示…');
    }
    if (current && event.type === 'tool-result') {
      current.structuredResult = event.structuredResult;
      const part = current.parts.find(part => part.type === 'tool');
      if (part) part.result = event.structuredResult;
      emitMessages();
      patchMessage(current);
      announce(event.guide ? '本机上线清单已生成。' : '工具演示已完成，正在生成说明…');
    }
    if (event.type === 'chunk') {
      const anchor = captureReadingAnchor();
      const message = assistantMessage();
      if (message) {
        message.text += event.chunk;
        const article = [...list.children].find((node) => node.dataset.messageId === message.id);
        let part = event.textId ? message.parts.find(part => part.type === 'text' && part.textId === event.textId) : message.parts.at(-1);
        if (!part || part.type !== 'text') {
          part = { type: 'text', text: '', ...(event.textId ? { textId: event.textId } : {}) };
          message.parts.push(part);
        }
        part.text += event.chunk;
        const partIndex = message.parts.indexOf(part);
        const parts = article?.querySelector('.msg__parts');
        let text = parts?.querySelector(`[data-part-index="${partIndex}"]`);
        if (!text && parts) {
          text = documentRef.createElement('div');
          text.className = 'msg__text';
          text.dataset.partIndex = String(partIndex);
          text.dataset.messageId = message.id;
          text.dataset.role = message.role;
          parts.append(text);
        }
        if (text) updateMessageText(text, part.text);
        const copy = article?.querySelector('[data-action="copy"]');
        if (copy) copy.disabled = !message.text;
      }
      emitMessages();
      invalidateChangedCopies();
      restoreReadingAnchor(anchor);
      settleScroll();
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
        message.review = event.result?.review ? { ...event.result.review, runId: event.runId } : null;
      }
      emitMessages();
      if (message) patchMessage(message);
    }
    if (event.type === 'stopped') {
      const message = assistantMessage();
      if (message) {
        message.status = 'stopped';
        for (const part of message.parts || []) if (part.tool?.state === 'running') part.tool.state = 'canceled';
      }
      emitMessages();
      if (message) patchMessage(message);
    }
    if (event.type === 'error') {
      const message = assistantMessage();
      if (message) {
        message.status = 'error';
        message.error = event.error;
        for (const item of message.parts || []) if (item.tool?.kind === 'project' && item.tool.state === 'running') { item.tool.state = 'fail'; item.error = event.error; }
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
        const article = [...list.children].find(node => node.dataset.messageId === current.id);
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

  function submit(submitOptions = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    const retry = Boolean(submitOptions.retry);
    const text = String(submitOptions.input ?? input.value).trim();
    if (!text) {
      updateControls(controller.getSnapshot().state);
      return { ok: false, reason: 'empty' };
    }
    if (ACTIVE_STATES.has(controller.getSnapshot().state)) return { ok: false, reason: 'busy' };
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
    let requestContext = submitOptions.input === undefined ? copyContext(options.getDraftContext?.()) : { references: [], pendingScenario: 'normal' };
    let live = null;
    let guide = !submitOptions.plan && submitOptions.guide ? Object.freeze({ ...submitOptions.guide }) : null;
    if (retry) {
      const sourceId = Object.hasOwn(submitOptions, 'sourceUserId') ? submitOptions.sourceUserId : activeSourceUserId;
      const source = messages.find(message => message.role === 'user' && message.id === sourceId);
      if (!source) return { ok: false, reason: 'missing-source' };
      if (options.requireModel && !source.live) return { ok: false, reason: 'model-required' };
      activeSourceUserId = source.id;
      requestContext = { references: [...(source.references || [])], pendingScenario: 'normal' };
      live = !submitOptions.plan ? source.live : null;
      guide = !submitOptions.plan ? source.guide : null;
      if (!guide) setModelSelection(live || null);
    } else {
      // Explicit page actions are independent of the unsent composer draft.
      const fromComposer = submitOptions.input === undefined;
      const edited = fromComposer && pendingEdit ? messages.find(message => message.id === pendingEdit.messageId) : null;
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

  function retry(retryOptions = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    if (ACTIVE_STATES.has(controller.getSnapshot().state)) return { ok: false, reason: 'busy' };
    const plan = retryOptions.plan || (!controller.getSnapshot().live && !controller.getSnapshot().guide && lastPlan ? normalizePlan({ ...lastPlan, failAt: null }) : undefined);
    if (!controller.getSnapshot().guide || plan) setModelSelection(plan ? null : controller.getSnapshot().live);
    const result = controller.retry({ plan });
    updateControls(controller.getSnapshot().state);
    input.focus();
    return result;
  }

  function onSend() {
    if (ACTIVE_STATES.has(controller.getSnapshot().state)) {
      controller.stop();
      input.focus();
    }
    else submit();
  }

  function onKeydown(event) {
    if (event.isComposing || event.keyCode === 229 || composing || event.defaultPrevented || input.getAttribute('aria-expanded') === 'true') return;
    if (event.key === 'Escape' && pendingEdit) {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!ACTIVE_STATES.has(controller.getSnapshot().state)) submit();
    else {
      announce(input.value.trim() ? '草稿已保留，尚未发送；回复完成或停止后可发送。' : '正在生成回复；可继续写草稿，完成后发送。');
      if (hint) hint.textContent = input.value.trim() ? '草稿已保留，尚未发送；回复完成后可发送。' : '正在生成回复；可继续写草稿，完成后发送。';
    }
  }

  function onActions(event) {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const message = messages.find((item) => item.id === control.dataset.messageId);
    if (!message) return;
    if (control.dataset.action === 'open-artifact') {
      const part = message.parts?.find(item => item.tool?.kind === 'project' && item.result?.artifactId === control.dataset.artifactId);
      if (part && validateAgentResult(part.result).ok) {
        Promise.resolve().then(() => {
          if (!options.onOpenArtifact) throw new Error('Artifact host unavailable');
          return options.onOpenArtifact(part.result.artifactId);
        }).catch(() => {
          if (!destroyed) announce('无法打开本机报告，请从项目历史中重试。');
        });
      }
    }
    if (['copy', 'copy-code', 'copy-guide'].includes(control.dataset.action)) void copyFromControl(control, message);
    if (control.dataset.action === 'download-guide-markdown') downloadGuide(message, 'markdown');
    if (control.dataset.action === 'download-guide-json') downloadGuide(message, 'json');
    if (control.dataset.action === 'edit') {
      if (message.role !== 'user' || message.guide || ACTIVE_STATES.has(controller.getSnapshot().state)) return;
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
  function onDisclosureClick(event) {
    const summary = event.target.closest('summary');
    if (!summary || !list.contains(summary)) return;
    readingDetails = !summary.parentElement.open;
    readingAnchor = readingDetails ? {
      messageId: summary.closest('[data-message-id]').dataset.messageId,
      component: summary.parentElement.dataset.component,
    } : null;
    followLatest = !readingDetails && isNearBottom();
    jumpButton.hidden = followLatest;
    rememberViewport();
  }
  function onReadingFocus(event) {
    if (event.target.matches('[data-guide-search]')) { lockGuideReading(event.target); return; }
    if (!event.target.matches('.tool-result-json, [data-reading-key]')) return;
    readingDetails = true;
    readingAnchor = {
      messageId: event.target.closest('[data-message-id]').dataset.messageId,
      component: event.target.closest('details')?.dataset.component,
      readingKey: event.target.dataset.readingKey,
    };
    followLatest = false;
    jumpButton.hidden = false;
    rememberViewport();
  }
  function guideSearchCard(target) {
    if (!target?.matches('[data-guide-search]') || !list.contains(target)) return null;
    const card = target.closest('[data-component="guide-result"]');
    return card && card.dataset.messageId === target.dataset.messageId ? card : null;
  }
  function lockGuideReading(target) {
    if (!guideSearchCard(target)) return;
    readingDetails = true;
    readingAnchor = { messageId: target.dataset.messageId, component: 'guide-result' };
    followLatest = false;
    jumpButton.hidden = false;
    rememberViewport();
  }
  function onGuideSearch(event) {
    const card = guideSearchCard(event.target);
    if (!card || event.isComposing || guideComposing.has(event.target)) return;
    lockGuideReading(event.target);
    const top = scroll.scrollTop;
    updateGuideFilter(card, event.target.value);
    scroll.scrollTop = top;
    rememberViewport();
  }
  function onGuideCompositionStart(event) {
    if (guideSearchCard(event.target)) guideComposing.add(event.target);
  }
  function onGuideCompositionEnd(event) {
    guideComposing.delete(event.target);
    onGuideSearch({ target: event.target });
  }
  function onScroll() {
    if (settleViewportResize()) return;
    followLatest = !readingDetails && isNearBottom();
    jumpButton.hidden = !messages.length || followLatest;
    rememberViewport();
  }
  function onJump() {
    readingDetails = false;
    followLatest = true;
    scroll.scrollTop = scroll.scrollHeight;
    jumpButton.hidden = true;
    rememberViewport();
  }

  function getViewState() {
    return { scrollTop: scroll.scrollTop, followLatest, readingDetails, readingAnchor: readingAnchor ? { ...readingAnchor } : null,
      guideResults: [...list.children].flatMap(article => [...article.querySelectorAll('[data-component="guide-result"]')].map(card => ({ messageId: article.dataset.messageId, state: getGuideViewState(card) }))),
      readingPositions: [...list.children].flatMap(article => [...article.querySelectorAll('.tool-result-json, [data-reading-key]')].map(node => ({ messageId: article.dataset.messageId, key: node.dataset.readingKey || 'tool-result-json', top: node.scrollTop, left: node.scrollLeft }))),
      disclosures: [...list.children].flatMap(article => [...article.querySelectorAll('details[data-component]')].map(node => ({ messageId: article.dataset.messageId, component: node.dataset.component, open: Boolean(node.open) }))) };
  }
  function restoreViewState(saved) {
    if (destroyed) return;
    for (const item of saved?.guideResults || []) {
      const article = [...list.children].find(node => node.dataset.messageId === item.messageId);
      const card = article?.querySelector('[data-component="guide-result"]');
      if (card) restoreGuideViewState(card, item.state);
    }
    // Filtering opens matching stages; restore the user's current folds after its baseline.
    for (const item of saved?.disclosures || []) {
      const article = [...list.children].find(node => node.dataset.messageId === item.messageId);
      const detail = [...(article?.querySelectorAll('details[data-component]') || [])].find(node => node.dataset.component === item.component);
      if (detail) detail.open = item.open;
    }
    for (const item of saved?.readingPositions || []) {
      const article = [...list.children].find(node => node.dataset.messageId === item.messageId);
      const region = [...(article?.querySelectorAll('.tool-result-json, [data-reading-key]') || [])].find(node => (node.dataset.readingKey || 'tool-result-json') === item.key);
      if (region) { region.scrollTop = item.top; region.scrollLeft = item.left; }
    }
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
  const bindings = [
    [composer, 'shipmate:model-select', onModelSelect],
    [composer, 'shipmate:guide-request', onGuideRequest],
    [sendButton, 'click', onSend],
    [cancelEditButton, 'click', cancelEdit],
    [input, 'keydown', onKeydown],
    [input, 'input', onInput],
    [input, 'compositionstart', onCompositionStart],
    [input, 'compositionend', onCompositionEnd],
    [list, 'click', onActions],
    [list, 'click', onDisclosureClick],
    [list, 'focusin', onReadingFocus],
    [list, 'input', onGuideSearch],
    [list, 'compositionstart', onGuideCompositionStart],
    [list, 'compositionend', onGuideCompositionEnd],
    [scroll, 'scroll', onScroll],
    [jumpButton, 'click', onJump],
  ];
  for (const [node, type, listener] of bindings) node?.addEventListener(type, listener);
  // Width changes rewrap text; ignore height notifications from autosize itself.
  let observedWidth;
  const ResizeObserver = documentRef.defaultView?.ResizeObserver;
  const resizeObserver = ResizeObserver ? new ResizeObserver(entries => {
    if (destroyed) return;
    const width = entries.find(entry => !entry.target || entry.target === input)?.contentRect.width;
    if (Number.isFinite(width) && width > 0 && width !== observedWidth) {
      observedWidth = width;
      autosize();
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
    appendRecord({ text, label } = {}) {
      if (destroyed) return { ok: false, reason: 'destroyed' };
      if (!options.recordOnly && !options.allowRecords) return { ok: false, reason: 'not-record-mode' };
      if (ACTIVE_STATES.has(controller.getSnapshot().state)) return { ok: false, reason: 'busy' };
      if (typeof text !== 'string' || !text.trim() || typeof label !== 'string' || !label.trim()) return { ok: false, reason: 'empty' };
      messages.push({ id: nextMessageId('assistant'), role: 'assistant', text, status: 'complete',
        branchNote: '本机执行报告 · 未调用模型；保存不会重新执行', record: { kind: 'report', label: label.trim() } });
      emitMessages();
      const article = renderMessage(messages.at(-1));
      list.append(article);
      readingDetails = false;
      readingAnchor = null;
      scroll.scrollTop += article.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      followLatest = isNearBottom();
      jumpButton.hidden = followLatest;
      rememberViewport();
      announce('报告已加入本地会话。');
      return { ok: true };
    },
    setModelSelection,
    getModelSelection: () => modelSelection ? { ...modelSelection } : null,
    submit,
    runGuide,
    retry,
    stop: () => destroyed ? { ok: false, reason: 'destroyed' } : controller.stop(),
    replaceMessages(nextMessages) {
      if (destroyed) return;
      viewEpoch++;
      clearCopyFeedback();
      artifactDownloader.dispose();
      if (ACTIVE_STATES.has(controller.getSnapshot().state)) controller.stop('session-switch');
      controller.dispose();
      messages = nextMessages.map((message) => ({ ...message }));
      activeAssistantId = null;
      activeSourceUserId = null;
      lastPlan = null;
      pendingEdit = null;
      announce('');
      render({ forceBottom: true });
      restoreViewState();
      updateControls(CONVERSATION_STATES.IDLE);
      emitMessages();
    },
    getViewState,
    restoreViewState,
    getMessages: () => messages.map((message) => ({ ...message })),
    getDraftState: () => ({ draft: input.value, draftView: { selectionStart: input.selectionStart, selectionEnd: input.selectionEnd, selectionDirection: input.selectionDirection, scrollTop: input.scrollTop }, edit: pendingEdit ? { ...pendingEdit, ...(pendingEdit.originalContext ? { originalContext: copyContext(pendingEdit.originalContext) } : {}) } : null }),
    setDraft(text, edit = null, draftView = null) {
      if (destroyed) return;
      pendingEdit = edit && typeof edit.originalDraft === 'string'
        && messages.some(message => message.role === 'user' && message.id === edit.messageId)
        ? { messageId: edit.messageId, originalDraft: edit.originalDraft, ...(edit.originalContext ? { originalContext: copyContext(edit.originalContext) } : {}) } : null;
      input.value = text || '';
      autosize();
      const length = input.value.length;
      const start = Number.isFinite(draftView?.selectionStart) ? Math.max(0, Math.min(length, Math.trunc(draftView.selectionStart))) : length;
      const end = Number.isFinite(draftView?.selectionEnd) ? Math.max(start, Math.min(length, Math.trunc(draftView.selectionEnd))) : length;
      const direction = ['forward', 'backward'].includes(draftView?.selectionDirection) ? draftView.selectionDirection : 'none';
      input.setSelectionRange?.(start, end, direction);
      // Selection and autosizing can scroll the textarea; apply its saved viewport last.
      input.scrollTop = Number.isFinite(draftView?.scrollTop) ? Math.max(0, Math.min(draftView.scrollTop, input.scrollHeight - input.clientHeight)) : 0;
      updateControls(controller.getSnapshot().state);
      announce(pendingEdit ? editAnnouncement : getRunAnnouncement(controller.getSnapshot().state, assistantMessage()));
      options.onDraftChange?.();
    },
    updateReviewState(state, detail = {}) {
      if (destroyed) return false;
      const reversed = [...messages].reverse();
      const message = detail.runId
        ? reversed.find((item) => item.review?.runId === detail.runId)
        : reversed.find(item => item.review);
      if (!message) return false;
      message.review = { ...message.review, ...detail, state, summary: getReviewPresentation(state).summary };
      emitMessages();
      patchMessage(message);
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      viewEpoch++;
      clearCopyFeedback();
      artifactDownloader.dispose();
      controller.dispose();
      resizeObserver?.disconnect();
      for (const [node, type, listener] of bindings) node?.removeEventListener(type, listener);
    },
  };
}

if (typeof window !== 'undefined') {
  window.shipmateConversation = {
    CONVERSATION_STATES,
    createConversationController,
    createDemoPlan,
    mountConversation,
  };
}
