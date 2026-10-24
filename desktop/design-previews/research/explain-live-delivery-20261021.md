# 拒因反查真实接入与移动归档入口验收

日期：2026-10-21。执行方式：直接实施 + 独立原生子代理复审；未运行 OMX CLI。范围为既有竞品评审的下一项：将已有本地规则能力接入真实业务页面，同时修复归档入口。

## 研究结论如何落地

沿用[全功能竞品评审](product-competitive-review-20261020.md)中“真实能力优先、状态由执行结果驱动、依据按需展开”的决策。本轮没有取得新的竞品界面截图，也不声称已达到逐像素对齐。

- [Web Awesome Button 官方文档](https://webawesome.com/docs/components/button/)确认表单提交类型、显式 form 关联、disabled 与按钮样式接口。继续使用仓库固定的 3.14.0 本地资源与 MIT 许可；不升级或新增依赖。实际 CSS part 以已安装版本及共享 ui-kit.css 的 `button` 为准。三个操作按钮统一接入 `data-ui-control="action"`，复用已有焦点、隐藏与触摸目标规范。
- [AI SDK Stream Protocol 官方文档](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)区分文本流与携带工具信息的数据流。本次是短耗时本地查询，使用受校验的单次 JSON 响应；不制造流式文字或假工具进度。既有聊天及清单流保持现状。
- Codex 用户截图中的紧凑运行状态和分层信息继续作为方向：执行中仅文字渐变，关闭减少动态效果时静止显示；正文先显示要求，官方原文默认折叠。页面内容宽度上限 760px，扣除两侧间距后阅读区域 688px，窄屏保留 20px 边距。这是代码配置，尚无本轮浏览器视觉实测。

## 实现与用户路径

全局导航 / 聊天 `/explain` → 输入审核反馈或关键词 → 查询本机规则库 → 阅读按拒因分组的规则和处理要求 → 展开官方原文、来源及仓库核验日期。

页面复用 `src/explain.mjs` 和现有 YAML 规则。匹配采用现有别名子串规则，不是模型语义理解、不扫描项目、不实时请求官方页面。引擎预留错误码匹配，但当前索引没有收录已核验错误码，因此页面不推荐任意示例错误码。未命中显示空状态和关键词建议。示例按钮只填入文本，仍须手动查询；移除硬编码成功卡片及固定示例匹配函数。

输入在失败和停止后保留；编辑时取消旧请求，忽略迟到结果。查询不写入会话历史或磁盘，刷新后的独立输入恢复不在本次范围。重复提交受控，超时提示手动重试。取消或失败隐藏聚焦中的停止按钮时，焦点回到输入框；页面离开与卸载不抢焦点。

窄屏完整聊天从 `?panel=archived` 进入时，先展开历史导航，再聚焦归档筛选器。覆盖聊天脚本与响应式脚本两种初始化顺序，后续调整窗口不反复展开。

## 边界与修复

新增 `POST /api/model-connections/tools/explain`，沿用回环服务、可信本机会话、Origin、CSRF 与聊天/清单/连接操作互斥。仅接受 `{ query }`；拒绝空白、超过 4096 字符、额外字段及草稿/路径选项。服务端固定 `includeDrafts:false`。

前后端校验命令、原查询、条目、官方 HTTPS 来源及总大小；复用 guide 的规则条目校验，不另建一套规则字段约束。同一规则允许属于不同拒因，但相同组合不得重复。只用文本节点呈现内容，不执行模型或输入生成的 HTML/命令。

独立测试发现 runner 抛出的 `ConnectionError` 可暴露内部信息，现仅放行执行器自己创建的取消/超时对象，其他异常统一脱敏。HTTP 8 项测试覆盖会话过期、取消、超时、迟到输出和双向互斥。同步规则读取本身不能在执行栈中被抢占；取消与超时约束异步等待和结果发布，不能宣称强制终止任意 CPU 任务。

## 文件清单与简化

- 页面：`explain.html`、`explain.css`、`explain.js`。移除固定结果大段 HTML、自定义主按钮与未使用卡片样式，使用共享开源按钮、Lucide 图标、原生表单和 details。
- 数据边界：新增 `explain-contract.js`、`explain-transport.js`、`desktop/server/explain-query.mjs`；扩展 `guide-contract.js` 的条目校验导出及 `model-connections.mjs` 固定路由。
- 导航：`chat.js`、`responsive.js`、`navigation.js`、`health-dashboard.html`；`app.css` 将既有文字渐变复用于查询状态。
- 回归：新增 `tests/local-explain-{contract,transport,server,ui,integration}.test.mjs` 与 `tests/helpers/explain-ui.mjs`；更新 `chat-sessions`、`responsive-surfaces`、`product-navigation`、`result-journey`、`secondary-evidence` 测试。旧固定示例断言由真实查询断言替代。
- 文档：本记录、实施计划及 `desktop/README.md`。未修改核心规则、匹配算法、模型供应商适配、密钥存储、数据库格式或依赖清单。

## 验证证据

| 检查 | 结果 / 证据 |
| --- | --- |
| 回归先失败后修复 | 新 transport 缺模块；UI 新真实行为 0/6；移动归档 40/42；runner 脱敏 7/8。修复后对应范围通过 |
| 全量规则校验与 Node 测试 | `npm test` **923/923 通过**，`.omx/artifacts/explain-live/npm-test-final.log` |
| 静态检查 | `npm run lint`、9 个受影响源码文件显式 ESLint 通过，`lint.log`、`frontend-lint.log` |
| 真实 HTTP 链路 | 页面控制器 → 生产 transport → CSRF/cookie → 本机 HTTP handler → 真实规则库 → 结果呈现，验证匹配/未命中/无外网请求；DOM 使用测试替身，非浏览器验收 |
| TypeScript / Vite | `npm --prefix desktop run build` 通过；保留既有 chat-transport 同时静态/动态导入提示，不影响构建 |
| Rust / Tauri | `npm --prefix desktop run tauri build -- --debug --no-bundle` 通过 |
| Windows 原生 E2E | **32/32 通过**，`.omx/artifacts/desktop-model-native/run-2026-10-21T13-04-43-416Z/results.json` |
| 独立代码审查 | 最终相关 67 项回归通过、强制 lint 通过；确认的错误泄漏、隐藏按钮焦点、移动归档入口问题已关闭 |
| 浏览器与新页面视觉 | **BLOCKED**：Work 设置返回 `Local browser use is disabled in Work settings`。没有通过其他浏览器工具绕过，未生成新 explain 页面截图 |

原生测试运行真实构建的 Tauri/WebView2、IPC、broker 与供应商解析；上游为明确标注的 Ollama/OpenRouter 协议 fixture，无真实厂商账号授权或付费推理。二进制 SHA-256：`d6ef2eb3bac4af00a12de95a512f2b8f33c7ebe43b571d265816343e85fcb358`。人工查看本轮 `conversation-1000x720.png`、`backup-data-narrow.png`，未见回归性遮挡；这些不是 explain 页截图。

WF-09 替代证据是上述代码、HTTP 和原生测试，不能替代浏览器门禁。风险分级：共享服务/不可信数据为高风险，已做独立审查；本地代码与自动化检查通过，但不声明浏览器、全产品或发布就绪。恢复方式为回退本切片页面、固定路由及校验模块；没有持久化数据迁移。

## 启动与剩余范围

仓库根目录执行 `node desktop/design-previews/_serve.mjs`，访问 `http://127.0.0.1:5501/explain.html`。已有预览服务须重启以加载新路由。无需环境变量、模型密钥或新依赖。桌面开发使用 `npm --prefix desktop run tauri dev`。

本次真实拒因查询仅接入浏览器业务页；正式桌面未新增拒因入口或放宽 IPC 路由。原生 32 项只是共享能力回归，不能证明新页面已验收。待浏览器允许后，需检查浅深色、320/390/700/1280px、WA 表单提交与停止按钮隐藏、键盘焦点、屏幕阅读提示和两种归档入口时序。外部 OAuth 真账号、安装包独立分发及核心规则时效性未在本轮验证。
