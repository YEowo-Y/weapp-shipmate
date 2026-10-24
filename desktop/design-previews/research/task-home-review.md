# 任务主页与侧栏改造验收

日期：2026-10-20。基于上一轮主页信息架构评审实施，继续使用 Vanilla TypeScript / JavaScript、Vite、Tauri 2 及现有共享组件。本轮没有新增依赖、存储迁移或模型协议变更。

## 主页面与用户路径

- 左侧统一为新任务、搜索历史、真实会话列表和底部设置入口。删除工作台的八阶段示例导航、虚构项目元数据及没有执行作用的检查开关；原有设计示例仍可从“设计参考与示例”访问。
- 首页突出“项目预检”和“上线清单”。正式桌面点击后打开项目工具并聚焦相应配置，不自动运行检查或打开系统文件选择器。两项本机工具无需模型连接。
- 浏览器的上线清单入口复用现有参数弹窗、`runGuide` 和结构化结果组件。项目预检入口明确说明需在桌面端选择本地目录，不把浏览器示例包装成项目扫描。
- 对话输入区继续限制在 704px，宽屏侧栏约 224–228px，工具面板按需展开。浏览器审阅只在当前有效改动记录被点击后出现，窄屏用可关闭弹窗，关闭返回触发按钮。
- 切换会话继续使用原有存储、停止生成和草稿恢复；设置往返不另建一套会话数据。没有用静态示例填充新用户历史。

主要路径为：**新任务 → 选择项目预检或上线清单 → 配置并执行 → 阅读报告 → 按需加入会话继续讨论**。模型连接只在用户需要真实聊天时进入。官方后台备案、提审、发布仍由用户完成。

## 真实参考与采用边界

延续本会话已经查看的真实产品原图及官方资料：

