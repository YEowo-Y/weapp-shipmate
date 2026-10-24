# Anthropic / Google 接入依据

2026-10-17 查阅官方文档；范围为现有 REST 文本聊天适配，不引入 SDK 或迁移执行框架。

| 来源 | 本轮采用 |
| --- | --- |
| [Claude API overview](https://platform.claude.com/docs/en/api/overview) | 固定服务地址；现有 `x-api-key` 仍受支持，配合 `anthropic-version: 2023-06-01`。当前页面优先推荐 Bearer；多 workspace key 需额外 workspace header，当前设置未提供此项。 |
| [Messages REST](https://platform.claude.com/docs/en/api/http/messages/create) | `model`、`messages`、`max_tokens`、`stream`；只传 user/assistant 文本，不新增 system 或工具能力。 |
| [Claude streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) | message/content block 生命周期，公开 text delta，ping，HTTP 200 后 error；thinking/signature 不作正文。 |
| [Claude stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons) | 正常结束与 max_tokens、model_context_window_exceeded、refusal、tool_use、pause_turn 分开。 |
| [Claude errors](https://platform.claude.com/docs/en/api/errors) | HTTP 和流内失败都需要错误处理，成功建连不等于成功回复。 |
| [Gemini Generate Content 文本指南](https://ai.google.dev/gemini-api/docs/generate-content/text-generation) | `streamGenerateContent?alt=sse`，`x-goog-api-key`；contents 中 assistant 映射 model，parts 使用 text。该指南当前标注 Legacy，沿用现有需求的稳定 REST 调用，不宣称采用新的 Interactions API。 |
| [Generate Content REST](https://ai.google.dev/api/generate-content) | candidates/content/parts、thought、finishReason、promptFeedback；仅 STOP 为普通完成，MAX_TOKENS/CONTINUATION/安全限制不能伪装成功。 |
| [Gemini Models](https://ai.google.dev/api/models) | `models/{model}` 资源名、分页、`supportedGenerationMethods` 包含 generateContent 才进入可选目录。此方法能力不保证每个模型适合纯文本输出。 |
| [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting) | 权限、参数、配额及服务异常需要可理解的恢复入口。 |
| [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) | 凭据保留在服务端；不会拼入 URL、消息或浏览器存储。 |

工程判断：复用现有 fetch、取消控制器、限额和 UI Message Stream 文本子集，比为两个 REST 端点增加第二套运行时更符合当前仓库。隔离夹具用于协议和浏览器路径验证，不作为真实厂商联网/收费推理证据。
