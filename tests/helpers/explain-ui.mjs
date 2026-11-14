import { runExplain } from '../../src/explain.mjs';
import { mountExplain } from '../../desktop/design-previews/explain.js';

class Node {
  constructor(tag = 'div') { this.tag = tag; this.value = ''; this.hidden = false; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.children = []; this.textContent = ''; this.calls = []; this.classes = new Set(); this.classList = { toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name) }; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  removeEventListener(type) { delete this.listeners[type]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus(options) { if (this.ownerDocument) this.ownerDocument.activeElement = this; this.calls.push(['focus', options]); }
  scrollIntoView(options) { this.calls.push(['scroll', options]); }
  fire(type) { return this.listeners[type]?.({ preventDefault() {} }); }
  get text() { return this.textContent + this.children.map(child => child.text).join(''); }
  get descendants() { return this.children.flatMap(child => [child, ...child.descendants]); }
}

export function explainHarness(query = async ({ query }) => runExplain(query), options = {}) {
  const ids = ['rjForm', 'rjInput', 'rjResult', 'rjStatus', 'rjSample', 'rjResultHeading', 'rjResultItems', 'rjBtn', 'rjStop', 'rjQuery', 'rjQuerySummary', 'rjQueryText', 'rjCopy', 'rjSave', 'rjDownload', 'rjActionStatus'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node()]));
  const win = new Node();
  const root = { getElementById: id => nodes[id], createElement: tag => Object.assign(new Node(tag), { ownerDocument: root }), createElementNS: (_ns, tag) => Object.assign(new Node(tag), { ownerDocument: root }), defaultView: win };
  for (const node of Object.values(nodes)) node.ownerDocument = root;
  const lifecycle = mountExplain(root, { query, ...options });
  return { nodes, win, ...lifecycle, root };
}
