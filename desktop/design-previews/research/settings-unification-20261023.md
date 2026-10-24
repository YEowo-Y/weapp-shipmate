# 统一设置入口与工作区呈现

后续补充：[Open Claude UI 源码复核与定向移植](open-claude-source-adoption-20261023.md)。该仓库同时提供独立纯 CSS 导出；下文的 React 运行时取舍仅针对 React 组件，不能据此排除其样式源码复用。

## 本轮结果

正式桌面端只保留侧栏底部一个常驻“设置”入口。模型连接、会话数据与设备偏好从此处进入；首页和“更多功能”不再重复列出这些设置。窄屏时设置仍直接可见，不必先展开会话导航。

设置由长页跳转改为三个独立分区：外观与阅读、系统通知、连接与数据。当前分区有明确选中状态，隐藏区域不参与键盘访问；宽屏为左导航右内容，窄屏为顶部导航。保留即时保存、存储错误恢复、通知默认关闭和原始触发点的焦点恢复。

工作台与上线进度移到业务导航。首页按“当前项目 → 开始检查与准备 → 继续处理”排列，三项起步任务采用同一组件结构，删除宣传式大标题、重复设置按钮和重复隐私文案。报告仍由真实执行结果决定是否可打开；规则依据、维护、记忆和进度入口保留。更多菜单统一使用现有 Lucide 图标。

模型选择器继续负责日常切换；管理模型或缺少模型时进入设置的连接分区。只有再点击“模型连接”才打开既有连接详情。从选择器进入，最终回到选择器；从全局设置进入，最终回到全局设置按钮。删除旧侧栏按钮后，聊天初始化仍正常，不依靠隐藏占位按钮。

## 调研与取舍

