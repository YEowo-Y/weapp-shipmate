# P5 · 有界项目助手与只读工具闭环

日期：2026-10-23。对应[总体计划](../../../.omx/plans/project-completion-plan-20261022.md)的 P5，范围以[执行合同](../../../.omx/plans/p5-agent-execution.md)为准。**P5 本机实现与隔离 Windows 验收完成：Node 1137 项、Rust 57 项、原生端到端 11 项通过。** 真实本地工具经过实际 SDK/原生执行链路，模型侧使用确定性协议 fixture；真实模型质量评测仍待，P6–P8 未完成，不能据此宣布生产发布就绪。

## 已接入的用户路径

1. 保存并选定当前项目，将会话关联到该项目；在模型连接中连接并选择 OpenAI 模型。其他服务商继续普通文本聊天，本阶段没有同时迁移全部提供方的工具调用。
2. 输入区“项目工具”打开当前会话权限面板。默认不允许读取项目，也不允许发送结果摘要；分别勾选“允许读取当前项目”和“允许发送筛选后的结果摘要”。关闭读取仍可进行普通对话；未开启摘要外发时，本机工具照常运行，模型只收到固定的本机报告提示。
3. 用户发送请求后，由模型按需调用唯一的 `project_read`，其 `kind` 仅为预检、上线清单或拒因解释。缺少拒因描述时应先询问。模型不能传入目录、身份、权限或任意命令。
4. 对话按真实顺序展示文字、准备执行的工具记录、成功结果或失败信息。结果卡片包含摘要、规则依据与项目/事实版本，并可打开已保存的完整本机报告。预检发现问题不等于工具进程失败，工具完成也不等于项目通过合规审查。
5. 停止关闭当前模型请求并取消关联的本地运行，保留已经生成的文字与成功结果。失败由用户明确重试；不会自动重复工具或付费请求。会话和工具记录可恢复，未完成记录在重启后标为停止，不冒充断点续跑。

读取与摘要外发选择仅保存在当前应用内存，按当前项目和会话绑定；切换会话、项目、服务商或重启后重新开启。历史消息、导入数据和保存的模型元数据不能恢复权限。运行中暂时禁用权限修改，避免界面与实际请求范围不一致。

## 执行、数据与失败边界

OpenAI Agent 路径使用 SDK 标准 UI Message Stream。文本与工具分别存入既有顺序 parts；`tool-input-available` 只表示参数就绪，界面不因此宣称本地工具已成功运行。上游必须明确结束工具步骤后才允许启动原生执行，断流与截断不得变成成功终态。

- 每次最多 3 个模型步骤、2 次本机工具；禁止并行、重复调用和自动重试。总请求最长 120 秒，本地工具最长 30 秒；本机执行器保持全应用单任务运行，忙碌直接提示，不伪装排队。
- Rust 在模型请求入口核对当前已保存项目，建立 `requestId` 绑定。私有 stdio RPC 不接收模型自定项目路径，不暴露为 WebView 公共工具命令；停止、退出和终态撤销授权，迟到请求不能启动新任务。
- 输入与结果经过严格契约校验，拒绝额外字段。结果只投影运行/成果 ID、类型、摘要、总数、最多 20 个规则条目及版本/范围信息，UTF-8 总量最多 24 KiB。来源只允许无凭据 HTTPS 或空值；不向模型发送项目目录、原始代码或 stderr。
- 关闭摘要外发时，`toModelOutput` 仅返回固定的“结果已保存到本机”提示。允许外发时只发送裁剪后的投影；完整报告仍留在本机成果库。P4 显式附加上下文与本权限分别处理，已有资料不会被新开关悄悄扩大。
- 密钥失效、权限不足、限额、网络/服务不可用、本机忙碌、授权失效和工具超时采用受限错误类别与固定恢复提示；不把上游响应体、路径或错误原文直接显示给用户。最终复审状态见验证表。

运行记录增加可选 `agentRequestId`、`sessionId`、`toolCallId` 关联信息，兼容旧记录。会话继续用现有 IndexedDB，项目运行与完整成果继续用 SQLite；没有增加第二份会话数据库或独立持久 Agent 执行器。

