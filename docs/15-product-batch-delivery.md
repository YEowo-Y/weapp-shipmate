# 15 · 产品批次完成说明

日期：2026-10-25。本轮完成新手导航、结果可信度、三家模型只读工具、项目恢复及受限修复的代码路径，并通过下面列出的本地测试和候选原生验收。**这里的“完成”指这些功能与已记录验收范围，不表示已签名发布、真实模型账号验收或五人试用完成。** 安装包与试用ZIP已生成，SHA256及安装结果见[首跑说明](14-first-run-and-trial.md)。

## 本轮行为与复用路径

| 批次 | 已形成的行为 | 主要路径与复用技术 |
| --- | --- | --- |
| 新手问答 | 无参数guide在双TTY下中文询问主体、个人信息、域名；已有事实不重复问，未知不变成否；支持显式开关，JSON/管道不等待输入，输出复现命令 | [CLI](../src/cli.mjs)、[guide](../src/guide.mjs)；复用Node CLI及原有三态事实 |
| 动作分组 | 13份规则文件显式区分代码、后台、材料、人工确认；AppSecret/HTTP本机代码项归code，报告仍保留限制与条件自查 | [规则](../rules)、[数据](../src/data.mjs)、[报告阅读](../desktop/src/report-reader.ts)；复用YAML/Schema和确定性报告 |
| 拒因召回 | 24条拒因记录区分direct/possible，避免把可能相关当成官方实际拒因；未输入反馈不应表现为已查询成功 | [拒因内核](../src/explain.mjs)、[桌面对话框](../desktop/src/explain-dialog.ts)；复用现有规则匹配与阅读界面 |
| 三家模型工具 | OpenAI、Anthropic、Google使用同一只读project_read权限边界；读取与摘要分享分别授权，切换撤权，停止不删除成功成果，错误不重放工具 | [Agent流](../desktop/server/agent-stream.mjs)、[Rust授权](../desktop/src-tauri/src/agent_tools.rs)、[权限界面](../desktop/src/agent-tools.ts)；复用官方SDK、Node broker、Rust工具与既有契约 |
| 项目恢复 | v2备份预览→重新绑定本机目录→ID重映射追加恢复；导入内容保留历史来源，不启用记忆/监听/通知/工具权限，不恢复阶段完成状态。归档先保存恢复文件再删数据库记录，不删源码 | [原生备份](../desktop/src-tauri/src/project_backup.rs)、[项目库](../desktop/src-tauri/src/project_store.rs)、[备份界面](../desktop/src/project-backup.ts)、[项目管理](../desktop/src/projects.ts)；复用SQLite与现有项目/运行/成果模型 |
| 受限修复 | 仅处理原生根app.json完全缺少requiredPrivateInfos；明确业务确认、完整原文预览、批准写入、真实复检回执、撤销及显式中断恢复 | [证据生成](../src/repair-evidence.mjs)、[原生修复](../desktop/src-tauri/src/project_repair.rs)、[写入器](../desktop/src-tauri/src/repair_writer.rs)、[修复界面](../desktop/src/project-repair.ts)；复用扫描证据、Rust IPC、项目库与报告入口 |
| 前序设置工作 | 保留此前React设置迁移WIP，不回退为旧界面；本轮另做设置原生验收 | [设置中心](../desktop/src/preferences.ts)、[设置迁移记录](../desktop/design-previews/research/settings-react-migration-20261025.md)；复用React、shadcn/ui（Base UI）、Tailwind及现有服务 |

支付和业务参数仍只提供说明与核对线索，不参与规则筛选或排序；明确否支付也不删除全部条件自查。默认数据规则为66条（0条draft），另有5条跨项核验规则；71条可命中规则不等于71条独立核验的官方引用。

## 受限修复的准确边界

写入为Windows本地固定磁盘上的**同一独占句柄原地写入，不是原子替换**。本机明文备份和意图日志在源文件写入前保存；撤销与恢复通过内容哈希、文件/目录身份和当前项目状态校验。发生中断需重新预览、显式确认，不能自动覆盖后续编辑或承诺掉电安全。

已有requiredPrivateInfos、JSONC、重复键等不满足合同的配置不在自动改动范围。模型、导入历史或任意路径/补丁不能获得修复授权。普通项目备份不包含源码、修复日志或修复备份，不能替代修复恢复。写入成功与复检成功分别记账，不等于微信审核通过。

## 验收证据

