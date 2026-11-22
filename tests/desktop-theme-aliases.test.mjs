import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readStyle = path => readFileSync(new URL('../desktop/' + path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const shared = readStyle('src/shared/app.css');
const design = readStyle('src/design-system.css');
const desktopStyles = [shared, design, readStyle('src/styles.css'), readStyle('src/product-polish.css')];
const declarations = (css, name) => [...css.matchAll(new RegExp(`[{;]\\s*--${name}\\s*:\\s*([^;}]+)`, 'gu'))].map(match => match[1].trim());

test('shared app styles delegate fixed colors to the entry-point palettes', () => {
  const literalColors = shared.match(/#[0-9a-f]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|oklch|oklab|color)\(/giu) ?? [];
  assert.equal(literalColors.length, 0, 'fixed colors in shared app styles: ' + literalColors.join(', '));
});

test('the desktop design system is the single owner of shared aliases', () => {
  const colorAliases = [
    'bg', 'surface', 'surface-2', 'surface-3', 'border', 'border-2', 'text', 'text-2', 'text-3',
    'accent', 'accent-2', 'accent-soft', 'accent-ink', 'ok', 'ok-soft', 'warn', 'warn-soft',
    'block', 'block-soft', 'purple', 'purple-soft', 'shadow', 'shadow-dialog', 'backdrop-dialog',
  ];
  const aliases = [
    ...colorAliases, 'font-ui', 'font-mono', 'r-xs', 'r-sm', 'r', 'r-lg', 'r-xl', 'r-panel', 'r-dialog', 'ease',
  ];
  for (const alias of aliases) {
    const value = declarations(design, alias);
    assert.equal(value.length, 1, '--' + alias + ' must be defined once in design-system.css');
    assert.deepEqual(desktopStyles.flatMap(css => declarations(css, alias)), value, '--' + alias + ' has a competing desktop declaration');
  }
  for (const alias of colorAliases) {
    assert.match(declarations(design, alias)[0], /^var\(--ds-[\w-]+\)$/u, alias);
  }
});
