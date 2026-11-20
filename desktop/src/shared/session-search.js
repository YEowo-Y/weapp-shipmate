// @ts-check
import { messageSearchText } from './components/message-markdown.js';

/** @typedef {{ id: string; text?: string; role: string }} SearchMessage */
/** @typedef {{ messages: SearchMessage[]; title: string; draft?: string }} SearchSession */

// Retain only each live message object's latest rendering; streamed edits replace
// their entry, and removed messages do not stay alive because of this cache.
/** @type {WeakMap<SearchMessage, { source?: string; role: string; text: string }>} */
const searchableMessages = new WeakMap();

/** @param {SearchMessage} message */
function searchableText(message) {
  const cached = searchableMessages.get(message);
  if (cached && cached.source === message.text && cached.role === message.role) return cached.text;
  const text = messageSearchText(message.text, message.role);
  searchableMessages.set(message, { source: message.text, role: message.role, text });
  return text;
}

/** @param {string} query */
export function literalSessionQuery(query) {
  const term = query.trim();
  if (!term) return null;
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
}

/**
 * Search saved titles and visible message text; drafts and tool internals stay private.
 * @param {SearchSession} session
 * @param {string} query
 */
export function sessionMatch(session, query, pattern = literalSessionQuery(query)) {
  if (pattern) {
    for (const message of session.messages) {
      const text = searchableText(message);
      const hit = pattern.exec(text);
      if (!hit) continue;

      const after = hit.index + hit[0].length;
      let start = Math.max(0, hit.index - 16);
      let end = Math.min(text.length, after + 16);
      // Keep an emoji intact when either context boundary falls within a surrogate pair.
      if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])) start--;
      if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
      const beforeHit = text.slice(start, hit.index).replace(/\s+/g, ' ');
      const afterHit = text.slice(after, end).replace(/\s+/g, ' ');
      const snippet = (start ? '…' : '') + beforeHit + hit[0] + afterHit + (end < text.length ? '…' : '');
      return { matched: true, messageId: message.id, snippet };
    }
    if (!pattern.test(session.title)) return { matched: false, snippet: '' };
  }

  let lastRequest;
  for (let index = session.messages.length - 1; index >= 0; index--) {
    const message = session.messages[index];
    if (message.role === 'user' && message.text?.trim()) {
      lastRequest = message;
      break;
    }
  }
  const summary = lastRequest?.text?.replace(/\s+/g, ' ').trim() || '';
  const limit = 72;
  const characters = Array.from(summary.slice(0, limit * 2 + 1));
  const snippet = summary && summary !== session.title
    ? characters.slice(0, limit).join('') + (characters.length > limit ? '…' : '')
    : session.draft?.trim() ? '有未发送的草稿' : '';
  return { matched: true, snippet };
}
