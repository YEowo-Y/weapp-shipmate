# 10 · 研发质量管控:P2 首跑验收 + 功能切片开发计划(2026-06-22)

> 状态:本轮研发质量管控产出(2026-06-22)。本文 = [`docs/06`](06-quality-and-acceptance.md) 质量规则的**一次实跑记录**(向后:验收 + 修复台账)+ **前向切片计划**(向前:功能切片 + 每片 DOD)。
> 来源:多 agent 全面体检工作流 `rnd-quality-inspection`(16 agents:DOD对抗审查 / 代码质量 / 安全漏洞 / 全链路测试 / Dogfood 5 维并行 → 对每条 blocker/high 对抗式复核滤误报 → 综合)。基线:**83 测试全绿**、~1215 LOC(src+bin)、46 规则、desktop Rust 薄壳 59 LOC。
> 标注:🔴 热修(本轮准入须修) · 🟡 延期(标解锁阶段) · ⚪ 不予 · ✅ 通过 · ⚠️ 部分 · ❌ 缺失。
> 权威源:质量规则/6 闸见 [`docs/06`](06-quality-and-acceptance.md);愿景/路线见 [`docs/08`](08-product-vision.md);记忆/上下文架构见 [`docs/09`](09-memory-context-architecture.md)。
> 阅读口径(2026-07-10):§1 与下列带日期的执行记录是不可改写的历史快照，测试数 / 规则数保留其当日证据；当前处置状态以 §2 台账为准，不能把历史基线当作当前 HEAD 健康度。

---

## 1. P2 首跑验收报告(按 docs/06 验收报告模板)

> 这是 docs/06 预置的 6 类 P2 代码门禁的**首次实跑**——此前代码已交付、门禁却一直标"⏳待 P2",从未按流程实跑留证(FX-02 已修)。

- **DOD-P0(文档先行)**:基本通过。对外口径无越界("保证过审/已合规/一键上线/可直接提交"全为否定式陈述);46 条规则总数与 README 逐类目分解吻合(privacy 21 / review 6 / login 5 / domains 2 / content-safety 2 / outbound 2 / payment 2 / categories 2 / filing 1 / data 1 / minors 1 / qualification 1 = 46,0 draft)。**待办**:跨文档单一权威源未保持(docs/04 计数过期且自相矛盾 FX-03、CHANGELOG 版本陈述与 package.json 冲突 FX-07、docs/08 命中禁词变体 FX-08、README mpvue 枚举无证据 FX-09)。
- **DOD-P2(代码骨架)**:部分通过。
  - 单元 / 接口 / 集成:✅(scanner/check/guide/explain/crosscheck/rot/report 单测 + mcp dispatch + cli 主路径 + fixtures 端到端 `runCheck`)
  - 冒烟:⚠️ 无独立守门测试(散落各文件)→ 建议补 `smoke.test.mjs`
  - **E2E:⚠️ 二进制级全链路缺失**(mcp stdio 测试仅覆盖协议握手)→ 🔴 FX-04
  - **性能:❌ 未实现**(docs/06 要求数千文件 < 5s / 不 OOM)→ 🟡 FX-10(补冒烟或标 N/A + 解锁)
  - local-only 脱敏:✅ 实测成立(check 无网络 / 无写盘;`SECRET_RE` 只捕键名,密钥值永不进输出)
  - **"零运行时依赖优先":⚠️ 实测 prod 依赖树 `js-yaml@4.2.0 → argparse@2.0.1`(非零),且引入理由从未登记、README/注释"零依赖"宣称被证伪** → 🔴 FX-01
- **门禁**:静态安全 ✅(`npm audit` 0 漏洞、ReDoS 实测线性、MCP 抗畸形输入无原型污染、Rust 用参数数组非 shell 无注入面,整体 LOW);**圈复杂度 ❌**(`scanProject` 约 20–24,超 ≤10 阈值 2 倍,无豁免登记)→ 🔴 FX-05;技术债登记 ⚠️(无台账)→ docs/06 已补。
- **测试现状**:本机 Node v24.14.0 `npm test`(`validate.mjs` + `node --test`)实测 **83 通过 / 0 失败**,~2.8–3.8s。
- **Dogfood**:实跑 CLI 收集 6 条交互问题(非法 `--subject` 静默伪清白 🔴 FX-06、桌面 `<pre>` 裸 markdown 🟡 FX-15、空目录虚假安心 🟡 FX-14、`--blockers-only` 表头自相矛盾 🟡 FX-13、未知 flag 静默忽略 🟡 FX-16 等)。
- **四维短板**:见 §3。
- **结论**:**REVISE(收紧后 Go)**。**无 blocker**;准入热修集中在口径真实性(FX-01/03/07/08/09)、二进制级 E2E(FX-04)、scanProject 复杂度处置(FX-05)、CLI subject 校验(FX-06)、docs/06 阶段推进(FX-02)。

