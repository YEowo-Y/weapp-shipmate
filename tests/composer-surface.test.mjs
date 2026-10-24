import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../desktop/design-previews/', import.meta.url);
const composer = readFileSync(new URL('components/composer.css', root), 'utf8');
const app = readFileSync(new URL('app.css', root), 'utf8');

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

test('composer text and action glyph tokens retain contrast in both themes', () => {
  // Token contrast only: this does not claim browser-computed contrast or layout.
  const plain = composer.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
  const rules = [...plain.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  const declarations = selector => rules.find(([, selectors]) => selectors.trim() === selector)?.[2] || '';
  const properties = text => Object.fromEntries([...text.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
  const base = properties(declarations('.agent-composer.composer'));
  const stop = properties(declarations(".agent-composer__send[data-mode='stop']"));
  function luminance(hex) {
    let value = hex.slice(1);
    if (value.length === 3) value = [...value].map(char => char + char).join('');
    const rgb = value.match(/../g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  for (const theme of ['dark', 'light']) {
    const tokens = { ...base, ...(theme === 'light' ? properties(declarations("body[data-theme='light'] .agent-composer")) : {}) };
    const resolve = value => value.startsWith('var(') ? tokens[value.slice(4, -1)] : value;
    for (const token of ['--composer-text', '--composer-muted', '--composer-placeholder']) {
      const foreground = luminance(tokens[token]);
      const background = luminance(tokens['--composer-bg']);
      const contrast = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      assert.ok(contrast >= 4.5, `${theme} ${token}: ${contrast.toFixed(2)}:1`);
    }
    for (const mode of ['send', 'stop']) {
      const foreground = luminance(resolve(mode === 'stop' && stop.color ? stop.color : tokens['--composer-action-ink']));
      for (const state of ['--composer-action', '--composer-action-hover']) {
        const background = luminance(tokens[state]);
        const contrast = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        assert.ok(contrast >= 3, `${theme} ${mode} ${state}: ${contrast.toFixed(2)}:1`);
      }
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
  const shared = readFileSync(new URL('session-workspace.js', root), 'utf8');
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
