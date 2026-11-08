/** Search saved titles and visible message text; drafts and tool internals stay private. */
export function sessionMatch(session, query) {
  const term = query.trim().toLocaleLowerCase();
  if (!term || session.title.toLocaleLowerCase().includes(term)) {
    const lastRequest = session.messages.findLast(message => message.role === 'user' && message.text?.trim());
    const summary = lastRequest?.text.replace(/\s+/g, ' ').trim() || '';
    const limit = 72;
    const characters = Array.from(summary.slice(0, limit * 2 + 1));
    const snippet = summary && summary !== session.title
      ? characters.slice(0, limit).join('') + (characters.length > limit ? '…' : '')
      : session.draft?.trim() ? '有未发送的草稿' : '';
    return { matched: true, snippet };
  }
  const message = session.messages.find(message => (message.text || '').toLocaleLowerCase().includes(term));
  if (!message) return { matched: false, snippet: '' };
  const text = message.text;
  const index = text.toLocaleLowerCase().indexOf(term);
  const start = Math.max(0, index - 16);
  const end = Math.min(text.length, index + term.length + 16);
  return { matched: true, messageId: message.id, snippet: `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}` };
}
