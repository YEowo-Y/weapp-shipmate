/* global TextEncoder */
import { validateAgentInput, validateAgentResult } from './agent-contract.js';
import { validateGuideInput, validateGuideResult } from './guide-contract.js';
import { validateDemoResult } from './demo-result.js';
import { SUPPORTED_CHAT_PROVIDERS } from './chat-transport.js';

const MAX_BYTES = 20 * 1024 * 1024;
const runStates = ['idle', 'working', 'streaming', 'complete', 'stopped', 'error'];
const active = state => state === 'working' || state === 'streaming';
const failure = (code, message = '无法读取或保存本地会话。') => Object.assign(new Error(message), { code });
const invalid = () => { throw failure('invalid', '会话存档格式无效；原记录未被修改。'); };
const record = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function boundedText(value, max = 2 * 1024 * 1024) { if (typeof value !== 'string') invalid(); if (value.length > max) throw failure('limit'); return value; }
function id(value) { if (!boundedText(value, 256).trim()) invalid(); return value; }
function number(value, min = 0) { if (!Number.isFinite(value) || value < min) invalid(); return value; }
function integer(value) { number(value); if (!Number.isSafeInteger(value)) invalid(); return value; }
function boolean(value) { if (typeof value !== 'boolean') invalid(); return value; }
const choice = values => value => { if (!values.includes(value)) invalid(); return value; };
function boundedList(value, convert, max = 2000) { if (!Array.isArray(value)) invalid(); if (value.length > max) throw failure('limit'); return value.map(convert); }
function fields(value, schema, required = []) {
  if (!record(value)) invalid();
  const result = {};
  for (const name of Object.keys(schema)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || descriptor.value === undefined) { if (required.includes(name)) invalid(); continue; }
    if (!Object.hasOwn(descriptor, 'value')) invalid();
    result[name] = schema[name](descriptor.value);
  }
  return result;
}
const runId = value => typeof value === 'number' ? integer(value) : id(value);
const nullable = convert => value => value === null ? null : convert(value);
// Export retains the same field/type validation while lifting storage capacity limits.
function sessionSchema(exporting) {
  const text = (value, max) => boundedText(value, exporting ? Infinity : max);
  const list = (value, convert, max) => boundedList(value, convert, exporting ? Infinity : max);
  const strings = value => list(value, item => text(item, 4096), 500);
  const scenario = choice(['normal', 'timeout', 'tool-failure']);
  const context = value => ({ references: [], pendingScenario: 'normal', ...fields(value, { references: strings, pendingScenario: scenario }) });
  const model = value => fields(value, { providerId: choice(Object.keys(SUPPORTED_CHAT_PROVIDERS)), model: id, label: value => text(value, 4096) }, ['providerId', 'model']);
  const live = value => ({ ...model(value), messages: list(value.messages, item => fields(item, { role: choice(['user', 'assistant']), content: text }, ['role', 'content'])) });
  const errorData = value => fields(value, { code: id, message: text, retryable: boolean });
  const guide = value => { const output = fields(value, { subject: text, sensitive: boolean, domain: boolean }, ['subject', 'sensitive', 'domain']); if (!validateGuideInput(output).ok) invalid(); return output; };
  function resultData(value) {
    if (!(validateGuideResult(value).ok || validateDemoResult(value).ok || validateAgentResult(value).ok)) invalid();
    // Keep the complete bounded artifact, including schema-validated inert signal data.
    return JSON.parse(JSON.stringify(value));
  }
  function source(value) {
    text(value, 4096);
    if (/^(?:audit|stage-workspace|guided-step|category-advisor)\.html(?:[?#][^\s]*)?$/.test(value)) return value;
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return value; } catch { /* invalid source */ }
    return invalid();
  }
  const tool = value => fields(value, {
    label: text, state: nullable(choice(['running', 'success', 'fail', 'canceled'])), name: id, kind: choice(['guide', 'project']), toolCallId: id, summary: strings,
    parameters: parameters => { if (value.kind === 'project') { if (!validateAgentInput(parameters).ok) invalid(); return { ...parameters }; } return fields(parameters, { subject: text, sensitive: boolean, domain: boolean, source: text, readOnly: boolean }); },
  });
  const review = value => fields(value, { state: choice(['pending', 'accepted', 'rejected', 'stale']), kind: choice(['local-demo-change']), files: strings, summary: text, runId, sessionId: id, reason: text }, ['state']);
  const trace = value => fields(value, { runId, state: choice(runStates), elapsedMs: number, kind: choice(['guide']) }, ['state']);
  const part = value => {
    if (value?.type === 'text') return fields(value, { type: choice(['text']), text, textId: id }, ['type', 'text']);
    const output = fields(value, { type: choice(['tool']), tool, result: nullable(resultData), error: nullable(errorData) }, ['type', 'tool']);
    if (output.tool.kind === 'project' && (output.tool.name !== 'project_read' || !output.tool.toolCallId || (output.result && (!validateAgentResult(output.result).ok || output.result.kind !== output.tool.parameters?.kind || output.tool.state !== 'success')) || (output.tool.state === 'success' && !output.result))) invalid();
    return output;
  };
  const message = value => fields(value, {
    id, role: choice(['user', 'assistant']), text, status: choice(runStates), sourceUserId: id, branchNote: text,
    record: value => fields(value, { kind: choice(['note', 'report']), label: value => text(value, 4096) }, ['kind', 'label']),
    references: strings, live: nullable(live), guide: nullable(guide), tool: nullable(tool), parts: value => list(value, part, 4000),
    structuredResult: nullable(resultData), fact: nullable(value => fields(value, { label: text, text, source })),
    advice: nullable(value => fields(value, { text })), review: nullable(review), trace: nullable(trace), error: nullable(errorData),
  }, ['id', 'role', 'text']);
  const disclosure = value => fields(value, { component: id, open: boolean }, ['component', 'open']);
  const view = value => fields(value, {
    scrollTop: number, followLatest: boolean, readingDetails: boolean,
    readingAnchor: nullable(value => fields(value, { messageId: id, component: id, readingKey: id }, ['messageId'])),
    disclosures: value => list(value, item => ({ ...fields(item, { messageId: id }, ['messageId']), ...disclosure(item) }), 20000),
    readingPositions: value => list(value, item => fields(item, { messageId: id, key: id, top: number, left: value => number(value, -1e9) }, ['messageId', 'key', 'top', 'left']), 20000),
    guideResults: value => list(value, item => fields(item, { messageId: id, state: value => fields(value, { query: text, disclosures: value => list(value, disclosure, 100) }) }, ['messageId', 'state'])),
  });
  const session = value => ({ references: [], pendingScenario: 'normal', ...fields(value, {
    id, projectId: nullable(id), title: value => text(value, 4096), draft: text, references: strings, pendingScenario: scenario, autoTitle: boolean, archived: boolean,
    messages: value => list(value, message), modelSelection: nullable(model), viewState: nullable(view),
    draftView: nullable(value => fields(value, { selectionStart: integer, selectionEnd: integer, selectionDirection: choice(['none', 'forward', 'backward']), scrollTop: number })),
    edit: nullable(value => fields(value, { messageId: id, originalDraft: text, originalContext: context }, ['messageId', 'originalDraft'])),
  }, ['id', 'title', 'draft', 'messages']) });
  return session;
}

export function normalizeSessionSnapshot(snapshot, { restore = false, maxBytes = MAX_BYTES, mode = 'storage' } = {}) {
  if (!['storage', 'export'].includes(mode)) invalid();
  if (mode === 'export') maxBytes = Infinity;
  if (maxBytes !== Infinity) number(maxBytes);
  const session = sessionSchema(mode === 'export');
  if (!record(snapshot)) invalid();
  if (snapshot.version !== 1) throw failure('version', '会话存档版本不受支持；原记录未被修改。');
  const output = fields(snapshot, { version: choice([1]), currentSessionId: id, sessionSequence: integer, projectCurrentSessions: value => boundedList(value, item => fields(item, { projectId: nullable(id), sessionId: id }, ['projectId', 'sessionId']), 201), sessions: value => boundedList(value, session, mode === 'export' ? Infinity : 200) }, ['version', 'currentSessionId', 'sessionSequence', 'sessions']);
  const ids = new Set(), messageIds = new Set();
  for (const item of output.sessions) {
    if (ids.has(item.id)) invalid(); ids.add(item.id);
    const sequence = /^session-(\d+)$/.exec(item.id);
    if (sequence && Number(sequence[1]) > output.sessionSequence) invalid();
    const users = new Set(item.messages.filter(message => message.role === 'user').map(message => message.id));
    if (item.edit && !users.has(item.edit.messageId)) invalid();
    if (item.draftView && (item.draftView.selectionStart > item.draft.length || item.draftView.selectionEnd > item.draft.length || item.draftView.selectionStart > item.draftView.selectionEnd)) invalid();
    for (const msg of item.messages) {
      if (messageIds.has(msg.id)) invalid(); messageIds.add(msg.id);
      if (msg.sourceUserId && !users.has(msg.sourceUserId)) invalid();
      const projectTools = (msg.parts || []).filter(part => part.tool?.kind === 'project');
      if (projectTools.length > 2 || new Set(projectTools.map(part => part.tool.toolCallId)).size !== projectTools.length) invalid();
      if (!restore) continue;
      const interrupted = active(msg.status) || active(msg.trace?.state) || msg.tool?.state === 'running' || msg.parts?.some(part => part.tool?.state === 'running');
      if (interrupted) {
        msg.status = 'stopped'; msg.branchNote = '页面刷新中断了上次回复；已保留已有内容。';
        if (msg.trace && active(msg.trace.state)) msg.trace.state = 'stopped';
        if (msg.tool?.state === 'running') msg.tool.state = 'canceled';
        for (const part of msg.parts || []) if (part.tool?.state === 'running') part.tool.state = 'canceled';
      }
      if (['pending', 'accepted'].includes(msg.review?.state)) {
        msg.review.state = 'stale'; msg.review.summary = '历史审批已过期；请基于最新内容重新生成。';
      }
    }
  }
  if (!ids.has(output.currentSessionId)) invalid();
  const scopes = new Set();
  for (const reference of output.projectCurrentSessions || []) {
    const target = output.sessions.find(item => item.id === reference.sessionId);
    if (scopes.has(reference.projectId) || !target || (target.projectId ?? null) !== reference.projectId) invalid();
    scopes.add(reference.projectId);
  }
  if (new TextEncoder().encode(JSON.stringify(output)).byteLength > maxBytes) throw failure('limit', '会话存档超过 20 MiB，请先备份。');
  return output;
}

function storageError(error) {
  if (['invalid', 'version', 'limit', 'quota', 'conflict', 'unavailable', 'version-change'].includes(error?.code)) return error;
  return failure(error?.name === 'QuotaExceededError' ? 'quota' : error?.name === 'VersionError' ? 'version' : 'unavailable');
}

export function createSessionStore({ indexedDB = globalThis.indexedDB, databaseName = 'shipmate-chat-history', workspace = 'my-miniprogram' } = {}) {
  id(workspace); id(databaseName);
  let closed = false, connection = null, opening = null, cancelOpen = null;
  let closedError = failure('unavailable');
  const transactions = new Set();
  function close() {
    closed = true; cancelOpen?.();
    for (const transaction of transactions) { try { transaction.abort(); } catch { /* already settled */ } }
    connection?.close(); connection = null;
  }
  function open() {
    if (closed) return Promise.reject(closedError);
    if (!indexedDB?.open) return Promise.reject(failure('unavailable'));
    if (connection) return Promise.resolve(connection);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      let request, settled = false;
      const timer = setTimeout(() => finish(failure('unavailable')), 5000);
      function finish(error, db) {
        if (settled) { db?.close(); return; }
        settled = true; clearTimeout(timer); cancelOpen = null;
        if (error) reject(storageError(error)); else { connection = db; resolve(db); }
      }
      cancelOpen = () => finish(failure('unavailable'));
      try { request = indexedDB.open(databaseName, 1); } catch (error) { finish(error); return; }
      request.onblocked = () => finish(failure('unavailable', '其他页面阻止了历史数据库打开，请关闭旧页面后重试。'));
      request.onerror = () => finish(request.error);
      request.onupgradeneeded = () => {
        if (settled || closed) { request.transaction?.abort(); return; }
        try { if (!request.result.objectStoreNames.contains('workspaces')) request.result.createObjectStore('workspaces'); }
        catch (error) { request.transaction?.abort(); finish(error); }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (closed || settled) { db.close(); return; }
        db.onversionchange = () => { closedError = failure('version-change', '历史数据库版本已更改，请先备份当前内容再重新加载页面。'); close(); };
        db.onclose = () => { if (connection === db) connection = null; };
        finish(null, db);
      };
    }).finally(() => { opening = null; });
    return opening;
  }
  async function transact(snapshot, expectedRevision) {
    const db = await open();
    if (closed) throw closedError;
    return new Promise((resolve, reject) => {
      let transaction, result, problem, settled = false;
      const finish = error => { if (settled) return; settled = true; clearTimeout(timer); transactions.delete(transaction); if (error) reject(storageError(error)); else resolve(result); };
      const timer = setTimeout(() => { problem = failure('unavailable'); try { transaction?.abort(); } catch { /* already settled */ } finish(problem); }, 10000);
      try {
        transaction = db.transaction('workspaces', snapshot ? 'readwrite' : 'readonly'); transactions.add(transaction);
        transaction.oncomplete = () => finish(problem);
        transaction.onabort = () => finish(closed ? closedError : problem || transaction.error || failure('unavailable'));
        transaction.onerror = event => { problem ||= event.target?.error || transaction.error || failure('unavailable'); };
        const store = transaction.objectStore('workspaces'), request = store.get(workspace);
        request.onsuccess = () => {
          try {
            const current = request.result;
            let revision = 0, saved = null;
            if (current !== undefined) {
              if (!record(current) || !Number.isSafeInteger(current.revision) || current.revision < 1) invalid();
              revision = current.revision;
              saved = normalizeSessionSnapshot(current.snapshot, { restore: !snapshot });
            }
            if (!snapshot) result = { revision, snapshot: saved };
            else {
              if (revision !== expectedRevision) throw failure('conflict', '其他页面已保存更新，当前内容未覆盖历史记录。');
              if (!Number.isSafeInteger(revision + 1)) throw failure('limit');
              store.put({ revision: revision + 1, snapshot }, workspace);
              result = { revision: revision + 1 };
            }
          } catch (error) { problem = storageError(error); transaction.abort(); }
        };
        request.onerror = () => { problem = storageError(request.error); };
      } catch (error) { finish(error); }
    });
  }
  return {
    load: () => transact(null),
    async save(snapshot, expectedRevision) { integer(expectedRevision); const normalized = normalizeSessionSnapshot(snapshot); return transact(normalized, expectedRevision); },
    close,
  };
}