---

## 2. 分级修复台账(FX-01 … FX-18 + 1 误报)

> 热修 7 · 延期 11 · 不予(误报)1。每条带回归点;执行随 §4 切片推进,合并前过 docs/06 6 闸。
>
> **✅ S2 已执行(2026-06-22)**:FX-01(改口径·全仓 23 处/11 文件,"零依赖"→"极简依赖·仅 js-yaml";FX-01 决策=改口径、保留 js-yaml、技术债登记 docs/06 §2.1,非去依赖)、FX-03(docs/04 权威计数声明)、FX-07(CHANGELOG 0.1.0)、FX-08(docs/08 去禁词变体)、FX-09(README mpvue 澄清——核实后保留:mpvue/mpx 用 `wx.*` 无需别名、且 mpvue 确做过 dogfood,非删除)完成。`npm test` 83/0 回归通过,11 个单文件提交(2081bdb…8dc6408)。
>
> **✅ S1 已执行(2026-06-22)**:FX-11 完成——建 `corpus/labels.json`(18 条人工核验三态标注:9 hit + 9 no_hit FP-guard,逐条对照夹具源码,含确认 `privacy.getPhoneNumber` 是 wxml 模板信号真阳而非误报)+ `scripts/accuracy.mjs`(复用 runCheck 算 per-rule/全局 precision/recall;未知 ruleId 告警;precision<0.95 或有 FP 即退出 1)+ `tests/accuracy.test.mjs`(门禁 precision≥0.95 + 零 FP + 黄金基线 9 TP/0 FP/0 FN)+ `package.json` `accuracy` script。**实测 precision=1.000 recall=1.000**。**顺带闭合 FX-WONTFIX-01**:S1 新增测试负载触发了 `mcp.test.mjs` 潜伏竞态(固定 400ms+kill),改为事件驱动收尾——5× `npm test` 稳定 **85/0**(此前 ~1/4 偶发翻车)。5 个单文件提交(34d9dcd…17acbb9)。
>
> **✅ S3 已执行(2026-06-22)**:FX-04 完成——`tests/e2e.test.mjs`(spawnSync 二进制级 9 例:check/guide/explain/checklist 全链路 + **退出码契约** check leaky-app→exit 2、sample-app→exit 0、explain 无参/未知命令→exit 1)+ `tests/smoke.test.mjs`(全 9 夹具 + guide/explain/dispatch ping 最小存活)。补齐 docs/06 关键路径 E2E 门禁(此前 0 覆盖)。**3× `npm test` 稳定 97/0**。2 个单文件提交。
>
> **✅ S5 部分执行(2026-07-01)**:FX-06 完成——`SUBJECT_ENUM` 提取至 `data.mjs`(CLI/MCP 共享唯一事实源),`cli.mjs` 对 `--subject` 出现即校验(`"subject" in flags`,含缺值/吞 flag 边界),非法主体→退出 1 + 枚举提示 + 零报告输出;cli 单测 ×2。4 个单文件提交。
>
> **✅ S5 续(2026-07-02,公开前体检把 FX-14/16 升级为必修)**:FX-16——parseFlags 加已知选项白名单,未知/拼错选项与布尔开关误带 =值 一律报错退出 1;新支持 `--key=value` 语法(此前 `--subject=personal` 被静默丢弃产出主体错误的报告);`--subject` 缺值报「缺少取值」不再泄漏 undefined;`check --help` 生效。FX-14——runCheck 对 filesScanned==0 注入显式警告 note「未在该目录发现可识别的小程序源码…本报告不构成任何已通过检查的结论」。cli 单测 ×5 + e2e 空目录 ×1。S5 仅剩 FX-13(blockers-only 空态文案)延期。
>
> **✅ 强化战役对账(2026-07-10)**:FX-07 当前源码 / 草稿 RC 与最新公开版的版本措辞已分开并对齐四个仓库版本字段；FX-13 已闭合——`--blockers-only` 同时过滤 `items` / `selfCheck`，并以过滤后的集合重算摘要和派生 notes。FX-03 / FX-11 的台账状态也已从过期“延期”校正为既有完成事实；上方旧记录不回填。

