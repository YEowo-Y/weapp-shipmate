# markdown-it browser asset provenance

Verified 2026-10-17. Runtime remains the existing native ESM design preview. No npm dependency installation or package scripts were used.

- Official documentation: https://markdown-it.github.io/markdown-it/
- Package release: https://github.com/markdown-it/markdown-it/tree/15.0.3
- Official tarball: https://registry.npmjs.org/markdown-it/-/markdown-it-15.0.3.tgz
- Tarball integrity (verified): `sha512-+Az7Ojz3iRGu8KYMvJ6xVhvrxP3eE+vEtJX75Ow88XBpcQNV/0lGX5ZynIIBftREo4DC2jsveAMDaeltmm8QvQ==`
- Original paths: `dist/browser/markdown-it.esm.min.mjs`, its adjacent `.map`, and `LICENSE`. All three are byte-for-byte copies.
- License: MIT, retained in LICENSE. Bundled components and their license texts are retained in THIRD-PARTY-NOTICES.txt; versions come from the official release package-lock.json and their npm tarball integrity was verified.
- Upstream lock: https://github.com/markdown-it/markdown-it/blob/15.0.3/package-lock.json

## Local SHA-256

- `markdown-it.esm.min.mjs`: `d5432491790141da046b1197353705db03264f40b5727f3b4b591f5aba193e30`
- `markdown-it.esm.min.mjs.map`: `b7a2e378f803958d214a8e5ed9f9c108e26c582c80c1b4dde4bcffac960f6efe`
- `LICENSE`: `792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473`

## Integration boundaries

The official browser export provides a default MarkdownIt constructor and parse(source, env) tokens. The project adapter creates an instance with html:false, breaks:true, linkify:false and typographer:false. It never invokes the HTML renderer. Only whitelisted tokens become native DOM; attributes are set explicitly. User text stays literal. Image tokens become explicit links rather than network-loading images; links are restricted to http/https with no credentials. The bundle and source map are served locally, without CDN, analytics, or runtime fetch.

This is CommonMark plus the built-in table and strikethrough extensions, not a claim of full GFM/Streamdown feature parity. Task checkboxes, math, Mermaid and syntax highlighting are outside this change. The original browser bundle includes its parser dependencies; they are not separately loaded. The map is only a developer-tool resource.

React-oriented Streamdown / AI Elements were reviewed as interaction references. Migrating the standalone vanilla preview to React solely for Markdown would widen this change unnecessarily. No renderer grammar is reimplemented by the project adapter.
