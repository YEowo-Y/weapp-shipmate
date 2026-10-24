# 组件标准化执行与验收

日期：2026-10-13。当前范围覆盖全部 16 个设计预览入口、共用聊天组件及正式 Tauri 入口的控件逻辑。本记录取代早期“仅两页与组件验收页”的范围说明。

最新代码记录：2026-10-17 [对话框成熟基础能力](research/dialog-foundation-report.md)，以 Floating UI 替换手写菜单定位，统一键盘/焦点/长内容弹窗，修复输入法、销毁和 bfcache；393项测试通过。[会话导航与连续性](research/session-experience-report.md) 包含会话搜索/重命名、草稿引用与场景恢复、真实空状态；此前 [Agent 对话体验](research/agent-experience-report.md) 包含安全 Markdown、稳定流式正文、复制反馈与窄栏输入区。另见 [次级界面组件收敛](research/surface-standardization-report.md) 和 [产品路径整改](research/product-journey-report.md)。当前轮次按用户选择只进行代码与自动化验证，真实浏览器验收受阻。以下截图与浏览器结论均属于各自注明日期的历史版本，不代表最新代码已完成视觉验收。

## 2026-10-13：对话框续改

针对“原生语义有了，产品交互仍未标准化”的反馈，完成 [Codex / Claude 官方交互调研](research/codex-claude-dialog-reference.md) 与 [改造计划](research/dialog-refinement-plan.md)。这一轮仅修改设计预览；正式 Tauri 入口与后端未动。

- `ui.js/css`：工作方式、附件、更多使用共享原生 popover；方向键只移动焦点，Enter/Space 选择。确认框、命令搜索、文件阅读分别布局，确认默认焦点为取消；遮罩点击与内容留白点击区分。原生 dialog 保持页面交互隔离，关闭后恢复可用焦点。
- `preview.js`：统一 Ctrl/Cmd+K、Ctrl/Cmd+Shift+P；`ui.js` 提供 Ctrl+Shift+M，已有确认层打开时不叠加命令菜单。可撤销的演示拒绝/撤销直接执行；批准保留明确确认。
- `chat.js`、`chat-full.html`、`components/composer.js`：删除独立附件弹层，补全锚定输入区并与菜单互斥。修复筛选后选中隐藏旧项；支持空结果、IME 防误触与按光标位置解析。补全期间隐藏会遮挡选项的悬浮入口。
- `components/composer.css`、`message.css`、`conversation.css`：统一正文、留白、输入区边框与工具按钮；删除大面积焦点光晕及重复边框。移动输入保留 16px 字号。
- `responsive.js/css`：统一移动审批的描述、关闭与遮罩约定。批准后焦点进入撤销；拒绝后进入重新生成；Escape 逐层关闭确认与审阅面板。
- `tests/chat-menus.test.mjs`：新增 6 项补全回归，先复现隐藏项激活错误再修复。

续改验证：全量 **265/265**，根 lint 与显式预览 lint 通过；主工作台、完整聊天、独立命令、差异审阅、组件验收页均实际操作。检查 320/768/1440px 与明暗主题；768×640 命令面板曾溢出底部，已修正顶部留白与最大高度的共同计算。320px 引用列表五项的中心点击命中全部正确；审批、撤销、拒绝和两层 Escape 焦点通过。成功输出、停止、失败重试后再停止通过。所测本地页控制台无 warning/error。独立增量审查 APPROVE。

截图和迭代证据：`.omx/state/dialog-refinement/`。未运行真实 Codex/Claude 客户端，未提取私有源码；文件阅读 `openFiles` 的样式/API 已分型，但当前产品入口仍跳到完整差异页，文件弹窗不作为本轮已完成浏览器验收的用户路径。以下其余记录属于前一轮全项目基础控件整改。

## 选型与清理依据

仓库已有原生 JS/CSS 预览、Vite/TypeScript/Tauri 桌面壳与可复用的规则检查核心，没有 React 聊天运行时。用户已允许必要时安装 React/shadcn；本轮基础控件可以用标准 HTML 控件完成，未增加应用依赖或迁移框架。业务消息、结果和审批继续使用共享组件，不再各页维护重复版本。

修改前先运行既有对话/结果测试并记录清理计划：[全项目计划与实施映射](research/component-native-plan.md)、[REA 工具卡专项](research/rea-component-extraction.md)。正式端控件先锁定原有行为，再补取消、错误、并发与报告失效回归。没有改模型接入、规则核心或引入第二套事件协议。

## 实际修改与简化

