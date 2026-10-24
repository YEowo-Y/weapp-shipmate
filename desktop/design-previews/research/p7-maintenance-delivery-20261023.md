# P7 第三段：可关闭的文件监听、应用内通知与正式偏好设置

2026-10-23。本段补齐正式 Windows 桌面的本机维护路径；不代表 P7 全阶段或安装分发验收完成。无新增依赖、数据库迁移或环境变量。

## 用户路径与实际行为

- 工作台 → 项目维护，或更多功能 → 项目维护与重检。文件监听和应用内通知分别默认关闭，按项目保存；修改后点击保存才生效。
- 只监听当前已保存的项目。启用、重试和重启只恢复监听，不立即扫描或重放旧任务。退出应用后不继续后台监听。
- 文件变化合并后复用只读预检；不运行项目脚本、不写项目、不请求模型。已有工具忙时等待；执行中最多保留一次后续检查。
- 停止本次自动预检清除排队和当前自动任务，之后新的修改仍可触发。停用监听、切换项目、目录失效和退出会销毁监听并取消其任务。错误暂停，用户明确重试后恢复。
- 仅从成功、完整、同项目且同依据/扫描范围的报告比较中产生新增问题提醒。首份报告、规则或文件清单改变时只建立基线，不伪称发现新增问题。历史报告不代表当前文件已通过。
- 提醒持久去重，最多保留 50 条；可全部标为已读或打开对应保存报告。打开失败不标已读。后台完成不打开弹窗、不替换当前报告、不抢焦点；未读入口消失后关闭面板回到“更多功能”。
- 偏好设置 → 主题、正文大小和界面动效，按设备保存、写入成功后即时生效。跟随系统、浅/深色、14/16/18px 正文、减少动效；恢复默认只修改外观配置。模型、数据、项目与维护入口复用现有界面。
- 背景记录刷新保留项目设置中尚未保存的编辑和新建项目草稿；项目切换或显式保存仍按既有流程更新。

## 修改与复用

| 文件 | 内容 |
|---|---|
| `desktop/server/project-watch.mjs`、`src/scanner.mjs` | Node 原生递归监听；复用扫描忽略规则与扩展名边界；合并变化、检查根目录身份、关闭管道退出 |
| `desktop/src-tauri/src/project_maintenance.rs` | 持久配置/通知、当前项目调度、6 个受主窗口权限约束的 IPC、代次和任务取消、子进程生命周期 |
| `project_store.rs`、`project_workflow.rs` | 复用全局工具锁及预检执行、提取既有可比报告判断；成果提交时再次核验授权；导出包含维护文档 |
| `lib.rs`、`build.rs`、`capabilities/default.json`、维护命令权限文件 | 管理状态、生命周期与最小 IPC 权限 |
| `desktop/src/maintenance.ts/.css`、`project-health.ts/.css` | 共用项目维护弹窗、明确状态、开关、草稿、通知与恢复；历史依据用原生 details 展开 |
| `desktop/src/preferences.ts/.css`、`main.ts`、`index.html`、`styles.css` | 共用 Web Awesome、Lucide、主题 token；正式外观、入口、正文字号继承与隐藏入口焦点恢复 |
| `desktop/src/projects.ts` | 元数据刷新与未提交编辑分开，保留项目草稿 |
| Node/Rust 回归、`scripts/native-maintenance-acceptance.mjs`、`desktop-native-e2e.mjs` | 持久化、并发、失败、生命周期、真实 Windows 交互及视觉证据 |

没有增加第二套组件库、状态库、通用文件权限或模型协议。通知已读变化不增加配置 CAS 版本；设置损坏不静默覆盖。项目导出新增维护文档，但仍没有项目备份导入恢复。

## 平台依据与取舍

