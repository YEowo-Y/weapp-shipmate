# P4 · 模型连接、系统凭据与显式上下文

日期：2026-10-22。对应[总体计划](../../../.omx/plans/project-completion-plan-20261022.md)的 P4，执行合同为 `.omx/plans/p4-connections-execution.md`。这是正式 Windows 桌面的实现记录，不代表 P5–P8、真实外部账号或发行验收完成。

## 用户路径与真实边界

1. 打开“模型连接与设置”，选择服务商。默认凭据仅本次运行有效；用户可明确选择 Windows 系统凭据库。OpenRouter 另有现有浏览器回调和授权码 PKCE；不添加未经支持的 ChatGPT / Claude 订阅登录。
2. 连接只读取目录。选定模型后可主动执行简短推理测试，界面说明可能计费；目录成功不被标为推理成功。刷新、重连和启动应用不会自动生成回复。
3. 系统保存的凭据在重启后显示为待重连；读取失败可重新读取或删除。密钥不从原生存储回传 WebView，也不写进项目、会话和备份。替换账户先删除旧凭据，失败后需重新输入，不能悄悄恢复旧账户。断开删除本机条目，不代表撤销厂商远端 API key。
4. 自定义服务仅支持 OpenAI Chat Completions。默认公共 HTTPS，显式允许的 HTTP 仅限本机回环；拒绝私网解析、重定向及不安全地址。连接固定经过校验的 DNS 地址并保留 TLS 主机验证，凭据绑定完整规范地址。没有添加任意 URL 代理或第二套模型框架。
5. 在输入框“＋”明确选择当前项目的报告或文本文件，展开核对发送内容、来源和 UTF-8 字节数。选择仅本次应用内按项目与会话隔离；重启后重新选择。移除阻止后续发送、重试和重新生成携带该资料，不能撤回已经外发的数据。

文件由 Rust 根据可信项目目录读取：单文件最多 16 KiB、合计 24 KiB / 8 项；完整模型请求仍受 64 KiB、100 条消息及单条字符上限约束，超限明确拒绝，不截断。拒绝越界、链接/reparse point、敏感文件、二进制与无效 UTF-8。Windows 读取期间持有目录与文件句柄，防止检查后替换路径。敏感检测不能保证识别所有秘密，发送前仍提供原文预览。报告是已保存快照，标明时间及事实版本。

## 复用、依赖与修改文件

保留 Vanilla TypeScript、Vite、Tauri 2、Web Awesome、Lucide、原生 dialog 和现有会话/流事件；没有新增 npm 依赖、重复会话存储或 Agent 框架。正式桌面支持自定义连接；开发预览的自定义设置仍为草案，未把它标为真实聊天入口。

| 范围 | 实际文件 |
|---|---|
| 私有凭据与桥接 | `desktop/src-tauri/src/credential_store.rs`、`model_bridge.rs`；`desktop/server/credential-rpc.mjs`、`desktop-bridge.mjs` |
| 连接、验证与受限网络 | `desktop/server/model-connections.mjs`、`custom-endpoint.mjs`、`model-providers.mjs`、`chat-stream.mjs` |
| 连接界面与共享契约 | `desktop/src/model-connection.ts`、`model-connection.css`、`model-picker.ts`、`shared.d.ts`；`desktop/design-previews/model-connection-client.js`、`desktop-model-fetch.js`、`chat-transport.js`、`settings.js` |
| 显式上下文 | `desktop/src/context.ts`、`context.css`、`sessions.ts`；`desktop/design-previews/chat-context.js`；`desktop/src-tauri/src/project_context.rs`、`project_store.rs` |
| 原生注册与依赖 | `desktop/src-tauri/src/lib.rs`、`build.rs`、`capabilities/default.json`、`Cargo.toml`、`Cargo.lock` |
| 自动化 | `scripts/desktop-native-e2e.mjs`；对应连接、RPC、传输、上下文、会话、权限和 Rust 回归测试 |
| 文档 | `desktop/README.md`、`docs/12-current-capabilities.md`、P4 执行/研究/验收记录与总体计划状态 |

系统库采用 `keyring-core =1.0.1` 和 `windows-native-keyring-store` 固定上游 commit `493ecaa5442c3cbd445253ad78b58f54382a9049`，禁用默认 search feature，使用正式 Store/Entry API、Local 持久化和固定应用命名空间。MIT OR Apache-2.0；Rust 最低要求由后者提高至 1.88。注册表 1.1.0 未包含所需并发修复，因此没有用相同版本号冒充修复版本。官方源码、发布包校验和 API 依据见[依赖研究](p4-credential-sources-20261022.md)。

## 验证记录

