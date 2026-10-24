# 对话尺寸、设置及全产品路径：参考依据

2026-10-17。承接用户反馈“对话框过大，设置等其他功能也要参考”。以下区分真实图片、官方功能文档、公开源码与本项目的取舍，不把文档描述当作已看到的产品画面。

| 实际查看的来源 | 可确认的依据 | 本轮应用与边界 |
| --- | --- | --- |
| 用户提供的 Codex 输入框截图 `codex-clipboard-36d8d827-7d51-4b0e-b31c-78e5545aad66.png` | 实际查看图片：上方输入、下方单行工具，圆角中性表面，模型与主操作在右。 | 保留结构，缩减空输入高度、圆角与菜单间距。截图裁切和缩放未知，不能推导精确 CSS 尺寸。 |
| [OpenAI：Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/) | 实际阅读官方产品介绍，确认项目/任务组织、工作区与审阅路径。 | 输入尺寸要服务于工作区阅读，不以一个大输入框占据主界面。本轮未取得可量取的新 Codex 官方产品图。 |
| [ChatGPT 桌面设置参考](https://learn.chatgpt.com/docs/reference/settings) | 实际阅读当前设置文档：General、Keyboard、Appearance，以及发送方式、后续输入和外观选项。该地址是此前 Codex 设置链接的当前重定向目标。 | 设置按用途分组；复用真实支持项，未实现项明确标注。不能将当前 ChatGPT 文档混称为 Codex 专有视觉规范。 |
| [Claude：模型、effort 与 thinking 设置](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) | 实际阅读官方帮助：模型选择在发送控件附近，设置影响后续回复。 | 保留模型入口与输入区关联，不添加后端不支持的 effort 选项。没有精确宽高规范。 |
| [Claude Code desktop redesign](https://claude.com/resources/articles/claude-code-desktop-redesign) | 实际阅读官方文章：会话侧栏、筛选、可组合工作区面板及不同详细程度。 | 工具与详情渐进展开，设置和业务入口保持清晰。此来源是 Claude Code 桌面版，不是 Claude Chat 设置页截图。 |
| [Claude Academy：Navigating the desktop app](https://academy.claude.com/tutorials/navigating-the-claude-desktop-app) | 实际阅读官方桌面工作流说明，包括快速输入窗口与快捷键。 | 支持把输入做成适量占用空间的入口；本轮未取得能直接检查的 Claude 输入框/设置截图，不声明像素复刻。 |
| [Cherry Studio：Model Providers](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) 与 [官方图片](https://www.cherryai.com/docs/content-assets/84b3d4a4b6d1af3614f9914e.webp) | 实际阅读官方文档并查看已存本地官方图 `assets/cherry-api-key-official.webp`：设置导航、服务商列表、详情区与独立 API Key 弹窗。 | 服务商与详情分开；密钥独立临时弹窗；窄屏使用原生选择框代替长列表。此图能证明结构，不能证明本地页面已视觉验收。 |
| [OpenClaw 固定提交设置设计规范](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/docs/design-system/settings-design.md) | 实际阅读源码文档：单层工作面、标签/控件行、避免重复说明，触摸目标 44px、移动输入 16px。 | 减少卡片套卡片和重复状态；移动控件保留尺寸；复用设置行。这是源码规范证据，没有运行其产品或截图。 |

## 本地设计决定

- 阅读/输入最大宽度 **680px**，由原来的 768px 收紧。它是针对本项目工作区的选择，不是 Codex/Claude 官方数值。
- 单行起步、输入区最小 44px、桌面工具按钮 36px、触摸按钮至少 44px；较长输入增长至 `min(144px, 28dvh)`，随后内部滚动。
- 桌面空输入无附件、无编辑提示、底部提示一行时，按当前 CSS 盒模型名义计算约从 **168px** 减至 **124px**；这不是浏览器实测，字体、折行和内容会改变高度。
- 原生 textarea、dialog、select、popover 及已有 Floating UI/图标继续复用，无新增依赖。本轮未使用 REA，也未把公开产品实现代码复制进项目。

本地浏览器仍按用户此前选择停留在代码与自动化验证范围，视觉门禁 BLOCKED；需要在真实视口检查对话/设置、长内容、缩放、触摸和软键盘后才能给出视觉验收结论。
