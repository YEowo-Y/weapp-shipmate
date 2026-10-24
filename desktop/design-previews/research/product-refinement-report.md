# 第二轮真实页面对照优化与验收 — 2026-10-17

本轮继续修改 `desktop/design-previews` 的原生 HTML/CSS/ES Modules 界面，重点是对话、手机导航、模型设置和模型选择路径。没有新增依赖、改写后端协议、部署或提交。原有未提交改动保留。

## 参考与决策

重新逐张对照已归档的 ChatGPT 输入菜单、Claude 设置、Cherry Studio 模型设置/选择器、OpenClaw 工作中对话图，再与本项目桌面和手机截图比较。来源、原图及版本边界见 [ChatGPT / Claude 研究](product-alignment-chat-sources.md) 和 [Cherry Studio / OpenClaw 研究](product-alignment-agent-sources.md)。本轮也重新查阅 [Cherry 模型设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)、[Cherry 聊天](https://www.cherryai.com/docs/en/advanced-basic/chat/)、[Claude 公开设置介绍](https://www.anthropic.com/news/reflect-with-claude) 和 [ChatGPT 截图工具说明](https://help.openai.com/en/articles/9295245-chatgpt-macos-app-screenshot-tool)。

公开图片用于确认布局与视觉层级；键盘、焦点、取消和状态行为由本项目浏览器实测确认。没有声称登录第三方账户，也没有将旧 README、宣传图或开发分支图称为当前稳定版的像素标准。

## 实际修改

| 范围 | 文件（相对 desktop/design-previews） | 结果 |
| --- | --- | --- |
| 手机会话导航 | `responsive.js`、`responsive.css`、`conversation.css` | 复用原导航节点，将入口并入既有会话顶栏，删除重复标题行；桌面恢复原侧栏。展开内容紧凑且可独立滚动，Esc、点击外部、切换/新建会话的行为完整。 |
| 审阅入口 | 同上 | 从覆盖正文的浮动提示改为输入区上方的正常布局；删除旧底部占位和跳转按钮额外偏移。 |
| 模型设置 | `settings.js`、`settings.css` | 标题→能力说明→连接按钮→次级地址/说明，连接按钮在 1440px 页面位于 y≈354px；手机长地址换行。密钥弹窗标题精简为“厂商 密钥”，字段仍为 API Key。 |
| 模型选择器 | `ui.js`、`ui.css` | 按服务商分组，复用既有厂商图标，增加选中勾选；不同显示名保留 ID，同名模型的读屏名称也包含 ID。长名称/ID各限两行，完整内容保留在 title 和可访问名称。 |
| 搜索与状态 | 同上 | 区分未连接、连接中、空目录、连接失败、请求失败和部分目录；无匹配时优先提供清除搜索。正常匹配时去掉重复清除按钮；保持请求取消、键盘导航和生成中禁止切换。 |
| 结果阅读层级 | `components/message.css` | 实际建议恢复正文颜色、字号与行高，删除装饰性左边线；仍保留“供你判断”和演示边界说明。 |

回归测试：`tests/live-model-picker.test.mjs`、`tests/model-settings.test.mjs`、`tests/responsive-surfaces.test.mjs`。行为改动使用先失败后通过的测试；纯布局通过实际截图和几何测量验证。实施前计划见 [product-refinement-plan.md](product-refinement-plan.md)。

简化来自删除重复标题、覆盖式提示、重复空白、重复搜索操作，复用原生 details/dialog、既有图标和样式变量；未叠加新的组件框架。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 653 / 653，通过；0 失败、0 跳过。基线为640。日志 `.omx/product-refinement-tests.log`。 |
| `npm run lint` | 通过。 |
| 预览脚本显式 ESLint | `ui.js`、`settings.js` 通过；`responsive.js` 使用浏览器 globals 单独检查通过。首次将 globals 与已有声明混合执行产生 no-redeclare，拆分正确执行环境后通过。 |
| `npm --prefix desktop run build` | TypeScript / Vite 构建通过。该构建属于独立的 desktop 主应用，不代替预览页面浏览器验收。 |
| 静态引用检查 | 16 HTML、48 JS、24 CSS、205 本地引用；38 本机 HTTP 路由返回200。 |
| 独立代码审阅 | 同名模型无障碍名称与手机 portal 焦点问题已修复，最终无未解决中等/阻断问题。 |
| 独立截图复验 | 修正窄屏弹窗标题、长模型行和重复清除操作后通过；这是人工视觉评审，不是像素一致性分数。 |
| 浏览器控制台 | 本轮最终检查未捕获 error / warn。 |

浏览器采用 CUA 实际操作本机页面，非静态推断。覆盖：

- 对话 320×500、390×844、768×900、1024×768、1440×900；均无横向页面溢出，320×500 下输入框底部约492px，仍在视口内。保留桌面最大704px输入宽度。
- 设置 320px 长地址与密钥弹窗、320×500 短屏、768/1024/1440桌面断点及深浅主题。
- 手机导航展开、Esc返回、切换、新建、会话更多→重命名→取消；最后一路曾复现焦点落到body，修复后返回原会话操作按钮。工作台共享导航也检查了320×500。
- 审阅面板打开、Esc关闭和焦点返回；正常布局的审阅入口不覆盖聊天正文。
- 隔离模拟服务连接 Anthropic/Google 的72个模型，按厂商/ID搜索、跨组方向键、选择、重新打开的选中标记、无匹配清空；320×500长名称列表。
- 模拟服务返回空目录、认证失败时的设置和模型选择提示；没有把这些状态错误地写成“未连接”。部分目录与请求失败重试由回归测试覆盖，本轮未额外做浏览器故障注入。
- 手机本地演示流式输出：运行时文字使用 `message-text-shimmer`，停止按钮可用；停止保留部分内容，重新运行可完成并显示审阅入口。未改变既有流协议。

证据位于 `.omx/artifacts/product-refinement/`：`browser-acceptance.json`、手机前后对比、桌面/手机/短屏设置与模型弹窗、最终 `chat-desktop-final.jpg`、`chat-mobile-result-final.jpg`。状态见 `.omx/state/product-refinement/ralph-progress.json`。

## 启动与边界

在仓库根目录执行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/chat-full.html` 或 `settings.html?from=chat#key`。本轮无新增环境变量；普通界面和本地演示不需要密钥。

隔离验收可执行 `node scripts/model-settings-fixture.mjs`，打开5512端口，仅使用脚本列出的 `fixture-*` 测试字符串。页面会标明模拟环境，无外部请求。本轮验收服务完成后停止；正常5501预览保留。

改动已在预览应用验收，不代表这些页面已迁入 Tauri 主应用，也不代表真实供应商账号、推理权限、计费或OAuth已经验收。未使用真实密钥或付费模型请求。未进行原生手机软键盘、Firefox/Safari或操作系统读屏器测试；完整模型标识的鼠标悬停与可访问名称保留，短屏列表仍需内部滚动。

交付范围为本轮前端路径优化，风险为中等（共享导航/模型选择交互），可通过逐文件恢复本轮差异回退。不要通过清空整个工作区回退；其中包含先前轮次和用户已有修改。
