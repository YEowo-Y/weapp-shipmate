// @ts-check
import { loadChatConnections } from './chat-transport.js';
import { GUIDE_TOOL_NAME, validateGuideInput, validateGuideResult } from './guide-contract.js';
import { isStreamId, parseUIMessagePayload, readUIMessageStream } from './ui-message-stream.js';

class GuideTransportError extends Error {}
/** @param {string} message @returns {never} */
function fail(message) { throw new GuideTransportError(message); }
const abortError = () => Object.assign(new Error('清单生成已停止。'), { name: 'AbortError' });
/** @param {AbortSignal} [signal] */
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };

/** @typedef {import('./guide-contract.js').GuideInput} GuideInput */
/** @typedef {import('./guide-contract.js').GuideResult} GuideResult */
/** @typedef {(tool: { toolCallId: string; input: GuideInput }) => void} OnToolStart */
/** @typedef {{ input: GuideInput; signal?: AbortSignal; onToolStart?: OnToolStart }} GuideRequest */

/**
 * @param {ReadableStream<Uint8Array>} body
 * @param {GuideInput} input
 * @param {AbortSignal} signal
 * @param {OnToolStart} onToolStart
 */
async function readGuideStream(body, input, signal, onToolStart) {
  /** @type {'initial' | 'started' | 'running' | 'output' | 'finished'} */
  let stage = 'initial';
  /** @type {string | undefined} */
  let callId;
  /** @type {GuideResult | undefined} */
  let output;
  /** @type {() => never} */
  const malformed = () => fail('上线清单流格式不正确，未发布结果，请重试。');
  await readUIMessageStream(body, { signal, fail, checkAbort, label: '上线清单', onData(payload) {
    if (payload === '[DONE]') {
      if (stage !== 'finished') malformed();
      return true;
    }
    const value = parseUIMessagePayload(payload, malformed);
    if (value.type === 'start' && stage === 'initial' && isStreamId(value.messageId)) stage = 'started';
    else if (value.type === 'tool-input-available' && stage === 'started' && isStreamId(value.toolCallId) && value.toolName === GUIDE_TOOL_NAME) {
      if (!validateGuideInput(value.input).ok) malformed();
      const echoed = /** @type {GuideInput} */ (value.input);
      if (echoed.subject !== input.subject || echoed.sensitive !== input.sensitive || echoed.domain !== input.domain) malformed();
      callId = value.toolCallId; stage = 'running';
      onToolStart({ toolCallId: callId, input: { ...input } });
    } else if (value.type === 'tool-output-available' && stage === 'running' && value.toolCallId === callId) {
      if (!validateGuideResult(value.output).ok) fail('上线清单结果未通过校验，请重试。');
      output = /** @type {GuideResult} */ (value.output); stage = 'output';
    } else if (value.type === 'tool-output-error' && stage === 'running' && value.toolCallId === callId) {
      fail('上线清单生成失败，请重试。');
    } else if (value.type === 'error' || value.type === 'abort') fail('上线清单执行已中断，请重试。');
    else if (value.type === 'finish' && stage === 'output' && value.finishReason === 'stop') stage = 'finished';
    else malformed();
  } });
  if (!output) malformed();
  return output;
}

/** @param {GuideRequest} request @param {import('./chat-transport.js').TransportOptions} [options] */
export async function streamGuide({ input, signal, onToolStart = () => {} }, {
  fetcher = fetch, timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  checkAbort(signal);
  if (!validateGuideInput(input).ok) fail('上线清单输入参数不正确，请完成所有选项。');
  // Freeze the submitted values before the asynchronous session handshake.
  const request = { ...input };
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {(reason: unknown) => void} */
  let interrupt;
  /** @type {Promise<never>} */
  const interrupted = new Promise((_resolve, reject) => { interrupt = reject; });
  const stop = () => { controller.abort(); interrupt(abortError()); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    timer = setTimer(() => {
      controller.abort(); interrupt(new GuideTransportError('上线清单生成超时，请手动重试。'));
    }, timeoutMs);
    return await Promise.race([interrupted, (async () => {
      const snapshot = await loadChatConnections({ signal: controller.signal, fetcher });
      checkAbort(controller.signal);
      const response = await fetcher('/api/model-connections/tools/guide', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-Shipmate-CSRF': snapshot.csrfToken },
        body: JSON.stringify(request),
      });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); checkAbort(controller.signal); }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        /** @type {Partial<Record<number, string>>} */
        const errors = {
          400: '上线清单输入参数不正确，请重新选择。',
          401: '本地会话已失效，请刷新页面重试。',
          403: '本地会话校验失败，请刷新页面重试。',
          409: '当前操作尚未结束，请等待完成或停止后重试。',
          429: '本地服务繁忙，请稍后重试。',
        };
        fail(errors[response.status] || '本地清单服务不可用，请重启预览服务后重试。');
      }
      if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream') || response.headers.get('x-vercel-ai-ui-message-stream') !== 'v1') {
        void response.body?.cancel().catch(() => {});
        fail('本地服务返回了不支持的清单流，请重启预览服务。');
      }
      const result = await readGuideStream(response.body, request, controller.signal, onToolStart);
      checkAbort(controller.signal);
      return result;
    })()]);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error instanceof GuideTransportError || (/** @type {{ name?: unknown } | null | undefined} */ (error))?.name === 'AbortError') throw error;
    fail('上线清单连接中断，请检查本地服务后重试。');
  } finally { clearTimer(timer); signal?.removeEventListener('abort', stop); controller.abort(); }
}
