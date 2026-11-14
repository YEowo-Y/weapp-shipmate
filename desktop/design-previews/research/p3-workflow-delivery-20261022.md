# P3 · 项目工作流与领域成果交付记录

日期：2026-10-22。对应[总体计划](../../../.omx/plans/project-completion-plan-20261022.md)的 P3；执行契约见仓库根目录 `.omx/plans/p3-workflow-execution.md`。本记录只说明本轮范围，不代表 P0–P8 全部完成或正式发行就绪。

## 实现与用户路径

选择项目 → 打开“上线进度” → 填写实际业务与三态事实 → 阅读下一步和官方来源 → 人工确认已完成阶段。未知事实不会视为“否”；不适用必须有明确事实与原因，前置阶段未完成不能跳过确认。撤销记录保留历史；事实、主体、目录或规则变化使旧确认待重检，单纯改名不使事实依据失效。上游确认撤销会让下游显示待重检；上游恢复后，原始依据未变化的历史确认可重新有效。

项目预检、上线清单、拒因反查由一次真实内核执行产生 Markdown 与结构化成果，宿主校验后保存。拒因查询进入项目历史，切换项目会清除旧结果并保留查询文本；停止或迟到结果不能写入新项目的界面。失败不会覆盖上次成功成果。项目历史可比较两次预检：必须同项目、顺序正确、运行成功、主体/事实和工具/规则依据一致、文件集合与扫描策略一致且范围完整，才显示“新增 / 仍存在 / 未再检出”。内容修改可以比较；新增/删除文件、截断、读取失败、超大文件或链接跳过均明确不可比较。未再检出不等于官方审核通过或问题已修复。

正式工作流与预览演示页有明确边界。类目只依据主体和实际业务提供带来源的线索；未匹配不等于无需资质，也不会自动选定类目。模型不参与人工阶段确认，不执行官方提交、认证、付款或发布。

## 复用与简化

保留 Vanilla TypeScript、原生 dialog、Web Awesome、Lucide 与已有 Markdown/拒因组件。没有新增依赖、平行 UI 框架、消息协议或第二份会话存储。

复用现有规则加载与报告渲染，单次执行避免“扫描一次 JSON 再扫描一次 Markdown”的结果漂移；共享纯函数派生阶段，宿主独立校验写入边界。SQLite 使用既有 CAS、在线备份、事务、失败状态恢复与导出；快照不带大段 Markdown/结构化正文，按需取成果。IndexedDB 继续只保存会话。

## 实际修改文件

- 领域：`src/project-artifact.mjs`、`src/project-tool.mjs`、`src/workflow.mjs`、`src/scanner.mjs`、`src/check.mjs`、`src/guide.mjs`；`desktop/scripts/prepare-runtime.mjs` 随包生成 catalog 与完整性清单。
- 持久化与权限：`desktop/src-tauri/src/project_store.rs`、`project_workflow.rs`、`lib.rs`、`desktop/src-tauri/build.rs`、`capabilities/default.json` 与四个生成命令权限。SQLite v2 新增阶段记录，旧项目事实与旧纯 Markdown 成果兼容读取。
- 界面：`desktop/src/workflow.ts`、`projects.ts`、`main.ts`、`project-explain.ts`、`explain-dialog.ts`、`shared.d.ts`、`desktop/index.html`、`desktop/src/styles.css`、`desktop/design-previews/explain.js`。
- 来源：`rules/onboarding.yaml`、`rules/filing.yaml`、`flow.yaml`、三份 `corpus/source-snapshots` 正文与索引；`desktop/design-previews/stages.js` 同步主体核验标题。
- 回归：`tests/project-domain.test.mjs`、`desktop-runtime-package.test.mjs`、`desktop-security-config.test.mjs`、`desktop-workflow.test.mjs`、`desktop-projects.test.mjs`、`desktop-controls.test.mjs`、`desktop-project-explain.test.mjs`、`local-explain-ui.test.mjs`、`p3-onboarding-rules.test.mjs`，Rust 内联测试及 `scripts/desktop-native-e2e.mjs`。
- 记录：`docs/12-current-capabilities.md`、`docs/11-outreach-plan.md`、`desktop/README.md`、来源研究与本记录、`.omx/plans` / `.omx/state/p3-workflow`。

## 来源核验

[来源研究与落地记录](p3-domain-sources-20261022.md)包含真实 HTTP 页面、指纹、引用与适用边界。新增注册、仅企业适用的主体核验、审核后人工发布三条规则；修复已确认返回 404 的备案旧地址。主体核验与付费微信认证分开；未把固定费用、模糊主体适用性或社区说法写成统一强制要求。

