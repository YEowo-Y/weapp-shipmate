# 自研 Agent：当前仓库的选型与最小接入路线

核对日期：2026-10-12。范围：延续当前设计预览任务，明确生产接入边界；不是给现有编程助手安装提示词或 Skills。当前未引入新的运行时依赖、服务、账户或数据库。

2026-10-17 增量：开发预览通过 `desktop/server/model-connections.mjs` 提供本机、会话内的真实模型目录连接与 OpenRouter PKCE 授权；支持 OpenAI Responses、Anthropic Messages、Google Generate Content、OpenRouter Chat Completions、Ollama native chat 的纯文本流，并转换为 AI SDK UI Message Stream v1 文本子集。默认仍演示，用户显式选择模型后才发送。不安装 SDK，不重造协议；官方依据、测试及未验证边界见 [真实聊天记录](research/anthropic-google-chat-report.md)。下文“模型未接入”保留为早期调研基线；正式 Tauri broker、OS keychain、真实工具循环仍未接入。

同日工具增量：用户可在添加菜单显式生成真实本机上线清单，复用 `runGuide` 与 MCP 工具名。服务端和前端共享有界校验，适用/自查清单由固定组件安全渲染，传输复用 AI SDK UI Message Stream v1 工具子集及原有 SSE 分帧。无需密钥，不读取项目或调用模型，不把规则结果自动加入文本历史；这不等于模型自动工具循环。见 [官方协议依据](research/local-guide-sources.md) 与 [本机工具验证](research/local-guide-report.md)。

