# P5：有界项目助手的技术核验

核验日期：2026-10-22。来源是官方文档、发布 registry 和固定版本源码；社区建议不作为 API 或权限事实。

## 采用与不采用

保留 Vanilla TypeScript / Vite / Tauri 2、现有 Web Awesome、Lucide 和会话控制器。仅桌面端加入 `ai@6.0.313` 与 `@ai-sdk/openai@3.0.131`；CLI 根生产依赖不增加。当前维护通道 `ai-v6` 可兼容现有 Node 20 声明与内置 Node 24。latest v7 要求 Node 22，故本轮不连带提高 CLI 的最低版本。

- [ai 6.0.313 发布元数据](https://registry.npmjs.org/ai/6.0.313)
- [OpenAI 3.0.131 发布元数据](https://registry.npmjs.org/@ai-sdk%2fopenai/3.0.131)
- [v6 固定源码与文档](https://github.com/vercel/ai/tree/f74810ab1402c5f58d215d6f39219cdc66664c41)
- [官方 UI 流协议](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)

SDK 接管 OpenAI Responses 解析、工具参数流、多步循环和 UI 事件；不接管本机权限与进程执行。现有普通聊天可继续使用；没有迁移整个前端，没有增加 React、工作流引擎或 Gateway 服务。ai 包自身带有 gateway/OIDC 传递依赖，实际调用显式 `createOpenAI().responses()`，不使用默认字符串 Gateway 路由。

## 从文档落到边界

| 核验结果 | 项目处理 |
|---|---|
| `jsonSchema` 不自动生成运行时校验器 | 输入配置显式 validate；输出 execute 返回前独立严格校验 |
| tool.outputSchema 不能代替输出验证 | Node、渲染和存档共用有界结果契约，Rust 仅投影允许字段 |
| 默认 maxRetries=2 | 设置 0，避免错误恢复时重复消费与执行 |
| stepCountIs 只约束步骤 | 另加工具次数、串行、去重和原生请求绑定 |
| tool-input-available 是参数就绪 | 显示准备执行；成果成功只由真实运行结果确认 |
| 默认 UI 流可能包含 reasoning | sendReasoning:false、sendSources:false，不展示隐藏推理 |
| AbortSignal 不会自动杀本地进程 | 私有 RPC 与原生 ToolRunner 联动取消，迟到帧失效 |
| SDK 不提供跨请求 exactly-once | requestId/toolCallId 绑定与原生重复检查；重启显示中断 |

源码依据：[schema.ts](https://github.com/vercel/ai/blob/f74810ab1402c5f58d215d6f39219cdc66664c41/packages/provider-utils/src/schema.ts)、[execute-tool-call.ts](https://github.com/vercel/ai/blob/f74810ab1402c5f58d215d6f39219cdc66664c41/packages/ai/src/generate-text/execute-tool-call.ts)、[run-tools-transformation.ts](https://github.com/vercel/ai/blob/f74810ab1402c5f58d215d6f39219cdc66664c41/packages/ai/src/generate-text/run-tools-transformation.ts)、[stream-text.ts](https://github.com/vercel/ai/blob/f74810ab1402c5f58d215d6f39219cdc66664c41/packages/ai/src/generate-text/stream-text.ts)。在线主文档当前为 v7，API 以已安装 v6 源码为准。

## 许可证与最小打包

AI SDK 系列为 **Apache-2.0**，不是 MIT。SDK 闭包共 12 个包：ai、@ai-sdk/openai/provider/provider-utils/gateway、@vercel/oidc、@opentelemetry/api、@standard-schema/spec、eventsource-parser、json-schema、undici、zod。准确版本见 desktop/package-lock.json。Zod 是必需 peer，由锁文件固定，未引入第二套 UI/Agent 框架。

桌面运行时采用显式文件清单，只复制必要 JS/CJS/MJS/JSON/WASM 和许可；不复制 SDK 文档、源码映射、开发测试或桌面 UI 依赖。`provider-utils` 发布包遗漏 LICENSE，使用相同仓库的 Apache LICENSE 补齐。运行时生成 DESKTOP-DEPENDENCIES.txt。移位到含中文空格目录、空 PATH 的启动测试验证依赖闭包。

## 项目差异化

把“项目事实”和“模型解释”分开：真实预检、上线清单和拒因证据写入本机成果区，带运行 ID、项目版本及事实版本。用户分别选择读取权限与摘要外发权限；关闭摘要外发时工具仍可在本机完成。模型不能选择项目路径、身份或执行命令。该能力服务于小程序上线工作流，而不是泛化的终端代理。

## 证据界限

确定性协议 fixture 只验证调用链和边界，不证明真实模型能稳定选对工具。真实 OpenAI 账户、权限、费用及重复模型评测仍需单独验收。Windows 原生 WebView2 与浏览器、debug 包与签名安装包分别记录；不会互相替代。
