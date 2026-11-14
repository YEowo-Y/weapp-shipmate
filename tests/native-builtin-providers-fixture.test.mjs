import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { builtinProviderFixtures, createBuiltinProviderFixture } from '../scripts/native-builtin-providers-acceptance.mjs';
import { streamChatResponse } from '../desktop/server/chat-stream.mjs';

for (const [provider, config] of Object.entries(builtinProviderFixtures)) {
  test(`${provider}: native protocol fixture parses public text and observes real HTTP cancellation`, async t => {
    const requests = [], fixture = createBuiltinProviderFixture(requests);
    const server = createServer(async (req, res) => { if (!await fixture.handle(req, res)) { res.writeHead(404); res.end(); } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const localFetch = (url, init) => fetch(origin + new URL(url).pathname, init);
    const key = `native-${provider}-fake-key`;
    const invalid = await fetch(origin + config.chat, { method: 'POST', headers: { Authorization: 'Bearer invalid' }, body: '{}' });
    assert.equal(invalid.status, 401); await invalid.text();
    assert.equal(requests.length, 0);
    if (config.catalog) {
      const response = await fetch(origin + config.catalog, { headers: { Authorization: `Bearer ${key}` } });
      assert.equal(response.status, 200); assert.equal((await response.json()).data[0].id, config.model);
    }
    fixture.next(provider, [{ text: '原生合成协议完成' }]);
    let output = '';
    const sink = { destroyed: false, writeHead() {}, write(chunk) { output += chunk; return true; }, end() {} };
    await streamChatResponse(sink, provider, key, { model: config.model, messages: [{ role: 'user', content: 'fixture' }] }, { fetchImpl: localFetch });
    assert.match(output, /原生合成协议完成/); assert.match(output, /"type":"finish"/);
    assert.doesNotMatch(output, /PRIVATE_SYNTHETIC_REASONING/); assert.equal(requests[0].completed, true);
    fixture.next(provider, [{ hold: true, text: '停止前的文本' }]);
    const controller = new AbortController();
    const response = await fetch(origin + config.chat, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: config.model, stream: true, thinking: { type: 'disabled' }, [provider === 'kimi' ? 'max_completion_tokens' : 'max_tokens']: 2048 }), signal: controller.signal });
    await response.body.getReader().read(); controller.abort();
    for (let i = 0; i < 100 && !requests.at(-1).aborted; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests.at(-1).aborted, true); assert.deepEqual(fixture.failures, []);
  });
}
