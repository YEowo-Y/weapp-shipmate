import MarkdownIt from './vendor/markdown-it/markdown-it.esm.min.mjs';

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false });
const allowedTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 's', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const rendered = new WeakMap();
const block = (tag, children = [], attrs = {}, text) => ({ tag, children, attrs, text });
const text = value => block('span', [], {}, value);

function safeHref(value) {
  if (!/^https?:\/\//i.test(value || '')) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function linkAttrs(value) {
  const href = safeHref(value);
  return href ? { href, target: '_blank', rel: 'noopener noreferrer' } : null;
}
function tokenTree(tokens, context, path = '') {
  const root = [];
  const stack = [root];
  tokens.forEach((token, index) => {
    // markdown-it marks the paired paragraph tokens of a tight list hidden.
    if (token.hidden) return;
    const key = `${context.partIndex}:${path}${index}`;
    const children = stack[stack.length - 1];
    if (token.nesting === -1) { if (stack.length > 1) stack.pop(); return; }
    if (token.type === 'inline') { children.push(...tokenTree(token.children || [], context, `${path}${index}.`)); return; }
    if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info.trim().split(/\s+/)[0] || '纯文本';
      children.push(block('div', [
        block('div', [text(language), ...(context.copyCode ? [block('button', [], {
          type: 'button', 'data-action': 'copy-code', 'data-message-id': context.messageId,
          'data-block-key': key, 'aria-label': '复制代码',
        }, '复制代码')] : [])], { class: 'markdown-code__header' }),
        block('pre', [block('code', [], {}, token.content)], {
          tabindex: '0', role: 'region', 'aria-label': `${language} 代码`, 'data-reading-key': key,
        }),
      ], { class: 'markdown-code' }));
      return;
    }
    if (token.type === 'image') {
      const attrs = linkAttrs(token.attrGet('src'));
      const label = token.content || '图片';
      children.push(attrs ? block('a', [], attrs, `图片：${label}（打开链接）`) : text(`图片：${label}`));
      return;
    }
    if (token.nesting === 1) {
      const attrs = {};
      let tag = allowedTags.has(token.tag) ? token.tag : 'span';
      if (token.type === 'link_open') {
        const safe = linkAttrs(token.attrGet('href'));
        if (safe) { tag = 'a'; Object.assign(attrs, safe); }
      }
      if (tag === 'ol' && /^\d+$/.test(token.attrGet('start') || '')) attrs.start = token.attrGet('start');
      if (tag === 'th' || tag === 'td') {
        const alignment = /^text-align:(left|center|right)$/.exec(token.attrGet('style') || '');
        if (alignment) attrs.class = `markdown-align-${alignment[1]}`;
      }
      const node = block(tag, [], attrs);
      if (tag === 'table') children.push(block('div', [node], {
        class: 'markdown-table', tabindex: '0', role: 'region', 'aria-label': '表格，可横向滚动', 'data-reading-key': key,
      }));
      else children.push(node);
      stack.push(node.children);
      return;
    }
    if (token.type === 'code_inline') children.push(block('code', [], {}, token.content));
    else if (token.type === 'softbreak' || token.type === 'hardbreak') children.push(block('br'));
    else if (token.type === 'hr') children.push(block('hr'));
    else children.push(text(token.content));
  });
  return root;
}

// Reconcile trusted descriptors, not HTML. Stable block/pre nodes preserve focus
// and independent reading positions while the last streamed token changes.
function reconcile(host, descriptors) {
  descriptors.forEach((next, index) => {
    let node = host.children[index];
    const previous = node && rendered.get(node);
    if (!node || previous?.tag !== next.tag) {
      const replacement = host.ownerDocument.createElement(next.tag);
      if (node) node.replaceWith(replacement);
      else host.append(replacement);
      node = replacement;
    }
    for (const name of Object.keys(previous?.attrs || {})) {
      if (!(name in next.attrs)) node.removeAttribute(name);
    }
    for (const [name, value] of Object.entries(next.attrs)) {
      if (previous?.attrs[name] !== value) node.setAttribute(name, value);
    }
    if (node.dataset?.copyState && next.tag === 'button') {
      // Clipboard state belongs to the interaction controller.
    } else if (next.text !== undefined) {
      if (node.textContent !== next.text) node.textContent = next.text;
    } else {
      if (previous?.text !== undefined) node.textContent = '';
      reconcile(node, next.children);
    }
    rendered.set(node, next);
  });
  while (host.children.length > descriptors.length) host.children[host.children.length - 1].remove();
}

// Read the same trusted descriptors as the renderer. Inline nodes concatenate,
// while block boundaries remain separate and code whitespace stays untouched.
export function messageSearchText(value, role = 'assistant') {
  const source = String(value || '').replace(/\r\n?/g, '\n');
  if (role === 'user') return source.replace(/\n+$/, '');
  const tree = tokenTree(markdown.parse(source, {}), { partIndex: '0', copyCode: false });
  let result = '', separator = '';
  const boundary = () => { if (result && !result.endsWith('\n')) separator = '\n'; };
  function visit(node) {
    if (node.tag === 'br') { result += separator + '\n'; separator = ''; return; }
    const separate = /^(?:p|h[1-6]|blockquote|[uo]l|li|div|pre|table|thead|tbody|tr|th|td|hr)$/.test(node.tag);
    if (separate) boundary();
    if (node.text !== undefined) { result += separator + node.text; separator = ''; }
    else node.children.forEach(visit);
    if (separate) boundary();
  }
  tree.forEach(visit);
  return result;
}

export function renderMessageText(host, value, { copyCode = true } = {}) {
  const source = String(value || '').replace(/\r\n?/g, '\n');
  const context = { messageId: host.dataset?.messageId || '', partIndex: host.dataset?.partIndex || '0', copyCode };
  const literal = host.dataset?.role === 'user';
  const normalized = literal ? source.replace(/\n+$/, '') : source;
  const tree = literal
    ? (normalized ? normalized.split(/\n{2,}/).map(value => block('p', [], {}, value)) : [])
    : tokenTree(markdown.parse(normalized, {}), context);
  reconcile(host, tree);
}
