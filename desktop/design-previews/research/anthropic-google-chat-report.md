# Anthropic / Google 真实文本接入与浏览器验收

2026-10-17。本轮完成开发预览中的 Anthropic Messages、Google Generate Content 聊天适配，复用原有连接、模型选择、会话、AI SDK UI Message Stream 文本子集及停止/重试机制。未安装依赖、提交或部署。

## 实际行为

- 设置中连接 Anthropic 或 Google，读取目录后可直接返回对话选择模型；工作台和完整聊天页均支持。
- Google 只收录 `supportedGenerationMethods` 包含 `generateContent` 的目录项，校验 `models/{id}` 资源名，不能借模型名注入路径、查询或另一个地址。支持该方法不等于每个模型都适合纯文本输出。
- Anthropic 使用服务端 `x-api-key` 和 API 版本头；Google 使用 `x-goog-api-key`，历史 assistant 映射为 model。凭据不进入请求 URL、聊天正文或浏览器存储。
- Anthropic 内容块按生命周期处理，完成需有效 stop reason 和 message_stop；Google 普通完成需 STOP。思考内容不作为正文，工具或非文本结果不执行。
- 停止保留部分输出并取消浏览器读取、服务端 fetch 和上游 reader。失败、限流、截断或异常断流显示错误，用户可按原模型和原请求手动重试；不自动重试付费请求。
- Google MAX_TOKENS / CONTINUATION 与正文同帧时，先保留已校验的公开文本，再显示未完成；安全拦截仍先拒绝该帧正文。

## 修改与简化

| 文件（相对仓库根目录） | 改动 |
| --- | --- |
| `desktop/server/chat-stream.mjs` | 两家官方 REST/SSE 适配、鉴权和历史转换、正常/错误终态、私有内容过滤 |
| `desktop/server/model-providers.mjs` | Google 生成方法过滤、模型资源路径验证 |
| `desktop/design-previews/chat-transport.js` | 五家共用支持表 |
| `desktop/design-previews/conversation.js`、`settings.js` | 删除各自的三家白名单，复用支持表；两家可选择、发送、返回对话 |
| `desktop/design-previews/ui.js`、`settings.html` | 模型选择和能力说明同步 |
| `desktop/design-previews/conversation.css` | 外壳禁止滚动、桌面对话网格和成果面板最小高度约束；修复响应式切换裁切和短窗口输入框不可达 |
| `scripts/model-settings-fixture.mjs` | 独立模拟上游的分段 SSE、停止、限流、错误恢复和断流场景；保留模拟横幅、隔离 cookie 及禁止外网转发 |
| `tests/model-chat.test.mjs`、`model-providers.test.mjs` | 两家协议、历史、Unicode 分片、路径/鉴权、错误、终态、取消与超时回归 |
| `tests/chat-transport.test.mjs`、`live-model-picker.test.mjs`、`model-settings.test.mjs`、`conversation-continuity.test.mjs`、`live-conversation.test.mjs` | 两家入口、模型选择、真实消息状态、停止迟到包、原请求重试 |
| `tests/model-settings-fixture.test.mjs` | 真实 HTTP broker + 合成上游整链路及资源释放 |
| `desktop/README.md`、`desktop/design-previews/AGENT-TECH-CHOICES.md`、`AGENT-INTERACTION-STANDARD.md` | 更新当前能力及验证边界 |
| `desktop/design-previews/research/anthropic-google-chat-{plan,sources,report}.md` | 范围、官方证据、交付记录 |

复用现有组件和流协议，没有第二套消息模型、聊天框架或前端 mock 分支。以单一支持表替代三个重复白名单。

## 验证证据

- 改前相关基线：59/59；新增回归先失败后通过，日志 `.omx/anthropic-google-{backend,frontend}-red.log`、`.omx/anthropic-google-selection-red.log`。
- `npm test`：**640/640 通过**，0 失败/取消/跳过，较上轮增加 24 项。日志 `.omx/anthropic-google-tests.log`。
- `npm run lint` 和本轮 desktop/fixture 文件显式 `eslint --no-ignore`：通过。
- `npm --prefix desktop run build`：TypeScript / Vite 通过；这不是原生 Rust/WebView 构建。
- `node --experimental-vm-modules .omx/agent-experience-static-check.mjs`：16 HTML、48 JS、24 CSS、204 本地引用；38 HTTP 路径 200。该检查不代替浏览器。
- `git diff --check`：通过，保留已有 CRLF 提示。
- 独立 review 发现 Google 截断同帧正文丢失，已通过失败回归复现并修复；复核 37 项聊天测试通过，未留下已确认的待修复项。红绿日志 `.omx/google-partial-frame-{red,green}.log`。

## 浏览器自动化

