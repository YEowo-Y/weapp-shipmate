# Changelog

本项目变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。当前仓库发布候选版本为 `0.2.0-rc.3`，最新公开版为 `v0.1.0`；后续改动记录在 Unreleased，尚未发布到 npm registry。

## [Unreleased]

> 2026-07-17 规则内容实证核验（63 条规则 × 官方页面逐字比对，继以 16 组 claim-support 审计与三镜头对抗证伪）。
> 这是首次审「实质」而非「机制」：既有门禁只验 schema 合法、URL 存活、与标注语料一致，
> 从未验过引文是否真的逐字、以及引文是否真的支撑规则所作的断言。

### Added

- `npm run verify:quotes` 离线逐字门禁（已进 PR CI）：每条非 draft 规则的 `source_quote` 必须是其 `official_url` 归档快照的连续子串。这是 `GOVERNANCE.md` 来源核验准则 1 **第一次被代码执行**——此前该硬标准只写在文档里，因而漂移无声。执行的是其中一个**子集**：改写（含标点）、概括、翻译、词序调换、词句增删一律必红；**纯粹顺序的跨段焊接抓不到**（归一化删除空白而非折叠，段落边界在比较时不存在），该缺口由 `tests/source-quotes.test.mjs` 的 known-gap 测试如实钉住。留着它是因为提取阶段无法区分 `</li>` 与 `</p>`（都落成换行），而跨列表项的引用是正当的（`category.finance-hint` 本就横跨两个 li），收紧会立刻制造假红。归一化只折叠空白与零宽字符（容忍表格单元格/列表换行的渲染差异，实测 6 例；官网正文夹带 ZWSP，两侧须同等清洗否则复制粘贴即假红），不动标点与字词（标点差异正是要抓的对象）。`loadSnapshots` 同时校验 `index.json` 记录的 sha256，使手工篡改快照去迁就引文从"静默通过"变为"显眼的双文件 diff"；对 `method: "manual"` 的快照（社区来源无法自动抓取），报告单列一行提示其快照本身未经自动核验。
- `corpus/source-snapshots/`：11 个 `official_url` 的官方正文归档 + `npm run snapshot:sources` 刷新脚本。抓取（联网、会失败、会被限流）与判定（纯函数、确定性）分离，使门禁零网络、可进每个 PR 而不依赖微信站点可用性。`corpus/` 不在 `package.json files` 与 MCPB `INCLUDE` 内，不进用户分发物。
- rot 来源可达性判定 `classifyUrlHealth`：2xx 之外再看**落地 URL**——命中登录墙/错误页模式判 `inaccessible`，`origin+pathname` 与请求不符判 `moved`。

### Fixed

