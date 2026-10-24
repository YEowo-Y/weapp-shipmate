# 12 · 当前能力与交付边界

盘点日期：2026-10-23，覆盖 P0–P5、P6 第一段只读修复交接，以及 P7 手动维护、显式项目记忆、可关闭文件监听、应用内与系统通知、规则来源主动检查及正式外观设置的本机实现；P5 真实账号质量评测、P6 受限写入、系统通知安装身份与可见投递、规则内容更新发布及 P8 仍待。本文记录可复核的当前实现，区别于 [产品愿景](08-product-vision.md)和[上下文历史方案](09-memory-context-architecture.md)。后续实施顺序见[总体计划](../.omx/plans/project-completion-plan-20261022.md)。

## 状态口径

- **真实**：源码存在执行或持久化路径，不表示本轮已通过所有环境验收。
- **部分**：真实路径已存在，但所列产品闭环尚未完成。
- **演示**：使用样例或本页状态，不代表真实项目结果。
- **待实现**：当前没有完整实现；原型、文案或设计文档不能作为交付证据。

“正式桌面”指 `desktop/src` 的产品入口；“开发预览”指 `desktop/design-previews`。预览目录既有复用到桌面的真实组件，也有演示页面，不能仅凭目录名判断能力。

## 当前技术栈

| 边界 | 当前实现 | 依据 |
|---|---|---|
| 规则内核 | Node.js、YAML 规则、CLI、stdio MCP 服务端 | [根依赖](../package.json)、[CLI](../src/cli.mjs)、[MCP](../src/mcp.mjs) |
| 桌面界面 | Vanilla TypeScript、Vite、Tauri 2、Web Awesome；复用现有图标、Markdown、弹层组件 | [桌面依赖](../desktop/package.json)、[本地组件与许可](../desktop/design-previews/components/vendor/web-awesome/README.md) |
| 原生桥接 | Rust / Tauri 命令、模型桥、本机目录选择 | [Rust 依赖](../desktop/src-tauri/Cargo.toml)、[原生命令](../desktop/src-tauri/src/lib.rs)、[模型桥](../desktop/src-tauri/src/model_bridge.rs) |
| 模型服务 | 现有 Node broker、六条普通文本路径；仅 OpenAI Agent 路径使用锁定的 AI SDK Core/OpenAI provider | [连接服务](../desktop/server/model-connections.mjs)、[聊天流](../desktop/server/chat-stream.mjs)、[Agent 流](../desktop/server/agent-stream.mjs)、[版本与许可](../desktop/design-previews/research/p5-agent-sdk-sources-20261022.md) |
| 会话持久化 | IndexedDB；桌面使用 `desktop-local` 会话命名空间 | [会话存储](../desktop/design-previews/session-store.js)、[桌面会话](../desktop/src/sessions.ts) |
| 项目、运行与成果 | SQLite / rusqlite 0.40.2；受限 Rust IPC，独立于会话数据 | [项目仓库](../desktop/src-tauri/src/project_store.rs)、[P2 记录](../desktop/design-previews/research/p2-persistence-delivery-20261022.md) |

当前保留已有前端组件，已接入 SQLite 项目库和 Windows 系统凭据库。凭据使用 keyring-core 1.0.1 与固定上游并发修复 commit 的 Windows store，未启用搜索全部凭据能力；版本、许可和残余风险见 [P4 依赖核实](../desktop/design-previews/research/p4-credential-sources-20261022.md)。PTY 与耐久工作流尚未接入。

## 功能台账

