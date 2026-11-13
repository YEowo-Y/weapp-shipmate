# 26 · 实施交接（工单、步骤、完成判据）

2026-11-13。读者是接手实施的 agent（Codex 或其他）和维护者。方案的「是什么、为什么」在 `docs/25-vertical-agent-shell-plan.md`；本文只写怎么做、做到什么算完。

写本文时没有改动任何产品代码、规则或治理文件。文中行号以提交 `5cbec65` 为准，行号漂移时按引用的原文搜索。

## 1. 怎么用

1. 读 §2 通用流程和 §3 必须停下的关口。
2. 在 §4 总表里选「依赖已满足、不在等批准或公示、编号最小」的工单，照它的编号步骤做。T01 开完公示 issue 后就算在等，先做别的。
3. 每一步都有判据；判据不成立就停在那一步，不往下做。
4. 工单合并后，由下一张工单的第一个提交把 §4 总表的状态列改成 `done` 并写上 PR 号。工单自己的最后一次提交里把状态写成「PR 中」。
   理由：PR 号在开 PR 后才有，合并后再单独推一次会多跑一轮 CI。

## 2. 通用流程

**工作分支**指 `feat/ui-refresh-ocu-sync-20261025`。T07 合并后，工作分支改指 `main`。本文只在这里定义它，其他地方都写「工作分支」。

1. 同步：`git fetch origin`，`git switch <工作分支>`，`git pull --ff-only`。
   判据：`git status` 显示与远端一致。
2. 装依赖：`npm ci`，再 `npm ci --prefix desktop`。
   理由：`tests/` 里的 broker 测试要从 `desktop/node_modules` 解析 `ai`，只装根依赖会报 `Cannot find package 'ai'`。
3. 跑基线：`npm run lint`、`npm test`、`npm run verify:quotes`、`npm run coverage`。
   判据：四条退出码都是 0（`5cbec65` 上 `npm test` 为 1659 项、失败 0；跳过数取决于本机是否跑过 `prepare:runtime`、是否有已构建的候选 EXE，见过 0 和 2 两种）。基线本身是红的就停下报告，不要在工单里顺手修。
4. 开工单分支：`git switch -c codex/t<编号>-<短名>`。
5. 做工单。提交信息用英文 conventional commits（`type(scope): subject`），与 `git log` 现有风格一致。
6. 跑该工单「验证」一栏的命令，再跑一遍第 3 步的四条。
7. 推送并开 PR：`gh pr create --base <工作分支>`。PR 描述写明：做了什么、每条判据的实际输出、没做什么。
   理由：`pull_request` 会触发 `validate-rules`（六条腿）和 `glib-backport`（两个 job）；桌面 `tsc` 构建和 Rust 只在后者里跑（`cargo test` 只在它的 Windows job），本地不装 Rust 时这是唯一的验证。
8. CI 全绿后合并：`gh pr merge --merge`，不删分支。标了「需维护者批准」的工单等维护者在 PR 里明确同意后再合。T07 之后工作分支是 `main`，此后每个 PR 合并前是否都要维护者批准，在 T07 的 PR 里请维护者定；定下来之前，每个 PR 都按需批准处理。
9. 在根目录 `progress.txt` 追加一行：`YYYY-MM-DD HH:mm（北京时间）| 工作概要`。

**Git 约定**（`main` 没有分支保护，私有仓库免费版开不了，所以只能靠约定；出处 `STRENGTHENING_PLAN.md` 第 15、25、46 行）：

| 不做 | 改做 |
|---|---|
| 直接 push `main` | 开 PR，merge commit 合并 |
| squash、rebase、amend、force-push | 追加新提交修正 |
| 删除分支 | 合并后保留 |
| 本地 `main` 上提交或 merge | 只 `git pull --ff-only` |
| 移动或复用 tag（`v0.1.0`、`v0.2.0-rc.1`–`rc.3` 已存在） | 需要新 tag 时先升版本号，由维护者决定 |

**Actions 用量**：仓库私有，分钟数计费，Windows runner 按两倍计。每次向 PR 推送都会跑完整的六腿矩阵加两个 job（实测墙钟：`validate-rules` 约 1–2.5 分钟，`glib-backport` 约 7–8 分钟；计费分钟数没有取到）。所以本地验证通过后再推，一张工单攒成一次推送，不要每个提交推一次。发现用量异常就告诉维护者。

**本机环境**：Windows、PowerShell。输出中文前先执行 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。Node 用 `.nvmrc` 指定的 22（24 也可）。跑 Rust 测试要 `rustup toolchain install 1.94.1 --profile minimal`，命令是 `cargo +1.94.1 test --manifest-path desktop/src-tauri/Cargo.toml --locked`。

## 3. 必须停下问维护者的关口

准备到只差最后一步，然后停下，在 PR 或 issue 里写清楚要批准什么。完整理由见 `docs/25` §10。

| 动作 | 出现在 |
|---|---|
| 合并任何改动 `GOVERNANCE.md`、`SECURITY.md` 承诺措辞的 PR | T01 |
| 改写规则断言（`warn`、`why`、`requires`）、把规则降为 `draft` | T04、功能 5 |
| 需要登录微信账号才能看到的来源 | T04 |
| 合入 `main`（T07 那一次）、打 tag、发布 Release、`npm publish`、仓库公开 | T07、发布工程 |
| Actions 按提交 SHA 固定、`.mcpb` 签名 | 发布工程 |
| 新增生产依赖（根 `dependencies` 或 `desktop/package.json` 的 `dependencies`）、Rust 新 crate | T08、功能 6、7、11 |
| 扩大模型能调用的开发者工具操作（加入预览、上传、登录，或 automator 白名单外的方法，如 `evaluate`、`callWxMethod`、`remote`）；开放自定义 MCP 连接 | 功能 7、7b、12 |
| 改 `Permission` 结构、SQLite 数据模型、CLI 与 MCP 的公共接口 | 功能 1、6、10，CLI 成熟度 |
| 规则包独立更新（远程规则） | 功能 9 |
| 本文没有写到、但会写入仓库之外的任何动作 | 任何时候 |

