# 设置与业务弹窗标准化验收

日期：2026-10-20。本轮范围为共享业务弹窗、会话弹窗、浏览器设置和正式桌面模型连接；不改模型协议、鉴权或存档格式。

## 实际调整

- 复用已安装的 Web Awesome Core **3.14.0 / MIT**，操作按钮经统一工厂创建，不增加依赖。导航、模型结果行、密码输入和表单保持原生语义，原生 dialog 继续负责模态、Escape 和背景隔离。
- 凭据弹窗收至 460px，确认框 440px，会话重命名 400px，历史 560px。统一页头、字段间距、主次操作、品牌图标和关闭图标。320px 下凭据框无横向溢出，关闭、显隐与底部按钮实际高度均为 44px。
- 清除按钮宿主的重复边框和内边距；保留原生链接的操作按钮样式，避免 OAuth 继续授权、返回对话等入口变成无层级的文字。
- 新增按钮等待 Web Awesome 首次渲染后再聚焦。关闭弹窗或用户移动焦点后，不由过期回调抢回焦点。
- 连接执行期间保持真实 disabled，焦点暂存服务商标题；完成后安全恢复可用操作。显隐通过实际按钮文字提供“显示密钥／隐藏密钥”动作名称，不依赖无法传递到内部按钮的宿主 ARIA 状态。
- 密钥提交、关闭、服务商切换时清空。历史搜索、外置表单重命名、取消和草稿恢复保持现有行为。

## 真实参考及观察边界

重新查看并记录了 [Cherry Studio 官方服务商设置图](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)、[Codex 社区 General 设置截图](https://github.com/openai/codex/issues/23794)、[Claude 社区搜索截图](https://github.com/anthropics/claude-code/issues/100949)。借鉴分组行、服务商身份、紧凑凭据表单和搜索行布局。Claude 原帖是误归档问题报告，没有复制其中危险操作混入搜索结果的交互。

具体图片、版本和 [Web Awesome Button](https://webawesome.com/docs/components/button/) / [表单 API](https://webawesome.com/docs/form-controls) 核对见 [来源记录](settings-dialog-sources-20261020.md)。公开图片用于视觉观察，不代表登录并测试过竞品账号。

## 修改文件

| 范围 | 文件（相对仓库根） |
| --- | --- |
| 共享组件和业务弹窗 | `desktop/design-previews/components/ui-kit.js`、`ui-kit.css`；`desktop/design-previews/ui.js`、`ui.css` |
| 设置 | `desktop/design-previews/settings.html`、`settings.js`、`settings.css` |
| 会话 | `desktop/design-previews/session-workspace.js`、`session-workspace.css`；`desktop/design-previews/chat.js` 的重命名导入及操作 |
| 正式桌面 | `desktop/src/model-connection.ts`、`model-picker.ts`、`styles.css`、`shared.d.ts` |
| 验收 | `scripts/desktop-native-e2e.mjs`；`tests/helpers/ui-action.mjs`；dialog-foundation、ui-kit-assets、model-settings、settings-navigation、session-workspace、chat-sessions、desktop-model-dialog、desktop-model-picker、live-model-picker、model-picker-recovery、local-guide-ui 对应测试 |

以上为本轮范围；仓库还存在之前轮次的未提交文件，本轮未回退或提交那些内容。

## 验收结果

- 修改前相关基线 **94/94**。
- 最终 `npm test`：**828/828**，失败、跳过均为 0。
- `npm run lint` 通过；另用 `eslint --no-ignore` 实际检查本轮浏览器 JS，避免预览目录被根配置忽略。
- TypeScript / Vite 与 `tauri build --debug --no-bundle` 通过。Vite 保留既有提示：chat-transport 同时静态/动态导入，动态导入不会额外分包；不是构建失败。
- 真实 Windows Tauri / WebView2 自动化 **24/24**：凭据显隐和清理、WA 外置表单保存、模型连接/快选、流式完成、停止、错误重试、历史搜索、会话切换、刷新和进程重启恢复、窄窗口和焦点。
- 浏览器工具实际执行并检查：密钥空值禁用、显隐、Tab 边界、Escape/取消、回车及点击提交、认证失败恢复、忙碌真实禁用、目录搜索、原生链接样式、外观偏好刷新保持、历史空搜索恢复、重命名保存且草稿保持、真实本机规则清单生成、确认弹窗取消/批准分支。
- 视觉检查：1280px 设置/凭据与业务弹窗、768px 深色模型目录和浅色外观、320px 凭据布局。截图可读且无所测页面横向溢出。最终修复后的控制台检查无新增 error/warn。
- 独立只读复核发现并推动修复 4 类问题：首次渲染焦点、链接样式丢失、假 disabled、宿主 ARIA；最终复核未发现本轮范围遗留阻断。

浏览器实测曾发现单元测试未覆盖的首次渲染 focus 异常，使连接停在“正在连接”。已添加延迟渲染、取消、焦点转移和过期元素回归，之后重新跑通实际提交与错误恢复。

## 证据

仓库内忽略的验收目录：`.omx/artifacts/settings-dialog-standardization/`。

- `full-test.log`、`lint.log`、`frontend-lint.log`、`native-build.log`、`native-e2e.log`
- `settings-final.jpg`、`credential-final.jpg`、`credential-320-final.jpg`
- `settings-768-dark.jpg`、`appearance-768.jpg`、`credential-error.jpg`
- `guide-dialog.jpg`、`confirmation.jpg`

最终原生运行：`.omx/artifacts/desktop-model-native/run-2026-10-20T17-03-13-475Z/`，包含 24 条结果、截图、请求记录与 exe SHA256。视觉结论：`.omx/state/settings-dialog-standardization/ralph-progress.json`。

## 启动和未验证边界

浏览器：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/settings.html?from=workspace`。桌面：`npm --prefix desktop run tauri dev`。**无新增环境变量、依赖或数据库迁移。**

连接错误/目录浏览器验收使用 5512 端口的明确标记、禁止外发的测试服务；原生使用隔离 WebView2 存档和 Ollama 协议测试替身，真实 IPC / broker / 流解析均经过验证。此次未使用云端账户和真实付费推理，也未重新验收真实 OAuth 登录、Windows 文件选择器、安装包分发。未实现的预览设置仍明确标注且禁用。
