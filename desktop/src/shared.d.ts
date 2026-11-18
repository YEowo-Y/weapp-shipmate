// Typed boundary for root core ESM workflow module consumed by desktop/src.
export type WorkflowSource = { url: string; lastVerified: string | null; quote: string | null };
export type WorkflowConfirmation = {
  stageId: string;
  state: string;
  note: string;
  recordedAt: number;
  contextRevision: number;
  rulesVersion: string;
};
export type WorkflowStage = {
  id: string;
  title: string;
  status: string;
  action: string;
  blockedBy: string[];
  applicability: boolean | null;
  coverage: { ruleCount: number; conditionalRuleCount: number; note: string };
  items: { ruleId: string; title: string; requires: string[]; conditional: boolean; signal: string[] }[];
  sources: WorkflowSource[];
  confirmation: WorkflowConfirmation | null;
};
export type WorkflowResult = {
  stages: WorkflowStage[];
  categoryCandidates: {
    ruleId: string;
    title: string;
    reason: string;
    requires: string[];
    official_url: string | null;
    last_verified: string | null;
  }[];
  nextAction: { stageId: string; title: string; description: string } | null;
};