2026-10-17 全产品复核：[AI Elements 已提供向 shadcn/ui patterns 的迁移说明](https://ui.shadcn.com/docs/ai-elements)，现有项目不要求迁移。本仓库保持原生实现与既有 Floating UI / markdown-it；下文 AI Elements 安装前提属于 10 月 12 日的历史选型记录。未来 React 迁移须重新核对当前组件与许可，不安装旧站完整生态。当前功能矩阵与修复见 [全产品评审](research/product-wide-review-report.md)。

## 1. 以实现为准的现状

| 层 | 已有实现 | 可复用 / 缺口 |
| --- | --- | --- |
| 桌面前端 | `desktop/src/main.ts`，原生 TypeScript + Vite 6；Tauri API 2 | 文件夹选择、主体选择、运行 check/guide；没有 React、聊天运行时或模型 SDK |
| 可信本地后端 | `desktop/src-tauri/src/lib.rs`，Tauri 2 / Rust，固定命令参数调用 Node CLI | 复用进程边界；当前一次性收集 stdout，没有 Agent 流、取消、工具超时或会话存储 |
| 业务内核 | `src/check.mjs`、`guide.mjs`、`explain.mjs`、规则 YAML | 确定性规则与结构化结果可复用；不把模型当规则事实来源 |
| MCP | `src/mcp.mjs`，stdio JSON-RPC 工具与参数约束 | 已有 check/guide/explain，不重复建设工具协议；不是模型运行时或用户权限系统 |
| 设计预览 | `conversation.js`、`ui.js`、`main.js`、`chat.js` | 已有流式演示、停止、错误、审批、会话草稿；只保存在页面内存，未接真实工具 |
| 状态 / 身份 / 数据库 | 正式端目前是局部变量；未发现身份认证与数据库实现 | docs/08、docs/09 的 React、Zustand、SQLite、provider 是规划，不能当作已交付 |

根目录已有 Ajv 作为开发依赖用于规则 schema 检查；生产内核仍保持极简依赖。不要为了预览引入另一套通用校验栈。

## 2. 选型结论

**现在：保留 Tauri + Vite + TypeScript / 现有原生预览组件。三套界面参考中，选择 AI Elements 作为主要组件设计参考，不安装其完整生态。** 它将消息、工具参数与结果、审批分成可组合组件，与项目已有分区匹配。[官方用法](https://elements.ai-sdk.dev/docs/usage)、[Tool](https://elements.ai-sdk.dev/components/tool)、[Confirmation](https://elements.ai-sdk.dev/components/confirmation)。

AI Elements 当前安装文档列出 React 19、shadcn/ui、Tailwind 4、AI SDK 等前提，并以 Next.js 为示例；当前原生 TS 应用不满足这些条件。不能把它当成一段可直接粘贴的无依赖脚本。未来若实施仓库 M1 的 React 迁移，再逐组件验证 Vite/Tauri 兼容性，无需因此改成 Next.js。[安装前提](https://elements.ai-sdk.dev/docs/setup)。

| 候选 | 当前决定 | 重新评估触发条件 |
| --- | --- | --- |
| AI Elements | 主要交互参考；不复制源码、不安装 | React 前端迁移明确后，逐个引入 message / tool / confirmation |
| assistant-ui | 不叠加第二套聊天运行时 | 以后决定让库统一管理完整会话体验，而非当前自有组件模式；[官方说明](https://www.assistant-ui.com/docs) |
| CopilotKit | 暂不引入 | Agent 确需调用页面工具、共享复杂业务状态 |
| Vercel AI SDK | 后续 TypeScript 模型层优先候选，当前不接入 | 可信 Node sidecar 和 provider 边界明确后；复用 SDK 工具循环、取消与消息机制，不放在 WebView 中持有密钥 |
| Mastra / LangGraph | 暂不引入 | 出现必须持久化暂停恢复、分支或复杂工作流的真实需求 |
| Zod | 本轮不增加 | 模型侧 Schema 方案确定后比较已有 JSON Schema / Ajv 的复用成本，再选一种 |
| Streamdown | 暂不引入 | React 消息渲染落地且需要完整流式 Markdown；当前文本保持安全 DOM 渲染 |
| json-render / React Flow | 暂不引入 | 固定业务卡片无法覆盖的动态界面，或明确的可视化流程编辑需求 |
| AG-UI | 暂不引入 | 确需跨多后端协议互通；当前不要与 MCP、Tauri IPC 和既有消息事件重复建设 |
| OPA / NeMo Guardrails | 暂不引入 | 已有清晰权限函数难以管理策略规模，或确有模型输入输出检查需求；不能替代认证与审批 |
| Langfuse / Promptfoo | 暂不引入 | 真实模型运行后需要跨调用追踪、成本与概率性回归；现在用本地运行记录与确定性测试 |
| Vercel Chatbot / Agent Chat UI | 仅作完整项目组织参考 | 不覆盖当前仓库；采用其架构前重新确认实际运行时与依赖 |

许可证实核：AI Elements 与 AI SDK 上游均为 Apache-2.0（[AI Elements](https://github.com/vercel/ai-elements/blob/main/LICENSE)、[AI SDK](https://github.com/vercel/ai/blob/main/LICENSE)）。本轮未引入上游代码。其余未采用候选尚未完成逐版本依赖、许可证与兼容性审计，不能据此视为准入。最终接入须锁定具体版本；官网示例会变化，不能将混用旧字段的示例直接当执行合同。

## 3. 输出必须有明确类型

| 输出 | 当前预览 | 正式接入要求 |
| --- | --- | --- |
| 解释 / 总结 | 安全文本段落，模拟分批输出 | 安全 Markdown 渲染；禁任意 HTML、脚本及未经授权资源加载 |
| 工具输入 / 状态 | 固定示例参数，运行中 / 成功 / 失败 / 停止分开 | 状态来自执行器，不从回答中匹配“完成”字样 |
| 业务结果 | 校验后的固定预检卡片，明确演示标识 | 可信后端校验工具与模型结果，前端再做防御性校验 |
| 审批 | 独立审批卡与差异面板，本地状态演示 | approvalId 必须绑定具体 run、操作、规范化参数与资源版本 |
| 成果 | 独立差异面板 | 经过授权的文件 / 报告引用；正文不是执行命令 |
| 执行记录 | 每轮 ID、状态、耗时，页面内存可查看 | 脱敏追踪、留存与导出策略；不得持久记录密钥或整份源码 |

当前预览沿用 `shipmate:conversation` 页面事件，不将其升级为新的通用 Agent 协议。正式 Tauri 使用已有 IPC / Channel 能力；若引入 AI SDK，采用其 UIMessage / 工具状态并在一个边界转换，而非再增加第三套消息总线。[Tauri Channel](https://v2.tauri.app/develop/calling-frontend/)、[AI SDK 工具调用](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)、[结构化输出](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)。

## 4. 五层规则在可信后端执行

1. 提示词：表达、任务步骤、建议；不能授予权限。仅展示公开动作与结果摘要，不索取或伪造隐藏推理。
2. 数据：工具参数、模型结果和业务结果均校验；未知字段、非法枚举、过大数据与计数矛盾不能默默接受。本轮预览只做固定业务数据验证，不代表服务端校验已完成。
3. 权限：单用户桌面以受信任的项目选择和本地授权上下文为基础；如果以后联网，多用户身份与租户必须来自可信会话。模型提供的路径、身份、域名和工具名都不是授权证明。
4. 审批：服务端核验 approvalId、runId、工具、参数摘要、资源版本和有效期，决定原子消费；重试使用同一操作标识去重，拒绝过期或跨会话审批。前端确认按钮不能替代该过程。
5. 执行：工具白名单、步数上限、超时、取消、输出大小和重试边界。密钥只进入可信后端 / OS keychain，不进入 WebView、前端环境变量或日志。禁任意模型生成的命令、组件和代码执行。

网页、文件与工具返回内容均作为不可信数据；不能改变系统规则。审批通过与工具执行成功必须是两个独立事实。正式接入不得沿用预览的“批准后只改 UI”作为安全机制。

## 5. 下一次正式端实施的最小切片

先做无 key 确定性路径：用户明确选择主体 → 可信端调用现有 `runGuide` → 校验结构化结果 → Tauri 传回工具状态与结果 → 固定业务组件渲染 → 留下脱敏运行记录。`guide` 不需要任意项目路径，是比立刻执行写文件工具更小的首个切片。

再接一个模型 provider：用户输入 → 可信 Node sidecar 的 AI SDK → 白名单只读 guide → 校验 → 返回 SDK 事件与文本 → 固定结果卡。使用同一个业务工具和结果合同，模型不可自行扩展工具或审批能力。无真实 key 时明确使用 mock provider，不宣传真实模型调用已通过。

持久化、真实文件 check、写入审批、checkpoint、PTY 和长期记忆各自单独切片。`EVOLUTION_ROADMAP.md` M1/M2/M3 的授权与迁移边界仍适用；本轮没有跨入这些生产改造。

## 6. 本轮启动与验收

```sh
node desktop/design-previews/_serve.mjs
# http://127.0.0.1:5501/main-four-region.html
# http://127.0.0.1:5501/chat-full.html
```

无需 API key 或新增环境变量；仅绑定本机回环地址。正式壳既有启动方式仍是 `cd desktop` 后运行 `npm run tauri dev`，需项目已有的 Rust/Tauri 前置环境。本轮没有把设计预览自动接入正式壳。

验收合同：运行中工具状态明确；完成仅显示校验通过的业务卡片；非法结果不能显示成功或进入审批；停止后旧回调无效；重试有独立运行标识；成功、失败、停止均保留内存记录。质量命令从根目录 package.json / CI 与 desktop/package.json 取得：目标 Node tests、`npm test`、`npm run lint`、预览脚本独立 lint 与语法检查、浏览器主工作台/完整聊天页实测。结果记录见 [交互标准](AGENT-INTERACTION-STANDARD.md)。
