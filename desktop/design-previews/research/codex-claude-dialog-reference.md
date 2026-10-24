# Codex / Claude 对话区与弹层交互参考

调研日期：2026-10-13。本轮针对输入框附近菜单、确认弹窗、命令面板与成果展示，区分官方文档事实、项目实现选择和实际浏览器验证。将元素改成原生控件只解决部分语义问题，仍需匹配每类操作的交互方式。

## 官方证据与采用范围

| 官方来源（完整 URL） | 本轮核实的事实 | 项目采用方式 | 证据边界 |
| --- | --- | --- | --- |
| [Codex commands](https://learn.chatgpt.com/docs/reference/commands) | 官方原地址 `https://developers.openai.com/codex/app/commands` 重定向至此；命令菜单支持 Ctrl+K / Ctrl+Shift+P，模型选择支持 Ctrl+Shift+M。 | 统一命令入口与模型入口，确保键盘可达。 | 来自官方说明；本机检查只找到 CLI bin，未取得 GUI bundle，未测量 Codex 原生界面。 |
| [Claude 模型、effort 与 thinking 设置](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) | 发送按钮旁显示已选模型与 effort；点击模型名进入菜单；设置变更从下一次回复开始生效。通过网页读取和实际浏览器正文核实。 | 使用贴近触发器的模型/模式菜单；当前选择持续可见；进行中的执行不被后续选项修改。 | 不证明菜单全部关闭时机，也不证明内部组件库；采用紧凑菜单是根据文档交互作出的项目选择。 |
| [Claude 自定义连接器](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) | 左下角“＋”进入 Connectors，可按会话开关连接器；小型结果可内嵌，复杂交互可展开且保留 composer。 | 将输入区上下文选择收敛为菜单；小结果留在对话内，大文件单独展示。 | 文中同时使用 Search and tools 称呼，可能存在版本差异；本项目页面上下文并非真实 Claude 连接器。 |
| [Claude Artifacts 键盘操作](https://support.claude.com/en/articles/17457950-use-artifacts-with-a-keyboard-or-screen-reader) | Enter 打开成果并移动焦点；Tab 经头部进入内容；Escape 先关菜单/弹层，再逐层退出成果，最后回到触发位置或输入框。 | 按层处理 Escape，关闭后归还焦点；文件内容与聊天输入分区。 | 官方明确区分新版与旧版 Artifacts；当前项目文件对话框不等同于完整 Artifact 编辑侧栏。 |
| [Claude Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) | 首次使用连接应用时列出涉及的应用和工具并请求批准；首次使用共享存储时说明数据可见范围。 | 确认界面呈现具体动作、对象及后果，按钮使用动作名称。 | 本轮没有建设真实连接器授权或共享存储服务；前端确认不能替代服务端授权。 |
| [Claude Desktop 深链接](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link) | 外部链接提供的目录须确认后使用；预填提示词保留在输入框，供用户检查后发送。 | 预填与提交分离；真正改变执行对象时使用确认模态。 | 文档发表于 2026-06-30，未操作真实 Desktop 深链接或账号。 |
| [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using) | 自动 popover 提供顶层展示与轻关闭机制；popover 本身不会自动提供完整菜单语义和方向键逻辑。 | 上下文菜单采用原生 popover，并补齐选中、键盘和焦点规则。 | 浏览器能力是实现依据，不能称为 Codex/Claude 的内部实现。 |
| [WAI-ARIA Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) | 菜单按钮表达弹出类型及展开状态；Enter / Space 打开并进入菜单，方向键导航有明确模式。 | 区分焦点移动与提交选择，Enter 才应用当前选项；同步展开状态。 | APG 是可访问性交互模式，具体实现仍需浏览器与辅助技术验证。 |
| [WAI-ARIA Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 模态需可辨识名称、合适初始焦点、内部焦点导航与关闭后的焦点恢复；Escape 用于关闭。 | 确认、命令和文件对话框共享焦点与关闭约定，保留明确关闭入口。 | 模态与轻量选择菜单职责不同，不能将所有选项都包进同一种居中弹窗。 |

## 本项目的实现选择

继续使用当前原生 JavaScript/CSS 技术栈，没有新增依赖。上下文选择使用原生 popover；确认、命令和文件对话框分别采用约 440、600、780 px 的桌面最大宽度并适配小屏。**这些尺寸是本项目的设计选择，未声称复制 Codex 或 Claude 的像素规格。**

交互状态显式区分打开、聚焦、选中、提交、取消与执行中。方向键移动焦点不提交，Enter 应用选择；无搜索结果时 Enter 不得穿透为聊天发送；重复点击触发器可关闭菜单；Escape 关闭当前层并归还焦点。

## 验证记录与边界

本轮本地浏览器已验证：模型菜单方向键不提交、Enter 选择、重复触发关闭、Escape 后焦点归还；`@` 页面选择的隐藏问题已修复，无结果时 Enter 不发送消息。

移动端检查发现的遮挡与焦点问题已修复：320px 五个引用选项中心均命中自身；批准后聚焦撤销、撤销后聚焦批准、拒绝后聚焦重新生成；Escape 先关确认再关审批面板。768×640 命令面板的底部裁切已修正。工作台、聊天、命令、差异审阅、组件验收页完成限定操作验证，涵盖 320/768/1440px 与明暗主题。全量测试 265/265、根及显式预览 lint 通过，独立审查通过。具体截图、测试边界见 [执行记录](../COMPONENT-STANDARDIZATION.md) 与 `.omx/state/dialog-refinement/`。

未登录 Claude、未发送消息、未更改账号设置。未实测 Claude Desktop 的流式停止按钮、Esc 停止生成、自动滚动或精确菜单关闭时机；不能把 Claude Code CLI 的 Esc 中断行为当作 Desktop 聊天事实。官方产品页 `https://claude.com/features/artifacts` 的浏览器访问因连接关闭失败，网页读取工具可获取正文，但没有取得可量取字号、圆角、阴影或动效参数的产品截图。

此前 REA 对 assistant-ui、Cherry Studio、OpenClaw、Hermes 的限定源码研究见 [Agent 产品参考](agent-product-reference.md)。本轮未新增 Codex/Claude REA 扫描，未提取或复用其私有前端源码。
