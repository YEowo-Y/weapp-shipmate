# 对话框成熟基础能力：来源与取舍

检索日期：2026-10-17。实施前检查原生 ESM 预览、共享 composer/message/ui、既有依赖与测试；没有把预览误认为 React 应用。

| 官方来源 | 实际采用与边界 |
| --- | --- |
| [Floating UI computePosition](https://floating-ui.com/docs/computePosition) | 引入 DOM 版固定定位；复用 offset / flip / shift / size，不再手算窗口和锚点坐标。 |
| [Floating UI autoUpdate](https://floating-ui.com/docs/autoUpdate) | 弹层打开期间订阅祖先滚动、尺寸与布局变化，关闭释放；保留默认动画帧设置。原生 visualViewport 的实际软键盘效果仍需设备验证。 |
| [Floating UI size](https://floating-ui.com/docs/size) | flip 在 size 前；同一 12px 边界，非负可用尺寸，上限 480px；添加菜单随输入区宽度。 |
| [WAI-ARIA Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) | 菜单触发器声明 haspopup/expanded；上下箭头分别落到首/末可用项，菜单内导航、关闭后焦点返回。模型选择保留已选项初始焦点。 |
| [WAI-ARIA Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | 继续使用 showModal 的原生模态隔离；确认默认取消、长说明滚动、触发器失效时返回当前对话框或输入区。 |
| [AI Elements Prompt Input](https://elements.ai-sdk.dev/components/prompt-input) | 实读 textarea、工具栏、模型选择、提交状态及 React/AI SDK 示例。借鉴职责划分；当前已有原生共享输入区，不为这些修复引入 React 根节点和第二套消息运行时。 |

Floating UI 采用官方 npm `@floating-ui/dom@1.8.0`、`@floating-ui/core@1.8.0`、`@floating-ui/utils@0.2.12`。固定版本、本地 ESM、无运行时 CDN、无安装脚本；完整 tarball SHA-512、原始/本地文件 SHA-256 与三份 MIT 许可保存在 `components/vendor/floating-ui/`。只将 bare import/export 路径改为相邻模块路径。四份运行模块共 74,523 bytes（未压缩）。

已有视觉来源继续沿用用户 Codex 截图和 [会话调研](session-experience-sources.md) 中实际查看的 Cherry Studio 官方产品图。本轮没有新产品截图，也没有声称取得 Codex/Claude 私有源码。官方文档支撑模式与 API，不能替代本项目当前页面的像素验收。
