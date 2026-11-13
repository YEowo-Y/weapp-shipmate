# 08 · 产品愿景:从上线工具到全生命周期上线 copilot

> **当前实现与历史方案的边界（2026-10-22 P0）**：本文保留 2026-06 的产品探索记录；下文的「✅ 已定」、阶段编号和架构图不代表已经交付，也不是当前依赖安装清单。当前事实以[功能台账](12-current-capabilities.md)为准，实施顺序见[总体计划](../.omx/plans/project-completion-plan-20261022.md)。
>
> 当前桌面为 **Vanilla TypeScript / Vite / Tauri 2 / Web Awesome**，复用 Node 模型 broker 和 IndexedDB 会话存储。React、Zustand、SQLite、系统凭据库、PTY、自动修复和持久任务执行器尚未作为本文所述架构落地。后续项目模型拟支持一个项目关联多个会话、运行和成果，替代「一项目=一会话」；迁移前保留未归属的旧会话。
>
> 安全口径更正：合法规则 ID 只能说明引用存在，不能给整段 AI 解释授予「已核验」状态；提示词与 XML 分隔符不是权限边界。工具字段须经过契约校验，模型解释仍标注为 AI 建议。本次文档整理不代表浏览器、真实账号或安装版验收通过。

> 本文涉及的规则数/统计以 `npm run validate` 实测为准,历史快照不再逐处回填。
>
> 状态:**愿景施工图(2026-06-22,四轮调研已沉淀)**,驱动 P2.1+ 实施。本文是决策 #8(自建桌面 agent 终态)在**产品层**的展开;技术底座见 [`docs/07`](07-desktop-agent-tech-research.md)。
> 来源:本仓多轮产品讨论 + **四轮前沿调研**——R1(域内合规 + 同类 agent 产品范式 + GitHub 竞品)· R2(每个功能的成熟技术底座)· R3(功能的准确性 + 实用性,以真实拒审/卡点数据为锚)· R4(官方文档覆盖地图:8 路并行测绘上线/合规/运营文档全集 × gap 分析 × 个人开发者优先,见 §15)。
> 标注约定:**✅ 已定** · **❓ 待决策** · **⚠️ 待核验**(宁缺毋造,见 §14)· 推断/提议明确标注。

---

## 0. 一句话

**一个领域聚焦的「微信小程序上线 copilot」**:让一个零基础的人,安全、合规、健康地把小程序送上线——并在上线后持续守住合规健康。
**agent 是交付方式,已核验的规则大脑才是产品。** 我们做"微信上线界的 Linear",不是"又一个 Claude Desktop"。

---

## 1. 定位与边界 ✅

- **领域聚焦,不做通用 agent 工作台。** 对话 / 终端 / MCP / 记忆等是**手脚**,服务于唯一目标:从代码到上线。理由:护城河是 63 条已核验规则(以 `npm run validate` 实测为准)+ 8 阶段流 + 拒因库 + 交叉核验扫描器,这些不转移到通用 agent;通用工作台是打不赢的红海;"公益 / 不做担保"只有收窄才可信;决策 #8 的"换壳几乎零返工"本就是领域产品架构。
- **市场空白已被竞品扫描证实**(R1):GitHub `wechat-mini-program` topic 1000+ 仓 + 6 组中英关键词,**零直接竞品**。邻接工具各管一段——`miniprogram-ci`(上传管道)、`wechat-devtools-mcp`/`weapp-dev-mcp`(操控开发者工具)、`wxmini-security-audit`(安全扫描)——**没人碰"代码完成→上架"这段合规导航**。我们填的正是这个空白。
- **不变的灶台**(继承自项目根):不做合规担保、不代提交官方后台、不收集项目密钥、源码默认留在本机（规划中的两项自选例外见[治理承诺](../GOVERNANCE.md)）、查无官方明文者宁缺毋造、所有官方动作 `manual_required`。
- **覆盖边界 ✅(用户定)**:确定性规则/知识库系统化覆盖「上线/合规/运营」官方文档**全集**(终态目标;前期优先个人开发者);纯开发文档(组件/框架/SDK/API)**不进逐字规则库**,交给 agent + LLM(BYO-key)或开关承载——把"错一条砸信任"的合规知识与"多/变/低风险"的开发知识分到两种载体,也让 §4 准确性 与 §5 LLM 巡航 各有战场、不抢同一责任。覆盖进度与 backlog 见 §15。
- **红线提醒**:工程化能力(DOD / 质量门禁 / 测试 / git / 安全)本质是通用软件工程——**只在锚定"上线就绪"、且开关化/零知识时**才纳入,否则滑向通用商品海。口径见 §3.2。

---

## 2. 生命周期分层 ✅

打开项目先选:**「这个小程序上线了吗?」** 两种模式共用同一个大脑(check/guide/explain + rot 监控),仅 UI 框架不同。

### 2.1 上线前 · 引导模式
- 8 阶段上线流(注册→认证→备案→类目→隐私→域名→提审→发布，以 `flow.yaml` 为准),向前推进,**有终点**("你已走完上线全程",绝不说"已上线成功/已合规")。
- 每阶段一个"工作区":子步骤清单 · 时间炸弹提醒 · 材料准备 · 官方后台交接(深链 + "我已完成"勾选,工具不代提交)· 已核验规则卡 · agent 协助。

### 2.2 上线后 · 健康检查模式
- 持续体检,**无终点**:合规漂移(政策变 / 规则 `last_verified` 更新 / 代码改 → 重核)· 新版本提审前预检 · 工程/安全巡检常态化 · 版本被拒的修复循环 · 官方规则变更推送给受影响项目。
- 复用 `rot` 腐烂监控:上线前它是后台 CI,**健康模式里变成用户看得见的价值**("2 条规则来源更新了,你可能受影响")。
- **官方背书已找到逐字依据**(R1):官方运营规范明示"这是一份**动态更新**的文档……请**定期了解更新情况**";服务类目页明示"类目会随政策、法律法规及平台要求变化而产生变化……本文档仅供参考"。漂移引擎正是代用户履行这份"持续监控义务"——这不是我们发明的需求,是平台把它写进了规范。

---

## 3. 功能图谱

### 3.1 必备(table-stakes,做到位即止)
- 8 阶段引导清单作为产品脊柱(`flow.yaml` 驱动,done-state 归规则引擎、永不归 LLM,锁定靠 `requires_stage`)。
- 5 问平白访谈 → 填 docs/02 导航输入(LLM 解析模糊自由文本为 enum,写回确定性状态,给"接受/编辑"门)。
- 流式 markdown 对话与会话历史已存在。原「一项目=一会话=一文件夹 + SQLite」为历史提议，已由多会话项目规划替代；当前会话实际存于 IndexedDB，持久项目与报告存储待实施。
- `check` 接真实项目文件夹(扫请求域名 + 隐私 API + 交叉核验;变量 baseURL 出 `manual_only`,绝不 LLM 猜)。
- 每阶段交接闸门(材料清单 + 时间炸弹 + 官方深链 + "我已完成"勾选,工具永不提交)。
- BYO-key 设置(provider → 粘 key → 可改 Base URL → "测试连接"绿/红 → 启用;一个 OpenAI 兼容自定义槽给国内网关;key 只进 OS 钥匙串)。
- `explain` 作为对话能力(贴拒审反馈 → 已核验修复步骤 + 官方来源)。
- 每条规则带 `last_verified` 新鲜度 + `official_url`;system prompt 硬禁"保证过审/已合规/一键上线/可直接提交"。

