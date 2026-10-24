# 设置、会话历史与弹窗细节验收

日期：2026-10-20。延续现有 Vanilla TypeScript / JavaScript + Vite + Tauri 2 实现，无新增依赖、存储迁移或认证协议修改。

## 真实截图与采用范围

本轮实际打开并查看以下原图。来源清单保存在 `.omx/artifacts/settings-history-detail/references/manifest.json`，截图仅作为研究证据，不加入产品资源。

| 来源 | 证据与版本边界 | 本轮采用的视觉细节 |
| --- | --- | --- |
| [Codex 社区设置截图](https://github.com/openai/codex/issues/23794) | 2026-06-05 djoole、2026-06-09 raunaqpatel-cmd 评论的两张原图；截图自身版本未核实 | 设置标题与说明分层、行内控件对齐、细分隔线和克制的图标数量 |
| [Claude 社区历史搜索截图](https://github.com/anthropics/claude-code/issues/100949) | 2026-10-10；报告为 Claude Desktop 2.31226.0、macOS 27.0.1 | 搜索、结果、辅助操作分层，单行标题截断，低强调辅助内容；截图中的删除/归档混入搜索属于问题报告，不照搬 |
| [Cherry Studio 官方服务商设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) | 官方页面的 API Key 弹窗原图，未注明版本 | 服务商品牌与标题、输入/显示控件、字段下帮助链接、独立底部操作 |

行为结论来自本项目自动化，不通过静态截图推断竞品完整交互。未声称像素复刻，也未把旧截图称为这些产品当前唯一界面。

## 实际修改

| 文件 | 修改与简化 |
| --- | --- |
| `desktop/design-previews/session-workspace.js`、`session-workspace.css` | 历史弹窗限制 560px，重命名限制 400px；统一标题和关闭按钮、搜索图标和清空、当前项勾号、标题/摘要层级、独立空状态；保持原生 dialog 和已有图标工具，不再只有裸输入与文本列表 |
| 同上 | 搜索支持方向键/Enter、先清搜索再关闭的 Escape、IME 防护；无匹配后可恢复；重命名行内错误关联输入，重新输入清除错误；保持会话搜索与持久化语义 |
| `desktop/design-previews/settings.html`、`settings.css`、`settings.js`、`settings-navigation.js` | 内容区上限从 1180px 收为 1060px；修复返回箭头被文本更新移除；使用共享展开、外链、返回对话、目录搜索和空状态图标；模型名称用 UI 字体、ID 用代码字体；减少空目录背景装饰 |
| `desktop/src/model-connection.ts` | 后台目录更新移除正在聚焦的模型时，焦点回到搜索框；关闭的弹窗不抢焦点 |
| `tests/session-workspace.test.mjs`、`tests/desktop-model-dialog.test.mjs` | 增加历史键盘/输入法、重命名反馈与模型目录移除的回归保护 |
| `tests/settings-navigation.test.mjs`、`tests/model-settings.test.mjs` | 校验真实共享图标的装饰语义与导航行为 |
| `scripts/desktop-native-e2e.mjs` | 增加历史空状态、键盘选择、两级 Escape、重命名错误恢复与保存；窄屏检查历史边界，刷新检查重命名结果 |
| 本文、`settings-history-detail-plan.md`、`desktop/README.md` | 记录实施范围、真实来源、结果和限制 |

共享历史/重命名组件应用于工作台快速对话与正式桌面。`chat-full.html` 的独立历史实现未在本轮重新设计。

## 验收结果

| 验证 | 本轮结果 |
| --- | --- |
| `npm test` | **798 / 798 通过**，0 失败、0 跳过 |
| `npm run lint` | 通过 |
| 共享 JS / MJS 显式 ESLint、桌面 `tsc --noEmit` | 独立审查通过；审查另运行相关测试 **70 / 70**，该数字是总测试的子集 |
| `npm --prefix desktop run tauri -- build --debug --no-bundle` | TypeScript、Vite、Rust 构建成功 |
| `node scripts/desktop-native-e2e.mjs` | **18 / 18 通过**，真实构建的 Tauri exe + WebView2 + IPC，隔离测试存档 |
| 浏览器自动化 | **9 项行为/边界断言通过，1 项深色视觉检查通过**；两页未捕获 console warning/error |
| 独立代码审查 | 本轮范围未发现需要修改的问题 |
| `git diff --check`（本轮受控路径） | 无空白错误；已有 CRLF 规范化提示 |

浏览器覆盖：历史无结果和清空、两级 Escape、结果键盘选择和焦点归还、重命名校验及刷新保留草稿、凭据显示/取消后清空、设置搜索恢复、390×844 设置和历史、390×500 凭据弹窗、深色设置/外观/历史。未提交任何真实或虚假 API Key；仅在输入框填入明确的测试文本后取消。测试后恢复临时视口和浅色主题。

原生端覆盖：有界输入区、项目工具抽屉切换、未选模型时保留草稿、连接与选模、流式、停止、错误重试、历史、重命名、窄屏和刷新/进程重启恢复。上游采用明确标记的 Ollama 协议 fixture，**不是本轮真实 LLM 推理或云厂商账户验证**。

## 截图与证据

- 浏览器与测试日志：`.omx/artifacts/settings-history-detail/`
- 浏览器断言：同目录 `browser-results.json`
- 来源：同目录 `references/manifest.json` 与 4 张原图
- 对照：`settings-before.jpg` / `settings-after.jpg`、`credential-before.jpg` / `credential-after.jpg`、`history-before.jpg` / `history-after.jpg`
- 状态：`history-empty.jpg`、`history-search.jpg`、`rename-validation.jpg`、`settings-narrow.jpg`、`history-narrow.jpg`、`credential-short.jpg`
- 深色：`settings-dark.jpg`、`appearance-dark.jpg`、`history-dark.jpg`
- 原生：`.omx/artifacts/desktop-model-native/run-2026-10-20T10-38-39-972Z/`
- 原生结果：该目录 `results.json` 含二进制 SHA-256、18 条用例与耗时，截图包含历史、重命名、模型连接和对话
- 视觉判定：`.omx/state/settings-history-detail/ralph-progress.json`，使用直接截图比较，未运行 OMX runtime

视觉复核结论：本轮范围内的标题、搜索、结果和底部操作层级清楚；共享图标不替代必要文字；长标题截断且保留可访问名称；浅深色的当前项和输入焦点可辨认；窄屏没有页面横向溢出，短屏弹窗按钮可见。保留既有动效与 reduced-motion 处理，不增加旋转加载器或装饰动画。

## 启动与已知边界

```powershell
# 浏览器预览（仓库根目录）
node desktop/design-previews/_serve.mjs
# http://127.0.0.1:5501/settings.html
# http://127.0.0.1:5501/main-four-region.html

# 正式桌面
npm --prefix desktop run tauri dev
```

本轮无需新增环境变量。模型调用仍需用户自己的有效连接或已有本地模型。

未覆盖付费云模型、OAuth 真实账号、Windows 文件选择器或安装包分发；其他被标为“预览”的业务设置仍为预览。构建保留既有 `chat-transport.js` 静态/动态混合导入的 Vite 分包提示，不影响本轮构建。浏览器保留一条明确命名的“验收 · 设置与历史 1020”会话及未发送草稿；没有删除既有会话。
