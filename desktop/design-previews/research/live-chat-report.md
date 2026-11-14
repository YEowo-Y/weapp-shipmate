# 真实文本对话接入与验证

日期：2026-10-17。用户要求继续推进项目。本轮补上模型目录到文本聊天的执行路径；范围为开发预览，不改变正式 Tauri 薄桌面的能力。原有大量未提交修改保留，没有提交、部署或安装依赖。

实施前 [验收计划](live-chat-plan.md)，实际查阅 [官方依据](live-chat-sources.md)。

## 已实现的用户路径

1. 设置页连接服务商并读取模型目录。OpenAI / OpenRouter / Ollama 可用于本轮文本聊天；Anthropic / Google 仍只有目录连接。
2. 工作台或完整聊天输入框默认本地演示。打开模型菜单，搜索已连接模型并显式选择；此动作只读目录，不发起推理。空目录、服务不可用、搜索无结果和重试有明确状态。
3. 手动发送后，真实文本经本机服务请求所选模型；每条消息标明来源。传输不夹带固定演示消息、项目/引用文件或其他会话，真实回复不附加假的工具、规则卡或审批。
4. 停止保留部分正文，中止本地 HTTP 及上游连接；切会话、离页、撤销连接、会话过期与关闭服务均取消相关运行。迟到事件不能复活旧回复。
5. 错误、截断、空输出、异常断流与正常结束分开；只允许用户手动重试，不自动重试付费请求。重试/再生使用原模型和原请求，并同步可见选择；编辑使用当前显式模型，同模型才复用原历史分支。

模型选择按当前页面内会话保存，新会话默认演示。历史及凭据不持久化，刷新或重启可能丢失；模型目录成功不代表所有模型支持文本或已通过真实推理验证。

## 技术与安全边界

- 服务端：固定 OpenAI Responses / OpenRouter Chat Completions / Ollama native chat endpoint，通过 fetch 转换为官方 AI SDK UI Message Stream v1 文本子集。输出是数据，不执行模型生成的命令、工具或组件。
- 会话：复用 HttpOnly cookie、严格 Host/Origin 与 CSRF；模型必须属于当前连接目录。服务商/模型之外的目标 URL、工具或未知参数不接受。
- 限制：单会话一个运行，chat请求64KiB、消息100条、单条32768字符，输出2048tokens、正文256KiB、上游总传输2MiB、单帧及结构深度限制；上游默认120秒，客户端总130秒。并发改凭据/刷新及OAuth等待时拒绝chat竞态。
- 隐私：密钥仅存本机服务内存并用于固定服务商请求；不进入模型正文、浏览器存储或运行记录。错误使用固定提示，不回显上游凭据/响应体。OpenAI请求明确store:false，这不等于对厂商全部数据留存政策的保证。
- 停止保证本应用取消传输与读取，不能证明服务商立即停止计算或计费。
- 没有新增依赖、第二套聊天框架或自创通用事件协议；演示状态机与真实传输共用消息、滚动、按钮和取消接口。

## 本轮修改文件

路径相对仓库根目录，未列出的已有修改不属于本轮。

| 文件 | 作用 |
| --- | --- |
| `desktop/server/model-connections.mjs` | chat路由、凭据/目录权限、会话单运行、并发与取消 |
| 新 `desktop/server/chat-stream.mjs` | 三种上游解析、终态/错误/限制与标准SSE输出 |
| 新 `desktop/design-previews/chat-transport.js` | 同源CSRF传输、官方协议文本子集读取、跨chunk解码、超时/取消 |
| `desktop/design-previews/conversation.js`、`chat.js` | 注入真实运行、模型选择、分支/历史隔离、重试/编辑/会话与迟到防护；工作台复用同一mount，无新分叉 |
| `desktop/design-previews/ui.js`、`ui.css` | 复用菜单和原生dialog的紧凑模型搜索，状态/焦点/取消与busy保护 |
| `desktop/design-previews/components/presentation.js` | 真实准备态说明所选模型，不再播报本地演示 |
| `desktop/design-previews/settings.html`、`chat-full.html`、`index.html`、`preview.js` | 当前真实能力、默认演示与发送范围说明 |
| 新 `tests/model-chat.test.mjs` | 26项服务器HTTP与假上游协议/边界测试 |
| 新 `tests/chat-transport.test.mjs`、`live-conversation.test.mjs`、`live-model-picker.test.mjs`、`live-chat-integration.test.mjs` | 传输、controller、模型选择及整链路回归 |
| `tests/conversation-continuity.test.mjs`、`chat-sessions.test.mjs`、`model-settings.test.mjs`、`command-navigation.test.mjs`、`component-presentation.test.mjs` | 挂载视图编辑/重试、每会话选择、菜单现状与准备态回归 |
| `desktop/README.md`、`AGENT-TECH-CHOICES.md`、`AGENT-INTERACTION-STANDARD.md`（后两者在design-previews） | 更新当前能力，保留早期调研作为历史基线 |
| `desktop/design-previews/research/live-chat-{plan,sources,report}.md` | 本轮验收、官方来源与交付边界 |

