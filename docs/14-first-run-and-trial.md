# 14 · 首跑、验包与五人试用

更新：2026-11-07。用户已确认“暂未准备，先完成可交付候选与试用材料”。最新 Windows 候选已构建、验包，并在本机完成安装、8 项原生运行验收和卸载。可信签名、干净 Windows 首装和五人真实执行仍待验；未公开发布或联系参与者。10 月 25 日的分发调查及旧候选记录保留为历史证据。

## 最新本地候选（2026-11-07）

交付目录：`.omx/artifacts/windows-candidate-20261107/`。运行源码为 `4eab7d3b54a5fac0a851936b3dcfd8f82c9c2278`，构建开始时工作树干净；随后修改的验收脚本独立提交为 `3013824`，未改动安装包内的产品代码。桌面版本仍为 0.1.0，随包 CLI 为 0.2.0-rc.3；独立名称为 `Weapp Shipmate Candidate 20261107`，数据标识为 `com.weappshipmate.candidate.20261107`。

| 产物 | 大小 | SHA256 |
| --- | --- | --- |
| `Weapp-Shipmate-Candidate-20261107-0.1.0-x64-setup.exe` | 28,244,333 bytes | `67aba2b89d5ef7555b8d85a8f0510b28984a276b2690394d01f1c9bfa17ce077` |
| `weapp-shipmate-trial-kit.zip` | 11,617 bytes；14 个文件、5 份空记录 | `a3a99a84a7ce0908d4d801ab6aeb8cb11208987ec52aa90902d6c7ff1fc87439` |
| `Weapp-Shipmate-Candidate-20261107.zip` | 28,963,194 bytes；26 个文件 | `f8fd2a3d4cb89427b5080ed117bca24edf4ae0e2a803d62e33f6c42032f92b9b` |

交付 ZIP 包含安装器、试用材料、说明、来源和签名检查、安装/卸载记录、日志、截图及逐文件 SHA256；已重新读取 ZIP 的全部条目并核对内容哈希。Windows Authenticode 为 `NotSigned`。安装目录中实际运行的 EXE 哈希为 `b05bdaab1ce99086010ca7dcc4a59b14be345def26728c334e110c66aef9551b`。

本机 8 项安装版检查通过：启动、权限/CSP、设置首次加载与重开复用、真实清单、拒因查询、服务商目录及空密钥限制、外部页面原生调用拦截、退出和重启。子进程 PATH 只有 Windows 目录，使用实际随包 Node、规则和 broker，无模型请求或网络测试 preload。设置和清单截图已复核。证据原目录为 `.omx/artifacts/desktop-model-native/run-2026-11-07T17-54-27-057Z/`，交付包中的 `native-evidence/` 保存本次结果及截图；设置模块启动时未请求，首次打开请求一次，重开未重复请求。

首次自动化使用旧 WebDriver 155，因本机 WebView2 为 157.0.4341.42 无法创建会话；经现有脚本安装匹配驱动，对同一安装器重跑通过，保留两次日志。验收脚本同步改为等待设置内容加载完成，避免只等待弹窗打开后访问尚未挂载的控件。

安装、卸载退出码均为 0；卸载后 EXE 与 runtime 已移除。为等待真实卸载完成，本次使用 NSIS `_?=` 参数，独立安装目录仅残留 `uninstall.exe`，应用数据保留。全量 1,589 项 Node 测试、lint、NSIS 生产构建和恢复后的默认 Tauri 构建通过；练习项目预检按预期退出 2，五份参与者记录仍为空。未重复 Rust 测试，未将旧 GitHub CI 或历史原生检查数量计入本轮。

本轮机器已有 WebView2，尚未验证干净首装、WebView2 下载失败、可信签名、SmartScreen 信誉、升级数据兼容、真实账号或真人试用。公开分发状态没有重新查询；下节只记载 10 月 25 日的观察。

## 历史分发调查（2026-10-25）

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
| CLI | 满足 Node 版本。通过 GitHub 源码安装时还须有 Git | 安装→版本→真实命令输出 |

