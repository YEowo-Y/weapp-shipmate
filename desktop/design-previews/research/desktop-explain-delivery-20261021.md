# 正式桌面拒因反查：交付证据

## 本轮落地

正式 Tauri 桌面已增加“工作台 → 查找拒因与处理方向”与“更多功能 → 拒因反查”两条入口。无需连接模型，直接查询仓库真实规则。结果提供关联拒因、处理步骤、官方原文、来源链接和仓库核验日期；来源默认折叠。没有命中时明确说明，不合成答案。

复用既有 Web Awesome 按钮、Lucide 图标、原生 dialog、会话弹窗令牌及 explain 渲染器。弹窗宽度上限 720 CSS px，内容独立滚动；窄屏保留 12px 外边距。关闭后保留当前输入与已完成结果，进行中的请求取消，迟到结果不能覆盖新状态或抢焦点。关闭/Escape 返回入口；官方链接通过系统浏览器打开，打开失败有反馈。

此前研究建议先打通真实规则功能、减少演示入口，本轮按此落实，见 [全功能竞品评审](product-competitive-review-20261020.md)。原生通信按 [Tauri 官方 commands / channels](https://v2.tauri.app/develop/calling-rust/) 复用已有桥接。没有新增框架、依赖或环境变量；未重新抓取 Codex/Claude/Cherry 竞品截图，Cherry 文档本次访问失败。

## 修改文件与简化

- `desktop/src/explain-dialog.ts`：原生弹窗生命周期与传输适配。
- `desktop/index.html`、`desktop/src/main.ts`、`desktop/src/styles.css`、`desktop/src/shared.d.ts`：入口、布局、图标与类型边界；窗口缩窄时仅保留属于侧栏的模态返回目标。
- `desktop/design-previews/explain.js`、`explain-page.js`、`explain.html`：移除共享模块的隐式全局挂载，显式区分页面入口；桌面和浏览器共用同一控制器，增加暂停/销毁生命周期。
- `desktop/design-previews/explain.css`、`explain-transport.js`：修复依据行图标换行；错误文案同时适用于桌面与预览。
- `desktop/design-previews/desktop-model-fetch.js`、`desktop/server/desktop-bridge.mjs`、`desktop/src-tauri/src/model_bridge.rs`：三层只新增固定 POST tools/explain 白名单；继续复用 CSRF、输入/结果校验、超时、取消和会话互斥，没有通配工具路由。
- `tests/desktop-model-fetch.test.mjs`、`desktop-model-bridge.test.mjs`、`local-explain-ui.test.mjs`、`helpers/explain-ui.mjs`、`desktop-controls.test.mjs`：真实规则、精确路由、暂停和宿主入口回归。
- `scripts/desktop-native-e2e.mjs`：增加四条原生拒因验收；会话弹窗定位限定 data-kind，避免把其他业务弹窗当作历史搜索。

核心规则、拒因匹配算法、聊天持久化 Schema 未改变。上述文件包含此前工作，本轮没有清理或覆盖其他未提交内容。

## 实测结果

- 新回归先出现 3 项失败（原生路由不支持、桥接不支持、缺少暂停生命周期），实现后通过。
- `npm test`：926/926 通过，包含规则 Schema 与准确性基线。完整日志：`.omx/artifacts/desktop-explain-tests.log`。
- `npm run lint` 与受影响共享 JS/服务端文件显式 ESLint 通过。仓库 ESLint 没有 TypeScript 配置，TS 由 `tsc` 检查，未将 ignored 提示算作 lint 通过。
- TypeScript/Vite 与 `npm --prefix desktop run tauri build -- --debug --no-bundle` 通过。既有 chat-transport 静态/动态导入提示仍在，不影响构建。
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`：1 项 Rust 路由边界测试通过。
- Windows Tauri/WebView2 最终 36/36 通过，证据：`.omx/artifacts/desktop-model-native/run-2026-10-21T17-20-15-875Z/results.json`。新增覆盖无密钥真实查询、依据折叠、空结果恢复、重开保留内容、窄屏布局与侧栏、忙碌冲突后停止聊天并重试。
- 检索使用真实本地规则；模型/OAuth 上游使用明确标注的协议 fixture，不代表厂商账号验收。

本轮截图审查修复依据图标与文字分行。另用新增原生断言复现“弹窗打开时缩窄窗口仍保留无关侧栏”，修复后全量原生复跑。最终人工查看 `explain-result.png`、`explain-narrow.png`，未见该范围内遮挡、横向溢出或图标错位。

## 启动与边界

根目录运行 `npm --prefix desktop run tauri dev`；需要项目既有依赖、系统 Node.js 20+、Rust/Tauri 环境。无需环境变量或模型密钥。已构建程序：`desktop/src-tauri/target/debug/desktop.exe`。浏览器预览仍用 `node desktop/design-previews/_serve.mjs`，页面 `http://127.0.0.1:5501/explain.html`。

浏览器门禁仍为 BLOCKED：Work 设置返回 `Local browser use is disabled in Work settings`。未用其他浏览器绕过；原生实测不能替代浏览器浅深色与交互验收。原生子代理因工作区额度不足启动失败，本轮只有根代理复核，不声称独立审查通过。

输入与结果只保证本次桌面进程内关闭重开保留，未新增拒因查询持久化、自动入会话或模型工具循环。官方外链的实际系统浏览器启动未自动点击验证。安装包独立运行、Node/规则资源分发、真实厂商授权及规则时效性不在本轮验收范围。此记录是开发态功能交付证据，不能作为全产品/发布就绪声明。
