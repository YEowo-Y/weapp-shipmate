import { TextDecoder } from 'node:util';
import { createCustomEndpointFetch, validateCustomEndpoint } from './custom-endpoint.mjs';

// GLM does not document a model-list API. These are suggestions, not an account
// catalog or proof of authentication; only an explicit inference tests access.
export const GLM_CHAT_MODELS = Object.freeze(['glm-5.2', 'glm-4.7']);
// Newer Kimi reasoning-only models require opaque reasoning history, which this
// text-only transport intentionally does not persist or send back.
export const KIMI_CHAT_MODELS = Object.freeze(['kimi-k2.6']);

// Built-ins have fixed destinations; custom uses the separate pinned transport.
export const PROVIDER_CONFIGS = Object.freeze(Object.fromEntries(Object.entries({
  openai: { endpoint: 'https://api.openai.com/v1/models', requiresKey: true },
  anthropic: { endpoint: 'https://api.anthropic.com/v1/models', requiresKey: true },
  google: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', requiresKey: true },
  deepseek: { endpoint: 'https://api.deepseek.com/models', requiresKey: true },
  glm: { requiresKey: true },
  kimi: { endpoint: 'https://api.moonshot.cn/v1/models', requiresKey: true },
  openrouter: { endpoint: 'https://openrouter.ai/api/v1/models', requiresKey: true },
  ollama: { endpoint: 'http://127.0.0.1:11434/api/tags', requiresKey: false },
}).map(([id, config]) => [id, Object.freeze(config)])));

export class ConnectionError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'ConnectionError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new ConnectionError(code, message, status); };
const malformed = () => fail('invalid_response', '服务商返回的数据格式不受支持，请稍后重试。', 502);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const credential = value => typeof value === 'string' && /^[\x21-\x7e]{1,4096}$/u.test(value);
export const isGoogleModelResource = value => typeof value === 'string' && value.length <= 256 && /^models\/[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
const MAX_BYTES = 2 * 1024 * 1024;

function validateTree(value, depth = 0, budget = { left: 50000 }) {
  if (--budget.left < 0 || depth > 12) malformed();
  if (typeof value === 'string' && value.length > 65536) malformed();
  if (Array.isArray(value)) {
    if (value.length > 5000) malformed();
    value.forEach(item => validateTree(item, depth + 1, budget));
  } else if (record(value)) {
    const keys = Object.keys(value);
    if (keys.length > 128 || keys.some(key => key.length > 256)) malformed();
    keys.forEach(key => validateTree(value[key], depth + 1, budget));
  }
}

async function boundedOperation(work, { fetchImpl = fetch, signal, timeoutMs = 15000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) fail('invalid_timeout', '连接超时设置无效。');
  const controller = new AbortController();
  let timer;
  let rejectAbort;
  const interrupted = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = (code, message, status) => {
    controller.abort();
    rejectAbort(new ConnectionError(code, message, status));
  };
  const canceled = () => abort('canceled', '连接已取消。', 409);
  signal?.addEventListener('abort', canceled, { once: true });
  try {
    if (signal?.aborted) canceled();
    else timer = setTimeout(() => abort('timeout', '服务商连接超时，请稍后重试。', 504), timeoutMs);
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new ConnectionError('canceled', '连接已取消。', 409);
      return work((url, options) => requestJson(fetchImpl, controller.signal, url, options));
    })]);
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    fail('network_error', '无法连接服务商，请检查网络或本地服务后重试。', 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', canceled);
    controller.abort();
  }
}

async function requestJson(fetchImpl, signal, url, options = {}) {
  const response = await fetchImpl(url, { ...options, signal, redirect: 'error' });
  if (signal.aborted) {
    void response.body?.cancel().catch(() => {});
    fail('canceled', '连接已取消。', 409);
  }
  if (!response.ok || response.redirected) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 401) fail('authentication_failed', '凭据无效或已过期，请重新连接。', 401);
    if (response.status === 403) fail('permission_denied', '当前凭据没有访问权限，请检查服务商权限或换用其他模型。', 403);
    if (response.status === 429) fail('rate_limited', '服务商请求频率受限，请稍后重试。', 429);
    fail('upstream_error', '服务商暂时无法完成请求，请稍后重试。', 502);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > MAX_BYTES) {
    void response.body?.cancel().catch(() => {});
    fail('response_too_large', '服务商响应过大，无法安全载入。', 502);
  }
  if (!response.body) malformed();
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  const cancelRead = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancelRead, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) fail('canceled', '连接已取消。', 409);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { cancelRead(); fail('response_too_large', '服务商响应过大，无法安全载入。', 502); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancelRead); reader.releaseLock(); }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { malformed(); }
  if (!record(data)) malformed();
  validateTree(data);
  return data;
}