### 3.2 差异化(我们独有,投资重点;括号内为 R2 成熟技术裁决)
- **修复衔接层**:发现问题后两条路——**生成修复 prompt**(默认,见下)/ **授权直修**(agent 改代码,逐条批准 + diff 可回退,沙箱锁本项目)。
  - 成熟技术(R2):diff 生成 `jsdiff`/`similar`,patch 应用 `diffy`,安全机械修用 ESLint `--fix`;**per-file diff 预览 + 批准 + Aider 式"每次 AI 改动自动 git commit、`/undo`=revert"回滚**是 Cline/Cursor/Aider/Claude Code 四家收敛的下限,不可省。
  - 修复 prompt 用 **SARIF 2.1.0** 标准承载发现,模板带"问题 + 命中规则 + 官方 URL + 文件:行 + 框架变体(.vue/.tsx/.mpx)+ 涉及的 wx.* API + 『只改这处、勿重构相邻代码』"。**我们的独有优势**:这些上下文 Claude Code 无从自知,我们打包的 prompt 比小白自述精准十倍。
  - **实用性铁律(R3)**:默认 **fix-prompt 而非静默 auto-fix**——社区对"AI 擅自改代码"高度反感;auto-fix 仅限安全机械项、必须 opt-in + 可预览 + 可回滚,逻辑性改动一律降级为建议。
- **工程体检即开关/skill**:DOD 对抗审查 / 代码质量门禁 / 统一 Fix+回归 / 全链路测试 / Dogfood / 短板梳理——做成开关,小白不写 prompt、开开关 agent 用其 BYO-key 跑。
  - 成熟技术(R2):**ESLint 可编程 API**(JS/TS/Vue/JSX,生态标准)+ `eslint-plugin-security` + **Opengrep**(Semgrep OSS fork,本地零云污点扫描,打成 sidecar);微信特有规则(.wxml/.mpx/.wpy)继续走现有 scanner 正则层。`miniprogram-ci.checkCodeQuality` **禁用**(它把源码送腾讯服务器,违"源码不出网")。
  - **口径**:不是"我们也能做代码审查"(那是和 Cursor 拼),而是"一个项目要健康地上线,光合规不够;这些小白不懂,所以一键让 agent 做到上线级健康"。**必须锚在上线就绪下**;质量/安全发现打"工程信号"而非"已核验"标,不污染合规事实源。
- **已核验 vs AI 生成的可视化双标**:对话里每句话打标——绿"已核验规则 #id + 引用来源"vs 灰"AI 建议·未核验"。这是信任差异化,也是"宁缺毋造"的产品化。
- **规则大脑当内置 MCP server**:`bin/weapp-shipmate-mcp.mjs` 原封不动当 Node sidecar,check/guide/explain 成为同一工具注册表里的 3 个工具,和用户自加 MCP server 同路径。一份大脑,两个宿主(桌面 app + 给 Claude Code 用的 `.mcpb`)。
- **类目顾问 / 知识库**:见 §11.1(R1+R3 已深挖,产出判定表 + 数据资产方案)。
- ⌘K 命令面板("卡住了问一句"的主入口,让小白工具有专业感)。

### 3.3 后置(明确推迟,不阻塞核心)
- **第三方 MCP 插件接入** —— **✅ 明确后置**(决策见 §10.6 + §13):P2 只上内置可信大脑,零沙箱风险;第三方 MCP + M1–M9 安全基线留作日后差异化弹药。
- 每项目轻量记忆(应用名/类目/备案状态,跨多日旅程)。
- 浅色主题(CSS 变量覆盖)。
- 内置 PTY 直接拉起 Claude Code / Codex。
- 分屏/模型对比(显式跳过,power-user only)。
- 模型市场 / 开放 MCP hub(先给一小撮精选)。
- 向量/RAG(关键词知识库不够用再说)· 跨设备同步。

---

## 4. 准确性地基(make-or-break)

**检测不准会极大伤体验——准确性是护城河本身,不是质量细节。** 解药不是"让 AI 更聪明",而是确定性核心 + 可度量。

### 4.1 已有的准确性机制

| 机制 | 作用 |
|---|---|
| 确定性核心 | 每条命中回链已核验规则 + 官方原文 + `last_verified`,**无 LLM 杜撰** |
| 本地真实语料回归 | `npm run dogfood` 在有本地路径映射的开发机上核对 11 个固定样本；CI 另由 accuracy + fixture pins 守门，不把不可用的本地样本假装成 CI 覆盖 |
| 置信度 + abstain | high/medium 标注;内容相关进"可能适用·需确认"(已建 `selfCheck`);绝不把猜的当确定阻断 |
| 规则腐烂监控 | `npm run rot` 默认离线检查 `last_verified` 时效；月度 `rule-rot.yml` 使用 `npm run rot -- --links` 追加 `official_url` 链接体检 |
| 诚实框架边界 | 扫到未验证框架就明说"未验证·仅供参考",不静默给错结果 |
| 用户反馈回路 | GitHub issue 模板(新手卡点/官方变更/拒审案例)→ 修 → 回归 |

> 已落地的准确性资本(前序会话):6-app 正确性 triage 把隐私/密钥/后端 API 假阳性压到≈0;`security.insecure-request` 假阳性从"4/6 app 误报"清到"全语料 1 条真命中";修掉 uni-app/Taro/wepy/mpx framework 盲区。**这是永久地基,不是一个阶段。**

### 4.2 准确性工程:度量地基已交付，细化项后续(R3,最高杠杆)

最初“准不准只有感觉”的问题已闭合为可重复门禁。当前实现借成熟静态分析方法、**借方法不引新的运行时依赖**：

| 已交付工件 | 当前契约 |
|---|---|
| `corpus/labels.json` | 对 dogfood 语料做 `hit` / `no_hit` ground-truth 标注，保留主体维度；反例直接守 FP 红线 |
| `scripts/accuracy.mjs` + `tests/accuracy.test.mjs` | 复用 `runCheck` 计算逐规则与全局 TP/FP/FN/precision/recall/F1；precision <0.95、出现 FP、出现 FN 或未知 ruleId 即失败 |
| `corpus/fixture-pins.json` | 钉住各夹具完整命中集合，让 labels 未锚定规则的新增/消失也在 CI 可见 |
| CI 门禁 | `npm test` 执行准确性与钉板测试，`npm run coverage` 再核对逐字来源完整性与 precision 红线 |

