# Changelog

本项目变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。当前 `0.1.0`（已托管于 GitHub `YEowo-Y/weapp-shipmate`，尚未 npm publish）。

## [Unreleased]

v0 代码骨架：从"文档先行"走到"可从源码运行的导航 + 代码感知预检"。

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
- **模板级隐私入口检测**（闭合 triage 模板级假阴性）：JS 调用扫不到的隐私入口改从模板识别——`open-type="chooseAvatar"`（收集头像 PII）→ 用户信息隐私；`<camera>`（source_quote 已含 `<camera>` 原文）/`<live-pusher>` → 摄像头隐私；`<live-pusher>` → 麦克风隐私。均为给已核验隐私规则补**检测面**，不新增合规断言。真实 `day-private-sample`（chooseAvatar）、`wechat-app-mall`（live-pusher）此前漏报的头像/相机/麦克风现已命中。
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
