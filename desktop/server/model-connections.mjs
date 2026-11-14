import { validateCustomEndpoint } from './custom-endpoint.mjs';
import { streamGuideResponse } from './guide-stream.mjs';
import { validateGuideInput } from '../design-previews/guide-contract.js';
import { validateExplainInput } from '../design-previews/explain-contract.js';
import { executeExplain } from './explain-query.mjs';
import { validateChatRequest, streamChatResponse } from './chat-stream.mjs';
import { validateAgentRequest, streamAgentResponse } from './agent-stream.mjs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { setInterval, clearInterval } from 'node:timers';
import { URLSearchParams } from 'node:url';
import { ConnectionError, discoverModels, exchangeOpenRouterCode } from './model-providers.mjs';

const BASE = '/api/model-connections';
const COOKIE = 'shipmate_models';
const IDS = ['openai', 'anthropic', 'google', 'deepseek', 'glm', 'kimi', 'openrouter', 'ollama', 'custom'];
const FLOW_TTL = 10 * 60_000;
const SESSION_TTL = 60 * 60_000;
const token = () => randomBytes(32).toString('base64url');
const equal = (left, right) => typeof left === 'string' && typeof right === 'string'
  && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const empty = providerId => ({ providerId, status: 'disconnected', authMethod: null, models: [], checkedAt: null, error: null, truncated: false, hasCredential: false, credentialStorage: null, inference: { status: 'unverified', model: null, checkedAt: null, error: null } });

const validCode = code => typeof code === 'string' && /^[\x21-\x7e]{1,4096}$/.test(code);

// Both loopback and browser callbacks use the same unambiguous parameter grammar.
export function validOAuthCallback(params, state) {
  if ([...params.keys()].some(key => !['code', 'state', 'error', 'error_description'].includes(key) || params.getAll(key).length !== 1)) return false;
  if (params.has('error')) return !params.has('code') && !params.has('state') && Boolean(params.get('error'));
  return !params.has('error_description') && validCode(params.get('code')) && equal(params.get('state'), state);
}

export function isLocalHost(req) {
  const port = req.socket.localPort;
  return [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host);
}

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 16_384) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new ConnectionError('invalid_content_type', '请使用 JSON 请求。', 415);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const timer = setTimeout(() => finish(new ConnectionError('request_timeout', '请求超时，请重试。', 408)), 5_000);
    const finish = (error, value) => {
      clearTimeout(timer);
      req.removeListener('data', onData); req.removeListener('end', onEnd);
      req.removeListener('error', onError); req.removeListener('aborted', onError);
      req.resume();
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) return finish(new ConnectionError('body_too_large', '请求内容过大。', 413));
      chunks.push(chunk);
    };
    const onError = () => finish(new ConnectionError('request_cancelled', '请求已中断。', 400));
    const onEnd = () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        finish(null, body);
      } catch { finish(new ConnectionError('invalid_json', '请求格式不正确。', 400)); }
    };
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onError);
  });
}

