# 上线船友 · Windows 桌面

本目录提供本地预检、上线清单、拒因查询和可选的模型聊天。Tauri 窗口复用现有组件与规则内核，工具和模型服务使用随包运行时；用户运行应用不需要安装 Node 或保留源码目录。

**组件与排版规范 v1（2026-10-24）**：参考 Codex、Claude（经 [open-claude-ui](https://github.com/Caho1/open-claude-ui) MIT 令牌）与 OpenClaw，新增 `src/design-system.css`（字体、字号、间距、圆角、控件高度、墨色三级与语义色、阴影、动效令牌）和最后加载的 `src/product-polish.css`，统一侧栏、头部、首页卡片、消息 Markdown 排版、Composer、弹窗、按钮与表单。业务 DOM、ID 与交互不变，零新增依赖。1300 项测试、构建及 19 项 Windows 原生呈现检查通过，已恢复默认构建。规范见 [DESIGN-SYSTEM.md](design-previews/DESIGN-SYSTEM.md)。

**统一设置入口（2026-10-23）**：侧栏底部常驻“设置”，内部切换外观、通知、连接与数据；首页和更多菜单移除重复设置入口。工作台与上线进度独立呈现，模型选择器的管理和缺模型引导进入同一设置中心，关闭恢复原始触发点。首页任务卡、菜单图标与排版复用现有组件，零新增依赖。1300 项 Node 测试、lint、TypeScript/Vite/Tauri 构建及 19 项 Windows 原生检查通过，已恢复默认构建。真实参考图、文件和边界见[本轮交付记录](design-previews/research/settings-unification-20261023.md)。

**功能页面呈现（2026-10-23）**：首页按当前项目、开始任务和继续处理分层；上线进度增加实际阶段统计、下一步定位、临时草稿保留与冲突恢复；偏好设置增加分组导航、主题预览和常驻保存反馈。复用 Web Awesome、Lucide 与原生组件，零新增依赖或环境变量。1293 项测试、lint、构建和 17 项 Windows 原生检查通过，含浅深色 320/390/1000/1440px 与 200% 文字压力测试。启动仍为 `npm --prefix desktop run tauri -- dev`；未提交的进度草稿仅在本次应用运行期间保留。设计依据见[呈现设计](design-previews/research/feature-presentation-design-20261023.md)，文件、原生截图和验收边界见[交付记录](design-previews/research/feature-presentation-delivery-20261023.md)。

**功能阅读体验（2026-10-23）**：预检、上线清单和拒因报告新增独立阅读视图，提供限宽正文、目录、概览、常显范围限制、官方来源和原文。首页最新报告、更多菜单与工具栏共用入口；交接正文跟随字号偏好，窄窗弹层保持焦点，每次重开从概览开始。复用现有 Web Awesome、Lucide、原生 dialog/details 和安全 Markdown，零新增依赖与环境变量。1283 项测试、lint、构建及 16 项隔离 Windows 原生检查通过，已恢复默认应用构建。其他功能的信息层级与组件选择见 [功能呈现规范](design-previews/research/functional-reading-design-20261023.md)；实际文件、截图、启动方式和未验边界见 [阅读体验交付记录](design-previews/research/reading-experience-delivery-20261023.md)。

**P7 规则来源与系统通知（2026-10-23）**：更多菜单、偏好设置与项目维护可进入同一来源检查面板，明确点击后才访问内置官方地址；支持停止、失败恢复、上次有效证据与重启恢复，不改写维护者核验日期。按用户授权仅新增官方 Rust 通知插件 2.4.0，系统通知默认关闭，开关、测试提交和新问题去重均保存于本机；旧提醒不补发，应用内记录独立保留。复用 Web Awesome、Lucide 和现有弹窗，补齐窄窗关闭设置后的键盘焦点恢复。1265 项 Node、88 项 Rust（2 项既有凭据测试 ignored）、来源 12 项及通知 13 项 Windows 原生检查通过，已恢复默认应用构建。无需新增环境变量，启动仍为 `npm --prefix desktop run tauri -- dev`。插件提交不代表通知已显示，安装身份与可见投递仍待验证；本轮公网来源请求返回未知网络状态。文件、截图、依赖与复现见 [本轮交付记录](design-previews/research/p7-source-freshness-delivery-20261023.md)。

**P7 文件监听与偏好设置（2026-10-23）**：项目维护新增分别可关闭、默认关闭的文件监听与应用内新问题提醒，按项目保存；合并文件变化后执行既有只读预检，支持停止、目录失效恢复、切换清理与提醒去重。启用、重试、重启只恢复监听，不自动重检。偏好设置补齐跟随系统/浅深色、正文大小、减少动效与外观重置，模型/数据/项目入口复用已有弹窗；后台完成保留未保存草稿、不抢焦点。零新增依赖，1228 项 Node、71 项 Rust（2 项既有凭据测试 ignored）和 16 项隔离 Windows 原生检查通过，已恢复默认构建。当时系统通知等待依赖选择、来源主动检查尚未接入；后续进度见最新 P7 记录，安装分发仍单列待验。文件清单、截图和启动/复现方式见 [P7 维护交付记录](design-previews/research/p7-maintenance-delivery-20261023.md)。以下按日期保留的数字为各段历史验收。

**P7 显式项目记忆（2026-10-23）**：工作台或更多功能中的“项目记忆”可新增、编辑、删除项目背景与偏好。默认不允许引用；开启后还需在输入框 `+` 的“选择项目记忆”中明确附加。每次发送/重试重新读取，停用或删除后的旧引用会提示移除。记忆保存于本机项目 SQLite（未加密），每条最多 4 KiB、每项目 20 条/正文合计 16 KiB；请勿保存凭据。项目备份包含记忆，会话备份不包含；导入聊天不会创建记忆。重启保留条目，但清空引用选择。既有聊天和已经发送的内容不会因删除记忆被撤回。复用现有组件、校验和存储，无新依赖或环境变量；仍不做自动提取、跨项目共享和向量检索。启动继续使用 `npm --prefix desktop run tauri -- dev`。

本段 1181 项 Node、62 项默认 Rust 测试（2 项凭据测试未运行）和 14 项 Windows 原生检查通过。包含真实 SQLite 与桌面传输，模型回复使用本地协议夹具；没有完成外部账号推理验收。源码清单、截图、复现命令和剩余边界见 [P7 记忆交付记录](design-previews/research/p7-memory-delivery-20261023.md)。项目备份当前只支持导出，不提供导入恢复。

**P7 手动维护第一段（2026-10-23）**：从工作台“继续维护项目”或更多功能“项目维护与重检”查看最近预检、上次成功报告、依据变化与目录状态。“刷新记录”仅读本机状态，“重新预检”才运行既有只读工具，支持停止与失败恢复。旧报告不冒充当前检查；改名不使事实过期，主体/目录/事实和规则变化会提醒重检。修复超过 200 条历史后最近预检入口丢失的问题，复用现有组件、SQLite 与工具执行器，无新依赖、表、IPC 命令或环境变量。1159 项 Node、56 项默认 Rust 测试（2 项凭据测试未运行）、13 项隔离 Windows 原生检查通过。浅深色与 390px 截图、复现命令及未实现边界见 [P7 交付记录](design-previews/research/p7-health-delivery-20261023.md)。

**P6 修复交接第一段（2026-10-23）**：执行报告工具栏新增“修复交接”，将真实预检、上线清单与拒因报告整理成问题依据、期望结果和验证步骤。可导出 Markdown / JSON，并从更多功能“打开修复交接”只读重开 JSON；外部来源标明未核验，失败保留上份有效内容，项目/事实/规则变化提示重检。复用现有组件和成果库，零新增依赖或环境变量，不执行文件修复。1150 项 Node 与 9 项隔离 Windows 原生验收通过；具体文件、截图、启动方式及待验边界见 [P6 交付记录](design-previews/research/p6-handoff-delivery-20261023.md)。

**P5 只读项目助手（2026-10-23）**：正式桌面已接入 OpenAI 单 Agent，由唯一的 `project_read` 调用当前已保存项目的 check、guide 或 explain。读取项目与发送筛选后的结果摘要分别授权，默认均关闭；授权只存当前应用内存，切换项目、会话、服务商或重启后撤销。未开启摘要分享时，模型只收到固定的本机报告提示。每次最多 3 个模型步骤、2 次本机工具，支持停止、明确错误恢复与已完成成果保留；重启恢复记录，不自动续跑。现有六条普通文本路径保留。仅桌面增加锁定的 AI SDK Core/OpenAI provider，不新增环境变量；本机实现验收已完成，57 项 Rust 与 11 项隔离 Windows 原生检查通过，模型侧为确定性协议 fixture，真实账号质量评测仍待。完整文件、最终测试与发布边界见 [P5 交付记录](design-previews/research/p5-agent-delivery-20261023.md)。

**P4 模型连接与上下文（2026-10-22）**：正式桌面新增显式 Windows 系统凭据保存、重启后手动重连、独立推理测试与受限自定义 OpenAI 兼容服务。已连接时优先展示模型目录，更改凭据按需展开；沿用 Web Awesome、原生 dialog 和现有图标。输入区可明确选择报告或受限项目文本，查看发送原文并移除后续引用，不自动上传项目。未新增 npm 依赖；Rust 凭据库固定版本与上游并发修复。无新增环境变量。文件、验证结果及外部账号/浏览器等待验边界见 [P4 交付记录](design-previews/research/p4-connections-delivery-20261022.md)。

**P3 项目工作流（2026-10-22）**：侧栏“上线进度”保存实际业务与三态事实，按前置阶段展示八阶段动作、来源与人工确认。事实或规则变化、前置确认撤销会显示待重检；不自动代替用户完成官方操作。预检、清单和拒因采用同一成果包装并保存到项目历史；相同项目、依据及完整文件范围的两份预检可比较，旧 Markdown 保持可读。注册、企业主体核验和人工发布补入正式来源，个人及个体工商户的主体核验细化仍明确覆盖不足。无新增依赖或环境变量；SQLite v2 自动备份后迁移，旧客户端不可改写新库。验收与剩余边界见 [P3 交付记录](design-previews/research/p3-workflow-delivery-20261022.md)。

**P1 运行时与权限边界（2026-10-22）**：Windows x64 包含锁定版本、SHA-256 和许可的 Node 24.22.1，以及规则、CLI、broker 和必要生产依赖。工具支持停止、30 秒超时和输出上限；失败保留受限错误详情，不把预检发现问题误报为进程失败。CSP 与原生命令权限限制到本地主窗口，链接仅允许 HTTP(S)。本轮结果及尚未通过的分发门禁见 [P1 交付记录](design-previews/research/p1-runtime-delivery-20261022.md)。

**P0 能力收敛（2026-10-22）**：当前实现以[能力台账](../docs/12-current-capabilities.md)为准，以下按日期保留的记录是历史验收。日常设置只展示模型、会话数据、外观和关于；未接入设置从设计目录显式进入，旧链接提供状态说明与返回。真实拒因查询加入常用导航，聊天创建统一为“新建会话”，不代表后台任务。开发态仍依赖系统 Node 与源码路径，独立运行时打包属于 P1。启动方式不变，本轮无新依赖或环境变量；[P0 修改与验收记录](design-previews/research/p0-capability-delivery-20261022.md)。

**P2 项目与成果（2026-10-22）**：正式桌面支持多项目、会话关联和独立草稿；预检/清单的运行与报告自动保存到 SQLite，失败不覆盖旧成果。项目目录丢失可重新定位，历史报告按保存时间和依据版本显示，完整项目导出与会话备份分开。仅新增锁定 rusqlite 依赖，复用原有组件与 IndexedDB，不新增环境变量。[P2 修改、启动与验收记录](design-previews/research/p2-persistence-delivery-20261022.md)。

**当前范围**：真实模型连接、文本聊天、流式回复、停止与手动重试；会话、独立草稿、历史搜索和刷新恢复。保存项目后可手动运行 check/guide/explain，也可明确授权 OpenAI 项目助手调用这三项只读能力；完整成果留在本机。重跑失败保留并标注上次成功报告；主体或目录变更不删除旧成果，也不把历史报告冒充当前检查。尚无内置终端、Agent 写文件或跨重启恢复执行的能力。

**社区设计落地（2026-10-22）**：结合 HN、Reddit、assistant-ui / Open WebUI / Cherry Studio 讨论及官方规范，将真实拒因结果按“全部 / 需处理 / 需本人确认 / 缺少官方来源”筛选；分类允许重叠，仅使用校验字段，保留依据展开与完整导出。浏览器和桌面共用实现，窄窗口两列控件且保留键盘焦点，无新依赖。966 项测试、42 项原生回归及构建通过；浏览器仍因 Work 设置禁用未复验。[11 个来源及差异化设计](design-previews/research/community-agent-design-20261022.md)、[修改文件和验证边界](design-previews/research/community-agent-delivery-20261022.md)。

**拒因查询与结果复用（2026-10-22）**：正式桌面与浏览器 `explain.html` 共用本机规则查询，支持真实匹配、未命中、停止与重试。命中后收起查询表单，优先阅读处理要求；官方依据按需展开，结果可复制或下载为含来源的完整 Markdown。桌面还可显式加入当前会话，从报告开头阅读并在顶部复制全文，保留原草稿、不发起模型请求；重复加入有提示，历史搜索和刷新/重启可找回已保存的报告。查询表单本身只保留本进程状态。939 项测试、38 项 Windows 原生验收通过；浏览器实际下载、空结果恢复、键盘、浅深色及窄屏已检查。桌面启动 `npm --prefix desktop run tauri dev`；预览运行 `node desktop/design-previews/_serve.mjs`。无需密钥、环境变量或新依赖。[本轮文件、截图与验证边界](design-previews/research/result-actions-delivery-20261022.md)，[此前结果衔接记录](design-previews/research/explain-result-journey-delivery-20261021.md)。

**组件架构**：保留 Vanilla TypeScript / Vite / Tauri 2，新增固定版本 Web Awesome Core 3.14.0，工作台按钮、菜单、标记和提示使用本地按需构建的开源组件。继续复用 Floating UI、markdown-it、Lucide 和服务商品牌图标；已有业务弹窗保留原生 dialog 生命周期。React + shadcn 是历史路线中的候选（2026-07-02，见 `../docs/04` / `../docs/08` §9），尚未迁移。当前规范与研究集中于 [`design-previews/`](design-previews/index.html)。

**视觉细节与整体评估（2026-10-22）**：结合官方规范和开源实现评估图片中的十条建议；首页/代码块改用现有表面层次，删除重复图标外盒，数量与耗时使用等宽数字。共享消息复制成功 2.5 秒恢复按钮和提示，流式代码变化撤销旧反馈，异步/会话切换不会覆盖新状态。新增 16 项回归，无新依赖；962 项测试、41 项 Windows 原生验收和 TS/Vite/Tauri 构建通过。浏览器仍被 Work 设置禁用，包体有 Vite 提示，未宣称发布就绪。[整体评估与取舍](design-previews/research/ui-detail-review-20261022.md)、[修改文件和验收证据](design-previews/research/ui-detail-delivery-20261022.md)。

**共享组件收敛（2026-10-22）**：通用业务、历史和桌面模型连接共用弹窗表面、标题、遮罩及轻量动效；六个规则图标按钮复用现有 Web Awesome，并保持尚未接入的禁用状态。删除重复样式，无新依赖或环境变量。939 项测试、38 项 Windows 原生验收、lint 和 TS/Vite/Tauri 构建通过；实际原生宽/窄窗口截图已复核。浏览器完整复验仍被 Work 设置禁用访问所阻塞，因此本轮未标记完整验收通过。详见 [修改文件、截图与待验收项](design-previews/research/component-foundation-delivery-20261022.md)。

## 两个独立入口（2026-10-18）

**组件状态恢复（2026-10-22）**：模型连接与快选区分未连接、空目录和搜索无匹配；Ollama 空目录给出下载/刷新路径。成功重新检查连接服务后清除旧读取错误，保留未解决的操作错误。现有图标按钮修正为桌面 32px、窄屏 44px 正方形，无新依赖或环境变量。946 项测试、39 项 Windows 原生验收及 TS/Vite/Tauri 构建通过；浏览器完成部分尺寸、主题和减少动效检查后再次被 Work 设置禁用，历史等剩余矩阵仍待补验。[修改与证据边界](design-previews/research/component-recovery-delivery-20261022.md)。

| 入口 | 已实现 | 当前边界 |
| --- | --- | --- |
| 正式 Tauri 薄桌面 | 五家模型和一个自定义兼容连接、文本流、停止/重试、OpenRouter OAuth；可选 Windows 系统凭据；会话、项目和成果；显式资料上下文；OpenAI 受限只读项目工具 | Agent 仅 OpenAI，双授权默认关闭；Windows 安装包随附 Node，开发构建仍需工具链；系统凭据与本地会话分开，存档不与浏览器预览同步；真实外部账号验收单列 |
| `design-previews/` 开发预览 | 16 个 HTML 页面；共用导航、会话、主题与字号；模型目录连接、可选真实文本聊天及本机上线清单 | 默认演示；OpenAI/Anthropic/Google/OpenRouter/Ollama 可显式选择发送真实文本。添加菜单可生成真实本机清单；其他预检示例、改动审阅、阶段、记忆和健康仍为示例，无文件写入或后台监控 |

桌面与预览复用 API Key、OpenRouter OAuth PKCE 和本机 Ollama 的连接实现；目录成功不代表推理成功。正式桌面默认临时保存，可明确选择 Windows 系统凭据库；重启后点击重新连接，再选择模型。独立“推理测试”只在点击后发送简短请求，可能产生费用。预览仍使用内存凭据。桌面经 Tauri IPC 与自身拥有的 Node 进程通信，不依赖 5501 预览服务器。

真实聊天：先在设置连接服务，再从工作台/完整聊天输入框的模型菜单选择模型，最后手动发送。普通文本路径不自动读取项目或引用文件；正式桌面可显式附加资料，OpenAI 还可单独授权只读项目工具及摘要分享。请求可能产生服务商费用。支持流式、停止、保留部分回复和手动重试；不自动重试付费请求。Anthropic 使用 Messages，Google 使用 Generate Content；Google 目录筛选支持 generateContent 的条目，目录中的模型不保证适合纯文本输出，不能把目录成功当成推理测试通过。文本适配验收见 [接入记录](design-previews/research/anthropic-google-chat-report.md)。

停止会关闭本应用请求及上游连接，不承诺远端立即停止计算或计费。完整聊天页 `chat-full.html` 与工作台快速对话 `main-four-region.html` 共享同源 IndexedDB 会话、消息、独立草稿和阅读状态，刷新或重开可恢复。两页交接前停止当前生成并提交存档，失败时保留当前页供恢复。浏览器预览没有模型工具调用；该能力仅在正式桌面的可信项目绑定下提供。正式桌面已有显式项目记忆，浏览器预览的记忆仍为示例。两端均没有云同步、自动提取记忆或 ChatGPT/Claude 订阅 OAuth。外部厂商真实账号授权尚未验证。

从**仓库根目录**启动预览（无需环境变量）：

```bash
node desktop/design-previews/_serve.mjs
```

浏览器打开 <http://127.0.0.1:5501/index.html>，模型设置为 <http://127.0.0.1:5501/settings.html#key>。真实目录连接会访问所选官方服务；规则预检仍在本机执行。不要把静态页面服务器部署为公共认证服务。

本轮调研与全功能评审见 [评审记录](design-previews/research/product-wide-review-report.md)、[官方依据](design-previews/research/product-wide-review-sources.md)；真实模型能力边界见 [模型连接记录](design-previews/research/model-connections-report.md)。

最新真实聊天切片与验证见 [文本流接入记录](design-previews/research/live-chat-report.md)，其能力说明优先于此前“聊天仍为固定演示”的历史记录。启动命令不变，无新增环境变量或依赖；修改后台后需要重启预览服务，并重新连接内存凭据。

**本机上线清单**：工作台或完整聊天的“＋ → 生成上线清单”，明确选择主体、敏感信息与服务器域名后提交。不需要模型密钥；复用 CLI/MCP 的 `runGuide`，展示适用项、条件自查项、官方来源及仓库记录的核验日期。工具成功仅表示清单已生成，不表示项目合规；不扫描项目文件、不实时联网核验，也不将清单自动发给模型。草稿和当前模型选择保留。详见 [本机工具记录](design-previews/research/local-guide-report.md)。

清单生成后可搜索规则、复制完整 Markdown、下载 `.md` 或导出原始 JSON。搜索仅过滤显示，导出包含全部条目；完整聊天页切换或刷新会话均保留搜索与阶段展开状态。下载提示仅表示已向浏览器发起请求。无需新增依赖、环境变量或重启服务，刷新页面即可加载本轮前端修改。文件与验证记录见 [清单成果记录](design-previews/research/guide-artifact-report.md)。

**会话历史**：只有事务提交完成后显示“已保存在此浏览器”（桌面为“已保存在此设备”）。保存包括独立草稿、编辑上下文、引用名称、模型选择元数据与消息；不包含模型密钥或 OAuth 凭据。刷新中断的回复保留已保存文本并标为停止，历史审批失效，不自动重发模型请求。历史搜索覆盖标题和消息正文，命中正文可定位原消息；不同浏览器、主机、端口以及 Tauri WebView 不共享记录。多窗口版本冲突保留当前内容，提供 JSON 备份及显式重新载入；存储不可用时可重试或选择临时使用，不清空原记录。浏览器清理数据、隐私模式或系统异常退出仍可能导致丢失。历史支持活动/已归档/全部筛选、归档和恢复；“数据与会话”支持备份下载及 Shipmate JSON 追加导入（20 MiB、200 会话上限）。导入先预览、后提交，保留当前会话与草稿，不执行历史工具或审批。若数据已保存但界面更新失败，必须重新载入，避免旧界面覆盖新存档。详见 [基础持久化验收](design-previews/research/session-persistence-report.md)、[跨入口接入验收](design-previews/research/session-surfaces-report.md) 和 [本轮数据管理验收](design-previews/research/product-continuity-delivery-20261020.md)。

**全功能竞品评审（2026-10-20 至 2026-10-21）**：对照 Codex、Claude、Cherry Studio、OpenClaw 的官方资料及实际公开截图，梳理聊天、连接授权、工具、成果、历史、设置、记忆和桌面分发等能力。复用现有技术栈和组件，落实归档恢复、备份追加导入、设置直达和异常恢复；无新依赖或环境变量。896 项自动化测试及 32 项 Windows 原生验收通过。浏览器已实测工作台与设置的数据路径，后续因本地浏览器访问被禁用，完整聊天页与最终焦点改动未完成浏览器复验；具体范围见 [调研决策](design-previews/research/product-competitive-review-20261020.md) 与 [交付证据](design-previews/research/product-continuity-delivery-20261020.md)。

**任务主页（2026-10-20）**：浏览器工作台和正式桌面统一使用“新任务 → 项目预检 / 上线清单 → 阅读结果 → 继续对话”的路径。左侧显示真实会话、历史搜索和设置，示例阶段归入设计目录；右侧工具/审阅按需展开。正式桌面预检可选择本地项目，浏览器清单复用真实本机规则，浏览器预检入口明确说明桌面端边界。两项本机工具无需模型密钥。813 项测试、21 项原生回归及浏览器浅深色/窄屏证据见 [任务主页验收](design-previews/research/task-home-review.md)。

**开源组件与工作台（2026-10-20）**：首页补齐模型连接、当前成果入口，统一 880px 工作台与 704px 对话宽度。成果入口由实际成功且有效的结果驱动，空会话不显示“回到最新消息”。开源菜单负责键盘与焦点，打开业务弹窗后可返回原入口。822 项测试、22 项 Windows 原生验收、浏览器浅深色/320–1280px 检查及依赖审计见 [本轮验收](design-previews/research/component-workbench-review.md)。重建本地组件资源运行 `npm --prefix desktop run build:ui-kit`；正常启动不需要联网加载组件或新增环境变量。

**设置与业务弹窗标准化（2026-10-20）**：凭据、确认、历史、重命名和正式桌面模型连接复用同一套 Web Awesome 操作按钮，保留原生弹窗及输入语义。修复组件首次渲染焦点、真实禁用、显隐读屏名称及链接样式；828 项测试、24 项 Windows 原生验收和浏览器截图见 [标准化验收记录](design-previews/research/settings-dialog-standardization-report.md)。无新增依赖或环境变量，前端预览刷新即可加载；桌面需重新构建。

**模型授权补齐（2026-10-20）**：OpenRouter 支持 API Key、浏览器回调授权及一次性授权码三种连接方式。授权码模式采用官方无回调 PKCE S256 流程；等待中的链接可在刷新页面或重新打开设置后恢复，授权码输入不持久化。两端统一过期提示、取消、失败重试和连接后的模型目录。无新依赖、客户端密钥或环境变量；后台变更需重启预览，桌面需重新构建。860 项测试、27 项 Windows 原生验收、浏览器实测与安全边界见 [授权验收记录](design-previews/research/model-auth-completion-report.md)。自动化使用隔离的协议模拟服务，未完成外部厂商真实账号授权；凭据仍只保存在进程内存。

**桌面聊天与报告**：点击“模型连接”连接服务并选模，再手动发送。未选择模型时保留草稿并打开连接面板，绝不回退为演示答案。报告须点击“加入当前会话”才入库，保留草稿；后续聊天仍保留之前的真实对话，报告不会自动发送给模型。应用重启恢复历史、草稿与模型选择，内存凭据需重新连接。无需环境变量或新增生产依赖。浏览器 `npm --prefix desktop run dev` 仅可检查布局，真实模型 IPC 与项目工具须运行 Tauri。最新证据见 [桌面模型验收](design-previews/research/desktop-model-integration-report.md)。

## 技术栈

最新正式桌面布局采用单层导航、704px 阅读区域和按需打开的项目工具栏，窄窗口改为可关闭抽屉。关闭、刷新、重试等操作复用统一图标。真实截图、修改文件与 15 项原生回归 / 3 项本机模型验证见 [布局与组件验收](design-previews/research/desktop-layout-refinement-report.md)。

2026-10-20 的细节调整将输入区模型快选与连接设置分开，报告复用安全 Markdown 展示，减少消息重复标签并统一运行记录图标、错误反馈和键盘焦点。社区原图逐项对照、修改文件及 794 项测试 / 16 项原生回归 / 3 项真实本机模型验证见 [社区截图与细节验收](design-previews/research/community-detail-alignment-review.md)。

随后一轮收紧设置内容宽度，统一历史搜索、重命名与凭据弹窗的层级和图标，补齐清空搜索、键盘选择、行内错误与模型目录更新后的焦点恢复。本轮 798 项测试、18 项原生回归、浏览器行为与浅深色/窄屏截图验收见 [设置与历史细节验收](design-previews/research/settings-history-detail-review.md)；原生回归使用明确标记的上游协议 fixture。

- 外壳：**Tauri 2**（Rust 后端 + WebView 前端），见 `docs/07` 的选型论证（包体/内存/安全模型）。
- 前端：TypeScript + Vite；设置工作区已使用 React 19、shadcn/ui（Base UI）及 Tailwind 4，其他模块保持现有实现。设置组件源码在 `src/components/ui`，样式限定范围且不加载全局 Preflight。迁移范围、许可及验收见 [设置 React 迁移记录](design-previews/research/settings-react-migration-20261025.md)。
- 模型调用：Tauri Channel → 受控 Node 子进程 → 既有连接 broker/提供方适配；固定厂商或受限自定义目的地、CSRF、私有系统凭据通道、贯通取消与退出清理。
- 大脑调用：Rust `std::process::Command` 使用应用资源目录中的 `runtime/node.exe` 和固定脚本；不回退到 PATH Node 或编译期源码路径。
- 文件夹选择：`@tauri-apps/plugin-dialog`。

## 本地开发

开发前置：受支持的 Node LTS（建议 Node 24）、Rust（cargo）、Windows 上的 WebView2，以及根目录和 desktop 的 npm 依赖。当前运行时包只面向 Windows x64；其他平台需独立准备对应运行时。

```bash
cd desktop
npm install
npm run tauri dev      # 编译 Rust 后端并启动桌面窗口（首次编译较慢）
```

`tauri dev/build` 自动运行 `prepare:runtime`。首次从 Node 官方地址下载二进制与完整许可，校验后缓存到 `.omx/cache/node-runtime/`；后续缓存命中可离线准备。校验失败会终止准备并保留上次完整资源包。`desktop/runtime-lock.json` 记录版本和摘要，`runtime/runtime-manifest.json` 记录打包文件摘要，不把摘要清单当作运行期防篡改签名。

构建 Windows 安装包：`npm --prefix desktop run tauri -- build --bundles nsis`（仓库根目录）。运行无新增环境变量；API 密钥通过模型连接输入，选择临时或 Windows 系统保存。新凭据替换原连接，保存失败不会回退明文。删除只移除本机凭据，不等于撤销厂商远端 API key。正式分发、代码签名和更新属于后续门禁。

> 预检仍在本机执行；主动发送模型消息时，当前真实聊天上下文会提交给所选服务商。项目源码和加入会话的工具报告不会自动上传。
> 输入区“＋”可显式选择当前项目的报告、文本文件或已允许引用的记忆。报告和文件采用所选快照，记忆在发送及重试时重新读取并校验。移除引用、停用或删除记忆可阻止后续附加，不能撤回已外发数据；引用选择仅本次应用内保留，重启后需重选，已保存的项目记忆仍保留在本机。
> OpenAI 的“项目工具”权限与上述资料选择独立。允许读取项目不等于允许外发结果；摘要分享须另行开启，且不发送项目目录、原始代码或 stderr。
> 报告只是「待你确认」的导航建议，不构成合规担保。

## Windows 原生自动化

正式桌面的主题层级、输入框与消息气泡使用固定版本 Open Claude UI 的可控 CSS 子集，完整 MIT 许可随样式分发；该聊天样式移植没有引入其整套运行时。后续设置页单独引入 React 与 Base UI。采用范围和不采用的演示逻辑见 [源码复核与移植记录](design-previews/research/open-claude-source-adoption-20261023.md)。默认原生验收包含明暗主题、320/390/1000/1440px 聊天布局、真实键盘长草稿、焦点和窄窗发送。

从仓库根目录运行（驱动仅安装到忽略的 `.omx/artifacts/desktop-model-native/tools`）：

```powershell
powershell -NoProfile -File scripts/setup-desktop-native-e2e.ps1
npm --prefix desktop run tauri -- build --debug --no-bundle
node scripts/desktop-native-e2e.mjs
node scripts/desktop-native-e2e.mjs --isolated-runtime
node scripts/desktop-native-e2e.mjs --real-ollama
node scripts/desktop-native-e2e.mjs --release-smoke "--application=C:\path\desktop.exe"
```

前两步准备匹配 WebView2 的驱动和当前源码 exe。构建前先关闭测试应用，避免 Windows 文件锁。
默认测试用隔离的 WebView2 存档和明确标记的 Ollama、OpenRouter 授权协议 fixture，只在测试子进程中重定向上游网络，不改生产实现，也不占用或关闭你的 Ollama。`--real-ollama` 单独连接已有本机模型，不下载模型；它验证真实推理，不能替代外部厂商账户验收。
`--isolated-runtime` 复制当前 exe 与运行时到临时中文/空格目录，并从子进程 PATH 移除开发工具路径。测试专用的慢工具和缺资源场景只修改隔离副本，结束后恢复；不修改产品资源。Debug broker 允许既有协议 fixture 的 `NODE_OPTIONS`，release 一律清除；CLI 两种构建均清除。

`--release-smoke` 指向实际安装的 exe，验证无模型账号的清单、拒因、连接目录、权限和关窗清理，不修改安装目录。`--real-ollama --application=...` 可单独验证安装版连接已有本机模型。当前本机安装版两组分别通过 7 项和 4 项检查；不代表外部厂商账号授权已通过。

截图与 JSON 断言记录在 `.omx/artifacts/desktop-model-native/run-*`。原生 WebView2 验收不覆盖 Windows 文件选择器；迁移目录与清理 PATH 不等于无开发工具的干净 Windows 虚拟机。
