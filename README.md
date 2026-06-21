# weapp-shipmate · 上线船友

> **你写代码，我陪你上线。**
> Your launch **mate** for WeChat Mini Programs — everything after the code.
>
> 代码之后，上架之前，那个陪你跑完全程的伙伴。

一个**纯公益、开源**的工具，做 AI 编码工具（Claude Code / Codex 等）与微信小程序官方生态之间的**上线衔接层**，聚焦"**不是写代码**"但决定能否上线的环节：注册、主体认证、类目、ICP 备案、服务器域名白名单、用户隐私保护指引、提交审核、发布、运营合规。

面向人群：**个人开发者、个体工商户、零基础创业者**——AI 已经能帮他们把代码写出来，却帮不上"怎么合规地把它送上微信货架"这一段。

---

## 为什么需要它

AI 编码工具基本解决了"写代码"。但一个零基础的人真正卡死、放弃的地方，几乎都在**上线流程**：类目选错被拒、域名没配白名单、隐私协议漏填、备案卡在工信部、审核理由看不懂……

而这些环节**不适合被粗暴自动化**——涉及实名认证、付费、政府备案、人工审核，技术和法律上都不该由 Agent 代劳。所以 weapp-shipmate **不是"一键上线"**，而是把这条路做成：

1. **导航（Navigation）** —— 你现在在第几步、下一步点哪里、要准备什么材料、卡住了对照哪条官方规则。
2. **代码感知预检（Preflight）** —— 扫描你的小程序源码，生成**个性化**上线清单：调用了哪些域名（要去配白名单）、用了哪些隐私 API（隐私指引必填哪几项）、功能特征对应的类目建议与高频被拒预警。
3. **AI 衔接（Glue）** —— 封装成 **CLI 内核 + MCP 适配层**，让刚帮你写完代码的那个 Agent，直接跑预检、生成隐私指引字段映射、待确认草稿和审核备注建议，并一步步引导你在后台该点哪里。

---

## v0 先做什么

weapp-shipmate 不先做"平台"，先做一个可验证的最小闭环：

1. **规则库**：先种 30 条以内高质量规则，覆盖备案、服务类目、用户隐私保护指引、服务器域名白名单、提交审核材料和常见拒审原因。
2. **问答式导航**：`weapp-shipmate guide` 根据主体类型、是否经营、是否支付、是否收集手机号/位置/头像、是否有服务器域名，输出下一步清单。
3. **本地代码预检**：`weapp-shipmate check ./app` 只在本地扫描源码，v0 先识别 `wx.request` / `uni.request` 域名、隐私相关 API、`app.json` / `project.config.json` 和高风险 open-type。
4. **GitHub 协作入口**：先让社区能提交规则变更、拒审案例、官方链接变更和新手卡点，再扩展 MCP。

---

## 它明确不是什么（边界）

> 以下为速览；权威边界清单见 [`docs/02-positioning-and-naming.md`](docs/02-positioning-and-naming.md)，本节与其保持一致。

- ❌ **不是代码框架 / UI 库** —— 那是 Taro、uni-app、FirstUI 的地盘。
- ❌ **不是"Agent 一键上线"** —— 实名认证 / ICP 备案 / 人工审核不可代劳，也不该代劳。
- ❌ **不是又一个"操作微信开发者工具"的 MCP** —— 那块已是红海（见 `docs/01-research.md`）；我们做的是它**下游**的合规上线。
- ❌ **不做合规担保** —— 只给导航 + 官方原文引用 + 最后校验日期，决策权永远在用户手里。
- ❌ **不上传源码 / 不收集密钥** —— 预检默认本地执行，不采集 AppSecret、上传密钥、身份证照、营业执照等敏感材料。
- ❌ **不代写正式合规文件** —— 只生成待确认草稿、字段映射和检查清单；正式提交内容由用户按官方后台和自身真实业务确认。

---

## 形态与架构（一句话）

**CLI 内核 + MCP 适配层**，底座是一份**"规则即数据"的知识库**（`rules/*.yaml`），外加一份薄流程骨架（`flow.yaml`）承载上线阶段的顺序与分支。导航、预检、拒因反查是同一份规则库上的**多个渲染器**——社区 PR 一条规则，全部同时更新、不改代码。详见 `docs/03-decisions-and-architecture.md`。

```
weapp-shipmate check ./my-app        # 代码感知预检：出个性化上线清单
weapp-shipmate guide                 # 上线流程导航：你在哪一步、下一步做什么
weapp-shipmate explain "<审核反馈>"  # 拒因反查：把拒审信号映射到已核验规则与修复步骤
```

**本地运行**（尚未发布到 npm，先从源码跑）：

```bash
npm install
node bin/weapp-shipmate.mjs guide --subject personal --sensitive --domain
node bin/weapp-shipmate.mjs check ./my-app --subject personal
# 默认只输出来源已核验的规则；加 --include-drafts 可含未核验的种子规则
```

> ⚠️ 当前 45 条种子规则**全部已核验官方来源、默认输出**（备案 1、域名 1、隐私 21、提审 6、登录 5、内容 2、支付 2、资质 1、未成年 1、数据 1、导流 2、类目 2），暂无 `draft` 规则。`draft` 门禁机制保留：未来无法核验逐字来源的规则只进 `--include-drafts`、不进默认集——这是"宁可少说、不做担保"的有意约束。
>
> 🧩 **跨框架支持**：预检不只认原生 `wx.*`——`uni.*`（uni-app）、`Taro.*`（Taro）、`wepy.*`（wepy）经等价匹配归一到同一套规则；`.vue`/`.tsx`/`.mpx`/`.wpy`/`.nvue` 等单文件源码、以及 `app.json`/`manifest.json`(mp-weixin)/`app.config.ts`/`app.mpx` 内嵌等多种配置位置都能识别；uni-app `#ifdef` 条件编译、构建产物目录与媒体 `<image src>` 噪声均已剔除。已在真实开源小程序上 dogfood 验证（见下）。