来源主要为微信[接入指南](https://developers.weixin.qq.com/miniprogram/introduction/)、[认证指引](https://developers.weixin.qq.com/miniprogram/product/renzheng.html)、[现行备案指引](https://developers.weixin.qq.com/miniprogram/product/record/record_guidelines.html)。未登录微信后台，也没有重新抓取全库所有旧规则的实时正文。个人/个体工商户主体核验细化仍明确覆盖不足。类目金融/教育正文存在排版或范围变化，记录差异但未未经评审改写其规则。

## 验证证据

风险级别 high：迁移、IPC、跨项目状态与规则判定。项目质量命令从 package manifests、`.github/workflows/ci.yml`、docs/06 发现；本机 Windows 执行不等于远端 CI 全矩阵。证据根目录 `.omx/artifacts/p3-workflow/`。

| 检查 | 观察结果 |
|---|---|
| 修改前基线 | Node 1017/1017，`baseline.log` |
| 集成全量 `npm test` | 最终 1054/1054，0 skipped，`node-final.log` |
| 最后界面排序后定向 | workflow + controls 43/43，`layout-final.log` |
| `npm run lint` / TS | 通过；现有 ESLint 配置不覆盖桌面 TS，TS 由 `tsc` 检查 |
| Schema / 引文 | 66 条规则有效，66/66 引文通过，`quotes-final.log`；其中两条既有规则为人工快照，不能等同自动抓取 |
| coverage | precision/recall 1.000，TP55/FP0/FN0；仅 30/71 可命中规则有原准确性锚点，不是全业务准确率，`coverage-final.log` |
| Rust | 40/40、Clippy `-D warnings`、cargo fmt 与 include 文件单独 rustfmt，通过 |
| 依赖审计 | 根与 desktop 生产 npm 依赖 0 已知漏洞，`root-audit.json` / `desktop-audit.json`；不是无漏洞保证 |
| 构建 | Tauri debug + 随包运行时、TS/Vite 通过；最终默认标识构建记录见 `default-final-build.log` |
| 原生验收 | 最终界面 14/14，结果与截图见下方 |
| 独立评审 | 27 文件，无未解决阻塞；独立执行 Rust 40、领域/工作流/explain 28、控制/项目 45、CLI/扫描/运行时 110 项，以及 tsc/Clippy/lint |

独立评审修复了忙态打开旧项目表单误写风险、v1 缺表情况下迁移提前改变原文件、前置撤销未传播、宿主校验不足和结构化保存失败终态问题。相应回归已保留。

首轮完整原生结果：`.omx/artifacts/desktop-model-native/run-2026-10-22T20-12-45-322Z/results.json`，14/14。真实 SQLite v1→v2 迁移与备份、事实保存、未知与前置门禁、重启恢复、规则版本拒绝、事实失效、两项目隔离、真实比较、文件集合变更不可比、旧 Markdown、结构化拒因、畸形工具输出恢复、窄屏键盘和无横向溢出。迁移夹具为明确标记的 v1 数据；畸形输出只注入隔离运行时；无 invoke mock、无外部模型请求。

最终截图复查把“下一步”移至事实编辑区之前，压缩无内容状态栏，保持原有表单与保存行为。比较选项增加可读编号，并沿用宿主记录顺序，避免同毫秒报告前后倒置；独立 14/14 项目回归和追加评审通过。

**最终原生复验 14/14**：`.omx/artifacts/desktop-model-native/run-2026-10-22T20-18-36-926Z/results.json`。标识 `com.weappshipmate.acceptance.p3.1792700077695`，验收 exe SHA-256 `ec4fb1b7ccb584b4126fdd8b7be7d7933ece885118fe3a2f9aa8f8f1bba2bc3b`。窗口约 1000×720、1200×850 与 390×845，原生设备缩放下截图像素大于窗口逻辑尺寸。实际检查 `p3-workflow-wide.png`、`p3-workflow-narrow.png`、`p3-comparable-checks.png`：首屏下一步可见，报告编号可区分，窄屏无横溢出，焦点未逃出模态。未实测正式桌面的深色切换；这不是竞品像素级复刻声明。最终视觉记录在 `.omx/state/p3-workflow/ralph-progress.json`。

验收隔离副本复制完毕后，已重新成功构建默认 `com.weappshipmate.desktop` 标识的 debug exe（`default-final-build.log`），没有启动它迁移用户数据库；现有安装版不受影响。

## 启动、数据与恢复

无需新增环境变量。安装了项目现有依赖与 Rust/WebView2 后，仓库根运行 `npm --prefix desktop run tauri dev`；`npm --prefix desktop run tauri -- build --debug --no-bundle` 构建本机调试包。`prepare:runtime` 自动准备锁定的 Node/规则资源。没有更新用户现有安装版、发布安装包或运行生产数据库迁移。

正式项目库为 `%APPDATA%/com.weappshipmate.desktop/projects.sqlite3`。此次原生测试只使用全新的 `com.weappshipmate.acceptance.p3.<数字>` 标识、独立 WebView2 目录和带中文/空格的隔离运行时，未改动生产数据。升级前自动在线备份；损坏结构/未来 schema 在只读预检即拒绝，失败不改原文件。v1→v2 是加表迁移，不删除旧记录；旧客户端遇新版本必须拒绝。恢复使用已验证备份，不手工降低 `user_version`。历史成果和人工记录纳入项目导出，会话备份仍独立。

## 未完成与交付边界

- Work 设置禁用浏览器访问；本轮只有 Windows 原生 WebView2 验收，未绕过限制，也不称浏览器通过。
- P3 的 5 名真实目标用户试用尚未开展；[试用脚本与空台账](../../../docs/11-outreach-plan.md)已准备，没有伪造反馈或发送邀请。
- 原生系统目录选择器、物理磁盘耗尽、无开发工具的干净 Windows、签名和安装版升级尚未实测；此前 SQLite 页数限制故障只是模拟容量不足。
- 主 JS 包约 533.32 kB / gzip 176.73 kB，较 P2 约增加 17.33 kB / gzip 5.75 kB。现有 Vite 大包/混合导入警告仍在，保留 P8 测量拆包工作，不通过提高阈值隐藏。
- 无真实外部账号授权或新模型评测。本轮是确定性领域工具，系统凭据、完整 Agent 工具循环、受限写入与维护功能仍按 P4–P8 推进。

本轮结论：P3 代码、独立评审、构建和本机原生验收完成；真实用户验证及上述环境门禁分别保留，不能把这些缺口记为 PASS。后续实施阶段为 P4 模型连接、系统凭据与透明上下文。
