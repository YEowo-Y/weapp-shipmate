# P2：项目、运行与成果持久化

日期：2026-10-22。范围为总体计划 P2 的正式 Windows 桌面；实现、本机自动化与独立评审已完成，分发门禁仍待验。P3 的阶段进度、报告比较及统一领域成果尚未实现。

## 实现与用户路径

侧栏选择项目 → 项目与成果中保存目录、名称和主体 → 在项目工具中运行预检或生成清单 → 自动保存运行与报告 → 查看、复制或明确加入同项目会话。项目管理中可查看历史报告、移动当前会话和导出完整项目数据。旧会话保留为“未归属项目”。

- SQLite 保存项目、运行与不可变成果；IndexedDB `desktop-local` 继续保存会话、草稿和阅读状态，没有双写消息或迁移聊天引擎。
- 项目切换保留各自会话与草稿；关联和切换使用已有 CAS 提交。可信项目库恢复导致关联失效时，原消息事务性恢复到未归属；项目注册表未加载时拒绝导入，不猜测项目是否存在。
- 目录丢失可重新定位，预检暂停；旧报告仍可读。报告显示时间、工具版本、项目元数据版本和历史快照说明，运行详情保留输入范围和规则文件 SHA-256 集合。该版本不代表完整 Git/文件快照，也不证明当前文件仍通过检查。
- 新运行失败或停止不覆盖旧成果。准备阶段即取得可取消执行租约，停止不会因开库等待而失效。运行状态由类型化执行结果驱动。
- 会话存储不可用或用户选择临时会话，不阻断独立的本机项目工具；临时内容不自动关联、持久化或外发。

## 文件与简化

| 文件 | 改动 |
|---|---|
| `desktop/src-tauri/src/project_store.rs` | 项目仓库、迁移、备份、原生命令、真实运行入库和故障测试 |
| `desktop/src-tauri/src/lib.rs`、`tool_runner.rs` | 注册仓库和受控命令；类型化取消与 RAII 租约，保留旧字符串命令 |
| `desktop/src-tauri/Cargo.toml`、`Cargo.lock`、`build.rs`、`capabilities/default.json`、生成权限 | 锁定 SQLite 依赖和主窗口最小命令权限，不开放 SQL/任意文件写入接口 |
| `desktop/src/projects.ts`、`index.html`、`styles.css` | 复用现有弹窗、按钮、图标和设计变量，增加项目入口、历史、错误恢复与导出 |
| `desktop/src/main.ts`、`sessions.ts`、`shared.d.ts` | 接入保存后的真实成果，防跨项目加入报告；复用单个聊天控制器 |
| `desktop/design-previews/session-store.js`、`session-workspace.js`、`session-data-dialog.js` | 添加可选关联、按项目当前会话与原子恢复，保留旧备份兼容 |
| `tests/desktop-projects.test.mjs`、`desktop-controls.test.mjs`、会话相关测试、`desktop-security-config.test.mjs` | 项目路径、存储失败、关联/切换/导入与权限回归 |
| `scripts/desktop-native-e2e.mjs` | 独立应用标识的 P2 原生验收；只在隔离副本注入故障 |

删除了桌面目录/报告仅靠内存作为唯一数据来源的路径。没有引入 React、ORM、另一套消息协议或重复组件库；项目导出复用原生下载能力，避免旧小文件下载 helper 的 1 MiB 限制截断完整历史。

## 存储、恢复与依赖

数据库位于 Tauri `app_data_dir()/projects.sqlite3`，正常 Windows 标识为 `com.weappshipmate.desktop`。独占文件锁阻止第二实例把第一实例的活跃运行误恢复为中断，关闭持有者后可重试。

现存数据库先只读检查，未来版本、损坏文件及无法识别的旧表拒绝自动修改。升级前使用有截止时间的 SQLite 在线备份并验证完整性，事务内再核对 schema，DDL 和 `user_version` 一次提交；失败不重建空库。当前仅有 v1 初始化路径，不能称为已经验证未来未知版本的迁移。

数据库恢复须先退出应用，保留原数据库及备份，再使用完整且版本匹配的 SQLite 快照。不要用覆盖空库处理损坏。应用不会自动导入项目 JSON，也没有删除/清理历史成果的界面。

单成果最大 2 MiB，成果总量 64 MiB，运行最多 10000 条、项目最多 200 个。摘要窗口为最近 200 条并保留每项目最近成果及对应运行，完整导出不按窗口裁剪。达到上限会明确失败而不删除旧数据；导出本身不会释放存储配额。逻辑限额写入失败终态；真实数据库不可写时只在当前进程显示明确标注的未保存终态，重启按中断恢复。