## 复用、简化与实际文件

保留 Vanilla TypeScript / Vite / Tauri 2、Web Awesome、Lucide、现有对话框与设计 token。提取复用已有 `project_run` 内部路径、运行取消与成果保存；SDK 接管提供方协议和有限工具循环，本机权限继续由 Rust 判定。没有为了工具卡片迁移 React，也未增加第二套聊天 UI、Agent 框架、网关服务或消息协议。

仅 `desktop` 增加锁定的 `ai@6.0.313`、`@ai-sdk/openai@3.0.131`；CLI 根生产依赖没有增加 SDK。版本与许可证核验见[技术来源记录](p5-agent-sdk-sources-20261022.md)。AI SDK 为 Apache-2.0；随包运行时按显式清单复制 12 个必要包的运行文件与许可，不打包桌面 UI 依赖或 SDK 文档/测试。Zod 是该依赖闭包的必需 peer，并非另引入一套 UI 校验框架。

| 范围 | 本阶段修改或新增文件 |
|---|---|
| SDK 流与私有 RPC | `desktop/server/agent-stream.mjs`、`agent-tool-rpc.mjs`、`model-connections.mjs`、`desktop-bridge.mjs` |
| 原生授权、执行与持久关联 | `desktop/src-tauri/src/agent_tools.rs`、`model_bridge.rs`、`project_store.rs`、`tool_runner.rs`、`lib.rs` |
| 公共数据与权限契约 | `desktop/design-previews/agent-contract.js`、`agent-permissions.js` |
| 流式渲染与存档 | `desktop/design-previews/chat-transport.js`、`desktop-model-fetch.js`、`conversation.js`、`session-store.js`、`components/message.js`、`components/message.css` |
| 正式桌面入口 | `desktop/src/agent-tools.ts`、`agent-tools.css`、`sessions.ts`、`shared.d.ts`、`main.ts` |
| 依赖与独立运行时 | `desktop/package.json`、`desktop/package-lock.json`、`desktop/scripts/prepare-runtime.mjs`；`.github/workflows/ci.yml` 增加桌面依赖安装以运行 broker 测试 |
| 契约与回归 | `tests/agent-contract.test.mjs`、`agent-stream.test.mjs`、`agent-tool-rpc.test.mjs`、`agent-conversation.test.mjs`、`desktop-agent-permissions.test.mjs`、`desktop-sessions.test.mjs`、`conversation-continuity.test.mjs`、`desktop-runtime-package.test.mjs`，以及相关桥接测试和 Rust 模块测试 |
| 确定性评测与原生验收 | `tests/fixtures/agent-eval-v1.json`、`scripts/native-agent-fixture.mjs`、`scripts/desktop-native-e2e.mjs` |

表格仅描述 P5 范围；仓库中已有 P0–P4 未提交修改得到保留。没有提交、推送、安装或发布。

## Quality profile 与证据

本阶段风险 **high**：模型可触发本机项目读取，涉及执行边界、数据外发、取消与持久状态。质量命令从根/桌面 manifests、Tauri 配置、既有原生脚本和 CI **discovered**，P5 受限范围为执行合同 **declared**；没有新增虚构的性能或覆盖率阈值。