| 能力 | 状态 | 当前可以做什么 / 不能据此推断什么 | 源码依据 |
|---|---|---|---|
| CLI / MCP | 真实 | `check`、`guide`、`explain` 可独立使用；已有 MCP 是服务端，不是桌面第三方 MCP 客户端 | [CLI](../src/cli.mjs)、[MCP](../src/mcp.mjs) |
| 本地预检 | 真实 | 扫描项目信号并交叉核验；静态检查不保证官方审核通过 | [检查](../src/check.mjs)、[扫描](../src/scanner.mjs)、[交叉核验](../src/crosscheck.mjs) |
| 规则与引用 | 真实 | 有规则数据、Schema 和引用检查；归档核验日期不表示今天重新访问官方页面 | [数据](../src/data.mjs)、[Schema](../schemas/rules.schema.json)、[验证脚本](../scripts/validate.mjs) |
| 上线清单 | 真实 | 依据主体和事实生成阶段与条件清单；支付和业务描述提供有限线索，不代替类目判定 | [导航内核](../src/guide.mjs)、[流程](../flow.yaml)、[桌面工具](../desktop/src/tools-panel.ts) |
| 拒因查询 | 真实 | 匹配规则、筛选处理项、展开来源及导出；未知项不能补成确定结论 | [拒因内核](../src/explain.mjs)、[共享界面](../desktop/design-previews/explain.js)、[桌面对话框](../desktop/src/explain-dialog.ts) |
| 报告与成果 | 真实 | 预检、清单、拒因单次执行保存 Markdown 和经过校验的结构化成果；历史报告标明事实或规则变化。同项目、同依据及完整同范围预检可比较新增/仍存在/未再检出；旧纯 Markdown 仍可读但不可比较 | [领域成果](../src/project-artifact.mjs)、[项目仓库](../desktop/src-tauri/src/project_store.rs)、[比较](../desktop/src-tauri/src/project_workflow.rs) |
| 报告阅读 | 真实 | 首页与工具栏进入独立限宽阅读视图；目录、核对项、运行限制与条件线索常显，官方摘录和版本明细可展开。旧或无效结构保留安全原文；打开阅读不运行工具或发送模型，复制仍保留报告原文 | [阅读界面](../desktop/src/report-reader.ts)、[功能呈现规范](../desktop/design-previews/research/functional-reading-design-20261023.md) |
| 首页工作台 | 真实 | 当前项目、预检主入口、清单/拒因辅助任务、最近报告和后续功能分层呈现；入口打开现有功能，不自动执行工具。按内容宽度重排，真实空状态不伪造完成度 | [正式页面](../desktop/index.html)、[首页样式](../desktop/src/home.css)、[呈现设计](../desktop/design-previews/research/feature-presentation-design-20261023.md) |
| 多项目 | 真实 | 持久目录、名称、主体和业务事实；支付/敏感信息/域名采用三态，未知不等于否。按项目切换会话、草稿和成果，支持目录重新定位 | [项目管理](../desktop/src/projects.ts)、[会话工作区](../desktop/design-previews/session-workspace.js) |
| 会话、历史、草稿 | 真实 | 会话切换、历史检索、归档与草稿存储已有实现；恢复聊天记录不等于恢复执行中的任务 | [会话工作区](../desktop/design-previews/session-workspace.js)、[存储](../desktop/design-previews/session-store.js) |
| 会话备份 | 真实 | 会话导出与追加导入独立于项目导出；会话备份不含项目记忆，项目导出包含记忆但尚无导入恢复。两者不含模型凭据；导入会话的未知关联归为未归属，不自动创建或启用记忆 | [会话传输](../desktop/design-previews/session-transfer.js)、[项目管理](../desktop/src/projects.ts) |
| 模型连接 | 真实 | 五家文本协议适配：OpenAI、Anthropic、Google、OpenRouter、Ollama；目录连接与实际推理验收分开 | [厂商适配](../desktop/server/model-providers.mjs)、[聊天流](../desktop/server/chat-stream.mjs) |
| OAuth 与凭据 | 真实 / 部分 | OpenRouter PKCE 和 Windows 系统保存；默认临时连接，系统保存须明确选择。重启恢复为待重连，不自动推理；密钥不回传界面、不进入会话备份。外部账号授权仍待验，没有通用 ChatGPT/Claude 订阅登录 | [连接服务](../desktop/server/model-connections.mjs)、[原生凭据](../desktop/src-tauri/src/credential_store.rs) |
| 自定义模型地址 | 真实 / 部分 | 正式桌面支持一个 OpenAI Chat Completions 兼容地址；HTTPS 公网默认，显式本机 HTTP、DNS 地址固定、拒绝重定向。目录与主动推理测试分别展示；真实公网兼容服务待验，预览设置仍为草案 | [受限传输](../desktop/server/custom-endpoint.mjs)、[正式连接界面](../desktop/src/model-connection.ts) |
| 流式、停止、错误恢复 | 真实 | 文本与工具按真实事件更新；停止关闭上游并取消关联本机运行，保留已有文字和成功成果。错误使用固定恢复提示，不自动重试工具或付费请求 | [对话](../desktop/design-previews/conversation.js)、[传输](../desktop/design-previews/chat-transport.js)、[Agent 流](../desktop/server/agent-stream.mjs) |
| 只读 Agent 工具循环 | 真实 / 部分 | 正式桌面仅 OpenAI 可调用 `project_read(check/guide/explain)`；Rust 绑定当前已保存项目，模型不能指定目录或权限。默认关闭读取与摘要分享，最多 3 个模型步骤/2 次本机工具，无并行或自动重试；真实模型选择质量待验 | [契约](../desktop/design-previews/agent-contract.js)、[原生授权](../desktop/src-tauri/src/agent_tools.rs)、[权限界面](../desktop/src/agent-tools.ts)、[P5 记录](../desktop/design-previews/research/p5-agent-delivery-20261023.md) |
| 持久任务执行器 | 待实现 | 工具 parts、运行关联与本机成果已保存；重启保留结果并将未完成记录标为停止，权限不恢复、请求不重放，不支持检查点续跑 | [会话存储](../desktop/design-previews/session-store.js)、[项目仓库](../desktop/src-tauri/src/project_store.rs) |
| 文件与报告上下文 | 真实 / 部分 | 正式桌面显式选择项目报告或受限 UTF-8 文件，可展开完整快照、查看字节数、移除。每次发送和重试重新使用当前选择；快照仅应用内存保存，重启需重选。单文件 16 KiB、总计 24 KiB/8 项，整包 64 KiB；秘密检测非完备，不自动上传整个项目 | [上下文界面](../desktop/src/context.ts)、[发送组装](../desktop/design-previews/chat-context.js)、[受限读取](../desktop/src-tauri/src/project_context.rs) |
| 阶段工作区 | 真实 / 部分 | 正式桌面“上线进度”持久保存人工确认、撤销及不适用原因；校验前置阶段、事实及规则版本，变化后显示待重检。显示实际统计与下一步，临时事实/备注草稿保留到本次应用退出，依据变化后要求处理冲突，不静默覆盖新值。预览阶段页仍为示例；真实目标用户试用尚待开展 | [正式工作流](../desktop/src/workflow.ts)、[状态派生](../src/workflow.mjs)、[预览示例](../desktop/design-previews/stages.js) |
| 类目顾问 | 部分 | 正式上线进度按主体与实际业务提供带来源的候选线索和材料要求；未命中不代表无需资质，不自动替用户定类目。完整问诊顾问页仍为示例 | [类目规则](../rules/categories.yaml)、[状态派生](../src/workflow.mjs)、[顾问示例](../desktop/design-previews/category-advisor.html) |
| 项目记忆 | 真实 / 部分 | 正式桌面支持显式新增、修改、删除、来源与更新时间，以及默认关闭的引用许可；另须在上下文中选择才发送。原生 SQLite 按当前项目隔离，每轮重新解析，停用/删除拒绝旧引用；聊天导入不写入记忆。没有自动提取、跨项目共享或向量检索；开发预览页面仍是示例 | [管理界面](../desktop/src/project-memory.ts)、[原生存储](../desktop/src-tauri/src/project_memory.rs)、[发送上下文](../desktop/src/context.ts) |
| 项目维护 / 手动重检 | 真实 / 部分 | 正式桌面展示最近预检尝试与成功报告，提示事实/规则变化、目录不可用；刷新仅读本机记录，显式重检复用预检与停止。失败保留旧报告、支持历史比较入口，不以旧结果判断当前文件健康 | [维护界面](../desktop/src/project-health.ts)、[P7 第一段验收](../desktop/design-previews/research/p7-health-delivery-20261023.md) |
| 文件监听 / 健康监控 | 真实 / 部分 | 正式桌面可按项目启用只读自动预检及应用内新增问题提醒，默认均关闭；合并、忽略、停止、切换清理、目录恢复与去重已实现。仅在应用运行且项目处于当前范围时监听；设备级系统通知另需明确开启，不补发旧提醒。开发预览仍是样例 | [监听](../desktop/server/project-watch.mjs)、[调度](../desktop/src-tauri/src/project_maintenance.rs)、[维护界面](../desktop/src/maintenance.ts) |
| 规则来源检查 | 真实 / 部分 | 正式桌面按来源显式访问内置官方 URL，支持停止、未知状态、有效正文证据保留及版本隔离。打开/刷新不联网，不改写规则或维护者核验日期；正文差异不等于政策更新 | [来源面板](../desktop/src/source-freshness.ts)、[受限请求](../desktop/server/source-check.mjs)、[持久化](../desktop/src-tauri/src/source_freshness.rs) |
| 系统通知 | 真实 / 部分 | 官方 Tauri 插件、设备默认关闭、固定测试与真实新问题提醒、持久去重；开关与提交记录可恢复。Windows 插件不能检测系统实际授权/勿扰或证明可见，安装身份单独待验 | [通知设置](../desktop/src/system-notifications.ts)、[原生通知](../desktop/src-tauri/src/system_notifications.rs) |
| 改动审阅 / 修复 | 演示 | 示例 diff 与批准交互不写文件；尚无受限写入审批和回退闭环 | [审阅交互](../desktop/design-previews/main.js)、[示例页面](../desktop/design-previews/diff-review.html) |
| 修复交接 | 真实 | 正式报告生成问题、依据、期望结果与验证步骤，支持 Markdown/JSON 导出与 JSON 只读重开；外部文件标记未核验，不更改项目或成果，不代表已修复 | [共享契约](../desktop/design-previews/repair-handoff.js)、[原生界面](../desktop/src/repair-handoff.ts)、[P6 证据](../desktop/design-previews/research/p6-handoff-delivery-20261023.md) |
| 终端 / 第三方 MCP | 待实现 | 尚无真实 PTY 和可用第三方连接；不能从入口外观推断已获得执行权限 | [设置页面](../desktop/design-previews/settings.html)、[原生依赖](../desktop/src-tauri/Cargo.toml) |
| 设置与导航 | 真实 / 部分 | 正式桌面仅一个常驻全局设置入口，按外观/通知/连接与数据独立分区；模型选择器与缺模型恢复定向进入连接分区，详情关闭恢复原始触发点。复用模型、会话数据、项目与维护界面；设备外观支持主题、正文大小、减少动效与独立重置，存储失败保留旧值、损坏可恢复。工程脚本检查、隐私策略和规则编辑仍未接入，不作为已生效配置展示 | [设置中心](../desktop/src/preferences.ts)、[正式入口](../desktop/src/main.ts)、[当前验收](../desktop/design-previews/research/settings-unification-20261023.md) |
| 安装与权限边界 | 部分 | Windows x64 随包 Node、规则和 broker；无 PATH/源码回退。工具取消、限时和输出上限、CSP、本地主窗口 ACL 已实现；独立目录验收与干净系统分发分别记账，签名更新留在 P8 | [运行时](../desktop/src-tauri/src/runtime.rs)、[执行器](../desktop/src-tauri/src/tool_runner.rs)、[打包配置](../desktop/src-tauri/tauri.conf.json)、[P1 证据](../desktop/design-previews/research/p1-runtime-delivery-20261022.md) |

