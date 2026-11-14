# 对话框视觉与交互细节：本轮记录

2026-10-17。承接上一轮406项测试。范围为设计预览，未改动正式模型执行或Tauri入口；没有新增依赖、提交或部署。计划见 [conversation-refinement-plan.md](conversation-refinement-plan.md)，真实参考和文档见 [conversation-refinement-sources.md](conversation-refinement-sources.md)。

## 实际修改

| 文件 | 结果 |
| --- | --- |
| `chat.js` | `@`/`/`补全复用现有Floating UI与原生顶层popover；打开才订阅定位与外部事件，关闭/原生dismiss/pagehide释放；过期回调隔离、首次定位前隐藏。保留输入焦点、ARIA与IME；修饰键和Home/End回到原生文字编辑，移动光标后同步补全上下文。 |
| `conversation.js` | 观察实际阅读区域的尺寸；输入框自动增高、宽度重排时按既有跟随/阅读意图恢复，更新跳转按钮。先补偿尚未处理的尺寸变化再保存流式快照，避免并发重排丢失阅读位置；底部跟随时不测量历史消息矩形，进入详情阅读立即保存锚点。向上滚动不强拉到底部；销毁后观察回调无效。 |
| `components/composer.css` | 统一输入区与补全菜单的中性层次、28px外圆角、行高和细边框；长路径换行，窄栏说明可读；首次定位前隐藏、强制颜色选中轮廓、减少动态效果回退。按钮轻微按下反馈，停止图标改用已有action ink以提高对比度。 |
| `ui.css` | 不可用菜单项不再显示可点击hover背景；窄栏添加菜单说明换行；菜单过渡与对话框按下反馈保持轻量。 |
| `chat-full.html`、`app.css` | 删除补全的absolute/40dvh位置规则、分散重复样式和未使用附件缩略样式，统一至composer.css。补全标题明确为示例引用，并显示选择/确认/关闭键。 |
| `tests/chat-menus.test.mjs` | 新增补全生命周期、原生关闭/失败/离页清理、迟到回调隔离、原生编辑键及光标上下文回归。 |
| `tests/conversation-continuity.test.mjs` | 新增输入区增高、阅读视口变化、用户向上滚动、宽度重排及chunk先于observer的回归；验证底部跟随不测量历史矩形，进入两种详情阅读路径立即保存锚点。后四项使用范围钳制、相对滚动坐标和延迟scroll事件。 |
| `tests/composer-surface.test.mjs` | 验证两套主题正文/辅助/占位文字至少4.5:1，发送/停止图标常态/悬停至少3:1。原暗色停止图标2.70:1及占位文字4.00:1的失败已修复；占位文字调整后4.65:1。仅验证声明颜色。 |

简化：移除第二套补全坐标与跨文件样式覆盖；复用既有定位适配器，不增加聊天框架或新状态协议。静态文案不把示例路径描述成已读取的真实文件。

## 验证与边界

- 新增行为回归先失败后通过。全量 `npm test`：**420/420通过，0失败、0跳过**，较本轮基线新增14项。日志：`.omx/conversation-refinement-tests.log`。
- 根 `npm run lint` 和针对本轮JS/测试的 `npx eslint --no-ignore ...` 通过。根lint忽略desktop，因此显式检查不可省略。
- `desktop` 下 `npm run build` 的TypeScript与Vite通过；该构建不代表预览已接入正式Tauri页面。
- 预览静态校验通过：16 HTML、41脚本、24样式表、180本地引用；37条HTTP路径200、JS MIME正确。
- 独立补全/CSS复核通过，相关测试13/13；独立阅读复核发现的两项P2（尺寸快照覆盖、每chunk历史布局测量）已修复并复核关闭，相关测试44/44通过，未发现新的确定性回归。
- `git diff --check`通过。

验证配置来自根/desktop package scripts、现有测试与静态脚本。共享交互涉及发送/补全/阅读等主路径，采用全量回归、独立复核和生命周期测试；没有虚设覆盖率阈值。真实浏览器Dogfood和视觉门禁按WF-09记录BLOCKED：此前Work本地浏览器访问禁用，用户选择代码与自动化验证，本轮继续遵循。DOM模型、CSS解析、HTTP和官方定位核心测试是替代代码证据，不能证明原生light-dismiss、触摸、实际字体/对比度合成、滚动锚定、系统IME或软键盘表现。宽度重排使用消息级锚点，不保证长消息内部文字行级位置完全不变。

## 启动

根目录运行 `node desktop/design-previews/_serve.mjs`。预览：[完整对话](http://127.0.0.1:5501/chat-full.html)、[工作台](http://127.0.0.1:5501/main-four-region.html)。没有新增环境变量或API Key。

当前消息、工具与结果依然是标明的本地演示；没有真实模型、文件上传/读取、跨刷新会话持久化或服务端审批。不能据此声称与Codex/Claude像素完全一致或达到生产发布条件。改动仅在上述文件，可逐项回退，其他已有未提交工作保留。
