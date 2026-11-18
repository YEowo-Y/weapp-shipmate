import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import { createAgentPermissions } from '../desktop/design-previews/agent-permissions.js';
import { createIcon } from '../desktop/design-previews/components/icons.js';

const requireDesktop = createRequire(new URL('../desktop/package.json', import.meta.url));
let ts, JSDOM;
try { ts = requireDesktop('typescript'); ({ JSDOM } = requireDesktop('jsdom')); } catch { /* Desktop dependencies are optional for CLI users. */ }
const desktopTest = (name, fn) => test(name, { skip: !ts || !JSDOM ? 'Run npm install in desktop to test agent tools' : false }, fn);

function harness() {
  const dom = new JSDOM('<!doctype html><body><div id="desktopComposer" data-model-provider="openai"><div class="agent-composer__actions"></div></div></body>');
  const { document, MutationObserver } = dom.window;
  const context = { document, MutationObserver, createAgentPermissions, createIcon };
  const actionSource = readFileSync(new URL('../desktop/src/shared/components/ui-kit.js', import.meta.url), 'utf8').match(/^export function createActionButton[^]*?^}/m)[0].replace('export ', '');
  vm.runInNewContext(actionSource, context);
  const source = readFileSync(new URL('../desktop/src/agent-tools.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const composer = document.querySelector('#desktopComposer'), controller = context.mountAgentTools(composer, () => false);
  controller.select({ id: 'session-a', projectId: 'project-a' });
  return { dom, document, composer, controller };
}

desktopTest('reading agent snapshots does not notify the privacy observer or create a mutation feedback loop', async () => {
  const { dom, composer, controller } = harness(); let notifications = 0;
  const observer = new dom.window.MutationObserver(() => {
    notifications++;
    // A regression must fail finitely instead of starving the event loop.
    if (notifications >= 3) { observer.disconnect(); return; }
    controller.snapshot();
  });
  observer.observe(composer, { attributes: true, subtree: true, attributeFilter: ['data-enabled'] });
  try {
    for (let index = 0; index < 3; index++) assert.equal(controller.snapshot().allowRead, false);
    await setImmediate();
    assert.equal(notifications, 0, 'unchanged permission snapshots must not write data-enabled again');
  } finally { observer.disconnect(); controller.destroy(); dom.window.close(); }
});

desktopTest('actual permission changes notify snapshot subscribers once and still permit revocation', async () => {
  const { dom, document, composer, controller } = harness(); const snapshots = []; let notifications = 0;
  const observer = new dom.window.MutationObserver(() => {
    notifications++;
    // Two legitimate transitions are expected; stop a feedback loop before it can hang the test.
    if (notifications >= 4) { observer.disconnect(); return; }
    snapshots.push(controller.snapshot().allowRead);
  });
  observer.observe(composer, { attributes: true, subtree: true, attributeFilter: ['data-enabled'] });
  try {
    const read = document.querySelector('#desktop-agent-read'); read.checked = true; read.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await setImmediate();
    assert.equal(notifications, 1, 'granting read permission should produce exactly one notification'); assert.deepEqual(snapshots, [true]);
    assert.equal(document.querySelector('#desktop-agent-tools').dataset.enabled, 'true');
    controller.revoke(); await setImmediate();
    assert.equal(notifications, 2, 'revoking read permission should produce one additional notification'); assert.deepEqual(snapshots, [true, false]);
    assert.equal(document.querySelector('#desktop-agent-tools').dataset.enabled, 'false');
    controller.snapshot(); await setImmediate(); assert.equal(notifications, 2);
  } finally { observer.disconnect(); controller.destroy(); dom.window.close(); }
});
