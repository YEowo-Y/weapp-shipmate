import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js';
import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js';

// Product icons are our existing local Lucide SVGs. Never fall back to the
// package's remote Font Awesome resolver; internal system icons stay embedded.
registerIconLibrary('default', { resolver: () => '' });
