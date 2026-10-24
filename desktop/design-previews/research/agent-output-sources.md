# Agent 输出组件：官方资料实查记录

检索日期：2026-10-13（America/New_York）。请求类型：实现参考与当前最佳实践研究。范围：为原生 JavaScript 设计预览的组件标准化提供可复核依据；不代表安装、运行或通过这些库的兼容性测试。

已阅读用户附件《已粘贴的文本.txt》以及当前 `AGENT-TECH-CHOICES.md`。本文区分“官方页面确实说明的行为”与“交给实施者的建议”。页面行号指本次文本抓取的行号，网页更新后可能变化，因此同时给出章节定位。AI Elements / assistant-ui 的浏览器演示另由主任务实查，本文不冒充视觉体验记录。

## 1. AI SDK：文本结束、工具结果和运行结束不能合并

**实查资料**：[Stream Protocols](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)，页面标注 **v7 Latest documentation**；重点为 Data Stream Protocol、Text Parts、Tool Input / Approval / Output、Finish / Abort（本次 L195–475）。

官方文档区分纯文本流与 SSE 数据流。数据流使用 `x-vercel-ai-ui-message-stream: v1` 标记；文本块使用 ID 与 start/delta/end，工具使用 `toolCallId` 关联输入及输出，另有消息完成和 abort。`data-*` 支持有明确类型的业务数据。工具参数齐备不能代替结果事件，文本块结束也不能代替整个消息结束。

**实查资料**：[Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)，Tool execution approval / Client-Side Approval UI / Error handling（L196–197、L253–299、L389–391、L504–602）。

官方状态包括 `input-streaming`、`input-available`、`approval-requested`、`approval-responded`、`output-available`、`output-error`、`output-denied`。人工审批通过 `addToolApprovalResponse` 响应审批 ID；审批已响应与已有执行结果是不同状态。当前文档还区分自动决策，不应为自动审批再发送人工响应。敏感操作章节明确指出客户端历史可以被篡改，展示确认按钮本身不能保护后端。

**实施建议，不是安装决定**：工具卡拆成标题/状态、输入、输出或错误区域；审批卡有独立等待/通过/拒绝/失效状态。继续使用当前演示执行器的事实来驱动 UI，不解析中文回复中的“完成”。未来真正采用 AI SDK 时，在单一边界适配其消息部件；不要将本次原生演示事件宣称为已经兼容 SDK 协议。

**版本限制**：以上为 v7 最新文档，未锁 npm 发布版本。不能直接搬用过去 v5/v6 的服务端示例，也不能据此声称本仓库已经接入 SSE 或可信审批。

## 2. Streamdown：流式 Markdown 是独立渲染职责

