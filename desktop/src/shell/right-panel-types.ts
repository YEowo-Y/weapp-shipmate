import type { Artifact, Project } from '../projects';

export type RightPanelTabId = 'release' | 'evidence' | 'changes' | 'devtools';

export type StageSummaryItem = {
  id: string;
  title: string;
  status: 'confirmed' | 'not_applicable' | 'pending' | 'unknown' | 'stale';
  summary: string;
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
  project: Project | null;
  rulesVersion: string | null;
  artifact: Artifact | null;
  releaseState: ReleasePanelState;
  evidenceState: EvidencePanelState;
  changesState: ChangesPanelState;
  devtoolsState: DevtoolsPanelState;
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
  onCloseDrawer(): void;
};