| 字段 | 来源与本阶段要求 |
|---|---|
| 工具链与准备 | 根 `package.json`：Node ≥20；随包 Node 24.22.1；桌面 `package.json` / `src-tauri/tauri.conf.json`：Vite、TypeScript、Tauri 2 与 prepare-runtime；Windows 原生构建需现有 Rust/WebView2 工具链 |
| 静态、类型、构建 | `npm run lint`；桌面相关 JS 显式 `eslint --no-ignore`，因为根配置忽略部分桌面源码；`npm --prefix desktop run build`；Rust `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`；Tauri debug 构建 |
| 测试与数据契约 | `npm test`；`cargo test --lib -- --include-ignored`；既有运行时移位测试；新增权限、严格 Schema、乱序/截断流、分享边界、停止与恢复回归 |
| 关键用户路径 | 双授权默认关闭 → 真实本地工具 → 报告卡片/完整成果 → 停止/错误恢复 → 重启恢复记录且权限关闭；模型/项目切换不得继承旧授权 |
| AI 评测 | `agent-eval-v1.json` 六类确定性协议用例由 `tests/agent-stream.test.mjs` 执行，包含正确工具、无工具、缺信息、危险参数、工具失败、取消。判定调用次数、终态与越权阻止；不评价真实模型的选择准确率 |
| CI | `.github/workflows/ci.yml` 的 `validate`：Ubuntu/Windows × Node 20/22/24，lint、test、verify:quotes、coverage，以及指定矩阵腿的 MCPB smoke。远端实际运行结果 unavailable，不能以本机结果宣称 CI 已通过 |
| 恢复 | 关闭“允许读取当前项目”回到原有文本路径；不删除会话或报告。失败保留已有成果，用户显式重试；取消不自动再发请求。回退源码时连同 SDK 的桌面依赖/运行时清单回退，不降级或手改项目库 |

证据目录：[P5 本机日志](../../../.omx/artifacts/p5-agent/)、[原生最终结果](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T16-12-19-191Z/results.json)。下表为本阶段实际读取的结果。

| 检查 | 当前结果与证据 |
|---|---|
| 修改前 Node 基线 | **1098/1098**，`node-baseline.log` |
| 最终全量 `npm test` | **1137/1137**，0 failed / 0 skipped，`node-final.log`；随后仅共享 CSS 与原生布局断言调整，相关消息/流式测试 **23/23**，`visual-regression.log` |
| 既有状态与新工具渲染定向回归 | **150/150**，`ui-targeted.log`；最终覆盖以全量 Node 日志为准 |
| 运行时闭包与移位 | **3/3**，`runtime-trial.log`：损坏拒绝、前一运行时保护、中文空格目录与空 PATH 启动；含真实随包 Node 的 SDK 导入与既有入口冒烟 |
| 根静态检查 | `npm run lint` 通过，`lint-final.log`；不代表被忽略桌面目录获得覆盖 |
| 桌面显式静态、TS/Vite 与验收 Tauri 构建 | 显式桌面 JS lint 通过，`desktop-lint-final.log` 无诊断。`build-acceptance.log` 确认 TypeScript/Vite 与 Tauri debug 构建成功，最终验收标识 `com.weappshipmate.acceptance.p5.1792771913913` |
| 最终 Rust 测试与 Clippy | **57/57**，0 failed / 0 ignored，`rust-final.log`；使用 `--include-ignored`，包含 Windows 凭据测试。`cargo fmt --check` 通过，`rust-fmt-final.log` 无诊断；`clippy-final.log` 确认 `--all-targets -- -D warnings` 通过 |
| 生产 npm 依赖审计 | 桌面 **0 已知漏洞**，`dependency-audit.json`；本阶段未增加 Rust 依赖。RustSec 全量扫描沿用未完成门禁，不以 Clippy 代替 |
| 错误恢复定向独立复审 | 已只读检查 Node 流/RPC、Rust 授权/执行/落盘与两份定向测试；原“错误恢复统一通用提示”项可关闭，未发现该修复范围的新增阻塞项。父线程定向测试 **17/17**，`recovery-review.log`；复审者读取日志，未重复运行测试。具体依据见下文 |
| Windows 原生验收 | **11/11**，`native-final.log` 与上述结果 JSON；实际 WebView2/SQLite/项目工具，独立运行时与测试凭据；包含修复后的工具同行布局、窄窗详情和 Tab 焦点 |
| 最终默认标识构建恢复 | **通过**，`build-default-final.log`；验收副本完成后恢复默认 debug 构建，未启动默认标识应用或打开其用户数据库 |

第一轮全量测试的 3 个失败属于桌面会话 VM harness 未注入新权限组件，已将 harness 接到真实权限/上下文策略并补充会话切换和报告归属回归；最终全量 1137 项通过。原生测试先补齐连接服务就绪等待，再修复权限弹窗末尾 Tab 可离开文档的问题：复用既有首末焦点边界，不影响内部原生导航与 Escape。

