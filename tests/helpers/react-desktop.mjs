import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('../../desktop/', import.meta.url));
export const requireDesktop = createRequire(resolve(desktop, 'package.json'));
const ts = requireDesktop('typescript');

/** Load the real desktop TS/TSX modules in node:test; CSS is verified by native E2E. */
export function loadDesktopModule(relativePath) {
  const cache = new Map();
  function load(filename) {
    if (extname(filename) === '.css') return {};
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const localRequire = specifier => {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return requireDesktop(specifier);
      const path = specifier.startsWith('@/') ? resolve(desktop, 'src', specifier.slice(2)) : resolve(dirname(filename), specifier);
      const candidate = [path, `${path}.ts`, `${path}.tsx`, `${path}.js`, resolve(path, 'index.ts'), resolve(path, 'index.tsx')].find(existsSync);
      if (!candidate) throw new Error(`Cannot resolve ${specifier} from ${filename}`);
      return load(candidate);
    };
    // Same CJS boundary as Node, with TypeScript/JSX compilation rather than mocked React.
    new Function('exports', 'require', 'module', source)(module.exports, localRequire, module);
    return module.exports;
  }
  return load(resolve(desktop, relativePath));
}

/** jsdom does not implement native dialog/top-layer layout; native E2E owns those checks. */
export function installDesktopDom(window) {
  // jsdom 26 lacks PointerEvent; Base UI dispatches a pointer click to its native input.
  // MouseEvent implements these click/modifier semantics; WebView2 covers real pointer input.
  window.PointerEvent ??= window.MouseEvent;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLDialogElement', 'Element', 'Node', 'DocumentFragment', 'MutationObserver', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
  }
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: window.getComputedStyle.bind(window) });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
    this.querySelector('button:not([disabled]),input:not([disabled])')?.focus();
  };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  window.HTMLElement.prototype.getClientRects = function () {
    return this.isConnected && !this.closest('[hidden]') ? [{ width: 1, height: 1 }] : [];
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
