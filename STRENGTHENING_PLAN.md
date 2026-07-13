# STRENGTHENING_PLAN — 代码库强化作战计划(活文档)

> 一条一更;已被仓库/台账记录的不重复;过时即删。
> 建立:2026-07-04。证据来源:8 路并行深勘 + 高危项对抗复核 + 独立安全审计(共 11 个代理,~105 万 token)。
> 当前状态:**executing**（2026-07-13 已获准执行“远端验证阶段 A”；本地强化与集成已完成，当前只发布功能分支、创建 Draft PR 并等待真实 CI）。
> 2026-07-04 至 2026-07-05 的上一轮战役已完成；其基线、决策和提交记录保留在后文，作为历史证据而非当前恢复点。

## 当前恢复入口：远端验证阶段 A（2026-07-13）

### 状态、批准范围与恢复检查

- 状态：`executing`。
- 当前分支：`codex/strengthen-core-contracts-2026-07`；阶段起点 `07f94a148f4d5246fe3ab22cf66ed7815101d6c1`，其树已在本地 `main` 通过 `--ff-only` 集成。
- 已批准范围：临时运行固定版本 `actionlint`；执行 `git fetch --prune --tags origin`；只推送当前功能分支；以远端 `main` 为 base 创建 Draft PR；等待该 PR 的 ubuntu/windows × Node 20/22 四腿 Actions 并核对结论。
- 明确排除：直接推送或修改远端 `main`；把 Draft PR 转为 ready 或合并；创建/移动 tag；创建、修改或发布 GitHub Release；部署；版本提升；安装或运行 `cargo-audit`；任何其他外部写入。
- 已知远端基线（执行 fetch 前的只读证据）：`origin/main` 为 `14a7f3598b29c1ff421adab4d9c0cb0aa5c9c1c1`；远端尚无同名功能分支。fetch 后必须重新核对，不能把该值当作不变事实。
- 已知发布冲突：远端已有 `v0.2.0-rc.1`，其提交为 `95eb2a331a1332b729368d389d942f57f024914f`，并已有同版本 Draft Release；当前三个版本载体仍为 `0.2.0-rc.1`。因此本阶段禁止 tag/Release，后续发布需另行批准新版本（推荐 `0.2.0-rc.2`）。
- 当前阶段：A1，持久化范围并运行本地发布前门禁。
- 下一条可直接执行的动作：提交本恢复入口，运行 `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12`，随后 fetch 并复核待推送差异。
- 恢复检查：确认分支名、工作树和阶段提交；确认 `origin/main` 仍是功能分支祖先；确认远端同名分支/PR 的实际状态；确认没有 tag、Release 或 `main` 写入；从本节“下一条可直接执行的动作”继续。

### 阶段 A 的验收标准、风险与回退

1. `actionlint@v1.7.12` 对 `.github/workflows/*.yml` 无诊断；该临时执行不得向仓库或全局工具链写入依赖声明。
2. fetch 后记录远端 `main` 与 tag 事实；若远端基线漂移或不再是当前分支祖先，停止推送并重新评估，不做 rebase/force-push。
3. `origin/main..HEAD` 的 diff、秘密扫描、`git diff --check`、lint 和全量测试通过；独立只读复核没有未处置的高风险发现。
4. 远端只新增/更新 `codex/strengthen-core-contracts-2026-07`，并创建以 `main` 为 base 的 Draft PR；不合并、不打 tag、不发布。
5. PR 当前 HEAD 的四个 `validate` 矩阵检查全部成功；失败必须如实诊断，不能用旧 run 替代。
6. 完成后把状态改为 `awaiting_approval`，记录 PR/Actions URL、远端 HEAD、验证结果和下一批准边界；将该恢复提交推送并再次等待当前 HEAD 的 CI。

风险主要是远端基线并发变化、凭据/权限失败和真实 CI 与本地环境差异。所有仓库改动都限定在功能分支且可用普通 revert 回退；远端分支可由后续明确授权删除。Draft PR、tag 与 Release 是不同外部对象，本阶段只授权前者。

## 已完成的本地战役：核心契约与发布门禁（2026-07-10）

### 状态与恢复入口

- 状态：`complete`
- 分支：本地 `main`（集成目标）；源分支 `codex/strengthen-core-contracts-2026-07` 保留。
- 基准 HEAD：`14a7f3598b29c1ff421adab4d9c0cb0aa5c9c1c1`
- 当前 HEAD：本文件所在的复核修正与本地集成记录提交；其父为 `ed90e672315e2827426f297a65368c51c6c769b8`。本地 `main` 通过 `--ff-only` 接纳后应与源分支同指向本提交；恢复时以实际 refs 核对，不依赖聊天记录。
- 工作树：本文件所在提交创建后、`main` fast-forward 后均须核对为干净；复核前无用户既有改动，本次只拥有本提交的四个路径。
- 已完成提交序列：`11d5fda`、`d7b7d96`、`25edb9e`、`c483bb5`、`3636ae0`、`f7da93c`、`cb76310`、`e025d66`、`0cd8469`、`21179c0`、`d1adc70`、`e8eb064`、`ed90e67`，以及本文件所在的复核修正与集成记录提交。
- 最后验证：2026-07-13（America/New_York）；新增 E2E 在旧实现上 11/12（预期红），最小修复后目标 E2E 13/13、全量测试 191/191、lint、validate、coverage、accuracy、11/11 dogfood、MCPB 冒烟和 Markdown/checklist/explain CLI smoke 均通过；修正后代码 `APPROVE`、架构 `CLEAR`。
- 当前阶段：已完成；七个批准及复核修正阶段的验收标准均满足，本地 fast-forward 集成及合并后核验完成后无剩余动作。
- 当前验收标准：旧实现上可失败的 Markdown 与 checklist 回归测试；最小文案修复能区分“真实零命中”和“过滤后为空”；目标测试、全量测试、lint、适用 smoke 均通过；独立代码复核改为 `APPROVE`，架构复核保持 `CLEAR`。
- 下一条可直接执行的动作：本轮无本地待执行动作；未授权的 fetch/push、PR、tag、Release、部署与外部写入均未执行，后续需用户另行授权。
- 恢复检查：确认当前分支为 `main`；确认 `main` 与 `codex/strengthen-core-contracts-2026-07` 同指向本文件所在提交且工作树干净；真实 CI、tag 或发布不能用本地证据替代。

