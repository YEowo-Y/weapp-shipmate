// @ts-check
/* global TextDecoder */
/** @param {unknown} value @returns {value is string} */
export function isStreamId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256; }

/**
 * @param {string} payload
 * @param {() => never} malformed
 * @returns {Record<string, unknown>}
 */
export function parseUIMessagePayload(payload, malformed) {
  /** @type {unknown} */
  let value;
  try { value = JSON.parse(payload); } catch { return malformed(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return malformed();
  return /** @type {Record<string, unknown>} */ (value);
}

// Bounded SSE framing shared by the supported AI SDK UI Message Stream subsets.
// Consumers validate event order and payloads; true from onData closes the stream.
/**
 * @param {ReadableStream<Uint8Array>} body
 * @param {{ signal: AbortSignal; onData: (payload: string) => boolean | void; fail: (message: string) => never;
 *   checkAbort: (signal: AbortSignal) => void; label?: string }} options
 */
export async function readUIMessageStream(body, { signal, onData, fail, checkAbort, label = '回复' }) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  /** @type {string[]} */
  let data = [];
  let buffer = '', dataSize = 0, bytes = 0, done = false;
  const malformed = () => fail(`${label}流格式不受支持，请重试。`);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  function event() {
    if (!data.length) return;
    const payload = data.join('\n'); data = []; dataSize = 0;
    checkAbort(signal);
    done = onData(payload) === true;
  }
  function lines(final = false) {
    let match;
    while (!done && (match = /\r\n|\n|\r(?!$)/.exec(buffer))) {
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (!line) event();
      else if (line.startsWith('data:')) {
        const part = line.slice(5).replace(/^ /, '');
        dataSize += part.length + 1;
        if (dataSize > 131072) malformed();
        data.push(part);
      }
    }
    // EOF cannot manufacture the blank line required to finish an event.
    if (final && !done && buffer === '\r') { buffer = ''; event(); }
  }
  try {
    checkAbort(signal);
    while (!done) {
      const chunk = await reader.read();
      checkAbort(signal);
      if (chunk.done) { buffer += decoder.decode(); lines(true); break; }
      bytes += chunk.value.byteLength;
      if (bytes > 2 * 1024 * 1024) fail(`${label}数据超出大小限制。`);
      buffer += decoder.decode(chunk.value, { stream: true });
      lines();
      if (buffer.length > 131072) malformed();
    }
    if (!done) fail(`${label}连接中断，可手动重试。`);
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel(); reader.releaseLock();
  }
}
