# 功能页面呈现交付记录

本地日期：2026-10-23。范围是正式 Windows 桌面的首页、上线进度、偏好设置；直接执行与独立代码评审，没有发布、安装或提交代码。仓库原有变更保留。

## 实际变化

- **首页**：当前项目、开始任务、继续处理分层；突出本地预检，保留清单、拒因、报告、维护、记忆和模型入口。依据真实项目决定聚焦目录选择还是执行按钮，打开页面不运行工具。
- **上线进度**：真实阶段统计、下一步定位、编号与文字状态；项目长名称移入滚动正文。事实与备注草稿按项目保留到本次应用退出，刷新和重开不隐式保存；发现依据变化时保留旧输入、显示新事实并要求显式处理，避免静默覆盖。
- **设置**：外观、通知、连接与项目分组导航；原生单选配主题预览，字号示例实时更新；保存反馈与恢复入口常显，关闭恢复可见焦点。
- **一致性**：复用 Web Awesome 3.14.0、Lucide、原生 dialog/details/fieldset 与既有主题 token。零新依赖、字体、数据库表、IPC 命令或环境变量。

简化：首页不再依赖预览页 workbench.css；上线进度样式从共享 styles.css 移入独立文件，删除原重复规则。真实任务、权限、通知和模型执行机制保持复用。

## 修改文件

| 范围 | 文件 |
| --- | --- |
| 首页与入口 | [index.html](../../index.html)、[main.ts](../../src/main.ts)、[home.css](../../src/home.css) |
| 上线进度 | [workflow.ts](../../src/workflow.ts)、[workflow.css](../../src/workflow.css)、[styles.css](../../src/styles.css) |
| 设置 | [preferences.ts](../../src/preferences.ts)、[preferences.css](../../src/preferences.css) |
| 回归 | [desktop-controls.test.mjs](../../../tests/desktop-controls.test.mjs)、[desktop-workflow.test.mjs](../../../tests/desktop-workflow.test.mjs)、[desktop-preferences.test.mjs](../../../tests/desktop-preferences.test.mjs) |
| Windows 验收 | [native-presentation-acceptance.mjs](../../../scripts/native-presentation-acceptance.mjs)、[desktop-native-e2e.mjs](../../../scripts/desktop-native-e2e.mjs) |
| 设计与说明 | [设计来源与用户路径](feature-presentation-design-20261023.md)、[功能呈现矩阵](functional-reading-design-20261023.md)、[桌面 README](../../README.md)、[能力台账](../../../docs/12-current-capabilities.md) |

## 验证结果

| 验证 | 结果与证据 |
| --- | --- |
| 修改前回归 | 72/72，通过后才调整对应行为；首页新路径、事实/备注保留及冲突用例先复现失败 |
| `npm test` | **1293/1293**；[完整日志](../../../.omx/artifacts/feature-presentation/node-tests-final.log) |
| 最后布局调整后的相关回归 | **73/73**（controls、workflow、preferences）；[日志](../../../.omx/artifacts/feature-presentation/focused-final.log) |
| `npm run lint` | 通过；[日志](../../../.omx/artifacts/feature-presentation/lint-final.log) |
| TypeScript / Vite / Tauri debug no-bundle | 通过；[验收构建](../../../.omx/artifacts/feature-presentation/native-build-accepted.log)、[默认构建](../../../.omx/artifacts/feature-presentation/default-build.log) |
| 独立代码评审 | 首次发现草稿基线缺失导致覆盖，补测试和恢复流程后复审无剩余发现；最终布局调整另行只读复核 |
| Windows 原生自动化 | **17/17**；真实 Tauri、WebView2、EdgeDriver、SQLite；[结果 JSON](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/results.json) |

原生检查包含：首页空项目/已选项目、所有功能入口、真实阶段投影、草稿保留、并发事实冲突、明确人工确认、刷新与进程重启、设置即时生效与损坏恢复、弹窗焦点。24 个浅深色/窗口/页面组合（320、390、1000、1440 CSS px），以及 6 个 200% 文字和间距压力场景通过；阅读区、关闭按钮和可操作按钮均有几何断言。

