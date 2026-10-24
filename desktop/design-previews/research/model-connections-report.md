# 模型连接交付记录 · 2026-10-17

## 本轮结果与范围

模型设置页由配置草稿升级为可执行的本机开发连接流程。复用现有原生 ES Modules、Node 服务、设置布局和组件；没有安装新框架或新依赖。正式 Tauri 应用的模型执行与系统钥匙串不在本轮实现内，聊天页仍是明确标注的本地演示。

- OpenRouter：官方 OAuth PKCE S256、会话绑定、一次性回调、到期、取消、失败恢复；也支持 API Key。
- OpenAI、Anthropic、Gemini：服务端 API Key 验证与真实模型目录；Ollama：固定本机端点的模型目录。
- 页面：厂商导航、连接方式、清晰的连接状态、目录搜索/刷新、错误提示、断开连接；授权返回后选中 OpenRouter。
- 交互：保留重绘时的控件焦点与搜索选区，避免切换厂商后旧请求覆盖新页面；等待授权使用文字渐变，支持减少动态效果与强制颜色模式。
- 品牌：沿用固定版本的 MIT Lobe Icons，补齐 OpenRouter SVG、来源和哈希。

“已连接”仅证明认证后的模型目录访问成功，不等同于聊天推理可用。OpenRouter 先验证当前密钥，不能用公开模型目录伪装认证成功。

## 运行与预览

从仓库根目录运行：

```powershell
node desktop/design-previews/_serve.mjs
```

打开 <http://127.0.0.1:5501/settings.html?provider=openrouter#key>。本轮结束时开发服务已在该地址运行。

无需环境变量。密钥由页面输入后直接交给本机服务，保存在对应浏览器会话的服务端内存中；不写入浏览器存储、文件或日志，不返回给页面。重启服务或会话过期后需要重新连接。OAuth 必须在发起授权的同一浏览器配置中完成回调；当前不是 Tauri 的系统浏览器授权桥接。

断开连接清除本机凭据并取消在途操作，不会撤销厂商侧密钥；需要撤销时使用厂商密钥管理页面。没有自动发起付费推理。

## 修改文件

| 文件（相对仓库根目录） | 作用 |
| --- | --- |
| `desktop/server/model-providers.mjs` | 固定厂商适配、认证、分页、结构校验、大小限制、超时和安全错误 |
| `desktop/server/model-connections.mjs` | 本机会话、CSRF、连接 API、PKCE 回调、取消和凭据生命周期 |
| `desktop/design-previews/_serve.mjs` | 接入本地 API，Host 校验和安全响应头 |
| `desktop/design-previews/model-connection-client.js` | 同源客户端、CSRF、超时、过期恢复和请求版本控制 |
| `desktop/design-previews/settings.js` | 实际连接路径、OAuth、模型目录、并发状态和焦点恢复 |
| `desktop/design-previews/settings-state.js` | OpenRouter 厂商元数据 |
| `desktop/design-previews/settings.html` | 真实能力与存储边界说明 |
| `desktop/design-previews/settings.css` | 目录高度、端点换行、授权等待效果与无障碍回退 |
| `desktop/design-previews/preview.js` | 设置页开发环境状态说明 |
| `desktop/design-previews/components/provider-icons.js`、`provider-icons.css`、`brands/openrouter.svg`、`brands/manifest.json` | 固定来源的品牌资源 |
| `tests/model-providers.test.mjs`、`model-connections.test.mjs`、`model-connection-client.test.mjs` | 新增适配、HTTP/OAuth 与客户端回归 |
| `tests/model-settings.test.mjs`、`provider-assets.test.mjs` | 更新真实连接路径、并发交互与品牌校验 |
| `package.json`、`package-lock.json` | 现有 js-yaml 从 4.3.0 修补至 4.3.2，修复已公开高危缺陷 |
| `desktop/design-previews/AGENT-TECH-CHOICES.md`、`research/model-connections-plan.md`、`research/model-connections-sources.md` | 选型、实施边界与官方来源 |

工作区已有大量其他修改；本轮未回退这些改动，未提交或部署。复用现有设置组件与图标管线，移除连接路径中仅保存草稿/演示的行为，没有另叠聊天框架或状态库。

## 验证证据

