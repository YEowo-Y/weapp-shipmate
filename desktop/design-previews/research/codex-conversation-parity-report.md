# 对话体验对齐：本轮交付记录

2026-10-17。实施范围为 `desktop/design-previews`，参照用户真实 Codex 截图与官方交互说明。计划见 [codex-conversation-parity-plan.md](codex-conversation-parity-plan.md)，实际来源和证据边界见 [codex-conversation-parity-sources.md](codex-conversation-parity-sources.md)。本轮没有升级依赖、提交或部署。

## 实际改动

| 文件 | 结果 |
| --- | --- |
| `components/message.js` | 用户消息展示发送时的引用路径快照，使用字面文本、去重与类型过滤，不生成可执行 HTML 或假文件链接；标明示例路径未读取。运行中消息与工具只显示文字，不再创建 spinner SVG。 |
| `components/message.css` | 正文16px、开放式助手回复；重复身份标签只供辅助技术读取；用户气泡与引用独立分层；旧消息操作在悬停/焦点时出现，最新消息始终显示；触摸目标44px。保留运行文字渐变及 reduced-motion / forced-colors 静态回退。 |
| `components/composer.js`、`components/composer.css` | 原先仅读屏可见的发送提示改为可见，idle/edit/busy 对应文案；窄输入区工具栏换行，触摸移除引用/取消编辑等目标44px；强制颜色模式焦点和发送按钮可识别。 |
| `conversation.css` | 正文和输入区共享768px最大宽度及间距变量；移动正文保持16px；回到最新为带名称的圆形图标按钮，保留键盘焦点和触摸目标；底部安全区留白。 |
| `conversation.js` | 保存恢复滚动位置、跟随状态、展开详情及内部滚动；生成中 Enter 明确反馈未发送、保留草稿；编辑保存原草稿上下文；发送与重新执行使用正确来源的引用快照。 |
| `chat.js` | 按会话保存阅读状态和编辑上下文，避免消耗原草稿的故障演示场景；切换/新建先完成侧栏布局与输入高度计算，再恢复阅读位置，焦点不滚动。 |
| `tests/conversation-continuity.test.mjs`、`tests/chat-sessions.test.mjs`、`tests/stream-presentation.test.mjs` | 新增13项回归，覆盖阅读恢复、详情内部滚动、生成中 Enter、草稿/引用/场景归属、发送引用安全渲染和纯文字运行状态。 |

简化：移除重复的运行 spinner 与动画规则，复用既有消息、菜单和草稿状态，不另造组件系统、队列协议或模型执行状态。

## 验证

- 新增行为测试先失败后通过。`npm test` **406/406通过，0失败、0跳过**（基线393）。完整日志：`.omx/codex-conversation-tests.log`。
- 根 `npm run lint` 通过；由于根配置忽略 desktop，另对本轮预览 JS 和测试执行 `npx eslint --no-ignore ...`，通过。
- `desktop` 中 `npm run build` 通过 TypeScript 与 Vite。该命令检查正式桌面入口，不能证明预览已经迁入 Tauri。
- 预览静态校验通过：16 HTML、41脚本语法、24样式表、179本地引用；37条既有HTTP路径返回200，JS MIME正确。
- 独立复核发现“恢复阅读后，长草稿/侧栏再次改变布局”的顺序错误；调整为先更新布局再恢复，并新增两项模拟尺寸变化的回归，修复前失败、修复后通过。
- 增量复核没有发现新的明确阻断代码问题；其提示的 busy Enter 反馈原先仅在隐藏的 live region 中，现同时显示在输入区提示中。增强回归先失败后通过；最后一次全量406项与显式Lint均在该修复后通过。
- `git diff --check` 通过。未覆盖或撤销仓库之前未提交的改动。

质量范围：本次为中等风险的共享前端交互改动。验证命令从根/desktop的package scripts、已有预览测试及静态脚本解析；关键路径为发送/停止、编辑/取消、引用/重试、会话切换/阅读恢复。没有新增覆盖率阈值，也不将合成DOM覆盖率等同于浏览器覆盖。行为、静态分析与编译门禁PASS；真实浏览器Dogfood/视觉门禁依WF-09为BLOCKED，替代证据是实际渲染/控制函数的DOM模型测试、CSS解析和本地HTTP校验。没有涉及生产数据、外部副作用或发布操作。

## 启动与未实现部分

从仓库根目录执行 `node desktop/design-previews/_serve.mjs`，访问 [完整对话](http://127.0.0.1:5501/chat-full.html) 或 [工作台](http://127.0.0.1:5501/main-four-region.html)。本轮无新增环境变量或 API Key。当前预览服务可用。

消息、执行计划和结果仍为明确标记的本地演示；没有真实模型接入、真实文件读取/上传、服务端权限与审批、跨刷新持久化，也没有真实 steering / 队列。已发送引用只是当时路径的不可变快照。

依用户此前选择，本轮完成代码和自动化验证，未操控本地浏览器。视觉门禁 **BLOCKED**，不评分、不宣称与产品像素完全一致。待实测：320/768/1440宽度及矮窗口、深浅主题、键盘/触摸、减少动态效果/强制颜色、长代码与多条引用、弹层焦点、系统IME/软键盘。状态记录：`.omx/state/codex-conversation-parity/ralph-progress.json`。本轮不声明生产发布就绪。
