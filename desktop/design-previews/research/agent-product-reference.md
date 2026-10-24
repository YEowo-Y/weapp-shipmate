# Agent 产品参考与组件落地

调研日期：2026-10-13。目标是用可追溯的官方源码与实际界面观察改进 Shipmate 的交互，不把参考产品整套引入项目。

## 当前选择

当前设计预览使用原生 JavaScript/CSS，正式桌面入口使用 Tauri、Vite、TypeScript；`desktop/package.json` 没有 React 或通用 UI 库。用户已允许必要时安装 React/shadcn。本轮涉及的选择、开关、折叠、对话框可用浏览器标准控件处理，因此没有新增产品依赖，也没有迁移框架。

复用优先级是：现有共享组件与状态 → 原生 `button`、`a`、`input`、`details`、`dialog` → 确有需求时再评估一套兼容的组件库。业务结果卡保留项目自己的数据含义；基础键盘行为、选中状态和模态机制交给标准控件。REA 是调研工具，不是可直接导出可用 UI 的组件安装器。

## 证据来源与范围

所有 REA 分析均使用隔离目录中的 `rea-agents@6.4.0`，实际执行 `analyze-javascript-application` 并以退出码 0 完成。下列统计来自本地紧凑证据记录；“发现”指静态语法观察，不是界面缺陷数量。

