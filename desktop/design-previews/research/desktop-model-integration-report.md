# 正式桌面模型聊天与 Windows 原生验收

日期：2026-10-18。直接实施，复用现有技术栈；没有新增生产依赖、提交或部署。以下是本轮增量，仓库原有未提交修改均保留。

## 交付结果

正式 Tauri 桌面现在复用现有 OpenAI、Anthropic、Google、OpenRouter 和 Ollama 文本聊天实现。模型连接面板支持 API Key、目录读取/刷新、断开、搜索选模，以及 OpenRouter PKCE 授权/取消/状态轮询。未选模型时保留草稿并打开连接面板，不生成演示回复。

前端通过 Tauri Channel 调用应用拥有的 Node 进程，沿用既有连接 broker、提供方适配和 UI Message Stream 解析。停止可贯通到上游，保留部分回复；错误提供手动重试。每个会话保留模型选择、消息和独立草稿，历史搜索重开原会话，刷新和整个应用退出重开均恢复已保存内容。应用重启后内存凭据清空，需要重新连接。

本机工具报告仍须手动加入会话。报告插入不清空草稿，不重复执行，不自动发送给模型，也不会切断之前真实聊天的上下文。

## 修改文件与简化

| 文件 | 内容 |
| --- | --- |
| `desktop/server/desktop-bridge.mjs` | 私有回环 broker、进程内 cookie、固定路由、stdio 事件、取消和一次性 OAuth 回调桥 |
| `desktop/src-tauri/src/model_bridge.rs`、`lib.rs`、`tauri.conf.json` | Channel 命令、受控子进程、退出/异常清理、运行资源打包映射 |
| `desktop/server/guide-stream.mjs` | 延迟导入规则引擎，避免模型服务启动时引入无关规则数据/依赖 |
| `desktop/design-previews/desktop-model-fetch.js`、`desktop/src/model-fetch.ts`、`desktop-bridge-types.d.ts` | 将原生事件适配为既有 fetch/ReadableStream 接口，取消竞态和有界输出 |
| `desktop/src/model-connection.ts`、`sessions.ts`、`shared.d.ts` | 模型连接、选模、真实流式会话与现有存档接入 |
| `desktop/index.html`、`src/styles.css` | 紧凑中性色设置面板、原品牌图标、中文字体、选中态、窄窗口和焦点 |
| `desktop/design-previews/conversation.js` | 明确要求真实模型、保留报告路径、真实聊天上下文跨报告连续 |
| `chat-transport.js`、`model-connection-client.js` | 错误说明兼容桌面与开发预览，不再只提示预览命令 |
| `scripts/setup-desktop-native-e2e.ps1`、`desktop-native-e2e.mjs` | 官方驱动安装、真实 Windows WebView2 E2E、隔离测试存档与可重复上游 fixture |
| `tests/desktop-model-{bridge,fetch,dialog}.test.mjs`、`desktop-sessions.test.mjs`、`live-conversation.test.mjs`、`model-settings.test.mjs` | IPC/取消/OAuth/恢复/持久化边界回归 |
| `desktop/README.md`、本目录计划、来源和本报告 | 启动方式、实际能力和验收边界 |

没有复制各厂商 API、另建消息协议或另建会话数据库。删除桌面仅记录限制、重复模型 ID 和重复状态更新；共享流解析、连接客户端、会话控制器、图标和主题。

## 实际验证

| 检查 | 结果与证据 |
| --- | --- |
| `npm test` | **776/776 通过**，无失败/跳过；包含规则验证，见 `.omx/artifacts/desktop-model-native/tests-final.log` |
| 项目 ESLint + 桌面 JS 显式 ESLint | 通过，见 `lint-final.log`、`desktop-lint-final.log` |
| TypeScript / Vite / Windows exe 构建 | 通过：`npm --prefix desktop run tauri -- build --debug --no-bundle`，见 `native-build.log` |
| Rust 测试与格式 | **1/1 通过**，`cargo fmt --check` 通过，见 `rust-tests.log`、`rust-format.log` |
| 打包资源 smoke | 复制到 runtime 的模型服务可独立启动、返回五家未连接状态、stdin 关闭后退出，见 `resource-smoke.log` |
| 独立代码/安全复核 | 修复四项问题后 APPROVE；117 项定向测试、Rust、类型和 lint 通过 |
| 最终 Windows 原生确定性 E2E | **11/11 通过**，见 `run-2026-10-18T18-31-58-300Z/results.json` |
| 最终真实本机模型 E2E | **3/3 通过**，真实 `llama3.2:3b` 返回“连接成功”，见 `run-2026-10-18T18-32-30-618Z/results.json` |
| 最后视觉修正回归 | 21 项桌面路径和 5 项弹窗检查通过；窄窗口关闭按钮与焦点在最终原生运行再次通过 |

