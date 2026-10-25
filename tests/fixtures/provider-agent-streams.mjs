// Protocol fixture dataset v1 (2026-10-25); never responses from a live account.
export const agentProviderFixtures = {
  anthropic: {
    model: 'claude-test', endpoint: 'https://api.anthropic.com/v1/messages',
    catalog: { data: [{ id: 'claude-test', display_name: 'Claude fixture', type: 'model' }], has_more: false },
    stream({ input, callId = 'tool-1', text = '本机报告已生成。', reason } = {}) {
      return [
        { type: 'message_start', message: { id: 'msg-1', type: 'message', role: 'assistant', model: 'claude-test', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: input ? { type: 'tool_use', id: callId, name: 'project_read', input: {} } : { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: input ? { type: 'input_json_delta', partial_json: JSON.stringify(input) } : { type: 'text_delta', text } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: reason || (input ? 'tool_use' : 'end_turn'), stop_sequence: null }, usage: { output_tokens: 10 } },
        { type: 'message_stop' },
      ];
    },
  },
  google: {
    model: 'models/gemini-test', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
    catalog: { models: [{ name: 'models/gemini-test', displayName: 'Gemini fixture', supportedGenerationMethods: ['generateContent'] }] },
    stream({ input, callId = 'tool-1', text = '本机报告已生成。', reason } = {}) {
      return [
        { candidates: [{ index: 0, content: { role: 'model', parts: [input ? { functionCall: { id: callId, name: 'project_read', args: input }, thoughtSignature: 'c3ludGhldGljLXNpZ25hdHVyZQ==' } : { text }] } }] },
        { candidates: [{ index: 0, finishReason: reason || 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } },
      ];
    },
  },
};