开 issue、开 PR、向工单分支推送不在此列，可以直接做。

## 4. 工单总表

| 工单 | 内容 | 粗估（天） | 依赖 | 需维护者批准 | 状态 |
|---|---|---|---|---|---|
| T01 | 治理措辞与安全设计 | 1–2 | 无 | 是（合并前） | 未开始 |
| T02 | `release.yml` 补桌面依赖 | 0.5 | 无 | 否 | done（#20） |
| T03 | broker 标准输出隔离 | 0.5–1 | 无 | 否 | PR 中 |
| T04 | 规则来源复核，**硬期限 2026-12-11** | 3–5 | 无 | 是（规则改写、降级、登录墙） | 未开始 |
| T05 | 逐字门禁覆盖内联规则 | 1 | T04（或其 PR A）已合并 | 否 | 未开始 |
| T06 | 版本号统一 | 0.5–1 | 无 | 否 | 未开始 |
| T07 | 合入 `main` | 0.5，另加等 CI | T02–T06 已合并 | 是 | 未开始 |
| T08 | 私有文件排除清单合一 | 1 | 无 | 仅当需要新依赖 | 未开始 |

工时是单人粗估，没有历史速度数据。T01 开了 issue 之后要等公示，等的时候做 T02、T03、T06；T04 有硬期限，最晚 2026-11-24 开工。

## 5. 第一阶段工单

### T01 治理措辞与安全设计

**目的**：维护者已裁决 agent 模式可读改源码、可上传体验版，并将预览并入第二项例外（见 `docs/25` §10）。现有文件写的是「不上传源码」，功能做出来之前要先把话改准，并写出安全设计。

**范围**：治理与文档文件、一份新的安全设计文档。**不改任何产品代码。**

1. 开 issue 公示。标题「治理措辞调整：源码默认留在本机，两项由用户开启的例外」，正文贴第 2 步的拟定措辞、第 3 步的文件清单和 `docs/25` §4.3、§4.5、§5.1 的链接。命令：`gh issue create --label documentation`。
   理由：`GOVERNANCE.md` 第 18、22 行要求承诺调整先开 issue 公示。issue 模板里的标签在仓库都不存在，所以只用现有的 `documentation`。
   判据：issue 已创建，编号记进 PR 描述。公示多久 `GOVERNANCE.md` 没有规定，在 issue 里问维护者。
2. 在 issue 里记录维护者已确认「预览一并列为例外」（`docs/25` §4.3、§10）。采用下面这段措辞（可以润色，五个要点不能少：默认留在本机、不运营服务器、agent 模式发给自选服务商、预览和上传只传给微信且由用户触发、不是提审和发布）：

   > 源码默认留在本机。本项目不运营任何接收代码、报告或密钥的服务器。只有两项例外，都要用户自己开启或点击：agent 模式默认关闭，开启后会把它读取的文件内容发给用户自选的模型服务商；预览和上传体验版经用户本机已登录的开发者工具执行，每次由用户点击，代码只传给微信，其中上传体验版另有默认关闭的开关。预览和上传体验版都不是提审，也不是发布。

   判据：issue 已记录裁决及拟定措辞，再往下做第 3 步；治理文件 PR 仍须维护者批准后合并。

3. 改必改的五处，每处都改成与第 2 步一致的说法：

   | 位置 | 现在写的 |
   |---|---|
   | `GOVERNANCE.md:15` | 「不上传源码 / 不收集密钥 —— 预检默认本地执行」 |
   | `SECURITY.md:7` | 「默认不联网、不上传源码、不回传报告」 |
   | `README.md:89` | 同类表述 |
   | `EVOLUTION_ROADMAP.md:20` | 同类表述 |
   | `EVOLUTION_ROADMAP.md:124` | 「不做云端上传或远程扫描；local-only 仍是信任根基。」 |

   保持不变的：`SECURITY.md` 第 7 行「预检默认 local-only」这条原则本身（预检确实仍然本地执行）、第 10 行对 MCP 适配层的限制、第 12–25 行的忽略清单、`GOVERNANCE.md` 第 11 行「不接代办」。新措辞要和 `README.md:37`（已写明读取与分享分别授权）一致。
4. 逐处判断下面这些，在 PR 描述里每处写一句「改了 / 没改，因为……」：

   | 位置 | 说的是什么 | 预期 |
   |---|---|---|
   | `docs/02-positioning-and-naming.md:18` | 「不上传源码 / 不收集密钥」 | 改 |
   | `docs/03-decisions-and-architecture.md:16`、`:127` | 预检 local-only、「源码不出本机」的默认 | 改或加注 |
   | `docs/07-desktop-agent-tech-research.md:157` | 调研清单里的一项 | 加注 |
   | `docs/08-product-vision.md:28` | 「不上传源码/密钥」 | 改 |
   | `docs/09-memory-context-architecture.md:342`、`:550`、`:552` | 「源码不出本机」在记忆层的延伸 | 加注 |
   | `docs/03-decisions-and-architecture.md:126`、`docs/12-current-capabilities.md:52` | 密钥不回传 | 不改 |
   | `docs/14-first-run-and-trial.md:101` | 只读验包工具不上传 | 不改 |
   | `src/mcp.mjs:22`、`manifest.json:8,25,33` | CLI 与 MCP 内核「仅本地执行，不上传源码或密钥」 | 不改，内核仍然如此 |
   | `CHANGELOG.md:174`、`desktop/design-previews/research/*.md` | 历史记录 | 不改 |

5. 把方向调整写进 `EVOLUTION_ROADMAP.md`。§1 第 24 行写着「先完成不能由代码替代的用户验证，再扩规则、桌面或 agent 能力」，而 `docs/25` 是在五人试用为 0 份时扩桌面和 agent。在 §1 补一段：日期、维护者的裁决、调整了什么、用户验证仍然要做（`docs/11-outreach-plan.md` 的台账仍是「未执行」）。再检查 S1（第 32 行）、M1（67）、M2（78）、L1（91）和 §6 第 126 行，与新段落矛盾的地方加注，不删原文。
   理由：两份文件互相矛盾地并存，下一个读者不知道信哪份。
