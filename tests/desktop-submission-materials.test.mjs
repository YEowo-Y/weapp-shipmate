import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from '../desktop/node_modules/jsdom/lib/api.js';
import { createWorkflowCatalog } from '../src/project-artifact.mjs';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';

const { act } = requireDesktop('react');

const ROOT = resolve(import.meta.dirname, '..');
const INDEX_HTML = readFileSync(resolve(ROOT, 'desktop/index.html'), 'utf8');
const MATERIALS_CSS = readFileSync(resolve(ROOT, 'desktop/src/submission-materials.css'), 'utf8');
const FORBIDDEN_COPY = /可直接提交|已合规|保证过审|可以过审|确保过审|一键提审|代提审/;
const catalog = createWorkflowCatalog();

function makeProject(overrides = {}) {
  return {
    id: 'proj-1',
    name: '测试预约小程序',
    directory: 'D:/demo/app',
    subject: 'enterprise',
    revision: 3,
    contextRevision: 1,
    facts: {
      businessType: '提供到店预约与排号查询',
      hasPayment: false,
      collectsSensitive: true,
      hasServerDomain: true,
      ...(overrides.facts || {}),
    },
    ...overrides,
  };
}

function setupDom() {
  const dom = new JSDOM(INDEX_HTML, {
    url: 'http://tauri.localhost/',
    pretendToBeVisual: true,
  });
  installDesktopDom(dom.window);
  dom.window.__TAURI_INTERNALS__ = { invoke: () => Promise.resolve(null) };
  return dom;
}