使用当前 IAB 的浏览器自动化接口操作实际页面。链路是 **浏览器 → 本地 HTTP → 实际连接 broker / 流适配器 → 合成上游**，未绕开前端状态或直接修改页面数据。

最终 **48 项断言通过、0 项未解决失败**。浏览器发现的短窗口失败已修复并保留红绿记录；另外两条过严的测试断言保留修正原因，不计入有效断言数量。

验收覆盖：

1. Anthropic 无效凭据错误、清空输入、重新连接；两家目录成功与返回聊天入口。
2. 两家模型目录搜索、显式选择；Google embedding 项被目录层过滤。
3. 两家真实流适配的逐段显示、成功结束、停止保留正文、迟到数据不追加、停止后新请求。
4. 两家流中错误保留正文及原模型重试；Google 429 手动恢复、无正常终态的断流报错。
5. 390×844 窄屏连接表单、模型弹窗、完整聊天页，页面无横向溢出；键盘选择关闭弹窗后焦点返回模型按钮。
6. 执行中文字渐变、减少动态效果时关闭渐变；桌面恢复；浏览器控制台无 error / warn。
7. 多轮对话后从 390px 切回 1280px 桌面，外壳 scrollTop 为 0、标题/正文/输入框保持可见；消息内部滚动和“回到最新”有效。1280×500 短视口输入框底部 473px，900×700 中等视口输入框也完整可达。

记录及截图：`.omx/artifacts/anthropic-google-chat/`。`browser-acceptance.json` 保留逐项结果；`network.json` 只保存本地请求路径/状态，不记录密钥或响应正文。“选择后必须聚焦输入框”的断言改为标准的打开按钮焦点恢复，布局边界比较改用 1px 浮点容差，两者均保留 superseded 原记录。一次复合浏览器调用超时后，通过当前最后消息的完成态重新验证恢复结果，未把旧消息的成功作为新请求成功。

真实浏览器暴露并修复两处布局问题：外壳 `overflow:hidden` 可被焦点滚动，390→1280 后遗留 241px 偏移，改成 `overflow:clip`；短窗口网格默认 auto 行被成果内容撑成 570px，而实际可用高度只有 384px，改为桌面单行 `minmax(0,1fr)` 和成果面板 `min-height:0`。保留消息/成果内部滚动，不增加 resize 监听补丁。对应 `responsive-{before,after}-fix.jpg`、`short-viewport-{before,after}-fix.jpg`，62项既有输入/会话回归通过，最终全量640项及静态检查重新通过。

## 启动与复跑

正常预览：`node desktop/design-previews/_serve.mjs`，访问 <http://127.0.0.1:5501/settings.html#key>。无新增环境变量；在设置中自行输入所选厂商 API Key，再选模型发送。

隔离验收：`node scripts/model-settings-fixture.mjs`，访问 <http://127.0.0.1:5512/settings.html?from=chat#key>，输入测试文本 `fixture-success` 作为模拟密钥。页面始终有黄色模拟标识，和正常预览使用不同会话 cookie。聊天发送以下测试提示：

- 普通文本：分段完成，约 4–5 秒。
- `[fixture-stop]`：持续模拟输出，点击停止。
- `[fixture-retry]`：同一提示首次部分输出后失败，再次手动重试成功。
- `[fixture-rate]`：首次限流，再次手动重试成功。
- `[fixture-truncate]`：缺终态断流，必须显示错误。

重启夹具重置场景计数。回归命令：`node --test tests/model-chat.test.mjs tests/model-providers.test.mjs tests/model-settings-fixture.test.mjs`。浏览器验收后关闭夹具和临时页面，保留正常预览。

## 未验证边界

**真实外网调用代码已经接入；没有使用真实 API Key，因此没有验证真实厂商账号、地区/额度、收费推理、回答质量或首字延迟。** 合成数据的浏览器验收不代表这些验证已通过。停止只证明本应用取消传输，不能证明厂商计算或计费即时停止。

沿用 2048 输出预算、120 秒服务端超时、130 秒前端超时及现有限额；思考型模型可能耗尽预算而截断，会显示未完成。Anthropic 多 workspace key 所需额外 header 未提供设置；Google 沿用官方仍文档化的 Generate Content REST，并未迁移至 Interactions。没有添加图片、工具调用、长期凭据存储或正式 Tauri 接入。

质量命令来源为两个 package.json、现有 node:test、CI 配置及本地静态脚本。风险 high（模型凭据/外部网络/流生命周期），通过确定性负向合同、取消测试、独立复核及浏览器验收覆盖本轮增量。DQ-05 浏览器门禁已有证据；DQ-11 的真实模型评测和 DQ-09 的发布/CI/原生验收仍未执行，不宣称生产发布就绪。仅回退本轮增量即可恢复，未做持久化迁移。
