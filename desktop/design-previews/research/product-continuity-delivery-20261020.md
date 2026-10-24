# 竞品调研落地与会话数据闭环验收

实施：2026-10-20 至 2026-10-21（America/Los_Angeles）。状态：本地开发验收通过；浏览器最终复验存在明确缺口，不作为发布验收。

## 调研如何影响实现

完整来源、全功能事实及取舍见 [竞品评审](product-competitive-review-20261020.md)，修改前范围见 [实施计划](product-continuity-plan-20261020.md)。本轮优先解决已有工作的整理、备份与恢复：采用 Codex/OpenClaw 的归档与恢复区分，Cherry Studio 的集中数据入口，Claude 的导出范围说明。参考公开官方页面和截图，没有声称登录竞品账号实测，也没有把移动端资料当作桌面功能证据。

保留 Vanilla JS/TypeScript、Tauri、Web Awesome、Lucide 和已有 IndexedDB Schema。没有新增依赖、认证供应商或环境变量。删除了“只有导出、不能导入”的旧说明，并将两种聊天入口和桌面端的数据弹窗共用，避免各自增加一套表单与保存逻辑。

## 实际交付

- 历史增加活动、已归档、全部筛选；归档不删除消息、草稿、模型或阅读状态，恢复后重回活动侧栏。归档当前会话先停止并保存，再切换剩余会话；没有剩余时创建空会话。
- “数据与会话”集中下载和追加导入，设置页、工作台、完整聊天及桌面都有可达入口。设置跳转保持来源页面，路由参数仍按允许列表校验。
- 只接受 Shipmate 版本 1 JSON，限制 20 MiB、200 会话并沿用消息/字段上限。先校验并预览数量，确认后追加独立副本，重新映射消息、编辑、阅读位置等引用，保留当前会话与草稿。
- 导入的未完成输出转停止，运行中工具转取消，历史审批失效；不调用模型、不重放工具。备份不读取凭据服务，但用户手动输入的敏感文字会随会话导出，界面已明确说明。
- 先持久化、后更新界面；冲突和失败不覆盖存档。操作期间禁止重复提交。成功后等待 Web Awesome 内部按钮完成启用再恢复焦点；关闭按钮提供真实辅助文字。

## 修改文件

| 范围 | 文件 |
| --- | --- |
| 数据转换与持久化 | `session-transfer.js`（新增）、`session-store.js`、`session-persistence.js` |
| 共享界面与完整聊天 | `session-data-dialog.js`（新增）、`session-workspace.js/.css`、`chat.js`、`chat-full.html`、`conversation.css` |
| 设置与导航 | `navigation.js`、`settings-navigation.js`、`settings.js/.css/.html`、`main.js`、`main-four-region.html` |
| 正式桌面 | `desktop/index.html`、`desktop/src/main.ts`、`desktop/src/shared.d.ts` |
| 回归 | `tests/session-transfer.test.mjs`、`session-store.test.mjs`、`session-persistence.test.mjs`、`session-workspace.test.mjs`、`session-data-dialog.test.mjs`、`chat-sessions.test.mjs`、`session-settings-entry.test.mjs`、`settings-navigation.test.mjs`、`workspace-sessions.test.mjs`；`scripts/desktop-native-e2e.mjs` |
| 文档 | `desktop/README.md`、本报告、竞品评审与实施计划 |

前端短文件名均位于 `desktop/design-previews/`，测试短文件名均位于 `tests/`。工作区原有大量未提交修改，本清单仅说明本轮范围，未重置其他工作。

## 独立审查与修复

1. 已写入但界面更新失败时，原来仍给出“重试”或“未修改”提示。现改为“已保存，请重新载入”；禁止旧快照导出、再次导入及关闭后重新打开绕过保护，归档路径采用同一语义。
2. 界面抛出带 `code` 的异常（例如 DOMException）曾绕过 `apply-failed` 分类，重试可能覆盖已提交数据。修复为只要进入界面应用阶段，所有异常都归类为 `apply-failed`，保留原异常为 cause。两个新增用例先失败后通过，断言后续 schedule/flush/retry/重复导入都不能再写旧快照。
3. 独立审查提出以上问题；修复后由主流程运行回归与原生验收。第二次独立审查因服务额度中止，不声称拿到最终无问题签署。

