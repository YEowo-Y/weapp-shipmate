// @ts-check
import { randomUUID } from 'node:crypto';
import { validateAgentInput, validateAgentResult } from '../src/shared/agent-contract.js';

const validId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const unavailable = code => Object.assign(new Error('本地项目工具未完成，请重试。'), { code });

// Private native transport. No project path or permission is supplied by a model.
export function createAgentToolRpc(emit, { timeoutMs = 35_000 } = {}) {
  const pending = new Map();
  let closed = false;
  const run = ({ requestId, toolCallId, input, signal }) => new Promise((resolve, reject) => {
    if (closed || signal?.aborted || pending.size >= 1 || !validId(requestId) || !validId(toolCallId) || !validateAgentInput(input).ok) { reject(unavailable()); return; }
    const id = `project-tool-${randomUUID()}`;
    const finish = (error, result) => {
      if (!pending.has(id)) return;
      const entry = pending.get(id);
      pending.delete(id); clearTimeout(entry.timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result);
    };
    const cancel = code => {
      try { emit({ type: 'project-tool-cancel', id, requestId }); } catch { /* Owner exit is already terminal. */ }
      finish(unavailable(code));
    };
    const abort = () => cancel('canceled');
    const timer = setTimeout(() => cancel('tool_timeout'), timeoutMs);
    pending.set(id, { timer, finish, abort });
    signal?.addEventListener('abort', abort, { once: true });
    try { emit({ type: 'project-tool', id, requestId, toolCallId, input }); }
    catch { finish(unavailable()); }
  });
  return {
    run,
    receive(message) {
      if (message?.type !== 'project-tool-result') return false;
      const entry = pending.get(message.id);
      if (entry) {
        if (message.ok === true && validateAgentResult(message.result).ok) entry.finish(null, message.result);
        else entry.finish(unavailable(message.errorCode));
      }
      return true;
    },
    close() { closed = true; for (const entry of [...pending.values()]) entry.abort(); },
  };
}