| 文件或入口 | 修改 |
| --- | --- |
| `components/message.js`、`presentation.js`、`message.css` | 消息、工具、结构化结果、审批、运行记录与动作共享；工具参数、结果、错误和摘要分区，成功结果需通过校验。长结果限高、可聚焦、可滚动。 |
| `components/composer.*`、`review.*` | 主工作台、完整聊天与验收页复用输入框、发送/停止、工作方式、审批及差异组件。 |
| `conversation.js`、`main.js`、`chat.js` | 显式运行状态；保留停止内容与独立重试。消息更新保存展开、焦点、结果内部滚动；阅读详情时固定阅读位置，点击最新消息恢复跟随。 |
| `settings.html`、`first-run.html`、`main-four-region.html`、`components/native-controls.css` | 18 个模拟开关替换为原生 checkbox；设置和首启共 6 组互斥选项改为 radio/fieldset/legend；明确禁用状态、标签与焦点。 |
| `ui.js`、`ui.css`、`command-palette.html` | 统一轻量 popover 与分型原生 dialog；工作方式在菜单中明确选择，不在方向键移动时提交。删除手写 Tab 困焦和重复命令面板实现；命令结果使用真实链接，关闭后归还可用触发器焦点。 |
| `audit.html`、`category-advisor.html`、`stage-workspace.html`、`main-four-region.html` | 证据引用、类目详情、FAQ、阶段导航改为原生 details/summary；阶段分组使用标准互斥折叠。删除模拟展开脚本。 |
| `health-dashboard.html`、`guided-step.html`、`memory.html`、`explain.html`、`chat-full.html` | 导航用链接、动作用按钮，补齐输入标签；复制动作等待真实剪贴板结果，并区分成功、失败与不可用。 |
| `preview.js`、`index.html`、各页面主题脚本 | 统一 system/light/dark 偏好；跟随系统不再被页面点击或其他状态同步覆盖。删除 11 页及两个适配器的重复主题事件。删除模拟控件键盘与 ARIA 补丁。 |
| `app.css`、`main.css`、`conversation.css`、`responsive.*`、`gallery.css` | 共用语义色、原生色彩模式、焦点样式与间距；移除模拟开关和重复输入/审批样式，适配移动抽屉及输入区高度。 |
| `component-showcase.html`、`components/showcase.*` | 使用预览同一份源码，提供成功、失败、超时、工具四态、审批终态的可操作验收入口。 |
| `desktop/src/main.ts`、`styles.css`、`desktop/index.html` | 保留 Tauri 原生文件选择。任务执行互斥、忙碌禁用、取消/错误恢复；主体或文件夹变化使旧报告失效，增加报告区域名称、状态通知、焦点与窄屏样式。 |
| `tests/component-presentation.test.mjs`、`conversation.test.mjs`、`demo-result.test.mjs`、`desktop-controls.test.mjs` | 覆盖状态与输出边界、取消/重试/迟到事件、结构化校验和正式桌面入口控件行为。 |

没有将模拟执行包装成真实扫描；审批仍明确是本地演示状态，不代表已经写入文件。

## 真实调研

使用隔离安装的 REA 6.4.0 实际分析 assistant-ui、Cherry Studio、OpenClaw、Hermes 的限定官方源码片段，并保存固定 SHA、许可证、输入哈希与 Evidence ID。[产品调研与代码映射](research/agent-product-reference.md) 区分浏览器观察、源码确认和推断。

assistant-ui Tool call 官方页面实际展开验证过 Request/Result。其余三个产品只完成限定源码静态分析，未运行整个产品。Cherry 的 AGPL 代码未复制到项目；Hermes 此处是终端 TUI 架构，不当作 DOM 聊天组件库引入。没有声称逆向或完整复刻 Codex/Claude。

## 启动

