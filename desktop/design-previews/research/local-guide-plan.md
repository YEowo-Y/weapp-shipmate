# 本机上线清单：实施与验收计划

日期：2026-10-17。继续项目的下一条可运行用户路径；直接实施，使用原生子代理负责有界模块。现有未提交改动全部保留。

## 范围与方案

复用 `src/guide.mjs` 的 `runGuide`、已有本机会话/CSRF、消息状态机、原生 dialog/details 和设计 token。新增“添加 → 生成上线清单”：用户明确填写主体、是否收集敏感信息、是否使用服务器域名，服务端调用本地已收录规则，前端以固定清单组件展示。没有新依赖。

本轮不收集尚不影响规则筛选的支付/业务类型。默认排除 draft；不读取项目目录、不调用模型、不联网查询规则、不自动发送清单给模型。执行成功表示清单生成成功，不能表示项目合规或上线通过。正式 Tauri、模型自动工具选择、审批写入、持久化仍不在本轮。

## 共享合同与所有权

- 服务端/合同：`desktop/server/model-connections.mjs`、新 `guide-stream.mjs`、`desktop/design-previews/guide-contract.js` 及其测试。固定 POST `/api/model-connections/tools/guide`，沿用现有 cookie 路径、Host/Origin/CSRF；不需模型连接。请求严格为 `{subject,sensitive,domain}`，三个字段必填，主体枚举、布尔不转换。工具名沿用 MCP 的 `weapp_shipmate_guide`，不改变 MCP 公共合同。
- 结果维持 `runGuide` 原始 `command/meta/items/selfCheck/notes`，共享有界纯数据校验器在服务端与前端执行；来源只接受安全官方 HTTPS URL，时间表示仓库记录的核验日期。适用项和条件自查项分开。
- 传输（主代理）：提取已有 SSE 分帧读取，保留文本流回归；新增 `streamGuide({input,signal,onToolStart},options) -> Promise<result>`。AI SDK UI Message Stream v1：`start → tool-input-available → tool-output-available → finish → [DONE]`；失败为 `tool-output-error → finish(error) → [DONE]`。完整终态前不交付结果。不发模型 step 或伪造输入增量。
- 控制器（对话代理）：`request.guide`、`guideTransport` 注入、停止/重试/迟到保护、来源隔离；`shipmate:guide-request` 的 detail 为 `{input,accepted:false}`，成功接收后设 accepted=true；保留草稿及当前模型选择；工具结果不进入真实模型历史。
- UI（界面代理）：`ui.js/ui.css` 表单与入口，`components/message.js/presentation.js` 与既有组件 CSS 的真实工具/清单展示；不添加转圈或假延时。复用现有渐变执行文字、图标、宽度与焦点管理。用户清单请求不提供含混的自由文本编辑入口，重跑明确命名。

## 验收

1. 无密钥可执行；输入校验失败、来源/结果非法、服务异常分别可理解，不显示旧结果。
2. 本机 HTTP 实际调用真实 `runGuide`，输出与内核相同；不调用注入的 provider fetch；未知字段、路径、草稿参数被拒绝。
3. 工具状态由事件驱动；关联 toolCallId；截断/乱序/重复/错误 ID/未完成终态均不能发布成功。
4. 单会话运行互斥；停止、会话替换、离页、服务清理取消；晚到结果不能覆盖新消息。输入选择被冻结，重试保持原参数。
5. 两类清单区分、原始结果可折叠、来源安全链接、核验日期和人工完成说明可见；未认证为实时规则。
6. 默认演示与真实文本聊天仍通过全部既有回归；不变更选中模型，不消费草稿，不上传规则结果或引用文件。

## 验证与门禁

风险 high：共享认证 API、工具执行和消息状态。先补失败回归，再实施；独立只读审查。命令来源为根/desktop package scripts、现有 node:test 与 CI validate-rules（Windows/Linux、Node20/22/24）。运行定向测试、全量 npm test、npm run lint、desktop 显式 ESLint、desktop build、静态资源/HTTP检查、git diff --check。无依赖变化；现有生产依赖审计基线为0。规则内核原有测试保持。

遵循用户“本轮先完成代码与自动化验证”：不启动被禁用的本地浏览器或替代浏览器手段，视觉/键盘/原生实测 DQ-05 BLOCKED；发布/真实环境 DQ-09 BLOCKED。本轮无模型决策，DQ-11 以确定性工具合同回归覆盖，不宣称概率性 Agent 评测完成。没有对应提交的 CI、SAST 或设备视觉性能证据。

恢复：只撤回本轮增量，无数据迁移；重启本机预览清除内存连接需重新登录。报告保留真实能力与剩余限制，不做 release-ready 声明。
