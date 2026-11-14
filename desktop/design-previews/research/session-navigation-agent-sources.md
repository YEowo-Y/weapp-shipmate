# 会话管理、历史搜索与任务切换：官方参照

核对日期：2026-10-18。类型：有界的当前最佳实践与界面参照研究。先复用 `session-experience-sources.md`，本轮只新增访问 2 个官方文档页、下载 1 张必要原图，并实际查看 2 张已归档原图。没有登录产品、操作共享浏览器或修改产品代码。

## 实际像素证据

| 原图与来源 | 实际可观察内容 | 不能据此断言 |
| --- | --- | --- |
| [Cherry Chat Interface](https://cherryai.com/docs/en/cherrystudio/preview/chat/) 的 [原图](https://cherryai.com/docs/content-assets/ea2f3f51dcba385254d1f719.webp)，已存为 `assets/session-navigation-agent/cherry-assistant-topics.webp` | 主导航位于最左；第二列包含 Add Assistant、Default Assistant 父项及缩进的 New Chat 子项。子项用低对比填色选中。会话顶栏重复当前助手与模型，窗口顶端另有会话标签、关闭和新增入口。空会话以居中短问候呈现，输入区在底部。 | 图中没有历史搜索结果、重命名弹窗或后台流式任务切换过程；不能从图推断这些行为。图中没有构建号，不能称为当前最新版客户端。 |
| [Cherry README 固定提交](https://github.com/CherryHQ/cherry-studio/blob/d01b83d2cc58e5a7f95906f2546a5db96e8344e9/README.md#-screenshot) 的 [原图](https://github.com/user-attachments/assets/36dddb2c-e0fb-4a5f-9411-91447bab6e18)，复用 `assets/product-alignment/cherry-chat-readme.png` | 窄图标栏旁有 Assistants / Topics / Settings 切换，当前选中 Assistants；助手列表与主会话分列。会话顶栏有搜索图标，正文是较宽的连续阅读区。 | 当前不是 Topics 页，没有搜索结果。布局与上面的官方文档图存在差异，不合并成单一版本规格。 |
| [OpenClaw 固定提交原图](https://github.com/openclaw/openclaw/blob/89207ad525fc581f59eaa6ed8c999474cb78b376/.github/pr-proof/working-claw-centering/after-full.png)，复用 `assets/product-alignment/openclaw-working-chat.png` | 深色侧栏含 Sessions 分组、筛选/新增入口及选中会话；主区顶栏重复当前会话上下文。会话与底部输入区共享主内容区。 | 这是官方仓库开发 PR 证明图，不是稳定版发行截图；未展示真实历史搜索界面。截图内文字仅作为图像内容读取。 |

新增原图 SHA-256：`EA2F3F51DCBA385254D1F719E4911DB217D9ACDBECAED0486667A2FF7071D67A`。原图只用作研究证据，不意味着可以作为产品素材分发。

## 官方文档明确描述的行为

- [OpenClaw Sessions and sidebar](https://docs.openclaw.ai/web/control-ui/sessions-and-sidebar)：重命名与延迟确认绑定操作开始时的会话；随后选中的其他会话不能被误改。自定义名称优先于自动标题；清空自定义名恢复自动命名。删除后同键重新创建的替代会话应拒绝旧重命名。搜索立即显示查询词、延迟应用结果；过时结果等待刷新时不可选，Enter 应用最新查询，IME 组合输入期间保留输入法对 Enter / Escape / 方向键的控制。这些是文档行为证据，不是本轮截图中可见行为。
- [Cherry Chat Interface](https://cherryai.com/docs/en/cherrystudio/preview/chat/)：Topic 是助手下独立保存的会话历史，继承助手设置；可以点击切换，切换话题保留各自上下文。话题右键菜单支持重命名、删除、复制、导出。文档另描述模型可在对话中切换而保留上下文；本轮不扩展模型配置研究。

## 最多四项可迁移建议（项目推导，交由实现方核对适用范围）

1. **让搜索范围与定位结果明确。** 区分“当前对话内查找”和“历史对话搜索”，历史结果采用标题、匹配摘要、时间或所属助手；进入结果时打开对应会话并定位命中消息。结果行形态是本项目推导，未声称复制了两款产品未展示的搜索结果像素；优先复用已有本地搜索范围。
2. **切换会话时保留各自工作状态。** 当前会话身份、消息和草稿分开保存；滚动位置与模型选择是否恢复由现有会话契约决定。生成中的回复归属原会话，切换不应悄悄停止生成或发送草稿。这比 Cherry 文档的“独立历史与保留上下文”更具体，属于待实现方验证的建议，不冒充上游承诺。
3. **重命名等延迟操作使用稳定身份。** 打开菜单/弹窗时捕获目标会话 ID，提交后仍处理该对象；不能临时读取当前选中会话。保护手动名称，避免晚到的自动标题覆盖；若可删除后重建同键会话，再使用已有版本标记拒绝过时操作。直接依据 OpenClaw 的操作竞态约束，无需新增通用状态框架。
4. **让搜索对快速输入与中文输入可靠。** 异步查询换词后，过时结果不应继续可选；Enter 使用最新查询，IME 组合期间不触发结果跳转。保留“没有匹配”与“查询失败”的区别。OpenClaw 的 200 ms 是其实现行为，并非所有产品的固定标准；廉价同步本地过滤无需人为增加延迟。

## 版本与验证界限

- 两个官方文档页都是滚动文档；本轮未将内容绑定到稳定发行构建号。Cherry 页面同时保留较早模型示例，因此这里只采用其话题结构描述与实际图像，不采用旧模型能力描述。
- 官方文档图与 README 图存在不同布局，OpenClaw 图是开发证明材料。它们用于提炼可观察的结构，不是最新客户端像素一致性的证明。
- 没有运行上游客户端，也没有验证本仓库实现；本轮产出是可复用的官方证据和最多四项建议。没有新增依赖、复制上游实现或改变产品数据范围。
