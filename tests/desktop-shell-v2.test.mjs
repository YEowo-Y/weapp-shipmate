import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';
import { iconNodes } from '../desktop/src/shared/components/lucide-icons.js';
import { loadData, ruleToItem } from '../src/data.mjs';

const { JSDOM } = requireDesktop('jsdom');
const React = requireDesktop('react');
const { act, createElement } = React;
const { createRoot } = requireDesktop('react-dom/client');

const rootUrl = new URL('../', import.meta.url);
const readRepoFile = relativePath => readFileSync(new URL(relativePath, rootUrl), 'utf8');

const REQUIRED_NEW_ICONS = [
  'archive',
  'camera',
  'chevron-up',
  'circle-dashed',
  'circle-dot',
  'eye',
  'file-diff',
  'folder-open',
  'map-pin',
  'notebook-text',
  'panel-left',
  'panel-right',
  'refresh-cw',
  'smartphone',
  'undo-2',
  'upload',
];

const FORBIDDEN_GOVERNANCE_RE = /已合规|保证过审|可直接提交/;

test('F00 icons: lucide-icons.js and preview sprite include all 16 pinned shell v2 icons', () => {
  const sprite = readRepoFile('desktop/design-previews/components/icons.svg');
  for (const name of REQUIRED_NEW_ICONS) {
    assert.ok(Object.hasOwn(iconNodes, name), `missing icon "${name}" in lucide-icons.js`);
    assert.match(sprite, new RegExp(`<symbol id="${name}"`), `missing symbol "${name}" in icons.svg`);
  }
});