6. 新建 `docs/security/agent-mode-and-trial-upload-design.md`。内容覆盖 `docs/25` §5.1「安全设计至少要满足」的七条、§4.3 的实现约束、§4.4 的探测四条线、CloudBase 白名单要求和第三层只接三条只读命令的限制、§4.5 的走查边界（模型可用的固定动作集；automator 白名单外的方法一律不暴露，至少测到 `evaluate`、`exposeFunction`、`callWxMethod`、`mockWxMethod` 及其插件版本、`remote`、`testAccounts`；自动化端口只在走查期间打开，结束用 `disconnect()` 而不是会关项目窗口的 `close()`，并写明怎样确认端口已失效；预览只能由用户触发；登录二维码只显示，不进对话、不落盘）、§4.6 的连接检测不读取也不保存任何令牌。每条写成可验证的要求，并写明由哪张后续工单实现。不要把 `docs/25` 的段落抄过来，引用章节号，只写 `docs/25` 没写到的设计细节。
7. 在 `CHANGELOG.md` 的 `[Unreleased]` 段加一条。
8. 完整性检查：

   ```powershell
   git grep -n -E "不上传|不出本机|云端上传|不回传" -- . ":(exclude)docs/previews" ":(exclude)desktop/design-previews" ":(exclude)docs/25-vertical-agent-shell-plan.md" ":(exclude)docs/26-implementation-handoff.md"
   ```

   判据：每条命中要么已改，要么在 PR 描述里有不改的理由。

**验证**：通用流程第 3 步的四条命令（没有测试断言治理文件的文字，预期全绿）。

**完成判据**：issue 已开；PR 里五处必改已改、判断表逐处有结论、安全设计文档已建；**维护者在 PR 里批准后**才合并。T01 合并前，功能 6、7b、10、11 和功能 7 的预览部分不能开工。

### T02 `release.yml` 补桌面依赖

**问题**：`.github/workflows/release.yml` 第 24 行只执行根 `npm ci`，第 28 行的 `npm test` 会因找不到 `ai` 失败（已在干净 worktree 复现），下一次打 tag 必败。`ci.yml` 第 34 行已有 `npm ci --prefix desktop`。

1. 先写测试。在 `tests/release.test.mjs` 第 83 行起的那个测试里（它用 `indexOfRun` 按 `step.run` 精确匹配），加断言：`npm ci --prefix desktop` 存在，且位置晚于 `npm ci`、早于 `npm test`。
   判据：`node --test tests/release.test.mjs` 变红，失败信息指向新断言。
2. 在 `release.yml` 第 24 行 `- run: npm ci` 之后加一行 `- run: npm ci --prefix desktop`，带一句注释说明原因（参照 `ci.yml` 第 33 行）。
   判据：同一条命令变绿。

**禁区**：不改 `release.yml` 的其他步骤；不打 tag 验证（打 tag 是 §3 的关口）。

**完成判据**：测试先红后绿；PR 的 CI 全绿。这张工单没法在 runner 上真跑 `release.yml`，PR 描述里如实写明「只有测试断言和本机复现，未在 tag 流水线上验证」。

### T03 broker 标准输出隔离

**问题**：桌面端 Rust 进程启动 `desktop/server/desktop-bridge.mjs`，按行读它的 stdout；读到非 JSON 行就断开，在途请求失败（`desktop/src-tauri/src/model_bridge.rs` 第 192–194 行）。broker 进程里任何 `console.log` / `console.info` 都会落到 stdout。AI SDK 6.0.313 的首条告警用的正是 `console.info`（`desktop/node_modules/ai/dist/index.mjs` 第 617–644 行）。Node 侧的污染已实跑复现；Rust 侧断开是读码结论，没有端到端复现。

**范围**：只改 Node 侧入口和测试。

1. 先写回归测试，放在 `tests/desktop-model-bridge.test.mjs`（该文件已 import `spawn` 和 `once`，第 76–109 行有现成的 stdio 测试可参照）。用子进程启动 broker，并预加载一段会在退出前打印的代码：

   ```js
   const preload = "let done=false;process.on('beforeExit',()=>{if(done)return;done=true;console.info('probe-info');console.log('probe-log');console.warn('probe-warn');});";
   const args = ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'desktop/server/desktop-bridge.mjs'];
   ```

   关闭 stdin 让它退出，然后断言：退出码 0；stdout 每一行都能 `JSON.parse`；stderr 含 `probe-info`、`probe-log`、`probe-warn`。
   判据：测试变红，stdout 里出现 `probe-info` 和 `probe-log` 两行非 JSON。
2. 改 `desktop/server/desktop-bridge.mjs` 第 148–150 行的入口分支，在调用 `runStdio()` 之前做两件事：`globalThis.AI_SDK_LOG_WARNINGS = false`；把 `console.log`、`console.info`、`console.debug` 改写到 stderr。
   理由：只放在入口分支里，是为了让 import 这个模块的测试不受影响。
   判据：第 1 步的测试变绿；现有 stdio 测试（第 108 行断言退出码 0 且 stderr 为空）仍然绿。

**禁区**：不改 Rust 侧「非 JSON 即断开」的行为，它是对的兜底。`desktop/server/project-watch.mjs:99` 和 `source-check.mjs:125` 也向 stdout 写 JSON 行，不在本工单范围。

**验证**：`node --test tests/desktop-model-bridge.test.mjs`。

**完成判据**：回归测试先红后绿；PR 的 CI 全绿（含 `glib-backport` 的 Windows job）。

### T04 规则来源复核（硬期限 2026-12-11）

**问题**：规则的 `last_verified` 超过 180 天，`npm run rot` 就退出非零。98 个 YAML 载体（66 条规则、8 个阶段、24 条拒因）里，8 个在 2026-12-11 超期，到 12-22 累计 73 个。同时官方页面已经变了：13 份可抓取快照里 12 份漂移，两条规则的引文在官方现文里找不到。`main` 上的 `rule-rot` 定时任务从 2026-08 起连续四次失败，没人处理。

