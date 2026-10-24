# 清单成果：实现与验证

日期：2026-10-17。实施前记录见 [计划](guide-artifact-plan.md)，真实官方调研见 [来源](guide-artifact-sources.md)。本轮解决上一轮真实清单只能复制摘要、长内容难查找和阶段状态丢失的问题。

## 使用路径与结果

工作台或完整聊天 → 输入框“＋” → 生成上线清单 → 填写三个条件并生成 → 搜索、复制完整清单、下载 Markdown 或导出 JSON。

- 消息复制和成果卡复制均带走完整 Markdown，包含输入、适用项、条件自查项、要求、来源和历史核验日期。JSON 保留原始规则结果，不添加聊天、草稿、模型配置或凭据。
- 搜索支持规则标题、编号、阶段、要求、解释与原文，中文组合输入结束后应用。清空恢复原阶段展开状态；导出始终包含全部结果。
- 会话视图按消息保存搜索与展开状态；同一成果更新消息时保留搜索节点、焦点和光标。刷新页面仍不持久保存。
- 失败、停止和无效结果不能导出。复制失败可重试，迟到回调不污染新会话。下载仅提示已发起，可在浏览器下载列表确认。
- 原生 Blob URL 资源有上限、延迟清理与离页清理。没有新增后端调用、模型请求、项目写入权限或依赖。

## 实际文件与简化

| 文件 | 修改 |
| --- | --- |
| `desktop/design-previews/guide-artifact.js`（新增） | 共用输入/结果校验的纯序列化函数；复制与 Markdown 导出共用一份完整内容；原始 JSON 导出 |
| `desktop/design-previews/artifact-download.js`（新增） | 本地原生下载、有界 Blob URL 复用、失败与生命周期清理 |
| `desktop/design-previews/components/message.js`、`message.css` | 成果动作、搜索、匹配状态与空态、稳定分区阶段标识；删除重复阶段名称表并复用 STAGES |
| `desktop/design-previews/conversation.js` | 复用既有复制 pending/epoch 保护；导出校验、IME 与搜索事件、视图状态和节点保留 |
| `tests/guide-artifact.test.mjs`、`guide-artifact-ui.test.mjs`、`artifact-download.test.mjs`（新增） | 完整序列化、12 种规则输入组合、搜索与状态、下载资源与失败路径 |
| `tests/conversation-continuity.test.mjs` | 5 项集成回归：完整复制、导出不受搜索影响、失败/迟到、无效状态、IME/焦点/跨会话恢复 |
| `desktop/README.md`、`AGENT-INTERACTION-STANDARD.md`、`research/guide-artifact-{plan,sources,report}.md` | 当前使用方式、交互约定、证据与边界 |

保留已有消息状态机、会话视图、原生 disclosure、主题和按钮，不新建另一套成果运行时。未改服务端、规则内核、依赖清单或模型认证。

## 验证证据

本机 Windows，Node 24.14.0。先补失败回归，再实现：完整复制从摘要变为清单；下载器对非字符串文件名的回归暴露异常后已修复。两路独立只读审查覆盖序列化/下载生命周期与 UI/会话整合，未发现剩余确定性阻断问题。

| 检查 | 结果 |
| --- | --- |
| `npm test` | **598/598 通过**，0 失败/取消/跳过，比上一轮 579 增加 19；日志 `.omx/guide-artifact-tests.log` |
| `npm run lint` | 通过 |
| `npx eslint --no-ignore` 检查本轮 4 个预览 JS | 通过；避免把默认忽略的 desktop 文件误算为已检查 |
| `npm --prefix desktop run build` | TypeScript + Vite 通过；该构建不编译静态预览，因此另做资源检查 |
| 静态预览检查 | 16 HTML、48 脚本、24 样式表、202 本地引用有效；38 HTTP 路由返回 200 |
| 两个新 JS 的实际 HTTP 请求 | 均返回 200，JavaScript MIME 与模块内容正确 |
| `git diff --check` | 通过；已有文件的 CRLF 提示不属于新增错误 |

测试涵盖导出与原始数据一致、恶意 Markdown 文本转义、分区与字段完整、全部输入组合、搜索不裁剪导出、原生下载替身和资源上限、页面/会话清理、搜索焦点/光标与组合输入、复制失败/重复点击/迟到隔离。未变更依赖，未重复上轮无变更依赖审计。

## 启动与验收边界

从仓库根目录执行 `node desktop/design-previews/_serve.mjs`，打开 [完整聊天](http://127.0.0.1:5501/chat-full.html) 或 [工作台](http://127.0.0.1:5501/main-four-region.html)。现有 5501 服务继续使用，本轮刷新页面即可；无新增环境变量，无需模型密钥。

遵从用户此前“本轮先完成代码与自动化验证”的选择，未使用禁用的本地浏览器或替代访问方式。**DQ-05 浏览器/视觉验收 BLOCKED**：真实剪贴板权限、文件保存、中文输入法、屏幕阅读器、响应式视觉仍待验收。自动化使用 DOM 和下载替身，不保证不同浏览器的保存行为。

**DQ-09 发布验收 BLOCKED**：未运行正式 Tauri 原生系统验收、跨平台 CI 矩阵或发布引用检查；没有部署或提交，不能据此宣称正式桌面或发布就绪。清单仍基于仓库规则，不扫描项目或实时核验；此轮也未新增模型工具选择、聊天持久化或 Tauri 成果 IPC。

恢复时只撤回本轮增量，保留已有工作区改动；不涉及数据迁移或服务凭据重置。验收状态记录于 `.omx/state/guide-artifact/ralph-progress.json`。
