# 全产品功能与交互评审结果

日期：2026-10-17。评审覆盖真实 CLI/MCP、正式 Tauri 薄桌面、16 个设计预览页面及共用组件。用户要求调研后执行优化，本轮已完成确定问题的代码修复、回归和独立复核；没有浏览器验收或生产发布声明。

实施前 [计划](product-wide-review-plan.md)；实际查阅的 [官方资料与取舍](product-wide-review-sources.md)。当前技术仍为 Tauri 2 / TypeScript / Vite、原生 ES Modules、既有 Floating UI 与 markdown-it。没有新增依赖或升级框架，也没有复制参考产品源码。

## 全功能矩阵与评审结论

| 功能 / 入口 | 真实能力与边界 | 本轮处理与证据 |
| --- | --- | --- |
| CLI `check / guide / explain`、报告导出 | 真实本地规则引擎，非模型推理 | 保留现有架构与命令合同；全量 CLI、扫描、导出、边界和 E2E 回归通过。未改政策规则。 |
| MCP 3 个工具 | 真实 stdio 工具，受现有本机文件权限约束 | 保留现有工具参数/结果协议，MCP 与恶意输入回归通过；没有增加插件管理或任意工具执行。 |
| 正式桌面选目录、主体、预检、导航 | 真实 Tauri invoke 调用规则内核 | 增加报告类型、复制、独立复制反馈；重跑失败保留明确标注的上次成功报告，换目录/主体使其失效。11 项桌面 VM 测试通过。 |
| 设计总览 `index.html` | 导航与展示，非产品执行器 | 修正首启、记忆、健康与差异卡片的过度承诺；与真实页面边界一致。 |
| 首次引导 `first-run.html` | 根据未上线/已上线选择进入对应示例 | 专用设置入口、顶部导航及快捷命令均保留最新选择；白名单 URL 同步，不增加浏览器存储或历史记录。 |
| 工作台 / 完整聊天 | 固定本地流式、草稿、会话、重试与工具示例 | 完整聊天离页统一 stop/destroy，BFCache 不恢复旧流；忙碌时故障演示明确拒绝，实际提交后才通知启动。保留部分输出、阅读位置和已有状态机。 |
| 输入、菜单、命令面板 | 共用组件、原生对话框、Floating UI | 页面与命令导航共享目录；全部 8 阶段可发现；打开面板读取当前来源，避免缓存旧选择。模型菜单明确“目录连接”与“聊天尚未接入”。 |
| 8 阶段 `stage-workspace.html` | 按 URL 展示固定准备事项与官方来源；不验证办理状态 | 提审→拒因、发布→健康的返回路径完善。阶段名称/顺序继续与 flow.yaml 对齐，回归覆盖全部阶段。 |
| 预检 `audit.html` | 固定报告、证据与下一步 | 保留示例与来源日期，审阅已有来源参数；本轮入口发现性、资源和现有交互回归通过。未声称重新扫描项目。 |
| 拒因 `explain.html` | 只支持明确的固定匹配示例，其他输入提示真实 CLI | 增加受限来源返回控件；提审/健康来源可返回。输入为空、结果失效及未匹配路径保留现有测试。 |
| 审阅 `diff-review.html` / review 组件 | 固定差异、审批状态，不写文件 | 聊天→完整预览→返回保留聊天；外部、自返回、未知目标不能注入。批准/拒绝/过期仍绑定本地运行示例，未变成后端写入权限。 |
| 类目顾问 / 域名步骤 | 类目固定候选；域名步骤由用户勾选 | 保留已有来源、示例与返回阶段入口；步骤状态回归通过。没有把勾选当后台校验。 |
| 健康页 | 固定回放、停止、已阅读/撤销，不后台监控 | 从发布阶段进入可返回原阶段；进入拒因保留健康来源。既有取消和阅读状态测试通过。 |
| 记忆页 | 搜索/分类 6 条示例，编辑/删除禁用 | 未发现需要修改的确定行为缺陷；纠正总览“可修订”承诺。无持久记忆、SQLite 或真实数据读取。 |
| 设置与外观 | 主题/字号真实本机偏好；其他无实现项明确预览 | 进入设置后返回原页/阶段；历史切换隐藏聚焦面板时恢复焦点，搜索/外部焦点不受影响。 |
| 模型连接 | 真实本机目录认证、OpenRouter PKCE、API Key、Ollama | 本轮不改已验证 broker；修正自定义草稿、连接寿命与外部访问说明。没有 ChatGPT/Claude 订阅登录、真实推理或系统钥匙串。 |
| 组件验收 / 命令示例 / 同步说明 | 设计验收与未来方案 | 统一纳入页面目录；保留非执行标识。静态/HTTP 检查通过，未将同步示意图当监控执行引擎。 |

