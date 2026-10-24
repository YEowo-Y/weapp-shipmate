# 产品路径与共享组件优化记录

日期：2026-10-16。状态：本轮代码与自动化检查完成；浏览器视觉与真实交互验收待补。未提交、发布或部署。

## 选型与实际范围

保留现有原生 JS/CSS 多页预览、原生 dialog/popover、固定版本 Lucide 图标和现有对话状态组件。没有新增依赖、安装 React/shadcn，也没有改变规则内核或桌面后端。本轮重点是把已有页面接成可理解的路径，并使本地示例的状态与实际能力一致。

官方资料及取舍见 [product-journey-sources.md](product-journey-sources.md)，修改前计划见 [product-journey-plan.md](product-journey-plan.md)。本轮依据来自官方文档读取；未重新运行 REA，未声称获取了新的客户端截图。已有厂商品牌图标沿用此前落地的本地资源与来源记录。

## 实际修改

以下路径除测试外均相对 `desktop/design-previews/`。

| 文件 | 行为变化 |
| --- | --- |
| `stages.js`、`stage-workspace.js`、`stage-workspace.html`、`main-four-region.html` | 以与 `flow.yaml` 一致的 8 个阶段 ID 建立目录；每个阶段打开对应内容，提供前后阶段与官方来源；修复备案误入域名教程。阶段状态清楚标为固定示例。 |
| `navigation.js`、`preview.js`、`ui.js` | 复用既有菜单建立工作区导航、当前位置和项目菜单；二级页可返回工作台；命令文案区分查看示例与实际执行；删除失效的首启通知传递和记忆按钮提示逻辑。 |
| `first-run.html`、`onboarding.js` | 上线前进入工作台，上线后进入健康检查示例；按钮随选择更新。移除不影响去向的密钥问题和未实现的密钥存储承诺。 |
| `audit.html`、`category-advisor.html` | 结果提供下一步动作，证据项连接相关配置、类目或审阅页面；明确历史示例来源；反馈演示可恢复操作。 |
| `diff-review.html`、`chat-full.html`、`stages.js` | 审阅保留进入来源，可返回完整对话、报告或具体隐私阶段；返回目标仅接受页面及阶段目录白名单，拒绝任意 URL 与额外参数。 |
| `explain.html`、`explain.js` | 空输入、固定示例和未支持输入分开处理；修改输入立即使旧结果失效；非示例文本不再获得固定的成功匹配。输入不会发送到服务器。 |
| `health-dashboard.html`、`health.js` | 提供有界的示例回放、停止和本页已阅读标记；阻止重复启动及停止后的迟到回调；离页停止，返回后可重新回放；阅读标记不代表核验成功。检查卡使用现有 Lucide 组件。 |
| `memory.html`、`memory.js` | 搜索与类型筛选取交集，更新数量、无结果提示和清空入口；修复参考/项目分类错位；未接入的编辑删除明确禁用。 |
| `guided-step.html` | 使用原生复选框记录用户勾选，进度和当前步骤随之更新；复制有失败恢复；明确示例域名与后台验证边界。 |
| `sync-loop.html` | 改为规划说明，移除正在监控、已连接与未测延迟等暗示，提供回到实际体验的入口。 |
| `app.css` | 收敛共享中性色与主题控件，删除重复色板及棕色覆盖；统一后续动作、焦点、窄屏触控尺寸；执行文案采用文字渐变，支持减少动效和强制颜色模式。 |
| `tests/stage-journey.test.mjs`、`tests/product-navigation.test.mjs`、`tests/onboarding-memory.test.mjs`、`tests/result-journey.test.mjs`（仓库根目录） | 19 项回归测试，覆盖阶段路径、首启分流、搜索筛选、结果失效、回放取消、缓存返回恢复与返回路由约束。 |

复用与删除优先：没有引入第二套聊天运行时、事件协议、弹窗体系或状态管理库。对话流式渲染、停止生成、模型设置、审阅状态沿用已有实现。

## 验证证据

运行环境：Windows / Node v24.14.0 / npm 11.9.0。修改前对话、菜单、模型设置和桌面控制基线 50/50 通过。新增缺陷用例先观察失败，再修正实现。独立只读复核发现的健康页默认标注、隐私阶段返回丢失和历史入口文案错误均已修复并复核通过。

