import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { createWorkflowCatalog } from '../src/project-artifact.mjs';
import { installDesktopDom, loadDesktopModule, requireDesktop } from './helpers/react-desktop.mjs';

const { JSDOM } = requireDesktop('jsdom');
const React = requireDesktop('react');
const { act } = React;

const rootUrl = new URL('../', import.meta.url);
const readRepoFile = relativePath => readFileSync(new URL(relativePath, rootUrl), 'utf8');

const REAL_CATALOG = createWorkflowCatalog();
const EXPECTED_STAGE_IDS = REAL_CATALOG.stages.map(stage => stage.stage);
const FORBIDDEN_GOVERNANCE_RE = /已合规|保证过审|可直接提交/;

const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body class="desktop-app" data-theme="light"></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
installDesktopDom(dom.window);

let rafId = 0;
const rafQueue = new Map();
const rAF = cb => {
  const id = ++rafId;
  rafQueue.set(id, cb);
  return id;
};
const cAF = id => { rafQueue.delete(id); };
Object.defineProperty(dom.window, 'requestAnimationFrame', { configurable: true, writable: true, value: rAF });
Object.defineProperty(dom.window, 'cancelAnimationFrame', { configurable: true, writable: true, value: cAF });
Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: rAF });
Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: cAF });

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

async function flushAsync() {
  await setImmediate();
  await Promise.resolve();
  flushRaf();
}

function setNativeValue(element, value) {
  const proto = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor.set.call(element, value);
}

const { mountRightPanel } = loadDesktopModule('src/shell/right-panel.ts');
const realRendererModule = loadDesktopModule('src/shell/right-panel-renderer.tsx');

