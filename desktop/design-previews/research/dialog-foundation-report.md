# 对话框基础能力交付记录

2026-10-17。范围：设计预览的共享输入区、模型/添加/会话/项目菜单、确认/命令/文件弹窗。直接执行与有界原生子代理；没有运行 OMX CLI 模式。计划见 [dialog-foundation-plan.md](dialog-foundation-plan.md)，官方资料与技术取舍见 [dialog-foundation-sources.md](dialog-foundation-sources.md)。

## 实际修改

| 文件 | 改动 |
| --- | --- |
| `ui.js` | 共享菜单接入 Floating UI，删除手算位置与重复窗口监听；菜单方向键统一、首末项选择、IME 229 保护、字母检索、当前模态内菜单开放；关闭父对话框时清理子菜单；焦点返回失效时采用当前模态/输入区回退；确认说明进入滚动正文。 |
| `ui.css` | 统一 border-box、长标题换行、确认正文、按钮换行、触摸 44px 点击区和强制颜色模式焦点；保留中性色、轻量动效和 reduced-motion。 |
| `components/floating-surface.js` | 官方定位薄适配层；关闭释放 autoUpdate；过期计算、尺寸回调和错误不得污染新状态。首次定位后揭示初始焦点，不反复重置手动阅读滚动。 |
| `components/vendor/floating-ui/*` | 四份官方 ESM 模块、三份 MIT 许可、SOURCE 与完整性记录。未增加其他框架或修改应用依赖锁文件。 |
| `conversation.js` | 输入上限与 CSS 统一为 168px；宽度变化重新计算；集中管理 11 组事件；destroy 幂等并断开 ResizeObserver，阻止迟到回调和销毁后更新；输入法确认不误触发送/停止。 |
| `main.js` | bfcache 暂存仅停止生成；真实离开再销毁，兼容重复 pagehide。 |
| `tests/dialog-foundation.test.mjs`、`tests/floating-surface.test.mjs` | 新增共享菜单/模态真实函数的 DOM 模型回归，以及官方定位核心的合成几何、异步竞态、完整性测试。 |
| `tests/conversation-continuity.test.mjs`、`tests/composer-surface.test.mjs`、`tests/command-navigation.test.mjs` | 补齐销毁、宽度变化、IME、bfcache 回归。 |

简化：删除共享菜单的手写坐标函数和 window resize/scroll 订阅，复用成熟库；将分散匿名事件登记到单一清理表；未叠加 React/shadcn、聊天框架或另一套执行协议。输入框的原生编辑、粘贴和现有统一视觉样式继续复用。

## 验证证据

- 新行为回归先失败后通过；全量 `npm test`：**393/393 通过，0 失败、0 跳过**（此前 374 项，本轮新增 19 项）。包括规则数据校验和 Node 测试；完整输出 `.omx/dialog-foundation-tests.log`。
- `npm run lint` 通过；预览被根 lint 忽略，因此另对所有改动 JS 和测试执行 `npx eslint --no-ignore ...`，通过。
- `desktop` 下 `npm run build`：TypeScript + Vite 通过。此构建只检查现有正式桌面入口，并不证明预览已经接入 Tauri。
- 预览静态校验：16 HTML、41脚本语法、24样式表、179本地引用通过。原37条HTTP路径与新增5条ESM路径均200；JS MIME正确。此验证没有启动或操控浏览器。
- `git diff --check` 通过。仓库先前改动仍保留；本轮无提交、部署或外部写操作。
- 独立复核发现“矮窗口 ArrowUp 打开长菜单，初始末项焦点可能不可见”；修复首次定位后的原生滚入视野，并新增回归。增量复核15/15通过，无剩余已知代码问题。

## 启动与边界

仓库根目录运行 `node desktop/design-previews/_serve.mjs`，访问 [完整对话](http://127.0.0.1:5501/chat-full.html) 或 [工作台](http://127.0.0.1:5501/main-four-region.html)。不需要新增环境变量或 API Key。本地服务当前可访问。

本轮仍是设计预览：消息、工具和结果来自明确标记的本地演示；未接入真实模型、上传、鉴权、操作级审批绑定或持久化，也未迁入正式 Tauri 入口。

Work 本地浏览器访问先前被禁用，用户选择本轮完成代码与自动化验证。依此记录 WF-09 替代证据：真实函数 DOM 模型、真实 Floating UI 核心合成几何、ESM/MIME、CSS/静态引用与编译；没有用其他浏览器工具绕过限制。`visual-ralph` 的截图/像素环节无法执行，视觉 verdict **BLOCKED**，不生成分数或伪造截图。真实 popover 焦点、背景滚动、移动软键盘、操作系统 IME、读屏及深浅主题像素仍待实际环境验收。状态见 `.omx/state/dialog-foundation/ralph-progress.json`，不声明视觉门禁通过或生产发布就绪。
