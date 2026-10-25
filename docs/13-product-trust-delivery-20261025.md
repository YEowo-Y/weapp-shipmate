# 13 · 可信结果与新手体验修正（第一批）

日期：2026-10-25。范围为产品复审的 R1–R4，以及同一 CLI/报告路径中的中文参数、目录错误、重复提示和说明口径。此批没有新增依赖，也没有替换原有设置页改动。

## 已实现

| 问题 | 当前行为 | 主要文件 |
|---|---|---|
| 未回答被当作“否” | 未传布尔参数保持未知；`--no-sensitive` / `--no-domain` / `--no-payment` 表示明确否定，矛盾参数报错 | `src/cli.mjs` |
| 参数、错误对新手不友好 | 支持“个人 / 个体户 / 个体工商户 / 企业”；目录缺失、路径不是目录、权限不足给中文提示 | `src/cli.mjs` |
| 未扫描却宣称发现代码问题 | 需要源码匹配或关键词信号的 guide 规则列为条件自查；实际 check 命中仍按扫描证据处理 | `src/guide.mjs` |
| 精简报告隐藏检查限制 | checklist、仅阻断项及零命中结果保留配置解析失败、扫描范围和动态 URL 限制；完全相同的备注合并并保留关联规则 | `src/report.mjs`、`src/cli.mjs` |
| 人工处理被误称为官方后台操作 | 条目改为“需人工确认/处理”；未匹配拒因不再重复两次 | `src/report.mjs` |
| 外部会话自称本机执行结果 | 导入解析与合并均强制标记来源，持久化及再次导出/导入保留；忽略备份自称的 local/verified 身份 | `session-transfer.js`、`session-store.js` |
| 报告入口无反馈或关联不可信 | 核验当前项目、成果、成功运行及版本关联后才打开；缺失、关联错误、未归属项目给恢复说明；切换会话后的迟到响应不覆盖新状态 | `desktop/src/sessions.ts`、`conversation.js` |
| 导入清单在卡片/复制中丢失来源 | 卡片、引用、复制、Markdown、JSON notes 均注明外部历史未核验；核验本机成果不等于核验导入摘要 | `components/message.js`、`guide-artifact.js`、`conversation.js` |
| 恢复提示显示不完整 | 成果操作复用 action announcement，避免完成态隐藏或被旧复制定时器清空；浮动“回到最新”随阅读区底边定位，避开长提示 | `conversation.js` |
| 粘贴长清单触发尺寸观察错误 | 观察器内的输入框高度调整合并到下一动画帧；直接输入保持同步调整，销毁时取消待执行帧 | `conversation.js` |

`session-*.js`、`conversation.js`、`guide-artifact.js` 和 `components/message.js` 位于 `desktop/design-previews/`，这些共享实现同时用于正式桌面端。`desktop/src/shared.d.ts` 同步了成果回调和清单导出的参数类型。

README、当前能力台账和路线图更新了当前口径：CLI guide 还不是交互问答；`payment/business` 只提供说明线索，不参与规则筛选。旧路线图统计属于历史基线。

## 复用与简化

- 沿用现有 CLI 参数解析、规则引擎、Markdown 渲染、会话存储、Tauri 成果读取和运行历史，不建立第二套协议或存档格式。
- 统一报告备注收集，合并完全重复内容；不同的诊断补充仍保留，避免去重丢失信息。
- 新来源字段可选并向后兼容；内部主体枚举、现有存档版本及 Rust 数据库结构不变。
- 原生验收扩展现有 `--agent` 路径，新增 `scripts/native-result-trust-acceptance.mjs`，不另建驱动体系。

尺寸观察处理参考 [MDN ResizeObserver 的 Observation Errors](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors)：避免在通知交付中同步改变被观察布局。修复保留了既有跟随阅读位置的逻辑，没有过滤或忽略错误事件。

## 验证