async function mountWorkflowPanelHarness(initialProjectOverrides = {}, hooks = {}) {
  const { window } = dom;
  const { document } = window;

  let project = {
    id: 'proj-a',
    name: '拾光相册',
    directory: 'C:/album',
    directoryAvailable: true,
    subject: 'personal',
    revision: 2,
    contextRevision: 1,
    createdAt: 1,
    updatedAt: 2,
    facts: {
      businessType: '带货直播预约',
      hasPayment: null,
      collectsSensitive: null,
      hasServerDomain: null,
    },
    ...initialProjectOverrides,
  };
  let rulesVersion = 'rules-v1';
  let confirmations = [];
  let saveSubjectAllowed = true;
  const calls = [];
  const mutations = [];
  const downloads = [];
  const openedSources = [];
  let fullWorkflowOpened = 0;
  let generatedGuides = 0;

  const invoke = async (cmd, args = {}) => {
    calls.push([cmd, args]);
    if (hooks.onInvoke) {
      const custom = await hooks.onInvoke(cmd, args, { getProject: () => project });
      if (custom !== undefined) return custom;
    }
    if (cmd === 'project_workflow') {
      return {
        project: JSON.parse(JSON.stringify(project)),
        catalog: REAL_CATALOG,
        rulesVersion,
        confirmations: JSON.parse(JSON.stringify(confirmations)),
      };
    }
    if (cmd === 'project_repair_snapshot') {
      return { operations: [] };
    }
    if (cmd === 'project_facts_save') {
      assert.equal(args.expectedRevision, project.revision, 'facts save must pass current expectedRevision');
      project = {
        ...project,
        revision: project.revision + 1,
        contextRevision: (project.contextRevision ?? 0) + 1,
        facts: JSON.parse(JSON.stringify(args.facts)),
      };
      return project;
    }
    if (cmd === 'project_stage_confirm') {
      assert.equal(args.expectedRevision, project.revision, 'stage confirm must pass current expectedRevision');
      assert.equal(args.expectedRulesVersion, rulesVersion, 'stage confirm must pass current expectedRulesVersion');
      confirmations = [
        ...confirmations.filter(item => item.stageId !== args.stageId),
        {
          stageId: args.stageId,
          state: args.state,
          note: args.note ?? '',
          recordedAt: Date.UTC(2026, 10, 18, 6, 0, 0),
          contextRevision: project.contextRevision ?? 0,
          rulesVersion,
        },
      ];
      project = { ...project, revision: project.revision + 1 };
      return {};
    }
    throw new Error(`Unexpected IPC command: ${cmd}`);
  };

  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    writable: true,
    value: { invoke },
  });

  const badge = document.createElement('span');
  badge.id = 'desktop-workflow-progress';
  const host = document.createElement('aside');
  host.id = 'desktop-right-panel';
  document.body.replaceChildren(badge, host);

  let panel;
  await act(async () => {
    panel = mountRightPanel(
      {
        host,
        invoke,
        onSaveSubject: async (projectId, nextSubject) => {
          calls.push(['saveSubject', { projectId, subject: nextSubject }]);
          if (!saveSubjectAllowed || projectId !== project.id) return false;
          project = {
            ...project,
            subject: nextSubject,
            revision: project.revision + 1,
            contextRevision: (project.contextRevision ?? 0) + 1,
          };
          return true;
        },
        onProjectMutated: async () => {
          mutations.push(project.revision);
          await hooks.onProjectMutated?.(project);
        },
        onGenerateGuide: async projectId => {
          assert.equal(projectId, project.id);
          generatedGuides++;
        },
        onDownloadArtifact: artifact => {
          downloads.push(artifact);
          return true;
        },
        onOpenWorkflow: () => { fullWorkflowOpened++; },
        onOpenSource: url => { openedSources.push(url); },
      },
      async () => realRendererModule,
    );
    await flushAsync();
  });

  await act(async () => {
    panel.syncProject(project, null);
    await flushAsync();
  });

  cleanupCurrent = () => {
    act(() => {
      panel.destroy();
      flushRaf();
    });
    delete window.__TAURI_INTERNALS__;
    document.body.replaceChildren();
  };

  return {
    window,
    document,
    host,
    badge,
    panel,
    calls,
    mutations,
    downloads,
    openedSources,
    getFullWorkflowOpened: () => fullWorkflowOpened,
    getGeneratedGuides: () => generatedGuides,
    getProject: () => project,
    setProjectExternal(next) { project = next; },
    setRulesVersionExternal(next) { rulesVersion = next; },
    setConfirmationsExternal(next) { confirmations = next; },
    setSaveSubjectAllowed(next) { saveSubjectAllowed = next; },
  };
}

test('F02 CSS token & disabled-state contract: shell.css uses only defined --ds-* tokens and styles disabled buttons/fields', () => {
  const shellCss = readRepoFile('desktop/src/shell/shell.css');
  assert.doesNotMatch(shellCss, /var\(--ds-surface\)/, 'must not reference undefined --ds-surface');
  assert.doesNotMatch(shellCss, /var\(--ds-duration-fast\)/, 'must not reference undefined --ds-duration-fast');
  assert.match(shellCss, /\.shell-btn:disabled\b/, 'shell.css must style .shell-btn:disabled');
});