复用随包 Node 24.22.1 的 [fs.watch](https://nodejs.org/docs/latest-v24.x/api/fs.html#fswatchfilename-options-listener)，而非增加 watcher 依赖。500ms 静默窗口、最长 3s 合并窗口、1s 根目录身份检查。Windows 移动根目录可能不发事件，网络文件系统监听也可能不可靠；因此保留显式重检、状态错误与重试。事件只表示需要重新扫描，不作为读取授权或确定的文件变更事实。[Node caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats)

本轮通知明确为应用内通知。WebView2 不自动提供网页通知权限提示，宿主需要处理授权；仅调用浏览器 Notification API 不足以实现系统通知。[Microsoft 权限说明](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2permissionkind?view=webview2-dotnet-1.0.3537.50)

官方 Tauri 通知插件是后续候选；按项目“无明确请求不新增依赖”的约束，已询问用户是否允许这一项依赖，本轮尚未收到选择，未安装或伪装系统通知。Windows 安装态身份、权限与可见投递也不能由 debug no-bundle 验收替代。[Tauri Notifications](https://v2.tauri.app/plugin/notification/)

## 验证记录

最终隔离 Windows 原生验收 **16/16 通过**：14 项本段功能检查，加 2 项真实启动及 CSP/ACL 检查。使用真实 SQLite、随包 Node 文件监听与扫描器、WebView2 和新的应用标识；只在临时运行时增加计时包装，以验证执行中的取消，不模拟 IPC 或检查结果。

- [原生结果与二进制指纹](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T19-39-46-345Z/results.json)：前端异常为空，模型请求为 0；两次退出检查均无所属 Node 子进程残留。默认用户数据库未使用。
- [观察记录](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T19-39-46-345Z/maintenance-observations.json)：监听进程关闭/开启/再次关闭为 0/1/0；文件风暴最多触发两次实际检查。关闭、切换、重试、重启不重放的负向断言每次连续观察约 4.6s，超过事件合并与调度窗口，不宣称无限期证明。
- [窗口测量](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T19-39-46-345Z/maintenance-visuals.json)：弹窗宽度上限 620 CSS px；390px 窗口内宽 356px，两侧各 17px；页面和弹窗横向溢出均为 0。键盘焦点、Esc、设置入口跳转、18px 正文重启恢复及恢复默认 16px 均通过。
- [默认关闭界面](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T19-39-46-345Z/p7-maintenance-default-off.png)、[深色设置](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T19-39-46-345Z/p7-preferences-dark.png)、[窄窗设置](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T19-39-46-345Z/p7-preferences-narrow.png)已实际查看。将次要历史依据收进原生 details，让维护开关、保存与状态进入宽窗口首屏；长内容在弹窗正文内滚动，底部关闭入口保持可见。

Node 全量 **1228 项通过，0 跳过**；Rust **71 项通过，2 项既有 Windows 假凭据测试 ignored**；lint、fmt、clippy、TypeScript/Vite 和隔离 Tauri 构建通过。逐字来源核验 66/66，标注样本的规则覆盖率脚本通过（precision/recall 均为 1，非产品测试覆盖率）；其中 2 条仍使用既有人工来源快照，不是本轮在线重新核验。Node、lint、coverage 和构建日志位于 `.omx/artifacts/p7-maintenance-*.log`。

独立只读评审指出并已修复：报告局部字号覆盖、后台刷新清空项目草稿、执行状态切换误触发刷新、通知写入失败状态被成功结果覆盖、未读入口隐藏后的焦点归还。补充对应回归后复审无新阻断项。前两次原生运行分别停在脚本对“1 条提醒”的数值解析和已卸载 dialog 的空值读取；修复断言后完整重跑，失败证据保留于 `run-2026-10-23T19-33-29-807Z` 与 `run-2026-10-23T19-36-41-795Z`，未计作通过。

验收后已成功恢复默认 `com.weappshipmate.desktop` 构建，没有启动默认用户资料。默认 EXE SHA-256 为 `3b7fc17209d9bffdde08ba0c302e3e3d3d2bac06a15d6fa047a4479d6e07520b`；[恢复记录](../../../.omx/artifacts/p7-maintenance-default-binary.json)确认包含默认标识且不含本次隔离标识。主 chunk 为 610.48 kB（gzip 201.89 kB），相对本段前 593.46 kB 增加 17.02 kB；拆包留待 P8。

## 启动与验收复现

启动：`npm --prefix desktop run tauri -- dev`。维护与偏好不要求模型密钥。正式 SQLite/监听能力不由浏览器设计预览提供。

原生验收顺序执行，前一步失败时不继续；每次必须使用新标识，不使用默认用户资料库：

```powershell
$taskId = 'com.weappshipmate.acceptance.p7maintenance.' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$taskDir = Join-Path (Get-Location) '.omx/artifacts/p7-maintenance-recheck'
New-Item -ItemType Directory -Path $taskDir -Force | Out-Null
$taskConfig = Join-Path $taskDir 'tauri-acceptance.json'
@{ identifier = $taskId } | ConvertTo-Json | Set-Content -LiteralPath $taskConfig -Encoding utf8
npm --prefix desktop run tauri -- build --debug --no-bundle --config $taskConfig
node scripts/desktop-native-e2e.mjs --maintenance --isolated-runtime "--expected-identifier=$taskId"
npm --prefix desktop run tauri -- build --debug --no-bundle
```

## 剩余边界

系统通知、规则来源在线保鲜、安装版/干净 Windows/签名更新仍未完成。网络共享上的监听可靠性、独立浏览器、读屏器和真实外部账号未验证。没有绕过 Work 浏览器访问限制，也未修改现有用户数据库。Vite 既有混合导入与大于 500kB 主 chunk 提示保留，未提高阈值隐藏提示。