首次原生功能通过后的截图发现项目工具标题、图标和箭头错行：CSS 仅匹配旧 `data-component="tool"`。清理计划先记录问题与实际布局断言，再将选择器改为两类卡片已有的 `.tool-details`；保留唯一调用标识，不复制样式、不增依赖。独立只读复审确认运行中文字渐变、减少动效、强制颜色回退、展开与焦点样式均覆盖，未发现该修复范围的阻塞项。最终原生断言检查真实元素的同行中心、间距、默认列表标记、详情缩进及横向溢出。此前尝试复用已用验收标识被脚本安全拦截，未清理数据库绕过；每次实际重跑均重新构建新标识。WebView2 不支持的旧伪元素查询改用真实 `listStyleType`，未放宽布局或业务成功条件。

错误恢复复审确认：HTTP 401/403/429/其他失败分别选择预定义恢复文案，网络建连失败独立提示；非成功响应体被取消而不读取、透传。原生 `ToolFailure` 用枚举判定忙碌、超时和取消，其他诊断归入 `tool_failed`；`run_internal` 在持久记录完成后仍保留这些类型，私有回包仅传固定 `errorCode`。RPC 构造新的固定错误消息，丢弃原生 `error` 诊断；Node 仅用 `Object.hasOwn(recoveryMessages, code)` 取固定 UI 文案，未知码走安全通用提示。工具错误事件和最终错误事件均覆盖为该安全文案，用户停止和总超时在终态分支中分别说明。

所检查路径未通过字符串匹配推断失败类型；Rust 测试特意证明诊断中出现 `tool_timeout` 不会伪装成超时。定向回归覆盖 401/403/429/503、网络失败、busy/tool_timeout/not_authorized/invalid_request、私有 RPC 六类错误码传递，以及超时/退出取消和原始诊断不进入事件。既有本机运行记录仍保存受限诊断供本机排查，它不属于 Agent 结果投影或模型错误输出。此结论只关闭错误恢复修复项，不代替真实账号、原生端到端或全项目安全审计；流格式错误和未知失败保留通用提示是明确降级行为。

## 原生验收与视觉证据

现有验收脚本使用全新 `com.weappshipmate.acceptance.p5.<数字>` 标识、隔离数据库与运行时，覆盖默认双授权、真实预检不分享、清单/拒因工具与分享、成果打开、流式停止、本地进程取消、错误恢复、重启记录及窄窗焦点。模型侧由明确标记的 OpenAI Responses 协议 fixture 提供；它验证链路，不证明真实模型质量。测试不用真实密钥或付费账号，不触碰生产会话和凭据。

最终应用标识为 `com.weappshipmate.acceptance.p5.1792771913913`，验收 exe SHA-256 为 `c290360a8a1d2f786a4e017ef8b1282ddfc2a09544d6cf02b258017c0b5ce86a`。运行时复制到含中文和空格的隔离目录，限制 PATH，使用独立数据库。11 项检查包括实际启动、ACL/CSP、默认双授权、真实不分享预检、两工具三步与受限分享、上游流停止、真实已启动子进程取消、显式错误重试、项目切换撤权、重启恢复记录及窄窗键盘/布局。

人工复核最终截图：[宽窗工具记录](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T16-12-19-191Z/p5-multiple-tool-results.png)、[390 像素窄窗展开结果](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T16-12-19-191Z/p5-tool-expanded-narrow.png)、[窄窗权限弹窗](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T16-12-19-191Z/p5-permissions-narrow.png)。工具图标/标题/状态同行、共享中性色与字号得到保留，结果和权限说明无横向裁切；键盘可达且关闭返回触发器。窗口约 1000×720 和 390×844，截图受 Windows 1.5 倍缩放影响。`P5_*` 英文回复是测试夹具的可识别标记，不是成品文案。判定保存在 `.omx/state/p5-agent/ralph-progress.json`，仅覆盖本轮组件；没有声称全页面像素对齐、深色/高对比实际验收或运行中动画录屏通过。