test('desktop index.html and CSS contracts: #desktop-materials-open, shared .ui-checkbox forced-colors, and sticky stacked table without tr overflow:hidden', () => {
  const dom = new JSDOM(INDEX_HTML);
  const btn = dom.window.document.getElementById('desktop-materials-open');
  assert.equal(Boolean(btn), true, '#desktop-materials-open must exist in index.html');
  assert.equal(btn?.tagName, 'BUTTON');
  assert.equal(btn?.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(btn?.getAttribute('aria-controls'), 'desktop-materials');
  assert.equal(Boolean(btn?.closest('[aria-labelledby="sidebar-group-materials"]')), true);

  assert.match(MATERIALS_CSS, /@media \(forced-colors: active\)[\s\S]*\.ui-checkbox \{\s*forced-color-adjust:\s*none/);

  // Stacked @container block must not set overflow: hidden on tbody tr (which breaks sticky tbody th)
  const containerIdx = MATERIALS_CSS.indexOf('@container (width < 600px)');
  assert.equal(containerIdx >= 0, true);
  const containerSlice = MATERIALS_CSS.slice(containerIdx, containerIdx + 600);
  assert.equal(/overflow:\s*hidden/.test(containerSlice), false);
});

test('submission materials dialog handles empty, loading, error+retry, ready, distinct draft copy aria-labels, repeat VoiceOver copy, failure retry, and focus fallback', async () => {
  const dom = setupDom();
  const { document } = dom.window;
  const { mountSubmissionMaterials } = loadDesktopModule('src/submission-materials-dialog.tsx');

  let activeProject = null;
  let shouldFail = false;
  let copyShouldFail = false;
  let pendingDeferred = null;
  const copiedTexts = [];
  const downloads = [];
  const openedUrls = [];
  let manageProjectCalls = 0;

  const invoke = async (cmd, args) => {
    if (cmd === 'project_workflow') {
      if (pendingDeferred) return pendingDeferred.promise;
      if (shouldFail) throw new Error('模拟读取项目资料失败');
      return {
        project: activeProject,
        catalog,
        rulesVersion: 'rules-v1',
        confirmations: [],
        requestedId: args?.projectId,
      };
    }
    throw new Error(`Unexpected command: ${cmd}`);
  };

  let ctrl;
  await act(async () => {
    ctrl = mountSubmissionMaterials({
      invoke,
      getProject: () => activeProject,
      getArtifact: () => null,
      onManageProject: () => { manageProjectCalls += 1; },
      onOpenSource: url => { openedUrls.push(url); },
      copyText: async text => {
        if (copyShouldFail) throw new Error('clipboard denied');
        copiedTexts.push(text);
      },
      onDownloadArtifact: artifact => { downloads.push(artifact); return true; },
    });
  });

  const trigger = document.getElementById('desktop-materials-open');
  const panelToggle = document.getElementById('desktop-panel-toggle');
  assert.equal(Boolean(trigger), true);
  assert.equal(Boolean(panelToggle), true);

  const dialog = document.getElementById('desktop-materials');
  assert.equal(Boolean(dialog), true);
  assert.equal(dialog.tagName, 'DIALOG');
  assert.equal(dialog.hasAttribute('role'), false);
  assert.equal(dialog.hasAttribute('aria-modal'), false);

  // 1. Opening with #desktop-panel-toggle as fallback anchor must NOT mutate #desktop-panel-toggle aria-expanded
  panelToggle.setAttribute('aria-expanded', 'false');
  await act(async () => {
    ctrl.open(panelToggle);
    await Promise.resolve();
  });
  assert.equal(panelToggle.getAttribute('aria-expanded'), 'false', 'must not corrupt panel toggle aria-expanded');
  assert.equal(dialog.open, true);
  assert.match(dialog.textContent || '', /未选择项目/);

  const selectProjectBtn = dialog.querySelector('#materials-select-project');
  await act(async () => {
    selectProjectBtn.click();
    await Promise.resolve();
  });
  assert.equal(manageProjectCalls, 1);
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement?.id, 'desktop-panel-toggle');

  // 2. Loading state -> Error state -> Retry -> Ready state
  activeProject = makeProject();
  let resolvePending;
  pendingDeferred = {
    promise: new Promise(resolve => { resolvePending = resolve; }),
  };

  await act(async () => {
    ctrl.open(trigger);
    await Promise.resolve();
  });
  assert.equal(Boolean(dialog.querySelector('[aria-busy="true"]')), true);

  pendingDeferred = null;
  shouldFail = true;
  await act(async () => {
    resolvePending({ project: null });
    await Promise.resolve();
  });
  assert.equal(Boolean(dialog.querySelector('[role="alert"]')), true);

  shouldFail = false;
  await act(async () => {
    dialog.querySelector('#materials-retry').click();
    await Promise.resolve();
  });

  // 3. Ready state: 3 sections, distinct draft copy aria-labels, zero <wa-*>, zero password inputs, zero forbidden copy
  assert.equal(Boolean(dialog.querySelector('#materials-section-fields')), true);
  assert.equal(Boolean(dialog.querySelector('#materials-section-drafts')), true);
  assert.equal(Boolean(dialog.querySelector('#materials-section-checklist')), true);
  assert.equal(dialog.querySelectorAll('input[type="password"]').length, 0);
  assert.equal([...dialog.querySelectorAll('*')].some(el => el.tagName.startsWith('WA-')), false);
  assert.equal(FORBIDDEN_COPY.test(dialog.textContent || ''), false);

  const draftCopyBtns = [...dialog.querySelectorAll('button[data-copy-draft]')];
  assert.equal(draftCopyBtns.length, 3);
  const draftAriaLabels = draftCopyBtns.map(b => b.getAttribute('aria-label') || '');
  assert.equal(new Set(draftAriaLabels).size, 3, 'each draft copy button must have a unique aria-label');
  assert.equal(draftAriaLabels.every(l => l.startsWith('复制草稿 · ')), true);

  const tableWrapper = dialog.querySelector('.table-wrapper');
  assert.equal(tableWrapper?.getAttribute('tabindex'), '0');
  assert.equal(tableWrapper?.getAttribute('role'), 'region');

  // 4. Checklist toggle
  const testAccountCheck = dialog.querySelector('[data-checklist-id="test-account"]');
  assert.equal(testAccountCheck?.getAttribute('aria-checked'), 'false');
  await act(async () => {
    testAccountCheck.click();
    await Promise.resolve();
  });
  assert.equal(testAccountCheck?.getAttribute('aria-checked'), 'true');

  // 5. Copy button: non-disabling, VoiceOver \u00A0 on repeat click, and failure retry recovery
  const copyAllBtn = dialog.querySelector('#materials-copy-all');
  const copyStatus = dialog.querySelector('#materials-copy-status');
  assert.equal(copyAllBtn.contains(copyStatus), false);

  copyAllBtn.focus();
  await act(async () => {
    copyAllBtn.click();
    await Promise.resolve();
  });
  assert.equal(copyAllBtn.disabled, false);
  assert.equal(copyAllBtn.hasAttribute('data-copied'), true);
  assert.equal(copyStatus.textContent, '已复制');
  assert.equal(document.activeElement?.id, 'materials-copy-all');

  // Repeat click appends \u00A0 so VoiceOver re-announces
  await act(async () => {
    copyAllBtn.click();
    await Promise.resolve();
  });
  assert.equal(copyStatus.textContent, '已复制\u00A0');

  // Failure path + retry
  copyShouldFail = true;
  await act(async () => {
    copyAllBtn.click();
    await Promise.resolve();
  });
  assert.equal(copyAllBtn.disabled, false);
  assert.equal(copyAllBtn.hasAttribute('data-failed'), true);
  copyShouldFail = false;

  // 6. Export Markdown & JSON
  await act(async () => {
    dialog.querySelector('#materials-export-md').click();
    dialog.querySelector('#materials-export-json').click();
    await Promise.resolve();
  });
  assert.equal(downloads.length, 2);
  assert.equal(JSON.parse(downloads[1].text).checkedIds.includes('test-account'), true);

  // 7. Official source link
  await act(async () => {
    dialog.querySelector('[data-materials-source]').click();
    await Promise.resolve();
  });
  assert.equal(openedUrls.length, 1);

  // 8. If original trigger becomes hidden before close, focus falls back to a visible shell button instead of body
  trigger.hidden = true;
  await act(async () => {
    dialog.querySelector('#materials-close').click();
    await Promise.resolve();
  });
  assert.equal(dialog.open, false);
  assert.equal(document.activeElement?.id, 'desktop-panel-toggle');
  trigger.hidden = false;

  await act(async () => {
    ctrl.destroy();
  });
  dom.window.close();
});

test('submission materials dialog discards out-of-order project_workflow responses, isolates checklist per project, and exposes right-panel button', async () => {
  const dom = setupDom();
  const { document } = dom.window;
  const { mountSubmissionMaterials } = loadDesktopModule('src/submission-materials-dialog.tsx');
  const { createRightPanelController } = loadDesktopModule('src/shell/right-panel-renderer.tsx');

  const projA = makeProject({ id: 'proj-a', name: '项目甲' });
  const projB = makeProject({ id: 'proj-b', name: '项目乙' });
  let activeProject = projA;

  const resolvers = new Map();
  const invoke = (cmd, args) => {
    if (cmd === 'project_workflow') {
      const id = args?.projectId;
      return new Promise(resolve => {
        resolvers.set(id, resolve);
      });
    }
    if (cmd === 'project_repair_snapshot') return Promise.resolve({ operations: [] });
    return Promise.resolve(null);
  };

  let ctrl;
  await act(async () => {
    ctrl = mountSubmissionMaterials({
      invoke,
      getProject: () => activeProject,
      getArtifact: () => null,
    });
  });

  const trigger = document.getElementById('desktop-materials-open');
  const dialog = document.getElementById('desktop-materials');

  // Open on projA (slow response pending), then immediately switch to projB and refresh
  await act(async () => {
    ctrl.open(trigger);
    await Promise.resolve();
  });
  activeProject = projB;
  await act(async () => {
    ctrl.refresh();
    await Promise.resolve();
  });

  // Resolve projB first -> renders 项目乙
  await act(async () => {
    resolvers.get('proj-b')({ project: projB, catalog, rulesVersion: 'v1', confirmations: [] });
    await Promise.resolve();
  });
  assert.match(dialog.textContent || '', /项目乙/);

  // Check `test-data` in projB
  await act(async () => {
    dialog.querySelector('[data-checklist-id="test-data"]').click();
    await Promise.resolve();
  });
  assert.equal(dialog.querySelector('[data-checklist-id="test-data"]')?.getAttribute('aria-checked'), 'true');

  // Late projA response arrives AFTER projB -> must be discarded!
  await act(async () => {
    resolvers.get('proj-a')({ project: projA, catalog, rulesVersion: 'v1', confirmations: [] });
    await Promise.resolve();
  });
  assert.match(dialog.textContent || '', /项目乙/);
  assert.equal((dialog.textContent || '').includes('项目甲'), false);

  // Switch back to projA cleanly -> projA checklist is isolated (test-data unchecked)
  activeProject = projA;
  await act(async () => {
    ctrl.refresh();
    await Promise.resolve();
  });
  await act(async () => {
    resolvers.get('proj-a')({ project: projA, catalog, rulesVersion: 'v1', confirmations: [] });
    await Promise.resolve();
  });
  assert.match(dialog.textContent || '', /项目甲/);
  assert.equal(dialog.querySelector('[data-checklist-id="test-data"]')?.getAttribute('aria-checked'), 'false');

  // Verify right-panel workflow renders #panel-workflow-materials with aria-haspopup="dialog" and aria-controls="desktop-materials"
  let openMaterialsCalled = 0;
  const panelHost = document.getElementById('desktop-right-panel');
  let panelCtrl;
  await act(async () => {
    panelCtrl = createRightPanelController(panelHost, {
      invoke: async cmd => {
        if (cmd === 'project_workflow') return { project: projA, catalog, rulesVersion: 'v1', confirmations: [] };
        return { operations: [] };
      },
      onOpenMaterials: () => { openMaterialsCalled += 1; },
    });
    panelCtrl.syncProject(projA, null);
    await Promise.resolve();
  });
  const panelBtn = panelHost.querySelector('#panel-workflow-materials');
  assert.equal(Boolean(panelBtn), true);
  assert.equal(panelBtn?.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(panelBtn?.getAttribute('aria-controls'), 'desktop-materials');
  await act(async () => {
    panelBtn.click();
    await Promise.resolve();
  });
  assert.equal(openMaterialsCalled, 1);

  await act(async () => {
    panelCtrl.destroy();
    ctrl.destroy();
  });
  dom.window.close();
});
