# 模型授权与恢复流程

日期：2026-10-20。范围：现有 Node 本地代理、Web Awesome 设置页面、Tauri 模型连接。

## 已确认的现状与选择

已有 API Key（OpenAI、Anthropic、Google、OpenRouter）、OpenRouter OAuth PKCE、免密本机 Ollama。继续复用现有连接代理、流式协议和组件；不引入第二套登录框架。产品订阅登录与开发者模型 API 授权不能混为一谈。

本次补齐 OpenRouter 官方提供的无回调授权码模式，以及浏览器/桌面端刷新或重新打开后的授权恢复。官方协议返回用户控制的 API Key，不伪造 access_token/refresh_token。

来源：
- https://openrouter.ai/docs/guides/overview/auth/oauth
- https://www.rfc-editor.org/info/rfc9700/
- https://www.rfc-editor.org/info/rfc8252/

## 修改范围与共享契约

1. 服务端：`POST /openrouter/oauth/start` 接受可选 `mode: callback | manual`，默认 callback。返回授权链接、模式、flowId、expiresAt。手动模式不发送 callback_url/state，使用相同 S256 交换。
2. 安全快照：仅 waiting 时暴露当前授权链接、mode、flowId，便于重开；不暴露 verifier、授权码、API Key。终态清除链接。所有字段只保留本机内存。
3. `POST /openrouter/oauth/complete` 接受严格 `{flowId, code}`；仅当前 manual/waiting 流程可交换；由既有会话/CSRF 保护；拒绝过期、旧流程、重复提交、并发和错误格式；取消后晚到结果不得恢复连接。
4. Web 与桌面：明确浏览器授权、授权码连接和 API Key；等待页提供重开链接、过期时间、取消；手动授权码用密码输入、提交即清空；显示取消/拒绝/过期/失败终态。沿用渐变文字与现有原生 dialog/开源按钮。
5. 桌面桥：同步最小路由白名单；manual 不登记 loopback callback。callback 保持单次、精确地址/state 验证。输入框、历史和本地存储均不得保存秘密。
6. 验收：协议与隔离回归、浏览器授权码成功/失败/取消/刷新恢复，Windows 原生控件路径及原有聊天回归。测试使用明确标注的本地上游 fixture；真实账户授权不宣称完成。

## 清理与回归策略

复用单一交换函数处理 callback/manual，避免复制认证逻辑。替换“链接丢失只能取消”的恢复路径，保留已连接账号和既有错误恢复语义。无新依赖。

修改前相关 75 项测试通过。完成后执行 ESLint、类型检查、构建、协议/客户端/界面测试以及浏览器和 Windows 实际运行验收；认证边界由独立代理复核。
