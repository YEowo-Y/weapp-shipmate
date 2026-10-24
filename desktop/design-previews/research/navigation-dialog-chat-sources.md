# Codex / Claude：导航、弹窗、空态与恢复

调研日期：2026-10-18。类型：有界官方文档与真实界面研究。本轮新增读取 2 个官方页面；没有下载新增网络图片，复看 2 张归档 Claude 图片及 1 张用户提供的 Codex 截图，并归档后者。未登录第三方、未操作共享浏览器、未修改产品实现。

## 本地证据优先

先读 [已有弹层研究](codex-claude-dialog-reference.md)、[组件基础能力](dialog-foundation-sources.md)、[会话导航研究](session-experience-sources.md)、[设置路径研究](settings-journeys-sources.md) 与 [产品图片研究](product-alignment-chat-sources.md)。本地记录说明项目已有共享 `shipmateUI.openMenu / makeDialog / showDialog`、原生模态与 Floating UI 弹层定位。本轮不重新判断其当前实现是否完整，也不重复增加组件库；代码现状与验收由实现代理核实。

## 本轮新增官方证据

| 来源 | 本次实际确认 | 版本范围 |
| --- | --- | --- |
| [OpenAI：Troubleshooting](https://learn.chatgpt.com/docs/reference/troubleshooting) | 缺少会话时检查筛选及设置里的归档；恢复归档会话回到原侧栏位置；选错执行目标并取消后，可在输入区恢复上次提示。 | 从 `developers.openai.com/codex/app/troubleshooting` 重定向；当前标题为 ChatGPT desktop app，内容含 Codex。不能把旧 URL 当作独立 Codex 版本的证明。页面也明确 CLI 与桌面内置版本可能不同。 |
| [Claude：Troubleshoot error messages](https://support.claude.com/en/articles/12466728-troubleshoot-claude-error-messages) | 分别说明用量限制、输入过长、临时容量和服务故障；额度耗尽可提供恢复时间，过长输入应缩小内容或新建对话，临时容量建议稍后重试。 | 本次显示 Updated this week；无可锁定的客户端构建号。不是服务端 API 错误码合同，不可直接把 Claude 消费产品额度机制套到第三方模型。 |

没有采用搜索结果中的第三方镜像、论坛描述或未打开页面作为证据。

## 实际查看的图片

- **用户提供的 Codex 添加菜单**：[本地归档](assets/navigation-dialog-chat/codex-user-add-menu.png)。原附件 `codex-clipboard-eb9dd380-7053-46ea-93c0-29d71b7bc86c.png`，1173 × 663；用户截图，没有独立发布 URL 或客户端版本。像素可见菜单紧邻输入区上方，分“添加”“插件”两组，图标/标题/灰色解释同行，当前行浅灰背景，列表内部有滚动条。图中不是居中确认框；不能从静态图证明键盘、焦点或关闭顺序。
- **Claude 设置导航**：[归档图](assets/product-alignment/claude-settings-reflect.png) · [官方来源](https://www.anthropic.com/news/reflect-with-claude) · [原图](https://www-cdn.anthropic.com/images/4zrzovbb/website/3668f39d9a71aa03cb60df079921934a6f1ac144-3840x2160.png)。3840 × 2160，2026-07-09 官方展示素材。本轮重新查看：左侧分组文字、小描边图标、浅灰选中行，主区域用标题、说明、留白与细线组织。绿色背景与面板叠放属于宣传包装；不是模态尺寸证据。
- **Claude 桌面工作区**：[归档图](assets/product-alignment/claude-desktop-official-video-poster.jpg) · [官方文章](https://claude.com/resources/articles/claude-code-desktop-redesign) · [官方视频封面](https://i.ytimg.com/vi/rWaQSQEm_aY/maxresdefault.jpg)。1280 × 720，文章发布于 2026-04-14。本轮重新查看：辅助区域各有名称与关闭图标，和对话并列；动作信息保持紧凑。截图不能证明如何恢复面板、动画或焦点归还。

## 四条迁移建议

1. **导航保留稳定层级。** 借鉴 Claude 设置图的分组和克制选中态；本项目设置导航与会话导航分别保持清晰身份。会话搜索/筛选要持续可见，清除筛选不改变当前会话。后半句为根据 OpenAI 排障路径得出的本项目设计建议，并非图片已证实的行为。
2. **区分选择菜单与确认弹窗。** Codex 用户截图支持“添加/模型等上下文选项贴近触发器、分组紧凑呈现”；不要把每次选择升级为居中模态。项目现有确认框保留具体对象、后果和动作名称，避免通用“确定”。焦点、Escape、背景隔离沿用已有组件规范并重新测试；这些行为不来自静态图片推断。
3. **空态解释当前原因。** 本项目至少区分首次无会话、搜索无匹配、筛选后无结果及加载失败：分别给开始任务、清除搜索、重置筛选、重试入口。OpenAI 的筛选/归档排障说明支持这种原因区分；本轮没有获取官方空态截图，具体排版属于本项目选择。没有真实归档功能时不要画出虚假“恢复归档”按钮。
4. **恢复动作与失败原因匹配。** 取消或失败时保留可编辑草稿和已收到的部分输出；临时失败可重试，鉴权失败引导到对应连接设置，输入过长提供编辑/新会话入口，限流时间只有服务端真实返回时才展示。草稿恢复由 OpenAI 文档启发，错误分类由 Claude 文档启发；鉴权入口和保留部分输出是项目建议。禁止自动重放未明确可重试的有副作用工具操作。

## 交付与边界

仅新增本说明和用户图归档。没有引用第三方私有源码，也未测量官方 DOM；尺寸、字体、响应断点和动效参数不是本轮证据。参考素材日期不同，不代表所有账户当前 UI。还需在本项目验证窄屏弹窗、菜单遮挡、焦点归还、空搜索、取消保留输入及失败后恢复；本报告不构成这些路径已经通过的声明。
