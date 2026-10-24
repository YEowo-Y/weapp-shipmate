import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createProviderIcon } from '../desktop/design-previews/components/provider-icons.js';
import { PROVIDERS } from '../desktop/design-previews/settings-state.js';

const assetRoot = new URL('../desktop/design-previews/components/brands/', import.meta.url);

test('vendored brand assets and license match their pinned upstream manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.files.filter(file => file.rendering !== 'license').length, 5);
  for (const file of manifest.files) {
    assert.match(file.file, /^(?:[a-z-]+\.svg|LICENSE)$/);
    const content = readFileSync(new URL(file.file, assetRoot));
    assert.equal(content.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256, file.file);
    assert.equal(file.url, `https://raw.githubusercontent.com/lobehub/lobe-icons/${manifest.commit}/${file.upstreamPath}`);
    if (file.rendering === 'license') assert.match(content.toString(), /Copyright \(c\) 2023 LobeHub/);
  }
});

test('brand SVGs contain passive geometry without scripts, external resources or event handlers', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));
  for (const file of manifest.files.filter(file => file.file.endsWith('.svg'))) {
    const source = readFileSync(new URL(file.file, assetRoot), 'utf8');
    assert.match(source, /viewBox="0 0 24 24"/);
    for (const [, tag] of source.matchAll(/<\/?([\w:-]+)/g)) assert.ok(['svg', 'title', 'path'].includes(tag), `${file.file}: ${tag}`);
    assert.doesNotMatch(source, /\b(?:href|src|on[\w:-]+)\s*=/i);
    assert.doesNotMatch(source, /\b(?:url|expression)\s*\(|@import|javascript:|<!ENTITY|<!DOCTYPE/i);
  }
});

test('provider icons are decorative and accept only known service IDs, never arbitrary URLs', () => {
  const createElement = tag => ({ tag, dataset: {}, attributes: {}, children: [], setAttribute(name, value) { this.attributes[name] = value; }, append(...children) { this.children.push(...children); } });
  const document = { createElement, createElementNS: (_namespace, tag) => createElement(tag) };
  for (const provider of PROVIDERS) {
    const icon = createProviderIcon(document, provider.id);
    assert.equal(icon.attributes['aria-hidden'], 'true');
    if (provider.id === 'google') {
      const image = icon.children[0];
      assert.equal(image.tag, 'img');
      assert.equal(image.alt, '');
      assert.equal(image.src, new URL('google-color.svg', assetRoot).href);
      assert.equal(image.width, image.height);
    }
  }
  for (const id of ['__proto__', 'constructor', 'https://example.com/logo.svg', '<svg onload=alert(1)>']) assert.throws(() => createProviderIcon(document, id), /Unknown provider icon/);
});
