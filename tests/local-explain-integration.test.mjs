import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';
import { queryExplain } from '../desktop/design-previews/explain-transport.js';
import { explainHarness } from './helpers/explain-ui.mjs';

test('page controller and production transport query the real local HTTP engine without a model', async t => {
  let externalCalls = 0;
  const handler = createModelConnectionHandler({ fetchImpl: () => { externalCalls++; throw new Error('unexpected external request'); } });
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const fetcher = async (path, options) => {
    const response = await fetch(new URL(path, origin), { ...options, headers: { ...options.headers, Origin: origin, ...(cookie ? { cookie } : {}) } });
    const received = response.headers.get('set-cookie'); if (received) cookie = received.split(';')[0];
    return response;
  };
  const { nodes: n } = explainHarness(options => queryExplain(options, { fetcher }));
  n.rjInput.value = '诱导分享';
  await n.rjForm.fire('submit');
  assert.equal(n.rjStatus.dataset.state, 'matched'); assert.match(n.rjResultItems.text, /诱导/);
  const articles = n.rjResultItems.descendants.filter(node => node.tag === 'article'); assert.equal(articles.length, 2);
  n.rjInput.value = '未收录的拒因xyz'; n.rjInput.fire('input'); await n.rjForm.fire('submit');
  assert.equal(n.rjStatus.dataset.state, 'empty'); assert.match(n.rjResultItems.text, /未匹配/);
  assert.equal(n.rjResultItems.descendants.filter(node => node.tag === 'article').length, 0);
  assert.equal(externalCalls, 0);
});