### 已批准范围

本轮只处理已复现、预期收益高且可回退的六组工作：

1. 持久化当前战役的批准范围、排除项、验收标准和恢复入口。
2. 统一 `guide` 与 `check` 的 subject 适用性；使 `--blockers-only` 同时过滤条目、自检和摘要；报告阶段标题及顺序以 `flow.yaml` 为单一来源。
3. 在 MCP stdio 边界实施 JSON-RPC 请求校验，并净化 Markdown 文本中的用户查询；不改变结构化 JSON 中的原始查询。
4. 为扫描遍历建立可比较的合成基准，并让扫描预算覆盖实际遍历的目录项，而不只覆盖已产出的可扫描文件。
5. 强化发布工作流：补上 lint，并校验 tag、`package.json`、`manifest.json` 与 `package-lock.json` 版本一致。
6. 对账文档，完成 `EVOLUTION_ROADMAP.md`，复跑当前 HEAD 的全部适用门禁并接受独立只读复核。

已批准的可见行为变化：

- 未提供 subject 的指南不再混入 subject 专属规则。
- `--blockers-only` 只展示 blocker，并给出与过滤结果一致的摘要和注记。
- 报告阶段标题与顺序跟随 `flow.yaml`。
- 非法 MCP 调用返回相应 JSON-RPC 错误；合法工具执行失败仍通过 `result.isError: true` 表达。
- 发布 tag 必须匹配三个版本载体。

### 明确排除项

- 桌面端 P2.1、桌面安全边界与桌面依赖变更。
- 新增业务规则、扩大规则覆盖面、支付或其他产品语义裁决。
- EPIPE 行为、全量准确率标签补齐。
- release 的 main 分支祖先约束、Actions SHA 固定化。
- 新生产依赖、重大版本升级、框架替换或架构重写。
- 公共 API、数据模型、数据库 schema、认证或授权边界变更。
- push、PR、tag、发布、部署、云资源/生产数据写入和外部 outreach。

未进入本轮的候选项只写入 `EVOLUTION_ROADMAP.md`，不提前实现。

### 阶段、验收标准与回退

#### 阶段 1 — 状态与恢复点

- 证据：旧文档仍把已于 2026-07-05 收官的战役标为“执行中”，不能作为可信恢复入口。
- 范围：仅本文件与安全任务分支；不修改产品代码。
- 验收：批准范围、排除项、阶段、风险、恢复检查均可从本文件独立恢复；`git diff --check` 通过；工作树路径符合预期。
- 验证：`git status --short --branch`、`git diff --check`、人工复核本节。
- 风险/回退：文档风险低；单独 revert 阶段提交即可。

#### 阶段 2 — 输出正确性

- 证据：`guide` 无 subject 时会采用 subject 专属规则，而 `check` 已排除；`--blockers-only` 只过滤 `items`，自检及摘要仍泄漏非 blocker/未过滤计数；`src/report.mjs` 的阶段标题复制自 flow 且已漂移。
- 范围：subject 适用性共享逻辑、CLI 聚焦过滤、报告 flow 驱动渲染、最小回归/契约测试和对应变更说明。
- 排除：不新增或改写规则语义，不新增 JSON 字段。
- 验收：无 subject 的 `guide` 不含 subject 专属项；聚焦输出中的条目、自检、摘要和注记一致；已知/未知阶段均不丢项，已知阶段顺序/标题来自 flow。
- 验证：目标 `node --test`（guide、check、CLI、e2e、report），随后 `npm test`、`npm run accuracy`。
- 风险/回退：影响用户可见输出但契约由测试锁定；阶段提交可整体 revert。

#### 阶段 3 — MCP 边界与文本输出安全

- 证据：当前 dispatch 接受错误 `jsonrpc`、弱类型参数及 `id: null` 处理不正确；Markdown explain 会把查询中的标题/控制字符直接渲染。
- 范围：手工、无新依赖的请求与当前工具 schema 校验；额外未知属性继续接受；Markdown 查询净化；结构化 JSON 保持原值。
- 错误矩阵：非法请求 `-32600`；未知方法 `-32601`；未知工具/缺必填/类型或枚举错误 `-32602`；合法工具执行错误保持 `result.isError: true`；缺少 `id` 的 notification 不响应，显式 `id: null` 响应并回显 `null`。
- 验收：每类正负控制均有边界测试；合法请求结果不漂移；Markdown 无标题/控制字符注入。
- 验证：目标 `node --test`（MCP、smoke、explain），`npm test`，`WEAPP_SHIPMATE_NO_PACK=1 npm run build:mcpb`（PowerShell 使用 `$env:WEAPP_SHIPMATE_NO_PACK='1'`）。
- 风险/回退：协议边界属高风险；最小实现、独立只读复核，阶段提交可整体 revert。

#### 阶段 4 — 扫描遍历预算

