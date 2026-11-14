# 正式桌面端布局与组件打磨 · 2026-10-19

本轮调整正式 Tauri 桌面入口，保留现有模型、会话与报告逻辑。未增加生产依赖，也未修改凭据或消息协议。

## 真实参考与选择

实际查看用户提供的 Codex 输入框/菜单截图、仓库存档中的 Claude 官方桌面演示封面、Cherry 官方聊天与服务商设置截图，并与原生桌面截图逐项比较。

- [Claude 桌面工作区](https://code.claude.com/docs/en/desktop)：当前会话与辅助面板分区、上下文切换、按需显示工具。
- [Cherry 聊天界面](https://cherryai.com/docs/en/cherrystudio/preview/chat/)：消息为主要阅读区域，操作保持轻量。
- [Cherry 服务商设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)：服务商导航与连接详情分开，明确连接和模型选择关系。

704px 阅读上限、320px 工具栏和 860px 抽屉断点是当前产品的设计选择，不是对参考产品像素尺寸的断言。没有登录上游产品账户或宣称所有版本完全一致。

## 实际修改与简化

| 文件 | 调整 |
| --- | --- |
| `desktop/index.html` | 三层标题与导航合并为单层顶部栏；保留会话标题的无障碍语义；工具改为可关闭原生 dialog；重排空状态与项目操作。 |
| `desktop/src/styles.css` | 消息和输入共用 704px 上限；单一窗口高度；工具宽屏侧栏、窄屏抽屉；减少重复说明；模型连接视觉层级、焦点与悬停态统一。 |
| `desktop/src/tools-panel.ts` | 管理打开、关闭、焦点恢复与跨断点模式切换；保留报告 DOM 和进行中的工作。 |
| `desktop/src/main.ts`、`desktop/src/shared.d.ts` | 接入工具面板，复用已有共享图标函数和类型。 |
| `desktop/src/model-connection.ts` | 依据真实连接状态区分连接/更新密钥；统一关闭、刷新和重试图标；连接请求失败时使用错误色，避免旧的连接状态造成绿色报错。 |
| `tests/desktop-tools-panel.test.mjs` | 新增侧栏/抽屉、焦点、关闭竞态和销毁的行为覆盖。 |
| `tests/desktop-model-dialog.test.mjs`、`tests/desktop-controls.test.mjs` | 增加连接操作层级和错误色回归，适配共享图标与面板初始化。 |
| `scripts/desktop-native-e2e.mjs` | 在实际 Windows WebView2 中验收布局、工具报告、模态切换和更多窗口尺寸。 |

操作图标复用项目已有的 Lucide 白名单与统一描边，不引入另一套图标库；服务商品牌使用现有官方资源。纯图标按钮提供名称与标题，装饰 SVG 不进入辅助技术的朗读名称。低频操作保留文字，不给每段信息额外堆图标。

删除重复可见标题和常驻空工具区，隐藏重复的已保存/已完成视觉提示但保留 live status，取消工具报告的第二层滚动区域。共享消息、输入框、会话管理组件继续复用。

## 实际验收

日志位于 `.omx/artifacts/desktop-layout-refinement/`。

- 修改前桌面相关基线：21/21。
- 最终 `npm test`：**784/784**，0 失败、0 跳过（`tests-final.log`）。
- 最终 `npm run lint` 与 `git diff --check`：通过。根 ESLint 仍排除 desktop；桌面 TypeScript 由下述构建检查。
- 最终 `npm --prefix desktop run tauri -- build --debug --no-bundle`：TypeScript、Vite、Rust 构建通过（`native-build-final.log`）。
- `node scripts/desktop-native-e2e.mjs`：**15/15**。实际 exe、真实 IPC、独立 WebView2 存档；上游是明确标记的 Ollama 协议 fixture，不能当作真实模型推理。
- `node scripts/desktop-native-e2e.mjs --real-ollama`：**3/3**。连接已有 `llama3.2:3b`，经正式桌面 IPC 获得真实本机模型回复；无模型下载、无外部付费 API。

最终原生证据：

- 布局及回归：`.omx/artifacts/desktop-model-native/run-2026-10-19T16-28-12-744Z/`
- 真实本机模型：`.omx/artifacts/desktop-model-native/run-2026-10-19T16-28-55-864Z/`
- 两轮使用同一 exe，SHA-256：`a3c1b5788639fde6e93cf31e974783c935e126c4ebd4ad85befcf9d288b22173`。

人工查看实际截图：1280×850 空状态、900×1000、中等/矮窗口、390×500、390×844 模型连接、工具报告及真实回复。自动断言覆盖输入框宽度/居中、完整可见、页面无溢出、工具报告保留、Escape 焦点恢复、流式增量、停止取消、重试、历史搜索、刷新及退出重启恢复。

新增 800–980px 回归先在旧实现失败：800×720 的会话底部为 700px，窗口布局底部为 720px。实际截图确认来自共享预览页固定高度；桌面入口显式使用自动高度后，800×720、900×1000、900×500、1000×500、390×500 均通过。失败证据保留于 `run-2026-10-19T16-27-06-024Z/`。

## 启动与边界

仓库根目录运行 `npm --prefix desktop run tauri -- dev`。无需新增环境变量。仅查看前端可用 `npm --prefix desktop run dev -- --host 127.0.0.1`；浏览器预览不能替代 Tauri IPC。

本轮修正正式桌面壳层与连接界面，未全面重写其他设计预览页。外部服务商真实账户、完整屏幕阅读器流程、Windows 文件选择器和安装包分发未重新验收。已有动态/静态重复导入的 Vite 提示仍存在，不影响本轮构建。

独立审查提出的错误色问题已修复并添加回归；审查代理随后因额度限制未完成最终签字，最终复核与验收由主代理执行。浏览器 MCP 扩展连接不可用，实际页面检查使用可用的应用内浏览器，自动化验收使用真实 Windows 原生驱动。
