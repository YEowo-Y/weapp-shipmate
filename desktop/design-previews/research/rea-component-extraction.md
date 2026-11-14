# REA 参考组件提炼

日期：2026-10-13。范围：主工作台、完整对话与组件验收页共用的工具卡。

## 修改前的计划

现有工具卡已经共用源码，但展开后只有参数与固定摘要，看不到对应运行的校验结果或错误。这次保留现有控制器、消息结构、原生 details 与主题，补齐结果分区，不新增 Agent 框架或消息协议。

1. 已运行修改前基线：对话、结果和组件状态 14/14 测试通过。
2. 实查 assistant-ui Tool call 的展开行为，并用独立目录中的 REA 6.4.0 分析公开分发组件；保存版本、摘要、证据与局限。
3. 工具卡接收现有消息中的结果与错误。成功仅显示已校验结果；失败显示对应错误；运行和停止显示明确的无结果状态。保留错误卡的单一重试入口。
4. 在共享组件和验收页落地，保护展开状态、焦点、取消与重试隔离，补充状态合同测试及桌面/手机实测。

此专项最初只涉及原生 JS/CSS 工具卡，REA 仅作为本地调研工具。随后按用户要求扩展到全项目基础控件与正式 Tauri 入口，见 [最终验收](../COMPONENT-STANDARDIZATION.md)。没有修改全局 MCP 配置，Agent 对话仍为明确标记的本地演示。

## 调研与验证记录

### 工具核验与实际执行

- [REA](https://github.com/morluto/rea) 是分析工具，不是 UI 导出器。核验 README、许可证、启动入口和实际 npm 包；源码 HEAD 为 `3ae826ceba6f25b08bce50bcb51001209bc16b57`。REA 自有代码 MIT，参考组件许可另行核验。
- 本地 Node 为 24.14.0，符合 REA 6.4.0 的 `^22.19.0 || ^24.11.0 || >=26.0.0`。通过 npm 在 `.omx/research/rea-cli` 单独安装固定 6.4.0，禁用生命周期脚本；没有改项目 package.json/lockfile，没有全局安装、setup 或 MCP 注册。
- 实际读取并采用包内 `skills/reverse-engineer-anything/SKILL.md` 与 JavaScript 指南。选择公开分发组件的静态分析，网站交互由已有浏览器工具实查，不启动原生反汇编器或额外浏览器。
- npm 主包 integrity：`sha512-Vj1zWfSlna5bphGoaoI/TcVBuYvze9u+OyPC3Shz8YkBqaCTqB4COnnRoX7XDwMpwI24ZlFEel2yEj0k8LTWEQ==`。Git clone 因 TLS 失败，改用 npm 发布包核验；没有把 clone 失败算作成功。
- 发现主分支指南与发布版参数有差异：6.4.0 的实际帮助没有 `--source-path`，使用专门的 extracted 目录与 `--format json`。以后使用时仍应先读取实际安装版本帮助。

本次成功运行（仓库根目录，PowerShell）：

```powershell
node .omx/research/rea-cli/node_modules/rea-agents/scripts/rea.mjs analyze-javascript-application C:/Dev/Projects/weapp-shipmate/.omx/research/assistant-ui-reference/extracted --analysis-timeout-ms 30000 --format json > .omx/state/rea-components/analysis.json 2> .omx/state/rea-components/analysis-progress.jsonl
```

退出码 0，原始 Evidence ID：`ev_a997135f796e876f66c20a069a3f7a00e312cafaf97661eef2a5b56c8afd4f0d`。解析 3 个 TSX 文件、8157 字节，0 个解析失败。完整记录保留在上述本地路径；[可审阅摘要与来源哈希](rea-evidence-summary.json) 是原始输出的投影，不冒充完整 Evidence。

### 实际参考及采用映射

官方页面：[assistant-ui Tool call](https://www.assistant-ui.com/elements/tool-call)。本次在浏览器点击示例，实际展开 Request 和 Result：请求为 draft persistence 查询，结果为 3 条匹配；安装折叠区提供 `@assistant-ui/elements-tool-call` 分发标识。

由 [shadcn 注册表](https://ui.shadcn.com/r/registries.json) 解析到 [官方组件 JSON](https://r.assistant-ui.com/elements-tool-call.json)。没有运行 shadcn 安装命令。提取 `tool-call.tsx`、其分发依赖 `collapsible-root.tsx`，补充固定上游 `surfaces.tsx` 和 MIT LICENSE；不将 React/Radix/Tailwind 依赖加入当前项目。

`tool-call.tsx` 的分发内容与 [上游 c31385e 源码](https://github.com/assistant-ui/assistant-ui/blob/c31385ee05068eaa539d10e3f7e5d4b8b5c396ef/packages/ui/src/components/react/assistant-ui/elements/tool-call.tsx) 字节一致，SHA-256：`71c673d273b02d5757ae06c8b3be006b29f6a522ebea344243e66977c2b7259b`。完整来源、其他文件哈希与许可证核验记录在摘要中。

| 依据 | 项目采用方式 |
| --- | --- |
| 浏览器实际展开 Request / Result；源码 79、86 行分区标题 | 共用工具卡在参数下增加本次结果或错误详情 |
| 源码 22–27、44–45 行显式传入 request/result/open/onOpenChange | 使用现有消息结果与错误，不解析回复正文猜测完成；保留用户展开状态 |
| REA 识别 ToolCall 导出及本地组件引用；surfaces 为共用样式 | 继续使用现有共享工厂与 app.css 语义色，不复制整套组件库 |
| 源码 71 行 `!running` 显示完成勾号 | 不采用此判断：项目保留 running/success/fail/canceled 四态 |
| 源码文本插值，公开组件不是执行引擎 | 本地结果经既有校验后以 textContent 输出；不执行目标源码、HTML 或指令 |

### 证据限制

REA 文件清单覆盖完整，但语义关系覆盖为 unknown/partial；React、Radix、lucide 与 utils 的运行实现不在此次分析输入中，JSX 返回形状也不能由该静态分析完整证明。展开行为来自真实浏览器观察；具体渲染条件来自人工核对源码。不能把这次结果称为完整 assistant-ui 审计或 Codex/Claude 客户端逆向。

surfaces 注册表请求两次超时，改为固定上游源码；collapsible-root 分发内容未与同一提交匹配。原组件为 MIT，许可留在调研目录；项目采用交互原则独立实现，没有粘贴上游组件代码或资源。

## 验收

工具卡已经接入现有结果校验与错误对象：成功显示已校验结果，失败显示对应错误，运行/取消不显示旧结果；错误卡保留一个重试入口。长 JSON 结果限高且可用键盘滚动，重新渲染保留展开、焦点和内部滚动。阅读详情期间暂停自动跟随，并补偿上方流式正文增长造成的位置移动；点击“回到最新”恢复跟随。

浏览器验证成功、失败、重试、停止、旧结果在新回复完成后的阅读位置，以及 320px 下 running → success 的详情位置（变化约 2.4px，改造前约 237px）。最终全量测试 259/259、根 lint 与预览显式 lint 均通过；独立增量审查通过。完整全页验收与未验证边界见 [组件标准化报告](../COMPONENT-STANDARDIZATION.md)。证据位于 `.omx/state/rea-components/`。

启动命令沿用 `node desktop/design-previews/_serve.mjs`；无新增环境变量。更多产品来源及采用范围见 [Cherry Studio / OpenClaw / Hermes 调研](agent-product-reference.md)。