| 检查 | 结果与范围 |
| --- | --- |
| `npm test` | **324/324 通过**，0 失败、0 跳过；含规则数据校验和全量 Node 测试。日志位于 `.omx/product-journey-tests.log`。 |
| `npm run lint` | 通过。根配置忽略 desktop，因此另执行下面的预览检查。 |
| `npx eslint --no-ignore desktop/design-previews/navigation.js desktop/design-previews/onboarding.js desktop/design-previews/memory.js desktop/design-previews/explain.js desktop/design-previews/health.js desktop/design-previews/stages.js desktop/design-previews/stage-workspace.js desktop/design-previews/preview.js desktop/design-previews/ui.js` | 通过。 |
| 在 `desktop/` 执行 `npm run build` | TypeScript 与 Vite 构建通过，7 个模块；此构建针对实际桌面入口，**不代表多页设计预览已被打包**。 |
| `node --experimental-vm-modules .omx/product-journey-static-check.mjs` | 16 个 HTML 页面、33 份内嵌/独立脚本语法、24 份内嵌/独立样式、168 个本地引用通过。VM 实验性 API 提示来自检查器，不是应用错误。 |
| HTMLParser 检查 | 16 页显式标签配对、ID 唯一；5 个新增控制器所需的 HTML ID 与模块入口齐全。 |
| 本地 HTTP 冒烟 | 32 条页面、阶段和资源路由均为 200，JS MIME 正确。中途原服务退出造成一次 ECONNREFUSED；恢复本地服务后重新检查通过。 |
| 独立复核 | 修复后相关 13 项测试通过；执行健康页内联渲染脚本，生成 8 个阶段和 5 张卡片，18 次图标调用无未知名称。 |
| `git diff --check` | 通过。保留工作区已有未提交修改，没有回滚其他工作。 |

这些检查验证代码、有限 DOM 替身行为、结构与 HTTP 可达性，不等于真实浏览器 E2E、截图对比或原生键盘焦点验证。

## 质量配置与交付边界

质量配置为本轮临时解析，未修改项目配置。命令依据来自根 `package.json`、`eslint.config.mjs`、`desktop/package.json` 和 `.github/workflows/ci.yml`（discovered）；预览静态与 HTTP 检查为本轮补充（inferred，已实际运行）。关键路径来自用户任务及修改前计划（declared）。本轮涉及共享样式和跨页路径，按 high 的复核要求处理，不作生产就绪声明。

- `DQ-00/01/02/04`：配置、范围、静态质量与回归证据已收集。
- `DQ-06/07`：本轮回放取消、重复请求、页面恢复和路由输入边界测试通过；没有新增网络调用、权限、依赖或密钥存储。
- `DQ-05`：**BLOCKED（浏览器验收）**。工具返回 `Local browser use is disabled in Work settings`；用户明确选择“本轮先完成代码与自动化验证”。没有绕过限制，也没有用旧截图冒充本轮证据。
- 修复跟踪 `UI-VERIFY-001`：类型 ux/test，严重度 medium，disposition scheduled；负责人为本项目实施者，用户已限定本轮工作范围；恢复浏览器访问后、任何视觉完成或发布声明前补验。范围含深浅主题、窄屏、键盘/焦点、滚动与动态状态。跟踪载体即本文与 `.omx/state/product-journey/ralph-progress.json`。
- 发布与云端 CI：本轮未执行。CI 还定义 `verify:quotes`、`coverage` 与打包冒烟；本轮不改规则/分发且没有发布主张，未额外运行这些发布相关路径。

## 启动与未实现项

从仓库根目录运行 `node desktop/design-previews/_serve.mjs`，打开 [主工作台](http://127.0.0.1:5501/main-four-region.html) 或 [首启](http://127.0.0.1:5501/first-run.html)。本地预览不需要环境变量或 API Key。服务仅绑定 `127.0.0.1:5501`；已运行时无需重复启动。

当前实际桌面入口仍通过 Tauri 接 `run_check` / `run_guide`。本轮多页设计没有迁入桌面主入口，没有实现真实模型请求、密钥安全存储、后台健康扫描、记忆持久化或文件修改执行。各页面的示例结果、操作勾选与阅读标记不能代表真实项目进度。原有合规资料属于历史示例，未在本轮重新完成政策核验。视觉质感、响应式观感及真实焦点行为仍待浏览器验收；不能据此宣称已达到获奖标准或无可优化之处。
