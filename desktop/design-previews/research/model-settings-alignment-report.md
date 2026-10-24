# 模型服务与输出层级调整

2026-10-16。本轮已完成预览代码与自动化验证，真实浏览器视觉/交互验收为 **BLOCKED**。不声称生产模型接入或整体产品完成。

## 实际研究

| 来源 | 实际检查 | 落地 |
| --- | --- | --- |
| [Cherry 官方服务设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) | 官方文档及其真实截图，已查看 `assets/cherry-api-key-official.webp` 像素；提供方列表、详情、独立密钥弹窗 | 三栏设置、服务商搜索、连接与模型分别成组；原生密钥对话框 |
| [OpenClaw 设置设计规范](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/docs/design-system/settings-design.md) | 当前官方源码，固定提交；单层表面、设置行、点与文本状态、移动端控件 | 低层级设置分组、安静按钮、文本状态与触控尺寸 |
| [OpenClaw 模型页实现](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/src/pages/model-providers/view.tsx) | 源码；当前默认模型与服务商访问分区，实际为单列 | 当前执行来源与服务配置分离；未声称 OpenClaw 使用 Cherry 的三栏布局 |
| [OpenClaw 凭据与连接](https://docs.openclaw.ai/concepts/model-providers/control-ui-and-keys) | 官方文档：保存凭据、发现模型和连接测试有各自结果 | 格式检查不冒充连接检查；模型草稿不能进入运行中模型选择 |
| [OpenClaw 选择器稳定性测试](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/src/e2e/model-providers-layout.e2e.test.ts) | 官方测试源码 | 打开选择器只展示已有状态；不触发网络模型发现 |

REA 官方仓库已只读核查。本轮没有通过 REA 运行浏览器提取，也没有复制外部源码或安装依赖。OpenClaw 尚未取得运行截图，其结论来自源码/文档；Cherry 来源确为官方实际图片。

## 修改文件与行为

- `settings.html`、新增 `settings.js` / `settings-state.js` / `settings.css`：可搜索服务商、联动地址/凭据要求/模型草稿、默认执行来源。Ollama 不要求云服务密钥；新增地址和模型校验、模型删除、搜索空态。非密钥草稿只保留当前页面。
- `settings.js`：密钥仅存在于临时密码输入框；关闭、切换服务商、离开页面立即清空，释放事件监听。没有网络请求、storage、日志或系统钥匙串。复制真实凭据不是此预览的必要步骤。
- `settings.html`：移除假钥匙串保证、虚假的连接状态及执行权限描述；其他未接入设置明确禁用；保留真实主题切换、导航和搜索。设置导航使用现有 Lucide 图标。
- `ui.js` / `ui.css` / `components/composer.js`：删除无行为的均衡/深入档位，模型菜单锚定模型按钮，展示本地演示和管理模型服务入口。复用现有键盘菜单与原生弹窗，公开已有 dialog 工厂供设置页复用。
- `components/message.js` / `message.css`：工具摘要在前，参数与原始结果二级折叠；结果卡突出待核对项及下一步，规则依据折叠，审批保持独立。保留结果校验、文本安全与执行中文字渐变。
- `conversation.js`：统一保留消息折叠区展开状态；审批更新后保留原始结果滚动位置与摘要焦点。
- `tests/model-settings.test.mjs`、`tests/component-presentation.test.mjs`、`tests/conversation-continuity.test.mjs`：新增 9 项有效回归，包含实际设置模块 DOM 处理函数。

没有增加依赖、后端协议、模型适配器或新的重复 UI 框架。

## 验证

- 改前目标基线 34/34 通过。
- 模型设置测试首先因缺少实现失败，再实现并通过；折叠状态测试复现失败后修复为通过。
- `npm test`：**302/302 通过**，包括规则校验、对话状态机、数据约束、设置交互和连续性。
- `npm run lint` 与改动预览 JS/测试显式 ESLint：通过。根 lint 默认忽略预览，因此没有用根 lint 替代预览检查。
- 3 个修改 CSS 由 PostCSS 解析通过；设置页内联 module 语法检查通过；9 项本地引用存在。
- settings.html、chat-full.html HTTP 200；`git diff --check` 通过（仅已有 CRLF 提示）。
- 独立只读复核提出 2 项 P2：移动断点冲突、折叠状态丢失，均已修复并复核。没有剩余明确阻断代码问题。

## 运行与未完成部分

仓库根目录运行 `node desktop/design-previews/_serve.mjs`，访问 [模型与密钥](http://127.0.0.1:5501/settings.html) 或 [对话预览](http://127.0.0.1:5501/chat-full.html)。无需环境变量、API Key 或新增安装；已有服务可直接刷新。

本次没有修改正式 Tauri 构建文件，也没有部署。模型网络接入、真实凭据安全保存、模型目录同步、实际连接检测和真实项目工具调用均未实现；界面明确反映此边界。

浏览器工具返回 `Local browser use is disabled in Work settings`。没有通过其他浏览器工具绕过。最终浅色/深色截图、窄屏视觉、原生 Esc/遮罩关闭/焦点锁定、真实键盘旅程和控制台检查尚未验证。DOM 测试不能证明这些项目通过。

DQ-00/01/02/04：本次本地预览及测试证据已收集。DQ-05/WF-06 真实浏览器验收 BLOCKED；DQ-07/08 密钥输入仅临时 DOM 边界已测试和独立审查，真实服务权限和密钥存储不在本次实现；DQ-09 未发布；DQ-11 没有新增概率模型行为。交付判断为“代码与自动化通过，视觉验收待验证”，非生产就绪。
