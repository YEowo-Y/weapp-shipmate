# 次级界面组件收敛交付记录

日期：2026-10-17。范围是设计预览的功能图标、设置导航和命令面板；承接 [执行计划](surface-standardization-plan.md) 与 [上一轮产品路径记录](product-journey-report.md)。本轮继续按用户选择完成代码与自动化验证，不将历史截图视为当前验收证据。

## 实际修改与简化

| 文件 | 修改与目的 |
| --- | --- |
| `components/lucide-icons.js`、`components/icons.svg`、`components/LUCIDE-SOURCE.md` | 从原有固定 Lucide commit 补入 16 个官方图标，子集共 48 个。静态 SVG 与动态图标复用同一份节点；保留许可证，无新增依赖、CDN 或运行时图标库。 |
| 仓库根 `scripts/build-preview-icons.mjs` | 生成本地 SVG symbol 资源，`--check` 检查生成结果是否过期。复用现有 `iconMarkup`，避免维护第二套几何数据和属性转义。 |
| `audit.html`、`category-advisor.html`、`chat-full.html`、`command-palette.html`、`diff-review.html`、`explain.html`、`first-run.html`、`guided-step.html`、`health-dashboard.html`、`main-four-region.html`、`memory.html`、`settings.html`、`stage-workspace.html`、`sync-loop.html` | 275 处功能 SVG 改为引用共享图标，统一 1.75 线宽、装饰语义和不可聚焦标记；保留容器尺寸及样式。3 处品牌图形单独标记保留。 |
| `settings-navigation.js`、`settings.html` | 将底部内联设置导航收进可测试模块。支持 7 个已知分区的深链接、刷新和历史事件恢复；搜索同时匹配导航名称与正文，展示匹配面板，无结果时不显示无关内容，原生搜索清空可恢复。保留输入焦点及主题选择行为。 |
| `settings.css` | 窄屏保留搜索与无结果提示，搜索独占一行，导航自然换行；避免宽屏筛选后缩窄导致整页空白且无法恢复。搜索框保持 44px 高度及 16px 字号。 |
| `ui.js` | 修复命令面板键鼠混用：焦点已经在结果链接时，鼠标高亮同步链接焦点；搜索框仍持有焦点时不抢走输入。保留原生链接激活和修饰键语义。 |
| 仓库根 `tests/preview-icon-assets.test.mjs`、`tests/settings-navigation.test.mjs`、`tests/command-navigation.test.mjs` | 新增 15 项回归，覆盖图标引用和被动 SVG 内容、设置路径与过滤、键鼠选择一致性、输入法组合态及空结果恢复。 |

图标来源实际获取自 [Lucide 固定版本官方仓库](https://github.com/lucide-icons/lucide/tree/dab294f313897bacaa968b725b3259fa37c17bd1/icons)，新增节点逐一与下载的 SVG XML 几何比较一致。静态引用方案参考 [Lucide 静态资源指南](https://lucide.dev/guide/static) 和 [MDN SVG use](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/use)。图标需通过同源 HTTP 服务访问。本轮没有重新运行 REA，也没有取得新的 Codex、Claude 或其他客户端截图。

## 回归与验证

设置旧实现通过真实内联代码的 DOM 替身复现 5 项失败；命令面板旧实现复现高亮目标与焦点目标不同。修复后对应行为通过。图标测试先因缺少共享资源及旧标记失败，改造后通过。

| 命令或检查 | 当前结果 |
| --- | --- |
| `npm test` | **339/339 通过**，0 失败、0 跳过；包括规则校验与全量 Node 测试。日志：`.omx/surface-standardization-tests.log`。 |
| `npm run lint` | 通过，覆盖新构建脚本和测试。 |
| `npx eslint --no-ignore desktop/design-previews/ui.js desktop/design-previews/settings-navigation.js desktop/design-previews/components/icons.js desktop/design-previews/components/lucide-icons.js` | 通过；根 lint 原本忽略 desktop，故单独检查。 |
| `node scripts/build-preview-icons.mjs --check` | 通过，48 个 symbol 与源节点同步；由图标测试自动执行。 |
| `desktop/` 下 `npm run build` | TypeScript 与 Vite 构建通过，7 个模块。此构建不打包独立的设计预览页面。 |
| `node --experimental-vm-modules .omx/product-journey-static-check.mjs` | 16 页、33 份脚本、24 份样式、169 个本地引用通过；32 条 HTTP 路由返回 200，JS MIME 正确。 |
| HTMLParser / ElementTree | 16 页标签闭合与 ID 唯一通过；图标 SVG XML 有效，48 个 symbol；16 个新增图标与获取的官方源几何一致。 |
| 本地图标 HTTP 检查 | `components/icons.svg` 返回 200、`image/svg+xml`，内容含 48 个 symbol；275 个页面引用均有有效目标。 |
| 独立只读复核 | 发现并修复窄屏隐藏搜索恢复入口的问题；复核确认关闭，设置导航 8/8 通过。其余本轮限定范围未发现确定的新问题。 |
| `git diff --check` | 通过；Git 仅提示既有工作区的 CRLF/LF 转换，不存在空白错误。 |

这些证据验证代码、资源和有限 DOM 替身行为；不替代真实浏览器中的 SVG 绘制、原生焦点、辅助技术、历史导航和响应式观感。

## 质量范围与剩余风险

质量配置延续上一轮，来源为根和桌面 `package.json`、`eslint.config.mjs`、CI 以及本轮计划（discovered / declared）。补充 HTML/XML/HTTP 检查为 inferred 且实际执行。按 medium 的共享界面改动处理；没有修改模型执行、权限、密钥存储、规则数据或依赖版本。

- `DQ-00/01/02/04`：范围、配置、静态质量和回归证据齐全。
- `DQ-06/07`：静态图标只含固定被动几何，本地同源加载；没有模型提供的 SVG、任意 URL 或新增第三方运行时。无性能阈值声明。
- `DQ-05`：**BLOCKED（真实浏览器验收）**。此前工具返回 `Local browser use is disabled in Work settings`，用户选择“本轮先完成代码与自动化验证”。没有绕过限制。
- 沿用 `UI-VERIFY-001`：ux/test，medium，scheduled；由项目实施者在浏览器可用后补验深浅主题、窄屏、SVG 渲染和键盘/鼠标路径，在此之前不作视觉或发布就绪声明。
- 本轮未部署、未提交；保留工作区既有修改。没有把预览迁入 Tauri 主入口，也没有增加真实模型请求或后端能力。

## 启动

仓库根目录执行 `node desktop/design-previews/_serve.mjs`，服务已运行时无需重启。无需环境变量或 API Key。

- [主工作台](http://127.0.0.1:5501/main-four-region.html)
- [设置外观深链接](http://127.0.0.1:5501/settings.html#appear)
- [完整对话](http://127.0.0.1:5501/chat-full.html)
