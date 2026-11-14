# 工作台与桌面会话接入验收

2026-10-18。直接执行，复用现有技术栈；未新增依赖、未部署、未提交 Git。此记录只覆盖本轮增量，不把已有开发预览当作全部正式功能。

## 完成结果

工作台快速对话与完整聊天现在读写同源、同工作区的 IndexedDB 快照：会话身份、正文、独立草稿、编辑上下文、模型元数据和阅读状态可恢复。打开完整对话或返回工作台前，先停止当前执行并提交存档；保存失败会保留当前页与草稿，提供备份和恢复入口。历史搜索复用同一标题/正文匹配函数，正文命中打开原会话并定位原消息；选择当前会话不会误停正在执行的任务。

正式桌面前端增加本地会话区，使用相同 composer、消息、历史弹窗和持久化实现。输入保存为本地记录，不生成假 AI 回复。已有 check/guide 执行和报告复制保留；点击“加入当前会话”保存真实报告，保留输入草稿，重开报告不再次执行工具。记录与报告有明确类型和身份，不能被误认成演示工具结果或重新生成。

统一紧凑会话栏、原生 dialog、当前项状态、命中摘要、无结果提示、取消/选择后的焦点、窄屏图标按钮及浅深色。独立审查发现并修复了初始化图标、当前会话误停止、搜索焦点、弹窗内下载失败反馈等问题；视觉复核完成两轮修正，最终 accept。没有新增一套模型或事件协议。

## 修改范围与简化

| 文件 | 本轮内容 |
| --- | --- |
| `session-workspace.js` / `.css` | 工作台/桌面共享的会话栏、历史搜索、重命名、保存状态、恢复与备份；紧凑布局与独立弹窗操作区 |
| `session-search.js` | 提取完整聊天原有纯搜索函数，避免两套匹配逻辑 |
| `session-navigation.js` | 共用停止、提交、失败阻止跳转的交接逻辑 |
| `main.js` / `main.css` / `main-four-region.html` | 快速对话持久化接入、完整页链接、会话切换后的审阅区空状态；删除重复生命周期处理 |
| `chat.js` | 复用搜索和交接逻辑，处理浏览器返回恢复 |
| `conversation.js` / `components/message.js` / `session-store.js` | 本地记录模式、真实报告身份、Schema 白名单及不可重新执行的报告展示 |
| `desktop/index.html` / `src/main.ts` / `src/styles.css` | 正式桌面两栏布局、报告入库、无原生桥时的可理解提示 |
| `desktop/src/sessions.ts` / `src/shared.d.ts` | 桌面共用组件适配及窄范围 TypeScript 声明 |
| `tests/session-workspace.test.mjs` / `session-navigation.test.mjs` / `workspace-sessions.test.mjs` / `desktop-sessions.test.mjs` | 新入口、保存/恢复、冲突、搜索/焦点和桌面记录路径回归 |
| `tests/chat-sessions.test.mjs` / `conversation-continuity.test.mjs` / `session-store.test.mjs` / `desktop-controls.test.mjs` / `composer-surface.test.mjs` | 搜索提取、record Schema、无模型调用、报告保留及共享生命周期适配 |
| `desktop/README.md` / 本目录 `session-surfaces-plan.md`、`session-surfaces-sources.md`、本文件 | 范围、来源、启动与交付证据 |

前三组相对路径位于 `desktop/design-previews/`。原有大量未提交修改保留，本表不将其他轮次文件归成本轮改动。

## 参考依据

实际复看用户提供的 Codex 图、Claude 官方桌面演示封面、Cherry 官方助手/话题截图，并核对官方现行文档，详见 [来源与观察边界](session-surfaces-sources.md)。采用可辨认的当前上下文、历史重开、会话独立草稿和明确保存范围；没有把上游文档未保证的跨窗口草稿行为写成上游事实。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| `npm test` | **758/758 通过**，0 失败、0 跳过；包含规则数据校验 |
| `npm run lint` | 通过 |
| 显式 ESLint 覆盖本轮预览 JS 与测试（`--no-ignore`） | 通过；根配置默认忽略 desktop，已另行覆盖 |
| `npm --prefix desktop run build` | TypeScript + Vite 通过；保留既有 chat-transport 静态/动态导入同包提示，无构建错误 |
| `cargo check --offline --manifest-path desktop/src-tauri/Cargo.toml` | 通过，验证原生 Rust 可编译；不等同于原生界面验收 |
| 静态页面/资源检查 | 16 页、53 脚本、27 样式、223 本地引用通过；38 HTTP 路由 200 |
| 真实 Chromium 浏览器 UI 自动化 | **31 项断言通过**，最终工作台与桌面前端控制台 0 新错误 |
| 独立代码/视觉复核 | 最终 approve / accept，无本轮未关闭发现 |

日志及完整断言位于 [`../../../.omx/artifacts/session-surfaces/`](../../../.omx/artifacts/session-surfaces/)，核心文件 `tests-final.log`、`lint-final.log`、`preview-lint-final.log`、`build-final.log`、`cargo-check.log`、`static-final.log`、`browser-checks.json`。

浏览器实际验收：快速入口→完整页→返回与刷新；执行中交接停止且保留后续草稿；A/B 独立草稿；正文搜索定位、无结果与取消；编辑中刷新及取消编辑恢复原草稿；桌面本地记录、真实 CLI 报告入库与重开；读取失败/重试、配额失败/下载备份/恢复保存；真实双窗口版本冲突、取消重载和备份后恢复；冲突时阻止跨入口跳转；当前会话选择不误停止生成；390px、浅深色、重命名提交和焦点恢复。Chrome 的原生 search 输入第一次 Escape 清除关键词，第二次关闭弹窗并归还焦点。

正常页面用 `5501` 开发预览及 `1420` 正式桌面 Vite 前端。报告入库和故障验收另用仅本机 `5514` 的显式 TEST ONLY 桥：调用真实只读 CLI `guide`，代理正式前端，注入读/写失败；它不是 Tauri IPC。未发送付费模型请求，未使用假模型结果替代实际报告，未修改生产权限。

截图：

- [工作台历史搜索](../../../.omx/artifacts/session-surfaces/workspace-history-final.jpg)
- [桌面历史搜索](../../../.omx/artifacts/session-surfaces/desktop-history-final.jpg)
- [390px 浅色](../../../.omx/artifacts/session-surfaces/workspace-narrow-search-final.png)
- [390px 深色](../../../.omx/artifacts/session-surfaces/workspace-narrow-dark-final.png)

## 启动与限制

从仓库根运行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/main-four-region.html`。桌面前端浏览器预览：`npm --prefix desktop run dev -- --host 127.0.0.1`，打开 `http://127.0.0.1:1420/`；实际桌面在 `desktop` 运行 `npm run tauri dev`。本轮无需新增环境变量或依赖。仅改前端可刷新加载；已有模型连接内存凭据按原服务生命周期处理。

正式桌面的模型聊天/模型凭据 IPC 尚未接入；当前输入明确为本地记录。浏览器预览和 Tauri WebView 各自保存，未实现跨端或云同步。未操作 Windows 原生 WebView2 做端到端验收；本轮证据为真实浏览器前端、受控桥接路径和 Rust 编译。存储被清除、隐私模式及进程异常终止仍可能丢失未提交字符，故保存成功只在事务提交后显示；JSON 目前仅导出备份，尚无应用内导入。
