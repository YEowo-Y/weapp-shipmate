# 拒因结果阅读与会话衔接：交付记录

日期：2026-10-21。本轮范围为拒因查询后的阅读、复制、显式加入桌面会话与找回结果；不代表全部产品或安装包已经发布就绪。

## 调研与设计落实

实际查看 [Cherry Studio 官方聊天说明](https://cherryai.com/docs/en/cherrystudio/preview/chat/) 及其[真实产品截图](https://cherryai.com/docs/content-assets/ea2f3f51dcba385254d1f719.webp)，并阅读 [Claude 成果说明](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)。借鉴正文与操作的清晰层级、可复用成果和会话上下文延续；这是针对本项目业务的设计取舍，不是像素级复刻。本轮未重新检视所有竞品页面。

原界面在查询完成后仍由输入表单占据首屏，结果缺少后续去向。现在命中后将原查询收为可展开摘要，结果标题与统一操作按钮前置；空结果、错误及编辑仍保留输入路径。按拒因分组的规则、来源和核验日期保持可核对。桌面弹窗沿用 720 CSS px 上限；窄屏按钮可换行，复用现有字号、颜色和间距令牌。

复用 Web Awesome 按钮、Lucide 图标、原生 details/dialog、现有 Markdown 转义与会话保存接口。没有引入依赖、重复消息协议或第二套组件框架。

## 实际修改文件

| 文件 | 修改 |
| --- | --- |
| `desktop/design-previews/explain.html`、`desktop/index.html` | 查询摘要、结果操作和可读屏反馈结构 |
| `desktop/design-previews/explain.css` | 折叠查询布局、操作间距、焦点和窄屏目标大小 |
| `desktop/design-previews/explain.js` | 结果优先展示、复制重试、失效异步反馈隔离、可注入会话保存 |
| `desktop/design-previews/explain-artifact.js` | 经 Schema 校验的 Markdown 成果，包含查询、规则、要求和官方来源 |
| `desktop/design-previews/guide-artifact.js` | 导出现有转义函数供复用 |
| `desktop/design-previews/preview.js` | 真实拒因查询标记为“本地规则查询”，避免误标示例数据 |
| `desktop/src/sessions.ts` | 报告可选去重、长度与会话容量限制；复用既有持久化 |
| `desktop/src/main.ts`、`desktop/src/explain-dialog.ts`、`desktop/src/shared.d.ts` | 接入真实桌面会话、成功后返回输入框、重复提示保持可见及类型声明 |
| `tests/explain-artifact.test.mjs`、`tests/local-explain-ui.test.mjs`、`tests/helpers/explain-ui.mjs` | 成果契约、折叠、复制失败/晚返回、保存失败与去重验证 |
| `tests/desktop-sessions.test.mjs`、`tests/preview-preferences.test.mjs` | 会话容量/去重、真实查询标记回归 |
| `scripts/desktop-native-e2e.mjs` | 实际桌面结果保存、历史检索、草稿保留、刷新与重启恢复验收 |
| `desktop/README.md`、本目录计划与交付记录 | 更新行为、启动与证据边界 |

## 验证

改动前新增的 3 项查询 UI 测试及 1 项会话测试已观察到失败，再实现修复。最终证据：

- `npm test`：935/935 通过，无跳过；日志 `.omx/artifacts/explain-result-tests.log`。
- `npm run lint` 与共享 JS 显式 ESLint：通过。
- `npm --prefix desktop run build`：TypeScript 与 Vite 构建通过。
- `npm --prefix desktop run tauri build -- --debug --no-bundle`：最终源码 Windows 调试构建通过。
- `node scripts/desktop-native-e2e.mjs`：37/37 通过，运行实际 Tauri / WebView2 / IPC；包括新结果只加入一次、原草稿保留、不发送模型请求、历史正文搜索、刷新与重启恢复。
- 独立代码审查：修复“重复保存后弹窗关闭遮住反馈”，针对性 18 项测试及类型/静态检查通过，复核后无未解决发现。
- 实际浏览器：真实规则匹配、成功收起表单、键盘展开、无命中后重新查询、复制后的真实粘贴回读通过；剪贴板内容为 1265 字符的完整报告。浅深色截图已检查，控制台 error/warn 均为空。390×844 CSS px 的 DOM 检查无横向溢出。

全量 935 项测试在最后一处桌面重复保存反馈修正之前运行；该修正随后通过针对性复测、重新构建及完整 37 项原生回归。无其他后续产品代码修改。

原生证据目录：`.omx/artifacts/desktop-model-native/run-2026-10-21T17-44-15-726Z/`，`results.json` 记录每项检查；测试 exe SHA-256 为 `a7968f694ee72ba23853e56654e26095b5cc528e56f418855ae442080c0c98a1`。

截图：

- `explain-result.png`：正式桌面紧凑查询摘要、复制与会话操作、来源展开。
- `explain-narrow.png`：正式桌面 390 CSS px 窄窗口。
- `explain-saved-conversation.png`：报告进入会话且草稿保留。
- `.omx/artifacts/explain-result-browser/result-light.jpg`、`result-dark.jpg`：实际浏览器浅深色页面。

浏览器的窄屏截图通道存在缩放差异，因此未将其 `result-390.*` 用作视觉通过证据；窄屏视觉以实际原生截图为准，浏览器仅记录 DOM 尺寸断言。

## 运行与边界

从仓库根目录运行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/explain.html`。桌面运行 `npm --prefix desktop run tauri dev`。本轮无需环境变量、API 密钥或新依赖。

浏览器拒因页提供复制；加入当前会话为正式桌面能力。只有显式加入且存储事务成功的报告进入历史，查询输入和未加入的结果不会在应用重启后自动恢复。加入成功的反馈不会冒充持久化完成，真实保存状态仍由会话区显示；存储不可用时沿用原有恢复流程。

拒因查询使用真实仓库规则，不扫描项目，也未实时核验官方页面。模型与 OAuth 回归使用明确标记的 Ollama/OpenRouter 协议 fixture，不能据此宣称外部账号授权或付费模型验收通过。未验证安装包分发；现有 Vite 关于 chat-transport 静态/动态重复导入的提示仍存在，不影响本轮构建。未修改模型授权或存储格式，可单独回退本轮界面和成果接入。
