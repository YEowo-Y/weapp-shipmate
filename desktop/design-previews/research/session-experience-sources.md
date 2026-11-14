# 会话导航：真实产品资料

核对日期：2026-10-17。本轮通过官方网页、仓库 README 与其原始图片核对产品事实；没有登录产品、重新运行 REA 或提取私有前端。沿用用户提供的 Codex 截图作为中性对话面和紧凑工具栏参考。

| 来源 | 实际核对内容 | 采用范围 |
| --- | --- | --- |
| [Claude：Delete or rename a conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation) | 官方说明从侧栏或 Chats and tasks 找到会话，右侧菜单执行 Rename / Delete；删除有确认步骤。 | 会话旁操作菜单、重命名对话框；不增设本轮不需要的删除/归档流程。 |
| [OpenClaw：Control UI Chat](https://docs.openclaw.ai/web/control-ui/chat) | 官方说明线程搜索有明确会话范围；首次输入命名与显式名称分开；标题可点击重命名；搜索和会话操作不改变正在查看的其他会话身份。 | 本页标题/消息搜索、首条输入的本地摘要命名、手动名称保护、按 session ID 保存重命名。这里没有 Gateway、跨 Agent 搜索或模型生成标题。 |
| [Cherry Studio 官方 README](https://github.com/CherryHQ/cherry-studio) 与 [README 原始页面图](https://github.com/user-attachments/assets/36dddb2c-e0fb-4a5f-9411-91447bab6e18) | 已实际查看原始图：左侧助手/话题导航使用浅中性色、轻量选中态、细分隔；对话阅读区与底部输入区突出；README 列有全局搜索和话题管理。 | 使用已有主题变量、简洁会话行、标题省略、消息摘要次层级、独立菜单按钮；不照搬品牌、图标或业务实现。截图不能证明最新客户端全部交互。 |

图片仅留作本地研究证据：`.omx/reference-cherry-session.png`，2613×1869，391,979 bytes，SHA-256 `a687554f037c0f132e3f50b2e8c9ba4ba86e9315c33f9f013af3be4a7ea1d5ed`。未作为产品资源发布。Cherry Studio 仓库标记 AGPL-3.0；本轮未复制其代码。

## 选型

沿用原生 ESM 与已有 `shipmateUI.openMenu / makeDialog / showDialog`，使用本地 Lucide `search/x/ellipsis/pencil`；输入框、表单和对话框采用原生语义。未增加依赖、未升级框架、未增加第二套消息/状态协议。

自动标题只是本地截取首条用户输入，最多32个 Unicode 字符后加省略号；不是模型摘要。搜索只访问本页会话标题和消息 text，不索引工具原始数据、未发送草稿或隐藏推理。