## 统一术语与后续模型

| 术语 | 含义及边界 |
|---|---|
| 会话 | 已持久化的消息、草稿与历史交互；不是后台任务 |
| 任务 | 用户要完成的业务事项，如检查项目或整理上线清单；当前没有可持久恢复的独立任务实体，不能把新建会话称作新建后台任务 |
| 项目 | 已保存的目录、名称、主体与业务事实，关联人工阶段记录；人工确认不代表官方平台已完成 |
| 运行 | 一次实际执行及其状态；预检、清单和拒因已独立保存，不能从助手自然语言推断成功或恢复后台执行 |
| 成果 | 带独立 ID、项目和运行关联的不可变报告；版本和时间不是当前文件通过检查的证明 |
| 演示 | 明确标记的样例数据与交互；不进入真实进度或风险判定 |

P2 已采用「一个项目 → 多个会话、运行和成果」。会话仍在 IndexedDB，通过项目 ID 关联 SQLite 元数据；旧会话保留为未归属记录，不把一个会话强制迁成一个项目。

## 事实、授权与核验边界

规则 ID、来源链接和核验日期用于追溯。合法 ID 不能证明模型复述或整段解释正确；AI 解释持续标明其性质，经过契约校验的工具字段才标注实际来源。XML、提示词和禁词过滤不能替代可信进程内的权限、参数、路径及审批检查。

