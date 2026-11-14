# 流式输出与图标标准化交付记录

日期：2026-10-13。范围：设计预览的完整对话、四区工作台、组件展示页及其共享模块。以用户本轮 Codex 截图中的「正文 → 紧凑执行行 → 后续正文」为主要视觉依据。

## 结果与技术选择

- 工具开始、工具结果、文本分段按事件顺序展示。工具行默认收起；运行、成功、失败、取消分别有图标和文本，不能仅凭颜色辨认。
- 工具完成与整条回复完成独立：工具已经成功后停止回复，不会把工具误改为取消；工具尚未开始时停止，不会伪造执行记录。
- 流式和终态共用安全段落渲染，保留已有段落节点；准备中、生成中、停止、错误的忙碌语义与按钮同步。停止保留输出，可重新生成；失败可按错误属性重试。
- Lucide 官方有限 SVG 子集替代字符图标、重复 SVG 工厂和 CSS 绘制箭头。统一 24 viewBox、1.75 描边、默认 18px，消息操作按组件尺寸覆盖。装饰图标不进入无障碍名称，按钮提供中文名称与原生 title。
- 保留原生 JavaScript、dialog / popover / details 和已有控制器；没有安装 React、shadcn 或另一套聊天运行时。当前需求可在共享组件内完成，引入 React 组件库需要额外迁移，不能直接把示例 JSX 放入现有页面。

## 实际调研依据

本轮已读取以下官方页面；借鉴状态和展示原则，不声称使用了这些框架的运行时或协议。

