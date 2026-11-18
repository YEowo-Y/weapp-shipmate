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

test('a rejected lazy import announces its dialog without replacing the tool status or moving focus', async t => {
  const dom = new JSDOM(HTML, { url: 'http://tauri.localhost/' });
  const { document } = dom.window;
  installDesktopDom(dom.window);
  t.after(() => dom.window.close());
  const status = document.getElementById('status');
  status.textContent = '正在运行预检…';
  status.className = 'status busy';
  const sidebar = document.getElementById('desktop-sidebar');
  sidebar.setAttribute('role', 'dialog');
  sidebar.setAttribute('aria-modal', 'true');
  const surfaces = [
    ['mountSourceFreshness', '../source-freshness', 'desktop-sources-open', '规则来源'],
    ['mountExplainDialog', '../explain-dialog', 'desktop-explain-open', '拒因反查'],
    ['mountRepairHandoff', '../repair-handoff', 'desktop-handoff-open', '修复交接'],
    ['mountSubmissionMaterials', '../submission-materials-dialog', 'desktop-materials-open', '提审材料包'],
  ];
  const controllers = loadDesktopModule('src/shell/lazy-dialogs.ts', Object.fromEntries(
    surfaces.map(([, specifier]) => [specifier, () => { throw new Error('private diagnostic'); }]),
  ));
  for (const [mount, , openerId, name] of surfaces) {
    const opener = document.getElementById(openerId);
    opener.focus();
    controllers[mount]({}).open(opener);
    await setImmediate();
    const notice = document.querySelector('#desktop-dialog-load-notice');
    assert.equal(notice?.getAttribute('role'), 'alert');
    assert.equal(notice?.getAttribute('popover'), 'manual');
    assert.equal(notice?.textContent, `${name}未能加载，请重试。若仍失败，请重新打开应用。`);
    assert.equal(notice?.parentElement, sidebar);
    assert.equal(status.textContent, '正在运行预检…');
    assert.equal(status.className, 'status busy');
    assert.equal(document.activeElement, opener);
  }
  // Maintenance closes its own dialog then passes a launcher outside the active drawer.
  document.activeElement.blur();
  controllers.mountSourceFreshness({}).open(document.getElementById('desktop-more'));
  await setImmediate();
  assert.equal(document.querySelector('#desktop-dialog-load-notice')?.parentElement, sidebar);
});

test('canceling an open while its import is pending suppresses a stale error and permits a retry', async t => {
  const dom = new JSDOM(HTML, { url: 'http://tauri.localhost/' });
  const { document } = dom.window;
  installDesktopDom(dom.window);
  t.after(() => dom.window.close());
  const opener = document.getElementById('desktop-sources-open');
  let rejectImport = true;
  let opened = false;
  const { mountSourceFreshness } = loadDesktopModule('src/shell/lazy-dialogs.ts', {
    '../source-freshness': () => {
      if (rejectImport) throw new Error('import failed');
      return { mountSourceFreshness: () => ({ open() { opened = true; } }) };
    },
  });
  const controller = mountSourceFreshness({});
  controller.open(opener);
  controller.close();
  await setImmediate();
  assert.equal(document.querySelector('#desktop-dialog-load-notice'), null);

  controller.open(opener);
  await setImmediate();
  assert.match(document.querySelector('#desktop-dialog-load-notice')?.textContent ?? '', /^规则来源未能加载/);

  rejectImport = false;
  controller.open(opener);
  await setImmediate();
  assert.equal(opened, true);
  assert.equal(document.querySelector('#desktop-dialog-load-notice'), null);
});
