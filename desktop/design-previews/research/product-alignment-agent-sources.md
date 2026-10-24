# OpenClaw / Cherry Studio：真实界面图片证据

检索与实际像素查看：2026-10-17 America/Los_Angeles（2026-10-18 UTC）。本记录只研究公开官方图片，不声称登录或实测了这两款应用。所有下列图片均已下载，并逐一通过 `view_image` 实际查看。未修改产品实现。

## 来源与版本边界

| 本地图片 | 原始来源 | 覆盖与限制 |
| --- | --- | --- |
| [Cherry API Key 弹窗](assets/product-alignment/cherry-api-key-dialog.webp) | [官方 Model Service Settings](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)；[原图](https://www.cherryai.com/docs/content-assets/84b3d4a4b6d1af3614f9914e.webp) | 设置分类、厂商列表、模型详情三栏背景，以及 API Key 弹窗。截图无应用版本号，不能断言对应最新安装包。 |
| [Cherry 模型选择器](assets/product-alignment/cherry-model-picker.webp) | [官方 Advanced Chat](https://www.cherryai.com/docs/en/advanced-basic/chat/)；[原图](https://www.cherryai.com/docs/content-assets/6af4623dbaabe8f3d739dc0e.webp) | 完整聊天壳、顶部模型入口、展开选择器、底部 composer；是本轮 Cherry 聊天的优先视觉参考。 |
| [Cherry README 聊天](assets/product-alignment/cherry-chat-readme.png) | [固定 SHA README](https://github.com/CherryHQ/cherry-studio/blob/d01b83d2cc58e5a7f95906f2546a5db96e8344e9/README.md#-screenshot)；[原图](https://github.com/user-attachments/assets/36dddb2c-e0fb-4a5f-9411-91447bab6e18) | 官方 README 的旧式聊天截图：多按钮 composer、助手列表、Markdown/图表。与当前官方文档图片明显不同，不能混称同一版本。 |
| [Cherry README MiniApps](assets/product-alignment/cherry-miniapps-readme.png) | 同一固定 SHA README；[原图](https://github.com/user-attachments/assets/f549e8a0-2385-40b4-b52b-2039e39f2930) | 应用目录与品牌图标网格；不是模型连接设置页，不用于推断连接逻辑。 |
| [OpenClaw 工作中聊天](assets/product-alignment/openclaw-working-chat.png) | [固定 SHA 上游验收图](https://github.com/openclaw/openclaw/blob/89207ad525fc581f59eaa6ed8c999474cb78b376/.github/pr-proof/working-claw-centering/after-full.png) | 官方仓库 PR proof，包含会话侧栏、工具执行、composer/停止状态；是开发分支截图，不能当作稳定版发布证明。图中测试提示词仅是截图内容。 |
| [OpenClaw 渠道向导](assets/product-alignment/openclaw-channel-wizard.png) | [固定 SHA 上游验收图](https://github.com/openclaw/openclaw/blob/89207ad525fc581f59eaa6ed8c999474cb78b376/.github/pr-proof/plaintext-channel-wizard/after.png) | 单任务设置弹窗；设置背景被模糊，不能据此声称已完整核验设置各项排版。 |
| [OpenClaw 身份行](assets/product-alignment/openclaw-avatar-settings.png) | [固定 SHA 上游验收图](https://github.com/openclaw/openclaw/blob/89207ad525fc581f59eaa6ed8c999474cb78b376/.github/pr-proof/blobster-picker/after.png) | 仅头像、Display name 和 Emoji 字段的窄截图，不是完整设置页。 |

上游检索时 HEAD：OpenClaw `89207ad525fc581f59eaa6ed8c999474cb78b376`；Cherry Studio `d01b83d2cc58e5a7f95906f2546a5db96e8344e9`。这些 SHA 用于固定来源，不代表发布标签。图片仅保留为研究证据，不嵌入产品或重新分发为产品资产；未复制上游实现代码。

## 从实际像素得到的观察

### Cherry Studio

- **设置页是平面主从布局。** 左列设置分类，中列厂商及搜索，右列配置。分隔主要靠细竖线与留白；没有为每段文字套一张卡片。API Key、API Host、Models 标题形成同一条左侧基线。
- **API Key 弹窗聚焦一个任务。** 厂商图标和名称在标题行；一个密码输入框内置显示按钮；获取 Key 链接紧邻字段；底部动作区有明确主次。背后设置页被单层遮罩统一弱化。右上关闭入口独立，内容不塞满说明段落。
- **现代聊天把模型入口放在顶部。** 选择器顶部搜索，下面为能力筛选与厂商组，列表每行包含选择状态、品牌图标、模型名和小型能力图标；底部有配置入口。选择器内部滚动，主页面布局不随列表长度增高。
- **composer 降低工具常驻密度。** 当前文档图的 composer 是输入一排、底部工具一排；左边少量工具，右边模式与发送。旧 README 图底部工具明显更多，应优先借鉴当前文档图的收敛方式。
- **品牌色用于识别对象。** 模型图标保留厂商颜色；界面大面积白/浅灰；选中行用轻灰背景，不让每个按钮都争抢注意力。截图中的衬线字体属于该截图用户配置，不应推断为强制品牌字体。

### OpenClaw

- **对话内容占主体。** 官方仓库聊天图左侧单层会话导航，右侧大面积平面深色正文；顶部只有面包屑和少量线性图标。没有一直占据正文的多层状态卡。
- **工具进度是紧凑行。** 工具图标、动作摘要、展开箭头共一行；耗时与 token 信息为次级色。此图显示额外运行图标，但不能由静态截图断言其动画机制；当前项目用户已要求文字渐变时不再重复圈圈，仍以用户要求优先。
- **composer 与内容左缘对齐。** 圆角边框将输入区与正文分开；权限在底部左侧，模型/推理级别/语音/停止在底部右侧。该图 composer 很宽，属于截图窗口布局，不应直接照搬为本项目最大宽度。
- **设置向导为短对话框。** 渠道图中约 540 px 宽的居中弹窗，标题+简短说明+单个主要动作，内容按任务聚合。浅色身份截图中标签在输入框上方，头像与字段共一行。

以上是视觉观察，未通过静态图片推断键盘交互、权限验证、流式传输或自动保存行为。

## 文档补充（与图片观察分开）

- [Cherry Model Service Settings](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) 说明添加 Key、同步模型、启用厂商是不同操作；模型同步列表不是“已连接且可聊天”的充分证明。借鉴清晰状态，而非照搬所有配置功能。
- [Cherry Advanced Chat](https://www.cherryai.com/docs/en/advanced-basic/chat/) 区分日常聊天与执行型 Agent；多模型比较按需使用。本项目不应因参考图出现多选就伪装支持多模型并发。
- [OpenClaw Control UI](https://docs.openclaw.ai/web/control-ui) 说明加载/重连保留布局、慢加载在目标区域显示占位、错误原位重试。该行为来自文档，未由本轮截图交互实测。

## 可交付给实现方的具体设计建议

1. 对话、设置统一为中性色平面基底，保留一个主内容边界；删减重复的框中框、状态标题和解释层级。
2. 聊天正文与 composer 共用宽度基准。大窗口限制舒适阅读宽度；有成果侧栏时收缩，窄屏保持正常内边距，不照搬参考图的物理像素宽度。
3. 工具/执行状态默认紧凑行，详情按需展开；运行中使用已授权的文字渐变，错误与需审批状态才提升视觉权重。
4. 模型设置继续采用厂商列表+详情；字段标题、状态、操作与目录各有固定位置，普通帮助文字降为辅助色。凭据输入专注一项操作，避免长说明挤压输入区。
5. 模型选择器保留搜索、厂商归属、选中态、滚动上限与设置入口。只显示真实能力数据，不从品牌名推断能力；不要为匹配截图新增未实现按钮。
6. 组件尺寸、hover/focus/disabled、键盘关闭、焦点返回由本地浏览器验收确认；以上截图只负责视觉依据。

## 图片完整性

| 文件 | SHA-256 |
| --- | --- |
| cherry-api-key-dialog.webp | `84B3D4A4B6D1AF3614F9914E03050CE2D28AF3C23801F12769E2A45E3DC3FA0A` |
| cherry-model-picker.webp | `6AF4623DBAABE8F3D739DC0EC8B9BD595542C1E92A13FEDDE0A3B82B599B06C8` |
| cherry-chat-readme.png | `A687554F037C0F132E3F50B2E8C9BA4BA86E9315C33F9F013AF3BE4A7EA1D5ED` |
| cherry-miniapps-readme.png | `0F4EBBE19483518192B38DDCECA4EC9C63D18BBDA66202AC236B5CCFE7E3054E` |
| openclaw-working-chat.png | `73BD5205ADEB0D38A010B931D3EDA0A0714976D3B212F8194BEA5A2C532F00E0` |
| openclaw-channel-wizard.png | `96DEA58154A4A61F5A72BA5870D590D37CA9D5848CF7AF004FE6EE5FBCEA1AF7` |
| openclaw-avatar-settings.png | `E78BE9F61311E13F15AE9C2930DD28BCEE5322EFBFDF72701CE0408F9F582150` |
