// @ts-check
import { ConnectionError } from './model-providers.mjs';
import { validateExplainResult } from '../src/shared/explain-contract.js';
/**
 * @param {string} query
 * @param {Record<string, any>} [options]
 */
const runExplain = async (query, options) => (await import('../../src/explain.mjs')).runExplain(query, options);

/**
 * @param {string} query
 * @param {Record<string, any>} [options]
 */
export async function executeExplain(query, { explainRunner = runExplain, signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  let timer, interrupt, cancellation;
  const stopped = new Promise((_resolve, reject) => { interrupt = reject; });
  const stop = (code, message, status) => {
    if (cancellation) return;
    cancellation = new ConnectionError(code, message, status);
    controller.abort(); interrupt(cancellation);
  };
  const abort = () => stop('query_cancelled', '查询已停止。', 408);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    timer = setTimeout(() => stop('query_timeout', '查询超时，请手动重试。', 504), timeoutMs);
    if (signal?.aborted) abort();
    return await Promise.race([stopped, Promise.resolve().then(async () => {
      if (controller.signal.aborted) throw new Error('cancelled');
      const output = await explainRunner(query, { includeDrafts: false, signal: controller.signal });
      if (controller.signal.aborted) throw new Error('cancelled');
      if (!validateExplainResult(output, query).ok) throw new Error('invalid_result');
      return output;
    })]);
  } catch (error) {
    // Runner errors are untrusted, even if they reuse our public error class.
    if (error === cancellation) throw error;
    throw new ConnectionError('explain_failed', '本机拒因查询未完成，请手动重试。', 500);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort(); }
}
