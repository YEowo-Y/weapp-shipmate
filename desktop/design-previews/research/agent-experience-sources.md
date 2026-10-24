# 对话正文与操作反馈：官方资料核对

日期：2026-10-17（America/Los_Angeles）。本轮以官方文档、固定版本发布包和已有用户截图为依据，没有新增客户端截图或重新运行 REA；网页文字资料不等同实际视觉验收。

| 实查来源 | 官方资料支持的行为 | 本项目采用的范围 |
| --- | --- | --- |
| [OpenClaw Chat](https://docs.openclaw.ai/web/control-ui/chat)，Markdown / code blocks、Stop and abort、Markdown tables | 代码复制保留缩进与尾换行；代码围栏闭合后保持阅读选项；表格适配阅读宽度，密集内容允许横向滚动；停止使用明确运行状态。 | 保留代码节点及独立滚动、停止后保留内容；表格区域支持键盘聚焦和横向滚动。没有实现 OpenClaw 的分屏、表格扩展或后台执行能力。 |
| [AI Elements Message](https://elements.ai-sdk.dev/components/message)，Features / Usage | 消息正文、消息操作分开，助手回复使用 Markdown，支持代码复制、键盘语义及响应式；其示例使用 React / Streamdown。 | 采用同样的正文与操作职责划分，保留原生预览共享组件；未整套安装 AI Elements 或引入第二个聊天运行时。 |
| [Claude Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)，Work with artifacts | 成果在对话旁独立展示。 | 沿用现有差异审阅区域，正文负责解释，结构化结果与审批仍由独立组件和状态驱动。未仿造 Claude 品牌或声称接入其能力。 |
| [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/) 与用户提供的输入区、执行流截图 | 公开产品界面参考；用户截图直接展示了中性对话面、紧凑工具记录、底部输入区和模型选择。 | 保留现有输入区和执行文字渐变；修复窄栏模型名称被隐藏、状态更新让整条回复重复淡入的问题。没有提取私有前端实现。 |
| [markdown-it 官方文档](https://markdown-it.github.io/markdown-it/) 与 [15.0.3 发布源码](https://github.com/markdown-it/markdown-it/tree/15.0.3) | 官方浏览器 ESM 导出、默认构造函数及 parse(source, env) token API；CommonMark 与内置扩展。 | 锁定官方浏览器资源，关闭 HTML；用安全 DOM 适配层显示解析结果。语法解析不由项目自行实现。 |

## 依赖选择与许可

新增的是一份本地、固定版本的 markdown-it 15.0.3 官方浏览器资源，而非新的 npm 安装或框架迁移。保留原始 source map，正常加载不需要读取 map。运行时文件 124,681 bytes；map 449,809 bytes。

实际校验 npm tarball 的 SHA-512，再按明确文件名读取资源；三个上游文件保留原始字节，并以 SHA-256 回归保护。解析器采用 MIT；bundle 中五项依赖的确切版本来自上游 15.0.3 lockfile，许可证来自逐个校验完整性的官方 npm 包，包括 entities 的 BSD-2-Clause。详见 [来源和哈希](../components/vendor/markdown-it/SOURCE.md)、[解析器许可证](../components/vendor/markdown-it/LICENSE) 及 [第三方声明](../components/vendor/markdown-it/THIRD-PARTY-NOTICES.txt)。未执行下载包中的脚本。

实际参数：`html:false`、`breaks:true`、`linkify:false`、`typographer:false`。不调用 HTML renderer，不使用 innerHTML；允许的标签和属性由适配层固定。链接仅允许无凭据的 HTTP/HTTPS，原始 HTML 作为文字，图片转为需要用户主动打开的链接。相对路径、协议相对路径、data/javascript/vbscript 不会成为可点击导航。

支持标题、段落、列表、引用、强调、删除线、行内代码、围栏及缩进代码、表格、显式安全链接。不将其描述为完整 GFM 或 Streamdown 等价实现：任务复选框、数学公式、Mermaid、代码语法高亮尚未加入。
