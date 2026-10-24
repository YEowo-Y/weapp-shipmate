# P0：真实能力、入口与回归基线

日期：2026-10-22。对应[总体计划 P0](../../../.omx/plans/project-completion-plan-20261022.md)与[修改前清理计划](../../../.omx/plans/p0-capability-baseline-20261022.md)。本轮仅执行第一步：产品代码、文档、可运行的自动化验证已完成；浏览器访问被 Work 设置禁用，该层仍待验。未进入 P1 运行时打包、P2 数据迁移或发布。

## 实际变化

- 正常设置仅列出模型与密钥、数据与会话、外观、关于。搜索同样排除未接入设置，旧链接先说明边界，并提供返回与查看预览。
- 未接入的工程检查、隐私策略、扫描和规则配置，仅在 `settings.html?preview=settings` 显式预览中出现。控件直接在 HTML 中禁用，删除依赖模型设置初始化的重复禁用逻辑。
- 工作台、会话、设置与拒因页面的常用导航加入真实拒因查询，保留经过白名单校验的返回路径；设计示例集中到设计目录。
- 新建聊天统一为“新建会话”，移除完整聊天中固定的示例项目切换按钮与项目独立存储暗示。保留现有会话存储命名空间，避免旧数据失联。
- 新增[当前能力台账](../../../docs/12-current-capabilities.md)，修正历史技术栈、凭据、安全和项目模型表述。会话、业务任务、运行与成果不再混同。

## 修改文件

| 范围 | 文件 |
|---|---|
| 设置入口及预览隔离 | `desktop/design-previews/settings-navigation.js`、`settings.html`、`settings.css`、`settings.js` |
| 常用导航与示例目录 | `desktop/design-previews/navigation.js`、`index.html`、`explain.html` |
| 会话术语与误导入口 | `desktop/design-previews/session-workspace.js`、`main.js`、`chat.js`、`main-four-region.html`、`chat-full.html`；`desktop/index.html`、`desktop/src/main.ts` |
| 回归 | `tests/settings-navigation.test.mjs`、`product-navigation.test.mjs`、`command-navigation.test.mjs`、`session-workspace.test.mjs`；`scripts/desktop-native-e2e.mjs` |
| 当前边界与历史更正 | `desktop/README.md`、`docs/08-product-vision.md`、`docs/09-memory-context-architecture.md`、`docs/12-current-capabilities.md` |
| 执行记录 | 本文件、`.omx/plans/p0-capability-baseline-20261022.md`、总体计划状态及 `.omx/state/p0-capability-baseline/` |

复用现有导航、图标、Web Awesome、原生表单与设置样式；未增加依赖或重建组件层。`main.js` 补充已有 `URLSearchParams` 的 ESLint 浏览器全局声明，不改变运行行为。

## 本轮验证

风险：medium，涉及导航与设置可达性；没有改变模型协议、凭据、权限或持久化格式。

| 验证 | 当前结果 | 证据 |
|---|---|---|
| 修改前定向基线 | 63 通过 | 本轮工具记录；保护现有设置、导航、会话和模型路径 |
| 导航/会话新行为 RED → GREEN | 52 项中先 7 失败，实施后 52 全通过 | [RED](../../../.omx/artifacts/p0-capability-baseline/navigation-red.log)、[GREEN](../../../.omx/artifacts/p0-capability-baseline/navigation-green.log) |
| 全量 `npm test` | 974 通过，0 失败，0 跳过；含规则验证 | [测试日志](../../../.omx/artifacts/p0-capability-baseline/full-test.log) |
| `npm run lint` 与修改 JS 显式 lint | 通过；显式扫描覆盖默认忽略的预览目录 | [根 lint](../../../.omx/artifacts/p0-capability-baseline/lint.log)、[修改文件 lint](../../../.omx/artifacts/p0-capability-baseline/changed-lint.log) |
| TypeScript / Vite | 构建成功 | [日志](../../../.omx/artifacts/p0-capability-baseline/frontend-build.log) |
| Tauri debug，无安装包 | 构建成功 | [日志](../../../.omx/artifacts/p0-capability-baseline/native-build.log) |
| Windows 原生 E2E | 42 项通过 | [执行日志](../../../.omx/artifacts/p0-capability-baseline/native-e2e.log)、[结果与二进制摘要](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T18-51-12-867Z/results.json) |
| 独立代码审阅 | 本轮 P0 差异无可确认问题；独立定向测试 70 通过 | 本轮 `p0_review` 子代理记录 |
| 浏览器真实布局/键盘 | BLOCKED：CUA 返回 `Local browser use is disabled in Work settings` | 未尝试绕过该设置，不将其他层级记作浏览器通过 |

原生回归实际启动本轮构建的 Tauri/WebView2，验证本机拒因、清单、报告、会话、搜索、草稿、归档、备份、刷新/进程重启、流式回复、取消和错误恢复。新增主入口断言确认“新建会话”及读屏名称一致，没有固定项目、示例阶段、健康值或“新任务”混入正式侧栏。上游模型/OAuth 是明确标记的 Ollama/OpenRouter 协议 fixture；原生 IPC、broker、解析和本机规则真实运行，**不代表外部账号授权或真实模型推理通过**。

## 视觉与运行边界

复核[当前宽窗口](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T18-51-12-867Z/empty-1280x850.png)、[当前窄窗口](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T18-51-12-867Z/empty-narrow.png)，与[修改前宽窗口](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T18-19-26-665Z/empty-1280x850.png)比较。会话按钮文字已更新，侧栏底部入口与输入框保持可见，窄窗口折叠导航可用，没有本轮新增的裁切或横向溢出。此结论限本次原生截图，不能覆盖浏览器设置页。

Vite 仍提示主包约 501.83 kB（gzip 166.10 kB）及同一模块的静态/动态导入；P0 未扩大范围处理分包。安装版离开开发目录运行、系统凭据库、真实账号授权、完整浏览器矩阵仍未验收。未宣称发布就绪。

## 启动与回退

从仓库根目录启动预览：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/settings.html`；查看未接入设置的设计稿使用 `?preview=settings#cap`。正常开发预览的演示聊天仍明确标记；选择已连接模型才发送真实文本。

正式桌面开发：`npm --prefix desktop run tauri dev`。本轮没有新增环境变量或服务，仍使用已有 Node/Rust/Tauri 开发环境；确定性工具无需模型密钥。

回退以本轮[修改前副本](../../../.omx/artifacts/p0-capability-baseline/before/)和对应文件差异为依据，只撤销本阶段改动，不使用全库 reset/restore，不更改存储命名空间。下一步为 P1：补齐可安装运行时、资源闭包与原生权限边界。