| 来源 | 使用方式 |
| --- | --- |
| [AI SDK Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) | 明确准备、流式、完成、错误状态，以及停止和重新生成入口。 |
| [AI SDK 工具交互](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage) | 使用明确的工具开始/结果数据更新工具部分；结果顺序不由自然语言判断。 |
| [AI Elements Tool](https://elements.ai-sdk.dev/components/tool) | 工具摘要行、状态与可折叠详情的组件职责。 |
| [assistant-ui Thread](https://www.assistant-ui.com/elements/thread) | 消息操作、流式阅读与滚动行为的组合方式。 |
| [Lucide 官方指南](https://lucide.dev/guide/lucide) | 复用官方 SVG，统一外观与无障碍边界。具体源码版本及许可证见组件目录的 LUCIDE-SOURCE.md、LUCIDE-LICENSE。 |

Codex / Claude 官方产品图及观察记录沿用 [conversation-alignment-report.md](./conversation-alignment-report.md)。本轮用户截图是新增视觉依据。没有复制闭源产品源码，也没有模拟截图中不存在于本项目的浏览器、文件编辑或子 Agent 执行能力。

## Changed Files

以下为本轮文件；工作区其他已有改动保留，未回滚、提交或部署。

- `conversation.js`：按顺序发送工具事件；修复停止状态、计划创建失败的运行身份；增量更新正文与 live region。
- `conversation.css`：运行中保留状态播报，避免重复可见进度条。
- `components/message.js`、`message.css`：正文/工具 parts、稳定段落节点、单一行内进度、统一消息图标、停止后操作。
- `components/presentation.js`：统一生成状态、空输出停止与不可重试错误的文案。
- `components/icons.js`、`lucide-icons.js`、`icons.css`、`LUCIDE-LICENSE`、`LUCIDE-SOURCE.md`：32 个官方图标子集、名称白名单、安全属性编码与来源记录。
- `components/composer.js`、`composer.css`：共享图标；发送/停止只显示对应一个图标；标题、名称与当前状态一致。
- `ui.js`、`ui.css`：菜单、选中标记、命令搜索、弹窗关闭图标；工作方式名称和悬停提示同步。
- `chat.js`、`responsive.js`、`chat-full.html`、`main-four-region.html`：引用移除、面板关闭、页面工具栏和阶段入口采用标准图标。
- `tests/conversation.test.mjs`、`tests/component-presentation.test.mjs`、新增 `tests/stream-presentation.test.mjs`：事件顺序、终态、运行隔离、安全文本、节点稳定性、动作名称和图标白名单回归。
- `research/stream-icon-standardization-plan.md`、本记录：修改前计划、来源与验证证据。

## Verification

- 基线定向 24 项通过；新增回归先暴露缺失渲染函数、初始工具状态与计划失败身份问题，再修复。
- `npm test`：规则验证及全量 **276/276** 测试通过。
- 最后图标/名称修正后，`node --test tests/conversation.test.mjs tests/component-presentation.test.mjs tests/stream-presentation.test.mjs tests/chat-menus.test.mjs`：**32/32** 通过。
- `npm run lint` 与预览模块显式 `eslint --no-ignore` 通过。旧式页面脚本按浏览器 globals 执行显式 lint。
- 修改的 5 份 CSS 经 PostCSS 解析通过。`desktop` 下 `npm run build` 的 TypeScript 和 Vite 构建通过；设计预览不属于该产物，另外使用真实浏览器验证。
- `git diff --check` 通过；存在仓库原有 CRLF 转换提示，没有空白错误。
- 独立审查结论 APPROVE：无确认的阻断问题。最后微调只涉及字符图标替换与名称顺序，随后补跑定向测试、lint 和浏览器验证。
- 真实浏览器：首字前停止、工具中停止、工具成功后停止、失败后重试成功、复制、展开工具、阅读时不自动拉到底、菜单 Esc 和选择后的焦点恢复、命令对话框搜索/关闭。深色桌面 1280×720 与浅色 390×844 检查无横向溢出，输入框/停止入口在视口内；检查页无 warn/error。
- 截图：`.omx/state/stream-icons/streaming-dark.png`、`interleaved-stream.png`、`mobile-stream-light.png`、`final-interleaved.png`。视觉迭代与结论保存在同目录 `ralph-progress.json`；仅为证据文件，没有启动 OMX runtime。

## Fix Register

| ID | Severity | Disposition | Owner | Approver | Due/Expiry | Action | Verification | Tracking ID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | medium | fixed | root | independent review | 本轮已完成 | 流式段落与终态一致，保留节点 | 节点身份与安全文本测试 | stream-presentation |
| S-02 | medium | fixed | root | independent review | 本轮已完成 | 工具与回复终态分离，计划失败创建新运行 | 控制器测试、浏览器停止/重试 | conversation |
| S-03 | medium | fixed | root | independent review | 本轮已完成 | 准备/生成忙碌状态同步，避免重复进度 | 消息测试、浏览器 | presentation |
| I-01 | low | fixed | icon agent / root | root verification | 本轮已完成 | Lucide 图标共用与低优先级基础样式，避免发送/停止同时显示 | 白名单测试、真实样式检查 | icons |
| I-02 | low | fixed | root | root verification | 本轮已完成 | 菜单/搜索残留字符替换，名称/title 同步 | 最后 32 项回归、菜单焦点实测 | ui |

## Quality Profile / Delivery Gate

- Source/status：discovered；根及 desktop 的 package.json、现有测试、`.github/workflows/ci.yml`，结合全局质量规则。未发现项目专属质量 profile。
- Decision：PASS（本轮预览标准化范围）。Risk：high（共享前端影响多页）。Release status：local-ready。
- DQ-00/01/02/04/05/06/07/08/10：PASS。DQ-03 无延期例外；DQ-09/11 不适用，本轮没有部署、真实模型或概率性逻辑变更。
- 非功能证据：节点复用测试、窄屏/键盘/减少动效的实现检查；没有声称达到不存在的性能阈值或完成正式 WCAG 审计。
- 安全/来源：文本使用 textContent、图标名称白名单和属性编码，固定结果沿用现有校验；无新增 npm 依赖或远程运行时代码，保留上游许可证。独立检查未发现本轮新增安全阻断。
- 数据与兼容：仅内存中的本地演示对象与页面 DOM；保留原 text/tool 消息兼容路径。截图仅包含固定示例，无账户或用户项目数据，无迁移。
- CI：发现 lint/test/verify:quotes/coverage/build:mcpb 的跨系统和 Node 版本矩阵，但本轮没有提交或执行远程 CI；不声明 CI-ready / release-ready。
- Recovery：只撤销本轮明确改动，保留原有未提交内容；无数据迁移或外部副作用，未做发布回退演练。
- Remaining blockers：本轮范围无；真实模型接入属于后续实现范围。

## 启动与已知边界

仓库根目录运行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/chat-full.html` 或 `main-four-region.html`。无需环境变量；现有 5501 服务可直接预览。

当前是明确标注的本地确定性演示：一个固定工具、定时文本片段、内存记录和固定结果卡。未实现真实模型 SSE、持久化、文件操作、多 Agent 或模型生成的 Markdown/代码块；当前流式正文仍是安全纯文本段落。鼠标提示使用原生 title，没有引入新 tooltip 框架。实体手机软键盘、屏幕阅读器设备与跨浏览器矩阵未验证，也不声称与 Codex / Claude 逐像素一致。

## 追加：执行中文字渐变

2026-10-13 用户追加要求后，仅修改共享 `components/message.css`：为运行中工具的标题/状态及准备/生成提示增加 2.4 秒中性文字扫光。复用主题 `--text-3` / `--text`，不使用透明渐变端点，不引入依赖、重复文本或 JS 计时器。终态选择器不匹配，自动恢复实色。

验证：24/24 既有状态与渲染测试通过，CSS 解析及 diff 检查通过。真实浏览器确认深浅主题渐变值、背景位置随时间变化；working/streaming 启用动画，success/fail/canceled 均为 `animation: none; background-image: none`。无控制台 warn/error。截图为 `.omx/state/stream-icons/shimmer-dark.png` 和 `shimmer-light.png`。

独立只读审查确认状态选择器、主题颜色及降级方案。减少动态效果、高对比及不支持文字裁切的环境通过 CSS 条件保留实色；本轮未切换系统无障碍设置做设备验证。该追加变更风险 low，结论 PASS / local-ready；质量依据和能力边界沿用本记录，未重复运行与 CSS 无关的完整构建或 CI。

后续按用户要求去掉重复旋转圈：渐变条件生效时，隐藏同一状态行的 spinner 并停止其动画。仅新增共享 message.css 的条件样式，未改变运行逻辑；无渐变环境保持原降级表现。独立只读审查通过；CSS 解析通过。真实浏览器确认 running/working/streaming 文字继续渐变且图标 `display:none; animation:none`，success/fail/canceled 图标仍显示且文字无动画。控制台无 warn/error，截图 `shimmer-without-spinner.png`。该小幅样式调整结论 PASS / local-ready，既有系统模式验证限制不变。
