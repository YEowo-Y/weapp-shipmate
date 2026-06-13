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

## 本地自检（提 PR 前）

1. 用 `schemas/rules.schema.json` / `schemas/flow.schema.json` 校验你的 YAML（二期会提供 `npm run lint:rules` 脚本）。
   - 注意：JSON Schema 只校验**单条规则/单个阶段的字段**；改 `flow.yaml` 时，`next` / `requires_stage` 指向是否存在、是否有环、是否唯一入口与唯一终点，须由二期一个**独立图 linter** 检查——schema 通过 ≠ 图合法。
2. 确认每条新规则的 `official_url` 当前可访问，`source_quote` 与原文一致。
3. 确认没有把密钥、AppID、个人信息写进示例（见 `SECURITY.md`）。

## 写作口径（防止边界跑偏）

- 不写"保证过审""已合规""可直接提交"。
- 输出动作描述为"请你去官方后台……"，而非"我已为你……"。
- 任何合规结论都能回链到 `official_url`。

详细的项目承诺与边界见 `GOVERNANCE.md`；安全与脱敏见 `SECURITY.md`。