| 依据 | 采用方式 |
| --- | --- |
| [Codex 社区截图](https://github.com/openai/codex/issues/23794) | 克制的导航和图标、独立设置入口、有界对话区域；图片为 2026 年 6 月社区记录，不称为当前版本的逐像素复刻 |
| [Claude 社区历史截图](https://github.com/anthropics/claude-code/issues/100949) | 会话标题、搜索与辅助操作分层；原帖报告为 2026-10-10 的 Claude Desktop 2.31226.0 |
| [Cherry Studio 官方模型设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) | 设置与聊天任务分离，使用明确服务商和模型入口；官方图片未注明版本 |
| [ChatGPT Projects](https://learn.chatgpt.com/docs/projects)、[Claude Projects](https://support.claude.com/en/articles/9517075-what-are-projects) | 参考围绕任务和上下文组织内容的原则；本轮没有宣称已实现项目文件集合或跨会话项目记忆 |

原图清单沿用 `.omx/artifacts/settings-history-detail/references/manifest.json`。侧栏保留哪些业务入口、主页展示什么，是结合本仓库真实能力作出的设计选择；不通过静态竞品截图推断其所有交互。

## 实际修改文件

| 文件 | 修改与简化 |
| --- | --- |
| `desktop/design-previews/session-workspace.js`、`session-workspace.css` | 增加可选侧栏布局，复用新建、搜索、重命名、会话切换和存储逻辑；列表节点按会话复用，避免流式更新重建正在聚焦的按钮 |
| `desktop/index.html`、`desktop/src/main.ts`、`styles.css` | 正式桌面任务主页、真实任务入口、单层侧栏、窄屏导航、贴底设置；移除重复布局 |
| `desktop/src/sessions.ts`、`shared.d.ts`、`tools-panel.ts` | 接入共享侧栏；项目工具支持指定入口焦点，按断点转换面板/弹窗并恢复可见焦点 |
| `desktop/design-previews/main-four-region.html`、`main.js`、`main.css` | 删除阶段栏、假开关与预置成功内容；加入任务主页、真实会话导航、按需审阅和浏览器能力提示 |
| `desktop/design-previews/ui.js`、`responsive.js` | 清单弹窗复用当前输入框；审阅经过现有身份校验后打开；导航选择与取消弹窗正确归还焦点 |
| `desktop/design-previews/navigation.js`、`preview.js` | 工作区菜单聚焦工作台、完整对话和设置；设计示例归入独立目录；工作台说明准确区分本机清单、桌面预检与演示聊天 |
| `tests/session-workspace.test.mjs`、`desktop-controls.test.mjs`、`desktop-tools-panel.test.mjs`、`desktop-sessions.test.mjs` | 覆盖侧栏切换、主页入口、工具焦点与断点切换 |
| `tests/workspace-sessions.test.mjs`、`stage-journey.test.mjs`、`local-guide-ui.test.mjs`、`responsive-surfaces.test.mjs` | 覆盖无预置消息、清单参数、当前审阅身份、移动导航与弹窗恢复 |
| `tests/product-navigation.test.mjs`、`command-navigation.test.mjs`、`preview-preferences.test.mjs` | 覆盖工作区入口收敛、命令导航与正确的能力标注 |
| `scripts/desktop-native-e2e.mjs` | 增加主页入口、独立草稿切换、历史弹窗打开时调整窗口后的焦点回归；适配共享侧栏 |
| `task-home-plan.md`、本文、`desktop/README.md` | 实施计划、运行路径和验收记录 |

## 验证结果

| 验证 | 结果 |
| --- | --- |
| `npm test` | **813 / 813 通过**，无失败、取消或跳过 |
| `npm run lint` 与修改的共享 JS/MJS 显式 ESLint | 通过 |
| `npm --prefix desktop run build` | TypeScript 与 Vite 构建通过 |
| `npm --prefix desktop run tauri -- build --debug --no-bundle` | 当前代码的原生调试应用构建通过 |
| `node scripts/desktop-native-e2e.mjs` | **21 / 21 通过** |
| 浏览器自动化与截图复查 | 通过下述工作台路径；本次检查未捕获 console warning/error |
| 独立代码复查 | 最终修改范围无新问题；另运行相关 27 项测试及 TypeScript 检查通过，属于总体验证的子集 |

浏览器实际操作覆盖：

1. 新任务为空主页，项目预检说明桌面端边界，取消后恢复入口焦点。
2. 提交个人主体、无敏感信息、有服务器域名参数，真实本机规则生成 **41 条**清单并展示结果。
3. 两个任务保存不同草稿，侧栏往返恢复各自草稿；刷新后清单消息、当前会话和草稿保留。
4. 窄屏历史搜索无结果后取消，焦点回到可见的搜索入口；选择会话或新建后折叠导航。
5. 设置与工作台往返恢复当前任务；390×844、390×500 导航可滚动，设置没有与历史列表重叠。
6. 明确标记的本地审批演示完成前后，审阅区均保持按需打开；宽屏侧栏与窄屏弹窗显示当前记录，关闭恢复“查看改动”焦点。
7. 浅色、深色、宽屏和窄屏主页截图复查。窄屏审批底部为 844.000061px，属于布局浮点精度，按 1px 容差完整位于 844px 视口内；无横向溢出。

原生测试运行真实 Tauri exe、WebView2、IPC、连接 broker 和提供方解析；上游是**明确标记的 Ollama 协议 fixture，不是真实 LLM 推理**。覆盖连接选模、增量流、停止、错误重试、搜索、重命名、刷新、进程重启及草稿恢复。未提交真实云模型请求。

## 视觉迭代与证据

- 修复前：`.omx/artifacts/task-home/before.jpg`。
- 工作台：同目录 `home-light.jpg`、`home-dark.jpg`、`home-narrow.jpg`。
- 任务与审阅：`preflight-boundary.jpg`、`guide-result.jpg`、`review-wide.jpg`、`review-narrow.jpg`。
- 实际发现并修复移动导航设置入口重叠：`nav-overlap.jpg` → `nav-narrow-fixed.jpg`；设置与列表使用一个滚动容器。
- 实际发现并修复正式桌面设置入口未贴底，以及历史弹窗跨断点关闭后焦点回到隐藏控件。工具弹窗不再错误保持导航展开。
- 原生最终证据：`.omx/artifacts/desktop-model-native/run-2026-10-20T13-04-58-630Z/`，`results.json` 含 21 条结果、尺寸与二进制 SHA-256；`empty-1280x850.png` 为正式桌面主页。
- 测试日志、浏览器行为记录：`.omx/artifacts/task-home/`。
- 视觉判定：`.omx/state/task-home/ralph-progress.json`，采用直接浏览器/原生截图比较，未运行 OMX runtime。

复查结论：本轮入口、侧栏、任务卡、报告和输入区的主次关系清楚；宽屏输入区没有随窗口无限扩张，窄屏功能可达；继续复用已有图标、字体和 reduced-motion 处理，没有增加装饰动效或旋转加载器。原生首页和浏览器预览保留必要能力差别。

## 启动与剩余边界

```powershell
# 仓库根目录，浏览器工作台
node desktop/design-previews/_serve.mjs
# http://127.0.0.1:5501/main-four-region.html

# 正式桌面
npm --prefix desktop run tauri dev
```

无需新增环境变量。真实聊天仍需用户连接模型。正式桌面报告只有点击“加入当前会话”后进入会话持久化，项目工具面板本身不是项目历史数据库。

本轮未验收云厂商真实账号、OAuth 授权、Windows 系统文件选择器或安装包分发。浏览器项目预检仍需转到桌面；审阅是明确标记的示例，不写入文件。保留既有 `chat-transport.js` 静态/动态混合导入的 Vite 分包提示，构建成功。浏览器验收留下明确命名的测试会话，未删除已有历史；测试结束恢复浅色主题及默认视口。
