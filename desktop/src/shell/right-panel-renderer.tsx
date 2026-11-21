import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { deriveWorkflow } from '../../../src/workflow.mjs';
import { createArtifactDownloader } from '../shared/artifact-download.js';
import { validatePreflightItem } from '../shared/guide-contract.js';
import { createHandoff } from '../shared/repair-handoff.js';
import { createWorkflowArtifact } from '../shared/workflow-artifact.js';
import type { Artifact, Project } from '../projects';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { TooltipProvider } from '../components/ui/tooltip';
import { LucideSvg } from './lucide-svg';
import { ChangesTabBody, DevtoolsTabBody } from './right-panel-changes-devtools';
import { EvidenceTabBody, ReleaseTabBody } from './right-panel-release-evidence';
import type { ProjectWorkflowDraft } from './right-panel-workflow';
import {
  DEVTOOLS_CONNECTION_STATUSES,
  STAGE_LABELS,
  type DevtoolsPanelState,
  type EvidencePanelState,
  type EvidenceRuleItem,
  type PreflightEvidence,
  type RightPanelCallbacks,
  type RightPanelSnapshot,
  type RightPanelTabId,
  type StageSummaryItem,
  type WorkflowBasisSnapshot,
} from './right-panel-types';

type InvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export type RightPanelHostOptions = Partial<
  Omit<RightPanelCallbacks, 'onTabChange' | 'onCheckDevtools' | 'onSaveFacts' | 'onConfirmStage' | 'onExportWorkflow'>
> & {
  invoke?: InvokeFn;
  onProjectMutated?(): Promise<void> | void;
  onDownloadArtifact?(artifact: { text: string; filename: string; mimeType: string }): boolean;
};

type RepairHistoryRecord = {
  operationId: string;
  createdAt: number;
  writeState: 'applied' | 'not_applied' | 'recovery_required' | 'undone';
  recheckState: 'required' | 'not_required' | 'completed';
};

const WRITE_STATE_LABELS: Record<RepairHistoryRecord['writeState'], string> = {
  applied: '已写入 app.json',
  not_applied: '未写入文件',
  recovery_required: '需恢复文件',
  undone: '已恢复原文件',
};

type EvidenceRule = {
  ruleId: string;
  title: string;
  severity: EvidenceRuleItem['severity'];
  confidence?: EvidenceRuleItem['confidence'];
  source_quote?: string | null;
  official_url?: string | null;
  last_verified?: string | null;
  requires: string[];
  stage: string;
};

function preflightRules(artifact: Artifact): EvidenceRule[] {
  const data = artifact.data;
  const result = data?.result as { command?: unknown; items?: unknown } | undefined;
  if (data?.schemaVersion !== 1 || data.kind !== 'check' || result?.command !== 'check' || !Array.isArray(result.items)) return [];
  // A valid scan can have a domain-list instruction longer than the handoff
  // format permits. Check rule and source fields independently of that limit.
  return result.items.filter((rule): rule is EvidenceRule => rule && Array.isArray(rule.requires)
    && rule.requires.every((entry: unknown) => typeof entry === 'string')
    && validatePreflightItem({ ...rule, requires: [] }));
}

export function deriveEvidenceState(artifact: Artifact | null, preflightEvidence?: PreflightEvidence): EvidencePanelState {
  if (!artifact) return { status: 'empty', hasArtifact: false };
  try {
    const isPreflight = artifact.kind === 'check';
    const imported = artifact.provenance === 'imported';
    const rules = isPreflight
      ? preflightRules(artifact)
      : (createHandoff(artifact).items as { rule: EvidenceRule }[]).map(entry => entry.rule);
    const captured = isPreflight && !imported && artifact.projectId && Array.isArray(preflightEvidence?.items)
      ? preflightEvidence
      : undefined;
    const locationsByRule = new Map(captured?.items.map(item => [item.ruleId, item]));
    const items: EvidenceRuleItem[] = rules.map(rule => {
      const finding = locationsByRule.get(rule.ruleId);
      return {
        ruleId: rule.ruleId,
        title: rule.title,
        severity: rule.severity,
        confidence: rule.confidence,
        sourceQuote: rule.source_quote ?? null,
        officialUrl: rule.official_url ?? null,
        lastVerified: rule.last_verified ?? null,
        requires: [...rule.requires],
        stage: rule.stage,
        codeLocations: finding && {
          status: finding.status,
          locations: finding.locations.map(({ file, line }) => ({ file, line })),
        },
      };
    });
    if (!items.length) return { status: 'empty', hasArtifact: true };
    return {
      status: 'ready',
      items,
      reportTitle: artifact.title,
      preflightContext: isPreflight ? (imported ? 'imported' : captured ? 'current' : 'history') : undefined,
      locationsTruncated: captured?.truncated,
      sourceImported: imported,
    };
  } catch {
    return { status: 'empty', hasArtifact: true };
  }
}

