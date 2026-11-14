# 社区真实截图对照与桌面细节验收

日期：2026-10-20。范围：正式 Tauri 桌面端的模型快选、连接设置、对话信息层级、工具报告，以及对应的键盘、错误和窄窗口路径。共享消息组件的回归也包含在本轮测试中。

本轮继续使用 Vanilla TypeScript、原生 dialog/popover、Floating UI、现有安全 Markdown renderer 和统一图标。没有增加依赖、迁移框架、修改认证协议或执行部署。

## 真实参考来源

下面的图片均已实际查看。帖子日期、明确标出的版本和可直接观察的视觉事实分开记录；截图不能证明当前所有版本的行为，更不能证明后台能力。图片仅作为研究材料保存在忽略目录，不随产品分发。

| 产品与来源 | 日期 / 版本 | 图片中的可观察细节 | 本项目的取舍 |
| --- | --- | --- | --- |
| [Codex 社区开发日志](https://polynomeer.github.io/posts/2026-02-27-TIL/) · [原图](https://polynomeer.github.io/assets/img/posts/codex-desktop.png) | 2026-02-27；未注明版本 | Edited / Ran 等执行记录紧凑；正文与辅助信息有层级；审批选项靠近对应动作 | 减少每条消息重复的传输标签；执行详情保留在可展开记录中 |
| [Claude Desktop 社区问题](https://github.com/anthropics/claude-code/issues/67539) · [原图](https://github.com/user-attachments/assets/8d33bc58-f6ac-4063-93d2-3ec8c1aa01b4) | 2026-06-11；未注明版本 | 用户气泡与助手正文区分；文件侧栏可独立关闭；输入区与工具行分层 | 保留有宽度上限的正文和输入区；侧栏按需打开。帖子提出保存偏好布局的需求，不据此宣称 Claude 已支持该行为 |
| [OpenClaw / gVisor 实践文章](https://gvisor.dev/blog/2026/04/15/magi-multi-agent-gvisor-isolation/) · [原图](https://gvisor.dev/assets/images/2026-04-15-magi/openclaw-ui.png) | 2026-04-15；图中 v2026.4.2 | 用户内容靠右；工具结果使用可展开条目；代码有独立操作区 | 统一执行记录的展开图标，结果按 Markdown 结构展示；不引入无执行实现的工具入口 |
| [Cherry Studio 模型目录问题](https://github.com/CherryHQ/cherry-studio/issues/20181) · [原图](https://github.com/user-attachments/assets/be2cca6b-5d76-45b6-b197-64a191747cef) | 2026-09-07；Windows v2.0.12 | 厂商品牌、分组目录、轻边界、模型能力标记 | 复用已有品牌资产，快选显示厂商与选中勾号；不添加未经过能力验证的模型徽章 |
| [Cherry Studio 对话重试问题](https://github.com/CherryHQ/cherry-studio/issues/21128) · [原图](https://github.com/user-attachments/assets/ee16c0e9-f96d-4672-9d96-e91b9fa1d32b) | 2026-09-28；macOS v2.1.2 | 对话操作使用低强调线性图标；成功反馈有明确状态色 | 对齐图标与反馈层级。帖子报告多模型重试选错模型，作为回归风险参考，不把问题描述当成正确设计 |

行为与组件边界另参考 [Claude Desktop 官方文档](https://code.claude.com/docs/en/desktop)、[Cherry Studio 聊天预览](https://cherryai.com/docs/en/cherrystudio/preview/chat/) 和 [模型服务设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)。

REA 的既有提炼见 [组件研究](rea-component-extraction.md)。本轮复用此前提炼的组件职责与状态边界，没有重新运行 REA，也没有复制闭源客户端代码。

## 逐项对照

“保留并验收”表示该项此前已经实现，本轮验证了它与新变化兼容。

| 细节 | 本轮处理 | 证据 |
| --- | --- | --- |
| 导航密度 | 保留单层页头，宽屏避免重复导航条；窄屏允许会话行换行 | 原生尺寸断言、空状态截图 |
| 对话宽度 | 保留正文与输入区 704px 上限，窄窗口使用可用宽度 | 800 / 900 / 1000 / 1280px 宽度测量 |
| 输入区高度 | 保留约 107px 的基础高度和独立操作行 | 原生布局测量 |
| 空状态 | 删除额外眉题与提示层，只保留标题和一段下一步说明 | `empty-390x500.png` |
| 用户与助手内容 | 保留用户轻气泡、助手无外框正文 | `streaming.png` |
| 重复模型标签 | 新消息不再显示重复的“真实模型回复 / 真实文本请求”标签；模型和来源仍可在运行记录查看 | 会话回归测试、原生记录展开断言 |
| 历史语义 | 不改写已保存的旧标签；编辑分支与本地 / 演示来源保留 | 会话连续性回归 |
| 运行记录图标 | 原生 disclosure 使用统一 chevron；展开时旋转 | 消息组件测试、截图 |
| 流式状态 | 保留文字渐变和停止按钮，不叠加加载转圈 | 原生增量与停止验收；现有减少动效规则 |
| 空回复操作 | 尚无可复制内容时不显示无效复制按钮 | 组件测试、失败状态原生断言 |
| 错误层级 | 紧凑中性错误区、轻量红色边线、明确重试；移除同一运行错误的重复底部提示 | `error-recovery.png`、重试验收 |
| 操作反馈 | 区分运行公告、未连接提示和复制等操作反馈，避免隐藏复制失败信息 | 会话连续性回归 |
| 模型入口职责 | 输入区打开轻量快选；页头“模型连接”打开完整设置 | 快选与设置测试、原生验收 |
| 模型搜索 | 搜索已连接模型，支持无匹配、加载失败与重试状态 | 6 项快选测试、原生搜索断言 |
| 当前模型 | 厂商品牌、名称与尾部勾号表达选中状态 | 快选及设置截图 |
| 键盘操作 | 搜索到选项的方向键、Enter 选择、Escape 关闭，关闭后回到触发按钮 | 单元与原生验收 |
| 目录刷新 | 保留现有选项焦点；该模型被移除时回到搜索框 | 新增焦点回归 |
| 设置初始焦点 | 已连接时搜索模型；未连接时凭据输入；Ollama 为连接操作；不抢走用户已移动的焦点 | 10 项设置测试 |
| 本地服务说明 | Ollama 明确无需 API Key、须先启动服务并下载模型 | 设置回归、窄窗口截图 |
| 连接恢复 | 成功选模后清除旧的“先连接模型”提示，保留草稿 | 会话回归、原生验收 |
| 工具报告 | 复用安全 Markdown renderer，标题 / 列表 / 引用按语义展示 | 报告测试、原生 h1 / li / DIV 断言 |
| 报告操作 | 原文用于复制与加入会话；报告内部不重复添加代码复制按钮；不自动发送报告给模型 | 报告回归、原生工具路径 |
| 响应式浮层 | 快选限制于视口，模型列表内部滚动；窄窗口连接面板保留横向厂商导航 | `model-picker-narrow.png`、`model-dialog-narrow.png` |
| 历史与草稿 | 保留搜索、切换、独立草稿、刷新及原生退出重启恢复 | 原生端到端验收 |
| 图标资产 | 复用已有品牌资产与线性图标；不新增装饰性控件或图标库 | 本轮文件审查 |

## 文件与简化

| 文件 | 修改 |
| --- | --- |
| `desktop/src/model-picker.ts` | 新增轻量模型快选，复用连接客户端与浮层定位 |
| `desktop/src/model-connection.ts` | 区分快选和连接设置；修正说明、初始焦点与焦点恢复 |
| `desktop/src/main.ts`、`desktop/index.html` | 报告复用安全 Markdown；精简空状态 |
| `desktop/src/styles.css` | 快选、设置选中项、报告和错误区的样式；仅收起重复运行公告 |
| `desktop/src/shared.d.ts` | 补齐复用模块的类型声明 |
| `desktop/design-previews/components/message-markdown.js` | 支持报告关闭内部代码复制按钮，沿用默认聊天行为 |
| `desktop/design-previews/components/message.js`、`message.css` | 统一 disclosure 图标；隐藏空操作；共用报告排版规则 |
| `desktop/design-previews/conversation.js` | 去除新消息重复标签；区分状态公告与操作反馈；清理连接后的过期提示；删除重复赋值 |
| `tests/desktop-model-picker.test.mjs`、`desktop-model-dialog.test.mjs` | 快选、搜索、重试、键盘、目录刷新与设置焦点回归 |
| `tests/desktop-controls.test.mjs`、`component-presentation.test.mjs`、`conversation-continuity.test.mjs` | 报告结构和原文、空复制、状态反馈与来源记录回归 |
| `scripts/desktop-native-e2e.mjs` | 扩展正式客户端快选、报告、错误反馈和窄窗口验收 |
| 本目录的计划与评审、`desktop/README.md` | 记录来源、改动范围、证据及限制 |

复用了已有 renderer、模型连接客户端、Floating UI 和图标，不再为工具报告使用单独的纯文本显示路径。没有变更 Tauri 权限、存储格式、上游适配或凭据协议。本仓库有大量此前改动；上表只描述本轮调整，不能将整个工作区差异归为本轮。

## 验收结果

证据目录：`.omx/artifacts/community-detail-alignment/`。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | 794 通过，0 失败、取消或跳过 | `all-tests.log` |
| `npm run lint` | 通过 | `lint.log` |
| 共享消息与会话 JS 显式 ESLint | 通过；根 lint 默认忽略 desktop，所以另行检查 | `shared-lint.log` |
| `npm --prefix desktop run tauri -- build --debug --no-bundle` | TypeScript、Vite、Rust debug 构建通过 | `build.log` |
| `node scripts/desktop-native-e2e.mjs` | 16 / 16 通过 | `native-final.log` 和下方原生证据 |
| `node scripts/desktop-native-e2e.mjs --real-ollama` | 3 / 3 通过；已安装的本机 `llama3.2:3b` 真实生成回复 | `native-real-final.log` |

正式客户端证据目录：
`.omx/artifacts/desktop-model-native/run-2026-10-20T10-15-50-319Z/`。

`results.json` 保存每项结果、构建产物 SHA-256、视口 / 控件测量与请求结果。覆盖实际 Tauri / WebView2、原生 IPC、broker 和提供方解析。上游使用明确标注的确定性 Ollama 协议 fixture；该 16 项验收不证明真实模型推理或外部账户可用。

另一次真实本机模型验收保存在 `.omx/artifacts/desktop-model-native/run-2026-10-20T10-19-50-395Z/`，与上面的构建 SHA-256 一致。没有网络替身、模型下载或付费 API 请求；客户端实际收到 `llama3.2:3b` 的“连接成功”回复。它验证真实连接与生成，不替代确定性测试中的停止和错误注入覆盖。

已逐张检查最终模型快选、模型连接窄窗口、390×500 空状态、流式、错误恢复、工具报告及真实本机模型回复截图。各尺寸无页面横向溢出；输入区保持宽度限制，报告不再显示 Markdown 源码，失败状态不再重复公告。迭代期间发现的过期连接提示、来源分类遗漏、操作反馈误隐藏以及目录刷新焦点丢失均已修复并回归。

## 启动与边界

从仓库根目录运行 `npm --prefix desktop run tauri dev`。没有新增环境变量；模型凭据继续由应用“模型连接”设置输入。前置 Node、Rust、WebView2 与驱动准备见 [桌面说明](../../README.md)。

- Work 本地浏览器访问被设置禁用，本轮没有浏览器预览验收声明；使用的是已授权的 Windows 原生客户端自动化。
- 本轮未重新验证付费云模型、外部 OAuth 账号、系统文件选择器或分发安装包。
- 连接凭据仍仅保存在应用进程内，重启后需要重新连接；没有新增系统凭据库。
- 历史消息已有的冗余标签保留，不通过解析自然语言迁移存档。
- Vite 仍提示 `chat-transport.js` 同时静态和动态导入，构建成功；本轮未改变代码拆分方式。
- 社区截图体现特定平台、日期、版本与个人布局，不代表产品所有状态。此次完成的是上表明确列出的细节切片，不宣称与参考产品逐像素一致或整个产品已无可改进之处。

回退应按上表的本轮差异逐项操作，保留此前所有未提交改动；不要对工作区执行整体 reset。
