# 模型认证边界研究（2026-10-20）

## 范围与结论

本次为官方文档与上游许可证核验，不是登录实测，不声称已完成任何厂商真实账户授权。只写本报告，不修改产品实现。下列动态文档以 2026-10-20 检索结果为准；许可证固定到完整提交 SHA。

**本轮清晰、无需借用其他应用身份的闭环是 OpenRouter 官方 PKCE 授权 → 换取用户 API key → 使用用户自己的 OpenRouter 额度。** 自动回调与官方无回调手动授权均有文档依据。授权成功不等于推理成功，最终仍需模型请求验证额度、模型权限与连接状态。

重要时效修正：不能笼统写“第三方应用不支持 ChatGPT OAuth”。当前 OpenAI 已发布 Sign in with ChatGPT（SIWC）开源应用动态注册流程；它要求真实应用身份、签发给本应用的 client ID 和独立使用限制。**这不允许复制 Codex 的第一方 client ID，也不意味着 ChatGPT 订阅成为任意通用 API key。**

## 支持与限制矩阵

| 服务 | 官方支持的自研应用路径 | 注册与前置条件 | 必须保留的边界 |
| --- | --- | --- | --- |
| OpenRouter | OAuth PKCE 换取用户控制的 API key | 当前文档流程没有 client secret/client ID 注册步骤；S256 verifier/challenge；用户在 OpenRouter 授权 | 使用用户 OpenRouter 额度；不是 ChatGPT/Claude 订阅兑换。回调模式校验 state；无回调模式没有返回 state，应绑定本地待完成授权与 verifier |
| OpenAI / ChatGPT | 普通 API key；另有 SIWC 开源应用动态注册预览 | SIWC 首次使用官方 `dynamic_agent_client` 注册入口、真实 `agent_name_hint` 和稳定 `ext_agent_host_id`；回调返回自己获发的 client ID；后续用该 ID，不用入口 ID 换 token | 必须遵守 SIWC 使用范围及预览推理约束；不能复用 Codex/其他项目 client ID、读取它们的登录缓存冒充授权 |
| Anthropic / Claude | Claude Console API key 或受支持云提供商 | 用户自己的 API 凭据及相应计费账户 | 不允许自研应用提供 Claude.ai 登录并代用户路由订阅请求；不能收集/存储/中转 Claude.ai session token。未修改 Claude Code 原版自身登录有单独允许条款，不能偷换为自研聊天 API |
| Google Gemini API | API key；受支持的项目 OAuth/ADC | 自有 Google Cloud 项目、启用 Generative Language API、配置 consent screen、为平台创建自己的 OAuth client ID；公开发布需处理 scope 验证等要求 | 官方 OAuth quickstart 明确是简化测试流程；不能直接当生产方案，也不能据此宣称 Gemini 消费订阅额度可调用开发者 API |

以上每行分别依据来源 1、4、5、6。Vertex、GitHub Models/Copilot 不属于本轮最小实现；本报告不据其他产品的登录按钮推导它们的端点、计费或 token 兼容性。

## 八组一手来源

1. **OpenRouter OAuth PKCE 官方文档**  
   https://openrouter.ai/docs/guides/overview/auth/oauth  
   已确认 `/auth` 支持 S256；localhost 任意端口回调；可选 `state` 在成功回调原样返回，但拒绝授权与 headless 不返回。Headless 模式省略 `callback_url`，必须提供 challenge；授权页显示单次码，10 分钟过期。交换端点为 `POST https://openrouter.ai/api/v1/auth/keys`，提交 code、verifier、challenge method，返回 `key`，不是标准 refresh-token 对。用户可以管理该 key；本地取消不能被误报成远端 key 已撤销。

2. **RFC 9700 — OAuth 2.0 Security Best Current Practice（2025-01）**  
   https://www.rfc-editor.org/rfc/rfc9700.html  
   第 2.1.1、4.8 节支持授权码与 PKCE、防授权响应注入；第 4.1 节要求严格回调地址验证；第 2.2 节讨论 token 重放防护。工程落实：每次独立随机 verifier/state，禁止跨会话完成授权；不把 code/token 放入日志；过期、取消、重试必须清理对应待授权状态。不能因厂商示例允许省略 PKCE 就将其省略。

3. **RFC 8252 — OAuth 2.0 for Native Apps（2017-10）**  
   https://www.rfc-editor.org/rfc/rfc8252.html  
   原生应用应通过外部用户代理（通常系统浏览器）授权，并使用 PKCE。第 7.3 节覆盖 loopback callback，第 8.5 节说明原生客户端内置静态共享 secret 不能当作保密凭据。应用 OAuth 身份必须由提供商支持的注册流程取得；不能把其他应用源码中的标识当作本项目身份。