| 参考 | 实际证据及边界 | 本轮采用 |
| --- | --- | --- |
| Codex | 用户提供的真实对话截图，已重新查看；不把截图文字当项目指令 | 收敛辅助操作、统一线性图标、保持输入区与内容区边界 |
| Claude | [官方设置入口说明](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features)；[2024 年官方 Projects 文章](https://www.anthropic.com/news/projects)中的真实工作区图片已下载查看 | 全局配置与项目任务分开；设置集中入口。图片是历史版本，不声称代表当前像素细节 |
| OpenClaw | [官方设置文档](https://docs.openclaw.ai/web/control-ui/settings)；官方仓库 docs/assets/macos-onboarding/05-permissions.png，已查看，带历史品牌 | 设置行由图标、名称、说明、操作构成；关闭回到原上下文；不复制 macOS 窗口装饰 |
| [open-claude-ui](https://github.com/Caho1/open-claude-ui) | MIT，React >=18、framer-motion、lucide-react；第三方复刻，不是 Anthropic 官方组件 | 参考组件组织与样式边界，不整体引入 React 运行时 |
| [Creative Tim UI](https://github.com/creativetimofficial/ui) | MIT，基于 shadcn；已查看账户组件演示，非真实竞品页面 | 说明与操作分列、紧凑分组，不照搬宣传缩略图的低对比度 |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT；官方 [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) 与 [Field](https://ui.shadcn.com/docs/components/base/field) | 固定底部设置、可滚动内容、字段标签/帮助/错误归组；组件源码可控 |

当前仓库是 Vanilla TypeScript/Vite/Tauri，已有 Web Awesome 3.14.0、Lucide 白名单和原生 dialog/fieldset。三套 React 参考库不作为重复依赖安装。本轮零新增依赖，不更换字体、模型传输、存储协议或权限边界。Web Awesome dropdown-item 的 icon slot 以已安装版本的类型文档核验；按钮、焦点和菜单生命周期复用既有实现。

完整 commit SHA、许可证与图片资产来源见 [.omx 调研记录](../../../.omx/artifacts/settings-unification/references/reference-sources.md)。参考图片仅为本地调研证据，未作为产品品牌或运行时资产。

## 修改文件

| 范围 | 文件 |
| --- | --- |
| 页面、导航、排版 | `desktop/index.html`、`desktop/src/main.ts`、`desktop/src/styles.css`、`desktop/src/home.css` |
| 设置分区 | `desktop/src/preferences.ts`、`desktop/src/preferences.css` |
| 模型路由解耦 | `desktop/src/sessions.ts`、`desktop/src/model-connection.ts` |
| 行为回归 | `tests/desktop-controls.test.mjs`、`tests/desktop-preferences.test.mjs`、`tests/desktop-sessions.test.mjs`、`tests/desktop-model-dialog.test.mjs` |
| 原生路径验收 | `scripts/desktop-native-e2e.mjs`；`native-presentation`、`native-system-notification`、`native-memory`、`native-source-freshness`、`native-maintenance`、`native-reading` 对应 `-acceptance.mjs` |

简化内容：删除 4 个重复按钮和 3 个重复菜单设置动作；解除模型初始化对侧栏按钮的强依赖；首页移除旧二级嵌套任务布局和多余说明样式；复用现有控制器，不再增加新弹窗实现。

## 原生验收

最终全量 Node 测试 **1300/1300**，lint、TypeScript/Vite 和 Tauri debug no-bundle 构建通过。独立代码审查另跑 114 项核心回归与类型检查；追加入口集成测试后 controls 39/39 通过。最终默认应用构建已恢复，SHA256 `fe77cbf013507fd67ffc24e811fffd7f1569df4d3dc6085a63151fcb94433f10`；未启动正式用户数据。完整日志在 `.omx/artifacts/settings-unification/`。

19 项 Windows 原生检查通过，实际 Tauri/WebView2 与 SQLite，53 份布局测量。覆盖唯一入口、320px 常驻、分区当前态、模型配置引导与草稿、设置详情返回焦点、业务入口、工作流草稿/冲突、外观持久化、刷新/重启、存储损坏恢复，以及浅深色 320/390/1000/1440px 和 200% 字体/间距压力。

最终原生证据：`.omx/artifacts/desktop-model-native/run-2026-10-24T05-36-51-709Z`。`results.json` 中模型请求和前端异常均为空，所属运行进程退出检查通过。验收使用全新 `com.weappshipmate.acceptance.presentation.1792820180903`，没有打开正式用户数据库。

第一次原生运行暴露一处测试期望错误：从模型选择器发起的配置详情应回到模型选择器，而非全局设置。已按真实原始触发点契约修正；重新使用新隔离标识完整运行通过，没有为通过测试更改产品焦点行为。

实际查看并经独立复核的最终截图：

- [首页](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-36-51-709Z/presentation-light-1440-home.png)
- [设置·连接与数据](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-36-51-709Z/presentation-dark-1000-preferences-connections.png)
- [设置·外观](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-36-51-709Z/presentation-dark-1000-preferences-appearance.png)
- [窄屏·通知](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-36-51-709Z/presentation-dark-320-preferences-notifications.png)

原生截图字体 18 是验收主动选择的大字号，不代表默认正文变为 18。独立代码与四图视觉复核未发现阻断性问题。其余原生模式的入口脚本已同步并通过语法/lint，本轮未逐一重跑，不沿用历史数字作为当前结果。

## 启动与剩余边界

启动：仓库根目录 `npm --prefix desktop run tauri -- dev`。没有新增环境变量。静态预览不包含完整原生功能，浏览器预览不能替代本次 Windows 验收。

本轮不验证真实厂商账号/OAuth、Windows 可见通知投递、签名安装、读屏认证或线上性能。保留既有 Vite 大 chunk 与静态/动态混合导入提示，没有通过调高阈值隐藏警告。最终 JS 642.54 kB/gzip212.10、CSS233.82 kB/gzip40.55，仅记录构建体积，不宣称性能基准。产品持久化和后端未修改，无数据迁移；撤回本轮 UI/路由可恢复入口结构。
