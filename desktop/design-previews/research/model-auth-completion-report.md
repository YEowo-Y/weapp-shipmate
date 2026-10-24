# 模型授权连接补齐与验收

日期：2026-10-20。范围：浏览器设置、正式 Tauri 桌面、共享 Node 连接代理。

## 结果与技术选择

继续使用 Vanilla TypeScript / Vite / Tauri 2、既有 Node 连接代理和 Web Awesome 3.14.0。无新增依赖，无框架迁移。

| 服务商 | 可用连接方式 | 本轮变化 |
| --- | --- | --- |
| OpenRouter | API Key、浏览器回调 PKCE、手动授权码 PKCE | 补齐官方无回调授权码模式、待授权恢复、错误恢复和两端界面 |
| OpenAI / Anthropic / Google | API Key | 保留现有官方聊天适配器；未添加订阅账号或第三方客户端令牌复用 |
| Ollama | 固定本机地址，无需 API Key | 保留已有连接与流式聊天 |
| 自定义兼容服务 | 浏览器设置草稿 | 本轮未实现任意地址连接 |

[OpenRouter 官方 OAuth 文档](https://openrouter.ai/docs/guides/overview/auth/oauth)明确支持省略 `callback_url` 的无回调授权，要求 PKCE，向用户显示十分钟内有效的单次授权码。兑换结果是用户控制的 API Key，因此复用现有凭据与聊天管线，不假设存在 refresh token。

安全设计参考 [RFC 9700](https://www.rfc-editor.org/info/rfc9700/) 与 [RFC 8252](https://www.rfc-editor.org/info/rfc8252/)。更多厂商与开源参考见[来源核验](model-auth-sources-20261020.md)；不使用第一方产品的 OAuth client ID 或本机登录令牌。

时效核验：OpenAI 当前已有 [Sign in with ChatGPT 开源应用动态注册](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)，本轮未接入，不能将“本仓库未实现”表述成“第三方应用不支持”。该路径需要本应用获发的 client ID、稳定 host ID、OIDC 身份校验、token 刷新以及遵循预览限制的 Responses 请求；现有 API Key 的 Chat Completions 路径不能直接替代它。Google 项目 OAuth 也需要自有项目与 OAuth client ID。本轮交付明确限定为已完成验收的 OpenRouter 授权闭环。

## 用户路径

进入模型设置，选择 OpenRouter：

1. 使用 API Key，或选择浏览器授权、授权码连接。
2. 等待授权期间只展示当前授权的继续、取消和必要输入；不同时出现冲突的连接动作。
3. 回调方式按既有路径返回本机；授权码方式由用户打开服务商页面，再把单次码填回本应用。
4. 验证成功后同步模型目录，返回对话选择模型并手动发送。

等待中的链接可在页面刷新或桌面设置重开后恢复；仅在同一尚未过期的本机服务会话内有效。输入为密码框，提交、切换服务商、关闭或离开页面后清除，不保存授权码草稿。界面展示过期时间、取消、拒绝、失败及重试结果。

浏览器实测修复 Web Awesome 临时原生提交按钮导致的焦点丢失：优先寻找稳定的开源按钮，失败后回到授权入口，成功后回到“返回对话选择模型”。原生等待态隐藏 API Key 表单，合并重复状态，窄窗口允许操作按钮换行。

## 服务端约束

- 复用单一兑换逻辑处理 callback / manual；S256 verifier 与凭据只在服务端内存。
- 新增 `POST /openrouter/oauth/complete`，严格校验 `{ flowId, code }`；只接受当前等待中的手动流程。
- 延续可信会话、CSRF、固定目的地、请求大小和超时限制。
- 拒绝过期、替换、重复、并发以及不匹配的请求；取消后晚到响应不能恢复连接。
- 回调严格核验参数数量与 code/error 组合；桌面桥只允许明确路由，manual 不注册回调监听。
- 客户端校验 HTTPS 授权目的地、S256、模式、flowId 与回调地址；拒绝降级或异常恢复链接。
- 授权兑换失败后，刷新旧账户目录不会把新授权标为成功。只有新凭据已兑换、目录暂时失败时，刷新才恢复该授权状态。
- 授权码、verifier、API Key 不进入公开快照、会话历史或 localStorage；终态移除恢复链接。

## 实际修改文件

| 文件 | 修改 |
| --- | --- |
| `desktop/server/model-connections.mjs` | 两种 PKCE 流程、统一兑换、状态隔离、恢复凭据校验 |
| `desktop/server/desktop-bridge.mjs` | 手动完成路由、回调注册与取消竞争处理 |
| `desktop/src-tauri/src/model_bridge.rs` | 原生路由白名单及 Rust 回归 |
| `desktop/design-previews/desktop-model-fetch.js` | 桌面传输白名单 |
| `desktop/design-previews/model-connection-client.js` | 授权链接与恢复快照校验 |
| `desktop/design-previews/settings.js`、`settings-state.js`、`settings.css` | 浏览器授权方式、状态、输入清理、焦点与布局 |
| `desktop/src/model-connection.ts`、`shared.d.ts`、`styles.css` | 正式桌面授权码连接、恢复与布局 |
| `scripts/model-settings-fixture.mjs`、`scripts/desktop-native-e2e.mjs` | 隔离的 OpenRouter 协议验收及原生交互 |
| `tests/model-connections.test.mjs`、`model-connection-client.test.mjs` | 协议、隔离、密钥替换后的真实聊天适配器回归 |
| `tests/desktop-model-bridge.test.mjs`、`desktop-model-fetch.test.mjs` | 桥接与路由边界 |
| `tests/model-settings.test.mjs`、`model-settings-fixture.test.mjs`、`desktop-model-dialog.test.mjs` | 交互与错误恢复回归 |
| `desktop/README.md`、本目录计划/来源/报告 | 启动、能力边界与验收证据 |

简化：复用既有凭据、模型目录、聊天和取消机制；不维护第二套令牌状态。继续复用开源按钮与原生表单，删除等待状态下重复的 API 表单和状态说明。

## 验证

- 修改前相关测试：75 项通过。
- 最终 `npm test`：860 项通过，0 失败、0 跳过。日志：`.omx/artifacts/model-auth-completion/tests-final.log`。
- `npm run lint`，另显式检查被默认忽略的四个预览 JS：通过。
- `npm --prefix desktop run tauri -- build --debug --no-bundle`：TypeScript、Vite、Rust 构建通过。
- `cargo test model_bridge --manifest-path desktop/src-tauri/Cargo.toml`：1 项通过。
- `npm --prefix desktop audit --omit=dev`：0 已知漏洞；本轮未新增依赖。
- 浏览器实际自动化：回调/手动链接、刷新恢复、授权码清空、失败重试、成功后目录、断开、取消、390px 无横向溢出，以及点击/Enter 提交后的焦点恢复通过。
- Windows 原生 WebView2：27 项通过，包含新增授权码关闭重开、窄屏、取消、错误重试、IPC 完成授权、目录与断开；同时覆盖原有模型选择、流式、停止、重试、会话草稿与进程重启恢复。
- 独立安全复核：旧账户刷新误报新 OAuth 成功问题已修复并增加两条回归；复核无剩余阻断。

原生证据：`.omx/artifacts/desktop-model-native/run-2026-10-20T17-41-41-903Z/results.json`。该次证据中的 fixture 简介沿用旧的 Ollama 文案；本轮执行实际同时使用 Ollama 与 OpenRouter OAuth 模拟上游，脚本的后续输出说明已更正。27 项检查、请求记录与截图是该次原始结果，未改写。

截图：

- 浏览器最终授权页：`.omx/artifacts/model-auth-completion/web-manual-waiting-final.png`
- 浏览器窄屏：`.omx/artifacts/model-auth-completion/web-manual-narrow.png`
- 浏览器成功后焦点：`.omx/artifacts/model-auth-completion/web-oauth-connected-final.png`
- 原生等待态：`.omx/artifacts/desktop-model-native/run-2026-10-20T17-41-41-903Z/oauth-manual-waiting.png`
- 原生窄屏：`.omx/artifacts/desktop-model-native/run-2026-10-20T17-41-41-903Z/oauth-manual-narrow.png`
- 原生成功目录：`.omx/artifacts/desktop-model-native/run-2026-10-20T17-41-41-903Z/oauth-connected.png`

视觉检查已针对实际截图做两轮调整：减少授权时的表单竞争与重复分隔，修复过宽的操作行、密码显隐和提交焦点。保留既有中性色、服务商品牌图标、渐变执行文字及控件尺度。本轮未声称对竞品页面进行像素级复制。

## 启动与限制

浏览器：从仓库根目录运行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/settings.html?provider=openrouter#key`。后台已变更，既有预览服务需要重启。正式桌面：`npm --prefix desktop run tauri dev`；或运行上述构建生成的 debug 程序。无需新增环境变量或 OAuth client secret。

凭据仍仅驻留本机服务进程内存，退出、服务重启或会话失效后需重连；尚未接入 Windows Credential Manager / 系统钥匙串。目录连接成功不代表每个模型都可推理。

浏览器与原生验收都使用明确标记的本地上游协议模拟服务，生产 UI、IPC、连接代理和解析路径实际运行；未通过真实外部账户完成授权，未执行付费云推理，未验证供应商授权网页或系统浏览器外跳。没有把模拟目录和回复包装成真实供应商结果。未实现 ChatGPT / Claude 订阅登录、Gemini CLI 凭据复用或任意第三方 OAuth。

现有 Vite 对 `chat-transport.js` 混合静态/动态导入的非阻断警告仍存在，不影响此次构建成功；本轮未更改打包结构。