不提供合规担保，不代用户进行官方提交、身份认证或付款。模型连接可选，确定性工具不要求模型密钥；连接模型后的外发行为不能描述为“绝对不出网”。

P5 读取与摘要分享分别授权，只存应用内存，切换项目、会话、服务商或重启后撤销。关闭分享时模型仅收到固定本机报告提示；开启时仅发送经 Schema 校验的有界摘要，不含目录、原始代码或 stderr，完整报告仍在本机。11 项隔离 Windows 原生验收通过，使用真实 Rust 工具、SQLite 和 WebView2，模型侧为确定性协议 fixture；这不等于真实 OpenAI 账号、工具选择质量或安装分发已通过。最终 Node、构建和其他证据见 [P5 交付记录](../desktop/design-previews/research/p5-agent-delivery-20261023.md)。

P7 显式项目记忆已通过 14 项隔离 Windows 原生检查，包括实际 SQLite 重启恢复、默认不引用、每轮解析最新内容、停用/删除拦截和跨项目拒绝。7 次聊天请求经过实际桌面传输，但模型回复来自本地协议夹具；本轮未验证外部推理。记忆为未加密的本机用户资料，项目导出包含记忆，会话备份不包含；没有项目备份导入恢复能力。源码、完整测试与截图见 [P7 记忆交付记录](../desktop/design-previews/research/p7-memory-delivery-20261023.md)。

