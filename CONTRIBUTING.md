# 贡献指南（CONTRIBUTING）

> 草案 · 2026-06-13。weapp-shipmate 的核心是一份**社区可维护的规则库**。最有价值的贡献不是代码，而是**高质量、可回链官方来源的规则与拒审案例**。

## 你可以贡献什么

| 类型 | 入口 | 说明 |
|---|---|---|
| 规则纠错 | issue：规则纠错 | 某条规则过期/不准/链接失效 |
| 拒审案例 | issue：拒审案例 | 真实被拒原因 + 官方审核反馈截图（脱敏） |
| 官方规则变更 | issue：官方规则变更 | 微信/工信部政策更新，附官方链接 |
| 新手卡点 | issue：新手卡点 | 你卡在哪一步、期望工具怎么提示 |
| 新增/修改规则 | Pull Request | 直接改 `rules/*.yaml` 或 `flow.yaml` |

## 规则准入门禁（PR 会被 CI 与人工双重检查）

一条规则要进**默认规则集**，必须满足（由 `schemas/rules.schema.json` 机器校验）：

1. **必带来源**：`official_url` + `source_quote`（官方原文短摘录）+ `last_verified`（ISO 日期）。
2. **必带分类**：`stage`、`severity`、`confidence`、`subject_type`。
3. **预检规则必带 `match.scanner`** —— 不允许用"LLM 自由判断"冒充静态命中。无法静态确定的（如变量拼接的动态域名）须用 `scanner: manual_only` + `dynamic_note`。
4. **越界自锁**：涉及注册/认证/备案/类目/隐私声明/发布的规则，`manual_required` 必须为 `true`。
5. **低置信进 draft**：`confidence: low` 的规则必须 `draft: true`，只在显式开启时加载，不进默认集。

> 没有官方/准官方来源的"经验性"内容，只能进 `draft` 或案例库，不能作为默认规则发出。

## 一条规则长什么样

```yaml
# rules/privacy-apis.yaml
schema_version: 1
rules:
  - id: privacy.getUserProfile
    title: "用户信息隐私声明"
    kind: both
    stage: privacy
    subject_type: ["personal", "individual_business", "enterprise"]
    severity: warning
    confidence: high
    match:
      api: ["wx.getUserProfile", "wx.getUserInfo"]
      scanner: static_api_call
    requires:
      - "在『用户隐私保护指引』中声明：用户信息（昵称、头像）"
    why: "采集用户身份信息，未声明会在审核被拒"
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/"
    source_quote: "（此处放官方原文短摘录）"
    last_verified: "2026-06-13"
    manual_required: true
```

## 本地开发环境

零运行时依赖；仅校验工具用到 devDependencies。

```bash
# Node 版本对齐 CI（见 .nvmrc，>=20）
nvm use            # 或自行确保 node >=20

npm install        # 安装 devDeps：ajv / ajv-formats / js-yaml
npm test           # 等价 npm run lint:rules / npm run validate
```

`npm test` = `scripts/validate.mjs` 数据门禁（`schemas/*.json` 自身合法 → `flow.yaml` 与 `rules/*.yaml` 符合 schema → flow 图完整性（指向存在/唯一入口/唯一终点/无环）→ 跨文件 `stage` 一致性）+ 全量 `node --test`（含准确性金快照 `tests/accuracy.test.mjs`、夹具钉板 `corpus/fixture-pins.json`、覆盖率红线 `tests/coverage.test.mjs` 等 169 项）。CI（`.github/workflows/ci.yml`）在每次 push / PR 跑同一脚本，另跑 `npm run lint`（ESLint，`recommended` 级）作为独立门禁。

目录约定：

| 路径 | 作用 |
|---|---|
| `schemas/*.json` | 规则与流程的数据模型（改这里＝改约束，慎重） |
| `flow.yaml` | 上线阶段决策树骨架（导航） |
| `rules/*.yaml` | 规则内容（社区 PR 主要改这里） |
| `scripts/validate.mjs` | 校验门禁脚本 |
| `docs/06-quality-and-acceptance.md` | DOD / 门禁 / 测试 / 修复分级 / Dogfood 规则 |

## 本地自检（提 PR 前）

1. 用 `npm run lint:rules`（等价 `schemas/rules.schema.json` / `schemas/flow.schema.json` 校验，脚本已存在）自检你的 YAML。
   - 注意：JSON Schema 只校验**单条规则/单个阶段的字段**；改 `flow.yaml` 时，`next` / `requires_stage` 指向是否存在、是否有环、是否唯一入口与唯一终点，由同一脚本内的**独立图 linter** 检查——schema 通过 ≠ 图合法。
2. 确认每条新规则的 `official_url` 当前可访问，`source_quote` 与原文一致。
3. 确认没有把密钥、AppID、个人信息写进示例（见 `SECURITY.md`）。

## 改规则的验收协议

改 `rules/*.yaml` 可能让**准确性金快照**（`tests/accuracy.test.mjs`）与**夹具命中集钉板**（`corpus/fixture-pins.json`）变红——这不是误报，是系统在提醒你"命中集合变了，需要人裁决"：

1. 跑 `npm test`，若金快照或钉板测试失败，逐条对照夹具源码判定该条变化是 **TP（真实新增/修复的命中）** 还是 **FP（误报回归）**。
2. 判为 TP：更新 `corpus/labels.json` 补上新的三态标注（`hit`/`no_hit`/`unknown`），再跑 `node scripts/pin-fixtures.mjs --update` 重生成钉板。
3. 判为 FP：修规则或扫描器逻辑，不得为了让测试变绿而反向调整标注掩盖误报。
4. 提交说明里写明每条变化的裁决理由（为何是 TP/FP），便于审查者复核而非重新裁决一遍。
5. 新增规则须满足 `schemas/rules.schema.json` 硬性字段：`official_url` + `source_quote` + `last_verified`；预检规则（`match.scanner`）的类型与所需字段须绑定匹配（如 `static_api_call` 需 `api` 字段），schema 会拒绝"声明了 scanner 类型但缺对应字段"的死规则。

## 写作口径（防止边界跑偏）

- 不写"保证过审""已合规""可直接提交"。
- 输出动作描述为"请你去官方后台……"，而非"我已为你……"。
- 任何合规结论都能回链到 `official_url`。

详细的项目承诺与边界见 `GOVERNANCE.md`；安全与脱敏见 `SECURITY.md`。
