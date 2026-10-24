/* global TextEncoder */
import { normalizeSessionSnapshot } from './session-store.js';

export const SESSION_BACKUP_MAX_BYTES = 20 * 1024 * 1024;
const failure = (code, message) => Object.assign(new Error(message), { code });

function validateReferences(snapshot) {
  for (const session of snapshot.sessions) {
    const messageIds = new Set(session.messages.map(message => message.id));
    const view = session.viewState;
    const references = [view?.readingAnchor, ...(view?.disclosures || []),
      ...(view?.readingPositions || []), ...(view?.guideResults || [])].filter(Boolean);
    if (references.some(reference => !messageIds.has(reference.messageId)) ||
        session.messages.some(message => message.review?.sessionId && message.review.sessionId !== session.id)) {
      throw failure('invalid', '备份中的会话或消息引用无效；原记录未被修改。');
    }
  }
  return snapshot;
}

/** Only Shipmate session snapshots are accepted; imported execution is never resumed. */
export function parseSessionBackup(text) {
  if (typeof text !== 'string') throw failure('invalid', '请选择有效的会话 JSON 备份。');
  if (text.length > SESSION_BACKUP_MAX_BYTES || new TextEncoder().encode(text).byteLength > SESSION_BACKUP_MAX_BYTES) {
    throw failure('limit', '会话备份超过 20 MiB；原记录未被修改。');
  }
  let source;
  try { source = JSON.parse(text); }
  catch { throw failure('invalid', '无法解析会话备份，请选择有效的 JSON 文件。'); }
  return validateReferences(normalizeSessionSnapshot(source, { restore: true }));
}

/** Append independent copies; current drafts, active session and approval state stay intact. */
export function mergeSessionBackup(current, importedSnapshot) {
  const snapshot = normalizeSessionSnapshot(current);
  const imported = validateReferences(normalizeSessionSnapshot(importedSnapshot, { restore: true }));
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
    const remap = new Map();
    let index = 0;
    for (const message of session.messages) {
      let messageId;
      do { messageId = `import-${sessionId}-${++index}`; } while (messageIds.has(messageId));
      remap.set(message.id, messageId); messageIds.add(messageId);
    }
    session.id = sessionId;
    for (const message of session.messages) {
      message.id = remap.get(message.id);
      if (message.sourceUserId) message.sourceUserId = remap.get(message.sourceUserId);
      if (message.review?.sessionId) message.review.sessionId = sessionId;
    }
    if (session.edit) session.edit.messageId = remap.get(session.edit.messageId);
    const view = session.viewState;
    for (const reference of [view?.readingAnchor, ...(view?.disclosures || []),
      ...(view?.readingPositions || []), ...(view?.guideResults || [])].filter(Boolean)) {
      reference.messageId = remap.get(reference.messageId);
    }
    messageCount += session.messages.length;
    snapshot.sessions.push(session);
  }
  return { snapshot: normalizeSessionSnapshot(snapshot), importedCount: imported.sessions.length, messageCount };
}
