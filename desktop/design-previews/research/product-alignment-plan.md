# Product screenshot alignment — 2026-10-17

Mode: direct execution with bounded native subagents. Preserve existing model/chat behavior; no framework migration or new dependency.

## Evidence before changes

Saved actual local workspace, chat and settings screenshots under `.omx/artifacts/product-visual-alignment/*-before.jpg`. Official image research and source limitations are recorded separately in `product-alignment-*-sources.md`.

Observed local issues: preview toolbar + simulated OS titlebar + content header consume multiple rows; settings can scroll its overall frame out of view; navigation and content use competing white surfaces; too many small labels compete with main task; user-message spacing leaves an excessive gap; controls and subsidiary pages have uneven density.

## Cleanup and implementation scope

1. Reuse existing shared CSS tokens and native menu/dialog controls. Collapse redundant presentation chrome on application screens, retain a visible prototype indicator and design annotation controls. Keep gallery/showcase presentation distinct.
2. Give primary content a neutral canvas, navigation a quiet secondary surface, borders only where regions change. Keep semantic success/error colors and existing provider icons. Standardize page headings, form controls, focus and hover states across feature screens.
3. Refine conversation reading width, input height, spacing, message actions, compact tool rows and result presentation. Preserve the existing scroll owner, stop/stream/error states, reduced-motion behavior and short-viewport fixes.
4. Refine settings navigation/provider/detail hierarchy, credential dialog and model catalog. Keep explicit connection capabilities, simulated states, server-side credentials and cancellation unchanged.
5. Verify at desktop 1280×720, wide desktop, 900px, 390px and short 500px height. Check light/dark, menus/dialogs, keyboard focus, overflow, settings return path, all functional page layouts, chat send/stop/recovery where affected.

## Ownership

- Parent: app.css, ui.css, preview.js, navigation.js, responsive.css, other feature-page visual integration, browser verification and evidence.
- Conversation lane: conversation.css, components/composer.css, components/message.css, components/review.css, main.css, chat-full.html, main-four-region.html.
- Settings lane: settings.css, settings.html and narrowly required settings presentation changes.
- Research lanes: source notes and reference images only.

## Completion evidence

Baseline and final tests, lint, static references, desktop build; independent review of shared changes. Before/after screenshots and direct-mode visual verdict recorded in `.omx/state/product-visual-alignment/ralph-progress.json`. No claim that public promotional crops prove every current logged-in product state, and no claim of live paid inference or native desktop parity.