function RightPanelView({
  snapshot,
  draftsStore,
  callbacks,
}: {
  snapshot: RightPanelSnapshot;
  draftsStore: Map<string, ProjectWorkflowDraft>;
  callbacks: RightPanelCallbacks;
}) {
  const changeCount = snapshot.changesState.status === 'ready' ? snapshot.changesState.operations.length : 0;
  const evidenceCount = snapshot.evidenceState.status === 'ready' ? snapshot.evidenceState.items.length : 0;

  return (
    <TooltipProvider>
      <Tabs
        value={snapshot.activeTab}
        onValueChange={value => callbacks.onTabChange(value as RightPanelTabId)}
        className="shell-panel-tabs"
      >
        <div className="shell-panel-bar">
          <TabsList aria-label="右侧面板视图">
            <TabsTrigger value="release">
              <LucideSvg name="list-checks" />
              <span className="ui-tabs__label">上线</span>
            </TabsTrigger>
            <TabsTrigger value="evidence">
              <LucideSvg name="book-open" />
              <span className="ui-tabs__label">依据</span>
              {evidenceCount > 0 ? <small className="ui-tabs__badge tabular">{evidenceCount}</small> : null}
            </TabsTrigger>
            <TabsTrigger value="changes">
              <LucideSvg name="file-diff" />
              <span className="ui-tabs__label">改动</span>
              {changeCount > 0 ? <small className="ui-tabs__badge tabular">{changeCount}</small> : null}
            </TabsTrigger>
            <TabsTrigger value="devtools">
              <LucideSvg name="smartphone" />
              <span className="ui-tabs__label">开发者工具</span>
            </TabsTrigger>
          </TabsList>
          {snapshot.isDrawer ? (
            <button
              type="button"
              id="desktop-panel-close"
              className="shell-icon-btn shell-panel-close"
              aria-label="关闭侧边面板"
              onClick={callbacks.onCloseDrawer}
            >
              <LucideSvg name="x" />
            </button>
          ) : null}
        </div>

        <TabsContent value="release">
          <div className="shell-pane scroll" data-scroll-fade="y">
            <ReleaseTabBody
              project={snapshot.project}
              artifact={snapshot.artifact}
              isBusy={snapshot.isBusy}
              state={snapshot.releaseState}
              draftsStore={draftsStore}
              callbacks={callbacks}
            />
          </div>
        </TabsContent>
        <TabsContent value="evidence">
          <div className="shell-pane scroll" data-scroll-fade="y">
            <EvidenceTabBody artifactKey={snapshot.artifact?.id ?? null} state={snapshot.evidenceState} callbacks={callbacks} />
          </div>
        </TabsContent>
        <TabsContent value="changes">
          <div className="shell-pane scroll" data-scroll-fade="y">
            <ChangesTabBody project={snapshot.project} state={snapshot.changesState} callbacks={callbacks} />
          </div>
        </TabsContent>
        <TabsContent value="devtools">
          <div className="shell-pane scroll" data-scroll-fade="y">
            <DevtoolsTabBody state={snapshot.devtoolsState} callbacks={callbacks} />
          </div>
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}

export function createRightPanelController(container: HTMLElement, options: RightPanelHostOptions = {}) {
  const root = createRoot(container);
  const workflowDrafts = new Map<string, ProjectWorkflowDraft>();
  const downloader = options.onDownloadArtifact
    ? null
    : createArtifactDownloader({ documentRef: container.ownerDocument });
  let disposed = false;
  let syncEpoch = 0;
  let inFlightWrites = 0;
  let lastCheckMemo: string | null | undefined = null;

  async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    inFlightWrites++;
    try {
      return await fn();
    } finally {
      inFlightWrites = Math.max(0, inFlightWrites - 1);
    }
  }

  const snapshot: RightPanelSnapshot = {
    activeTab: 'release',
    isDrawer: false,
    isBusy: false,
    project: null,
    rulesVersion: null,
    artifact: null,
    releaseState: { status: 'empty' },
    evidenceState: { status: 'empty', hasArtifact: false },
    changesState: { status: 'empty' },
    devtoolsState: { status: 'empty' },
  };

  function hasNativeBridge() {
    if (!options.invoke) return false;
    const win = container.ownerDocument.defaultView as (Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }) | null;
    return typeof win?.__TAURI_INTERNALS__?.invoke === 'function';
  }

  async function checkDevtools(selectInstall: boolean) {
    const previous = snapshot.devtoolsState;
    if (disposed || !options.invoke || !hasNativeBridge() || previous.status === 'loading') return;

    const pending: DevtoolsPanelState = { status: 'loading', previous };
    snapshot.devtoolsState = pending;
    render();

    let next: DevtoolsPanelState = { status: 'error' };
    try {
      const result = await options.invoke<{ status?: unknown; version?: unknown }>('devtools_status', { selectInstall });
      const connection = DEVTOOLS_CONNECTION_STATUSES.find(status => status === result?.status);
      if (connection) {
        const version = typeof result.version === 'string' && result.version.length <= 32 && /^[0-9]+(?:\.[0-9]+){1,3}$/.test(result.version)
          ? result.version
          : null;
        next = { status: 'result', connection, version };
      } else if (selectInstall && result?.status === 'selection_canceled') {
        next = previous;
      }
    } catch {
      // The panel displays fixed guidance for probe failures.
    }
    if (disposed || snapshot.devtoolsState !== pending) return;

    const picker = selectInstall ? container.querySelector('[data-devtools-action="choose-install"]') : null;
    const pickerHadFocus = picker && container.ownerDocument.activeElement === picker;
    snapshot.devtoolsState = next;
    render();
    if (pickerHadFocus && !picker.isConnected) {
      container.querySelector<HTMLButtonElement>('[data-devtools-action="check"]')?.focus({ preventScroll: true });
    }
  }

  const callbacks: RightPanelCallbacks = {
    onTabChange(tab) {
      snapshot.activeTab = tab;
      render();
    },
    onManageProject: () => options.onManageProject?.(),
    onOpenWorkflow: () => options.onOpenWorkflow?.(),
    onRunCheck: () => options.onRunCheck?.(),
    onOpenReport: () => options.onOpenReport?.(),
    onOpenRepair: () => options.onOpenRepair?.(),
    onOpenRepairHistory: () => options.onOpenRepairHistory?.(),
    onOpenSource: url => options.onOpenSource?.(url),
    onOpenTools: () => options.onOpenTools?.(),
    onCheckDevtools: hasNativeBridge() ? selectInstall => { void checkDevtools(selectInstall); } : undefined,
    onOpenMaterials: () => options.onOpenMaterials?.(),
    onCloseDrawer: () => options.onCloseDrawer?.(),
    onSaveSubject: options.onSaveSubject
      ? (projectId, value) =>
          withWriteLock(async () => {
            const ok = await options.onSaveSubject!(projectId, value);
            if (ok) {
              const draft = workflowDrafts.get(projectId);
              if (draft) delete draft.subject;
              if (!disposed && snapshot.project?.id === projectId) {
                await loadProjectData(snapshot.project, lastCheckMemo);
              }
            }
            return ok;
          })
      : undefined,
    onSaveFacts: options.invoke
      ? (projectId, expectedRevision, facts) =>
          withWriteLock(async () => {
            if (!hasNativeBridge()) throw new Error('此操作需要在桌面应用中运行。');
            await options.invoke!('project_facts_save', { projectId, expectedRevision, facts });
            const draft = workflowDrafts.get(projectId);
            if (draft) {
              draft.facts = {};
              delete draft.factsBasis;
            }
            await options.onProjectMutated?.();
            if (!disposed && snapshot.project?.id === projectId) {
              await loadProjectData(snapshot.project, lastCheckMemo);
            }
          })
      : undefined,
    onConfirmStage: options.invoke
      ? payload =>
          withWriteLock(async () => {
            if (!hasNativeBridge()) throw new Error('此操作需要在桌面应用中运行。');
            await options.invoke!('project_stage_confirm', payload);
            const draft = workflowDrafts.get(payload.projectId);
            if (draft) {
              draft.notes.delete(payload.stageId);
              draft.noteBases.delete(payload.stageId);
              draft.invalidNotes.delete(payload.stageId);
            }
            await options.onProjectMutated?.();
            if (!disposed && snapshot.project?.id === payload.projectId) {
              await loadProjectData(snapshot.project, lastCheckMemo);
            }
          })
      : undefined,
    onGenerateGuide: options.onGenerateGuide
      ? projectId =>
          withWriteLock(async () => {
            await options.onGenerateGuide!(projectId);
            if (!disposed && snapshot.project?.id === projectId) {
              await loadProjectData(snapshot.project, lastCheckMemo);
            }
          })
      : undefined,
    onExportWorkflow: basis => {
      const exported = createWorkflowArtifact(basis);
      if (options.onDownloadArtifact) return options.onDownloadArtifact(exported);
      return Boolean(downloader?.download(exported));
    },
  };

  function render() {
    if (disposed) return;
    flushSync(() => {
      root.render(createElement(RightPanelView, { snapshot: { ...snapshot }, draftsStore: workflowDrafts, callbacks }));
    });
  }

  async function loadProjectData(project: Project, lastCheckSummary?: string | null) {
    const token = ++syncEpoch;
    lastCheckMemo = lastCheckSummary;
    if (!hasNativeBridge()) {
      snapshot.releaseState = {
        status: 'ready',
        completedCount: 0,
        totalCount: 8,
        nextAction: { stageId: 'register', title: '整理上线阶段', description: '在桌面应用中读取项目事实与准备进度' },
        stages: [],
        lastCheckSummary: lastCheckSummary ?? null,
      };
      snapshot.changesState = { status: 'empty' };
      render();
      return;
    }

    const badge = container.ownerDocument.getElementById('desktop-workflow-progress');
    const isSameProjectReady =
      snapshot.releaseState.status === 'ready' &&
      snapshot.releaseState.workflowBasis?.project.id === project.id;
    if (!isSameProjectReady) {
      if (badge) badge.textContent = '';
      snapshot.releaseState = { status: 'loading' };
      snapshot.changesState = { status: 'loading' };
      render();
    }

    await Promise.all([
      (async () => {
        try {
          const wfBasis = await options.invoke!<WorkflowBasisSnapshot>('project_workflow', { projectId: project.id });
          if (disposed || token !== syncEpoch) return;
          if (wfBasis?.project?.id !== project.id) {
            throw new Error('返回的项目与当前选择不符，请重新加载。');
          }
          const model = deriveWorkflow(wfBasis);
          snapshot.project = wfBasis.project;
          snapshot.rulesVersion = wfBasis.rulesVersion;
          const completedCount = model.stages.filter(s => s.status === 'confirmed' || s.status === 'not_applicable').length;
          const stages: StageSummaryItem[] = model.stages.map(s => ({
            id: s.id,
            title: s.title,
            status: (s.status as StageSummaryItem['status']) ?? 'pending',
            summary: STAGE_LABELS[s.status] ?? s.status,
          }));
          snapshot.releaseState = {
            status: 'ready',
            completedCount,
            totalCount: model.stages.length,
            nextAction: model.nextAction ? { ...model.nextAction } : null,
            stages,
            lastCheckSummary: lastCheckSummary ?? null,
            workflowBasis: wfBasis,
            workflowModel: model,
          };
          if (badge) badge.textContent = `${completedCount}/${model.stages.length}`;
        } catch (err) {
          if (disposed || token !== syncEpoch) return;
          if (badge) badge.textContent = '';
          snapshot.releaseState = {
            status: 'error',
            message: String(err instanceof Error ? err.message : err),
            onRetry: () => { if (snapshot.project) void loadProjectData(snapshot.project, lastCheckSummary); },
          };
        }
      })(),
      (async () => {
        try {
          const repairSnap = await options.invoke!<{ operations?: RepairHistoryRecord[] }>('project_repair_snapshot', { projectId: project.id });
          if (disposed || token !== syncEpoch) return;
          const ops = Array.isArray(repairSnap?.operations) ? repairSnap.operations : [];
          snapshot.changesState = ops.length
            ? {
                status: 'ready',
                operations: ops.slice(0, 8).map(op => ({
                  operationId: op.operationId,
                  file: 'app.json',
                  createdAt: op.createdAt,
                  summary: `${WRITE_STATE_LABELS[op.writeState] ?? op.writeState}${op.recheckState === 'required' ? ' · 待复检' : op.recheckState === 'completed' ? ' · 已关联复检' : ''}`,
                })),
              }
            : { status: 'empty' };
        } catch (err) {
          if (disposed || token !== syncEpoch) return;
          snapshot.changesState = {
            status: 'error',
            message: String(err instanceof Error ? err.message : err),
            onRetry: () => { if (snapshot.project) void loadProjectData(snapshot.project, lastCheckSummary); },
          };
        }
      })(),
    ]);
    if (disposed || token !== syncEpoch) return;
    render();
  }

  function applyArtifact(artifact: Artifact | null, preflightEvidence?: PreflightEvidence) {
    snapshot.artifact = artifact;
    snapshot.evidenceState = deriveEvidenceState(artifact, preflightEvidence);
  }

  render();

  return {
    update(partial: Partial<RightPanelSnapshot>) {
      if (disposed) return;
      if (partial.project !== undefined && partial.project?.id !== snapshot.project?.id) {
        applyArtifact(null);
      }
      if (partial.artifact !== undefined && !partial.evidenceState) applyArtifact(partial.artifact);
      Object.assign(snapshot, partial);
      render();
    },
    selectTab(tab: RightPanelTabId) {
      if (disposed) return;
      snapshot.activeTab = tab;
      render();
    },
    setArtifact(artifact: Artifact | null, preflightEvidence?: PreflightEvidence) {
      if (disposed || (artifact && artifact.projectId !== (snapshot.project?.id ?? null))) return;
      applyArtifact(artifact, preflightEvidence);
      render();
    },
    syncProject(project: Project | null, lastCheckSummary?: string | null) {
      if (disposed) return;
      if (snapshot.project?.id !== project?.id) applyArtifact(null);
      snapshot.project = project;
      const badge = container.ownerDocument.getElementById('desktop-workflow-progress');
      if (!project) {
        syncEpoch++;
        if (badge) badge.textContent = '';
        snapshot.releaseState = { status: 'empty' };
        snapshot.changesState = { status: 'empty' };
        render();
        return;
      }
      void loadProjectData(project, lastCheckSummary);
    },
    setDrawerMode(isDrawer: boolean) {
      if (disposed || snapshot.isDrawer === isDrawer) return;
      snapshot.isDrawer = isDrawer;
      render();
    },
    setBusy(value: boolean) {
      if (disposed || snapshot.isBusy === value) return;
      snapshot.isBusy = value;
      render();
    },
    canClose(): boolean {
      return inFlightWrites === 0;
    },
    focusFact(projectId: string, field: 'collectsSensitive' | 'hasServerDomain'): boolean {
      if (disposed || snapshot.isBusy || inFlightWrites > 0 || snapshot.project?.id !== projectId) return false;
      if (snapshot.releaseState.status !== 'ready' || snapshot.releaseState.workflowBasis?.project.id !== projectId) {
        return false;
      }
      let draft = workflowDrafts.get(projectId);
      if (!draft) {
        draft = {
          facts: {},
          notes: new Map(),
          noteBases: new Map(),
          invalidNotes: new Set(),
          expanded: new Set(),
        };
        workflowDrafts.set(projectId, draft);
      }
      draft.factsOpen = true;
      snapshot.activeTab = 'release';
      render();
      const factsDetails = container.querySelector<HTMLDetailsElement>('#panel-workflow-facts');
      if (factsDetails) factsDetails.open = true;
      const target = container.querySelector<HTMLElement>(`#panel-workflow-${field}`);
      if (!target || target.hasAttribute('disabled')) return false;
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'nearest' });
      return container.ownerDocument.activeElement === target;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      syncEpoch++;
      downloader?.dispose();
      workflowDrafts.clear();
      root.unmount();
    },
  };
}
