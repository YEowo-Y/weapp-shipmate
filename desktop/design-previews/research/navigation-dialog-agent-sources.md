# 导航、弹窗与恢复状态：OpenClaw / Cherry Studio 参照

检索日期：2026-10-18。方法：复用并实际 `view_image` 查看 3 张原图，新增读取 2 个 OpenClaw 官方文档页，无新增图片、无登录、无共享浏览器操作、无产品代码修改。

## 像素证据与版本范围

| 本轮实际复看的原图 | 来源与版本界限 | 可观察内容 |
| --- | --- | --- |
| [OpenClaw 聊天导航](assets/product-alignment/openclaw-working-chat.png) | [上游固定 SHA 截图](https://github.com/openclaw/openclaw/blob/89207ad525fc581f59eaa6ed8c999474cb78b376/.github/pr-proof/working-claw-centering/after-full.png)，开发验收资料，非稳定版发布证明 | 功能入口在会话组上方；当前会话整行浅灰高亮；账户区域位于底部；图标和文字共同表达目的地。 |
| [Cherry 模型选择浮层](assets/product-alignment/cherry-model-picker.webp) | [官方 Advanced Chat](https://www.cherryai.com/docs/en/advanced-basic/chat/) 中的[原图](https://www.cherryai.com/docs/content-assets/6af4623dbaabe8f3d739dc0e.webp)，截图无应用版本号 | 窄图标轨道与会话列表分离；图标轨道底部保留帮助/设置；浮层锚定模型触发器，搜索置顶、滚动列表居中、配置入口置底；背景没有模态遮罩。 |
| [Cherry API Key 模态框](assets/product-alignment/cherry-api-key-dialog.webp) | [官方 Model Service Settings](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) 中的[原图](https://www.cherryai.com/docs/content-assets/84b3d4a4b6d1af3614f9914e.webp)，截图无应用版本号 | 中央单任务弹窗，单层灰色背景遮罩、独立右上关闭、紧邻字段的帮助链接、底部主次操作；与上面的选择浮层有明确视觉区分。 |

**重要版本差异：** 当前 OpenClaw 文档描述 Pages / Sessions / Users 图标轨道，已不同于上述开发截图的单列导航。不能把旧图宣称为当前最新导航，也不能混合两个版本称为逐像素复刻。Cherry 截图也未提供构建号。实际空态或连接错误页面没有本轮像素证据，相关建议仅由文档和设计推导支持。

## 官方文档行为证据（与图片分开）

- [Sessions and sidebar](https://docs.openclaw.ai/web/control-ui/sessions-and-sidebar)：主入口与选择列表分离；窄屏使用抽屉。筛选为空时保留当前范围；菜单 Escape 逐层关闭并返回触发器。输入法组合输入期间，命令面板不抢 Enter、Escape 和方向键。页面为滚动更新文档，未固定到发布版本。
- [Offline and reconnect](https://docs.openclaw.ai/web/control-ui/offline-and-reconnect)：网络中断与认证拒绝采用不同恢复路径；已展示内容和草稿在恢复期间保留。重连不重放任意写操作；发送未获确认与明确拒绝分开表达。此处只确认文档描述，未运行 OpenClaw 验证。

上述文档足以支撑本轮行为方向，因此未额外抓取上游源码或安装参考应用。图像来源与完整性记录沿用 [已有归档说明](product-alignment-agent-sources.md)。

## 四条可迁移建议

1. **导航位置稳定，选择状态明确。** 功能入口与会话/文件列表分区，当前目的地显示文字与选中态。收起侧栏仍保留明确的打开入口；移动端用完整抽屉，不让半截导航压住正文。只整理现有功能，不照搬上游多用户/多 Agent 模块。
2. **区分选择浮层与任务弹窗。** 快速选择紧贴触发器、限制列表高度；需要填写或确认的任务使用单层模态框。统一关闭入口、逐层 Escape、焦点返回，并验收中文输入法不被快捷键打断。焦点行为需要本地测试，不能由静态图证明。
3. **空态区分原因并保留上下文。** “还没有数据”“筛选无匹配”“仍在加载”“读取失败”分别表达；保留搜索词、当前范围和已有内容，提供对应的新增、清除筛选或重试入口。不要把短暂网络失败渲染成空列表。
4. **恢复动作与错误类型对应。** 网络问题显示恢复状态并允许适当重试；凭据问题引导修复连接。保留输入草稿和部分输出，明确展示结果是否完整；对交付状态不明的请求避免自动再次发送，重试结果不能造成重复记录。

本报告是外部研究交付；具体 DOM、状态模型、参数契约及可访问性验证由实现方结合现有代码完成，不建议为参考样式新增依赖或重复协议。