以下检查针对最终代码和 js-yaml 修补后的依赖执行：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 478/478 通过，0 失败、跳过或取消 |
| 模型连接与资源相关用例 | 55 项，包含在全量结果中 |
| `npm run lint` | 通过 |
| 对 server、preview server、settings/client/state/icon/preview 文件显式执行 `eslint --no-ignore` | 通过；覆盖默认 lint 排除的预览文件 |
| `npm --prefix desktop run build` | TypeScript / Vite 前端构建通过；未执行原生 Rust 打包 |
| `npm audit --omit=dev --json` | 0 个漏洞；初次发现 js-yaml 缺陷后修补重验 |
| `npm run verify:quotes` | 通过；保留既有 2 项手工快照提示 |
| `npm run coverage` | 既有规则覆盖/准确度门槛通过；不是 JavaScript 行覆盖率 |
| 预览静态与 HTTP 检查 | 16 HTML、42 脚本、24 样式、182 本地引用；37 路由返回 200，JS MIME 正确 |
| 本机 API 启动检查 | 200，memory 存储，5 个厂商初始未连接，no-store |
| `git diff --check` | 通过 |

HTTP 测试使用本机真实 HTTP 边界和注入的上游响应，覆盖 Host/Origin/CSRF、Cookie、错误脱敏、跨会话隔离、大小和时间限制，以及 OAuth 的错误 state、错误会话、到期、重放、拒绝、取消、并发和迟到结果。前端 DOM 测试覆盖凭据清理、不可用状态、厂商切换、目录搜索、焦点、授权轮询与页面生命周期。没有使用真实密钥或真实账号进行测试。

独立安全检查未发现待修复 P1/P2；独立交互检查发现的跨厂商并发状态、重绘焦点丢失和等待后重复打开凭据框问题均已修复并增加回归。

## 尚未实现 / 未验证

- 真实账号 OAuth 同意与厂商网络端到端测试未执行；当前证据是协议及 HTTP/DOM 自动化测试。
- 按用户本轮“先完成代码与自动化验证”的选择，没有浏览器操作、截图或视觉验收；不声称与 Codex/Claude 的实际画面达到一致。
- OpenAI 使用 API Key；ChatGPT 账号登录未接入。已调查官方 DevKit，其发布状态、Noncommercial 许可与强制系统加密要求不适合直接塞入当前预览。没有复制该 SDK 或借用其他应用凭据。
- Claude 消费者订阅账号登录未实现；Anthropic 使用 API Key。
- 系统钥匙串、持久安全存储、正式 Tauri 认证桥接和真实聊天推理尚未实现。
- 自定义服务商仍是非执行草稿，避免让未设计的代理地址进入服务端网络边界。

## 质量门禁与修复闭环

风险等级：高（凭据与授权）。代码检查、针对性安全检查、回归和本地构建完成。浏览器 Dogfood、真实账号授权、原生安全存储、CI 与生产发布验证仍为 **BLOCKED**，本记录不宣称生产交付就绪。用户授权本轮代码与自动化验证，不等同于豁免生产门禁。

| 项目 | 状态 / 证据 |
| --- | --- |
| 范围、接口与回滚策略 | 通过；见实施计划，停止开发服务即可清空内存凭据 |
| 代码、测试与构建 | 通过；见上述命令 |
| 并发状态 / 焦点 / 重复打开凭据框 | 已关闭；修复及回归通过 |
| js-yaml 高危缺陷 | 已关闭；4.3.2，生产依赖审计 0 |
| 凭据保留与清除 | 本机内存契约已验证；无数据库迁移 |
| 浏览器和真实账号验收 | BLOCKED；本轮按用户选择未执行，非自动化替代完成 |
| 原生持久凭据与正式发布 | BLOCKED；尚未实现 / 未验证 |
| 模型生成质量评测 | 不适用；本轮未实现模型推理 |

恢复方式：停止精确匹配本项目预览脚本的进程，内存凭据随之销毁；如需回退代码，仅回退上述本轮范围，保留工作区其他未提交修改。没有远端部署或数据迁移。

## 官方来源

完整研究记录见 [model-connections-sources.md](model-connections-sources.md)。OAuth 按 [OpenRouter 官方 PKCE 文档](https://openrouter.ai/docs/guides/overview/auth/oauth) 实现；设置路径参考 [Cherry Studio 模型服务配置](https://www.cherryai.com/docs/en/pre-basic/providers/)。

依赖修补依据：[GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)、[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)、[js-yaml 变更记录](https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md)。
