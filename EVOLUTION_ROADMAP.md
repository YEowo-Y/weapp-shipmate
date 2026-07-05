# EVOLUTION_ROADMAP — 未来演进规划

> 初稿:2026-07-05(强化战役阶段 3 末);同日随阶段 4/5 完成更新锚点。
> 依据:11 路深勘证据 + 强化战役五阶段实施经验 + docs/04 既定路线与 Go/No-Go 门。
> 本文件只写"强化战役之后"的演进;战役本身的计划与台账在 STRENGTHENING_PLAN.md,不重复。

## 0. 现状锚点(2026-07-05,战役末)

- 【事实】v0.1.0 已发 GitHub Release(tgz+mcpb);npm registry 因注册受阻暂缓。
- 【事实】63 条规则全带官方出处;测试 169 全绿(含 lint 门禁);金快照 54 TP/0 FP;dogfood 11 真实样本钉板;夹具钉板 28 条;rot 监控 97 个载体。
- 【事实】发布工程已就位:release.yml(tag→门禁→双资产→SHA-256→草稿 Release)、CI 矩阵 ubuntu/windows×node20/22、mcpb 打包器锁 2.1.2、dependabot。
- 【事实】唯一未过的 Go/No-Go 门是 outreach(docs/11 台账待填,Release 资产下载数 0)——项目自己的规则把 P2.2 之后全部绑在这一勾上。

## 1. 短期(≤1 个月)

### 1.1 强化战役收尾(基本完成,余两项演练)
- **已完成(2026-07-05)**:scanProject 拆分(FX-05)、正则字面量启发式、Taro 具名导入、规则层收尾(R5);release.yml、CI 矩阵、锁 mcpb、eslint 门禁、文档对账(E6)。
- **余项**:①tag 一个 v0.2.0-rc 演练 release.yml 全流程(资产+SHA-256+草稿 Release,首次跑通即验收)②CI 矩阵在 GitHub 实际 runner 上首跑(windows-latest 腿的 perf 预算已按 CI 放宽,若仍波动按台账 NOTE 调整)。

### 1.2 发布 v0.2.0 并执行 outreach(关键路径,代码不可替代)
- **目标**:以强化后的版本重发预览;按 docs/11 协议找 5 个目标用户读导航,≥3/5 能复述"下一步做什么"。
- **影响范围**:GitHub Release、README 安装路径(零安装 npx 优先)。
- **风险与收益**:不做则一切后续阶段被自家 Go/No-Go 规则阻塞;做了才有真实用户信号校准规则优先级。
- **验收**:docs/11 结果台账填实;门勾上或明确记录失败教训。

### 1.3 规则回填:3 个零规则阶段(注册/认证/发布)——D3 决策产物
- **目标**:每阶段 2-3 条导航级规则,逐条官方源核验(宁缺毋造),补齐漏斗首尾的空占位。
- **迁移步骤**:独立分支;每条规则带 official_url/source_quote/last_verified;labels 至少各配 1 hit 锚点;金快照与钉板同步更新。
- **风险与收益**:内容工作量大于代码;收益是 guide 在漏斗首尾不再输出裸占位,产品完整性可感知提升。
- **验收**:`npm run validate` 8 阶段全部非零规则;新规则全部入 rot 监控。

## 2. 中期(1–3 个月)

### 2.1 用户自定义规则库(既定产品方向)
- **目标**:loadData 支持用户规则目录;运行时 AJV 校验(勘察已证实 dev-time schema 不护航运行时);自定义规则灰标"自定义"、不计入 precision 基线。
- **影响范围**:src/data.mjs(加载与校验)、schemas/(校验入口)、report(灰标渲染)、docs(编写指南)。
- **迁移步骤**:①运行时结构校验(带文件名的可读报错——勘察发现 malformed YAML 目前裸 TypeError)②`--rules-dir` / 配置文件寻径 ③灰标与基线隔离 ④CONTRIBUTING 规则编写协议。
- **风险与收益**:风险是用户规则质量污染工具信誉——靠灰标+不计基线隔离;收益是社区扩充覆盖面而不动核验红线。
- **验收**:坏用户规则文件 → 带文件名的人话报错;自定义规则命中在报告中可视区分;官方基线 precision 不受影响(accuracy 门禁不变绿转红)。

