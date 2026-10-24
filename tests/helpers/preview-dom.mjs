// Small DOM model for renderer tests; HTML parsing is deliberately unavailable.
export function createPreviewDocument() {
  const doc = {
    createElementNS(_namespace, tag) { return this.createElement(tag); },
    createElement(tag) {
      let text = '';
      return {
        tag, tagName: tag.toUpperCase(), ownerDocument: doc, dataset: {}, attributes: {}, children: [], className: '',
        get textContent() { return text + this.children.map(child => child.textContent).join(''); },
        set textContent(value) { text = String(value); this.children = []; },
        set innerHTML(_) { throw new Error('HTML injection is forbidden'); },
        getBoundingClientRect() { return { top: 0, bottom: 0, height: 0 }; },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
          if (name === 'class') this.className = String(value);
          if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
        },
        removeAttribute(name) { delete this.attributes[name]; },
        append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } },
        remove() { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); },
        replaceWith(node) { const index = this.parentNode.children.indexOf(this); node.parentNode = this.parentNode; this.parentNode.children[index] = node; },
      };
    },
  };
  return doc;
}
