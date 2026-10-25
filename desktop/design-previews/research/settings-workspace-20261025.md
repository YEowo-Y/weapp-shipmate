# Desktop settings workspace

## Evidence and scope

The user supplied two actual desktop settings screenshots on 2026-10-25: a dark Codex-style settings workspace and a light OpenCode preferences page. Both separate category navigation from limited-width content and align descriptive text with controls. They are visual references, not a request to reproduce account or product capabilities that Shipmate does not have.

Official OpenCode source was inspected at commit `a41d09bc78e2cda3201096bf766ef3a2c359d54b`:

- [Settings layout and responsive rules](https://github.com/anomalyco/opencode/blob/a41d09bc78e2cda3201096bf766ef3a2c359d54b/packages/app/src/settings/settings.css): bounded two-column layout, grouped setting surfaces, responsive navigation and wrapping controls.
- [SettingsRow](https://github.com/anomalyco/opencode/blob/a41d09bc78e2cda3201096bf766ef3a2c359d54b/packages/app/src/settings/row.tsx) and [SettingsList](https://github.com/anomalyco/opencode/blob/a41d09bc78e2cda3201096bf766ef3a2c359d54b/packages/app/src/settings/list.tsx): name, description and control separated within reusable groups.
- [Navigation](https://github.com/anomalyco/opencode/blob/a41d09bc78e2cda3201096bf766ef3a2c359d54b/packages/app/src/settings/navigation.tsx) and [surface](https://github.com/anomalyco/opencode/blob/a41d09bc78e2cda3201096bf766ef3a2c359d54b/packages/app/src/settings/surface.tsx): back-to-app navigation and focus continuity.

This is a source-backed adaptation, not a pixel-identical clone or verification of an installed OpenCode release. No upstream Solid components or new library were installed. Notification and connection navigation use `bell` and `plug` from the existing pinned Lucide upstream commit; geometry and license provenance are documented in `components/LUCIDE-SOURCE.md`.

## Shipmate implementation

- Reuse the native dialog's keyboard isolation and Escape/focus restoration, presenting settings as a full-window workspace. Keep the original opener during existing destination handoffs.
- Desktop sidebar: 248px, 216px below 1100px. Content: at most 840px. Below 800px navigation moves above content; settings rows stack. Three real categories remain: appearance, notifications, connections and data.
- Reuse existing Web Awesome actions, Lucide whitelist icons and labeled native radio groups. Theme miniatures are decorative. Keyboard focus stays visible.
- Use one grouped surface for related rows, restrained separators, 14px UI descriptions and 13px control/feedback text. Only the reading sample follows the 14/16/18px message preference.
- Preserve persistence schema, validation, corruption/save-error recovery, notification lifecycle and all destination callbacks. Changes save immediately; feedback remains outside the scrolling body.

## Verification contract

Unit regressions cover workspace regions, return focus and preserved choices, and native group semantics, alongside existing storage and route tests. Windows native presentation acceptance checks full-window geometry, 320/390/1000/1440px layouts in light/dark, limited content width, reading/UI font isolation, persisted settings, return action and text-spacing stress. Results and actual screenshots are recorded under `.omx/artifacts/desktop-model-native/`.

Future work should be driven by real settings growth: add settings search when categories expand; embed secondary connection/data screens in the settings workspace only with a deliberate navigation contract. This change keeps their existing dialog handoff instead of introducing another router.
