# weapp-shipmate · 上线船友

> **你写代码，我陪你上线。**
> Your launch **mate** for WeChat Mini Programs — everything after the code.
>
> 代码之后，上架之前，那个陪你跑完全程的伙伴。

一个**纯公益、开源**的工具，做 AI 编码工具（Claude Code / Codex 等）与微信小程序官方生态之间的**上线衔接层**，聚焦"**不是写代码**"但决定能否上线的环节：注册、主体认证、类目、ICP 备案、服务器域名白名单、用户隐私保护指引、提交审核、发布、运营规范预警。

面向人群：**个人开发者、个体工商户、零基础创业者**——AI 已经能帮他们把代码写出来，却帮不上"怎么合规地把它送上微信货架"这一段。

---

## 为什么需要它

AI 编码工具基本解决了"写代码"。但一个零基础的人真正卡死、放弃的地方，几乎都在**上线流程**：类目选错被拒、域名没配白名单、隐私协议漏填、备案卡在工信部、审核理由看不懂……

而这些环节**不适合被粗暴自动化**——涉及实名认证、付费、政府备案、人工审核，技术和法律上都不该由 Agent 代劳。所以 weapp-shipmate **不是"一键上线"**，而是把这条路做成：

1. **导航（Navigation）** —— 你现在在第几步、下一步点哪里、要准备什么材料、卡住了对照哪条官方规则。
2. **代码感知预检（Preflight）** —— 扫描你的小程序源码，生成**个性化**上线清单：调用了哪些域名（要去配白名单）、用了哪些隐私 API（隐私指引必填哪几项）、功能特征对应的类目建议与高频被拒预警。
3. **AI 衔接（Glue）** —— 封装成 **CLI 内核 + MCP 适配层**，让刚帮你写完代码的那个 Agent，直接跑预检、生成隐私指引字段映射、待确认草稿和审核备注建议，并一步步引导你在后台该点哪里。

---

## v0 已形成的最小闭环

weapp-shipmate 没有先做"平台"，而是先把一个可验证的最小闭环做实：

1. **规则库**：当前 63 条默认规则均带已核验官方来源，覆盖备案、服务类目、用户隐私保护指引、服务器域名白名单、提交审核材料和常见拒审原因。
2. **问答式导航**：`weapp-shipmate guide` 根据主体类型、是否收集手机号/位置/头像、是否有服务器域名，输出下一步清单。当前 `--payment` / `--business` 仍是兼容入口、尚未参与判定，后续语义或弃用方案见 `EVOLUTION_ROADMAP.md` S3。
3. **本地代码预检**：`weapp-shipmate check ./app` 扫描受支持的源码与公开配置载体，识别跨框架请求域名、隐私 API、模板信号与声明一致性问题。
4. **AI 与社区入口**：CLI 与三个 MCP 工具（check / guide / explain）均已落地；GitHub 继续承载规则变更、拒审案例、官方链接变更和新手卡点。

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

**安装 / 运行**（当前公开版为 v0.1.0；仓库发布候选版本为 0.2.0-rc.2，尚未发布到 npm registry）。需 **Node.js ≥ 20**（Node 20 已于 2026-04-30 结束生命周期，建议 22+）；方式一/二另需本机已装 git。安装锚定到已通过全部发布门禁的版本 tag——升级时改用新版本 tag 重装即可（每条输出都附「最后核验日期」，陈旧自现）：

```bash
# 方式一（推荐）：从 GitHub 安装已验证的发布候选（锚定 tag，不跟随开发中的 main）
npm install -g github:YEowo-Y/weapp-shipmate#v0.2.0-rc.2
weapp-shipmate check ./my-app --subject personal

# 方式二：一次性运行、不落地安装
npx -p github:YEowo-Y/weapp-shipmate#v0.2.0-rc.2 weapp-shipmate check ./my-app --subject personal

# 方式三：从 Release 下载 tarball 安装（固定版本）
npm install -g https://github.com/YEowo-Y/weapp-shipmate/releases/download/v0.1.0/weapp-shipmate-0.1.0.tgz

# 开发者：从源码跑
npm install
node bin/weapp-shipmate.mjs guide --subject personal --sensitive --domain
# 默认只输出来源已核验的规则；加 --include-drafts 可含未核验的种子规则
```

