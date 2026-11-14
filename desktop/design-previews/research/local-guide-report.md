# 本机上线清单：实现与验证

日期：2026-10-17。范围为开发预览，正式 Tauri 能力未改变。保留工作区之前的改动，没有安装依赖、提交或部署。

实施前 [计划与验收合同](local-guide-plan.md)，本轮 [官方协议调研](local-guide-sources.md)。

## 可用路径

工作台或完整聊天 → 输入框“＋” → **生成上线清单** → 明确选择主体、敏感信息和服务器域名 → 生成。

不需要模型密钥。请求经本机 HTTP 服务，直接调用现有 `runGuide` 和默认排除 draft 的规则资料；没有模型决策、网络规则查询或项目文件扫描。草稿、引用和当前模型选择保持不变。清单不自动加入模型历史。

消息展示真实工具状态、确定性摘要和固定结果卡。适用项与条件自查项分开，按阶段折叠，包含要求、官方来源、仓库记录的核验日期和人工确认提示；工具成功不代表项目合规。原始参数和结果继续使用既有折叠记录。重试使用原参数，工具消息不提供容易误发给模型的自由文本编辑入口。

真实模型、本机工具和演示消息的来源与运行记录分别标注。复用原生弹窗、表单、details、现有图标/设计 token/执行文字动效；没有新增转圈或假执行延时。未进行浏览器视觉验收。

## 实际修改

相对仓库根目录，仅列本轮文件；其余未提交修改不属于本轮。

| 文件 | 作用 |
| --- | --- |
| `desktop/server/model-connections.mjs` | 固定工具路由，复用会话、Origin/CSRF、单运行互斥与取消 |
| 新 `desktop/server/guide-stream.mjs` | 调用真实规则引擎，标准工具输入/结果/错误事件，超时与资源清理 |
| 新 `desktop/design-previews/guide-contract.js` | 前后端共用输入/结果校验，阶段、分区、日期、来源与大小约束 |
| 新 `desktop/design-previews/guide-transport.js` | 本机会话握手、工具流校验、终态提交、停止与超时 |
| 新 `desktop/design-previews/ui-message-stream.js`、`chat-transport.js` | 提取原有 SSE 分帧供文本与工具共用，减少重复解析实现 |
| `desktop/design-previews/conversation.js` | 工具生命周期、冻结输入、原参数重试、会话与迟到隔离 |
| `desktop/design-previews/ui.js`、`ui.css` | 三项必选表单、添加入口、忙碌和接受状态保护 |
| `desktop/design-previews/components/message.js`、`message.css`、`presentation.js` | 真实固定清单、三类来源、工具状态和消息动作 |
| `desktop/design-previews/chat-full.html`、`index.html`、`preview.js` | 当前入口与能力说明 |
| 新 `tests/guide-contract.test.mjs`、`local-guide-server.test.mjs`、`local-guide-transport.test.mjs`、`local-guide-conversation.test.mjs`、`local-guide-integration.test.mjs`、`local-guide-ui.test.mjs` | 数据、HTTP、流协议、生命周期、真实内核整链路、表单/展示回归 |
| `tests/conversation-continuity.test.mjs` | 保留草稿/模型、重试、切会话与后续模型历史边界 |
| `desktop/README.md`、`desktop/design-previews/AGENT-TECH-CHOICES.md`、`AGENT-INTERACTION-STANDARD.md`、`research/local-guide-{plan,sources,report}.md` | 更新当前能力、来源、启动与验证边界 |

