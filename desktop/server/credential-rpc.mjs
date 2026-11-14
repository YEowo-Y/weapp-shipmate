import { randomUUID } from 'node:crypto';

// This channel belongs to the native child process, never the WebView transport.
export function createCredentialRpc(emit, { timeoutMs = 75_000 } = {}) {
  const pending = new Map();
  let closed = false;
  const unavailable = () => new Error('System credential operation unavailable');
  const request = (operation, providerId, record) => new Promise((resolve, reject) => {
    if (closed || pending.size >= 32 || !['openai', 'anthropic', 'google', 'deepseek', 'glm', 'kimi', 'openrouter', 'ollama', 'custom'].includes(providerId)) { reject(unavailable()); return; }
    const id = `credential-${randomUUID()}`;
    const timer = setTimeout(() => { pending.delete(id); reject(unavailable()); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { emit({ type: 'credential', id, operation, providerId, ...(operation === 'save' ? { record } : {}) }); }
    catch { clearTimeout(timer); pending.delete(id); reject(unavailable()); }
  });
  return {
    store: { load: id => request('load', id), save: (id, record) => request('save', id, record), delete: id => request('delete', id) },
    receive(message) {
      if (message?.type !== 'credential-result') return false;
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id); clearTimeout(entry.timer);
        if (message.ok === true) entry.resolve(message.record ?? null);
        else entry.reject(unavailable());
      }
      return true;
    },
    close() {
      closed = true;
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(unavailable()); }
      pending.clear();
    },
  };
}