| 参考对象 | 固定官方来源 | 许可证 | 实际输入与验证 |
| --- | --- | --- | --- |
| assistant-ui | [c31385ee05068eaa539d10e3f7e5d4b8b5c396ef](https://github.com/assistant-ui/assistant-ui/tree/c31385ee05068eaa539d10e3f7e5d4b8b5c396ef) | MIT | 官方注册表与固定上游共 3 个 TSX；Tool call 分发文件与该提交字节一致，不能把所有分发依赖都称为同一提交。真实浏览器展开官方 Tool call 示例。详见[专项报告](rea-component-extraction.md)。 |
| Cherry Studio | [2e2e2e1b32a1eb2c796a843cae67148c5eb53269](https://github.com/CherryHQ/cherry-studio/tree/2e2e2e1b32a1eb2c796a843cae67148c5eb53269) | [AGPL v3](https://github.com/CherryHQ/cherry-studio/blob/2e2e2e1b32a1eb2c796a843cae67148c5eb53269/LICENSE) | 3 个工具展示 TSX，包清单为 2.1.6；这是 main 源码快照，未运行桌面产品或验证发布二进制。 |
| OpenClaw | [2009aa6c26a91b66111ab8bed53623eb115163d2](https://github.com/openclaw/openclaw/tree/2009aa6c26a91b66111ab8bed53623eb115163d2) | [MIT](https://github.com/openclaw/openclaw/blob/2009aa6c26a91b66111ab8bed53623eb115163d2/LICENSE) | 3 个焦点、提交展示数据、路由草稿 TS 文件；未运行产品。未取得提交时间，不将快照标为正式版本。 |
| Hermes Agent | [63d0b94120027d487c9a5235b9ec64b696af1b26](https://github.com/NousResearch/hermes-agent/tree/63d0b94120027d487c9a5235b9ec64b696af1b26) | [MIT](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/LICENSE) | 3 个 Web 客户端与共享事件 TS/TSX 文件；未分析 Python 后端，未启动产品或实测重连。 |

| 参考对象 | REA Evidence ID | 解析文件 / AST 节点 / 静态发现 / 解析失败 |
| --- | --- | --- |
| assistant-ui | `ev_a997135f796e876f66c20a069a3f7a00e312cafaf97661eef2a5b56c8afd4f0d` | 3 / 823 / 52 / 0 |
| Cherry Studio | `ev_d34b3bb7870730189915668e664fa493f5bd25f2bea917fe284345c469386f8e` | 3 / 4754 / 72 / 0 |
| OpenClaw | `ev_21a5d91a6cfa884ea4c01e217f48283554ae6407554bef1f556102bb2bdee13d` | 3 / 1164 / 25 / 0 |
| Hermes Agent | `ev_d309a4103deaa85c08dbba67ee768f7a3fb8e3f3bbef45be50479a8a9fd1316d` | 3 / 6842 / 172 / 0 |

REA 解析的是惰性文本，没有执行目标代码。导入依赖与后端大量位于输入范围之外；局部文件清单完整不代表整个产品覆盖完整。尤其 Hermes 原始输出中的通用 `shipped-artifact` 标签不改变本次输入是源码片段的事实。不能据此声称完成产品运行验证、完整安全审计或 Codex/Claude 客户端逆向。

## 可采纳模式与仓库映射

| 依据 | 可采纳的交互原则 | 当前落地或边界 |
| --- | --- | --- |
| [assistant-ui Tool call](https://www.assistant-ui.com/elements/tool-call) 的真实 Request / Result 展开与受控显示接口 | 参数、结果、错误、公开摘要分区；运行状态来自执行数据 | [message.js](../components/message.js) 与 [presentation.js](../components/presentation.js) 按已有四态渲染，成功结果须通过现有校验，错误不伪装成成功。未照搬上游 `!running` 即完成的简化判断。 |
| Cherry [ToolDisclosure](https://github.com/CherryHQ/cherry-studio/blob/2e2e2e1b32a1eb2c796a843cae67148c5eb53269/src/renderer/components/chat/messages/tools/shared/ToolDisclosure.tsx#L44-L108) 的展开状态、阅读模式请求与限高内容 | 用户展开详情时保护阅读位置；长结果在有名称、可聚焦的区域内滚动 | [conversation.js](../conversation.js) 保存工具结果滚动与焦点、在阅读详情时暂停自动跟随；[message.js](../components/message.js) 使用原生 `details/summary` 和有名称的结果区。上游滚动辅助函数未纳入输入，不能声称已实测其效果。 |
| Cherry [ToolHeader](https://github.com/CherryHQ/cherry-studio/blob/2e2e2e1b32a1eb2c796a843cae67148c5eb53269/src/renderer/components/chat/messages/tools/ToolHeader.tsx#L668-L715) 分离动作说明和执行状态 | 简短、可读的动作标签不能替代真实状态 | 复用现有工具状态与公开执行摘要；本地演示结果仍明确标注为演示。 |
| Cherry [ToolApprovalOutcome](https://github.com/CherryHQ/cherry-studio/blob/2e2e2e1b32a1eb2c796a843cae67148c5eb53269/src/renderer/components/chat/messages/tools/shared/ToolApprovalOutcome.tsx#L11-L28) 展示拒绝原因 | 审批反馈要能解释发生了什么 | 仅记录后续参考。本轮没有新增真实服务端审批或拒绝原因存储，不把原型确认按钮当作权限校验。 |
| OpenClaw [chat-input-owner](https://github.com/openclaw/openclaw/blob/2009aa6c26a91b66111ab8bed53623eb115163d2/ui/src/app/chat-input-owner.ts#L5-L38) 以应用上下文管理输入所有者 | 多个输入表面不要争抢焦点 | [ui.js](../ui.js) 关闭对话框时仅向仍可用的触发控件归还焦点；保留当前项目自己的输入生命周期，没有移植上游焦点服务。 |
| OpenClaw [chat-submissions](https://github.com/openclaw/openclaw/blob/2009aa6c26a91b66111ab8bed53623eb115163d2/ui/src/app/chat-submissions.ts#L24-L129) 与 [route-draft](https://github.com/openclaw/openclaw/blob/2009aa6c26a91b66111ab8bed53623eb115163d2/ui/src/pages/chat/route-draft.ts#L8-L53) 绑定会话与一次性消费 | 草稿归属、提交展示、真实执行应分清；迟到事件不能污染另一会话 | 复用 [chat.js](../chat.js) 的会话草稿保存/恢复与切换停止，以及 [conversation.js](../conversation.js) 的活动 run ID 检查。这些是现有机制的核对，不能宣称新实现了持久化队列或网络幂等；没有采用 URL 传递提示词。 |
| Hermes [ChatPage 架构说明](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/web/src/pages/ChatPage.tsx#L1-L19) | 先确认参考产品的渲染架构再选择组件 | 该页面是 xterm → WebSocket/PTY → Ink TUI → Python Agent，不是可直接嵌入的 DOM 聊天气泡组件库；本轮不集成它的终端架构。 |
| Hermes [重连处理](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/web/src/pages/ChatPage.tsx#L1147-L1186)、[恢复反馈](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/web/src/pages/ChatPage.tsx#L1908-L1954)、[事件类型](https://github.com/NousResearch/hermes-agent/blob/63d0b94120027d487c9a5235b9ec64b696af1b26/apps/shared/src/gateway-events.ts#L1-L58) | 连接恢复、历史恢复、模型运行是不同状态；重试应有边界 | 作为真实传输接入后的要求保留。本地预览没有网络 Agent，不新增虚假的在线/重连状态；没有移植另一套事件协议。 |

Cherry Studio 的源码为 AGPL v3，本轮仅借鉴行为并独立实现，没有复制其 JSX、CSS 或资源到产品。其他参考也没有直接移植源码；原始片段保存在忽略的调研目录中，不是应用依赖。

## 标准控件落地

具体清理计划及文件映射见[全项目组件标准化](component-native-plan.md)。本轮将模拟开关与互斥选项改为原生复选框/单选框，将页面折叠改为 `details/summary`，将操作和导航分别落实到 `button` 与 `a`；命令面板共享一份实现，工作方式弹窗使用原生 `dialog` 与单选表单。

这些语义与浏览器标准相对应：[details](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details)、[dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)、[radio](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/radio)。这是基础控件标准化，不等于已引入 React 聊天运行时、流式 Markdown 引擎或真实 Agent 后端。

## 本地证据定位

以下 `.omx` 文件是本次机器上的调研证据，未作为产品文件提交；本报告保留官方固定链接、证据 ID 与关键哈希，便于区分观察和推断。

| 对象 | 紧凑来源记录 | 原始 REA 输出 |
| --- | --- | --- |
| assistant-ui | 已纳入仓库的 [rea-evidence-summary.json](rea-evidence-summary.json) | `.omx/state/rea-components/analysis.json` |
| Cherry Studio | `.omx/research/cherry-reference/README.md`、`summary.json` | `.omx/research/cherry-reference/rea-report.json` |
| OpenClaw | `.omx/research/openclaw-reference/FINDINGS.md`、`provenance.json`、`evidence-summary.json` | `.omx/research/openclaw-reference/rea-report.json` |
| Hermes Agent | `.omx/research/hermes-reference/summary.md`、`provenance.json`、`source-digests.json` | `.omx/research/hermes-reference/rea-analysis.json` |

关键分析输入 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| Cherry `ToolDisclosure.tsx` | `43ea9137f8fe25b4208b5a4aa8f54a8c48e0b21d23cabb0e653829c6f90eeb0e` |
| OpenClaw `chat-submissions.ts` | `4d74123f1ba879f6b2a11e8955f4a875a246559251bf70b1aef4b97511d03ef9` |
| Hermes `web/src/pages/ChatPage.tsx` | `0ff5fe5fe15f78fa4757db964af5630bde677553ad71e13caf49a1615cc3aad2` |

本报告记录调研与实现映射，不代替最终验收报告。全页视觉、真实浏览器交互与构建结果应以本轮交付时实际完成的记录为准。