- 证据：现有文件上限在 generator 产出后计数，包含大量不可扫描文件/目录的树可在触发上限前被无界遍历。
- 范围：先固定合成树基准；预算计入全部遍历目录项；用可注入的小预算测试截断行为；尽量保持外部结果形状。
- 排除：不声称 `readdirSync` 已获得硬内存上限；不重写扫描架构。
- 验收：同一合成场景有前后数据；小预算下遍历有界且有可验证截断信号；常规夹具结果不回归。
- 验证：目标 boundary/perf/scanner 测试，`npm test`，`npm run coverage`、`npm run dogfood`。
- 风险/回退：可能改变极端大树的截断点；阶段提交可整体 revert，基准数据保留用于比较。

#### 阶段 5 — 发布一致性门禁

- 证据：release workflow 未运行 lint，且 tag 没有与 package/manifest/lock 版本对账。
- 范围：复用现有工具实现可单测的版本校验，并在 release workflow 中运行 lint 和校验。
- 排除：不要求 tag 来自 main；不执行真实 tag/release；不升级 action 或依赖。
- 验收：匹配版本通过，tag 或任一载体漂移明确失败；workflow 在打包前运行 lint 和版本校验。
- 验证：版本校验单元测试、workflow 契约测试或静态断言、`npm run lint`、`npm test`。
- 风险/回退：仅收紧发布前置条件；单独 revert workflow/校验提交即可。

#### 阶段 6 — 文档、路线图与最终复核

- 证据：README/CONTRIBUTING/工程文档存在已复现的测试数、依赖归类、性能状态和规则监控描述漂移。
- 范围：只对账可由当前仓库证明的事实；路线图按短期（不超过 1 个月）、中期（1–3 个月）、长期（超过 3 个月）分层，并加入单点故障、性能、依赖、安全兜底预案。
- 验收：所有批准阶段标准满足；当前 HEAD 上适用门禁实际通过；既有失败与新增失败已区分；独立复核无未处置高风险发现；工作树仅含预期改动。
- 验证：`npm run lint`、`npm test`、`npm run coverage`、`npm run accuracy`、`npm run dogfood`、`npm run rot`、根与桌面 `npm audit`、桌面 TypeScript、Cargo metadata、`WEAPP_SHIPMATE_NO_PACK=1 npm run build:mcpb`、`git diff --check`，以及风险匹配的 smoke test。
- 风险/回退：文档可单独 revert；代码按阶段提交回退，不做历史重写。

### 当前基线与已知限制

- `npm test`：189 通过、0 失败。
- `npm run lint`：通过。
- `npm run coverage`：63/63 源字段；68 个可匹配载体；precision/recall 均为 1.000（TP 54、FP 0、FN 0）；30/68 rule ID 有标签锚点。该指标只覆盖已标注夹具，不外推为全域准确率。
- `npm run accuracy`：86 个标签、14 个夹具项目、覆盖 30 个 rule ID。
- `npm run dogfood`：11 个固定样本通过；`npm run rot`：97 个载体、0 stale。
- 根与桌面 `npm audit`：0 漏洞；桌面 TypeScript 和 Cargo metadata 通过。
- 已知环境限制：`actionlint` 与 `cargo-audit` 未安装；Codex Security 扫描器因其 GBK 解码问题无法读取含中文的 Git 提交主题，已改用本地防御性审计。三者都不能描述为已运行或通过；相应替代证据是 YAML 解析、workflow 契约测试、Cargo metadata、`npm audit` 和本地边界测试。
- 性能结论规则：只有同场景前后测量才可宣称改善；阶段 4 的目标是遍历有界，不承诺单目录 `readdirSync` 的硬内存上限。
- 阶段 4 固定场景：同一棵含 512 个目录和 512 个不可扫描 `.txt` 文件的 1024-entry 合成树、注入预算 64、各 5 次；改动前中位数 75.941 ms 且未截断，改动后中位数 3.478 ms 且正确截断，场景内中位耗时下降约 95.42%。该结果只证明有界预算场景改善，不外推为通用扫描吞吐量。

### 当前风险与决策

- 输出和 MCP 阶段会改变已批准的可见错误行为；用公共边界测试定义新契约，避免额外 API 漂移。
- flow 是报告阶段标题/顺序的唯一来源；未知 stage 仍需兜底，不能静默丢项。
- MCP 校验精确覆盖当前 schema，继续接受额外属性，避免无依据的兼容性收紧。
- MCP 请求的 `params` 依 MCP 对 JSON-RPC 的对象型收窄处理：数组属于非法请求并返回 `-32600`；工具 `arguments` 的类型/枚举错误仍返回 `-32602`。
- 兼容裁决：本轮按已批准契约把显式 `id: null` 视为请求、响应并回显 `null`。独立复核指出严格 MCP 类型不接受该值；这是有意兼容选择，未来若改为严格拒绝须作为公共契约变化另行审批。
- 扫描预算按所有实际遇到的 `Dirent` 计数并在递归间共享；保留 `MAX_FILES` 导出和外部结果形状。`readdirSync` 仍会一次物化单个目录，因此单个超大目录的硬内存边界仍是已知风险，不能宣称已经解决。
- 发布 tag 只校验版本一致性，不增加 main 分支或远端状态假设。
- 阶段 5 的本地证据只支持 `local-ready`：真实 tag、GitHub Actions、联网 `.mcpb` pack 和 GitHub Release 均按批准边界未执行，不能据此宣称 `CI-ready` 或 `release-ready`。
- 最终独立终审审查 `14a7f359..d1adc70` 的 35 个变更文件，代码结论为 APPROVE、架构结论为 CLEAR；未发现 P0/P1/P2，批准范围内验收无缺口，排除项未被提前实现。
- 终审 P3-1：`--blockers-only` 当前通过中文摘要模式重算计数，测试已锁定现状但未来文案变化可能形成隐式耦合。本轮无已复现错误，不做投机重构；已把结构化计数触发点并入路线图 S3。
- 终审 P3-2：报告在模块加载时缓存 flow，而 guide 按调用读取；当前不可变安装包无行为问题。本轮没有运行时热更新需求，不改变快照模型；若 L2 自定义规则触发，则按路线图统一 flow/rules 快照生命周期。
- 2026-07-13 合并前复核纠正：代码审查复现 `sample-app --blockers-only` 过滤 5 条 warning 后仍输出“未命中任何规则/无可执行清单项”，结论为 MEDIUM/`REQUEST CHANGES`。新增二进制级 Markdown/checklist 回归先红后绿；CLI 现将隐藏数量作为仅供文本渲染的上下文传入，不改变 JSON 结果形状，并统一修正 check/guide/explain 的过滤后空态。修正后代码复核 `APPROVE`（14 夹具 × 4 主体 × 3 输出共 168 组合无回归）、架构复核 `CLEAR`，无 P0/P1/P2 或其他遗留 finding。
- 本地集成决策：合并前 `main` 为 `14a7f3598b29c1ff421adab4d9c0cb0aa5c9c1c1` 且是候选祖先；只允许 `git merge --ff-only codex/strengthen-core-contracts-2026-07`，不创建 merge commit。未 fetch 或比较远端 `main`，因此结论严格限于本地仓库，发布状态仍仅为 `local-ready`。
- 被取代的决策：后文 2026-07-04 战役的“当前阶段/下一动作”已失效，但历史结论和提交证据保留。

