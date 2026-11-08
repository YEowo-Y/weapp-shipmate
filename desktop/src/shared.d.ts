// Typed integration boundary for shared JavaScript components.
declare module '*repair-handoff.js' {
  export type RepairHandoff = { format: 'shipmate-repair-handoff'; version: 1; source: { artifactId: string; runId: string; projectId: string | null; projectRevision: number | null; contextRevision: number | null; kind: 'check' | 'guide' | 'explain'; title: string; createdAt: number; toolVersion: string; rulesVersion: string; provenance?: 'imported' }; scan: { complete: boolean; filesScanned: number } | null; items: unknown[] };
  export function formatRuleActions(item: { action_categories?: string[] }): string;
  export const MAX_HANDOFF_BYTES: number;
  export function createHandoff(artifact: unknown): RepairHandoff;
  export function parseHandoff(text: string): RepairHandoff;
  export function renderHandoffSections(pack: RepairHandoff): { basis: string; content: string };
  export function exportHandoff(pack: RepairHandoff, format: 'json' | 'markdown'): { text: string; filename: string; mimeType: string };
  export function handoffWarnings(pack: RepairHandoff, project: { id: string; revision: number; contextRevision?: number } | null, rulesVersion: string | null): string[];
}
declare module '*artifact-download.js' {
  export function createArtifactDownloader(options: { documentRef: Document }): { download(artifact: { text: string; filename: string; mimeType: string }): boolean; dispose(): void };
}
declare module '*agent-permissions.js' {
  type Grant = { projectId: string; sessionId: string; allowRead: true; shareResults: boolean };
  export function createAgentPermissions(): {
    select(session: { id: string; projectId?: string | null }): void;
    setProvider(providerId: string | null): void;
    update(value: { allowRead: boolean; shareResults?: boolean }): void;
    snapshot(): { sessionId: string | null; projectId: string | null; eligible: boolean; allowRead: boolean; shareResults: boolean };
    prepare<T extends { providerId: string; agent?: unknown }>(request: T): Omit<T, 'agent'> & { agent?: Grant };
    clear(): void;
  };
}
declare module '*chat-context.js' {
  type Item = { id: string; kind: 'file' | 'report' | 'memory'; title: string; text: string; bytes: number; createdAt?: number; contextRevision?: number | null };
  export function contextMetadata(item: { kind?: string; createdAt?: number; contextRevision?: number | null }): string;
  export function createChatContext(): {
    select(session: { id: string; projectId?: string | null }): void;
    list(): Item[]; add(item: Item): void; remove(id: string): void; clear(): void;
    prepare<T extends { model: string; messages: { role: string; content: string }[] }>(request: T, freshMemory?: Item[]): T;
  };
}
declare module '*workflow-artifact.js' {
  export function createWorkflowArtifact(snapshot: { project: unknown; catalog: unknown; rulesVersion: string; confirmations: unknown[] }, exportedAt?: number): { text: string; filename: string; mimeType: string };
}
declare module '*workflow.mjs' {
  type Source = { url: string; lastVerified: string | null; quote: string | null };
  type Confirmation = { stageId: string; state: string; note: string; recordedAt: number; contextRevision: number; rulesVersion: string };
  type Stage = { id: string; title: string; status: string; action: string; blockedBy: string[]; applicability: boolean | null; coverage: { ruleCount: number; conditionalRuleCount: number; note: string }; items: { ruleId: string; title: string; requires: string[]; conditional: boolean; signal: string[] }[]; sources: Source[]; confirmation: Confirmation | null };
  export function deriveWorkflow(input: { project: unknown; catalog: unknown; rulesVersion: string; confirmations: unknown[] }): { stages: Stage[]; categoryCandidates: { title: string; reason: string; requires: string[]; official_url: string | null; last_verified: string | null }[]; nextAction: { stageId: string; title: string; description: string } | null };
}
declare module '*explain-transport.js' {
  export type ExplainArgs = { query: string; signal?: AbortSignal };
  export function queryExplain(args: ExplainArgs, options: { fetcher: typeof fetch }): Promise<unknown>;
}
declare module '*explain.js' {
  export function mountExplain(doc: Document, options: { query: (args: import('*explain-transport.js').ExplainArgs) => Promise<unknown>; saveResult?: (text: string) => { ok: boolean; reason?: string; duplicate?: boolean } }): { dispose(): void; suspend(): void; reset(): void } | undefined;
}
declare module '*explain-contract.js' {
  export function validateExplainInput(input: unknown): { ok: boolean };
  export function validateExplainResult(result: unknown, query: string): { ok: boolean };
}
declare module '*components/ui-kit.js' {
  export interface ActionButton extends HTMLElement {
    disabled: boolean;
    type: 'button' | 'submit' | 'reset';
    appearance: 'accent' | 'filled' | 'outlined' | 'filled-outlined' | 'plain';
  }
  export function createActionButton(doc: Document, label: string, options?: {
    className?: string; appearance?: ActionButton['appearance'];
    variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
    type?: ActionButton['type'];
  }): ActionButton;
  export function bindActionMenu(menu: HTMLElement, handler: (value: string, item: HTMLElement) => void): () => void;
}
declare module '*components/icons.js' {
  export function createIcon(doc: Document, name: string, className?: string): SVGElement;
}
declare module '*components/composer.js' {
  export function mountComposer(host: HTMLElement, options: { inputId: string; sendId: string; label: string; placeholder: string; hint: string; contextNode?: HTMLElement }): { root: HTMLElement; input: HTMLTextAreaElement; sendButton: HTMLButtonElement };
}
declare module '*components/provider-icons.js' {
  export function createProviderIcon(doc: Document, providerId: string): HTMLElement;
}
declare module '*chat-transport.js' {
  export type ChatArgs = { providerId: string; model: string; messages: { role: string; content: string }[]; signal: AbortSignal; onDelta: (text: string) => void };
  export function streamChat(args: ChatArgs, options: { fetcher: typeof fetch }): Promise<void>;
}
declare module '*model-connection-client.js' {
  export function isUsableModelConnection<T extends { providerId: string; status: string; hasCredential?: boolean; catalogSource?: string }>(connection: T | null | undefined): connection is T;
  type Snapshot = { storage?: 'memory' | 'system'; connections: { providerId: string; status: string; catalogSource?: string; hasCredential?: boolean; authMethod?: string | null; credentialStorage?: 'memory' | 'system' | null; endpoint?: { baseUrl: string; allowLocalHttp: boolean } | null; error?: { code?: string; message: string } | null; inference?: { status: 'unverified' | 'checking' | 'verified' | 'error'; model: string | null; checkedAt: string | null; error: { code: string; message: string } | null }; models: { id: string; name: string }[] }[]; oauth?: { status: string; message?: string; mode?: 'manual' | 'callback'; authorizationUrl?: string; flowId?: string; expiresAt?: string | number } };
  export function createConnectionClient(fetcher: typeof fetch): { readonly ready: boolean; readonly snapshot: Snapshot | null; load(): Promise<Snapshot>; mutate(path: string, payload?: Record<string, unknown>): Promise<{ authorizationUrl: string }>; dispose(): void };
}
declare module '*session-workspace.js' {
  export function mountSessionWorkspace(options: {
    projectScoped?: boolean; layout?: 'sidebar'; projectNavigation?: HTMLElement; host: HTMLElement; input: HTMLTextAreaElement; sendButton: HTMLButtonElement;
    scroll: HTMLElement; list: HTMLElement; status: HTMLElement; jumpButton: HTMLElement;
    workspace: string; storageLabel: string; conversationOptions: { requireModel: boolean; allowRecords: boolean; getSendShortcut?: () => 'enter' | 'mod-enter'; transport: (args: import('*chat-transport.js').ChatArgs) => Promise<void>; onModelRequired: () => void; onOpenArtifact?: (artifactId: string, expected: { runId: string; kind: 'check' | 'guide' | 'explain'; projectRevision: number; contextRevision: number }) => void | Promise<void> };
    onOpenDataSettings?: (anchor: HTMLElement) => void;
    onSessionChange: (session: { id: string; title: string; projectId?: string | null; messages: unknown[] }) => void;
    onEvent: (event: { type: string; toolEvent?: { type: string } }) => void;
  }): Promise<{ createSession(): void; renameSession(trigger?: HTMLElement): void; isTemporary(): boolean; selectProject(projectId: string | null): Promise<boolean>; associateCurrentSession(projectId: string | null): Promise<boolean>; setKnownProjects(ids: string[]): void; getCurrentSession(): { id: string; title: string; projectId?: string | null; messages: unknown[] }; conversation: { refreshPreferences(): void; appendRecord: (record: { text: string; label: string }) => { ok: boolean; reason?: string }; getMessages(): { text: string; record?: { kind: string; label: string } }[]; getModelSelection(): { providerId: string; model: string; label: string } | null; setModelSelection(value: { providerId: string; model: string; label: string }): boolean }; openHistory: (trigger?: HTMLElement, filter?: 'active' | 'archived' | 'all') => void; openData: (trigger?: HTMLElement) => void; getDataSettingsPanel(): { element: HTMLElement; open(): void; close(): boolean; canClose(): boolean; destroy(): void }; flush: () => Promise<boolean>; destroy: () => void }>;
}


declare module '*components/floating-surface.js' {
  export function attachFloatingSurface(anchor: HTMLElement, surface: HTMLElement, options?: { placement?: string; onError?: () => void }): () => void;
}
declare module '*components/scroll-fade.js' {
  export type ScrollFadeOrientation = 'x' | 'y' | 'both';
  export const SCROLL_FADE_SELECTORS: ReadonlyArray<readonly [string, ScrollFadeOrientation]>;
  export function getScrollFadeEdges(metrics: { scrollTop: number; scrollLeft?: number; clientHeight: number; clientWidth: number; scrollHeight: number; scrollWidth: number }, orientation?: ScrollFadeOrientation): { top: boolean; bottom: boolean; left: boolean; right: boolean };
  export function updateScrollFade(element: HTMLElement): void;
  export function mountScrollFades(root: HTMLElement, selectors?: ReadonlyArray<readonly [string, ScrollFadeOrientation]>): () => void;
}
declare module '*components/message-markdown.js' {
  export function renderMessageText(host: HTMLElement, value: string, options?: { copyCode?: boolean }): void;
}