当前可复现实测（2026-07-17）：`npm run accuracy` 覆盖 89 条人工标注，**TP=55 / FP=0 / FN=0，precision=recall=1.000**；这只证明已标注语料上的表现，不外推为所有真实项目零误报/零漏报。

2026-11-07 已交付 confidence 显性化：JSON 保留可选原始值，Markdown、桌面依据和交接导出显示同一含义；不将缺值补为高置信，不改变严重度或匹配。兼容性与验证记录见 [报告置信度契约](24-rule-confidence.md)。

仍属后续演进而非当前能力：

| 待演进项 | 触发与边界 |
|---|---|
| 逐规则 YAML 内嵌正/反例 | 当集中 labels/fixture pins 已难以定位规则级回归时，再评估 schema 与迁移成本 |
| 抑制留痕 | 需要明确注释语法、审计记录与“不静默消失”报告语义后实施 |

后续规则扩充继续受现有数字地基约束：每批同时报告新增覆盖、逐字核验和 precision，不能用扩覆盖掩盖准确性下降。

### 4.3 真实卡点分布 与 规则再平衡(R3,最锋利的发现)

把规则投入对齐**真实世界的痛点分布**,而非"容易做的"。真实卡点排序(官方"常见"措辞 + 三个社区 lane 交叉,**定性非数字**,见 §14 缺口):

> **备案排队**(卡点之王,老手也只能等)>**域名白名单**>**类目错配**>**登录前置**>**隐私指引**>**资质缺失**

**错配诊断**:我们 63 条规则里 **隐私占 23 条(约 37%),全打"隐私指引"这一个痛点**(含陀螺仪/磁场等传感器 7 条低频长尾);而**备案/域名/类目三大真实墙合计只有约 5 条**。

| 行动 | 说明 |
|---|---|
| **重配投入** | 隐私 21 条保留(廉价、正确)但**别再往传感器长尾加**;准确性打磨转向**域名(最可机检)+ 类目(当前漏检)** |
| **补漏检①类目覆盖** | `category.*` 只有医疗/电商 2 条 signal,漏掉社区最痛的 UGC→社交/资讯/内容类(补 `["笔记","社区","论坛","问答","资讯"]` 等 signal) |
| **补漏检②UGC 内容安全** | `imgSecCheck`/`msgSecCheck`/`mediaCheckAsync` 可静态扫——"有 UGC 信号但**未检出**内容安全 API → 警告",从软提醒升级为硬检测 |
| **补漏检③iOS 付费残留** | 后台关了支付但前端仍留"购买/开通 VIP"关键词残留 → 提示(扫前端付费关键词) |
| **备案是引导问题不是检测问题** | 卡点之王却只有 1 条被动 `manual_required` 规则;价值在**期望管理 + 进度跟踪**(明确告知五环节 + 管局约 1–3 周不可加急),把"未知的等待"变"已知的等待" |

---

## 5. LLM 巡航:能力梯度 + 不做担保 6 护栏

LLM 锚在规则大脑上,在"上线"上能做的(低→高):翻译官 → 问诊访谈 → 类目顾问 → 材料预审 → 拒因编排 → 后台陪练(读你截图带你点,但不代点)→ 进度教练 → **旅程项目经理**(规划最快路径、并行化人肉等待与代码活)→ **外部 agent 编排**(包住 Claude Code 跑上线 QA 循环)。天花板:一个懂上线的朋友坐你旁边,只是他读过所有官方文档、记得所有坑、还能帮你改代码。

**不做担保 6 护栏**(越主动/自动,越要硬):
1. **单一事实源**:每条合规判断只来自大脑工具调用返回的结构化规则字段,LLM 只能复述、不能下判断。
2. **接地护栏**:system prompt 约束 LLM 只说规则字段;禁词运行时输出过滤。
3. **abstain over fabricate**:无规则覆盖就说"这我核验不了,去看官方页",绝不即兴编。
4. **可见出处**:每条断言打标 已核验(绿)/ AI 生成(灰),用户永远分得清。
5. **永不越界的交接**:官方动作恒 `manual_required`,工具读就绪度 + 给深链,用户勾"已完成",agent 永不提交。
6. **新鲜度可见**:`last_verified` 内联随处可见,陈旧自显,接 rot 监控 + issue 反馈回路。

---

## 6. 实时同步闭环

**确定性底座提供"真相的实时流",LLM 在这条流上巡航。** LLM 辅助能扩大多少,取决于底座有多实时。

- **代码侧(自动;R2 成熟技术裁决)**:Rust **`notify` crate**(rust-analyzer/deno/cargo-watch 在用的事实标准)+ **`notify-debouncer-full`**(300ms 窗口,自动合并编辑器 atomic-save 噪声)监听项目文件夹 → **全量重扫**(`scanProject` 已毫秒级,**不做增量**——增量要处理重命名/删除/条件编译边界,三倍复杂度换毫秒级优化,负回报)→ `app.emit("preflight-result")` → 前端 `listen` 写 Zustand。watcher 住在 **Rust 核**(持 `AppHandle` 可直接 emit),过滤扩展名复用 scanner 的 `SCAN_EXT`/`IGNORE_DIRS`。
- **触发边界(R3 实用性铁律)**:preflight **在上传/上线边界跑、开发期静默**——官方代码扫描"每次预览都弹、还不能关"被开发者集体开骂;要懂"WIP 未用文件 ≠ 缺陷"。
- **项目侧(部分人确认)**:状态机 + 记忆(SQLite)跨周续上;能检的自动检(域名 HTTPS/备案 ping);不能检的提醒 + 用户确认(备案审核工信部无个人 API);提审被拒 → explain → 修复 → 重检。
- LLM 在此流上:变更影响分析 · 主动巡航 · 回归守护 · 旅程规划 · 外部 agent 编排 · 进度叙述。

---

## 7. 架构

> 📐 本节是组件级骨架;**记忆/提示词/持久化的工程级规范(注入分层 + 生命周期 + 存储引擎 + 完整 SQL DDL)见 [`docs/09`](09-memory-context-architecture.md)**,它把 §5/§7.1/§11.3 的草图回填成可单测工件与确定性 schema。

### 7.1 历史候选组件图（未按此图实施）

下图保留方案演变背景，不作为当前实现或依赖清单；本轮继续复用现有 Vanilla TypeScript 前端与 Node broker，不另建 Rust 模型运行时。
```
[Webview: React+Vite+Zustand+shadcn] 对话 / 项目+阶段侧栏 / 设置 / xterm.js 终端 / diff 面板
   <-> Tauri IPC (ipc::Channel<ChatDelta>) <->
[Rust 核] ProviderAdapter(OpenAI 兼容优先)→ AgentRuntime(工具循环)→ McpClient(rmcp, stdio)
          → { 内置 weapp-shipmate 大脑 sidecar(builtin=true,不可删), [第三方 MCP servers — 后置] }
   + SQLite(rusqlite,迁移版本化):sessions / messages / providers / mcp_servers / memories
   + OS 钥匙串(keyring-rs / tauri-plugin-keyring):API key;DB 只存 key_ref
   + git(git2-rs + vendored-libgit2,用户机无需装 git;Cargo/GitButler 在用)
   + PTY(tauri-plugin-pty):项目级命令器 / 可选 Claude Code-Codex
   + 文件监听(notify + notify-debouncer-full):全量重扫触发
   + 系统托盘 + 通知(Tauri tray-icon + tauri-plugin-notification):后台陪练
```

