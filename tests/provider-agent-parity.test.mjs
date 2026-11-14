/* global Response, ReadableStream */
import test from 'node:test';
import assert from 'node:assert/strict';
import { streamAgentResponse, validateAgentRequest } from '../desktop/server/agent-stream.mjs';
import { createAgentPermissions } from '../desktop/design-previews/agent-permissions.js';
import { readAgentStream, streamChat } from '../desktop/design-previews/chat-transport.js';
import { createDesktopModelFetch } from '../desktop/design-previews/desktop-model-fetch.js';
import { createDesktopBridge } from '../desktop/server/desktop-bridge.mjs';
import { agentProviderFixtures } from './fixtures/provider-agent-streams.mjs';

const input = { kind: 'check', query: '' };
const output = { schemaVersion: 1, kind: 'check', runId: 'run-1', artifactId: 'artifact-1', title: '预检', summary: 'LOCAL_ONLY_SUMMARY', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
const body = model => ({ model, messages: [{ role: 'user', content: '检查当前项目' }], agent: { projectId: 'project-1', sessionId: 'session-1', allowRead: true, shareResults: false } });
function response(events, fragmented = false) {
  const bytes = Buffer.from(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')); let offset = 0;
  return new Response(fragmented ? new ReadableStream({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.subarray(offset, ++offset)); } }) : bytes, { headers: { 'content-type': 'text/event-stream' } });
}
async function run(providerId, options = {}, request = body(agentProviderFixtures[providerId].model)) {
  let stream = '';
  const sink = { destroyed: false, writeHead() {}, write(chunk) { stream += chunk; return true; }, end() {} };
  await streamAgentResponse(sink, 'fixture-secret', request, { providerId, requestId: 'request-1', projectToolRunner: async () => output, fetchImpl: async () => response(agentProviderFixtures[providerId].stream()), ...options });
  const events = stream.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]').map(line => JSON.parse(line.slice(6)));
  return { events, stream };
}

test('live permission is eligible for each reviewed provider and revoked on provider mismatch/switch', () => {
  const permissions = createAgentPermissions(); permissions.select({ id: 'session-1', projectId: 'project-1' });
  for (const providerId of ['openai', 'anthropic', 'google']) {
    permissions.setProvider(providerId); assert.equal(permissions.snapshot().allowRead, false);
    assert.equal(permissions.snapshot().eligible, true); permissions.update({ allowRead: true, shareResults: false });
    assert.equal(permissions.prepare({ providerId }).agent?.allowRead, true);
    assert.equal(permissions.prepare({ providerId: 'unreviewed' }).agent, undefined);
  }
  permissions.setProvider('custom'); permissions.update({ allowRead: true });
  assert.equal(permissions.snapshot().eligible, false);
});

test('Google SDK-internal continuation cannot exceed three upstream requests or start native work', async () => {
  let requests = 0, calls = 0;
  const result = await run('google', {
    fetchImpl: async () => response([{ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: '尚未结束' }] }, finishReason: 'CONTINUATION', continuationToken: `next-${++requests}` }] }]),
    projectToolRunner: async () => { calls++; return output; },
  });
  assert.equal(requests, 3); assert.equal(calls, 0);
  assert.ok(result.events.some(event => event.type === 'error'));
  assert.ok(!result.events.some(event => event.type === 'finish'));
});

