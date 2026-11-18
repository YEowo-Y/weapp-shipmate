# 28 · 生产级就绪评审（架构加固与能力查缺）

2026-11-18。评审对象 `main@5668310`（`npm` 版本 `0.2.0-rc.4`）。本文是**只读评审**的结果：没有改动任何产品代码、规则或治理文件。修复建议按优先级列出，实施与否由维护者裁决。

## 0. 怎么读这份文档

- **§1 结论**：如果只看一段，看这里。
- **§2 基线与分母**：「完整评审」的可核对边界。所有后续结论都限定在这个范围内。
- **§3 发现**：按 P0 / P1 / P2 分组，每条带位置、证据、影响、修复建议、复验方法。
- **§4 升级方案**：按投入产出排序，标明依赖与关口。
- **§5 没做什么**：未检查项与判断不了的项。**这一节和 §3 同等重要**。

本文不承诺穷举无限输入，也不承诺「没有缺陷」。它承诺的是：写进来的每一条都有可复现的证据路径。

## 1. 结论

**这个项目的工程质量远高于它的规模暗示，当前的主要短板不在代码质量，而在「能力覆盖」与「表述精确度」。**

四点判断，按重要性排序：

1. **基础工程是扎实的，且是被机器强制的。** 四条本地门禁全绿（1787/1787 测试、lint、69 条引文、规则覆盖）；规则/流程/拒因三份数据由 ajv 在 `npm test` 入口强制校验 schema；Rust 生产代码 13,768 行里可疑 `unwrap` 为 **0**；46 个 Tauri 命令**全部**经过窗口来源鉴权；broker 的 stdout 纪律由代码强制（`console.log` 被重定向）。
2. **最大的真实风险是「宣称」与「实际」之间的缝隙，不是缺陷本身。** 三处需要收窄表述：`precision 1.000` 的分母只有 30/69 条已锚定规则；「全量严格类型检查」不覆盖 7,222 行允许隐式 any 的共享 JS；发布链路停在一个从未打 tag 的 `0.2.0-rc.4`，而唯一公开版本是 7 月的 `v0.1.0`。这三处若不澄清，对外沟通会滑向 `GOVERNANCE.md` 明令禁止的过度声明。
3. **前端处于「两代并存」的接缝期，设计系统只有颜色成立、度量未成立。** 新外壳（React + TS）已全部切到 `--ds-*` 令牌，旧工作页（原生 DOM + 遗留 JS）仍是 0 处令牌引用；字号令牌覆盖 21%、圆角 33%；`--accent` 在 `.desktop-app` 内外取值不同（墨黑 vs 橙色），构成一处真实的视觉断裂。
4. **agent 运行时的安全不变量做得比一般产品更细，但能力面窄。** 上游 2 MiB / 下游 256 KiB 双重字节上限、3 步 / 2 次工具预算、`finish` 确认后才放行工具调用、禁并行、`toolCallId` 去重，13 条测试逐条钉住。代价是：只支持 3 家服务商的工具调用、无重试、无上下文压缩、无检查点续跑。

**一句话**：代码可以交给下一个工程师接手；需要补的是「能力边界」和「口径诚实」两件事。

## 2. 基线与分母

### 2.1 门禁基线（2026-11-18 实跑，全部退出码 0）

| 门禁 | 结果 |
|---|---|
| `npm run lint` | 0 |
| `npm test` | 0（**1787 通过 / 0 失败 / 0 跳过**） |
| `npm run verify:quotes` | 0（69 条引文全部通过） |
| `npm run coverage` | 0（见 §2.3 的口径说明） |

云端 `main` 最近两次完整 CI 同样全绿：`validate-rules` 2m12s、`glib-backport` 7m47s（run 44309466207 / 44309466213）。

### 2.2 被评审的对象

