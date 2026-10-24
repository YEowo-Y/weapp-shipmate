# Research: ChatGPT / Claude 官方界面像素参考

## Request Type

Current best-practice research / 真实界面视觉参考；检索与逐张查看日期：2026-10-17。

## Direct Answer

这轮实际下载并通过 `view_image` 看过 5 张官方素材。它们覆盖 ChatGPT 的输入框、附件、移动端消息/结果，Claude 的设置页和桌面代码工作台。是官方发布图，**不是本次登录个人账户后的实测截图**。布局、色彩和层级可以作为依据；截图无法确定实时动效、精确 CSS 值或当前全部账户的界面版本。

## Official Docs Evidence / 图片清单

### ChatGPT：macOS 输入与附件

- [来源：ChatGPT macOS app – Screenshot Tool](https://help.openai.com/en/articles/9295245-chatgpt-macos-app-screenshot-tool)
- [菜单原图](https://images.ctfassets.net/j22is2dtoxu1/intercom-img-e1314aa390884a7e44dec5a6/ac351fade56b7018d314107dc0811615/image.png?fm=webp&q=80&w=462) → [本地图片](assets/product-alignment/chatgpt-composer-menu.webp)
- [附件原图](https://images.ctfassets.net/j22is2dtoxu1/intercom-img-a3496a05b1193e268edf4356/53118a06ce5f17756df4a45f68dc1d40/QhQk3GeMYgBuFcwJ5A421Xe3lC0Wl4y21hdY-ZdBatf6S89X4nqYpkj22q5snq_suG-59AVe32o8Ytzs9b9pFY17hxBAPDnifhXp_urDwF-22r6_1lAMeCcM5baqAP9P?fm=webp&q=80&w=677) → [本地图片](assets/product-alignment/chatgpt-composer-attachment.webp)
- **像素观察：** 菜单图为浅灰圆角输入面、深灰图标，输入与动作分行；+ 的按下态有更深灰底，菜单紧贴触发位置。模型名称与工具在同一动作行。附件图有左上缩略图及独立移除钮，下方紧凑文字输入行，发送为简单圆形向上箭头。
- **范围限制：** 仅输入框局部；菜单图可见 `o4-mini`，附件图布局又不同。即使帮助页更新较近，也不能认为两图是同一版本或 2026 年当前全局布局。适合参考层级和状态，不宜据此复刻旧模型位置。

### ChatGPT：消息、结果与移动端输入

- [来源：官方 UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines)
- [官方原图](https://developers.openai.com/images/apps-sdk/overview.png) → [本地图片](assets/product-alignment/chatgpt-mobile-apps-official.png)
- **素材类型：** 官方移动端多界面演示合成图，展示 ChatGPT 5；不是一张连续页面截图，第三方应用内容是示例。
- **像素观察：** 用户气泡浅灰靠右；工具名/图标是灰色轻量行；文字回复无外层气泡；只有结构化结果有细边框与圆角容器。列表靠细分隔线组织，副文本弱化。底部输入为单行胶囊，+、麦克风及声音动作紧凑，黑色圆形按钮表达主动作。执行态图为灰色 Thinking 加独立停止按钮。
- **文档补充，非截图推断：** 官方规范建议中性色、系统字体、少量字号层级、单色描边图标、统一间距；内联卡片最多一个主操作和一个次操作，避免重复输入和内嵌复杂导航。此规范适用于 ChatGPT 插件界面，借鉴到自有产品需要保留业务差异，不能宣称其是任意 Agent 的强制标准。

### Claude：设置页

- [来源：Introducing a way to reflect on how you use Claude](https://www.anthropic.com/news/reflect-with-claude)，发布 2026-07-09。
- [官方原图](https://www-cdn.anthropic.com/images/4zrzovbb/website/3668f39d9a71aa03cb60df079921934a6f1ac144-3840x2160.png) → [本地图片](assets/product-alignment/claude-settings-reflect.png)
- **素材类型：** 设置导航和 Reflect 内容的官方宣传合成截图；背景绿色及前后叠放属于展示包装，不应照搬到实际设置布局。
- **像素观察：** 设置导航由小标题分组；每行细描边图标配文本；选中行为浅灰底、深色加粗文本。主内容以标题、解释、细分隔线、指标和图表形成层级，没有为每段说明套边框卡片。正文有明显行距，辅助标签灰色。顶部周期选择、刷新操作靠右。
- **可借鉴：** 设置目录稳定、选中克制；配置正文用节标题/间距组织，减少嵌套框，解释文字低于字段和当前状态。

### Claude：桌面工作台与执行记录

- [来源：Redesigning Claude Code on desktop for parallel agents](https://claude.com/resources/articles/claude-code-desktop-redesign)，发布 2026-04-14。
- 该页内嵌[官方演示视频](https://www.youtube-nocookie.com/embed/rWaQSQEm_aY)，使用其公开[高清封面](https://i.ytimg.com/vi/rWaQSQEm_aY/maxresdefault.jpg) → [本地图片](assets/product-alignment/claude-desktop-official-video-poster.jpg)
- **素材类型：** 官方演示视频封面包含实际桌面工作台，1280×720；不是本轮自行操作 Claude 获得的截图。
- **像素观察：** 近黑主画布、低对比深灰辅助 pane；用户消息小气泡靠右，回答与 Edit/Write/Run tests 等动作直接排在画布。工具动作紧凑且可展开，不是每条套大卡片。预览、diff、terminal、tasks 有独立标题与关闭钮。输入行很低，权限、附件、模型等操作在下方同一行；多 pane 间以窄间距区分。
- **可借鉴：** 主对话优先，过程信息减轻视觉重量；辅助结果按需展开；输入框高度随内容而非固定大空白。不能由封面推断所有工具步骤的展开动画，也不能直接复用其中角色图案。

## Version Note / Caveats

- 没有读取登录后私有聊天或设置，也没有测量官方产品的 DOM。字号、圆角、间距的精确数值应由本项目响应式验收确定，不能伪装成官方 token。
- [2026-09-16 官方变更说明](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)明确 Chat/Cowork 正分阶段合并。旧图里的模式数量不能直接当作最新通用设计要求。
- [ChatGPT 发行说明](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)记载 2026-04-28 模型选择移至 composer。图片中的旧模型名称不是本项目模型目录或授权范围的依据。
- Claude 产品概览取得的图片仅是 Docs/Slides/Designs 宣传卡；2024 Team 图为 onboarding。两张经查看后不适用于当前聊天/设置目标，未保留为核心证据。
- 官网个别旧文章跳转后 404；未借第三方转载填充成官方实测。

## Reusable Takeaway

将“消息正文、轻量执行行、结构化结果、按需辅助 pane”区别呈现；设置采用分组导航与平面分节正文；输入框控制初始高度和最大宽度，保持一个明确主动作。保留项目品牌与真实能力说明，不复制品牌资产，不把截图里存在的功能当作本项目已实现功能。
