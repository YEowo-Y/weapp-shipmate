import { createCustomEndpointFetch, validateCustomEndpoint } from './custom-endpoint.mjs';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { ConnectionError, isGoogleModelResource } from './model-providers.mjs';

const ENDPOINTS = Object.freeze({ openai: 'https://api.openai.com/v1/responses', anthropic: 'https://api.anthropic.com/v1/messages', google: 'https://generativelanguage.googleapis.com/v1beta/', openrouter: 'https://openrouter.ai/api/v1/chat/completions', ollama: 'http://127.0.0.1:11434/api/chat' });
const streamError = message => { throw new ConnectionError('chat_failed', message, 502); };
function validateFrame(value, depth = 0, budget = { left: 10000 }) {
  if (--budget.left < 0 || depth > 16) throw new Error('invalid');
  if (Array.isArray(value)) {
    if (value.length > 1000) throw new Error('invalid');
    for (const item of value) validateFrame(item, depth + 1, budget);
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 128 || keys.some(key => key.length > 256)) throw new Error('invalid');
    for (const key of keys) validateFrame(value[key], depth + 1, budget);
  } else if (typeof value === 'string' && value.length > 262144) throw new Error('invalid');
}
const invalid = () => { throw new ConnectionError('invalid_chat', '对话请求格式不正确。'); };
export function validateChatRequest(provider, body) {
  if (provider !== 'custom' && !Object.hasOwn(ENDPOINTS, provider)) throw new ConnectionError('chat_unsupported', '此服务商暂仅支持模型目录连接。', 400);
  if (!body || Object.keys(body).length !== 2 || typeof body.model !== 'string' || !body.model.length || body.model.length > 256 || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) invalid();
  if (provider === 'google' && !isGoogleModelResource(body.model)) invalid();
  for (const message of body.messages) {
    if (!message || Object.keys(message).length !== 2 || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 32768) invalid();
  }
}

