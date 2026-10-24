# 社区 Agent 设计落地：交付证据

日期：2026-10-22。调研与取舍见 [社区研究及差异化设计](community-agent-design-20261022.md)，修改前范围见 [实施计划](community-agent-design-plan-20261022.md)。不新增依赖、环境变量或模型调用，不提交、部署或发布。

## 实际修改

| 文件 | 本轮修改 |
| --- | --- |
| `desktop/design-previews/explain.js` | 在校验后的拒因结果中新增四类处理重点与重叠计数，原位过滤、空分类恢复、缺少来源提示；计数明确为匹配项。复制/下载/加入会话沿用完整 artifact。 |
| `desktop/design-previews/explain.css` | 复用既有表面、圆角、文字 token，选中/键盘/强制颜色样式与等宽数字；窄屏两列筛选、44px 目标、收紧结果入口间距。 |
| `tests/local-explain-ui.test.mjs` | 新增 4 组行为回归：重叠分类/空组、DOM 与依据及焦点保留、零项恢复、完整成果、关闭重开/输入失效/新查询；扩展内容注入检查。 |
| `tests/helpers/explain-ui.mjs` | 给创建节点补 ownerDocument，真实追踪焦点归属，不伪造生产筛选状态。 |
| `scripts/desktop-native-e2e.mjs` | 新增真实规则筛选与键盘场景；下载时隐藏全部匹配项仍验证完整文件；窄屏目标、两行布局与第一条正文可见性断言。 |
| `desktop/README.md`、本目录计划/研究/交付记录、`.omx/state/community-agent-design/ralph-progress.json` | 记录事实、来源成熟度、后续创新设计和验证边界。 |

简化：没有另建消息协议、缓存、结果转换层、持久化字段或组件框架；直接使用既有字段、DOM 和完整成果对象。筛选无需重新查询。原工作区已有大量改动，本轮未重置或归功于本次实现。

## 验证

- 修改前 explain UI/contract/artifact 基线 **21/21**，`.omx/artifacts/community-agent-baseline.log`。
- 新交互测试 RED **14 pass / 4 fail** → GREEN **18/18**。相关 UI/contract/artifact/integration **26/26**；`.omx/artifacts/triage-red.log`、`triage-green.log`。
- `npm test` **966/966 通过，0 跳过**：`.omx/artifacts/community-agent-tests.log`。
- `npm run lint`、额外 `npx eslint --no-ignore desktop/design-previews/explain.js`、最终原生脚本 ESLint、`git diff --check` 通过。已有 CRLF 转换提示未当作错误隐藏。
- `npm --prefix desktop run tauri build -- --debug --no-bundle`：最终 TypeScript / Vite / Rust 构建通过；`.omx/artifacts/community-agent-build.log`。最终 exe SHA-256 `c3bbafbe881de9814d698b0d8c2aa3cac3e61d7ed0bd7c3070baa311f88fbaa1`。
- `node scripts/desktop-native-e2e.mjs`：两轮均 **42/42**。最终日志 `.omx/artifacts/community-agent-native-final.log`，结构化证据 `.omx/artifacts/desktop-model-native/run-2026-10-22T18-19-26-665Z/results.json`。
- 独立只读审阅未发现本轮阻断问题，独立重跑 explain UI **18/18**。代码语义、原位隐藏、完整成果和焦点恢复经过复核。

真实拒因查询走生产 Tauri IPC 和本地规则库，没有 mock invoke。隐私样本是真实规则，所有项需要人工确认、有官方链接且为 warning，因而 action/source 筛选是零项。**非空 blocker、缺少来源和交叉分类由经过契约校验的合成单元 fixture 覆盖**，没有宣称真实规则包含这些测试组合。模型/OAuth 回归使用明确标记的协议 fixture，不代表真实厂商账号或付费推理验收。

## 视觉迭代