- **`review.function-matches-intro` 曾让用户删掉合规功能**（误报，high）：`reject.html` 3.1.1 整行为「小程序所实际提供的功能点，需与小程序的简介一致。示例：功能包括但不限于简介中提炼的功能点；」，旧引文恰在句号处截断，丢掉了后半句。原文确立的是**单向下界**（简介提炼的功能点须都实现），规则却据此写出「简介里没写的功能别上」这一原文明确容许其反面的**上界禁令**。现补全引文并把 `requires` 收回下界。
- **`login.after-experience` 对「体验范围特定」小程序误报 blocker**（误报，high）：官方页把小程序二分为「体验范围开放」与「体验范围特定」并给出方向相反的整改建议，规则引用的只是「开放」分支原文，却无条件适用。对学校/员工/社保卡信息系统等「特定」小程序，官方**明文允许**首页即要求授权（另需使用范围说明与取消登录按钮）。现把适用分支写进 `title`/`requires`，并如实说明「特定」分支的另一套要求。
- **`privacy.upp-required` 把插件的审核门槛套给了小程序**（越界，high）：「隐私说明须审核通过才可提交版本」出自该页「二、插件用户隐私保护说明填写」节；小程序节说的是平台默认拉取现网协议、有出入或为空「则在提审时会提醒开发者进行更新」，并无此前置。`why` 中「会导致接口不可用」的因果由 `PrivacyAuthorize.html` 建立、本页从未建立，一并移除。
- **两条 `source_quote` 系跨段拼接**（违反准则 1）：`domain.request-whitelist` 把 `network.html` 两个不同章节的句子逆序焊接并补入「；」；`privacy.getUserProfile` 把 `user-privacy/` 首段与 §1.2 拼接并压缩改写。两串在页面上均不连续存在。现各改引一句连续原文。
- **`content.no-illegal` 的引文末位标点被改写**（违反准则 1）：官方原文以全角冒号收尾（其后接 6.1.1~6.1.5 违规类型清单），引文写成句号。值得留档的是它为何能活到今天——该规则在 2026-07-16 批次一中被 LLM 代理判为「逐字核验 INTACT」并据此刷新 `last_verified`：代理做的是语义匹配（99% 像即判相同），不是字符匹配。这正是把「逐字」交给脚本而非人或代理判定的直接理由。
- **rot 对失效来源必然漏报**：旧实现 `redirect: "follow"` + 任意 2xx 判 `ok`。实测两例（现由负向控制钉住）：`login.*` 引用的社区页 302 → `/community/error/emergency?forceLogin=true` 强制登录错误页 → 200 → 判 `ok`，即**用户点开 `official_url` 读不到被引用的原文**；`payment.requires-merchant` 引用的支付文档 301 → 新规范地址 → 200 → 判 `ok`。加固后实跑 `--links` 另发现审计范围外的第三例：`flow:registration` / `flow:certification` 引用的社区文章同样落在 forceLogin 错误页。

### 已知未处置（记录在案，不在本轮范围）

- 另有 14 条 medium/low 规则 claim-support 缺陷与 9 条拒因映射缺陷经对抗复核存活，未在本轮修复。
- 三个 `official_url` 需人工决策：两个社区来源匿名不可达（且为 2020 年知识库贴、页面自带「可能已过期、失效」免责声明，而 `login.*` 标 `confidence: high`——按准则 3/4，社区精选属「准官方」而非 primary，该 confidence 是否成立待维护者裁定）；支付来源已搬家，是否跟随更新 `official_url` 待定。
- 拒因 alias 按双向子串匹配且中文不分词（`src/explain.mjs:28`），短 alias（如「广告」「未经授权」）易误命中，无最低分阈值。

## [0.2.0-rc.3] - 2026-07-17

> 2026-07-16 全仓审计批次一。`0.2.0-rc.2` 的 Draft Release 未发布且不含本节修复；本 RC 取代它作为当前候选，rc.2 的 tag 与 Draft 保持原样不动。

### Fixed

- 动态 URL 静默漏报走廊（2026-07-16 审计 A1 + 独立复审修正）：`url:` 为模板字面量插值（`` `https://${HOST}/...` ``）、引号字面量拼接（`"https://" + host`）、变量配置对象（`wx.request(cfg)`）、ES6 简写属性（`wx.request({ url })`）四种高频形态此前既不提取域名也不触发「可能漏报域名」注记；现四者均置 `dynamicRequest` 并出注记与规则级 `dynamic_note`，TS 泛型实参（`Taro.request<Res>(cfg)`）不再挡住判定。除模板插值外，动态判定改在字符串置空副本上运行——日志/报错文案里提及 `wx.request(cfg)` 不再误触全局注记。无插值模板字面量仍按静态 URL 正常提取 host。新增 `fixtures/dynamic-url` 夹具与 3 条标注（黄金基线 54→55 TP）；解构/下标/别名/展开（`{ ...cfg }`）等仍不可见的调用形态以显式断言钉为已知限制。
- `scripts/accuracy.mjs` 与 `scripts/coverage.mjs` 的通过判据加入 `FN === 0`：此前 54 个 hit 锚点全部漏报时 `precision` 按定义为 1，两脚本列完漏报清单后仍打 ✅ 退出 0。
- 三个 schema 的 `last_verified` 由正则 pattern 改为 `format: "date"`（校验真实日历日期）：`2026-02-30` 此前通过校验并被 V8 静默滚成 3 月 2 日再进入 rot 时效计算。
- rot 时效监控现把未来日期（超 1 天时区容差）判为 `invalid` 并按 stale 处理：此前 `last_verified` 年份手误会让规则被报「新鲜」一年以上，完全逃逸唯一为它设的监控。
- draft 门禁旁路上锁：`validate` 现拒绝非 draft 拒因引用 draft 规则——`explain` 以 `includeDrafts:true` 解析规则链接，此前「draft 门禁在 rejections 层把关」只是注释里的口头约定，规则一旦降级为 draft 而拒因仍引用，未核验内容会进默认输出且 CI 全绿。
- release 校验和清单改以扁平资产名生成（`.mcpb` 先复制到工作目录再计算）：此前清单内嵌 `build/` 路径前缀，而 GitHub 上传资产按 basename 拍平，下载者 `sha256sum -c SHA256SUMS.txt` 对 `.mcpb` 恒报 No such file——校验和是未签名包唯一的完整性通道。

