# 前端真实页面对照与验收 — 2026-10-17

本轮已对当前 `desktop/design-previews` 应用页面进行实际修改，并完成浏览器检查。执行方式为直接实施与有界原生子代理协作；没有启用 OMX 运行时，没有新增依赖、部署或提交。

## 参考依据

实际下载、逐张查看了 12 张官方发布或官方仓库图片，覆盖 ChatGPT 输入与附件、Claude 设置与桌面工作台、Cherry Studio 模型设置/选择、OpenClaw 对话与配置界面。所有原始链接、固定提交和版本局限记录在：

- [ChatGPT / Claude 图片研究](product-alignment-chat-sources.md)
- [Cherry Studio / OpenClaw 图片研究](product-alignment-agent-sources.md)
- [实施前清理计划](product-alignment-plan.md)

这些是官方公开图片，不是本轮登录第三方个人账户得到的截图。部分图片为产品宣传构图、旧版 README 或开发分支验收图；未把它们混称为同一个最新稳定版本，也没有把品牌素材直接嵌入产品。

## 实际调整

- **应用外框与导航：** 去掉应用页的模拟操作系统标题栏、外层圆角窗口和重复边框；统一为 48px 顶栏，保留开发预览标识。侧栏使用次级中性色，选中项与背景保持区分。
- **对话与输出：** 正文、输入框和完成/停止状态共用最大 704px 阅读宽度；输入框桌面高度约 112px。收紧用户消息、操作图标、工具记录间距；正文不套卡片，结构化结果和审批保留独立区域。沿用已有文字流光、停止、错误与重试机制。
- **设置与模型连接：** 统一分类导航、服务商列表、配置详情层级；桌面固定外框、内容区独立滚动。服务商行、输入框、按钮和 API Key 弹窗使用一致尺度。手机保留搜索与选择服务商两个入口，连接按钮在首屏可见。
- **其他功能页：** 预检、阶段任务、健康检查、项目记忆、拒因解释、指导步骤、类目顾问、差异审阅和首次使用页面统一标题、内容宽度、间距、表单与按钮。补齐记忆页可见标题；取消类目页双重滚动；手机指导页责任徽章放到标题下方。
- **响应式与键盘：** 修复手机对话区高度、短屏展开导航挤出发送区的问题；保留焦点轮廓、原生弹窗关闭及焦点返回；支持减弱动画偏好。没有重写已有协议、模型适配器或凭据逻辑。

## 本轮修改的实现文件

以下均相对于 `desktop/design-previews/`：

| 范围 | 文件 |
| --- | --- |
| 公共视觉与导航 | `app.css`、`ui.css`、`preview.js`、`navigation.js` |
| 对话与工件 | `conversation.css`、`main.css`、`components/composer.css`、`components/message.css`、`components/review.css` |
| 设置 | `settings.css`、`settings.html` |
| 功能页修正 | `memory.html`、`audit.html`、`diff-review.html`、`category-advisor.html`、`guided-step.html` |

另调整 `tests/settings-navigation.test.mjs` 的移动断点检查，与实现统一为 700px；新增本目录的计划、研究、交付记录和参考图片。仓库原有未提交修改未被回退；本报告不将其他历史改动计为本轮成果。

简化主要来自移除重复窗口装饰、冲突布局覆盖及不必要的内部高度限制；复用既有 CSS 变量、图标、原生菜单和对话框，没有叠加新的框架或组件库。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 640 / 640 通过，0 失败、0 跳过 |
| `npm run lint` | 通过 |
| `npx eslint --no-ignore desktop/design-previews/preview.js desktop/design-previews/navigation.js` | 通过 |
| `npm --prefix desktop run build` | TypeScript 与 Vite 构建通过 |
| `node --experimental-vm-modules .omx/agent-experience-static-check.mjs` | 16 HTML、48 脚本、24 样式、204 本地引用；38 HTTP 路由返回 200 |
| 独立代码审阅 | 未留存待修复发现 |
| 浏览器控制台 | 本轮检查未捕获 error / warn |

浏览器自动化实际覆盖 12 个应用页面的桌面与手机布局，另外检查 900px 设置分类、690px 断点、1600px 宽屏和 500px 高短屏。不是仅通过静态断言推断页面可用。

实际操作路径包括：新建对话、发送、运行中文字流光、输出前停止、输出中停止并保留文字、停止后重跑、固定失败示例与成功重试、模型选择空态、添加菜单、Esc 关闭及焦点返回、设置搜索无结果/清空、服务商筛选与 Anthropic/Google 切换、密钥弹窗、明暗主题、设置返回对话。密钥字段没有输入真实凭据。

关键几何复验：

- 1600px 宽屏：输入框与完成状态均宽 704px，左缘均为 558px。
- 390×844 手机：输入框宽 362px，底部约 836px，无横向溢出。
- 390×500 短屏展开导航：输入框底部约 492px。
- 1280×500 凭据弹窗：顶部约 100px、底部约 400px，按钮完整可见。
- 类目顾问内容区 `scrollHeight === clientHeight`，只由外层页面滚动；指导页移动标题为完整单行、徽章独立下一行。

独立视觉复核查看了 27 张桌面/移动截图，发现的双滚动、标题挤压、宽屏状态错位均已修正并由浏览器复验。结论限于已覆盖尺寸、页面与状态，不宣称不存在所有潜在视觉或交互问题。

## 预览与证据

启动：

```powershell
node desktop/design-previews/_serve.mjs
```

本轮前端预览不需要环境变量。打开：

- [对话工作区](http://127.0.0.1:5501/chat-full.html)
- [模型与密钥](http://127.0.0.1:5501/settings.html?from=chat#key)
- [主工作区](http://127.0.0.1:5501/main-four-region.html)

最终截图与验收数据：

- [桌面对话](../../../.omx/artifacts/product-visual-alignment/chat-final.jpg)
- [模型设置](../../../.omx/artifacts/product-visual-alignment/settings-final.jpg)
- [手机对话](../../../.omx/artifacts/product-visual-alignment/chat-mobile-final.jpg)
- [宽屏状态对齐](../../../.omx/artifacts/product-visual-alignment/chat-wide-final.jpg)
- [浏览器测量与交互记录](../../../.omx/artifacts/product-visual-alignment/browser-acceptance.json)
- [最终测试输出](../../../.omx/product-alignment-tests.log)

## 验收边界

本轮修改作用于浏览器中使用的设计预览应用，尚不等于完整迁移到独立的原生 Tauri 桌面界面。构建通过也不代表原生发布包已完成验证。

流式、停止、失败重试在明确标记的本地演示路径中进行了本轮浏览器验收；本轮没有使用真实密钥发起付费推理，没有重新验证真实 OAuth 登录、外部发送或发布。既有真实模型接入能力的测试仍包含在仓库测试中，但不能替代真实账户验收。

部分业务功能仍是显式标记的预览或固定数据示例；本次视觉统一没有把它们改称已实现的真实业务功能。没有执行完整 WCAG、所有浏览器或每个可能内容长度的认证性测试。