## 实际修改与简化

以下路径均相对仓库根目录；其他已有未提交修改保留，本轮未提交或部署。

| 文件 | 原因 |
| --- | --- |
| `desktop/src/main.ts`、`desktop/src/styles.css`、`desktop/index.html` | 报告操作行、旧结果当前性说明、可重试复制、异步反馈隔离；样式沿用既有按钮、状态和响应式规则 |
| `desktop/design-previews/navigation.js` | 页面/命令共享元数据、受限返回目标、来源标签、完整阶段发现 |
| `desktop/design-previews/settings-navigation.js` | 设置来源恢复与隐藏面板焦点恢复 |
| `desktop/design-previews/ui.js` | 删除重复硬编码命令目录；每次打开读当前 URL；移除无条件故障成功通知；更正模型菜单能力 |
| `desktop/design-previews/stages.js`、`health-dashboard.html`、`explain.html` | 后续工具的来源参数与可见返回入口 |
| `desktop/design-previews/chat.js`、`main.js`、`components/review.js` | 一致生命周期、忙时故障请求处理、完整审阅来源 |
| `desktop/design-previews/onboarding.js`、`first-run.html` | 引导选择经设置往返保持；URL replaceState，不加持久存储 |
| `desktop/design-previews/settings.js`、`settings.html`、`index.html` | 自定义草稿、模型目录连接、会话有效期、示例能力文案与实际实现对齐 |
| `desktop/README.md`、`desktop/design-previews/AGENT-INTERACTION-STANDARD.md`、`AGENT-TECH-CHOICES.md` | 正式桌面/开发预览两入口、当前技术来源与历史记录边界 |
| `tests/desktop-controls.test.mjs`、`model-settings.test.mjs`、`onboarding-memory.test.mjs` | 报告恢复/复制竞态、能力说明、引导选择与共享入口 |
| `tests/product-navigation.test.mjs`、`settings-navigation.test.mjs`、`command-navigation.test.mjs`、`stage-journey.test.mjs` | 来源、外链拒绝、全部入口发现、动态命令来源和隐藏焦点 |
| `tests/chat-menus.test.mjs`、新增 `conversation-journeys.test.mjs` | 保留已有补全清理测试，新增页面生命周期、故障事件和审阅链接路径 |
| `desktop/design-previews/research/product-wide-review-{plan,sources,report}.md` | 本轮计划、官方证据、逐功能评审与验证 |

主要简化是删除另一份不完整的命令目录，统一复用现有页面和阶段数据；重用既有 URL 白名单、状态机、原生控件和测试工具。未引入第二套路由、聊天运行时、状态库或协议。

## 最终验证

| 实际命令 / 检查 | 结果 |
| --- | --- |
| `npm test` | **495/495 通过**，0 失败、取消或跳过；较 478 基线新增 17 项。日志 `.omx/product-wide-tests.log` |
| 根 `npm run lint` | 通过 |
| 预览修改 JS 显式 `npx eslint --no-ignore ...` | 通过，覆盖根 lint 默认排除的预览目录 |
| `npm --prefix desktop run build` | TypeScript + Vite 通过，7 modules；不是原生 Rust/WebView 打包实测 |
| `node --experimental-vm-modules .omx/agent-experience-static-check.mjs` | 16 HTML、42 脚本、24 样式、185 本地引用；38 HTTP 路径 200，JS MIME 正确 |
| `npm audit --omit=dev --json` | 生产依赖漏洞 0，本轮没有依赖变更 |
| `npm run verify:quotes` | 63 条通过；仍有既有 2 条手工快照提示，不能当最新政策核验 |
| `npm run coverage` | 现有规则门槛通过，precision/recall 1.0，TP55/FP0/FN0；不是 JS 行覆盖率 |
| `git diff --check` | 通过；既有 CRLF 归一化提示不影响退出结果 |

