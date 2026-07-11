# 02 · 定位与命名

> 定稿日期：2026-06-13。

## 定位

- **一句话（中）**：把 AI 写好的小程序代码，合规地送上微信货架——专治所有"不是写代码"的环节。面向零基础创业者的开源上线领航工具。
- **One-liner (EN)**: An open-source **go-live navigator** that bridges AI coding agents (Claude Code / Codex) and WeChat's official Mini Program ecosystem — covering every **non-coding** step from registration to release.
- **它是什么**：导航 + 代码感知预检 + 合规字段映射 / 待确认草稿 + AI 衔接层；CLI 内核 + MCP 适配；规则即数据、社区保鲜；纯公益、无商业化计划。

## 边界（本节为权威源；README 的边界清单镜像本节，改动以本节为准）

- ❌ 不是代码框架 / UI 库（Taro / uni-app / FirstUI 的地盘）。
- ❌ 不是"Agent 一键上线"（实名 / 备案 / 人工审核不可代劳）。
- ❌ 不是又一个"操作开发者工具"的 MCP（已红海，我们做其下游的合规上线）。
- ❌ 不做合规担保——只给导航 + 官方原文引用 + 最后校验日期，决策权永远在用户。
- ❌ 不代写正式合规文件——只提供字段映射、待确认草稿、审核备注建议和检查清单；用户必须按真实业务确认后再提交。
- ❌ 不上传源码 / 不收集密钥——预检默认本地执行，明确排除 AppSecret、上传密钥、身份证照、营业执照等敏感材料。

## MVP 收敛（2026-06-13 初始范围）

v0 不先做"Agent 平台"，先做可验证的最小闭环：

> 本节保留最初的产品收敛记录，不作为当前实现清单；当前能力与扫描载体以 README、`src/scanner.mjs` 和测试为准。

1. 规则库：30 条以内种子规则，覆盖备案、服务类目、用户隐私保护指引、服务器域名白名单、提交审核材料和常见拒审原因。
2. 问答式导航：根据主体类型、业务类型、是否支付、是否收集敏感信息、是否有服务器域名，输出下一步清单。
3. 本地代码预检：扫描 `wx.request` / `uni.request` 域名、隐私相关 API、`app.json` / `project.config.json` 和高风险 open-type。
4. GitHub 协作入口：Issue 模板先服务规则纠错、拒审案例、官方规则变更和新手卡点。

### 导航输入字段（权威定义）

下表是导航问答收集的输入字段。**这是 `flow.yaml` 的 `applies_when` 与规则过滤唯一可引用的输入集**（`docs/03` 导航图模型、`schemas/flow.schema.json` 均回指本表）。

| 字段 | 类型 | 取值 | 含义 |
|---|---|---|---|
| `subject_type` | enum | `personal` / `individual_business` / `enterprise` | 主体类型 |
| `business_type` | enum | 业务大类（二期随类目细化枚举） | 业务/行业类型 |
| `has_payment` | bool | `true` / `false` | 是否涉及支付 |
| `collects_sensitive` | bool | `true` / `false` | 是否收集敏感信息（手机号/位置/头像等任一即为 true） |
| `has_server_domain` | bool | `true` / `false` | 是否有自有服务器域名 |

> `collects_sensitive` 是"是否收集任一敏感信息"的布尔聚合；**具体是哪一类**敏感信息（决定隐私指引必填哪几项）由规则级 `match`/`signal` 区分，不在此布尔里展开。
>
> 当前实现状态（2026-07-10）：`subject_type` 用于规则适用性过滤，`collects_sensitive` / `has_server_domain` 用于 flow 阶段跳过；`business_type` / `has_payment` 虽已由 CLI/MCP 接收，但尚未参与判定。其语义或弃用方案属于公共接口决策，见 `EVOLUTION_ROADMAP.md` S3。

---

## 命名

### 定稿
- **repo / npm / CLI 名**：`weapp-shipmate`
- **中文牌子**：上线船友 / 小程序上线伙伴
- **主 slogan**：**你写代码，我陪你上线**
- **英文副标题**：`Your launch mate for WeChat Mini Programs — everything after the code.`
- **一句话介绍**：代码之后，上架之前，那个陪你跑完全程的伙伴

### 为什么是 shipmate
`ship` 一词双关：工程圈读作 "**ship it = 上线 / 发布**"，生活圈读作"**船 + mate（同船伙伴）**"。`ship-mate` = "陪你把小程序 **ship 上线**的伙伴"——一个名字同时罩住"上线"这件事和"陪伴零基础用户"的气质。

### 命名沿革
- 初稿 `weapp-bridge`（上线摆渡）：强调"AI ↔ 微信生态之间的桥（衔接层）"，准确但只表达结构、缺温度。
- 2026-06-13 改定 `weapp-shipmate`：保留"衔接"本质，叠加"陪伴 + ship 双关"，更贴零基础人群的情绪价值。

### 可用性（2026-06-13 查）
- GitHub：`weapp-shipmate` **0 占用**。
- npm：裸名 `shipmate` 已被占（一个发布 CLI），但全名 `weapp-shipmate` 空着——**反向印证保留 `weapp-` 前缀的价值**（可发现性 + 避开命名冲突）。
- 二期建仓前再做一次权威 `npm view` 终检。

### 关于 `weapp-` 前缀
带前缀 = **可发现性**（搜 "weapp" 撞见你）+ **避命名冲突**，代价是写死"只做微信"。鉴于本项目承诺"**小而美、聚焦微信、不扩**"，带前缀反而更**可信**。
