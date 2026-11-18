import { createConnectionClient, isUsableModelConnection } from './model-connection-client.js';
import { readUIMessageStream } from './ui-message-stream.js';
import { AGENT_PROVIDERS, AGENT_TOOL_NAME, validateAgentInput, validateAgentResult } from './agent-contract.js';

export const SUPPORTED_CHAT_PROVIDERS = Object.freeze({ openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek', glm: 'GLM · 智谱', kimi: 'Kimi', openrouter: 'OpenRouter', ollama: 'Ollama', custom: '自定义兼容服务' });
class ChatTransportError extends Error {}
const fail = message => { throw new ChatTransportError(message); };
const abortError = () => Object.assign(new Error('回复已停止。'), { name: 'AbortError' });
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };

/**
 * @typedef {{
 *   providerId: string;
 *   model: string;
 *   messages: { role: string; content: string }[];
 *   signal: AbortSignal;
 *   agent?: { projectId: string; sessionId: string; allowRead: boolean; shareResults: boolean } | any;
 *   onDelta?: (text: string, meta?: { textId?: string }) => void;
 *   onToolEvent?: (event: any) => void;
 * }} ChatArgs
 */

/** @param {{ signal?: AbortSignal; fetcher?: typeof fetch }} [options] */
export async function loadChatConnections({ signal, fetcher = fetch } = {}) {
  checkAbort(signal);
  const client = createConnectionClient(fetcher);
  const abort = () => client.dispose();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const snapshot = await client.load();
    checkAbort(signal);
    return snapshot;
  } catch (error) {
    checkAbort(signal);
    throw new ChatTransportError(error.message);
  } finally { signal?.removeEventListener('abort', abort); client.dispose(); }
}

// AI SDK UI Message Stream v1, deliberately limited to one plain-text block.
// SSE is decoded independently of fetch chunk boundaries, including split CRLF.
async function readTextStream(body, signal, onDelta) {
  let textLength = 0, stage = 'initial', textId = null;
  const malformed = () => fail('回复流格式不受支持，请重试。');
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
  function onData(payload) {
    if (payload === '[DONE]') {
      if (stage !== 'finished') fail('回复在完成前中断，请重试。');
      return true;
    }
    let value;
    try { value = JSON.parse(payload); } catch { malformed(); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) malformed();
    if (value.type === 'error') {
      fail(typeof value.errorText === 'string' && value.errorText.length <= 500 ? value.errorText : '模型未能完成回复，请重试。');
    }
    if (value.type === 'abort') fail('服务端已中止回复，已保留收到的文本。');
    if (value.type === 'start' && stage === 'initial' && id(value.messageId)) stage = 'started';
    else if (value.type === 'text-start' && stage === 'started' && id(value.id)) { stage = 'text'; textId = value.id; }
    else if (value.type === 'text-delta' && stage === 'text' && value.id === textId && typeof value.delta === 'string') {
      textLength += value.delta.length;
      if (textLength > 262144) fail('回复超出显示长度限制，已保留收到的文本。');
      checkAbort(signal);
      if (value.delta) onDelta(value.delta);
    } else if (value.type === 'text-end' && stage === 'text' && value.id === textId) stage = 'ended';
    else if (value.type === 'finish' && stage === 'ended') {
      if (!textLength) fail('模型返回了空回复，请选择文本模型或重试。');
      stage = 'finished';
    } else malformed();
  }
  await readUIMessageStream(body, { signal, onData, fail, checkAbort });
}