// Shared broker: persistence is a private injected adapter; previews use memory.
export function createModelConnectionHandler({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15_000, chatTimeoutMs = 120_000, guideRunner, guideTimeoutMs = 10_000, explainRunner, explainTimeoutMs = 10_000, maxSessions = 32, cookieName = COOKIE, credentialStore, customFetchImpl, projectToolRunner } = {}) {
  if (typeof cookieName !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(cookieName)) throw new TypeError('Invalid session cookie name');
  const sessions = new Map();
  const context = (signal, endpoint) => ({ fetchImpl, signal, timeoutMs, endpoint, customFetchImpl });
  const vaultQueues = new Map();
  const revisions = new Map();
  const vault = (id, work) => {
    const next = (vaultQueues.get(id) || Promise.resolve()).catch(() => {}).then(work);
    vaultQueues.set(id, next);
    void next.finally(() => { if (vaultQueues.get(id) === next) vaultQueues.delete(id); }).catch(() => {});
    return next;
  };
  const vaultError = () => new ConnectionError('credential_store_failed', '系统凭据操作未确认完成；请重试断开连接，再选择保存方式。', 503);
  const storageMode = value => {
    const mode = value ?? 'memory';
    if (!['memory', 'system'].includes(mode)) throw new ConnectionError('invalid_storage', '不支持此凭据保存方式。', 400);
    if (mode === 'system' && !credentialStore) throw new ConnectionError('credential_store_unavailable', '当前环境不支持系统凭据保存。', 409);
    return mode;
  };
  const validRecord = (id, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['key', 'method', 'endpoint'].includes(key))) throw vaultError();
    if (id === 'ollama' ? value.key !== '' || value.method !== 'local' : !validCode(value.key) || !['api-key', ...(id === 'openrouter' ? ['oauth'] : [])].includes(value.method)) throw vaultError();
    if (id === 'custom') return { key: value.key, method: value.method, endpoint: validateCustomEndpoint(value.endpoint) };
    if (value.endpoint !== undefined) throw vaultError();
    return { key: value.key, method: value.method };
  };
  const removeSaved = async id => {
    if (!credentialStore) return;
    try { await vault(id, () => credentialStore.delete(id)); } catch { throw vaultError(); }
  };
  const revokeAfterWrite = async (session, id, operation) => {
    try { await credentialStore.delete(id); }
    catch {
      const error = new ConnectionError('credential_cleanup_failed', '未能确认系统凭据已删除，请再次断开连接以删除凭据。', 503);
      if (revisions.get(id) === operation.revision) {
        session.credentials.delete(id);
        Object.assign(session.connections.get(id), { status: 'error', hasCredential: false, credentialStorage: 'system', error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  };
  const retain = async (session, id, record, storage, operation) => {
    if (storage === 'system') {
      try {
        await vault(id, async () => {
          if (!current(session, id, operation)) return;
          try { await credentialStore.save(id, record); }
          catch {
            // A failed acknowledgement may still have written. Queue a compensating
            // deletion on the same native actor before exposing the failed attempt.
            await revokeAfterWrite(session, id, operation);
            throw vaultError();
          }
          if (!current(session, id, operation)) await revokeAfterWrite(session, id, operation);
        });
      } catch (error) { throw error instanceof ConnectionError ? error : vaultError(); }
    }
    if (!current(session, id, operation)) return false;
    session.credentials.set(id, record);
    Object.assign(session.connections.get(id), { hasCredential: true, authMethod: record.method, credentialStorage: storage, ...(record.endpoint ? { endpoint: record.endpoint } : {}) });
    return true;
  };
  const restore = async session => {
    if (!credentialStore) return;
    for (const id of IDS) {
      try {
        const revision = revisions.get(id);
        const record = await vault(id, () => credentialStore.load(id));
        if (revision !== revisions.get(id) || !record) continue;
        const valid = validRecord(id, record);
        session.credentials.set(id, valid);
        Object.assign(session.connections.get(id), { hasCredential: true, authMethod: valid.method, credentialStorage: 'system', ...(valid.endpoint ? { endpoint: valid.endpoint } : {}) });
      } catch { Object.assign(session.connections.get(id), { status: 'error', error: { code: 'credential_store_failed', message: '无法读取系统凭据，请重试或删除此连接后重新设置。' } }); }
    }
  };
  const cleanup = session => {
    session.chat?.controller.abort();
    for (const request of session.operations.values()) request.abort();
    session.operations.clear(); session.credentials.clear(); session.oauth = null;
  };
  const discardPendingOAuth = session => {
    if (!session.oauth?.retained) return;
    session.credentials.delete('openrouter');
    Object.assign(session.connections.get('openrouter'), { hasCredential: false, credentialStorage: null, authMethod: null });
    const connection = session.connections.get('openrouter');
    const revision = revisions.get('openrouter');
    if (session.oauth.storage === 'system') void removeSaved('openrouter').catch(() => {
      if (session.connections.get('openrouter') !== connection || revisions.get('openrouter') !== revision) return;
      Object.assign(connection, { status: 'error', error: { code: 'credential_store_failed', message: '取消授权后未能删除系统凭据，请再次断开连接。' } });
    });
  };
  const expireFlow = session => {
    if (session.oauth && ['waiting', 'exchanging'].includes(session.oauth.status) && session.oauth.deadline <= now()) {
      session.operations.get('openrouter')?.abort();
      session.operations.delete('openrouter');
      discardPendingOAuth(session);
      session.oauth = { status: 'expired', deadline: session.oauth.deadline, message: '授权已过期，请重新连接。' };
      const connection = session.connections.get('openrouter');
      if (connection.status === 'connecting') {
        connection.status = 'error'; connection.error = { code: 'oauth_expired', message: '授权已过期，请重新连接。' };
      }
    }
  };
  const prune = () => {
    for (const [id, session] of sessions) {
      if (session.lastSeen + SESSION_TTL <= now()) { cleanup(session); sessions.delete(id); }
      else expireFlow(session);
    }
  };
  const sweep = setInterval(prune, 15_000);
  sweep.unref();
  const safe = session => ({
    csrfToken: session.csrf, storage: credentialStore ? 'system' : 'memory', connections: [...session.connections.values()],
    oauth: session.oauth ? { providerId: 'openrouter', status: session.oauth.status, expiresAt: new Date(session.oauth.deadline).toISOString(), message: session.oauth.message, ...(session.oauth.status === 'waiting' ? { mode: session.oauth.mode, flowId: session.oauth.flowId, authorizationUrl: session.oauth.authorizationUrl } : {}) } : null,
  });
  const cancelFlow = (session, message = '授权已取消。') => {
    if (!session.oauth || !['waiting', 'exchanging'].includes(session.oauth.status)) return;
    session.operations.get('openrouter')?.abort(); session.operations.delete('openrouter');
    discardPendingOAuth(session);
    session.oauth = { status: 'cancelled', deadline: session.oauth.deadline, message };
    const connection = session.connections.get('openrouter');
    if (connection.status === 'connecting') {
      connection.status = 'disconnected'; connection.models = [];
      connection.error = null; connection.hasCredential = session.credentials.has('openrouter');
    }
  };
  const begin = (session, providerId, preserveCatalog = false) => {
    session.operations.get(providerId)?.abort();
    const operation = new AbortController();
    if (credentialStore) { operation.revision = (revisions.get(providerId) || 0) + 1; revisions.set(providerId, operation.revision); }
    session.operations.set(providerId, operation);
    Object.assign(session.connections.get(providerId), { status: 'connecting', error: null, ...(preserveCatalog ? {} : { models: [], truncated: false, checkedAt: null }) });
    return operation;
  };
  const current = (session, id, operation) => {
    expireFlow(session);
    const owned = session.operations.get(id) === operation && !operation.signal.aborted;
    if (owned && credentialStore && revisions.get(id) !== operation.revision) {
      session.credentials.delete(id);
      Object.assign(session.connections.get(id), { status: 'error', hasCredential: false, error: { code: 'credential_store_superseded', message: '此连接已在另一会话中更新，请重新读取系统凭据。' } });
      return false;
    }
    return owned;
  };
  const fail = (session, id, error) => {
    const safeError = error instanceof ConnectionError ? { code: error.code, message: error.message } : { code: 'connection_failed', message: '连接未完成，请重试。' };
    Object.assign(session.connections.get(id), { status: 'error', error: safeError });
    return safeError;
  };
  const discover = async (session, id, key, method, operation, endpoint) => {
    const result = await discoverModels(id, key, context(operation.signal, endpoint));
    if (!current(session, id, operation)) return false;
    const recoveredCredential = session.credentials.get(id);
    session.credentials.set(id, { key, method, ...(endpoint ? { endpoint } : {}) });
    Object.assign(session.connections.get(id), { status: id === 'glm' ? 'configured' : 'connected', authMethod: method, models: result.models, truncated: result.truncated, checkedAt: id === 'glm' ? null : new Date(now()).toISOString(), error: null, hasCredential: true, credentialStorage: session.connections.get(id).credentialStorage || 'memory', ...(id === 'glm' ? { catalogSource: 'preset', inference: empty(id).inference } : {}) });
    if (id === 'openrouter' && method === 'oauth' && session.oauth?.status === 'error' && recoveredCredential && session.oauth.recoveryCredential === recoveredCredential) {
      session.oauth = { status: 'success', deadline: session.oauth.deadline, message: '授权有效，模型目录已更新。' };
    }
    return true;
  };
  const completeOAuth = async (session, flow, code) => {
    flow.status = 'exchanging'; flow.message = '正在完成授权并读取模型目录…';
    const operation = begin(session, 'openrouter');
    let exchangedKey;
    try {
      const key = await exchangeOpenRouterCode(code, flow.verifier, context(operation.signal));
      if (!current(session, 'openrouter', operation)) return;
      if (!await retain(session, 'openrouter', { key, method: 'oauth' }, flow.storage, operation)) return;
      flow.retained = true;
      exchangedKey = key;
      const connected = await discover(session, 'openrouter', key, 'oauth', operation);
      if (connected) session.oauth = { status: 'success', deadline: flow.deadline, message: '授权完成，模型目录已更新。' };
    } catch (error) {
      if (current(session, 'openrouter', operation)) {
        // Only the active flow may retain a key after a catalog failure.
        // Cancellation/disconnect must never resurrect a credential.
        if (exchangedKey) {
          session.credentials.set('openrouter', { key: exchangedKey, method: 'oauth' });
          Object.assign(session.connections.get('openrouter'), { authMethod: 'oauth', hasCredential: true });
        }
        const detail = fail(session, 'openrouter', error);
        session.oauth = { status: 'error', deadline: flow.deadline, message: detail.message,
          ...(exchangedKey ? { recoveryCredential: session.credentials.get('openrouter') } : {}),
        };
      }
    } finally {
      if (session.oauth === flow && flow.status === 'exchanging' && credentialStore && revisions.get('openrouter') !== operation.revision) {
        session.oauth = { status: 'error', deadline: flow.deadline, message: '此授权已被另一会话的连接更新取代，请重新读取系统凭据。' };
      }
      if (session.operations.get('openrouter') === operation) session.operations.delete('openrouter');
      // The verifier and state are no longer needed, including cancelled flows.
      delete flow.verifier; delete flow.state; delete flow.transaction;
    }
  };
  const redirect = res => {
    res.writeHead(303, { Location: '/settings.html?provider=openrouter#key', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
    res.end();
  };

  const handle = async (req, res) => {
    const pathname = req.url.split('?')[0];
    if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return false;
    try {
      if (!isLocalHost(req)) throw new ConnectionError('invalid_host', '请从本机地址打开设置。', 403);
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      const callback = url.pathname.startsWith(`${BASE}/oauth/callback/`);
      if (!callback && ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site')) throw new ConnectionError('invalid_origin', '此请求不是来自当前设置页面。', 403);
      prune();
      const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      let session = sessions.get(cookie);
      if (session && session.origin !== origin) session = null;
      if (!session && req.method === 'GET' && url.pathname === BASE) {
        if (sessions.size >= maxSessions) throw new ConnectionError('session_limit', '本地连接会话已满，请稍后重试或重启服务。', 429);
        const id = token();
        session = { origin, csrf: token(), lastSeen: now(), connections: new Map(IDS.map(id => [id, empty(id)])), credentials: new Map(), operations: new Map(), oauth: null };
        sessions.set(id, session);
        await restore(session);
        res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=${BASE}; Max-Age=3600`);
      }
      if (!session) throw new ConnectionError('session_expired', '连接会话已失效，请刷新页面重新连接。', 401);
      session.lastSeen = now();
      if (callback) {
        if (req.method !== 'GET') throw new ConnectionError('method_not_allowed', '此入口只接受授权回调。', 405);
        const flow = session.oauth;
        const transaction = url.pathname.slice(`${BASE}/oauth/callback/`.length);
        if (!flow || flow.status !== 'waiting' || flow.mode !== 'callback' || !equal(transaction, flow.transaction)) throw new ConnectionError('invalid_callback', '授权已失效或已处理，请重新发起登录。', 400);
        if (!validOAuthCallback(url.searchParams, flow.state)) throw new ConnectionError('invalid_callback', '授权回调格式或校验无效。', 400);
        // A denial omits state in OpenRouter's documented protocol. The unguessable
        // callback path plus the originating HTTP-only session still bind it.
        if (url.searchParams.has('error')) {
          session.oauth = { status: 'error', deadline: flow.deadline, message: '未获得授权。你可以重新连接。' };
          redirect(res); return true;
        }
        const code = url.searchParams.get('code');
        await completeOAuth(session, flow, code);
        redirect(res); return true;
      }
      if (req.method === 'GET' && url.pathname === BASE) { reply(res, 200, safe(session)); return true; }
      if (req.method !== 'POST') throw new ConnectionError('method_not_allowed', '此操作需要 POST 请求。', 405);
      if (req.headers.origin !== origin || !equal(req.headers['x-shipmate-csrf'], session.csrf)) throw new ConnectionError('invalid_csrf', '连接会话校验失败，请刷新设置页面。', 403);
      const route = url.pathname.slice(BASE.length + 1).split('/');
      const [id, action, oauthAction] = route;
      const body = await readBody(req, ['chat', 'agent'].includes(action) && route.length === 2 ? 65_536 : 16_384);
      if (id === 'tools' && action === 'explain' && route.length === 2) {
        const validation = validateExplainInput(body);
        if (!validation.ok) throw new ConnectionError('invalid_explain', validation.error, 400);
        if (session.chat || session.operations.size || ['waiting', 'exchanging'].includes(session.oauth?.status)) throw new ConnectionError('chat_busy', '当前操作尚未结束，请稍后重试。', 409);
        const run = { providerId: null, controller: new AbortController() };
        session.chat = run;
        const closed = () => run.controller.abort();
        res.once('close', closed);
        try {
          const output = await executeExplain(body.query.trim(), { explainRunner, signal: run.controller.signal, timeoutMs: explainTimeoutMs });
          if (!res.destroyed) reply(res, 200, output);
        } finally { res.removeListener('close', closed); if (session.chat === run) session.chat = null; }
        return true;
      }
      if (id === 'tools' && action === 'guide' && route.length === 2) {
        const validation = validateGuideInput(body);
        if (!validation.ok) throw new ConnectionError('invalid_guide', validation.error, 400);
        if (session.chat || session.operations.size || ['waiting', 'exchanging'].includes(session.oauth?.status)) throw new ConnectionError('chat_busy', '当前操作尚未结束，请稍后重试。', 409);
        const run = { providerId: null, controller: new AbortController() };
        session.chat = run;
        const closed = () => run.controller.abort();
        res.once('close', closed);
        try { await streamGuideResponse(res, body, { guideRunner, signal: run.controller.signal, timeoutMs: guideTimeoutMs }); }
        finally { res.removeListener('close', closed); if (session.chat === run) session.chat = null; }
        return true;
      }
      if (!IDS.includes(id)) throw new ConnectionError('unknown_provider', '不支持此模型服务商。', 404);
      if (action === 'agent' && route.length === 2) {
        validateAgentRequest(body, id);
        const requestId = req.headers['x-shipmate-request-id'];
        if (typeof projectToolRunner !== 'function' || typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId)) throw new ConnectionError('agent_unavailable', '请在桌面端选择当前项目并开启只读工具。', 409);
        const connection = session.connections.get(id);
        if (connection.status !== 'connected' || !session.credentials.has(id)) throw new ConnectionError('connection_required', '请先连接此服务商。', 409);
        if (!connection.models.some(model => model.id === body.model)) throw new ConnectionError('invalid_model', '请选择当前连接目录中的模型。', 400);
        if (session.chat || session.operations.size || ['waiting', 'exchanging'].includes(session.oauth?.status)) throw new ConnectionError('chat_busy', '当前操作尚未结束，请稍后重试。', 409);
        const run = { providerId: id, controller: new AbortController() };
        session.chat = run;
        const closed = () => run.controller.abort();
        res.once('close', closed);
        try { await streamAgentResponse(res, session.credentials.get(id).key, body, { providerId: id, fetchImpl, requestId, projectToolRunner, signal: run.controller.signal, timeoutMs: chatTimeoutMs }); }
        finally { res.removeListener('close', closed); if (session.chat === run) session.chat = null; }
        return true;
      }
      if (action === 'chat' && route.length === 2) {
        validateChatRequest(id, body);
        const connection = session.connections.get(id);
        if (!(connection.status === 'connected' || id === 'glm' && connection.status === 'configured') || !session.credentials.has(id)) throw new ConnectionError('connection_required', '请先连接此服务商。', 409);
        if (!connection.models.some(model => model.id === body.model)) throw new ConnectionError('invalid_model', '请选择当前连接目录中的模型。', 400);
        if (session.chat || session.operations.size || ['waiting', 'exchanging'].includes(session.oauth?.status)) throw new ConnectionError('chat_busy', '当前操作尚未结束，请稍后重试。', 409);
        const run = { providerId: id, controller: new AbortController() };
        session.chat = run;
        const closed = () => run.controller.abort();
        res.once('close', closed);
        try { await streamChatResponse(res, id, session.credentials.get(id).key, body, { fetchImpl, customFetchImpl, endpoint: session.credentials.get(id).endpoint, signal: run.controller.signal, timeoutMs: chatTimeoutMs }); }
        finally { res.removeListener('close', closed); if (session.chat === run) session.chat = null; }
        return true;
      }
      if (action === 'verify' && route.length === 2) {
        if (Object.keys(body).length !== 1 || typeof body.model !== 'string') throw new ConnectionError('invalid_parameters', '请选择需要测试的模型。', 400);
        const connection = session.connections.get(id), credential = session.credentials.get(id);
        if (!(connection.status === 'connected' || id === 'glm' && connection.status === 'configured') || !credential) throw new ConnectionError('connection_required', '请先连接此服务商。', 409);
        if (!connection.models.some(model => model.id === body.model)) throw new ConnectionError('invalid_model', '请选择当前连接目录中的模型。', 400);
        if (session.chat || session.operations.size || ['waiting', 'exchanging'].includes(session.oauth?.status)) throw new ConnectionError('chat_busy', '当前操作尚未结束，请稍后重试。', 409);
        const run = { providerId: id, controller: new AbortController() };
        session.chat = run;
        const closed = () => run.controller.abort();
        res.once('close', closed);
        connection.inference = { status: 'checking', model: body.model, checkedAt: null, error: null };
        let finished = false, failure = null, bytes = 0;
        const sink = {
          destroyed: false, writeHead() {}, end() {},
          write(chunk) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > 16_384) { run.controller.abort(); failure = '测试回复超出限制。'; return true; }
            for (const frame of chunk.split('\n\n')) {
              if (!frame.startsWith('data: ') || frame === 'data: [DONE]') continue;
              try {
                const event = JSON.parse(frame.slice(6));
                if (event.type === 'finish') finished = true;
                if (event.type === 'error') failure = '推理测试未完成，请检查权限、额度或网络后重试。';
              } catch { failure = '推理测试响应格式无效。'; }
            }
            return true;
          },
        };
        try {
          await streamChatResponse(sink, id, credential.key, { model: body.model, messages: [{ role: 'user', content: 'Reply with OK only.' }] }, { fetchImpl, customFetchImpl, endpoint: credential.endpoint, signal: run.controller.signal, timeoutMs: Math.min(timeoutMs, 15_000), maxOutputTokens: 32 });
          const success = finished && !failure && !run.controller.signal.aborted;
          if (session.connections.get(id) === connection) connection.inference = { status: success ? 'verified' : 'error', model: body.model, checkedAt: new Date(now()).toISOString(), error: success ? null : { code: 'inference_failed', message: failure || '测试已停止或未完成，请重试。' } };
        } finally { res.removeListener('close', closed); if (session.chat === run) session.chat = null; }
        if (!res.destroyed) reply(res, 200, safe(session));
        return true;
      }
      if (session.chat && action !== 'disconnect' && !(action === 'oauth' && oauthAction === 'cancel')) throw new ConnectionError('chat_busy', '请先停止当前回复再更改连接。', 409);
      if (action === 'oauth' && route.length === 3 && id === 'openrouter') {
        const allowedFields = oauthAction === 'start' ? ['mode', 'storage'] : oauthAction === 'complete' ? ['flowId', 'code'] : [];
        if (Object.keys(body).some(key => !allowedFields.includes(key))) throw new ConnectionError('invalid_parameters', '授权请求包含不支持的参数。', 400);
        if (oauthAction === 'cancel') { cancelFlow(session); reply(res, 200, safe(session)); return true; }
        if (oauthAction === 'complete') {
          expireFlow(session);
          const flow = session.oauth;
          if (!flow || flow.status !== 'waiting' || flow.mode !== 'manual' || !equal(body.flowId, flow.flowId)) throw new ConnectionError('invalid_flow', '授权已失效或已处理，请重新连接。', 409);
          if (!validCode(body.code)) throw new ConnectionError('invalid_code', '授权码无效，请重新登录。', 400);
          await completeOAuth(session, flow, body.code);
          reply(res, 200, safe(session)); return true;
        }
        if (oauthAction !== 'start') throw new ConnectionError('not_found', '未知连接操作。', 404);
        const mode = body.mode === undefined ? 'callback' : body.mode;
        if (!['callback', 'manual'].includes(mode)) throw new ConnectionError('invalid_parameters', '不支持此授权方式。', 400);
        const storage = storageMode(body.storage);
        cancelFlow(session);
        const replacement = begin(session, id);
        try { await removeSaved(id); } catch (error) { if (current(session, id, replacement)) { fail(session, id, error); session.operations.delete(id); } throw error; }
        if (!current(session, id, replacement)) { reply(res, 200, safe(session)); return true; }
        session.credentials.delete(id); session.connections.set(id, empty(id));
        session.operations.delete(id);
        const previous = session.connections.get(id);
        if (previous.status === 'connecting') Object.assign(previous, { status: 'disconnected', models: [], error: null });
        const flowId = token();
        const flow = { storage, mode, flowId, transaction: flowId, state: token(), verifier: token(), deadline: now() + FLOW_TTL, status: 'waiting', message: '请在 OpenRouter 页面完成授权。' };
        session.oauth = flow;
        const authorization = new URL('https://openrouter.ai/auth');
        authorization.search = new URLSearchParams({ ...(mode === 'callback' ? { callback_url: `${origin}${BASE}/oauth/callback/${flow.transaction}`, state: flow.state } : {}), code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256', key_label: 'Shipmate local' }).toString();
        flow.authorizationUrl = authorization.href;
        reply(res, 200, { mode, flowId: flow.flowId, authorizationUrl: authorization.href, expiresAt: new Date(flow.deadline).toISOString() }); return true;
      }
      if (route.length !== 2 || !['connect', 'refresh', 'disconnect'].includes(action)) throw new ConnectionError('not_found', '未知连接操作。', 404);
      const allowed = action === 'connect' ? ['storage', ...(id !== 'ollama' ? ['apiKey'] : []), ...(id === 'custom' ? ['endpoint'] : [])] : [];
      if (Object.keys(body).some(key => !allowed.includes(key))) throw new ConnectionError('invalid_parameters', '请求包含不支持的参数。', 400);
      let key, method, endpoint, storage;
      if (action === 'connect') { storage = storageMode(body.storage); if (id === 'custom') endpoint = validateCustomEndpoint(body.endpoint); }
      if (action === 'connect') {
        key = id === 'ollama' ? '' : body.apiKey;
        if (id !== 'ollama' && (typeof key !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(key))) throw new ConnectionError('invalid_key', 'API Key 不能为空，也不能包含空白或非 ASCII 字符。', 400);
        method = id === 'ollama' ? 'local' : 'api-key';
      }
      if (id === 'openrouter') cancelFlow(session);
      if (id === 'openrouter' && action === 'connect') session.oauth = null;
      if (action === 'disconnect') {
        if (session.chat?.providerId === id) session.chat.controller.abort();
        const operation = begin(session, id);
        session.credentials.delete(id);
        try { await removeSaved(id); } catch (error) { if (current(session, id, operation)) { Object.assign(session.connections.get(id), { hasCredential: false }); fail(session, id, error); session.operations.delete(id); } throw error; }
        if (current(session, id, operation)) { session.connections.set(id, empty(id)); session.operations.delete(id); }
        if (id === 'openrouter') session.oauth = null;
        reply(res, 200, safe(session)); return true;
      }
      if (action === 'refresh') {
        const saved = session.credentials.get(id);
        if (!saved && !credentialStore) throw new ConnectionError('credentials_required', '请先连接此服务商。', 409);
        if (saved) ({ key, method, endpoint } = saved);
      }
      const operation = begin(session, id, action === 'refresh');
      try {
        if (action === 'refresh' && credentialStore && (!session.credentials.has(id) || session.connections.get(id).credentialStorage === 'system')) {
          let record;
          try { record = await vault(id, () => credentialStore.load(id)); if (record) record = validRecord(id, record); }
          catch { throw vaultError(); }
          if (!current(session, id, operation)) { reply(res, 200, safe(session)); return true; }
          if (!record) {
            session.credentials.delete(id); session.connections.set(id, empty(id));
            reply(res, 200, safe(session)); return true;
          }
          session.credentials.set(id, record);
          ({ key, method, endpoint } = record);
          Object.assign(session.connections.get(id), { hasCredential: true, authMethod: method, credentialStorage: 'system', ...(endpoint ? { endpoint } : {}) });
        }
        if (action === 'connect') {
          await removeSaved(id);
          if (!current(session, id, operation)) { reply(res, 200, safe(session)); return true; }
          session.credentials.delete(id);
          Object.assign(session.connections.get(id), { hasCredential: false, credentialStorage: null, authMethod: null, inference: empty(id).inference });
        }
        await discover(session, id, key, method, operation, endpoint);
        if (action === 'connect' && current(session, id, operation)) {
          session.credentials.delete(id);
          Object.assign(session.connections.get(id), { hasCredential: false, credentialStorage: null });
          await retain(session, id, { key, method, ...(endpoint ? { endpoint } : {}) }, storage, operation);
        }
      }
      catch (error) { if (current(session, id, operation)) fail(session, id, error); }
      finally { if (session.operations.get(id) === operation) session.operations.delete(id); }
      reply(res, 200, safe(session)); return true;
    } catch (error) {
      const known = error instanceof ConnectionError;
      reply(res, known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : '本地连接服务暂时不可用，请重试。' } });
      return true;
    }
  };
  handle.dispose = () => { clearInterval(sweep); for (const session of sessions.values()) cleanup(session); sessions.clear(); };
  return handle;
}
