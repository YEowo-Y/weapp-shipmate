import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactDownloader } from '../desktop/design-previews/artifact-download.js';

const artifact = { text: '# 本机清单', filename: 'shipmate-guide-personal.md', mimeType: 'text/markdown;charset=utf-8' };
function harness({ clickError = false, createError = false } = {}) {
  const links = [], revoked = [], blobs = [], timers = new Map();
  let sequence = 0;
  const parent = { append(link) { links.push(link); } };
  const listeners = new Map();
  const documentRef = { defaultView: {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  }, body: parent, createElement(tag) {
    assert.equal(tag, 'a');
    return { style: {}, click() { if (clickError) throw new Error('not allowed'); this.clicked = true; }, remove() { this.removed = true; } };
  } };
  const urlAPI = { createObjectURL(blob) { if (createError) throw new Error('blocked'); blobs.push(blob); return `blob:fixture-${blobs.length}`; }, revokeObjectURL(url) { revoked.push(url); } };
  class BlobType { constructor(parts, options) { this.parts = parts; this.type = options.type; } }
  const downloader = createArtifactDownloader({ documentRef, urlAPI, BlobType,
    setTimer: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id),
  });
  return { downloader, links, revoked, blobs, timers, listeners };
}

test('explicit download uses validated data and temporary anchor; URL stays alive until delayed cleanup', () => {
  const h = harness();
  assert.equal(h.downloader.download(artifact), true);
  assert.deepEqual(h.blobs[0].parts, [artifact.text]);
  assert.equal(h.blobs[0].type, artifact.mimeType);
  assert.equal(h.links[0].download, artifact.filename);
  assert.equal(h.links[0].href, 'blob:fixture-1');
  assert.equal(h.links[0].clicked, true);
  assert.equal(h.links[0].removed, true);
  assert.equal(h.revoked.length, 0);
  assert.ok([...h.timers.values()][0].ms > 0);
  [...h.timers.values()][0].fn();
  assert.deepEqual(h.revoked, ['blob:fixture-1']);
});

test('repeated download reuses one artifact URL and disposal releases it, then supports the next session', () => {
  const h = harness();
  assert.equal(h.downloader.download(artifact), true);
  assert.equal(h.downloader.download({ ...artifact }), true);
  assert.equal(h.blobs.length, 1);
  assert.equal(h.timers.size, 1);
  h.downloader.dispose();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.revoked, ['blob:fixture-1']);
  assert.equal(h.downloader.download(artifact), true);
  assert.equal(h.blobs.length, 2);
  h.downloader.dispose(); h.downloader.dispose();
  assert.deepEqual(h.revoked, ['blob:fixture-1', 'blob:fixture-2']);
});

test('failed DOM activation releases a newly allocated URL and reports failure', () => {
  const h = harness({ clickError: true });
  assert.equal(h.downloader.download(artifact), false);
  assert.equal(h.links[0].removed, true);
  assert.deepEqual(h.revoked, ['blob:fixture-1']);
  assert.equal(h.timers.size, 0);
  assert.equal(harness({ createError: true }).downloader.download(artifact), false);
});

test('unsupported runtime, unsafe filename/type and oversized content never activate a link', () => {
  assert.equal(createArtifactDownloader({ documentRef: {} }).download(artifact), false);
  const h = harness();
  for (const bad of [null, { ...artifact, filename: {} }, { ...artifact, filename: 4 }, { ...artifact, filename: '../secret.md' }, { ...artifact, filename: 'output.html' }, { ...artifact, mimeType: 'text/html' }, { ...artifact, text: '' }, { ...artifact, text: 'x'.repeat(1048577) }]) assert.equal(h.downloader.download(bad), false);
  assert.equal(h.links.length, 0);
  assert.equal(h.blobs.length, 0);
});

test('pagehide releases pending URL resources and listener without preventing later reuse', () => {
  const h = harness();
  h.downloader.download(artifact);
  assert.equal(h.listeners.has('pagehide'), true);
  h.listeners.get('pagehide')();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.revoked.length, 1);
  h.downloader.download(artifact);
  assert.equal(h.listeners.has('pagehide'), true);
  h.downloader.dispose();
});

test('pending resources are bounded; full capacity does not revoke an active download early', () => {
  const h = harness();
  for (let i = 0; i < 8; i++) assert.equal(h.downloader.download({ ...artifact, text: `# version ${i}` }), true);
  assert.equal(h.downloader.download({ ...artifact, text: '# too many' }), false);
  assert.equal(h.revoked.length, 0);
  h.downloader.dispose();
  assert.equal(h.revoked.length, 8);
});
