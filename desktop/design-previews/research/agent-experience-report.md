# Agent 对话体验：实施与验证

日期：2026-10-17。承接 [本轮计划](agent-experience-plan.md) 和 [官方资料记录](agent-experience-sources.md)。本轮交付范围为共享设计预览的正文、输入区与操作反馈；依据用户此前明确选择，完成代码与自动化验证。真实浏览器验收仍为 BLOCKED。

## 修改内容与简化

| 文件 | 结果 |
| --- | --- |
| `components/message-markdown.js`、`components/message.js` | 用固定版本 markdown-it 解析助手正文；用户输入保留原文。标题、列表、引用、表格、代码和链接统一渲染。复用稳定节点；原始 HTML 保持文字，远程图片不自动加载。 |
| `components/vendor/markdown-it/` | 官方浏览器 ESM、source map、MIT 许可证、第三方许可和版本/哈希记录。没有 npm 安装，没有升级 React/Vite 或引入第二套消息协议。 |
| `components/message.css` | 正文 15px/1.75、分级标题与段落节奏；代码及表格独立滚动；代码复制按钮、可见焦点、小屏尺寸与错误反馈。继续复用中性色、系统字体和现有主题变量。 |
| `conversation.js` | 状态更新复用正文子树，保留代码/表格滚动、焦点与已有输出；阅读代码时暂停跟随，回到最新可恢复。消息和代码分别复制源文本；按钮显示复制中/成功/失败，失败可重试。会话切换和销毁阻止迟到回调更新新视图。默认演示输出加入标题、列表与明确下一步。 |
| `components/composer.css`、`app.css` | 窄栏模型名称保持可见并省略过长文字；主要触屏按钮 44px。删除全局消息入场动画，工具或终态更新不再使整条回复重新淡入；保留执行文字 shimmer 与减少动效策略。 |
| `components/showcase.js` | 在现有组件演示里加入真实走共享渲染器的 Markdown 表格、代码和引用；明确标注固定示例。 |
| `_serve.mjs` | 补齐 `.mjs` 的 JavaScript MIME，避免浏览器拒绝官方 ESM 资源。 |
| `tests/message-markdown.test.mjs`、`tests/markdown-assets.test.mjs`、`tests/composer-surface.test.mjs` | 解析/安全/逐字符流式一致性、上游资源完整性与许可、窄栏/动效契约。 |
| `tests/conversation-continuity.test.mjs`、`tests/stream-presentation.test.mjs`、`tests/helpers/preview-dom.mjs` | 覆盖复制失败重试、并发点击、切换会话、代码空白保留、终态/审批变更后的滚动与焦点；升级 DOM 替身以测试结构化正文。 |

简化点：删除窄屏隐藏唯一模型标签的规则和消息全局 rise；替换仅按空行分段的助手输出；两页对话及组件页共用一套解析和交互，没有新增页面专用实现。工具结果、审批和完成仍来自事件/状态，不从自然语言中推断。

## 自检与证据

| 维度 | 本轮处理及证据边界 |
| --- | --- |
| 排版、留白 | 标题、段落、列表、引用、代码、表格有明确语义和间距；样式解析通过。实际阅读密度需浏览器核对。 |
| 视觉层级、色彩 | 正文/说明/工具记录维持原有层级；新增块使用已有主题变量，无额外品牌色。未重新测量实际渲染对比度。 |
| 动效 | 移除消息整体重播，保留执行文字渐变及 reduced-motion；源码契约通过，未作帧率或实际动画验收。 |
| 微交互 | 复制控件就地反馈；失败可重试，迟到回调隔离；保留代码阅读位置、焦点与停止内容。对应行为测试通过。 |
| 响应式 | 窄栏保留模型名，长代码/密集表格局部滚动，小屏代码复制触控尺寸44px；CSS契约通过，未宣称320/768/1440px视觉通过。 |
| 原创性 | 沿用上线船友的规则依据、预检与差异审阅路径；借鉴成熟交互约定，不复制品牌标识或虚构能力。 |

验证前复制回归复现四项失败；修复后通过。模型标签/动效源码契约先三项失败后通过。Markdown 定向覆盖 raw HTML、恶意协议、实体混淆 URL、含凭据地址、图片、未闭合围栏、代码尾部空行、紧凑嵌套列表及逐字符输入的最终一致性。

| 检查 | 结果 |
| --- | --- |
| `npm test` | **360/360 通过**，0失败/跳过；基线339，本轮新增21。日志 `.omx/agent-experience-tests.log`。 |
| `npm run lint` | 通过。 |
| `npx eslint --no-ignore desktop/design-previews/conversation.js desktop/design-previews/components/message.js desktop/design-previews/components/message-markdown.js desktop/design-previews/components/showcase.js desktop/design-previews/_serve.mjs` | 通过；根 lint 忽略 desktop，故另行检查。 |
| `desktop/` 下 `npm run build` | TypeScript + Vite通过，7模块；只验证正式桌面入口，不代表预览迁入了Tauri。 |
| HTML/CSS/ESM/资源检查 | 16页、36个脚本、24份样式、171个本地引用通过；37条HTTP路径200，`.mjs` MIME正确。临时检查脚本 `.omx/agent-experience-static-check.mjs`。 |
| 上游资源完整性 | 官方bundle、map和LICENSE三份SHA-256一致；bundle所含五项依赖均有许可证声明。 |
| 长消息实验 | 22,440字符分100次更新，Node解析+DOM替身协调中位2.77ms，p95 5.81ms，最大7.18ms。仅本机单次样本，不代表浏览器布局、绘制或帧率。 |
| 差异检查 | 范围内 `git diff --check` 通过。 |

主代理完成源码复核与自动化整合。独立复核代理因账户额度失败，未将其计为审核通过；文档代理因所配置模型不可用失败，官方包和许可证核对由主代理完成。没有用失败代理作为阻塞理由，也没有伪造独立批准。

## 尚未验证与边界

- `DQ-05 / UI-VERIFY-001`：真实浏览器被 Work 设置禁用，用户已选择本轮代码与自动化验证；未绕过限制。浏览器恢复后仍需核对深浅色、窄栏/小屏、复制权限、焦点/选择区、滚动锚定与动效。当前不声明视觉完美或发布就绪。
- 仍为本地固定演示，无真实模型连接、密钥保存、实际文件修改或后台执行；未部署、未提交。未迁移正式桌面主入口。
- Markdown 支持边界见来源记录；不支持数学、Mermaid、任务复选框和语法高亮。链接仅允许显式HTTP/HTTPS，内部文件引用仍走既有独立成果/差异组件。
- DOM替身能验证节点身份、文本、事件和状态，不能替代浏览器布局、原生选区及屏幕阅读器验证。
- `DQ-00/01/02/04/06/07` 本轮范围已有计划、版本来源、静态检查、行为回归、输入边界和性能样本；独立审核与真实 Dogfood 仍有上述限制，无发布操作。

## 启动与预览

仓库根执行 `node desktop/design-previews/_serve.mjs`。当前服务已启动；没有必要环境变量或API Key。

- [组件演示（含表格与代码）](http://127.0.0.1:5501/component-showcase.html)
- [完整对话](http://127.0.0.1:5501/chat-full.html)
- [主工作台](http://127.0.0.1:5501/main-four-region.html)
