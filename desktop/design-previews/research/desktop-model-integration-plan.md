# 正式桌面真实模型聊天：实施与验收

日期：2026-10-18。直接实施模式；沿用 Tauri 2 + TypeScript + Node，不增加生产依赖。

## 修改边界与简化

- 复用既有模型连接、五家提供方、UI Message Stream 解析、会话控制器和 IndexedDB。删除桌面仅记录模式的限制，保留本地报告的来源标识。
- WebView 经 Tauri Channel 与应用拥有的 Node 进程通信；不开放通用 HTTP 代理、不将密钥写入会话、不复制厂商 API。
- 提供紧凑模型连接面板和可搜索目录；保留 Enter/IME、停止、部分输出、错误重试和逐会话模型/草稿。
- Windows 原生测试使用官方 tauri-driver + 匹配 WebView2 的 Microsoft Edge WebDriver。以明确标记的本地 Ollama 协议服务提供确定性测试数据，真实应用、IPC、broker、流解析和存储均参与测试。

## 信任边界

1. 前端请求只允许固定模型 API 路径、方法、请求体大小和少量头；Rust/Node 再验证。凭据仅存于 Node 内存。
2. 内部回环 HTTP 服务仅接受随机令牌认证；外部浏览器只有精确绑定一次性 transaction/state/期限的 OAuth 回调入口，仍通过既有 broker 校验。
3. 停止与流取消必须中止上游请求；进程退出清空连接并结束子进程。重开只恢复消息/草稿，明确要求重新连接模型。
4. 模型返回的数据按现有受约束 Markdown 渲染，不能触发命令、扩大权限或自动执行报告内容。
5. 测试使用独立 WebView2 存档，不触碰真实用户会话或密钥；不在生产代码加入测试开关。

## 验收条件

- 首次打开无模型时显示连接入口，不伪装为已接入的模型或自动返回演示答案。
- 连接 → 目录 → 选择 → 流式回复 → 停止 → 再次发送形成闭环，错误可恢复。
- 会话切换、历史搜索、刷新及整个应用重启后，已保存消息、草稿和模型选择保留；失效连接提示清晰。
- 密钥不出现在响应、日志、IndexedDB 或错误正文；服务进程崩溃/退出可清理，非法代理路径被拒绝。
- 全量 Node 测试、适用 ESLint、TypeScript/Vite、Rust 检查/测试通过；对当前源码构建的 Windows exe 运行原生 E2E 并留存截图、步骤和断言。

## 来源与实际覆盖

视觉依据沿用并复核 `session-surfaces-sources.md` 中 Codex 用户截图、Claude 官方桌面图片和 Cherry 官方会话界面；不据此声称完全复制其内部实现。
Tauri 官方 Channels 文档：https://v2.tauri.app/develop/calling-frontend/ ，说明其适用于有序流数据。
驱动版本、许可与安装来源见 `desktop-native-e2e-sources.md`。
此文是实施契约，不是已通过的验收报告；最终证据另记录。
