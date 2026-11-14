/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';
import { createConversationController } from '../desktop/design-previews/conversation.js';
import { streamChat } from '../desktop/design-previews/chat-transport.js';

async function setup(t, respond) {
  const upstream = [];
  const broker = createModelConnectionHandler({ fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'fixture-model' }] });
    upstream.push({ url, ...options });
    return respond(options);
  } });
  const server = createServer((req, res) => { void broker(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { broker.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  const fetcher = async (path, options) => {
    const reply = await fetch(origin + path, { ...options, headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}), ...(options.method === 'POST' ? { Origin: origin } : {}) } });
    if (reply.headers.has('set-cookie')) cookie = reply.headers.get('set-cookie').split(';')[0];
    return reply;
  };
  const session = await (await fetcher('/api/model-connections', { method: 'GET' })).json();
  const connected = await fetcher('/api/model-connections/openai/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shipmate-CSRF': session.csrfToken }, body: JSON.stringify({ apiKey: 'fixture-not-a-real-key' }) });
  assert.equal((await connected.json()).connections.find(item => item.providerId === 'openai').status, 'connected');
  return { fetcher, upstream };
}
const frame = value => `data: ${JSON.stringify(value)}\n\n`;
const request = { input: '测试文本', live: { providerId: 'openai', model: 'fixture-model', label: 'Fixture', messages: [{ role: 'user', content: '测试文本' }] } };

test('controller → browser transport → actual local broker → fake provider completes a text turn', { timeout: 5000 }, async t => {
  const { fetcher, upstream } = await setup(t, () => new Response(
    frame({ type: 'response.output_text.delta', delta: '真实传输，假上游数据' }) + frame({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message' }] } }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  ));
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const controller = createConversationController({ transport: args => streamChat(args, { fetcher }), onEvent(event) { if (['complete', 'error'].includes(event.type)) finish(event); } });
  t.after(() => controller.dispose());
  assert.equal(controller.start(request).ok, true);
  const result = await done;
  assert.equal(result.state, 'complete');
  assert.equal(result.output, '真实传输，假上游数据');
  assert.equal(upstream.length, 1);
  const payload = JSON.parse(upstream[0].body);
  assert.deepEqual(payload.input, request.live.messages);
  assert.equal(payload.store, false);
  assert.equal(JSON.stringify(payload).includes('fixture-not-a-real-key'), false);
});

test('stopping from the controller closes actual local HTTP and aborts the provider stream', { timeout: 5000 }, async t => {
  let providerAborted;
  const aborted = new Promise(resolve => { providerAborted = resolve; });
  const { fetcher } = await setup(t, options => {
    options.signal.addEventListener('abort', providerAborted, { once: true });
    return new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode(frame({ type: 'response.output_text.delta', delta: '保留这一段' }))); } }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const controller = createConversationController({ transport: args => streamChat(args, { fetcher }), onEvent(event) { if (event.type === 'chunk') controller.stop(); } });
  t.after(() => controller.dispose());
  controller.start(request);
  await aborted;
  assert.equal(controller.getSnapshot().state, 'stopped');
  assert.equal(controller.getSnapshot().output, '保留这一段');
});
