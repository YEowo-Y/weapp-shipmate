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

**工作分支**指 `main`。工单从同步后的 `main` 开分支，通过 PR 合入。

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
8. CI 全绿后合并：`gh pr merge --merge`，不删分支。普通 PR 的全部 CI 检查通过后即可合并。涉及 §3 或工单标明须批准的动作，仍须维护者明确批准。该约定经维护者在 [#27](https://github.com/YEowo-Y/weapp-shipmate/pull/27#issuecomment-6876165887) 确认。
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
| T01 | 治理措辞与安全设计 | 1–2 | 无 | 是（合并前） | done（#22；公示 #19 已结束） |
| T02 | `release.yml` 补桌面依赖 | 0.5 | 无 | 否 | done（#20） |
| T03 | broker 标准输出隔离 | 0.5–1 | 无 | 否 | done（#21） |
| T04 | 规则来源复核，**硬期限 2026-12-11** | 3–5 | 无 | 是（规则改写、降级、登录墙） | done（#23）；登录来源保留在草稿，见 docs/27 |
| T05 | 逐字门禁覆盖内联规则 | 1 | T04（或其 PR A）已合并 | 本次五条断言修订需批准 | done（#26） |
| T06 | 版本号统一 | 0.5–1 | 无 | 否 | done（#24） |
| T07 | 合入 `main` | 0.5，另加等 CI | T02–T06 已合并 | 是 | done（#27；已保留原工作分支） |
| T08 | 私有文件排除清单合一 | 1 | 无 | 仅当需要新依赖 | done（#25） |

工时是单人粗估，没有历史速度数据。T01 开了 issue 之后要等公示，等的时候做 T02、T03、T06；T04 有硬期限，最晚 2026-11-24 开工。

## 5. 第一阶段工单

### T01 治理措辞与安全设计

**目的**：维护者已裁决 agent 模式可读改源码、可上传体验版，并将预览并入第二项例外（见 `docs/25` §10）。现有聊天手动选择的受限文件内容已经随消息发给自选模型服务商（见 docs/12）。公示 #19 中「两项例外」指规划新增的工具权限，不是现有聊天内容的全部出站方式；既有附件授权独立于项目读取、摘要分享和 agent 开关。现有文件写的是「不上传源码」，功能做出来之前要先把话改准，并写出安全设计。

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

**完成判据**：门禁覆盖 69 条默认带引文的规则（64 加 5）；总计 71 条含 2 条 draft；测试先红后绿；PR 的 CI 全绿。

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

**执行结果（2026-11-14）**：#27 经维护者批准，以 merge commit 合入 `main`，保留原工作分支。合并提交 `030e1ce` 的八项 CI 全部通过。手动巡检发现 103 个载体当前均未超期，16 个来源中仅登录社区帖不可达；链接步骤失败后，快照步骤仍运行并报告漂移 0、抓取失败 0。[巡检记录](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/43588126248)

**Dependabot 处理结果**：#15 已由 Dependabot 更新到新的 `main`，最终升级 ESLint 至 10.14.0，八项 PR 检查通过后合并；合并提交 `151bb39` 的八项 CI 也全部通过。维护者决定保留锁文件中的 `js-yaml` 4.3.2，暂缓 #16。v5 迁移须处理默认导出与桌面运行时打包路径变更，再另行验证。

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

实施记录（2026-11-13）：清单采用 `src/private-files.json`，本地预检使用 `noRead`，附件同时使用 `noRead` 和 `noSend`；文件名先转小写，组合前后缀不允许重叠。`tests/fixtures/private-file-cases.json` 记录 46 个用例及两侧改动前结果。旧附件实现实测漏拦私有项目配置，修复后共享用例通过；Windows 便携运行时、npm tarball 与 MCPB ZIP 均含同一清单。

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

### T09 发布工程

**状态**：T09A 与 T09B 已完成。T09A 的 [#30 验收记录](https://github.com/YEowo-Y/weapp-shipmate/pull/30#issuecomment-6897413822) 和 T09B 的 [#33 验收记录](https://github.com/YEowo-Y/weapp-shipmate/pull/33#issuecomment-6915500673) 均包含合并后验证。T09B 验收提交 `f70b071` 的版本为 `0.2.0-rc.4`，主分支八项检查、手动候选重跑与 npm 演练通过。T09C 已按 [#34](https://github.com/YEowo-Y/weapp-shipmate/pull/34) 的范围交付，主分支八项检查与两项手动演练全部通过。[#35 验收记录](https://github.com/YEowo-Y/weapp-shipmate/pull/35#issuecomment-6916488373)

**依赖**：T02、T05、T06、T07 已合并。起点为 `main` 的 `270cff3`，包版本 `0.2.0-rc.3`。

**探查结果（2026-11-14）**

- 仓库为 private。现有 `release.yml` 由 `v*` tag 触发，安装根和桌面依赖，校验版本并打包，最终创建草稿 Release。
- 发布工作流已有 lint、版本、测试与 coverage 门禁，缺少独立的 `verify:quotes` 步骤。测试中的逐字红线已覆盖引文，独立步骤可让发布日志直接展示核验结果。
- `scripts/check-release-version.mjs` 核对八个文件中的十个版本字段。本地 `node scripts/check-release-version.mjs v0.2.0-rc.3` 退出 0。
- npm 11.9.0 实跑预发布版 dry-run，省略 dist-tag 会失败；`npm publish --dry-run --ignore-scripts --tag next --json` 退出 0，报告 42 个文件、压缩大小 80158 字节、解包大小 245384 字节。npm 提示真实发布需要登录。本次证明打包演练通过，真实发布权限尚待发布阶段核实。
- 当前 Actions 默认权限为 read，`can_approve_pull_request_reviews=false`。release-please 自动开 PR 需要仓库允许相应动作；由默认 `GITHUB_TOKEN` 创建的 PR 还需安排后续检查的触发方式。[官方接入说明](https://github.com/googleapis/release-please-action#github-credentials)

#### T09A 发布演练与门禁（已验收）

**目标**：PR 和手动工作流能演练 npm 包，真实 tag 发布路径显式执行引文门禁。演练权限为 `contents: read`，输出包括包清单与执行日志；对外发布继续执行 §3 的审批约定。

1. 从同步后的 `main` 开 `codex/t09-release-rehearsal`，按 §2 安装两处依赖并验证基线。
2. 在 `tests/release.test.mjs` 增加针对工作流的回归检查，覆盖引文门禁早于打包、演练命令强制带 `--dry-run` 和预发布 dist-tag、演练仅授予读权限。先在原工作流上证明新增检查失败。
3. 在 `release.yml` 的打包前补 `npm run verify:quotes`。新增独立演练工作流，由 `pull_request` 和 `workflow_dispatch` 触发，沿用 Node 22。版本来自 `package.json`，传入现有校验脚本，避免把 PR 分支名当成 tag。预发布版使用 `next`，稳定版使用 `latest`。
4. 演练工作流执行两处 `npm ci`、lint、版本校验、全量测试、引文与 coverage 门禁，再运行 `npm publish --dry-run --ignore-scripts --tag <dist-tag> --json`。测试确认每个 publish 调用都处于 dry-run。沿用现有 CI 的 MCPB 暂存冒烟及 tag 工作流的真实打包检查。
5. 将 dry-run JSON 与 `npm pack --dry-run --ignore-scripts --json` 的文件清单对账，确认 CLI、MCP 入口、规则与 `src/private-files.json` 在场。确认桌面目录、本机配置与凭据文件均在包外。两次命令的文件集合与大小应一致，校验以实际输出为准。
6. 本地执行定向测试、§2 四条门禁和 dry-run。PR 的八项现有检查及新增演练均通过，记录各自验证的提交。合并后手动触发演练，核对 `headSha` 与最终主分支提交一致。
7. 记录结果与包清单摘要，更新进度。真实 tag、Release、npm 发布按 §3 单独申请。

**允许变更的文件**：`.github/workflows/release.yml`、新演练 workflow、`tests/release.test.mjs`、本交接文档和 `progress.txt`。实现确需小型校验脚本时，在 PR 说明用途并用现有测试覆盖；当前产品版本沿用 `0.2.0-rc.3`。

**完成判据**：回归测试先红后绿；两种 dry-run 清单一致；PR 的八项既有检查与演练通过；合并后的手动演练通过；工作流发布调用有强制 dry-run 约束。npm dry-run 的行为以官方文档和运行结果共同核实。[npm publish 文档](https://docs.npmjs.com/cli/v11/commands/npm-publish/#dry-run)

#### T09B 版本与变更日志生成（已验收）

**已交付两张 PR**。第一张 [#32](https://github.com/YEowo-Y/weapp-shipmate/pull/32) 增加候选生成命令、隔离的工具依赖和测试，接入只读演练。第二张 [#33](https://github.com/YEowo-Y/weapp-shipmate/pull/33) 用该命令生成首个版本候选 `0.2.0-rc.4` 和变更日志，完成 §2 门禁与 T09A 演练。打 tag、创建 Release 和真实 npm 发布仍各按 §3 裁决。

**历史与版本。** 起点取带注释标签 `v0.2.0-rc.3^{commit}`（`f5dd8f91e571c5cdd54d920c2237977dc937bc9f`）。终点取生成时检出的完整 `main` 提交，两端 SHA 均写入 PR。对已验收的 `c6b21a5` 实测，这段历史共 824 个提交，只走第一父链会只看到 14 个。使用 `git log --no-merges -z --format=%H%x00%B <base>..<head>` 保留 #27 合入的分支内容，取得 797 个非合并提交。首次候选显式指定为 `rc.4`；命令校验同一 `X.Y.Z-rc.N` 序列只增一位，并检查基线可达、候选标签未被占用。转稳定版和以后的候选另选基线，不能反复从 rc.3 生成新版本。

**候选生成。** 在独立发布工具目录锁定 `release-please@17.11.2` 及其 lockfile，使用 Node 22。只读演练检出完整历史，安装工具后从本地 Git 取输入。上游 `simple` 策略接收解析后的 Conventional Commits、基线 tag/SHA 和本次 `releaseAs`，设置 `skipGithubRelease: true`，取 `buildReleasePullRequest` 返回的 `body.releaseData[0]`。只消费版本与 notes；版本字段由下表更新。临时目录已用上述真实历史跑通，解析出 607 项，默认生成 168 条功能、修复和性能记录。生成时只提供仓库名称和默认分支，额外 SCM 调用即报错。实施时给这几个上游内部接口加契约测试，升级工具时重跑。[策略工厂](https://github.com/googleapis/release-please/blob/05c6a4f71022304d4edad24ea90c1c16324503d5/src/factory.ts#L126-L155) · [候选生成接口](https://github.com/googleapis/release-please/blob/05c6a4f71022304d4edad24ea90c1c16324503d5/src/strategies/base.ts#L277-L294)

| 版本载体 | 精确更新目标 |
|---|---|
| `package.json`、`manifest.json`、`desktop/package.json`、`desktop/src-tauri/tauri.conf.json` | 各自顶层 `version` |
| `package-lock.json`、`desktop/package-lock.json` | 各自顶层 `version` 和 `packages[""].version` |
| `desktop/src-tauri/Cargo.toml` | `[package].version` |
| `desktop/src-tauri/Cargo.lock` | 唯一名为 `desktop` 的 `[[package]]` 的 `version` |

独立临时副本已验证八个文件只改十行，其他 crate 与 Rust 测试夹具逐字节相同。现有门禁 `node scripts/check-release-version.mjs v0.2.0-rc.4` 通过，传旧版本退出 1，重复投影得到相同字节。实施命令先在临时目录生成并核对完整差异，再将候选交给版本分支。

**变更日志。** 保留 `CHANGELOG.md` 开头的公开版本说明，更新其中的当前候选。保留 `Unreleased` 标题，将其原有人工记录原样归到新候选下，另附上游生成的分类条目；从 `## [0.2.0-rc.3]` 起的历史逐字节校验。首次评审检查 168 条样本中与人工记录重叠的内容，以及默认策略未归类的重要改动。候选标题统一使用输入提交的 UTC 日期，去掉上游按运行日生成的标题；同一输入跨日重跑的完整文件散列应一致。[上游变更日志实现](https://github.com/googleapis/release-please/blob/05c6a4f71022304d4edad24ea90c1c16324503d5/src/changelog-notes/default.ts#L51-L79)

**开 PR 与重跑。** Actions 只需 `contents: read`，在临时目录运行生成和对账。维护者使用现有登录身份从相同 SHA 本地复现，经普通分支 push 和 `gh pr create` 触发现有 CI。保留仓库默认读权限、禁止 Actions 创建或批准 PR 的设置；无需新增凭据。直接使用上游 PR 写入路径会让工具管理提交与分支，本方案只调用其生成接口。[上游生成与写入分支](https://github.com/googleapis/release-please/blob/05c6a4f71022304d4edad24ea90c1c16324503d5/src/bin/release-please.ts#L516-L565)

工具 PR 在 CI 中运行待审工具，用事件的 base SHA 做演练。版本 PR 将生成时的源 `main` 完整 SHA 记录在候选提交的 Git trailer 中；CI 校验它在 `main` 历史上，取该 SHA 的源码、版本文件和日志作输入，在独立目录重新生成，与事件的 PR head 上八个版本文件及 `CHANGELOG.md` 逐字节比较。临时仓库测试要让源 SHA、PR head 与 GitHub 的模拟合并提交各不相同，改动一个候选字节应使对账失败。

同一候选只用一个版本分支和一张 PR。首次逐文件提交后一次推送；重跑相同输入且无差异时直接复用。若 `main` 前进，用原 PR 的候选版本和新的源 SHA 重算，以普通 merge 同步并逐文件追加有差异的提交。推送发生竞争、已有人工修改或分支来源无法确认时保留原分支，展示差异供审阅。已经合并的候选再次运行时报告完成。

**实施验收。** 用临时 Git 仓库覆盖首次生成、跨日重跑、已有 PR 的追加更新、合并后重跑、基线不匹配和标签已存在。逐项核对十字段、历史日志和变更文件清单；两张 PR 的全部检查通过。版本 PR 还须以 `rc.4` 通过版本门禁与 pack/publish dry-run 清单对账。此次范围 PR 已验证本地历史生成与版本投影；完整命令、跨日幂等和 PR 重跑流程留给实施测试。Actions 按 SHA 固定与审计、MCPB 签名另开范围。

**工具操作。** Node 22 执行 `npm ci --ignore-scripts --prefix tools/release-candidate`，再跑 `node --test tools/release-candidate/acceptance.mjs`。使用 `node tools/release-candidate/cli.mjs generate --repo . --source <main完整SHA> --base-tag v0.2.0-rc.3 --version 0.2.0-rc.4 --output <工作树外的新目录>` 生成九个文件。输出目录已有相同候选时复用，内容不同时换新目录。

从记录的源 SHA 开版本分支，将输出的九文件按相对路径复制，逐文件提交，各提交正文包含 `Release-Source: <main完整SHA>`。所有候选提交完成后执行 `node tools/release-candidate/cli.mjs verify-pr --repo . --main <源SHA> --candidate <分支HEAD完整SHA> --base-tag v0.2.0-rc.3 --version 0.2.0-rc.4`，通过后按 §2 推送与开 PR。最后一条提交也应带此 trailer；追加文档或同步 main 后，在最后的候选文件提交中记录新源 SHA。候选工作流在 CI 中复现此检查。

#### T09C Actions 固定与审计（已验收）

**目的与关口**。将当前直接引用的 Action 固定到已核实的完整提交，补齐 checkout 凭据设置和回归门禁。维护者已按 §3 批准表中两个 SHA 及下列凭据设置。

**探查结果（2026-11-16，`main@f70b071`）**

- 六份 workflow、七个 job 共十四处 `uses`，均为 `actions/checkout@v7` 或 `actions/setup-node@v7`，两者各七处。官方仓库 ref API 与 `git ls-remote` 返回相同结果，以下版本标签均直接指向 commit；GitHub API 显示两个提交的签名验证为 `valid`。

  | Action | 现有 v7 对应发布 | 拟固定的完整 commit SHA |
  |---|---|---|
  | actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
  | actions/setup-node | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |

  版本依据为官方发布记录。[checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) · [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)

- 审阅上述提交的 `action.yml`，两者使用 `node24` 执行入口；checkout 的 `persist-credentials` 默认值为 true。目前只有两个发布演练工作流显式设为 false，其余五处需补齐。工作流后续步骤没有依赖 checkout 保存的凭据进行 Git 写入；Release 最后一步用独立环境变量执行 `gh release create --draft`。这项判断来自工作流和入口源码审阅，固定后的运行效果由实施 PR CI 验证。
- 五份 workflow 为 `contents: read`；tag 发布 workflow 为 `contents: write`，覆盖整个构建 job。未发现 `pull_request_target`、`workflow_run`、`id-token: write` 或第三方 Action。候选工作流的 PR SHA 与手动输入经环境变量传入命令。
- 当前 Dependabot 已按月检查 GitHub Actions。官方支持更新 SHA 引用及同一行的版本注释；实施采用 `uses: owner/repo@<SHA> # vX.Y.Z`，后续更新仍走普通 PR 全量 CI。[Dependabot 支持说明](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#github-actions)
- 本机用官方 `actionlint 1.7.12` Windows amd64 包做只读检查，压缩包 SHA256 为 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`，与官方校验和文件一致；执行 `actionlint -shellcheck= -pyflakes=` 退出 0。本次覆盖 Actions YAML 与表达式，ShellCheck 和 Pyflakes 尚未运行。[actionlint 发布与校验和](https://github.com/rhysd/actionlint/releases/tag/v1.7.12)

**实施步骤与判据**

1. 按 §2 同步、安装两处依赖、跑四项基线，从 `main` 开 `codex/t09c-actions`。实施前再次核对表中完整版本标签与提交；若浮动 v7 已前进，记录差异并继续使用本表明确获批的提交。
2. 在 `tests/release.test.mjs` 遍历全部 workflow 的 job steps，增加完整 40 位 SHA 引用、显式关闭 checkout 凭据持久化的检查；同时检查只读工作流权限和 tag 发布的现有 draft 约束。测试识别 Action 名称与引用结构，使后续 Dependabot 的 SHA 更新能继续使用同一门禁。新增用例在当前浮动引用上应失败。
3. 将十四处引用改为上表 SHA，并加对应发布版本注释；在另外五处 checkout 补 `with.persist-credentials: false`。`release-candidate.yml` 的 `ref` 和 `fetch-depth: 0` 继续满足候选复现需要。`.github/dependabot.yml` 仅更新原有“可变 tag”说明以匹配 SHA 管理方式。
4. 复跑 actionlint、定向测试与 §2 四项门禁，新增用例应全绿。逐文件审阅最终 diff，确认引用和凭据设置改动与上述清单一致。独立冷读检查事件、权限、输入插值及凭据使用；在 PR 写出审阅范围和剩余限制。
5. PR 的十项现有检查全部通过后合并并保留分支，核对 main 的六项 Node 和两项桌面检查。手动运行 `release-candidate` 与 `release-rehearsal`，记录相同合并 SHA 上候选已合入的结果与 npm dry-run 清单。tag 发布 workflow 的最终草稿 Release 步骤随未来批准的真实 tag 验证；月度 rule-rot 的在线来源检查沿用其既有日程。

**允许变更的文件**。`.github/workflows/` 下现有六个 YAML、`.github/dependabot.yml`、`tests/release.test.mjs`、本文与 `progress.txt`。使用已有 js-yaml 解析工作流，actionlint 作为本机临时校验工具；实现与测试走现有 CI。

**审计范围与后续事项**。本项核对直接 Action 的来源与引用、workflow 事件、权限及凭据路径。runner 镜像、Node 主版本、apt 包和打包器下载另有各自的版本来源，完整供应链审计需单列工作。GitHub 另提供 workflow dependency lockfiles；本项按已列出的直接 SHA 引用范围实施。[GitHub 安全指南](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions)

2026-11-16 只读查看 Dependabot 告警时，根 `package-lock.json` 的 minimatch 仍有中危告警 #21（GHSA-g3hv-75wg-m249）。T09B 已处理独立生成工具的对应依赖；根目录锁文件已更新至 ESLint 10.15.0 和 minimatch 11.0.8，GitHub 已将告警 #21 标记为 fixed。维护者暂缓 js-yaml #16 的决定继续有效。

### T10 生态接入

**T10A 已批准范围。** 为现有本地 stdio server 增加稳定版 `2026-07-28`，保留 `2025-06-18` 客户端行为，给三个只读工具补齐声明。维护者已批准按 [#38](https://github.com/YEowo-Y/weapp-shipmate/pull/38) 实施本节公共接口和验收。方案以官方发布提交 `5f5440bb26a62e2cf3440b92da5a667efa03b267` 为准。[稳定版发布](https://github.com/modelcontextprotocol/modelcontextprotocol/releases/tag/2026-07-28) · [协议类型与示例](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/5f5440bb26a62e2cf3440b92da5a667efa03b267/schema/2026-07-28)

**当前行为。** 在 `main@ec49459` 通过 `bin/weapp-shipmate-mcp.mjs` 逐行发送 JSON-RPC 请求。请求旧版、新版、未知版本或省略版本的 `initialize` 都返回 `2025-06-18`。三个工具已经同时返回文本和对象型 `structuredContent`，`tools/list` 只提供名称、描述和输入 schema。缺目录返回带文本的 `isError: true`；非法 subject 与未知工具返回 RPC `-32602`。MCP 定向测试 20/20 通过。

1. **先固定兼容基线。** 用现有三个工具的夹具，分别记录 Markdown 默认文本、显式 JSON、结构化成功结果与错误分支。兼容旧版的空参数初始化、通知无响应、现有输入扩展和单行大小限制。新增真实 stdio 用例先在上述基线上检出缺少新版发现、直接调用与输出声明。
2. **按请求识别协议。** 旧式初始化沿用现有回退，新式 stdio 从 `params._meta` 读取 `io.modelcontextprotocol/protocolVersion` 和 `io.modelcontextprotocol/clientCapabilities`。实现 `server/discover`，列出实际支持的版本及 `capabilities.tools`，身份信息写入 `result._meta["io.modelcontextprotocol/serverInfo"]`。新版发现和工具列表都返回必填缓存提示 `ttlMs: 0`、`cacheScope: "private"`；照官方 DiscoverResult、ListToolsResult、CallToolResult 的字段与类型验证整份响应。新版客户端可在首次请求直接列工具或调用工具。成功响应及工具执行错误结果带 `resultType: "complete"`。未知现代版本返回 `-32022` 和 `data.supported/requested`。测试覆盖错误元数据、未知版本后重试、显式旧版握手和同一进程中相邻请求的独立处理。[版本协商](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning) · [stdio 传输](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
   - 两个新版协议元数据键均未出现时走旧路径，允许旧客户端携带自定义元数据。只出现一个协议键或其值类型错误时，按新版无效参数处理。旧式 `ping` 成功，显式新版的 `ping` 和 `initialize` 返回 `-32601`。旧式 `id: null` 沿用原应答；显式新版请求使用空 ID 时返回 `-32600` 并省略响应 ID。有效的字符串和数字 ID 在错误响应中原样返回。这些分支均通过真实 stdio 请求验收。
3. **声明现有工具输出。** 三个工具各加可读 `title`、`annotations.readOnlyHint: true` 和各自的对象型 `outputSchema`。将 `command` 限定为该工具对应值，要求 `meta` 为对象、`items` 为对象数组、`notes` 为字符串数组；guide 另要求 `selfCheck` 对象数组。允许未来添加字段。用现有测试依赖校验三份真实成功结果，另用错 command、缺键与错类型证明 schema 能发现漂移。旧版保留文本块与格式；新版 Markdown 调用保留可读文本，并附结构化对象的 JSON 文本，显式 JSON 格式只需一份 JSON 文本。输入校验继续在服务端执行。[新版工具契约](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) · [旧版工具契约](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
4. **分开验收错误行为。** 两条路径对未知工具和畸形调用信封返回协议错误。本项目将已知工具的合法 arguments 对象中出现的非法枚举、缺少工具必填字段归为工具输入校验。此时新版返回 `isError: true` 的工具结果，旧版保持已测的 `-32602`；合法输入的执行失败在两版都给出工具错误。测试同时核对响应 id、通知静默和错误内容不携带成功结果。
5. **打包与交付。** 改动限于 MCP 适配及必要的 stdio 入口、MCP 测试、现有 MCPB 暂存冒烟、README 的支持说明和交接记录。复用现有依赖。保留打包后旧握手和三次调用，再从暂存包验证新版发现及直接调用；使用夹具验证新旧响应、stdout 逐行 JSON 和 EOF 退出。跑 §2 四项门禁，在 PR 列出实际触发的 CI、Node 矩阵结果与打包验证证据。CLI 输出、工具名称和原有输入参数继续按现有契约运行。

T10A 已在 [#39](https://github.com/YEowo-Y/weapp-shipmate/pull/39) 合并。MCP 定向测试 23/23、全量测试 1697/1697、九项 CI 均通过；七份真实 stdio 应答通过固定版本的官方 JSON Schema 校验。

#### T10B · Codex 与 Claude Code 的本地插件

**已批准范围。** 维护者已批准按 [#40](https://github.com/YEowo-Y/weapp-shipmate/pull/40) 实施。用户从本地市场安装 `weapp-shipmate` 后，在 Codex 或 Claude Code 中可找到随包安装的上线预检 skill，并通过宿主调用 T10A 的三个只读工具。本次验收针对 Windows 上的 Codex CLI 和 Claude Code CLI，以 `main@aaee398` 为基线。交付一个本地构建入口、两种宿主所需的清单、共用的 skill、验收脚本及 README 安装说明。Registry 登记与公开发布另按 §3 裁决。

**可行性实测。** Windows 上用两个独立临时配置安装合成插件。Codex CLI 0.164.0 从根 `plugin.json` 和 `mcp.json`（均声明 Agent Plugins 1.0.0 schema）正确展开 `${PLUGIN_ROOT}`，发现缓存中的 skill，并通过临时线程调用工具、取回预期标记。用 `.codex-plugin/plugin.json` 搭配 `.mcp.json` 的对照探针也显示安装成功，但实测将占位符原样传给 Node，MCP 握手失败，故采用根清单。Claude Code 2.1.300 从 `.claude-plugin/plugin.json`、`.mcp.json` 和 `skills/` 发现组件，在 stdio 参数中展开 `${CLAUDE_PLUGIN_ROOT}`。两次调用均取回预期结果；核对到的运行统计为输入、输出 token 均为 0。正式船友包仍须按下列步骤分别验收。

1. **生成可搬移的本地市场。** 从已安装的仓库依赖构建到被忽略的 `build/`，按宿主生成市场和插件清单。两个包共用同一份 skill、同一版本和 `bin/weapp-shipmate-mcp.mjs`；共用 MCPB 的运行时文件清单和生产依赖复制逻辑。现有 MCPB 脚本会清空整个 `build/`，需把清理范围收窄到各自产物；两种构建连续运行后，前一次生成的有效产物仍可使用。启动时只需已有的 Node ≥20，安装目录可以含空格。分别使用宿主支持的插件根路径变量，入口和依赖均从安装后的包解析。验收从仓库外的临时目录运行，清除 `NODE_PATH`，核对包内数据和依赖，捕获误用开发机绝对路径或仓库 `node_modules` 的回归。[Codex 本地市场](https://developers.openai.com/plugins/build/plugins) · [Codex 本地 stdio 配置](https://developers.openai.com/plugins/deploy/desktop-only) · [Claude Code 插件清单](https://code.claude.com/docs/en/plugins-reference)
2. **写一份两端可发现的 skill。** 说明何时用 `check`、`guide`、`explain`，如何把用户选定的项目目录传给 `check`，怎样呈现报告中的来源、核验日期和待确认项。skill 使用宿主发现的工具名，不硬编码某一宿主的命名空间。插件清单只声明本地 stdio 和 skill。生产依赖、工具名、输入输出及桌面端沿用既有契约。
3. **分别从空配置安装。** 在仓库外建立临时市场、测试工作目录和各自的宿主配置，记录 CLI 版本。在 Codex 执行 `codex plugin marketplace add <目录>`、`codex plugin add <插件>@<市场>`；在 Claude Code 执行 `claude plugin marketplace add <目录> --scope user`、`claude plugin install <插件>@<市场> --scope user`，user 指向本次临时配置。分别用全新宿主进程核对插件启用、skill 名称和安装路径，以及由插件提供的三个工具；验证环境不另行注册同名 MCP 服务。
4. **通过两个宿主实调。** 每端都通过已安装插件执行 `check`（固定项目夹具）、`guide`（已知主体）和 `explain`（已知审核反馈），以 JSON 结果的 `command` 和各夹具预期的命中项验收。Codex 用验收进程的 `app-server --stdio`、`skills/list`、`mcpServerStatus/list` 和 `mcpServer/tool/call`；启用临时线程而不发起模型 turn。Claude Code 用临时验收配置中的 `UserPromptSubmit` MCP 工具 hook 驱动真实调用，检查宿主返回的工具结果，并在模型请求前终止。两个进程只传验收所需环境，不继承账号凭据。将每端的安装、skill 发现、实际调用分别记入验收记录。宿主缺失或调用失败时该端记为未通过。[Codex 宿主接口](https://developers.openai.com/codex/app-server) · [Claude Code 工具 hook](https://code.claude.com/docs/en/hooks#mcp-tool-hook-fields)
5. **交付和复验。** README 提供从构建、本地安装到调用与卸载的命令及 Node 要求。普通 CI 用既有 Node 矩阵检查生成清单、路径、skill、运行时闭包和暂存入口；双宿主实调作为独立本机验收，在 PR 记录两个 CLI 的版本、实测结果及四项仓库门禁。回归同时覆盖 T10A 源码入口及原有 MCPB 暂存包。

实施验收（Windows，2026-11-16）：`npm run build:plugins` 生成两个市场。Codex CLI 0.164.0 与 Claude Code 2.1.300 从仓库外含空格路径安装正式包，发现缓存中的 skill、通过宿主实调三个工具并命中夹具，卸载通过。Claude 三次调用均确认零模型 token。共用运行时和 MCPB 共存回归通过；全量测试 1699/1699、70 项定向回归、lint、69 条引文和 coverage 通过。

T10B 已在 [#41](https://github.com/YEowo-Y/weapp-shipmate/pull/41) 合并，十项 PR CI 和合并后 main 的 Node、桌面检查均通过。

### T11 · CLI 成熟度

**T11A 已批准范围。** 先交付 `check --fail-on` 和显式启用的 JSON v1，供自动化调用方选择门禁阈值并校验机器输出。以 `main@b635ee8` 为基线，配置文件、baseline 和 SARIF 在后续工单分别补齐具体契约。维护者已批准按 [#42](https://github.com/YEowo-Y/weapp-shipmate/pull/42) 实施本节 CLI 公共接口。

**现状。** 真实入口 `bin/weapp-shipmate.mjs` 调用 `src/cli.mjs`。目前 `check` 命中 blocker 返回 2，正常无 blocker 返回 0，参数或执行错误返回 1；`guide` 和 `explain` 成功返回 0。JSON 是 `command/meta/items/notes` 对象，guide 另含 `selfCheck`。共享 `render` 同时服务 MCP 和桌面产物。实跑 CLI、E2E 和报告定向测试 45/45，通过旧入口传 `--fail-on warning` 会报未知选项并退出 1。

1. **固定旧命令兼容。** 实现前从基线记录三命令的 Markdown、JSON、checklist 输出、聚焦过滤、草稿选项、正常与错误退出码及 stderr。真实子进程测试逐字节比较 stdout/stderr；涉及扫描绝对路径时，基线夹具只替换明确的根路径占位符为本次测试路径，再比较完整字节。保留管道完整写出和 guide 终端问答回归。帮助文字增加新参数说明是本次明确的兼容例外，其他既有调用按原输出与退出码验收。
2. **增加显式退出阈值。** `check --fail-on blocker|warning|info|none` 支持空格和等号语法。blocker 只计算 blocker，warning 计算 blocker 与 warning，info 计算三种级别，none 关闭发现项门禁。命中阈值返回 2，否则返回 0；参数及运行错误仍返回 1。阈值计算采用展示过滤前的本次报告 items，`--blockers-only` 只影响展示；`--include-drafts` 明确选择的草稿也计入阈值。显式阈值触发退出 2 时在 stderr 输出阈值及命中数量，stdout 保留所选格式的完整报告。缺值、非法值、用于 guide/explain 均报参数错误。同一新参数重复出现时拒绝，避免后一个值悄悄覆盖门禁。
3. **显式 JSON v1。** 三命令支持 `--json --json-version 1`，也接受 `--json-version=1`。输出为原报告顶层增加整数 `schemaVersion: 1`，保留原有报告字段，结尾为一个 LF。缺值、其他版本、重复指定、缺少 `--json` 或同时带 `--checklist` 均返回参数错误。已有 `guide --interactive --json` 冲突继续生效。新增 CLI 专用输出 schema，限定版本和三种 command，要求 meta 为对象、items 为对象数组、notes 为字符串数组，guide 必须含 selfCheck 对象数组，并允许新增字段。用三份真实成功结果校验，反例覆盖错版本、缺键和错类型。版本包装放在 CLI 输出边界，共享 renderer 继续服务既有调用方。
4. **交叉验收与说明。** 覆盖空报告、各 severity、不同阈值、草稿与聚焦的组合，以及 JSON v1 和阈值同时启用、非法目录及大报告管道写出。选用小型固定夹具验证退出码，既有规则断言和金快照按原判据运行。README 与帮助说明退出 0 只表示命令成功且未触发所选阈值，扫描限制继续从报告读取。新增 schema 随既有 schemas 包清单分发，从 npm 打包内容和 MCPB/插件暂存入口复验 CLI 版本输出及现有 MCP 调用。运行四项门禁、独立冷读复审与全部 PR CI。

本机实施验收（2026-11-16）：保存 `b635ee8` 的 15 组旧命令 stdout/stderr/退出码基线，新增接口后逐字节比较通过。阈值与聚焦组合、临时合成 info/draft 分支、JSON v1 三命令 schema 正反例、大报告管道及 npm tarball/MCPB/两端插件包入口通过。四项门禁通过，全量测试 1722/1722；MCP 新旧协议冒烟通过。

**允许变更的文件。** CLI 适配层、CLI 专用 JSON schema、相关 CLI/E2E/分发回归测试及必要夹具、README、本文与 progress.txt。实现可复用已有报告格式和规则结果。后续配置、baseline、SARIF 的默认行为与格式契约在各自范围稿中确认。

#### T11B · 显式 CLI 配置文件（已批准）

**目标与关口。** T11A 已通过 [#43](https://github.com/YEowo-Y/weapp-shipmate/pull/43) 合并。以 `main@24bb4dd` 为基线，让项目可复用主体、业务事实和退出阈值。维护者已按 §3、§6 批准按 [#44](https://github.com/YEowo-Y/weapp-shipmate/pull/44) 实施本节。

**首版格式。** 只读 UTF-8 JSON，顶层必须有整数 `schemaVersion: 1`，可选 `check`、`guide` 对象；对象可为空，未知字段、错误类型和不支持的版本均拒绝。主体仅接受规范值 `personal|individual_business|enterprise`；CLI 原有中文别名继续可用。`business` 是非空、非纯空白字符串，三个事实字段只接受布尔值，省略表示未知。示例：

```json
{
  "schemaVersion": 1,
  "check": { "subject": "enterprise", "failOn": "warning" },
  "guide": { "subject": "enterprise", "business": "预约服务", "payment": false, "sensitive": false, "domain": true }
}
```

1. **显式加载。** `check`、`guide` 新增 `--config <文件>`，同时接受 `--config=<文件>`；缺值、空路径、重复指定或用于 `explain` 都是参数错误，返回 1。路径相对进程工作目录解析，check 的扫描目录仍由原位置参数决定。没有 `--config` 时不搜索当前目录、父目录或用户目录的配置。已有 help/version 快速退出继续不读取文件；帮助文字增加新参数是兼容例外。
2. **覆盖与隔离。** 优先级为内置默认值 < 当前命令配置 < 显式 CLI 值，按属性是否存在合并，保留 `false`。check 只应用 `subject/failOn`，guide 只应用 `subject/business/payment/sensitive/domain`；先校验整份文件，未使用分区非法也报错。`failOn` 接受 T11A 的 `blocker|warning|info|none`；配置阈值与显式 CLI 阈值采用相同计数、退出码与命中 stderr。含 `--config` 的调用中，CLI 缺值、非法值和正反开关冲突不能由配置兜底掩盖；无配置参数时保留旧校验行为。首版只允许覆盖为另一个已知值，不提供恢复“未知”的清除参数。
3. **交互一致。** `guide --config ...` 默认非交互，显式 `--interactive` 才进入现有问答；配置与 CLI 合并后的事实用于预填，问答只补缺项，CLI 值优先。每次执行只读取并校验配置一次，问答验证、回放和生成报告使用同一份结果。保留非 TTY、JSON 冲突、取消和中断判据；问答给出的复现命令包含配置入口，并注明它依赖该文件当时的内容。
4. **读取与错误边界。** 只读取用户显式选择的普通文件，不执行 JS，不解析 YAML，不支持 extends、环境变量插值或远程地址。沿用 `src/private-files.json` 的 noRead 文件名策略，在读取前拒绝私有文件；拒绝文件本身或路径祖先目录上的符号链接/junction，以及超过 5 MiB 的文件。文件不存在、不可读、JSON 语法错误及契约错误均返回 1，stdout 不产生报告。诊断只给文件路径、字段名和原因，不回显字段值或原始 JSON；语法错误不能直接转发含内容片段的解析器消息。配置内容不进入日志、遥测或额外的报告字段。
5. **限制首版范围。** 配置不包含扫描目录、explain 查询、展示格式、JSON 输出版本、草稿、聚焦或交互开关；这些仍按既有调用方式选择。MCP 工具和桌面不自动加载 CLI 配置，既有公共输出保持不变；baseline 和 SARIF 另列工单。不新增生产依赖，不修改规则断言、私有文件策略、治理或安全承诺。
6. **验收。** 保留 15 组旧 CLI stdout/stderr/退出码的完整字节基线；新增配置成功与拒绝矩阵，覆盖两种语法、所有字段和阈值、分区隔离、CLI 正反覆盖、缺值、未知字段、错误类型、路径基准、文件读取失败、非普通文件、文件和祖先链接、超过 5 MiB、敏感文件阻断及诊断不泄露合成标记。问答测试覆盖配置预填、CLI 优先、单次读取、取消、非 TTY/JSON 冲突和复现命令。验证相同事实的配置调用与直接 CLI 调用报告等价；从实际 npm tarball、MCPB 和两端插件暂存入口复验配置及原 MCP 冒烟。CLI 配置 schema 随 schemas 分发，运行时不依赖额外 JSON schema 资源。四项本地门禁、独立冷读复审和全部 PR CI 通过后交付。

**允许变更的文件。** `src/cli.mjs`、CLI 配置读取模块、CLI 配置 schema、相关 CLI/问答/分发测试与必要夹具、README、本文和 progress.txt。读取模块使用既有私有文件清单，不改扫描器行为。范围基线四项门禁通过：全量 1722/1722、69 条引文与 coverage 红线通过。

本机实施验收（2026-11-18）：新增配置读取、schema、CLI 合并与问答复用，15 组旧命令字节基线保持通过。实际 npm tarball、MCPB 和两端插件暂存入口的配置与直接参数报告一致，原 MCP 冒烟通过。独立复审发现的 NTFS 数据流别名和 UNC 读取边界已修复；屏障测试确认普通/扩展/混合分隔符 UNC 及网络工作目录的相对路径在文件系统访问前拒绝。Windows 本地文件链接、祖先 junction、5 MiB 边界、诊断脱敏和 schema 对照均实际通过。最终全量 1734/1734、lint、69 条引文和 coverage（TP55/FP0/FN0）通过，复审结论为通过。

#### T11C · baseline 前置与拆分

**调整理由。** T11B 已通过 [#45](https://github.com/YEowo-Y/weapp-shipmate/pull/45) 合并。准备 baseline 时核对到：`scanProject` 的 API、域名和配置键是项目级去重集合；`runCheck` 每条普通规则只产出一个聚合项；`scope.filesHash` 只散列排序后的相对文件名，内容改变不会改变它。桌面对比按规则 ID 比集合，可显示规则仍在/未再检出，不能证明没有新增同类问题。因此先实施 T11C1 的显式证据输出，再单列 T11C2 baseline 的匹配、规则版本、扫描范围和退出阈值契约。当前不以 ruleId、文件名散列或去重信号集直接豁免门禁。

##### T11C1 · CLI 显式发现项证据（已批准）

**目标与关口。** 以 `main@6625025` 为基线，让 CLI 调用方核对发现项来自哪个源码位置，为后续 baseline 和 SARIF 提供依据。维护者已按 §3、§6 批准按 [#47](https://github.com/YEowo-Y/weapp-shipmate/pull/47) 实施。仅新增 CLI 显式启用路径；功能 1 的桌面/MCP 展示和所有信号精确定位仍在后续范围，不在本工单宣称功能 1 全部完成。

1. **公共入口。** 仅 `check --evidence --json --json-version 1` 启用证据。`--evidence` 是无值布尔参数，重复、带等号值、用于 guide/explain、缺少 JSON v1 或同时带 checklist 均返回参数错误 1。help/version 延续快速退出。与 `--config`、四档 `--fail-on`、`--include-drafts` 和 `--blockers-only` 可组合；命中规则、门禁计数与退出码保持原有含义。新选项不进入 T11B 配置 schema，不自动启用；没有 `--evidence` 的既有输出与退出码继续逐字节一致，帮助说明除外。
2. **结果契约。** 仅在显式模式的每个展示 item 增加 `evidence`：`{status, locations}`。status 为 `located|partial|unavailable`；locations 元素为 `{file, line, column, kind, signal}`，file 是相对扫描根目录、以 `/` 分隔的路径；line 与 column 从 1 开始，column 按 JavaScript UTF-16 code unit 计数。kind 为 `api-reference|api-import|domain|insecure-request|config-key|secret-key`。signal 只含现有 API 名、规范化 host 或配置/疑似密钥键名，禁止源代码片段、密钥值、完整 URL、查询串或 URL 认证信息。无法可靠定位但能确认来源文件时，line/column 同时为 null；无法确认文件时不伪造位置。locations 按 file、line、column、kind、signal 确定性排序，完全相同的记录去重，不合并不同位置的同类信号。
3. **沿原扫描流程采集。** 在既有文件读取与匹配过程中，通过内部可选模式保留原文件位置；不增加第二次源码读取，不扩大扩展名、忽略目录、私有文件或链接边界。条件编译剔除、HTML/JS 注释与字符串处理会改变偏移，必须记录位置映射或其他可验证的原始位置关系，不能将处理后的行号冒充源码行号；处理文本与判定语义保持原样。API 直接匹配记录静态引用位置（api-reference，含属性引用），Taro 具名导入标为 api-import；两者均不能称为已执行调用。JSON/manifest/mpx 配置先以现有解析结果确认键事实，无法无歧义定位时提供文件级 config-key 与 null 行列；不对原文本简单搜索同名字符串后认定位置。首版不增加 AST 依赖或扩大静态识别能力。
4. **关联与局限。** 普通规则按现有 match.api（含已有 wx/uni/Taro 等价规则）和 match.config_key 关联实际触发信号；domain 阶段还可附导致该项域名提示的 host 证据。五类交叉核验分别关联其实际参与的缺声明 API、命中的服务端 host、疑似密钥键、明文请求 host、IP/localhost；不能将不相关的项目级信号附给每条规则。缺声明没有“缺失字段所在行”，只定位触发该判断的 API，并保留原规则说明。动态 URL 仍保留既有项目级 dynamicRequest 和人工核对注记，首版不声称逐个定位；带动态域名提示的项至少为 partial。located 仅表示该项本次用于关联的已检出信号均有位置，不代表扫描覆盖完整或消除静态盲区；文件级记录、定位缺失或截断为 partial，无可关联来源为 unavailable。
5. **容量与报告完整性。** 证据采集全局最多保留 20,000 个去重位置，每个 item 最多展示 100 个。达到限制后原扫描与规则计算继续，报告 notes 明示证据截断，并将受影响项记为 partial；若全局截断无法可靠区分受影响项，则全部项都标 partial。显式模式增加 `meta.evidence: {schemaVersion: 1, truncated: boolean}` 描述证据契约与截断，不替代 `meta.scan.scope`；原有读取错误、配置错误、链接、空扫描和扫描截断注记保留。首版不生成指纹、不保存/读取 baseline、不抑制任何发现项；后续 baseline 必须单独处理 partial/unavailable 及不完整扫描，不能直接把本版位置列表等同于稳定问题身份。
6. **验收。** 在固定夹具中逐项核对源文件和行列：同一 API 多文件/同文件多行/同行多次、中文与非 BMP 字符、LF/CRLF、条件编译与嵌套分支、HTML/JS 注释、多行字符串、正则字面量、Taro 具名/别名导入、模板组件、JSON/manifest/Taro/mpx 配置、五类交叉核验。增加同一规则的新位置时，原聚合项数量可不变，但新增位置必须可见；既有扫描器已排除的注释、普通 API 文案字符串和非微信分支不得因位置映射重新进入证据。既有 URL、Taro 导入或模板信号可能启发式命中文案字符串，沿原事实报告来源，不把它们称为语义已确认的调用或组件；本单不顺带修订扫描判定。用合成敏感标记证明证据不含值、URL 认证/查询信息或代码片段。验证位置/全局上限、证据缺失与不完整扫描状态、确定性输出、JSON schema 正反例及所有参数冲突。原有扫描器夹具、accuracy、15 组旧 CLI 字节基线和 T11B 配置/问答测试全部通过；实际 npm tarball、MCPB、双插件暂存 CLI 入口复验新输出，MCP 原协议输出保持不变。四项本地门禁、独立冷读复审与全部 PR CI 通过后交付。

**允许变更的文件。** `src/cli.mjs`、`src/scanner.mjs`、`src/check.mjs`、`src/crosscheck.mjs` 中为可选证据传递所需的最小改动、必要的证据模块、CLI 输出 schema、相关扫描/CLI/分发测试与合成夹具、README、本文、progress.txt。保持既有扫描事实、规则断言、治理、安全承诺和桌面/MCP 默认行为；不引入生产依赖。范围基线四项门禁已通过：全量 1734/1734、69 条引文和 coverage 红线通过。

本机实施验收（2026-11-18）：显式 CLI 证据、原始位置映射、发现项关联和 schema 已实现。全部仓库夹具开关证据前后事实相同；300 组混合文本的 1,500 次转换与旧实现一致；每份源码仅读取一次。重复引用、模板/配置来源、五类交叉核验、上限截断、脱敏、15 组旧 CLI 字节基线及真实 npm/MCPB/双插件入口通过。冷读复审发现的 CR/Unicode 换行定位问题已修复并复核通过。冻结源码后四项门禁全绿，全量 1755/1755、69 条引文、coverage TP55/FP0/FN0。

### T12 · 桌面分发

**依赖与拆分。** T02、T06、T07、T09A–T09C 已完成，十处版本载体已统一为 `0.2.0-rc.4`，`tauri.conf.json` 已限定 `targets: ["nsis"]`。按 §3、§6 关口将「桌面分发」拆为两步：**T12A** 负责 CI 构建 Windows x64 NSIS 安装器并产出带自检的扁平 `SHA256SUMS.txt`（无新增依赖、无新增外部 Action、无应用联网变更、不触发真实 Release）；**T12B** 负责桌面端只读版本更新检查（涉及联网边界与私仓状态，待维护者确认下列裁决项后单列范围）。按 §6 确认本节后实施 T12A；本范围 PR 仅更新交接与进度。

**探查结果（2026-11-18，独立工作树 `main@4f61722`）**

- 现有 `.github/workflows/release.yml` 在 `ubuntu-latest` 运行，只打包 `weapp-shipmate-*.tgz` 与 `weapp-shipmate.mcpb` 并写入 `SHA256SUMS.txt`；`glib-backport.yml` 的 `windows-compatibility` 只执行 `cargo build --features tauri/custom-protocol` 编译验证，CI 中尚无 Windows NSIS 安装器产物与校验和。
- 干净工作树执行 `npm --prefix desktop run prepare:runtime` 准备锁定版 Node `24.22.1`（`win32-x64`，618 个文件），`tests/desktop-runtime-package.test.mjs` 3/3 通过；`cargo +1.94.1 test --manifest-path desktop/src-tauri/Cargo.toml --locked` 为 116 通过、0 失败、2 项既有忽略。
- 在 `RUSTUP_TOOLCHAIN=1.94.1` 下实跑 `npm --prefix desktop run tauri -- build -- --locked` 退出码 0，生成唯一安装器 `desktop/src-tauri/target/release/bundle/nsis/weapp-shipmate-desktop_0.2.0-rc.4_x64-setup.exe`（28,292,580 字节，SHA256 `ec43da39fd847a3f8652331cecf3d02eeadf1891e4efc45c6745c1c31304b601`），`bundle/` 下无 `.msi`。构建期间锁定的 `@tauri-apps/cli` 从 `tauri-apps` 官方发布源下载并校验 `nsis-3.11` 与 `nsis_tauri_utils-v0.5.3` 哈希。
- 对该安装器执行现有只读核验脚本 `scripts/verify-windows-candidate.ps1` 与 `SHIPMATE_WINDOWS_CANDIDATE=<exe> node --test tests/windows-candidate.test.mjs`（4/4 通过）：PE 容器头有效，`authenticode.status` 为 `NotSigned`，与 `docs/25` §9 私有期未签名附 SHA256 现状一致。
- 同机实测 Windows 下 `npm pack` / `npm publish --dry-run --ignore-scripts --tag next --json`（43 个文件，82,861 字节，`verify-package-rehearsal.mjs` 对账通过）、`WEAPP_SHIPMATE_REQUIRE_PACK=1 npm run build:mcpb`（82 个归档条目，核对无反斜杠与 `..` 路径）以及 Git Bash `sha256sum` 生成与 `sha256sum -c` 回验均退出 0。因此 `release.yml` 可在单个 `windows-latest` job（`shell: bash`）内同源构建三件资产，无需新增 `actions/upload-artifact` / `actions/download-artifact`（不触碰 §3 Action SHA 关口，也不增加跨 job 产物中转面）。

#### T12A · CI 构建 Windows 安装器与 SHA256 清单（已验收）

维护者已批准按 [#46](https://github.com/YEowo-Y/weapp-shipmate/pull/46) 实施本节，已在 [#48](https://github.com/YEowo-Y/weapp-shipmate/pull/48) 合并并通过合并后云端演练（[#48 验收记录](https://github.com/YEowo-Y/weapp-shipmate/pull/48#issuecomment-6957013149)）。

1. **先补发布工作流门禁测试。** 在 `tests/release.test.mjs` 增加回归断言：`release.yml` 的 `release` job 运行于 `windows-latest`（Node ≥22、锁定 Rust `1.94.1`），在任何打包步骤前完成双层 `npm ci`、`prepare:runtime`、桌面构建、`lint`、`release:check`、`npm test`、`verify:quotes`、`coverage` 及 `cargo +1.94.1 test --manifest-path desktop/src-tauri/Cargo.toml --locked`；包含带 `--locked` 的 Tauri NSIS 构建、只读 `verify-windows-candidate.ps1` 核验、唯一 `weapp-shipmate-desktop_<version>_x64-setup.exe` 及零 `.msi` 断言；`checksums` 步骤以无路径前缀的扁平文件名覆盖 `.tgz`、`.mcpb` 与桌面安装器 `.exe`，当场执行 `sha256sum -c SHA256SUMS.txt`、LF 行尾校验及与候选报告 `sha256` 对账；草稿 Release 上传步骤挂齐三件资产与 `SHA256SUMS.txt`，保留 `--draft` 且不含 `--prerelease` / `--latest`。同时断言 `release-rehearsal.yml` 新增的桌面安装器演练 job 仅在 `workflow_dispatch` 运行、仅具读权限、不含 `gh release`、`git push` 或非 dry-run 发布。
   判据：修改 workflow 前，`node --test tests/release.test.mjs` 因新增断言失败。
2. **更新 `release.yml` 同源产出三件资产与校验和。** 保留 `on.push.tags: ["v*"]`、`permissions: contents: write` 以及 T09C 已固定的 `actions/checkout`、`actions/setup-node` 完整 SHA（`persist-credentials: false`）。将 `jobs.release` 迁至 `windows-latest` 并设 `defaults.run.shell: bash`；安装 Rust `1.94.1`（`--profile minimal`），在 `npm test` 前完成 `prepare:runtime` 与桌面构建以激活便携 runtime 验收，全量门禁与 Rust 测试通过后依次执行 `npm pack`、`WEAPP_SHIPMATE_REQUIRE_PACK=1 npm run build:mcpb`、`RUSTUP_TOOLCHAIN=1.94.1 npm --prefix desktop run tauri -- build -- --locked`。核对 `bundle/nsis/` 恰好存在一个与仓库版本一致的 `weapp-shipmate-desktop_${VERSION}_x64-setup.exe` 且 `bundle/` 下无 `.msi`，用 `MSYS_NO_PATHCONV=1 pwsh -NoLogo -NoProfile -NonInteractive -File scripts/verify-windows-candidate.ps1` 校验容器头与签名状态；将 `.mcpb` 与安装器复制到工作目录根，执行 `sha256sum weapp-shipmate-*.tgz weapp-shipmate.mcpb weapp-shipmate-desktop_*_x64-setup.exe > SHA256SUMS.txt && sha256sum -c SHA256SUMS.txt && cat SHA256SUMS.txt` 并与候选报告 `sha256` 对账，最后将该四项传入 `gh release create --draft`。
3. **在 `release-rehearsal.yml` 增加手动只读安装器演练。** 新增 `desktop-installer` job（`if: github.event_name == 'workflow_dispatch'`，`runs-on: windows-latest`，沿用顶层 `contents: read`），日常 PR 推送不运行以避免双倍消耗私有仓库 Windows 分钟数（PR 上的桌面与 Rust 编译继续由 `glib-backport.yml` 把关）。手动触发时在 `mkdtempSync` 创建的 `$RUNNER_TEMP` 唯一子目录内完整跑通便携 runtime 验收、锁定构建、`verify-windows-candidate.ps1` JSON 报告落盘、三件扁平资产复制、`SHA256SUMS.txt` 生成、`sha256sum -c` 回验、LF 校验及与候选报告 `sha256` 对账。
4. **文档校对与合并后实跑验收。** 将 `docs/14-first-run-and-trial.md` 第 53 行关于当前构建配置版本的文字更新为与统一版本载体一致的表述（保留各历史候选记录不改）。本地通过 `tests/release.test.mjs` 与 §2 四项门禁；实施 PR 合并后执行 `gh workflow run release-rehearsal.yml --ref main`，核对 GitHub `windows-latest` 实跑产出的 NSIS 安装器大小、SHA256、`verify-windows-candidate.ps1` 结论与 `SHA256SUMS.txt` 自检结果并记入验收记录。不打 tag，不创建真实或草稿 Release。

**允许变更的文件。** `.github/workflows/release.yml`、`.github/workflows/release-rehearsal.yml`、`tests/release.test.mjs`、`docs/14-first-run-and-trial.md`（仅第 53 行当前配置说明）、本文与 `progress.txt`。不新增依赖，不新增 GitHub Action。

本机实施验收（2026-11-18）：`tests/release.test.mjs` 新增两项工作流回归先红（45 通过、2 失败）后绿（47/47 通过）。零上下文复审指出的 `RUNNER_TEMP`/`GITHUB_RUN_ID` 空值兜底（改为 `mkdtempSync`）、`prepare:runtime` 提前至 `npm test` 之前激活便携运行时测试、`SHA256SUMS.txt` LF 断言及 `release.yml` 与候选报告 `sha256` 对账均已补齐；在未设置 `RUNNER_TEMP` 的本机 Git Bash 实跑两份工作流核验与校验和脚本均退出 0。合并提交 `6493a23` 的主分支八项 CI 全部通过；手动触发云端 [release-rehearsal #44143313945](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/44143313945)（`windows-latest` [job #134251636657](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/44143313945/job/134251636657)）实跑通过便携运行时、Rust 锁定测试、`npm pack`、`build:mcpb` 与 `tauri build -- --locked`，产出唯一 `weapp-shipmate-desktop_0.2.0-rc.4_x64-setup.exe`（28,304,090 字节，SHA256 `708b4057a8b1a81872524ed887f936db5cb225cd4bbfb9234fa6387e8b664d42`，PE 头有效、`NotSigned`），扁平 `SHA256SUMS.txt` 三项 `sha256sum -c` 回验与报告对账全部通过。

#### T12B · 桌面只读版本更新检查（待裁决后单列范围）

桌面端当前无 `tauri-plugin-updater` 或任何版本查询代码，Webview CSP `connect-src` 仅允许本机 `self` 与 `ipc:`。后续实施前需维护者按 §3、§6 裁决两点：

1. **私有仓库与只读交互边界**：仓库当前 `private=true` 且候选 Release 为草稿，不带凭据访问公开 GitHub Releases API 返回 HTTP `404`，而桌面端按 `SECURITY.md` 不内置任何令牌。拟采用与 `source_freshness` 相同的架构：启动不联网、后台不轮询，仅在用户手动点击「检查更新」时经随包 Node 请求固定公开 Release 元数据接口，Rust 校验有界 JSON 后只展示当前版本、最新公开版本及由系统浏览器打开的发布页链接，不自动下载安装包、不自动执行更新、不引入新 crate；私仓或尚无公开正式版时如实提示「暂无公开版本信息」。
2. **安全措辞与排期**：请确认 ① 按上述手动只读边界单列 T12B 实施步骤，并在 `SECURITY.md` 第 7 行同步补记手动点击的版本元数据读取说明（触及 `SECURITY.md` 时合并前须维护者批准），或 ② 待仓库准备公开并发布首个非草稿 Release 前再启动 T12B。

### T13 · Rust 加固

**目标与关口。** 在**不改 SQLite 表结构与 `user_version` 数据模型、不引入任何新 Rust crate**（不触碰 §3 关口）的前提下，分两张原子工单完成桌面原生后端加固：**T13A** 落地 CI `rustfmt`/`clippy` 门禁、SQLite WAL 与退出 checkpoint、本机有界脱敏诊断日志与 panic hook；**T13B** 落地类型化错误 `DesktopError`（保持前端 IPC 错误字符串契约不变）与阻塞型 Tauri 命令异步化。按 §6 确认本节后依次实施。

**探查结果（2026-11-18，独立工作树，Rust `1.94.1`）**

- **静态检查与格式基线**：`cargo +1.94.1 fmt --manifest-path desktop/src-tauri/Cargo.toml -- --check` 当前有 95 行格式差异，`desktop/security/glib-variant-iter` 为 0 行差异；`cargo +1.94.1 clippy --manifest-path desktop/src-tauri/Cargo.toml --all-targets --locked` 全库仅 1 条告警（`src/source_quote.rs:264` `too_many_arguments` 8/7，其余两处同类 Tauri 命令已有 `#[allow(clippy::too_many_arguments)]`）。`glib-backport.yml` 当前未安装 `rustfmt`/`clippy` 组件，也未执行这两道检查。
- **SQLite 连接与备份现状**：`project_store.rs` 以实例级 `.lock` 文件锁单连接打开 `projects.sqlite3`，当前使用默认回滚日志（未开 WAL）、`busy_timeout(2s)`、`synchronous = FULL`、`foreign_keys = ON`；迁移前备份 `backup()` 已采用支持 WAL 在线热备的 `rusqlite::backup::Backup`。注意现有 `open_database()` 先以 `SQLITE_OPEN_READ_ONLY` 打开做 `quick_check` 与 `user_version` 探查：启用 WAL 后若上次崩溃遗留 `-wal` 且无 `-shm`，只读打开在部分环境下无法恢复 WAL 索引，需改为在已持有实例 `.lock` 锁的前提下以读写标志打开，并在任何写入或迁移前先只读校验 `user_version <= 2` 与 `quick_check == "ok"`。
- **错误与命令线程模型现状**：`desktop/src-tauri/src/` 共 18 个源文件、193 处 `Result<..., String>`；共注册 46 个 `#[tauri::command]`，其中 8 个为 `async fn`，其余 38 个为同步 `fn`（在 Tauri v2 中直接在 Windows 主界面/消息泵线程同步执行 SQLite 锁、文件读写、备份导入、凭据库访问与 broker 管道通信）。无诊断日志模块，也未设置 `std::panic::set_hook`。

#### T13A · CI `rustfmt`/`clippy`、SQLite WAL、本地脱敏诊断日志与 panic hook（已验收）

1. **接入 CI `rustfmt` 与 `clippy` 门禁。** 在 `tests/release.test.mjs` 增加回归断言（先红后绿）：`glib-backport.yml` 的 `linux-regression` 与 `windows-compatibility` 均安装 `1.94.1` 的 `rustfmt` 与 `clippy` 组件，对 `desktop/src-tauri/Cargo.toml` 执行 `cargo +1.94.1 fmt --manifest-path desktop/src-tauri/Cargo.toml --all -- --check` 和 `cargo +1.94.1 clippy --manifest-path desktop/src-tauri/Cargo.toml --locked -- -D warnings`（Windows 腿带 `--all-targets`；Linux 腿同步对 `desktop/security/glib-variant-iter/Cargo.toml` 执行 `fmt --check` 与 `clippy --all-targets --locked -- -D warnings`）。格式化 `desktop/src-tauri` 现有代码并处理 `source_quote_check` 的 Tauri 注入参数告警。
   判据：工作流门禁测试先红后绿；本机 `cargo +1.94.1 fmt --all -- --check` 与 `cargo +1.94.1 clippy --all-targets --locked -- -D warnings` 均退出码 0。
2. **启用 SQLite WAL 与干净退出 checkpoint。** 保持现有表结构、`user_version`（2）与 `rusqlite::backup::Backup` 逻辑不变。在 `project_store.rs` 的 `open_database` 中：持有实例 `.lock` 文件锁后打开连接，设 `busy_timeout(5s)` 与 `foreign_keys = ON`，在任何建表、迁移或恢复写入前先校验 `quick_check == "ok"`、`user_version <= 2` 及表结构列探针（超版本或损坏时立即关闭返回错误，不写原文件）；校验通过后设 `PRAGMA journal_mode = WAL`（磁盘文件库断言返回模式为 `wal`）与 `PRAGMA synchronous = FULL`。新增 `ProjectStore::shutdown`，在 `lib.rs` 的 `RunEvent::Exit` 中执行 `PRAGMA wal_checkpoint(TRUNCATE)` 并释放连接。
   判据：新增 Rust 单元测试覆盖新库与既有 v1/v2 回滚日志库升级启用 WAL、崩溃遗留 `running` 状态恢复、`user_version > 2` 拒绝不篡改、在线迁移备份通过 `integrity_check` 以及 `shutdown` 后 WAL checkpoint 收敛。
3. **新增本机有界脱敏诊断日志与 panic hook。** 新建 `desktop/src-tauri/src/diagnostics.rs`（仅用标准库与现有 `serde_json`，不加新 crate）：将结构化 JSONL 事件写入 `app_local_data_dir()/diagnostics/desktop-events.jsonl`（拒绝目标目录或日志文件为符号链接/reparse point；单文件上限 512 KiB，超限原子轮转为 `desktop-events.prev.jsonl`，最多保留两份）。仅记录 UTC 毫秒时间戳、级别、子系统标识、固定事件码与脱敏位置/分类摘要；启动时通过 `Once` 安装 `std::panic::set_hook`，只落盘线程名与源码 `file:line:column`（绝不把任意 panic payload 原文、用户文件内容、项目密钥、模型请求体或凭据写入磁盘），随后继续调用默认 hook。在存储打开/恢复异常、迁移备份失败与 broker 非预期断开处接入诊断事件。
   判据：Rust 单元测试覆盖 512 KiB 轮转、符号链接拒绝、panic hook 位置记录以及含合成秘密标记的 payload 零落盘泄露；`cargo +1.94.1 test --manifest-path desktop/src-tauri/Cargo.toml --locked` 与 §2 四项门禁全绿。

**T13A 允许变更的文件。** `.github/workflows/glib-backport.yml`、`tests/release.test.mjs`、`desktop/src-tauri/src/*.rs`（含新增 `diagnostics.rs`）、`desktop/security/glib-variant-iter/tests/variant_str_iter.rs`（保留 `VariantStrIter::nth(0)` 回归断言的 clippy 豁免）、本文与 `progress.txt`。不改 `Cargo.toml` / `Cargo.lock`，不改 SQLite schema。

本机实施验收（2026-11-18）：`tests/release.test.mjs` 新增 `glib-backport` 双端锁定 `1.94.1` `rustfmt` 与 `clippy -D warnings` 门禁测试先红后绿（48/48 通过）。`project_store.rs` 在持有实例 `.lock` 锁前提下通过 SQLite 文件头与 `SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE` 只读探查确保 `user_version > 2` 或损坏库拒绝时原文件与 `-wal`/`-shm` 字节零篡改，校验通过后启用 `WAL` 与 `synchronous = FULL`，并以 `StoreState::{Uninitialized, Open, Closed}` 配合 `RunEvent::Exit` 执行 `wal_checkpoint(TRUNCATE)` 且杜绝退出后延迟重开。新增 `diagnostics.rs` 实现本机 512 KiB 原子轮转 JSONL 脱敏事件日志、逐级父目录与 Windows 目录句柄 reparse-point 校验、线程局部防重入与锁中毒恢复 panic hook（仅记录线程分类与本包相对源码行列，绝不落盘 panic payload 或用户/凭据内容）。零上下文复审发现的七项边界问题与 Linux 非 Windows 条件编译告警已全部修复并补齐单测；PR [#51](https://github.com/YEowo-Y/weapp-shipmate/pull/51) 十项 CI 全绿并合入 `main@1e3c3e1`。

#### T13B · 类型化错误 `DesktopError` 与耗时 Tauri 命令异步化（已验收）

1. **以类型化 `DesktopError` 替代裸 `String` 错误。** 新建 `desktop/src-tauri/src/error.rs`（零新 crate），定义结构化错误枚举（覆盖窗口来源未授权、输入校验失败、运行时资源定位失败、SQLite 分类错误、文件系统 I/O 错误、内部状态锁不可用、版本/状态冲突、后台任务中止等变体），实现 `Display`、`std::error::Error` 与 `serde::Serialize`（序列化输出与现有中文用户提示逐字兼容，确保前端 `invoke` 调用方和全部原生验收脚本契约不变），将各模块命令链路与存储/工具层的 `Result<..., String>` 收敛为 `Result<..., DesktopError>`，并在服务端异常变体上关联 T13A 的脱敏诊断事件码。
2. **耗时同步命令改异步执行。** 逐一排查现有 38 个同步 `#[tauri::command]`：保留主线程入口处的同步窗口来源鉴权 `runtime::authorize(&window)`，将涉及 SQLite 互斥锁与磁盘查询/事务、备份导入与归档、项目文件与上下文读取、记忆与维护状态读写、系统通知持久化及 `model_request` 进程启动/管道写入的命令改为 `async fn` 加 `tauri::async_runtime::spawn_blocking`，消除主界面线程阻塞；对 `spawn_blocking` join 失败统一映射为 `DesktopError::TaskAborted` 并记录诊断事件。核对 `run_cancel`、`model_cancel` 等取消路径并发调用不死锁、不退化。
3. **验证与回归。** 新增 Rust 单元测试覆盖 `DesktopError` 各变体序列化文本、错误分类转换、并发异步命令与取消竞争；跑通 `cargo fmt --check`、`cargo clippy --all-targets --locked -- -D warnings`、`cargo test --locked`、`npm --prefix desktop run build` 与 §2 四项门禁，经零上下文子代理冷读复审与全部 PR CI 通过后交付。

**T13B 允许变更的文件。** `desktop/src-tauri/src/*.rs`（含新增 `error.rs`）、必要的桌面桥接回归测试、本文与 `progress.txt`。不改 `Cargo.toml` / `Cargo.lock`，不改前端公开 IPC 参数与返回结构。

本机实施验收（2026-11-18）：新增 `desktop/src-tauri/src/error.rs` 定义 8 变体结构化错误枚举 `DesktopError`（`Unauthorized`、`Validation`、`RuntimeUnavailable`、`Database`、`Io`、`StateUnavailable`、`Conflict`、`TaskAborted`），保持 IPC 序列化与中文提示逐字一致并联动脱敏诊断事件码；全模块 193 处 `Result<..., String>` 已全部收敛为 `DesktopResult<...>`（残留 0 处）。46 个 `#[tauri::command]` 全部统一为 `async fn`（入口同步执行 `runtime::authorize(&window)` 后经 `run_blocking` / `spawn_blocking` 将 SQLite、文件系统、凭据库、工具进程与 broker 管道操作移出界面线程），`ModelBridge` 改为 `Arc<ModelBridgeInner>` 单次 Drop 语义避免异步克隆误关子进程。零上下文冷读复审指出的 `ToolRunner` 复用 `run_id` ABA 竞争（已通过单调令牌 `next_token: AtomicU64` 修复并经先红后绿单测验证）、`run_internal_guarded` 前置/后置阻塞收敛、`run_cancel` 异步化及维护状态分类一致性已全部修复并二次复核通过。本机 `cargo +1.94.1 fmt --all -- --check`、`cargo +1.94.1 clippy --all-targets --locked -- -D warnings`、`cargo +1.94.1 test --locked`（125 通过、0 失败、2 既有忽略）、`npm --prefix desktop run build`（启动包 `735.10 kB` / gzip `241.25 kB`）与仓库四项门禁全部退出 0；PR [#52](https://github.com/YEowo-Y/weapp-shipmate/pull/52) 十项 CI 全绿并合入 `main@78bf814`（期间因私有仓库 Actions 额度用尽，已完成全部 51 个 Git 引用/历史对象、52 个 Issue/PR 评论及全部 Release 资产的零敏感信息安全核查后切换为 `public` 仓库）。

### T14 · 前端收敛第一步（已验收）

**目标与关口。** 完成第二阶段工程底座最后一项（功能 0「新外壳」的前置依赖）：将 `desktop/**` 纳入 ESLint 与 TypeScript 类型检查门禁，把正式桌面运行链引用的模块与样式从 `desktop/design-previews/` 迁入 `desktop/src/shared/`，消除 `desktop/src`、`desktop/server`、`desktop/scripts`、`desktop/vite.config.ts` 与 `desktop/index.html` 对 `design-previews` 的全部运行期依赖，并保持启动包严格处于 `750 kB` / gzip `250 kB` 预算内。本工单**零新增生产或开发依赖**（在 `eslint.config.mjs` 中惰性复用 `desktop` 已锁定的 `@babel/parser` `estree` + `typescript` 解析器，不触碰任何 `package-lock.json`），不改 CLI/MCP/IPC 公共契约，无 §3 关口。

**探查结果（2026-11-18，独立工作树 `main@78bf814`）**

- **`design-previews` 依赖闭包**：`desktop/src` 现有 33 个 `.ts`、6 个 `.tsx`、20 个 `.css` 文件，其中 20 个源文件含 **51 条**指向 `../design-previews/...` 的 import（直接命中 19 个模块，传递闭包共 **36 个无类型 `.js` 模块、6158 行**外加 `floating-ui`、`markdown-it`、`web-awesome` 三组本地 vendor 产物）；此外 `desktop/index.html` 含 **9 条** `/design-previews/...` 样式表 `<link>`，`desktop/server/*.mjs` 含 **7 条**指向 `agent-contract.js` / `explain-contract.js` / `guide-contract.js` 的 import，`desktop/scripts/prepare-runtime.mjs` 显式打包这 3 份契约文件，`desktop/scripts/build-ui-kit.mjs` 输出到 `design-previews/components/vendor/web-awesome`。
- **多端运行期兼容约束**：`ci.yml` 在 Node 20 / 22 / 24 矩阵上直接以 `node --test` 运行 `tests/*.test.mjs`（其中 74 个测试文件直接 import `../desktop/design-previews/*.js`，Node 20 原生不支持直接加载 `.ts`），且 `desktop/design-previews/*.html` 独立静态预览页亦直接加载同目录模块。因此将 36 个运行期模块与对应样式、本地 vendor 产物迁入 `desktop/src/shared/` 作为唯一真实源码，同时在 `desktop/design-previews/` 原路径保留单行 `export *` / `@import` 薄转发垫片（零业务逻辑复制），即可彻底切断正式桌面链对 `design-previews` 的依赖，又不破坏 Node 20–24 测试套件与历史静态预览页。
- **ESLint 与类型检查基线**：根 `eslint.config.mjs` 第 11 行当前整体忽略 `"desktop/**"`；对 `desktop/{scripts,server,design-previews}` 试跑 `eslint:recommended` 检出 25 个文件因默认参数依赖注入（如 `document = globalThis.document`）触发内置全局重声明。类型侧 `desktop/src/shared.d.ts` 当前用 15 段 `declare module '*...'` 通配环境声明遮蔽真实实现，且 `tsc` 仅在 `glib-backport` 运行而未进入 `ci.yml` 六腿矩阵；开启 `allowJs: true, checkJs: true` 后排除压缩 vendor 捆绑包，真实模块结构性类型诊断集中于 DOM 空值收窄与跨模块参数标注，可逐模块补齐 JSDoc/类型声明并淘汰通配遮蔽声明。
- **启动包预算现状**：`npm --prefix desktop run build` 产出启动入口 `735.10 kB`、gzip `241.25 kB`（预算上限 `750 kB` / `250 kB`，`settings-renderer` 保持异步分包）。

**实施步骤与判据**

1. **先补前端收敛与工作流门禁回归测试（先红后绿）。** 新建 `tests/desktop-frontend-convergence.test.mjs`，并在 `tests/release.test.mjs` 补工作流断言：
   - `desktop/src/**`、`desktop/server/**`、`desktop/scripts/**` 与 `desktop/index.html` 中不得存在任何指向 `design-previews` 的可执行 `import`/`export`/`<link>`/`<script>` 引用（注释中的历史文档说明除外）；
   - `eslint.config.mjs` 不再整体忽略 `desktop/**`，且对正式桌面目录配置禁止导入 `*design-previews*` 的规则；
   - `desktop/src/shared.d.ts` 不再保留覆盖已迁入模块的通配 `declare module '*...'` 遮蔽声明；
   - `.github/workflows/ci.yml`、`.github/workflows/release-rehearsal.yml` 与 `.github/workflows/release.yml` 均显式执行桌面类型检查 `npm --prefix desktop run typecheck`。
   判据：实施迁移前，`node --test tests/desktop-frontend-convergence.test.mjs tests/release.test.mjs` 因上述新增断言变红。
2. **迁入共享运行期模块与样式，切断 `design-previews` 依赖。** 将正式桌面闭包内的 36 个 `.js` 模块、9 份样式表及本地受审 vendor 资源（含 `web-awesome` 的 `manifest.json` 与 `THIRD-PARTY-NOTICES.txt`）迁入 `desktop/src/shared/`：
   - 更新 `desktop/src/**` 全部 51 处 import、`desktop/index.html` 全部 9 处样式引用、`desktop/server/*.mjs` 全部 7 处契约引用、`desktop/scripts/build-ui-kit.mjs` 输出目录，以及 `desktop/scripts/prepare-runtime.mjs` 与 `tests/desktop-runtime-package.test.mjs`、`tests/ui-kit-assets.test.mjs`、`tests/helpers/ui-action.mjs` 的契约/资源路径；
   - 在 `desktop/design-previews/` 对应原路径留下单行 `export *` / `@import` 转发垫片以保持历史预览页与既有单测兼容。
   判据：`npm --prefix desktop run prepare:runtime` 与 `node --test tests/desktop-runtime-package.test.mjs tests/ui-kit-assets.test.mjs` 全部通过；正式桌面目录零 `design-previews` 运行引用。
3. **接入 `desktop/**` 全量 ESLint 与严格类型检查并进 CI。**
   - 经实测 `typescript-eslint@8.73.0` 传递引入带 `picomatch` 高危告警的 `tinyglobby`，而 `@babel/core@8` 要求 Node `^22.18.0 || >=24.11.0` 与 Node 20 CI 矩阵不兼容；因此在 `eslint.config.mjs` 中惰性复用 `desktop/node_modules/@babel/parser`（`7.x`，支持 Node ≥6，由 `@vitejs/plugin-react` 锁定提供）的 `estree` + `typescript` + `jsx` 插件实现**零新依赖、零 lockfile 变动、零 `npm audit` 告警**的全量覆盖（覆盖 `desktop/**/*.{js,mjs,cjs,ts,tsx,mts,cts}`，仅忽略 `node_modules`、`dist`、`src-tauri`、受审第三方压缩 `vendor` 与纯 `.d.ts` 文件），对非预览桌面文件开启 `*design-previews*` 禁引规则；
   - 在 `desktop/package.json` 新增 `"typecheck"` 脚本，串联三套配置：`tsconfig.json`（`allowJs: true`、`checkJs: true` 覆盖 `desktop/src/**` 含全部 36 个迁入模块，仅为 3 个压缩 vendor 入口补伴生 `.d.ts`/`.d.mts` 边界声明并清除 `desktop/src/shared.d.ts` 中全部 15 段通配 `declare module '*.js'` 遮蔽声明）、`tsconfig.ts.json`（对 `vite.config.ts` 与 `src/**/*.{ts,tsx}` 强制保持 `noImplicitAny: true` 与 `useUnknownInCatchVariables: true`）以及 `tsconfig.node.json`（配合 `desktop/node-env.d.ts` 与逐文件 `// @ts-check` 覆盖 `desktop/server/**/*.mjs` 全部 12 个文件与 `desktop/scripts/**/*.{js,mjs}` 全部 4 个文件）；
   - 在 `ci.yml`、`release-rehearsal.yml` 与 `release.yml` 接入 `npm --prefix desktop run typecheck`。
   判据：`npm run lint`、`npm --prefix desktop run typecheck` 与 `npm --prefix desktop run build` 均退出码 0；第 1 步新增门禁测试全部变绿。
4. **包体积预算、前端审查与全量门禁验收。** 实跑核对 `desktop/dist/.vite/bundle-budget.json`：启动包原始字节 `<= 750,000`、gzip `<= 250,000`、`errors` 为空且 `settings-renderer` 保持延迟加载；使用前端审查助手与零上下文子代理冷读复审迁移边界、类型真实性与可访问性/安全回归；跑通 §2 四项仓库门禁与全部 PR CI。

**允许变更的文件。** `AGENTS.md`（同步更新第 26–27 行桌面 lint/typecheck 事实说明）、`eslint.config.mjs`、`desktop/package.json`（仅新增 `typecheck` 脚本并串联进 `build`，不改依赖与 lockfile）、`desktop/tsconfig*.json`、`desktop/node-env.d.ts`、`desktop/index.html`、`desktop/vite.config.ts`、`desktop/src/**`、`desktop/server/*.mjs`、`desktop/scripts/{build-ui-kit.mjs,bundle-budget.mjs,prepare-runtime.mjs,ui-kit-entry.js}`、`desktop/design-previews/**`（被迁出文件的单行转发垫片与 `_serve.mjs` 受控 `/src/shared/` 路由）、`scripts/{build-preview-icons.mjs,model-settings-fixture.mjs}`、`.github/workflows/{ci.yml,release-rehearsal.yml,release.yml}`、相关测试文件、本文与 `progress.txt`。

本机实施验收（2026-11-18）：`tests/desktop-frontend-convergence.test.mjs` 与 `tests/release.test.mjs` 新增门禁断言先红后绿；正式桌面闭包内 36 个 `.js` 模块、9 份 `.css` 样式、8 个品牌图标及 4 组受审 vendor 资源全部迁入 `desktop/src/shared/`，`desktop/design-previews/` 保留单行转发垫片。零上下文子代理冷读审查指出的 6 项发现——`_serve.mjs` 未受控挂载 `/src/shared/` 导致独立静态预览页 404、`eslint.config.mjs` 禁引 glob 未覆盖 `.mts`/`vite.config.ts`、`model-settings-fixture.test.mjs` 缺少 `/src/shared/` 投递与 `%2e%2e%2f` 越界断言、`@babel/parser` 顶层急切加载、`tsconfig.ts.json` 未纳入 `vite.config.ts` 及文档同步——均按先红后绿补齐修复。本机实跑 `npm run lint`（覆盖 366 个文件）、`npm --prefix desktop run typecheck`（三套 `tsconfig` 零错误）、`npm --prefix desktop run build`（`bundle-budget.json`：`startup.bytes = 735,152 <= 750,000`、`startup.gzipBytes = 241,269 <= 250,000`、`settings-renderer` `startup: false`、`errors: []`）、`npm --prefix desktop run prepare:runtime`（621 个运行期文件）、全量 `npm test`（1762 通过、0 失败）、`npm run verify:quotes`（69/69）、`npm run coverage`（precision 1.000 / recall 1.000）与根 `npm audit`（0 漏洞）全部退出码 0；PR [#54](https://github.com/YEowo-Y/weapp-shipmate/pull/54) 十项 CI 全绿并合入 `main@626b89f`。

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

### 功能 0 · 新外壳

**目标与关口。** 按 `docs/25` §6.1–§6.2 与 §7 将桌面主窗口升级为三栏新外壳（左侧 `264px` 分组导航、中间 `704px` 阅读列对话主区、右侧 `404px` 四标签面板容器），完整覆盖 `docs/25` §6.1 入口对照表的每一项既有功能，实现 `<= 1180px` 右栏收为抽屉、`<= 820px` 侧栏收起，补齐每个新界面的加载、错误、空三种状态与纯键盘可访问性，并同步更新根目录 `DESIGN.md` 第 16、25、31、40 行。依赖 T14（[#54](https://github.com/YEowo-Y/weapp-shipmate/pull/54) 已合并）；零新增生产或开发依赖，不新增任何 Web Awesome 标签，无 §3 关口。

**探查结果（2026-11-18，独立工作树 `main@626b89f`）**

- **DOM 契约与既有门禁锚点**：`desktop/index.html` 当前为旧版双栏（左侧无文字图标栏 `.desktop-primary-navigation` + `<details id="desktop-navigation">`；右侧仅 `<dialog id="desktop-tools">` 在 `860px` 切换抽屉），含 39 处 `<wa-*>` 标签。`tests/desktop-controls.test.mjs`、`tests/desktop-tools-panel.test.mjs`、`tests/desktop-project-*.test.mjs` 钉住 `#desktop-preferences-open`（全页唯一持久化设置入口）、`#desktop-home-open`、`#desktop-workflow-open`、`#desktop-results-open`、`#desktop-memory-open`、`#desktop-sources-open`、`#desktop-maintenance-open`、`#desktop-maintenance-count`、`#sessionHost`、`#desktop-project-navigation`、`#desktop-tools` 内全部预检/报告控件 ID 及首页 `#start-check` / `#start-guide` / `#start-explain` / `#home-report` 交互不变量——新外壳须在重排视觉层级与入口位置的同时完整保留这些控制器 ID 与行为契约。
- **启动包预算与分包约束**：当前 `desktop/dist/.vite/bundle-budget.json` 启动包为 `735,152 B`（上限 `750,000 B`，余量仅 `14.8 kB`）、gzip `241,269 B`（上限 `250,000 B`），而 `react` + `react-dom` + `@base-ui/react` 位于延迟加载的 `settings-renderer` 分包（`301,267 B`）。因此新外壳右侧四标签面板的 React + Base UI 渲染器必须通过动态 `import()`（如 `desktop/src/shell/right-panel-renderer.tsx`）按需挂载，与 `settings-renderer.ts` 共享异步 React/Base UI chunk 且绝不把 `settings-renderer.ts` 拉入启动入口；同时将非首屏次级弹窗按需分包以进一步释放启动包余量。
- **图标集与精灵同步**：`desktop/src/shared/components/lucide-icons.js` 现有 38 个图标；对照 `docs/25` §6.2 需从固定提交 `dab294f313897bacaa968b725b3259fa37c17bd1` 补齐 16 个图标（`archive`、`camera`、`chevron-up`、`circle-dashed`、`circle-dot`、`eye`、`file-diff`、`folder-open`、`map-pin`、`notebook-text`、`panel-left`、`panel-right`、`refresh-cw`、`smartphone`、`undo-2`、`upload`，几何与 `docs/previews/shell-preview.html` 一致），并运行 `node scripts/build-preview-icons.mjs` 同步 `desktop/design-previews/components/icons.svg` 以通过 `tests/preview-icon-assets.test.mjs`。
- **现代 Web 规范约束（`modern-web-guidance`）**：
  - `navigation-drawer`：同时充当宽屏常驻栏与窄屏抽屉的容器不使用 `<dialog>`（避免宽屏下误暴露 `dialog` 角色），而由 `matchMedia('(max-width: 1180px)')` / `matchMedia('(max-width: 820px)')` 在抽屉打开时动态挂 `role="dialog"`、`aria-modal="true"` 并对背景主区设 `inert`，支持遮罩点击、`Escape` 与关闭按钮收起并归还焦点；宽屏常驻态移除 `role="dialog"`、`aria-modal` 与 `inert`。
  - `tabs`：右侧面板四标签（`上线`、`依据`、`改动`、`开发者工具`）使用 `@base-ui/react/tabs` 封装至 `desktop/src/components/ui/tabs.tsx`，选中态除颜色外带伪元素底边指示条（兼容 `forced-colors` 高对比度模式，且不改变选中项字重/内边距以免抖动），非活动面板初始 `hidden`，支持左右方向键、`Home`/`End` 键盘导航。
  - `menu` / `single-line-overflow` / `accessibility`：头部「更多」菜单采用 `desktop/src/components/ui/` 原语或原生 `popover` 菜单替代旧 `<wa-dropdown>`（不再新增任何 `<wa-*>` 标签）；侧栏与头部单行长标题保持完整 DOM 文本并用 `min-inline-size: 0` + `text-overflow: ellipsis` 截断，滚动容器内焦点环采用内缩 `outline-offset: -2px` 防止裁切，`<summary>` 内不放 `<h1>`–`<h6>`。

**实施步骤与判据**

1. **先补新外壳结构、入口映射、响应式断点与无障碍回归测试（先红后绿）。** 新建 `tests/desktop-shell-v2.test.mjs` 并同步更新 `tests/desktop-controls.test.mjs` 中针对旧六图标栏的静态 HTML 断言：
   - 断言 `docs/25` §6.1 对照表的全部入口在新外壳均可到达：左侧栏顶部固定区（品牌、搜索会话、通知提醒、收起侧栏、新建会话）、中部滚动区三组（「上线」：工作台、上线进度、运行与报告、拒因反查、规则来源；「项目」：添加项目、项目文件夹与当前项目缩进会话列表；「项目资料」：项目记忆、修复交接、本机修复记录、项目维护与重检、已归档会话）、底部固定区（规则库更新/核验状态、唯一设置入口 `#desktop-preferences-open`、帮助与反馈）；主区无底边线头部（侧栏展开钮、项目面包屑、会话 `<h1>`、头部「更多」菜单含重命名与会话内查找及项目工具入口、单一右侧面板开关 `#desktop-panel-toggle`）；右侧面板四标签（`上线`、`依据`、`改动`、`开发者工具`）；
   - 断言 `<= 1180px` 右栏收为模态抽屉（设 `role="dialog"`、`aria-modal="true"` 与背景 `inert`，`Escape`/遮罩关闭并归还焦点，宽屏移除 `role`/`inert`），`<= 820px` 左侧栏收起并可从头部展开为抽屉（聚焦在侧栏内部控件或关联模态框打开时不意外丢失焦点）；
   - 断言新外壳零新增 `<wa-*>` 标签、16 个新增 Lucide 图标齐全且精灵同步、右侧四标签面板各具备加载（骨架 + `aria-busy`）、错误（原因 + 重试）、空（明确唯一下一步）三种状态与键盘方向键/`Tab`/`Escape` 操作，以及根目录 `DESIGN.md` 第 16、25、31、40 行已按新外壳更新。
   判据：实施前 `node --test tests/desktop-shell-v2.test.mjs` 因上述新外壳断言变红。
2. **补齐 16 个 Lucide 图标与设计令牌布局尺寸。** 在 `desktop/src/shared/components/lucide-icons.js` 补入 `docs/25` §6.2 指定的 16 个固定提交图标节点并运行 `node scripts/build-preview-icons.mjs` 更新预览精灵；在 `desktop/src/design-system.css` 更新 `--ds-sidebar-width: 264px` 与 `--ds-panel-width: 404px`（保持 `--ds-measure: 704px`、`--ds-header-height: 52px` 与深浅双套 `--ds-*` 令牌）。
   判据：`node --test tests/preview-icon-assets.test.mjs` 通过。
3. **构建 `desktop/src/components/ui/` 原语与延迟加载右侧四标签面板。** 基于已安装的 `@base-ui/react` 与 `--ds-*` 令牌在 `desktop/src/components/ui/` 新建 `tabs.tsx`、`dropdown-menu.tsx` 与 `tooltip.tsx`（纯 `--ds-*` 样式，兼容 `forced-colors` 与 `prefers-reduced-motion`）；新建异步分包 `desktop/src/shell/right-panel-renderer.tsx` 与宿主控制器 `desktop/src/shell/right-panel.ts`：
   - 承载 `上线`、`依据`、`改动`、`开发者工具` 四个标签，完整实现各标签的加载骨架、错误重试、空状态引导及 info 提示说明（不含任何「已合规」「保证过审」「可直接提交」措辞）；
   - 接入既有真实数据源（当前项目快照与上线进度入口、最新已保存报告的规则原文/链接/核验日期依据、当前项目本机修复记录摘要、开发者工具连接前置空状态说明），为后续功能 1、2、7（只读连接检测）提供稳定挂载槽位。
4. **重排 `desktop/index.html`、`desktop/src/main.ts` 与三栏响应式外壳样式。** 新建 `desktop/src/shell/shell-layout.ts` 与 `desktop/src/shell/shell.css`，将主窗口升级为左 `264px` / 中自适应（`704px` 阅读列） / 右 `404px` 三栏网格：
   - 替换旧无文字图标栏与旧 `<wa-dropdown id="desktop-actions">`，按 `docs/25` §6.1 落地左侧固定顶栏、三组滚动导航、带顶边细线的固定底栏，以及无底边线主区头部（面包屑、会话标题、「更多」菜单、单一右侧面板开关 `Ctrl+J`）；
   - 实现 `<= 1180px` 右栏抽屉与 `<= 820px` 侧栏抽屉的 `matchMedia` 状态机、`inert` 背景隔离、`Escape`/遮罩关闭与焦点归还，同时完整保留 `#desktop-tools`、`#desktop-workspace`、Composer 输入法保护（`isComposing || keyCode === 229`）与流式输出防抢滚动行为。
5. **更新 `DESIGN.md`、核验包体积预算与全量门禁。** 按新外壳事实更新根目录 `DESIGN.md` 第 16、25、31、40 行；实跑 `npm --prefix desktop run build` 核对 `bundle-budget.json`（`startup.bytes <= 750,000`、`startup.gzipBytes <= 250,000`、`settings-renderer` 仍为 `startup: false`、`errors: []`）；执行前端审查助手（`review-frontend-production`）与零上下文子代理冷读审查；跑通 `npm run lint`、`npm --prefix desktop run typecheck`、`npm test`、`npm run verify:quotes`、`npm run coverage` 与全部 PR CI。

**允许变更的文件。** `DESIGN.md`（第 16、25、31、40 行及更新日期）、`desktop/index.html`、`desktop/src/design-system.css`、`desktop/src/styles.css`、`desktop/src/product-polish.css`、`desktop/src/home.css`、`desktop/src/main.ts`、`desktop/src/application-shortcuts.ts`、`desktop/src/tools-panel.ts`、`desktop/src/components/ui/*.tsx`、`desktop/src/shell/**`、`desktop/src/shared/components/lucide-icons.js`、`desktop/design-previews/components/icons.svg`（由 `scripts/build-preview-icons.mjs` 生成）、相关测试文件（`tests/desktop-shell-v2.test.mjs`、`tests/desktop-controls.test.mjs` 等）、本文与 `progress.txt`。不改 `package.json` / `package-lock.json` 依赖，不改 Rust / CLI / MCP 契约。

## 7. 当前推进入口

T01–T08、T09A–T09C、T10A–T10B 和 T11A–T11B 已完成。[#37](https://github.com/YEowo-Y/weapp-shipmate/pull/37) 合并后，GitHub 已将根目录 minimatch 告警 #21 标记为 fixed。T11B 已通过 [#45](https://github.com/YEowo-Y/weapp-shipmate/pull/45) 合并；T11C1 CLI 显式证据已按 [#47](https://github.com/YEowo-Y/weapp-shipmate/pull/47) 批准范围实施，状态为 PR 中，之后再定 baseline 契约。通用基线和验证命令见 §2。

桌面与工程底座工作线的 T12A（[#48](https://github.com/YEowo-Y/weapp-shipmate/pull/48)）、T13A（[#51](https://github.com/YEowo-Y/weapp-shipmate/pull/51)）、T13B（[#52](https://github.com/YEowo-Y/weapp-shipmate/pull/52)）与 T14（[#54](https://github.com/YEowo-Y/weapp-shipmate/pull/54)，`main@626b89f`）已全部完成合并与云端 CI 验收，第二阶段工程底座桌面与前端底座项全部收官。当前提交 **功能 0 · 新外壳** 范围稿（PR 中），范围 PR 通过后立即实施功能 0，随后按 `docs/25` §8 推进公测功能项。