基线：上一轮 `run-2026-10-22T18-03-16-893Z/explain-result.png` 与 `explain-narrow.png` 已查看。

第一轮：`run-2026-10-22T18-16-55-781Z/`。已查看 keyboard、empty、narrow 三张截图：桌面选中与键盘焦点清楚，但窄窗口的操作/说明区将首条正文挤到下方。没有以 42 项测试通过代替视觉检查。

第二轮：仅收紧窄屏间距、改为两列筛选，增加首条解释进入视口的原生断言，重新构建并完成全原生回归。已查看最终 `explain-narrow.png`：390×844 窗口无横向溢出，筛选目标至少 44px，首条解释正文已进入视口；长列表仍需正常滚动。宽屏样式未在第二轮改变。

最终截图位于 `.omx/artifacts/desktop-model-native/run-2026-10-22T18-19-26-665Z/`：

- `explain-triage-keyboard.png`：人工确认筛选与键盘焦点。
- `explain-triage-empty.png`：零项恢复入口。
- `explain-download.png`：筛选隐藏全部项后仍下载完整结果。
- `explain-narrow.png`：窄窗口两列控件及首条正文。

实际视觉证据为 Windows WebView2 浅色。未用像素匹配分数宣称复制了竞品；深色、forced-colors 和浏览器矩阵未实测，CSS 支持不等于验收通过。

## 质量门禁与未验范围

本轮本地代码、真实桌面交互切片通过；**完整交付 Decision = FAIL（浏览器门禁 BLOCKED），Release status = blocked**。不声称全产品生产就绪。

质量 profile 为 discovered：根/desktop `package.json`、`.github/workflows/ci.yml` 与既有原生脚本。运行环境 Node 24.14.0 / npm 11.9.0 / Windows / Tauri WebView2。风险 high：共享模块跨浏览器与桌面的关键结果工作流。标准测试、构建、独立审阅、注入/URL校验回归和真实结果导出均有当前证据；未修改认证、服务端权限、规则数据契约、数据库或发布流程。远端 CI 的 Windows/Linux、Node20/22/24、quote/coverage/打包矩阵未在本轮执行，不声明 CI/release-ready。

| ID | 状态与影响 | 证据、处理及负责边界 |
| --- | --- | --- |
| CF-01 | blocked / medium / test | 本轮 CUA getState 再次返回 Work 设置禁用本地浏览器，浏览器入口、主题与完整矩阵无法复验；未使用另一工具绕过。原生/单元证据是补充，不等于浏览器通过。执行者负责访问恢复后、完整交付声明前补验；无豁免批准。 |
| CA-01 | recorded / low / performance | 最终主 JS 501.84 kB / gzip166.12 kB，CSS196.04 / gzip34.80 kB；此前500.03/165.49及194.00/34.49。沿用静态/动态导入重叠及 Vite500 kB 提示，没有提高阈值掩盖。未新增依赖；后续若做包体优化应测量拆包影响。 |
| CA-02 | not verified / medium / test | 外部账号授权、真实模型长输出、Windows 安装分发未验。本轮拒因处理不需要外部模型，相关工具结果是真实本地查询。 |
| CA-03 | designed only / product | 显式报告上下文、复查差异、人工交接属于设计方案；通用自主工具执行与浏览器/原生 guide 展示统一仍未实现，不能用本轮成果推断。 |

回退：仅撤销本轮 explain 筛选、CSS、配套测试与说明；不回滚已有工作区，不删除结果或会话数据。没有格式迁移。下一次完整交付前需重新验证未关闭门禁，不以此记录自行批准豁免。

## 启动

浏览器预览：仓库根运行 `node desktop/design-previews/_serve.mjs`，进入 `http://127.0.0.1:5501/explain.html`。正式桌面：`npm --prefix desktop run tauri dev`。本轮拒因查询无需模型、密钥或环境变量；界面示例只填入反馈文本，点击查询才运行本地规则。