| 分层 | 规模 |
|---|---|
| CLI / 规则内核 | `src/` 23 个模块、`bin/` 2 个入口、13 个规则 YAML（1,246 行 / 64 条，含草案 66）、`flow.yaml` 58 行、`rejections.yaml` 178 行 24 条 |
| 桌面前端 | `desktop/src/` 131 个文件（38 ts / 38 js / 17 tsx / 33 css），16,372 行；其中 `shared/*.js` 无类型模块 7,222 行 |
| 桌面桥接 | `desktop/server/` 12 个 `.mjs`、1,786 行 |
| 原生 | `desktop/src-tauri/src/` 20 个模块、13,768 行、127 个单测 |
| 测试 | `tests/` 154 个文件（其中桌面/agent/model 相关 46 个） |
| 视图单元 | `desktop/index.html` 15 个顶层容器、186 个唯一控件 ID、41 个 button、4 个 dialog、14 个表单控件、36 个 `wa-button` |
| 分包 | 启动包 `724,539 B` / gzip `236,915 B`（上限 750,000 / 250,000）；11 个懒加载 chunk |

### 2.3 `coverage` 的口径（必须写清）

`npm run coverage` **不是代码覆盖率**，是规则覆盖率。实跑输出：

```
覆盖（默认规则）：64 条 + 交叉核验合成 5 = 69 条可命中 | draft 2
逐字核验：64 / 64
precision：1.000 （recall 1.000 · TP55/FP0/FN0）
标注锚定：30 / 69 条可命中规则在 labels.json 有 hit/no_hit 锚点
```

**`precision 1.000` 的分母是 30 条规则、55 个标注对。** 39 条规则零锚点，其误报/漏报对指标完全不可见。任何对外表述都必须带这个限定。

全仓没有任何代码覆盖率工具（`grep c8|nyc|istanbul|--experimental-test-coverage` 零命中）。

## 3. 发现

严重度定义：**P0** = 用户可见的错误、数据错误或安全缺口；**P1** = 明显缺陷、可访问性阻断或对外表述失真；**P2** = 打磨项与加固建议。

### 3.1 P0

#### P0-1 主色令牌在两套作用域下取值不同，顶层对话框仍是旧橙色

- **位置**：`desktop/src/shared/app.css:16-37`（`:root` + `body[data-theme]`，橙色 `--accent:#b45a3b` / `#e07a52`）对 `desktop/src/design-system.css:70,100`（`.desktop-app[data-theme]`，墨黑 `#292928` / `#e4e3df`）
- **证据**：`.desktop-app[data-theme]`（特异性 0,2,0）压过 `body[data-theme]`（0,1,1），所以主窗口内是墨黑；但 `#desktop-materials`、`#desktop-explain` 等原生 `<dialog>` 渲染在 top layer，继承的是 `body`/`:root` 上的橙色。
- **影响**：同一控件在窗口内与对话框里拿到不同主色；`--accent-soft` 的两种值（`#f6e9e1` 暖橙 vs `#eeedea` 冷灰）会让徽标底色跳变。
- **修复建议**：删除 `app.css:16-37` 整块配色（`--font-ui`/`--font-mono`/`--ease` 可留给 `design-system.css` 继承），同批收敛 `styles.css:1-12` 与 `product-polish.css:8-26` 的重复映射。
- **复验**：打开提审材料包对话框，与主窗口主按钮对比主色，两处应同为 `#292928`。

#### P0-2 懒加载对话框在加载期间无法被关闭

- **位置**：`desktop/src/shell/lazy-dialogs.ts:41-43`（`mountSourceFreshness.close`）、`:115-117`（`mountRepairHandoff.close`）、`:155-157`（`mountSubmissionMaterials.close`）
- **证据**：`open()` 在实例未就绪时走 `void ensure().then(ctrl => ctrl?.open(...))`，而 `close()` 只执行 `instance?.close()`。模块仍在下载时调用 `close()`，关闭意图被静默丢弃，`ensure()` 完成后仍会 `open`。
- **触发条件**：冷启动或慢盘下，点击打开后立刻按 Escape / 点关闭。
- **影响**：用户已经取消，对话框仍然弹出并可能抢占焦点。
- **修复建议**：仿照同文件 `mountExplainDialog` 的 `pendingReset`（第 55、75 行），增加 `pendingClose`；`ensure()` 完成后若 `pendingClose` 为真则不 `open` 并立即 `close()`。
- **复验**：新增单测——`import()` 返回可控延迟 Promise，先 `open()` 再立刻 `close()`，断言最终的 `open` 未被调用。