### Added

- `.mcpb` 打包冒烟从「initialize + tools/list」升级为附加三次真实 `tools/call`（check/guide/explain），驱动 rules/flow/rejections 三份惰性加载数据的实际读取——0.1.0「打包漏 `rejections.yaml`」事故类缺陷不再能穿透冒烟；并新增结构锁测试断言打包 INCLUDE 清单 ⊇ `package.json` files。
- 10 条引用《平台运营规范》首页的规则完成官方原文实证抽查（2026-07-16）：source_quote 全部逐字仍在（含条款编号 3.9/3.11/4.2/5.13/5.20/5.35/6.1/12.6.4/15.3.5/15.3.9），`last_verified` 相应刷新。

### Changed

- CI 矩阵新增 Node 24（Active LTS；`engines: >=20` 声明的支持范围此前对 24 零覆盖），release 构建腿由已 EOL 的 Node 20（2026-04-30）升至 22，CI 的 mcpb 打包冒烟腿与 `.nvmrc` 同步 22。
- README 推荐安装路径由跟随 main HEAD 改为锚定发布候选 tag，恢复「安装物 = 过闸版本」的语义。

## [0.2.0-rc.2] - 2026-07-13

### Fixed

- tag 发布现在会在打包前运行 lint，并要求 `v<package.version>` 与 `package.json`、`manifest.json`、`package-lock.json` 顶层及根包版本完全一致；同一文件版本契约也由 `.mcpb` 构建复用。
- 扫描上限现在覆盖实际遇到的全部目录项（含目录、忽略文件和不可扫描扩展名），不再只在已读取源码文件增长时生效；超限继续通过既有 `truncated` 信号和报告注记显式告知。
- MCP JSON-RPC 边界现在区分无效请求（`-32600`）、未知方法（`-32601`）与未知工具/非法参数（`-32602`）；真正缺少 `id` 的通知保持无响应，显式 `id: null` 则按请求响应并原样回显。合法工具调用的执行失败仍使用 `result.isError: true`，且保留输入中的未知扩展字段以兼容客户端演进。
- `explain` 的 Markdown 查询回显会转义标题、标签、代码和双向控制字符等展示语法，避免不可信查询文本改变报告结构；JSON 输出仍保留原始查询，便于机器消费和精确追踪。
- 未指定主体的 `guide` 现在与 `check` 共用同一适用性边界，只返回覆盖全部主体的通用规则；不再把个人主体备案材料或 `web-view` 限制误报给主体未知的用户。
- `--blockers-only` 现在同时过滤普通条目与“可能适用”自查项，并让 check/guide/explain 的摘要和派生备注使用过滤后的 blocker 数；此前 JSON 仍会泄漏 warning/info 自查项及过滤前计数。
- MCP 面非法 `subject` 曾在个别路径伪装成清白报告；校验下沉到引擎层（`SUBJECT_ENUM` 唯一事实源），CLI/MCP 两侧行为对齐。
- 坏 `app.json`（解析失败/字段缺失）此前会反向触发误报 blocker；改为把配置解析错误信号化（`configErrors`），与真实规则命中区分，不再污染阻断计数。
- MCP 处理 `null`/畸形请求行崩溃问题修复；坏行按 JSON-RPC 2.0 回 `-32700`（`id:null`）+ stderr 诊断，不再击穿事件循环。
- 两类静默漏报：正则字面量与除号误判（一行式 JSX `<Icon type="a"/>` 曾被误判为正则导致后续解析错乱）、Taro 具名导入（`import { getLocation } from "@tarojs/taro"`）未归一到 `wx.*` 等价事实。
- 一行式 JSX 吞调用问题：紧凑写法的组件/调用在同一行时曾被扫描器漏检。
- symlink/junction 越界：`scanner.mjs` 的目录遍历此前会跟随符号链接读到所选目录之外的文件，现遇 `isSymbolicLink()` 即跳过（FX-12）。
- CLI 单横杠选项与多余位置参数静默：未知/拼写错误的选项与错误挂载的布尔开关值现报错退出而非静默忽略（FX-16 残余部分）。