风险为 high：涉及凭据、文件和网络权限，使用真实 Windows 凭据库、原生 IPC 和隔离运行时验证。质量命令来自根/desktop manifests、CI 和既有原生脚本。证据目录为 `.omx/artifacts/p4-connections/`。远端 CI 矩阵没有在本轮运行，不能由本机结果推定通过。

| 检查 | 本轮观察结果与证据 |
|---|---|
| 修改前基线 | Node 1054/1054，`node-baseline.log`；自定义聊天未支持的 red case 保存于 `chat-transport-red.log` |
| 最终全量 `npm test` | 1098/1098，0 skipped / 0 failed，`node-final.log` |
| 最后关闭入口与提示修正 | 对话框、上下文与桌面会话定向 40/40，`ui-final.log`；真实窄屏关闭及焦点在原生验收复验 |
| 静态 / 类型 / 构建 | 根 lint、桌面 TypeScript/Vite、Tauri debug 通过，`lint-final.log` / `native-final-build.log`；现有根 ESLint 不覆盖所有桌面源码，代理另执行了相关 JS 的显式 ESLint |
| Rust | `cargo test --lib -- --include-ignored` 49/49，含真实 Windows 凭据线程和多进程验证；`cargo fmt --check`、Clippy `-D warnings` 通过，`rust-final.log` / `clippy.log` |
| 来源与规则质量 | 引文 66/66 通过，其中两条为既有人工快照；coverage precision/recall 1.000，TP55/FP0/FN0；30/71 可命中规则有准确性锚点，不代表全业务准确率，`quotes-final.log` / `coverage-final.log` |
| 依赖审计 | 根/desktop 生产 npm 依赖 0 已知漏洞，`root-audit.json` / `desktop-audit.json`；Rust 自动漏洞库扫描仍待补 |
| 独立审查 | 14 个核心实现文件审查后，追加 3 个连接 UI 文件与 5 个上下文文件复核；没有未解决的已确认阻塞项。审查者没有冒充重新运行父线程测试 |

最终原生验收与截图记录见下节；以上单元和构建证据不能代替实际交互、外部账户和安装版验收。

独立审查关闭了异常 HTTP 响应导致进程异常、凭据保存回执不确定、取消授权后清理错误被掩盖、跨会话操作覆盖和 OAuth 一直停留在交换状态等问题。所有故障都有对应回归；删除失败保留明确错误和重试入口，不自动回退明文。内置厂商使用明确标记的协议夹具，自定义服务另以本机真实 HTTP 服务验证受限网络传输。

首轮原生验收发现夹具没有 `finish_reason: stop`，产品按不完整流拒绝推理验证。修复的是测试服务的协议结束帧，没有放宽产品的成功条件。实际截图发现已连接表单过长，模型目录低于首屏；以此为基线修正信息层级和滚动，并复验键盘与错误路径。

已连接状态将模型目录放到首屏，刷新、删除和系统凭据恢复位于折叠编辑区之外；待授权时强制展开并保留取消。折叠编辑区清理输入中的密钥和授权码，焦点回到原生 summary。标题与厂商导航保持可达，详情独立滚动；重开和切换厂商重置滚动。上下文预览的原始毫秒时间戳改为结构化数据，界面与实际发送使用同一中文日期/事实版本描述，正文不变。窄屏长预览保留固定标题与关闭图标，关闭后返回添加资料入口；已选模型的推理提示不再重复要求选模。

## Windows 原生验收与视觉证据

最终 **12/12 通过**：`.omx/artifacts/desktop-model-native/run-2026-10-22T20-59-06-657Z/results.json`。构建标识 `com.weappshipmate.acceptance.p4.1792702671841`，exe SHA-256 `a672c332704f96df30d69386e62898fc21cf429c3bbcc3f85a46a3f38eb6112f`。

实际运行 Tauri/WebView2 → 原生 IPC → 随包 Node，Windows 凭据库使用隔离假密钥：系统保存与重启重连、显式推理、聊天/停止、删除后重启不恢复、临时账号替换不复活旧凭据、OAuth 重启不重复交换、报告附加/预览/移除后的实际请求内容、项目隔离、文件读取边界、自定义 HTTP 回环传输与私网拒绝、窄屏关闭/焦点返回均通过。没有 invoke mock。内置模型协议由隔离子进程 fetch 夹具提供；自定义服务用真实本机 HTTP server。系统文件选择器不在自动化范围。

宽窗口约 1000×720、窄窗口约 390×845，Windows 150% 缩放使截图像素尺寸更大。已实际检查同目录 `p4-system-connected.png`、`p4-edit-connection.png`、`p4-connections-narrow.png`、`p4-context-preview.png`、`p4-context-narrow.png`：模型目录首屏可见，厂商导航和关闭可达，预览可滚动且无横向溢出。窄屏关闭后焦点返回输入区添加按钮。视觉判定记录在 `.omx/state/p4-connections/ralph-progress.json`，这是本轮范围自检，不是竞品像素一致或完整 WCAG 认证。