行为修复均有先失败后通过的回归或明确原代码复现。独立只读复核运行 74 项导航/会话测试、45 项桌面/设置测试；发现首启共享入口读取旧选择的 P2，修复后再独立验证 18/18 通过。未发现待修复的确定代码回归。

性能：最终套件约 4 秒，构建 JS 4.25 kB（gzip 2.00 kB）、CSS 3.08 kB；这些是本机观测，无项目交互延迟 SLO，不做体验性能达标声明。异步复制、取消/离页、重复操作与旧结果隔离已由确定性测试覆盖。

## 质量门禁、风险与恢复

风险 high：共享导航与跨模块生命周期。质量配置发现于根/desktop package scripts、现有测试与 `.github/workflows/ci.yml`；运行环境 Node 24 / Windows。没有修改规则引擎、认证协议、数据格式或生产部署。

- DQ-00/01/02/04：配置、范围、质量和回归证据完成。
- DQ-06/07/08：相关取消/竞态、URL 边界、文本结果安全呈现与非持久首启选择已验证；无新外部请求目的地、存储或依赖。
- DQ-05：**BLOCKED**。遵循用户“本轮先完成代码与自动化验证”的选择，不使用已禁用浏览器，也不以旧截图充当本轮证据。
- DQ-09：**BLOCKED**。没有对应提交的 CI、原生打包/安装或真实账号验收，不宣称发布就绪。
- DQ-11：不适用；未变更模型推理、检索或业务规则判定。
- DQ-10：本记录收集本轮变更与证据；发布决策 **FAIL / blocked（未满足浏览器与原生交付门禁）**，不是测试失败。

| ID | 严重度 / 类型 | 处置 | 所有者 / 审批 | 截止或条件 | 行动与核验 |
| --- | --- | --- | --- | --- | --- |
| PW-01 | medium / ux | hotfix，已关闭 | 实施代理；用户已授权修复 | 本轮 | 来源丢失、缺失阶段发现、隐藏焦点：导航/设置回归 |
| PW-02 | medium / bug | hotfix，已关闭 | 实施代理；用户已授权修复 | 本轮 | 离页运行与虚假故障反馈：生命周期/忙碌回归 |
| PW-03 | medium / ux | hotfix，已关闭 | 实施代理；用户已授权修复 | 本轮 | 报告丢失与复制恢复：11 项桌面回归 |
| PW-04 | medium / ux | hotfix，已关闭 | 实施代理；用户已授权修复 | 本轮 | 独立评审发现首启共享入口旧选择：URL 同步与动态命令，复核18/18 |
| PW-05 | medium / test | needs-decision，验证边界 | 项目负责人；无生产豁免审批 | 任何视觉完成或发布声明之前 | 启用浏览器后补深浅主题、窄屏、缩放、焦点/IME、实际BFCache；运行原生 Tauri 验剪贴板/对话框 |

恢复只需逐文件局部回退本轮变更，保留此前工作区修改。没有数据迁移；本轮新增首启选择只替换当前 URL，不写 localStorage。真实账号授权、系统钥匙串、持久会话/记忆、真实推理和后端文件审批仍未实现或未验证，详见模型连接报告；不以界面示例宣称这些能力已完成。

## 查看与启动

预览服务已运行于 <http://127.0.0.1:5501/index.html>，也可从根目录运行 `node desktop/design-previews/_serve.mjs`；无新环境变量。正式桌面运行 `npm --prefix desktop run tauri dev`（需既有 Rust/WebView2 环境，本轮未启动）。纯 `npm --prefix desktop run build` 只证明前端能构建。
