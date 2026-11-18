import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { deriveWorkflow } from '../../../src/workflow.mjs';
import { createHandoff } from '../shared/repair-handoff.js';
import type { Artifact, Project } from '../projects';
import type { WorkflowResult } from '../shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { TooltipProvider } from '../components/ui/tooltip';
import { LucideSvg } from './lucide-svg';
import { ChangesTabBody, DevtoolsTabBody } from './right-panel-changes-devtools';
import { EvidenceTabBody, ReleaseTabBody } from './right-panel-release-evidence';
import type {
  EvidencePanelState,
  EvidenceRuleItem,
  RightPanelCallbacks,
  RightPanelSnapshot,
  RightPanelTabId,
  StageSummaryItem,
} from './right-panel-types';

type InvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export type RightPanelHostOptions = Partial<Omit<RightPanelCallbacks, 'onTabChange'>> & {
  invoke?: InvokeFn;
};

const STAGE_LABELS: Record<string, string> = {
  confirmed: '人工已确认',
  not_applicable: '人工不适用',
  pending: '待确认',
  unknown: '事实待补充',
  stale: '待重检',
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

type RawHandoffItem = {
  rule?: {
    ruleId?: string;
    title?: string;
    severity?: 'blocker' | 'warning' | 'info';
    confidence?: 'high' | 'medium' | 'low';
    source_quote?: string | null;
    official_url?: string | null;
    last_verified?: string | null;
    requires?: string[];
    stage?: string | null;
  };
};

export function deriveEvidenceState(artifact: Artifact | null): EvidencePanelState {
  if (!artifact) return { status: 'empty', hasArtifact: false };
  try {
    const pack = createHandoff(artifact);
    const items: EvidenceRuleItem[] = (pack.items as RawHandoffItem[])
      .filter(entry => entry?.rule?.ruleId && entry?.rule?.title)
      .map(entry => {
        const rule = entry.rule!;
        return {
          ruleId: rule.ruleId!,
          title: rule.title!,
          severity: rule.severity ?? 'info',
          confidence: rule.confidence,
          sourceQuote: rule.source_quote ?? null,
          officialUrl: rule.official_url ?? null,
          lastVerified: rule.last_verified ?? null,
          requires: Array.isArray(rule.requires) ? [...rule.requires] : [],
          location: rule.stage ? `阶段 · ${rule.stage}` : null,
        };
      });
    if (!items.length) return { status: 'empty', hasArtifact: true };
    return { status: 'ready', items, reportTitle: artifact.title };
  } catch {
    return { status: 'empty', hasArtifact: true };
  }
}

function RightPanelView({
  snapshot,
  callbacks,
}: {
  snapshot: RightPanelSnapshot;
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
            <ReleaseTabBody project={snapshot.project} artifact={snapshot.artifact} state={snapshot.releaseState} callbacks={callbacks} />
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
  let disposed = false;
  let syncEpoch = 0;

  const snapshot: RightPanelSnapshot = {
    activeTab: 'release',
    isDrawer: false,
    project: null,
    rulesVersion: null,
    artifact: null,
    releaseState: { status: 'empty' },
    evidenceState: { status: 'empty', hasArtifact: false },
    changesState: { status: 'empty' },
    devtoolsState: { status: 'empty' },
  };

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
    onCloseDrawer: () => options.onCloseDrawer?.(),
  };

  function render() {
    if (disposed) return;
    flushSync(() => {
      root.render(createElement(RightPanelView, { snapshot: { ...snapshot }, callbacks }));
    });
  }

  function hasNativeBridge() {
    if (!options.invoke) return false;
    const win = container.ownerDocument.defaultView as (Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }) | null;
    return typeof win?.__TAURI_INTERNALS__?.invoke === 'function';
  }

  async function loadProjectData(project: Project, lastCheckSummary?: string | null) {
    const token = ++syncEpoch;
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

    snapshot.releaseState = { status: 'loading' };
    snapshot.changesState = { status: 'loading' };
    render();

    await Promise.all([
      (async () => {
        try {
          const wfBasis = await options.invoke!<unknown>('project_workflow', { projectId: project.id });
          if (disposed || token !== syncEpoch) return;
          const model = deriveWorkflow(wfBasis as never) as WorkflowResult;
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
          };
          const badge = container.ownerDocument.getElementById('desktop-workflow-progress');
          if (badge) badge.textContent = `${completedCount}/${model.stages.length}`;
        } catch (err) {
          if (disposed || token !== syncEpoch) return;
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

  render();

  return {
    update(partial: Partial<RightPanelSnapshot>) {
      if (disposed) return;
      Object.assign(snapshot, partial);
      render();
    },
    selectTab(tab: RightPanelTabId) {
      if (disposed) return;
      snapshot.activeTab = tab;
      render();
    },
    setArtifact(artifact: Artifact | null) {
      if (disposed) return;
      snapshot.artifact = artifact;
      snapshot.evidenceState = deriveEvidenceState(artifact);
      render();
    },
    syncProject(project: Project | null, lastCheckSummary?: string | null) {
      if (disposed) return;
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
    destroy() {
      if (disposed) return;
      disposed = true;
      syncEpoch++;
      root.unmount();
    },
  };
}