**范围**：`rules/*.yaml`、`flow.yaml`、`rejections.yaml`、`corpus/source-snapshots/`。`src/crosscheck.mjs` 里的 5 条内联规则归 T05。

**规矩**（出处 `GOVERNANCE.md` 第 26–38 行）：引文只能从刷新后的快照文件里逐字复制，不能从本文、`docs/25` 或记忆里抄；只有对照新原文确认断言仍成立，才更新 `last_verified`；日期写核对当天，不写未来日期（未来日期按非法计入超期）。

1. 记录现状：`npm run rot -- --links`。
   判据：退出码 1，16 个链接里 2 个需处置（社区帖判「不可达」，支付页判「已搬家」）。数字不同就以实际输出为准，并在 PR 里写明差异。
2. 改支付来源地址：`rules/payment.yaml` 第 42 行的 `official_url` 改为 `https://pay.weixin.qq.com/doc/v3/merchant/4012791894`。
   不要动 `tests/rot.test.mjs:110-111` 和 `src/rot.mjs:89`，它们把旧地址当测试夹具和示例用。
3. 刷新快照：`npm run snapshot:sources`（联网）。然后删掉不再被索引引用的 `.txt`，预期是两个：`-products-mini-program-payment-introduction-html-04afc704.txt`（支付旧地址）和 `q-com-miniprogram-product-record-guidelines-html-76e8156b.txt`（已无规则引用）。
   判据：下面的命令输出 `[]`。

   ```powershell
   node -e "const fs=require('fs');const d='corpus/source-snapshots';const used=new Set(require('./'+d+'/index.json').snapshots.map(s=>s.file));console.log(fs.readdirSync(d).filter(f=>f.endsWith('.txt')&&!used.has(f)))"
   ```

   抓取失败的来源脚本会保留旧快照并报告，这种情况写进 PR，不要手工编辑快照（`loadSnapshots` 会校验 sha256，手改即报错）。
4. 跑逐字门禁：`npm run verify:quotes`。
   判据：恰好两条变红，`category.finance-hint` 和 `category.education-hint`。多于两条说明官方原文在 2026-11-12 之后又变了，新增的每条都按第 5–6 步处理并在 PR 里列出。
5. 修 `category.finance-hint`（`rules/categories.yaml` 第 80 行附近）。2026-11-12 比对时只是措辞变了。从 `opers-weixin-qq-com-miniprogram-product-material-5080a757.txt` 复制新的连续原文片段，再读一遍规则的 `warn` 和 `why`，确认仍被新原文支持。
6. 重判 `category.education-hint`（第 134–150 行）。**需维护者批准**。现引文是「适用于教育机构提供如课程销售、付费课程培训等服务」；官方现文把课程销售一行改成了同时提供三项材料，「付费课程培训」的说法已不存在。按新原文重写 `source_quote`、`warn`、`why`、`requires`，在 PR 里把旧断言、新原文、新断言并排列出。找不到能支持断言的连续原文，就设 `draft: true`、`confidence: medium`，不要拼接或概括。
7. 逐页看快照 diff，把每份漂移的快照归为两类，并在 PR 里列表：

   | 类别 | 怎么判 | 引用它的规则怎么处理 |
   |---|---|---|
   | 只是站点改版 | diff 里只有面包屑、按钮文字、编号样式 | 引文过了门禁即可更新日期 |
   | 正文有实质修改 | 条款增删或改写 | 逐条读引文所在段落，确认断言仍成立后才更新日期 |

   2026-11-03 已知有实质修改的两页和它们的规则，必须逐条读：
   - `/miniprogram/product/material/`：`category.medical-hint`、`payment-hint`、`personal-subject-scope`、`news-hint`、`finance-hint`、`live-hint`、`law-hint`、`education-hint`（都带 `category.` 前缀）。
   - `/miniprogram/product/`：`content.no-illegal`、`data.delete-on-request`、`data.security-measures`、`filing.keep-updated`、`login.clear-data-on-refuse`、`minor.protect`、`outbound.no-recommend-others`、`outbound.no-induced-app-download`、`payment.virtual-must-use-official`、`qualification.provide-materials`。
8. 处理登录墙后的两条规则。**需维护者参与**。`login.after-experience` 和 `login.cancellable`（`rules/login.yaml`，都是 `blocker`）的来源是一篇社区帖，匿名访问会跳到登录页，引文只存在于一份 2020 年的人工快照里。现有快照里没有可替代的官方 primary 来源。在 PR 或 issue 里请维护者二选一：

   | 选择 | 做法 |
   |---|---|
   | 维护者登录后核对原帖 | 维护者提供正文；更新 `develop-doc-000ea46d08898015317b956c65fc09-531b318a.txt`，按下面的命令重算，把 `index.json` 里该条的 `sha256`、`chars`、`fetched_at`、`note` 一起改掉 |
   | 核对不了 | 两条规则设 `draft: true`；`rejections.yaml` 第 53 行起的 `reject.forced-login` 同步加 `draft: true`（否则 `npm run validate` 报错）；`tests/guide.test.mjs:85-86` 会变红，怎么改由维护者定 |

   ```powershell
   node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; import {stripProvenanceHeader} from './src/source-quotes.mjs'; const t=stripProvenanceHeader(readFileSync('corpus/source-snapshots/develop-doc-000ea46d08898015317b956c65fc09-531b318a.txt','utf8')); console.log(createHash('sha256').update(t,'utf8').digest('hex'), t.length)"
   ```

