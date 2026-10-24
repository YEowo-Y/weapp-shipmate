# Codex / Claude 对话体验：本轮实际依据

核对日期：2026-10-17。本轮实际查看用户提供的 Codex 执行流截图，并读取下列官方文档。不是从记忆描述产品，也没有取得私有前端源码、登录客户端或运行 REA。

## 可直接观察的视觉

用户提供的 `codex-clipboard-881e079c-069e-4730-944a-9db777f91894.png`：开放的助手正文、中性深色背景、灰色紧凑执行行、宽圆角输入面、输入与底部工具栏分层、右侧发送/停止控制。图片本轮通过本地 view_image 实际查看。它属于用户提供的参考，不能用于证明当前项目已达到像素一致。

应用方式：正文统一16px与较舒展行高；隐藏每条助手消息重复的可见身份标签但保留可访问文本；运行状态只保留文字，不再渲染重复转圈图形；旧消息操作按鼠标悬停或键盘焦点显示，最新消息和触摸环境保持可达。输入区和正文采用同一768px最大宽度与间距变量。未照搬未实现的语音、完全访问权限或真实模型名称。

## 官方交互与技术依据

| 来源 | 核对事实与取舍 |
| --- | --- |
| [OpenAI 原 Codex app settings 地址](https://developers.openai.com/codex/app/settings) → [当前 Settings 文档](https://learn.chatgpt.com/docs/reference/settings) | 地址现重定向为 ChatGPT desktop 文档：提供 Enter / Cmd或Ctrl+Enter 发送方式，以及生成中 steer / 等待下一轮的 Follow-up behavior。不能把重定向后的文字当作旧 Codex 客户端截图。本地演示尚无队列，生成中 Enter 明确说明草稿未发送，避免静默或伪造 steering。 |
| [Claude：Change the model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) | 模型菜单位于发送按钮旁；会话中调整配置从下一次回复开始生效。沿用当前输入区模型按钮位置，不新增无执行支撑的 effort / thinking 配置。此文不能证明 Claude 最新客户端的所有编辑、重试和键盘行为。 |
| [Floating UI](https://floating-ui.com/docs/computePosition) 与 [WAI-ARIA Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) | 沿用上一轮已验证和集成的成熟定位、菜单导航实现；本轮不重写弹层或新增依赖。版本和许可证记录见 [dialog-foundation-sources.md](dialog-foundation-sources.md)。 |

本轮的会话阅读恢复、引用快照、编辑草稿隔离是针对仓库实际问题的修复，不宣称这些内部实现来自 Codex / Claude 源码。既有 Markdown-it、Lucide、原生 textarea / dialog / popover 继续复用，没有引入 React / shadcn 或第二套消息运行时。

## 验证边界

Work 本地浏览器访问先前禁用，用户选择仅完成代码与自动化验证。因此本轮没有新的本项目截图，亦未绕过限制。深浅主题像素、窄屏布局、系统输入法、软键盘、读屏与原生焦点仍需浏览器/设备实测；代码和合成 DOM 测试不替代这些证据。