| ID | 处理 | 严 | 标题 | 位置 | 回归点 |
|---|---|---|---|---|---|
| FX-01 | 🔴热修 | high | **"零依赖"口径与事实矛盾**(js-yaml+argparse 为 prod 依赖、核心渲染器 import) | package.json / data.mjs:6 / explain.mjs:6 / README / 多 docs | 去依赖→`npm ls --omit=dev` 只列本包;或全仓改措辞 + 登记引入理由,均须 `npm test` 全绿 |
| FX-02 | 🔴热修 | med | docs/06 阶段 P0→P2 并产出 P2 验收报告 | docs/06 §0/§4 | 阶段表=P2、测试状态列对应真实文件、存在本验收报告(=本文 §1) |
| FX-04 | 🔴热修 | high | **二进制级 E2E 全链路缺失** | tests/e2e.test.mjs(新) | spawn 驱动 bin:check sample-app→privacy.getUserProfile;check leaky-app→hardcoded-secret 且 exit 2;guide/explain/checklist;注入 bin bug 先 RED |
| FX-05 | ✅已修(S4执行,2026-07-05) | med | **scanProject 圈复杂度 ~20–24 超阈 2 倍** | src/scanner.mjs：已拆 `extractFacts`/`parseAppConfig` | 拆分后每子函数 <10;等价性由夹具钉板/准确性金快照/dogfood 三网背书,scanner.test.mjs 全绿 |
| FX-06 | ✅已修(2026-07-01) | med | **非法 `--subject` 静默产出伪清白报告** | cli.mjs:78 / check.mjs:19 | `--subject foobar`→非 0 退出 + 提示枚举;与 mcp.mjs SUBJECT_ENUM 行为对齐;加 cli 单测 |
| FX-08 | 🔴热修 | med | docs/08 "全行业没人做透"命中 DOD-P0 禁词变体 | docs/08:267 | 加来源限定或删绝对化从句;grep 全仓无正面绝对化用法 |
| FX-09 | 🔴热修 | med | **README mpvue 框架枚举无证据**(无夹具/别名/内部清单不含) | README:96,124 / data.mjs:42 / README:71 | 去 mpvue→五大框架,或补夹具+测试;四处枚举一致 |
| FX-03 | ✅已修(S2;2026-06-22) | med | docs/04 历史计数快照曾与当时权威计数冲突 | docs/04:5,7,10 | 保留带日期快照;顶部声明当前计数以 `npm run validate` / `npm run coverage` 实测为准 |
| FX-07 | ✅已修(S2;2026-07-13 再对账) | med | CHANGELOG 当前发布候选与最新公开版的版本口径已分开 | CHANGELOG:4 / package.json / manifest.json / package-lock.json | 当前仓库四个版本字段均为 `0.2.0-rc.2`;最新公开版明确为 `v0.1.0` |
| FX-10 | ✅已修(S6执行,2026-07-05) | med | 性能基线门禁无实现 | tests/perf.test.mjs | 1000 文件 <3s 本机/8s CI、heap 增量 <200MB,已实测通过 |
| FX-11 | ✅已修(S1;2026-06-22) | med | **准确性工程地基已落地**(labels + accuracy 门禁 + fixture pins) | corpus/labels.json / corpus/fixture-pins.json / scripts/accuracy.mjs / tests/accuracy.test.mjs | 当前标注集 89 条(2026-07-17):TP=55 / FP=0 / FN=0;precision=recall=1.000,漂移即 fail |
| FX-12 | ✅已修(S4执行,2026-07-05) | low | scanner walk 跟随符号链接可读所选目录外文件 | src/scanner.mjs walk（`isSymbolicLink()` 跳过） | 不跟符号链接/junction,软链越界单测已覆盖 |
| FX-13 | ✅已修(强化战役;2026-07-10) | low | `--blockers-only` 的条目、摘要与派生注记已统一按过滤后集合计算 | src/cli.mjs / tests/cli.test.mjs / tests/e2e.test.mjs | `items` 与 `selfCheck` 都只留 blocker;摘要 / notes 不泄漏过滤前计数或非阻断自查项 |
| FX-14 | ✅已修(2026-07-02) | low | 扫 0 文件给虚假安心 | check.mjs:42 / report.mjs:82 | notes 含"未扫描到源码,请确认项目根" |
| FX-15 | 🟡延期 | low | 桌面薄壳 markdown 原样塞 `<pre>` 用户看字面量 | desktop lib.rs / main.ts | P2.1:`--json` + DOM 结构化渲染(=切片7) |
| FX-16 | ✅已修(2026-07-02,公开前体检升级为必修) | low | 未知/拼错 flag 静默忽略 | cli.mjs:45-56 | flag 白名单,未知→提示 + return 1 |
| FX-17 | ✅已修(2026-07-05) | low | 已导出纯函数缺直接单测(stripUniConditional / parseISODate / _LOCATION_DECL_APIS) | tests/scanner.test.mjs 等直测已落地 | 参数化直接单测已补齐 |
| FX-18 | ✅已修(S8执行,2026-07-05) | low | 多处 `catch{}` 静默降级缺 stderr 诊断 | src/mcp.mjs | 坏行回 -32700(id:null)+ stderr 诊断,单行 1MB 上限丢弃并告警,stdout 保纯 JSON-RPC |
| FX-WONTFIX-01 | ⚪不予(误报) | — | "83 测试全绿为假/mcp E2E 失败"——本机 18 次复跑零复现,实测 83/0 | mcp.test.mjs:64 | 对抗复核判 false_positive;`setTimeout(400)+kill` 异味降级为 FX-18 类延期硬化(改事件驱动收齐 id===1/2 再 resolve) |