### 7.2 大脑当内置 MCP ✅(关键决定)
把 `bin/weapp-shipmate-mcp.mjs`(已是合规·极简依赖 stdio JSON-RPC server,仅 js-yaml)当 Node sidecar,`mcp_servers` 表种一行 `builtin=true` 不可删,McpClient 启动自动拉起。check/guide/explain 成为 AgentRuntime 看到的同一工具注册表里的 3 个工具,经与任何用户 MCP server **完全相同**的调用路径派发。大脑字节级不变(决策 #8 零返工),同文件同时服务独立 `.mcpb`。**这保证规则永远是事实源**:LLM 拿到的是结构化工具结果,必须引用、不能编。

### 7.3 模型连接与凭据（现状及后续边界）

当前支持 OpenAI、Anthropic、Google、OpenRouter、Ollama 的文本聊天适配；OAuth 只接入 OpenRouter PKCE。自定义 Base URL、系统凭据保存及通用订阅账号登录尚未完成。连接目录成功不等于推理调用成功，真实外部账号须单独验收。

当前凭据由本机 Node broker 在活动会话内持有；不能把计划中的 OS 钥匙串描述为已经实现。API key 在用户输入及提交连接时会经过界面和相应传输边界，因此撤回「key 永不进 WebView/IPC/后端」的绝对表述。后续系统凭据方案需分别验证录入、保存、使用、注销和错误恢复，普通状态响应不应回传密钥。

原文关于竞品普遍明文保存密钥的概括没有逐产品、逐版本证据，予以撤回。2026-10-22 调研未找到 [Tauri 官方 Stronghold 文档](https://v2.tauri.app/plugin/stronghold/)的弃用声明，不再以「官方将弃用」作为选型理由。系统凭据库是待验证的集成方向，不代表已证明所有替代方案不安全。确定性规则工具无密钥可用，AI 辅助另行连接模型服务。

---

## 8. 设计系统

### 8.1 方向 ✅
**"engineered calm" + 专业版 Claude 桌面的暖,Linear 的结构清晰——清晰第一。** 颜色只承载意义不做装饰:整屏中性灰白,只有三种带意义的色。船友"航程"品牌张力收敛为"清楚的阶段脊柱",不花哨。

### 8.2 栈与 token(提议)
> 以下为历史视觉与技术候选，React 迁移建议已被「优先复用现有组件」取代；当前依赖见[功能台账](12-current-capabilities.md)。
- 栈:React + Vite + Zustand + Tailwind + Radix + shadcn/ui(源码内置、离线本地、无 CDN),CSS 变量主题化;xterm.js 终端;react-markdown + 代码高亮;字体本地打包。**P2.1 脚手架可起于 `dannysmith/tauri-template`**(R1:Tauri v2 + React 19 + shadcn/ui v4 + Tailwind v4,MIT,且内置 Claude Code 集成)。
- 配色(暖色友好,跟 host/Claude 同系、自动适配明暗):中性灰白为底 + 一抹赭橙(`#c15f3c`)只给"当前/主操作";语义 绿=已核验/通过、黄=警告、红=阻断。深度靠表面阶梯不靠阴影。
- 字体:Inter(UI)+ JetBrains/Geist Mono(终端/规则 id/路径/已核验输出——mono 是"可信工程工具"最便宜的信号,也把"已核验规则"和"AI 散文"在视觉上分开)。
- token:radius 6/8/10,8px 栅格,动效 120–200ms ease-out 无回弹。规避五种业余 tell(纯黑阴影 / 处处描边 / 混用圆角 / 强调色滥用 / 不对齐)。

### 8.3 四区信息架构
左栏(项目列表 + 8 阶段脊柱/会话 + 工程开关 + 设置)· 中间(对话/agent)· 右或下(终端 + diff/预览,agent 动手才现)· ⌘K 命令面板贯穿。

### 8.4 信任可视化(R1 范式:Cline 左色条 step 卡)
操作可视化(像 Claude Code 显示工具调用,**左色条 step 卡 + 可折叠**:灰运行/黄分析/绿过/红败/紫已操作,pass 默认折叠、fail 默认展开)+ **折叠 Insight 块**(行动前一块浅底/斜体 rationale,确认后折叠)+ per-file diff 预览批准 + checkpoint 分隔线(可回滚)+ 可点选项 chip + 绿/灰双标。

### 8.5 mockup 索引(前序会话产出,作为施工参考)
主界面四区 · 阶段工作区(ICP 备案详情)· BYO-key 设置页 · 完整聊天页 · 健康检查模式仪表盘 · 实时同步闭环图。

---

## 9. 路线 P2.0 → P3

| 阶段 | 范围 | 为什么这么排 |
|---|---|---|
| **P2.0 ✅** | 薄外壳 + 大脑 sidecar(Tauri 2,vanilla TS) | 已发布;证明 sidecar 边界、外壳可丢 |
| **P2.0.5(可穿插，部分已交付)** | `corpus/labels.json` + `scripts/accuracy.mjs` + CI 红线已落地；confidence 显性化已交付；逐规则 YAML 内嵌反例与 suppression 留痕仍按 §4.2 后续触发 | 准确性契约与报告可解释性；显示变更须通过桌面验收，现有准确率数字继续约束后续规则扩充，与 P2.1 可并行 |
| **P2.1** | 前端换骨:React+shadcn,四区 IA + ⌘K(mock 数据、无 LLM);本地字体;收紧 CSP | 可独立回退但并非零风险：新依赖、CSP/Tauri 权限和信息架构都须重新审批与验证。触发点以 outreach 信息架构反馈和 `EVOLUTION_ROADMAP.md` M1 为准；视觉规范源 = `desktop/design-previews/` 14 屏 + 用户 Claude design 稿 |
| **P2.2** | 大脑接成内置 MCP + 确定性流 UI(8 阶段 + 交接闸门 + check 接真实文件夹 + SQLite + 无 key 首启分流),**仍无 LLM** | 这一阶段单独就是个可发布的诚实产品;零 LLM 风险、零担保暴露;最可砍 |
| **P2.3** | BYO-key 对话 + 接地 agent loop(provider 适配 + keychain broker + 5 问访谈 + 护栏 + 绿/灰双标) | 辅助层叠在已正确的确定性核心上 |
| **P2.4** | 项目命令器(PTY + 分级 Run Mode + diff 审核)+ 工程体检开关 + 类目顾问 + 旅程 PM + 健康检查模式 + 后台陪练(托盘通知) | "真帮你上线"那一下,价值高风险高,放信任层验证后 |
| **P3** | 记忆 / 浅色主题 / 内置 Claude Code-Codex / **第三方 MCP 插件 + M1–M9 安全基线(§13)** / rot 驱动的新鲜度刷新 | 留存与自维护,全可延后 |

---

## 10. 待决策(均带推荐 / 已决记 ✅)

1. **Node 运行时随包** → 推荐自包含 SEA 二进制(小白装不了 Node)。❓
2. **首屏默认模型 vs BYO-key only** → 推荐 BYO-key only,**但确定性流无 key 也能用**;有赞助再议托管默认(那是唯一会引入后端+成本的事)。❓
3. **agent 自动化深度** → 推荐"命令器走白名单+逐条批准"(P2.4 才上);可深到"自动上传开发版,但绝不替你点提交审核"(`miniprogram-ci` 的 preview/upload 可自动,submit/publish 永远人肉)。❓
4. **前端现在重写 vs 渐进** → 推荐现在重写(P2.1;设计标杆是硬要求,外壳本就可丢)。❓
5. **通用 agent 功能的呈现** → 推荐"present-but-quiet",首页是上线脊柱不是聊天框。❓
6. **第三方 MCP 插件取舍** → **✅ 已决:后置**。P2 只做内置可信大脑(零沙箱风险);第三方 MCP + M1–M9 安全基线(§13)留到 P3,作差异化弹药。理由:"简单优先 + 安全第一"两条灶台都指向"先别引入一个全行业都没解好的攻击面"。

---

## 11. 功能深挖(逐项已调研,带成熟技术裁决)

> 三轮调研把原"待深挖清单"逐项填实。每项 = 成熟技术裁决 + 关键设计 + 状态。轻重/复用判断汇总见 §12。

### 11.1 类目顾问 ✅设计完成(数据待官方逐字采集 ⚠️)
**铁律(R3):"代码里有没有 X" 可以断言;"X 用来做什么业务" 永远问用户。** high 置信只有三类——`<web-view>`+个人主体(硬拦截,官方逐字"个人类型小程序暂不支持")、`wx.requestPayment`+个人主体、出站域名;**凡涉及业务实质/经营模式一律 low/medium + `manual_required` + 进 `selfCheck` 自查区**(复用现有 `guide.mjs` 路由,不改架构)。

判定表草案(condensed;✅ 项已落地):

| signal(代码可检) | 候选类目 | confidence | 问用户? | 失败模式 / 诚实表达 |
|---|---|---|---|---|
| `<web-view>` + 个人主体 | (不限) | **high** | 否(硬拦截) | 已落地 `domain.web-view-business` |
| `wx.requestPayment` + 个人主体 | (不限) | **high** | 否 | 已落地 `payment.requires-merchant`(⚠️ 见 §14) |
| 出站域名 | (不限) | **high** | 否 | 已落地 `domain.request-whitelist`;动态拼接出 `manual_only` |
| 下单/购物车/商城 | 自营电商 **或** 平台电商 | **low** | **是** | 自营通常不需 EDI、平台需《增值电信业务经营许可证》;代码分不清→给双分叉、不替选 |
| 问诊/挂号/处方/医生/买药 | 医疗服务 | medium | **是** | 已落地 `category.medical-hint`;个人主体不可 + 需《医疗机构执业许可证》 |
| 预约/表单(无医疗词) | 工具-预约/报名(个人可) | medium | **是** | **同码反向**:医疗挂号(个人不可)vs 普通预约(个人可)——必问业务性质 |
| 资讯/文章/新闻 | 普通展示 / 新闻资讯 / 教育 | **low** | **是** | 时政新闻采编需《互联网新闻信息服务许可证》;问"是否含时政新闻采编" |
| 金融/理财/借贷 | 金融业 | **low** | **是** | 个人不可 + 需《金融许可证》;词命中≠金融业务,永远 manual |
| `<live-pusher>` 直播 | 直播类 | **low→暂缓** | **是** | 无逐字资质依据,只软提示不断言(宁缺毋造) |

**个人主体白名单 9 类**(R1+R3,⚠️ 二级类目需官方复核):快递查件 / 教育信息展示 / 代驾 / 丽人婚庆家政环保回收 / 餐厅排队点评 / 出境 WiFi 旅游攻略 / 工具(含"预约/报名""健康管理")/ 商业服务(律师需执业资格证)/ 体育。共性:信息展示 / 工具 / 轻服务;一旦涉及交易撮合(平台电商)、医疗、金融、新闻、直播,基本需企业主体 + 专项资质。

**数据资产(护城河)**:官方类目无任何开源结构化数据集 → 自建 `rules/category-tree.yaml`(三层主体 × 一级/二级 × 资质逐字名),与 `categories.yaml`(signal→预警)分离。**采集防腐**:用 Playwright 渲染抓官方 SPA(WebFetch 直取返回空壳)→ 人工逐字复核 → `draft:true` 暂存 → promote;定时 hash diff 官方页 → 变更开 issue(复用 `official-change.md` 模板)→ 人工复核闸。官方免责逐字用作产品固定脚注。

### 11.2 工程体检开关"跑起来" ✅技术底座定(P2.4)
成熟技术见 §3.2 + §12。**交互闭环**:开关(`capabilities.toml` 单一事实源,Rust `notify` 监听,关闭=对应 MCP 工具从 `tools/list` 移除=LLM 看不到调不了,**比塞 prompt 强**)→ agent 任务 → 左色条 step 卡进度 → 修复清单(per-file diff)→ 回归(跑 `accuracy.mjs` + 黄金快照)。能力做成新增 typed MCP 工具(`scan_quality`/`scan_security`/`propose_fix`/`run_regression`/`git_commit_help`),与 check/guide/explain 同注册表;done-state 归管线代码、永不归 LLM。

### 11.3 记忆模型 + MCP 插件管理页
- **记忆(R1+R2)**:markdown 真源(`memory/MEMORY.md` 索引 + topic 文件,人可编辑、git 可追)+ **SQLite FTS5** 关键词索引(**v1 不上向量**;单机单用户 sqlite-vec 留 v2)+ mem0 式"回灌抽取"(把已有记忆喂回抽取 prompt 决定 ADD/UPDATE/NOOP)+ Open WebUI 式可编辑条目 + ChatGPT 式"已记住"轻提示。**工程级规格(2 态生命周期 / 三类 TTL / 写路径硬拦合规判断 / SQL DDL)见 [`docs/09`](09-memory-context-architecture.md) §2/§4。** 状态:P3。
- **MCP 插件管理页**:**✅ 后置**(§10.6 / §13)。P2 只内置可信大脑。

### 11.4 新手引导首启 ✅范式定(P2.2 无 key / P2.3 key)
**确定性先行 = Semgrep 模型**(R1):无 key 先跑 63 条规则(以 `npm run validate` 实测为准),首启即出结构化报告(我们极简依赖确定性大脑天生适配,我们调研的同类桌面客户端尚未见做透"能力预览态"的先例)。**Chatbox 式双卡分流**:Q1"你的小程序上线了吗?"(引导 vs 健康检查)+ Q2"你有 API key 吗?"(无 key 确定性模式 / 有 key AI 模式),都可"跳过、先看规则库"。**别学 Cherry Studio** 把零基础用户直接丢进需配 provider 的全界面。

### 11.5 健康检查模式 · 合规漂移引擎 ✅官方背书已找到(P2.4)
官方逐字依据见 §2.2(运营规范"动态更新、请定期复查" + 类目"随政策变化、仅供参考")。四类漂移均有 verbatim 背书:类目漂移 / 规范自更新 / 隐私指引复审(每次提审比对"隐私接口调用 vs 隐私协议",不一致即拦)/ 备案变更(不及时更新→警告/封禁/强制注销)。复用 `rot` 引擎,上线后变成用户可见价值。

### 11.6 后台陪练"画中画" ✅技术裁决(P2.4)
**Tauri 官方 tray-icon + tauri-plugin-notification**(P1 可上、稳、零风险):托盘图标随状态切换(检测中/有发现)+ 原生通知"不打断地提醒";拦 `CloseRequested`→hide 实现后台常驻;macOS `ActivationPolicy::Accessory` 隐藏 Dock。**置顶浮窗 PiP 后置**(第二 WebviewWindow + always_on_top 有 macOS 全屏/Wayland/多屏边缘 bug)。**别做**真浏览器 Document PiP(WebView 支持未知)、自建点击穿透覆盖层、独立 daemon。读截图带你点但不代点(灶台)。

### 11.7 旅程项目经理 ✅技术裁决(P2.4,极轻)
**`flow.yaml` 已是半成 DAG**:`requires_stage`=依赖边,`applies_when`=分支。压缩 wall-clock 的算法 = 拓扑排序里 in-degree=0 的那批=当前可并行。落法:`flow.yaml` 加 `blocking_type:"human_wait"|"auto"`(+可选 `est_wait_days`)注解 + Node 大脑 ~40 行 Kahn 批次 `computeParallel` + `plan_state.json` + UI markdown 双分区清单("现在可同时做 X/Y" vs "等待中:备案审核 7–20 工作日")。**别上 BPMN/Temporal/XState/graphlib**(单机 8 步向导,全是过度工程);**别加 `parallelizable_with` 字段**(与 `requires_stage` 双真相源)。

### 11.8 P2 测试策略 ✅(P2.1 起 L3)
**分层金字塔**(R2):L1 大脑(已 83 例 `node:test`,保持绿)/ L2 Rust command(`tauri::test::mock_builder` + `cargo test`,`features=["test"]`)/ L3 前端(Vitest + React Testing Library + `mockIPC`,P2.1 同步引入)/ L4 e2e(**tauri-driver Windows·Linux 官方背书生产级;macOS 官方缺口**,社区/商业补丁 0.x)。回归:Vitest `toMatchFileSnapshot` 直接对接现有 `.check.json`(CI 下默认不更新、有 diff 即 fail)。**最小可行**:P2.1 先补 L2+L3+snapshot(CI 秒跑、不依赖打包 exe),L4 等壳稳定后作定期构建关卡。这直接解掉"开发态 `desktop.exe` 无法用通用截屏自动化测"的限制——那本质是 L4 问题,L1–L3 绕开它。

### 11.9 安全:MCP 插件沙箱/同意 ✅已调研(整体后置,见 §13)

---

## 12. 成熟技术底座总表(R2)

| 功能 | 成熟技术裁决 | 复用/自建 | 轻重 |
|---|---|---|---|
| 类目顾问 | 官方逐字类目数据(自建护城河)+ 现有 confidence/selfCheck 引擎 | 数据自建·引擎复用 | 中 |
| 健康漂移引擎 | 官方"动态文档定期复查"背书 + `rot` | 复用 | 轻 |
| 工程体检 | ESLint 可编程 API + eslint-plugin-security + Opengrep(本地) | 复用 | 中 |
| Fix·自动修 | jsdiff/`similar` + `diffy` + per-file 批准 + Aider 式 git 回滚 | 复用范式 | 中 |
| Fix·修复 prompt | SARIF 2.1.0 + 结构化模板(带框架/wx 上下文) | 自建轻 | 轻 |
| git 工程化 | git2-rs + vendored-libgit2(无需系统 git);push 永远人肉 | 复用 | 轻 |
| 回归测试 | `node:test` 内置快照 / Vitest `toMatchFileSnapshot`(零额外依赖优先) | 复用 | 轻 |
| 能力即开关 | MCP 工具 + 本地 capability registry + 确定性管线 | 复用范式 | 轻 |
| 记忆 | markdown 真源 + SQLite FTS5(不上向量)+ mem0 回灌 | 复用范式 | 中 |
| 旅程项目经理 | flow.yaml 现有 DAG + 40 行 Kahn 批次 + `blocking_type` 注解 | 自建极轻 | 极轻 |
| 实时同步 | `notify` + notify-debouncer-full + 全量重扫 + Tauri emit | 复用 | 轻 |
| 后台陪练 | Tauri tray + notification(PiP 后置) | 复用官方 | 轻 |
| BYO-key | keyring-rs + key 不过 IPC(broker) | 复用 | 中 |
| P2 测试 | node test / cargo mock / Vitest+mockIPC / tauri-driver | 复用 | 中 |
| 准确性工程 | labels.json + accuracy.mjs + 逐规则反例(借 Semgrep/ESLint 法不引运行时) | 自建轻 | 轻 |
| 第三方 MCP 页 | M1–M9 安全基线(§13)——**唯一硬骨头,已后置** | 复用范式+自建集成 | 重 |

**贯穿判断**:几乎全是"复用成熟件,自建只剩三处轻活"(微信特有规则、SARIF→修复 prompt 模板、快照路径 normalize),且栈高度内聚——**Node 脑**扛 ESLint+快照+accuracy、**Rust 核**扛 git2-rs+diffy+notify+keyring、**React**扛 diff 批准+开关。与决策 #8"换壳零返工、大脑当 MCP"完全同构。

---

## 13. 第三方 MCP 插件安全(✅ 后置,M1–M9 已调研备料)

**为何后置**:R2 调研结论——**没有成熟的跨平台进程沙箱**,Claude Desktop/Cursor/Cline 全把第三方 MCP server 当**无沙箱子进程**裸跑(arXiv 2511.20920 明确记录)。真实战果:tool poisoning(1899 仓 5.5% 中招、72.8% 成功率)、rug pull(CVE-2025-54136)、密钥窃取(postmark-mcp 偷邮件、devtools-assistant 偷 SSH/AWS key)。对"安全第一"的产品,这是不该提前引入的攻击面。

**M1–M9 最小安全基线**(日后做时的施工标准,做到即领先 Claude Desktop/Cursor/Cline):
1. **M1** 连接时显式同意(显示完整命令不截断 + 第三方代码警告 + 可取消)。
2. **M2** 每次工具执行前人在环批准(默认开;"总是允许"按工具 opt-in;读类首会话后可默认、写/破坏类永远问)。
3. **M3** 工具结果视为不可信数据,不自动执行其中指令(防间接 prompt 注入)。
4. **M4** 工具描述 hash 钉定:批准时存 hash,变更即挂起 + 给 diff + 重审(防 rug pull)。
5. **M5** **env 清洗**:子进程 `env_clear()` + 白名单,BYO-key **绝不**进任何 MCP server 的 env/IPC/工具参数;**broker 模式**(key 留 Rust 核、核自己调 LLM 只回结果)。
6. **M6** 首用前展示完整工具清单(名 + 描述 + 参数 schema)供审。
7. **M7** 每次工具调用审计日志(时间/server/工具/参数/状态,本地持久)。
8. **M8** 远程 server 强制 TLS + 阻断私网/云元数据 IP(防 SSRF)。
9. **M9** 任何 server 配置变更 → 重新走 M1+M6 同意(CVE-2025-54136 的直接修复)。

> 进程沙箱(OS 原生 sandbox-exec/bubblewrap/AppContainer 各平台不统一;Deno 权限模型对 JS/TS server 可行;WASM 是长期理想但生态未就绪)列为 M1–M9 之上的 P3+ 增强,非首发必需。
> **密钥隔离诚实边界**:"key 不给子进程"强可执行;"子进程读不到父进程内存"仅 macOS Hardened Runtime 默认保证,Win/Linux 同用户进程可互读内存——故 broker 模式 + key 在 Rust 核内存最短生命周期是底线,真隔离需 OS 沙箱(后置)。

---

## 14. 调研索引 与 ⚠️ 待核验 backlog(宁缺毋造)

**三轮调研**:R1 域内合规 + 产品范式 + 竞品 / R2 每功能成熟技术底座 / R3 准确性 + 实用性(真实拒审数据)。全部原始来源 URL 在会话调研产物中逐条留存;关键官方源:`developers.weixin.qq.com/miniprogram/product/material/`(类目)、`/product/`(运营规范)、`/product/reject.html`(拒因)、`/dev/framework/user-privacy/`(隐私)、`/dev/component/web-view.html`、`pay.weixin.qq.com/.../introduction.html`(支付准入)。

**落地/引用前必须二次核验的项**(把"宁缺毋造"做成可见清单):

| ⚠️ 项 | 状态 | 行动 |
|---|---|---|
| R1/R2 部分 star/下载数字(Cline/Aider stars、MCP 下载量、Agent Skills 发布时间) | 子 agent 报偏高,范式结论可靠 | 正式文档/对外引用前逐个核实,本文已不写具体数值 |
| 类目二级清单(§11.1 白名单) | 来自 CSDN 镜像交叉核对 | Playwright 渲染官方 material 页**逐字复核**后才能 promote 为默认规则,暂 `medium`+`draft` |
| "个人主体不支持微信支付" | 仅间接证据(支付准入列 5 类主体无"个人") | `payment.requires-merchant` 现标 high,建议人工开页截图坐实,否则降 medium |
| 运营规范 5.x 正文(5.7 类目/5.13 虚拟支付/5.35 备案变更) | 仅取到标题级 | 浏览器渲染抓正文逐字后入库 |
| `getUserProfile`/`getPhoneNumber`/`getLocation` 升 high + 补漏 API(`getRealtimePhoneNumber`/`joinVoIPChat`/`live-player`) | 官方隐私映射表已逐字列出 | 可执行(R1 已核 DOM);落地时一并补 |
| auto-fix vs fix-prompt 偏好 | 证据薄(邻近领域外推) | 作 dogfood 待验证假设,默认 fix-prompt |
| 真实卡点排序(§4.3) | 全部定性,无硬频率数据(社区声量代理) | 标定性;勿对外宣称百分比 |
| 直播类目资质 | 未找到逐字依据 | 暂缓,只软提示不入规则集 |
| **本机 Playwright MCP 桥接不可用** | R4 实证(Extension connection timeout) | **阻塞 SPA 逐字摄取(§15.3 批2/批4)**;须恢复 Playwright 或改 browser MCP/curl 路径后才能取 SPA 可信逐字 |
| **WebFetch 会编造章节号 + 改写证名** | R4 实证(把"律师执业资格证"写成"律师事务所执业许可证书";同一条款号 5.13/5.23.7 漂移) | **逐字只信服务端 curl 正文或 Playwright 渲染快照**,WebFetch 摘要永不作逐字源;给整句让它判"是否出现"会因确认偏差倾向回 YES |
| 内容安全接口 URL 已迁移 | 旧 `security.imgSecCheck/msgSecCheck` 路径 404(v1 2021-09 停更) | 用 `OpenApiDoc/sec-center/sec-check/` 新路径;两接口是 UGC 过滤实现手段、非上线硬门槛,设 info 引导而非 blocker |

---

## 15. 官方文档覆盖地图(R4,2026-06-22)

> 第四轮:8 路并行测绘「上线/合规/运营」官方文档全集 × 对比现有规则集(以 `npm run validate` 实测为准)做 gap 分析 × 个人开发者优先分级。这把 §4.3「规则再平衡」从方向变成了**枚举出来、带官方 URL、分好层的 backlog**。落地受 §15.4 摄取流水线 + "覆盖与 precision 同速增长"红线约束。

### 15.1 覆盖率(去重后 72 个官方上线/合规要求条目)

| 维度 | 数 |
|---|---|
| 官方要求条目(去重) | 72 |
| 已覆盖(有规则且逐字) | 36 |
| 部分覆盖 | 14 |
| **缺口(官方有、我们没)** | **22** |
| 个人开发者必经 | 48 |
| **个人开发者必经里的缺口** | **19 ← 最高优先靶子** |

### 15.2 分层 backlog(44 项:T0 15 / T1 11 / T2 18)· 状态对账 2026-07-02:**T0 已入库 11/15,待做 3,阻塞 1**

**T0 · 个人开发者必经(最高优先)** — 机检?=能否静态扫出 · 逐字?=官方逐字可抓(✅)/ 需渲染复核(⚠️) · 状态=✅已入库/🔜下一批/⚠️阻塞

| slug | 主题 | 机检? | 逐字? | 状态 |
|---|---|---|---|---|
| personal-open-categories-whitelist | 个人主体开放类目白名单(material 整表 curl 可逐字;"服务超主体类目"的正向数据源) | 否 | ✅ | ✅ category.personal-subject-scope(以官方个人开放类目表为源) |
| service-exceeds-subject-scope | 服务超出主体类型支持的类目范围(总则) | 否 | ⚠️ | ✅ 由 category.personal-subject-scope 覆盖 |
| requiredPrivateInfos-location8 | 8 个地理位置接口须在 app.json `requiredPrivateInfos` 声明否则不可用 | **是** | ✅ | ✅ crosscheck consistency.requiredPrivateInfos(07-02 起有召回锚点) |
| privacy-check-auto-enabled | 隐私授权机制 2023-10-17 起强制启用 | 否 | ✅ | ✅ privacy.auth-mechanism-enabled |
| upp-must-configure | 处理个人信息须配《隐私保护指引》且审核通过才能提版本 | 部分 | ✅ | ✅ privacy.upp-required |
| filing.miit-sms-24h | 工信部短信核验须 24h 内完成,逾期驳回 | 否 | ✅ | 🔜 下一批(curl 逐字可做) |
| filing.individual-id-materials | 个人备案身份证件(有效期 >1 月、清晰不遮挡) | 否 | ✅ | ✅ filing.individual-id-materials |
| filing.face-verification | 负责人人脸核身环境/着装要求 | 否 | ✅ | ✅ filing.face-verification |
| domain.https-wss-only | 服务器域名只支持 https/wss(http/ws 真机被拦) | **是** | ✅ | 🔜 作规则条目(机检面已由 crosscheck security.insecure-request 覆盖) |
| domain.must-icp-filed | 服务器域名须经 ICP 备案 | 否 | ✅ | ✅ domain.must-icp-filed |
| domain.web-view-personal | 个人类型小程序不支持 web-view(补硬 blocker 逐字 + 对 personal 升 blocker) | 部分 | ✅ | ✅ domain.web-view-personal(含企业主体 FP-guard) |
| login-after-experience | 不得未体验即强制授权登录 / 注册墙 | 部分 | ✅ | ✅ login.after-experience |
| logout-option-discoverable | 含账户系统须提供易发现的"退出"选项 | 否 | ⚠️ | ⚠️ 阻塞:需渲染复核(Playwright 桥不可用) |
| cat-ai-content-labeling | AI 生成内容须显著标注"AI 生成"(2026 高频,通用义务) | 否 | ✅ | 🔜 下一批 |
| info-match-recall-gaps | 隐私 match 召回补齐(getRealtimePhoneNumber/getFuzzyLocation 等)+ 三条 confidence medium→high | **是** | ✅ | ✅ fixtures/recall-apis + match 扩；confidence 显性化见 [docs/24](24-rule-confidence.md) |

> **T0 剩余 4 项裁决(2026-07-02)**:不卡 v0.1.0 预览发布——3 项 🔜 走 curl 逐字流水线入 0.1.1,logout 待 Playwright 恢复;预览版价值在既有 63 条。

**T1(11)· 通用上线必经** — 隐私同意前置、备案变更/注销(运营期义务)、类目不符正面表述、注销删数据、单类目排除项(个人教育不得卖课/直播)、个人"律师"需《律师执业资格证》、支付须已认证(个人无法企业认证→几乎堵死)、未成年有害内容、内容禁止总则、数据安全保护措施。**已入库(07-02 对账)**:data.delete-on-request、category.law-hint、category.education-hint、content.no-illegal、data.security-measures、payment.requires-merchant(支付认证面)、minor.protect(未成年,建库即有);其余走批2。
**T2(18)· 企业/进阶/低频** — 金融/外卖/深度合成 AI/时政/直播/医药 类目证名清单(个人未开放→输出"需升级主体"预警而非去办证)、丽人医美边界、类目腐烂 disclaimer、备案时限/额度/前置审批/备案号自动展示/手机号规则、内容安全接口 msgSecCheck(实现手段非门槛)、`api.weixin.qq.com` 不可配域名(可机检)、iOS 虚拟支付新政(证据不足暂缓)。**已入库(07-02 对账)**:category.news/finance/live-hint(资质预警三条)、`api.weixin.qq.com` 机检=crosscheck security.backend-api-in-frontend;其余按批3/批4。

### 15.3 摄取顺序(4 批)+ 关键阻塞

1. **批1 — 可立即做(无需渲染)**:服务端渲染/可 curl 逐字的高确定性页——material(个人类目节一次抄全)/ network.html / pay introduction / 隐私四页 / record_guidelines。本轮 curl 已双向核验逐字命中。按个人开发者价值排序:类目白名单 → 隐私四项 → 备案 → 域名 → 支付认证。
2. **批2 — 须 Playwright + 人工逐字闸**:运营规范主页 `product/` 与 `reject.html` 的 SPA 条款(service-exceeds-scope、logout、no-test-fortune、注销删数据、未成年有害、内容禁止总则…)。
3. **批3**:T2 企业类目证名,批量入库为 navigation 预警("不对个人主体开放、需升级主体")。
4. **批4 — 宁缺毋造暂缓**:iOS 虚拟支付新政、个人备案数量上限、逾期备案后果、运营规范隐私子项——仅社区/媒体线索,先以 agent/知识承载,取得官方稳定逐字前不入规则库。
- **⚠️ 关键阻塞(2026-06-23 复核:已大幅缓解)**:本机 Playwright MCP 桥接仍不可用——错误为 "Extension connection timeout",需用户在本机安装并连接 `Playwright MCP Bridge` Chrome 扩展(agent 无法自装扩展)。**但 curl 复测发现运营规范主页 `product/` 与 `reject.html` 现均为服务端渲染、curl 可取完整正文**(strip 后 reject.html ~16k 字、product/ ~107k 字,5.x 条款逐字可见)——故批2 改走 curl + 人工逐字复核闸即可推进,不再被 Playwright 阻塞;仅个别真交互页才需扩展。

### 15.4 有纪律的摄取流水线(6 环节)

官方页 →(**① 抓取**:服务端渲染页 curl、真 SPA 走 Playwright;**禁止把 WebFetch 摘要当逐字源**——R4 已实证它编造章节号、改写证名)→(**② 逐字条目**:抄 `{slug, verbatimQuote, officialUrl+锚点, 章节号, last_verified, subject_type, severity}`,证据不足则留空标 gap,绝不臆造)→(**③ 人工逐字复核闸**:SPA 来源逐字比对渲染快照,抵御"把整句喂给 WebFetch 它倾向回 YES"的确认偏差)→(**④ 规则化 + precision**:每条配 ≥1 正例 + ≥1 反例跑 precision,不达标不合入;`staticDetectable=yes` 做真机检,partial/no 标 `manual_required` 走引导,不伪装机检 blocker)→(**⑤ 回归**:正反例进回归集全量重跑,防新 signal 误伤旧召回)→(**⑥ 腐烂对抗**:source hash + `last_verified` + 定时 hash diff 开 issue + disclaimer 规则声明"以官方后台提交时实际要求为准")。

> **纪律红线**:覆盖率与 precision 必须同速增长。每批新增规则报「新增覆盖数 / 新增逐字核验数 / precision」三数;逐字核验跟不上覆盖、或 precision 下滑,即停摄取先补复核——否则"规则即数据"退化成 AI slop。这是"涵盖官方文档所有内容"这条雄心在本产品唯一可持续的实现方式。

---

> **一句话收束**:四轮调研把这张图从"愿望清单"变成了"带技术底座 + 准确性度量 + 真实痛点校准 + 枚举出的官方文档覆盖 backlog"的施工图。准确性数字地基已经落地；下一步是在它的门禁下推进覆盖批1(可 curl 逐字的个人开发者必经项,§15.3)、逐规则测试等后续细化，并起 P2.1 前端换骨——每一格都已钉死站在谁的肩膀上,且每条新规则都受"覆盖与 precision 同速增长"红线约束。
