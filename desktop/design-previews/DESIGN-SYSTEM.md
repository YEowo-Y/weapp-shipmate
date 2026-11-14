# 上线船友桌面 · 组件与排版规范 v1

初版 2026-10-24，品牌图形与交互配色更新于 2026-11-08。适用于正式 Tauri 桌面（`desktop/index.html`）。实现文件：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 来源令牌 | `components/vendor/open-claude-ui/tokens.css` | Caho1/open-claude-ui（MIT）表面阶梯、Composer 几何与阴影，保持原样 |
| 设计令牌 | `../src/design-system.css` | `--ds-*` 字体、字号、间距、圆角、控件高度、颜色、阴影、动效；并映射到旧语义名（`--text`、`--surface`、`--r` 等） |
| 产品打磨层 | `../src/product-polish.css` | 只消费 `--ds-*`，统一侧栏、头部、首页、消息排版、输入框、弹窗、按钮与表单；由 `main.ts` 最后导入，保证覆盖所有功能样式 |

原则：**新代码只写 `--ds-*`，不写裸色值与裸像素圆角**；旧变量仍可用但视为别名。业务 DOM、ID、交互与无障碍契约不因视觉调整而改变。

## 1. 参考与取舍

| 参考 | 借鉴 | 不照搬 |
| --- | --- | --- |
| [Claude](https://claude.com/product/overview) / [open-claude-ui](https://github.com/Caho1/open-claude-ui) | 四层低对比表面、发丝环（`0 0 0 1px` 代替实线边框）、20px Composer、18px 用户气泡、无框助手正文、70/140/240ms 动效 | 上游 `#666` 深色次级文字（对比度不足）、React/Framer 运行时、专有字体与音效 |
| [Codex](https://openai.com/codex/) 桌面 | 紧凑 32px 导航行、单色线性图标、头部只放标题与少量动作、阅读列居中限宽 | 终端/差异等未接入能力 |
| OpenClaw 控制台 | 设置/任务行 = 图标 + 名称 + 说明 + 操作；状态用浅底色徽标而非大面积色块 | macOS 窗口装饰与品牌资产 |

## 2. 排版

字体栈：`Segoe UI Variable Text → Segoe UI → Microsoft YaHei UI → PingFang SC → system-ui`；标题用 `Segoe UI Variable Display`；代码 `Cascadia Code → Consolas`。不打包字体文件。

| 令牌 | 值 | 用途 | 行高 / 字重 |
| --- | --- | --- | --- |
| `--ds-text-caption` | 11px | 时间、计数、存储说明、分组标签 | 1.3 / 500，分组标签加 `.04em` 字距 |
| `--ds-text-meta` | 12px | 字段提示、表单标签、徽标 | 1.55 / 400–500 |
| `--ds-text-ui` | 13px | 导航、按钮、菜单、输入控件、表格 | 1.45 / 400–500 |
| `--ds-text-ui-strong` | 14px | 卡片标题、列表主文本、页面标题 | 1.45 / 500–600 |
| `--ds-text-input` | 15px | Composer 输入 | 1.5 / 400 |
| `--ds-text-body` | 用户偏好 14/16/18（默认 16） | 消息与报告正文 | 1.72 / 400 |
| `--ds-text-h3` / `h2` / `h1` | 16 / 18 / 22px | 弹窗标题 / 区块标题 / 页面主标题 | 1.3 / 600，`-.012em` |
| `--ds-text-display` | 24–28px（clamp） | 首页问候 | 1.3 / 600，`-.022em` |

规则：

- 一个视图最多 3 个字号层级；层级优先用**颜色（ink 1/2/3）和字重**区分，而不是再加字号。
- 正文阅读列 `--ds-measure: 704px`；Markdown 段距 `.8em`，标题上 1.5em 下 .5em；行内代码 `.86em` + 发丝环。
- 数字、时间使用 `tabular-nums`；中英混排不加人工空格之外的字距。
- 移动/触控输入保持 16px，防止系统缩放。

## 3. 颜色（墨色三级 + 语义色）

实测对比度（WCAG 2.x，相对背景 canvas）：

| 令牌 | 浅色 | 对比度 | 深色 | 对比度 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `--ds-ink-1` | `#1f1e1c` | 16.2 | `#ecebe8` | 15.3 | 主文本、标题 |
| `--ds-ink-2` | `#56554f` | 7.3 | `#b4b2ac` | 8.6 | 次级说明、未选中导航 |
| `--ds-ink-3` | `#6f6e68` | 5.0（侧栏 4.7） | `#9a9892` | 6.3 | 元信息、占位符（均 ≥ AA 4.5） |
| `--ds-accent` | `#292928` | 白字 14.6 | `#e4e3df` | 深字 12.7 | 主操作、发送、焦点环 |
| `--ds-success / warning / danger / info` | 见源码 | ≥ 5.2 | 见源码 | ≥ 6.4 | 状态文字；配 `*-soft` 背景 |

- 主操作在浅色主题使用墨黑底白字，深色主题使用灰白底深字。成功、警告、错误仍用状态色和文字说明。
- [Codex 的项目线程](https://openai.com/index/introducing-the-codex-app/)和 [Claude Projects 的项目实屏](https://www.anthropic.com/news/projects)把工作内容放在主要位置。船友侧栏从当前项目开始，窄屏收为导航入口。单色双帆用于系统图标、标签页、README 标题和「设置 → 关于」的产品名旁。
- 表面：`canvas`（主区）→ `sidebar`（更暗一级）→ `sunken`（内嵌块、代码）→ `raised`（卡片、弹窗、输入框）。
- 交互填充：`--ds-hover`（4.5%）与 `--ds-selected`（7.5–8.5%）为半透明墨色，在任何表面上都成立。

## 4. 间距、圆角、阴影、动效

- 间距 4px 网格：`--ds-space-1..12` = 4/8/12/16/20/24/32/40/48。组内 8，组间 24–32，区块标题与内容 12。
- 圆角：xs 4（行内代码）· sm 6 · md 8（按钮、输入、导航行）· lg 12（卡片、代码块、菜单）· xl 16（弹窗）· composer 20 · pill（回到最新）。
- 阴影即边框：`card`（发丝环 + 1px 微影）→ `card-hover` → `popover` → `dialog`。深色下以发丝环为主，避免脏灰阴影。不同时使用实线 border 与阴影环。
- 动效：`tap 70ms`（按下缩放 .98）、`state 140ms`（悬停/选中）、`surface 240ms`（弹层）；`prefers-reduced-motion` 关闭过渡与按下缩放。

## 5. 组件规范

| 组件 | 规格 |
| --- | --- |
| 按钮阶梯 | 高度 xs 28 / sm 32（桌面默认）/ md 36 / touch 44；圆角 8；13px/500。变体：**Primary**（accent 实底，每屏 ≤1）、**Secondary**（raised + 发丝环，对应 `wa-button appearance=outlined` 与 `.container button`）、**Ghost**（透明，悬停 `--ds-hover`，对应 `plain`）、**Danger**（danger 文本，确认后才实底）。图标按钮 32×32，必须有 `aria-label` 与提示。 |
| 导航行 | 32px，padding 6×10，图标 16，间距 10；未选 ink-2，悬停 hover，选中 selected + ink-1 + 500。分组标签 11px/500/ink-3。“新建会话”使用无框导航行；会话行右侧菜单在悬停、键盘聚焦或触屏时显示。首页可见时左侧“工作台”自动呈选中态。 |
| 头部 | 52px，以留白区分正文，不添加底部分隔线；标题 14px/500/ink-1，右侧仅保留项目工具；搜索和维护提醒位于左上方，统一使用中性 Ghost 按钮。 |
| 首页 | 双帆标志与系统衬线标题并排（桌面 24–28px，窄屏 22px）。项目下方依次提供预检、清单和拒因查询，窄屏自然换行。最近报告单独成行。上线进度、维护、记忆和来源从左栏进入。 |
| 卡片 | raised + card 阴影，圆角 12，内边距 16；悬停只升阴影不位移。卡片内：图标块 32（主任务用 accent-soft）、标题 14/600、说明 13/ink-2、操作贴底。 |
| 表单字段 | 高 36（触控 44）、圆角 8、canvas 底 + 强发丝边；悬停边框 ink-3；聚焦边框 accent + 3px 18% 光环。标签 12/500/ink-2 位于上方，提示 12/ink-3 位于下方，错误使用 danger 并关联 `aria-describedby`。 |
| 弹窗 | 圆角 16、无实线边、dialog 阴影、遮罩 + 2px 模糊；标题 16/600；说明 13/ink-2；原生 `<dialog>` 负责焦点。 |
| 菜单 / 模型选择器 | 圆角 12、popover 阴影；选项 36 高、圆角 8；当前项 selected。 |
| Composer | 圆角 20、内边距 14、raised 底 + 三态阴影（来自 open-claude-ui）；输入 15px；发送 32×32 accent，禁用时 selected 底 + ink-3，停止为 ink-1 实底。 |
| 消息 | 用户：气泡 18 圆角、最大 85%、`--ds-selected` 中性底色；助手：系统衬线字体、无框正文 + 4px 内缩；消息间距 24；操作按钮 ink-3，悬停 ink-1。 |
| 代码块 / 表格 | sunken 底 + 发丝环，圆角 12；代码头 36 高、等宽 11px；正文 12.5/1.65；表头 500/ink-2。 |
| 状态文字 | success / danger 文本色；运行中用既有 shimmer，减少动效时静止。 |

## 6. 响应式与辅助功能

- 断点：侧栏随桌面宽度使用 304 / 284 / 264px；≤1080 工具面板 320；≤860 工具面板浮层；≤640 侧栏变顶部条，导航为弹出面板。
- 触控指针：所有导航行、按钮最小 44px。
- 焦点：统一 `2px solid --ds-focus` + 2px 偏移；Composer 输入框使用单层 2px 内描边；强制颜色模式使用 Highlight 外轮廓。附件面板与模型菜单统一使用 raised 底色。
- 强制颜色模式：卡片环与阴影替换为 `1px CanvasText` 实线，选中项使用 `Highlight` 描边。

## 7. 新增或修改组件时的检查清单

1. 只引用 `--ds-*`；需要新值先加到 `design-system.css` 并在本文登记。
2. 浅/深色、320/390/1000/1440px、正文 18px 与 200% 文字均不溢出、不截断主要操作。
3. 文字对比度 ≥ 4.5（图标 ≥ 3）；不把强调色用于大段文字。
4. 不新增依赖；Web Awesome 组件通过 `::part()` 套用同一按钮阶梯。
5. 运行 `npm test`、`npm --prefix desktop run build`，以及原生验收 `node scripts/desktop-native-e2e.mjs --presentation --isolated-runtime`。
