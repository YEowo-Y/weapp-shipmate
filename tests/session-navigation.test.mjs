import test from 'node:test';
import assert from 'node:assert/strict';
import { installSessionNavigation } from '../desktop/design-previews/session-navigation.js';

function harness({ saved = true, href = 'chat-full.html' } = {}) {
  let click;
  const calls = [];
  const document = { addEventListener(_type, handler) { click = handler; }, removeEventListener() { click = null; } };
  const window = { location: { href: 'http://localhost:5501/main-four-region.html', assign: url => calls.push(url) } };
  const link = { href: new URL(href, window.location.href).href, target: '', hasAttribute: () => false };
  const cleanup = installSessionNavigation({ document, window, stop: () => calls.push('stop'),
    flush: async () => { calls.push('save'); return saved; }, onBlocked: () => calls.push('blocked') });
  return { calls, cleanup, click: extra => click({ button: 0, target: { closest: () => link }, preventDefault: () => calls.push('prevent'), ...extra }) };
}
test('cross-surface navigation stops and commits the complete draft before leaving', async () => {
  const app = harness();
  await app.click();
  assert.deepEqual(app.calls, ['prevent', 'stop', 'save', 'http://localhost:5501/chat-full.html']);
  app.cleanup();
});
test('failed or temporary persistence keeps the current surface and exposes recovery', async () => {
  const app = harness({ saved: false });
  await app.click();
  assert.deepEqual(app.calls, ['prevent', 'stop', 'save', 'blocked']);
});
test('modified links and unrelated navigation retain browser behavior', async () => {
  for (const options of [{ ctrlKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const app = harness(); await app.click(options); assert.deepEqual(app.calls, []);
  }
  for (const href of ['settings.html', 'https://example.com/chat-full.html']) {
    const app = harness({ href }); await app.click(); assert.deepEqual(app.calls, []);
  }
});
