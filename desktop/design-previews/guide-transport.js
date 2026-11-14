import { loadChatConnections } from './chat-transport.js';
import { GUIDE_TOOL_NAME, validateGuideInput, validateGuideResult } from './guide-contract.js';
import { readUIMessageStream } from './ui-message-stream.js';

class GuideTransportError extends Error {}
const fail = message => { throw new GuideTransportError(message); };
const abortError = () => Object.assign(new Error('清单生成已停止。'), { name: 'AbortError' });
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };

async function readGuideStream(body, input, signal, onToolStart) {
  let stage = 'initial', callId, output;
  const malformed = () => fail('上线清单流格式不正确，未发布结果，请重试。');
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
  await readUIMessageStream(body, { signal, fail, checkAbort, label: '上线清单', onData(payload) {
    if (payload === '[DONE]') {
      if (stage !== 'finished') malformed();
      return true;
    }
    let value;
    try { value = JSON.parse(payload); } catch { malformed(); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) malformed();
    if (value.type === 'start' && stage === 'initial' && id(value.messageId)) stage = 'started';
    else if (value.type === 'tool-input-available' && stage === 'started' && id(value.toolCallId) && value.toolName === GUIDE_TOOL_NAME) {
      if (!validateGuideInput(value.input).ok || Object.keys(input).some(key => value.input[key] !== input[key])) malformed();
      callId = value.toolCallId; stage = 'running';
      onToolStart({ toolCallId: callId, input: { ...input } });
    } else if (value.type === 'tool-output-available' && stage === 'running' && value.toolCallId === callId) {
      if (!validateGuideResult(value.output).ok) fail('上线清单结果未通过校验，请重试。');
      output = value.output; stage = 'output';
    } else if (value.type === 'tool-output-error' && stage === 'running' && value.toolCallId === callId) {
      fail('上线清单生成失败，请重试。');
    } else if (value.type === 'error' || value.type === 'abort') fail('上线清单执行已中断，请重试。');
    else if (value.type === 'finish' && stage === 'output' && value.finishReason === 'stop') stage = 'finished';
    else malformed();
  } });
  return output;
}

export async function streamGuide({ input, signal, onToolStart = () => {} }, {
  fetcher = fetch, timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  checkAbort(signal);
  if (!validateGuideInput(input).ok) fail('上线清单输入参数不正确，请完成所有选项。');
  // Freeze the submitted values before the asynchronous session handshake.
  const request = { ...input };
  const controller = new AbortController();
  let timer, interrupt;
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
    if (error instanceof GuideTransportError || error?.name === 'AbortError') throw error;
    fail('上线清单连接中断，请检查本地服务后重试。');
  } finally { clearTimer(timer); signal?.removeEventListener('abort', stop); controller.abort(); }
}