| 检查 | 记录结果 | 证据与局限 |
| --- | --- | --- |
| Node全量测试 | 1422/1422，通过；失败/跳过0 | [测试日志](../.omx/reviews/product-audit-20261025/all-batches-tests-final.log)；后续练习注释、窄屏CSS与验收断言变更另做定向检查，不伪称全量重跑 |
| ESLint | 通过 | [批次日志](../.omx/reviews/product-audit-20261025/all-batches-lint.log)；练习globals及不可达分支说明补齐后也实际重跑根lint通过 |
| Rust | 113通过，2 ignored，0失败 | [Rust日志](../.omx/reviews/repair-writer-probe/all-rust-tests.log)；2项为既有Windows凭据库测试，不计为通过 |
| 来源逐字核验 | 66/66非draft通过 | [来源日志](../.omx/reviews/product-audit-20261025/all-batches-quotes.log)；60逐字、6仅空白差异，其中2条依赖人工快照，不能说全部实时官方抓取验证 |
| 标注语料准确性 | TP55 / FP0 / FN0；precision/recall=1 | [覆盖日志](../.omx/reviews/product-audit-20261025/all-batches-coverage.log)；仅当前语料，71条可命中规则中30条有hit/no_hit锚点，不代表全规则或真实业务零漏报 |
| 综合Windows原生 | 24/24通过 | [原生results.json](../.omx/artifacts/desktop-model-native/run-2026-10-25T16-25-11-553Z/results.json)；真实WebView2、Rust、SQLite、工具与随包运行时，隔离临时项目 |
| 设置Windows原生 | 19/19通过 | [设置results.json](../.omx/artifacts/desktop-model-native/run-2026-10-25T16-27-08-703Z/results.json)；与综合验收分别记账，不简单相加为一个用例集 |
| 修复窄屏后续验收 | 9/9通过 | [修复results.json](../.omx/artifacts/desktop-model-native/run-2026-10-25T16-29-17-651Z/results.json)；覆盖后续最小CSS调整，父代理另看前后截图确认仅代码面板滚动，body无横向溢出 |
| 实际安装候选 | 7/7通过；安装和卸载均退出0 | `.omx/artifacts/desktop-model-native/run-2026-10-25T16-38-32-355Z/results.json`；保留本机数据，无PATH Node，无真实模型请求；不等于干净环境或SmartScreen验收 |
| GitHub源码CI | 6/6矩阵通过 | [3b2660e的CI](https://github.com/YEowo-Y/weapp-shipmate/actions/runs/40212177223)，Ubuntu/Windows × Node20/22/24 |
| 独立代码复核 | APPROVE | [复核报告](../.omx/reviews/repair-final-code-20261025.md)；受限修复与相关接线范围，前序设置迁移WIP不在该代码复核范围 |

综合原生验收覆盖恢复预览/追加/归档/重启、Anthropic与Google撤权/工具/停止/错误恢复，以及修复预览、实际单文件写入/备份/复检、撤销、过期计划拒绝、重启历史和导入来源拒绝。模型侧使用明确标记的合成协议流与隔离假凭据；没有真实外部账号、实际推理或OS目录选择器验收。实际界面、原生IPC和本地操作不是invoke mock。

这次综合验收二进制SHA256为`ed50996b381a74487017bb7d51ac5187ee1382622bb81ae04d60cb054cff59d6`，结果明确`releaseSmoke=false`；不能据此声称已经运行最终安装包。设置及后续窄屏验收使用各自二进制，hash及具体条件保留在独立记录。修复预览窄屏网格后续改为`minmax(0, 1fr)`，已通过上述9项复验和父代理截图检查。代码复核报告中“原生验收待执行”是报告当时的时间快照，由后续实际原生记录补齐；不能反过来把代码复核本身称为原生测试。

## 尚未被这些证据覆盖

- **安装与分发**：本轮候选安装器和试用ZIP已验包，安装器已在开发机安装、通过7项原生检查并卸载；仍缺干净环境首装和可信签名证书，不构造公开下载URL，不修改仓库可见性或发布渠道。
- **真人与真实模型**：五份[试用记录](trial-kit/records)仍为not-run；模型账号授权、真实工具选择质量和付费请求未用协议夹具代替验收。
- **安全扫描范围**：本轮重新执行根目录与desktop的完整依赖npm audit，均为0发现；日志为`.omx/reviews/product-audit-20261025/all-batches-npm-audit.json`与`all-batches-desktop-audit.json`。Dependabot清零另有前序证据；扫描零发现不等于签名或发布就绪。[安全修复PR17](https://github.com/YEowo-Y/weapp-shipmate/pull/17)
- **构建体积**：构建仍报告约960 KB的大chunk警告。成功生成产物不等于体积问题已解决；当前不在无基线的情况下宣称性能达标。
- **业务与政策**：来源和精度结论受核验日期、人工快照和现有语料限制；默认规则未覆盖全部官方要求，不提供合规担保。

试用材料包含[主持人卡](trial-kit/host.md)、[参与者卡](trial-kit/participant.md)、自写无密钥练习项目与5份匿名空记录。练习静态命中已验证，实际定位调用不可达；它不替代真实业务，不提交微信审核，也不强迫参与者确认不存在的业务需要。

本机验收日志位于被Git忽略的`.omx/`；远程读者可查看上述CI及本文记录的结果和hash。候选的生产源码保持在`3b2660e`，之后仅补验收脚本时序和交付文档，不改变已验收安装器。
