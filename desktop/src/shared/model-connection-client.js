// @ts-check
const BASE = '/api/model-connections';
const OAUTH_START = '/openrouter/oauth/start';
const UNAVAILABLE = '本地连接服务不可用。请重新启动应用或连接服务后重试。';
const PROVIDERS = new Set(['openai', 'anthropic', 'google', 'deepseek', 'glm', 'kimi', 'openrouter', 'ollama', 'custom']);
/**
 * @typedef {{ id: string; name: string }} ModelInfo
 * @typedef {{ code?: string | null; message?: string | null }} ConnectionFailure
 * @typedef {{ status: string; model?: string | null; error?: ConnectionFailure | null }} InferenceStatus
 * @typedef {{ mode: 'callback' | 'manual'; flowId: string; authorizationUrl: string; expiresAt: string }} Authorization
 * @typedef {{ status?: string | null; mode?: string | null; flowId?: string | null; authorizationUrl?: string | null; expiresAt?: string | null; message?: string | null }} AuthorizationStatus
 * @typedef {{
 *   providerId: string;
 *   status: string;
 *   catalogSource?: string | null;
 *   hasCredential?: boolean | null;
 *   credentialStorage?: string | null;
 *   authMethod?: string | null;
 *   models: ModelInfo[];
 *   endpoint?: { baseUrl: string; allowLocalHttp: boolean } | null;
 *   error?: ConnectionFailure | null;
 *   inference?: InferenceStatus | null;
 * }} ProviderConnection
 * @typedef {{
 *   storage: 'memory' | 'system';
 *   csrfToken: string;
 *   connections: ProviderConnection[];
 *   oauth?: AuthorizationStatus | null;
 * }} ConnectionSnapshot
 */

// A GLM preset is selectable without claiming that its credential or catalog
// was verified remotely. Other providers still require live discovery.
/**
 * @param {unknown} connection
 * @returns {connection is Record<string, unknown> & ({ status: 'connected' } | { providerId: 'glm'; status: 'configured'; catalogSource: 'preset'; hasCredential: true })}
 */
export function isUsableModelConnection(connection) {
  return record(connection) && (connection.status === 'connected' || (connection.providerId === 'glm'
    && connection.status === 'configured' && connection.catalogSource === 'preset' && connection.hasCredential === true));
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {value is string | null | undefined} */
const optionalText = value => value == null || typeof value === 'string';
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
/** @param {unknown} value @returns {value is Authorization} */
function isAuthorization(value) {
  try {
    if (!record(value) || (value.mode !== 'callback' && value.mode !== 'manual')
      || typeof value.flowId !== 'string' || !TOKEN.test(value.flowId)
      || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))
      || typeof value.authorizationUrl !== 'string') return false;
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

/** @param {unknown} value */
function isConnectionFailure(value) {
  return value == null || (record(value) && optionalText(value.code) && optionalText(value.message));
}
/** @param {unknown} value @returns {value is ProviderConnection} */
function isConnection(value) {
  if (!record(value) || typeof value.providerId !== 'string' || !PROVIDERS.has(value.providerId)
    || typeof value.status !== 'string' || !(['disconnected', 'connecting', 'connected', 'error'].includes(value.status)
      || value.status === 'configured' && isUsableModelConnection(value))
    || !Array.isArray(value.models)
    || !(/** @type {unknown[]} */ (value.models)).every(model => record(model) && typeof model.id === 'string' && typeof model.name === 'string')) return false;
  const { endpoint, inference } = value;
  return optionalText(value.catalogSource) && optionalText(value.authMethod) && optionalText(value.credentialStorage)
    && (value.hasCredential == null || typeof value.hasCredential === 'boolean') && isConnectionFailure(value.error)
    && (endpoint == null || (record(endpoint) && typeof endpoint.baseUrl === 'string' && typeof endpoint.allowLocalHttp === 'boolean'))
    && (inference == null || (record(inference) && typeof inference.status === 'string'
      && optionalText(inference.model) && isConnectionFailure(inference.error)));
}
/** @param {unknown} value */
function isAuthorizationStatus(value) {
  return value == null || (record(value)
    && [value.status, value.mode, value.flowId, value.authorizationUrl, value.expiresAt, value.message].every(optionalText)
    && (!value.authorizationUrl || (value.status === 'waiting' && isAuthorization(value))));
}
/**
 * @param {unknown} value
 * @returns {value is ConnectionSnapshot}
 */
function isSnapshot(value) {
  return record(value) && (value.storage === 'memory' || value.storage === 'system')
    && typeof value.csrfToken === 'string' && value.csrfToken.length > 0 && isAuthorizationStatus(value.oauth)
    && Array.isArray(value.connections) && value.connections.every(isConnection);
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
  /** @type {Map<AbortController, () => void>} */
  const requests = new Map();
  /**
   * @template Result
   * @param {string} path
   * @param {Record<string, unknown> | undefined} payload
   * @param {(value: unknown) => value is Result} validate
   * @returns {Promise<Result>}
   */
  async function request(path, payload, validate) {
    if (disposed) throw new Error(UNAVAILABLE);
    if (payload !== undefined && !snapshot) throw new Error(UNAVAILABLE);
    const csrfToken = snapshot?.csrfToken ?? '';
    const version = ++revision;
    const controller = new AbortController();
    /** @type {ReturnType<typeof setTimer> | undefined} */
    let timer;
    let failure = '';
    try {
      const pending = (async () => {
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
        const value = /** @type {unknown} */ (await response.json());
        if (!validate(value)) throw new Error(UNAVAILABLE);
        return value;
      })();
      /** @type {Promise<never>} */
      const interrupted = new Promise((_resolve, reject) => {
        requests.set(controller, () => { clearTimer(timer); controller.abort(); reject(new Error(UNAVAILABLE)); });
        timer = setTimer(() => { failure = '本地连接服务响应超时，请重试。'; controller.abort(); reject(new Error(failure)); }, timeoutMs);
      });
      const value = await Promise.race([pending, interrupted]);
      if (!disposed && version === revision && isSnapshot(value)) snapshot = value;
      return value;
    } catch {
      if (!disposed && version === revision && payload === undefined) snapshot = null;
      throw new Error(failure || (payload === undefined ? UNAVAILABLE : '连接操作未完成。请检查本地服务与凭据后重试；请勿自动重复提交。'));
    } finally { clearTimer(timer); requests.delete(controller); }
  }
  /** @overload @param {typeof OAUTH_START} path @param {Record<string, unknown>} [payload] @returns {Promise<Authorization>} */
  /** @overload @param {string} path @param {Record<string, unknown>} [payload] @returns {Promise<ConnectionSnapshot | Authorization>} */
  /** @param {string} path @param {Record<string, unknown>} [payload] */
  function mutate(path, payload = {}) {
    return path === OAUTH_START ? request(path, payload, isAuthorization) : request(path, payload, isSnapshot);
  }
  return {
    get ready() { return !disposed && snapshot !== null; },
    get snapshot() { return snapshot; },
    load: () => request('', undefined, isSnapshot),
    mutate,
    dispose() { disposed = true; revision++; snapshot = null; requests.forEach(cancel => cancel()); requests.clear(); },
  };
}
