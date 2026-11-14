# 导航、弹窗、空状态和错误恢复验收

2026-10-18。本轮范围已完成；不代表全部产品功能或第三方接入已完成。沿用原生 HTML / ES modules 和共享组件，无新依赖。

## 实际参考

复看 Codex 用户截图、Claude 官方设置/桌面图片、OpenClaw 固定 SHA 开发截图、Cherry 官方模型选择及凭据弹窗图片；另核查四个官方文档页。来源、原图及版本边界见 [Codex / Claude](navigation-dialog-chat-sources.md) 和 [OpenClaw / Cherry](navigation-dialog-agent-sources.md)。图片说明布局与层级，文档支持行为方向；没有声称逐像素复刻当前全部客户端。

## 文件与修改

| 文件 | 本轮内容 |
| --- | --- |
| `navigation.js` | 快捷导航和设置传递原任务来源，保留阶段和开始体验状态；仅允许单层已知路由，不增长嵌套返回链。 |
| `settings-navigation.js` | 正文空态与明确清除入口，恢复原分类和搜索焦点；历史切换不把焦点留在隐藏按钮。 |
| `settings.html` / `settings.css` | 空态说明、图标、留白与窄屏布局，复用本地图标与共用按钮，无第二套按钮样式。 |
| `ui.js` | 模型目录重试在隐藏、禁用、移除当前控件前移交焦点；保留搜索词，异步响应不抢稳定焦点。 |
| `settings.js` | OAuth 轮询失败同步厂商列表和当前真实厂商详情；提供服务重试，不重建本地/自定义草稿、不重放写请求。 |
| `tests/command-navigation.test.mjs` | 原任务来源及外部、嵌套、循环来源拒绝回归。 |
| `tests/settings-navigation.test.mjs` | 清除恢复与历史变化后的焦点回归。 |
| `tests/model-settings.test.mjs` | 跨厂商 OAuth 轮询失败/恢复、查询和焦点保持、无 POST 重放。 |
| `tests/model-picker-recovery.test.mjs` | 六项实际选择器函数回归：匹配、无匹配、连续失败、稳定焦点、清除控件变化和关闭后响应。 |

简化方式：复用现有控制器、搜索输入及标准按钮修复边界，没有引入组件框架、重复状态协议或新弹窗抽象。

## 验证

- 修改前基线 665 / 665；新增行为先红后绿。最终 `npm test` **676 / 676**，0 失败、0 跳过。
- 根 `npm run lint`、四个改动预览模块与四个测试文件显式 ESLint：通过。
- `npm --prefix desktop run build`：通过。桌面壳构建不替代预览页面验收。
- 静态检查：16 HTML、48 JS、26 样式表、207 本地引用；38 HTTP 路由正常。
- `git diff --check`：通过。既有 CRLF 规范化提示无空白错误。
- 独立代码复核：本轮 10 文件 0 明确问题，76 项针对性测试通过。
- 独立视觉复核：6 张最终截图通过，覆盖 1440px、320px、明暗主题、凭据和模型空态弹窗。

### 实际浏览器

CUA 控制真实 Chromium 页面，**21 项断言通过、0 失败**，记录在 `.omx/artifacts/navigation-recovery/browser-acceptance.json`。

- 设置空态 → 清除 → 原分类与搜索焦点；320px 无横向溢出及深色恢复入口。
- 隐私阶段 → 快捷导航 → 设置 → 原阶段；命令 Escape 返回原任务。
- 未连接模型说明和设置入口；凭据弹窗 320px 边界、Tab 循环。
- 目录读取失败 → 输入搜索 → 重试：保留搜索词，焦点回搜索框。
- 模型无匹配 → 清除 → 36 项恢复；方向键选择；Escape 回触发器。
- 连接服务失败 → 重试：保留 Anthropic 和筛选词，焦点落在恢复后的动作。
- 部分流式回复失败仍可见 → 原模型重试成功，无重复用户请求；未发送草稿保留。
- 输出前停止 → 恢复发送按钮并保留草稿。
- 模拟 OAuth 等待 → 切换 Anthropic 并筛选 → 轮询 GET 故障：当前详情进入错误态、搜索焦点保持；显式重试恢复。

首轮截图发现空态图标偏左及未复用按钮，已修复并重做截图复核。首次全量测试发现装饰 SVG 缺少 `focusable="false"`，补齐后重跑全量通过。浏览器两次定位未命中后，改用实际已观察到的入口；未计为通过项。

## 启动与证据

正常预览：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/settings.html#appear`。本轮 UI 修改无需环境变量。

本地故障验收：`node .omx/artifacts/navigation-recovery/fixture-server.mjs`，端口 5512。封装复用 `scripts/model-settings-fixture.mjs`；将同目录 `catalog-failure.txt` 设为 `healthy` / `fail` / `oauth-waiting` 控制目录服务。页面标注模拟，只使用 `fixture-*` 假密钥。验收后停止本轮 5512 进程，保留正常 5501 预览。

截图在 `.omx/artifacts/navigation-recovery/`：`settings-empty-final-preview.jpg`、`picker-search-empty-320.jpg`、`credential-dark-320.jpg`、`picker-recovered.jpg`、`oauth-cross-provider-error.jpg`、`oauth-cross-provider-recovered.jpg`。

## 边界

接入、OAuth 等待、网络故障与流式回复使用本地模拟，不访问外部供应商、不消耗额度。未执行真实 OAuth 登录/回调，未验证供应商或账户实际可用性。既有业务示例仍标为演示；未迁移为 React 或 Tauri 正式页面，未部署，未改变密钥存储策略。