证据均位于 `.omx/artifacts/desktop-model-native/`。最终两次原生运行的 exe SHA-256：`99a8e829e848557ebeece94f021b9c282f0e5a4cf9ff3d84bd778da10750b443`。

确定性 E2E 覆盖：原生应用启动、未连接保留草稿、目录/选模、首段先于终段出现、停止后上游连接中止且正文不增长、失败重试、会话切换与正文历史搜索、390 窄窗口及 Escape 焦点恢复、刷新、退出重开、重开后重新连接发送。

测试启动真正的 `desktop.exe` 并检查 Tauri URL 与原生桥，不是浏览器预览或伪造 invoke。确定性运行仅把子进程的固定 Ollama 上游重定向到测试服务，明确是协议 fixture；真实模型运行无该重定向，无付费 API、无模型下载。用户已有 Ollama 进程保持运行。验收结束检查没有测试 desktop、tauri-driver、msedgedriver 或 desktop-bridge 子进程残留。

## 视觉与交互验收

复看归档的 Codex 用户截图、Claude 官方桌面图片和 Cherry 官方会话截图，使用内容优先、紧凑输入区、清楚的当前上下文与服务商分组；来源与观察边界见 `session-surfaces-sources.md`。Windows 驱动/API/许可证依据见 `desktop-native-e2e-sources.md`。

原生截图按 1000×720、1280×850 和 390×844 窗口检查；实际 WebView 截图含设备缩放，未声称覆盖系统标题栏或文件选择器。修正了重复模型名称、当前模型选中态、窄窗口关闭文字换行和当前服务商不在可视范围。最终 `model-dialog-narrow.png`、`conversation-1280x850.png` 及真实回复图已人工查看。执行态沿用文字渐变和 reduced-motion 分支，没有新增加载圆圈。

## 安全与恢复修正

- 前端、Rust、Node 均限制路径、方法、头与负载；没有任意 URL 或任意命令执行接口。私有 HTTP 地址不作为通用前端 API 暴露。
- 密钥保留在 Node 内存，不进入 IndexedDB、消息或日志；响应不转发 cookie，原始进程/上游错误不回显。
- OAuth 成功必须匹配 transaction/state/期限；拒绝回调只允许精确一次性路径，且不能携带 code 绕过成功状态校验。重复回调被拒绝。
- 目录失败仍可用已保留凭据刷新/断开；浏览器授权打开失败后会重新读取真实状态，显示取消入口。后台轮询不抢焦点。
- 原生请求接受前取消、读取中取消、进程退出、停止后再次请求均有自动化覆盖；不自动重复付费请求。

## 运行与边界

开发：`npm --prefix desktop run tauri -- dev`。构建与验收命令见 `desktop/README.md`；模型凭据在应用中输入，无新增环境变量。仍要求系统 Node.js 20+、Rust 开发工具及 WebView2。驱动安装到忽略目录，不提交/再分发微软二进制。

本轮验收对象是当前源码构建的 Windows debug 原生应用；尚未验收安装包、签名分发或其他系统。模型运行资源已做独立启动检查；既有规则 CLI 的正式打包路径仍是原有待完善项。

真实推理已验收本机 Ollama；OpenAI、Anthropic、Google、OpenRouter 的适配/错误路径通过自动化，但没有使用外部真实账户进行付费推理或 OAuth 授权。没有 ChatGPT/Claude 订阅 OAuth、系统凭据库或云历史同步。当前 Node 前置条件和凭据仅内存保存是明确产品边界。
