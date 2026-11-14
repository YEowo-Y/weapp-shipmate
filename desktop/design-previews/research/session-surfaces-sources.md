# 快速对话与桌面会话：跨入口一致性参照

核对日期：2026-10-18。研究类型：有界官方行为核对。先读 `session-navigation-chat-sources.md`、`session-experience-sources.md` 及前轮会话资料，再查看已有图片、读取官方现行文档。没有操作本地验收浏览器、登录产品、复制私有实现或新增依赖。旧研究中“本页内存会话”等描述是当轮边界，本报告不据此断言当前仓库能力。

## 直接观察到的图像事实

本轮实际使用 `view_image` 复看以下三张已归档图：

| 图像 | 实际可见内容 | 界限 |
| --- | --- | --- |
| `assets/navigation-dialog-chat/codex-user-add-menu.png`，用户提供的 Codex 截图 | 输入区上方展开工具菜单；输入区保留权限和模型入口。 | 来源为用户附件，无官方公开 URL、构建号或历史列表；不证明跨窗口草稿传递。 |
| `assets/product-alignment/claude-desktop-official-video-poster.jpg`，[官方文章](https://claude.com/resources/articles/claude-code-desktop-redesign)、[封面原图](https://i.ytimg.com/vi/rWaQSQEm_aY/maxresdefault.jpg) | 左右工作区各有任务标题和底部输入区，中间可见结果/任务面板。 | 文章发布于 2026-04-14；是 Claude Code 桌面演示封面，不是普通聊天或 Quick entry 历史页。 |
| `assets/session-navigation-agent/cherry-assistant-topics.webp`，[官方 Chat Interface](https://cherryai.com/docs/en/cherrystudio/preview/chat/)、[原图](https://cherryai.com/docs/content-assets/ea2f3f51dcba385254d1f719.webp) | 助手父项下缩进 New Chat；当前对象在内容顶栏再次标示，另有窗口标签与搜索图标。 | 没有构建号，没有草稿切换前后或搜索结果画面。 |

这些像素仅支持“当前上下文可辨识、输入与会话有关联”的视觉方向，不证明保存、同步或恢复机制。

## 官方说明与五项项目结论

### 1. 快速入口应能够返回已有上下文

**官方说明：** [Claude Quick entry on Mac](https://support.claude.com/en/articles/12626668-use-quick-entry-with-claude-desktop-on-mac)（页面日期 2026-03-16）允许从其他应用唤起输入框；点击 New chat 可查看最近五个会话。该功能需要 Claude Desktop 正在运行，文档限定 macOS，不能照搬其系统级快捷键到普通 Web 页。[ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex) 也描述在 Codex 的 New chat 入口打开 Quick Chat。

**本项目决定建议：** 快速对话显示可识别的当前会话标题，并提供“打开完整对话”以及最近会话入口。打开已有对话使用同一会话身份，不能复制正文另建一份历史；“新建对话”才分配新身份。最近项数量按现有版面决定，五项不是行业强制规格。

### 2. 不同入口是否共享历史，必须是明确契约

**官方说明：** 上述 OpenAI 页面明确：Chat 与 Work 的会话共同出现在 Recents，Codex 仍为独立视图，其历史与 ChatGPT 历史分开。[Cherry Chat Interface](https://cherryai.com/docs/en/cherrystudio/preview/chat/) 明确：助手下每个 Topic 有独立消息历史，点击切换时保留上下文。

**本项目决定建议：** 若快速对话与正式桌面是同一会话的两种展示入口，两者共享稳定 ID、消息、手动名称及有效选择状态；若有不同来源/保存范围则显式标注，不能用相同标题暗示它们已同步。切换展示对象不隐式清空上下文、发送输入或改变已有消息。

### 3. 草稿保留属于必须自行验证的产品保证

**官方说明边界：** 本轮打开的三家桌面产品文档没有明确保证“所有入口、窗口和重开路径保留未发送文字、选区、附件”。OpenAI [Commands](https://learn.chatgpt.com/docs/reference/commands) 只明确空输入区可恢复上一条 composer prompt；Cherry 的“保留上下文”不是未发送草稿存储合同。搜索结果中的 Cherry 移动版草稿说明、Claude Console Playground 草稿说明均不适用于这里的桌面对话结论。

**本项目决定建议：** 将未发送草稿绑定会话 ID；快速入口展开为完整页时先完成交接，目标入口恢复同一草稿且不自动发送。空白新建草稿与已有会话草稿分别保留；仅成功接纳本次发送后清除该次提交内容，不能清除用户随后输入的新草稿。刷新、关闭、并行窗口保留范围由现有持久化契约明确，未实现的范围不得承诺。

### 4. 历史重开与当前内容查找要分开

**官方说明：** OpenAI [Commands](https://learn.chatgpt.com/docs/reference/commands) 将 Search chats 定义为重开过去会话，将 Find in chat 限定当前会话；扩展内容/分支匹配以功能可用为前提。页面还列出关闭标签后重开和前后会话切换，但这些桌面快捷键不是本项目浏览器绑定要求。Cherry 文档说明顶端放大镜打开搜索，却没有在本页完整规定搜索范围。

**本项目决定建议：** 快速入口与完整页复用同一已授权、已保留的会话目录和搜索规则；搜索结果进入原会话，搜索本身不创建副本。范围文案与实际本地/服务端能力一致。搜索无结果、取消搜索、关闭快速面板均不修改当前草稿和正文；“重新打开”恢复界面，不默认再次执行旧任务。

### 5. 打开历史不等于把全部历史发送给模型

**官方说明：** [Claude chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) 描述的是模型按需检索过去聊天、在当前聊天呈现工具调用并链接原会话；其权限、项目范围、记忆与隐身会话规则另有边界。它不是本轮本地标题/消息筛选的同义词，也不证明普通 UI 历史搜索的细节。

**本项目决定建议：** 两个入口对“查看/搜索历史”与“继续向模型发送”采用一致边界。前者只改变所见内容；后者沿用当前会话、模型、发送与停止逻辑。若切换入口不能保留真实运行连接，就显示真实中断状态与已有部分输出，不能用持续动效假装后台仍在执行。

## 版本、来源与验收界限

官方文档为 2026-10-18 读取的滚动内容，不代表所有安装版本和账号同时可用。OpenAI Commands 中 Quick chat 快捷键标为 ChatGPT only，而帮助文档另描述 Codex 内的 Quick Chat 入口；这里保留原文适用范围，不据此发明统一快捷键。未找到确切草稿保证便明确留为项目决定，未进行上游账户操作补证。

本轮只交付这一研究文件。建议实现方验证：A/B 会话各有草稿时往返切换；快速入口到完整页再返回；搜索命中重开同一 ID；无结果与取消不丢输入；成功发送只清除对应草稿；流式中跨入口不重复请求、不把运行态恢复成虚假执行。上述均是待验证项目行为，不是本报告已完成的测试。