**给 Agent 用（MCP）**：内置零依赖 MCP server（stdio），把上述能力暴露为两个工具 `weapp_shipmate_check`、`weapp_shipmate_guide`。在 Claude Code / Codex 的 MCP 配置中加入：

```json
{
  "mcpServers": {
    "weapp-shipmate": {
      "command": "node",
      "args": ["<仓库绝对路径>/bin/weapp-shipmate-mcp.mjs"]
    }
  }
}
```

**Claude Desktop 一键安装（`.mcpb`）**：无需手写上面的 JSON。本地执行 `npm run build:mcpb` 会打出一个 `.mcpb` 安装包（暂存 + 冒烟自检 + 官方 `mcpb pack`，产物在 `build/`，需联网拉取打包 CLI），在 Claude Desktop 中双击或经扩展设置导入即可使用。船友是纯规则引擎、不调用任何 LLM，故安装包不需要任何 API key。

> 签名（分发可信）：默认产出**未签名**包（合法 zip）。正式分发设 `WEAPP_SHIPMATE_SIGN_CERT` + `WEAPP_SHIPMATE_SIGN_KEY`（受信证书）签名并校验；内部/TOFU 分发设 `WEAPP_SHIPMATE_SELF_SIGN=1` 自签名——注意 `mcpb verify` 只信任系统证书链，自签名不会被判为可信。

---

## 当前状态

🟢 **v0 已在真实小程序上验证、多框架可用（2026-06-21）** —— 调研/定位/命名定稿；规则 schema、`flow.yaml`、**45 条已核验种子规则**、数据校验门禁与 CI 已落地。**四个渲染器**（`check` 代码预检 / `guide` 流程导航 / `explain` 拒因反查 / report 清单导出）共用同一份规则库、均可从源码运行；零依赖 MCP server（`check`/`guide`）与 `.mcpb` 一键安装包已落地。

**真实 dogfood 验证**：在多个真实开源小程序上逐条核验命中——覆盖**原生 wx / uni-app / Taro / mpvue / mpx / wepy 六大主流框架**，经 6-app 正确性核验把误报压到接近零、并补上支付/模板级隐私（头像/相机/麦克风）等真实漏报。当前 **82 例测试全绿**。下一步：发 **v0.1.0 公开预览**；规则覆盖增量保鲜。

文档导航：

| 文档 | 内容 |
|---|---|
| [`docs/01-research.md`](docs/01-research.md) | GitHub + 官方生态调研：竞品全景、自动化能力边界 |
| [`docs/02-positioning-and-naming.md`](docs/02-positioning-and-naming.md) | 定位、命名沿革、slogan、边界 |
| [`docs/03-decisions-and-architecture.md`](docs/03-decisions-and-architecture.md) | 7 项决定、核心架构支点、导航图模型、规则 schema 草图 |
| [`docs/04-roadmap.md`](docs/04-roadmap.md) | 二期建仓路线、冷启动待决问题 |
| [`docs/05-feasibility.md`](docs/05-feasibility.md) | 完整可行性评审、Go/No-Go 条件、风险与验证实验 |
| [`docs/06-quality-and-acceptance.md`](docs/06-quality-and-acceptance.md) | 质量与验收规则：分阶段 DOD、质量门禁、测试策略、修复分级、Dogfood |
| [`docs/07-desktop-agent-tech-research.md`](docs/07-desktop-agent-tech-research.md) | 产品终态（自建桌面 agent）技术方案与稳定性调研 |

---

## In English

**weapp-shipmate** is a free, open-source **go-live navigator** that bridges AI coding agents (Claude Code / Codex) and WeChat's official Mini Program ecosystem — covering every **non-coding** step from registration to release: entity verification, service category, ICP filing, server-domain allowlist, the User Privacy Protection Guideline, review submission, and release.

AI has largely solved *writing the code*; what still blocks zero-to-one creators is *shipping it compliantly onto WeChat's shelf*. These steps — real-name verification, payment, government filing, human review — **should not be blindly automated**, so weapp-shipmate is **not** a "one-click launch" agent. Instead it offers three things on top of one **rules-as-data** knowledge base (`rules/*.yaml`):

1. **Navigation** — which step you're on, what to click next, what to prepare.
2. **Code-aware preflight** — scans your source locally to produce a *personalized* go-live checklist (request domains to allowlist, privacy APIs that mandate guideline fields, category hints & common rejection warnings).
3. **AI glue** — a zero-dependency **CLI core + MCP adapter** so the agent that just wrote your code can run the preflight and explain results, without bypassing the official console.

**Not** a code framework/UI lib · **not** one-click launch · **not** another DevTools-driving MCP · **no** compliance guarantees · **never** uploads source or secrets. Status: **v0 validated (2026-06-21)** — four renderers (check / guide / explain / report) run from source; dogfooded on real open-source mini-programs across **6 frameworks** (native wx · uni-app · Taro · mpvue · mpx · wepy); 82 tests green; not yet published to npm.

---

## License

MIT，见 [`LICENSE`](LICENSE)。项目维护者承诺纯公益、无商业化计划；MIT 许可证本身允许社区合法复用，治理文档 [`GOVERNANCE.md`](GOVERNANCE.md) 已明确"不接代办、不卖课、不接广告、不做合规担保"的边界。