test('F00 tokens, CSS & DESIGN.md: layout widths, dropdown tokens, explicit anchor, and lines 16, 25, 31, 40 match v2 shell', () => {
  const designTokens = readRepoFile('desktop/src/design-system.css');
  const polishCss = readRepoFile('desktop/src/product-polish.css');
  const shellCss = readRepoFile('desktop/src/shell/shell.css');
  assert.match(designTokens, /--ds-sidebar-width:\s*264px;/);
  assert.match(designTokens, /--ds-panel-width:\s*404px;/);
  assert.match(designTokens, /--ds-measure:\s*704px;/);
  assert.doesNotMatch(polishCss, /--ds-sidebar-width:\s*304px/);
  assert.match(shellCss, /\.ui-dropdown__popup\b/, 'shell.css must style DropdownMenu popup with --ds-* tokens');
  assert.match(shellCss, /\.ui-dropdown__item\b/, 'shell.css must style DropdownMenu items with --ds-* tokens');
  assert.match(shellCss, /anchor-name:\s*--desktop-more-anchor/, 'shell.css must define explicit CSS anchor for #desktop-more');

  const designLines = readRepoFile('DESIGN.md').split(/\r?\n/);
  assert.match(designLines[15] ?? '', /264px.*704px.*404px/, 'DESIGN.md line 16 must describe 264px/704px/404px three-column IA');
  assert.match(designLines[24] ?? '', /Base UI.*desktop\/src\/components\/ui\//, 'DESIGN.md line 25 must describe React + Base UI shell components');
  assert.match(designLines[30] ?? '', /1180px.*820px/, 'DESIGN.md line 31 must describe 1180px and 820px drawer breakpoints');
  assert.match(designLines[39] ?? '', /750 kB.*250 kB/, 'DESIGN.md line 40 must describe lazy-loaded right panel startup budget');
});

test('F00 HTML contract: desktop/index.html implements every docs/25 §6.1 entry without adding Web Awesome tags', () => {
  const html = readRepoFile('desktop/index.html');
  const dom = new JSDOM(html);
  const { document } = dom.window;

  try {
    const sidebar = document.getElementById('desktop-sidebar');
    const main = document.getElementById('desktop-main');
    const rightPanel = document.getElementById('desktop-right-panel');
    const backdrop = document.getElementById('desktop-shell-backdrop');
    assert.equal(sidebar?.tagName, 'ASIDE');
    assert.equal(main?.tagName, 'MAIN');
    assert.equal(rightPanel?.tagName, 'ASIDE');
    assert.ok(backdrop, 'missing #desktop-shell-backdrop');
    assert.equal(document.querySelectorAll('main').length, 1, 'must have exactly one <main> landmark');

    const topZone = sidebar.querySelector('.desktop-sidebar-top');
    assert.ok(topZone, 'missing .desktop-sidebar-top');
    assert.match(topZone.textContent ?? '', /上线船友/);
    for (const id of ['desktop-search-open', 'desktop-maintenance-open', 'desktop-maintenance-count', 'desktop-sidebar-toggle', 'desktop-new-session']) {
      assert.ok(topZone.querySelector(`#${id}`), `missing #${id} in .desktop-sidebar-top`);
    }

    const scrollZone = sidebar.querySelector('.desktop-sidebar-scroll');
    assert.ok(scrollZone, 'missing .desktop-sidebar-scroll');
    const groupTitles = [...scrollZone.querySelectorAll('.desktop-nav-group-header')].map(node => node.textContent?.trim());
    assert.deepEqual(groupTitles, ['上线', '项目', '项目资料']);

    for (const id of [
      'desktop-home-open',
      'desktop-workflow-open',
      'desktop-results-open',
      'desktop-explain-open',
      'desktop-sources-open',
      'desktop-project-navigation',
      'desktop-project-manage',
      'desktop-project-folders',
      'sessionHost',
      'desktop-memory-open',
      'desktop-handoff-open',
      'desktop-repair-history',
      'desktop-health-open',
      'desktop-archived-open',
    ]) {
      assert.ok(scrollZone.querySelector(`#${id}`), `missing #${id} in .desktop-sidebar-scroll`);
    }

    const footerZone = sidebar.querySelector('.desktop-sidebar-footer');
    assert.ok(footerZone, 'missing .desktop-sidebar-footer');
    for (const id of ['desktop-rules-status-open', 'desktop-preferences-open', 'desktop-help-open']) {
      assert.ok(footerZone.querySelector(`#${id}`), `missing #${id} in .desktop-sidebar-footer`);
    }
    assert.equal(document.querySelectorAll('#desktop-preferences-open').length, 1, 'settings entry must stay unique');

    const header = main.querySelector('.desktop-header');
    assert.ok(header, 'missing .desktop-header');
    assert.ok(header.querySelector('#desktop-sidebar-expand'));
    assert.ok(header.querySelector('#session-project-crumb'));
    assert.equal(header.querySelector('h1')?.id, 'session-title');
    const moreBtn = header.querySelector('#desktop-more');
    const actionsMenu = header.querySelector('#desktop-actions');
    assert.ok(moreBtn && actionsMenu, 'missing header overflow trigger/menu');
    assert.equal(moreBtn.nextElementSibling, actionsMenu, 'popover menu must immediately follow #desktop-more');
    assert.equal(actionsMenu.getAttribute('popover'), 'auto');
    for (const value of ['rename', 'find', 'report', 'tools']) {
      assert.ok(actionsMenu.querySelector(`[data-menu-value="${value}"]`), `missing overflow menu action "${value}"`);
    }
    assert.ok(header.querySelector('#desktop-panel-toggle'), 'missing single right-panel toggle #desktop-panel-toggle');

    const initialTabs = [...rightPanel.querySelectorAll('[role="tab"]')];
    assert.deepEqual(initialTabs.map(tab => tab.textContent?.trim()), ['上线', '依据', '改动', '开发者工具']);
    assert.equal(initialTabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length, 1);

    assert.equal(document.querySelectorAll('summary h1, summary h2, summary h3, summary h4, summary h5, summary h6').length, 0);
    assert.equal(document.querySelectorAll('wa-dropdown').length, 0, 'legacy <wa-dropdown> in index.html must be retired');
    for (const shellRegion of [sidebar, header, rightPanel]) {
      assert.doesNotMatch(shellRegion.innerHTML, /<wa-/i, 'new shell regions must contain zero Web Awesome tags');
    }
    const waTagMatches = html.match(/<wa-[a-z-]+/g) || [];
    assert.ok(waTagMatches.length <= 36, `expected <= 36 <wa-*> opening tags (down from 49), found ${waTagMatches.length}`);
    assert.doesNotMatch(html, FORBIDDEN_GOVERNANCE_RE);
  } finally {
    dom.window.close();
  }
});

const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body class="desktop-app" data-theme="light"></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
installDesktopDom(dom.window);

// Deterministic animation frame queue so Base UI Tabs / Menu effects run strictly inside act(...)
let rafId = 0;
const rafQueue = new Map();
const installDeterministicRaf = () => {
  const requestAnimationFrame = cb => {
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  };
  const cancelAnimationFrame = id => { rafQueue.delete(id); };
  Object.defineProperty(dom.window, 'requestAnimationFrame', { configurable: true, writable: true, value: requestAnimationFrame });
  Object.defineProperty(dom.window, 'cancelAnimationFrame', { configurable: true, writable: true, value: cancelAnimationFrame });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: requestAnimationFrame });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: cancelAnimationFrame });
};
installDeterministicRaf();
function flushRaf() {
  for (let pass = 0; pass < 4 && rafQueue.size > 0; pass++) {
    const batch = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb] of batch) cb(16 * (pass + 1));
  }
}

let cleanupCurrent = null;
afterEach(() => {
  rafQueue.clear();
  cleanupCurrent?.();
  cleanupCurrent = null;
});
after(() => dom.window.close());

function createMediaQuery(initialMatches = false) {
  const listeners = new Set();
  return {
    matches: initialMatches,
    addEventListener(_type, fn) { listeners.add(fn); },
    removeEventListener(_type, fn) { listeners.delete(fn); },
    setMatches(next) {
      if (this.matches === next) return;
      this.matches = next;
      for (const fn of [...listeners]) fn({ matches: next });
    },
  };
}

