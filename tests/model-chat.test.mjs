/* global Response, ReadableStream */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setImmediate } from 'node:timers';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';
import { validateChatRequest } from '../desktop/server/chat-stream.mjs';

const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const body = { model: 'test-model', messages: [{ role: 'user', content: '你好' }] };
async function harness(t, options = {}) {
  const handler = createModelConnectionHandler(options);
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(`${origin}/api/model-connections`);
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const { csrfToken } = await initial.json();
  const headers = { cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Shipmate-CSRF': csrfToken };
  return { handler, post: (path, value = {}, extra = {}) => fetch(`${origin}/api/model-connections/${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(value) }) };
}
const sse = events => events.map(value => `data: ${JSON.stringify(value)}\n\n`).join('');
const completed = sse([{ type: 'response.output_text.delta', delta: '你好' }, { type: 'response.completed', response: { status: 'completed', output: [] } }]);

test('connected OpenAI streams official UI text events over real HTTP', async t => {
  let inference;
  const app = await harness(t, { fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return json({ data: [{ id: 'test-model', name: 'Test' }] });
    inference = { url, options }; return new Response(completed, { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  await app.post('openai/connect', { apiKey: 'secret' });
  const result = await app.post('openai/chat', body);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-vercel-ai-ui-message-stream'), 'v1');
  const output = await result.text();
  assert.match(output, /"type":"text-delta".*"delta":"你好"/);
  assert.match(output, /"type":"finish"/); assert.match(output, /data: \[DONE\]/);
  assert.equal(inference.url, 'https://api.openai.com/v1/responses');
  assert.equal(inference.options.redirect, 'error');
  assert.equal(inference.options.headers.Authorization, 'Bearer secret');
  assert.equal(JSON.parse(inference.options.body).max_output_tokens, 2048);
  assert.ok(!output.includes('secret'));
});

test('preview rejects agent capability before model inference even with a forged private header', async t => {
  let calls = 0;
  const app = await harness(t, { fetchImpl: async () => { calls++; return json({ data: [{ id: 'test-model' }] }); } });
  await app.post('openai/connect', { apiKey: 'secret' });
  const value = { ...body, agent: { projectId: 'p1', sessionId: 's1', allowRead: true, shareResults: false } };
  assert.equal((await app.post('openai/agent', value, { 'x-shipmate-request-id': 'forged' })).status, 409);
  assert.equal((await app.post('anthropic/agent', value)).status, 409);
  assert.equal((await app.post('google/agent', { ...value, model: 'models/test-model' })).status, 409);
  assert.equal((await app.post('custom/agent', value)).status, 400);
  assert.equal((await app.post('openai/agent', { ...value, agent: { ...value.agent, allowRead: false } })).status, 400);
  assert.equal(calls, 1);
});

function fragmented(text, media = 'text/event-stream') {
  const bytes = Buffer.from(text); let offset = 0;
  return new Response(new ReadableStream({ pull(controller) { if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.subarray(offset, ++offset)); } }), { headers: { 'Content-Type': media } });
}
async function connected(t, provider, upstream, options = {}) {
  const app = await harness(t, { ...options, fetchImpl: async (url, init) => {
    if (url.endsWith('/key')) return json({ data: { label: 'test' } });
    if (url.includes('api.anthropic.com/v1/models?')) return json({ data: [{ id: 'test-model' }], has_more: false });
    if (url.includes('googleapis.com/v1beta/models?')) return json({ models: [{ name: 'models/test-model', supportedGenerationMethods: ['generateContent'] }] });
    if (url.endsWith('/models')) return json({ data: [{ id: 'test-model', name: 'Test' }] });
    if (url.endsWith('/tags')) return json({ models: [{ name: 'test-model' }] });
    return upstream(url, init);
  } });
  await app.post(`${provider}/connect`, provider === 'ollama' ? {} : { apiKey: 'secret' });
  return app;
}
for (const provider of ['openai', 'openrouter', 'ollama']) {
  test(`${provider} handles byte-fragmented Unicode and documented completion`, async t => {
    const content = provider === 'openai' ? completed : provider === 'openrouter'
      ? ': keepalive\r\n\r\n' + sse([{ choices: [{ delta: { content: '你好' }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, { choices: [], usage: { total_tokens: 4 } }]) + 'data: [DONE]\n\n'
      : JSON.stringify({ message: { content: '你' }, done: false }) + '\n' + JSON.stringify({ message: { content: '好' }, done: true, done_reason: 'stop' });
    let payload;
    const app = await connected(t, provider, async (_, init) => { payload = JSON.parse(init.body); return fragmented(content, provider === 'ollama' ? 'application/x-ndjson' : 'text/event-stream'); });
    const result = await (await app.post(`${provider}/chat`, body)).text();
    assert.match(result, /"type":"finish"/); assert.doesNotMatch(result, /"type":"error"/);
    const deltas = result.split('\n').filter(line => line.includes('"type":"text-delta"')).map(line => JSON.parse(line.slice(6)).delta).join('');
    assert.equal(deltas, '你好'); assert.equal(payload.stream, true);
    if (provider === 'ollama') assert.equal(payload.options.num_predict, 2048);
    if (provider === 'openrouter') assert.equal(payload.max_tokens, 2048);
  });
}

test('permissions, exact schema, model membership and unsupported providers reject before inference', async t => {
  let calls = 0;
  const app = await connected(t, 'openai', async () => { calls++; return fragmented(completed); });
  for (const value of [{ ...body, endpoint: 'https://evil.example' }, { ...body, model: 'unknown' }, { ...body, messages: [{ role: 'system', content: 'x' }] }, { ...body, messages: [{ role: 'user', content: 'x', extra: true }] }, { ...body, messages: [] }]) {
    assert.equal((await app.post('openai/chat', value)).status, 400);
  }
  assert.equal((await app.post('openai/chat', body, { 'X-Shipmate-CSRF': '' })).status, 403);
  assert.equal((await app.post('openai/chat', body, { cookie: '' })).status, 401);
  assert.equal((await app.post('openai/chat', body, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await app.post('anthropic/chat', body)).status, 409);
  assert.equal((await app.post('ollama/chat', body)).status, 409);
  assert.equal(calls, 0);
});

test('chat accepts more than legacy 16KiB but rejects beyond 64KiB', async t => {
  const app = await connected(t, 'openai', async () => fragmented(completed));
  assert.match(await (await app.post('openai/chat', { ...body, messages: [{ role: 'user', content: 'x'.repeat(20000) }] })).text(), /"type":"finish"/);
  assert.equal((await app.post('openai/chat', { ...body, messages: [{ role: 'user', content: 'x'.repeat(70000) }] })).status, 413);
});

for (const [label, provider, content] of [
  ['truncated', 'openai', sse([{ type: 'response.output_text.delta', delta: 'partial' }])],
  ['empty', 'openai', sse([{ type: 'response.completed', response: { status: 'completed', output: [] } }])],
  ['tools', 'openai', sse([{ type: 'response.output_item.added', item: { type: 'function_call' } }])],
  ['incomplete', 'openai', sse([{ type: 'response.incomplete', response: { error: 'secret' } }])],
  ['length', 'openrouter', sse([{ choices: [{ delta: { content: 'partial' }, finish_reason: 'length' }] }]) + 'data: [DONE]\n\n'],
  ['missing stop', 'openrouter', 'data: [DONE]\n\n'],
  ['tool calls', 'openrouter', sse([{ choices: [{ delta: { tool_calls: [{}] } }] }])],
  ['provider error', 'ollama', '{"error":"secret"}\n'],
  ['token limit', 'ollama', '{"message":{"content":"partial"},"done":true,"done_reason":"length"}\n'],
  ['malformed', 'openai', 'data: nope\n\n'],
]) {
  test(`${provider} ${label} never finishes successfully or exposes upstream errors`, async t => {
    const app = await connected(t, provider, async () => fragmented(content, provider === 'ollama' ? 'application/x-ndjson' : 'text/event-stream'));
    const text = await (await app.post(`${provider}/chat`, body)).text();
    assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /"type":"finish"|secret/);
  });
}

test('HTTP failures and response size bounds are safe errors without retry', async t => {
  let calls = 0;
  const responses = [new Response('secret', { status: 401 }), new Response('x', { headers: { 'Content-Type': 'text/event-stream', 'Content-Length': '2097153' } }), new Response('x'.repeat(2097153), { headers: { 'Content-Type': 'text/event-stream' } }), new Response(sse([{ type: 'response.output_text.delta', delta: 'x'.repeat(262145) }]), { headers: { 'Content-Type': 'text/event-stream' } })];
  const app = await connected(t, 'openai', async () => responses[calls++]);
  for (let index = 0; index < responses.length; index++) {
    const text = await (await app.post('openai/chat', body)).text();
    assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /"type":"finish"|secret/);
  }
  assert.equal(calls, 4);
});

function hanging() {
  let signal; let cancelled = false;
  return { get signal() { return signal; }, get cancelled() { return cancelled; }, upstream: async (_, init) => {
    signal = init.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(sse([{ type: 'response.output_text.delta', delta: 'partial' }]))); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
  } };
}
async function firstDelta(response) {
  const reader = response.body.getReader(); let text = '';
  while (!text.includes('text-delta')) { const part = await reader.read(); assert.equal(part.done, false); text += Buffer.from(part.value).toString(); }
  return reader;
}
test('one run per session blocks duplicates and credential mutation; disconnect aborts upstream', async t => {
  const upstream = hanging();
  const app = await connected(t, 'openai', upstream.upstream);
  const response = await app.post('openai/chat', body); const reader = await firstDelta(response);
  for (const [path, data] of [['openai/chat', body], ['openai/refresh', {}], ['openai/connect', { apiKey: 'replacement' }], ['openrouter/oauth/start', {}]]) assert.equal((await app.post(path, data)).status, 409);
  assert.equal((await app.post('openai/disconnect')).status, 200);
  let rest = ''; while (true) { const chunk = await reader.read(); if (chunk.done) break; rest += Buffer.from(chunk.value).toString(); }
  assert.equal(upstream.signal.aborted, true); assert.equal(upstream.cancelled, true);
  assert.match(rest, /"type":"error"/); assert.doesNotMatch(rest, /"type":"finish"/);
});

test('browser response cancellation aborts the provider reader', async t => {
  const upstream = hanging(); const app = await connected(t, 'openai', upstream.upstream);
  const reader = await firstDelta(await app.post('openai/chat', body)); await reader.cancel();
  for (let i = 0; i < 50 && !upstream.signal.aborted; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(upstream.signal.aborted, true); assert.equal(upstream.cancelled, true);
});

test('timeout ends stalled reads and releases the session slot', async t => {
  const upstream = hanging(); const app = await connected(t, 'openai', upstream.upstream, { chatTimeoutMs: 30 });
  const text = await (await app.post('openai/chat', body)).text();
  assert.match(text, /回复超时/); assert.doesNotMatch(text, /"type":"finish"/);
  assert.equal(upstream.signal.aborted, true);
  assert.equal((await app.post('openai/refresh')).status, 200);
});

test('dispose and session expiry abort active runs', async t => {
  for (const mode of ['dispose', 'expire']) {
    let now = 1000; const upstream = hanging(); const app = await connected(t, 'openai', upstream.upstream, { now: () => now });
    const reader = await firstDelta(await app.post('openai/chat', body));
    if (mode === 'dispose') app.handler.dispose();
    else { now += 3600001; assert.equal((await app.post('openai/refresh')).status, 401); }
    while (!(await reader.read()).done) { /* drain cancellation */ }
    assert.equal(upstream.signal.aborted, true); assert.equal(upstream.cancelled, true);
  }
});

test('OpenAI reasoning items stay private while text completes normally', async t => {
  const app = await connected(t, 'openai', async () => fragmented(sse([
    { type: 'response.output_item.added', item: { type: 'reasoning', summary: [] } },
    { type: 'response.reasoning_text.delta', delta: 'private reasoning' },
    { type: 'response.output_text.delta', delta: 'answer' },
    { type: 'response.completed', response: { status: 'completed', output: [{ type: 'reasoning' }, { type: 'message' }] } },
  ])));
  const text = await (await app.post('openai/chat', body)).text();
  assert.match(text, /"type":"finish"/); assert.doesNotMatch(text, /private reasoning/);
});

test('authentication, rate limits and truncation have actionable safe messages', async t => {
  for (const [response, expected] of [[new Response('secret', { status: 401 }), /授权失效/], [new Response('secret', { status: 429 }), /频率或额度/], [fragmented(sse([{ type: 'response.incomplete' }])), /截断/]]) {
    const app = await connected(t, 'openai', async () => response);
    const text = await (await app.post('openai/chat', body)).text();
    assert.match(text, expected); assert.doesNotMatch(text, /secret|"type":"finish"/);
  }
});

test('timeout before fetch headers cancels a late response body', async t => {
  let resolveFetch, signal, cancelled = false;
  const app = await connected(t, 'openai', async (_, init) => { signal = init.signal; return new Promise(resolve => { resolveFetch = resolve; }); }, { chatTimeoutMs: 20 });
  const text = await (await app.post('openai/chat', body)).text();
  assert.match(text, /回复超时/); assert.equal(signal.aborted, true);
  resolveFetch(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('whitespace-only text and excessive upstream nesting cannot become successful replies', async t => {
  let nested = 'x'; for (let index = 0; index < 18; index++) nested = { nested };
  const replies = [sse([{ type: 'response.output_text.delta', delta: '  \n' }, { type: 'response.completed', response: { status: 'completed', output: [] } }]), sse([{ type: 'response.output_text.delta', delta: 'hello', nested }])];
  const app = await connected(t, 'openai', async () => fragmented(replies.shift()));
  for (let index = 0; index < 2; index++) {
    const text = await (await app.post('openai/chat', body)).text();
    assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /"type":"finish"/);
  }
});

test('OAuth waiting prevents inference until the credential-changing flow is resolved', async t => {
  let calls = 0;
  const app = await connected(t, 'openrouter', async () => { calls++; return fragmented('data: [DONE]\n\n'); });
  assert.equal((await app.post('openrouter/oauth/start')).status, 200);
  assert.equal((await app.post('openrouter/chat', body)).status, 409);
  assert.equal(calls, 0);
});

const anthropicEvents = (reason = 'end_turn') => [
  { type: 'message_start', message: { role: 'assistant', content: [], stop_reason: null } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你好' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: reason } },
  { type: 'message_stop' },
];
const googleEvents = (reason = 'STOP') => [{ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: '你好' }] } }] }, { candidates: [{ index: 0, finishReason: reason }] }];
const providerBody = provider => ({ ...body, model: provider === 'google' ? 'models/test-model' : body.model });
for (const provider of ['anthropic', 'google']) {
  test(`${provider} uses documented auth, payload and fragmented text stream`, async t => {
    let inference;
    const app = await connected(t, provider, async (url, init) => { inference = { url, init }; return fragmented(sse(provider === 'anthropic' ? anthropicEvents() : googleEvents())); });
    const request = { ...providerBody(provider), messages: [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'two' }, { role: 'user', content: 'three' }] };
    const output = await (await app.post(`${provider}/chat`, request)).text();
    assert.match(output, /"type":"finish"/); assert.match(output, /你好/); assert.doesNotMatch(output, /secret|"type":"error"/);
    assert.equal(inference.init.headers.Authorization, undefined);
    const payload = JSON.parse(inference.init.body);
    if (provider === 'anthropic') {
      assert.equal(inference.url, 'https://api.anthropic.com/v1/messages');
      assert.equal(inference.init.headers['x-api-key'], 'secret'); assert.equal(inference.init.headers['anthropic-version'], '2023-06-01');
      assert.equal(payload.max_tokens, 2048); assert.equal(payload.stream, true); assert.deepEqual(payload.messages, request.messages);
    } else {
      assert.equal(inference.url, 'https://generativelanguage.googleapis.com/v1beta/models/test-model:streamGenerateContent?alt=sse');
      assert.equal(inference.init.headers['x-goog-api-key'], 'secret');
      assert.equal(payload.generationConfig.maxOutputTokens, 2048);
      assert.deepEqual(payload.contents, request.messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })));
    }
  });
  test(`${provider} incomplete, blocked, tool and empty replies never finish`, async t => {
    const cases = provider === 'anthropic' ? [
      ...['max_tokens', 'model_context_window_exceeded', 'tool_use', 'refusal', 'pause_turn', null].map(anthropicEvents),
      anthropicEvents().slice(0, -1), anthropicEvents().slice(1),
      anthropicEvents().filter(value => value.type !== 'content_block_stop'),
      anthropicEvents().map(value => value.type === 'content_block_start' ? { ...value, content_block: { type: 'tool_use' } } : value),
      anthropicEvents().map(value => value.type === 'content_block_delta' ? { ...value, index: 4 } : value),
      anthropicEvents().map(value => value.type === 'content_block_delta' ? { ...value, delta: { type: 'text_delta', text: '  ' } } : value),
      [{ type: 'error', error: { message: 'secret' } }],
    ] : [
      ...['MAX_TOKENS', 'SAFETY', 'CONTINUATION', 'RECITATION', 'OTHER'].map(googleEvents),
      googleEvents().slice(0, -1), [{ promptFeedback: { blockReason: 'SAFETY' } }],
      [{ candidates: [{ content: { parts: [{ functionCall: { name: 'secret' } }] }, finishReason: 'STOP' }] }],
      [{ candidates: [{ content: { parts: [{ inlineData: { data: 'secret' } }] }, finishReason: 'STOP' }] }],
      [{ candidates: [{ content: { parts: [{ executableCode: { code: 'secret' } }] }, finishReason: 'STOP' }] }],
      [{ candidates: [{ content: { parts: [{ text: 'secret', thought: true }] }, finishReason: 'STOP' }] }],
      [{ candidates: [{ index: 0 }, { index: 1 }] }],
      [{ candidates: [{ finishReason: 'STOP' }] }],
    ];
    const app = await connected(t, provider, async () => fragmented(sse(cases.shift())));
    while (cases.length) {
      const output = await (await app.post(`${provider}/chat`, providerBody(provider))).text();
      assert.match(output, /"type":"error"/); assert.doesNotMatch(output, /"type":"finish"|secret/);
    }
  });
  test(`${provider} thinking remains private and retry recovers after failure`, async t => {
    const privateEvents = provider === 'anthropic' ? [
      anthropicEvents()[0],
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'private-secret' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'private-secret' } },
      { type: 'content_block_stop', index: 0 },
      ...anthropicEvents().slice(1).map(event => event.index === undefined ? event : { ...event, index: 1 }),
    ] : [{ candidates: [{ content: { parts: [{ text: 'private-secret', thought: true }] } }] }, ...googleEvents()];
    let calls = 0;
    const app = await connected(t, provider, async () => ++calls === 1 ? new Response('private-secret', { status: 429 }) : fragmented(sse(privateEvents)));
    const failed = await (await app.post(`${provider}/chat`, providerBody(provider))).text();
    assert.match(failed, /频率或额度/); assert.doesNotMatch(failed, /private-secret|"type":"finish"/);
    const recovered = await (await app.post(`${provider}/chat`, providerBody(provider))).text();
    assert.match(recovered, /"type":"finish"/); assert.doesNotMatch(recovered, /private-secret/); assert.equal(calls, 2);
  });
  test(`${provider} cancellation and timeout abort upstream without success`, async t => {
    for (const mode of ['cancel', 'timeout']) {
      let signal, cancelled = false;
      const app = await connected(t, provider, async (_, init) => {
        signal = init.signal;
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(sse(provider === 'anthropic' ? anthropicEvents().slice(0, 3) : googleEvents().slice(0, 1)))); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }, mode === 'timeout' ? { chatTimeoutMs: 40 } : {});
      const response = await app.post(`${provider}/chat`, providerBody(provider));
      if (mode === 'cancel') {
        const reader = await firstDelta(response); await reader.cancel();
        for (let index = 0; index < 50 && !signal.aborted; index++) await new Promise(resolve => setTimeout(resolve, 5));
      } else {
        const output = await response.text(); assert.match(output, /回复超时/); assert.doesNotMatch(output, /"type":"finish"/);
      }
      assert.equal(signal.aborted, true); assert.equal(cancelled, true);
    }
  });
}

test('Google chat validation rejects resource path and query injection before network access', () => {
  for (const model of ['models/../x', 'models/x?alt=json', 'models/x:generateContent', 'models/x/y', 'models/x%2fy', 'models/.', 'test-model']) {
    assert.throws(() => validateChatRequest('google', { ...body, model }), { code: 'invalid_chat' });
  }
  assert.doesNotThrow(() => validateChatRequest('google', { ...body, model: 'models/gemini-2.5-flash' }));
});

test('Anthropic initial text and future metadata events preserve public text and terminal validation', async t => {
  const events = anthropicEvents('stop_sequence').filter(value => value.type !== 'content_block_delta');
  events[1].content_block.text = 'initial answer';
  events.splice(2, 0, { type: 'ping' }, { type: 'future_metadata', data: 'private-secret' });
  const app = await connected(t, 'anthropic', async () => fragmented(sse(events)));
  const output = await (await app.post('anthropic/chat', body)).text();
  assert.match(output, /initial answer/); assert.match(output, /"type":"finish"/); assert.doesNotMatch(output, /private-secret/);
});

test('Google preserves public text in truncation and continuation frames but rejects blocked text', async t => {
  for (const reason of ['MAX_TOKENS', 'CONTINUATION', 'SAFETY', 'UNKNOWN_REASON']) {
    const app = await connected(t, 'google', async () => fragmented(sse([{ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: 'private-secret', thought: true }, { text: 'last partial answer' }] }, finishReason: reason }] }])));
    const output = await (await app.post('google/chat', providerBody('google'))).text();
    assert.match(output, /"type":"error"/); assert.doesNotMatch(output, /"type":"finish"|private-secret/);
    if (['MAX_TOKENS', 'CONTINUATION'].includes(reason)) {
      assert.match(output, /last partial answer/);
      assert.ok(output.indexOf('text-delta') < output.indexOf('"type":"error"'));
      assert.match(output, reason === 'MAX_TOKENS' ? /截断/ : /尚未完成/);
    } else assert.doesNotMatch(output, /last partial answer/);
  }
});
