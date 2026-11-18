# Design

## Source of truth
Active, 2026-11-18. Applies to the Tauri main window, project sidebar, conversation column and right context panel. User-provided Codex screenshots define the folder presentation. Implementation tokens live in `desktop/src/design-system.css`; component details live in `desktop/design-previews/DESIGN-SYSTEM.md`.

## Brand
Shipmate is a calm companion for preparing a mini-program release. Keep its own name and monochrome mark. Use restrained surfaces and typography rather than decorative color.

## Product goals
Make starting a project check, resuming a conversation and finding saved results immediately understandable. Keep advanced project functions in the left navigation.

## Personas and jobs
Developers preparing a release need to inspect a project, discuss findings, revisit reports and preserve unfinished drafts across sessions.

## Information architecture
Three-column shell: 264px left sidebar, 704px-measure center conversation column and 404px right panel. Sidebar top stays fixed (brand, search, reminders, collapse and new conversation); middle scrolls across three groups (release, projects with indented active-project conversations and contextual rename/archive menus, and project materials); footer stays fixed above a hairline (rule freshness, single settings entry and help). Center header holds sidebar expand, project breadcrumb, session title, overflow menu and one right-panel toggle; right panel hosts release, evidence, changes and DevTools tabs.

## Design principles
Follow Codex's project grouping and compact navigation; use Claude's quiet reading surface, generous spacing and lightweight menus. Avoid dashed guides, folder corner badges, duplicated toolbars and large decorative cards. Keep destructive actions out of quick navigation.

## Visual language
Use existing light/dark tokens, single-color line icons, subtle hover fills and a centered reading column. Headings express hierarchy through size and spacing. No new font or motion dependency.

## Components
Build new shell controls with project-owned React + Base UI primitives in desktop/src/components/ui/ and native popovers using --ds-* tokens; add no new Web Awesome tags while retiring legacy dropdowns incrementally. Keep 32px navigation rows, flat project folders and hover/focus conversation actions (always visible on touch). Home pairs the Shipmate mark with its greeting, project context, three quick actions and latest report; release progress, evidence, local changes and DevTools status also surface in the four-tab right panel with loading skeletons, retryable errors, single-action empty states and info tooltips. Conversation headers use spacing without a bottom divider; welcome titles and assistant prose use system serif fonts, user bubbles use the selected surface, the composer uses one inset focus ring and active tabs/controls keep high-contrast indicators in forced-colors mode.

## Accessibility
Every icon action has a contextual accessible name. Keep menu dismissal and dialog focus coordinated. Truncate long sidebar titles with full accessible labels. Preserve forced colors, text zoom, keyboard navigation and reduced-motion support.

## Responsive behavior
Wide viewports show all three columns (264px sidebar, flexible center column, 404px right panel). At 1180px and below, the right panel collapses into an on-demand modal drawer; at 820px and below, the left sidebar also collapses and opens from the header as a modal drawer with inert background isolation and Escape/backdrop dismissal. Home rows wrap without hiding actions. Validate at 320px, 760px, 1000px, 1440px and short windows.

## Interaction states
Renaming another conversation must preserve the active conversation and draft. Archive only after pending content is saved; keep originals on persistence conflicts. Archived conversations remain searchable and restorable. Menu cleanup follows row and workspace lifetime.

## Content voice
Short, direct Chinese labels. Explain errors beside recovery actions. Do not imply that a local check is official approval.

## Implementation constraints
Preserve existing controller IDs, project scope, persistence revisions and mounted-panel lifecycle while lazy-loading the React + Base UI right-panel renderer to stay within the 750 kB / 250 kB gzip startup budget. No new dependencies. Protect IME composition on Enter and avoid stealing scroll during streaming replies, then validate shared session behavior and WebView presentation.

## Open questions
None blocking this iteration. Official references: [Codex app](https://openai.com/index/introducing-the-codex-app/) and [Claude Projects announcement](https://www.anthropic.com/news/projects) (historical 2024 reference, not a claim about the latest desktop layout).