### Added

- 夹具命中集钉板门禁（`corpus/fixture-pins.json` + `scripts/pin-fixtures.mjs` + `tests/fixture-pins.test.mjs`）：把标注未锚定规则的误报也纳入 CI 可见范围。
- 边界与性能测试（`tests/perf.test.mjs`，FX-10）：1000 文件 <3s 本机 / <8s CI、heap 增量 <200MB。
- MCP 单行缓冲上限（1,048,576 个 JavaScript UTF-16 code unit；ASCII 输入约 1 MiB）+ `-32700` 错误响应（FX-18）：超限行丢弃并 stderr 告警，避免无界增长。
- rot 监控扩至 97 个载体（63 规则 + 5 crosscheck + 8 flow + 21 rejections）。
- schema 死规则拦截：`scanner` 类型与所需字段绑定校验，防止声明了 scanner 类型但缺对应匹配字段的规则通过 CI。
- `release.yml` 发布流水线。
- CI 矩阵扩至 Windows + Node 多版本（`ci.yml` `matrix: os: [ubuntu-latest, windows-latest]`）。
- ESLint 门禁（`npm run lint`，`recommended` 级）纳入 CI 独立步骤。

### Changed

- Markdown 与 checklist 的已知阶段顺序和标题改为直接读取 `flow.yaml`；因此 `registration`/`certification` 标题分别统一为“注册小程序账号”和“主体认证 / 实名核验”，未知阶段仍在“其他”段兜底。
- `scanProject` 拆分为 `extractFacts` + `parseAppConfig`，圈复杂度从 ~20–24 降至各子函数 <10（FX-05）。
- `chooseLocation` 相关的双触发信号收敛，减少重复命中。
- 预览服务器（`desktop/design-previews/_serve.mjs`）仅绑定回环地址（`127.0.0.1`）并加路径遏制，拒绝越出项目根目录的请求。

## [0.1.0] - 2026-07-02

v0 代码骨架：从"文档先行"走到"可从源码运行的导航 + 代码感知预检"。发布前经 12 夹具准确性门禁（precision = recall = 1.0）与 11 个真实样本 dogfood 快检（0 误报 / 0 回归）验证。

**分发渠道**：本版经 GitHub 分发——`npm install -g github:YEowo-Y/weapp-shipmate`、Release 资产（`weapp-shipmate-0.1.0.tgz` 可直接 `npm i -g <url>` / `weapp-shipmate.mcpb` 供 Claude Desktop 双击安装）。npm registry 发布暂缓（注册受阻），不影响任何安装路径。

### Fixed — 预检可信度（真实使用前的信任修复）