// Agent mode uses the SDK's standard lifecycle, independently of the legacy text subset.
export async function readAgentStream(body, signal, onDelta, onToolEvent) {
  let started = false, finished = false, step = false, steps = 0, length = 0;
  const texts = new Map(), tools = new Map();
  const malformed = () => fail('Agent 回复流格式或执行顺序无效，已保留收到的内容。');
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
  const terminal = tool => ['success', 'error'].includes(tool.state);
  const createTool = value => {
    if (!id(value.toolCallId) || value.toolName !== AGENT_TOOL_NAME || tools.size >= 2 || [...tools.values()].some(tool => !terminal(tool))) malformed();
    const tool = { state: 'input', inputLength: 0 }; tools.set(value.toolCallId, tool); return tool;
  };
  await readUIMessageStream(body, { signal, fail, checkAbort, onData(payload) {
    if (payload === '[DONE]') { if (!finished) malformed(); return true; }
    let value; try { value = JSON.parse(payload); } catch { malformed(); }
    if (!value || typeof value !== 'object' || Array.isArray(value) || finished) malformed();
    if (value.type === 'error') fail(typeof value.errorText === 'string' && value.errorText.length <= 500 ? value.errorText : 'Agent 未完成本次执行。');
    if (value.type === 'abort') fail('执行已中止，已保留收到的内容。');
    if (value.type === 'start') { if (started || !id(value.messageId)) malformed(); started = true; return; }
    if (!started) malformed();
    if (value.type === 'start-step') { if (step || ++steps > 3) malformed(); step = true; return; }
    if (value.type === 'finish-step') {
      if (!step || [...texts.values()].some(value => value === 'open') || [...tools.values()].some(tool => !terminal(tool))) malformed();
      step = false; return;
    }
    if (value.type === 'finish') {
      if (step || !steps || (!length && !tools.size) || [...tools.values()].some(tool => !terminal(tool))) malformed();
      if ([...tools.values()].some(tool => tool.state === 'error') || (value.finishReason && value.finishReason !== 'stop')) fail('模型未完成本次执行，已保留已有结果。');
      finished = true; return;
    }
    if (!step) malformed();
    if (value.type === 'text-start') { if (!id(value.id) || texts.has(value.id) || texts.size >= 24) malformed(); texts.set(value.id, 'open'); return; }
    if (value.type === 'text-delta') {
      if (texts.get(value.id) !== 'open' || typeof value.delta !== 'string') malformed();
      length += value.delta.length; if (length > 262144) fail('回复超出显示长度限制。');
      checkAbort(signal); if (value.delta) onDelta(value.delta, { textId: value.id }); return;
    }
    if (value.type === 'text-end') { if (texts.get(value.id) !== 'open') malformed(); texts.set(value.id, 'closed'); return; }
    if (!id(value.toolCallId)) malformed();
    let tool = tools.get(value.toolCallId);
    if (value.type === 'tool-input-start') { if (tool) malformed(); createTool(value); }
    else if (value.type === 'tool-input-delta') {
      if (!tool || tool.state !== 'input' || typeof value.inputTextDelta !== 'string') malformed();
      tool.inputLength += value.inputTextDelta.length; if (tool.inputLength > 32768) malformed();
    } else if (value.type === 'tool-input-available' || value.type === 'tool-input-error') {
      if (!tool) tool = createTool(value);
      if (tool.state !== 'input' || value.toolName !== AGENT_TOOL_NAME) malformed();
      if (value.type === 'tool-input-available') {
        if (!validateAgentInput(value.input).ok) malformed(); tool.state = 'running'; tool.input = value.input;
      } else { if (typeof value.errorText !== 'string' || value.errorText.length > 500) malformed(); tool.state = 'error'; }
    } else if (value.type === 'tool-output-available') {
      if (!tool || tool.state !== 'running' || !validateAgentResult(value.output).ok || value.output.kind !== tool.input.kind) malformed(); tool.state = 'success';
    } else if (value.type === 'tool-output-error') {
      if (!tool || tool.state !== 'running' || typeof value.errorText !== 'string' || value.errorText.length > 500) malformed(); tool.state = 'error';
    } else malformed();
    checkAbort(signal); onToolEvent(value);
  } });
}

/**
 * @param {ChatArgs} request
 * @param {{ fetcher?: typeof fetch; timeoutMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }} [options]
 */
export async function streamChat({ providerId, model, messages, signal, agent, onDelta = () => {}, onToolEvent = () => {} }, {
  fetcher = fetch, timeoutMs = 130000, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  checkAbort(signal);
  if (!Object.hasOwn(SUPPORTED_CHAT_PROVIDERS, providerId)) fail('此服务商尚不支持文本对话。');
  if (typeof model !== 'string' || !model || !Array.isArray(messages) || !messages.length) fail('对话请求格式不正确。');
  if (agent && (!AGENT_PROVIDERS.includes(providerId) || agent.allowRead !== true || typeof agent.shareResults !== 'boolean' || !['projectId', 'sessionId'].every(key => typeof agent[key] === 'string' && agent[key].length > 0 && agent[key].length <= 256) || Object.keys(agent).some(key => !['projectId', 'sessionId', 'allowRead', 'shareResults'].includes(key)))) fail('项目工具授权格式无效。');
  const controller = new AbortController();
  let timer, interrupt;
  const interrupted = new Promise((_resolve, reject) => { interrupt = reject; });
  const stop = () => { controller.abort(); interrupt(abortError()); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    timer = setTimer(() => {
      controller.abort(); interrupt(new ChatTransportError('模型回复超时，已保留收到的文本；可手动重试。'));
    }, timeoutMs);
    await Promise.race([interrupted, (async () => {
      const snapshot = await loadChatConnections({ signal: controller.signal, fetcher });
      checkAbort(controller.signal);
      const connection = snapshot.connections.find(item => item.providerId === providerId);
      if (!isUsableModelConnection(connection) || !connection.models.some(item => item.id === model)) fail('所选模型连接已失效，请在设置中重新连接并选择模型。');
      const response = await fetcher(`/api/model-connections/${providerId}/${agent ? 'agent' : 'chat'}`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-Shipmate-CSRF': snapshot.csrfToken },
        body: JSON.stringify({ model, messages, ...(agent ? { agent } : {}) }),
      });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); checkAbort(controller.signal); }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        const errors = {
          400: '模型或输入不受支持，请检查所选模型与文本。',
          401: '模型连接或本地会话已失效，请重新连接。',
          403: '连接会话校验失败，请刷新页面重新连接。',
          409: '当前连接正在执行其他操作，请等待完成或停止后重试。',
          413: '对话内容过长，请开启新会话或缩短输入。',
          429: '请求频率受限，请稍后重试。',
        };
        fail(errors[response.status] || '模型服务暂时无法回复，请检查连接后重试。');
      }
      if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream') || response.headers.get('x-vercel-ai-ui-message-stream') !== 'v1') {
        void response.body?.cancel().catch(() => {});
        fail('本地服务返回了不支持的回复流格式，请重启应用或连接服务。');
      }
      if (agent) await readAgentStream(response.body, controller.signal, onDelta, onToolEvent);
      else await readTextStream(response.body, controller.signal, onDelta);
    })()]);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (error instanceof ChatTransportError || error?.name === 'AbortError') throw error;
    fail('回复连接中断，请检查网络后手动重试。');
  } finally { clearTimer(timer); signal?.removeEventListener('abort', stop); controller.abort(); }
}
