const BASE = '/api/model-connections';
const UNAVAILABLE = '本地连接服务不可用。请重新启动应用或连接服务后重试。';
const PROVIDERS = new Set(['openai', 'anthropic', 'google', 'deepseek', 'glm', 'kimi', 'openrouter', 'ollama', 'custom']);
/**
 * @typedef {{ id: string; name: string }} ModelInfo
 * @typedef {{
 *   providerId: string;
 *   status: string;
 *   catalogSource?: string;
 *   hasCredential?: boolean;
 *   credentialStorage?: string;
 *   authMethod?: string;
 *   models: ModelInfo[];
 *   endpoint?: { baseUrl: string; allowLocalHttp: boolean };
 *   error?: { code?: string; message?: string };
 *   inference?: { status: string; model: string | null; error?: { message?: string } };
 * }} ProviderConnection
 * @typedef {{
 *   storage: 'memory' | 'system';
 *   csrfToken: string;
 *   connections: ProviderConnection[];
 *   oauth?: {
 *     status?: string;
 *     mode?: string;
 *     flowId?: string;
 *     authorizationUrl?: string;
 *     expiresAt?: string;
 *     message?: string;
 *   };
 * }} ConnectionSnapshot
 */

// A GLM preset is selectable without claiming that its credential or catalog
// was verified remotely. Other providers still require live discovery.
/**
 * @param {ProviderConnection | undefined | any} connection
 * @returns {connection is ProviderConnection}
 */
export function isUsableModelConnection(connection) {
  return connection?.status === 'connected' || (connection?.providerId === 'glm'
    && connection.status === 'configured' && connection.catalogSource === 'preset' && connection.hasCredential === true);
}
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
function isAuthorization(value) {
  try {
    if (!['callback', 'manual'].includes(value?.mode) || !TOKEN.test(value.flowId)
      || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) return false;
    const url = new URL(value.authorizationUrl);
    if (url.origin !== 'https://openrouter.ai' || url.pathname !== '/auth' || url.username || url.password || url.hash) return false;
    const params = url.searchParams;
    const allowed = ['callback_url', 'state', 'code_challenge', 'code_challenge_method', 'key_label'];
    const challenge = params.get('code_challenge');
    if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)
      || params.get('code_challenge_method') !== 'S256' || !challenge || !TOKEN.test(challenge)) return false;
    if (value.mode === 'manual') return !params.has('callback_url') && !params.has('state');
    const callbackUrl = params.get('callback_url');
    const state = params.get('state');
    if (!callbackUrl || !state) return false;
    const callback = new URL(callbackUrl);
    return callback.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(callback.hostname)
      && Boolean(callback.port) && !callback.username && !callback.password && !callback.search && !callback.hash
      && callback.pathname === `${BASE}/oauth/callback/${value.flowId}` && TOKEN.test(state);
  } catch { return false; }
}
/**
 * @param {any} value
 * @returns {value is ConnectionSnapshot}
 */
function isSnapshot(value) {
  return ['memory', 'system'].includes(value?.storage) && typeof value.csrfToken === 'string' && value.csrfToken.length > 0
    && (!value.oauth?.authorizationUrl || value.oauth.status === 'waiting' && isAuthorization(value.oauth))
    && Array.isArray(value.connections) && value.connections.every(connection => PROVIDERS.has(connection.providerId)
      && (['disconnected', 'connecting', 'connected', 'error'].includes(connection.status)
        || connection.status === 'configured' && isUsableModelConnection(connection))
      && Array.isArray(connection.models) && connection.models.every(model => typeof model.id === 'string' && typeof model.name === 'string'));
}
/**
 * @param {typeof fetch} [fetcher]
 * @param {{ timeoutMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }} [options]
 */
export function createConnectionClient(fetcher = fetch, { timeoutMs = 20000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  /** @type {ConnectionSnapshot | null} */
  let snapshot = null;
  let revision = 0;
  let disposed = false;
  const requests = new Map();
  async function request(path, payload) {
    if (disposed) throw new Error(UNAVAILABLE);
    if (payload !== undefined && !snapshot) throw new Error(UNAVAILABLE);
    const csrfToken = snapshot?.csrfToken ?? '';
    const version = ++revision;
    const controller = new AbortController();
    let timer;
    let failure = '';
    try {
      const value = await Promise.race([(async () => {
        const response = await fetcher(BASE + path, {
          method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-Shipmate-CSRF': csrfToken },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        });
        if ([401, 403].includes(response.status)) {
          if (!disposed && version === revision) snapshot = null;
          failure = '本地连接会话已失效。请重新检查连接服务后再试。';
          throw new Error(failure);
        }
        if (!response.ok) throw new Error(UNAVAILABLE);
        const value = await response.json();
        if (path === '/openrouter/oauth/start') {
          if (!isAuthorization(value)) throw new Error(UNAVAILABLE);
        } else if (!isSnapshot(value)) throw new Error(UNAVAILABLE);
        return value;
      })(), new Promise((_resolve, reject) => {
        requests.set(controller, () => { clearTimer(timer); controller.abort(); reject(new Error(UNAVAILABLE)); });
        timer = setTimer(() => { failure = '本地连接服务响应超时，请重试。'; controller.abort(); reject(new Error(failure)); }, timeoutMs);
      })]);
      if (!disposed && version === revision && isSnapshot(value)) snapshot = value;
      return value;
    } catch {
      if (!disposed && version === revision && payload === undefined) snapshot = null;
      throw new Error(failure || (payload === undefined ? UNAVAILABLE : '连接操作未完成。请检查本地服务与凭据后重试；请勿自动重复提交。'));
    } finally { clearTimer(timer); requests.delete(controller); }
  }
  return {
    get ready() { return !disposed && snapshot !== null; },
    get snapshot() { return snapshot; },
    /** @returns {Promise<ConnectionSnapshot>} */
    load: () => request('', undefined),
    /** @returns {Promise<any>} */
    mutate: (path, payload = {}) => request(path, payload),
    dispose() { disposed = true; revision++; snapshot = null; requests.forEach(cancel => cancel()); requests.clear(); },
  };
}