9. 更新 `last_verified`。至少覆盖日期早于 2026-07-01 的 73 个 YAML 载体；日期为 2026-07-16 的 10 条（2027-01-13 超期）建议一并做。`flow.yaml` 的阶段和 `rejections.yaml` 的拒因没有引文：有 `official_url` 的阶段确认链接可达、描述仍相符；其余的在它关联的规则全部核对通过后更新。
   判据：下面的命令列出的超期载体只剩 5 条内联规则（`security.*` 等，`ruleId` 见 `src/crosscheck.mjs`），以及 PR 里明确写了「未能核验」及原因的那些。

   ```powershell
   $env:WEAPP_SHIPMATE_TODAY='2026-12-31'; npm run rot; Remove-Item Env:WEAPP_SHIPMATE_TODAY
   ```

10. 规则改动让准确性金快照或夹具钉板变红时，按 `CONTRIBUTING.md`「改规则的验收协议」处理。

**一个要维护者定的遗留问题**：`rule-rot` 监控包含 `draft` 规则，所以第 8 步无论选哪条，社区帖的链接都还会被判「不可达」，每月的定时任务仍然会红（读 `scripts/rule-rot.mjs` 第 19–21、62、71 行得出，没有实跑验证）。这是如实的信号，不要为了变绿去改 `src/rot.mjs` 的判定。在 PR 里把这一点告诉维护者，由他决定是换来源、删规则，还是接受这条告警。还要一并告诉他：`rule-rot.yml` 里链接体检一失败，后面的快照漂移检查就被跳过（2026-11-01 那次运行就是这样），所以只要这条告警在，CI 里永远看不到漂移；要不要给漂移那一步加 `if: always()` 也由他定。

**禁区**：不调大 `WEAPP_SHIPMATE_STALE_DAYS`；不改快照去迁就引文；不新增规则（深度合成等补缺是功能 5）。

**可以拆成两个 PR**：维护者的批准（第 6、8 步）到 2026-12-08 还没有着落时，把第 1–5、7、9 步（不涉及第 6、8 步那三条规则）作为 PR A 先合，第 6、8 步作为 PR B 等批准。T05 只依赖 PR A。

**验证**：`npm run validate`、`npm run verify:quotes`、`npm test`、`npm run accuracy`、`npm run rot -- --links`（预期只剩社区帖一条需处置）。

**完成判据**：第 9 步判据成立；`verify:quotes` 全绿；规则改写与降级经维护者在 PR 里批准。

### T05 逐字门禁覆盖内联规则（期限 2026-12-12）

**问题**：`src/crosscheck.mjs` 里有 5 条内联规则（`ruleId` 在第 37、70、95、119、153 行），带 `source_quote` 但不在逐字门禁里，其中 3 个链接没有快照。实测其中 `security.insecure-request`（第 128 行）的引文用了全角括号，官方原文是半角括号加空格，对不上。这 5 条的 `last_verified` 是 2026-06-15，2026-12-13 起超期。

**依赖**：T04 已合并（快照已刷新）；T04 拆成两个 PR 时，PR A 已合并即可。

**禁区**：第 2 步重新抓取时，内联规则之外的来源快照若有变化，不纳入本 PR；停下报告，按 T04 第 5–7 步另开工单。

1. 先扩测试。`tests/source-quotes.test.mjs` 第 109–127 行的两条红线测试现在只读 `loadData` 的规则，改为同时覆盖内联 5 条。内联条目用 `src/source-catalog.mjs` 的 `loadSourceReferences()` 取，筛 `_file === 'src/crosscheck.mjs'`；`verifyQuotes` 只需要对象带 `id`、`source_quote`、`official_url`、`draft`、`_file`，可以直接传入。
   判据：`node --test tests/source-quotes.test.mjs` 变红，报 3 个链接缺快照，以及 `security.insecure-request [missing]`。
2. 让 `scripts/snapshot-sources.mjs` 抓取内联规则的链接（第 42–43 行现在只从 `loadData` 的规则取 URL），再跑 `npm run snapshot:sources`。
   判据：`corpus/source-snapshots/index.json` 多出 3 条，对应 `…/reference/configuration/app.html#requiredPrivateInfos`、`…/server-ability/backend-api.html`、`…/mp-access-token/api_getaccesstoken.html`。
3. 让 `scripts/verify-source-quotes.mjs` 的 `main`（第 68–71 行）同样纳入内联 5 条。
4. 修 `src/crosscheck.mjs` 第 128 行的引文：从快照 `m-miniprogram-dev-framework-ability-network-html-fc7d0a47.txt` 里逐字复制那一句。
   判据：`npm run verify:quotes` 全绿；第 1 步的测试变绿。
5. 逐条读 5 条内联规则的引文所在段落，确认断言成立后更新第 47、80、105、129、163 行的 `last_verified`。
   判据：`$env:WEAPP_SHIPMATE_TODAY='2026-12-31'; npm run rot; Remove-Item Env:WEAPP_SHIPMATE_TODAY` 的超期清单里不再有这 5 个 `ruleId`。

**会被牵动的测试**：`tests/source-check.test.mjs`（第 68 行钉来源目录恰好 16 个去重链接，内联链接本来就在目录里，预期仍是 16）、`tests/p3-onboarding-rules.test.mjs`、`scripts/coverage.mjs`。跑全量 `npm test` 确认。

**完成判据**：门禁覆盖 71 条带引文的规则（66 加 5）；测试先红后绿；PR 的 CI 全绿。

### T06 版本号统一

**问题**：根 `package.json`、`manifest.json`、根 lock 是 `0.2.0-rc.3`；桌面的五个文件（六个字段）是 `0.1.0`。安装器显示 0.1.0，随包内核是 0.2.0-rc.3。发布校验脚本只看根的四个字段。

1. 先扩测试和校验脚本。`scripts/check-release-version.mjs` 的 `readRepositoryVersionIdentity`（第 11–21 行）增加桌面的六个字段，`assertVersionIdentity`（第 23–54 行）一并比对。`tests/release.test.mjs` 要同步改三处：第 17–23 行的 `CONSISTENT`、第 32–38 行的逐载体漂移用例、第 56–63 行的 `deepEqual`（现在钉死恰好四个字段）。
   注意 `scripts/build-mcpb.mjs` 第 27–32 行只传四个根字段调用 `assertVersionIdentity`：要么让桌面字段在未传入时不参与比对，要么把那处调用一起改。
   判据：`node --test tests/release.test.mjs` 变红，指出桌面载体是 `0.1.0`。
