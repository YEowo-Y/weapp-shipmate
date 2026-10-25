# GLib 0.18.5 security backport

This directory records the narrowly scoped remediation of
[RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
([GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g)).
The original iterator passes an immutable pointer location to a C out-parameter.
Optimized builds can ignore the write and dereference a null pointer.

## Decision and compatibility

Keep the current Tauri dependency graph and GLib 0.18 API. The application uses
Cargo's documented [`patch.crates-io`](https://doc.rust-lang.org/cargo/reference/overriding-dependencies.html#the-patch-section)
mechanism to select `desktop/src-tauri/vendor/glib`. The application lockfile
changes only GLib's source/checksum; no dependency versions change.

As checked on 2026-10-24, even current stable Tauri/Wry still requires GTK 0.18;
WebKitGTK also requires GLib 0.18. A direct GLib 0.20+ replacement cannot satisfy
that API graph. [Wry #1843](https://github.com/tauri-apps/wry/pull/1843),
[Tao #1332](https://github.com/tauri-apps/tao/pull/1332), and
[WebKitGTK #167](https://github.com/tauri-apps/webkit2gtk-rs/pull/167)
track the coordinated upgrade. Re-evaluate released versions before removing
this patch; an open upgrade PR is not a compatible release.

The backport preserves name, version, public API, features, dependency ranges,
MSRV, MIT license and copyright. Windows uses WebView2 rather than GLib, but its
actual Tauri build is still checked. No app capability, CSP, command or UI changes.

## Source provenance

- Published archive: <https://static.crates.io/crates/glib/glib-0.18.5.crate>
- SHA-256: `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`
- Archive source revision: `42b9caf98e03ded086362d9653ca58fe94dc8658`
- Upstream fix: [gtk-rs-core #1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343),
  commit [`b5a4071e439bef2b5eea76c3aa25e5ae84839e34`](https://github.com/gtk-rs/gtk-rs-core/commit/b5a4071e439bef2b5eea76c3aa25e5ae84839e34).

All 121 files from the checksum-verified published crate are retained. The only
source difference is this upstream patch in `src/variant_iter.rs`:

```diff
-            let p: *mut libc::c_char = std::ptr::null_mut();
+            let mut p: *mut libc::c_char = std::ptr::null_mut();
             // existing g_variant_get_child arguments unchanged
-                &p,
+                &mut p,
```

`provenance.json` contains the original per-file SHA-256 values. The verifier
reverses exactly these two lines, then checks every file and the Cargo selection.
It rejects missing files, added files, symlinks, unrelated edits and a registry
fallback. `.gitattributes` preserves upstream bytes on Windows. Do not format or
otherwise clean up vendored code. The provenance guard detects accidental drift;
changes to the manifest/verifier itself require source review against the pinned
official archive, not just a green test.

## Verification

From the repository root:

```sh
node scripts/verify-glib-backport.mjs
node --test tests/glib-backport.test.mjs tests/glib-advisories.test.mjs
node scripts/check-glib-advisories.mjs
cargo test --manifest-path desktop/security/glib-variant-iter/Cargo.toml --locked
cargo test --manifest-path desktop/security/glib-variant-iter/Cargo.toml --locked --release
npm ci --prefix desktop
npm --prefix desktop run build
cargo test --manifest-path desktop/src-tauri/Cargo.toml --locked
cargo build --manifest-path desktop/src-tauri/Cargo.toml --locked --features tauri/custom-protocol
```

The GLib harness needs Linux `libglib2.0-dev`, `pkg-config` and a C compiler.
It uses the same vendored crate and an independent minimal lockfile, covering
`next`, `next_back`, `nth`, `nth_back`, `last`, mixed-direction iteration, Unicode,
empty strings/arrays, invalid types and overflowing skips. The full Linux Tauri
check separately validates the application's exact locked graph.
The `glib-backport` workflow installs the documented
[Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux), runs
debug/release regressions, checks Tauri on Linux, and tests/builds it on Windows.

Local reproduction used Rust 1.94.1, Ubuntu 24.04 and system GLib 2.80.0: the
unpatched release harness terminated with SIGSEGV (signal 11); after the two-line
fix the same 10 tests passed. On this toolchain, `RUSTFLAGS=--diagnostic-width=200`
avoids a diagnostic-renderer panic when printing the old crate's existing warnings
in a narrow terminal. It does not suppress warnings or alter optimization.

Integration verification on 2026-10-25 also passed the main branch's 244 Node
tests, lint/data gates and Windows frontend/native build. Its Rust test entrypoint
has no application unit tests. A separate clean development snapshot at `e7e426a`
with this backport passed 1,308 Node tests, 88 Rust tests (two explicit credential
tests ignored), frontend/native builds, and all 16 existing Windows WebView2
project-path checks: native IPC/CSP, switching/drafts, real bundled tools,
cancel/error recovery, export, restart persistence and dialog keyboard behavior.
This used temporary fixture projects and an isolated application identifier.
The first deeply nested WebView2 test profile did not initialize history storage;
using a shorter disposable profile path resolved it without product-code changes.
Windows builds used the dev profile with production assets/custom protocol;
signed release installers, macOS and every possible UI path were not exercised.

## Scanner limitations and future advisories

Do **not** interpret the disappearance of a Dependabot/cargo-audit finding as
proof of remediation. Path dependencies lack a registry source in Cargo.lock and
can be omitted by these scanners. The package remains version 0.18.5; the security
evidence is the exact reviewed source patch plus optimized behavioral tests.
We do not rename/reversion the crate, dismiss the GitHub alert, or globally ignore
the advisory.

`check-glib-advisories.mjs` queries the original `crates.io/glib@0.18.5` identity
using the [OSV API](https://google.github.io/osv.dev/post-v1-query/). Only the two
reviewed IDs above are recognized as source-backported, and only after provenance
verification. Unknown IDs (including new aliases), unavailable/malformed replies,
incomplete pagination and disappearance of the known baseline fail the check.
CI runs it on every PR/main push; it can also be run manually. It is not a
continuous monitor, an OS package scanner, or a guarantee against undisclosed
vulnerabilities. New findings require a separate source review/remediation.

## Removal

When the project's released Tauri/GTK/WebKitGTK graph can use an officially fixed
GLib version (currently >=0.20), upgrade that graph, rerun Linux and Windows
verification, and remove the path patch, vendor directory, this provenance data,
and backport-specific gates together. Do not remove the patch merely because an
upstream tracker closes or a dependency dashboard turns green.
