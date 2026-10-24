# Anthropic / Google 文本聊天增量

日期：2026-10-17。直接执行，保留原生 ES Modules、Node fetch、现有 AI SDK UI Message Stream v1 文本子集及模型连接会话。不安装依赖，不重做对话组件。

## 范围与验收

- 将 Anthropic Messages SSE、Google streamGenerateContent SSE 转换到现有文本消息流。凭据仅通过服务端固定地址的请求头发送，模型须属于已连接目录。
- Google 仅保留 supportedGenerationMethods 包含 generateContent 的目录项；模型资源名严格校验，不能注入路径、查询或其他端点。历史 user/assistant 映射为 user/model。
- 仅显示公开回答文本；思考字段、工具调用、非文本输出不执行。未正常结束、额度/授权错误、安全拦截、截断、空回复均不得显示成功，不自动重试付费请求。
- 延续停止、超时、离页/会话释放与断连时的上游取消；保留部分正文，手动重试使用原始请求，不带入失败半截回答。
- 更新模型菜单、设置及说明中的能力文案，共用组件，不新增状态协议。
- 独立隔离夹具通过真实页面、真实本地 HTTP broker 和合成上游验证两家：连接、选择、逐段输出、正常结束、停止后无迟到正文、错误与重试；桌面及窄屏，键盘可达与控制台检查。夹具始终标明模拟，和 5501 正常预览的 cookie 隔离。

## 执行与简化

59 项相关基线测试已通过（`.omx/anthropic-google-baseline.log`）。先补可失败的协议/过滤/取消/恢复回归，再增量扩展现有适配器。后端、前端能力入口与隔离夹具分文件负责；主代理集成，独立复核认证/路径/终态边界。

## 质量与边界

命令来自 package.json、desktop/package.json、既有 node:test 和 `.github/workflows/ci.yml`：针对测试、全量 npm test、lint（含预览显式 lint）、desktop build、本地静态检查和浏览器操作记录。风险 high：新增外部模型鉴权和流传输，需负向边界与独立复核。

真实外网代码接入与合成上游验收分开陈述；没有用户 API Key，不声称通过真实付费推理、供应商计费/停止计算、模型质量或延迟验收。当前范围为开发预览，不包含 Tauri 原生接入、工具调用或图片输入；不提交、不部署。回退仅本轮增量，不覆盖既有未提交工作。