采用 `rusqlite =0.40.2`，仅 `bundled` 和 `backup` 特性；实际 `libsqlite3-sys 0.38.2`/SQLite 3.53.2。本机 Rust 1.94.1 编译验证通过，没有宣称未声明的精确 MSRV。依据：[rusqlite](https://docs.rs/rusqlite/0.40.2/rusqlite/)、[在线备份](https://www.sqlite.org/backup.html)、[事务](https://www.sqlite.org/lang_transaction.html)、[PRAGMA](https://www.sqlite.org/pragma.html)。

新增 5 个锁定包：rusqlite、libsqlite3-sys、fallible-iterator 0.3.0、fallible-streaming-iterator 0.1.9、vcpkg 0.2.15；本地 registry 许可证为 MIT 或 MIT/Apache-2.0。核查 [RustSec 官方快照](https://github.com/RustSec/advisory-db/tree/640bf5a9f06e66d8721e8772766531fe77c8630d) 未发现这些版本命中所列公告。`cargo audit` 未安装，此人工限定审计不是全锁文件或 bundled SQLite 全量 CVE 扫描。

## 启动与验证

启动：仓库根目录运行 `npm --prefix desktop run tauri dev`；构建：`npm --prefix desktop run tauri -- build`。正常功能不需新增环境变量或模型密钥。已有安装版不会自动被本轮源码替换。

本轮已观察到：

- `npm test`：1017 通过、0 失败、0 跳过。
- `cargo test --lib`：33 通过，覆盖迁移回滚、损坏/未来版本保留、锁等待、跨实例互斥、CAS、容量失败、启动中断恢复、准备阶段取消及完整导出。
- TypeScript/Vite、`npm run lint`、Rust fmt/全目标 Clippy 通过。共享预览 JS 被既有 ESLint 配置排除，另由语法检查与行为测试覆盖，不宣称已 lint 全覆盖。
- 规则引文 63 条通过（其中 2 条来自人工快照）；固定语料 TP55/FP0/FN0，只有 30/68 条可命中规则有标注锚点，不代表全领域准确性。
- 根目录和桌面 `npm audit --omit=dev` 均为 0 已报告漏洞。
- 独立评审发现并关闭 9 项故障/恢复问题，最终无未解决发现；不替代原生或外部环境验收。
- 最后一次日期格式修改后，桌面控制定向回归 31/31、lint、TypeScript/Vite 与 Tauri debug 构建通过；最终隔离原生验收 16/16。日期截图为中文、24 小时制。

单元、规则与构建日志位于 `.omx/artifacts/p2-persistence/`，其中 `npm-test.log`、`rust-test.log`、`controls-green.log` 和 `default-build.log` 分别对应上述证据。

原生验收命令：`node scripts/desktop-native-e2e.mjs --projects --isolated-runtime --expected-identifier=com.weappshipmate.acceptance.p2.1792697993404`。需先用同一独立标识构建；脚本拒绝默认产品标识和已有验收数据库。测试副本位于 Unicode 临时路径、只带随包运行时，PATH 不含 Node；数据库使用独立 app data，未修改生产项目数据。慢执行和缺失 CLI 故障仅注入隔离副本，结束恢复。

16 项涵盖两项目和未归属会话的草稿隔离、表单改名、真实清单与预检入库、重复运行 ID 拒绝、停止及失败保留成果、旧会话关联、真实 JSON 下载、目录丢失与重定位、刷新和进程重启恢复、窄屏和键盘操作。测试目录创建与重定位使用实际类型化 IPC；未自动操作系统文件选择器，没有模型请求。

最终证据：[结果](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T19-48-36-556Z/results.json)、[布局与焦点记录](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T19-48-36-556Z/project-visuals.json)、[项目管理宽屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T19-48-36-556Z/p2-projects-wide.png)、[窄屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T19-48-36-556Z/p2-projects-narrow.png)、[已保存报告](../../../.omx/artifacts/desktop-model-native/run-2026-10-22T19-48-36-556Z/p2-project-report.png)。

截图人工检查：弹窗稳定后不透明，390 CSS px 窗口下左右为 17–373 px，页面和弹窗均无横向溢出。关闭后焦点恢复到触发按钮；原生 dialog 的 Tab 边界有一次 `document.activeElement=BODY`，下一次返回弹窗，没有后台应用控件获得焦点。保留浏览器原生焦点行为，不把这称为完整无障碍合规审计。测试截图包含明确标记的临时验收项目，不是用户生产数据。

Vite 仍提示主包约 516 kB（gzip 171 kB）和已有静态/动态混合导入；没有因此把整个工程改成新的前端栈。

## 验收边界

SQLite `max_page_count` 是容量故障测试，不等同真实物理磁盘耗尽；临时损坏文件和锁测试也不等同断电硬件试验。浏览器受 Work 设置限制，原生 WebView2 不冒充浏览器验收。干净 Windows、签名、更新、外部厂商真实账号和真实用户试用仍按 P1/P3/P4/P8 分列待验。
