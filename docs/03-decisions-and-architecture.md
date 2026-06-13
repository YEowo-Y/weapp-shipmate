# 03 · 决定与架构

> 定稿日期：2026-06-13。

## 七个已拍板的决定

> 前 4 条是立项首轮拍板的核心决定；#5、#6 是随安全与边界讨论补入的硬约束；#7 是本轮架构评审拍板的导航图模型决定（展开见下文「导航的图模型」）。七条同级生效。

| # | 决定 | 备注 |
|---|---|---|
| 1 | **MVP = 导航知识库 + 代码感知预检引擎"两者并重"** | 两者共用同一份规则库，避免拆成两个项目 |
| 2 | **交付形态 = CLI 内核 + MCP 适配层** | 零依赖 CLI（人可直接用、任意 Agent 可调用）→ 再包 MCP 给 Claude Code / Codex |
| 3 | **规则架构 = "规则即数据 + 社区可维护"** | 政策会腐烂，唯一能对抗的架构 |
| 4 | **第一轮只定位 + 命名，代码骨架二期** | 本目录即"文档先行"的产物 |
| 5 | **v0 不做后台代办 / 不做合规担保** | 官方后台提交、实名、备案、审核发布都由用户本人确认 |
| 6 | **预检默认 local-only** | 不上传源码，不采集 AppSecret、上传密钥、证照等敏感材料 |
| 7 | **导航图与规则内容分两份产物（`flow.yaml` + `rules/*.yaml`）** | 给规则打 `stage` 标签不足以构成决策树；流程骨架单列一份薄编排文件。详见下文 |

---

## 核心架构支点：导航与预检共用一根数据脊柱

**导航和预检不是两个项目，而是同一份「规则知识库」上的两个渲染器：**

- **导航** = 把规则库当**决策树**渲染给人看（你在第几步、下一步点哪）。
- **预检** = 把规则库当**匹配规则集**去比对用户源码（用了 `getUserProfile` → 命中"必填隐私项"规则 → 报给用户）。

> 所以真正要花力气的只有**一件事：把 `rules/*.yaml` 的 schema 设计对**。规则库一旦立住，导航和预检都只是它的"读取视图"。社区 PR 一条规则，两者**同时**更新、不改代码。

这也化解了"两者并重会摊死"的担忧——因为只维护一份事实源，"并重"比分开做更省。

**→ 二期写骨架，第一批数据文件是「流程图 `flow.yaml` + 规则 schema」，不是 CLI 命令。**（为什么是两份而不是一份，见下节。）

---

## 导航的图模型：为什么"给规则打 `stage` 标签"还不够

> 这一节回答一个二期上手就会撞到的问题：**预检和导航真的能共用"同一份"事实源吗？**

把规则集当**匹配规则集**做预检是成立的——一条规则带 `match` + `scanner`，扫到就命中，无序、无前置、是纯函数。但把同一批规则当**决策树**做导航**不成立**：

- 规则集是**集合语义**（命中/不命中，元素之间没有顺序与依赖）。
- 决策树是**图语义**（阶段有先后、有分支、有前置条件）。

给每条规则打一个 `stage: filing | privacy | …` 枚举，得到的只是**分组**，不是树——**分组之间怎么连、谁先谁后、什么条件下跳过哪一支，没有任何字段承载**。例如"不收集敏感信息 → 跳过隐私阶段""没有服务器域名 → 跳过域名阶段""未认证 → 不进备案""备案+类目未过 → 不进提审"，这些**边（edges）与排序**在扁平规则里无处安放——下面的 `flow.yaml` 骨架用 `applies_when` 和 `requires_stage` 把这四条边逐一编码出来。

> 更细粒度的"按输入过滤单条规则"（如"未启用支付 → 不显示支付相关类目规则"）属于**规则级**过滤，由规则自身的 `subject_type` 与二期补充的输入条件承担，不在 `flow.yaml` 的阶段图里——阶段图只管阶段间的边，避免把每条规则的开关也塞进骨架。

**决定：导航图与规则内容分成两份产物（方案 a）。**

- `flow.yaml`（**新增，二期第一批文件之一**）：定义上线阶段的**顺序、分支条件、前置依赖**——即决策树的"骨架"。分支条件只引用 `02` 已定义的导航输入：`subject_type`、`business_type`、`has_payment`、`collects_sensitive`(手机号/位置/头像)、`has_server_domain`。
- `rules/*.yaml`（已设计）：每条规则用 `stage` 把自己**挂到** `flow` 的某个节点上，提供该节点的"内容"（要做什么、为什么、官方来源）。

```yaml
# flow.yaml —— 上线流程的决策树骨架（导航专用；预检不读它）
- stage: registration
  title: "注册小程序账号"
  next: certification
- stage: certification
  title: "主体认证 / 实名"
  next: filing
- stage: filing
  title: "ICP 备案"
  requires_stage: [certification]        # 前置：未认证不进备案
  next: category
- stage: category
  title: "选择服务类目"
  next: privacy
- stage: privacy
  title: "用户隐私保护指引"
  applies_when: "collects_sensitive == true"   # 分支：不收集敏感信息可跳过
  next: domain
- stage: domain
  title: "服务器域名白名单"
  applies_when: "has_server_domain == true"
  next: review
- stage: review
  title: "提交审核"
  requires_stage: [filing, category]
  next: release
- stage: release
  title: "发布上线"
  requires_stage: [review]
  next: null
```