### 当前战役进度

| 阶段 | 状态 | 提交 | 验证证据 |
|---|---|---|---|
| 1. 状态与恢复点 | 完成 | `11d5fda` | `git diff --check`；分支、状态与 staged 路径复核 |
| 2. 输出正确性 | 完成 | `d7b7d96` | 目标测试 59/59；`npm test` 172/172；`npm run lint`；`npm run accuracy`（TP 54 / FP 0 / FN 0）；`git diff --check` |
| 3. MCP 边界与文本输出安全 | 完成 | `c483bb5` | 目标测试 32/32；`npm test` 177/177；`npm run lint`；`WEAPP_SHIPMATE_NO_PACK=1 npm run build:mcpb`；`git diff --check`；独立复核初次 2×P1+1×P2 均修复后复核 PASS |
| 4. 扫描遍历预算 | 完成 | `f7da93c` | 红灯测试确认旧实现漏计不可扫描目录项；目标测试 51/51；`npm test` 179/179；`npm run lint`、`npm run coverage`、`npm run accuracy`、`npm run dogfood`；固定场景中位数 75.941→3.478 ms 且截断信号由 false→true；`git diff --check`；独立只读复核 PASS |
| 5. 发布一致性门禁 | 完成 | `e025d66` | 红灯测试确认基线缺校验模块；版本/workflow 契约 10/10；`npm test` 189/189；`npm run lint`；正确/错误 tag CLI 分别 exit 0/1；`WEAPP_SHIPMATE_NO_PACK=1 npm run build:mcpb`；`npm pack --dry-run`；`git diff --check`；独立只读复核 PASS |
| 6. 文档、路线图与最终复核 | 完成 | `21179c0`（文档与路线图）、`d1adc70`（终审恢复点）、本文件所在提交（完成状态） | YAML 解析和 23 个 tracked Markdown 文件的本地链接检查；`npm run lint`；`npm test` 189/189；`npm run coverage`（TP 54 / FP 0 / FN 0）；`npm run accuracy`（86 标签）；`npm run dogfood`（11/11）；`npm run rot`（97 载体、0 stale）；根与桌面 `npm audit`（0 漏洞）；桌面构建、Cargo metadata、release 正/负控制、本地 `build:mcpb`、`npm pack --dry-run`、CLI smoke、`git diff --check` 均通过；`actionlint`/`cargo-audit` 因未安装未运行；独立终审 PASS/APPROVE（代码 APPROVE、架构 CLEAR，无 P0/P1/P2） |
| 7. 合并前复核修正与本地集成 | 完成 | 本文件所在提交 | 首轮代码复核 MEDIUM/REQUEST CHANGES；回归旧实现 11/12（预期红）→ 最终 E2E 13/13；全量 191/191；lint、validate、coverage、accuracy、11/11 dogfood、MCPB 与 CLI smoke 通过；修正后代码 APPROVE、架构 CLEAR；本地 `main` 仅以 `--ff-only` 集成并在集成后复验 |

---

## 历史战役（2026-07-04 至 2026-07-05，已完成）

## 0. 基线(2026-07-04)

- main@8d22438,工作树干净;`npm test` 116/116 绿(~7s);63 条规则 schema 全过。
- v0.1.0 已发 GitHub Release(tgz + mcpb),npm registry 暂缓;Go/No-Go 4/5,唯一未过的是 outreach(docs/11 台账"待填")。
- 安全底盘已核实为净:ReDoS 探测通过(<5ms @ 200–512KB 对抗输入)、js-yaml v4 安全模式、密钥值不回显、dogfood.local.json 从未入 git 历史。

## 1. 总判断

核心资产是"裁决可信度"(0 FP 红线 + 全量出处核验),而勘察发现的最高杠杆问题恰好都威胁这条命脉:
MCP 路径可产出假清白报告(已对抗复核 CONFIRMED)、配置解析失败静默降级会反向产出 blocker 级误报、38/68 规则的误报对 CI 门禁不可见。
因此顺序为:**先加固验证网(阶段1)→ 修裁决完整性(阶段2)→ 封扫描边界(阶段3)→ 带网重构(阶段4)→ 发布工程与对账(阶段5)**。

## 2. 阶段计划

每项格式:`ID | 问题(证据锚点)| 修法 | 验证方式`。严重度已经对抗复核校准,不再复述。

### 阶段 1 — 验证网加固(先立网,再动刀)