for (const [providerId, fixture] of Object.entries(agentProviderFixtures)) {
  test(`${providerId}: official SDK wire protocol completes tool and text through the existing UI reader`, async () => {
    const requests = []; let calls = 0;
    const result = await run(providerId, { fetchImpl: async (url, init) => {
      requests.push(JSON.parse(init.body)); assert.equal(url, fixture.endpoint); assert.equal(init.redirect, 'error');
      return response(fixture.stream(requests.length === 1 ? { input } : {}), true);
    }, projectToolRunner: async args => { calls++; assert.equal(args.requestId, 'request-1'); assert.deepEqual(args.input, input); return output; } });
    assert.equal(calls, 1); assert.equal(requests.length, 2); assert.equal(result.events.at(-1).type, 'finish');
    assert.ok(!JSON.stringify(requests[1]).includes('LOCAL_ONLY_SUMMARY'));
    assert.ok(JSON.stringify(requests[1]).includes('未授权读取内容'));
    if (providerId === 'google') assert.ok(JSON.stringify(requests[1]).includes('c3ludGhldGljLXNpZ25hdHVyZQ=='), 'SDK preserves thought signature privately within the live tool loop');
    assert.ok(!result.stream.includes('c3ludGhldGljLXNpZ25hdHVyZQ=='), 'opaque thought metadata is not published into the transcript');
    const tools = [], text = [];
    await readAgentStream(new Response(result.stream).body, new AbortController().signal, delta => text.push(delta), event => tools.push(event));
    assert.match(text.join(''), /报告/); assert.deepEqual(tools.find(event => event.type === 'tool-output-available').output, output);
    if (providerId === 'anthropic') assert.equal(requests[0].tool_choice.disable_parallel_tool_use, true);
  });

  test(`${providerId}: explicit sharing sends only validated summary; tool failures stay actionable`, async () => {
    let requests = 0, last;
    const result = await run(providerId, { fetchImpl: async (_, init) => { last = JSON.parse(init.body); return response(fixture.stream(++requests === 1 ? { input } : {})); } }, { ...body(fixture.model), agent: { ...body(fixture.model).agent, shareResults: true } });
    assert.equal(result.events.at(-1).type, 'finish'); assert.ok(JSON.stringify(last).includes('LOCAL_ONLY_SUMMARY'));
    const failed = await run(providerId, { fetchImpl: async () => response(fixture.stream({ input })), projectToolRunner: async () => { throw Object.assign(new Error('PRIVATE_PATH'), { code: 'not_authorized' }); } });
    assert.match(failed.events.at(-1).errorText, /授权已失效/);
    assert.ok(!failed.stream.includes('PRIVATE_PATH')); assert.ok(!failed.events.some(event => event.type === 'finish'));
  });

  test(`${providerId}: missing terminal, truncation and invalid arguments never execute local work`, async () => {
    for (const events of [fixture.stream({ input }).slice(0, -1), fixture.stream({ input, reason: providerId === 'google' ? 'MAX_TOKENS' : 'max_tokens' }), fixture.stream({ input: { ...input, path: 'C:/private' } })]) {
      let calls = 0; const result = await run(providerId, { fetchImpl: async () => response(events), projectToolRunner: async () => { calls++; return output; } });
      assert.equal(calls, 0); assert.ok(result.events.some(event => event.type === 'error')); assert.ok(!result.events.some(event => event.type === 'finish'));
    }
  });

  test(`${providerId}: stop, timeout and tool budget use the same bounded runner`, async () => {
    for (const stop of [false, true]) {
      const controller = new AbortController(); let nativeSignal;
      const result = await run(providerId, { signal: controller.signal, timeoutMs: 50, fetchImpl: async () => response(fixture.stream({ input })), projectToolRunner: async ({ signal }) => { nativeSignal = signal; if (stop) controller.abort(); return new Promise(() => {}); } });
      assert.equal(nativeSignal?.aborted, true); assert.ok(!result.events.some(event => event.type === 'finish'));
    }
    let requests = 0, calls = 0;
    const exhausted = await run(providerId, { fetchImpl: async () => response(fixture.stream({ input, callId: `tool-${++requests}` })), projectToolRunner: async () => { calls++; return output; } });
    assert.equal(calls, 2); assert.equal(requests, 3); assert.ok(!exhausted.events.some(event => event.type === 'finish'));
  });

  test(`${providerId}: permission and provider errors fail without retry and permit a fresh request`, async () => {
    assert.throws(() => validateAgentRequest({ ...body(fixture.model), agent: { ...body(fixture.model).agent, allowRead: false } }, providerId));
    for (const [status, pattern] of [[403, /权限/], [429, /限额/]]) {
      let calls = 0; const result = await run(providerId, { fetchImpl: async () => { calls++; return new Response('SECRET_UPSTREAM', { status }); } });
      assert.equal(calls, 1); assert.match(result.events.at(-1).errorText, pattern); assert.ok(!result.stream.includes('SECRET_UPSTREAM'));
    }
    assert.equal((await run(providerId)).events.at(-1).type, 'finish');
  });

  test(`${providerId}: duplicate calls, parallel calls and invalid native output fail closed`, async () => {
    let calls = 0;
    const repeated = await run(providerId, { fetchImpl: async () => response(fixture.stream({ input })), projectToolRunner: async () => { calls++; return output; } });
    assert.equal(calls, 1); assert.ok(!repeated.events.some(event => event.type === 'finish'));
    calls = 0;
    const parallel = fixture.stream({ input });
    if (providerId === 'google') parallel[0].candidates[0].content.parts.push({ functionCall: { id: 'tool-2', name: 'project_read', args: input } });
    else parallel.splice(4, 0, ...fixture.stream({ input, callId: 'tool-2' }).slice(1, 4).map(event => ({ ...event, index: 1 })));
    const result = await run(providerId, { fetchImpl: async () => response(parallel), projectToolRunner: async () => { calls++; return output; } });
    assert.equal(calls, 0); assert.ok(!result.events.some(event => event.type === 'finish'));
    const invalid = await run(providerId, { fetchImpl: async () => response(fixture.stream({ input })), projectToolRunner: async () => ({ ...output, secret: 'INVALID_NATIVE_SECRET' }) });
    assert.ok(!invalid.stream.includes('INVALID_NATIVE_SECRET')); assert.ok(!invalid.events.some(event => event.type === 'finish'));
  });

  test(`${providerId}: private desktop bridge routes catalog, consent, tool execution and recovery`, async t => {
    const frames = [], channels = new Map(); let requests = 0, calls = 0, identity;
    const bridge = await createDesktopBridge({ emit: frame => { frames.push(frame); channels.get(frame.id)?.onmessage(frame); }, brokerOptions: {
      fetchImpl: async url => url === fixture.endpoint ? response(fixture.stream(++requests === 1 ? { input } : {})) : Response.json(fixture.catalog),
      projectToolRunner: async args => { calls++; identity = args.requestId; return output; },
    } });
    t.after(() => bridge.close());
    let sequence = 0;
    const request = async (path = '/api/model-connections', data, csrf) => {
      const id = `request-${++sequence}`;
      await bridge.request({ id, path, method: data ? 'POST' : 'GET', ...(data ? { body: JSON.stringify(data), headers: { 'content-type': 'application/json', 'x-shipmate-csrf': csrf } } : {}) });
      const own = frames.filter(frame => frame.id === id);
      return { id, status: own.find(frame => frame.type === 'headers')?.status, data: own.filter(frame => frame.type === 'chunk').map(frame => frame.data).join('') };
    };
    const csrf = JSON.parse((await request()).data).csrfToken;
    const connected = await request(`/api/model-connections/${providerId}/connect`, { apiKey: 'fixture-key' }, csrf);
    assert.equal(JSON.parse(connected.data).connections.find(item => item.providerId === providerId).status, 'connected');
    const denied = await request(`/api/model-connections/${providerId}/agent`, { ...body(fixture.model), agent: { ...body(fixture.model).agent, allowRead: false } }, csrf);
    assert.equal(denied.status, 400); assert.equal(requests, 0); assert.equal(calls, 0);
    const result = await request(`/api/model-connections/${providerId}/agent`, body(fixture.model), csrf);
    assert.equal(result.status, 200); assert.equal(calls, 1); assert.equal(identity, result.id);
    assert.match(result.data, /"type":"tool-output-available"/); assert.match(result.data, /"type":"finish"/);
    const fresh = await request(`/api/model-connections/${providerId}/agent`, body(fixture.model), csrf);
    assert.equal(fresh.status, 200); assert.match(fresh.data, /"type":"finish"/);
    const fetcher = createDesktopModelFetch({ makeId: () => `ui-${++sequence}`, createChannel: () => ({}), invoke: async (command, args) => {
      assert.equal(command, 'model_request');
      channels.set(args.request.id, args.onEvent);
      await bridge.request(args.request);
    } });
    t.after(() => fetcher.dispose());
    requests = 0;
    const deltas = [], tools = [];
    await streamChat({ providerId, ...body(fixture.model), onDelta: delta => deltas.push(delta), onToolEvent: event => tools.push(event) }, { fetcher });
    assert.match(deltas.join(''), /报告/); assert.equal(calls, 2);
    assert.ok(tools.some(event => event.type === 'tool-output-available'));
  });
}