test('F02 right-panel workflow: renders all 8 flow.yaml stages, filters all 3 subjects (personal/individual_business/enterprise), surfaces subject-save failure, and disambiguates aria-labels', async () => {
  const h = await mountWorkflowPanelHarness();
  const { document, host } = h;

  assert.equal(EXPECTED_STAGE_IDS.length, 8);
  const stageDetails = [...host.querySelectorAll('details.shell-stage[data-stage]')];
  assert.deepEqual(
    stageDetails.map(el => el.getAttribute('data-stage')),
    EXPECTED_STAGE_IDS,
    'right panel must render all 8 stages in flow.yaml order',
  );

  // Accessibility & governance invariants
  assert.equal(host.querySelectorAll('summary h1, summary h2, summary h3, summary h4, summary h5, summary h6').length, 0);
  assert.doesNotMatch(host.innerHTML, /<wa-/i, 'right panel must contain zero Web Awesome tags');
  assert.doesNotMatch(host.textContent ?? '', FORBIDDEN_GOVERNANCE_RE);
  assert.match(
    document.getElementById('panel-stage-confirm-registration')?.getAttribute('aria-label') ?? '',
    /人工确认.*注册小程序账号/,
    'stage action buttons must carry stage-specific aria-label',
  );

  // 1. Personal subject: shows personal-only category warning, hides enterprise-only certification rule
  assert.doesNotMatch(
    host.querySelector('details.shell-stage[data-stage="certification"]')?.textContent ?? '',
    /核对企业主体身份验证与所需能力/,
  );
  assert.match(host.textContent ?? '', /个人主体只开放有限服务类目/);

  // 2. Failed subject save (`saveSubject` returns false): keeps draft and announces error!
  const subjectSelect = document.getElementById('panel-workflow-subject');
  h.setSaveSubjectAllowed(false);
  await act(async () => {
    setNativeValue(subjectSelect, 'individual_business');
    subjectSelect.dispatchEvent(new h.window.Event('change', { bubbles: true }));
    await flushAsync();
  });
  const saveSubjectBtn = document.getElementById('panel-workflow-subject-save');
  assert.equal(h.calls.some(([cmd]) => cmd === 'saveSubject'), false);
  await act(async () => {
    saveSubjectBtn.click();
    await flushAsync();
  });
  assert.equal(subjectSelect.value, 'individual_business', 'failed subject save must retain selected draft');
  assert.equal(document.getElementById('panel-workflow-status')?.getAttribute('data-tone'), 'error');

  // 3. Individual business subject: hides both personal-only warning and enterprise-only certification rule
  h.setSaveSubjectAllowed(true);
  await act(async () => {
    saveSubjectBtn.click();
    await flushAsync();
  });
  assert.equal(
    h.calls.some(([cmd, arg]) => cmd === 'saveSubject' && arg.projectId === 'proj-a' && arg.subject === 'individual_business'),
    true,
  );
  assert.doesNotMatch(host.textContent ?? '', /个人主体只开放有限服务类目/);
  assert.doesNotMatch(
    host.querySelector('details.shell-stage[data-stage="certification"]')?.textContent ?? '',
    /核对企业主体身份验证与所需能力/,
  );

  // 4. Enterprise subject: shows enterprise certification rule
  await act(async () => {
    setNativeValue(subjectSelect, 'enterprise');
    subjectSelect.dispatchEvent(new h.window.Event('change', { bubbles: true }));
    await flushAsync();
  });
  await act(async () => {
    document.getElementById('panel-workflow-subject-save').click();
    await flushAsync();
  });
  assert.match(
    host.querySelector('details.shell-stage[data-stage="certification"]')?.textContent ?? '',
    /核对企业主体身份验证与所需能力/,
  );

  // Equivalent full-view entry remains functional
  act(() => {
    document.getElementById('panel-workflow-open-full').click();
    flushRaf();
  });
  assert.equal(h.getFullWorkflowOpened(), 1);
});

