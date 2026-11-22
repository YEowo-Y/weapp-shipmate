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
2. **三处对外表述需要和证据对齐。** `precision 1.000` 来自只锚定 30/69 条规则的语料。共享 JS 的 7,222 行使用允许隐式 any 的类型检查配置。评审时 `0.2.0-rc.4` 尚未打 tag，公开版本为 7 月的 `v0.1.0`。
3. **前端处于「两代并存」的接缝期，设计系统只有颜色成立、度量未成立。** 新外壳（React + TS）已全部切到 `--ds-*` 令牌，旧工作页（原生 DOM + 遗留 JS）仍是 0 处令牌引用。字号令牌覆盖 21%，圆角令牌覆盖 33%。
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

**89 条标注对锚定了 69 条规则中的 30 条。** Precision 的分母为 55 个有标注的预测命中（TP + FP），recall 的分母为 55 个正例标注（TP + FN）。对外表述应给出标注规模与规则锚定比例，指标的适用范围为这组标注。

2026-11-19 复核覆盖率输出。规则库分母为 65 条默认数据规则和 5 项交叉核验，其中 30 个规则 ID 具备标注锚点。导航规则计入规则库，标注计分基于 15 个夹具、89 条 `check` 标注。报告在精度行显示标注数。

全仓没有任何代码覆盖率工具（`grep c8|nyc|istanbul|--experimental-test-coverage` 零命中）。

## 3. 发现

严重度定义：**P0** = 用户可见的错误、数据错误或安全缺口；**P1** = 明显缺陷、可访问性阻断或对外表述失真；**P2** = 打磨项与加固建议。

### 3.1 P0 复核

#### P0-1 主窗口和弹窗主色（实机未复现）

- 在 Windows WebView2 `157.0.4341.60` 的 `1240×760` 视口，通过应用设置切换浅色和深色。验收使用 `9cb16cc` 的原生 Tauri 调试包，至 `main@95c6eb2` 仅增加了进度记录。
- 首页「开始预检」、提审材料包「复制材料包 Markdown」和拒因反查的主按钮在启用且未悬停时颜色一致。浅色背景 `#292928`、文字 `#ffffff`。深色背景 `#e4e3df`、文字 `#20201f`。
- 正式入口 `desktop/index.html:22` 的 `<body>` 本身就是 `.desktop-app[data-theme]`。`desktop/src/design-system.css:119-128` 在同一元素上覆盖旧的主色映射。三个弹窗进入顶层后，DOM 父节点仍是 `<body>`，`--accent`、`--accent-ink` 和 `--accent-soft` 都与首页一致。规则来源的「完成」按钮采用中性样式。
- 原生实测值和截图位于本机 `.omx/artifacts/desktop-accent-webview2/run-2026-11-18T17-05-21-002Z/before/`，数据见 `results.json`。

### 3.2 P1

#### P1-1 发布链路与候选分发

- **位置**：`package.json`、`desktop/package.json`、`desktop/src-tauri/Cargo.toml`、`desktop/src-tauri/tauri.conf.json`（四处均为 `0.2.0-rc.4`）；`.github/workflows/release.yml:8-9`（仅 `push tags: ["v*"]` 触发）
- **初评证据**：`git tag -l` 当时最远到 `v0.2.0-rc.3`。rc.1 至 rc.3 的 Release 均为草稿，公开版为 2026-07-02 的 `v0.1.0`。
- **影响**：代码领先公开发布物四个候选版本。任何「已发布」表述都不成立。
- **修复建议**：由维护者裁决是否发 rc.4 tag（**§3 关口：打 tag / 发布 Release 须明确批准**）。裁决前，文档与 CHANGELOG 统一用「候选版本」措辞——`CHANGELOG.md` 开头已经这么写了，需确保别处一致。
- **复验**：`git tag -l && gh release list` 与四处版本号对账。

