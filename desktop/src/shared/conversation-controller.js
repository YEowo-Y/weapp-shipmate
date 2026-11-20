// @ts-check
/* global CustomEvent, window */
// Shared lifecycle: deterministic demo by default, explicit model selection for text transport.
import { createDemoResult, validateDemoResult } from './demo-result.js';
import { GUIDE_TOOL_NAME, GUIDE_SUBJECTS, validateGuideInput, validateGuideResult } from './guide-contract.js';
import { streamChat } from './chat-transport.js';

/** @typedef {import('./chat-transport.js').ChatArgs} ChatArgs */
/** @typedef {import('./chat-transport.js').AgentToolEvent} AgentToolEvent */
/** @typedef {import('./guide-transport.js').GuideRequest} GuideRequest */
/** @typedef {import('./guide-contract.js').GuideInput} GuideInput */
/** @typedef {import('./session-store.js').SessionSnapshot['sessions'][number]} Session */
/** @typedef {Session['messages'][number]} Message */
/** @typedef {NonNullable<Message['tool']>} Tool */
/** @typedef {NonNullable<Message['error']>} FailureDetail */
/** @typedef {Required<FailureDetail>} RunFailure */
/** @typedef {Readonly<Pick<ChatArgs, 'providerId' | 'model'> & {
 *   label?: string; messages: ReadonlyArray<Readonly<ChatArgs['messages'][number]>>;
 * }>} LiveRequest */
/** @typedef {(typeof CONVERSATION_STATES)[keyof typeof CONVERSATION_STATES]} ConversationState */
/** @typedef {{ scenario?: Session['pendingScenario']; recovery?: boolean; workingDelayMs?: number; chunkDelayMs?: number; toolDelayMs?: number }} DemoOptions */
/**
 * @typedef {{
 *   workingDelayMs?: number; chunkDelayMs?: number; chunks?: readonly string[];
 *   failAt?: number | null; failure?: Message['error']; tool?: Message['tool'];
 *   toolStartAt?: number; toolDelayMs?: number; toolFailure?: Message['error'];
 *   fact?: Message['fact']; advice?: Message['advice']; review?: Message['review']; structuredResult?: unknown;
 * }} DemoPlanInput
 */
/** @typedef {ReturnType<typeof normalizePlan>} DemoPlan */
/** @typedef {Partial<DemoPlan>} RunResult */
/**
 * @typedef {DemoOptions & {
 *   input?: string; plan?: DemoPlanInput; live?: LiveRequest | null; guide?: Readonly<GuideInput> | null;
 *   retry?: boolean; context?: Pick<Session, 'references' | 'pendingScenario'>;
 * }} ConversationRequest
 */
/**
 * @typedef {(
 *   { ok: true; runId: number } |
 *   { ok: false; reason: 'empty' | 'busy' | 'ambiguous-source' | 'invalid-guide' } |
 *   { ok: false; reason: 'plan-error'; runId: number; error: RunFailure }
 * )} StartResult
 */
/**
 * @typedef {{
 *   id: number; input: string; output: string; retry: boolean; startedAt: number; endedAt: number | null;
 *   toolState: NonNullable<Tool['state']> | null; live: LiveRequest | null; guide: Readonly<GuideInput> | null;
 *   abort: AbortController | null;
 * }} Run
 */
/**
 * @typedef {{
 *   state: ConversationState; runId: number | null; input: string; output: string; retry: boolean;
 *   startedAt: number | null; elapsedMs: number; toolState: Run['toolState']; live: Run['live']; guide: Run['guide'];
 * }} RunSnapshot
 */
/**
 * @typedef {{
 *   'run-start': { previousState: ConversationState; result: RunResult | null };
 *   state: { previousState: ConversationState; phase?: 'run-start'; result?: RunResult | null; error?: RunFailure; reason?: string };
 *   error: { error: RunFailure };
 *   'tool-start': { tool: Tool };
 *   'tool-result': { tool: Tool | null; structuredResult: unknown };
 *   'agent-tool': { toolEvent: AgentToolEvent };
 *   chunk: { chunk: string; chunkIndex?: number; textId?: string };
 *   complete: { result: RunResult };
 *   stopped: { reason: string };
 * }} EventPayloads
 */