---

## 3. 四维优化方案(质量 / 效率 / 稳定性 / 可维护性)

**质量**
- `cli.mjs` 加 subject 枚举校验(提取共享 `SUBJECT_ENUM`),消除伪清白报告——质量红线"不出现已合规假象"(FX-06)。
- `report.mjs` 空态文案分支化:区分"真无命中 / 过滤后无阻断(共 M 条)/ 0 文件未扫到",一处收口报告语义可信度(FX-13/14)。
- 建 `corpus/labels.json` + `scripts/accuracy.mjs`:对 sample-app/leaky-app 全规则三态标注、复用 `runCheck` 算 precision/recall,把"准确性是护城河"从口号变可度量门禁(FX-11)。
- 全仓 grep `零依赖|没人做|全行业|45条|支付1` 逐条对齐单一权威源,docs/04、docs/08 顶部加"权威计数/口径见 X"引用声明,杜绝跨文档矛盾复发。

**效率**
- `scanner.mjs` 模板探测改表驱动 `TEMPLATE_SIGNALS=[{re,key}]` 循环,消除单文件路径重复 if 序列(同时降 scanProject 复杂度)。
- `walk()` 用 `readdirSync({withFileTypes:true})` 替代 `readdirSync + statSync` 两次系统调用(省一次 stat,顺带修 FX-12 软链越界)。
- `mcp.test.mjs` 把 `setTimeout(400)+kill` 改事件驱动(收齐 id===1/2 即 resolve),消竞态且单测耗时 400ms→~5ms。

**稳定性**
- 建 `tests/e2e.test.mjs` 二进制级全链路(覆盖 cli 退出码 2 契约——CI 门禁依赖退出码判阻断,此前 0 覆盖)(FX-04)。
- 建 `tests/smoke.test.mjs`:8 夹具 + `runGuide({})` + `runExplain('')` + dispatch ping 最小存活断言,作 CI 首道哨兵。
- 静默 `catch` 补 stderr 诊断(stdout 保纯 JSON-RPC),dogfood 真机排错可区分"真无信号"与"读取/解析失败被吞"(FX-18)。
- `runStdio` 给单行设 1MB 上限,超限丢弃 + stderr 告警(健壮性兜底)。

**可维护性**
- `scanProject` 拆 `extractFacts` + `parseAppConfig`,主函数只 walk + 聚合 Set,后续加规则不再往函数中段插 if(FX-05)。
- docs/06 6 闸从一次性 ⏳ 清单升级为"每轮 + 每切片可勾选"复盘清单(FX-02,见 docs/06)。
- 为纯函数补直接单测(FX-17),给"代码已正确但零直接覆盖"的函数上锁,防重构静默回归。
- desktop `run_brain` 从"stdout 非空判成败"改退出码语义(0/2/1),与 cli 契约稳定后实施(P2.1)。