| ID | 问题 | 修法 | 验证 |
|----|------|------|------|
| G1 | 38/68 规则零锚点,其 FP 对 CI 不可见(coverage anchored=30/68) | 新增 tests/fixture-pins.test.mjs:固化每个夹具的完整排序 ruleId 命中集(同 dogfood 指纹格式) | 人为改一条规则使其误触发 → 测试必红 |
| G2 | dogfood 门禁 0 样本解析时空转绿灯(scripts/dogfood.mjs:27-66) | ran===0 → exit 1;ran<total → 非零(除非显式 --allow-missing) | 空映射跑一次,断言退出码 |
| G3 | coverage.mjs 入口守卫恒真,import 即 process.exit(scripts/coverage.mjs:60);且未挂 CI | 复制 accuracy.mjs:79 的守卫;ci.yml 增加 `npm run coverage` 步骤 | 新增 coverage.test.mjs 可安全 import |
| G4 | 规则 ID 重复不检测(validate.mjs:61-68);flow 走查不验 reachability/顺序;linter 零负向测试 | 加重复检测 + seen.length===stages.length 断言;抽函数并喂坏图(环/双终点/悬空/重复 id)负向测试 | 负向用例各自变红 |
| G5 | 无 subject 分支(check.mjs:23,历史真实 FP 类)无 CI 测试 | check.test 增加 runCheck(template-signals, {}):必含 web-view-business、不含 web-view-personal | 用例入 CI |
| G6 | e2e 空目录测试泄漏临时目录(e2e.test.mjs:83) | try/finally + rmSync | 跑后无残留 |

### 阶段 2 — 裁决完整性(消灭假清白与假警报)

| ID | 问题 | 修法 | 验证 |
|----|------|------|------|
| V1 | **[已确认 high]** 非法 subjectType 静默滤掉全部规则 → MCP 假清白报告(check.mjs:21-23;mcp.mjs:70;FX-06 同类) | 枚举校验下沉到 runCheck(throw),CLI/MCP 同时继承;MCP 现有 try/catch 自动转 isError | MCP dispatch 传 "Personal" → isError 且列出合法值 |
| V2 | MCP 收到合法 JSON 行 `null` 即进程崩溃(mcp.mjs:95,144 无对象检查) | 非对象/数组消息跳过或回 -32600;dispatch 外再包 try/catch | stdio e2e 加 `null`/`42`/`[]` 脏行存活断言 |
| V3 | app.json/manifest.json 读取或解析失败被静默吞掉 → 交叉核验反向断言"未声明",产出 blocker 级误报(scanner.mjs:216,259,276;crosscheck.mjs:31;代码自注释已预言此后果) | scan 结果记录 configErrors;check 输出注记;声明文件加载失败时抑制/降级 requiredPrivateInfos 核验 | 坏 app.json 夹具:有注记、无 blocker FP |
| V4 | 动态请求检测漏 Taro/wepy,明文请求检测漏 wepy(scanner.mjs:53-58) | 三处请求上下文正则统一 `(?:wx\|uni\|Taro\|wepy)` | fp-guards 加 Taro/wepy 用例 |
| V5 | 单横杠 flag 与多余位置参数被静默吞掉(cli.mjs:53,101;FX-16 残余) | check/guide 对 `-x` 开头 token 与额外位置参数报错退出 1 | cli.test 回归锁 |
| V6 | 未知 stage 的条目渲染时静默丢弃但计数/退出码仍算(report.mjs:42-45) | 渲染兜底段落,或 validate.mjs 钉死 schema stage 枚举 ⊆ STAGE_TITLE | 用例或 validate 断言 |

### 阶段 3 — 扫描边界与资源安全

| ID | 问题 | 修法 | 验证 |
|----|------|------|------|
| B1 | **[安全审计评 high]** walk 跟随 symlink/junction:越界读 + 自环膨胀(实测 2 文件项目 filesScanned=64)+ DoS(scanner.mjs:37-42;FX-12 台账在案) | withFileTypes + isSymbolicLink 跳过;必要处 realpath visited 集 | junction 自环夹具 filesScanned 恒定;越界 symlink 不进结果 |
| B2 | 无文件大小/数量上限,整读入内存(scanner.mjs:216) | >5MB 跳过并计入 skipped 注记;文件总数上限 + 截断注记 | 大文件夹具断言 |
| B3 | readdirSync 无守卫,单个 EPERM 子目录使整扫描崩溃(scanner.mjs:37) | try/continue(与 statSync 同款) | 拒权目录夹具 |
| B4 | IGNORE_DIRS 任意深度匹配裸名,pages/test/ 等被静默跳过(scanner.mjs:8-21,42) | 歧义名(test/tests/scripts/output/tmp/windows)仅根层匹配 | 夹具:pages/test/ 下调用可见 |
| B5 | 恶意文件名可经 secretHints 注入 markdown/提示词到报告与 MCP 文本(scanner.mjs:243→crosscheck.mjs:88→report.mjs:51) | 渲染前净化路径(控制字符/反引号)或包 code span | 注入夹具断言转义 |
| B6 | MCP:坏行无 -32700、无 stderr 诊断、stdin 行缓冲无上限(mcp.mjs:129-143;FX-18/S8) | 坏行回 -32700 + stderr 诊断;1MB 行上限;协议版本协商 SUPPORTED_VERSIONS(mcp.mjs:103) | mcp.test 扩展 |
| B7 | 无性能基线(FX-10/S6;docs/06 DOD-P2 要求) | 1000 文件合成夹具 perf 测试(<3s 阈值,CI 可容忍系数) | tests/perf.test.mjs |
| B8 | design-previews 预览服务器绑 0.0.0.0 且路径穿越,运行期间局域网可读任意文件(_serve.mjs:12-22) | listen 绑 127.0.0.1;resolve 后前缀校验 | 手测 + 代码审 |

