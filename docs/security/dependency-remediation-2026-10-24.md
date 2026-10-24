# Dependency security remediation — 2026-10-24

Scope: the 14 open Dependabot alerts on `main` at `fab23e4`, plus the current npm audit of both lockfiles. This is a dependency-only change; the desktop product work on the development branch is not a prerequisite for merging it.

## Resolution

The 13 high-severity Dependabot alerts are addressed by the npm lockfile changes below. Both complete npm audits, including development dependencies, now report zero known vulnerabilities. The medium-severity Rust `glib` alert remains unresolved. These are branch verification results: GitHub closes default-branch alerts only after the fix reaches `main` and its dependency graph is reprocessed.

| Package / lockfile | Before | After | Original alert numbers | Result |
| --- | --- | --- | --- | --- |
| `js-yaml` / root | 4.3.0 | 4.3.2 | [#9](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/9), [#16](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/16) | Fixed |
| `brace-expansion` / root | 5.0.8 | 5.0.12 | [#7](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/7), [#18](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/18), [#19](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/19) | Fixed |
| `fast-uri` / root | 3.1.4 | 3.1.9 | [#8](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/8), [#12](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/12), [#13](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/13), [#14](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/14), [#15](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/15), [#17](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/17) | Fixed |
| `nanoid` / desktop | 3.3.16 | 3.3.20 | [#11](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/11) | Fixed |
| `source-map-js` / desktop | 1.2.1 | 1.2.2 | [#20](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/20) | Fixed |
| `glib` / desktop Cargo | 0.18.5 | unchanged | [#1](https://github.com/YEowo-Y/weapp-shipmate/security/dependabot/1) | Open; upstream compatibility blocker |

The fresh audit also found advisories beyond the original list. `brace-expansion` needs 5.0.12 for [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr); `fast-uri` needs 3.1.9 for [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg). Desktop Vite is updated from 6.4.3 to 6.4.5, including the Windows file-access fix in [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) and the other Vite advisories returned by the audit.

Only six installed npm package versions changed, all within their existing patch series. The direct minimum ranges are `js-yaml ^4.3.2` and `vite ^6.4.4`; transitive dependencies keep their existing parent constraints. Targeted npm updates selected the compatible patch releases recorded in the lockfiles. No dependency was added or removed, and no `overrides`, forced audit upgrade, framework migration, or license change was introduced. Reproduce the tested dependency trees with `npm ci`, not an unlocked install.

## Remaining glib alert

[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) affects `glib >=0.15,<0.20`. The latest official 0.18 patch remains 0.18.5. The lockfile contains Tauri 2.11.3 → GTK 0.18 / WebKit2GTK 2.0.2 → glib 0.18.5.

As of this review, even the newer stable Tauri 2.12.5 / runtime-wry 2.12.3 / wry 0.57.1 / tao 0.37.2 chain still requires GTK 0.18. A blanket Tauri upgrade therefore does not resolve this advisory. GTK 0.19 exists and requires glib 0.22, but the complete Tauri/WebKit dependency migration is not released. It is inaccurate to describe GTK4 or Tauri 3 as the only possible remedy.

Upstream evidence and follow-up conditions:

- [glib 0.18 source](https://github.com/gtk-rs/gtk-rs-core/blob/0.18/glib/src/variant_iter.rs) and [original fix](https://github.com/gtk-rs/gtk-rs-core/pull/1343): there is no compatible published backport in this series.
- [wry #1843](https://github.com/tauri-apps/wry/pull/1843): GTK 0.19 migration is an unmerged draft and raises the Rust requirement to 1.92.
- [tao #1332](https://github.com/tauri-apps/tao/pull/1332) and [webkit2gtk-rs #167](https://github.com/tauri-apps/webkit2gtk-rs/pull/167): required migrations are still unmerged.
- Revisit when the compatible chain is released and adopted by Tauri; alternatively, a maintained source backport needs separate provenance review and Linux regression testing.

The locked Windows MSVC dependency tree contains no glib package. The locked Linux tree does contain glib 0.18.5 through GTK/WebKit. This establishes the platform boundary, not a fix or a dismissal: keep the alert open and do not describe the Linux dependency tree as remediated. `Cargo.lock` and the alert state are unchanged.

## Verification

Local environment: Windows, Node 24.14.0, npm 11.9.0; security branch based on `main`.

| Command | Result |
| --- | --- |
| `npm ci` and `npm --prefix desktop ci` | Clean installs passed |
| `npm audit --json` and `npm --prefix desktop audit --json` | 0 known vulnerabilities in each full npm graph |
| `npm test` | 236 tests passed; 0 failed/skipped |
| `npm run lint` | Passed |
| `npm run verify:quotes` | All 63 rule quotations matched; two existing manually collected snapshots remain identified by the script |
| `npm run coverage` | Existing rule-quality gate passed; precision 1.000, TP55/FP0/FN0 (not JavaScript line coverage) |
| `npm --prefix desktop run build` | TypeScript check and Vite production build passed |
| `WEAPP_SHIPMATE_NO_PACK=1 npm run build:mcpb` | Staged production dependencies; initialize/list and real check/guide/explain tool calls passed |
| `cargo tree --manifest-path desktop/src-tauri/Cargo.toml --locked --offline --target x86_64-pc-windows-msvc -i glib` | No matching dependency |
| Same Cargo command with `--target x86_64-unknown-linux-gnu` | Confirms affected glib 0.18.5 chain |
| `git diff --check` | Passed |

Raw local evidence is under `.omx/artifacts/security-20261024/` (ignored). npm audit does not cover Rust. `cargo-audit` is not installed in this environment; the Rust conclusion above comes from RustSec, official registry/source review, and the locked target trees, not a full Rust audit. Linux execution, native installer signing, and a new Windows native end-to-end run were not performed for this dependency-only change. The MCP smoke intentionally skips archive generation and signing. Existing GitHub CI provides the additional Windows/Linux and Node 20/22/24 regression matrix when this pull request runs.
