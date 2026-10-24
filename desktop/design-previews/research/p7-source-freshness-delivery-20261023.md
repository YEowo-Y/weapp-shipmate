# P7 规则来源与系统通知交付记录

2026-10-23。本轮直接实现，复用当前组件和运行时；未提交、发布或修改用户的系统通知策略。验证范围与剩余边界记录在文末。

## 本轮行为

正式桌面的更多菜单、偏好设置、项目维护可以打开同一来源面板。构建目录覆盖 100 个监控载体、16 个官方 URL；规则、流程、拒因与交叉核验共享目录，引用仍保留各自维护者核验日期。目录版本绑定实际规则包与归档索引内容。

打开、刷新、重启仅读取本机记录。每次明确点击检查才启动一个官方来源请求；支持停止和全局工具忙状态。正文相同、不同、没有基线、无法读取、未知、人工归档分开呈现。网络失败不再被 CLI 判为来源失效，也不会清除上次有效正文证据。检查从不改写规则、归档或 `last_verified`，不把正文差异当作政策更新。

用户本轮明确批准官方通知插件。设备级系统通知默认关闭，通过偏好设置显式开启、关闭和发送测试通知；沿用项目维护的新问题记录，历史和重启不重新发送。标题和正文不包含项目路径、源码、凭据。应用内记录独立保留，系统提交失败不改变预检报告成功状态。

## 复用与依赖

- 来源正文提取从原脚本移到共享模块，原位置保留导出；来源载体读取由 CLI 与打包共用，减少重复规则枚举。
- 来源请求复用现有公共地址判断；Rust 复用 ToolRunner、SQLite settings 和本地窗口授权。取消身份在读取目录前建立，进程结束到数据库提交之间继续持有执行身份。
- 两个面板复用 Web Awesome 按钮、Lucide、原生 dialog/details/switch、主题和减少动效规则。
- 通知仅新增精确固定的 Rust `tauri-plugin-notification =2.4.0`，Apache-2.0 OR MIT；兼容现有 Tauri 2.11.3，不安装重复 JS 通知包、不升级整套 Tauri。最新 2.7.0 要求 Tauri ^2.12，因此本轮未采用。

## 网络与通知边界

固定内置 HTTPS 官方 URL，仅 `developers.weixin.qq.com` 和 `pay.weixin.qq.com`。公共 DNS 校验后固定地址连接，强制 TLS 验证，不跟随跳转，不带 cookies 或项目内容。整个请求上限 10 秒、正文上限 2 MiB；超时、访问墙、格式错误和部分正文均不形成有效证据。人工归档不联网。

Windows 插件权限 API 恒返回 Granted，不弹授权窗，也不能读取系统禁用/勿扰。插件 `show()` 后台展示的结果不是送达回执：UI 只显示提交结果。正式安装身份、通知中心可见性和点击唤起仍须单独验证，不能以 WebView DOM 或 IPC 成功替代。

真实公网单次尝试见 `.omx/artifacts/p7-sources-public-attempt.json`：访问微信 web-view 文档返回 `unknown/network`，没有正文 hash。确定性来源验收使用隔离副本中的 DNS/HTTPS adapter，走实际 Node 检查核心、Rust 校验、SQLite 与 WebView2；不冒充公网成功。

## 官方依据

