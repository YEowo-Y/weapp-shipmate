# 组件状态恢复与响应式复验

2026-10-22。本轮代码、构建和 Windows 原生验收完成；浏览器曾恢复访问，取得部分最终截图后再次被 Work 设置禁用，CF-01 仍未关闭。

## 实际修改

继续使用 Vanilla TypeScript、Vite、Tauri 2、Web Awesome Core 3.14.0、原生 dialog/input 和本地 Lucide。没有新增依赖、修改锁文件、引入第二套组件库或改写上游组件。尺寸调整使用 [Web Awesome Button 官方样式接口](https://webawesome.com/docs/components/button/)。本轮未重新采集竞品截图，不声称全面或像素级复刻。

| 文件 | 修改及目的 |
| --- | --- |
| `desktop/src/model-connection.ts` | 将服务读取错误与用户操作错误分开；成功读取清除旧读取错误，保留未解决的操作错误。区分未连接、已连接但目录为空、筛选无匹配，列表签名纳入空状态。 |
| `desktop/src/model-picker.ts` | 快选器使用相同状态判断；Ollama 空目录提示先下载模型，再通过已有管理入口刷新。 |
| `desktop/design-previews/components/ui-kit.css` | 修正已有图标按钮的实际尺寸：桌面 32×32px，窄屏保留 44×44px。复用现有样式，不增加包装层。 |
| `tests/desktop-model-dialog.test.mjs`、`tests/desktop-model-picker.test.mjs` | 新增七项状态回归，覆盖错误恢复、操作错误保留、三类空状态及 Ollama 下一步提示。 |
| `scripts/desktop-native-e2e.mjs` | 增加真实桌面空目录 → 快选管理入口 → 刷新恢复用例；沿用隔离协议 fixture。 |
| `desktop/README.md`、本目录计划/记录、`.omx/state/component-recovery/ralph-progress.json` | 记录范围、启动、证据和未验证部分。 |

其他工作区修改来自此前轮次，本轮未重置或提交。没有修改模型协议、审批权限、凭据存储、消息或会话格式。

## 验证

- 修改前相关回归 78 项通过。首批六个新增用例先失败再通过；独立复核后补充第七个更贴近真实客户端状态的用例。两个模型界面测试文件最终 **32/32 通过**。
- 最终 `npm test`：**946/946 通过，无跳过**，日志 `.omx/artifacts/component-recovery-tests.log`。
- `npm run lint`、`node --check scripts/desktop-native-e2e.mjs`、限定文件 `git diff --check` 通过；修改的 CSS 使用已有 PostCSS 解析通过。
- `npm --prefix desktop run tauri build -- --debug --no-bundle` 通过，包含 TypeScript 与 Vite。二进制 SHA-256：`afa463e239e3f30e0a4057ec9da7cd63b9a4136dca1e4ed842fbd3251d6cae3e`。
- `node scripts/desktop-native-e2e.mjs`：**39/39 通过**。覆盖模型连接/快选、OAuth 错误恢复、空目录恢复、流式与停止、失败重试、草稿/历史/归档/备份以及进程重启。
- 原生证据：`.omx/artifacts/desktop-model-native/run-2026-10-22T17-21-20-495Z/results.json`。已查看 `model-catalog-empty.png`、`model-picker-empty.png`：状态与下一步说明可读，管理和刷新入口可达。
- 独立只读复核未发现本次产品修改的阻断性回归，并确认原生 fixture 失败清理及断言路径。

恢复的准确边界：真实客户端读取失败会清空 snapshot 并停止 OAuth 轮询。用户点击已有“重新检查连接服务”后，成功读取恢复权威状态、清除旧读取错误并继续轮询。本轮未新增无限自动重试，也不声称已验证真实外部网络故障自动恢复。

## 浏览器证据与未完成范围

证据目录 `.omx/artifacts/component-recovery-20261022/`，测量为 `browser-checks.json`。

- 规则图标按钮浅/深色各检查 320、768、1024、1440px，尺寸分别为 44px 或 32px 正方形，没有页面水平溢出。初始 32×35px 的真实偏差已修复。
- 浅色凭据弹窗检查 320×640、768×720、1024×420、1440×900，全部位于视口内；桌面内容宽 460px，窄屏缩小并换行。已查看最终窄屏截图。
- 实际检查凭据初始焦点、Tab 到显隐密钥按钮、取消/Escape 后返回连接入口。减少动态效果时 `animation-name: none`。深色 1440px 截图已查看。
- 设置无匹配搜索显示清晰提示与“清除搜索”入口；执行清除前浏览器被禁用，恢复动作未完成实测。
- 规则按钮禁用属性在浅色检查中成立；深色记录读取自定义元素 `.disabled` 得到不同值，当前无法区分只读 DOM 代理差异与实际状态问题。独立复核确认源码仍有 disabled 属性及统一禁用逻辑，主题同步、导航、响应式和预览脚本未发现启用这些按钮的路径。不能据此宣称动态禁用行为复验通过，也不据不完整证据修改业务状态。

仍需：历史弹窗的浏览器尺寸/主题/键盘矩阵，凭据弹窗深色窄屏，设置空搜索恢复，规则禁用状态在主题切换后的实际点击/Tab 检查，以及最终控制台检查。原生通过不能替代这些浏览器证据。浏览器被禁用前最后处于测试页深色、1440×900；未能复原测试标签的视口和主题。没有改浏览器访问设置。

## 交付门禁与质量配置

- Decision：**FAIL（完整浏览器门禁 BLOCKED；本轮代码检查通过）**。Release status：**blocked**，不宣称 local-ready / CI-ready / release-ready。
- Risk：**high**，共享组件与跨入口状态反馈。Profile：**discovered**，来源为根目录/desktop package manifests、CI 配置及原生测试脚本；沿用已解析的 Windows / Node 24.14.0 / npm 11.9.0 / Rust 1.94.1 环境。
- DQ-00/01/02/04/06/07/08=PASS（本轮本地范围）；DQ-03=已记录、无豁免；DQ-05/09/10=BLOCKED；DQ-11=N/A（未修改 AI 执行语义）。
- 性能：JS 498.65 kB / gzip 165.05 kB，CSS 193.96 kB / gzip 34.44 kB；此前为 498.06/164.94 与 193.95/34.43。没有新增运行时网络资源或后台任务。保留现有 chat-transport 静态/动态导入构建警告，不宣称零警告；项目尚无明确包体阈值。
- CI Windows/Linux、Node 20/22/24 的远端矩阵本轮未运行；本地证据不替代远端检查。未部署、发布或提交。
- 数据/安全：不改变凭据、授权与会话边界；截图使用隔离会话及虚构测试数据。外部厂商模型与 OAuth 采用明确标记的协议 fixture，未做真实账号授权或付费推理验收。

| ID | 严重性 / 状态 | 负责人 / 批准人 | 截止与行动 | 证据 |
| --- | --- | --- | --- | --- |
| CF-01 | medium / test / needs-decision，继续保留 | 当前任务执行者 / 无豁免批准人 | 浏览器恢复后、完整交付声明前补齐上述矩阵；用户控制 Work 访问设置 | 本报告、browser-checks.json、component-foundation 状态记录 |

## 启动及剩余边界

预览：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/settings.html#key`。桌面：`npm --prefix desktop run tauri dev`。没有新增环境变量；桌面需使用本轮重新构建的程序。回退仅撤销本轮列出的状态判断、按钮尺寸和对应测试，不重置现有脏工作区。

规则编辑仍是禁用预览；真实外部授权、付费模型调用及完整项目其他尚未实现能力见 desktop README。已保存的截图仅证明对应检查时的页面状态，不代表所有功能达到生产发布条件。
