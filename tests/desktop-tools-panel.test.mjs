import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { Event, EventTarget } = globalThis;
const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts;
try { ts = requireDesktop('typescript'); } catch { /* Optional desktop dependencies. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts && 'Install desktop dependencies' }, fn);

function harness(isNarrow = false) {
  const queued = [];
  let doc;
  class Element extends EventTarget {
    dataset = {};
    attributes = {};
    children = [];
    open = false;
    modal = false;
    focus() { doc.activeElement = this; }
    contains(node) { return node === this || this.children.includes(node); }
    setAttribute(key, value) { this.attributes[key] = value; }
    querySelector() { return this.children[0]; }
    show() { this.open = true; this.modal = false; }
    showModal() { this.open = true; this.modal = true; }
    close() {
      if (!this.open) return;
      this.open = false;
      this.modal = false;
      queued.push(() => this.dispatchEvent(new Event('close')));
    }
  }
  const panel = new Element(), toggle = new Element(), close = new Element(), action = new Element(), layout = new Element();
  const report = { textContent: 'Existing report', state: 'running' };
  panel.children = [close, action, report];
  doc = new EventTarget();
  doc.activeElement = null;
  doc.modal = null;
  const nodes = { '#desktop-tools': panel, '#desktop-tools-toggle': toggle, '#desktop-tools-close': close, '.desktop-layout': layout };
  doc.querySelector = selector => selector.startsWith('dialog:modal') ? doc.modal : nodes[selector];
  const media = new EventTarget(); media.matches = isNarrow;
  const win = new EventTarget(); win.matchMedia = () => media;
  const source = readFileSync(new URL('../desktop/src/tools-panel.ts', import.meta.url), 'utf8').replace(/export /g, '');
  const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { document: doc, window: win, HTMLElement: Element };
  vm.runInNewContext(script, context);
  const controller = context.mountToolsPanel();
  return {
    panel, toggle, close, action, report, layout, doc, win, controller,
    click: element => element.dispatchEvent(new Event('click')),
    flush: () => { while (queued.length) queued.shift()(); },
    resize(value) { media.matches = value; media.dispatchEvent(new Event('change')); },
    escape() {
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperty(event, 'key', { value: 'Escape' });
      doc.dispatchEvent(event);
      return event;
    },
  };
}

desktopTest('tools start closed, toggle opens adjacent panel, close restores trigger without discarding report', () => {
  const h = harness();
  assert.equal(h.toggle.attributes['aria-expanded'], 'false');
  assert.equal(h.layout.dataset.toolsOpen, 'false');
  h.click(h.toggle);
  assert.equal(h.panel.open, true);
  assert.equal(h.panel.modal, false);
  assert.equal(h.doc.activeElement, h.close);
  assert.equal(h.toggle.attributes['aria-expanded'], 'true');
  h.click(h.close); h.flush();
  assert.equal(h.panel.open, false);
  assert.equal(h.doc.activeElement, h.toggle);
  assert.equal(h.panel.children[2], h.report);
  assert.equal(h.report.state, 'running');
});

desktopTest('wide Escape respects outside focus and nested model dialogs', () => {
  const h = harness(); h.click(h.toggle);
  h.toggle.focus();
  assert.equal(h.escape().defaultPrevented, false);
  assert.equal(h.panel.open, true);
  h.action.focus(); h.doc.modal = {};
  assert.equal(h.escape().defaultPrevented, false);
  assert.equal(h.panel.open, true);
  h.doc.modal = null;
  assert.equal(h.escape().defaultPrevented, true);
  assert.equal(h.panel.open, false);
  assert.equal(h.doc.activeElement, h.toggle);
});

desktopTest('narrow native cancel closes the modal drawer and restores focus', () => {
  const h = harness(true); h.click(h.toggle);
  assert.equal(h.panel.modal, true);
  assert.equal(h.escape().defaultPrevented, false);
  const event = new Event('cancel', { cancelable: true });
  h.panel.dispatchEvent(event); h.flush();
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.panel.open, false);
  assert.equal(h.layout.dataset.toolsOpen, 'false');
  assert.equal(h.doc.activeElement, h.toggle);
});

desktopTest('responsive reopen preserves report and focus despite queued native close events', () => {
  const h = harness(); h.click(h.toggle); h.action.focus();
  h.resize(true); h.flush();
  assert.equal(h.panel.modal, true);
  assert.equal(h.panel.open, true);
  assert.equal(h.doc.activeElement, h.action);
  assert.equal(h.layout.dataset.toolsOpen, 'true');
  h.resize(false); h.flush();
  assert.equal(h.panel.modal, false);
  assert.equal(h.panel.open, true);
  assert.equal(h.doc.activeElement, h.action);
  assert.equal(h.panel.children[2], h.report);
  h.click(h.toggle); h.click(h.toggle); h.flush();
  assert.equal(h.toggle.attributes['aria-expanded'], 'true');
  assert.equal(h.doc.activeElement, h.close);
});

desktopTest('external dialog close reconciles state; a closed panel stays closed across breakpoints', () => {
  const h = harness(); h.click(h.toggle);
  h.panel.close(); h.flush();
  assert.equal(h.layout.dataset.toolsOpen, 'false');
  assert.equal(h.doc.activeElement, h.toggle);
  h.resize(true);
  assert.equal(h.panel.open, false);
});

desktopTest('resizing under a reading dialog closes background tools without raising them or stealing focus', () => {
  for (const initialNarrow of [false, true]) {
    const h = harness(initialNarrow); h.click(h.toggle);
    const reader = { open: true };
    h.doc.modal = reader;
    h.doc.activeElement = reader;
    h.resize(!initialNarrow); h.flush();
    assert.equal(h.panel.open, false);
    assert.equal(h.layout.dataset.toolsOpen, 'false');
    assert.equal(h.doc.activeElement, reader);
    assert.equal(h.panel.children[2], h.report);
    h.resize(initialNarrow); h.flush();
    assert.equal(h.panel.open, false);
    assert.equal(h.doc.activeElement, reader);
  }
});

desktopTest('pagehide removes handlers and destroy is idempotent', () => {
  const h = harness(); h.click(h.toggle);
  h.win.dispatchEvent(new Event('pagehide')); h.flush();
  assert.equal(h.panel.open, false);
  assert.equal(h.layout.dataset.toolsOpen, 'false');
  h.click(h.toggle); h.resize(true);
  assert.equal(h.panel.open, false);
  h.controller.destroy();
  assert.equal(h.escape().defaultPrevented, false);
});

 desktopTest('task entry opens configuration and close returns to that task rather than the global toggle', () => {
  const h = harness();
  h.controller.open(h.action, h.action);
  assert.equal(h.doc.activeElement, h.action);
  assert.equal(h.panel.open, true);
  h.controller.close(); h.flush();
  assert.equal(h.doc.activeElement, h.action);
  h.controller.destroy();
  h.controller.open(h.toggle);
  assert.equal(h.panel.open, false);
});

desktopTest('a hidden homepage trigger falls back to the persistent tools toggle on close', () => {
  const h = harness();
  h.action.closest = () => ({ hidden: true });
  h.controller.open(h.action, h.action);
  h.controller.close(); h.flush();
  assert.equal(h.doc.activeElement, h.toggle);
});