2026-11-19，`main@b5093c5` 的 npm 包和 Windows NSIS 手动演练通过。维护者批准后推送了固定到该提交的 `v0.2.0-rc.4` 标签。打标工作流两次在 B3 拒权目录测试失败。该夹具原先把 `icacls` 的成功退出当作测试进程无法读取目录的证据。现在定向模拟 `readdirSync` 返回 EACCES，核对已读文件、跳过计数和报告提示，并将同一套 Node.js 测试加入手动 Windows 演练。rc.4 留作失败候选记录。 [演练](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/44579242924) [打标构建](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/44581911230)

#### P1-2 `precision 1.000` 的口径必须带分母

- **位置**：`scripts/coverage.mjs:9`（`BACKLOG_TOTAL = 72`）、`:33`（标注锚定统计）
- **证据**：见 §2.3。锚定 30/69，TP55/FP0/FN0。
- **影响**：把 1.000 当成「全库零误报」是对外过度声明，与 `GOVERNANCE.md` 诚实原则冲突。
- **修复建议**：对外表述同时写明测量日期、标注规模、规则锚定比例与 TP、FP、FN。按每次实测更新数字。标注台账的补齐列入功能 5 的伴随工作。
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
| P2-9 | 规则来源与提审材料包的控制器在加载期间丢弃关闭请求 | `desktop/src/shell/lazy-dialogs.ts` 的 `mountSourceFreshness`、`mountSubmissionMaterials` | 关闭时撤销加载期间已排队的全部打开请求 |

P2-9 在同一控制器上先调用 `open()`、再在动态导入完成前调用 `close()` 即可复现。旧实现的 `close()` 只尝试关闭已挂载实例，因此加载完成后仍会打开对话框。当前桌面入口由挂载后的对话框处理 Escape 和关闭按钮。按现有调用点，这项属于控制器加固。复验应覆盖两种对话框、关闭多个待执行请求，以及关闭后重新打开时的焦点归还。

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