- **五个扫描器 FP/FN 缺陷修复（2026-07-01 多智能体审计逐条端到端复现后确认）**：① 静态 `url: "..."`（冒号后带空格的主流写法）不再被正则回溯误判为动态拼接请求；② 明文 http / 动态 URL 判定可越过 `url` 前置的 `header:{...}` 嵌套对象（封装 request 工具的普遍写法，此前整体漏报）；③ 模板文件的 `<!-- -->` 注释先剥离——注释掉的 `<camera>`/`<web-view>`/手机号按钮/域名不再触发信号；④ 字符串文案里的 API 名（如日志中的 `"wx.getLocation"`）不再当真实调用（曾级联出 blocker 级误报）；⑤ `app.json`/`manifest.json` 尾逗号（JSONC 常态）容错解析——此前声明静默丢失、反向产出「未声明」blocker 误报。配 `fp-guards` 回归夹具锁定。
- **FX-06：非法 `--subject` 报错退出**（退出码 1 + 枚举提示），不再静默跳过主体专属规则产出伪清白报告；`SUBJECT_ENUM` 提取至 `data.mjs` 作 CLI/MCP 共享唯一事实源。
- **分发完整性**：npm 包 `files` 与 `.mcpb` INCLUDE 补 `rejections.yaml`（此前发布安装后 `explain` 必 ENOENT 崩溃）；`manifest.json` 版本同步 0.1.0 并补 `weapp_shipmate_explain` 工具条目。
- **`guide` 不再把"内容相关"规则当成确定阻断**：带 `signal` 的规则（医疗类目、UGC 内容过滤、虚拟支付、未成年人保护、诱导下载 App、电商类目等）其适用与否取决于小程序具体功能；导航看不到源码，故改为列入新增的「可能适用 · 请按业务自查」区（`runGuide` 返回 `selfCheck`），并**不计入概览的阻断/警告计数**。修复前一个无业务信号的 `guide` 会输出 12 项阻断（含医疗等假阳性），修复后仅保留 8 项普遍适用的提审/备案基线阻断，内容相关项完整保留在自查区、不静默丢弃。
- **扫描器剥离注释后再提取事实**：被注释掉的 `// wx.getLocation()` / 块注释里的调用不再触发隐私/域名预检命中。注释剥离为**字符串感知**（保留 `"https://x"` 内的 `//`，避免朴素剥离破坏域名提取而引入新错误）；`app.json` 仍按原文 JSON 解析。
- **请求域名归一化**：URL host 去掉 `user[:pass]@` 前缀与 `:port` 后缀并小写，使 `api.weixin.qq.com:8443`、`user@host` 等不再绕过 IP / 微信服务端 API 直连等**精确匹配的安全交叉核验**。
- **明文请求改为请求语境感知**（6 个真实 app 正确性 triage 暴露的首位假阳性）：`security.insecure-request` 原本对**任意** `http://`/`ws://` 字符串字面量都告警（`<image src>`、`<video>`、`coverImgUrl`、`plus.openURL`、mock 数据里的 `url` 字段都被误报"须改 https"）。微信只对 `request`/`connectSocket`/`uploadFile`/`downloadFile` 四个网络 API 强制 https/wss；故改为**仅匹配请求 API 调用里的 `url:` 参数**。修后全语料仅剩 1 条真命中（官方 demo 的一个 http `downloadFile`），其余假阳性全部消除，真命中无一丢失。
- **忽略非上线面目录**：`platforms`/`windows`（uni-app 的 App/H5 端代码，编译到微信不参与）、`scripts`/`test`/`tests`/`__tests__`/`__mocks__`/`e2e`（构建脚本与测试，不随包上传）——消除 App/H5 域名与构建脚本里的 kroki/iconify 等噪声。
- **uni-app 条件编译剔离**：在剥离注释前先处理 `#ifdef`/`#ifndef`/`#endif`，编译到微信时只保留微信/含微信/非平台（如 `#ifdef VUE3` 因无法判定版本而保留）的分支，剔除 `#ifdef H5`/`APP-PLUS`/`APP-NVUE`、`#ifndef MP-WEIXIN` 等非微信端分支——清掉散落在共享文件里、目录排除兜不住的最后一类 App/H5 残留。

