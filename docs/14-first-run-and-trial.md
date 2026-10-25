# 14 · 首跑、验包与五人试用

更新：2026-10-25。用户已确认“暂未准备，先完成可交付候选与试用材料”。本轮验收范围是候选交付件及试用材料；可信签名和五人真实执行待用户安排，不伪造完成，也不阻止本轮材料交接。Windows候选安装包正在构建验收，实际产物和hash由维护者确认后记录；当前不提供未验证的下载地址，不表示已签名、公开分发或完成五人验证。

## 当前分发事实

2026-10-25 15:32 UTC，以现有授权GitHub只读API和公开npm registry复核：

| 对象 | 观察 | 对试用的影响 |
| --- | --- | --- |
| [仓库](https://github.com/YEowo-Y/weapp-shipmate) | `private=true` | 普通无权限用户不能直接获取 |
| [Releases](https://github.com/YEowo-Y/weapp-shipmate/releases) | v0.1.0非草稿；rc.1–rc.3均draft | 非草稿仍受私仓权限限制 |
| Release资产 | tgz/mcpb/部分SHA256SUMS；没有exe/msi | 没有现成Windows安装器下载入口 |
| [npm包名](https://registry.npmjs.org/weapp-shipmate) | HTTP404 | 不能声称该确切包名已发布 |
| rc.3 MCPB | 7月旧资产，无标准MCPB签名块 | 不是当前修复后的签名交付件 |

rc.3 MCPB于2026-10-25只读实物核验：212142 bytes，SHA256 `9d0084bb19faf1c9e3e59dc33282dbd5b443f2084ca67831e944790e4dd492ab`；manifest声明Node≥20、Claude Desktop≥1.0.0。没有安装执行。资产上传时间2026-07-17，早于10月安全补丁，不能声称包含本次修复。

同日授权Dependabot查询为0个开放告警，PR17/18已合并；这不是signed或release-ready证据。vendored GLib还需来源校验及回归，不能依赖扫描器零告警判断修复。[PR18说明](https://github.com/YEowo-Y/weapp-shipmate/pull/18)

## 三条路线

| 路线 | 前置条件 | 单独验证的结果 |
| --- | --- | --- |
| Windows桌面 | 支持的OS/架构；WebView2存在或安装器能处理 | 获取→安装→首开→首次结果→重开→卸载 |
| MCPB扩展 | 实现MCPB支持的兼容宿主 | 宿主安装→工具发现→实际调用 |
| CLI | 满足Node版本；GitHub源码安装另需Git与私仓权限 | 安装→版本→真实命令输出 |

Claude Desktop自带Node，可免用户单独安装，但仍须满足包和宿主版本要求；MCPB不是独立GUI。[MCPB官方说明](https://github.com/modelcontextprotocol/mcpb/blob/70fe3b34cd6dff1b3bba046638edc72a6467a4fb/README.md#L11-L32)

## 本地安装器准备（维护者）

本轮由主代理核对 `desktop/src-tauri/tauri.conf.json`：productName为`weapp-shipmate-desktop`，桌面版本`0.1.0`，identifier为`com.weappshipmate.desktop`；bundle开启、targets=all、resources含runtime/。beforeBuildCommand执行`npm run prepare:runtime && npm run build`；未配置Windows签名或webviewInstallMode。不要把CLI的rc.3版本写成桌面版本。

在依赖已按现有锁文件安装、Windows原生构建工具链可用且其他原生构建结束后，从仓库根目录执行候选命令：

```powershell
npm --prefix desktop run tauri -- build --bundles nsis
```

**该命令截至本次文档编写尚未执行**；它是经配置核对的本地打包路径，不是成功记录。构建可能下载工具及运行时，耗时并占用Cargo target锁；不要与其他原生任务争用同一个target目录。以前的`--debug --no-bundle`及隔离identifier验证不等于安装器构建。以实际构建日志报告的路径定位`-setup.exe`，不要把旧目录残留当成新产物。

当前默认WebView2策略在运行时缺失时下载bootstrapper，因此可能需要网络；本地exe不意味着离线即用。[Tauri Windows官方安装器文档](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)

每个交付件留存UTC时间、完整commit、工作树dirty状态、版本、构建命令、OS/架构、文件名/大小/SHA256及测试日志。含未提交改动时还要留补丁快照或等效来源证据，不能仅记HEAD。此命令不发布Release，也不自动签名。

## 受限修复候选的验收范围

2026-10-25新增的受限修复已通过本轮综合原生验收中的对应检查，完整24/24结果见[批次说明](15-product-batch-delivery.md)。它只支持**原生app.json完全缺少requiredPrivateInfos**的情形：用户明确确认业务需要、查看原文预览后才能写入；不能推广为任意源码修改或所有配置问题的自动修复。此验收使用隔离临时项目和真实Windows WebView2/Rust路径，不是签名安装器、真实账号或真人试用验收。

写入使用独占持锁的非原子方式，本机保存明文备份与修复日志。撤销通过哈希CAS核对当前文件，发生中断需用户显式恢复；不能覆盖用户后续改动或将独占锁描述为原子写入。复检必须以真实执行回执为依据，不能仅凭修改成功或模型解释声称问题已解决。

**普通项目导出不含修复日志、修复备份或项目源文件。** 备份导入恢复与修复恢复分别验收。首跑五人练习不要求使用此功能，也不应为了测试写入而强迫参与者确认本不存在的业务需要。该候选说明不改变安装包仍待本轮构建验收的状态。

## 只读验包合同

输入：绝对交付件路径、预期版本、可选预期SHA256、维护者提供的源码commit和构建记录。输出：UTC时间、文件名/大小/hash、预期hash匹配情况、签名验证方法/状态及工具版本。exe/msi记录Authenticode发布者、有效期及时间戳；mcpb使用自身验证器。没有验签证据时填`not-verified`。

工具不执行软件、不上传、不登录、不读私钥、不修改系统。公开记录去除绝对路径、用户名和令牌。人工只读检查示例（替换成实际产物路径）：

```powershell
$trialArtifact = 'C:\TrialArtifacts\actual-installer.exe'
Get-Item -LiteralPath $trialArtifact | Select-Object Name, Length
Get-FileHash -LiteralPath $trialArtifact -Algorithm SHA256
Get-AuthenticodeSignature -LiteralPath $trialArtifact |
  Select-Object Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

`NotSigned`就是未签名；`Valid`也不保证SmartScreen不提示。签名身份与文件信誉不同，新签名文件仍可能告警。[Microsoft官方说明](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

MCPB可用已安装且记录版本的官方CLI运行`mcpb verify <实际路径>`；SHA256只证明字节一致，不证明发布者身份。[官方签名命令](https://github.com/modelcontextprotocol/mcpb/blob/70fe3b34cd6dff1b3bba046638edc72a6467a4fb/CLI.md#L92-L167)

## 干净环境首跑

使用可恢复的独立Windows环境与普通用户账号，记录OS/架构、WebView2、网络、Node/Git/Rust和旧版应用是否存在。至少一次桌面验收环境不依赖开发工具；不能把开发机成功当成干净环境成功。

1. 从准备给用户的真实入口获取指定hash。缺入口记`blocked: channel-unavailable`；内部手动传递标`internal-transfer`，不能算公开下载验证。
2. 保留正常下载标记和系统防护，核验hash和签名，记录SmartScreen/UAC/杀毒告警及权限要求。阻止运行或参与者不愿继续时，记录阻塞；不要求关防护或移除标记来制造成功。
3. 正常安装并首次打开，分别计时；记录WebView2是否需要下载、是否要求开发工具、是否出现开发服务器依赖。网络失败单列。
4. 使用无敏感内容的练习项目，按[五人统一任务](11-outreach-plan.md)获取首次有效结果、复述下一步、定位官方来源并区分人工准备和官方完成状态。不要求输入模型密钥。
5. 关闭重开验证练习记录；参与者决定是否导出和保留，再自愿按系统正常流程卸载。记录可见遗留数据，不擅自删用户目录，不把卸载成功解释成所有数据清除。
6. 保存脱敏告警/截图和各阶段结果。新包hash变化后重测受影响路径，保留旧记录。

区分“有WebView2可联网”和“无WebView2不可联网”环境；后一种是否为预期限制取决于安装策略，不臆定所有包都支持离线。使用独立环境，不移除用户正在使用的系统运行时。

## 匿名单人记录模板

以下为空模板，`not-run/null`代表没有证据。P01–P05一人一份；开发者自测、自动化和模拟用户不得填入。

```json
{
  "participant_id": "P01",
  "consent_recorded": false,
  "trial_type": "desktop",
  "date_utc": null,
  "persona": null,
  "artifact": {
    "version": null,
    "sha256": null,
    "source_commit": null,
    "working_tree_dirty": null,
    "channel_type": null,
    "channel_reference": null,
    "signature_status": "not-verified"
  },
  "environment": {
    "os_version": null,
    "architecture": null,
    "webview2_version": null,
    "network": null,
    "developer_tools_present": null,
    "prior_install": null
  },
  "stages": {
    "acquire": "not-run",
    "install": "not-run",
    "first_open": "not-run",
    "first_useful_result": "not-run",
    "reopen": "not-run",
    "uninstall": "not-run"
  },
  "timings_seconds": {
    "acquire": null,
    "install": null,
    "first_open": null,
    "first_useful_result": null
  },
  "independent_completion": null,
  "first_assistance_at_seconds": null,
  "assistance_summary": null,
  "next_action_verbatim": null,
  "understanding_verdict": "not-run",
  "official_vs_manual_understanding": null,
  "recheck_and_comparison_understanding": null,
  "warnings_and_blockers": [],
  "sanitized_evidence_refs": [],
  "followup_issue": null
}
```

阶段枚举`pass/fail/blocked/not-run`；渠道`public-download/authorized-private-download/internal-transfer`。材料理解另建`trial_type=material-only`记录，不能覆盖首跑失败。公开汇总只存匿名内容；可识别原始数据的范围、用途与保留期限需事先约定，未获同意不采集。

## 外部缺口与关闭证据

| 缺口 | 负责人提供 | 关闭证据 |
| --- | --- | --- |
| 签名身份 | 合法发布者与可用签名服务/证书 | 最终产物验签及真实告警观察 |
| 可达渠道 | 已授权的目标用户入口 | 无维护者凭据下载成功、hash一致 |
| 当前安装器 | 打包成功及准确源码来源 | 构建日志、hash、干净环境首跑 |
| 五位真实用户 | 自愿参与的目标用户 | 五份匿名记录；未执行不得当通过 |

不读取证书秘密，不改变仓库可见性，不发布Release/npm，不代发邀请。本文的完成只表示试用材料就绪；产品发布判定必须依据真实交付和用户证据。