> ⚠️ 当前 63 条种子规则**全部已核验官方来源、默认输出**（隐私 23、类目 8、提审 7、登录 5、域名 4、备案 4、内容 3、数据 3、支付 2、导流 2、未成年 1、资质 1），暂无 `draft` 规则。`draft` 门禁机制保留：未来无法核验逐字来源的规则只进 `--include-drafts`、不进默认集——这是"宁可少说、不做担保"的有意约束。
>
> 🧩 **跨框架支持**：预检不只认原生 `wx.*`——`uni.*`（uni-app）、`Taro.*`（Taro）、`wepy.*`（wepy）经等价匹配归一到同一套规则（mpvue、mpx 直接产出 `wx.*`，无需别名即被原生识别，故不在此等价列表内）；`.vue`/`.tsx`/`.mpx`/`.wpy`/`.nvue` 等单文件源码、以及 `app.json`/`manifest.json`(mp-weixin)/`app.config.ts`/`app.mpx` 内嵌等多种配置位置都能识别；uni-app `#ifdef` 条件编译、构建产物目录与媒体 `<image src>` 噪声均已剔除。已在真实开源小程序上 dogfood 验证（见下）。

**给 Agent 用（MCP）**：内置极简依赖 MCP server（stdio，仅 1 个纯解析依赖 js-yaml、零网络/零原生依赖），把上述能力暴露为三个工具 `weapp_shipmate_check`、`weapp_shipmate_guide`、`weapp_shipmate_explain`。全局安装后 `command` 直接写 `"weapp-shipmate-mcp"` 即可；从源码跑则在 Claude Code / Codex 的 MCP 配置中加入：

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

> ⚠️ **local-only 不等于不读取**：`weapp_shipmate_check` 会按 MCP 客户端传入的 `dir`，以 server 进程现有的文件系统权限读取其中受支持的源码/配置文本。它不上传文件内容，但应只向可信客户端开放，并只传入你确实希望检查的项目目录。

