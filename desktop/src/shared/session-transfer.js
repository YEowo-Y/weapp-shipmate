// @ts-check
/* global TextEncoder */
import { normalizeSessionSnapshot } from './session-store.js';

/** @typedef {import('./session-store.js').SessionSnapshot} SessionSnapshot */

export const SESSION_BACKUP_MAX_BYTES = 20 * 1024 * 1024;
/** @param {string} code @param {string} message */
const failure = (code, message) => Object.assign(new Error(message), { code });
const invalidReference = () => failure('invalid', '备份中的会话或消息引用无效；原记录未被修改。');

/** @param {SessionSnapshot['sessions'][number]['viewState']} view */
function viewReferences(view) {
  return [view?.readingAnchor, ...(view?.disclosures || []),
    ...(view?.readingPositions || []), ...(view?.guideResults || [])].filter(reference => reference != null);
}

/** @param {SessionSnapshot} snapshot */
function validateReferences(snapshot) {
  for (const session of snapshot.sessions) {
    const messageIds = new Set(session.messages.map(message => message.id));
    if (viewReferences(session.viewState).some(reference => !messageIds.has(reference.messageId)) ||
        session.messages.some(message => message.review?.sessionId && message.review.sessionId !== session.id)) {
      throw invalidReference();
    }
  }
  return snapshot;
}

// Provenance comes from this boundary, never from a claim inside the backup.
/** @param {SessionSnapshot} snapshot */
function importedHistory(snapshot) {
  for (const session of snapshot.sessions) for (const message of session.messages) {
    message.provenance = 'imported';
    if (message.tool) message.tool.provenance = 'imported';
    for (const part of message.parts || []) if (part.type === 'tool') part.tool.provenance = 'imported';
  }
  return snapshot;
}

/**
 * Only Shipmate session snapshots are accepted; imported execution is never resumed.
 * @param {unknown} text
 */
export function parseSessionBackup(text) {
  if (typeof text !== 'string') throw failure('invalid', '请选择有效的会话 JSON 备份。');
  if (text.length > SESSION_BACKUP_MAX_BYTES || new TextEncoder().encode(text).byteLength > SESSION_BACKUP_MAX_BYTES) {
    throw failure('limit', '会话备份超过 20 MiB；原记录未被修改。');
  }
  /** @type {unknown} */
  let source;
  try { source = JSON.parse(text); }
  catch { throw failure('invalid', '无法解析会话备份，请选择有效的 JSON 文件。'); }
  return importedHistory(validateReferences(normalizeSessionSnapshot(source, { restore: true })));
}

/**
 * Append independent copies; current drafts, active session and approval state stay intact.
 * @param {unknown} current
 * @param {unknown} importedSnapshot
 */
export function mergeSessionBackup(current, importedSnapshot) {
  const snapshot = normalizeSessionSnapshot(current);
  const imported = importedHistory(validateReferences(normalizeSessionSnapshot(importedSnapshot, { restore: true })));
  const sessionIds = new Set(snapshot.sessions.map(session => session.id));
  const messageIds = new Set(snapshot.sessions.flatMap(session => session.messages.map(message => message.id)));
  let messageCount = 0;
  for (const session of imported.sessions) {
    let sessionId;
    do {
      if (snapshot.sessionSequence >= Number.MAX_SAFE_INTEGER) throw failure('limit', '会话标识已达到上限。');
      sessionId = `session-${++snapshot.sessionSequence}`;
    } while (sessionIds.has(sessionId));
    sessionIds.add(sessionId);
    /** @type {Map<string, string>} */
    const remap = new Map();
    let index = 0;
    for (const message of session.messages) {
      let messageId;
      do { messageId = `import-${sessionId}-${++index}`; } while (messageIds.has(messageId));
      remap.set(message.id, messageId); messageIds.add(messageId);
    }
    /** @param {string} id */
    const remappedId = id => {
      const mapped = remap.get(id);
      if (mapped === undefined) throw invalidReference();
      return mapped;
    };
    session.id = sessionId;
    for (const message of session.messages) {
      message.id = remappedId(message.id);
      if (message.sourceUserId) message.sourceUserId = remappedId(message.sourceUserId);
      if (message.review?.sessionId) message.review.sessionId = sessionId;
    }
    if (session.edit) session.edit.messageId = remappedId(session.edit.messageId);
    for (const reference of viewReferences(session.viewState)) {
      reference.messageId = remappedId(reference.messageId);
    }
    messageCount += session.messages.length;
    snapshot.sessions.push(session);
  }
  return { snapshot: normalizeSessionSnapshot(snapshot), importedCount: imported.sessions.length, messageCount };
}