仓库根目录：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/component-showcase.html` 或 `main-four-region.html`。预览服务仅监听回环地址，无新增环境变量。

桌面 Web 外壳：在 `desktop` 目录运行 `npm run dev -- --host 127.0.0.1 --port 5502`。真实文件选择与本地检查需要 Tauri 宿主，使用项目原有的 `npm run tauri dev`；仅在浏览器打开 Vite 页面无法提供 Tauri 原生能力。

## 验证结果

- `npm test`：259/259，通过，0 失败、0 跳过；schema 与 63 条规则、8 阶段校验通过。
- `npm run lint`：通过。预览被默认忽略，另按模块/旧浏览器脚本分组使用 `eslint --no-ignore`，通过；页面内联脚本解析通过。
- `desktop` 的 `npm run build`：TypeScript 与 Vite 构建通过。该构建只证明正式 Web 外壳，不代替预览检查或 Rust/Tauri 原生运行验证。
- `git diff --check`：通过；仅有现存 CRLF→LF 提示，无空白错误。
- 全部 16 个预览页分别在 320、768、1280px 检查，无页面级横向溢出；1440px 额外检查主工作台。桌面全页控件扫描未发现重复 ID、未命名表单控件/按钮、`href="#"` 或非原生 button/radio/switch（不计不可交互的示意背景）。正式外壳 320px 也无溢出。
- 浏览器键盘验证 checkbox 的 Space、radio 的方向键、阶段/引用/类目/FAQ 的折叠；首启所选路径正确。工作方式现已改为菜单：Escape 不提交，Enter 选择后更新标签并归还焦点；命令搜索 Enter 导航、Escape 返回主界面。
- 主题深色选择与显示一致；“跟随系统”刷新后仍被选中。系统变化分支通过 VM 事件验证，未实际切换操作系统主题。
- 工具成功/失败/停止输出、失败后重试再停止均已实测；旧结果展开、焦点和内部滚动在新回复完成后保持。320px 下流式正文增长时详情位置变化约 2.4px，改造前约 237px；“回到最新”后剩余滚动距离为 0。
- 所测浏览器控制台无 warning/error。独立审查发现的主题冲突和结果滚动问题已修复，最终增量复审 APPROVE。

本地证据：`.omx/state/rea-components/` 中的 `all-pages-controls.json`、`all-pages-mobile.json`、`all-pages-tablet.json`、`reading-anchor.json`、截图与 `ralph-progress.json`。使用 App 原生子代理和浏览器验收，没有启动 OMX CLI 运行时。

## 已知边界

流式正文仍为安全纯文本/段落，尚未接入完整 Markdown 渲染器。Agent 对话、工具结果、审批为明确标记的本地演示；没有真实模型服务、Agent 后端鉴权、操作级审批绑定、网络幂等与持久化。本轮没有运行 Tauri 原生窗口、Rust sidecar、操作系统 IME、屏幕阅读器或手机软键盘。桌面控件测试模拟宿主返回值，不代替这些原生环境实测。

本轮完成已发现的不规范基础控件整改与限定范围验收，不把“获奖网站标准”表述为客观获奖保证，也不声称界面已不存在任何未来优化空间。

## 2026-10-13：按用户截图重做聊天输入框前端

本轮以用户提供的两张 Codex 截图为直接视觉基准；Claude 交互依据仍见 `research/codex-claude-dialog-reference.md`。没有取得 Claude 桌面截图，因此不声称逐像素复刻两款产品。

- `components/composer.js`、`composer.css`：32px 圆角、中性灰面板、约142px空白高度、16px输入文字；左侧加号和只读状态，右侧演示提供方/紫色模式与圆形发送/停止按钮。键盘说明保留为辅助文本。深浅主题与容器宽度适配共用一份实现。
- `ui.js`、`ui.css`：复用原生 popover 菜单，添加整宽锚定、6px间隔、分组图标行与同行说明、短屏内部滚动。模式菜单更新独立模式标签，保留键盘选择、关闭及焦点返回。
- `chat.js`、`chat-full.html`：独立 @ 按钮收进添加菜单；删除只提示“已选择”而不执行功能的假附件项，连接现有文件预览与引用选择器。
- `main.js`、`components/showcase.js`、`showcase.css`：三个挂载点统一占位文案，展示页移除重复内边距。
- `responsive.js`：滚动时同步复用既有浮条避让计算；菜单打开期间隐藏次要浮条，修复短屏滚动后遮挡输入框。
- `tests/chat-menus.test.mjs`：新增引用菜单移交与菜单行被移除后的事件回归测试。

验证：`npm test` 267/267；`npm run lint` 与按模块分组的预览显式 ESLint 通过；3份CSS解析与diff空白检查通过。真实浏览器覆盖主工作台、完整聊天、组件展示页；检查1440px桌面、320px窄屏、1024×600和700×450短窗口、深浅主题、菜单宽度和6px间距、方向键/Enter/Tab/Escape、引用选择、模式标签、文件/命令弹窗以及发送/停止。浮条遮挡在第二轮修复并复验；两轮独立代码审查通过。

启动仍是仓库根目录 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/main-four-region.html`。无新增依赖或环境变量。本轮范围是设计预览；模型、工具结果和文件均为明确标记的本地演示，没有实现语音、真实上传、在线模型或后台权限。截图与迭代证据保存于 `.omx/state/composer-visual/`。

## 2026-10-13：整体对话与组件再次对齐

已补充实际查看 Codex 工作区与执行记录、Claude 2026 产品图及历史 Artifacts 并排截图，详见 [来源与交付记录](research/conversation-alignment-report.md)。

统一三个 Agent 预览页的中性色、阅读密度、任务标题、工具记录、消息图标操作、结果与审批、原生弹窗。删除重复标题与空闲状态提示；保留复制和编辑反馈。修复矮屏与移动端高度、侧栏留白、审阅按钮及关闭图标问题。继续复用原生控件与共享源码，无新增依赖。

最终验证：268/268 全量测试、仓库 lint、修改模块显式 ESLint、6份CSS解析通过；1280×720、390×844、1024×600、1120×720 浏览器检查通过。流式部分停止、复制、编辑、工具失败、菜单关闭焦点与移动审批均实测。独立审查无剩余发现。原型能力边界不变。
