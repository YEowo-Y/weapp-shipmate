# Web Awesome Core, locally bundled

- Upstream: https://github.com/shoelace-style/webawesome
- Pinned npm version: `@awesome.me/webawesome@3.14.0`
- Package gitHead: `201e49fdb9359416f411e4a52b5e4af1ac88f3b8`
- API documentation: https://webawesome.com/docs
- License: MIT. Bundled Lit packages use BSD-3-Clause. All included package licenses are preserved in `THIRD-PARTY-NOTICES.txt`.
- Rebuild: `npm --prefix desktop ci` then `npm --prefix desktop run build:ui-kit`.

The Vite library entry imports button, badge, dropdown, dropdown-item, tooltip, and only the default theme. Required internal components are included automatically. There is no runtime CDN import and no native-element reset.

The default remote icon resolver is disabled. Product icons remain local Lucide SVGs; Web Awesome's internal system icons are embedded data URIs. The JavaScript contains the upstream unused default-resolver definition, but the entry replaces that registry before user interaction. Do not introduce ordinary `wa-icon` product icons.

`manifest.json` records the actual bundled packages, asset sizes, gzip sizes and SHA-256 hashes. These are measurements, not performance-budget assertions.

`bindActionMenu` waits for `wa-after-hide` before running an action because `wa-select` occurs before the upstream trigger-focus restoration. Keep this order when opening a native dialog from a menu.