2. 把这六个字段改成 `0.2.0-rc.3`：

   | 文件 | 位置 |
   |---|---|
   | `desktop/package.json` | 第 4 行 |
   | `desktop/package-lock.json` | 第 3、9 行 |
   | `desktop/src-tauri/tauri.conf.json` | 第 4 行 |
   | `desktop/src-tauri/Cargo.toml` | 第 3 行 |
   | `desktop/src-tauri/Cargo.lock` | `name = "desktop"` 条目的下一行（第 695 行附近） |

   不要改 `desktop/security/glib-variant-iter/Cargo.toml` 和 `desktop/src-tauri/src/project_store.rs` 第 1727、2100 行的 `0.1.0`，它们是独立 crate 和测试夹具。
   判据：`node scripts/check-release-version.mjs v0.2.0-rc.3` 退出码 0；`npm ci --prefix desktop` 成功（证明 lock 没改坏）。
3. 把 `desktop/src-tauri/tauri.conf.json` 第 29 行的 `"targets": "all"` 改为 `"targets": ["nsis"]`。
   理由：MSI 打包拒绝预发布版本号（实跑报错 `optional pre-release identifier in app version must be numeric-only … for msi target`），NSIS 接受。首发也只做 NSIS（`docs/25` §7）。
4. 实跑打包：`npm --prefix desktop run tauri -- build`。
   判据：退出码 0，`desktop/src-tauri/target/release/bundle/nsis/` 下生成 `weapp-shipmate-desktop_0.2.0-rc.3_x64-setup.exe`，且没有生成 MSI。产物目录已被 gitignore，不要提交。本机没有 Rust 时这一步做不了，在 PR 里写明并请维护者代跑。
5. 更正 `docs/14-first-run-and-trial.md` 第 53 行：它写着桌面版本 `0.1.0`、`targets=all`、「不要把CLI的rc.3版本写成桌面版本」，改成统一后的事实。同文件第 7、11、67、71 行是历史候选包的记录，不改。
6. 在 `CHANGELOG.md` 的 `[Unreleased]` 段加一条。

**不会受影响的**：已保存报告里的 `toolVersion` 取自根 `package.json`（`project_store.rs` 第 606 行），改桌面版本不会让旧报告被判为过期。

**验证**：`npm test` 全量（有 25 个测试文件读 `tauri.conf.json` 或 `Cargo.toml`）；PR 上 `glib-backport` 的 Windows job（它用 `--locked`，能发现 `Cargo.lock` 改错）。

**完成判据**：校验脚本覆盖十个字段（根四个、桌面六个）且全部一致；测试先红后绿；NSIS 实跑成功或已请维护者代跑。

### T07 合入 `main`

**问题**：工作分支领先 `main` 615 个提交、落后 0，没有 PR。`rule-rot` 定时任务只在 `main` 上跑，一直在检查旧代码。

**依赖**：T02–T06 已合入工作分支。T01、T08 不是前提。

1. 确认没有落后：`git fetch origin`，`git rev-list --left-right --count origin/main...origin/feat/ui-refresh-ocu-sync-20261025`。
   判据：左边的数字是 0。不是 0 就停下报告，不要自己 rebase 或 merge `main`。
2. 开草稿 PR：`gh pr create --draft --base main --head feat/ui-refresh-ocu-sync-20261025`。描述里列出 T02–T06 的 PR 号和通用流程第 3 步四条命令的输出。
3. 等 PR head 的 CI。
   判据：`validate-rules` 六条腿和 `glib-backport` 两个 job 全绿。
4. **停下，请维护者批准。** 说明：合并方式是 merge commit、分支保留、合并后 `main` 会多出 615 个以上的提交。
5. 批准后：`gh pr ready`，`gh pr merge --merge`（不加 `--delete-branch`）。
6. 同步本地：`git switch main`，`git pull --ff-only`。
7. 看 `main` 上 push 触发的 CI。
   判据：全绿。红了就开工单分支修，不要直接往 `main` 推。
8. 手动跑一次定时检查：`gh workflow run rule-rot.yml --ref main`。
   判据：结果与 T04 末尾的预期一致（只剩社区帖一条需处置）。把结果告诉维护者。
9. 把本文 §2 里「工作分支」的定义改成 `main`（一行），走一个小 PR。

**之后处理 Dependabot**：PR #15（eslint 小版本）让 Dependabot 重新基于 `main`，CI 绿了可以合。PR #16（`js-yaml` 4 → 5）是生产依赖的主版本升级，CI 现在是红的，属于 §3 的关口，交给维护者决定。

**完成判据**：`main` 包含工作分支的全部提交；`main` 上的 CI 全绿；§2 的定义已更新。

### T08 私有文件排除清单合一

**问题**：「哪些文件不能碰」现在有两份实现，互不相同。

| 位置 | 用在哪 | 内容 |
|---|---|---|
| `src/scanner.mjs` 第 28–32 行 `IGNORE_FILE` | 预检扫描（文件不离开本机） | `SECURITY.md` 的六条，加 lock 文件和 `.d.ts` |
| `desktop/src-tauri/src/project_context.rs` 第 22–51 行 `sensitive()` | 附件（内容会发给模型） | 更宽：`.git`、`.ssh`、`.npmrc`、`.key`、`.pfx`、`.sqlite`、文件名含 `secret` / `token` / `credential` 等；**但漏了 `project.private.config.json`** |

agent 模式的读、搜、改三类工具要走同一道检查（`docs/25` §5.1），所以先合成一份数据。

**设计约束**（换做法也要满足）：