| 检查 | 结果 |
|---|---|
| 全量 `npm test` | 1,339 / 1,339 通过，无跳过 |
| 根 ESLint 与显式检查被忽略的共享前端 JS | 通过 |
| `npm run verify:quotes` | 66 条非草案规则引用校验通过；保留原有 2 项人工快照核实说明，未宣称本次实时访问所有官方页 |
| `npm run coverage` | 固定语料 TP 55 / FP 0 / FN 0；30 / 71 可匹配规则有锚点，不能据此宣称全场景准确率 |
| CLI 实际执行 | 6 个场景通过：默认未知、中文主体和条件自查、明确否定、损坏配置精简报告、目录不存在、拒因未匹配 |
| TypeScript / Vite / Windows Tauri debug 构建 | 通过；仍有现存分包警告，最大 JS 约 937 kB（gzip 308 kB） |
| 独立代码复审 | 通过；复审发现的导入清单来源和完成态提示隐藏问题均先补回归再修复 |
| Windows 原生自动化 | 17 / 17 通过；覆盖实际工具执行、停止/错误恢复、导入来源、草稿保留、重启、报告关联、未归属历史、窄屏提示、真实复制与 Ctrl+V 粘贴；新增来源验收捕获前端错误 0，未增加模型请求 |

回归覆盖文件：`tests/cli.test.mjs`、`guide.test.mjs`、`guide-contract.test.mjs`、`report-diagnostics.test.mjs`、`session-transfer.test.mjs`、`session-store.test.mjs`、`desktop-sessions.test.mjs`、`conversation-continuity.test.mjs`、`guide-artifact.test.mjs`。

本机日志位于 `.omx/reviews/product-audit-20261025/`，包括 `fix-tests.log`、`fix-native-build.log`、`fix-cli-smoke.json` 和 `fix-native-e2e.log`。`.omx` 为本机验收产物，不随普通 Git 提交分发。

最终原生证据：`.omx/artifacts/desktop-model-native/run-2026-10-25T15-19-40-212Z/`。`results.json` 记录 17 项通过及二进制 SHA-256 `5a4e5a2b30f02a0da0c65f2d339e47f5b170f9f29de9b74fce9cd350d682aad9`；`result-trust-evidence.json` 标明导入样例、真实原生存储及请求增量。已检查 `trust-reference-recovery.png`、`trust-recovery-narrow.png` 和 `trust-imported-guide.png`，来源说明可读，恢复提示与浮动按钮不重叠。

验收中先后修正了测试脚本的历史入口选择器、程序化剪贴板读取方式，以及实际发现的完成态提示隐藏、长提示遮挡和长文本尺寸观察问题。最终记录来自修复后重新构建、全新隔离数据目录的完整重跑。

## 启动与复验

开发环境已有依赖时，在仓库根目录运行：

```powershell
node src/cli.mjs guide --subject 个人
node src/cli.mjs guide --subject 个人 --no-sensitive --no-domain
npm test
npm --prefix desktop run build
npm --prefix desktop run tauri -- dev
```

本次修复不新增环境变量。模型连接仍按现有界面配置。原生测试使用带唯一 identifier 的隔离构建，按 `desktop/README.md` 准备 Tauri/Edge WebDriver；不要用正式用户数据目录执行测试。

## 剩余边界与下一批

- 修复前已经保存且没有来源字段的旧记录，无法追溯辨认是否曾导入。新的导入才强制补来源；成果入口统一在打开前核验关联。
- 当前核验复用已有运行历史窗口。超出窗口的旧报告可能无法从会话入口核验，需要从项目历史重试、在原设备导出或重新检查；本批未增加 Rust 查询接口。
- 会话备份仍不包含完整项目成果、项目记忆或模型密钥；项目导入恢复、文件写入和撤销未在本批实现。
- 原生模型响应使用明确标记的协议 fixture；本机扫描、Rust IPC、SQLite、WebView2、会话导入和重启是真实执行。未验证外部付费模型账号、签名安装包或通知可见投递。
- 本地通过不等同 GitHub CI 或正式发布。本批保留已有设置页 WIP，未据此宣称整个 UI 迁移或全部路线图完成。
- 下一批优先：容量上限后的恢复路径、guide 交互问答、拒因同义表达与结果分层；之后推进可分发安装方式和真实用户试用，再处理更多模型工具调用、受限修复与项目恢复。