- [Tauri 通知插件与 Windows 安装限制](https://v2.tauri.app/plugin/notification/)。
- [固定 2.4.0 版本与许可](https://crates.io/api/v1/crates/tauri-plugin-notification/2.4.0)、[依赖兼容性](https://crates.io/api/v1/crates/tauri-plugin-notification/2.4.0/dependencies)。
- [2.4.0 桌面权限、身份与异步展示源码](https://github.com/tauri-apps/plugins-workspace/blob/6aa2854f314481a459be1189b02c65a2450789ab/plugins/notification/src/desktop.rs)。
- [Node HTTPS API](https://nodejs.org/docs/latest-v24.x/api/https.html)、[OWASP SSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)、[RFC 9110 状态码语义](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)。

## 修改文件

- 核心：`src/source-text.mjs`、`src/source-catalog.mjs`、`src/rot.mjs`、`scripts/snapshot-sources.mjs`、`scripts/rule-rot.mjs`。
- 请求与打包：`desktop/server/source-check.mjs`、`desktop/scripts/prepare-runtime.mjs`。
- 原生：`source_freshness.rs`、`tool_runner.rs`、`system_notifications.rs`、`project_maintenance.rs` 及原生注册、权限、Cargo 清单与锁文件。
- 界面：`source-freshness.ts/.css`、`system-notifications.ts/.css`、`preferences.ts`、`main.ts`、`project-health.ts`、`desktop/index.html`。
- 回归：对应 Node/UI/Rust 测试、`native-source-freshness-acceptance.mjs`、`native-system-notification-acceptance.mjs` 和原生验收入口。

仓库已有大量未提交改动；以上仅列本轮触及的功能路径，不将整个工作区差异归为本轮实现。

## 质量合同与运行

风险 high（网络、进程、持久化、依赖）。质量命令发现于 CI `validate-rules/validate`、根与桌面 package.json、Cargo.toml 和既有 Windows harness；无自行编造阈值。运行 `npm --prefix desktop run tauri -- dev`，无需新增环境变量。构建由既有 `prepare:runtime` 生成来源目录。

恢复方式：关闭系统通知/监听，保留应用内记录与手动预检；来源检查只追加本机检查状态，不改规则或归档，无数据库迁移。只验证本机工作区，不声明 CI 或正式发布通过。

## 修复登记

| 项目 | 级别 | 处理与证据 |
|---|---|---|
| 网络状态 0 错判失效 | P2 | 改为未知；先复现失败，新增 rot 回归 |
| 来源准备阶段取消无身份 | P2 | 授权后立即 reservation；Rust 准备期取消回归 |
| 请求完成后官方链接丢焦点 | P2 | 按来源 ID 恢复链接焦点；待定请求 → Tab 到链接 → 完成回归 |
| 开启前的延迟维护事件可能补发 | P2 | 开启事务记录成果高水位；只提交开启后新产生的成果通知，原生回归覆盖延迟事件 |
| 设置期间缩窄窗口后关闭丢焦点 | P2 | 保留折叠导航，返回可见 summary；宽屏仍返回原入口。回归先红后绿，并补真实 Enter 展开、重开设置与 Escape 返回路径 |

来源与通知验收曾出现滚动目标不在内层可视区、原生点击被 footer 截获。几何证据确认 footer 为正常静态布局；验收现在先将具体目标滚动至中间，校验其完整位于滚动区内且命中测试正确，再执行真实 WebDriver 点击，不用 JavaScript click 或强制点击。来源行补复用的 Lucide 展开图标。

## 最终验收

| 验证 | 结果与证据 |
|---|---|
| `npm test` | 1265 通过、0 失败；包含规则校验。`.omx/artifacts/p7-final/node-tests.log` |
| `npm run lint` | 通过；`.omx/artifacts/p7-final/lint.log`。最后的原生脚本修改另经针对性 ESLint 和语法检查 |
| `cargo test` | 88 通过、2 项既有凭据测试 ignored；`.omx/artifacts/p7-final/rust-tests.log` |
| `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` | 通过；Clippy 记录 `.omx/artifacts/p7-final/rust-clippy.log` |
| `npm run verify:quotes` / `npm run coverage` | 66/66 引文通过（60 精确、6 空白归一，2 来源为人工归档）。现有规则指标 TP55/FP0/FN0、precision/recall 1.0；标签锚定 30/71，不是全产品测试覆盖率 |
| 来源 Windows 原生验收 | 12 项通过，见下方完整运行目录 |
| 系统通知 Windows 原生验收 | 13 项通过，见下方完整运行目录；实际测试通知与真实维护事件均观察到官方插件 `submitted` |
| 默认桌面构建 | TypeScript、Vite、Tauri debug no-bundle 通过；`.omx/artifacts/p7-final/default-build.log` |
| 依赖检查 | 桌面生产 npm audit 0；新增 15 个 Cargo 包 OSV 0 匹配。`cargo-audit` 不可用，因此后者仅覆盖新增包，不代表整个历史 Rust 依赖无漏洞 |

最终原生证据：

- 来源：[运行结果](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-19-15-904Z/results.json)、[深色宽窗](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-19-15-904Z/p7-sources-dark-wide.png)、[390px 窄窗](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-19-15-904Z/p7-sources-dark-narrow.png)。
- 通知：[运行结果](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-17-10-805Z/results.json)、[插件实际结果与边界](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-17-10-805Z/system-notification-outcomes.json)、[浅色](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-17-10-805Z/p7-notifications-default-off.png)、[390px 深色](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-17-10-805Z/p7-notifications-dark-narrow.png)。

两组均在独立应用标识、中文临时目录、隔离 WebView2/SQLite 和收窄 PATH 中运行，0 模型请求、前端异常为空，所属运行时进程退出检查通过。截图已人工复核：宽窗弹窗 620 CSS px，390px 窄窗 356px，面板和页面横向溢出为 0；滚动、禁用按钮、焦点边框与减少动效保持可读。来源目录、规则与归档未因检查改写。独立复核关闭全部已发现 P1/P2，不代表全产品所有历史路径均重新验收。

最终 `desktop/src-tauri/target/debug/desktop.exe` 已恢复 `com.weappshipmate.desktop`，验收标识不存在，SHA-256 为 `9f9f7a6640a212057b463465c15b6844577242dfa4866926bbbc8fe63720dd89`，见 `.omx/artifacts/p7-final/default-binary.json`。主 JS chunk 623.94 kB / gzip 206.17 kB（本轮前 610.48 / 201.89 kB）；既有 500 kB 提示与 chat-transport 混合导入提示仍在，未提高警告阈值或宣称完成性能验收。

复现原生检查时，每组使用新的 `com.weappshipmate.acceptance.p7sources.<唯一值>` 或 `com.weappshipmate.acceptance.p7notifications.<唯一值>` identifier 配置构建，再运行 `node scripts/desktop-native-e2e.mjs --sources --isolated-runtime --expected-identifier=<同值>` 或对应 `--notifications`。现有 `.omx/artifacts/p7-final/*-config.json` 只记录本次标识，重跑需新值以保证空数据库。完成后重新执行不带 `--config` 的默认构建。

仍未验证：安装版 Windows 通知中心实际显示、点击唤起、系统拒绝/勿扰策略，以及外部模型账号。通知实际原生运行未遇到插件失败，失败分支由 Rust/UI 确定性测试覆盖。公网来源本轮仅得到未知网络状态；来源正文差异不直接发布规则更新。独立浏览器访问受 Work 设置限制，未绕过；WebView2 证据不等于浏览器页面或干净 Windows 安装环境验收。P7 全阶段与 P8 发布门禁保持未完成。
