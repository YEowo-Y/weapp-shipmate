import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';
import { createConversationController } from '../desktop/design-previews/conversation.js';
import { streamGuide } from '../desktop/design-previews/guide-transport.js';
import { runGuide } from '../src/guide.mjs';

async function setup(t, options = {}) {
  let externalCalls = 0;
  const broker = createModelConnectionHandler({ ...options, fetchImpl: () => { externalCalls++; throw new Error('Provider access is forbidden for local guide'); } });
  const server = createServer((req, res) => { void broker(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { broker.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const paths = [];
  const fetcher = async (path, options) => {
    paths.push(path);
    const reply = await fetch(origin + path, { ...options, headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}), ...(options.method === 'POST' ? { Origin: origin } : {}) } });
    if (reply.headers.has('set-cookie')) cookie = reply.headers.get('set-cookie').split(';')[0];
    return reply;
  };
  return { fetcher, paths, get externalCalls() { return externalCalls; } };
}
const input = { subject: 'enterprise', sensitive: true, domain: true };

test('controller → real HTTP transport → broker → bundled rule engine generates a validated guide without provider access', { timeout: 5000 }, async t => {
  const app = await setup(t);
  let finish;
  const events = [];
  const done = new Promise(resolve => { finish = resolve; });
  const controller = createConversationController({ guideTransport: args => streamGuide(args, { fetcher: app.fetcher }), onEvent(event) {
    events.push(event);
    if (['complete', 'error'].includes(event.type)) finish(event);
  } });
  t.after(() => controller.dispose());
  assert.equal(controller.start({ input: '生成企业上线清单', guide: input }).ok, true);
  const result = await done;
  assert.equal(result.state, 'complete', result.error?.message);
  assert.deepEqual(result.result.structuredResult, runGuide({ subject_type: 'enterprise', collects_sensitive: true, has_server_domain: true }, { includeDrafts: false }));
  assert.ok(events.find(event => event.type === 'tool-start'));
  assert.ok(events.find(event => event.type === 'tool-result'));
  assert.equal(result.result.review, undefined);
  assert.equal(result.live, null);
  assert.equal(app.externalCalls, 0);
  assert.deepEqual(app.paths, ['/api/model-connections', '/api/model-connections/tools/guide']);
});

test('controller stop aborts the actual HTTP guide runner and suppresses late output', { timeout: 5000 }, async t => {
  let resolveGuide, didAbort;
  const aborted = new Promise(resolve => { didAbort = resolve; });
  const app = await setup(t, { guideRunner: (_input, { signal }) => {
    signal.addEventListener('abort', didAbort, { once: true });
    return new Promise(resolve => { resolveGuide = resolve; });
  } });
  const events = [];
  const controller = createConversationController({ guideTransport: args => streamGuide(args, { fetcher: app.fetcher }), onEvent(event) {
    events.push(event);
    if (event.type === 'tool-start') controller.stop();
  } });
  t.after(() => controller.dispose());
  controller.start({ input: '生成清单', guide: input });
  await aborted;
  resolveGuide(runGuide({ subject_type: 'enterprise' }));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(controller.getSnapshot().state, 'stopped');
  assert.equal(events.some(event => ['tool-result', 'complete'].includes(event.type)), false);
  assert.equal(app.externalCalls, 0);
});