- 一份数据文件，JS 和 Rust 都读它，谁也不再硬编码清单。
- 数据用精确名、前缀、后缀、包含这几种条件表达，条件可以组合（如前缀且后缀，用来表达 `private.*.key`），不用正则。理由：Rust 依赖里没有 `regex`，加 crate 是 §3 的关口；`serde_json` 已有。
- 写明大小写语义。现状两侧不同：Rust 先转小写再比（`project_context.rs` 第 23 行），JS 的正则区分大小写（`scanner.mjs` 第 29 行）。合一后统一为比较前转小写；第 1 步的用例表按两侧分别记录改动前的结果。
- 分两档，不要直接取并集。第一档「不读」是 `SECURITY.md` 那六条，扫描器和所有工具都用；第二档「不外发」是 Rust 现有的宽条件，只用于内容会离开本机的路径（附件、agent 工具）。理由：把「文件名含 token」套到扫描器上，`utils/token.js` 这样的正常源码就不再被预检了（推断，未实跑）。
- 数据文件要能随 npm 包、`.mcpb` 和桌面运行时一起分发。`package.json` 的 `files` 含 `src/`；但 `desktop/scripts/prepare-runtime.mjs` 第 84–86 行从 `src` 只复制 `.mjs`。

**建议做法**：数据放 `src/private-files.json`；`src/scanner.mjs` 用 `readFileSync` 读；Rust 用 `include_str!` 在编译期嵌入、`serde_json` 解析；`prepare-runtime.mjs` 的过滤条件放行这一个文件。

1. 先写一份两侧共用的用例表（文件名 → 第一档是否拦、第二档是否拦），JS 测试和 Rust 单元测试都读它。用例至少覆盖 `SECURITY.md` 第 17–22 行的六条、Rust `sensitive()` 现有的每个条件、`project.private.config.json`，以及几个不该拦的正常文件名（如 `app.json`、`utils/token.js` 对第一档）。
   判据：Rust 侧 `project.private.config.json` 的用例变红；其余用例在改动前就是绿的（证明用例表如实描述了现状）。
2. 建数据文件，改 `src/scanner.mjs` 从数据生成判断，保留 lock 文件和 `.d.ts` 这两条与隐私无关的忽略。
   判据：`npm test` 全绿（含 `tests/project-watch.test.mjs` 第 46–54 行对 `isScanPathEligible` 的断言）；`npm run accuracy` 仍是 TP 55 / FP 0 / FN 0。
3. 改 `project_context.rs` 的 `sensitive()` 读同一份数据，两档都用。
   判据：第 1 步的用例全绿；`cargo +1.94.1 test --manifest-path desktop/src-tauri/Cargo.toml --locked` 通过（本机没有 Rust 就看 PR 上的 Windows job）。
4. 改 `prepare-runtime.mjs` 放行数据文件，然后在 Windows x64 上跑 `npm --prefix desktop run prepare:runtime` 和 `node --test tests/desktop-runtime-package.test.mjs`。
   判据：测试通过且没有被跳过；`desktop/src-tauri/runtime/src/` 下有数据文件。

**禁区**：不改 `SECURITY.md` 第 12–25 行的清单文字；不放宽任何一侧现有的拦截；不新增 `Permission` 字段或 agent 工具（那是功能 6）。

**完成判据**：仓库里只有数据文件一处定义清单（`git grep -n -F -e "project.private.config" -e "project\.private" -- src desktop/src-tauri/src` 除注释和测试外只命中数据文件；现在 `scanner.mjs` 第 29 行写的是转义后的正则，所以要搜两种写法）；两侧用例表全绿。

## 6. 后续工单（第二阶段与功能项）

这些只写到范围、完成判据、依赖和关口，先后与理由见 `docs/25` §8。**轮到哪一项，先在本文按 T01–T08 的格式补出它的编号步骤和判据，开 PR 让维护者确认范围，再动手。** 理由：这些项的做法取决于第一阶段的结果和 `docs/25` §11 里还没核实的事，现在写步骤只会写错。

所有后续工单都要遵守根目录 `AGENTS.md` 的「容易踩的坑」。

**第二阶段：工程底座**

| 项 | 完成判据 | 关口 |
|---|---|---|
| 发布工程 | 版本与 changelog 由流水线生成；`npm publish` 在私有状态下 `--dry-run` 演练通过 | 真实发布、Actions 按 SHA 固定、`.mcpb` 签名都要批准 |
| 生态接入 | MCP server 支持新修订版且保留 `2025-06-18`；工具带 `title`、`readOnlyHint`、`outputSchema`；plugin 与 skill 包能在本机装上并调通 | MCP 公共接口变更；Registry 登记 |
| CLI 成熟度 | 配置文件、baseline、`--fail-on`、SARIF、JSON 输出带 `schemaVersion`，各有测试；不带新参数时输出与现在逐字节一致 | CLI 公共接口变更 |
| 桌面分发 | 安装器在 CI 里构建并产出 SHA256；更新检查只读取版本信息，不自动下载执行 | 发布 Release；更新检查要联网，须符合 T01 的措辞 |
| Rust 加固 | 耗时命令改异步；SQLite 开 WAL；错误用类型而非 `String`；有日志和 panic hook；CI 加 clippy 与 fmt | 数据模型变更；新 crate |
| 前端收敛第一步 | `desktop/**` 进 ESLint 和类型检查；`desktop/src` 不再 import `design-previews`；启动包仍在预算内 | 无 |

**功能项**（编号与 `docs/25` §8 一致）

