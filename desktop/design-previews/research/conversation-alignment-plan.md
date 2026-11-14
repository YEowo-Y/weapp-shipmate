# 整体对话工作区对齐计划

日期：2026-10-13。范围：chat-full、main-four-region、共享组件展示页及它们复用的消息、审阅和原生弹层。保留当前 vanilla JS / CSS、事件协议和本地演示边界，不引入依赖。

## 基线与来源

- 修改前定向回归：chat-menus、conversation、component-presentation 共 23 项通过。
- 浏览器基线：`.omx/state/conversation-alignment/before-chat-dark.png`。
- 用户提供的当前 Codex 输入框截图：本轮输入框几何与菜单基准。
- OpenAI 官方文章：https://developers.openai.com/blog/run-long-horizon-tasks-with-codex 。真实产品图片：https://developers.openai.com/images/blog/long-horizon-4.jpeg 。已通过浏览器观察，浅色窄侧栏、正文留白、轻量标题与底部输入区。
- Claude 官方文章：https://claude.com/resources/articles/cowork-web-mobile 。真实产品图：https://assets.claude.com/929878fd0530236a3b94dcc763b357e199e23d9b.png 。已通过浏览器观察，浅色中性表面、圆角输入区、细分隔线、简短任务列表与明确审批按钮。
- 图片是特定发布版本的参考；不声称取得私有前端源码或精确设计 token。

## 修改顺序

1. 统一三个 Agent 页面中性表面、文字和边框 token；收紧外框和顶部任务标题，使正文与输入框成为视觉主体。
2. 在现有 message 组件内调整正文、工具折叠记录、结构化结果、审批卡和操作按钮；保留 data-action、焦点与展开状态。
3. 统一现有 review 及原生 dialog / popover 的字号、按钮、间距；不复制第三方商标或伪装未接入能力。
4. 实际浏览器复查深浅主题、桌面与窄屏、添加菜单、发送/停止、工具展开、文件弹窗和审批焦点；截图驱动下一轮修正。
5. 运行全量测试、适用 lint、CSS 解析与独立审查，记录剩余限制。

## 验收

- 输入框、消息、侧栏、成果和弹窗共享一致视觉层级。
- 不改变工具执行与审批业务语义；本地演示持续可辨认。
- 视口无横向溢出，输入框可用；键盘操作、Esc 关闭与焦点恢复保留。
- 状态由现有控制器驱动；无新增模型、联网查询或文件写入假象。
