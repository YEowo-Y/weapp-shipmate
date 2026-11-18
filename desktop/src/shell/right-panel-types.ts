import type { Artifact, Project, ProjectFacts } from '../projects';
import type { WorkflowResult } from '../shared';

export type RightPanelTabId = 'release' | 'evidence' | 'changes' | 'devtools';

export const SUBJECT_LABELS: Record<string, string> = {
  personal: '个人',
  individual_business: '个体工商户',
  enterprise: '企业',
};

export const STAGE_LABELS: Record<string, string> = {
  confirmed: '人工已确认',
  not_applicable: '人工不适用',
  pending: '待确认',
  unknown: '事实待补充',
  stale: '待重检',
};

export function isSafeHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export type StageSummaryItem = {
  id: string;
  title: string;
  status: 'confirmed' | 'not_applicable' | 'pending' | 'unknown' | 'stale';
  summary: string;
};

export type WorkflowBasisSnapshot = {
  project: Project;
  catalog: unknown;
  rulesVersion: string;
  confirmations: unknown[];
};

export type ReleasePanelState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry?: () => void }
  | { status: 'empty' }
  | {
      status: 'ready';
      completedCount: number;
      totalCount: number;
      nextAction: { stageId: string; title: string; description: string } | null;
      stages: StageSummaryItem[];
      lastCheckSummary?: string | null;
      workflowBasis?: WorkflowBasisSnapshot | null;
      workflowModel?: WorkflowResult | null;
    };

export type EvidenceRuleItem = {
  ruleId: string;
  title: string;
  severity: 'blocker' | 'warning' | 'info';
  confidence?: 'high' | 'medium' | 'low';
  sourceQuote?: string | null;
  officialUrl?: string | null;
  lastVerified?: string | null;
  requires: string[];
  location?: string | null;
};

export type EvidencePanelState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry?: () => void }
  | { status: 'empty'; hasArtifact?: boolean }
  | { status: 'ready'; items: EvidenceRuleItem[]; reportTitle?: string };

export type ChangeOperationItem = {
  operationId: string;
  file: string;
  summary: string;
  createdAt: number;
};

export type ChangesPanelState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry?: () => void }
  | { status: 'empty' }
  | { status: 'ready'; operations: ChangeOperationItem[] };

export type DevtoolsPanelState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry?: () => void }
  | { status: 'empty'; note?: string };

export type RightPanelSnapshot = {
  activeTab: RightPanelTabId;
  isDrawer: boolean;
  isBusy?: boolean;
  project: Project | null;
  rulesVersion: string | null;
  artifact: Artifact | null;
  releaseState: ReleasePanelState;
  evidenceState: EvidencePanelState;
  changesState: ChangesPanelState;
  devtoolsState: DevtoolsPanelState;
};

export type StageConfirmPayload = {
  projectId: string;
  expectedRevision: number;
  expectedRulesVersion: string;
  stageId: string;
  state: 'confirmed' | 'not_applicable' | 'pending';
  note: string;
};

export type RightPanelCallbacks = {
  onTabChange(tab: RightPanelTabId): void;
  onManageProject(): void;
  onOpenWorkflow(): void;
  onRunCheck(): void;
  onOpenReport(): void;
  onOpenRepair(): void;
  onOpenRepairHistory(): void;
  onOpenSource(url: string): void;
  onOpenTools(): void;
  onOpenMaterials?(): void;
  onCloseDrawer(): void;
  onSaveSubject?(projectId: string, subject: string): Promise<boolean>;
  onSaveFacts?(projectId: string, expectedRevision: number, facts: ProjectFacts): Promise<void>;
  onConfirmStage?(payload: StageConfirmPayload): Promise<void>;
  onGenerateGuide?(projectId: string): Promise<void>;
  onExportWorkflow?(basis: WorkflowBasisSnapshot): boolean;
};
