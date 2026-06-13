# 01 · 调研（GitHub + 微信官方生态）

> 调研日期：2026-06-13。本文是立项前"先调研、再讨论"的依据。

## 结论一句话

相邻项目大量集中在"帮你**写代码 / 调试代码 / 上传预览**"；截至 2026-06-13 的 GitHub 与 npm 初筛，**未发现成熟项目专注于"把写好的代码合规地送上线"这一段**。weapp-shipmate 识别的空白真实存在，但应避免宣传为"全网没有人做"。

---

## 1. 竞品全景：相邻赛道很热，靶心是空的

2026 年 2–6 月出现一批"小程序 × AI Agent"的 MCP / Skill 项目，但主轴基本是"开发 / 调试侧"——让 Claude / Cursor / Codex 去操作*微信开发者工具*、自动化测试、上传代码：

| 项目 | 定位 | 和我们的关系 | 最后核验 |
|---|---|---|---|
| [`Chaixueyuan/weapp-agent-mcp`](https://github.com/Chaixueyuan/weapp-agent-mcp) | 面向 agent 的微信小程序调试、自动化、轻量测试 MCP | 开发调试，**非上线合规导航** | 2026-06-13 |
| [`mileson/weapp-devtools-mcp`](https://github.com/mileson/weapp-devtools-mcp) | 控制 DevTools、页面、日志、网络、截图、wx API 的本地 MCP | 开发调试，**非上线合规导航** | 2026-06-13 |
| [`WaterTian/wechat-devtools-mcp`](https://github.com/WaterTian/wechat-devtools-mcp) | 微信开发者工具 CLI MCP + Skill | 开发/测试/调试闭环，**非备案/类目/隐私导航** | 2026-06-13 |
| [`li-bao-jia/miniprogram-ci-service`](https://github.com/li-bao-jia/miniprogram-ci-service) | 把 `miniprogram-ci` 封装为 HTTP 上传、预览服务 | 解决上传/预览，非合规导航 | 2026-06-13 |
| [`TencentCloudBase/cloudbase-skills`](https://github.com/TencentCloudBase/cloudbase-skills) | CloudBase 开发 Agent Skills | 后端/云开发知识，非上线流程导航 | 2026-06-13 |
| `awesome-wechat-weapp` 类资源列表 | 小程序资源、组件、教程集合 | 可作为链接来源，但没有规则引擎和代码预检 | 2026-06-13 |

**护城河不在"操作能力"（已红海），而在"领域知识 + 合规判断 + 代码感知"**——这是通用 LLM 补不上、必须靠结构化知识库的部分。

---

## 2. 关键结构性事实：上线流程不能等同于上传代码

官方自动化能力（`miniprogram-ci`）的边界：

- ✅ **能 API 自动化**：上传代码、预览、构建 npm、CI 机器人。
- ⚠️ **v0 不做自动化代办**：账号注册、**主体实名认证**（刷脸 / 打款验证）、**类目申请**、**ICP 备案**（短信核验 + 通管局审核）、服务器域名白名单配置、**用户隐私保护指引**填写、**提交审核**、发布上线。

> 即：产品**不应宣传为"Agent 一键上线"**。涉及真实身份、付费、政府备案、人工审核的环节，即使部分页面操作能被脚本辅助，也应由用户本人在官方后台确认和提交。

**这反而是公益护城河**：正因为没法自动化套利，商业公司没动力做透，留给社区维护刚好。

---

## 3. 备案 / 上线流程要点（调研摘录）

- 自 2023 年起，APP / 小程序 / 快应用等移动互联网应用纳入备案监管；微信小程序上线前需要关注小程序备案要求。
- 备案五环节：备案信息填写 → 平台初审（1–2 工作日）→ 工信部短信核验（收到短信 24h 内完成）→ 通管局审核（1–20 工作日）→ 备案成功。
- 认证：微信委托第三方审核机构核验主体真实性。

---

## 4. 本项目的差异化假设

weapp-shipmate 不和 DevTools MCP、`miniprogram-ci` 上传工具竞争，而是做它们之后的一层：

- **规则结构化**：把备案、服务类目、隐私指引、域名白名单、提交审核材料和拒审案例拆成可维护规则。
- **代码感知**：从源码里提取域名、隐私 API、配置项和高风险能力，映射到上线清单。
- **人类导航**：告诉用户"下一步去官方后台哪里做、准备什么、为什么"，而不是替用户提交。
- **Agent 衔接**：让 Claude Code / Codex 能调用同一份规则库解释预检结果，但不绕过官方生态。

---

## 来源（Sources）

- 微信官方 · miniprogram-ci 文档：https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html
- 微信官方 · 用户隐私保护指引：https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/
- 微信官方 · 小程序备案指引：https://developers.weixin.qq.com/miniprogram/product/record_guidelines.html
- 微信官方 · 小程序开放的服务类目：https://developers.weixin.qq.com/miniprogram/product/material/
- 工信部备案系统：https://beian.miit.gov.cn/
- 工信部 APP 备案通知（政府转载）：https://www.hunan.gov.cn/zqt/zcsd/202308/t20230809_29456035.html
- 小程序备案常见问题（官方社区）：https://developers.weixin.qq.com/community/develop/article/doc/00060696d3c0a851fc30af38761013
- 个人小程序认证流程（官方社区）：https://developers.weixin.qq.com/community/develop/article/doc/0006c437da87b885b7900de966c013
- 小程序类目常见问题（官方社区）：https://developers.weixin.qq.com/community/develop/doc/000ae62dd3cfb835cb9474b7066409
- 开发全流程：从注册到上线（阿里云开发者社区）：https://developer.aliyun.com/article/1656896
- 相邻竞品仓库见上表（GitHub / npm 检索 2026-06-13）。
