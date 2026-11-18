import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createProviderAgentFixture } from '../scripts/native-provider-agent-acceptance.mjs';
import { agentProviderFixtures } from './fixtures/provider-agent-streams.mjs';
import { streamAgentResponse } from '../desktop/server/agent-stream.mjs';
import { pinProviderEndpoints } from './helpers/provider-env.mjs';

// Must run before the first client factory call in this file.
pinProviderEndpoints();

for (const [providerId, protocol] of Object.entries(agentProviderFixtures)) {
  test(`${providerId}: native acceptance fixture exercises pinned SDK, private result and stop`, async t => {
    const requests = [], fixture = createProviderAgentFixture(requests), failures = [];
    const server = createServer(async (req, res) => {
      try { if (!await fixture.handle(req, res)) { res.writeHead(404); res.end(); } }
      catch (error) { failures.push(error); res.writeHead(500); res.end(); }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const localFetch = (url, init) => { const parsed = new URL(url); return fetch(origin + parsed.pathname + parsed.search, init); };
    fixture.next(providerId, [{ kind: 'check' }, { text: 'NATIVE_FIXTURE_COMPLETE' }]);
    let output = '', runs = 0;
    const sink = { destroyed: false, writeHead() {}, write(chunk) { output += chunk; }, end() {} };
    const body = { model: protocol.model, messages: [{ role: 'user', content: '检查项目' }], agent: { projectId: 'p', sessionId: 's', allowRead: true, shareResults: false } };
    await streamAgentResponse(sink, `native-${providerId}-fake-key`, body, {
      providerId, requestId: 'r', fetchImpl: localFetch, projectToolRunner: async () => {
        runs++;
        return { schemaVersion: 1, kind: 'check', runId: 'r', artifactId: 'a', title: '预检', summary: 'PRIVATE_SUMMARY', itemCount: 0, items: [], truncated: false, scopeComplete: true, projectRevision: 1, contextRevision: 1 };
      },
    });
    assert.equal(runs, 1); assert.equal(requests.length, 2); assert.match(output, /NATIVE_FIXTURE_COMPLETE/);
    assert.match(JSON.stringify(requests[1]), /未授权读取内容/); assert.doesNotMatch(JSON.stringify(requests[1]), /PRIVATE_SUMMARY/);
    assert.doesNotMatch(output, /thoughtSignature|c3ludGhldGljLXNpZ25hdHVyZQ==/);
    fixture.next(providerId, [{ hold: true, text: 'HOLD' }]);
    const controller = new AbortController();
    const response = await localFetch(protocol.endpoint, { method: 'POST', headers: { [providerId === 'anthropic' ? 'x-api-key' : 'x-goog-api-key']: `native-${providerId}-fake-key` }, body: '{}', signal: controller.signal });
    await response.body.getReader().read(); controller.abort();
    for (let i = 0; i < 100 && !requests.at(-1).aborted; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests.at(-1).aborted, true); assert.deepEqual(failures, []);
  });
}
