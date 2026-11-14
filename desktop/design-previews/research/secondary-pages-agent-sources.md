# 次级功能页面参照：Cherry Studio / OpenClaw

研究日期：2026-10-18。范围为知识库/文件、结果详情、首次引导；不继续模型设置。仅研究公开来源，未登录或操作共享浏览器，未更改实现。

## 实际图片证据

本轮新增两张官方原图，均下载后用 `view_image` 实际检查；另复看一张已有 OpenClaw 归档。两次猜测路径不可访问，随后使用上一轮已获取官方页面中的真实链接，最终新增有效文档页面共两页。没有把访问失败页面作为证据。

| 图片 | 官方来源 | 版本界限 |
| --- | --- | --- |
| [知识库文件列表](assets/secondary-pages-agent/cherry-knowledge-items.webp) | [Getting Started with Knowledge Bases](https://www.cherryai.com/docs/en/knowledge-base/knowledge-base/)；[原图](https://www.cherryai.com/docs/content-assets/f0f24638e6d9723697075396.webp) | 当前官方文档配图，无应用版本号，不能断言是最新安装包截图。 |
| [添加数据源菜单](assets/secondary-pages-agent/cherry-add-data-source.webp) | 同一官方知识库文档；[原图](https://www.cherryai.com/docs/content-assets/2530ba0ece30b969d2e891cd.webp) | 同上；覆盖展开菜单的静态状态，未实测菜单键盘行为。 |
| [OpenClaw 渠道配置向导，已有归档](assets/product-alignment/openclaw-channel-wizard.png) | [官方仓库固定 SHA 原图](https://github.com/openclaw/openclaw/blob/89207ad525fc581f59eaa6ed8c999474cb78b376/.github/pr-proof/plaintext-channel-wizard/after.png) | 上游开发验收截图，非稳定版发布证明；背景模糊，不作为完整设置页面证据。 |

## 可观察布局（只来自像素）

**Cherry 知识库：** 左侧知识库列表、右侧文件区域共用平面浅色底，细线分区。主区顶部名称与召回测试/配置图标为一行；更新时间与添加数据源另成较弱工具行。文件表的选择框、图标、Name、Type、Status、Updated 各列对齐，行间空白取代独立卡片。长文件名单行截断，状态以小勾和浅绿文字表达。添加菜单锚定触发按钮，只有 File、Note、Folder、URL 四个单行项目。

**OpenClaw 配置向导：** 约 540 px 宽的居中暗色弹窗；标题、辅助说明、当前配置对象、短描述依次排列。文档链接紧邻说明，唯一主要动作 Continue 位于右下。圆角和阴影只强调当前弹窗，背景被统一弱化。不能从图中推断后续步骤、保存机制或权限验证。

## 文档描述的行为（不冒充交互验收）

- [Cherry 知识库文档](https://www.cherryai.com/docs/en/knowledge-base/knowledge-base/) 将创建、添加材料、处理完成、抽查内容、召回测试和用于聊天区分为不同阶段。Ready 表示材料处理完成，并不能单独证明检索质量。这里借鉴状态表达，不要求当前项目增建向量检索功能。
- [Cherry Artifacts, Citations, and Export](https://www.cherryai.com/docs/en/advanced-basic/chat/artifacts-export/) 描述点击消息成果或文件面板项目，在右侧预览，检查内容与来源后再下载、复制或继续处理。本页图片是流程图，并非成果详情真实界面，因此本轮未把它下载或当作布局证据。

## 给实现方的四条建议

1. **记忆、文件、历史列表使用一致的紧凑行结构。** 标题/搜索/主要操作在上方，名称占弹性宽度，类型、状态、更新时间保持稳定位置。小屏按现有能力隐藏次要列或换行；不要为每条记录增加重复卡片边框。
2. **把“当前结果”与“下一步操作”分层。** 结果详情的名称、状态和来源靠近正文；复制/下载/继续处理集中在稳定工具栏。仅在用户打开结果时显示详情区域，不用永久空侧栏占据内容空间。
3. **首次引导一次聚焦一件事。** 标题、必要输入或当前选择、短帮助、一个明确主动作；其余说明折叠或链接呈现。保留真实的上一步/返回能力，不能仅为了视觉简洁移除已存在路径。
4. **状态使用文字与轻量图标，不依赖整卡染色。** 运行、已完成、失败、需处理各自说明下一步；局部失败原位给出恢复操作。完成文案只对应真实执行结果，不把生成成功或导入完成写成验收通过。

这些是可迁移的设计建议，不是上游 API 或本项目现状审查。实现与桌面/移动端、键盘、焦点、空态/错误态验收由主任务完成。研究图片仅作为来源存档，不嵌入产品界面。
