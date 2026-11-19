# Changelog

本项目变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。当前仓库发布候选版本为 `0.2.0-rc.5`，最新公开版为 `v0.1.0`；后续改动记录在 Unreleased，尚未发布到 npm registry。

## [Unreleased]

## [0.2.0-rc.5] - 2026-11-19

### Bug Fixes

* **coverage:** disclose rule and label denominators ([56fbfd4](https://github.com/YEowo-Y/weapp-shipmate/commit/56fbfd425c74870acc3394bf830d05776f6a2d51))

## [0.2.0-rc.4] - 2026-11-15

> 2026-07-17 规则内容实证核验（63 条规则 × 官方页面逐字比对，继以 16 组 claim-support 审计与三镜头对抗证伪）。
> 这是首次审「实质」而非「机制」：既有门禁只验 schema 合法、URL 存活、与标注语料一致，
> 从未验过引文是否真的逐字、以及引文是否真的支撑规则所作的断言。

### Added

- `npm run verify:quotes` 离线逐字门禁（已进 PR CI）：每条非 draft 规则的 `source_quote` 必须是其 `official_url` 归档快照的连续子串。这是 `GOVERNANCE.md` 来源核验准则 1 **第一次被代码执行**——此前该硬标准只写在文档里，因而漂移无声。执行的是其中一个**子集**：改写（含标点）、概括、翻译、词序调换、词句增删一律必红；**纯粹顺序的跨段焊接抓不到**（归一化删除空白而非折叠，段落边界在比较时不存在），该缺口由 `tests/source-quotes.test.mjs` 的 known-gap 测试如实钉住。留着它是因为提取阶段无法区分 `</li>` 与 `</p>`（都落成换行），而跨列表项的引用是正当的（`category.finance-hint` 本就横跨两个 li），收紧会立刻制造假红。归一化只折叠空白与零宽字符（容忍表格单元格/列表换行的渲染差异，实测 6 例；官网正文夹带 ZWSP，两侧须同等清洗否则复制粘贴即假红），不动标点与字词（标点差异正是要抓的对象）。`loadSnapshots` 同时校验 `index.json` 记录的 sha256，使手工篡改快照去迁就引文从"静默通过"变为"显眼的双文件 diff"；对 `method: "manual"` 的快照（社区来源无法自动抓取），报告单列一行提示其快照本身未经自动核验。
- `corpus/source-snapshots/`：11 个 `official_url` 的官方正文归档 + `npm run snapshot:sources` 刷新脚本。抓取（联网、会失败、会被限流）与判定（纯函数、确定性）分离，使门禁零网络、可进每个 PR 而不依赖微信站点可用性。`corpus/` 不在 `package.json files` 与 MCPB `INCLUDE` 内，不进用户分发物。
- rot 来源可达性判定 `classifyUrlHealth`：2xx 之外再看**落地 URL**——命中登录墙/错误页模式判 `inaccessible`，`origin+pathname` 与请求不符判 `moved`。

### Fixed

- 桌面安装器与随包 CLI 统一显示 `0.2.0-rc.4`。Windows 候选包使用 NSIS。发布校验覆盖根目录、桌面 npm、Tauri 与 Cargo 的版本字段。

- **`review.function-matches-intro` 曾让用户删掉合规功能**（误报，high）：`reject.html` 3.1.1 整行为「小程序所实际提供的功能点，需与小程序的简介一致。示例：功能包括但不限于简介中提炼的功能点；」，旧引文恰在句号处截断，丢掉了后半句。原文确立的是**单向下界**（简介提炼的功能点须都实现），规则却据此写出「简介里没写的功能别上」这一原文明确容许其反面的**上界禁令**。现补全引文并把 `requires` 收回下界。
- **`login.after-experience` 对「体验范围特定」小程序误报 blocker**（误报，high）：官方页把小程序二分为「体验范围开放」与「体验范围特定」并给出方向相反的整改建议，规则引用的只是「开放」分支原文，却无条件适用。对学校/员工/社保卡信息系统等「特定」小程序，官方**明文允许**首页即要求授权（另需使用范围说明与取消登录按钮）。现把适用分支写进 `title`/`requires`，并如实说明「特定」分支的另一套要求。
- **`privacy.upp-required` 把插件的审核门槛套给了小程序**（越界，high）：「隐私说明须审核通过才可提交版本」出自该页「二、插件用户隐私保护说明填写」节；小程序节说的是平台默认拉取现网协议、有出入或为空「则在提审时会提醒开发者进行更新」，并无此前置。`why` 中「会导致接口不可用」的因果由 `PrivacyAuthorize.html` 建立、本页从未建立，一并移除。
- **两条 `source_quote` 系跨段拼接**（违反准则 1）：`domain.request-whitelist` 把 `network.html` 两个不同章节的句子逆序焊接并补入「；」；`privacy.getUserProfile` 把 `user-privacy/` 首段与 §1.2 拼接并压缩改写。两串在页面上均不连续存在。现各改引一句连续原文。
- **`content.no-illegal` 的引文末位标点被改写**（违反准则 1）：官方原文以全角冒号收尾（其后接 6.1.1~6.1.5 违规类型清单），引文写成句号。值得留档的是它为何能活到今天——该规则在 2026-07-16 批次一中被 LLM 代理判为「逐字核验 INTACT」并据此刷新 `last_verified`：代理做的是语义匹配（99% 像即判相同），不是字符匹配。这正是把「逐字」交给脚本而非人或代理判定的直接理由。
- **rot 对失效来源必然漏报**：旧实现 `redirect: "follow"` + 任意 2xx 判 `ok`。实测两例（现由负向控制钉住）：`login.*` 引用的社区页 302 → `/community/error/emergency?forceLogin=true` 强制登录错误页 → 200 → 判 `ok`，即**用户点开 `official_url` 读不到被引用的原文**；`payment.requires-merchant` 引用的支付文档 301 → 新规范地址 → 200 → 判 `ok`。加固后实跑 `--links` 另发现审计范围外的第三例：`flow:registration` / `flow:certification` 引用的社区文章同样落在 forceLogin 错误页。

### Changed

- 明确手动聊天附件与工具权限分别授权，源码默认留在本机。规划中的例外包括 agent 文件分享、经开发者工具预览或上传体验版的边界。新增[安全设计与验收条件](docs/security/agent-mode-and-trial-upload-design.md)；仅修订文档，未启用这些功能。

- 依赖维护升级（2026-07-26，三个存量 Dependabot PR，均非安全告警）：`eslint` 10.6.0→10.8.0（仅开发链）。其 PR 绿勾早于上轮 lockfile 安全升级、base 已移动，「PR 绿 + main 绿」不等于「合并结果绿」——故合并前在隔离 worktree 实跑「最新 main + 该 PR」合并结果的五道门禁（lint / test 236 全过 / verify:quotes / coverage / mcpb 冒烟）全绿后才落锁。`actions/checkout` 与 `actions/setup-node` 均 4→7（ci / release / rule-rot 三个 workflow）：两者在 workflow 中系相邻行，三方合并互相冲突，后者经 Dependabot rebase 后合并，rebase 后的六腿 CI 已实测两个 @v7 的**组合**。留档：`release.yml` 与 `rule-rot.yml` 里的 @v7 要到下次打 tag / 定时触发才首次真实执行，validate 六腿验过的是同版本 action 而非该两处调用点。

### Security

- 依赖安全升级（2026-07-26，三条均为 lockfile 内 semver 兼容提升，`npm audit` 归零）：`fast-uri` 3.1.2→3.1.4（ajv 传递依赖，两条 high：反斜杠 authority 定界符、IDN 规范化失败两种 host confusion）；`js-yaml` 4.2.0→4.3.0（high：merge-key 链可致二次方 CPU——它是 rules/flow/rejections 三份 YAML 的运行时解析器，故四道门禁在新版下复验全绿后才落锁）；`brace-expansion` 5.0.7→5.0.8（high：无界展开致 OOM，eslint 传递依赖、仅开发链）。
- `postcss` 8.5.15→8.5.23（desktop 原型 lockfile，high：sourceMappingURL 路径穿越致任意 .map 文件泄露，修复版 8.5.18；vite 传递依赖、仅构建链。该告警系 PR #9 合并触发 Dependabot 重扫时新发通告。升级后 desktop `npm audit` 归零、`tsc && vite build` 通过）。
- **glib 告警（desktop 原型 Cargo.lock，medium）不动，理由记录在案**：修复版 0.20.0 与 tauri 2.11.3 要求的 gtk-rs 0.18 栈（atk/gtk/gdk/cairo-rs/webkit2gtk）semver 不兼容，`cargo update -p glib` 实测「Locking 0 packages」（0.18.5 已是约束内最新）；该栈仅在 Linux 目标编译，且 `desktop/` 不在 `package.json` files 与 MCPB INCLUDE 内、不进分发物。待 tauri 上游迁移 gtk 0.20+ 后跟随升级。

### 已知未处置（记录在案，不在本轮范围）

- 另有 14 条 medium/low 规则 claim-support 缺陷与 9 条拒因映射缺陷经对抗复核存活，未在本轮修复。
- 三个 `official_url` 需人工决策：两个社区来源匿名不可达（且为 2020 年知识库贴、页面自带「可能已过期、失效」免责声明，而 `login.*` 标 `confidence: high`——按准则 3/4，社区精选属「准官方」而非 primary，该 confidence 是否成立待维护者裁定）；支付来源已搬家，是否跟随更新 `official_url` 待定。
- 拒因 alias 按双向子串匹配且中文不分词（`src/explain.mjs:28`），短 alias（如「广告」「未经授权」）易误命中，无最低分阈值。

### Features

* add checklist export to launch progress ([dbb305e](https://github.com/YEowo-Y/weapp-shipmate/commit/dbb305ea6f67fd062860602509fc85186086e9ae))
* add contextual conversation rename and archive menus ([26c481a](https://github.com/YEowo-Y/weapp-shipmate/commit/26c481a92d7500383df784f883313357c069870e))
* **chat:** support configurable send keys and live hints ([19d03ae](https://github.com/YEowo-Y/weapp-shipmate/commit/19d03aeec2893bb9bca33f16000d377dee22fa12))
* **data:** add a labelled backup file chooser ([7e43cac](https://github.com/YEowo-Y/weapp-shipmate/commit/7e43cac245978e88b5c92ccb55deabb78a007745))
* **data:** share backup transactions with an embedded panel ([89e78b7](https://github.com/YEowo-Y/weapp-shipmate/commit/89e78b7b29655e6d7f6c90e33dd7488af4bad50a))
* **desktop:** add current conversation find menu entry ([54ec9f7](https://github.com/YEowo-Y/weapp-shipmate/commit/54ec9f7c74e0e8359f64629d69d8e0b9ec1295a5))
* **desktop:** add explicit-play tutorial viewer with text steps ([50efea3](https://github.com/YEowo-Y/weapp-shipmate/commit/50efea311fd93f321fa280447351c1a222c73d35))
* **desktop:** add folder navigation and grouped action menu ([5774ecf](https://github.com/YEowo-Y/weapp-shipmate/commit/5774ecfa3a41b617c9678acf40e4e5f6e07b788e))
* **desktop:** allow citation checks in the main window ([6563a79](https://github.com/YEowo-Y/weapp-shipmate/commit/6563a79f3353c2122b5dc8fcdb53c975ba862e43))
* **desktop:** allow reading the application version ([e013584](https://github.com/YEowo-Y/weapp-shipmate/commit/e013584b31bfab8f5757cf59403956b814928ac4))
* **desktop:** assemble model project and data settings ([356891f](https://github.com/YEowo-Y/weapp-shipmate/commit/356891f26869883dc1b5b34cbee3994979842496))
* **desktop:** bind application navigation shortcuts ([ef4ae38](https://github.com/YEowo-Y/weapp-shipmate/commit/ef4ae3899293c549d4ec1bdeb5950acc657ccecc))
* **desktop:** bind scoped current conversation find shortcut ([dc80ca9](https://github.com/YEowo-Y/weapp-shipmate/commit/dc80ca9695e737a2302671f2bd4606109a2b1e05))
* **desktop:** connect current conversation find actions ([54f1a1c](https://github.com/YEowo-Y/weapp-shipmate/commit/54f1a1c6745295ddb2bbffe30ddf9e363c60cec6))
* **desktop:** connect rail destinations and retain the reminder shortcut ([b4e52b1](https://github.com/YEowo-Y/weapp-shipmate/commit/b4e52b1ca2c180993e0e8d3565b8ba94773b20ab))
* **desktop:** connect report citations to native verification ([582a46b](https://github.com/YEowo-Y/weapp-shipmate/commit/582a46bb2e0becc06d33435aa22897dc9e1b8c89))
* **desktop:** connect report return to repair history ([cade7db](https://github.com/YEowo-Y/weapp-shipmate/commit/cade7db2af7e306e73abd5a18f9c370032fab960))
* **desktop:** connect settings panels permissions and shortcuts ([b577cd1](https://github.com/YEowo-Y/weapp-shipmate/commit/b577cd126063a1763e79fb982da216713510983b))
* **desktop:** connect tutorial viewer lifecycle and navigation ([1854353](https://github.com/YEowo-Y/weapp-shipmate/commit/1854353b75d91bb01d1c6c813f95b93a34f56894))
* **desktop:** derive searchable text from rendered Markdown ([c0e639f](https://github.com/YEowo-Y/weapp-shipmate/commit/c0e639f0555ccc5d24aec88f728ce7e0af78db2c))
* **desktop:** display the Shipmate mark and favicon ([9b13ecc](https://github.com/YEowo-Y/weapp-shipmate/commit/9b13ecce4b162d7c92c63e6e91f30273b8fa87dc))
* **desktop:** expose operation tutorials in the action menu ([0d13921](https://github.com/YEowo-Y/weapp-shipmate/commit/0d1392100d54300a10a7073583ca6fd84c7f05db))
* **desktop:** filter report findings and their outline by priority ([6a7f461](https://github.com/YEowo-Y/weapp-shipmate/commit/6a7f461fbf74e000b52bbc79ab321766131627af))
* **desktop:** find messages within the current conversation ([95955a5](https://github.com/YEowo-Y/weapp-shipmate/commit/95955a5da8f67e36b740e766e415d11964789360))
* **desktop:** host guarded nonmodal workspace pages ([ea04cb6](https://github.com/YEowo-Y/weapp-shipmate/commit/ea04cb6e5f738f773a9a63c2560ce9c2ce0600fb))
* **desktop:** integrate work pages and guarded chat navigation ([db7224d](https://github.com/YEowo-Y/weapp-shipmate/commit/db7224d0961ceb55bae5785ec6a52eec28418504))
* **desktop:** lead the sidebar with the current project ([a3a198e](https://github.com/YEowo-Y/weapp-shipmate/commit/a3a198ebdf409e98b1f11e7a1aa8b86046e4a732))
* **desktop:** navigate from repair history to linked report ([100c373](https://github.com/YEowo-Y/weapp-shipmate/commit/100c3735be82309074786a418a15fa389ce21573))
* **desktop:** open regenerated workflow guides in report reader ([367cc82](https://github.com/YEowo-Y/weapp-shipmate/commit/367cc825c26fa29b720d9c5ea74cdea30acd27ac))
* **desktop:** organize main destinations in a left icon rail ([9a2700d](https://github.com/YEowo-Y/weapp-shipmate/commit/9a2700db8cfa7e24e9affb49020f5d18b9004d05))
* **desktop:** organize project workbench navigation ([a9f650e](https://github.com/YEowo-Y/weapp-shipmate/commit/a9f650e993b76e600411b68388dda18547ab8c90))
* **desktop:** register report citation commands ([132866b](https://github.com/YEowo-Y/weapp-shipmate/commit/132866be68ac3d2f388448ec6d97b3405fe7e37d))
* **desktop:** route header renaming through the session controller ([a2e000c](https://github.com/YEowo-Y/weapp-shipmate/commit/a2e000ce3d6014817d3e3b0cc9af6565297b25ad))
* **desktop:** route report fact actions to project preparation ([bc1cc1d](https://github.com/YEowo-Y/weapp-shipmate/commit/bc1cc1d471d7ea3a02dce8185de54ba414c5eaa9))
* **desktop:** run preflight directly from the active project home ([a38b48e](https://github.com/YEowo-Y/weapp-shipmate/commit/a38b48e496c6677b99d4c3edbf39eb3e06614101))
* **desktop:** wire citation status updates to the report reader ([b43a10d](https://github.com/YEowo-Y/weapp-shipmate/commit/b43a10d17711ef945c066073cdce69cda10a67af))
* display confidence in rejection evidence ([949713e](https://github.com/YEowo-Y/weapp-shipmate/commit/949713e3799f4345a0aa068173e5852e291e4410))
* download the active saved workflow snapshot ([6dd8ff5](https://github.com/YEowo-Y/weapp-shipmate/commit/6dd8ff5442011e41fbac894b23cec5aaa5cf882a))
* explain rule confidence in rendered reports ([8a0264c](https://github.com/YEowo-Y/weapp-shipmate/commit/8a0264c1caea4fa3173c177e6a5cd1bdf80adc67))
* **handoff:** copy Markdown with guarded clipboard feedback ([273c910](https://github.com/YEowo-Y/weapp-shipmate/commit/273c9102350aeb8d0aee728f4d4e5e0dd7b09005))
* **health:** separate project settings and run history actions ([f235bb0](https://github.com/YEowo-Y/weapp-shipmate/commit/f235bb07b6967b4a5ded1d8c9186a7e5bf95e371))
* **history:** highlight literal matches in titles and message previews ([bfcdc91](https://github.com/YEowo-Y/weapp-shipmate/commit/bfcdc913cb2cf136d0a0472ee1e58241fd0b3f6d))
* include confidence and provenance in guide exports ([95bb1a6](https://github.com/YEowo-Y/weapp-shipmate/commit/95bb1a601b3566a1d8d13ed886acf1302d81f40d))
* **maintenance:** expose check time and unread reminder filtering ([2f51d5a](https://github.com/YEowo-Y/weapp-shipmate/commit/2f51d5a391b2b9e48005a56cfc24d7aff2bf1b76))
* **memory:** add local search with clear and match feedback ([068af8c](https://github.com/YEowo-Y/weapp-shipmate/commit/068af8c165731912feae70d3a9a304120933627d))
* **models:** embed connection controls in settings ([45c02c7](https://github.com/YEowo-Y/weapp-shipmate/commit/45c02c7f5fd980e9550d4782a945a0a36c5a60fd))
* **models:** filter providers by name and identifier ([672b395](https://github.com/YEowo-Y/weapp-shipmate/commit/672b3951e65fbd460d2c29be1152865a31af3821))
* **motion:** animate tutorial steps and native screenshots ([b237041](https://github.com/YEowo-Y/weapp-shipmate/commit/b237041c835089ce7661d2f4279e2ada961f5d3a))
* **motion:** register three tutorial compositions ([81c09b4](https://github.com/YEowo-Y/weapp-shipmate/commit/81c09b4046724d86030b359f74e56c019f014d47))
* **motion:** script three in-app operation tutorials ([e3bad58](https://github.com/YEowo-Y/weapp-shipmate/commit/e3bad58077b172db4c4e9ef8a8823aebbd3e1d79))
* **notifications:** clarify status and link project reminders ([9deabbe](https://github.com/YEowo-Y/weapp-shipmate/commit/9deabbe5586cea2f0542ac99455d2666aad5393b))
* preserve rule confidence in report items ([a4a3cd0](https://github.com/YEowo-Y/weapp-shipmate/commit/a4a3cd07eee5c25f2ae5d02402855b8183b71ecb))
* **privacy:** define shared read and send exclusion patterns ([e489ca8](https://github.com/YEowo-Y/weapp-shipmate/commit/e489ca8f605c35f4a77661cc7770fc55878c7c12))
* **privacy:** expose revocable session permissions without observer loops ([b498b74](https://github.com/YEowo-Y/weapp-shipmate/commit/b498b747b83b91d246dff4b495e7f45847e9f9ba))
* **projects:** embed configuration and backup panels ([2136ed4](https://github.com/YEowo-Y/weapp-shipmate/commit/2136ed4b33e3c72d58f72c550c5a4a0ae7697837))
* **projects:** separate results workspace from configuration ([fd35d11](https://github.com/YEowo-Y/weapp-shipmate/commit/fd35d1177c11ae82d3cafead832a0c69e492e7d3))
* **projects:** switch scoped sessions through stable folder rows ([efd4141](https://github.com/YEowo-Y/weapp-shipmate/commit/efd4141b7cf6c177a5b278f535a2d8e98a5f9a95))
* **reader:** announce filtered results and simplify rule metadata ([1967479](https://github.com/YEowo-Y/weapp-shipmate/commit/196747920d71f62313c96e3594a741c50fa706f9))
* **reader:** return to the originating repair record ([97fa416](https://github.com/YEowo-Y/weapp-shipmate/commit/97fa4169818a268311db7f9573192c494bdf7357))
* **release:** add candidate generation support in .github/workflows/release-candidate.yml ([cbd073d](https://github.com/YEowo-Y/weapp-shipmate/commit/cbd073de58f8e99ca77896967ec2540dbe300953))
* **release:** add candidate generation support in docs/26-implementation-handoff.md ([2d229eb](https://github.com/YEowo-Y/weapp-shipmate/commit/2d229eb75f675b7b94da07314491abf501322cec))
* **release:** add candidate generation support in progress.txt ([3c96638](https://github.com/YEowo-Y/weapp-shipmate/commit/3c966383570f8f2795624c103112ad102c044b9c))
* **release:** add candidate generation support in tools/release-candidate/acceptance.mjs ([b426d1d](https://github.com/YEowo-Y/weapp-shipmate/commit/b426d1ddb2af505c36a7899f0e7c6feed5a9f002))
* **release:** add candidate generation support in tools/release-candidate/cli.mjs ([ac493c8](https://github.com/YEowo-Y/weapp-shipmate/commit/ac493c8d3ed0cb594bfd50654139a072841892ed))
* **release:** add candidate generation support in tools/release-candidate/notes.mjs ([a980905](https://github.com/YEowo-Y/weapp-shipmate/commit/a98090506f72788c0b71550ea185aaff62d66703))
* **release:** add candidate generation support in tools/release-candidate/package-lock.json ([1326706](https://github.com/YEowo-Y/weapp-shipmate/commit/1326706c0fb839c3841ed66eee2dec18fb5cafde))
* **release:** add candidate generation support in tools/release-candidate/package.json ([85fb9f5](https://github.com/YEowo-Y/weapp-shipmate/commit/85fb9f59be84d2080cf21dbe534e852b00589ff0))
* **release:** add candidate generation support in tools/release-candidate/project.mjs ([cd258f1](https://github.com/YEowo-Y/weapp-shipmate/commit/cd258f1fefe2c13a7c080df8186458bdf2717e44))
* **release:** compare dry-run manifests and reject private paths ([0c5d6fd](https://github.com/YEowo-Y/weapp-shipmate/commit/0c5d6fd08a2efdf84ce4319a61c2286fdd4209a2))
* render saved workflow progress as a Markdown checklist ([07afb0f](https://github.com/YEowo-Y/weapp-shipmate/commit/07afb0fe2bb60a9bd5b27c106293a61e3da1ec6c))
* **repair:** filter history by pending and linked rechecks ([b48d0e7](https://github.com/YEowo-Y/weapp-shipmate/commit/b48d0e7560822a1b586a011df48943281fac7d87))
* **repair:** filter saved operations by write state ([49e1f7b](https://github.com/YEowo-Y/weapp-shipmate/commit/49e1f7b982637147934a03f2e5360f5f83eda4d0))
* **repair:** read exact linked recheck reports from history ([d006335](https://github.com/YEowo-Y/weapp-shipmate/commit/d006335ff8ef1095dcf70c988f653337561909fe))
* **repair:** restore filtered history at linked report origin ([04f560d](https://github.com/YEowo-Y/weapp-shipmate/commit/04f560dec46eef63c358a0869501efd36852df0b))
* **repair:** retry unfinished rechecks from repair history ([c4422cd](https://github.com/YEowo-Y/weapp-shipmate/commit/c4422cdf799ac76fa4aee8923395355874437c39))
* **report-reader:** filter requirements by handling action ([b1dd5f6](https://github.com/YEowo-Y/weapp-shipmate/commit/b1dd5f6390d4eacf942277af0566cd8230eddaf4))
* **report-reader:** search saved requirements and clear filters ([f03da00](https://github.com/YEowo-Y/weapp-shipmate/commit/f03da00558ff69ba598c5c3580948369b3577b1f))
* **reports:** attach official quote verification to every structured finding ([32fe100](https://github.com/YEowo-Y/weapp-shipmate/commit/32fe10087105561996926de95d3ce425af7544e1))
* **reports:** filter findings and outline by citation evidence ([0f50f71](https://github.com/YEowo-Y/weapp-shipmate/commit/0f50f719cbe24904bfb5e79dc73ecde2f1a030ba))
* **reports:** guide readers to the highest priority finding ([7546009](https://github.com/YEowo-Y/weapp-shipmate/commit/7546009617101983dba85cbe50a80c010829ddbb))
* **reports:** jump from citation filters to the first matching source ([f2e7799](https://github.com/YEowo-Y/weapp-shipmate/commit/f2e7799d53e6f6fc99218b6a15f92780ee30c52d))
* **reports:** link conditional rules to the matching project fact ([e5133d3](https://github.com/YEowo-Y/weapp-shipmate/commit/e5133d3bf994007384e894befaae84df558088a2))
* **reports:** persist online citation evidence by rule and version ([8b641e4](https://github.com/YEowo-Y/weapp-shipmate/commit/8b641e42039e84ab0fea3d723a642386c84c8cc2))
* **reports:** present saved reports in the workspace ([18a9494](https://github.com/YEowo-Y/weapp-shipmate/commit/18a94948314a4b9b8a818fa1a5de700205f8d8ca))
* **reports:** publish the latest quote status for local filtering ([30ea51f](https://github.com/YEowo-Y/weapp-shipmate/commit/30ea51f220e44067e2e12fc4781187ba857cd122))
* **reports:** show citation attempts and historical matches separately ([9033fc9](https://github.com/YEowo-Y/weapp-shipmate/commit/9033fc9ab2ad8696a147e61928b83a45926d0299))
* **reports:** step through filtered quotations and preserve reading focus ([5614654](https://github.com/YEowo-Y/weapp-shipmate/commit/56146540210f513ffac06bdd93bcc8c60e893db2))
* retain confidence through repair handoffs ([3e4ae6d](https://github.com/YEowo-Y/weapp-shipmate/commit/3e4ae6d23445b71be15fd4dae1490a93b45dcca2))
* **sessions:** attach the persistent sidebar heading ([eed86c1](https://github.com/YEowo-Y/weapp-shipmate/commit/eed86c13f21b9c8f59ab295794a908f57ea08257))
* **sessions:** embed project navigation and expose anchored renaming ([9ab95f6](https://github.com/YEowo-Y/weapp-shipmate/commit/9ab95f6eb1da82af844227cc6634f4c5b78d4651))
* **sessions:** expose a stable data settings panel ([80e06ef](https://github.com/YEowo-Y/weapp-shipmate/commit/80e06ef67e47bcec641a4ab9d58213fc85741cde))
* **sessions:** forward guarded desktop data settings navigation ([8448d1c](https://github.com/YEowo-Y/weapp-shipmate/commit/8448d1c57eee4629e62c09c5ff81aec17f971570))
* **sessions:** mount project folders beneath conversation actions ([3f00102](https://github.com/YEowo-Y/weapp-shipmate/commit/3f0010296d5d43df74047bc019b2e7a69a4a01e4))
* **sessions:** place search in the sidebar quick-action header ([c7e7d63](https://github.com/YEowo-Y/weapp-shipmate/commit/c7e7d63f2436fe133706b320d41f3a0889f01e74))
* **sessions:** route data actions through optional settings host ([3c55850](https://github.com/YEowo-Y/weapp-shipmate/commit/3c558506c13f549efd0e07270d4fa982fe9a344e))
* **settings:** add shortcuts privacy and version pages ([9ba9712](https://github.com/YEowo-Y/weapp-shipmate/commit/9ba9712fcbbc8a85425421988f2419b6ba3dcaae))
* **settings:** build searchable responsive workspace navigation ([ed5d6d1](https://github.com/YEowo-Y/weapp-shipmate/commit/ed5d6d1d60a98cb690f0a3c816bbd46eb11f7b17))
* **settings:** connect maintenance and notification destinations ([b9bbf0b](https://github.com/YEowo-Y/weapp-shipmate/commit/b9bbf0bb4032e77f35deac73befb00f4021f55d8))
* **settings:** coordinate panel lifecycle and guarded navigation ([02955a1](https://github.com/YEowo-Y/weapp-shipmate/commit/02955a1597c8cf465f9bae5943a60eb9e7c4b16e))
* **settings:** copy versions and document application shortcuts ([50f6fa9](https://github.com/YEowo-Y/weapp-shipmate/commit/50f6fa9caf6ab2accdc0b4e4031816e56752252c))
* **settings:** define embedded panel and privacy contracts ([619163b](https://github.com/YEowo-Y/weapp-shipmate/commit/619163b79489d5e6701200c471c087ef6c330d02))
* **settings:** index eight settings categories for search ([6e16f9f](https://github.com/YEowo-Y/weapp-shipmate/commit/6e16f9f8951a583f31318e54f4c84b7c0a936528))
* **settings:** persist the message send shortcut safely ([8796347](https://github.com/YEowo-Y/weapp-shipmate/commit/8796347c5935f9caa49d3bd0bd04f725f5292fe9))
* **settings:** route history backups to the data workspace ([87a501e](https://github.com/YEowo-Y/weapp-shipmate/commit/87a501e9051a5ebb112e26ce1ca0a074b7db99d2))
* **settings:** show product identity with version information ([a534c56](https://github.com/YEowo-Y/weapp-shipmate/commit/a534c566c95b2d7812eb97465801cb8f80641539))
* show recorded confidence in guide result cards ([ad72cf4](https://github.com/YEowo-Y/weapp-shipmate/commit/ad72cf4d8868d7c5b7f22d7fbe672762a3e76889))
* show rule confidence in rejection exports ([6295930](https://github.com/YEowo-Y/weapp-shipmate/commit/6295930ab56e2862b02a387ac915200e07bb5926))
* **sources:** compare the report quotation against the fetched official body ([fe523bd](https://github.com/YEowo-Y/weapp-shipmate/commit/fe523bdcecce730f99487426741c5219e9a62c54))
* **sources:** search and filter loaded source checks ([6e25b46](https://github.com/YEowo-Y/weapp-shipmate/commit/6e25b46f15b2d6c11e980d45f61f90a6c1315d00))
* **sources:** share rule selection for quote verification ([1b1a63b](https://github.com/YEowo-Y/weapp-shipmate/commit/1b1a63b5403bf64d5a9fabf14d6f1af15c6d2d5c))
* **sources:** share trusted source validation with report citations ([4ef2b28](https://github.com/YEowo-Y/weapp-shipmate/commit/4ef2b287c461d1eae4c4b914760777f6d96ffffc))
* **tools:** guard workspace transitions before opening ([153d740](https://github.com/YEowo-Y/weapp-shipmate/commit/153d74006271f763c7513428f22ea07b4448133a))
* validate optional desktop rule confidence ([20779e1](https://github.com/YEowo-Y/weapp-shipmate/commit/20779e1ffad38a74cd14dd31ad00d7c9e18c4e82))
* **workflow:** add saved-facts guide update action ([92de6ed](https://github.com/YEowo-Y/weapp-shipmate/commit/92de6edfdade218eb5b7850a0c69c9bd73f741d6))
* **workflow:** open missing project facts while preserving drafts ([47c53da](https://github.com/YEowo-Y/weapp-shipmate/commit/47c53daecf49e959bc9a9f062b2ae8c3a76f6d1f))
* **workflow:** regenerate guides after saving project facts ([8eb444f](https://github.com/YEowo-Y/weapp-shipmate/commit/8eb444f02888599b2ba837d6bb18611571af779e))
* **workflow:** support guarded progress work pages ([13ad126](https://github.com/YEowo-Y/weapp-shipmate/commit/13ad12683e405420c45da3419e79e26a8e6704cd))


### Bug Fixes

* **backups:** support embedded ownership and pending guards ([2dd6a4e](https://github.com/YEowo-Y/weapp-shipmate/commit/2dd6a4ed87aa221aa36c9f9a691049d2b6e63b7f))
* **broker:** reserve stdout for desktop protocol frames ([308e239](https://github.com/YEowo-Y/weapp-shipmate/commit/308e23917ccb529f9873a009c37e9f0bf18d2fb2))
* **ci:** check source drift after link health failures ([79ecc88](https://github.com/YEowo-Y/weapp-shipmate/commit/79ecc88b5c44c725c68f2400b4d2609243ca99a9))
* **context:** apply shared privacy policy to attachments ([5ac8885](https://github.com/YEowo-Y/weapp-shipmate/commit/5ac88850a6826210f79e9c8cb9d909d3ce3c5e04))
* **desktop:** check report versions when copying or downloading ([84d6508](https://github.com/YEowo-Y/weapp-shipmate/commit/84d6508df3efb2f8c05609482468d20abcbe03c7))
* **desktop:** keep rejection results visible in narrow windows ([e2c3b32](https://github.com/YEowo-Y/weapp-shipmate/commit/e2c3b32c5de340285a30b6c1788faf0f741a3c9c))
* **desktop:** make preflight progress a programmatic focus target ([57075c1](https://github.com/YEowo-Y/weapp-shipmate/commit/57075c116df7d5e0dc5434524e7c3a8339d7f871))
* **desktop:** match handoff verification to the source report ([2ac4989](https://github.com/YEowo-Y/weapp-shipmate/commit/2ac4989d9e79628619f1d707a773c6ad10a7927f))
* **desktop:** route maintenance settings into project workspace ([1d4ffdb](https://github.com/YEowo-Y/weapp-shipmate/commit/1d4ffdbaa80f8a8e900228698e8953f8f3776540))
* **desktop:** search visible message text with a weak cache ([109869a](https://github.com/YEowo-Y/weapp-shipmate/commit/109869a366616c919b5d9fc2e8574fb0b682df29))
* **desktop:** style collapsible rejection help ([c6abcb1](https://github.com/YEowo-Y/weapp-shipmate/commit/c6abcb105dd949cb1bd58b1674634723ee34c373))
* guard conversation menus against unsaved workspace changes ([635b9c6](https://github.com/YEowo-Y/weapp-shipmate/commit/635b9c6bf5f95e52db16f02b950047e9b4008cb8))
* **guide:** keep stages with unknown facts in conditional self-checks ([57e7f3c](https://github.com/YEowo-Y/weapp-shipmate/commit/57e7f3c2b371295c2eb9ae6f094914fcf0f55b43))
* **guide:** use readable subject and workflow names in reports ([6e1a735](https://github.com/YEowo-Y/weapp-shipmate/commit/6e1a73570a2a142eafbea5fc741ab80fa6253331))
* **handoff:** include share-time version checks in Markdown ([7ba37a1](https://github.com/YEowo-Y/weapp-shipmate/commit/7ba37a16b04b6092b7d5c1f5cf9dcf552aa0bbc0))
* **history:** prefer the matching saved message when resuming a chat ([f35e967](https://github.com/YEowo-Y/weapp-shipmate/commit/f35e96711eca7cab20f464e3465166842ebeac5e))
* **history:** validate saved chat reports outside the recent window ([05b7fe8](https://github.com/YEowo-Y/weapp-shipmate/commit/05b7fe82894fad49f0acb1b6d05fa07df988f089))
* **installer:** package rc.3 as a Windows NSIS installer ([f77bacb](https://github.com/YEowo-Y/weapp-shipmate/commit/f77bacbd2a3809c7d0173edaf83d4a2ea1f59bf6))
* **maintenance:** preserve drafts until save or explicit discard ([17be217](https://github.com/YEowo-Y/weapp-shipmate/commit/17be21750ba7b4b643a313bd431568ea823d805f))
* **mcpb:** use the shared repository version check ([f6a1913](https://github.com/YEowo-Y/weapp-shipmate/commit/f6a191323f7c49daa3ca4618ce5d5d31dc1af6c7))
* **mcp:** preserve omitted guide facts as unknown ([f6d2828](https://github.com/YEowo-Y/weapp-shipmate/commit/f6d28283fef522455708a7a9c68c21044a17e502))
* **quotes:** verify inline rules in the offline gate ([484f741](https://github.com/YEowo-Y/weapp-shipmate/commit/484f741f2d86269e5ef0e0a0576a585c542bb2e2))
* **rejections:** keep forced login mapping in drafts ([9c43863](https://github.com/YEowo-Y/weapp-shipmate/commit/9c4386313ee6bba7e24b3c151f75f286d2ce54c5))
* **release:** install desktop SDK dependencies before testing ([6b0d21d](https://github.com/YEowo-Y/weapp-shipmate/commit/6b0d21ddb1ad7f6ab0093ea6400ee2f55ee42838))
* **release:** lock patched minimatch dependency tree ([c792826](https://github.com/YEowo-Y/weapp-shipmate/commit/c792826b8e8c0e3ba203475f9d88a79811ef9a8f))
* **release:** use patched minimatch in the isolated generator ([edf9fbb](https://github.com/YEowo-Y/weapp-shipmate/commit/edf9fbbf0f0167280bfb24e4da5afa84bbb99fb2))
* **release:** validate the desktop npm, Tauri and Cargo versions ([7f80d2c](https://github.com/YEowo-Y/weapp-shipmate/commit/7f80d2c5bbc2098bbbfeadcf33d62a371a2efee0))
* **release:** verify official quotes before packaging ([b9ad578](https://github.com/YEowo-Y/weapp-shipmate/commit/b9ad5781d0adbca49cdaddd021e4af5cbbb926b7))
* **reports:** show damaged citation records on the affected rule ([9dfb5ac](https://github.com/YEowo-Y/weapp-shipmate/commit/9dfb5acafc463644727e148e3b62d77e74f408a4))
* **reports:** wrap citation filters at narrow enlarged text widths ([12d6dfc](https://github.com/YEowo-Y/weapp-shipmate/commit/12d6dfc6ffde2261577b59b1928a5389fc9fc21a))
* **rules:** align inline advice and quotes with verified sources ([c41124b](https://github.com/YEowo-Y/weapp-shipmate/commit/c41124bda1037c3cba4e21cba16cc07934666b22))
* **rules:** distinguish AppSecret evidence from other key hints ([da0cd2b](https://github.com/YEowo-Y/weapp-shipmate/commit/da0cd2b9a2b82d8d100e966072f6bea35d0b8bd8))
* **rules:** quarantine unverified login guidance as drafts ([0c82490](https://github.com/YEowo-Y/weapp-shipmate/commit/0c824906cb50af57b0411d8529c27c24ebd01e2a))
* **rules:** verify categories against official sources ([b3c5e1a](https://github.com/YEowo-Y/weapp-shipmate/commit/b3c5e1a4d0d356950eb8ea9dc8298deabf192764))
* **rules:** verify content-safety against official sources ([dd83bd8](https://github.com/YEowo-Y/weapp-shipmate/commit/dd83bd895ba62ad16f852a123d8a8e3edbbe22de))
* **rules:** verify data against official sources ([9279337](https://github.com/YEowo-Y/weapp-shipmate/commit/92793372bdcf11ace80f8d5d552bf5ddde1c1fa2))
* **rules:** verify domains against official sources ([08712f2](https://github.com/YEowo-Y/weapp-shipmate/commit/08712f27c15067e01dcb15548f49e3e5f82bbf00))
* **rules:** verify filing against official sources ([e492976](https://github.com/YEowo-Y/weapp-shipmate/commit/e492976867976c1f70211a5eeba3c92d8c141644))
* **rules:** verify login against official sources ([8771b73](https://github.com/YEowo-Y/weapp-shipmate/commit/8771b735fb69aa3cc5ef71938b09a29213369cd6))
* **rules:** verify minors against official sources ([784f116](https://github.com/YEowo-Y/weapp-shipmate/commit/784f116f1f87ccc1ecebe670db3d2b0b608ad98c))
* **rules:** verify onboarding against official sources ([12187a7](https://github.com/YEowo-Y/weapp-shipmate/commit/12187a7399ab41c914b014a61bf60a4759091114))
* **rules:** verify outbound against official sources ([2112f65](https://github.com/YEowo-Y/weapp-shipmate/commit/2112f65d20ee01d5d15135c2ff5f8da5a1cc6cdf))
* **rules:** verify payment against official sources ([2c0c7a5](https://github.com/YEowo-Y/weapp-shipmate/commit/2c0c7a5d84c93a5a3632285a56d6ca89770de0eb))
* **rules:** verify privacy-apis against official sources ([ca5c000](https://github.com/YEowo-Y/weapp-shipmate/commit/ca5c0008c79d820c7d9ef6761e4bdd843025f04d))
* **rules:** verify qualification against official sources ([428eae4](https://github.com/YEowo-Y/weapp-shipmate/commit/428eae4e6834ac5401c39a0a3f213f1115a08320))
* **rules:** verify review against official sources ([2d6f6e6](https://github.com/YEowo-Y/weapp-shipmate/commit/2d6f6e695b076f015a9e10f0d1afbfa2513cc351))
* **runtime:** include shared private file policy ([fd27626](https://github.com/YEowo-Y/weapp-shipmate/commit/fd2762646598c452d5992c565a48470d0d443f13))
* **scanner:** apply shared private file exclusions ([6c00317](https://github.com/YEowo-Y/weapp-shipmate/commit/6c0031718dfbb4edf0ba292082a721ead45a0849))
* **sessions:** resolve saved reports through exact native association ([60b4046](https://github.com/YEowo-Y/weapp-shipmate/commit/60b4046913d6349ce0d2c7e51c7236443c8ab074))
* **settings:** disclose detailed rule versions on demand ([cafd1b0](https://github.com/YEowo-Y/weapp-shipmate/commit/cafd1b0bf0a577de3c7efccfe14f7e73c9194b57))
* **settings:** place project backup heading before grouped actions ([fbf1c90](https://github.com/YEowo-Y/weapp-shipmate/commit/fbf1c90de0b6aec48173378da77affbd25d09466))
* **settings:** trap focus around collapsed credential details ([3e2f196](https://github.com/YEowo-Y/weapp-shipmate/commit/3e2f196390e0cb7ba06abb1d6ee9809ea0e89027))
* **snapshots:** fetch sources used by inline checks ([9bb8752](https://github.com/YEowo-Y/weapp-shipmate/commit/9bb87529afc342e5942b89537f6540b6bc919286))
* **sources:** isolate damaged citation records during report reads ([38f94e2](https://github.com/YEowo-Y/weapp-shipmate/commit/38f94e2e03d675a4fff42a4178280eafa3c797f3))
* **sources:** normalize leading whitespace before archive hashing ([3d7403d](https://github.com/YEowo-Y/weapp-shipmate/commit/3d7403dda6d906844e6191dace400dbdcdb3c0ab))
* **types:** declare existing session creation action ([c06c9fe](https://github.com/YEowo-Y/weapp-shipmate/commit/c06c9fed8c1e4c8c37ea982203b0015488d3c1f5))
* use the existing static chat transport import ([aa94e40](https://github.com/YEowo-Y/weapp-shipmate/commit/aa94e4017016f2eb48569367a4d048a43ca529fc))
* **workflow:** explain conditional rules without named signals ([7871a1a](https://github.com/YEowo-Y/weapp-shipmate/commit/7871a1a078f99d59e3fde9b5045531972a21ee61))
* **workflow:** route unknown steps to the required project fact ([abfeaba](https://github.com/YEowo-Y/weapp-shipmate/commit/abfeaba3bf87a1962027c1dd80e6de4d06004c5a))
* **workflow:** treat source match rules as conditional ([b9297ad](https://github.com/YEowo-Y/weapp-shipmate/commit/b9297ad6596127eddf46eab84985d97b1ab5715e))


### Performance Improvements

* isolate the React settings renderer ([bb7d08e](https://github.com/YEowo-Y/weapp-shipmate/commit/bb7d08e3c82f77409c3442b0c1f0197554c7eafd))
* load settings rendering on first open ([33bf135](https://github.com/YEowo-Y/weapp-shipmate/commit/33bf135e3cc36434effe9769d9fb947cceda0531))

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

v0 代码骨架从「文档先行」走到可从源码运行的导航与代码感知预检。发布前用 12 个夹具核对准确性，当时 68 条可命中规则中有 30 条具备人工标注锚点，实测 precision 和 recall 均为 1.000（TP51/FP0/FN0）。另对 11 个真实样本执行快检，观察到 0 误报和 0 回归。

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