**Claude Desktop 一键安装（`.mcpb`）**：无需手写上面的 JSON。从 [Releases](https://github.com/YEowo-Y/weapp-shipmate/releases) 直接下载现成的 `weapp-shipmate.mcpb` 双击安装；或本地执行 `npm run build:mcpb` 自行打包（暂存 + 冒烟自检 + 官方 `mcpb pack`，产物在 `build/`，需联网拉取打包 CLI），在 Claude Desktop 中双击或经扩展设置导入即可使用。船友是纯规则引擎、不调用任何 LLM，故安装包不需要任何 API key。

> 本地 `npm run build:mcpb` 默认把“暂存 + 冒烟”作为成功底线：若联网 pack 失败，会保留暂存目录并打印手动命令，退出成功不代表 `.mcpb` 已生成。tag 发布流水线启用严格模式，pack 失败会在生成校验和与 Release 资产之前直接失败。

> 签名（分发可信）：默认产出**未签名**包（合法 zip）。正式分发设 `WEAPP_SHIPMATE_SIGN_CERT` + `WEAPP_SHIPMATE_SIGN_KEY`（受信证书）签名并校验；内部/TOFU 分发设 `WEAPP_SHIPMATE_SELF_SIGN=1` 自签名——注意 `mcpb verify` 只信任系统证书链，自签名不会被判为可信。

---

## 当前状态

🟢 **v0 已在真实小程序上验证、多框架可用（当前 HEAD 于 2026-07-17 本地复验）** —— 调研/定位/命名定稿；规则 schema、`flow.yaml`、**63 条已核验种子规则**、数据校验门禁与 CI 已落地。**四个渲染器**（`check` 代码预检 / `guide` 流程导航 / `explain` 拒因反查 / report 清单导出）共用同一份规则库、均可从源码运行；极简依赖 MCP server（`check`/`guide`/`explain`）与 `.mcpb` 一键安装包已落地。

**真实 dogfood 验证**：在 11 个固定真实开源样本上逐条核验命中——覆盖**原生 wx / uni-app / Taro / mpvue / mpx / wepy 六大主流框架**，并补上支付/模板级隐私（头像/相机/麦克风）/web-view 业务域名等真实漏报。当前 **214 例测试全绿**；准确性门禁在 `corpus/labels.json` 的 **89 条人工核验标注、15 个夹具**上得到 **TP 55 / FP 0 / FN 0**，precision = recall = 1.0、零误报**且零漏报**即 CI 红线（`npm run accuracy`）。公开版为 **v0.1.0**；仓库发布候选为 **0.2.0-rc.2**，后续改动记在 Unreleased。

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
| [`docs/08-product-vision.md`](docs/08-product-vision.md) | 终态产品愿景：领域聚焦上线 copilot、分层、架构、准确性地基、路线 |
| [`docs/09-memory-context-architecture.md`](docs/09-memory-context-architecture.md) | 上下文与记忆架构规范（工程级）：注入提示词 / 记忆生命周期 / 存储引擎 / 数据模型 |
| [`docs/10-quality-inspection-and-slice-plan.md`](docs/10-quality-inspection-and-slice-plan.md) | 研发质量管控：P2 首跑验收 + 分级修复台账 + 四维优化 + 功能切片开发计划 |

---

## In English

**weapp-shipmate** is a free, open-source **go-live navigator** that bridges AI coding agents (Claude Code / Codex) and WeChat's official Mini Program ecosystem — covering every **non-coding** step from registration to release: entity verification, service category, ICP filing, server-domain allowlist, the User Privacy Protection Guideline, review submission, and release.

AI has largely solved *writing the code*; what still blocks zero-to-one creators is *shipping it compliantly onto WeChat's shelf*. These steps — real-name verification, payment, government filing, human review — **should not be blindly automated**, so weapp-shipmate is **not** a "one-click launch" agent. Instead it offers three things on top of one **rules-as-data** knowledge base (`rules/*.yaml`):

1. **Navigation** — which step you're on, what to click next, what to prepare.
2. **Code-aware preflight** — scans your source locally to produce a *personalized* go-live checklist (request domains to allowlist, privacy APIs that mandate guideline fields, category hints & common rejection warnings).
3. **AI glue** — a minimal-dependency **CLI core + MCP adapter** (a single parse dependency, js-yaml; no network or native deps) so the agent that just wrote your code can run the preflight and explain results, without bypassing the official console. Local-only means no upload, not no read: MCP check reads the client-supplied directory with the server process's filesystem permissions, so expose it only to trusted clients.

**Not** a code framework/UI lib · **not** one-click launch · **not** another DevTools-driving MCP · **no** compliance guarantees · **never** uploads source or secrets. Status: **v0 re-verified on 2026-07-17** — four renderers (check / guide / explain / report) run from source; dogfooded on 11 fixed real-world samples across **6 frameworks** (native wx · uni-app · Taro · mpvue · mpx · wepy); 214 tests green, with 89 hand-verified labels across 15 fixtures (TP 55 / FP 0 / FN 0; precision = recall = 1.0). Public release: **v0.1.0**; repository release candidate: **0.2.0-rc.2**; not yet published to npm.

---

## License

MIT，见 [`LICENSE`](LICENSE)。项目维护者承诺纯公益、无商业化计划；MIT 许可证本身允许社区合法复用，治理文档 [`GOVERNANCE.md`](GOVERNANCE.md) 已明确"不接代办、不卖课、不接广告、不做合规担保"的边界。
