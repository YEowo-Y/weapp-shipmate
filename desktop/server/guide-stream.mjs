import { randomUUID } from 'node:crypto';
const runGuide = async (...args) => (await import('../../src/guide.mjs')).runGuide(...args);
import { GUIDE_TOOL_NAME, validateGuideResult } from '../design-previews/guide-contract.js';

export async function streamGuideResponse(res, input, { guideRunner = runGuide, signal, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
  const cancelled = new Promise((_, reject) => {
    if (controller.signal.aborted) reject(new Error('cancelled'));
    else controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  });
  void cancelled.catch(() => {});
  const emit = async event => {
    if (controller.signal.aborted || res.destroyed) throw new Error('cancelled');
    if (!res.write(`data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)) {
      let drain;
      try { await Promise.race([cancelled, new Promise(resolve => { drain = resolve; res.once('drain', drain); })]); }
      finally { if (drain) res.removeListener('drain', drain); }
    }
  };
  const toolCallId = randomUUID();
  try {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', 'X-Content-Type-Options': 'nosniff', 'x-vercel-ai-ui-message-stream': 'v1' });
    await emit({ type: 'start', messageId: randomUUID() });
    await emit({ type: 'tool-input-available', toolCallId, toolName: GUIDE_TOOL_NAME, input });
    const output = await Promise.race([cancelled, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error('cancelled');
      return guideRunner({ subject_type: input.subject, collects_sensitive: input.sensitive, has_server_domain: input.domain }, { includeDrafts: false, signal: controller.signal });
    })]);
    if (!validateGuideResult(output).ok) throw new Error('invalid_result');
    await emit({ type: 'tool-output-available', toolCallId, output });
    await emit({ type: 'finish', finishReason: 'stop' }); await emit('[DONE]');
  } catch {
    if (!res.destroyed) {
      const errorText = timedOut ? '清单生成超时，请重试。' : controller.signal.aborted ? '清单生成已停止。' : '清单生成失败，请重试。';
      res.write(`data: ${JSON.stringify({ type: 'tool-output-error', toolCallId, errorText })}\n\ndata: ${JSON.stringify({ type: 'finish', finishReason: 'error' })}\n\ndata: [DONE]\n\n`);
    }
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
    if (!res.destroyed) res.end();
  }
}