**这是否背叛了"只维护一份事实源"？不。** 准确表述应收窄为：**规则内容**是单一事实源（社区 PR 主要改的是 `rules/*.yaml`）；`flow.yaml` 是一层**薄编排骨架**，阶段数量少（约 8 个）、政策稳定、几乎不随个案变动。两者职责正交——

- 改"某 API 必填哪条隐私项" → 只动 `rules/`，导航与预检同时更新（原叙事仍成立）。
- 改"阶段顺序/分支"（罕见，如官方调整备案前置）→ 只动 `flow.yaml`。

> 把这层薄骨架显式化，胜过把分支逻辑硬编码进 CLI——否则"政策即数据、社区可维护"在导航侧就破功了。`flow.yaml` 同样要带 `last_verified` 与官方来源。

---

## 规则 schema 草图（二期细化，仅示意方向）

schema 要同时支撑三类读法：

- **导航读法**：当前用户处于哪个上线阶段，下一步做什么。
- **预检读法**：源码、配置、页面能力命中了哪条规则。
- **证据读法**：每条结论来自哪条官方或准官方来源，最后什么时候校验。

```yaml
# rules/privacy-apis.yaml —— 隐私 API → 必填隐私指引项
- id: privacy.getUserProfile
  title: "用户信息隐私声明"
  kind: preflight            # preflight（代码感知）| navigation（流程导航）| both
  stage: privacy             # registration | certification | category | filing | privacy | domain | review | release
  subject_type: ["personal", "individual_business", "enterprise"]
  severity: warning          # info | warning | blocker
  confidence: high           # low | medium | high
  match:                     # 预检如何在源码里命中
    api: ["wx.getUserProfile", "wx.getUserInfo"]
    scanner: static_api_call
  requires:                  # 命中后要求用户做什么
    - "在『用户隐私保护指引』中声明：用户信息（昵称、头像）"
  why: "采集用户身份信息，未声明会在审核被拒"
  official_url: "https://developers.weixin.qq.com/..."
  evidence_urls:
    - "https://developers.weixin.qq.com/..."
  source_quote: "官方原文短摘录，避免长引用"
  last_verified: "2026-06-13"   # 每条规则带最后校验日期（不做担保的体现）
  manual_required: true

# rules/categories.yaml —— 功能特征 → 类目建议 + 被拒预警
- id: category.medical-hint
  title: "医疗相关功能类目预警"
  kind: navigation
  stage: category
  subject_type: ["personal", "individual_business", "enterprise"]
  severity: blocker
  confidence: medium
  signal: ["问诊", "挂号", "处方"]
  warn: "涉及医疗，需《医疗机构执业许可证》等资质，个人主体大概率被拒"
  official_url: "https://developers.weixin.qq.com/..."
  evidence_urls:
    - "https://developers.weixin.qq.com/..."
  source_quote: "官方原文短摘录，避免长引用"
  last_verified: "2026-06-13"
  manual_required: true

# rules/domains.yaml —— 源码里的请求域名 → 提醒配白名单
- id: domain.request-whitelist
  title: "服务器域名白名单"
  kind: preflight
  stage: domain
  subject_type: ["personal", "individual_business", "enterprise"]
  severity: warning
  confidence: high
  match:
    api: ["wx.request", "wx.connectSocket", "wx.uploadFile", "wx.downloadFile"]
    scanner: static_api_call
  requires:
    - "把代码中出现的域名加入 mp 后台『开发管理 → 服务器域名』白名单"
  why: "未配置的域名在真机环境会被拦截"
  official_url: "https://developers.weixin.qq.com/..."
  evidence_urls:
    - "https://developers.weixin.qq.com/..."
  source_quote: "官方原文短摘录，避免长引用"
  last_verified: "2026-06-13"
  manual_required: true
```

**schema 的硬约束**：

- 每条规则必带 `official_url`、`source_quote`、`last_verified`。
- 每条规则必带 `stage`、`severity`、`confidence`、`subject_type`。
- 只要涉及官方后台提交、身份认证、备案、类目、发布，就必须 `manual_required: true`。
- 预检规则必须声明 `scanner`，避免把 LLM 猜测当成规则命中。
- 任何合规类输出必须显示"待用户确认"，不得标注为"已合规"或"保证过审"。

## 安全与隐私默认值

- 所有源码预检默认本地执行。
- 默认忽略 `.env*`、`private.*.key`、`project.private.config.json`、`secret*`、`*.pem`、`*.p12`。
- 报告只输出命中的文件路径、API、域名和规则 ID，不回显密钥、手机号、身份证号、Cookie、Token。
- MCP 适配层不得新增远程上传能力；如果未来支持远程服务，必须另写安全设计并默认关闭。

## 输出边界

weapp-shipmate 可以输出：

- 下一步导航清单。
- 需要准备的材料列表。
- 隐私指引字段映射。
- 审核备注建议草稿。
- 拒审原因诊断建议。

weapp-shipmate 不应输出：

- "保证通过审核"。
- "已经合规"。
- 代用户确认的备案 / 类目 / 隐私声明。
- 与官方来源不一致、无法追溯的合规结论。