**实查资料**：[Introduction](https://streamdown.ai/docs)，The Problem / Solution（L74–91）；[Usage](https://streamdown.ai/docs/usage)，Basic Usage、Plugin Options、Static Mode（L75–87、L144–158、L244–282）。

它是 React Markdown 组件，处理未闭合粗体、代码块、链接等流式中间态。代码高亮、图表、数学和 CJK 是按需插件。`mode="static"` 假设内容完整，跳过流式未闭合处理。因而静态完成态和正在接收内容的渲染模式不能混同。

**实查资料**：[Unterminated Block Parsing](https://streamdown.ai/docs/termination)，Incomplete Links / Images、Configuration（L165–255）。未闭合处理默认开启，`parseIncompleteMarkdown={false}` 可关闭；未完成链接使用特殊占位值，未完成图片被抑制。`remend` 也有独立用法，但仍需下游 Markdown 渲染器。

**实查资料**：[Security](https://streamdown.ai/docs/security)，Default Security、Restricting Protocols、HTML Content（L85–131、L281–300）。文档说明 sanitize 与 harden 是不同层；harden 默认允许范围较宽。覆盖 `rehypePlugins` 会替换整个数组而非合并，必须显式保留 sanitize。禁用 raw HTML、限制外部图片和 URL 协议仍需应用明确配置。

**发现的版本漂移**：Usage 的 With AI Streaming 示例（L194–243）仍返回 `input` / `handleInputChange` / `handleSubmit` / `isLoading`，并读取 `message.content`。这与本次 AI SDK v7 页面展示的 `sendMessage` / `message.parts` 不一致。该示例不能当作当前 SDK 集成合同；应分别核对组件 prop 与所锁 SDK 的消息 API。

**实施建议**：流式内容应有独立的正文组件和明确支持范围，代码块与复制操作复用组件。不应把按段追加纯文本称为完整流式 Markdown。当前原生预览不能直接运行 React 组件；本报告不建议为了演示引入 React 与所有插件，也不建议临时堆叠不完整正则解析器冒充 Streamdown。

## 3. json-render：组件目录与动作执行必须分开

**实查资料**：[Introduction](https://json-render.dev/docs)，How json-render Works（L121–181）；[Catalog](https://json-render.dev/docs/catalog)；[Registry](https://json-render.dev/docs/registry)，defineRegistry / Action Handlers（L114–163、L225–279）。

Catalog 限定组件类型、属性、动作参数；registry 将这些声明映射到实际组件与应用提供的处理函数。当前 React 示例使用 `defineCatalog`、`defineRegistry` 和 `Renderer`，组件通过 `emit` 发出具名事件；AI 声明动作名称，不生成任意执行代码。

**实施建议**：固定预检数据仍由固定业务卡片渲染。即使未来使用 catalog，授权、URL 校验、审批和防重复执行也不能由目录里的动作名称替代；文档中的导航/提交示例不是该项目的权限策略。只有真正需要模型动态组合布局时再做包与许可证准入评估。

**资料变化**：`/docs/actions` 本次重定向到 `/docs/registry`；尝试 `/docs/catalogs` 返回抓取错误，导航确认正确地址为单数 `/docs/catalog`。未把失效地址当成已验证资料。官网未在这些页面展示可用于锁版本的发布号，不能声称与某一 npm 版本精确对应。

## 4. AG-UI：工具调用结束不等于工具成功

**实查资料**：[Events](https://docs.ag-ui.com/concepts/events)，Lifecycle Events / Tool Call Events / State Management Events（L126–158、L240–288、L310–328）。

`ToolCallStart` / `ToolCallArgs` / `ToolCallEnd` 描述调用与参数流，`ToolCallResult` 单独传结果。文档明确 `ToolCallEnd` 时工具可能仍在执行。运行、文本、工具和状态快照分别有生命周期；状态 delta 使用 JSON Patch。当前 `RunFinished.outcome` 还能表示等待人工输入的 interrupt，因此不能把所有 RunFinished 一律涂成成功。

**实施建议**：借鉴身份关联和终态分离，保留每轮 run ID 与每次工具 call ID；停止/失败/审批待定不能共用“完成”状态。跨后端协议确有需要时再评估 AG-UI，不为当前单一演示额外维护一套协议。

**版本限制**：官网事件页同时包含扩展/草案章节；本次未锁协议包发布版本。上述 interrupt 行为来自当前概念页，不能无验证地映射到既有旧版 SDK。本文没有把模型隐藏推理当作必须显示的进度。

## 5. Vercel Chatbot：已核实范围与未完成的源码核查

**实查资料**：[官方仓库 README](https://github.com/vercel/chatbot)，Features / Running locally（本次 L233–280）。README 描述 Next.js App Router、AI SDK、shadcn/Radix、数据库/文件持久化与认证；它是一套完整应用模板，不能作为无依赖组件库复制进原生预览。

已通过 `git ls-remote` 取得本次 main 的完整提交：`c2f8235e1f3ea903ad8b7f61447c4f74164b5c58`。GitHub API 抓取出现 TLS EOF / 超时，树页面被抓取器拒绝，尝试该提交下旧路径 `components/message.tsx` 与 `components/multimodal-input.tsx` 返回 404，其他原始文件请求超时。因此**没有形成可用的 SHA + 文件行号源码证据**；不能声称已验证它当前如何拆分消息、输入框或成果组件，也不能把旧文件名记忆写成当前事实。后续需成功读取该提交目录和源码后再补这一部分。

**实施建议**：本轮只把 README 已证实的层次分工作为背景；组件抽取的实际决策应依据主任务对本仓库的检查及已成功打开的组件官方演示。没有引入上游源码，未完成的源码/许可证审计不得算作依赖准入。

## 6. 可交付给实施与测试的检查项

下列是基于上述证据整理的项目验收建议，并非已经完成的改造或测试结果：

- 工具卡存在唯一共享实现，输入、运行、结果、错误、拒绝有可枚举状态；同一状态的图标、标签和间距在不同页面一致。
- 审批响应后等待真实执行事件；拒绝、失效和执行失败不会显示成功结果。
- 正文、工具、业务卡片、审批和成果分别渲染；不靠正文关键字决定状态。
- 流式未闭合代码块、危险链接、复制失败、停止和重试有明确展示合同；仅支持纯文本时如实注明。
- 状态转换有测试，组件有可直接检查的状态样例；浏览器核验实际页面布局与操作，而不是仅凭 Node 测试声称视觉标准化。

未安装新包、未执行外部工具、未上传项目内容或密钥。没有使用第三方文章作为关键证据。

## 7. AI Elements 与 assistant-ui：页面实查与浏览器交互

主任务同日读取 [AI Elements Tool](https://elements.ai-sdk.dev/components/tool)、[Message](https://elements.ai-sdk.dev/components/message)、[Confirmation](https://elements.ai-sdk.dev/components/confirmation) 官方页面。Tool 将标题/状态、输入与输出作为可组合区域；Message 将用户和助手内容、操作区分开；Confirmation 区分请求与响应。采用这些边界，建立本仓库 `components/message.js` 的 Tool / Message / Approval 工厂及 `presentation.js` 状态表。没有复制 React 示例或声称原生演示已实现 ToolUIPart 协议。

AI Elements 在本次内置浏览器打开时返回 `ERR_CONNECTION_CLOSED`。上述是成功的官方文档读取，**没有验证该站演示控件的实际交互**。

浏览器成功访问 [assistant-ui Thread](https://www.assistant-ui.com/elements/thread)（旧 `/docs/ui/Thread` 重定向至此），读取组件与代码区。Thread 将消息、输入和滚动行为组合，工具结果通过独立组件呈现。随后点击页面侧栏 Tool call，进入 [Tool call](https://www.assistant-ui.com/elements/tool-call)。实际点击演示 “Searched the docs draft persistence”，确认它从折叠变成展开，并分别显示 Request 参数 `query: draft persistence` 与 Result（三条匹配，最佳命中 `/docs/runtime/drafts`）。未发送聊天请求、未触发模型执行。

浏览器证据：`.omx/state/component-standardization/assistant-ui-tool-expanded.png`。本次实现对应：原生 details 负责键盘展开，显式状态徽标、参数和结果摘要分别渲染；流式结束保留展开状态与焦点；输入、停止、重试、结果卡片由现有运行控制器驱动。风格延续船友主题，不复制参考站品牌外观。

### 选型结论与采用边界

本仓库预览是原生 JS/CSS，正式端是 Tauri + Vite + TypeScript。此次选择 **AI Elements 的组件边界作为主要设计参考**，assistant-ui 用于核验完整交互习惯；实现为可复用的原生组件，不安装两个 React UI 运行时。保留现有控制器与校验器，不新增 SDK、协议层或动态 UI 引擎。所有调研库均未作为依赖引入，因此未将许可证或运行兼容性记为已通过；未来真正引入时需针对锁定版本单独核验。

未完成项：正式端迁移、真实模型流、完整流式 Markdown、服务端授权/审批绑定与持久化；这些不是本次预览组件验收的交付声明。Codex / Claude desktop 只作为交互目标，本轮没有直接操作它们的客户端，不能声称逐像素或完整行为一致。