本阶段已随 [PR #71](https://github.com/YEowo-Y/weapp-shipmate/pull/71) 合入。已更正分发、规则精度和类型检查口径，更新能力文档源码链接，并在 Ubuntu / Node.js 22 添加无阈值的代码覆盖率报告。

1. **收窄三处表述**：`precision` 带分母、「严格类型检查」限定范围、发布状态改为「候选」。（P1-2、P1-3、P1-1）
2. **补代码覆盖率报告**：CI 里只输出不设闸门，先建立基线。（P2-2）
3. 修 `docs/12` 的 8 处垫片链接。（P2-3）

判据：`docs/12`、`CHANGELOG.md`、`README.md` 中不再出现无分母的 precision 表述；CI 产出覆盖率摘要。

### 阶段 2：可见缺陷与交互加固（3–5 天）

4. **加固懒加载控制器的关闭语义**（P2-9）。[PR #68](https://github.com/YEowo-Y/weapp-shipmate/pull/68) 已修复，[PR #69](https://github.com/YEowo-Y/weapp-shipmate/pull/69) 记录了 Windows WebView2 验收。
5. **实机复核主色**（P0-1，已完成，见 §3.1）。
6. **隔离弹窗加载失败提示，锁定断点一致性和模型桥初始化**。四种弹窗的加载错误各自标明名称，并由独立提示显示（P2-1）。响应式回归测试对齐 CSS 和 `matchMedia` 的实际条件（P2-4）。模型桥在空槽中启动并写入运行时，启动错误按原有类型传播（P2-6）。

其余三项已合入，Windows WebView2 验证了五处分包故障及原入口恢复、四个断点临界宽度和焦点保护。四项仓库门禁通过。 [PR #72](https://github.com/YEowo-Y/weapp-shipmate/pull/72)

### 阶段 3：设计系统度量层（5–8 天）

7. 使用既有字号阶梯和 4px 间距网格迁移相同像素值的声明。沿用 §3.4 统计口径，生产 CSS 的字号变量覆盖为 332/545（60.9%，其中 325 处来自 `--ds-*`）。本阶段新增 216 处字号令牌引用，并迁移 54 处间距声明。
8. 生产样式中的 `--text`、`--bg`、`--font-ui`、`--ease` 分别只在 `design-system.css` 定义一次。三页旧预览继续通过各自的公共样式入口取得原值，复用样式中的字号令牌提供等值回退。

Windows WebView2 157.0.4341.60 中对比了首页、设置、提审材料包、解释和规则来源在两种主题与宽窄窗口下的 20 组计算样式。阅读字号 14、16、18 px 实测符合预期，三页旧预览另做 12 组浏览器复核。采样样式与改动前逐项一致。JavaScript 启动包为 725,350 字节，gzip 为 237,201 字节。

### 阶段 4：工程强度（择机）

9. React 运行时与 Base UI 分别使用显式 `manualChunks`。七个业务模块须留在入口的传递静态依赖之外，构建会指明被误拉入的模块路径。超限时输出完整的仓库内启动模块清单，产物同时记录各模块的 Rollup 渲染长度。实测入口 JavaScript 为 725,428 字节，gzip 为 237,239 字节，分别余 24,572 和 12,761 字节。
10. 共享 JS 按模块收紧。从 `scroll-fade.js` 开始，补齐 JSDoc 并启用 `@ts-check`，由现有严格配置检查。临时开启全局 `noImplicitAny` 复测，诊断从 939 降至 931 条（共享目录从 906 降至 898 条）。后续可继续逐文件收紧。

Windows WebView2 中确认右栏异步载入 React 与 Base UI 并能切换标签。窄窗右栏可用 Escape 退出并回焦。设置、提审材料包、拒因反查、规则来源打开时加载各自的分包。四个弹窗与首页的 20 组计算样式与阶段三一致。

### 不做的事

- 不删除历史分支、不改写历史（`docs/26` §2 禁令）。
- 不为了指标好看去改标注、阈值或判定（`AGENTS.md` 禁令）。
- 不扩大模型可调用的工具集、不改 `Permission` 结构（§3 关口）。

## 5. 这次评审没做什么

**没做的检查**：

- **初评阶段未实机运行桌面应用**。初评的 UI 结论来自静态读码与构建产物。P0-1 的专项实机复核见 §3.1。
- **没有跑 Rust 测试**（本机未装 `1.94.1` 工具链）。Rust 结论基于源码统计与 `clippy` 历史记录。
- **没有做真实的模型调用**。agent 运行时结论基于代码与 13 条现有测试，未实际连服务商验证工具选择质量。
- **没有审计 CI 工作流的安全性**（`actions` 按 SHA 固定等属于发布工程关口）。
- **没有逐条核对 64 条规则的官方原文**；这是 T04/`verify:quotes` 的职责，不是本评审的范围。

**中断过的部分，以及后来补到什么程度**（子代理因账户配额耗尽，三路各完成约五成后中断；§6 是主审在主线补做的结果）：

| 路 | 中断时未覆盖 | §6 补充后的状态 |
|---|---|---|
| 交互与可访问性 | 键盘焦点路径、抽屉与断点竞态、三态缺失清单 | **已覆盖主体**：四个对话框的焦点陷阱、关闭后焦点恢复、`inert` 切换、右栏三态组件逐一核对。仍未做实机验证 |
| agent 运行时 | 取消路径的 Rust 侧追踪、错误分类到文案的映射 | **已覆盖**：`cancel()` → `child.kill()` 闭环、11 个错误码的真实来源、tombstone 语义 |
| 安全 | Windows 路径特有形态、凭据生命周期 | **已覆盖**：8.3 / UNC / ADS / 保留名 / reparse point 逐项核对，凭据与诊断脱敏链路 |

仍不等于完整覆盖：**没有实机验证**这一条对上述三路同样成立。

**判断不了的项**：

- 包体积余量 25.5 kB 在功能 1/6/7 全部落地后是否够用——取决于按需分包执行得多严格。
- 设计系统改造的实际收益，需要一次真实的视觉验收（截图对比）才能确认。

## 6. 补充审查（主线补做，2026-11-18）

三路子代理中断后，由主审直接读码补齐。本节只记录**新查到的**事实与结论，不重复 §3。

### 6.1 交互与可访问性：整体成立，两处可加固

**正向证据（逐项核对）**

- **焦点陷阱**：四个对话框全部使用原生 `<dialog>.showModal()`（`explain-dialog.ts:38,79`、`repair-handoff.ts:126`、`source-freshness.ts:158`、`submission-materials-dialog.tsx:604`），因此浏览器自带焦点限制与 top-layer 语义。
- **手动 Tab 循环**（仅两个原生对话框需要）：`repair-handoff.ts:102-105`、`source-freshness.ts:152-155` 处理首尾焦点回环，并正确排除 `isComposing`、`ctrlKey/altKey/metaKey` 与已 `defaultPrevented` 的事件。`submission-materials-dialog.tsx` 没有手写循环，改用 `visible()` 判定（`:575-577`，同时检查 `isConnected`、`[hidden]/[inert]` 与 `getClientRects()`）配合完整的焦点回退链。
- **关闭后焦点恢复**：`repair-handoff.ts:100`、`source-freshness.ts:146`、`explain-dialog.ts:39,59` 在 `close` 时交还触发元素并检查 `isConnected`；`submission-materials-dialog.tsx` 的 `onDialogClose`（`:580-590`）更完整——当 `activeElement` 是 `body`、位于对话框内或不可见时，按 `trigger → 侧栏展开 → 面板开关` 的顺序找第一个可见元素，这正是抽屉布局下需要的回退。
- **`inert` 隔离**：`shell-layout.ts:55-57` 提供属性与 property 双写，覆盖不支持 property 的旧路径。
- **右栏三态**：`right-panel-states.tsx` 定义 `PanelSkeleton`（`role="status"` + `aria-busy`）、`PanelError`（`role="alert"`）、`PanelEmpty`；`right-panel-changes-devtools.tsx:14,16,20,33,86,88` 与 `right-panel-release-evidence.tsx:37,39,43,171,173,177` 逐个面板接入，无遗漏。

**可加固项（P2）**

| 项 | 位置 | 说明 |
|---|---|---|
| Tab 循环只拦首尾两点 | `repair-handoff.ts:103`、`source-freshness.ts:153` | 仅在焦点恰为 `dismiss`/`done` 时拦截。若对话框内出现动态增删的可聚焦元素，循环仍成立（因为始终是最外侧两点），但更稳妥的做法是基于 `querySelectorAll` 计算首末可聚焦元素 |
| `PanelEmpty` 的图标与动作 | `right-panel-states.tsx:67-73` | 当前 `data-empty-action` 由调用方传字符串，未见集中校验；若将来接入更多面板，需确认无空 `actionId` |

### 6.2 agent 运行时：取消闭环与错误分类均成立

**取消是真闭环**

- `tool_runner.rs:279-301`：`cancel()` 置 `active.cancelled = true`，并对 `active.child` 执行 `kill()` + `wait()`；第 300-301 行在另一条分支同样 kill/wait。
- `tool_runner.rs:173-175`：`Drop` 路径同样 `kill()` + `wait()`，不存在「父进程先退出、子进程遗留」的路径。
- `tool_runner.rs:410` 的注释与实现一致：spawn 与 shutdown 共用同一把锁，因此 shutdown 不会漏掉刚创建的子进程。
- `tool_runner.rs:127-150` 的 `commit()`：在持锁状态下校验 `token`/`id` 匹配、未取消、未关闭、`child.is_none()`，再执行持久化。**取消与写入被线性化**，不存在「取消后又写了一半」的窗口。

**错误码到真实来源的映射**

| 错误码 | 真实来源 | 位置 |
|---|---|---|
| `network_error` | 上游 fetch 抛出 | `agent-stream.mjs:75` |
| `auth_required` / `permission_denied` / `rate_limited` / `provider_unavailable` | 上游 HTTP 401 / 403 / 429 / 其它 | `agent-stream.mjs:77` |
| `canceled` | 用户取消 | `agent-tool-rpc.mjs:25` |
| `tool_timeout` | 本地工具超时定时器 | `agent-tool-rpc.mjs:26` |
| `busy` / `tool_failed` / `not_authorized` / `invalid_request` | Rust `ToolFailure` 变体，由 `code()` 映射 | `tool_runner.rs:24`（实现）、`error.rs:361-370`（钉住映射的测试） |
| 兜底 | `failure()` 的通用文案 | `agent-stream.mjs:13` |

**一处值得记录的语义细节**：`ToolFailure::Canceled` 在 Rust 层映射为 `DesktopError` 的 `conflict` 类（`error.rs:363`），但在 agent 层仍以 `canceled` 码回给前端。两层语义不同是有意为之——对 IPC 调用方是「状态冲突」，对 Agent 是「用户主动停止」。这不是缺陷，但若将来有人把两层合并，会破坏其中一个语义。

### 6.3 安全：Windows 路径防御完整，凭据链路干净

**路径校验（`project_context.rs:130-200`）逐项核对**

| 攻击形态 | 防御 | 位置 |
|---|---|---|
| UNC `\\server\share` | 显式拒绝 `\\` 与 `//` 前缀 | `:131-132` |
| 绝对路径越界 | `strip_prefix(root/plain_root/canonical_root)` 三选一，失败即拒 | `:152-159` |
| `..` 跳转 | 只接受 `Component::Normal` | `:166-168` |
| NTFS 数据流 `file.txt:stream` | 拒绝含 `:` 的分量 | `:171` |
| 尾部点/空格（Windows 会剥离） | 拒绝 `ends_with(['.', ' '])` | `:172` |
| 保留设备名 | 22 个（CON/PRN/AUX/NUL/COM1-9/LPT1-9），按 `split('.')` 首段大写比对 | `:175-183` |
| 符号链接 / reparse point | `linked()` 检查 `FILE_ATTRIBUTE_REPARSE_POINT (0x400)` | `:98-108` |
| 校验与读取之间的 junction 替换（TOCTOU） | `hold_directory()` 以 `share_mode(3)`（不共享 DELETE）+ `0x02200000`（`FILE_FLAG_BACKUP_SEMANTICS`）持有目录句柄，并逐级持有 | `:112-129`、`:164`、`:186` |
| 二进制/控制字符 | `validate_text()` 拒绝除 `\n\r\t` 外的控制字符 | `project_context.rs` 的 `validate_text` |
| 疑似密钥内容 | `validate_text()` 匹配 `-----begin`、`sk-`、`ghp_`、`github_pat_`、`xoxb-`、`xoxp-`、`aizasy`、`akia`、`bearer ` 等标记 | 同上 |

**这是本次评审中见到的最完整的一处防御**：它不仅挡住了常见形态，还用持有目录句柄的方式关闭了校验与读取之间的竞态窗口。绝大多数同类实现只做 canonicalize 后比较前缀，会在 junction 替换下失守。

**凭据与诊断**

- 凭据经 `keyring_core` + `windows_native_keyring_store` 存入 Windows 凭据库（`credential_store.rs:104-114`），不存在自有加密文件；`NoEntry` 被显式处理为 `Ok(None)`（`:135`、`:152`），不区分「不存在」与「读取失败」以外的状态。
- 诊断日志的头部注释即声明「Never records project file contents, credentials, tokens, SQL parameters, or panic payloads」（`diagnostics.rs:2`），并且 `:358` 明确「不检查也不序列化 `info.payload()`」；`:565-571` 有一条用 `SECRET_CANARY_TOKEN_998877_DO_NOT_LOG` 做哨兵的测试，验证 panic payload 不落盘。

**需要说明的边界（不是缺陷）**

- `sensitive()` 只匹配**文件名本身**（`project_context.rs:64-68` 只看 `name`），不检查路径中的父目录名。`noSend` 里包含 `node_modules`、`.git` 这类目录名，因此对**用户手动选择的单个文件**这一入口是充分的；但如果将来新增「扫描整个项目」的入口，需要把匹配扩展到路径的每个分量。当前 `read_file` 确实逐分量调用了 `sensitive(name)`（`:173`），所以**现状是完整的**——这条只是提醒后续扩展时别退化。

## 7. 主线收口复核（2026-11-19）

| 评审项 | 结果与证据 |
|---|---|
| P0-1 主色 | Windows WebView2 浅色和深色实测均一致。见 §3.1 与 [#70](https://github.com/YEowo-Y/weapp-shipmate/pull/70)。 |
| P1-1 发布 | `v0.2.0-rc.4` 固定到 `b5093c5`，记录当时的 Windows 目录权限夹具失败。修复后，候选 `317679f` 的完整演练与打标流程均通过，生成 `v0.2.0-rc.5` 草稿。下载复核 npm 包、MCPB、NSIS 安装器的 SHA-256，三件均与清单匹配。安装器签名状态为 `NotSigned`。 [#84](https://github.com/YEowo-Y/weapp-shipmate/pull/84) [#85](https://github.com/YEowo-Y/weapp-shipmate/pull/85) [rc.5 演练](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/44588849348) [草稿构建](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/44675972044) |
| P1-2 准确性口径 | 全库标注锚点为 30/71。原评审要求的标注配套已补齐，拥有正反例的自动检查规则从 12/30 增至 30/30。新增 HTTPS `localhost` 正例和 18 条反例后，16 个夹具共有 108 条标注，56 TP、52 TN、0 FP、0 FN。覆盖报告单列 41 条导航和人工核对规则。Windows CLI 在个人主体和未指定主体下验证新夹具，原有夹具的命中集合逐项一致。 [#83](https://github.com/YEowo-Y/weapp-shipmate/pull/83) · [当前能力台账](12-current-capabilities.md) |
| P1-3 共享类型 | 快照边界、会话工作区、消息渲染、传输、控制器、对话视图和拒因反查已纳入严格检查。已完成的批次覆盖上线清单导出、修复交接和提审材料包，三个共享模块的 46 条诊断清零。报告阅读复用交接校验后的条目类型，上线流程与材料包复用阶段确认记录类型。另一批覆盖模型连接客户端和桌面请求桥接，两个共享模块的 29 条诊断清零。连接客户端校验快照和授权响应，桥接在使用原生事件前检查字段类型。此前已处理阶段目录与上线准备清单导出，两个模块的 23 条诊断清零。工作台和右栏共用已保存快照类型，五种阶段状态均有对应的导出标签。此前已处理会话权限与聊天上下文，两个模块的 28 条诊断清零。发送路径复用现有授权与附件类型，旧附件的来源时间和版本可缺省。此前补齐通用图标、服务商图标、输入区与操作控件的类型，共享目录从 20 降至 0 条。38 个项目自有共享 JS 文件均由现有严格配置检查。随后补齐流程投影模块的输入校验和结果类型，工作台与右栏共用模块推导的阶段类型。根目录的 src/workflow.mjs 清零 32 条诊断，桌面全量严格检查通过，诊断为 0。desktop/tsconfig.json 已默认启用 noImplicitAny 和 useUnknownInCatchVariables，日常 typecheck 和 CI 均使用这项设置。Windows WebView2 的八项实机用例通过，记录见 `progress.txt`。 [PR #88](https://github.com/YEowo-Y/weapp-shipmate/pull/88) · [PR #89](https://github.com/YEowo-Y/weapp-shipmate/pull/89) · [PR #90](https://github.com/YEowo-Y/weapp-shipmate/pull/90) · [PR #91](https://github.com/YEowo-Y/weapp-shipmate/pull/91) · [PR #92](https://github.com/YEowo-Y/weapp-shipmate/pull/92) · [PR #94](https://github.com/YEowo-Y/weapp-shipmate/pull/94) · [PR #95](https://github.com/YEowo-Y/weapp-shipmate/pull/95) · [PR #96](https://github.com/YEowo-Y/weapp-shipmate/pull/96) · [PR #97](https://github.com/YEowo-Y/weapp-shipmate/pull/97) · [PR #98](https://github.com/YEowo-Y/weapp-shipmate/pull/98) · [PR #99](https://github.com/YEowo-Y/weapp-shipmate/pull/99) · [PR #100](https://github.com/YEowo-Y/weapp-shipmate/pull/100) · [PR #101](https://github.com/YEowo-Y/weapp-shipmate/pull/101) |
| P1-4 启动预算 | 当前生产 JavaScript 启动包 726,270 B / gzip 237,551 B，满足 750,000 B / 250,000 B 上限。将规则来源临时作为静态入口导入后，实际 Vite 构建拒绝并指名 `desktop/src/source-freshness.ts`。七个延迟模块的回归检查通过。 |
| P1-5 规则覆盖 | 已补拟人化互动类目资质与未成年人监护人同意两项人工自查。第二批通过 CLI、工作流、随包项目工具与 WebView2 宽窄窗口的验证。 [首批 #82](https://github.com/YEowo-Y/weapp-shipmate/pull/82) [第二批 #87](https://github.com/YEowo-Y/weapp-shipmate/pull/87) [实施交接](26-implementation-handoff.md#第二批--拟人化互动的监护人同意自查) |
| P2-1 弹窗失败提示 | 就近错误提示、原入口恢复与焦点已实测。 [#72](https://github.com/YEowo-Y/weapp-shipmate/pull/72) |
| P2-2 代码覆盖 | Ubuntu Node 22 CI 输出 V8 代码覆盖报告。 [#71](https://github.com/YEowo-Y/weapp-shipmate/pull/71) |
| P2-3 能力链接 | 能力台账改指正式实现。 [#71](https://github.com/YEowo-Y/weapp-shipmate/pull/71) |
| P2-4 响应断点 | CSS 与 `matchMedia` 断点由测试对账，并有四个临界宽度的实机记录。 [#72](https://github.com/YEowo-Y/weapp-shipmate/pull/72) |
| P2-5 设计度量 | 字号与间距迁移和双主题样式比对均已验收。本次字号变量覆盖 333/547（60.9%）。生产深色 `--surface-3` 由设计系统覆盖公共样式默认值。 [#73](https://github.com/YEowo-Y/weapp-shipmate/pull/73) |
| P2-6 模型桥 | 初次启动保留类型化错误路径，Rust 测试和 Clippy 已通过。 [#72](https://github.com/YEowo-Y/weapp-shipmate/pull/72) |
| P2-7 证据截图 | 4 张历史截图保留原件。新入库的评审和验收截图使用 WebP。 [贡献指南](../CONTRIBUTING.md) |
| P2-8 旧分支 | 本地 `codex/plan-checkpoint-source-review` 保留在 `4a3223c`。尚有 `19310bc` 与 `4a3223c` 两个独有文档提交，当前事项由 T04、T05、T07 的正式验收记录追溯。 |
| P2-9 关闭竞态 | 规则来源和提审材料包的待执行打开可被关闭撤销，重开及焦点归还已实测。 [#68](https://github.com/YEowo-Y/weapp-shipmate/pull/68) [#69](https://github.com/YEowo-Y/weapp-shipmate/pull/69) |

补审 §6.1 的焦点路径已在 Windows WebView2 157.0.4341.60、1240 px 与 780 px 复核。规则来源筛选有结果和无结果时，以及修复交接预览展开前后，均可用 Tab 和 Shift+Tab 在首尾循环。预览区能用键盘进入，Escape 归还焦点至原触发控件。右栏 `PanelEmpty` 的四处调用点均提供有效动作标识。实机取证见本机 `.omx/artifacts/readiness-closeout/run-20261119T174025Z/native-evidence.json`。

§6.1 的两项加固已落实。规则来源与修复交接共用 Tab 首尾计算，按当前可聚焦控件的顺序回环，弹窗内的其余按键交给浏览器处理。在 Windows WebView2 157.0.4341.60 的 1240 px 和 780 px 窗口中临时增删首尾控件，32 次 Tab／Shift+Tab 的焦点偏差由 18 次降为 0。规则来源筛选、交接预览及 Escape 归还焦点均已复核。`PanelEmpty` 用字面量联合类型登记现有五个动作标识，编译验证会拒绝空字符串与未登记的标识。修复前后实机记录见本机 `.omx/artifacts/review-dialog-focus/` 下 `before` 和 `after` 的 `native-evidence.json`。

## 8. Claude 前端快审收口（2026-11-22）

本节对照 Claude Code 会话中 2026-11-18 的前端快审原文和后续交接日志。编号沿用该次快审。生产就绪评审的严格类型配置已通过 [#102](https://github.com/YEowo-Y/weapp-shipmate/pull/102) 固化，日常检查和 CI 默认启用两个严格选项。交接中的模型端点隔离与 Windows tar 归因已随 [#66](https://github.com/YEowo-Y/weapp-shipmate/pull/66) 修复。

| 快审项 | 验收结果 |
|---|---|
| P1-1 设计令牌 | 共享 `app.css` 的 53 处固定色值清零，生产别名集中在 `design-system.css`，独立预览从自身入口加载原配色。Windows WebView2 157.0.4341.60 在浅深色、1240 px 与 780 px 的首页、设置、提审材料包、拒因反查及规则来源共 20 组采样，2,712 项计算值逐项一致。另用预览样式夹具核对 268 项计算值。本机证据见 `.omx/artifacts/claude-theme-aliases/comparison.json`。 [#70](https://github.com/YEowo-Y/weapp-shipmate/pull/70) · [#73](https://github.com/YEowo-Y/weapp-shipmate/pull/73) |
| P1-2 流式 Markdown | 同一帧合并绘制。三轮 12,217 B 回复的文本更新由每轮 216 次降到 12 次，实机记录到的主线程长任务从 2 次降到 0 次。 [#103](https://github.com/YEowo-Y/weapp-shipmate/pull/103) |
| P2-1 长会话 | 常规打开、翻页和搜索使用最多 80 条的渲染窗口。旧版备份的绝对坐标也按最多 80 条分批测量并换算为页内位置。Windows WebView2 157.0.4341.60 在 1240 px 与 780 px 验证五组 1,200 条合成会话，峰值均由 1,200 降为 80，可见消息及其像素位置一致。覆盖浅层、深层、超范围坐标、隐藏后恢复长草稿及保存的展开状态，切换和重载保留阅读位置。深处的旧坐标需要测量目标前的批次。实机记录见 `.omx/artifacts/legacy-conversation-restore/comparison.json`。 [#104](https://github.com/YEowo-Y/weapp-shipmate/pull/104) |
| P2-2 右栏草稿 | 草稿按项目订阅，延迟保存回执与对应项目快照一同呈现。跨项目和保存后恢复已实测。[#105](https://github.com/YEowo-Y/weapp-shipmate/pull/105) |
| P2-3 聊天输入区颜色 | 审计范围 26 处固定色值清零，浅色与深色共 40 项计算样式与基线一致。[#106](https://github.com/YEowo-Y/weapp-shipmate/pull/106) |
| P3-1 间距 | 四个样式文件的 252 个间距值改用等值令牌，30 组实机样本的计算样式和尺寸与基线一致。[#107](https://github.com/YEowo-Y/weapp-shipmate/pull/107) |
| P3-2 启动包预算 | 令牌收敛后的构建为 732,724 B，gzip 为 240,184 B。既有启动门禁继续校验体积和分包边界。 |

**工具卡片的实机补验。** Windows WebView2 157.0.4341.60 中复现执行中标签的文字消失。共享渐变的透明字形仍生效，桌面状态标签已用实色背景覆盖渐变。桌面样式现在用主题前景色绘制标签。新增回归先失败，实际字形颜色为 `rgba(0, 0, 0, 0)`，修复后浅色 1240 px 和深色 780 px 都与主题前景色一致。

使用本地 OpenAI Responses 协议替身和隔离项目，走实际 WebView2、Rust、broker 和 SQLite 链路。19 项原生检查通过，覆盖成功后打开本机报告、执行中转失败并保留焦点、取消后确认子进程退出、重启后逐项恢复卡片及报告 ID，以及导入历史的来源核验。失败与取消由隔离运行时中的受控子进程触发。实机截图和结果位于 `.omx/artifacts/desktop-model-native/run-2026-11-22T01-58-54-421Z/`。
