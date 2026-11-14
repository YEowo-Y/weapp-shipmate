# P6 第一段 · 修复交接

日期：2026-10-23。对应总体计划 P6 的第一段：从真实报告生成可审阅、可导出、可重开的交接包。本机功能与隔离 Windows 原生验收完成；结构化补丁、写入审批和撤销属于第二段，仍待真实需求验证，不据此宣布 P6 全阶段或产品发布完成。

## 用户路径与交付范围

1. 在正式桌面选择项目并运行代码预检、上线清单或拒因反查；也可从项目历史打开已保存报告。
2. 报告工具栏选择“修复交接”。按真实结构化结果整理问题/核对项、规则依据、期望结果、验证步骤；条件自查与拒因匹配单独标明语义。没有条目时给出可继续操作的空状态，不宣称通过。
3. 首屏显示核对项；成果、运行、项目、事实与规则版本放入“报告来源与版本”折叠区。改变项目版本或规则后明确提示重检。
4. 可导出 Markdown 供阅读、JSON 供重开；更多功能菜单的“打开修复交接”可打开此前 JSON。外部文件始终显示“来源未核验”，不会加入可信成果历史或授予权限。
5. 失败保留上一份有效内容；修正文件后可重试。读取期间关闭或销毁界面，迟到结果不能覆盖新内容。Escape 关闭并恢复触发控件焦点，Tab/Shift+Tab 在弹窗边界回环。

这是只读交接，不执行补丁、模型请求或外部发送；未将建议标为“已修复”。持久来源继续由既有 SQLite 成果库保存，交接 JSON 由用户下载保存；本轮没有另建数据库或把导入文件写进原生成果。

## 复用、简化与信任边界

- 复用 `validateGuideItem`、Markdown 转义/安全渲染、`createArtifactDownloader`、Web Awesome 操作按钮、Lucide 图标、原生 dialog/details 与既有报告样式。依赖、数据库迁移、Rust 命令、环境变量均无新增。
- portable JSON v1 严格校验格式、字段、来源版本和规则项；UTF-8 上限 512 KiB、最多 500 项，官方链接沿用规则契约白名单。外部 ID 不是可信身份，外部文字只是数据。
- 来源投影不包含完整输入、绝对项目目录、原始代码、扫描内部对象或凭据。规则要求可能含相对文件名/业务线索，分享前应阅读内容。规则日期只是资料记录日期，不等于实时核验。
- 复用既有成果快照，不创建“交接执行”假运行；重开不改变原生成果、运行计数或项目文件。文件列表范围完整不等于规则覆盖完整，不虚构代码行号或修复证据。
- 截图复核发现并修复空状态文本残留，将长规则哈希从首屏移入 details，并复用报告链接/焦点样式。没有添加另一套渲染库、动画库或状态管理。

## 实际修改文件

| 文件 | 变化 |
|---|---|
| `desktop/design-previews/repair-handoff.js` | 结构化成果投影、版本化文件验证、分区 Markdown、来源变化提示 |
| `desktop/src/repair-handoff.ts`、`repair-handoff.css` | 原生只读交接弹窗、下载/重开、异步失效与响应式布局 |
| `desktop/src/main.ts`、`desktop/index.html`、`desktop/src/shared.d.ts` | 报告工具栏与更多菜单入口、类型边界 |
| `tests/repair-handoff.test.mjs`、`tests/desktop-repair-handoff.test.mjs`、`tests/desktop-controls.test.mjs` | 数据边界与真实规则结果、界面/异步回归、既有入口夹具适配 |
| `scripts/native-handoff-acceptance.mjs`、`scripts/desktop-native-e2e.mjs` | 独立 P6 原生模式、真实下载/重开、隔离项目与截图证据 |
| `desktop/README.md`、`docs/12-current-capabilities.md`、总体/本轮计划与状态 | 用户路径、能力台账和验收边界 |

已有工作区修改予以保留；未提交、推送、发布或覆盖历史工作。

## 证据与验证

- 修改前 `npm test`：1137/1137；最终全量：**1150/1150**，0 失败/跳过，记录 `.omx/artifacts/p6-handoff/node-final.log`。
- 最后样式复用后相关定向回归：13/13，记录 `targeted-final.log`。
- `npm run lint`、共享模块显式 ESLint、桌面 `tsc && vite build`、Tauri debug no-bundle 构建通过。
- `npm run verify:quotes`：66 条非 draft 规则通过，其中 2 条依据人工快照，不能称实时抓取全部验证；规则 `coverage` 命令通过，它不是代码行覆盖率。
- Windows 原生验收：**9/9**，包含实际 Tauri/WebView2 启动与权限检查、空状态、真实 bundled 预检、两种文件下载、JSON 重开、畸形/未来版本/超限文件恢复、390px 布局与键盘、重启历史来源恢复、版本变化、项目文件和历史不变。模型请求数为 0。
- 最终证据目录：`.omx/artifacts/desktop-model-native/run-2026-10-23T16-43-49-612Z`。测试专用身份 `com.weappshipmate.acceptance.p6.1792773790965`；二进制 SHA-256 `f82cf1565ec1254ab26b182215c81da15b11e2b75d8f618c3c8b81aa5c12af14`。
- 最终 390px 窗口：弹窗 left 17 / right 373，top 24 / bottom 820，弹窗与页面横向溢出均为 0。宽屏 1200×850 和窄屏 390×844 截图均实际查看；截图像素受 Windows 缩放影响，不冒充 CSS 尺寸。
- 一轮独立只读复核发现空状态残留，已修复并新增回归；复核未发现其他契约/信任边界阻断项。最终复核请求因代理额度限制未执行，修复后由主代理测试和原生复验，不宣称独立二次复核通过。

本轮主要 JS bundle 572.30 kB / gzip 189.72 kB；CSS 208.41 / 36.66 kB。相比 P5 增加约 12.39 / 4.22 kB JS，既有 >500 kB chunk 与混合导入提示仍在，未无故改动打包架构。

## 启动与未覆盖范围

开发启动：仓库根目录执行 `npm --prefix desktop run tauri -- dev`。无需新增环境变量或模型密钥。打包构建仍为 `npm --prefix desktop run tauri -- build --debug --no-bundle`；验收使用独立身份，随后恢复默认构建，不启动用户默认数据库。

本轮没有 Rust 行为修改，沿用此前 57 项 Rust 验证，本轮不冒称重新运行。验收为原生 WebView2；浏览器预览权限此前禁用，没有绕过。文件重开通过 WebDriver 设置原生网页文件输入，未验收 Windows OS 选择器；没有新增深色截图、屏幕阅读器/高对比度专项测试、真实模型账号评测、干净 Windows 安装或远程 CI 结果。签名更新和外部发布门禁继续属于 P8。

下一步按计划进入 P7 的手动健康重检、项目事实/偏好与设置作用域；P6 第二段受限写入仍以真实需求验证为前提。

## 调研依据（2026-10-23）

- [Claude Code：Plan before editing](https://code.claude.com/docs/en/common-workflows#plan-before-editing)：区分建议计划与执行修改。本项目借鉴可审阅、先只读的边界，没有复制其内部实现。
- [VS Code：Review and revert agent changes](https://code.visualstudio.com/docs/agents/run/review-code-edits)：查看实际改动、验证结果与集成范围。文档明确部分 harness 会直接写盘，因此本项目不把“待审阅”等同“未写盘”。

本轮是官方行为文档核验，视觉沿用现有产品组件并通过本机截图迭代；没有声称重新截图测量 Claude/Codex 或使用 rea 提取竞品代码。
