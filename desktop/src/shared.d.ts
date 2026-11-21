export type { WorkflowConfirmation } from '../../src/workflow.mjs';

export type WorkflowResult = ReturnType<typeof import('../../src/workflow.mjs').deriveWorkflow>;
export type WorkflowStage = WorkflowResult['stages'][number];
export type WorkflowSource = WorkflowStage['sources'][number];