export async function discoverModels(providerId, apiKey, options = {}) {
  if (typeof providerId !== 'string' || (providerId !== 'custom' && !Object.hasOwn(PROVIDER_CONFIGS, providerId))) fail('unsupported_provider', '此服务商尚不支持连接。');
  const custom = providerId === 'custom' ? validateCustomEndpoint(options.endpoint) : null;
  const provider = custom ? { endpoint: `${custom.baseUrl}/models`, requiresKey: true } : PROVIDER_CONFIGS[providerId];
  if (custom) options = { ...options, fetchImpl: options.customFetchImpl ?? createCustomEndpointFetch(custom) };
  if (provider.requiresKey && !credential(apiKey)) fail('invalid_key', '请输入有效的 API Key。');
  if (providerId === 'glm') {
    if (options.signal?.aborted) fail('canceled', '连接已取消。', 409);
    return { models: GLM_CHAT_MODELS.map(id => ({ id, name: id })), truncated: false, catalogSource: 'preset' };
  }
  const headers = { Accept: 'application/json' };
  if (providerId === 'anthropic') Object.assign(headers, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });
  else if (providerId === 'google') headers['x-goog-api-key'] = apiKey;
  else if (provider.requiresKey) headers.Authorization = `Bearer ${apiKey}`;
  return boundedOperation(async request => {
    if (providerId === 'openrouter') {
      const auth = await request('https://openrouter.ai/api/v1/key', { headers });
      if (!record(auth.data) || !text(auth.data.label, 1024)) malformed();
    }
    const models = new Map();
    let cursor = '';
    for (let page = 0; page < 3; page++) {
      const url = new URL(provider.endpoint);
      if (providerId === 'anthropic') { url.searchParams.set('limit', '100'); if (cursor) url.searchParams.set('after_id', cursor); }
      if (providerId === 'google') { url.searchParams.set('pageSize', '100'); if (cursor) url.searchParams.set('pageToken', cursor); }
      const data = await request(url.href, { headers });
      const rows = providerId === 'google' || providerId === 'ollama' ? data.models : data.data;
      if (!Array.isArray(rows) || rows.length > 1000) malformed();
      for (const row of rows) {
        if (!record(row)) malformed();
        const id = providerId === 'google' || providerId === 'ollama' ? row.name : row.id;
        const name = providerId === 'anthropic' ? row.display_name : providerId === 'google' ? row.displayName : providerId === 'openrouter' ? row.name : id;
        if (!text(id) || !text(name ?? id)) malformed();
        if (providerId === 'kimi' && !KIMI_CHAT_MODELS.includes(id)) continue;
        if (providerId === 'google') {
          if (!isGoogleModelResource(id)) malformed();
          if (row.supportedGenerationMethods !== undefined && (!Array.isArray(row.supportedGenerationMethods) || row.supportedGenerationMethods.some(method => !text(method)))) malformed();
          if (!row.supportedGenerationMethods?.includes('generateContent')) continue;
        }
        models.set(id, { id, name: name ?? id });
      }
      let next = '';
      if (providerId === 'anthropic') {
        if (typeof data.has_more !== 'boolean') malformed();
        if (data.has_more) { if (!text(data.last_id, 1024)) malformed(); next = data.last_id; }
      } else if (providerId === 'google' && data.nextPageToken !== undefined) {
        if (!text(data.nextPageToken, 1024)) malformed();
        next = data.nextPageToken;
      }
      if (!next) return { models: [...models.values()], truncated: false };
      if (next === cursor) malformed();
      cursor = next;
    }
    return { models: [...models.values()], truncated: true };
  }, options);
}

export async function exchangeOpenRouterCode(code, verifier, options = {}) {
  if (!credential(code) || typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier)) fail('invalid_oauth', '授权信息无效，请重新开始连接。');
  return boundedOperation(async request => {
    const data = await request('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
    });
    if (!credential(data.key)) malformed();
    return data.key;
  }, options);
}