### Added — uni-app / Taro 真实项目支持（dogfood 真实小程序暴露并修复）

> 首轮真实 dogfood（真实可上线的 uni-app 小程序 + 官方 `miniprogram-demo`/`hello-uniapp` + 真实 Taro 项目 `lsqy/taro-music`）暴露：工具原本只对**原生 wx 小程序**有效，对中国独立开发者主流的 **uni-app**（`uni.*` API、`manifest.json`、`.vue`、`unpackage/`）与 **Taro**（`Taro.*` API、`.tsx/.jsx`、`app.config.ts`）几乎全盘失效——真实项目上要么唯一命中是假阳性，要么 0 命中。已修：

- **`wx.X`/`uni.X`/`Taro.X` 三者等价匹配**（`apiMatches`）：uni-app/Taro 源码写 `uni.`/`Taro.getLocation`，编译到微信即 `wx.getLocation`；预检/交叉核验统一归一，否则对这两类框架全盘漏报。据此删除冗余的 `domain.uni-request`（由等价匹配覆盖，避免对每个请求双重命中）。
- **Taro 源码可见**：`.tsx`/`.jsx` 纳入扫描扩展名（Taro/React 页面与组件）；`Taro.*` 纳入 API 提取；从 `app.config.ts`（TS 模块、非 JSON）正则抽取 `requiredPrivateInfos`。真实 `taro-music` 从 0 命中变为正确扫到 66 文件、17 个 API、命中域名白名单规则。
- **mpx 源码可见**：`.mpx`（mpx 单文件，mpx 是「增强原生」、API 仍是 `wx.*`）连同 `.wpy`（wepy）、`.nvue`（uni-app 原生页）纳入扫描扩展名；mpx 的应用配置在 `app.mpx` 内嵌的 `<script type="application/json">` 块里（非独立 app.json），据此提取 `requiredPrivateInfos`。真实 `didi/mpx` 的 `mpx-cloud` 示例从 0 命中变为正确提取 `wx.*` 并命中相册隐私规则。
- **wepy 命名空间**：wepy 把 wx API 包成 promise 化的 `wepy.*`（网络/隐私调用常走它而非 `wx.*`）；将 `wepy` 纳入 API 命名空间与三方等价匹配（现 `wx`/`uni`/`Taro`/`wepy` 四者等价）。真实 `dyq086/wepy-mall` 从 0 命中变为正确命中 `domain.request-whitelist`（`wepy.request`）与 `privacy.getUserProfile`（`wepy.getUserInfo`）。覆盖至此含原生 wx / uni-app / Taro / mpvue / mpx / wepy 六大形态。
- **支付预检规则**（`payment.requires-merchant`，闭合 triage 首位假阴性）：调用 `wx.requestPayment`（经等价匹配亦覆盖 uni/Taro/wepy 变体）→ 命中"微信支付需商户准入资质、个人主体不支持"。来源为微信支付《小程序支付》产品介绍「准入条件」逐字原文（准入主体为个体工商户/企业/事业单位/政府机关/社会组织，个人主体不在其列）。在 native/uni-app/wepy 4 个真实用到支付的 app 上验证命中（此前零指引）。
- **模板级隐私入口检测**（闭合 triage 模板级假阴性）：JS 调用扫不到的隐私入口改从模板识别——`open-type="chooseAvatar"`（收集头像 PII）→ 用户信息隐私；`<camera>`（source_quote 已含 `<camera>` 原文）/`<live-pusher>` → 摄像头隐私；`<live-pusher>` → 麦克风隐私。均为给已核验隐私规则补**检测面**，不新增合规断言。真实私有样本 `day`（chooseAvatar）、`wechat-app-mall`（live-pusher）此前漏报的头像/相机/麦克风现已命中。
- **web-view 业务域名预检**（`domain.web-view-business`）：检测 `<web-view>` 组件 → 提醒其网页域名需在后台配置**业务域名**（与服务器域名是两套独立白名单）、且**个人类型小程序不支持 web-view**。来源为官方 web-view 组件文档逐字原文。语料 6 个真实 app 中 4 个用了 web-view（native/uni-app/mpvue/mall），此前零指引。
- **解析 `manifest.json` 的 `mp-weixin` 块**（uni-app 的隐私接口声明/权限所在，且常为 JSONC 带注释，复用 `stripComments` 解析）；与原生 `app.json` 统一为同一逻辑配置键。在官方 `hello-uniapp` 上据此正确报出"调用 `uni.getLocation` 但未声明 `requiredPrivateInfos`"的真实 61040 类阻断。
- **扫描忽略扩展**：构建/服务端/工具目录（uni-app `unpackage`、HBuilderX `_mp_devtools`、`cloudfunctions`、`output`/`tmp`/`releases`/`.omx` 等）、lock 文件（`*-lock.json`）、`*.d.ts` 类型声明——否则框架运行时 API、依赖募捐域名、类型定义会污染结果。
- **请求 host 校验**：拒模板字面量 `${host}` 等非法 host；排除 `www.w3.org` 等 XML/SVG 命名空间（内联 SVG 的 `xmlns` 不是请求域名，曾假报明文请求）。

