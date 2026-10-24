# 全产品交互与技术依据 · 2026-10-17

本轮实际查阅官方文档；没有运行参考产品、抓取新截图或使用 REA。文档行为依据与本仓库实施推断分开。不是任何产品的逐像素复刻，也不构成“最前沿/最佳”认证。

| 官方来源 | 直接依据 | 本仓库采用 / 评审决定 |
| --- | --- | --- |
| [OpenAI Projects and chats](https://learn.chatgpt.com/docs/projects) | 项目资料与会话目标分层，项目关联工作上下文 | 保持来源页/阶段，设置不应打断原来的用户路径。当前公开文档是重定向后的桌面产品资料，不能当作独立旧版 Codex 的像素规范。 |
| [OpenClaw Chat](https://docs.openclaw.ai/web/control-ui/chat) | 执行进度在对话记录呈现，停止有运行/会话作用域 | 复核单运行状态，停止后旧事件不得继续输出；修复离页清理和忙碌时的错误成功通知。未实现多 Agent，不引入父子运行编排。 |
| [OpenClaw Exec approvals](https://docs.openclaw.ai/tools/exec-approvals) | 审批展示操作目标与执行上下文，取消后迟到批准不能重启执行 | 保留现有按运行绑定的审批示例，成果与审批独立；本轮修复完整审阅的返回链路。生产后端审批与幂等仍未实现，不能用界面确认代替。 |
| [Claude Connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) | 服务连接管理与单次对话启用分开，并可调整或断开 | 连接目录、可用于聊天、权限能力分开说明，修正模型菜单和自定义草稿的误导文案。 |
| [Cherry Studio Model Service Configuration](https://www.cherryai.com/docs/en/pre-basic/providers/) | 厂商选择、凭据、同步模型；Model Check 是单独操作 | 保留当前目录认证、搜索、刷新和失败恢复；不把目录验证当推理测试，不自动产生付费请求。 |
| [Claude Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) | 成果独立展示并可重新访问 | 本仓库正式报告提供复制和上次成功结果恢复，明确类型与当前性；未构建完整历史成果库。 |
| [W3C APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 初始焦点、键盘范围、Escape 与关闭后的合理焦点返回 | 复用原生 dialog；修复设置面板隐藏当前焦点后的恢复。自动化证据不能代替真实辅助技术验收。 |
| [WCAG 2.2 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | 不移动焦点也能传达状态结果 | 复制反馈与执行状态分别公告，失败不冒充成功；保留流式摘要公告而非逐字播报。 |
| [shadcn Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller) | 用户离开实时末尾、选择或操作文本时保留阅读位置 | 复核现有跟随/回到最新、选择文本和代码阅读路径，沿用既有实现与回归，不重新添加滚动实现。 |
| [AI Elements → shadcn/ui](https://ui.shadcn.com/docs/ai-elements) | 当前为标准组件组合的 Agent UI patterns；旧项目无强制迁移 | 继续复用既有原生实现。新 React 路线若启动应重新评估当前 shadcn patterns，不能继续把旧 AI Elements 当作独立永久目标。 |

## 版本与兼容性决定

2026-10-17 查阅时，旧 [AI Elements 网站](https://elements.ai-sdk.dev/) 公告迁移到 shadcn/ui、计划 2026 年 11 月底弃用旧站。新站明确现有复制进项目的组件可以继续工作。本仓库并没有安装 AI Elements/React；这些资料用于核对状态和交互原则，不是自动触发安装或全栈迁移的理由。

现有正式桌面为 Tauri 2 + Vanilla TypeScript + Vite，开发预览为原生 ES Modules；现有 Floating UI 与 markdown-it 固定资源继续复用。没有新增依赖、升级框架、复制参考产品代码或改变许可证。

## 实施交接

官方研究是已授权实施任务的只读输入；具体改动按 [计划](product-wide-review-plan.md) 执行，证据与风险见 [评审报告](product-wide-review-report.md)。规则/法律政策内容未在本轮重新核验，保留来源日期和示例标识，不借 UI 调研改动业务判定。
