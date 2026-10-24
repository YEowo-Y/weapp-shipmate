// Page-local, non-secret configuration drafts. This is not a provider runtime.
export const PROVIDERS = Object.freeze([
  { id: 'local-demo', name: '本地演示', endpoint: '', requiresKey: false, description: '固定示例，用于体验流式回复、工具结果和改动审阅。' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', requiresKey: true, description: '使用 OpenAI API 服务。API 接入与桌面产品订阅是独立的配置。' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com', requiresKey: true, description: '通过 Anthropic API 使用 Claude 模型。' },
  { id: 'google', name: 'Google', endpoint: 'https://generativelanguage.googleapis.com', requiresKey: true, description: '通过 Google 的模型 API 配置 Gemini。' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', requiresKey: true, description: '支持浏览器授权、一次性授权码和 API Key。使用你的 OpenRouter 额度；应用仅在本机内存保留连接凭据。' },
  { id: 'ollama', name: 'Ollama', endpoint: 'http://127.0.0.1:11434', requiresKey: false, description: '连接本机运行的 Ollama 服务，模型由本地运行环境管理。' },
  { id: 'custom', name: '自定义兼容服务', endpoint: '', requiresKey: true, description: '为兼容 OpenAI API 的服务填写完整基础地址与模型 ID。' },
].map(provider => Object.freeze(provider)));

export function validateEndpoint(value) {
  try {
    const text = String(value).trim();
    const url = new URL(text);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (text.length > 2048 || url.username || url.password || url.search || url.hash
      || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) throw new Error();
    return { ok: true, value: text };
  } catch {
    return { ok: false, message: '请输入 HTTPS 地址；本机服务允许 HTTP。地址中不能包含密钥、账号、查询参数或片段。' };
  }
}

export function validateModelId(value) {
  const id = String(value).trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(id)
    ? { ok: true, value: id } : { ok: false, message: '请输入服务商提供的模型 ID（1–200 个字母、数字或 . _ : / -）。' };
}

export function createSettingsDraft() {
  const drafts = new Map(PROVIDERS.map(p => [p.id, { endpoint: p.endpoint, models: [] }]));
  const editing = new Map(PROVIDERS.map(p => [p.id, { endpoint: p.endpoint, model: '' }]));
  function getDraft(id) {
    if (!drafts.has(id)) throw new Error('Unknown provider');
    return drafts.get(id);
  }
  return Object.freeze({
    getEditing(id) { getDraft(id); return { ...editing.get(id) }; },
    setEditing(id, field, value) {
      getDraft(id);
      if (!['endpoint', 'model'].includes(field) || id === 'local-demo') return;
      const text = String(value).slice(0, field === 'endpoint' ? 2048 : 200);
      // Never retain credentials, query tokens or fragments pasted into an address.
      editing.get(id)[field] = field === 'endpoint' && /[@?#]/.test(text) ? getDraft(id).endpoint : text;
    },
    get(id) { const draft = getDraft(id); return { endpoint: draft.endpoint, models: [...draft.models] }; },
    setEndpoint(id, value) {
      const draft = getDraft(id);
      if (id === 'local-demo') return { ok: false, message: '本地演示不使用服务地址。' };
      const result = validateEndpoint(value);
      if (result.ok) draft.endpoint = result.value;
      return result;
    },
    addModel(id, value) {
      const draft = getDraft(id);
      if (id === 'local-demo') return { ok: false, message: '本地演示不使用外部模型。' };
      const result = validateModelId(value);
      if (!result.ok) return result;
      if (draft.models.includes(result.value)) return { ok: false, message: '此模型已在当前列表中。' };
      if (draft.models.length >= 50) return { ok: false, message: '本页最多添加 50 个模型草稿。' };
      draft.models.push(result.value);
      return result;
    },
    removeModel(id, value) {
      const draft = getDraft(id);
      const index = draft.models.indexOf(value);
      if (index < 0) return false;
      draft.models.splice(index, 1);
      return true;
    },
  });
}