验收过程中修复：首页窄窗缩进按钮溢出、浏览器默认 em 最大宽度导致的弹窗收窄、长项目名固定头部挤占正文，以及自动换行按钮高度不足。每次记录真实截图，未用隐藏溢出掩盖问题。首次失败和后续迭代日志保留在 `.omx/artifacts/feature-presentation/`，最终视觉结论见[状态记录](../../../.omx/state/feature-presentation/ralph-progress.json)。

最终验收隔离标识为 `com.weappshipmate.acceptance.presentation.1792818465075`，被测二进制 SHA-256 为 `3f8992a4ea63562b39eed5f9a736855cd5daa90924aaa69a439cdddfd314dc83`。监测到的前端异常为空；模型请求、工具运行和报告创建均为 0；两次退出检查中，所属运行时子进程均退出。夹具为明确标记的临时项目，事实变更使用真实 IPC，不模拟 invoke。

### 最终原生截图

| 页面 | 截图 |
| --- | --- |
| 首页 | [浅色宽屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-light-1440-home.png)、[深色窄屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-dark-390-home.png) |
| 上线进度 | [深色宽屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-dark-1000-workflow.png)、[文字放大](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-stress-320-workflow.png) |
| 偏好设置 | [深色宽屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-dark-1000-preferences.png)、[窄屏](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-dark-320-preferences.png) |
| 草稿冲突 | [真实外部事实更新后的恢复界面](../../../.omx/artifacts/desktop-model-native/run-2026-10-24T05-08-31-319Z/presentation-workflow-concurrent-draft.png) |

## 启动与复现

仓库根目录启动：`npm --prefix desktop run tauri -- dev`。无需新增环境变量或模型密钥。开发预览仍可单独使用，但上述验收对象是正式桌面。

复现原生验收时，每次使用新的数字尾缀，避免重用历史数据库：

```powershell
$presentationId = 'com.weappshipmate.acceptance.presentation.' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$presentationConfig = Join-Path (Get-Location) '.omx/artifacts/feature-presentation/config-local.json'
@{ identifier = $presentationId } | ConvertTo-Json | Set-Content -LiteralPath $presentationConfig -Encoding utf8
npm --prefix desktop run tauri -- build --debug --no-bundle --config $presentationConfig
# 仅在上一条构建成功后运行：
node scripts/desktop-native-e2e.mjs --presentation --isolated-runtime "--expected-identifier=$presentationId"
# 验收完成后恢复默认应用标识的构建：
npm --prefix desktop run tauri -- build --debug --no-bundle
```

当前环境已有 EdgeDriver 与原生自动化支持；新机器可使用仓库既有 `scripts/setup-desktop-native-e2e.ps1`。不启动正式用户数据库进行验收。

## 交付边界

质量合同为中等风险的本地 UI/草稿生命周期调整，源码与命令来自仓库 manifests、CI 和既有原生脚本。达到本轮本机开发包验收；不等于 CI、签名安装版、多系统、屏幕阅读器或整体 WCAG 认证。Windows 系统通知可见投递和真实外部模型能力未在本轮重验。

构建主包从基线 JS 633.78 kB / gzip 209.02 kB 变为 642.05 / 211.81 kB；CSS 从 227.46 / 39.43 kB 变为 233.32 / 40.46 kB。已有大于 500 kB 的 chunk 和 chat-transport 混合导入提示仍存在，未以修改告警阈值隐藏；本轮没有运行新的性能基准。

未提交事实/备注只在当前应用进程保留，退出后不恢复；已保存事实、确认与设置可重启恢复。撤回本轮呈现文件不需要数据迁移。默认二进制已重新构建，标识与哈希见[恢复记录](../../../.omx/artifacts/feature-presentation/default-binary.json)，没有启动默认用户环境或进行部署。