### 3.2 P1

#### P1-1 发布链路：`0.2.0-rc.4` 从未打 tag，公开版本停在 7 月

- **位置**：`package.json`、`desktop/package.json`、`desktop/src-tauri/Cargo.toml`、`desktop/src-tauri/tauri.conf.json`（四处均为 `0.2.0-rc.4`）；`.github/workflows/release.yml:8-9`（仅 `push tags: ["v*"]` 触发）
- **证据**：`git tag -l` 最远到 `v0.2.0-rc.3`；`gh release list` 显示 rc.1/rc.2/rc.3 均为 **Draft**，唯一 `Latest` 是 2026-07-02 的 `v0.1.0`。
- **影响**：代码领先公开发布物四个候选版本。任何「已发布」表述都不成立。
- **修复建议**：由维护者裁决是否发 rc.4 tag（**§3 关口：打 tag / 发布 Release 须明确批准**）。裁决前，文档与 CHANGELOG 统一用「候选版本」措辞——`CHANGELOG.md` 开头已经这么写了，需确保别处一致。
- **复验**：`git tag -l && gh release list` 与四处版本号对账。

#### P1-2 `precision 1.000` 的口径必须带分母

- **位置**：`scripts/coverage.mjs:9`（`BACKLOG_TOTAL = 72`）、`:33`（标注锚定统计）
- **证据**：见 §2.3。锚定 30/69，TP55/FP0/FN0。
- **影响**：把 1.000 当成「全库零误报」是对外过度声明，与 `GOVERNANCE.md` 诚实原则冲突。
- **修复建议**：所有对外表述固定为「30/69 条已锚定，precision 1.000（TP55/FP0/FN0）」；标注台账补齐列入功能 5 的伴随工作。
- **复验**：`npm run coverage` 输出与 `corpus/labels.json` 对账。

#### P1-3 「全量严格类型检查」不覆盖共享 JS

- **位置**：`desktop/tsconfig.json:19-20`（`checkJs: true` + `noImplicitAny: false`，`include: ["src"]`）与 `desktop/tsconfig.ts.json`（`noImplicitAny: true` + `checkJs: false`，只含 `.ts/.tsx`）
- **证据**：`typecheck` 串联三套配置。7,222 行 `shared/*.js` 走的是**允许隐式 any** 的那一套；`shared/*.js` 中已有 8 处 `/** @type {any} */` 宽化（`conversation.js:1433`、`submission-materials.js:206,207,238,254,311,390`、`ui-kit.js:21`），94 个函数声明对应 **44 行** `@param`/`@returns` 标注。
- **影响**：`AGENTS.md` 与交接文档中若称「全量严格类型检查」需收窄为「TS/TSX 严格，共享 JS 仅 `checkJs`」。
- **修复建议**：先在不改代码的前提下把 `noImplicitAny` 临时改为 `true` 跑一次，**统计诊断数作为基线**，再按模块补 JSDoc。不要一次性切换（可能阻塞所有 PR）。
- **复验**：改配置后 `npm --prefix desktop run typecheck`，记录错误数。

#### P1-4 启动包余量只剩 25.5 kB，且分包边界不可声明

- **位置**：`desktop/vite.config.ts:10-35`
- **证据**：配置**没有** `build.rollupOptions.manualChunks`，分包完全依赖 Rollup 对动态 `import()` 的默认切分；唯一约束是构建后的 `bundleBudget()` 插件。当前 724,539 / 750,000，gzip 余量 13.1 kB。
- **影响**：任何模块被静态 import 链意外拉进启动入口，都不会在评审阶段暴露，只会在构建时以「超预算」失败，且报错只给字节数、不给模块名。
- **修复建议**：增加显式 `manualChunks` 分组（React 运行时 / Base UI / 业务懒加载路由），并让 `bundle-budget.mjs` 超限时输出「新增进启动入口的模块清单」。
- **复验**：故意往 `main.ts` 加一条指向大模块的静态 import，确认报错能指名到模块。

#### P1-5 规则库密度失衡：最易被拒的两个面覆盖最薄

