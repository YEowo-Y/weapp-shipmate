# 共享弹窗与图标按钮：实施及验收记录

日期：2026-10-22。代码与 Windows 原生验收已完成；浏览器完整复验被 Work 设置禁用本地浏览器访问所阻塞。本记录不将此前浏览器截图作为最终版本通过的证据。

后续更新：同日浏览器短暂恢复访问，已补部分规则图标、凭据弹窗和减少动效检查，并修复图标按钮实际尺寸；随后访问再次被禁用。**CF-01 仍未关闭**，准确补验范围及最新 946 项测试 / 39 项原生证据见 [组件状态恢复记录](component-recovery-delivery-20261022.md)。以下保留原轮次的历史结论。

## 选型与实现

复用现有 Vanilla JS/TS、Vite、Tauri 2、Web Awesome Core 3.14.0 和本地 Lucide 图标。本轮没有新增依赖、升级锁文件或修改上游组件源码。核对了 [Web Awesome Button 官方文档](https://webawesome.com/docs/components/button/) 的 size、appearance、disabled 和样式接口；本地 vendor README、manifest 和许可证记录了 MIT / Lit BSD-3-Clause 及重建方式。本轮没有重新采集竞品截图，不声称像素级复刻。

- 通用业务、会话历史、桌面模型连接三类弹窗共用颜色、边框、16px 圆角、标题、阴影与遮罩。保留各业务宽度、滚动和焦点生命周期。
- 弹窗进入动效统一为 140ms，仅在系统未要求减少动态效果时启用；运行中的持续渐变保持原实现。
- 设置规则区六个编辑/删除图标按钮改用现有 `wa-button.ui-action-icon`，保留具体可访问名称、本地 Lucide 图标和真实禁用状态。规则编辑仍未接入，附近说明保留，未把占位控件包装成可用功能。
- Web Awesome 圆角引用产品令牌，移除三处重复弹窗表面声明和无调用的 `.native-icon-action` 样式。不另造组件层。

## 修改文件

| 文件 | 本轮修改 |
| --- | --- |
| `desktop/design-previews/app.css` | 集中三类弹窗的公共表面、标题、动效与令牌 |
| `desktop/design-previews/ui.css` | 删除公共弹窗样式，菜单复用阴影令牌 |
| `desktop/design-previews/session-workspace.css` | 仅保留历史/数据弹窗业务布局 |
| `desktop/src/styles.css` | 桌面模型弹窗复用公共表面，保留布局规则 |
| `desktop/design-previews/components/ui-kit.css` | 将组件圆角映射到现有产品令牌 |
| `desktop/design-previews/settings.html` | 六个规则操作使用已有开源图标按钮 |
| `desktop/design-previews/components/native-controls.css` | 删除不再调用的图标按钮定义 |
| `scripts/desktop-native-e2e.mjs` | 截图前等待有限过渡；失败时直接截图并独立保留 HTML |
| `desktop/README.md`、本目录计划与记录 | 功能范围、启动、证据及阻塞边界 |

其余工作区修改来自此前轮次，未重置、提交或混入本轮结论。桌面中文字体覆盖、消息协议、模型接入和存储格式均未调整。

## 验证证据

- 修改前：已有弹窗、历史、模型设置、图标和组件测试 **100 项通过**；实际浏览器历史和规则截图见 `.omx/artifacts/component-foundation-20261022/`。
- 最终产品代码：`npm test` **939/939 通过，无跳过**，日志 `.omx/artifacts/component-foundation-tests.log`。后续只调整验收截图助手及文档，没有再修改产品代码。
- `npm run lint`、`node --check scripts/desktop-native-e2e.mjs`、限定文件 `git diff --check` 通过。六个修改的 CSS 文件用现有 PostCSS 解析通过，无额外安装。
- `npm --prefix desktop run tauri build -- --debug --no-bundle` 通过，包含 TypeScript / Vite。当前调试二进制 SHA-256：`d1218d6aacc95ff51514572b05689e58094e042fab4a20c2376b00eefdc90815`。
- 最终 `node scripts/desktop-native-e2e.mjs` **38/38 通过**。真实 Tauri / WebView2 / IPC 覆盖连接、授权错误恢复、流式停止、重试、草稿、历史空搜索、重命名、归档、备份导入、窄屏焦点及重启恢复。
- 独立只读复核：共享样式入口覆盖、优先级、减少动态效果条件、按钮语义无待处理源码发现；截图错误分支的证据丢失问题已按复核建议修正并复核关闭。

原生最终证据：`.omx/artifacts/desktop-model-native/run-2026-10-22T16-02-06-716Z/results.json`。模型及 OAuth 使用明确标记的本地协议 fixture，无真实外部账号授权或付费模型调用；本机规则查询和文件下载是真实执行。

人工查看了最终 `model-connection.png`、`history-narrow.png`；动画等待后的 `model-dialog-narrow.png` 也已查看。390px 窄窗口中弹窗不透明、文字无叠压，内容与关闭入口可达。早期截图截到淡入中间帧，保留原证据，不作为通过截图；截图助手现等待有限动画结束，不禁用动画，也不等待无限流式渐变。失败路径跳过等待，截图与 HTML 分别保存，防止取证失败连带丢失其他证据。

浏览器修改后曾成功重新打开历史弹窗；随后访问被禁用，恢复本轮时再次确认仍被禁用。尚未完成最终版通用业务弹窗、设置规则按钮的 320/768/1024/1440px、浅深色、短窗口和 reduced motion 实测；原生验收不替代该矩阵。

## 质量配置与交付门禁

- Decision：**FAIL（完整验收被阻塞，非已发现产品回归）**；Release status：**blocked**。不宣称 local-ready、CI-ready 或 release-ready。
- Risk：**high**，按全局治理中“共享代码 / 跨模块”的规则保守归类；实现计划初步评估为 medium，最终以该共享范围升级。没有凭据、数据格式或权限改动。
- Profile：**discovered**，来源为两个 package manifests、`.github/workflows/ci.yml`、desktop README 和原生测试脚本。环境 Windows / Node 24.14.0 / npm 11.9.0 / rustc 1.94.1。
- DQ-00/01/02/04/06/07/08=PASS（本轮本地范围）；DQ-03=已记录、未豁免；DQ-05=BLOCKED（原生部分通过，浏览器矩阵不可用）；DQ-09/10=BLOCKED（不可作完整交付声明）；DQ-11=N/A（无 AI 执行语义修改）。
- 静态、回归和构建命令如上。CI 契约为 `validate-rules/validate` Windows/Linux 与 Node 20/22/24 矩阵，包括 lint/test/quotes/coverage/package smoke。本轮未运行远端 CI，不以本地通过代替 CI。
- 性能测量：主 JS 498.06 kB / gzip 164.94 kB，未变化；CSS 193.95 kB / gzip 34.43 kB，相比此前 193.55 / 34.29 kB 略增。无项目预算，不宣称达到未定义指标。未新增运行时网络资源或后台任务。
- 安全/数据：复用锁定的本地组件资源，截图来自隔离测试会话与虚构凭据；模型和存储边界沿用既有覆盖，无迁移。未部署或发布。回退按本轮文件中的样式、六个按钮标记及截图助手定点撤销，不重置整个脏工作区。

## 待验收项

| 字段 | 内容 |
| --- | --- |
| ID / Tracking ID | CF-01 / 本记录与 `.omx/state/component-foundation/ralph-progress.json` |
| Severity / Type | medium / test |
| Disposition | needs-decision：环境访问恢复后补验；未申请或接受豁免 |
| Evidence | CUA 返回本地浏览器在 Work 设置中被禁用；本轮再次确认 |
| Action / Verification | 恢复访问后跑上述浏览器矩阵，保存最终截图、控制台及焦点证据 |
| Owner | 当前任务执行者负责补验，项目使用者控制浏览器访问设置 |
| Approver | 无；未批准跳过该验收 |
| Due/Expiry | 浏览器访问恢复后、完整交付或发布声明前 |

## 启动与剩余边界

预览：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/settings.html#rules` 或 `main-four-region.html`。桌面：`npm --prefix desktop run tauri dev`。本轮没有新增环境变量，预览刷新可加载，桌面需使用重新构建的程序。原生验收要求先构建，并配置已有 WebView2 / tauri-driver 环境。

剩余风险为浏览器最终矩阵未验证；深色和减少动态效果只完成源码复核。规则编辑仍为禁用预览，真实外部模型账号授权未在本轮验证。完整项目其他未实现能力以 desktop README 的边界为准。
