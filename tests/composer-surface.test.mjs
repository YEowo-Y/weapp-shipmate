import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../desktop/design-previews/', import.meta.url);
const desktopRoot = new URL('../desktop/src/', import.meta.url);
const sharedRoot = new URL('shared/', desktopRoot);
const composer = readFileSync(new URL('components/composer.css', sharedRoot), 'utf8');
const app = readFileSync(new URL('app.css', sharedRoot), 'utf8');

// These are source contracts, not browser layout or visual assertions.
test('model choice keeps its only visible name when the composer becomes narrow', () => {
  assert.doesNotMatch(composer, /\.agent-composer__provider\s*\{[^}]*display:\s*none/);
  assert.match(composer, /\.agent-composer__provider\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(composer, /\.agent-composer\s+\.agent-composer__model\s*\{[^}]*flex-shrink:\s*1/);
  assert.match(composer, /\.agent-composer\s+\.agent-composer__model\s*\{[^}]*min-width:\s*64px/);
  assert.match(composer, /\.agent-composer__actions\s*\{[^}]*flex-shrink:\s*0/);
});

test('coarse-pointer composer retains 44px send and attachment targets', () => {
  assert.match(composer, /@media\s*\(pointer:\s*coarse\)[\s\S]*min-height:\s*44px/);
  assert.match(composer, /@media\s*\(pointer:\s*coarse\)[\s\S]*\.agent-composer__add,\s*\.agent-composer__send\)\s*\{[^}]*width:\s*44px/);
});

test('composer color roles use existing tokens and retain contrast with the preview aliases', () => {
  const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
  const literalColor = /#[0-9a-f]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|oklch|oklab|color)\(/iu;
  const properties = (css, selector) => {
    const declarations = [...strip(css).matchAll(/([^{}]+)\{([^{}]+)\}/g)]
      .filter(([, selectors]) => selectors.trim() === selector)
      .flatMap(([,, body]) => [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)]);
    return Object.fromEntries(declarations.map(([, name, value]) => [name, value.trim()]));
  };
  const design = readFileSync(new URL('design-system.css', desktopRoot), 'utf8');
  const preview = readFileSync(new URL('app.css', root), 'utf8');
  const styles = readFileSync(new URL('styles.css', desktopRoot), 'utf8');
  assert.doesNotMatch(strip(composer), literalColor);
  assert.doesNotMatch(properties(styles, '.desktop-model-picker')['box-shadow'] || '', literalColor);

  const base = properties(composer, '.agent-composer.composer');
  for (const [name, value] of Object.entries(base)) {
    if (name.startsWith('--composer-')) assert.match(value, /^var\(--ds-/u, name);
  }
  function resolveColor(value, tokens, references = []) {
    const reference = value?.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/u);
    if (!reference) return value;
    const [, name, fallback] = reference;
    assert.ok(!references.includes(name), 'cyclic color token ' + name);
    return resolveColor(tokens[name] ?? fallback, tokens, [...references, name]);
  }
  function luminance(hex) {
    assert.match(hex, /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu);
    let value = hex.slice(1);
    if (value.length === 3) value = [...value].map(char => char + char).join('');
    const rgb = value.match(/../g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  for (const theme of ['dark', 'light']) {
    const legacySelector = `body[data-theme="${theme}"]`;
    const themedTokens = {
      desktop: properties(design, `.desktop-app[data-theme="${theme}"]`),
      preview: { ...properties(app, legacySelector), ...properties(preview, legacySelector) },
    };
    for (const [surface, colors] of Object.entries(themedTokens)) {
      const tokens = { ...colors, ...base };
      const check = (textRole, backgroundRole, minimum) => {
        const label = `${surface} ${theme} ${textRole} on ${backgroundRole}`;
        assert.ok(tokens[textRole] && tokens[backgroundRole], label);
        const foreground = luminance(resolveColor(tokens[textRole], tokens));
        const background = luminance(resolveColor(tokens[backgroundRole], tokens));
        const contrast = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        assert.ok(contrast >= minimum, `${label}: ${contrast.toFixed(2)}:1`);
      };
      for (const role of ['text', 'muted', 'placeholder', 'permission', 'effort']) {
        check('--composer-' + role, '--composer-bg', 4.5);
      }
      check('--composer-action-ink', '--composer-action', 3);
      check('--composer-action-ink', '--composer-action-hover', 3);
    }
  }
});

test('replacing an existing message does not reapply a whole-message entrance', () => {
  const rules = [...app.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  for (const [, selectors, declarations] of rules) {
    if (selectors.split(',').some(selector => selector.trim() === '.msg')) {
      assert.doesNotMatch(declarations, /animation(?:-name)?:\s*rise/);
    }
  }
});


test('workspace delegates lifecycle to shared sessions across repeated bfcache visits', () => {
  const source = readFileSync(new URL('main.js', root), 'utf8');
  assert.match(source, /await mountSessionWorkspace\(/);
  assert.doesNotMatch(source, /addEventListener\(['"]pagehide/);
  const shared = readFileSync(new URL('session-workspace.js', sharedRoot), 'utf8');
  const lifecycle = shared.match(/^ {2}bind\(win, 'pagehide', .*$/m)?.[0];
  assert.ok(lifecycle, 'shared workspace must own pagehide');
  const listeners = [];
  let stops = 0;
  let flushes = 0;
  let destroys = 0;
  vm.runInNewContext(lifecycle, {
    win: {},
    bind(target, type, listener, options) { listeners.push({ type, listener, options }); },
    conversation: { stop() { stops++; } },
    flush() { flushes++; },
    destroy() { destroys++; },
  });
  const registration = listeners.find(item => item.type === 'pagehide');
  assert.notEqual(registration.options?.once, true);
  registration.listener({ persisted: true });
  registration.listener({ persisted: true });
  assert.equal(stops, 2);
  assert.equal(flushes, 2);
  assert.equal(destroys, 0);
  registration.listener({ persisted: false });
  assert.equal(destroys, 1);
});