- **位置**：`rules/privacy-apis.yaml`（23 条）对比 `rules/minors.yaml`（1 条）、`rules/qualification.yaml`（1 条）
- **影响**：未成年人保护与资质要求是审核拒绝的高频面，但规则覆盖显著稀薄；与功能 5 的真实缺口吻合。
- **修复建议**：并入功能 5 范围评估。新增规则须过 `CONTRIBUTING.md` 准入与 `verify:quotes`，且**规则内容改写属 §3 关口**，须维护者批准。
- **复验**：功能 5 完成后重跑 `npm run coverage` 观察 `byStage` 分布。

### 3.3 P2

| 编号 | 问题 | 位置 | 修复方向 |
|---|---|---|---|
| P2-1 | 懒加载失败共用全局 `#status`，会覆盖主流程提示 | `desktop/src/shell/lazy-dialogs.ts:6-12` | 就近呈现错误，或加来源前缀 |
| P2-2 | 无任何代码覆盖率度量 | 全仓（见 §2.3） | Node 22 内建 `--experimental-test-coverage`，先只报告不设闸门 |
| P2-3 | 能力文档 8 处链接指向转发垫片 | `docs/12-current-capabilities.md:30,47,48,49,55,56,58,66` | 改指 `desktop/src/shared/*`，保留 `research/` 历史链接 |
| P2-4 | 断点数值在 CSS 与 JS 各声明一份 | `shell.css:1465,1487` 对 `shell-layout.ts:33-34` | 抽单一常量，或补测试断言两处相等 |
| P2-5 | 设计系统度量层未成立 | 全仓 CSS（见 §3.4） | 见 §4 阶段 3 |
| P2-6 | `model_bridge.rs:393` 依赖「上一行刚赋值」的隐式推理 | `desktop/src-tauri/src/model_bridge.rs:393` | 改 `ok_or_else(...)`，与该文件其余 `.map_err(...)` 一致 |
| P2-7 | 仓库内 4 个 >500 kB 的证据截图 | `desktop/design-previews/research/assets/product-alignment/`、`docs/previews/` | 不删历史；后续新图用 WebP |
| P2-8 | 未合并分支 `codex/plan-checkpoint-source-review` 已被取代 | 本地分支（头 `4a3223c`） | 维护者裁决归档或删除（**对外动作，不代执行**） |

### 3.4 设计系统的度量缺口（P2-5 的分母）

统计口径：`desktop/src/**/*.css`，排除 `vendor/`；分母为该属性出现的**全部**声明，分子为其中含 `var(--` 的声明。

| 维度 | 总数 | 走令牌 | 覆盖率 |
|---|---|---|---|
| `font-size` | 544 | 115 | **21%** |
| `border-radius` | 281 | 127 | 45% |
| `box-shadow` | 67 | 41 | 61% |
| 颜色 | — | ≈100% | 系统成立 |

> 口径说明：若把 `border-radius: 50%` 这类圆形半径排除出分母（圆形本不需要令牌），圆角覆盖率会降到 **33%**。两种算法都成立，本文采用前者（更保守地暴露缺口），引用时请连同口径一起引。

- 间距出现 **30 种** px 值，其中 `6px`(122 次)、`7px`(46)、`9px`(45)、`11px`(29)、`13px`(22)、`14px`(67) 不在 4px 网格上。
- `font-size` 硬编码最集中的四个文件（合计 261 处声明，仅 3 处走令牌）：

| 文件 | font-size 声明 | 走令牌 |
|---|---|---|
| `shared/app.css` | 146 | **0** |
| `styles.css` | 50 | **0** |
| `shared/components/message.css` | 34 | 2 |
| `shared/conversation.css` | 31 | 1 |

- 新文件已经做对（`--ds-*` 引用数实测）：`shell/shell.css` **365** 处、`product-polish.css` **319** 处、`submission-materials.css` **190** 处；作为对照，`shared/app.css` 是 **0** 处。
- 同一令牌两处赋不同值（已核实）：`styles.css:11` `--surface-3:#2c2c2a` 对 `product-polish.css:27` `--surface-3:#2a2a28`，后者覆盖前者。
- `design-system.css` 的语义映射被多个文件重复声明（实测定义处数）：`--text` **5** 处、`--bg` **4** 处、`--ease` **3** 处、`--font-ui` **2** 处。**最终生效值取决于 `index.html` 的加载顺序，而不是设计意图。**