test('F02 next-step guidance, stage confirmation, empty-note cleanup without false stale lock, and prerequisite guard', async () => {
  const h = await mountWorkflowPanelHarness();
  const { document, host } = h;

  // Typing a stage note and deleting it back to "" must NOT leave a phantom noteBases entry that locks the stage on later fact save!
  const regNoteInitial = document.getElementById('panel-stage-note-registration');
  await act(async () => {
    setNativeValue(regNoteInitial, '临时输入又删空');
    regNoteInitial.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    setNativeValue(regNoteInitial, '');
    regNoteInitial.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    await flushAsync();
  });

  // Confirm first 4 stages so privacy becomes nextAction with unknown collectsSensitive
  h.setConfirmationsExternal([
    { stageId: 'registration', state: 'confirmed', note: '', recordedAt: 1, contextRevision: 1, rulesVersion: 'rules-v1' },
    { stageId: 'certification', state: 'confirmed', note: '', recordedAt: 2, contextRevision: 1, rulesVersion: 'rules-v1' },
    { stageId: 'filing', state: 'confirmed', note: '', recordedAt: 3, contextRevision: 1, rulesVersion: 'rules-v1' },
    { stageId: 'category', state: 'confirmed', note: '', recordedAt: 4, contextRevision: 1, rulesVersion: 'rules-v1' },
  ]);
  await act(async () => {
    h.panel.syncProject(h.getProject(), null);
    await flushAsync();
  });

  assert.equal(h.badge.textContent, '4/8');
  const nextBtn = document.getElementById('panel-workflow-next-btn');
  assert.match(nextBtn.textContent ?? '', /补充项目事实/);

  const factsDetails = document.getElementById('panel-workflow-facts');
  factsDetails.open = false;
  await act(async () => {
    nextBtn.click();
    await flushAsync();
  });
  assert.equal(factsDetails.open, true, 'unknown fact next-step must open facts disclosure');
  assert.equal(document.activeElement?.id, 'panel-workflow-collectsSensitive');
  assert.equal(h.calls.some(([cmd]) => cmd === 'project_stage_confirm'), false);

  // Save collectsSensitive = false via explicit form submit (must NOT transiently show #panel-workflow-facts-conflict!)
  const sensitiveSelect = document.getElementById('panel-workflow-collectsSensitive');
  const factsForm = document.getElementById('panel-workflow-facts-form');
  await act(async () => {
    setNativeValue(sensitiveSelect, 'false');
    sensitiveSelect.dispatchEvent(new h.window.Event('change', { bubbles: true }));
    factsForm.dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    await flushAsync();
  });

  // Registration had its note cleared back to "" earlier -> must NOT show staleNote discard button!
  assert.equal(Boolean(document.getElementById('panel-stage-note-discard-registration')), false, 'cleared empty note must not trigger staleNote lock');
  assert.equal(document.getElementById('panel-stage-confirm-registration').disabled, false);

  // Fact change incremented contextRevision -> prior confirmations project as `stale` until re-confirmed
  assert.equal(
    host.querySelector('details.shell-stage[data-stage="registration"]')?.getAttribute('data-state'),
    'stale',
  );
  h.setConfirmationsExternal([
    { stageId: 'registration', state: 'confirmed', note: '', recordedAt: 5, contextRevision: h.getProject().contextRevision, rulesVersion: 'rules-v1' },
    { stageId: 'certification', state: 'confirmed', note: '', recordedAt: 6, contextRevision: h.getProject().contextRevision, rulesVersion: 'rules-v1' },
    { stageId: 'filing', state: 'confirmed', note: '', recordedAt: 7, contextRevision: h.getProject().contextRevision, rulesVersion: 'rules-v1' },
    { stageId: 'category', state: 'confirmed', note: '', recordedAt: 8, contextRevision: h.getProject().contextRevision, rulesVersion: 'rules-v1' },
  ]);
  await act(async () => {
    h.panel.syncProject(h.getProject(), null);
    await flushAsync();
  });

  await act(async () => {
    document.getElementById('panel-workflow-next-btn').click();
    await flushAsync();
  });
  const privacyDetails = host.querySelector('details.shell-stage[data-stage="privacy"]');
  assert.equal(privacyDetails.open, true);
  assert.equal(document.activeElement?.id, 'panel-stage-summary-privacy');

  // Empty not_applicable reason sets aria-invalid="true", links error in aria-describedby, and focuses textarea
  const privacyNotApplicableBtn = document.getElementById('panel-stage-not-applicable-privacy');
  const privacyNote = document.getElementById('panel-stage-note-privacy');
  await act(async () => {
    privacyNotApplicableBtn.click();
    await flushAsync();
  });
  assert.equal(privacyNote.getAttribute('aria-invalid'), 'true');
  assert.match(privacyNote.getAttribute('aria-describedby') ?? '', /panel-stage-error-privacy/);
  assert.equal(document.activeElement?.id, 'panel-stage-note-privacy');
  assert.equal(document.getElementById('panel-workflow-status')?.getAttribute('data-tone'), 'error');

  // Typing clears aria-invalid AND clears stale error status banner
  await act(async () => {
    setNativeValue(privacyNote, '纯工具离线运行，不收集任何敏感信息');
    privacyNote.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    await flushAsync();
  });
  assert.equal(privacyNote.getAttribute('aria-invalid'), 'false');
  assert.doesNotMatch(privacyNote.getAttribute('aria-describedby') ?? '', /panel-stage-error-privacy/);
  assert.notEqual(document.getElementById('panel-workflow-status')?.getAttribute('data-tone'), 'error');

  // Submitting not_applicable succeeds
  await act(async () => {
    privacyNotApplicableBtn.click();
    await flushAsync();
  });
  assert.equal(document.getElementById('panel-stage-note-privacy').value, '');
  assert.equal(h.badge.textContent, '5/8');

  // Prerequisite guard: release requires review
  const releaseConfirmBtn = document.getElementById('panel-stage-confirm-release');
  assert.equal(releaseConfirmBtn.dataset.workflowBlocked, 'true');
  assert.equal(releaseConfirmBtn.disabled, true);
});