| # | 功能 | 完成判据 | 依赖 | 关口 |
|---|---|---|---|---|
| 0 | 新外壳 | `docs/25` §6.1 入口对照表里每个入口都能到达；窄于 1180px 右栏收为抽屉、窄于 820px 侧栏收起；每个界面有加载、错误、空三种状态且可纯键盘操作；根目录 `DESIGN.md` 第 16、25、31、40 行已按新外壳更新 | 前端收敛第一步 | 无 |
| 1 | 发现项带证据 | 静态扫描的每个发现项带相对路径和行号；`npm run accuracy` 结果不变 | 无 | CLI 与 MCP 输出字段变更 |
| 2 | 上线进度进右侧面板 | 八个阶段与 `flow.yaml` 一致，按主体类型筛选；原弹窗入口仍可用或已有等价入口 | 功能 0 | 无 |
| 3 | 提审材料包 | 只产出字段映射、待确认草稿、检查清单；清单含测试账号、测试数据、审核期间服务可用三项；没有「可直接提交」这类措辞 | 无 | 无 |
| 4 | 被拒处理闭环 | 贴入拒绝通知文本后给出对应规则、官方原文和下一步；匹配不到时明说匹配不到 | 无 | 无 |
| 5 | 规则补缺 | 新规则满足 `CONTRIBUTING.md` 的准入门禁，引文过 `verify:quotes` | T04 | 规则内容；`EVOLUTION_ROADMAP.md` §6 对批量加规则的限制 |
| 6 | agent 升级（含国内服务商工具调用，已裁决） | T01 安全设计文档里的每条要求都有对应测试；默认仍是摘要模式；DeepSeek、GLM、Kimi 各有一条带工具调用的录制回放测试，`agent-stream.mjs` 不再只认三家 | T01、T08 | `Permission` 结构、新依赖 |
| 7 | 接开发者工具：连接检测、模拟器走查闭环、预览（`docs/25` §4.5） | 未安装、未开服务端口、未登录三种情况各有明确提示和下一步；不读取开发者工具的登录凭据，也不保存任何令牌；模型能调用的操作是本机定义的固定集合，测试证明预览、上传、登录，以及 automator 的 `evaluate`、`exposeFunction`、`callWxMethod`、`mockWxMethod` 及其插件版本、`remote`、`testAccounts` 都调用不到；自动化端口只在走查期间打开，走查结束、取消或出错后都用 `disconnect()` 断开且端口已失效（怎样确认失效以探查结果为准）；登录二维码只在界面显示，不进对话、不落盘；改代码后能重新编译、走查并把控制台和异常交回模型；截图只在 agent 模式下发给模型；预览每次由用户点击 | 功能 0；走查闭环要功能 6；预览要 T01 合并 | 新依赖（`miniprogram-automator`） |
| 7b | 上传体验版 | `docs/25` §4.3 的实现约束逐条有测试：默认关闭、每次确认、模型不能触发、MCP 适配层不暴露 | 功能 7、T01 | 无（已裁决） |
| 8 | 交接给 Codex / Claude Code | 生成的交接内容不含密钥和私有文件内容；用户能看到将要交出去的全文 | 无 | 无 |
| 9 | 规则包独立更新 | 先不做 | — | `EVOLUTION_ROADMAP.md` §6 的 L2 触发门成立并经批准后再排期 |
| 10 | 域名与证书就绪检查 | `docs/25` §4.4 的探测四条线逐条有测试；结果只有「满足 / 不满足 / 无法判断」 | T01 | CLI 输出字段变更 |
| 11 | CloudBase 与开发者工具云开发只读接入（`docs/25` §4.4 第二、三层） | 白名单外的 CloudBase 工具模型看不到；`auth` 和读记录内容的工具不放行；遥测已关闭；开发者工具旧 CLI 只能调用 `cloud env list`、`cloud functions list`、`cloud functions info`，`deploy`、`inc-deploy` 等其余命令有测试证明调用不到 | 功能 6、7 | 新依赖 |
| 12 | 「连接」页与新手引导（`docs/25` §4.6） | 设置里只列三项预置连接，没有添加自定义 MCP 的入口；每项状态与功能 7、10、11 的检测共用同一套逻辑；用夹具项目覆盖无后端、云开发、自建后端、混合四种情况，后端类型判断各有测试；对话步骤卡的「重新检测」与设置页结果一致；引导文案里没有「已合规」「可以过审」 | 功能 0、7、10；CloudBase 一项随功能 11 | 自定义 MCP 不在本项范围 |

**公测拆分（已裁决）**：功能 7 的只读连接检测提前进公测，约 2 天，和功能 0、1、2、8 一起交付；只检测安装、服务端口、登录状态，三种失败状态均有下一步，不编译、不走查、不预览、不经手凭据。功能 7 剩余的走查与预览放在公测后，仍按上表依赖和判据实施。功能 12 的完整连接页与新手引导仍在公测后。工作量以 `docs/25` §8 为准。

四项要先做只读探查再写步骤，探查结果写进对应工单：

- 功能 6：AI SDK 6.x 的 `createMCPClient` 是否稳定可用；DeepSeek、GLM、Kimi 经已装的 `@ai-sdk/openai` 的 `chat()` 加自定义 `baseURL` 能否完成工具调用，不能时才考虑新依赖 `@ai-sdk/openai-compatible`。
- 功能 7：开发者工具 Skills 是否已进 Stable 通道、Stable 版是否带 `wechatide`；命令行形式 `wechatide -c <clientName> -t <工具名>` 是否不需要 MCP Token；`cli auto --auto-port` 的端口是否只监听本机、有没有鉴权；开启「CLI 访问令牌」后 CLI 是否必须带令牌；`miniprogram-automator` 能否连上本机开发者工具版本；`disconnect()` 之后自动化端口是否失效、不失效时怎样关；真机预览是否上传代码包，以开发者工具返回的信息、界面提示或官方文档为准，不抓包（抓包会截获会话凭据），结果交 T01。探查时不读取、不打印任何令牌，只记录「需要 / 不需要」。
- 功能 11：CloudBase MCP 以小程序身份登录的实际流程，以及白名单里能留下哪些工具；本机开发者工具版本的旧 CLI 是否仍提供那三条只读命令。
- 功能 12：拿两三个真实的小程序项目（云开发、自建后端各至少一个）跑预检，看 `apis` 和 `domains` 能否分出后端类型；分不出的情况写进工单，改成在对话里问用户。

## 7. 现在就能开始的一步

```powershell
git fetch origin; git switch feat/ui-refresh-ocu-sync-20261025; git pull --ff-only
npm ci; npm ci --prefix desktop
npm run lint; npm test; npm run verify:quotes; npm run coverage
```

四条检查都通过后：先做 T01 第 1 步（开公示 issue，五分钟），然后在等公示的时候做 T02。T04 最晚 2026-11-24 开工。
