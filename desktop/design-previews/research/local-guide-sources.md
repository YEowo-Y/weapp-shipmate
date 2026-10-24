# 本机工具的官方参考

调研日期：2026-10-17。本轮只读查阅官方文档和固定上游源码，没有安装新库或复制实现。没有进行本地浏览器截图或真实模型调用。

| 来源 | 核实的行为 | 本项目落点 |
| --- | --- | --- |
| [AI SDK UI Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) | SSE、v1 header、start、tool-input-available、tool-output-available、finish 与 DONE | 复用现有流分帧；工具完整参数一次发送，输入/结果通过 toolCallId 关联 |
| [vercel/ai 固定 SHA 的 UIMessageChunk 定义](https://github.com/vercel/ai/blob/fce9210c6405c0ad8452fee3f50717e8ea910b97/packages/ai/src/ui-message-stream/ui-message-chunks.ts) | tool-output-error 的 toolCallId/errorText、finishReason:error；补充协议介绍页未列出的类型 | 错误终态独立，不把规则提示视作执行失败 |
| [AI Elements Tool](https://elements.ai-sdk.dev/components/tool) | 工具参数、运行状态、输出折叠展示；UI 输出接口本身不提供业务数据安全保证 | 继续复用现有原生 details 和固定业务结果组件，双边校验后安全 DOM 渲染 |

协议 v1 和 SDK 包大版本是不同概念。本项目只实现有界文本/工具子集，没有安装完整 SDK，也不宣称通用兼容所有事件。

本轮完全没有 LLM 调用，因此不发送代表模型步骤的 start-step/finish-step，不伪造参数流或隐藏思考。用户表单直接触发固定只读工具。上述属于本项目基于官方协议作出的实现选择，不是已具备模型自动工具循环的证明。

业务事实源为 `src/guide.mjs`、`src/data.mjs`、`flow.yaml` 和默认排除 draft 的规则目录。`payment` 与 `business_type` 目前不影响阶段选择，故本轮表单不收集这两个无实际效果的字段。保留 MCP 的现有合同与工具名；新 HTTP 入口采用更严格的必填三项子集。

官方来源链接来自仓库规则，日期是原记录日期；本轮没有重新核验所有微信/工信部政策，不把清单当实时法规查询。