---

## 4. 功能切片开发计划清单(8 片 · 每片带 DOD)

> 切片 = 可独立验收的纵向功能片。**每片合并前必须过 docs/06 的 6 闸**(DOD 对抗审查 / 代码质量门禁 / Fix 分级+回归 / 全链路测试 / Dogfood / 四维复盘),逐条勾选方算"完成"。

| 切片 | 内容(FX 映射) | 优先级 | DOD 要点 |
|---|---|---|---|
| **S1 准确性工程地基** | FX-11(P2.0.5,docs/08 §4.2) | ★最高 | corpus/labels.json 覆盖 sample-app+leaky-app 全规则三态标注 / accuracy.mjs 输出全局 precision ≥0.95 且任一规则 FP=0 / accuracy.test.mjs 黄金快照 diff 即 fail / 加 package.json scripts。**可与 S7 并行** |
| **S2 准入口径真实性** | FX-01+FX-03+FX-07+FX-08+FX-09 | ★最高(准入) | 零依赖措辞全仓与 `npm ls` 一致(或真去依赖)/ docs/04 计数=46&payment2&0draft / CHANGELOG=0.1.0 / docs/08 无禁词变体 / 框架枚举四处一致。**纯文档+package.json,无代码回归** |
| **S3 E2E + 冒烟 + 退出码契约** | FX-04(+ smoke.test.mjs) | 高(准入) | e2e.test.mjs spawn 驱动 bin 覆盖 check/guide/explain/checklist 五路径 + leaky-app exit2 契约 / 注入 bin bug 先 RED / CI 集成。补齐 docs/06 关键路径 E2E 门禁 |
| **S4 scanner 重构 + 复杂度** | FX-05+表驱动+FX-12+FX-17 | 高(准入) | scanProject 拆分后每子函数圈复杂度 <10 / scanner.test.mjs 全绿且 fixtures 输出逐项不变 / 软链越界单测 / 纯函数直接覆盖。同源改动集中一片降回归面 |
| **S5 CLI 健壮性 + 报告语义** | FX-06(热修)+FX-13/14/16(延期) | 中 | subject 枚举校验非法即非 0 退出 / 未知 flag 提示 / 空目录与过滤后空态文案不矛盾不伪清白 / 全部新增 cli 单测 |
| **S6 性能基线** | FX-10 | 中(标解锁) | perf.test.mjs 1000 文件 <3s 且 heap 增量 <200MB,或验收报告显式标 N/A + 解锁条件并登记延期债务 |
| **S7 P2.1 桌面前端体验** | FX-15 + lib.rs 退出码契约 + desktop L2/L3 测试地基 | 中 | 桌面报告区无裸 markdown(MD→DOM 结构化:标题层级/勾选框/严重度色块/来源链接)/ 空错态提示 / Rust + 前端各 ≥1 happy-path 测试。**依赖 S3 退出码契约先稳定** |
| **S8 诊断与背压** | FX-18 + MCP 单行 1MB 上限 | 低 | stderr 出诊断而 stdout 保纯 JSON-RPC / 坏行回 -32700 / 超大行不 OOM 有告警。可随 S4 或之后 |

**建议执行序**:S2(准入口径,清掉诚实硬伤)→ S1(准确性地基,make-or-break)+ S3/S4(测试+重构,补门禁)→ S5/S6 → S7/S8。S1 与 S7 可并行(docs/08 §9)。

---

## 5. 执行约定(每切片闭环)

1. **开片**:对照本片 DOD + docs/06 6 闸列出"完成"判据。
2. **改 + 自检**:小步改;改完即 `npm test`(回归)。
3. **6 闸走查**:DOD 对抗审查(独立上下文)/ 代码质量(复杂度≤10、静态安全 0 high、不回显密钥 PII)/ Fix 分级 + 回归证据 / 全链路测试(本片相关层)/ Dogfood(真机跑一遍)/ 四维复盘一句话。
4. **留证**:修复进本文 §2 台账追加;通过/失败/NA 入 docs/06 验收报告。
5. **半成品不流转**:任一闸不过,不合并。