### 阶段 4 — 带网重构与深层正确性

| ID | 问题 | 修法 | 验证 |
|----|------|------|------|
| R1 | scanProject ~90 行圈复杂度超标 2 倍,自标 🔴热修带病发布(FX-05/S4;scanner.mjs:205-293) | 拆 extractFacts/parseAppConfig | 全夹具输出与 G1 钉板逐字节等价 |
| R2 | 导出纯函数缺直测(FX-17:stripUniConditional/parseISODate 等) | 参数化直测 | 入 CI |
| R3 | 正则字面量毒化字符串跟踪 → 同段后续隐私 API 静默消失(scanner.mjs:82 自认范围外;实证 `/\//`、`/"/`) | prev-token 启发式(`= ( , : [ ! & \| ? { ; return` 后的 `/` 视为正则起始)| 回归夹具 + 金快照不变 |
| R4 | Taro 具名导入不可见(`import { getLocation } from '@tarojs/taro'`)→ 整类 FN 无注记(scanner.mjs:49) | 检测到该类导入时映射为 wx.* 或至少输出 FN 注记 | Taro 夹具扩展 |
| R5 | 规则层收尾:chooseLocation 双触发(privacy-apis.yaml:67,199);crosscheck 5 条内联规则逃逸 rot 监控(crosscheck.mjs:43-155);flow/rejections 不进 staleness;rot 对 NaN 日期报"新鲜"(rot.mjs:13-33);match.scanner 纯声明无 schema 绑定 | 逐项小修(去重 api、rot 输入扩展、NaN 显性化、schema if/then) | validate/rot 测试各自锁 |

### 阶段 5 — 发布工程与文档对账

| ID | 问题 | 修法 | 验证 |
|----|------|------|------|
| E1 | 既定分发渠道(GitHub Release)无流水线,真实 mcpb pack 从未在 CI 跑过 | tag 触发 release.yml:npm test → npm pack + mcpb pack(锁版)→ SHA-256 → 挂 Release 资产 | 打 rc tag 演练 |
| E2 | `npm ci \|\| npm install` 兜底毁掉 lockfile 门禁;lockfile 本身已漂移(0.0.0 vs 0.1.0) | 去 fallback;`npm install --package-lock-only` 刷新提交 | CI 绿 |
| E3 | CI 仅 ubuntu+node20,目标用户主平台 Windows 零覆盖 | 矩阵 [ubuntu,windows] × [20,22],mcpb smoke 留单腿 | CI 绿 |
| E4 | 供应链:mcpb 打包器 `npx --yes` 不锁版(build-mcpb.mjs:104);workflows 无 permissions 块;无 dependabot | 锁定精确版本;`permissions: contents: read`;dependabot(actions+npm) | 审查 |
| E5 | 无代码 lint(仅 .editorconfig) | eslint flat config(recommended 级,devDep)+ CI 步骤 | CI 绿 |
| E6 | 文档违反自家诚实红线:docs/06 §4 把已交付的 e2e/smoke 标待办、§2.1 两行已解决债未销;docs/08 规则数 46(实际 63);CONTRIBUTING 落后于工具链;FX-05 处置未记录 | 逐处对账回填;docs/08 加"计数以 npm run validate 实测为准"免责头 | 与实测输出核对 |
| ~~E7~~ | ~~桌面底线(CSP/withGlobalTauri/opener/sidecar 退出码/Cargo 元数据)~~ | **D4 裁定移出本轮**,记入 EVOLUTION_ROADMAP 桌面轨,P2.1 恢复时首批执行 | — |
| E8 | bin 用 process.exit 可能截断管道输出(bin/weapp-shipmate.mjs:4) | 改 process.exitCode | e2e 不回归 |

## 3. 决策记录(2026-07-04 用户拍板)

| # | 决策 | 裁定 |
|---|------|------|
| D1 | FX-05 scanProject 拆分 | **执行重构**(R1),以 G1 钉板做逐字节等价背书 |
| D2 | 正则字面量 + Taro 具名导入(R3/R4) | **完整启发式**,金快照+钉板兜底 |
| D3 | 3 个空阶段规则回填 | **进演进路线图**,独立成批、带官方源核验节奏 |
| D4 | 桌面范围 | **整体搁置**(UI 在 Claude design 上完成)——E7 全部移出本轮;仅保留 B8(预览服务器路径穿越,属本机安全非 UI,独立提交、可单独 revert) |

已定不设问的取舍(可推翻):MCP 扫描目录不加允许列表(会破坏本地正当用法),改为在 README 明示"MCP 工具具有本机文件读取能力";IPv6 host、HTML 注释吞 JS 等 open questions 记入路线图观察项。

## 4. 非代码事项(仅你能做)

- **outreach 是唯一剩余 Go/No-Go 勾**(docs/04:41;docs/11 台账待填;两个 Release 资产下载数 0)。P2.2 之后的一切路线,项目自己规定绑死在这一勾上。强化计划不替代它。

## 5. 工作纪律(执行期恒守)

- 每阶段一分支(`strengthen/p1-gates` 等),小步提交,**每文件独立提交**(全局约定);每次提交前 `npm test` 全绿。
- 行为等价原则:凡触扫描/规则路径,金快照(51/0/0)+ G1 钉板 + dogfood 必须全绿才提交。
- 每阶段末:全新上下文复核代理对照本计划审 diff,通过后才进下一阶段;阶段摘要(健康度/动了什么/下一步/待拍板)发对话。
- EVOLUTION_ROADMAP.md 在阶段 3 结束后起草、阶段 5 末定稿(届时证据最全)。

## 6. 进度台账

