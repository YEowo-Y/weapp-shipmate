import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../desktop/design-previews/navigation.js';

test('data management returns to the originating chat surface with an allowlisted intent', () => {
  assert.equal(navigation.sessionManagementHref('?from=chat', 'data'), 'chat-full.html?panel=data');
  assert.equal(navigation.sessionManagementHref('?from=workspace', 'archived'), 'main-four-region.html?panel=archived');
  for (const source of ['?from=https://example.com', '?from=audit.html', '?from=javascript:alert(1)']) {
    assert.equal(navigation.sessionManagementHref(source, 'data'), 'main-four-region.html?panel=data');
  }
  assert.equal(navigation.sessionManagementHref('?from=chat', 'unknown'), 'chat-full.html?panel=data');
});

test('settings data section links preserve the caller without allowing arbitrary fragments', () => {
  assert.equal(navigation.settingsHref('/chat-full.html', 'data'), 'settings.html?from=chat#data');
  assert.equal(navigation.settingsHref('/main-four-region.html', 'evil'), 'settings.html?from=workspace');
});