## 4. 升级方案（按投入产出排序）

### 阶段 1：口径与发布（1–2 天，零产品代码风险）

1. **收窄三处表述**：`precision` 带分母、「严格类型检查」限定范围、发布状态改为「候选」。（P1-2、P1-3、P1-1）
2. **补代码覆盖率报告**：CI 里只输出不设闸门，先建立基线。（P2-2）
3. 修 `docs/12` 的 8 处垫片链接。（P2-3）

判据：`docs/12`、`CHANGELOG.md`、`README.md` 中不再出现无分母的 precision 表述；CI 产出覆盖率摘要。

### 阶段 2：可见缺陷（3–5 天）

4. **修懒加载关闭竞态**（P0-2）并补先红后绿的测试。
5. **收敛主色令牌**（P0-1），删除 `app.css` 的平行调色板。
6. 修 `#status` 覆盖（P2-1）、`model_bridge.rs:393`（P2-6）、断点单一来源（P2-4）。

判据：新增测试覆盖竞态；顶层对话框与窗口内主色一致；四条门禁全绿。

### 阶段 3：设计系统度量层（5–8 天）

7. 建立 4px 间距网格与字号阶梯令牌，优先改造 `shared/app.css`（146 处零令牌）。
8. 把 `design-system.css` 的语义映射收敛为唯一来源，消除重复声明。

判据：`font-size` 令牌覆盖从 21% 提升到 60% 以上；`--text`/`--bg`/`--font-ui`/`--ease` 各只剩一处定义；启动包不超预算。

### 阶段 4：工程强度（择机）

9. **显式 `manualChunks` + 超限报错指名模块**（P1-4）。这一项在功能 1/6/7 之前做，否则每次加界面的成本都会被 25.5 kB 余量放大。
10. 共享 JS 的 `noImplicitAny` 渐进收紧（P1-3 的 b 步）。

### 不做的事

- 不删除历史分支、不改写历史（`docs/26` §2 禁令）。
- 不为了指标好看去改标注、阈值或判定（`AGENTS.md` 禁令）。
- 不扩大模型可调用的工具集、不改 `Permission` 结构（§3 关口）。

## 5. 这次评审没做什么

**没做的检查**：

- **没有实机运行桌面应用**。所有 UI 结论来自静态读码与构建产物，未在 Windows 上启动 Tauri 应用验证渲染、焦点与动效。设计系统结论的置信度因此低于代码结论。
- **没有跑 Rust 测试**（本机未装 `1.94.1` 工具链）。Rust 结论基于源码统计与 `clippy` 历史记录。
- **没有做真实的模型调用**。agent 运行时结论基于代码与 13 条现有测试，未实际连服务商验证工具选择质量。
- **没有审计 CI 工作流的安全性**（`actions` 按 SHA 固定等属于发布工程关口）。
- **没有逐条核对 64 条规则的官方原文**；这是 T04/`verify:quotes` 的职责，不是本评审的范围。

**中断的部分**（子代理因账户配额耗尽）：

- 交互与可访问性审查只完成约五成，**未覆盖**：完整的键盘焦点路径、抽屉与断点的竞态、全部三态缺失清单。
- agent 运行时审查只完成约五成，**未覆盖**：取消路径的 Rust 侧追踪、错误分类到文案的完整映射、会话语义。
- 安全审查只完成约五成，**未覆盖**：路径穿越的 Windows 特有形态（8.3 短路径、UNC、ADS）、凭据生命周期全链路。

上述三项已由主审用定向检查补了一部分（鉴权覆盖 46/46、本地服务绑定、XSS 面、竞态模式），但**不等于完整覆盖**。若需要，应单独补一轮。

**判断不了的项**：

- 包体积余量 25.5 kB 在功能 1/6/7 全部落地后是否够用——取决于按需分包执行得多严格。
- 设计系统改造的实际收益，需要一次真实的视觉验收（截图对比）才能确认。
