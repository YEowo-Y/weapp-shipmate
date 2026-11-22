# <img src="desktop/public/brand/shipmate.svg" alt="" width="32" height="32" align="absmiddle"> 上线船友 · weapp-shipmate

> **你写代码，我陪你上线。**

帮助小程序开发者整理上线步骤、检查本地项目、理解审核反馈。你可以先不用模型连接，完成预检和清单；需要解释时再连接模型，并明确选择允许读取或分享的内容。

## 先从桌面候选开始

当前源码为发布候选。Windows NSIS 安装包处于候选阶段，公开下载和可信签名待交付。本机安装、运行与卸载的验收记录按所测候选版本保存。 [源码版本](package.json) [首跑与试用说明](docs/14-first-run-and-trial.md)

公开版 `v0.1.0` 提供 CLI `.tgz` 和 MCPB 扩展。npm registry 暂无 `weapp-shipmate` 包。取得 Windows 候选后，先核对版本和 SHA256，再按首跑说明安装并记录安装结果、系统告警和 WebView2 网络要求。[GitHub Release](https://github.com/YEowo-Y/weapp-shipmate/releases/tag/v0.1.0)

你可以从这三件事开始：

1. **打开项目并补充事实**：选择本机目录，填写主体及业务；不知道的事实保留“尚未确定”。
2. **运行预检或生成上线清单**：查看发现、检查限制和条件自查，找到具体下一步及官方来源。
3. **记录准备进度**：人工确认已准备的事项，修改事实后重检；工具中的完成记录不等于官方平台办理完成。

已有项目可从项目管理中导入备份：先预览，再重新绑定本机目录，以追加方式恢复。恢复的报告和运行属于导入历史，不是本机重新检查的结果；监听、通知、权限和阶段状态不会自动恢复，记忆引用默认关闭。详见[当前能力与边界](docs/12-current-capabilities.md)。

## 能帮你做什么

| 需要 | 当前能力 | 必须保留的边界 |
| --- | --- | --- |
| 不知道下一步 | 根据主体和事实生成阶段清单，附官方来源和材料线索 | 未知不等于否；不代办认证、备案、付款或官方提交 |
| 不知道项目漏了什么 | 本地扫描受支持的源码与配置，识别域名、隐私API、模板和声明线索 | 静态检查不能保证无遗漏或审核通过 |
| 看不懂审核反馈 | 拒因查询区分直接匹配与可能相关项，给出处理步骤 | 相似文字不能证明官方实际拒因 |
| 想让AI解释报告 | OpenAI、Anthropic、Google的只读工具路径使用相同权限边界 | 模型质量需另验；只读不等于有权任意读取或分享 |
| 想修改问题 | 可导出修复交接；原生`app.json`完全缺少`requiredPrivateInfos`时，受限修复候选已通过本轮原生验收 | 须明确确认真实业务需要并预览原文；不能任意修改代码，原生验收不等于已签名分发 |

当前有 **64 条默认数据规则和 5 条跨项核验规则**，另有 24 条拒因记录。默认输出非草稿规则，核验日期用于追溯最后一次官方来源核验。处理动作区分代码修改、后台配置、材料准备和人工确认。例如 AppSecret 暴露或不安全 HTTP 调用属于代码项，域名还可能需要后台配置。

`--payment` / `--business`目前提供说明与核对线索，不参与规则筛选或排序，也不自动判定支付资格、官方类目；明确“不支付”也不会删除全部条件自查。无待办项不等于检查完整。完整能力和历史证据见[能力台账](docs/12-current-capabilities.md)。

## 数据和权限

确定性预检默认在本机执行，不要求模型密钥。连接模型后，聊天和你明确选择的上下文会按功能授权发送，不能把整个桌面产品描述为“绝对不出网”。读取项目与分享有界工具摘要分别授权，默认关闭；切换项目、会话、服务商或重启后需重新授权。

项目源码、模型凭据、会话备份和项目备份各有不同边界。导入历史不能自行声明为本机执行；工具报告也不是合规担保。请只选择你愿意检查的项目，不在反馈或试用记录中附上密钥、证照或真实业务资料。

受限修复候选只处理原生`app.json`完全缺少`requiredPrivateInfos`的情况：经业务确认和原文预览后，独占持锁执行**非原子写入**，在本机保留明文备份与日志；撤销使用哈希比对，遇中断需显式恢复，复检结果以实际执行回执为准。它不替你确认业务需要，也不是通用代码修改器。普通项目导出不包含修复日志或源文件，不能用它代替修复备份。详见[候选范围与首跑说明](docs/14-first-run-and-trial.md)。

## 开发者入口

<details>
<summary>CLI 源码运行方式</summary>

从公开仓库获取源码，在源码目录内使用 Node.js 20 或更高版本运行以下命令。

```bash
npm ci
node bin/weapp-shipmate.mjs guide
node bin/weapp-shipmate.mjs check ./my-app --subject personal
node bin/weapp-shipmate.mjs explain "<审核反馈>"
```

在输入和输出都是交互终端时，无参数`guide`会询问主体、是否处理个人信息、是否连接域名三项中文问题；不知道可以保留未知。`--interactive` / `--no-interactive`控制问答，已提供事实不重复问，JSON或管道模式不会等待输入。结果附复现命令。

也可直接提供事实：

```bash
node bin/weapp-shipmate.mjs guide --subject 个人 --no-sensitive --domain --no-interactive
```

主体支持个人、个体户/个体工商户和企业。`--sensitive` / `--domain` / `--payment`表示确认涉及，`--no-*`表示明确否，不确定则不传；同一事实的正反开关不能同时传。`--include-drafts`显式包含草案规则；`--checklist`与`--blockers-only`仍保留解析和扫描范围等检查限制。

自动化检查可通过 `check --fail-on` 选择退出阈值。默认遇 blocker 退出 2；显式指定阈值时，命中项数量同时写入 stderr，stdout 输出完整的所选格式报告。

| 阈值 | 触发退出 2 的发现项 |
|---|---|
| `blocker` | blocker |
| `warning` | blocker、warning |
| `info` | blocker、warning、info |
| `none` | 关闭发现项门禁 |

`--blockers-only` 控制展示，阈值按过滤前的全部发现项计算。`--include-drafts` 选入的草稿也计入阈值。参数或运行错误退出 1；退出 0 表示命令成功且未触发所选阈值，扫描遗漏、截断和待确认事项仍需查看报告。

三条命令均可用 `--json --json-version 1` 输出含整数 `schemaVersion: 1` 的报告，并用包内的 [CLI JSON v1 schema](schemas/cli-report-v1.schema.json) 校验。单独使用 `--json` 继续输出原格式。新参数支持 `--参数=值` 形式，重复指定会报错。`--json-version` 必须与 `--json` 同用，且不能与 `--checklist` 同用。

```bash
node bin/weapp-shipmate.mjs check ./my-app --fail-on warning --json --json-version 1
node bin/weapp-shipmate.mjs guide --subject personal --json --json-version 1
node bin/weapp-shipmate.mjs explain "诱导分享" --json --json-version 1
```

`check` 和 `guide` 可通过 `--config ./shipmate.json`（或 `--config=./shipmate.json`）复用项目事实与阈值。文件为 UTF-8 JSON，格式由 [CLI 配置 v1 schema](schemas/cli-config-v1.schema.json) 定义：

```json
{
  "schemaVersion": 1,
  "check": { "subject": "enterprise", "failOn": "warning" },
  "guide": { "subject": "enterprise", "business": "预约服务", "payment": false, "sensitive": false, "domain": true }
}
```

优先级为内置默认值 < 当前命令配置 < 显式 CLI 值。例如 `guide --config ./shipmate.json --sensitive` 会覆盖文件中的 `false`。主体只接受 `personal`、`individual_business`、`enterprise`；省略事实表示未知，布尔值区分是与否。命令行可覆盖为另一个已知值，恢复未知需从配置中移除该字段。`schemaVersion` 必须是整数 1，其他顶层分区可省略或为空；未知字段、非法值以及未使用分区中的错误都会使命令退出 1。

配置和扫描目录都相对当前工作目录解析，配置位置不改变扫描根目录。不带 `--config` 时不会自动查找配置。`guide --config ...` 默认非交互，添加 `--interactive` 才问答，已有事实不重问；一次执行只读取配置一次，复现命令依赖该文件当时的内容。配置阈值采用与 `--fail-on` 相同的退出码和 stderr 提示。

配置只保存示例所示字段；格式、JSON 输出版本、草稿、聚焦和交互选项继续在命令行指定。`explain` 不接受 `--config`，MCP 和桌面也不自动加载它。文件及其祖先目录不得含符号链接或 junction；文件必须是最多 5 MiB 的本地普通文件，并受现有私有文件名禁读策略约束。不接受 URL、UNC 网络路径或 Windows 数据流、末尾点号/空格别名。读取或解析失败时只显示路径、字段和原因，不显示原始内容；配置文件请勿放入凭据。help/version 不读取配置。

要核对发现项的源码来源，可显式启用证据：

```bash
node bin/weapp-shipmate.mjs check ./my-app --evidence --json --json-version 1
```

每个发现项增加 `evidence: {status, locations}`；位置含相对路径 `file`、从 1 开始的 `line/column`（列按 UTF-16 code unit 计）、`kind` 和 `signal`。API 静态引用用 `api-reference`，Taro 导入用 `api-import`，其余为 `domain`、`insecure-request`、`config-key`、`secret-key`；这些位置表示当前静态匹配来源，不代表运行时调用已发生。只输出 API 名、净化后的 host 或键名，不附代码片段、完整 URL 或密钥值。配置解析器无法可靠恢复行列时，两者为 `null`，只提供文件级证据。

`located` 表示该项本次关联的已检出信号都有位置；`partial` 表示包含文件级证据、缺失定位、动态域名提示或截断；`unavailable` 表示无可关联来源。定位状态与扫描完整性独立，仍需查看 `meta.scan.scope` 和 notes。`meta.evidence` 声明证据版本及是否截断：全局最多保存 20,000 个位置，每项最多展示 100 个；截断有明确注记，扫描与退出阈值照常计算。

`--evidence` 仅用于 `check`，必须与 `--json --json-version 1` 同用，不能重复或与 `--checklist` 同用；可搭配配置、阈值、草稿和聚焦参数。未指定时输出不变，MCP/桌面不自动启用。

#### 本地证据基线

在仓库根目录保存 `my-app` 的快照并在修改后再次预检。示例将 `baseline.json` 存在扫描目录外，两个相对路径均从命令的工作目录解析。

```bash
node bin/weapp-shipmate.mjs check ./my-app --evidence --json --json-version 1 --baseline-snapshot > ./baseline.json
node bin/weapp-shipmate.mjs check ./my-app --evidence --json --json-version 1 --baseline ./baseline.json
```

在 PowerShell 中，可以显式以 UTF-8 保存快照，再运行上面的对照命令。

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
node bin/weapp-shipmate.mjs check ./my-app --evidence --json --json-version 1 --baseline-snapshot |
  Set-Content -LiteralPath ./baseline.json -Encoding utf8
$snapshotExit = $LASTEXITCODE
```

两种模式都要求 `check --evidence --json --json-version 1`，支持配置、主体、草稿和阈值参数。`--baseline-snapshot` 与 `--baseline <file>` 互斥，`--baseline=<file>` 也是有效写法。重复指定或搭配 `--blockers-only`、`--checklist` 会退出 1。

只读取明确指定且由 `--baseline-snapshot` 保存的快照。快照是最多 5 MiB 的本地 UTF-8 JSON 普通文件，沿用配置的私有文件、链接与 Windows 路径限制。读取或格式错误以及超量均退出 1，stdout 为空。

两次扫描的项目根路径、扫描策略、CLI 版本、规则包散列、主体和草稿开关一致，且扫描完整、证据未截断时，按规则 ID 和证据位置比对。根路径按报告中的本地绝对路径精确比较。文件集合可以变化。移动或改名会产生新增位置和仅旧位置，同一位置的调用变动可能没有位置差异。

对照结果写入 `meta.baseline`。`compared` 表示已比较，`partial` 表示有规则缺少完整位置证据，`incomparable` 表示整份报告不可比，详见 `reasonCodes`。可比的位置汇总为 `counts.currentOnly`、`counts.common` 和 `counts.previousOnly`，不可比规则数见 `counts.incomparableRules`。每项的 `baseline.currentOnlyLocationIndexes` 按升序指出 `evidence.locations` 中新增位置的从 0 起算索引。

门禁和 stderr 诊断继续按当前全部发现项计算。保存命令退出 2 时，快照仍可作为后续对照输入。调用方应分别保留快照和命令退出码。

规则报告的可选 `confidence` 字段保留规则库的 `high` / `medium` / `low`，Markdown 与可勾选清单显示为高/中/低。这是规则维护者对规则准确性的把握，不是命中概率或过审保证，也不改变严重度。流程导航项、合成检查及缺少字段的历史报告不补造评级；低置信规则仍只通过显式包含草案显示。

历史GitHub tag或tarball可以用于复现历史版本，但不应作为当前修复后的候选。构建和验证入口见[首跑说明](docs/14-first-run-and-trial.md)。

</details>

<details>
<summary>MCP与MCPB：已有兼容宿主的用户</summary>

Codex CLI 和 Claude Code 用户可安装本地插件，一并获得上线预检 skill 和三个 MCP 工具。先在仓库根目录构建，需要 Node ≥20 和已安装的宿主 CLI。

```sh
npm ci
npm run build:plugins
```

Codex 安装命令如下。

```sh
codex plugin marketplace add "<仓库绝对路径>/build/plugins/codex"
codex plugin add weapp-shipmate@weapp-shipmate-local
```

Claude Code 安装命令如下。

```sh
claude plugin marketplace add "<仓库绝对路径>/build/plugins/claude" --scope user
claude plugin install weapp-shipmate@weapp-shipmate-local --scope user
```

安装后开启新会话，在 Codex 中使用 `$weapp-shipmate:weapp-shipmate`，在 Claude Code 中使用 `/weapp-shipmate:weapp-shipmate`，并提供小程序目录或审核反馈，例如“检查 D:/Projects/my-mini-app 的上线准备事项”。skill 会引导宿主调用对应工具。包内含规则和生产依赖，运行时需要 PATH 中的 Node；本地市场目录应保留以供后续管理。

Windows 实测版本为 Codex CLI 0.164.0 和 Claude Code 2.1.300。维护者可在构建后运行以下验收命令。脚本在临时配置中安装包，发现 skill，并通过各宿主调用三个工具、核对夹具结果。Codex 使用 app-server 的工具调用接口，Claude Code 使用临时工具 hook，验收结束于模型推理前。

```sh
node scripts/verify-codex-plugin.mjs
node scripts/verify-claude-plugin.mjs
```

卸载插件及本地市场可执行对应宿主的命令。

```sh
codex plugin remove weapp-shipmate@weapp-shipmate-local
codex plugin marketplace remove weapp-shipmate-local
claude plugin uninstall weapp-shipmate@weapp-shipmate-local --scope user
claude plugin marketplace remove weapp-shipmate-local --scope user
```

本地 stdio 服务端提供三个只读工具：`weapp_shipmate_check`、`weapp_shipmate_guide` 和 `weapp_shipmate_explain`。`2025-06-18` 客户端通过 `initialize` 握手。`2026-07-28` 客户端在每次请求的 `params._meta` 中提供 `io.modelcontextprotocol/protocolVersion` 和 `io.modelcontextprotocol/clientCapabilities`，首次请求即可发现服务（`server/discover`）、列出工具或调用工具。

客户端可用 `tools/list` 中各工具的 `outputSchema` 校验成功响应的 `structuredContent`。默认格式提供可读 Markdown，新版响应还附有相同结果的 JSON 文本。指定 `format: "json"` 可只取一份 JSON 文本，同时保留结构化结果。

从源码启动的宿主配置示例：

```json
{
  "mcpServers": {
    "weapp-shipmate": {
      "command": "node",
      "args": ["<仓库绝对路径>/bin/weapp-shipmate-mcp.mjs"]
    }
  }
}
```

MCP服务端按客户端指定的目录、以进程现有权限读取支持的源码/配置，只向可信客户端开放。内核不上传源码；宿主可按自己的授权机制分享结果。船友不运营接收代码、报告或密钥的服务器。你现在就可以给聊天添加受限文件，它的内容会随消息发给你选的模型服务商；这与允许工具读取项目、分享摘要和开启 agent 是分开的。在此之外，桌面工具规划了两种源码出站操作：按项目开启默认关闭的 agent 模式，将它读取的文件内容发给你自选的模型服务商；或由你逐次点击预览、上传体验版，经本机已登录的开发者工具把代码包只传给微信。上传还须打开默认关闭的开关。预览和上传都不提审、不发布。

MCPB 是供兼容宿主安装的扩展。以 Claude Desktop 为例，宿主提供的 Node 运行时仍须满足包的兼容要求。

维护者可运行`npm run build:mcpb`；当前脚本在pack失败时可能保留暂存目录并给出手动命令，进程退出成功不证明`.mcpb`已生成。必须检查实际文件、版本、SHA256和签名，再做宿主安装验证。详见[首跑说明](docs/14-first-run-and-trial.md)。

</details>

## 当前交付与历史记录

当前工作树包含桌面项目、报告、阶段进度、项目记忆和维护能力；具体完成程度以[能力台账](docs/12-current-capabilities.md)为准。本轮目标是候选交付件和[五人试用材料](docs/11-outreach-plan.md)，可信签名和真实参与者后续安排，尚无五人真实结果。

2026-07-17历史核验曾记录：63条种子规则、214例测试，11个真实开源样本覆盖六类框架；89条人工标注、15个夹具得到TP55/FP0/FN0。**这些数字是历史快照，不是当前工作树的测试结果或当前规则数量。** 后续修复与验收按各次交付记录保存，不把旧资产、旧测试或安全告警清零等同当前安装器可发布。

| 文档 | 内容 |
| --- | --- |
| [当前能力](docs/12-current-capabilities.md) | 实现、部分闭环、演示与待实现的边界 |
| [本轮产品批次](docs/15-product-batch-delivery.md) | 已完成路径、24项原生验收与剩余交付证据 |
| [首跑与验包](docs/14-first-run-and-trial.md) | 候选、签名、安装和匿名记录 |
| [五人试用](docs/11-outreach-plan.md) | 统一任务、理解目标和真实结果空表 |
| [定位与边界](docs/02-positioning-and-naming.md) | 产品职责与人工决策边界 |
| [架构](docs/03-decisions-and-architecture.md) | CLI/MCP、规则数据和流程骨架 |
| [质量与验收](docs/06-quality-and-acceptance.md) | 质量门禁与验证口径 |
| [产品愿景](docs/08-product-vision.md) | 长期方向，不等同当前已交付能力 |

## In English

weapp-shipmate helps WeChat Mini Program developers inspect local projects, understand review feedback, and decide what to prepare next. It provides a desktop interface plus CLI and MCP tools. Deterministic checks run locally; optional model connections require explicit choices about project reading and context sharing.

The source tracks a release candidate. Local install, native smoke and uninstall records identify the Windows NSIS candidate tested. The public `v0.1.0` release contains a CLI tarball and an MCPB extension for compatible hosts. The Windows installer awaits public distribution and trusted signing. The narrowly scoped `app.json` repair candidate passed this batch's native acceptance and uses non-atomic locked writes with local plaintext backups. Real-account model quality and user trials are pending. [Source version](package.json) [GitHub Release](https://github.com/YEowo-Y/weapp-shipmate/releases/tag/v0.1.0)

## License

MIT 许可允许合法复用。维护者承诺纯公益、无商业化计划，治理边界包括不接代办、不卖课、不接广告、不做合规担保。[LICENSE](LICENSE) · [治理边界](GOVERNANCE.md)