/** @typedef {{ [Type in keyof EventPayloads]: RunSnapshot & { type: Type } & EventPayloads[Type] }[keyof EventPayloads]} ConversationEvent */
/** @typedef {number | ReturnType<typeof setTimeout>} TimerHandle */
/**
 * @typedef {{
 *   schedule?: (callback: () => void, delay: number) => TimerHandle;
 *   cancelSchedule?: (handle: TimerHandle) => void;
 *   now?: () => number;
 *   planFactory?: (input: string, request: ConversationRequest) => DemoPlanInput;
 *   onEvent?: (event: ConversationEvent) => void;
 *   eventTarget?: Pick<EventTarget, 'dispatchEvent'> | null;
 *   transport?: (request: Required<Pick<ChatArgs, 'signal' | 'onDelta' | 'onToolEvent'>> & ChatArgs) => Promise<void> | void;
 *   guideTransport?: (request: Required<GuideRequest>) => Promise<unknown>;
 * }} ConversationControllerOptions
 */

export const CONVERSATION_STATES = Object.freeze({
  IDLE: 'idle',
  WORKING: 'working',
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  STOPPED: 'stopped',
  ERROR: 'error',
});

/** @type {Set<string>} */
const ACTIVE_STATES = new Set([
  CONVERSATION_STATES.WORKING,
  CONVERSATION_STATES.STREAMING,
]);

/** @param {string} state */
export function isConversationActive(state) { return ACTIVE_STATES.has(state); }

/** @param {LiveRequest | null | undefined} request */
export function copyLive(request) {
  return request ? Object.freeze({ providerId: request.providerId, model: request.model, label: request.label,
    messages: Object.freeze(request.messages.map(({ role, content }) => Object.freeze({ role, content }))) }) : null;
}

/** @param {DemoPlanInput} [plan] */
export function normalizePlan(plan = {}) {
  return {
    workingDelayMs: Math.max(0, Number(plan.workingDelayMs) || 0),
    chunkDelayMs: Math.max(0, Number(plan.chunkDelayMs) || 0),
    chunks: Array.isArray(plan.chunks) ? plan.chunks.map(String) : [],
    failAt: Number.isInteger(plan.failAt) ? plan.failAt ?? null : null,
    failure: plan.failure || null,
    tool: plan.tool || null,
    toolStartAt: Math.max(0, Number.isInteger(plan.toolStartAt) ? plan.toolStartAt ?? 0 : 0),
    toolDelayMs: Math.max(0, Number(plan.toolDelayMs) || 0),
    toolFailure: plan.toolFailure || null,
    fact: plan.fact || null,
    advice: plan.advice || null,
    review: plan.review || null,
    structuredResult: plan.structuredResult ?? null,
  };
}

/** @param {string} input @param {DemoOptions} [options] */
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