复现方式：用全新 `com.weappshipmate.acceptance.p4.<数字>` 标识构建 debug exe，再运行 `node scripts/desktop-native-e2e.mjs --connections --isolated-runtime --expected-identifier=<该标识>`。每轮使用新标识，不删除/覆盖旧数据库来伪造首次运行；脚本只访问明确校验过的测试路径。最终假凭据已通过 UI 删除。验收副本复制后已成功重新构建默认 `com.weappshipmate.desktop` debug exe，见 `default-final-build.log`；未启动生产标识数据库、安装或发布。

## 启动与恢复

无新增环境变量。已有依赖与 Windows Rust/WebView2 工具链就绪后，在仓库根运行：

```powershell
npm --prefix desktop run tauri dev
# 或构建独立 debug 可执行文件
npm --prefix desktop run tauri -- build --debug --no-bundle
```

自动准备锁定的 Node 24.22.1 和随包资源。系统凭据不可用时显示错误；用户可以明确选择临时连接。Windows 系统存储是用户级保护，不保证同一用户下所有其他进程均不能读取。私有凭据 RPC 只在 Rust/Node 间分派，公共 WebView 事件有类型/字段允许列表。超时保存的结果不确定时排队补偿删除并显示失败，后续显式刷新重新读取权威状态。

回退可停用新自定义服务和上下文入口，旧内置文本聊天与本地领域工具保留。降级到旧二进制不会删除系统凭据；如需删除，先用本版明确断开。凭据库没有通用秘密导出/读取接口，不建议手工修改项目库或降低 schema 版本。测试仅使用唯一验收命名空间和假密钥，不触及生产账户。

## 尚未验证与后续门禁

- Work 设置禁用浏览器访问，本轮不能标记浏览器页面矩阵通过；原生 WebView2 的结果单列。
- 外部厂商真实账号 OAuth、额度/计费、真实公网自定义 TLS 服务未验；协议夹具不证明这些项目。
- 原生系统文件选择器未自动化；实际文件读取与边界由 IPC / Rust 测试覆盖，不冒充完整选择器端到端。
- 本轮未运行干净 Windows 安装、签名、升级或真实用户理解测试；不会发布或替换用户安装版。
- 上游固定 commit 的 Global named mutex 仍有名称抢占拒绝服务风险，PR #36 尚未合并；不宣称完全解决。升级候选须重新验证并发和恢复。
- 根/desktop 生产 npm 审计均为 0 已知漏洞；本机未安装 `cargo-audit`，Rust 全量自动漏洞库扫描不可用，源码核实和 Clippy 不能替代它。正式分发前需补验。
- 主 JS 545.07 kB / gzip 180.56 kB，较 P3 增加约 11.75 kB / gzip 3.83 kB；CSS 205.81 kB / gzip 36.23 kB。Vite 既有大包与混合导入警告保留，按 P8 测量拆分；不会通过提高阈值隐藏警告。此为测量记录，没有虚构性能阈值或完整压力测试通过声明。

发布前待办登记（未申请豁免、不代表已批准发布）：

| ID / 类型 / 级别 | 状态、依据与处理 | 验证 / 责任 / 到期 |
|---|---|---|
| P4-ENV-01 / test / medium | needs-decision；浏览器访问设置禁用。保留原生替代证据，不绕过 | 环境恢复后跑浏览器矩阵；项目维护者，P8 前；无豁免审批 |
| P4-AUTH-01 / test / high | needs-decision；无真实外部账号验收。协议 fixture 与真实 loopback 分列 | 准备独立测试账号后验证授权/推理/错误恢复；项目维护者，外部接入发布前；无豁免审批 |
| P4-DEP-01 / security / medium | needs-decision；上游 mutex 名称抢占风险与本机无 cargo-audit。已固定并核实上游源码、测试真实并发，不能等同完整漏洞审计 | 跟进上游 PR #36 并补 RustSec 扫描及失败恢复；项目维护者，分发前；无风险豁免 |
| P4-UI-01 / performance / low | scheduled；现有大包/混合导入警告，未加相似库，未降低阈值 | 按批准 P8 测量拆包；项目维护者，P8；原计划已列此工作，不构成发行豁免 |

浏览器、真实账号和发行相关门禁分别为 BLOCKED；本轮本机源码、测试、原生交互与构建结果单列为已验证，不宣称生产发布就绪。

后续阶段为 P5：单 Agent 与只读工具闭环。当前文本聊天、领域工具、资料发送已经真实接通，但模型自主选工具、持久执行器、文件写入、长期记忆仍不在本轮完成范围。
