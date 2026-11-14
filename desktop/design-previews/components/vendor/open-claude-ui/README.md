# Open Claude UI · scoped source adaptation

Source: https://github.com/Caho1/open-claude-ui/tree/c1f923ae0051a871941b98a0e2e3183a545e6a85

License: MIT, Copyright (c) 2026 Caho1; full notice in `LICENSE` and the preserved `/*! ... */` header in `tokens.css`. The latter travels with the production CSS inside the desktop bundle.

This is a small, maintained adaptation, not the complete npm package or an Anthropic product. No React, Tailwind, Framer Motion, proprietary fonts or brand assets are bundled. The repository's reverse-engineering claims have not been independently verified.

| Adapted source | Used here |
| --- | --- |
| `code-examples/cds-theme.css` L87–138, L199–221, L283–347 | Light/dark surfaces, alpha layers, ghost hover, composer default/hover/focus shadows, timing. Host selector changed to `.desktop-app[data-theme]`. |
| `code-examples/ChatComposer.tsx` L99–148 | 20px radius, 14px inset, 8px gap, 15px/1.4 textarea, 48px minimum. Geometry extracted into named tokens. |
| `code-examples/ChatMessageBubbles.tsx` L139–156, L271–279 | Personal user bubble: 85% max width, 18px radius, 16×12px padding; unframed assistant text with 4px inset. |
| `code-examples/CdsButton.tsx` L28–71 | 32px desktop icon control, ghost fills. Existing 44px touch targets retained. |

Local integration lives in `desktop/src/styles.css`, so prototype screens retain their current theme. Existing semantic tokens feed Web Awesome, settings and business dialogs; source tokens do not override unrelated global names.

Intentional adaptations: keep the project's accessible muted text colors, 704px reading measure, system CJK font, 14/16/18px reading preference, 144px textarea limit, native dialogs and visible keyboard focus. The upstream very low-contrast `#666` dark muted text is not adopted. The product's clay accent remains its own. Forced colors retain real outlines/borders; reduced motion removes transitions.

Reviewed but not ported: the scroll hook (existing anchor/selection-aware controller is more complete), example simulated attachments/hard-coded models, immediate draft clearing, unawaited clipboard writes, fake reasoning elapsed times and keyword-derived tool status. Native `<dialog>` keeps actual focus containment, which the upstream React modal comments describe but do not implement.

Update process: inspect the pinned source diff, update only used tokens, rerun chat/continuity tests and Windows native light/dark/narrow acceptance; inspect screenshots before accepting new values. Do not replace this file by blindly importing the upstream global stylesheet.
