# P7 第一段：项目维护与手动重检

日期：2026-10-23。本轮完成正式 Windows 桌面的维护状态、手动重检和历史恢复路径；P7 全阶段尚未完成。

## 实际变化

- 工作台和更多功能新增“项目维护”入口。620px 弹窗复用 Web Awesome、Lucide、原生 dialog 和现有设计变量；窄窗自然换行、正文滚动，头尾操作保持可达。
- 独立展示最近尝试与上次成功报告。失败、取消、中断不会覆盖成功成果；没有记录和不能读取记录是不同状态。目录不可用时保留历史报告，提供项目管理入口。
- 用 `contextRevision` 判断项目事实变化；重命名不触发事实过期。规则版本未知/变化明确提示，不把读取本机版本等同今天核验官方来源。
- “刷新记录”只读取 SQLite 快照与目录存在状态。“重新预检”复用既有只读执行、全局防重、停止和持久化；不运行项目 lint/build。保存报告始终注明未检查当前文件。
- 历史快照继续保留最近 200 条，并额外保留每项目每工具的最新尝试、最新成功成果和关联运行。修复旧 check 被新 guide/explain 挤出窗口的问题，无数据库迁移。

## 文件与复用

| 文件 | 修改 |
|---|---|
| `desktop/src/project-health.ts`、`project-health.css` | 状态派生、维护弹窗、主题与响应式布局 |
| `desktop/src/projects.ts` | 快照 getter/通知、刷新结果反馈、当前项目成果入口 |
| `desktop/src/main.ts`、`desktop/index.html` | 接入既有工具、报告、项目管理和工作台 |
| `desktop/src-tauri/src/project_store.rs` | 修复快照窗口及超过 200 条回归 |
| `tests/desktop-project-health.test.mjs`、`desktop-projects.test.mjs`、`desktop-controls.test.mjs` | 状态、项目隔离、刷新失败、异步关闭和既有入口回归 |
| `scripts/native-health-acceptance.mjs`、`desktop-native-e2e.mjs` | P7 隔离原生验收，复用既有驱动和工具 |
| `desktop/README.md`、`docs/12-current-capabilities.md`、总体计划 | 记录当前边界、入口和证据 |

无新增依赖、数据库表、IPC 命令或模型协议。没有移植模拟健康仪表盘，也没有增加另一套工具执行器。原有工作区改动保留，未提交、推送、安装或部署。

## 调研取舍

本轮核对 [OpenClaw Health](https://docs.openclaw.ai/gateway/health) 的本机状态与显式探测区别，以及 [Claude Commands](https://code.claude.com/docs/zh-CN/commands) 的状态与诊断入口。借鉴“可解释的保存状态 + 用户主动检查”模式，采用本项目的规则与预检能力，不照搬自动修复或后台监控。本轮未重新截图测量竞品页面，也未复制其源代码。

## 验证

| 检查 | 结果与范围 |
|---|---|
| `npm test` | 1159 / 1159 通过；全量结果 `.omx/artifacts/p7-node-tests.log` |
| 最终定向回归 | 55 / 55 通过，包含最后文案和状态调整 |
| `npm run lint`、新增原生脚本显式 ESLint / Node 语法检查 | 通过 |
| `npm --prefix desktop run build`、Tauri debug no-bundle 构建 | 通过；保留既有混合导入和主 chunk 超过 500kB 提示，不隐藏阈值 |
| `cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib` | 56 通过，2 项显式 Windows 假凭据测试 ignored，本轮未重跑凭据集成 |
| `cargo fmt --check`、`cargo clippy --lib --tests -- -D warnings` | 存储修改完成后通过 |
| `npm run verify:quotes` / `npm run coverage` | 通过；66 条引用，其中 2 条人工快照。coverage 是规则语料门禁，不是代码覆盖率 |
| 原生 WebView2 | 13 / 13 通过，0 模型请求，使用真实 Rust、SQLite 与随包扫描器 |

原生覆盖空状态、工作台入口、手动重检、刷新不扫描、最新 guide 下打开旧 check、改名与主体变更、失败与停止、目录移走/恢复、项目隔离、进程重启、键盘循环与项目管理返回。测试源文件与此前成果保持不变；失败/慢进程注入仅作用于已验证的隔离运行时副本，最终恢复。

最终证据：`.omx/artifacts/desktop-model-native/run-2026-10-23T17-53-49-856Z/`。

- 标识：`com.weappshipmate.acceptance.p7.1792777958153`。
- 验收二进制 SHA-256：`1c1d1f6fa472f1693223dea38756b88b8cebe6e0a581e7befffffab09b7d015c`。
- 验收结束后已重新构建默认 `com.weappshipmate.desktop`，核对二进制包含默认标识且不含本轮测试标识；未启动默认资料库。默认构建摘要保存在 `.omx/state/p7-health/ralph-progress.json`。
- 1200×850：弹窗宽 620px，横向溢出 0；390×844：左右界 17–373px，上下界 28.96–815.03px，横向溢出 0。
- 截图自检后修正错误颜色变量与次要入口的整行占位；宽屏弹窗高度从约 625px 收紧至约 581px。
- 深色错误使用现有 `--block`，计算颜色 `rgb(232,112,95)`；减少动态效果媒体查询生效。深色采用 DOM 主题呈现夹具，只验证样式，不证明主题设置持久化。
- 独立存储实施者完成 SQL 回归；后续独立 UI 复审因子代理额度/恢复限制未获得完成结果。主代理完成代码检查、单元、原生与截图复验，不宣称独立评审通过。

![项目维护](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T17-53-49-856Z/p7-health-wide.png)

## 启动与复现

开发启动：`npm --prefix desktop run tauri -- dev`。无新增环境变量或模型密钥要求。浏览器预览不提供原生 SQLite/扫描能力。

原生测试必须用**新的独立标识**重新构建，不能指向生产资料库或重复用已存在的测试库：

```powershell
$taskId = 'com.weappshipmate.acceptance.p7.' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$taskDir = Join-Path (Get-Location) '.omx/artifacts/p7-recheck'
New-Item -ItemType Directory -Path $taskDir -Force | Out-Null
$taskConfig = Join-Path $taskDir 'tauri-acceptance.json'
@{ identifier = $taskId } | ConvertTo-Json | Set-Content -LiteralPath $taskConfig -Encoding utf8
npm --prefix desktop run tauri -- build --debug --no-bundle --config $taskConfig
# 仅在上一命令成功后执行：
node scripts/desktop-native-e2e.mjs --health --isolated-runtime "--expected-identifier=$taskId"
# 验收结束恢复默认标识的构建：
npm --prefix desktop run tauri -- build --debug --no-bundle
```

## 未完成边界

没有文件监听，因此不能判断上次扫描后的源码是否改变；没有在线来源核验、自动修复、通知或显式记忆 CRUD。P7 剩余设置与记忆按总体计划继续，P6 写入仍有真实需求门禁。原生 WebView2 不等于独立浏览器、屏幕阅读器、OS 文件选择器、干净 Windows 安装、远程 CI 或外部模型账号验收；本轮均不宣称这些通过。独立浏览器访问限制未绕过。
