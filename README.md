# <img src="desktop/public/brand/shipmate.svg" alt="" width="32" height="32" align="absmiddle"> 上线船友 · weapp-shipmate

> **你写代码，我陪你上线。**

帮助小程序开发者整理上线步骤、检查本地项目、理解审核反馈。你可以先不用模型连接，完成预检和清单；需要解释时再连接模型，并明确选择允许读取或分享的内容。

## 先从桌面候选开始

本轮先交付**Windows 桌面候选和试用材料**。NSIS安装包已完成本机安装、运行与卸载验收，尚无公开下载地址；当前没有可信签名证书，不能将候选称为已签名正式版。产物、SHA256和实际验收记录见[首跑与试用说明](docs/14-first-run-and-trial.md)。

2026-10-25核查：GitHub仓库仍为私有，rc.3 Release仍是草稿，npm确切包名未发布。已有tgz/mcpb资产不等于普通用户可获取的桌面安装器。获得候选后，先核对版本和SHA256，再按首跑说明安装；系统告警、WebView2网络要求和安装失败都应记录，不能省略为“下载即用”。

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

当前有**66条默认数据规则和5条跨项核验规则**，以及24条拒因记录；跨项核验规则不是draft。默认输出非草案规则；核验日期用于追溯，不表示当天重新核对过官方政策。处理动作区分代码修改、后台配置、材料准备和人工确认：例如AppSecret暴露或不安全HTTP调用中的本机代码问题应归为代码项，域名后台配置也可能同时需要处理。

`--payment` / `--business`目前提供说明与核对线索，不参与规则筛选或排序，也不自动判定支付资格、官方类目；明确“不支付”也不会删除全部条件自查。无待办项不等于检查完整。完整能力和历史证据见[能力台账](docs/12-current-capabilities.md)。

## 数据和权限

确定性预检默认在本机执行，不要求模型密钥。连接模型后，聊天和你明确选择的上下文会按功能授权发送，不能把整个桌面产品描述为“绝对不出网”。读取项目与分享有界工具摘要分别授权，默认关闭；切换项目、会话、服务商或重启后需重新授权。

项目源码、模型凭据、会话备份和项目备份各有不同边界。导入历史不能自行声明为本机执行；工具报告也不是合规担保。请只选择你愿意检查的项目，不在反馈或试用记录中附上密钥、证照或真实业务资料。

受限修复候选只处理原生`app.json`完全缺少`requiredPrivateInfos`的情况：经业务确认和原文预览后，独占持锁执行**非原子写入**，在本机保留明文备份与日志；撤销使用哈希比对，遇中断需显式恢复，复检结果以实际执行回执为准。它不替你确认业务需要，也不是通用代码修改器。普通项目导出不包含修复日志或源文件，不能用它代替修复备份。详见[候选范围与首跑说明](docs/14-first-run-and-trial.md)。

## 开发者入口

<details>
<summary>CLI：从有权限的源码副本运行</summary>

需要Node.js≥20和本机依赖环境；获取私有GitHub仓库还需要相应权限。以下在已有源码副本内执行，不代表npm包已经公开发布：

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

规则报告的可选 `confidence` 字段保留规则库的 `high` / `medium` / `low`，Markdown 与可勾选清单显示为高/中/低。这是规则维护者对规则准确性的把握，不是命中概率或过审保证，也不改变严重度。流程导航项、合成检查及缺少字段的历史报告不补造评级；低置信规则仍只通过显式包含草案显示。

历史GitHub tag或tarball可以用于复现历史版本，但不应作为当前修复后的候选。构建和验证入口见[首跑说明](docs/14-first-run-and-trial.md)。

</details>

<details>
<summary>MCP与MCPB：已有兼容宿主的用户</summary>

stdio MCP服务端提供`weapp_shipmate_check`、`weapp_shipmate_guide`、`weapp_shipmate_explain`。源码方式的配置示例：

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

MCP服务端按客户端指定的目录、以进程现有权限读取支持的源码/配置，只向可信客户端开放。内核不上传源码；宿主可按自己的授权机制分享结果。船友不运营接收代码、报告或密钥的服务器。规划中的桌面源码出站只有两项：按项目开启默认关闭的 agent 模式，将它读取的文件内容发给你自选的模型服务商；或由你逐次点击预览、上传体验版，经本机已登录的开发者工具把代码包只传给微信。上传还须打开默认关闭的开关。预览和上传都不提审、不发布。

MCPB是安装到兼容宿主（例如Claude Desktop）的扩展，**不是独立桌面程序**。Claude Desktop带有Node运行时，但仍须满足包的兼容要求。当前rc.3草稿中的旧包未签名且早于10月修复，不能描述为最新签名交付件。

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

The Windows NSIS candidate has passed local install, native smoke and uninstall checks on a development machine. There is no public installer URL or trusted signing certificate yet. The repository is private, the rc.3 release is a draft, and the npm package is unavailable as checked on 2026-10-25. MCPB requires a compatible host; it is not a standalone desktop app. The narrowly scoped app.json repair candidate passed this batch's native acceptance; it uses non-atomic locked writes with local plaintext backups and is not a general code editor. Native acceptance does not establish signed distribution, real-account model quality, or real-user trial completion.

## License

MIT，见[LICENSE](LICENSE)。维护者承诺纯公益、无商业化计划；MIT许可允许合法复用，当前仓库访问权限另行管理。[治理边界](GOVERNANCE.md)包括不接代办、不卖课、不接广告、不做合规担保。
