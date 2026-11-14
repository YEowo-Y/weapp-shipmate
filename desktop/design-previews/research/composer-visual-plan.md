# Composer visual standardization — 2026-10-13

## Baseline and evidence

The user supplied two Codex screenshots. Both are direct visual references for the composer and expanded add menu; neither is a Claude screenshot. Existing official Claude interaction research remains in `codex-claude-dialog-reference.md`.

Baseline: `node --test tests/chat-menus.test.mjs tests/conversation.test.mjs tests/component-presentation.test.mjs` passed 21/21 before edits. Existing shared composer has 18px corners, a compact brown surface, square orange send button, visible keyboard hint, and a 264px attachment menu. This does not match the supplied reference.

## Cleanup plan and bounded implementation

1. Keep the existing vanilla JavaScript modules and native popover/dialog primitives. Reuse the conversation lifecycle and autocomplete logic; no new dependency.
2. Replace shared composer presentation on all three mounts: neutral gray surface (#343434 dark), approximately 144px empty height, 30–32px corners, 16px input text, generous top space, bottom toolbar on one baseline. Left: plus and truthful read-only status. Right: demo provider, purple mode, circular send/stop. Keyboard help remains accessible without taking a visual row.
3. Extend the existing menu primitive with a composer-width anchor, grouped rows, simple line icons, inline descriptions, rounded selection, and internal scrolling. Preserve native top-layer, keyboard, dismissal and focus behavior. Remove fake attachment actions that only emit a notice; expose existing file preview, reference picker and navigation instead.
4. Fold the separate reference button into the add menu on the full chat page. Preserve @ typing, IME, filtering, session draft and stop-generation behavior.
5. Verify dark/light, desktop, narrow chat columns and 320px mobile in the real browser. Compare screenshots after each visual pass; check menu alignment, focus return, send/stop, reference selection, no overflow and reduced motion. Run applicable tests, lint and CSS parse; independently review the diff.

## Truthful adaptations

The prototype has no live model or voice service. Use “本地演示 / 均衡” and “只读演示”; do not copy GPT model names, “完全访问”, installed integrations or nonfunctional voice controls. The supplied visual proportions remain the reference, adapted to narrower workspace columns.

Evidence and iteration verdicts: `.omx/state/composer-visual/ralph-progress.json`.

## Browser-driven repair

Iteration 1 exposed a stale fixed review-trigger offset after page scrolling at 1024×600. Extend the existing reserve calculation to document scroll (passive listener), and hide secondary floating controls while the composer menu is open. No new positioning abstraction.