/** @param {unknown} cause @param {string} fallback */
function errorMessage(cause, fallback) {
  const message = (/** @type {{ message?: unknown } | null | undefined} */ (cause))?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/** @param {ConversationControllerOptions} [options] */
export function createConversationController(options = {}) {
  const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
  const cancelSchedule = options.cancelSchedule || (handle => clearTimeout(handle));
  const planFactory = options.planFactory || createDemoPlan;
  const now = options.now || Date.now;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const eventTarget = options.eventTarget || (typeof window !== 'undefined' ? window : null);
  /** @type {ConversationState} */
  let state = CONVERSATION_STATES.IDLE;
  let runSequence = 0;
  /** @type {Run | null} */
  let activeRun = null;
  /** @type {Run | null} */
  let lastRun = null;
  /** @type {ConversationRequest | null} */
  let lastRequest = null;
  /** @type {Set<TimerHandle>} */
  const timers = new Set();
  const isBusy = () => activeRun !== null;

  /** @returns {RunSnapshot} */
  function snapshot() {
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
    };
  }

  /**
   * @template {keyof EventPayloads} Type
   * @param {Type} type
   * @param {EventPayloads[Type]} extra
   */
  function emit(type, extra) {
    const event = /** @type {ConversationEvent} */ ({ ...snapshot(), type, ...extra });
    onEvent(event);
    if (eventTarget?.dispatchEvent && typeof CustomEvent === 'function') {
      eventTarget.dispatchEvent(new CustomEvent('shipmate:conversation', { detail: event }));
    }
    return event;
  }

  /** @param {ConversationState} nextState @param {Omit<EventPayloads['state'], 'previousState'>} [extra] */
  function setState(nextState, extra = {}) {
    const previousState = state;
    state = nextState;
    emit('state', { previousState, ...extra });
  }

  /**
   * @template {'stopped' | 'complete' | 'error'} Type
   * @param {Run} run
   * @param {Type} type
   * @param {EventPayloads[Type]} extra
   */
  function finish(run, type, extra) {
    try {
      setState(type, extra);
      if (activeRun === run) emit(type, extra);
    } finally {
      if (activeRun === run) activeRun = null;
    }
  }

  function clearTimers() {
    for (const handle of timers) cancelSchedule(handle);
    timers.clear();
  }

  /** @param {number} runId @param {() => void} callback @param {number} delay */
  function later(runId, callback, delay) {
    const handle = schedule(() => {
      timers.delete(handle);
      if (!activeRun || activeRun.id !== runId) return;
      callback();
    }, delay);
    timers.add(handle);
  }

  /** @param {Run} run @param {Message['error']} failure */
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
    finish(run, 'error', { error });
  }

  /** @param {Run} run @param {DemoPlan} plan @param {number} index */
  function streamNext(run, plan, index) {
    if (!activeRun || activeRun.id !== run.id) return;
    if (plan.failAt === index) {
      finishError(run, plan.failure);
      return;
    }
    // This is a fixed local demo step, not a provider/tool transport protocol.
    // Keep its position and result explicit so the view never parses prose.
    if (plan.tool && run.toolState === null && index >= Math.min(plan.toolStartAt, plan.chunks.length)) {
      run.toolState = 'running';
      emit('tool-start', { tool: plan.tool });
      later(run.id, () => {
        if (plan.toolFailure) {
          finishError(run, plan.toolFailure);
          return;
        }
        const validation = validateDemoResult(plan.structuredResult);
        if (!validation.ok) {
          finishError(run, { code: 'invalid_demo_result', message: validation.error, retryable: true });
          return;
        }
        run.toolState = 'success';
        emit('tool-result', { tool: plan.tool, structuredResult: plan.structuredResult });
        streamNext(run, plan, index);
      }, plan.toolDelayMs);
      return;
    }
    if (index >= plan.chunks.length) {
      if (plan.tool || plan.structuredResult !== null) {
        const validation = validateDemoResult(plan.structuredResult);
        if (!validation.ok) {
          finishError(run, { code: 'invalid_demo_result', message: validation.error, retryable: true });
          return;
        }
      }
      run.endedAt = now();
      finish(run, 'complete', { result: plan });
      return;
    }
    const chunk = plan.chunks[index];
    run.output += chunk;
    emit('chunk', { chunk, chunkIndex: index });
    later(run.id, () => streamNext(run, plan, index + 1), plan.chunkDelayMs);
  }

  /** @param {ConversationRequest} [request] @returns {StartResult} */
  function start(request = {}) {
    const input = String(request.input ?? '').trim();
    if (!input) return { ok: false, reason: 'empty' };
    // The terminating run owns its final notifications until both have returned.
    if (isBusy()) return { ok: false, reason: 'busy' };
    if (!request.plan && request.guide && request.live) return { ok: false, reason: 'ambiguous-source' };
    if (!request.plan && request.guide && !validateGuideInput(request.guide).ok) return { ok: false, reason: 'invalid-guide' };

    clearTimers();
    const retry = Boolean(request.retry);
    const live = !request.plan && request.live ? copyLive(request.live) : null;
    const guide = !request.plan && request.guide ? Object.freeze({ ...request.guide }) : null;
    /** @type {DemoPlan | undefined} */
    let plan;
    /** @type {RunFailure | undefined} */
    let planError;
    try {
      if (!live && !guide) plan = normalizePlan(request.plan || planFactory(input, request));
    } catch (cause) {
      planError = { code: 'plan_error', message: errorMessage(cause, '无法创建演示计划。'), retryable: true };
    }

    const abort = live || guide ? new AbortController() : null;
    /** @type {Run} */
    const run = {
      id: ++runSequence,
      input,
      output: '',
      retry,
      startedAt: now(),
      endedAt: null,
      toolState: null,
      live,
      guide,
      abort,
    };
    activeRun = run;
    lastRun = run;
    lastRequest = { input, plan, live, guide };
    const previousState = state;
    state = CONVERSATION_STATES.WORKING;
    const startingResult = planError ? null : plan ?? {};
    emit('run-start', { previousState, result: startingResult });
    emit('state', { previousState, phase: 'run-start', result: startingResult });
    if (planError) {
      finishError(run, planError);
      return { ok: false, reason: 'plan-error', error: planError, runId: run.id };
    }
    if (guide && abort) {
      /** @type {NonNullable<ConversationControllerOptions['guideTransport']>} */
      const transport = options.guideTransport || (args => import('./guide-transport.js').then(module => module.streamGuide(args)));
      /** @type {Tool | undefined} */
      let tool;
      Promise.resolve().then(() => {
        if (activeRun !== run) return;
        return transport({ input: guide, signal: abort.signal, onToolStart({ toolCallId }) {
          if (activeRun !== run || abort.signal.aborted || tool) return;
          tool = { name: GUIDE_TOOL_NAME, kind: 'guide', toolCallId, parameters: guide, label: '生成本机上线清单' };
          run.toolState = 'running';
          emit('tool-start', { tool });
        } });
      }).then(result => {
        if (activeRun !== run) return;
        if (!tool || !validateGuideResult(result).ok) throw new Error('上线清单结果无效，请重试。');
        run.toolState = 'success';
        emit('tool-result', { tool, structuredResult: result });
        if (activeRun !== run) return;
        const chunk = `已根据本机收录规则生成${GUIDE_SUBJECTS[guide.subject]}上线清单。请核对适用项和条件自查项；这不表示项目已通过审核。`;
        run.output = chunk;
        emit('chunk', { chunk });
        if (activeRun !== run) return;
        run.endedAt = now();
        finish(run, 'complete', { result: { structuredResult: result } });
      }).catch(error => {
        if (activeRun !== run) return;
        finishError(run, { code: 'guide_error', message: errorMessage(error, '上线清单生成失败，请重试。'), retryable: true });
      });
      return { ok: true, runId: run.id };
    }
    if (live && abort) {
      const transport = options.transport || streamChat;
      Promise.resolve().then(() => {
        if (activeRun !== run) return;
        return transport({ ...live, signal: abort.signal, onToolEvent(event) {
          if (activeRun !== run || abort.signal.aborted) return;
          emit('agent-tool', { toolEvent: event });
        }, onDelta(chunk, metadata) {
          if (activeRun !== run || abort.signal.aborted) return;
          if (state !== CONVERSATION_STATES.STREAMING) {
            setState(CONVERSATION_STATES.STREAMING);
            // A listener can stop or replace the run while receiving the state change.
            if (activeRun !== run || abort.signal.aborted) return;
          }
          run.output += chunk;
          emit('chunk', { chunk, textId: metadata?.textId });
        } });
      }).then(() => {
        if (activeRun !== run) return;
        run.endedAt = now();
        finish(run, 'complete', { result: {} });
      }).catch(error => {
        if (activeRun !== run) return;
        finishError(run, { code: 'model_error', message: errorMessage(error, '模型连接失败，请重试。'), retryable: true });
      });
      return { ok: true, runId: run.id };
    }
    if (plan) later(run.id, () => {
      setState(CONVERSATION_STATES.STREAMING, { result: plan });
      streamNext(run, plan, 0);
    }, plan.workingDelayMs);
    return { ok: true, runId: run.id };
  }

  /** @param {{ plan?: DemoPlanInput }} [overrides] @returns {StartResult | { ok: false; reason: 'no-request' }} */
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

  /** @returns {{ ok: true; runId: number; output: string } | { ok: false; reason: 'not-running' }} */
  function stop(reason = 'user') {
    if (!activeRun || !isConversationActive(state)) return { ok: false, reason: 'not-running' };
    const stoppedRun = activeRun;
    stoppedRun.abort?.abort();
    if (activeRun === stoppedRun) {
      stoppedRun.endedAt = now();
      if (stoppedRun.toolState === 'running') stoppedRun.toolState = 'canceled';
      clearTimers();
      finish(stoppedRun, 'stopped', { reason });
    }
    return { ok: true, runId: stoppedRun.id, output: stoppedRun.output };
  }

  function dispose() {
    const abort = activeRun?.abort;
    clearTimers();
    activeRun = null;
    lastRequest = null;
    lastRun = null;
    state = CONVERSATION_STATES.IDLE;
    abort?.abort();
  }

  return { start, retry, stop, isBusy, getSnapshot: () => snapshot(), dispose };
}
