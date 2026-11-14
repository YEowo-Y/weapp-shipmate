import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { iconNodes } from '../desktop/design-previews/components/lucide-icons.js';

const root = new URL('../desktop/design-previews/', import.meta.url);

test('static icon sprite stays in sync with the pinned dynamic icon source', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-preview-icons.mjs', import.meta.url)), '--check']);
  const sprite = readFileSync(new URL('components/icons.svg', root), 'utf8');
  const ids = [...sprite.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'symbol IDs are unique');
  assert.deepEqual(ids.sort(), Object.keys(iconNodes).sort());
  assert.doesNotMatch(sprite, /\b(?:href|src|on[\w:-]+)\s*=|<!ENTITY|<!DOCTYPE|<script|<foreignObject|url\s*\(/i);
  for (const nodes of Object.values(iconNodes)) {
    for (const [tag, attrs] of nodes) {
      assert.ok(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'].includes(tag));
      assert.ok(Object.keys(attrs).every(key => /^(?:d|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|points)$/.test(key)), tag);
    }
  }
});

test('static functional icons use local, existing symbols and stay decorative', () => {
  let references = 0;
  for (const file of readdirSync(root).filter(file => file.endsWith('.html'))) {
    const markup = readFileSync(new URL(file, root), 'utf8').split(/<script\b/i)[0];
    for (const [svg, attrs, children] of markup.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)) {
      assert.match(attrs, /aria-hidden="true"/, `${file}: decorative SVG`);
      assert.match(attrs, /focusable="false"/, `${file}: non-focusable SVG`);
      if (/data-brand-icon="true"/.test(attrs)) continue;
      const use = children.match(/^\s*<use href="components\/icons\.svg#([a-z0-9-]+)"><\/use>\s*$/);
      assert.ok(use, `${file}: functional icon must use the shared sprite: ${svg.slice(0, 100)}`);
      assert.ok(Object.hasOwn(iconNodes, use[1]), `${file}: ${use[1]}`);
      assert.match(attrs, /stroke-width="1\.75"/);
      assert.match(attrs, /viewBox="0 0 24 24"/);
      references += 1;
    }
  }
  assert.ok(references > 0, 'static pages exercise the sprite');
});