未更改 CLI/MCP 公共合同或规则内核。新 HTTP 输入仅接受必填 `{subject,sensitive,domain}`，不接受目录、任意工具、草稿规则或外部 URL。复用会话 cookie 路径，API 无需模型连接。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| `npm test` | **579/579 通过**，0失败/取消/跳过，比上一轮548增加31；日志 `.omx/local-guide-tests.log`，约5.2秒 |
| `npm run lint` | 通过 |
| 11个本轮预览/服务器 JS 的 `npx eslint --no-ignore` | 通过，覆盖根 lint 排除的 desktop 路径 |
| `npm --prefix desktop run build` | TS/Vite通过，7 modules，JS4.25kB、CSS3.08kB；未运行 Rust/WebView 原生构建 |
| `npm audit --omit=dev --json` | 生产依赖已知漏洞0；无本轮依赖变更 |
| 静态资源/HTTP检查 | 16HTML、46脚本、24样式、197本地引用；38路径200与JS MIME正确 |
| `tests/local-guide-integration.test.mjs` | controller→真实回环HTTP→broker→真实 `runGuide`；不访问注入的 provider fetch；停止传到服务端 runner，晚结果不发布 |
| 重启后的5501服务冒烟 | HTTP200，标准工具事件及成功终态；个人/敏感信息是/域名否得到43适用项、19条件项，共享校验通过；不要求模型连接 |
| `git diff --check` | 通过；既有CRLF归一化提示保留 |

服务/传输与对话/界面由独立只读代理复核。发现并关闭两项联调问题：成功 finish 缺少本子集要求的 stop 原因；结果合同上限高于单事件上限。现分别显式发送 stop、限制结果JSON为120000字符。整链路测试覆盖真实两端，避免各自夹具掩盖协议差异。复核未留下已确认未修复缺陷。

合同覆盖全部12种主体/布尔输入组合，禁止错分自查/适用项、重复规则ID、非法日历日期、非官方HTTPS来源、未知字段和超限输出。SSE按事件限128KiB、按总传输限2MiB；文本与工具共享解析，覆盖UTF-8/CRLF任意分片、合并chunk、错误ID/乱序/未完成终态、错误不回显原始内部内容。客户端默认20秒、服务工具等待10秒，单会话互斥，无自动重试。

规则内核为同步本地读取，超时不能抢占同步JavaScript；取消保证等待与后续输出终止。当前小型规则库验证通过，但未做大规则库压测，不宣称任意规模性能达标。

## 门禁与尚未实现

风险 high：共享认证 API 与工具消息路径。质量命令来自根/desktop package 与现有 node:test；CI为 validate-rules 的Windows/Linux、Node20/22/24矩阵。本轮仅Windows/Node24，无对应提交CI运行记录。

- DQ-00/01/02/04/06/07/08：范围、静态检查、合同/生命周期/安全边界与有界执行的自动化证据已收集。未配置独立 SAST/secret-scan，不将 lint 当安全认证。
- DQ-11：本轮为确定性显式工具路径，使用真规则内核与版本化测试；未增加模型选择工具或概率性推理评测。
- DQ-05：**BLOCKED**。遵循用户先完成代码与自动化验证的选择，未使用本地浏览器、截图替代手段、屏幕阅读器或原生桌面。
- DQ-09：**BLOCKED**。未部署、未完成原生包及对应CI验收；这是开发切片，不能标记 release-ready。
- DQ-10：本轮代码和可用预览已收尾；整体发布门禁仍blocked。

| 风险/缺口 | 处置与后续条件 |
| --- | --- |
| 浏览器视觉、键盘、焦点、窄屏与主题 | 本轮无法验收；由项目负责人在允许浏览器后安排，不作已验证声明 |
| 规则时效 | 日期按仓库原记录显示；本轮未重新核验政策，不能作为实时合规结论 |
| 模型工具循环、项目扫描接入聊天、持久化、正式Tauri工具IPC | 尚未实现；本轮固定显式工具入口不能被当作已交付这些能力 |
| 同步内核不可抢占 | 目前有界小规则集；规模扩大前评估后台worker与真实负载，避免声称强制停止内核 |

没有数据迁移。恢复方式为只撤回本轮文件中的增量，保留之前改动。没有新增环境变量或账户要求。

## 启动与预览

仓库根目录运行 `node desktop/design-previews/_serve.mjs`。当前5501服务已重启载入新工具；内存模型凭据已清除，真实聊天需要重新连接，清单无需密钥。

- [完整聊天](http://127.0.0.1:5501/chat-full.html)：点击输入框“＋ → 生成上线清单”。
- [工作台](http://127.0.0.1:5501/main-four-region.html)：使用相同入口和组件。
- [模型设置](http://127.0.0.1:5501/settings.html#key)：重新连接已有模型功能。