| 日期 | 项 | 提交 | 验证证据 |
|------|-----|------|----------|
| 2026-07-04 | G1 夹具钉板 | 9845cfd, 1ad45d4, 2a106db, d955644 | 26 条基线经 labels 真值目检;投毒 privacy.werun→16 处漂移爆红,还原后绿(证伪演练) |
| 2026-07-04 | G2 dogfood 空转防线 | bc7a462 | 四路径实测:空映射→1、空+allow→1、部分缺失→1、部分+allow→0;11 样本全量恢复绿 |
| 2026-07-04 | G3 coverage 守卫+CI | ce23828, f46067d, 665459c | import 不再触发 exit;红线三数自洽锁入 CI;npm run coverage 独立绿 |
| 2026-07-04 | G4 validate 抽函数+负向测试 | a1d1e71, 9533bc3 | 9 类坏数据逐一点名(环/双终点/悬空/分离环/重复 stage/重复 id/悬空拒因);真实数据等价锁绿 |
| 2026-07-04 | G5 无 subject 回归锁 | 8b3b321 | TPL 夹具:web-view-business 在、web-view-personal 不在 |
| 2026-07-04 | G6 e2e 临时目录清理 | 1823a69 | try/finally + rmSync |
| — | 阶段 1 小结 | — | 测试 116 → 130 全绿;dogfood 11 样本无漂移;发现并修复 linter 自身崩溃缺陷(悬空 next TypeError) |
| 2026-07-04 | 阶段1复核 | — | 独立复核 PASS-WITH-MINOR:新旧 validate 字节级等价实证、G2 四路径复跑、投毒演练复现;2 个 MINOR 已修(b229d4c, e0ce42c) |
| 2026-07-04 | V1 subject 校验下沉 | 2c3a330, ed7a7e7, 51174d5(部分) | MCP 传 'Personal' → isError 列合法值;runCheck 对 'Personal'/'个人'/'' 抛错 |
| 2026-07-04 | V2 MCP 非对象防线 | 38b3be8, 51174d5(部分) | dispatch(null/42/[]/'str')→null;stdio 脏行扩展 null/42/[] 存活断言 |
| 2026-07-04 | V5 CLI 残余缺口 | 1bcf7fd, db20f84 | -json 报错、-h/-v 保留、check 双目录拒绝、guide 位置参数拒绝 |
| 2026-07-04 | V6 未知 stage 兜底 | caa25b0, c37a20b | future_stage 条目渲染于'其他'段,概览计数与正文一致 |
| 2026-07-04 | V3 配置失败信号化 | 9aa0534 等 7 提交 | 坏 app.json:无 blocker 误报+显式注记;broken-config 夹具+labels FP-guard 双锁 |
| 2026-07-04 | V4 命名空间对齐 | 06739e1 等 6 提交 | Taro 动态注记、wepy 明文告警、fp-guards 防过杀卫兵;金快照 51→53、钉板 26→28(漂移逐条吻合预期) |
| — | 阶段 2 小结 | — | 测试 130 → 143 全绿;coverage 红线绿;dogfood 11 样本无漂移;踩坑记录:wepy 旧 no_hit 卫兵与新明文请求冲突,被四层门禁同时抓红——标注跟夹具源码走,删陈旧卫兵 |
| 2026-07-05 | 阶段2复核 | 83c2a29, 7ddf430 | 独立复核 PASS-WITH-MINOR(反向钉板/dogfood 拒绝探针、12 组正则手跑、6×200KB 对抗计时全过);MINOR(guide 面漏 FX-06 守卫)已修。NOTE 路由:Taro/mpx 配置载体 regex 提取失败无 configErrors→并入 R4;stdout.write 错误处理→并入 B6;report 死条件→下次触碰该文件时顺手清;dogfood --update 部分缺失静默重钉→有意保留(warn 已示,重钉本就限于可解析样本) |
| 2026-07-05 | B1~B5 扫描边界 | 92ef122, 8d02f63, d2a2024 | junction 探针实测 dirent 报 isSymbolicLink;boundary 测试×6(自环/越界/大文件/嵌套 test/净化/顶层 ENOENT 契约);踩坑:Edit 工具把 \uXXXX 转义写成字面控制字节(含 NUL),经脚本落盘修复+全文件控制字节校验 |
| 2026-07-05 | B6 MCP 稳健化(S8/FX-18) | 86c621a, f9f9421 | 坏行回 -32700(恰 2 条断言)、1MB 行上限(2MB 存活测试)、协议版本不回显、EPIPE 安静退出 |
| 2026-07-05 | B7 性能基线(S6/FX-10) | 561257e | 1000 文件现场生成:<3s、heap<200MB、计数精确 |
| 2026-07-05 | B8 预览服务器 | 0777f30 | 活体验证:200/403/403/400 + netstat 仅回环监听(修复前全网卡+路径穿越) |
| 2026-07-05 | dogfood 重钉 | a9677ad | wepy-src +2 命中——B4 设计代价,读源码裁决:框架仓库 packages/*/test 属分布外样本;真实小程序嵌套 test 是随包业务代码(FN 修复) |
| — | 阶段 3 小结 | — | 测试 143 → 153 全绿;钉板 28 条绿;dogfood 11 样本重钉后绿;FX-12/FX-18/FX-10(S6/S8)三笔台账债清偿 |
| 2026-07-05 | 阶段3复核 | — | 独立复核 PASS-WITH-MINOR:B8 十载荷攻击探针(含 ..%5c、%252e、UNC、%c0%af)全部遏制;B1 junction+symlink 双验证;dirent-unknown 疑虑经 Node 内部实现证据排除;B7 三次计时 767~1450ms(3s 预算 2 倍余量)。补记:ROOT_ONLY_IGNORE 在计划 B4 六名之外多列 __tests__/__mocks__/e2e——方向一致的有意扩围(嵌套目录随包上传),夹具无回归 |
| 2026-07-05 | B3 补修(复核 MINOR) | 见下三提交 | 拒权子目录跳过改为计数+报告注记;icacls 无特权拒权用例实测(154 全绿)。NOTE 留档:mcp MAX_LINE_BYTES 按 UTF-16 计数(常数级偏差,下次触碰改 byteLength);perf 3s 预算在 windows-latest 共享 runner 落地时复测 |
| 2026-07-05 | R2/FX-17 纯函数直测 | 9363d8d, 85be083, c8ac288 | stripUniConditional×4/blankStrings/parseISODate/_LOCATION_DECL_APIS 直测;不平衡 #ifdef 已知限制行为锁 |
| 2026-07-05 | R5(rot) 坏日期显性化 | 6c42d48 | NaN>180===false 的逃逸关闭:invalid 标记+按 stale 处理 |
| 2026-07-05 | perf 抗争抢加固 | 551258c | 三次取最小(实测同机 767ms↔7711ms 波动);算法回归仍必红 |
| 2026-07-05 | R1/FX-05 拆分 | 40acace | extractFacts+parseAppConfig;等价性三网全绿(162 测试/28 钉板/11 dogfood/53TP)。🔴热修销账 |
| 2026-07-05 | R3 正则字面量感知(D2) | 5 提交(regex-literals 卫兵等) | 标准除号/正则启发式,仅纯 JS 扩展启用(模板 </view> 误伤已防);金快照 53→54;踩坑:Edit 工具 \uXXXX 转义两次踩同坑,含转义代码一律脚本落盘 |
| 2026-07-05 | R4 具名导入+配置信号(D2+复核 NOTE) | 6 提交 | Taro 具名导入(含 as 别名)映射 wx.*;requiredPrivateInfos 非字面量/mpx 块畸形→configErrors;金快照 54→55 |
| 2026-07-05 | R5 规则层收尾 | 7 提交(14a3000 等) | chooseLocation 双触发收敛(裁决反转+FP 卫兵,55→54);rot 监控载体 63→97(crosscheck/flow/rejections 并入,合成 scan 收割零重复);schema match 收紧(死规则三态负向锁) |
| — | 阶段 4 小结 | — | 测试 154 → 168 全绿;三次金快照变更均有夹具源码级核验;dogfood 11 样本全程无扰动 |
| 2026-07-05 | 阶段4复核 | — | 独立复核 PASS-WITH-MINOR:R1 逐行等价核验、R3 对抗探针 16/18、R4 多行/type-only 导入核验、金快照算术自查(54 hit 自数吻合)。MINOR-1(一行式 JSX 自闭合标签吞同行调用,探针坐实)与 MINOR-2(rot 收割无对账卫兵+合成 scan 两处漂移)均已修 |
| 2026-07-05 | 复核 MINOR 修复 | 6 提交(7439f59 等) | 引号后必为除号(文法正确)+JSX 回归锁;共享 CROSSCHECK_ALL_HIT_SCAN+收割对账缺一即抛;\$comment 标准化;NOTE-3/4 文档化。测试 168→169 全绿 |
| 2026-07-05 | E1~E5/E8 发布工程 | 11 提交(f301670 等) | release.yml(草稿闸+gh 原生无三方 action);CI 矩阵 ubuntu/windows×20/22+lint 门禁+最小权限;npm ci 去兜底;mcpb 锁 2.1.2;dependabot;lockfile 修复(0.1.0+双 bin);eslint 全库仅 1 处有意豁免;bin exitCode;perf CI 预算 8s |
| 2026-07-05 | E6 文档对账(委派执行) | 76a6c5b, a8128d1, 576f5ec, 441aece, dba30d7 | docs/06 门禁表+债台账、docs/08 46→63(含清单外第 4 处)+免责头、CONTRIBUTING 验收协议、docs/10 五笔 FX 销账(FX-13 如实保留延期)、CHANGELOG Unreleased;每处先对源码核验,5 轮 npm test 全绿 |
| — | 阶段 5 小结 | — | 测试 169 全绿+lint 门禁;分发通道可复现(tag→资产+SHA-256);文档与实测零矛盾;FX-13 为全台账唯一遗留(低危,入路线图) |
| 2026-07-05 | 阶段5复核 | 825c49c, 04cfaac | 独立复核 PASS-WITH-MINOR:Windows 机上全门禁复跑、tag 注入探针实证证伪、icacls 测试 Linux 安全跳过验证、无运行时依赖膨胀。NOTE(release 打包失败诊断偏移一步)已修:REQUIRE_PACK 令失败在源头致命,默认/NO_PACK 行为不变。perf MINOR 由台账排期的首次 CI 演练确认(无法本地跑 GitHub runner) |
| — | **战役收官** | — | 五阶段全部 PASS(逐阶段独立复核,MINOR 均已修);测试 116→169;金快照 51→54 TP/0 FP;main..HEAD 108 提交;唯一代码替代不了的是 outreach(docs/11) |
| 2026-07-05 | 落 main + v0.2.0-rc.1 发布演练(战役后收尾,§1.1) | 329967b~95eb2a3;tag v0.2.0-rc.1 | main fast-forward 纳入全战役(8d22438→95eb2a3);**E1 真实 mcpb pack 首次在 GitHub runner 跑通**,草稿 Release 挂三资产(tgz+mcpb+SHA256SUMS);CI 矩阵 ubuntu/windows×node20/22 四腿全绿(余项②);首跑抓到 e2e `--version` 断言窄化为三段式(拒合法预发布段 `-rc.1`)→放宽为完整 SemVer 修复。演练前先 bump 三处版本号保产物自洽 |