普通浏览器受 Work 设置限制，本轮没有运行；系统文件选择器也未纳入这 11 项。二者不能用原生 WebView2 结果替代。

## 启动与复现

无新增环境变量。依赖已安装时直接启动；干净 checkout 需同时安装根与桌面锁文件依赖：

```powershell
npm ci
npm ci --prefix desktop
npm --prefix desktop run tauri dev
```

正式桌面通过已有模型连接页面输入/选择凭据，不把密钥写入前端环境变量。无需密钥的本机预检、清单和拒因入口继续可用。单独 `vite` 或静态预览不能提供 Rust 可信项目绑定，因此不是新增 Agent 的完整运行入口。

```powershell
# 从仓库根执行；自动准备随包运行时并构建前端
npm --prefix desktop run tauri -- build --debug --no-bundle

# 原生验收：先用全新隔离标识构建，再传入相同标识
node scripts/desktop-native-e2e.mjs --agent --isolated-runtime --expected-identifier=com.weappshipmate.acceptance.p5.<数字>
```

上例 `<数字>` 必须替换成该次构建的真实唯一后缀，不能直接运行占位值；不得通过清理旧数据库伪造首次运行。用内容为 `{ "identifier": "com.weappshipmate.acceptance.p5.<数字>" }` 的 JSON 配置文件，在 Tauri 构建命令中传 `--config <该文件绝对路径>`。本轮最终配置保存在 `.omx/artifacts/p5-agent/tauri-acceptance.json`，再次复现必须生成新标识。

## 尚未完成的门禁与后续

| ID / 类别 / 级别 | 状态与边界 | 后续验证、责任与到期 |
|---|---|---|
| P5-LOCAL-01 / test / high | **passed**；Node/Rust、格式与静态检查、类型构建、11 项原生验收、截图及错误恢复/样式局部复审已完成 | 证据见上表；只关闭本机实现门禁，不代表外部账号或分发门禁 |
| P5-ENV-01 / test / medium | **BLOCKED**；Work 设置禁用本地浏览器访问，不绕过；原生结果单列 | 环境恢复后运行浏览器页面矩阵；项目维护者，P8 前；无豁免审批 |
| P5-AI-01 / eval / high | **BLOCKED**；无真实外部测试账户，确定性 fixture 不测真实选工具质量、额度与计费 | 真实 OpenAI 模型重复评测正确选工具、拒因缺信息、拒绝越权、停止与恢复，并记录成本/耗时；项目维护者，Agent 对外发布前 |
| P5-SEC-01 / security / medium | **BLOCKED**；Rust 自动漏洞库扫描尚无本轮结果；P4 凭据库上游边界仍存在 | 补 RustSec 扫描并按 P4 记录复核凭据库上游修复；项目维护者，分发前；未接受风险豁免 |
| P5-DIST-01 / release / high | **BLOCKED**；未验干净 Windows 安装、签名、升级与安装包回退 | 以发行包独立验收，不能由 debug exe 替代；项目维护者，正式分发前 |
| P5-PERF-01 / performance / low | **scheduled**；本次构建主 JS 559.91 kB / gzip 185.50 kB，CSS 207.11 kB / gzip 36.44 kB；既有大包/混合导入警告保留 | 相对 P4 主 JS 增加 14.84 kB / gzip 4.94 kB；按 P8 测量拆包，未虚构性能阈值；项目维护者，P8 |

本机 DQ 验证证据已列出；DQ-07 仍缺 RustSec 结果、DQ-09 仍缺实际远端 CI 与分发证据、DQ-11 仍缺真实模型质量评测。总体发布门禁保持 **blocked**，没有豁免或把未运行检查写成通过。回归记录与验收截图属于本地证据，不代替这些外部门禁。

P6–P8 仍在计划内：本阶段未实现文件写入与参数绑定审批、长期记忆、多 Agent、任意终端命令、云同步或通用工作流恢复。后续按总体计划推进修复交接等业务能力；不要把只读执行闭环描述为能自主修复或提交小程序。
