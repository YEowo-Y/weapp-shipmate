# STRENGTHENING_PLAN — 代码库强化作战计划(活文档)

> 一条一更;已被仓库/台账记录的不重复;过时即删。
> 建立:2026-07-04。证据来源:8 路并行深勘 + 高危项对抗复核 + 独立安全审计(共 11 个代理,~105 万 token)。
> 状态:**执行中**(2026-07-04 用户已拍板 4 项决策,见 §3)。

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