## 验证证据

| 验证 | 结果 / 证据 |
| --- | --- |
| 修改前基线 | 860/860，`.omx/artifacts/research-baseline-tests.log` |
| 全量测试 | **896/896**，`npm test`；`.omx/artifacts/product-continuity/tests.log` |
| 根目录静态检查 | `npm run lint` 通过；`.omx/artifacts/product-continuity/lint.log` |
| 被默认忽略的前端源码 | 显式取消 desktop 忽略，检查数据、持久化、共享工作区、聊天及导航等 8 个文件通过；`source-lint.log` |
| TypeScript/Vite/Rust | `npm --prefix desktop run tauri build -- --debug --no-bundle` 通过；`native-build.log`。已有 chat-transport 混合静态/动态导入产生非阻塞分包警告 |
| Windows Tauri/WebView2 | **32/32**，`node scripts/desktop-native-e2e.mjs`；包含模型连接、OAuth、流式、停止、错误恢复、归档刷新、无效文件、追加导入、焦点、窄屏和进程重启 |
| 原生最新运行 | `.omx/artifacts/desktop-model-native/run-2026-10-21T07-07-31-139Z/results.json`，二进制 SHA256 `766d23fa60aa7349da329e42b71367590c85705f8ddcb9efb12eb1253f712b61` |

原生自动化使用隔离 WebView2 配置及本地 Ollama/OpenRouter 协议模拟服务；应用、IPC、broker、流解析和持久化为真实实现，没有外部账号授权或付费模型请求。自动化成功不代表真实厂商授权已验证。

### 浏览器已完成与缺口

本轮通过浏览器 UI 在 `127.0.0.1:5513` 的标记模拟环境完成：新建独立测试会话及草稿、归档、刷新、筛选、恢复、再次打开确认原草稿；从设置“数据与会话”进入备份；错误 JSON 被拒绝；有效 JSON 显示数量并追加成功；成功后提交按钮禁用；真实下载备份并检查当前草稿、仅一个导入副本、停止状态和失效审批。没有操作 5501 原工作区记录。

下载校验结果保存在 `.omx/artifacts/product-continuity/browser-downloaded-backup.json`，只含本地验收记录。截图：`browser-archive.png`、`browser-settings-data.png`、`browser-import-invalid.png`、`browser-import-success.png`。

随后浏览器工具提示 **Local browser use is disabled in Work settings**。未通过另一浏览器绕过此设置；完整聊天页真实浏览器导入回读、浏览器窄屏及最后的焦点/辅助名称改动未复验。完整聊天代码路径由回归测试覆盖；共享组件最终焦点、辅助文字裁剪、窄屏边界及重启恢复由最新原生 E2E 验证。

### 视觉复核

实际查看暗色浏览器设置/归档/备份及浅色原生导入/归档/390px 窗口截图。数据弹窗复用 480px 最大宽度，历史为 560px；标题、说明、分组和底部操作层级清晰，窄窗口内容可滚动，按钮未超出边界。统一采用既有中性色、边线、Lucide 图标和 Web Awesome 按钮，无新增嵌套卡片或动画加载圈。

此处是产品结构与实际截图复核，不是竞品像素级复刻，也不生成虚构的视觉分数。判定记录位于 `.omx/state/product-continuity/ralph-progress.json`；未启动 OMX 运行时。

## 启动和边界

预览：仓库根目录运行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/main-four-region.html` 或 `settings.html#data`。前端修改刷新即可，无新增环境变量。正式桌面运行 `npm --prefix desktop run tauri dev`，或运行已构建的 `desktop/src-tauri/target/debug/desktop.exe`；仍依赖系统 Node 与仓库资源。

本轮未实现云同步、ChatGPT/Claude 导出文件导入、加密备份、系统凭据库、模型自主工具循环、持久记忆或完整独立安装包。现有演示审批、记忆、健康页面的边界在竞品矩阵中明确保留；没有把示例包装成真实功能。后续优先将现有只读规则工具接入受约束的模型调用循环，再推进真实扫描页面与可追踪成果。