4. **OpenAI SIWC 官方注册说明与配套规则**  
   主文档：https://developers.openai.com/siwc/token-sharing-open-source/sign-in  
   配套预览范围：https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations  
   配套条款：https://openai.com/policies/sign-in-with-chatgpt-terms/  
   官方现已支持开源应用动态注册：入口 ID 仅用于首次注册，回调签发的 ID 才属于后续登录/交换；无需 client secret 或 partner API key。每次需要 state、nonce、PKCE。条款要求真实应用名、用户授权、用户控制的运行时、本地且用户控制的持久 token 存储，且不能对 SIWC 计划使用收费。预览 Responses 路径要求 `store:false`、`stream:true`，HTTP 上自行发送历史，部分参数/工具不支持。它是受限的计划使用能力，不等于全部 OpenAI API 功能。是否满足本项目分发与商业模式条件尚未评审，本轮不实现。
   
   **对本项目适用性的明文与推断分开：**[官方 Overview](https://developers.openai.com/siwc/token-sharing-open-source) 明文将此文档限定为 open-source and locally hosted apps；付费或远程托管应用需填写兴趣表。未发现“仅限纯聊天客户端”的明文限定。因而“含微信小程序业务功能”本身既不是官方禁止条件，也不是获准证明。若本项目是开源、本地运行的个人 Agent，由该用户主动请求或明确授权自动化，可继续按此路径评估；若小程序云后端代其他用户消费某人的订阅、集中保存 token，或把该订阅变成收费共享 API，则不能据上述文档认定适用。此判断是依据使用者、执行位置、收费方式与 token 保管边界作出的条件性推断，尚未审计本仓库部署模式或取得提供商确认。

5. **Anthropic Claude Code Legal and compliance**  
   https://code.claude.com/docs/en/legal-and-compliance  
   “Authentication and credential use”明确区分订阅 OAuth 与 API：自研产品（含 Agent SDK）使用 Console API key 或支持的云提供商；不能把 Claude.ai 登录与订阅凭据代理成自研应用调用。该页另允许按条件托管未修改的 Claude Code，让用户通过 Anthropic 自身流程认证；这属于运行原版产品，不是给自研模型连接器授予订阅 token 使用权。必须同时保留两项条件，避免过度禁止或过度放行。

6. **Google Gemini API OAuth quickstart（页面标注更新 2026-08-24）**  
   https://ai.google.dev/gemini-api/docs/oauth  
   确认项目、API 开启、consent screen、自有 Desktop app OAuth client ID、ADC 与凭据刷新路径。请求使用 Bearer token 和项目上下文。文档明确 quickstart 适用于测试，生产需要进一步选择认证方案和授权范围；示例不能证明任意 Gemini 订阅可转成模型 API 权限。不要复制 Gemini CLI 或其他 Google 应用 client ID。

7. **Cherry Studio 固定提交的 README 与 LICENSE**  
   `CherryHQ/cherry-studio@33969daae55f7fce3ab61dec916a627860d4859b`  
   [README（provider 信息架构）](https://github.com/CherryHQ/cherry-studio/blob/33969daae55f7fce3ab61dec916a627860d4859b/README.md#L55-L105)  
   [许可证](https://github.com/CherryHQ/cherry-studio/blob/33969daae55f7fce3ab61dec916a627860d4859b/LICENSE#L1-L6)  
   README 的真实 provider 设置图与说明把服务、API key、模型集中管理；支持多个云提供商与兼容服务，且说明可用性依赖凭据、平台及配置。可借鉴 provider-first 信息结构，不能据支持列表推导 OAuth 合约。Community Edition 为 **AGPL-3.0**；商业使用并非禁止，但直接复制/集成代码须满足许可证义务或取得单独商业许可。这里只引用设计与说明，不复制其实现。

8. **OpenClaw 固定提交的 README 与 LICENSE**  
   `openclaw/openclaw@04789278f8b0cd4cac95386ef91a37ece34082c5`  
   [README（本地 Gateway 与客户端分工）](https://github.com/openclaw/openclaw/blob/04789278f8b0cd4cac95386ef91a37ece34082c5/README.md#L18-L81)  
   [许可证](https://github.com/openclaw/openclaw/blob/04789278f8b0cd4cac95386ef91a37ece34082c5/LICENSE#L1-L21)  
   上游描述 Gateway 负责会话、工具、事件与渠道连接，Control UI/CLI/TUI 接入 Gateway；模型与 agent harness 可替换，本地保留状态和凭据。适合参考认证与 UI 分离及连通性验证路径。**MIT** 允许在保留版权和许可声明等条件下复用；另需逐项检查第三方 notices。MIT 只覆盖对应代码，不授予模型厂商订阅、OAuth client 或商标使用权限。

## 给实施者的验收边界

- 自动回调：使用系统浏览器，匹配本次 pending request；成功、拒绝、超时、取消和重复回调有独立终态。
- 手动授权：确实使用官方无 callback URL 路径，不能把完整 callback URL/其他会话 code 随意当作当前凭据；只对当前 PKCE 待授权状态进行交换。
- 授权完成后验证 key 和模型访问，分别呈现“已授权”“额度不足”“模型无权限”“网络失败”；不保留假的已连接状态。
- OAuth 边界的 mock/自动化测试不能代替真实用户账户验收；本报告没有登录外部账户、执行模型请求或验证账单。
- 不从 Cherry/OpenClaw/Codex/Claude Code 的公开源码复制其他应用 client ID，不把用户订阅宣传成通用 API。官方明确支持的动态注册入口应按其文档使用，不能与身份冒用混为一谈。
