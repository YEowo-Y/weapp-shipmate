// @ts-check
/* global TextDecoder */
import { loadChatConnections } from './chat-transport.js';
import { EXPLAIN_RESULT_MAX, isExplainResult, validateExplainInput } from './explain-contract.js';

/** @typedef {{ query: string; signal?: AbortSignal }} ExplainRequest */

class ExplainTransportError extends Error {}
/** @param {string} message @returns {never} */
function fail(message) { throw new ExplainTransportError(message); }
const abortError = () => Object.assign(new Error('查询已停止。'), { name: 'AbortError' });
/** @param {AbortSignal} [signal] */
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };

/** @param {unknown} error */
export function isExplainAbort(error) {
  return error !== null && (typeof error === 'object' || typeof error === 'function')
    && 'name' in error && error.name === 'AbortError';
}

/** @param {ReadableStream<Uint8Array>} body @param {AbortSignal} signal @returns {Promise<unknown>} */
async function readResult(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '', bytes = 0, complete = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    checkAbort(signal);
    while (true) {
      const chunk = await reader.read();
      checkAbort(signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > EXPLAIN_RESULT_MAX * 3) fail('查询结果过大，未展示结果。');
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > EXPLAIN_RESULT_MAX) fail('查询结果过大，未展示结果。');
    }
    text += decoder.decode();
    if (text.length > EXPLAIN_RESULT_MAX) fail('查询结果过大，未展示结果。');
    const result = /** @type {unknown} */ (JSON.parse(text));
    complete = true;
    return result;
  } catch (error) {
    if (error instanceof ExplainTransportError || isExplainAbort(error)) throw error;
    fail('查询结果格式不正确，请重试。');
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

/**
 * @param {ExplainRequest} request
 * @param {{ fetcher?: typeof fetch; timeoutMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }} [options]
 * @returns {Promise<import('./explain-contract.js').ExplainResult>}
 */
export async function queryExplain({ query, signal }, {
  fetcher = fetch, timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  checkAbort(signal);
  if (!validateExplainInput({ query }).ok) fail('请输入 1–4096 字的拒因原文或关键词。');
  const request = query.trim();
  const controller = new AbortController();
  let timer;
  /** @type {(reason: Error) => void} */
  let interrupt;
  /** @type {Promise<never>} */
  const interrupted = new Promise((_resolve, reject) => { interrupt = reject; });
  const stop = () => { controller.abort(); interrupt(abortError()); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    timer = setTimer(() => {
      controller.abort(); interrupt(new ExplainTransportError('查询超时，请手动重试。'));
    }, timeoutMs);
    return await Promise.race([interrupted, (async () => {
      const snapshot = await loadChatConnections({ signal: controller.signal, fetcher });
      checkAbort(controller.signal);
      const response = await fetcher('/api/model-connections/tools/explain', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shipmate-CSRF': snapshot.csrfToken },
        body: JSON.stringify({ query: request }),
      });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); checkAbort(controller.signal); }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        /** @type {Partial<Record<number, string>>} */
        const errors = {
          400: '输入格式不正确，请检查拒因后重试。',
          401: '本地会话已失效，请刷新页面重试。',
          403: '本地会话校验失败，请刷新页面重试。',
          409: '当前操作尚未结束，请等待完成或停止后重试。',
          413: '输入过长，请精简到 4096 字以内。',
          504: '查询超时，请手动重试。',
        };
        fail(errors[response.status] || '本地查询服务不可用，请重启应用或本地服务后重试。');
      }
      if (!response.body || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        void response.body?.cancel().catch(() => {});
        fail('本地服务返回了不支持的结果，请重启应用或本地服务。');
      }
      const result = await readResult(response.body, controller.signal);
      checkAbort(controller.signal);
      if (!isExplainResult(result, request)) fail('查询结果未通过校验，请重试。');
      return result;
    })()]);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error instanceof ExplainTransportError || isExplainAbort(error)) throw error;
    return fail('查询连接中断，请检查本地服务后重试。');
  } finally { clearTimer(timer); signal?.removeEventListener('abort', stop); controller.abort(); }
}
