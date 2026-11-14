# 设置页 React 迁移记录

日期：2026-10-25。范围：正式 Tauri 桌面端的设置工作区。此记录接续 [设置布局调研](settings-workspace-20261025.md)；该调研中关于 Web Awesome 设置按钮和原生单选组的实现描述，已由本轮 React 组件替换。其余业务页面继续使用现有实现。

## 参考与取舍

- **视觉证据**：用户提供的 Codex 深色设置截图和 OpenCode 浅色偏好设置截图。采用独立分类导航、受限内容宽度、说明与控件对齐、相关设置分组的布局。没有把截图中的账户、订阅等未实现功能复制成空入口。
- **源码证据**：[OpenCode 设置样式](https://github.com/anomalyco/opencode/blob/a41d09bc78e2cda3201096bf766ef3a2c359d54b/packages/app/src/settings/settings.css)，固定提交 `a41d09bc78e2cda3201096bf766ef3a2c359d54b`。下载副本保存在 `.omx/artifacts/settings-react-20261025/opencode-settings-reference.css`。借鉴布局与响应式规则，没有引入其 Solid 运行时或声称复刻已安装版本。
- **项目适配**：侧栏宽 248px，1100px 以下收至 216px；正文最多 840px；800px 以下分类导航移至内容上方。保留“外观与阅读”“系统通知”“连接与数据”三个真实分区。主题缩略图仅作装饰，选项保留文字名称。
- **显示层次**：复用现有颜色、字体、圆角及 Lucide 图标来源。界面说明为 14px，选项及反馈为 13px；14/16/18px 阅读偏好只影响正文和阅读示例。保存反馈放在滚动内容之外。

## 技术与源码归属

以 `desktop/package.json` 和锁文件为准，本轮新增的直接依赖如下。

| 用途 | 依赖与版本 | 许可证 |
| --- | --- | --- |
| 设置视图 | React / React DOM 19.3.1 | MIT |
| 交互基础 | `@base-ui/react` 1.9.0 | MIT |
| 样式构建 | Tailwind CSS / `@tailwindcss/vite` 4.3.3 | MIT |
| React 构建 | `@vitejs/plugin-react` 5.2.0；React / React DOM 类型 19.3.0 | MIT |
| 本地组件样式工具 | `class-variance-authority` 0.7.1；`clsx` 2.1.1；`tailwind-merge` 3.6.0 | CVA 为 Apache-2.0，其余 MIT |
| DOM 回归测试 | jsdom 26.1.0 | MIT |

继续使用已有 Vite 6（当前锁定 6.4.5）、TypeScript 5.6、Tauri 2、AI SDK 和模型调用链路。没有为此次设置迁移升级整个应用框架。

`desktop/components.json` 使用 shadcn/ui 的 `base-nova` 配置。组件代码存放在项目内，当前只适配实际使用的 Button 和 Radio Group：

- [shadcn Button 注册表](https://ui.shadcn.com/r/styles/base-nova/button.json) → `desktop/src/components/ui/button.tsx`。
- [shadcn Radio Group 注册表](https://ui.shadcn.com/r/styles/base-nova/radio-group.json) → `desktop/src/components/ui/radio-group.tsx`。
- 上游检索日期为 2026-10-25；组件头部保留来源，`desktop/src/components/ui/LICENSE` 保留 shadcn MIT 许可。这里是按项目令牌调整的本地源码，不是未经修改的整套模板。
- Radio Group 使用 Base UI 状态与键盘行为；卡片根节点显式设置 `nativeButton` 并渲染按钮。可访问状态由 `role="radio"` 和 `aria-checked` 表达，验收不能再把可见控件当作旧的原生 input。

官方依据：[shadcn Vite 接入](https://ui.shadcn.com/docs/installation/vite)、[Base UI Radio Group](https://base-ui.com/react/components/radio-group)、[Tailwind Preflight](https://tailwindcss.com/docs/preflight)。

## 样式隔离与行为保留

`desktop/src/settings/tailwind.css` 只导入 theme 和 utilities，不引入全局 Preflight；工具类使用 `tw:` 前缀，扫描范围限定为设置目录及本地 UI 组件。颜色等令牌映射到现有 CSS 变量。全应用重置和第二套图标依赖没有加入。

原 `mountPreferences` 入口继续保留，内部由 React 挂载内容。原生 `<dialog>` 继续承担顶层模态、Escape 及焦点恢复；设置分类切换后聚焦可读标题，退出后恢复原入口。通知控制器通过单一 DOM host 接入，React 不重建其内部节点，打开、关闭和销毁仍走原生命周期。

外观状态独立到 `desktop/src/settings/preferences-store.ts`，由 `useSyncExternalStore` 订阅。持久化键仍为 `shipmate-desktop-preferences`，版本仍为 1，字段仍为 `theme`、`messageSize`、`motion`，没有数据迁移。

- 写入成功后才应用新外观；失败时保留已生效的旧值并提供重试反馈。
- 损坏、未知版本或非法字段不会被普通选择静默覆盖；用户可明确恢复外观默认。
- 保留系统主题、减少动画偏好和经过校验的跨窗口同步；同步不反向写回。
- “恢复默认”只改外观记录，不删除会话、项目或凭据。
- 模型、数据、维护、规则来源、项目入口仍调用原回调，并按原有方式交接业务弹窗。此次没有把这些业务模块全部迁移到 React。

## 体积与验证记录

本节是迁移过程中的已取得证据，最终交付结果应追加在后续验收记录中。

| 检查 | 已有证据 |
| --- | --- |
| 改造前设置与控件回归 | 62/62 通过，见 `.omx/plans/settings-react-migration-20261025.md` |
| React 设置回归 | 25/25 通过，见 `preferences-tests-fixed.log` |
| 既有桌面控件回归 | 39/39 通过，见 `controls.log` |
| 首轮 TypeScript + Vite 构建 | 成功，见 `build-first.log` |
| npm 依赖审计 | 当次报告为 0 项告警，见 `dependency-audit.json`；不等同于不存在所有安全风险 |
| 新增直接依赖许可证 | 已记录在 `dependency-licenses.json` |

上表日志均位于 `.omx/artifacts/settings-react-20261025/`。jsdom 26 不实现完整原生 dialog 和 PointerEvent，测试辅助层仅补齐必要 DOM 行为；真实点击、键盘、窗口布局及 WebView2 行为必须由 Windows 原生验收覆盖，不能以 jsdom 代替。

首轮主入口由基线 647.82 kB / gzip 214.04 kB 增至 933.32 kB / gzip 306.92 kB，增量为 285.50 kB / gzip 92.88 kB。CSS 为 283.07 kB / gzip 50.33 kB。当前设置运行时仍在初始入口中；这是引入 React 和 Base UI 的实际成本，不以修改告警阈值掩盖。构建保留大于 500 kB 的分块提示及既有 `chat-transport` 混合导入提示，后续按实际启动表现评估懒加载。

## 最终本机验收

以下结果对应最终 React 控件源码；日志保存在 `.omx/artifacts/settings-react-20261025/`。

| 检查 | 结果与证据 |
| --- | --- |
| `npm test -- --test-concurrency=2` | **1313/1313 通过**，`full-tests-final.log`；降低进程并发，不减少测试集合 |
| `node --test tests/desktop-preferences.test.mjs` | **25/25 通过**，`preferences-tests-final.log`；真实 React、Base UI 渲染，包含存储拒绝、损坏恢复、跨窗口同步、箭头键及 Tab 边界 |
| `npm run lint` | 通过，`lint-final.log`；桌面 TS/TSX 另由构建中的严格 TypeScript 检查覆盖 |
| TypeScript、Vite、Windows Tauri debug 构建 | 通过，`native-build-final.log`；`CARGO_BUILD_JOBS=1`，未调整原生权限或降低 CSP |
| Windows 原生展示验收 | **19/19 通过**，`native-acceptance-final.log`；真实 Tauri、WebView2、SQLite 和键盘/鼠标操作，无 invoke mock |
| 独立语义复核 | 修正 Radio 的双重 labelable 后代，使用中性 span；复核通过 |

最终原生证据：`.omx/artifacts/desktop-model-native/run-2026-10-25T13-10-09-193Z/`。`results.json` 的 `presentationFrontendErrors` 为空，模型请求为空。覆盖浅深色、320/390/1000/1440px、1000×720 窗口、200% 文本与自定义文字间距；还验证保存后刷新/进程重启恢复、所有五个关联功能入口、焦点返回，以及默认恢复不删除项目进度。

原生验收命令：

```powershell
# 每次使用新的测试 identifier，避免触碰日常用户资料；实际配置不修改。
$env:CARGO_BUILD_JOBS='1'
npm --prefix desktop run tauri -- build --debug --no-bundle --config (Resolve-Path .omx/artifacts/settings-react-20261025/native-config.json).Path
node scripts/desktop-native-e2e.mjs --presentation --isolated-runtime --expected-identifier=com.weappshipmate.acceptance.presentation.202610251803
```

本次先前有两次系统资源导致的构建失败，降至单任务后成功。最终语义修正后的第一次原生重跑遇到测试脚本仍查找旧 label 的问题；已改为点击真实 radio 按钮，并从新隔离资料目录完整重跑 19 项。失败目录和最终成功目录分别保留，不能互相替代证据。

最终入口为 **933.38 kB / gzip 306.93 kB**，相对基线增量 **285.56 kB / gzip 92.89 kB**；CSS 为 285.27 kB / gzip 50.60 kB。当前没有把设置运行时拆成延迟加载块，后续可单独优化启动成本。未覆盖屏幕阅读器、开发模式热更新、发布安装包、真实厂商账户或系统通知投递；这些不作为本次 19 项展示验收的已通过项目。GitHub CI 未在本轮运行，现有未提交界面改动继续保留。

## 修改文件与后续维护

- `desktop/src/preferences.ts`：保留公共挂载入口与原生 dialog 生命周期，删除原命令式设置内容构建。
- `desktop/src/settings/{view,appearance,icon}.tsx`、`preferences-store.ts`：分离视图和数据，复用通知控制器与现有图标。
- `desktop/src/components/ui/{button,radio-group}.tsx`、`LICENSE`、`desktop/src/lib/utils.ts`：可维护的本地 shadcn/Base UI 组件及样式合并。
- `desktop/src/settings/tailwind.css`、`desktop/src/preferences.css`：共享设计令牌、限定扫描范围及响应式布局。
- `desktop/{components.json,package.json,package-lock.json,tsconfig.json,vite.config.ts}`：必要依赖与 JSX、Tailwind 构建配置；保留既有依赖版本。
- `tests/desktop-preferences.test.mjs`、`tests/helpers/react-desktop.mjs`、`scripts/native-presentation-acceptance.mjs`：从旧 DOM 实现断言改为真实 React 控件的行为断言，保留原数据与导航回归。
- `desktop/README.md`、本记录：更新实际技术栈、来源与验证边界。

正常启动仍为仓库根目录执行 `npm --prefix desktop run tauri dev`；首次安装在根目录和 `desktop` 分别执行 `npm ci`。本次没有新增产品环境变量，也没有要求迁移或重建既有数据。
