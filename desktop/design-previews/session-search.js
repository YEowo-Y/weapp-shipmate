/** Search saved titles and visible message text; drafts and tool internals stay private. */
export function sessionMatch(session, query) {
  const term = query.trim().toLocaleLowerCase();
  if (!term || session.title.toLocaleLowerCase().includes(term)) return { matched: true, snippet: '' };
  const message = session.messages.find(message => (message.text || '').toLocaleLowerCase().includes(term));
  if (!message) return { matched: false, snippet: '' };
  const text = message.text;
  const index = text.toLocaleLowerCase().indexOf(term);
  const start = Math.max(0, index - 16);
  const end = Math.min(text.length, index + term.length + 16);
  return { matched: true, messageId: message.id, snippet: `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}` };
}
