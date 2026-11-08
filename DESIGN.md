# Design

## Source of truth
Active, 2026-11-08. Applies to the Tauri main window, project sidebar and conversation management. User-provided Codex screenshots define the folder presentation. Implementation tokens live in `desktop/src/design-system.css`; component details live in `desktop/design-previews/DESIGN-SYSTEM.md`.

## Brand
Shipmate is a calm companion for preparing a mini-program release. Keep its own name and monochrome mark. Use restrained surfaces and typography rather than decorative color.

## Product goals
Make starting a project check, resuming a conversation and finding saved results immediately understandable. Keep advanced project functions in the left navigation.

## Personas and jobs
Developers preparing a release need to inspect a project, discuss findings, revisit reports and preserve unfinished drafts across sessions.

## Information architecture
Left icon rail: home, workflow, results, memory, sources, more and settings. Sidebar top: product name, maintenance and search; then new conversation and project folders. Active folder contains indented conversation titles. Each conversation has a contextual rename/archive menu. The main window contains the current page and a persistent composer.

## Design principles
Follow Codex's project grouping and compact navigation; use Claude's quiet reading surface, generous spacing and lightweight menus. Avoid dashed guides, folder corner badges, duplicated toolbars and large decorative cards. Keep destructive actions out of quick navigation.

## Visual language
Use existing light/dark tokens, single-color line icons, subtle hover fills and a centered reading column. Headings express hierarchy through size and spacing. No new font or motion dependency.

## Components
Use existing Web Awesome buttons and dropdowns. Keep project folders as flat rows. Show conversation actions on hover or keyboard focus, and always on touch devices. Home uses a greeting, project context, task rows and a quiet recent-report row. Conversation headers use spacing instead of a divider. The welcome title and assistant prose use system serif fonts. Controls keep the interface font. The composer uses one inset keyboard focus ring. The attachment dialog and model picker use the neutral raised surface. User bubbles use the selected surface in both themes. Keep clear high-contrast focus outlines in forced-colors mode.

## Accessibility
Every icon action has a contextual accessible name. Keep menu dismissal and dialog focus coordinated. Truncate long sidebar titles with full accessible labels. Preserve forced colors, text zoom, keyboard navigation and reduced-motion support.

## Responsive behavior
Desktop retains the icon rail and project sidebar. At 640px and below, project navigation opens from the compact top bar. Home rows wrap without hiding actions. Validate at 320px, desktop widths and short windows.

## Interaction states
Renaming another conversation must preserve the active conversation and draft. Archive only after pending content is saved; keep originals on persistence conflicts. Archived conversations remain searchable and restorable. Menu cleanup follows row and workspace lifetime.

## Content voice
Short, direct Chinese labels. Explain errors beside recovery actions. Do not imply that a local check is official approval.

## Implementation constraints
Preserve existing element IDs, project scope, persistence revisions and mounted-panel lifecycle. No new dependencies. Validate shared session behavior and actual WebView presentation, then rebuild the default desktop identifier.

## Open questions
None blocking this iteration. Official references: [Codex app](https://openai.com/index/introducing-the-codex-app/) and [Claude Projects announcement](https://www.anthropic.com/news/projects) (historical 2024 reference, not a claim about the latest desktop layout).