test('F00 responsive drawers, modal triggers, tools-panel focus & header menu: 1180px/820px inert isolation and focus safety', () => {
  assert.ok(existsSync(new URL('desktop/src/shell/shell-layout.ts', rootUrl)), 'missing desktop/src/shell/shell-layout.ts');
  const { mountShellLayout } = loadDesktopModule('src/shell/shell-layout.ts');
  const { bindApplicationShortcuts } = loadDesktopModule('src/application-shortcuts.ts');
  const { mountToolsPanel } = loadDesktopModule('src/tools-panel.ts');

  const html = readRepoFile('desktop/index.html');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  assert.ok(bodyMatch, 'body markup');
  const { window } = dom;
  const { document } = window;
  document.body.innerHTML = bodyMatch[1];

  const panelQuery = createMediaQuery(false);
  const sidebarQuery = createMediaQuery(false);
  const toolsQuery = createMediaQuery(false);
  const hoverQuery = createMediaQuery(true);
  const shellWidthQueries = [];
  window.matchMedia = query => {
    if (query.startsWith('(max-width:')) shellWidthQueries.push(query);
    if (query.includes('1180px')) return panelQuery;
    if (query.includes('820px')) return sidebarQuery;
    if (query.includes('860px')) return toolsQuery;
    return hoverQuery;
  };

  const toolsDialog = document.getElementById('desktop-tools');
  toolsDialog.show = function () { this.open = true; };
  toolsDialog.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };

  const actionsMenu = document.getElementById('desktop-actions');
  const moreBtn = document.getElementById('desktop-more');
  for (const el of [document.getElementById('start-check'), moreBtn, document.getElementById('desktop-panel-toggle'), document.getElementById('desktop-sidebar-expand'), document.getElementById('desktop-tools-close')]) {
    el.checkVisibility = function () { return this.isConnected && !this.closest('[hidden]'); };
  }
  const toolsToggle = document.getElementById('desktop-tools-toggle');
  toolsToggle.checkVisibility = () => actionsMenu.dataset.open === 'true';

  const menuSelections = [];
  const shell = mountShellLayout({
    onMenuAction: value => menuSelections.push(value),
  });
  const shellCss = readRepoFile('desktop/src/shell/shell.css');
  const cssWidthQueries = [...shellCss.matchAll(/@media\s+(\(max-width:\s*\d+px\))\s*\{\s*\.desktop-app \.desktop-layout,/g)]
    .map(([, query]) => query);
  assert.deepEqual(shellWidthQueries, cssWidthQueries, 'drawer styles and accessibility state use the same media conditions');
  const tools = mountToolsPanel({
    beforeOpen: () => {
      shell.closeSidebarDrawer();
      shell.closePanelDrawer();
      return true;
    },
  });
  let shortcutNew = 0;
  const disposeShortcuts = bindApplicationShortcuts({
    newSession: () => { shortcutNew++; },
    search: () => {},
    settings: () => {},
    togglePanel: () => shell.togglePanel(),
    toggleSidebar: () => shell.toggleSidebar(),
  });
  cleanupCurrent = () => {
    disposeShortcuts();
    tools.destroy();
    shell.destroy();
    document.body.replaceChildren();
  };

  const layout = document.querySelector('.desktop-layout');
  const sidebar = document.getElementById('desktop-sidebar');
  const main = document.getElementById('desktop-main');
  const rightPanel = document.getElementById('desktop-right-panel');
  const backdrop = document.getElementById('desktop-shell-backdrop');
  const panelToggle = document.getElementById('desktop-panel-toggle');
  const sidebarToggle = document.getElementById('desktop-sidebar-toggle');
  const sidebarExpand = document.getElementById('desktop-sidebar-expand');

  // 1. Wide desktop (> 1180px): three columns visible, no dialog role or inert
  assert.equal(layout.dataset.sidebar, 'open');
  assert.equal(layout.dataset.panel, 'open');
  assert.equal(sidebar.getAttribute('role'), null);
  assert.equal(rightPanel.getAttribute('role'), null);
  assert.equal(Boolean(main.inert), false);
  assert.equal(backdrop.hidden, true);
  assert.equal(sidebarExpand.hidden, true);

  // Ctrl+J toggles right panel; Ctrl+B collapses and re-expands left sidebar
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(layout.dataset.panel, 'closed');
  assert.equal(panelToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(panelToggle.getAttribute('aria-pressed'), 'false');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(layout.dataset.panel, 'open');
  assert.equal(panelToggle.getAttribute('aria-pressed'), 'true');

  sidebarToggle.focus();
  sidebarToggle.click();
  assert.equal(layout.dataset.sidebar, 'closed');
  assert.equal(sidebarExpand.hidden, false);
  assert.equal(document.activeElement?.id, 'desktop-sidebar-expand', 'collapsing sidebar moves focus to header expand button');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.equal(layout.dataset.sidebar, 'open');
  assert.equal(sidebarExpand.hidden, true);

  // IME composition never fires shortcuts
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true }));
  assert.equal(shortcutNew, 0);

  // 2. Narrow right panel (<= 1180px): rescues focus on collapse; closePanelDrawer un-inerts <main> when opening workspace/tools
  const initialTab = rightPanel.querySelector('[role="tab"]');
  initialTab.focus();
  panelQuery.setMatches(true);
  assert.equal(layout.dataset.panel, 'closed');
  assert.equal(document.activeElement?.id, 'desktop-panel-toggle', 'narrowing right panel must rescue focus from hidden panel');

  panelToggle.focus();
  panelToggle.click();
  assert.equal(layout.dataset.panel, 'open');
  assert.equal(rightPanel.getAttribute('role'), 'dialog');
  assert.equal(rightPanel.getAttribute('aria-modal'), 'true');
  assert.equal(Boolean(main.inert), true);
  assert.equal(Boolean(sidebar.inert), true);
  assert.equal(backdrop.hidden, false);

  // Opening #desktop-tools from inside narrow right-panel drawer closes the drawer & un-inerts <main>
  tools.open(panelToggle);
  assert.equal(toolsDialog.open, true);
  assert.equal(layout.dataset.panel, 'closed', 'opening tools must close narrow panel drawer');
  assert.equal(Boolean(main.inert), false, '<main> must not stay inert behind tools');
  tools.close();
  assert.equal(toolsDialog.open, false);

  // Reopen right drawer and dismiss with Escape -> restores focus to #desktop-panel-toggle
  panelToggle.focus();
  panelToggle.click();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(layout.dataset.panel, 'closed');
  assert.equal(rightPanel.getAttribute('role'), null);
  assert.equal(Boolean(main.inert), false);
  assert.equal(document.activeElement?.id, 'desktop-panel-toggle');

  // 3. Narrow left sidebar (<= 820px): modal triggers (#desktop-preferences-open) keep sidebar drawer open so modal close restores focus!
  const prefsBtn = document.getElementById('desktop-preferences-open');
  prefsBtn.focus();
  sidebarQuery.setMatches(true);
  assert.equal(layout.dataset.sidebar, 'open', 'focused sidebar control keeps drawer open across breakpoint');
  prefsBtn.click();
  assert.equal(layout.dataset.sidebar, 'open', 'clicking modal trigger in narrow sidebar must NOT hide its return-focus button');

  // Backdrop click dismisses left drawer and restores focus to #desktop-sidebar-expand
  backdrop.click();
  assert.equal(layout.dataset.sidebar, 'closed');
  assert.equal(sidebar.getAttribute('role'), null);
  assert.equal(Boolean(main.inert), false);
  assert.equal(document.activeElement?.id, 'desktop-sidebar-expand');

  // Return to wide desktop
  sidebarQuery.setMatches(false);
  panelQuery.setMatches(false);
  assert.equal(sidebar.getAttribute('role'), null);
  assert.equal(rightPanel.getAttribute('role'), null);
  assert.equal(Boolean(main.inert), false);

  // 4. Header overflow menu keyboard, #desktop-tools-toggle close focus fallback, and outside focusin dismissal
  moreBtn.focus();
  moreBtn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(moreBtn.getAttribute('aria-expanded'), 'true');
  const renameItem = actionsMenu.querySelector('[data-menu-value="rename"]');
  const findItem = actionsMenu.querySelector('[data-menu-value="find"]');
  const toolsItem = actionsMenu.querySelector('[data-menu-value="tools"]');
  assert.equal(document.activeElement === renameItem, true);

  renameItem.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement === findItem, true);
  findItem.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement === toolsItem, true);

  // Activate #desktop-tools-toggle from overflow menu -> opens tools; closing tools falls back to visible #desktop-more
  toolsItem.click();
  assert.equal(toolsDialog.open, true);
  assert.equal(moreBtn.getAttribute('aria-expanded'), 'false');
  document.getElementById('desktop-tools-close').click();
  assert.equal(toolsDialog.open, false);
  assert.equal(document.activeElement?.id, 'desktop-more', 'closing tools opened from overflow menu must return focus to visible #desktop-more');

  moreBtn.focus();
  moreBtn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  renameItem.click();
  assert.deepEqual(menuSelections, ['rename']);
  assert.equal(moreBtn.getAttribute('aria-expanded'), 'false');

  // Outside focusin closes an open overflow menu
  moreBtn.click();
  assert.equal(moreBtn.getAttribute('aria-expanded'), 'true');
  panelToggle.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
  assert.equal(moreBtn.getAttribute('aria-expanded'), 'false');
});

