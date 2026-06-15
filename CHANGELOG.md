# Changelog

本项目变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。当前为 v0 开发阶段（`0.0.0`，未发布、未推送公共远程）。

## [Unreleased]

v0 代码骨架：从"文档先行"走到"可从源码运行的导航 + 代码感知预检"。

### Added — 规则数据（"规则即数据"脊柱）

- 规则 schema（`schemas/rules.schema.json`、`schemas/flow.schema.json`）与 `flow.yaml` 上线流程决策树骨架。
- **45 条种子规则全部已核验官方来源、默认输出**（备案 1 / 域名 2 / 隐私 21 / 提审 6 / 登录 5 / 内容安全 2 / 支付 1 / 资质 1 / 未成年 1 / 数据 1 / 导流 2 / 类目 2），暂无 `draft`；`draft` 门禁机制保留，供未来无法核验逐字来源的规则使用。
- 隐私预检**完整覆盖**官方《用户隐私保护指引内容介绍》信息类型表 **21 个接口族**，源码扫到对应 `wx.*` 即命中（剪贴板/麦克风/摄像头/相册/照片视频/位置/地址/发票/蓝牙/通讯录/日历/文件/车牌/运动步数/四类传感器等）。
- 数据校验门禁（`scripts/validate.mjs`：ajv schema 校验 + `flow.yaml` 图 linter + 跨文件 stage 一致性）。
- **声明↔调用一致性核验**（`src/crosscheck.mjs`）：复用扫描结果做代码↔配置交叉核验，纯规则匹配做不到。当前四项：① 调用 8 个地理位置接口但 `app.json` 的 `requiredPrivateInfos` 未声明 → blocker（精确命中官方 61040 拒因），列出缺声明的具体接口；② 前端直连 `api.weixin.qq.com` 等微信服务端 API → blocker（AppSecret/access_token 泄露风险，该域名亦无法配进白名单）；③ 源码硬编码 AppSecret/商户密钥 → blocker（只报"文件 + 键名"，绝不回显密钥值，符合 SECURITY.md）；④ 明文 `http`/`ws` 请求 → warning（小程序只支持 `https`/`wss`，列出需改协议的域名）；⑤ 请求域名为 IP/localhost → warning（服务器域名白名单不支持，官方"局域网 IP 除外"已豁免私有网段）。`crossChecks()` 留有扩展点。

### Added — CLI 与渲染

- CLI 内核：`check`（扫源码 → 个性化预检清单）、`guide`（上线流程导航）。
- 输出格式：Markdown（默认）/ `--json` / `--checklist`（可勾选待办清单，便于粘进任务跟踪）。
- 过滤与开关：`--blockers-only`（只看阻断项）、`--include-drafts`、`--subject` 及 guide 输入开关。
- 报告渲染：严重度概览行（🔴 阻断 · 🟠 警告 · 🟡 提示）+ 阶段内按严重度排序；JSON 输出顺序保持稳定（展示与数据契约解耦）。

### Added — 集成与分发

- 零依赖 MCP server（stdio JSON-RPC 2.0），暴露 `weapp_shipmate_check`、`weapp_shipmate_guide`，可挂入 Claude Code / Claude Desktop / Codex。
- `.mcpb` Desktop 扩展打包（`npm run build:mcpb`）：暂存纯生产副本 + 冒烟自检 + 官方 `mcpb pack`，manifest 通过官方 v0.4 schema 校验；可选签名（受信证书 / 自签名 TOFU）。

### Added — 质量基建

- 规则腐烂监控（`npm run rot`）：`last_verified` 时效检查 + `official_url` 链接体检；每月定时 GitHub workflow 告警。
- 测试套件（`node:test`，33 例：check / guide / scanner / cli / mcp / rot / report）+ 样例夹具；GitHub CI（含 `.mcpb` 打包冒烟）。

### Added — 治理与文档

- `GOVERNANCE.md`：不可逾越的公益承诺 + **来源核验准则**（逐字短摘录、绝不杜撰、来源等级、confidence 判定、推断与原文分界）。
- `docs/01`–`docs/07`（调研 / 定位 / 决策架构 / 路线图 / 可行性 / 质量验收 / 自建桌面 agent 技术调研）；决策 #8 定下产品终态 = 自建桌面 agent（用户自带 LLM key、内置终端可开 Claude Code / Codex）。

### Security

- 预检默认 local-only：不上传源码、不采集密钥；扫描仅输出 API/域名/配置键与规则 ID，不回显敏感值（见 `SECURITY.md`）。
- MCP 适配层不新增远程上传能力。
