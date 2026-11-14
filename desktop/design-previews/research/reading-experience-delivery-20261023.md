# 功能阅读体验交付记录

2026-10-23。本轮落实报告阅读及交接正文，并提供覆盖其他主要功能的呈现矩阵；没有宣称所有页面已重新设计。调研依据、各功能信息层级和组件选择见 [功能呈现与阅读规范](functional-reading-design-20261023.md)。

## 实际修改

| 文件 | 内容 |
| --- | --- |
| `desktop/src/report-reader.ts`、`report-reader.css` | 独立限宽阅读视图；结构化概览、目录、常显范围限制/未知事实/条件线索、正文要求、摘录、来源身份与版本；无效数据回退安全原文；外链失败重试、快照保护、焦点返回与重新打开滚动复位 |
| `desktop/src/main.ts`、`desktop/index.html` | 首页最新报告、更多菜单和工具栏“阅读报告”共用模块；项目变更关闭阅读；原复制、加入会话与历史工具路径保留 |
| `desktop/src/tools-panel.ts` | 其他模态框打开时缩放窗口不再把工具抽屉重新置顶，关闭背景工具而不抢阅读焦点 |
| `desktop/src/repair-handoff.css` | 删除固定 14px 正文覆盖，使用已有正文偏好，统一正文颜色与相对标题大小 |
| `tests/desktop-report-reader.test.mjs` | 16 项新增阅读行为测试，含真实 check/guide/explain 数据与运行限制保真 |
| `tests/desktop-controls.test.mjs`、`tests/desktop-tools-panel.test.mjs` | 入口只读/快照复用/项目切换与响应式弹层回归 |
| `scripts/native-reading-acceptance.mjs`、`scripts/desktop-native-e2e.mjs` | `--reading` 真实 Windows 模式及旧首页断言更新；原生剪贴板按 Windows 换行语义严格核对 |
| `desktop/README.md`、`docs/12-current-capabilities.md` | 使用入口与实际交付边界 |

简化：共用原有 Web Awesome、Lucide、原生 dialog/details、Markdown 与成果校验，没有引入 React、图表、动画或其他重复依赖，没有新 IPC、数据迁移和环境变量。阅读层仅补交接导出契约不包含的少量附属字段校验，不改变原始报告、复制文本与导出协议。

## 验证证据

- `npm test`：**1283/1283 通过，0 跳过**，包含规则校验。最终日志：`.omx/artifacts/reading-experience/node-tests.log`。
- `npm run lint`：通过；仓库现有配置不 lint TypeScript，TS 由构建中的 `tsc` 检查，不混淆两者。
- Tauri debug no-bundle：TypeScript、Vite 与 Rust 编译通过。未改 Rust，本轮未重复执行此前 Rust 单元测试。
- Windows 原生：**16/16 通过**。最终目录 `.omx/artifacts/desktop-model-native/run-2026-10-23T20-48-07-294Z/`，`results.json` 记录检查、哈希与运行范围。前端错误 `[]`，模型请求 `[]`，退出后该隔离运行时的 Node 进程未残留。
- 真实本地工具：分别执行一次预检、上线清单、拒因查询；真实 SQLite、历史打开、刷新、应用退出/重启、版本变化、三种报告内容保真、原文、目录和交接路径。阅读本身不新增工具运行、不改项目文件或已保存成果。
- 窗口：320/390/1000/1440px；浅/深色；18px 偏好；200% DOM 文字放大与用户文字间距覆盖；未发现页面横向溢出或关键文字被裁切。另验证工具栏打开阅读后 1000→390px 的顶层与键盘焦点。
- 已人工检查实际截图：预检、清单、拒因、浅色窄窗、深色宽窗、200% 压力。原生脚本还保存其他矩阵截图、几何与交互证据，不将程序几何断言等同于读屏认证。
- 独立代码评审发现的两项问题已修复并复审通过：必要限制被摘要遗漏；背景工具可能覆盖阅读器。截图复核额外修复重新打开时保留旧滚动位置，并在每次历史打开时断言概览和目录均从顶部开始。

### 调试记录

首轮 WebView Clipboard read 5 秒不返回，替换为 PowerShell STA 的真实 Windows 剪贴板读取。随后确认原文 1150 字符/31 个 LF，系统剪贴板 1181 字符/31 个 CRLF；仅统一 CRLF→LF 后全文严格相等，不裁空格/尾换行，也不记录内容。证据见失败目录 `run-2026-10-23T20-39-42-028Z/clipboard-diagnostics.json` 及最终 `reading-clipboard.json`。

拒因正向夹具原先使用“隐私声明”，实际规则未命中；改为已由真实规则证实命中 3 项的“隐私”。没有改查询逻辑或将空结果包装为成功命中。未命中与无效数据回退仍有单元测试。

### 实际截图

- [预检阅读](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-48-07-294Z/reading-check-wide.png)
- [上线清单](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-48-07-294Z/reading-guide-wide.png)
- [拒因报告](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-48-07-294Z/reading-explain-wide.png)
- [浅色 390px](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-48-07-294Z/reading-light-390.png)
- [深色 1000px](../../../.omx/artifacts/desktop-model-native/run-2026-10-23T20-48-07-294Z/reading-dark-1000.png)

## 启动与复现

启动：`npm --prefix desktop run tauri -- dev`。工具栏“阅读报告”或首页最新报告进入；历史成果先打开原报告，再点击“阅读报告”。无新环境变量；开发构建沿用已安装 Node/Rust/WebView2。浏览器独立预览不能代替该正式原生入口。

隔离验收：生成新的 `com.weappshipmate.acceptance.reading.<数字>` 标识，将仅含 identifier 的 JSON 传给 `npm --prefix desktop run tauri -- build --debug --no-bundle --config <绝对路径>`，再运行 `node scripts/desktop-native-e2e.mjs --reading --isolated-runtime --expected-identifier=<同一标识>`。每次使用新标识和数据库，避免污染用户项目。验收后运行 `npm --prefix desktop run tauri -- build --debug --no-bundle` 恢复默认标识，恢复证据存于 `.omx/artifacts/reading-experience/default-binary.json`。

## 边界与剩余风险

本轮没有新增依赖；主 JS 从 623.94 kB / gzip 206.17 kB 增至 633.78 kB / gzip 209.02 kB。Vite 既有大于 500 kB 与静态/动态重复 import 的提示仍存在，没有调整阈值来消除提示。

本轮是隔离 debug 应用的 Windows WebView2 验收，没有使用外部模型、打开官方外链或执行官方后台操作。链接派发与失败恢复通过单元测试，真实系统浏览器打开未在原生自动化中触发。此前 Work 浏览器被禁用，未绕过；没有覆盖其他独立浏览器、屏幕阅读器、干净 Windows 安装包或签名分发，也不宣称全产品 WCAG 合规。其他功能页面的矩阵是后续实施规范；系统通知可见投递、真实账号评测、受限文件修复与发布等原有待办仍按能力台账保留。
