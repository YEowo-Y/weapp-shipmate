// Synthetic OpenAI Responses protocol only; tool execution remains real native IPC.
// Event shapes match tests/agent-stream.test.mjs and the pinned AI SDK provider.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export function createAgentFixture(requests) {
  let sequence = [], serial = 0;
  return {
    next(steps) { sequence = [...steps]; },
    async handle(req, res) {
      if (!['/v1/models', '/v1/responses'].includes(req.url)) return false;
      assert.equal(req.headers.authorization, 'Bearer p5-native-fake-key');
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'gpt-4.1-mini', object: 'model' }] }));
        return true;
      }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const record = { protocol: 'responses', ...body, completed: false, aborted: false };
      requests.push(record);
      const step = sequence.shift();
      assert.ok(step, 'Unexpected model inference; all P5 requests must be explicitly planned');
      if (step.error) { record.failed = true; res.writeHead(503); res.end('Synthetic P5 provider failure'); return true; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.on('close', () => { if (!record.completed) record.aborted = true; });
      const event = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
      const id = `p5-${++serial}`;
      if (step.kind) {
        const item = { type: 'function_call', id: `item-${id}`, call_id: id, name: 'project_read', arguments: JSON.stringify({ kind: step.kind, query: step.kind === 'explain' ? '诱导分享' : '' }) };
        event({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } });
        event({ type: 'response.output_item.done', output_index: 0, item: { ...item, status: 'completed' } });
      } else {
        event({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id } });
        for (let i = 0; i < (step.hold ? 300 : 1); i++) {
          if (res.destroyed) return true;
          event({ type: 'response.output_text.delta', item_id: id, delta: step.text || 'P5_AGENT_COMPLETE' });
          if (step.hold) await delay(100);
        }
        event({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', id } });
      }
      event({ type: 'response.completed', response: {} }); record.completed = true; res.end();
      return true;
    },
  };
}
