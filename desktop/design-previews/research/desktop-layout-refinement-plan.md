# Desktop layout refinement · 2026-10-19

Direct execution, existing stack, no new dependency. Preserve the existing dirty tree and all model/session/report contracts.

## Observed baseline and reference

Actually inspected the prior native 1000/1280/390 captures plus the current Vite page. Compared the user-supplied Codex composer image, archived official Claude desktop poster and Cherry chat/provider screenshots. Public sources: https://code.claude.com/docs/en/desktop , https://cherryai.com/docs/en/cherrystudio/preview/chat/ , https://www.cherryai.com/docs/en/pre-basic/settings/providers/ . Public images are visual references, not proof of private account behavior or exact version parity.

Current issues: three stacked header bands and duplicate title; empty tools consume 360px permanently; narrow screen stacks tools below a 72dvh conversation, creating two scroll owners; composer repeats model/protocol notes; model actions lack a clear primary action.

## Cleanup plan and acceptance

1. Merge brand/session/actions into one compact top bar (two compact rows only on narrow screens). Reuse the session workspace, preserve live save errors and historical search.
2. Make project tools optional. Use the existing native dialog primitive as a nonmodal adjacent panel on wide screens and modal drawer on narrow screens; preserve reports and in-flight work while closed. Escape/close restores its trigger; responsive transitions cannot strand focus or leave the page inert.
3. Align the reading column and composer at 704px maximum, remove repeated technical chrome from the composer while retaining its accessible description. Use a single viewport frame and independent message/panel scrolling.
4. Refine connection panel spacing, connected-state action hierarchy and overflow without changing credentials, provider requests or model selection.
5. Capture real rendered before/after states and inspect each iteration before another visual edit. Test 1280×850, 1000×720, 390×844 and short viewport; preserve send/stop/retry/history/draft paths.

## Verification contract

Medium UI/interaction risk. Discovered commands: package.json `npm test` / `npm run lint`; desktop/package.json `npm --prefix desktop run build`; existing Windows driver runner `node scripts/desktop-native-e2e.mjs` after `npm --prefix desktop run tauri -- build --debug --no-bundle`. Add behavior-focused panel tests and native geometry/focus checks. Existing 21 desktop control/session/model tests are the pre-change regression baseline. No authentication, transport, data schema, dependency or release changes intended. No deployment/installer readiness claim.

Browser MCP extension connection was unavailable; use the existing native WebDriver harness and the working Codex in-app browser. Record real limitations rather than treating unavailable tools as a pass.