### 2.2 桌面 P2.1(设计轨,已拍板在 Claude design 上做)
- **目标**:按 design-previews(engineered-calm 方向,14 屏)重写薄壳前端;恢复时首批执行搁置的 E7 安全底线(CSP、去 withGlobalTauri、删 opener 死权限、sidecar 退出码判别)。
- **风险与收益**:P2.1 触发条件(v0.1.0 已发)已满足;风险是 UI 先行会固化未经用户验证的信息架构——outreach 信号应先行喂入。
- **验收**:E7 四项落地;报告区无裸 markdown(FX-15/S7);Rust+前端各 ≥1 happy-path 测试。

### 2.3 分发与信任链
- **目标**:npm registry 发布(注册解锁后)、mcpb 签名评估、GitHub Release 下载量/Issue 反馈回路。
- **验收**:两渠道版本一致性由 release.yml 保证;README 明示 MCP 工具具有本机文件读取能力(勘察决策:不加允许列表,改为明示)。

## 3. 长期(>3 个月)

### 3.1 BYO-key 桌面代理(产品终态,决策 #8)
- **目标**:桌面壳内嵌 Claude Code/Codex 终端,BYO-key;预检工具成为代理的"事实来源"层。
- **迁移步骤**:①sidecar 打包(P2.1 遗留的 packaged-sidecar)②终端嵌入与密钥安全存储(OS keychain)③代理调 MCP 工具的回路。
- **风险**:密钥安全是新攻击面(CSP/withGlobalTauri 底线必须先行);Tauri 2 生态演进风险以 Cargo.lock 钉住。
- **验收**:密钥不落盘明文;代理会话可复现调用本地 check 并引用其输出。

### 3.2 规则生态与保鲜规模化
- **目标**:rot 监控扩展到 flow/rejections/crosscheck 内联规则(R5 部分先行);月度 cron 存活保障(GitHub 60 天不活跃自动停用——需 keepalive 或通知回路);社区规则 PR 协议(CONTRIBUTING 对账后)。
- **验收**:任一 last_verified 载体逃逸监控 → rule-rot 测试红;cron 停用有告警路径。

## 4. 兜底预案

| 风险面 | 现状 | 预案 |
|--------|------|------|
| 单点故障(维护者) | 单人维护;流程文档化程度高(docs/10 切片协议) | STRENGTHENING_PLAN/docs 台账使任何接手者可续;发布全自动化(release.yml)后无手工黑箱 |
| 单点故障(分发) | 仅 GitHub Releases | npm 注册解锁后双渠道;mcpb 可从源码 `npm run build:mcpb` 复现(NO_PACK 冒烟已入 CI) |
| 性能 | 1000 文件 <3s 基线已锁(perf.test) | 若真实项目超 2 万文件上限:截断注记已显性化;后续可加 packOptions.ignore 解析缩扫描面 |
| 依赖 | 运行时仅 js-yaml(8 包锁);打包器 npx 拉取 | 阶段 5 锁 mcpb 精确版本;dependabot 盯 actions+npm;js-yaml 若弃更,YAML 面窄、可内联极简解析器替换 |
| 安全 | MCP 全盘读能力(设计如此) | README 明示;若用户反馈要求,允许列表以环境变量 opt-in 提供(不默认) |
| 规则腐烂 | rot 监控月度 cron | 扩展覆盖(3.2);官方文档域名 geo 阻断误报→重试+inconclusive 分级(勘察在案) |

## 5. 明确不做(负空间)

- 不做云端上传/远程扫描——local-only 是信任根基(SECURITY.md 契约)。
- 不做"合规担保"类输出口径——GOVERNANCE.md 红线。
- 不在 outreach 信号回来前扩充第 9+ 阶段或新框架适配——避免在未经验证的方向上堆内容。
