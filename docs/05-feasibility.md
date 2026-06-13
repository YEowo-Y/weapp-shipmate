# 05 · 完整可行性评审

> 评审日期：2026-06-13。结论用于决定是否从文档先行进入代码骨架。

## 结论

**Go，但收紧 MVP。**

项目可行性评分：**7.5 / 10**。

weapp-shipmate 值得做，但不应先做成"Agent 平台"。更稳的路线是先做一个**规则库驱动的微信小程序上线导航工具**：官方来源规则库 + 问答式导航 + 本地代码预检 + GitHub 协作入口。CLI 跑通后再包 MCP。

---

## 为什么可行

### 1. 真实痛点存在

AI 编码工具能显著降低"写代码"门槛，但上线仍卡在非编程环节：

- 小程序备案。
- 主体认证。
- 服务类目与资质。
- 用户隐私保护指引。
- 服务器域名白名单。
- 提交审核与拒审处理。
- 审核通过后的发布。

这些环节对个人开发者、个体工商户和零基础创业者都不友好，且不是单纯写代码能解决。

### 2. 官方生态给了明确规则面

项目需要结构化的对象都存在官方或准官方来源：

- `miniprogram-ci` 主要覆盖上传、预览、构建、CI 机器人等能力：https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
- 用户隐私保护指引：https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/
- 小程序备案指引：https://developers.weixin.qq.com/miniprogram/product/record_guidelines.html
- 小程序开放的服务类目：https://developers.weixin.qq.com/miniprogram/product/material/
- 工信部备案系统：https://beian.miit.gov.cn/
- 工信部 APP 备案通知（含小程序、快应用等分发场景）：https://www.hunan.gov.cn/zqt/zcsd/202308/t20230809_29456035.html

这说明项目不是在发明流程，而是在把分散规则组织成可执行导航。

### 3. GitHub 上相邻项目多，直接替代少

已核验的相邻项目主要集中在开发、调试、上传、预览：

- `Chaixueyuan/weapp-agent-mcp`：调试、自动化、轻量测试。
- `mileson/weapp-devtools-mcp`：DevTools 控制、截图、日志、网络、wx API。
- `WaterTian/wechat-devtools-mcp`：DevTools CLI MCP + Skill。
- `li-bao-jia/miniprogram-ci-service`：HTTP API 包装上传/预览。
- `TencentCloudBase/cloudbase-skills`：CloudBase 开发技能。

它们可以成为参考或集成对象，但不覆盖"备案 / 类目 / 隐私 / 拒审诊断 / 上线导航"这条主线。

### 4. 公益开源定位合理

这个项目的核心成本是规则维护、案例沉淀和来源校验，不是商业闭环。公益开源反而更合适：

- 用户信任门槛低。
- GitHub Issue 适合收集拒审案例和规则变更。
- 规则即数据，适合社区 PR。
- 不做代办、不卖课、不做担保，能保持边界清晰。

---

## 为什么有风险

### 1. 范围容易失控

"全流程上线"天然很大。v0 不能覆盖所有行业、所有主体、所有资质。第一版只做：

- 备案。
- 服务类目。
- 用户隐私保护指引。
- 服务器域名白名单。
- 提交审核材料。
- 常见拒审原因。

### 2. 合规输出容易越界

项目不能生成"正式合规文件"并暗示可直接提交。正确边界是：

- 可以生成字段映射。
- 可以生成待确认草稿。
- 可以生成审核备注建议。
- 可以生成检查清单。
- 不能声称"已合规"、"保证过审"、"可直接提交"。

### 3. 规则会腐烂

微信政策、服务类目、备案要求会变化。缓解方式：

- 每条规则必须有 `official_url`。
- 每条规则必须有 `source_quote`。
- 每条规则必须有 `last_verified`。
- 低置信或未核验规则只能进 `draft`。
- GitHub Issue 模板专门收集"官方规则变更"。

### 4. 本地预检有隐私风险

预检会读取源码，可能碰到 AppID、域名、密钥路径、业务接口。缓解方式：

- 默认 local-only。
- 默认忽略 `.env*`、`private.*.key`、`project.private.config.json`、`secret*`、`*.pem`、`*.p12`。
- 报告脱敏，不回显 Token、Cookie、手机号、身份证号。
- MCP 层不得默认新增远程上传能力。

---

## 建议的 MVP

### v0.1：规则与文档

- 建 `schemas/rules.schema.json` + `schemas/flow.schema.json`（导航图骨架，见 `docs/03` 导航图模型）。
- 建 `flow.yaml`（约 8 个阶段的流程骨架）+ 20-30 条种子规则。
- 建 `CONTRIBUTING.md`、`SECURITY.md`、`GOVERNANCE.md`。
- 建 Issue 模板：规则纠错、拒审案例、官方规则变更、新手卡点。

### v0.2：CLI

- `weapp-shipmate guide`：问答式上线导航。
- `weapp-shipmate check ./app`：本地代码预检。
- 输出 Markdown / JSON 报告。

### v0.3：Agent 衔接

- MCP server 包装 CLI 能力。
- Agent Skill 提供使用流程和输出解释。
- 不绕过微信官方后台，不做提交代办。

---

## Go / No-Go 条件

进入代码骨架前必须满足：

- [ ] 1 周内整理出 20-30 条高质量种子规则。
- [ ] 至少 3 个真实或模拟小程序能跑出有价值的预检报告。
- [ ] 至少 5 个目标用户读导航，其中 3 个能清楚说出下一步要做什么。
- [ ] 每条结论都能回链官方或准官方来源。
- [ ] README、SECURITY、CONTRIBUTING、Issue 模板齐全。

如果做不到，先停在"文档导航 + 案例库"，不要急着做 CLI/MCP。

---

## 当前建议

继续推进，但按以下顺序：

1. 先清理文档口径：不说"全网没人做"、不说"生成正式合规文件"、不说"一键上线"。
2. 再做 schema：先定规则数据模型。
3. 再灌种子规则：备案、类目、隐私三块优先。
4. 再做 CLI：先本地预检，不做 MCP。
5. 最后做 Agent 衔接：MCP 和 Skill 是放大器，不是项目根基。
