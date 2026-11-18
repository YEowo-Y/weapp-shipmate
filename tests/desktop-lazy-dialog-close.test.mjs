import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';

const { JSDOM } = requireDesktop('jsdom');
const { act } = requireDesktop('react');
const HTML = readFileSync(new URL('../desktop/index.html', import.meta.url), 'utf8');

const fixtures = [
  {
    dialogId: 'desktop-source-freshness',
    openerId: 'desktop-sources-open',
    mount: ({ mountSourceFreshness }) => mountSourceFreshness({
      invoke: async () => ({ catalog: { catalogVersion: 'r1', staleDays: 30, sources: [] }, checks: [] }),
    }),
  },
  {
    dialogId: 'desktop-materials',
    openerId: 'desktop-materials-open',
    mount: ({ mountSubmissionMaterials }) => mountSubmissionMaterials({
      invoke: async () => null,
      getProject: () => null,
      getArtifact: () => null,
      onManageProject: () => {},
      onOpenSource: () => {},
      copyText: async () => {},
      onDownloadArtifact: () => true,
    }),
  },
];

function setup(t, fixture) {
  const dom = new JSDOM(HTML, { url: 'http://tauri.localhost/', pretendToBeVisual: true });
  installDesktopDom(dom.window);
  Object.defineProperty(globalThis, 'CSSStyleSheet', { configurable: true, value: dom.window.CSSStyleSheet });
  Object.defineProperty(globalThis, 'customElements', { configurable: true, value: dom.window.customElements });
  // jsdom lacks the form-associated APIs used by the legacy action buttons.
  t.mock.method(dom.window.customElements, 'define', () => {});
  const { document } = dom.window;
  const controller = fixture.mount(loadDesktopModule('src/shell/lazy-dialogs.ts'));
  t.after(async () => {
    await act(() => controller.destroy());
    dom.window.close();
  });
  const opener = document.getElementById(fixture.openerId);
  assert.ok(opener);
  return { controller, document, getDialog: () => document.getElementById(fixture.dialogId), opener };
}

for (const fixture of fixtures) {
  for (const openCount of [1, 2]) {
    test(`${fixture.dialogId} cancels ${openCount} pending open request(s) on close`, async t => {
      const { controller, getDialog, opener } = setup(t, fixture);
      await act(async () => {
        for (let i = 0; i < openCount; i++) controller.open(opener);
        assert.equal(getDialog(), null, 'the module is still loading');
        controller.close();
        await setImmediate();
      });
      const dialog = getDialog();
      assert.ok(dialog, 'the module finished loading');
      assert.equal(dialog.open, false, 'the canceled requests must not open the dialog');
    });
  }

  test(`${fixture.dialogId} uses the new opener after close and reopen during loading`, async t => {
    const { controller, document, getDialog, opener } = setup(t, fixture);
    const latestOpener = document.createElement('button');
    document.body.append(latestOpener);
    await act(async () => {
      controller.open(opener);
      controller.close();
      controller.open(latestOpener);
      await setImmediate();
    });
    assert.equal(getDialog()?.open, true);
    await act(() => controller.close());
    assert.equal(getDialog()?.open, false);
    assert.equal(document.activeElement, latestOpener);
  });
}