### Added — 规则数据（"规则即数据"脊柱）

- 规则 schema（`schemas/rules.schema.json`、`schemas/flow.schema.json`）与 `flow.yaml` 上线流程决策树骨架。
- **63 条种子规则全部已核验官方来源、默认输出**（隐私 23 / 类目 8 / 提审 7 / 登录 5 / 域名 4 / 备案 4 / 内容安全 3 / 数据 3 / 支付 2 / 导流 2 / 未成年 1 / 资质 1），暂无 `draft`；`draft` 门禁机制保留，供未来无法核验逐字来源的规则使用。
- 隐私预检**完整覆盖**官方《用户隐私保护指引内容介绍》信息类型表 **21 个接口族**，源码扫到对应 `wx.*` 即命中（剪贴板/麦克风/摄像头/相册/照片视频/位置/地址/发票/蓝牙/通讯录/日历/文件/车牌/运动步数/四类传感器等）。
- 数据校验门禁（`scripts/validate.mjs`：ajv schema 校验 + `flow.yaml` 图 linter + 跨文件 stage 一致性）。
- **声明↔调用一致性核验**（`src/crosscheck.mjs`）：复用扫描结果做代码↔配置交叉核验，纯规则匹配做不到。当前四项：① 调用 8 个地理位置接口但 `app.json` 的 `requiredPrivateInfos` 未声明 → blocker（精确命中官方 61040 拒因），列出缺声明的具体接口；② 前端直连 `api.weixin.qq.com` 等微信服务端 API → blocker（AppSecret/access_token 泄露风险，该域名亦无法配进白名单）；③ 源码硬编码 AppSecret/商户密钥 → blocker（只报"文件 + 键名"，绝不回显密钥值，符合 SECURITY.md）；④ 明文 `http`/`ws` 请求 → warning（小程序只支持 `https`/`wss`，列出需改协议的域名）；⑤ 请求域名为 IP/localhost → warning（服务器域名白名单不支持，官方"局域网 IP 除外"已豁免私有网段）。`crossChecks()` 留有扩展点。

### Added — 拒因反查（"规则即数据"的第四个渲染器）

