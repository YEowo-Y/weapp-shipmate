# 开源组件与工作台验收

日期：2026-10-20。范围为浏览器工作台与正式 Tauri 桌面的首页入口、开源组件接入及相关会话交互。保留已有模型、工具、认证和存储协议；没有部署、提交代码或迁移用户数据。

## 采用的组件与真实依据

保留 Vanilla TypeScript / Vite / Tauri 2，选择与现有栈兼容的 **Web Awesome Core 3.14.0**。本轮没有同时安装 React、shadcn 或另一套聊天运行时。导入 button、badge、dropdown、dropdown-item、tooltip 和默认主题；关闭远程图标解析，复用本地 Lucide 和服务商品牌 SVG。组件源码不经运行时 CDN 加载。

| 来源 | 实际观察与采用范围 |
| --- | --- |
| [Cherry Studio 官方聊天页](https://cherryai.com/docs/en/cherrystudio/preview/chat/)及[官方截图](https://cherryai.com/docs/content-assets/ea2f3f51dcba385254d1f719.webp) | 查看真实图片中的侧栏分组、上下文标题、紧凑输入区；采用功能分层，不照搬产品品牌。图片未标注版本。 |
| [Cherry Studio 官方 Launchpad](https://cherryai.com/docs/en/cherrystudio/preview/launchpad/)及[官方文档](https://docs.cherryai.com.cn/) | 查看功能入口与 Agent 会话图片；将本仓库真实的项目预检、清单、模型和成果集中展示，不加入不存在的 Agent 市场。 |
| [Codex 社区截图](https://github.com/openai/codex/issues/23794)、[Claude 社区截图](https://github.com/anthropics/claude-code/issues/100949) | 沿用本任务此前实际查看的图片，参考有界对话宽度、轻量辅助操作与历史入口；不是当前版本的逐像素复刻。原图来源记录在 `.omx/artifacts/settings-history-detail/references/manifest.json`。 |
| [OpenClaw Control UI](https://docs.openclaw.ai/web/control-ui)、[Web UI 发布说明](https://docs.openclaw.ai/releases/2026.8.1/the-new-web-ui) | 只作为能力分区和任务上下文的文档依据。本轮没有成功取得可核验的 OpenClaw 页面截图，不以此宣称完成视觉复刻。 |
| [Web Awesome button](https://webawesome.com/docs/components/button/)、[dropdown](https://webawesome.com/docs/components/dropdown/)、[tooltip](https://webawesome.com/docs/components/tooltip/)、[许可证](https://webawesome.com/license) | 核对当前 API、事件顺序、主题和许可证。菜单在 `wa-after-hide` 后才打开业务弹窗，避免组件恢复焦点抢走弹窗焦点。 |

## 实际改变与简化

- 工作台最大宽度 880px，消息和输入区继续限制为 704px。标题左对齐，两个任务面板使用清晰的主次按钮，下面集中放模型连接和当前成果。
- 正式桌面点击项目预检或清单后，打开既有工具配置；浏览器明确说明目录扫描需桌面端，清单则调用真实本机规则服务。
- 成果入口仅在存在有效完成结果时启用。浏览器回到当前会话中的原清单；桌面打开实际成功报告，不复制结果、不虚构完成状态。
- 删除旧任务主页样式，桌面与浏览器共用 `workbench.css`。容器不足 540px 时改为单列，工具侧栏展开也能触发布局调整。
- 菜单、按钮、徽标和提示使用同一开源实现。旧全局菜单委托跳过 `wa-dropdown`，避免一次点击打开两套菜单；已有 composer 和模型菜单仍沿用原实现。
- 历史弹窗支持记录实际触发按钮。窄屏关闭弹窗后返回可见菜单入口；空会话回到顶部并隐藏“回到最新消息”。
- 没有增加假统计、假历史、后台任务或新的报告存储层。原生 dialog 与既有专业业务组件没有在本轮全部替换。

## 文件范围

| 文件 | 用途 |
| --- | --- |
| `desktop/package.json`、`desktop/package-lock.json` | 固定 UI 库版本和构建命令 |
| `desktop/scripts/ui-kit-entry.js`、`build-ui-kit.mjs` | 按需构建及许可证/哈希清单 |
| `desktop/design-previews/components/ui-kit.js`、`ui-kit.css`、`vendor/web-awesome/` | 本地组件、主题映射和菜单生命周期 |
| `desktop/design-previews/components/workbench.css` | 两端共用工作台布局 |
| `desktop/index.html`、`desktop/src/main.ts`、`styles.css` | 正式桌面入口、实际报告状态和菜单 |
| `desktop/src/sessions.ts`、`shared.d.ts` | 复用模型连接与历史入口 |
| `desktop/design-previews/main-four-region.html`、`main.js`、`main.css` | 浏览器主页、模型设置链接、有效清单定位 |
| `desktop/design-previews/session-workspace.js`、`conversation.js`、`ui.js` | 焦点返回、空会话滚动和菜单事件归属 |
| `tests/ui-kit-assets.test.mjs`、`workspace-sessions.test.mjs`、`desktop-controls.test.mjs`、`conversation-continuity.test.mjs`、`session-workspace.test.mjs`、`dialog-foundation.test.mjs` | 资产完整性、成果状态、滚动、焦点和防重复菜单回归 |
| `scripts/desktop-native-e2e.mjs` | Windows 实际应用开源组件、菜单、工具报告与既有聊天路径验收 |
| 本文、`component-workbench-plan.md`、`desktop/README.md` | 实施边界、启动与验收证据 |

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 修改前受影响基线 | 40 项通过 |
| 最终 `npm test` | **822 / 822** 通过，无失败、跳过、取消 |
| `npm run lint` | 通过 |
| 对修改的预览 JS、组件构建脚本执行 `npx eslint --no-ignore …` | 通过；根配置默认忽略 desktop，因此另行检查 |
| `npm --prefix desktop run build` | TypeScript + Vite 通过 |
| `npm --prefix desktop run tauri -- build --debug --no-bundle` | 当前原生应用构建通过 |
| `node scripts/desktop-native-e2e.mjs` | **22 / 22** 通过 |
| 浏览器真实 UI 操作 | 下列路径通过，最终控制台采集 warning/error 为 0 |
| 独立只读复核 | 通过；追加复核菜单归属修复，无阻断问题 |
| 生产依赖审计 | 0 漏洞 |
| 完整依赖审计 | 2 项原有开发依赖 high：nanoid、source-map-js；未以本轮 UI 改动无故升级整个构建链 |

原生运行记录：`.omx/artifacts/desktop-model-native/run-2026-10-20T16-31-10-453Z/results.json`。应用 SHA-256：`94bc1565e0ce5b5309ba42628a9e96852c5d431f82a8d0ebc10b3dca2386db53`。

原生测试使用真实 exe、WebView2、IPC、本机 broker 和工具执行。模型上游为隔离的 **Ollama 协议测试替身，不是真实 LLM 推理**。覆盖连接、选模、流式、停止、错误重试、草稿、会话与重启恢复；没有宣称本轮重新验证云端账号、付费模型或 OAuth 授权。

浏览器操作覆盖：

1. 开源菜单单独打开，旧菜单数量为 0；Enter 打开、方向键选择，进入历史/清单弹窗后焦点正确，关闭返回菜单按钮。
2. 工作台清单按钮提交明确参数，由本机规则服务生成 41 项清单；当前成果入口定位原消息，草稿保持。
3. 设置入口往返与刷新后恢复同一会话、清单和未发送草稿，主题同步为 `wa-light` / `wa-dark`。
4. 320、390、768、1280px 无页面横向溢出；390px 菜单和历史可用；窄屏任务面板单列，1280×850 四个功能入口与输入区可见。
5. 浏览器预检入口说明能力边界，关闭后焦点返回原按钮；深浅色工作台和设置页截图检查。

证据目录：`.omx/artifacts/component-workbench/`，包含 before/home-light/home-dark/home-narrow/menu-narrow/current-result/settings-light 图片、浏览器检查记录、最终测试日志和依赖审计 JSON。原生截图位于上述原生运行目录。视觉迭代记录：`.omx/state/component-workbench/ralph-progress.json`；这是本地证据记录，未运行 OMX Ralph 工作流。

## 资源成本与启动

本地组件 JS 247,796 B，gzip 60,495 B；CSS 51,635 B，gzip 6,797 B。版本、所有包含依赖的许可证、SHA-256 与 gzip 数据均在 `components/vendor/web-awesome/manifest.json`。重复构建哈希一致。Web Awesome 为 MIT；Lit 为 BSD-3-Clause，随产物保存完整声明。

最终主应用 JS 464.90 kB / gzip 153.38 kB，CSS 185.31 kB / gzip 32.78 kB。Vite 仍提示既有 chat-transport 静态与动态同时导入；构建通过，没有把该提示误报成性能改进或首次启动测速。

从仓库根目录：

```powershell
node desktop/design-previews/_serve.mjs
# http://127.0.0.1:5501/main-four-region.html

npm --prefix desktop ci
npm --prefix desktop run tauri -- dev
```

重建开源组件：`npm --prefix desktop run build:ui-kit`。无需新增环境变量。真实模型仍需用户连接对应服务；浏览器预览与正式桌面各自保存会话。本轮只完成上述组件与入口范围，不代表全部设计示例都已产品化，也不作发布就绪声明。
