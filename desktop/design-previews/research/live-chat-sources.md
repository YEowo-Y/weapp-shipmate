# 真实文本流：官方依据与取舍

核验日期：2026-10-17。先检查既有模型连接、全产品评审和技术路线；现有记录未覆盖生成流终态，随后查阅以下官方 HTTP 文档。没有使用真实账号、付费推理或新的产品截图；不将文档当成像素验收。

| 来源 | 直接依据 | 本轮采用 |
| --- | --- | --- |
| [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) | 自定义后端可用 SSE 和 `x-vercel-ai-ui-message-stream: v1`；文本 start/delta/end、finish、error、abort、[DONE] 有确定格式 | 采用一个文本块的正式协议子集，把三种上游转换到既有页面运行状态；不宣称实现完整 AI SDK，不再增加通用消息协议 |
| [OpenAI Streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)、[事件参考](https://developers.openai.com/api/reference/resources/responses/streaming-events) | Responses SSE 根据 type 区分正文增量、refusal、completed、failed、incomplete；text.done 不是整个响应的终态 | 固定 Responses endpoint、store:false、有限输出；reasoning item 可存在但不展示，工具输出不执行；截断不能当成功 |
| [OpenAI Cancel](https://developers.openai.com/api/reference/resources/responses/methods/cancel)、[Background](https://developers.openai.com/api/docs/guides/background) | cancel API 针对 background:true 响应 | 当前同步流仅取消 HTTP 与本地读取，不错误调用后台取消 API，不承诺停止后立刻停止远端计费 |
| [OpenRouter Streaming](https://openrouter.ai/docs/api_reference/streaming)、[Overview](https://openrouter.ai/docs/api_reference/overview) | Chat Completions SSE 包含 content、finish_reason、最终 usage 与 [DONE]；HTTP200 后仍可出现流内错误 | 不在第一次 finish_reason 时结束，不自动重试；length/filter/tool_calls/error 分离处理，仅读正文 |
| [Ollama Chat](https://docs.ollama.com/api/chat)、[Errors](https://docs.ollama.com/api/errors) | native chat 用 NDJSON，终帧可含正文，done:true 终结；错误可在流中出现 | 固定127.0.0.1:11434/api/chat，消费终帧正文，校验done_reason、大小、时间；不向任意地址发送 |
| [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) | 提供兼容 API，但不是完整 OpenAI API | 保留 native 一条路径，不在失败后自动换协议重复生成 |

工程取舍属于本仓判断：保持 Node fetch 与原生 ES Modules，复用已验证的 HttpOnly 会话/CSRF broker 和现有原生对话框、消息/Markdown/状态机，不为这一文本切片安装 React、另一套 Agent 框架或 SDK。代码未从上游复制，没有新增包需要许可准入。

首批三种协议是明确范围，不声称涵盖各厂商所有模型。Anthropic/Google 仅目录连接，自定义地址仍不允许；后续接入须单独核对协议、限制与测试。概率性回答质量、费用和本机 Ollama 版本不由假上游测试证明。