// Only documented text deltas are surfaced. Unknown tools, truncation, and EOF
// without the provider's successful terminal event cannot become a success.
export async function streamChatResponse(res, provider, key, body, { fetchImpl = globalThis.fetch, signal, timeoutMs = 120000, endpoint: customEndpoint, customFetchImpl, maxOutputTokens = 2048 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
  let reader;
  const cancelled = new Promise((_, reject) => {
    const rejectAbort = () => reject(new Error('cancelled'));
    if (controller.signal.aborted) rejectAbort();
    else controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  // Aborting before the first write must also be observed, even before a race.
  void cancelled.catch(() => {});
  const wait = promise => Promise.race([promise, cancelled]);
  const emit = async event => {
    if (res.destroyed || controller.signal.aborted) throw new Error('cancelled');
    if (!res.write(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)) {
      await wait(new Promise(resolve => res.once('drain', resolve)));
    }
  };
  try {
    validateChatRequest(provider, body);
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 2048) invalid();
    const custom = provider === 'custom' ? validateCustomEndpoint(customEndpoint) : null;
    if (custom) fetchImpl = customFetchImpl ?? createCustomEndpointFetch(custom);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', 'X-Content-Type-Options': 'nosniff', 'x-vercel-ai-ui-message-stream': 'v1' });
    await emit({ type: 'start', messageId: randomUUID() });
    const id = randomUUID(); await emit({ type: 'text-start', id });
    const payload = provider === 'openai'
      ? { model: body.model, input: body.messages, stream: true, max_output_tokens: maxOutputTokens, store: false }
      : provider === 'google'
        ? { contents: body.messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })), generationConfig: { maxOutputTokens, candidateCount: 1 } }
      : { ...body, stream: true, ...(provider === 'ollama' ? { options: { num_predict: maxOutputTokens } } : { max_tokens: maxOutputTokens }) };
    const headers = { 'Content-Type': 'application/json', Accept: provider === 'ollama' ? 'application/x-ndjson' : 'text/event-stream' };
    if (provider === 'anthropic') Object.assign(headers, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
    else if (provider === 'google') headers['x-goog-api-key'] = key;
    else if (provider !== 'ollama') headers.Authorization = `Bearer ${key}`;
    const endpoint = custom ? `${custom.baseUrl}/chat/completions` : provider === 'google' ? `${ENDPOINTS.google}${body.model}:streamGenerateContent?alt=sse` : ENDPOINTS[provider];
    const upstream = await wait(Promise.resolve(fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: controller.signal, headers, body: JSON.stringify(payload) })).then(response => {
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error('cancelled'); }
      return response;
    }));
    reader = upstream.body?.getReader();
    if (upstream.status === 401) throw new ConnectionError('authentication_failed', '模型连接授权失效，请重新连接服务商。', 401);
    if (upstream.status === 403) throw new ConnectionError('permission_denied', '当前凭据没有此模型的访问权限，请检查权限或换用其他模型。', 403);
    if (upstream.status === 429) streamError('服务商请求频率或额度受限，请稍后重试。');
    const media = upstream.headers.get('content-type') || '';
    if (upstream.redirected || !upstream.ok || !upstream.body || (provider !== 'ollama' && !media.includes('text/event-stream')) || (provider === 'ollama' && !/application\/(x-ndjson|json)/.test(media)) || Number(upstream.headers.get('content-length')) > 2097152) throw new Error('upstream');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let pending = '', bytes = 0, outputBytes = 0, terminal = false, stopped = false, hasText = false;
    let messageStarted = false, blockIndex = 0, activeBlock = null;
    const process = async raw => {
      if (!raw.trim()) return;
      if (raw === '[DONE]') {
        if (!['openrouter', 'custom'].includes(provider) || !stopped) throw new Error('incomplete');
        terminal = true; return;
      }
      if (Buffer.byteLength(raw) > 262144) throw new Error('limit');
      const value = JSON.parse(raw);
      validateFrame(value);
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.error) throw new Error('invalid');
      let delta = '', incompleteMessage = '';
      if (provider === 'openai') {
        if (value.type === 'response.incomplete') streamError('回复被截断，尚未完成；可调整请求后重试。');
        if (['error', 'response.failed'].includes(value.type)) throw new Error('failed');
        if (value.type === 'response.output_item.added' && !['message', 'reasoning'].includes(value.item?.type)) throw new Error('unsupported');
        if (value.type === 'response.output_text.delta' || value.type === 'response.refusal.delta') delta = value.delta;
        if (value.type === 'response.completed') {
          if (value.response?.status !== 'completed' || !Array.isArray(value.response.output) || value.response.output.some(item => !['message', 'reasoning'].includes(item.type))) throw new Error('incomplete');
          terminal = true;
        }
      } else if (provider === 'anthropic') {
        if (value.type === 'message_start') {
          if (messageStarted || value.message?.role !== 'assistant' || !Array.isArray(value.message.content) || value.message.content.length || value.message.stop_reason != null) throw new Error('invalid');
          messageStarted = true;
        } else if (value.type === 'content_block_start') {
          if (!messageStarted || stopped || activeBlock || value.index !== blockIndex || !['text', 'thinking', 'redacted_thinking'].includes(value.content_block?.type)) throw new Error('unsupported');
          activeBlock = value.content_block.type;
          if (activeBlock === 'text') delta = value.content_block.text;
        } else if (value.type === 'content_block_delta') {
          if (!messageStarted || stopped || !activeBlock || value.index !== blockIndex) throw new Error('invalid');
          if (activeBlock === 'text' && value.delta?.type === 'text_delta') delta = value.delta.text;
          else if (activeBlock !== 'thinking' || !['thinking_delta', 'signature_delta'].includes(value.delta?.type)) throw new Error('unsupported');
        } else if (value.type === 'content_block_stop') {
          if (!activeBlock || value.index !== blockIndex) throw new Error('invalid');
          activeBlock = null; blockIndex++;
        } else if (value.type === 'message_delta') {
          if (!messageStarted || activeBlock || stopped) throw new Error('invalid');
          const reason = value.delta?.stop_reason;
          if (['max_tokens', 'model_context_window_exceeded'].includes(reason)) streamError('回复被截断，尚未完成；可调整请求后重试。');
          if (reason === 'refusal') streamError('服务商未能提供此回复，请调整请求后重试。');
          if (!['end_turn', 'stop_sequence'].includes(reason)) throw new Error('unsupported');
          stopped = true;
        } else if (value.type === 'message_stop') {
          if (!messageStarted || activeBlock || !stopped) throw new Error('incomplete');
          terminal = true;
        }
      } else if (provider === 'google') {
        if (value.promptFeedback?.blockReason) streamError('服务商未能提供此回复，请调整请求后重试。');
        if (value.candidates !== undefined && (!Array.isArray(value.candidates) || value.candidates.length > 1)) throw new Error('invalid');
        const candidate = value.candidates?.[0];
        if (candidate) {
          if (candidate.index !== undefined && candidate.index !== 0) throw new Error('invalid');
          if (candidate.finishReason === 'MAX_TOKENS') incompleteMessage = '回复被截断，尚未完成；可调整请求后重试。';
          else if (candidate.finishReason === 'CONTINUATION') incompleteMessage = '回复尚未完成，请调整请求后重试。';
          else if (candidate.finishReason !== undefined && candidate.finishReason !== 'STOP') streamError('服务商未能完成此回复，请调整请求后重试。');
          if (candidate.content !== undefined) {
            if (!candidate.content || (candidate.content.role !== undefined && candidate.content.role !== 'model') || !Array.isArray(candidate.content.parts)) throw new Error('invalid');
            for (const part of candidate.content.parts) {
              if (!part || typeof part.text !== 'string' || Object.keys(part).some(field => !['text', 'thought', 'thoughtSignature'].includes(field)) || (part.thought !== undefined && typeof part.thought !== 'boolean')) throw new Error('unsupported');
              if (part.thought !== true) delta += part.text;
            }
          }
          if (candidate.finishReason === 'STOP') terminal = true;
        }
      } else if (provider === 'openrouter' || provider === 'custom') {
        if (!Array.isArray(value.choices) || value.choices.length > 1) throw new Error('invalid');
        const choice = value.choices[0];
        if (choice) {
          if (choice.finish_reason === 'length') streamError('回复被截断，尚未完成；可调整请求后重试。');
          if (choice.error || choice.delta?.tool_calls || choice.delta?.function_call || (choice.finish_reason && choice.finish_reason !== 'stop')) throw new Error('unsupported');
          delta = choice.delta?.content ?? '';
          if (choice.finish_reason === 'stop') stopped = true;
        }
      } else {
        if (value.done && value.done_reason === 'length') streamError('回复被截断，尚未完成；可调整请求后重试。');
        if (value.message?.tool_calls?.length || (value.done && value.done_reason !== 'stop')) throw new Error('unsupported');
        delta = value.message?.content ?? '';
        if (value.done === true) terminal = true;
      }
      if (typeof delta !== 'string') throw new Error('invalid');
      if (delta.trim()) hasText = true;
      outputBytes += Buffer.byteLength(delta);
      if (outputBytes > 262144) throw new Error('limit');
      if (delta) await emit({ type: 'text-delta', id, delta });
      if (incompleteMessage) streamError(incompleteMessage);
    };
    while (!terminal) {
      const { value, done } = await wait(reader.read());
      if (done) { pending += decoder.decode(); break; }
      bytes += value.byteLength;
      if (bytes > 2097152) throw new Error('limit');
      pending += decoder.decode(value, { stream: true });
      const delimiter = provider === 'ollama' ? /\r?\n/ : /\r?\n\r?\n/;
      let match;
      while ((match = delimiter.exec(pending))) {
        const frame = pending.slice(0, match.index); pending = pending.slice(match.index + match[0].length);
        const data = provider === 'ollama' ? frame : frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        await process(data);
        if (terminal) break;
      }
      if (pending.length > 262144) throw new Error('limit');
    }
    if (!terminal && provider === 'ollama' && pending.trim()) await process(pending);
    if (!terminal || !hasText) throw new Error('incomplete');
    await emit({ type: 'text-end', id }); await emit({ type: 'finish' }); await emit('[DONE]');
  } catch (error) {
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify({ type: 'error', errorText: timedOut ? '回复超时，请重试。' : controller.signal.aborted ? '回复已中断。' : error instanceof ConnectionError ? error.message : '回复未完成，请重试。' })}\n\ndata: [DONE]\n\n`);
    }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    if (!res.destroyed) res.end();
  }
}
