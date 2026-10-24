# 其他功能页：ChatGPT / Claude 官方界面参照

- 调研类型：限定范围的真实产品视觉与官方使用指引研究。
- 查阅日期：2026-10-18；新增查阅 2 个官方页面、下载并查看 2 张官方图片，复用已归档图片。
- 范围：项目记忆、成果预览、初次引导、任务列表。仅研究资料；未修改产品代码、未登录账户、未操作共享浏览器。
- 证据区分：下文“直接观察”来自实际查看图片像素；“文档说明”来自官方正文；“应用建议”是对本项目的设计推导，不是已验证的参考产品行为。

## 官方来源与图片

### A. ChatGPT Projects

- [官方帮助页](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)。本次页面显示更新于 28 天前，不能据此确定各图片的拍摄日期或版本。
- 项目概览：[本地图](assets/secondary-pages-chat/chatgpt-project-overview.webp) · [原图 URL](https://images.ctfassets.net/j22is2dtoxu1/intercom-img-64ce53ad985cb2ce9e519dec/e98675d35f6171a2b4c763ec83b7ce7b/1377c26d-c319-4567-9c99-547ee9661ff3?fm=webp&q=80&w=1180)。1180 × 948，Q4 Planning 项目标题、文件数量入口、新对话输入、四行已有对话；外层彩色背景属于展示包装，不应搬入产品。
- 项目设置入口：[本地图](assets/secondary-pages-chat/chatgpt-project-settings-menu.webp) · [原图 URL](https://images.ctfassets.net/j22is2dtoxu1/intercom-img-dfd7518cb9b5ab4588cb814d/6ca9c53aec99d74eda875f16468276a2/Screenshot_2026-02-24_at_11.48.11%C3%A2__AM.png?fm=webp&q=80&w=1344)。1344 × 297，仅覆盖标题、新对话输入和展开的更多菜单；不是完整设置表单截图。文件名含 2026-02-24，不能据此证明目前所有账户仍相同。

### B. Claude 桌面工作区（复用归档）

- [官方文章：Claude Code desktop redesign](https://claude.com/resources/articles/claude-code-desktop-redesign)，发布于 2026-04-14。
- [官方嵌入视频](https://www.youtube-nocookie.com/embed/rWaQSQEm_aY) · [视频封面原图](https://i.ytimg.com/vi/rWaQSQEm_aY/maxresdefault.jpg) · [本地图](assets/product-alignment/claude-desktop-official-video-poster.jpg)。1280 × 720，官方视频封面中呈现桌面会话、Preview、diff、Terminal、Tasks 与 Plan 面板；是产品界面的官方展示图，不是本次登录实拍。
- 本轮重新查看像素，使用其中的成果面板及任务行作为结构参照。封面的装饰边框、吉祥物不属于借鉴范围。

### C. Claude 初次使用指引（文字证据）

- [Claude Academy：Getting started with Claude](https://academy.claude.com/tutorials/getting-started-with-claude)。本次查阅为 2026-10-18；页面未给出可用于锁定 UI 的版本号。
- 文档强调用普通语言描述任务、必要时附上上下文，再根据回复迭代；说明产出可能是文字、文件或旁侧打开的 artifact。
- 本轮没有取得该页面所对应的真实引导页面截图。因此下面的引导建议仅由官方使用流程推导，不声称还原 Claude 当前 onboarding。

## 四条可落地参照

| 用户路径 | 直接观察或官方说明 | 应用建议 |
| --- | --- | --- |
| 项目记忆与资料 | A 的项目概览把名称、资料数量、输入区和历史对话放在同一纵向结构中；设置入口位于右上更多菜单。官方正文将项目资料、指令和聊天上下文分别说明，并支持从资料列表预览文件。 | 项目页先说明当前项目和资料入口，再展示可检视的资料/指令。设置放标题工具区；显式区分用户维护的资料与系统记忆，避免把所有内容包装为不可解释的“AI 记忆”。 |
| 成果预览 | B 中 Preview 有独立标题栏、关闭图标和内部预览区域；与会话并列，另有 diff、Terminal 等命名区域。静态图不证明关闭、调整尺寸或切换的具体行为。 | 成果进入独立预览面板，保留会话上下文。标题区展示成果名与少量直接相关操作；若只有单一成果，不增加重复导航或统计卡片。 |
| 初次引导 | C 的官方教程从一个具体任务、必要上下文和后续迭代开始。没有本次可验证的真实引导 UI 图片。 | 首次入口围绕“开始一个任务”提供一个明确主操作和少量可点击示例；连接模型等必要前置项直接链接到对应设置。此为流程建议，不是照抄参考产品的引导布局。 |
| 任务与历史列表 | A 的历史记录用细分隔线，主标题与灰色摘要上下排列，日期右对齐。B 的 Tasks 面板在 Completed 下显示紧凑行：状态图标、任务名、小型类型标记，以及较弱的耗时信息。 | 用同一行层级展示名称、状态与必要时间；摘要和耗时降为次级文字。运行状态必须来自执行事件；不要因为参考图显示完成就伪造当前任务已完成。 |

## 证据限制与交付边界

- 官方图片是对应发布时点的公开展示，不保证等同 2026-10-18 所有账户、平台和灰度版本。
- 没有测量参考产品 DOM；不把图中相对比例写成官方字号、间距或断点规范。
- 未从静态图推断 hover、焦点顺序、键盘快捷键、动画、面板拖拽或错误恢复。这些应由实现方单独定义并进行浏览器验收。
- 本轮只完成资料下载、图片像素检查和来源记录；不包含产品实现或其自动化测试结论。