test('F00 right panel React + Base UI tabs: preserves initial HTML skeleton, chunk retry, states, real ArrowRight/Home/End nav, and governance safety', async () => {
  assert.ok(existsSync(new URL('desktop/src/components/ui/tabs.tsx', rootUrl)), 'missing desktop/src/components/ui/tabs.tsx');
  assert.ok(existsSync(new URL('desktop/src/components/ui/tooltip.tsx', rootUrl)), 'missing desktop/src/components/ui/tooltip.tsx');
  assert.ok(existsSync(new URL('desktop/src/shell/right-panel.ts', rootUrl)), 'missing desktop/src/shell/right-panel.ts');
  assert.ok(existsSync(new URL('desktop/src/shell/right-panel-renderer.tsx', rootUrl)), 'missing desktop/src/shell/right-panel-renderer.tsx');

  const { mountRightPanel } = loadDesktopModule('src/shell/right-panel.ts');
  const realRendererModule = loadDesktopModule('src/shell/right-panel-renderer.tsx');

  const { window } = dom;
  const { document } = window;
  const html = readRepoFile('desktop/index.html');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  assert.ok(bodyMatch, 'body markup');
  const scratch = document.createElement('div');
  scratch.innerHTML = bodyMatch[1];
  const host = scratch.querySelector('#desktop-right-panel');
  assert.ok(host, 'missing #desktop-right-panel in index.html');
  document.body.replaceChildren(host);

  const actions = [];
  let resolveChunk;
  let shouldFailChunk = true;
  let panel;
  act(() => {
    panel = mountRightPanel(
      {
        host,
        onManageProject: () => actions.push('manageProject'),
        onOpenWorkflow: () => actions.push('openWorkflow'),
        onRunCheck: () => actions.push('runCheck'),
        onOpenReport: () => actions.push('openReport'),
        onOpenRepair: () => actions.push('openRepair'),
        onOpenRepairHistory: () => actions.push('openRepairHistory'),
        onOpenSource: url => actions.push(`source:${url}`),
        onOpenTools: () => actions.push('openTools'),
        onCloseDrawer: () => actions.push('closeDrawer'),
      },
      () =>
        new Promise((resolve, reject) => {
          resolveChunk = () => (shouldFailChunk ? reject(new Error('chunk load failed')) : resolve(realRendererModule));
        }),
    );
  });

  cleanupCurrent = () => {
    act(() => {
      panel.destroy();
      flushRaf();
    });
    document.body.replaceChildren();
  };

  // Initial pre-hydrated 4-tab bar + skeleton from index.html stays intact while chunk is pending!
  assert.equal(host.querySelectorAll('[role="tab"]').length, 4, 'initial 4-tab shell must not be wiped before chunk settles');

  await act(async () => {
    resolveChunk();
    await setImmediate();
    flushRaf();
  });
  // Chunk load failure renders accessible error + retry
  assert.match(host.textContent ?? '', /重新加载/);
  shouldFailChunk = false;
  act(() => {
    host.querySelector('[data-panel-retry]')?.click();
  });
  await act(async () => {
    resolveChunk();
    await setImmediate();
    flushRaf();
  });

  // 1. Empty states when no project
  const getTabs = () => [...host.querySelectorAll('[role="tab"]')];
  assert.deepEqual(getTabs().map(tab => tab.textContent?.replace(/\d+/g, '').trim()), ['上线', '依据', '改动', '开发者工具']);
  assert.equal(getTabs()[0].getAttribute('aria-selected'), 'true');
  assert.match(host.textContent ?? '', /添加项目/);
  act(() => {
    host.querySelector('[data-empty-action="manage-project"]')?.click();
    flushRaf();
  });
  assert.deepEqual(actions, ['manageProject']);

  // 2. Loading skeleton state (`aria-busy="true"`)
  act(() => {
    panel.update({
      project: { id: 'p1', name: '拾光相册', directory: 'C:/album', subject: 'personal', revision: 1, createdAt: 1, updatedAt: 1, directoryAvailable: true },
      releaseState: { status: 'loading' },
      changesState: { status: 'loading' },
      devtoolsState: { status: 'loading' },
    });
    flushRaf();
  });
  assert.ok(host.querySelector('[aria-busy="true"]'), 'loading state must expose aria-busy="true"');

  // 3. Error state with retry callback
  let retriedRelease = 0;
  act(() => {
    panel.update({
      releaseState: { status: 'error', message: '无法读取阶段状态', onRetry: () => { retriedRelease++; } },
    });
    flushRaf();
  });
  assert.match(host.textContent ?? '', /无法读取阶段状态/);
  act(() => {
    host.querySelector('[data-state-retry="release"]')?.click();
    flushRaf();
  });
  assert.equal(retriedRelease, 1);

  // 4. Populated states + saved artifact timestamp fallback in ReleaseTabBody + real keyboard roving
  const savedCreatedAt = Date.UTC(2026, 10, 18, 4, 0, 0);
  act(() => {
    panel.update({
      project: {
        id: 'p1',
        name: '拾光相册',
        directory: 'C:/album',
        subject: 'personal',
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
        directoryAvailable: true,
      },
      artifact: {
        id: 'art-1',
        runId: 'run-1',
        projectId: 'p1',
        kind: 'check',
        title: '代码预检',
        markdown: '# 预检',
        createdAt: savedCreatedAt,
        projectRevision: 2,
        toolVersion: '0.2.0-rc.4',
        rulesVersion: '{}',
        inputSummary: '测试',
      },
      releaseState: {
        status: 'ready',
        completedCount: 3,
        totalCount: 8,
        nextAction: { stageId: 'privacy', title: '用户隐私保护指引', description: '补充地理位置信息声明' },
        stages: [
          { id: 'register', title: '注册小程序账号', status: 'confirmed', summary: '人工已确认' },
          { id: 'privacy', title: '用户隐私保护指引', status: 'pending', summary: '待确认' },
          { id: 'publish', title: '发布上线', status: 'pending', summary: '由你在微信后台操作' },
        ],
        lastCheckSummary: null,
      },
      evidenceState: {
        status: 'ready',
        items: [
          {
            ruleId: 'privacy.getLocation',
            title: '地理位置隐私声明',
            severity: 'warning',
            confidence: 'medium',
            sourceQuote: '小程序、插件中涉及处理用户个人信息的开发者，均需补充相应用户隐私保护指引。',
            officialUrl: 'https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/',
            lastVerified: '2026-06-13',
            requires: ['在《小程序用户隐私保护指引》中声明地理位置用途', '在 app.json 声明 requiredPrivateInfos'],
            stage: 'privacy',
          },
          {
            ruleId: 'login.after-experience',
            title: '未体验功能前要求登录',
            severity: 'blocker',
            confidence: 'high',
            sourceQuote: '小程序内提供的功能，不得在用户尚未体验前强制要求授权登录。',
            officialUrl: 'javascript:alert(1)',
            lastVerified: '2026-06-13',
            requires: ['将登录延后到实际需要账号的操作节点'],
            stage: 'review',
          },
        ],
      },
      changesState: {
        status: 'ready',
        operations: [
          {
            operationId: 'op-1',
            file: 'app.json',
            summary: '已写入 app.json · 待复检',
            createdAt: savedCreatedAt,
          },
        ],
      },
      devtoolsState: { status: 'empty' },
    });
    flushRaf();
  });

  assert.match(host.textContent ?? '', /3\s*\/\s*8/);
  assert.doesNotMatch(host.textContent ?? '', /尚未运行预检/, 'saved artifact must populate 最近报告 timestamp instead of 尚未运行预检');
  assert.doesNotMatch(host.textContent ?? '', FORBIDDEN_GOVERNANCE_RE);

  // Real keyboard ArrowRight / End / Home on Base UI TabsList (Base UI defers CompositeRoot focus via queueMicrotask)
  await act(async () => {
    getTabs()[0].focus();
    getTabs()[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await Promise.resolve();
    flushRaf();
  });
  assert.equal(document.activeElement === getTabs()[1], true, 'ArrowRight must move focus to second tab');
  assert.equal(getTabs()[1].getAttribute('aria-selected'), 'true', 'ArrowRight must activate second tab');
  assert.match(host.textContent ?? '', /地理位置隐私声明/);

  // Safe https: source link renders and triggers onOpenSource; unsafe javascript: URL is blocked
  assert.ok(host.querySelector('.shell-src-link'), 'https officialUrl renders link button');
  act(() => {
    host.querySelector('.shell-src-link')?.click();
    flushRaf();
  });
  assert.ok(actions.includes('source:https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/'));

  act(() => {
    host.querySelector('[data-evidence-next]')?.click();
    flushRaf();
  });
  assert.match(host.textContent ?? '', /未体验功能前要求登录/);
  assert.equal(host.querySelector('.shell-src-link'), null, 'non-https officialUrl must never render clickable link');

  // End & Home keys on TabsList
  await act(async () => {
    getTabs()[1].focus();
    getTabs()[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    await Promise.resolve();
    flushRaf();
  });
  assert.equal(document.activeElement === getTabs()[3], true, 'End must focus last tab');
  assert.equal(getTabs()[3].getAttribute('aria-selected'), 'true');
  assert.match(host.textContent ?? '', /微信开发者工具/);

  await act(async () => {
    getTabs()[3].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    await Promise.resolve();
    flushRaf();
  });
  assert.equal(document.activeElement === getTabs()[0], true, 'Home must focus first tab');
  assert.equal(getTabs()[0].getAttribute('aria-selected'), 'true');
});

test('F01 rail binds location evidence to the current local check through lazy mount and history', async () => {
  const { mountRightPanel } = loadDesktopModule('src/shell/right-panel.ts');
  const renderer = loadDesktopModule('src/shell/right-panel-renderer.tsx');
  const { document } = dom.window;
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const project = { id: 'evidence-project', name: '证据夹具', directory: 'C:/fixture', subject: 'personal', revision: 1, contextRevision: 1, createdAt: 1, updatedAt: 1, directoryAvailable: true };
  const other = { ...project, id: 'other-project' };
  const official = 'https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/';
  const rules = ['located', 'partial', 'unavailable'].map(ruleId => ({
    ruleId, title: '合成规则 ' + ruleId, stage: 'privacy', severity: 'warning', why: '固定原因',
    requires: ['核对要求'], official_url: official, source_quote: '固定官方引文', last_verified: '2026-11-13', manual_required: true,
  }));
  rules[2].requires.push(`检测到出站域名：${'subdomain.example.com、'.repeat(200)}`);
  const paymentRule = ruleToItem(loadData().rules.find(rule => rule.id === 'payment.requires-merchant'));
  rules.push(paymentRule);
  const artifact = {
    id: 'fresh-check', runId: 'fresh-check', projectId: project.id, kind: 'check',
    title: '本机预检', markdown: '原始报告', projectRevision: 1, contextRevision: 1, toolVersion: 'test', rulesVersion: '{}', createdAt: 1,
    data: { schemaVersion: 1, kind: 'check', result: { command: 'check', meta: { scan: { filesScanned: 4, scope: { complete: true } } }, items: rules } },
  };
  const preflightEvidence = {
    items: [
      { ruleId: 'located', status: 'located', locations: [{ file: 'pages/new-location.js', line: 9 }] },
      { ruleId: 'partial', status: 'partial', locations: [{ file: 'app.json', line: null }] },
      { ruleId: 'unavailable', status: 'unavailable', locations: [] },
      { ruleId: paymentRule.ruleId, status: 'located', locations: [{ file: 'pages/payment.js', line: 11 }] },
      { ruleId: 'other-rule', status: 'located', locations: [{ file: 'wrong-location.js', line: 2 }] },
    ],
    truncated: true,
  };

  let load;
  const panel = mountRightPanel({ host, onOpenSource: url => { assert.equal(url, official); } }, () => new Promise(resolve => { load = resolve; }));
  cleanupCurrent = () => {
    act(() => { panel.destroy(); flushRaf(); });
    document.body.replaceChildren();
  };
  panel.syncProject(project);
  panel.setArtifact(artifact, preflightEvidence);
  panel.syncProject(other);
  panel.syncProject(project);
  panel.selectTab('evidence');
  await act(async () => { load(renderer); await setImmediate(); flushRaf(); });
  assert.ok(!host.textContent.includes('new-location.js'), 'a switch before hydration cancels queued evidence');

  const render = change => act(() => { change(); flushRaf(); });
  const locations = () => [...host.querySelectorAll('.shell-code-loc > code')].map(node => node.textContent);
  render(() => panel.setArtifact(artifact, preflightEvidence));
  assert.deepEqual(locations(), ['pages/new-location.js:9']);
  assert.match(host.textContent, /阶段 · privacy/);
  assert.match(host.textContent, /固定官方引文/);
  assert.match(host.textContent, /仓库核验日期 2026-11-13/);
  assert.match(host.textContent, /部分位置省略/);
  assert.ok(!host.textContent.includes('wrong-location.js'));
  render(() => { panel.setDrawerMode(true); panel.selectTab('devtools'); });
  render(() => panel.selectTab('evidence'));
  assert.deepEqual(locations(), ['pages/new-location.js:9']);
  render(() => host.querySelector('[data-evidence-next]').click());
  assert.deepEqual(locations(), ['app.json']);
  assert.match(host.textContent, /仅定位到文件/);
  assert.match(host.textContent, /代码位置不完整/);
  render(() => host.querySelector('[data-evidence-next]').click());
  assert.deepEqual(locations(), []);
  assert.match(host.textContent, /未能定位/);
  render(() => host.querySelector('[data-evidence-next]').click());
  assert.deepEqual(locations(), ['pages/payment.js:11']);
  assert.match(host.textContent, /pay\.weixin\.qq\.com/);

  render(() => panel.setArtifact({ ...artifact, id: 'history' }));
  assert.match(host.textContent, /当前会话暂无/);
  assert.match(host.textContent, /固定官方引文/);
  assert.deepEqual(locations(), []);
  render(() => panel.setArtifact(artifact, { items: [], truncated: true }));
  assert.match(host.textContent, /部分位置省略/);
  assert.doesNotMatch(host.textContent, /当前会话暂无/);
  render(() => panel.setArtifact({ ...artifact, id: 'external', provenance: 'imported' }, preflightEvidence));
  assert.match(host.textContent, /导入报告/);
  assert.match(host.textContent, /固定官方引文/);
  assert.match(host.textContent, /导入报告记录日期 2026-11-13/);
  assert.doesNotMatch(host.textContent, /仓库核验日期/);
  assert.deepEqual(locations(), []);
  render(() => { panel.syncProject(other); panel.setArtifact(artifact, preflightEvidence); });
  assert.ok(!host.textContent.includes('new-location.js'));
});

function mountDevtoolsFixture(native = true) {
  const { createRightPanelController } = loadDesktopModule('src/shell/right-panel-renderer.tsx');
  const { document } = dom.window;
  const originalBridge = Object.getOwnPropertyDescriptor(dom.window, '__TAURI_INTERNALS__');
  if (native) {
    Object.defineProperty(dom.window, '__TAURI_INTERNALS__', { configurable: true, value: { invoke() {} } });
  } else {
    delete dom.window.__TAURI_INTERNALS__;
  }
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const calls = [];
  const actions = [];
  let panel;
  act(() => {
    panel = createRightPanelController(host, {
      invoke: (command, args) => new Promise((resolve, reject) => calls.push({ command, args, resolve, reject })),
      onOpenTools: () => actions.push('openTools'),
      onRunCheck: () => actions.push('runCheck'),
      onOpenSource: url => actions.push(url),
    });
    panel.selectTab('devtools');
    flushRaf();
  });
  cleanupCurrent = () => {
    act(() => {
      panel.destroy();
      flushRaf();
    });
    document.body.replaceChildren();
    if (originalBridge) Object.defineProperty(dom.window, '__TAURI_INTERNALS__', originalBridge);
    else delete dom.window.__TAURI_INTERNALS__;
  };
  const button = action => host.querySelector('[data-devtools-action="' + action + '"]');
  const click = action => {
    const control = button(action);
    assert.ok(control, action);
    act(() => {
      control.click();
      flushRaf();
    });
  };
  const settle = async (value, index = calls.length - 1, reject = false) => {
    await act(async () => {
      calls[index][reject ? 'reject' : 'resolve'](value);
      await setImmediate();
      flushRaf();
    });
  };
  return { host, panel, calls, actions, button, click, settle };
}

test('F07 checks only on explicit clicks, preserves focus during loading and shows native status guidance', async () => {
  const { host, calls, actions, button, click, settle } = mountDevtoolsFixture();
  const status = () => host.querySelector('#panel-devtools-status').textContent;
  const check = button('check');
  assert.match(check.textContent, /检测连接/);
  assert.equal(calls.length, 0);
  assert.deepEqual(actions, []);

  check.focus();
  click('check');
  click('check');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'devtools_status');
  assert.deepEqual(calls[0].args, { selectInstall: false });
  assert.match(status(), /正在检查/);
  assert.equal(check.getAttribute('aria-disabled'), 'true');
  assert.equal(dom.window.document.activeElement, check);
  assert.ok(host.querySelector('[data-empty-action="open-tools"]'));

  await settle({ status: 'not_detected', version: null });
  assert.match(status(), /未检测到安装/);
  assert.equal(button('check'), check);
  assert.match(check.textContent, /重新检测/);
  assert.equal(dom.window.document.activeElement, check);
  assert.deepEqual(actions, []);

  click('download');
  assert.deepEqual(actions, ['https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html']);
  assert.equal(calls.length, 1);
  button('choose-install').focus();
  click('choose-install');
  assert.deepEqual(calls[1].args, { selectInstall: true });
  assert.equal(dom.window.document.activeElement, button('choose-install'));
  await settle({ status: 'selection_canceled', version: null });
  assert.match(status(), /未检测到安装/);
  assert.equal(dom.window.document.activeElement, button('choose-install'));

  click('choose-install');
  await settle({ status: 'not_running', version: '2.01.2510290' });
  assert.match(status(), /请先打开工具.*2\.01\.2510290/s);
  assert.equal(dom.window.document.activeElement, check);
  assert.equal(button('choose-install'), null);

  const fixtures = [
    ['port_unavailable', /请检查服务端口.*安全设置/s],
    ['signed_out', /请在工具内登录/],
    ['ready', /已就绪/],
    ['manual_check', /请手动核对.*保留现有访问令牌设置/s],
    ['unsupported', /请手动核对.*Windows/s],
  ];
  for (const [result, expected] of fixtures) {
    click('check');
    await settle({ status: result, version: null });
    assert.match(status(), expected);
  }
  assert.ok(calls.every(call => call.command === 'devtools_status'));
  assert.deepEqual(calls.map(call => call.args), [
    { selectInstall: false }, { selectInstall: true }, { selectInstall: true },
    { selectInstall: false }, { selectInstall: false }, { selectInstall: false },
    { selectInstall: false }, { selectInstall: false },
  ]);
  act(() => host.querySelector('[data-empty-action="open-tools"]').click());
  assert.deepEqual(actions, ['https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html', 'openTools']);
});

test('F07 uses fixed status copy for malformed desktop data and ignores superseded responses', async () => {
  const { host, panel, actions, click, settle } = mountDevtoolsFixture();
  const status = () => host.querySelector('#panel-devtools-status').textContent;
  click('check');
  await settle(new Error('opaque backend details should stay out'), 0, true);
  assert.match(status(), /开发者工具状态读取失败/);
  assert.doesNotMatch(host.textContent, /opaque backend details/);
  click('check');
  await settle({ status: 'unknown native status', version: '1.2.3' });
  assert.match(status(), /开发者工具状态读取失败/);
  assert.doesNotMatch(host.textContent, /unknown native status|1\.2\.3/);

  click('check');
  act(() => panel.update({ devtoolsState: { status: 'empty' } }));
  click('check');
  await settle({ status: 'manual_check', version: 'opaque version value' }, 3);
  await settle({ status: 'ready', version: '1.2.3' }, 2);
  assert.match(status(), /请手动核对/);
  assert.doesNotMatch(host.textContent, /已就绪|opaque version value|1\.2\.3/);
  assert.deepEqual(actions, []);
});

test('F07 browser-only mount provides manual guidance without invoking the desktop bridge', () => {
  const { host, calls, actions, button } = mountDevtoolsFixture(false);
  assert.match(host.querySelector('#panel-devtools-status').textContent, /Windows.*手动核对/s);
  assert.equal(button('check'), null);
  assert.equal(button('choose-install'), null);
  assert.ok(host.querySelector('[data-empty-action="open-tools"]'));
  assert.deepEqual(calls, []);
  assert.deepEqual(actions, []);
});

test('F00 Base UI DropdownMenu primitive: renders --ds-* classes, opens via keyboard/click, and invokes item callbacks', () => {
  assert.ok(existsSync(new URL('desktop/src/components/ui/dropdown-menu.tsx', rootUrl)), 'missing desktop/src/components/ui/dropdown-menu.tsx');
  const {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } = loadDesktopModule('src/components/ui/dropdown-menu.tsx');

  const { document } = dom.window;
  const mountNode = document.createElement('div');
  document.body.replaceChildren(mountNode);
  const picked = [];
  const root = createRoot(mountNode);

  cleanupCurrent = () => {
    act(() => {
      root.unmount();
      flushRaf();
    });
    document.body.replaceChildren();
  };

  act(() => {
    root.render(
      createElement(
        DropdownMenu,
        { defaultOpen: true },
        createElement(DropdownMenuTrigger, { id: 'dm-trigger' }, '操作'),
        createElement(
          DropdownMenuContent,
          null,
          createElement(
            DropdownMenuGroup,
            null,
            createElement(DropdownMenuLabel, null, '会话'),
            createElement(DropdownMenuItem, { id: 'dm-rename', onClick: () => picked.push('rename') }, '重命名'),
            createElement(DropdownMenuSeparator, null),
            createElement(DropdownMenuItem, { id: 'dm-find', onClick: () => picked.push('find') }, '查找'),
          ),
        ),
      ),
    );
    flushRaf();
  });

  const popup = document.querySelector('[data-slot="dropdown-menu-content"]');
  assert.ok(popup?.classList.contains('ui-dropdown__popup'));
  const renameItem = document.getElementById('dm-rename');
  assert.ok(renameItem?.classList.contains('ui-dropdown__item'));
  act(() => {
    renameItem.click();
    flushRaf();
  });
  assert.deepEqual(picked, ['rename']);
});
