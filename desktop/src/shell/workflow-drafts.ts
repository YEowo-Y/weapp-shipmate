import type { ProjectFacts } from '../projects';

type StageNoteDraft = Readonly<{ text: string; basis?: string; invalid?: boolean }>;
type ProjectWorkflowDraft = Readonly<{
  subject?: string;
  facts: Readonly<Partial<ProjectFacts>>;
  factsBasis?: string;
  notes: ReadonlyMap<string, StageNoteDraft>;
  expanded: ReadonlySet<string>;
  factsOpen?: boolean;
}>;

export type WorkflowDraftAction =
  | { type: 'subject'; value?: string }
  | { type: 'edit-facts'; facts: Partial<ProjectFacts>; basis: string }
  | { type: 'discard-facts' }
  | { type: 'facts-open'; open: boolean }
  | { type: 'stage-open'; stageId: string; open: boolean }
  | { type: 'edit-note'; stageId: string; text: string; basis: string }
  | { type: 'require-note'; stageId: string }
  | { type: 'discard-note'; stageId: string };

const EMPTY_FACTS: Readonly<Partial<ProjectFacts>> = {};
const EMPTY_DRAFT: ProjectWorkflowDraft = { facts: EMPTY_FACTS, notes: new Map(), expanded: new Set() };

function setStageOpen(draft: ProjectWorkflowDraft, stageId: string, open: boolean): ProjectWorkflowDraft {
  if (draft.expanded.has(stageId) === open) return draft;
  const expanded = new Set(draft.expanded);
  if (open) expanded.add(stageId);
  else expanded.delete(stageId);
  return { ...draft, expanded };
}

function setStageNote(draft: ProjectWorkflowDraft, stageId: string, note?: StageNoteDraft): ProjectWorkflowDraft {
  const previous = draft.notes.get(stageId);
  if (previous?.text === note?.text && previous?.basis === note?.basis && previous?.invalid === note?.invalid) return draft;
  const notes = new Map(draft.notes);
  if (note) notes.set(stageId, note);
  else notes.delete(stageId);
  return { ...draft, notes };
}

function reduceDraft(draft: ProjectWorkflowDraft, action: WorkflowDraftAction): ProjectWorkflowDraft {
  switch (action.type) {
    case 'subject':
      return draft.subject === action.value ? draft : { ...draft, subject: action.value };
    case 'edit-facts':
      if (draft.factsBasis !== undefined && Object.entries(action.facts)
        .every(([key, value]) => draft.facts[key as keyof ProjectFacts] === value)) return draft;
      return { ...draft, facts: { ...draft.facts, ...action.facts }, factsBasis: draft.factsBasis ?? action.basis };
    case 'discard-facts':
      return draft.facts === EMPTY_FACTS ? draft : { ...draft, facts: EMPTY_FACTS, factsBasis: undefined };
    case 'facts-open':
      return draft.factsOpen === action.open ? draft : { ...draft, factsOpen: action.open };
    case 'stage-open':
      return setStageOpen(draft, action.stageId, action.open);
    case 'edit-note': {
      const previous = draft.notes.get(action.stageId);
      const stale = previous?.basis !== undefined && previous.basis !== action.basis;
      const basis = action.text || stale ? previous?.basis ?? action.basis : undefined;
      const invalid = Boolean(previous?.invalid && !action.text.trim());
      const note = action.text || basis || invalid ? { text: action.text, basis, invalid } : undefined;
      return setStageNote(draft, action.stageId, note);
    }
    case 'require-note': {
      const previous = draft.notes.get(action.stageId);
      return setStageNote(setStageOpen(draft, action.stageId, true), action.stageId,
        { ...previous, text: previous?.text ?? '', invalid: true });
    }
    case 'discard-note':
      return setStageNote(draft, action.stageId);
  }
}

export function createWorkflowDraftStore() {
  const drafts = new Map<string, ProjectWorkflowDraft>();
  const subscriptions = new Map<string, Set<() => void>>();
  const getSnapshot = (projectId: string) => drafts.get(projectId) ?? EMPTY_DRAFT;

  return {
    getSnapshot,
    dispatch(projectId: string, action: WorkflowDraftAction) {
      const current = getSnapshot(projectId);
      const next = reduceDraft(current, action);
      if (next === current) return;
      drafts.set(projectId, next);
      for (const listener of [...(subscriptions.get(projectId) ?? [])]) listener();
    },
    subscribe(projectId: string, listener: () => void) {
      const listeners = subscriptions.get(projectId) ?? new Set();
      listeners.add(listener);
      subscriptions.set(projectId, listeners);
      return () => {
        listeners.delete(listener);
        if (!listeners.size && subscriptions.get(projectId) === listeners) subscriptions.delete(projectId);
      };
    },
    clear() {
      drafts.clear();
      subscriptions.clear();
    },
  };
}

export type WorkflowDraftStore = ReturnType<typeof createWorkflowDraftStore>;
