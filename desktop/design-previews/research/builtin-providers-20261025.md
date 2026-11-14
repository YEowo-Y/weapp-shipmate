# DeepSeek、GLM 与 Kimi 接入

核对日期：2026-10-25。范围是独立服务商入口、API Key、模型选择及普通文本聊天；复用现有组件、受限服务端传输和 Windows 凭据库，不增加依赖，也不扩大本地 Agent 工具权限。

## 官方依据与边界

| 服务商 | 官方来源 | 本轮接口与行为 |
| --- | --- | --- |
| DeepSeek | [快速开始](https://api-docs.deepseek.com/)、[模型目录](https://api-docs.deepseek.com/api/list-models)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion) | 固定 `https://api.deepseek.com`，读取 `/models`，聊天调用 `/chat/completions`。普通文本模式显式关闭 thinking，目录连接不自动推理。 |
| GLM / 智谱 | [OpenAI 兼容接口](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)、[思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)、[官方 OpenAPI](https://docs.bigmodel.cn/openapi/openapi.json) | 固定通用 API `https://open.bigmodel.cn/api/paas/v4/chat/completions`。官方未提供可据此实现的模型枚举接口；使用文档预设 `glm-5.2`、`glm-4.7`，关闭 thinking。保存配置不请求外部接口，显示 configured / 待验证，不能当成凭据或额度已验证。由用户主动运行推理测试。Coding Plan 和国际 Z.AI 不是此入口。 |
| Kimi | [快速开始](https://platform.kimi.com/docs/get-api-key)、[模型目录](https://platform.kimi.com/docs/api/list-models)、[思考模型](https://platform.kimi.com/docs/guide/use-thinking-models)、[模型生命周期](https://platform.kimi.com/docs/models) | 固定中国站 `https://api.moonshot.cn/v1`。从实时目录筛选当前文本传输兼容的 `kimi-k2.6`，关闭 thinking。K3 / K3.1 / K2.7 的保留式推理需要完整私有推理上下文，当前不将这些模型显示为可用；不冒充已支持。 |

Kimi 官方当前列明 K2 系列将于 2026-10-31 停止新用户接入，计划 12 月整体下线。此兼容范围必须跟随官方生命周期复核；不能以已退役 K2.5、moonshot-v1 或虚构模型作为回退。账号不返回 K2.6 时应显示清楚的兼容模型空状态，不发起推理。新的保留式推理支持需要单独设计，不把隐藏推理写入当前会话、日志或备份。

图标复用既有固定版本的 MIT Lobe Icons SVG，保留来源、许可、散列和被动 SVG 检查；没有运行时 CDN 请求。

## 接受条件与工程约束

1. 正式桌面和预览设置均有三家名称、品牌图标、官方获取密钥入口；模型选择及会话保存识别三个独立 ID。
2. DeepSeek/Kimi 的目录来自真实上游响应；GLM 明确是本地预设。GLM configured 仅对 GLM 生效，不放宽其他服务商的连接判断。
3. 临时凭据、显式系统保存、重启待重连及删除沿用既有机制；密钥不回传界面、不进入会话存储。新入口不提供未经实现的 OAuth。
4. 聊天经过固定 HTTPS 地址，拒绝重定向、任意工具调用与未完成的流；仅公开正文，保留停止、错误提示和用户主动重试。没有自动付费连接探测。
5. Windows 原生验收使用明确标记的合成上游、隔离凭据与数据目录；覆盖三家连接/配置、模型选择、流式回复、停止、失败恢复、重启和窄屏，不能称为真实账号推理验收。

## 质量档案

来源：根与 desktop `package.json`、`.github/workflows/ci.yml`、现有 `scripts/desktop-native-e2e.mjs`，属于 discovered。跨层连接、凭据与网络边界为 high 风险；无数据库迁移、包升级或自动发布。恢复方式是断开新增服务商并回退本次提交，保留原有服务商和会话格式。

检查：相关 Node 合约/界面测试、根全量测试与 ESLint、TypeScript/Vite 构建、Rust 桥与凭据测试、隔离 Windows 原生场景、独立审查。现有 CI 为 Ubuntu/Windows × Node 20/22/24。没有真实 API Key，因此账号权限、计费及模型回答质量不在自动化通过结论内；不把合成回复当成模型质量评测。

## 实际验证结果

- `npm test`：1,455/1,455 通过，无跳过；包括连接状态、固定请求地址、流式中文、停止、重试、凭据边界与界面回归。
- `npm run lint` 与 7 个共享前端文件的显式 `eslint --no-ignore`：通过。
- TypeScript / Vite / Windows Tauri debug 构建：通过。保留既有的大包体积及混合静态/动态导入提示，未为此次接入升级依赖。
- Rust：模型桥 2 项、凭据校验 1 项测试通过。
- 根目录与 desktop 的 `npm audit` 均为 0 项告警。
- Windows WebView2 + Tauri IPC + Node broker：17/17 项检查通过。覆盖三家连接/配置、模型选择、正文流、停止、错误重试、390px 弹窗、搜索图标间距、选中项完整可见、键盘焦点和 Escape，以及重启后的会话/草稿/选择恢复与临时密钥不恢复。
- 独立审查中发现的 GLM 验证标签和 Kimi 空状态误导均已修复；原生验收发现的搜索图标重叠、折叠区域焦点及窄屏导航定位也已修复。

本地验收目录：`.omx/artifacts/desktop-model-native/run-2026-10-25T17-16-31-131Z/`；完整日志在 `.omx/reviews/builtin-providers-20261025/`。被测隔离标识为 `com.weappshipmate.acceptance.providers.2026102504`，debug 二进制 SHA-256 为 `e9eaee76a93086e19f45ae8da70a64feaf389cab93aaf1e6ae3d36f43d611972`。

验收用假密钥和合成上游，未验证真实账号权限、计费或回答质量；没有声称新增服务商支持本地 Agent 工具、OAuth、图片或保留式思考。此开发构建不是签名安装包，也不更新上一批已生成的候选安装包。

## 主要修改与运行

- 界面：`desktop/src/model-connection.ts`、`model-connection.css`、`model-picker.ts`；共享 `settings-state.js`、`settings.js`、`ui.js` 和连接/聊天客户端。
- 品牌资源：既有 `components/provider-icons.*` 与 `components/brands/`，新增三份原始 SVG 及来源、散列记录。
- 接入：`desktop/server/model-providers.mjs`、`model-connections.mjs`、`chat-stream.mjs`、桌面桥及凭据 RPC；Rust `model_bridge.rs`、`credential_store.rs`。
- 验收：相关 `tests/*model*.test.mjs`、凭据/品牌测试；`scripts/desktop-native-e2e.mjs` 与 `scripts/native-builtin-providers-acceptance.mjs`。

沿用 `npm --prefix desktop run tauri -- dev` 启动开发桌面，新增服务商无需新环境变量。用户从设置中的模型连接入口填写对应 API Key，可选本次运行或 Windows 系统凭据保存；GLM 推理测试需主动执行。没有新增依赖、重复 SDK、数据格式迁移或额外协议。