- **拒因反查 `explain <审核反馈|关键词>`**（`rejections.yaml` 21 条 + `src/explain.mjs`）：把用户实际看到的拒审信号（审核反馈文案 / 关键词）反向索引到 `rules/*.yaml` 中**已逐字核验**的规则，输出对应规则的 why / 修复步骤 / 官方原文链接。**不新增未核验断言**——修复步骤与来源全部来自被链接规则。覆盖诱导/营销/测试版/测试号/功能简介/类目可达/登录/头像昵称/隐私指引/推荐他人/UGC/资质/备案/域名白名单/未成年/虚拟支付/电商类目/数据收集/剪贴板/相机相册/麦克风。
- 中文按子串双向匹配（贴整段反馈或敲单个关键词皆可命中）；错误码键位（`codes`）保留但暂空——如 `61040` 在官方 `app.html` 查无明文，宁缺毋造，待官方错误码表可逐字核验再补。
- 引用完整性门禁：`rejections.schema.json` 强制每条 `rules≥1`，`validate.mjs` 强制每个被引用的规则 id 真实存在——拒因库永不指向幽灵规则。

### Added — CLI 与渲染

- CLI 内核：`check`（扫源码 → 个性化预检清单）、`guide`（上线流程导航）、`explain`（拒因反查）。
- 输出格式：Markdown（默认）/ `--json` / `--checklist`（可勾选待办清单，便于粘进任务跟踪）。
- 过滤与开关：`--blockers-only`（只看阻断项）、`--include-drafts`、`--subject` 及 guide 输入开关。
- 报告渲染：严重度概览行（🔴 阻断 · 🟠 警告 · 🟡 提示）+ 阶段内按严重度排序；JSON 输出顺序保持稳定（展示与数据契约解耦）。

### Added — 集成与分发

- 极简依赖 MCP server（stdio JSON-RPC 2.0；仅 1 个纯解析依赖 js-yaml），暴露 `weapp_shipmate_check`、`weapp_shipmate_guide`、`weapp_shipmate_explain`（拒因反查），可挂入 Claude Code / Claude Desktop / Codex。
- `.mcpb` Desktop 扩展打包（`npm run build:mcpb`）：暂存纯生产副本 + 冒烟自检 + 官方 `mcpb pack`，manifest 通过官方 v0.4 schema 校验；可选签名（受信证书 / 自签名 TOFU）。

### Added — 质量基建

- 规则腐烂监控（`npm run rot`）：`last_verified` 时效检查 + `official_url` 链接体检；每月定时 GitHub workflow 告警。
- **准确性工程地基**（docs/08 §4.2 / FX-11）：`corpus/labels.json` 人工核验三态标注（81 条，12 夹具）+ `scripts/accuracy.mjs`（per-rule/全局 precision·recall，precision<0.95 或任一误报即退出 1）+ `tests/accuracy.test.mjs` 黄金快照（51 TP / 0 FP / 0 FN，漂移即 RED）+ `scripts/coverage.mjs` 覆盖红线三数与标注锚定显性化（30/68 规则有锚点）。
- 测试套件（`node:test`，111 例：check / guide / explain / scanner / cli / mcp / rot / report / crosscheck / accuracy / e2e / smoke）+ 样例夹具（`edge-cases`、`uni-app`、`taro-app`、`mpx-app`、`wepy-app`、`template-signals`：chooseAvatar/相机/直播/web-view、`uni-cond`：#ifdef 条件编译、`recall-apis`、`web-view-personal`、`missing-privacy-decl`：缺声明 blocker、`sensor-apis`：14 传感器/设备隐私 API、`fp-guards`：常见写法误报卫兵）；GitHub CI（含 `.mcpb` 打包冒烟）。

### Added — 治理与文档

- `GOVERNANCE.md`：不可逾越的公益承诺 + **来源核验准则**（逐字短摘录、绝不杜撰、来源等级、confidence 判定、推断与原文分界）。
- `docs/01`–`docs/07`（调研 / 定位 / 决策架构 / 路线图 / 可行性 / 质量验收 / 自建桌面 agent 技术调研）；决策 #8 定下产品终态 = 自建桌面 agent（用户自带 LLM key、内置终端可开 Claude Code / Codex）。

### Security

- 预检默认 local-only：不上传源码、不采集密钥；扫描仅输出 API/域名/配置键与规则 ID，不回显敏感值（见 `SECURITY.md`）。
- MCP 适配层不新增远程上传能力。