P7 文件监听、应用内提醒与偏好设置通过 16 项隔离 Windows 原生检查，使用真实 SQLite、监听器和随包扫描器，0 模型请求，前端异常为空，所属监听进程退出检查通过。1228 项 Node、71 项 Rust（2 项既有凭据测试 ignored）、静态检查与默认 Tauri 构建通过；该段验收时系统通知依赖尚未授权；后续已获准并接入，见下述本轮记录，不声称通过系统授权或可见投递。详见 [P7 维护交付记录](../desktop/design-previews/research/p7-maintenance-delivery-20261023.md)。

P7 规则来源与官方系统通知本轮通过 1265 项 Node、88 项 Rust（2 项既有凭据测试 ignored）、来源 12 项和通知 13 项隔离 Windows 原生检查，以及静态检查与默认构建。来源成功路径使用明确标记的 DNS/HTTPS adapter，实际公网尝试为 `unknown/network`；通知使用实际官方插件，记录到测试和真实维护事件的 `submitted`，没有可见送达证明。两组 0 模型请求、前端无异常、所属进程退出验证通过；窄窗设置焦点回落和重新进入已实测。详见 [本轮交付记录](../desktop/design-previews/research/p7-source-freshness-delivery-20261023.md)。

本台账的核验范围是源码、依赖和本地文档引用。测试与构建结果由每次交付记录提供：浏览器自动化、原生开发态、安装版和真实账号分别记账，不能互相替代。历史测试数量不得作为本轮新验收结果；本轮浏览器访问受 Work 设置限制，不能记为通过。
