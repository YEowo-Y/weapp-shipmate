export function literalSessionQuery(query) {
  const term = query.trim();
  if (!term) return null;
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
}

/** Search saved titles and visible message text; drafts and tool internals stay private. */
export function sessionMatch(session, query, pattern = literalSessionQuery(query)) {
  if (pattern) {
    for (const message of session.messages) {
      const text = message.text || '';
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

  const lastRequest = session.messages.findLast(message => message.role === 'user' && message.text?.trim());
  const summary = lastRequest?.text.replace(/\s+/g, ' ').trim() || '';
  const limit = 72;
  const characters = Array.from(summary.slice(0, limit * 2 + 1));
  const snippet = summary && summary !== session.title
    ? characters.slice(0, limit).join('') + (characters.length > limit ? '…' : '')
    : session.draft?.trim() ? '有未发送的草稿' : '';
  return { matched: true, snippet };
}