Claude Desktop自带Node，可免用户单独安装，但仍须满足包和宿主版本要求；MCPB不是独立GUI。[MCPB官方说明](https://github.com/modelcontextprotocol/mcpb/blob/70fe3b34cd6dff1b3bba046638edc72a6467a4fb/README.md#L11-L32)

## 历史候选与本地安装器准备（2026-10-25）

当前构建配置（`desktop/src-tauri/tauri.conf.json`）使用产品名 `weapp-shipmate-desktop` 和标识符 `com.weappshipmate.desktop`。桌面与随包 CLI 的版本均为 `0.2.0-rc.4`（与根目录 `package.json` 等十处版本载体保持一致）。Windows 安装包使用 NSIS，包含 `runtime/`；构建前执行 `npm run prepare:runtime && npm run build`。下方历史候选包的版本和哈希以各次实测记录为准。

在依赖已按现有锁文件安装、Windows原生构建工具链可用且其他原生构建结束后，从仓库根目录执行候选命令：

```powershell
npm --prefix desktop run tauri -- build --bundles nsis --config .omx/artifacts/windows-candidate-20261025/tauri.candidate.conf.json
```

该命令已于2026-10-25执行成功，生成一个NSIS x64安装器。候选配置仅覆盖名称与数据目录：

```json
{"productName":"Weapp Shipmate Candidate","identifier":"com.weappshipmate.candidate.20261025"}
```

源码为`3b2660e1cc5556d5ab900e687a81aaf7f1acbfe9`，构建时工作树干净；配置SHA256为`4722107efa518cd85b84a58a3aa33ac6107a99307a234852463c47bd1d6621a3`。程序版本0.1.0，随包CLI 0.2.0-rc.3。最终文件均放在本机`.omx/artifacts/windows-candidate-20261025/`，不提交二进制到Git，也未发布Release。

| 产物 | 大小 | SHA256 |
| --- | --- | --- |
| `Weapp-Shipmate-Candidate-0.1.0-x64-setup.exe` | 28,217,292 bytes | `f43f85a46bc532cccb28e096019f0f3e9f70de275abb562378849ad28fe31401` |
| `weapp-shipmate-trial-kit-final.zip` | 11,475 bytes；14个文件、5份空记录 | `297b26c07f9f62d2c378964b827e7efe67bc4eaf3e9b9b1425baf77a09ef6808` |
| `Weapp-Shipmate-Candidate-20261025.zip`（安装器、试用ZIP、说明、验包/来源、配置、截图与校验表） | 28,522,050 bytes；9个文件 | `69c5ec9d089024eaf116ccc2d610cba6489e0c5aee3c6cbab05074695ed2f050` |

Windows Authenticode返回`NotSigned`，无签名者。验包脚本核验容器、大小、哈希和签名；源码来源另由构建记录及lock/config哈希记录，不能由签名脚本自行证明。

本机安装/卸载均退出0。实际安装目录运行的二进制SHA256为`27299350ab8651664ebd31b796b90e354e4b386912ecda3c50736504d4be2fcd`。7项原生验收通过：真实清单、拒因查询、模型目录及空密钥校验、外部页面不能调用原生工具、broker进程身份与关闭、重启。PATH仅保留Windows目录，无Node/Git开发命令；无模型请求或测试preload。证据：`.omx/artifacts/desktop-model-native/run-2026-10-25T16-38-32-355Z/results.json`。

首次安装验收发现旧脚本在拒因短进程退出后提前要求常驻broker；修正为实际打开模型目录后检查。只调整验收时序，未换包或弱化文件身份/父PID/路径核验。失败证据保留于`run-2026-10-25T16-36-01-523Z`。安装包中的EXE与target/release原文件仅3字节不同，内容为Tauri打包标识`UNK`→`NSS`，分别记录哈希。

使用该安装器自己的卸载程序移除了独立候选目录；应用数据保留，不能声称卸载抹除了数据。这是已有WebView2的Windows开发机上的自动化，未验证干净首装、网络下载失败、SmartScreen信誉或真人安装体验。安装脚本使用官方[NSIS静默参数](https://nsis.sourceforge.io/Docs/Chapter3.html#installerusagecommon)，未关闭系统防护。

[源码CI六组矩阵](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/40212177223)全部通过：Ubuntu/Windows × Node20/22/24。日志、安装记录、只读验包和来源清单保存在同一本机候选目录。

当前默认WebView2策略在运行时缺失时下载bootstrapper，因此可能需要网络；本地exe不意味着离线即用。[Tauri Windows官方安装器文档](https://v2.tauri.app/distribute/windows-installer/#webview2-installation-options)

每个交付件留存UTC时间、完整commit、工作树dirty状态、版本、构建命令、OS/架构、文件名/大小/SHA256及测试日志。含未提交改动时还要留补丁快照或等效来源证据，不能仅记HEAD。此命令不发布Release，也不自动签名。

## 受限修复候选的验收范围

2026-10-25新增的受限修复已通过本轮综合原生验收中的对应检查，完整24/24结果见[批次说明](15-product-batch-delivery.md)。它只支持**原生app.json完全缺少requiredPrivateInfos**的情形：用户明确确认业务需要、查看原文预览后才能写入；不能推广为任意源码修改或所有配置问题的自动修复。此验收使用隔离临时项目和真实Windows WebView2/Rust路径，不是签名安装器、真实账号或真人试用验收。

写入使用独占持锁的非原子方式，本机保存明文备份与修复日志。撤销通过哈希CAS核对当前文件，发生中断需用户显式恢复；不能覆盖用户后续改动或将独占锁描述为原子写入。复检必须以真实执行回执为依据，不能仅凭修改成功或模型解释声称问题已解决。

**普通项目导出不含修复日志、修复备份或项目源文件。** 备份导入恢复与修复恢复分别验收。首跑五人练习不要求使用此功能，也不应为了测试写入而强迫参与者确认本不存在的业务需要。安装包的已验证范围与限制见上文，不能由代码修复验收替代。

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
| 干净环境首装 | 独立Windows环境与目标用户获取渠道 | 当前安装器已通过开发机安装/运行/卸载；仍需干净环境首跑 |
| 五位真实用户 | 自愿参与的目标用户 | 五份匿名记录；未执行不得当通过 |

不读取证书秘密，不改变仓库可见性，不发布Release/npm，不代发邀请。本轮候选与试用材料已就绪；正式发布判定仍须补齐签名、可达渠道及真实用户证据。