## 已运行验证

| 命令/场景 | 实际结果 |
| --- | --- |
| `npm test` | **548/548通过**，0失败/取消/跳过；较上一轮495增加53，日志`.omx/live-chat-tests.log` |
| `npm run lint` | 通过 |
| `npx eslint --no-ignore` 本轮8个预览/服务器JS文件 | 通过；包含根lint默认排除的desktop目录 |
| `npm --prefix desktop run build` | TypeScript/Vite通过，7modules；JS4.25kB、CSS3.08kB；不是Rust/WebView原生构建 |
| `npm audit --omit=dev --json` | 生产依赖漏洞0；没有依赖变更 |
| `node --experimental-vm-modules .omx/agent-experience-static-check.mjs` | 16HTML、43script、24style、188本地引用；38HTTP路径200、JS MIME正确。不是浏览器验收 |
| `tests/live-chat-integration.test.mjs`（已包含全量） | 真正启动回环HTTP，controller→前端transport→会话broker→假provider完成文本；controller停止传到上游AbortSignal |
| `git diff --check` | 通过；既有CRLF归一化提示保留 |

独立只读复核发现两项问题，均先用失败回归复现再修复：编辑旧真实消息覆盖当前演示选择（P1），大网络chunk被误当单事件超限（P2）。修复后独立79项前端/整链路及50项传输/服务端回归通过，没有已确认的待修复缺陷。随后补真实准备态播报回归，再运行上表最终548项全量。

性能证据是有界解析和取消/超时测试：150,000字符正文无论合并为大chunk或分片均一致，单帧/整体超限会失败；本机套件约4.3秒。没有真实模型首字延迟、费用或设备视觉性能测量，不做这类达标声明。

## 质量配置、门禁与风险

风险high：新增认证会话中的外部模型推理及共享前端状态。质量配置来源是根/desktop package scripts、现有node:test/VM harness与`.github/workflows/ci.yml`（validate-rules，Windows/Linux，Node20/22/24矩阵）。本轮只在Windows/Node24运行；没有对应提交的CI执行记录，也没有项目声明的推理延迟/语义质量阈值。

- DQ-00/01/02/04：范围、命令、代码检查和回归完成。
- DQ-06/07/08：资源/时间/并发/取消、固定网络与凭据边界、请求输出合同由假上游HTTP及独立复核覆盖；没有DB迁移。未配置独立SAST/secret-scan流水线，不把普通lint当完整安全认证。
- DQ-05：**BLOCKED**。遵循用户先代码与自动化验证的选择，没有浏览器视觉/键盘/屏幕阅读器或原生桌面实测。
- DQ-11：传输确定性合同有版本化夹具和回归；**真实模型回答质量、费用、延迟及供应商兼容验收BLOCKED**，未使用真实凭据，不能由假上游代替概率性评测。
- DQ-09：**BLOCKED**。未部署、无对应CI或原生包验收。当前为开发切片，不宣称release-ready。
- DQ-10：工作区/证据收尾完成；整体发布决策 **FAIL / blocked（未完成真实环境门禁，非自动化失败）**。

| ID | 严重度/类型 | 处置 | 所有者/审批 | 截止或条件 | 行动/核验 |
| --- | --- | --- | --- | --- | --- |
| LC-01 | high/bug | hotfix，已关闭 | 实施代理；用户已授权功能实现 | 本轮 | 编辑服从当前目标；mounted回归先红后绿，独立复核 |
| LC-02 | medium/bug | hotfix，已关闭 | 实施代理；用户已授权功能实现 | 本轮 | 按事件限制大小；合并/碎片网络流一致回归 |
| LC-03 | medium/test | needs-decision | 项目负责人；无生产豁免 | 真实体验或发布声明前 | 启用浏览器后完成主题/窄屏/键盘/焦点/滚动/取消实测 |
| LC-04 | high/ai-eval | needs-decision | 项目负责人；无生产豁免 | 发布模型功能前 | 使用有授权的真实账号/本机Ollama跑代表性文本/拒绝/截断/限流与费用延迟评测；不自动运行付费请求 |

恢复方式为仅回退本轮文件中的增量，保留之前修改；无持久化迁移。重启本机预览服务会清除会话凭据，需要重新连接。任何真实工具、任意文件权限、持久存储和正式Tauri接入仍需独立实施，不因文本生成可运行而获得权限。

## 启动与预览

从根目录运行 `node desktop/design-previews/_serve.mjs`，无新增环境变量。当前服务已重启载入新后台：

- 设置：<http://127.0.0.1:5501/settings.html#key>
- 完整聊天：<http://127.0.0.1:5501/chat-full.html>
- 工作台：<http://127.0.0.1:5501/main-four-region.html>

OpenAI/OpenRouter需自行在设置输入API Key或完成已有OpenRouter授权，Ollama需本机服务已启动且已装模型；没有凭据仍可体验默认演示。停止/离页测试使用注入假上游，不代表已进行上述真实账号操作。