test('F02 draft conflict guards, cross-project isolation, write lock canClose(), badge reset, and focusFact', async () => {
  let resolveWrite = null;
  const h = await mountWorkflowPanelHarness({}, {
    onInvoke: async (cmd, args) => {
      if (cmd === 'project_facts_save' && resolveWrite === 'gate') {
        await new Promise(r => { resolveWrite = r; });
      }
      if (cmd === 'project_workflow' && args.projectId === 'proj-err') {
        throw new Error('storage read failed');
      }
      return undefined;
    },
  });
  const { document } = h;

  const businessInput = document.getElementById('panel-workflow-businessType');
  const generateBtn = document.getElementById('panel-workflow-generate-guide');
  const exportBtn = document.getElementById('panel-workflow-export');

  // Unsaved draft disables guide generation and is excluded from workflow export
  await act(async () => {
    setNativeValue(businessInput, '项目A未保存草稿');
    businessInput.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    await flushAsync();
  });
  assert.equal(generateBtn.disabled, true);

  await act(async () => {
    exportBtn.click();
    await flushAsync();
  });
  assert.equal(h.downloads.length, 1);
  assert.match(h.downloads[0].text, /实际业务：带货直播预约/);
  assert.doesNotMatch(h.downloads[0].text, /项目A未保存草稿/);
  assert.doesNotMatch(h.downloads[0].text, FORBIDDEN_GOVERNANCE_RE);

  // Cross-project isolation & badge reset on error/switch
  const projA = h.getProject();
  const projB = {
    ...projA,
    id: 'proj-b',
    name: '项目B',
    facts: { businessType: '餐饮点单', hasPayment: true, collectsSensitive: true, hasServerDomain: true },
  };
  h.setProjectExternal(projB);
  await act(async () => {
    h.panel.syncProject(projB, null);
    await flushAsync();
  });
  assert.equal(document.getElementById('panel-workflow-businessType').value, '餐饮点单', 'proj-b must not see proj-a draft');

  // Error on proj-err clears stale #desktop-workflow-progress badge
  const projErr = { ...projA, id: 'proj-err', name: '故障项目' };
  h.setProjectExternal(projErr);
  await act(async () => {
    h.panel.syncProject(projErr, null);
    await flushAsync();
  });
  assert.equal(h.badge.textContent, '', 'workflow error must clear stale progress badge');

  // Switch back to proj-a -> draft preserved!
  h.setProjectExternal(projA);
  await act(async () => {
    h.panel.syncProject(projA, null);
    await flushAsync();
  });
  assert.equal(document.getElementById('panel-workflow-businessType').value, '项目A未保存草稿');

  // External persisted facts change triggers conflict guard; discard restores persisted facts
  h.setProjectExternal({
    ...projA,
    revision: 5,
    contextRevision: 3,
    facts: { businessType: '外部工作页已保存的新业务', hasPayment: true, collectsSensitive: false, hasServerDomain: true },
  });
  await act(async () => {
    h.panel.syncProject(h.getProject(), null);
    await flushAsync();
  });
  assert.equal(document.getElementById('panel-workflow-facts-conflict').hidden, false);
  await act(async () => {
    document.getElementById('panel-workflow-facts-discard').click();
    await flushAsync();
  });
  assert.equal(document.getElementById('panel-workflow-businessType').value, '外部工作页已保存的新业务');

  // In-flight write locks canClose() and rejects focusFact until write settles
  resolveWrite = 'gate';
  let submitPromise;
  act(() => {
    document.getElementById('panel-workflow-facts-form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
    flushRaf();
  });
  assert.equal(h.panel.canClose(), false, 'in-flight write must lock canClose()');
  assert.equal(h.panel.focusFact(h.getProject().id, 'hasServerDomain'), false, 'focusFact must fail closed while write is in flight');
  await act(async () => {
    submitPromise = resolveWrite;
    submitPromise();
    resolveWrite = null;
    await flushAsync();
  });
  assert.equal(h.panel.canClose(), true);

  // focusFact succeeds when idle & on matching project
  act(() => {
    h.panel.selectTab('devtools');
    flushRaf();
  });
  assert.equal(h.panel.focusFact('wrong-project', 'hasServerDomain'), false);
  let focusedOk = false;
  act(() => {
    focusedOk = h.panel.focusFact(h.getProject().id, 'hasServerDomain');
    flushRaf();
  });
  assert.equal(focusedOk, true);
  assert.equal(document.activeElement?.id, 'panel-workflow-hasServerDomain');
});

test('a delayed facts save does not erase a newer draft after returning to the project', async () => {
  let finishWrite;
  const write = new Promise(resolve => { finishWrite = resolve; });
  const h = await mountWorkflowPanelHarness({}, {
    async onInvoke(command) {
      if (command === 'project_facts_save') await write;
    },
  });
  const originalProject = h.getProject();
  const input = () => h.document.getElementById('panel-workflow-businessType');
  const editFacts = async value => {
    await act(async () => {
      setNativeValue(input(), value);
      input().dispatchEvent(new h.window.Event('input', { bubbles: true }));
      await flushAsync();
    });
  };
  const switchProject = async project => {
    h.setProjectExternal(project);
    await act(async () => {
      h.panel.syncProject(project, null);
      await flushAsync();
    });
  };
  try {
    await editFacts('先提交的业务事实');
    await act(async () => {
      h.document.getElementById('panel-workflow-facts-form')
        .dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
      await flushAsync();
    });
    assert.equal(h.panel.canClose(), false);
    await switchProject({ ...originalProject, id: 'proj-b', name: '其他项目' });
    await switchProject(originalProject);
    await editFacts('请求未返回时填写的新草稿');
  } finally {
    await act(async () => { finishWrite(); await flushAsync(); });
  }
  assert.equal(h.getProject().facts.businessType, '先提交的业务事实');
  assert.equal(input().value, '请求未返回时填写的新草稿');
  assert.equal(h.document.getElementById('panel-workflow-facts-conflict').hidden, false);
  assert.equal(h.panel.canClose(), true);
});

test('draft snapshots change only for the project and fields actually edited', () => {
  const { createWorkflowDraftStore } = loadDesktopModule('src/shell/workflow-drafts.ts');
  const store = createWorkflowDraftStore();
  let notifications = 0;
  const unsubscribe = store.subscribe('proj-a', () => { notifications++; });
  const empty = store.getSnapshot('proj-a');
  store.dispatch('proj-b', { type: 'facts-open', open: true });
  assert.equal(store.getSnapshot('proj-a'), empty);
  assert.equal(notifications, 0);

  const edit = { type: 'edit-facts', facts: { hasPayment: false }, basis: 'saved-facts' };
  store.dispatch('proj-a', edit);
  const edited = store.getSnapshot('proj-a');
  assert.notEqual(edited, empty);
  assert.deepEqual(empty.facts, {});
  store.dispatch('proj-a', edit);
  assert.equal(store.getSnapshot('proj-a'), edited);
  assert.equal(notifications, 1);

  store.dispatch('proj-a', { type: 'require-note', stageId: 'privacy' });
  assert.equal(store.getSnapshot('proj-a').facts, edited.facts);
  assert.equal(edited.notes.has('privacy'), false);
  unsubscribe();
  store.dispatch('proj-a', { type: 'discard-note', stageId: 'privacy' });
  assert.equal(notifications, 2);
});

test('the submitted subject remains visible while the saved workflow snapshot reloads', async () => {
  let holdRefresh = false;
  let heldReads = 0;
  let finishRefresh;
  let finishReplacement;
  const refresh = new Promise(resolve => { finishRefresh = resolve; });
  const replacement = new Promise(resolve => { finishReplacement = resolve; });
  const h = await mountWorkflowPanelHarness({}, {
    async onInvoke(command) {
      if (command === 'project_workflow' && holdRefresh) {
        heldReads++;
        await (heldReads === 1 ? refresh : replacement);
      }
    },
  });
  const subject = h.document.getElementById('panel-workflow-subject');
  try {
    await act(async () => {
      subject.value = 'enterprise';
      subject.dispatchEvent(new h.window.Event('change', { bubbles: true }));
      await flushAsync();
    });
    holdRefresh = true;
    await act(async () => {
      h.document.getElementById('panel-workflow-subject-save').click();
      await flushAsync();
    });
    assert.equal(h.getProject().subject, 'enterprise');
    assert.equal(subject.value, 'enterprise');
    assert.equal(subject.disabled, true);
    await act(async () => {
      h.panel.syncProject(h.getProject(), null);
      await flushAsync();
    });
    assert.equal(heldReads, 2);
    await act(async () => { finishRefresh(); await flushAsync(); });
    assert.equal(subject.value, 'enterprise');
  } finally {
    await act(async () => { finishRefresh(); finishReplacement(); await flushAsync(); });
  }
  assert.equal(subject.value, 'enterprise');
  assert.equal(subject.disabled, false);
  assert.equal(h.document.getElementById('panel-workflow-subject-save').disabled, true);
});

test('a saved draft is cleared when the first fresh project snapshot is rendered', async () => {
  let finishRefresh;
  const refresh = new Promise(resolve => { finishRefresh = resolve; });
  const h = await mountWorkflowPanelHarness({}, { onProjectMutated: () => refresh });
  const { document } = h;
  try {
    await act(async () => {
      const input = document.getElementById('panel-workflow-businessType');
      setNativeValue(input, '本次保存的业务事实');
      input.dispatchEvent(new h.window.Event('input', { bubbles: true }));
      await flushAsync();
    });
    await act(async () => {
      document.getElementById('panel-workflow-facts-form')
        .dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
      await flushAsync();
    });
    assert.equal(h.getProject().facts.businessType, '本次保存的业务事实');
    assert.equal(h.panel.canClose(), false);
    await act(async () => {
      h.panel.syncProject(h.getProject(), null);
      await flushAsync();
    });
    assert.equal(document.getElementById('panel-workflow-businessType').value, '本次保存的业务事实');
    assert.equal(document.getElementById('panel-workflow-facts-conflict').hidden, true);
    assert.doesNotMatch(document.getElementById('panel-workflow-facts-summary').textContent, /未保存|草稿待核对/u);
  } finally {
    await act(async () => { finishRefresh(); await flushAsync(); });
  }
  assert.equal(h.panel.canClose(), true);
});
