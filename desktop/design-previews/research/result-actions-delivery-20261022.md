# 结果导出与长报告阅读：交付记录

日期：2026-10-22。范围为拒因结果的下载操作、加入会话后的阅读起点和完整复制。本轮沿用 Vanilla TS/JS、Tauri 2、Web Awesome 与 Lucide，没有新增依赖、第二套组件或消息协议。

## 设计依据与结果

实际读取 [Claude 官方成果说明](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) 的查看、复制与导出说明，以及 [Cherry Studio 官方聊天说明](https://cherryai.com/docs/en/cherrystudio/preview/chat/) 的会话历史与消息操作说明；视觉对照沿用上一轮已经查看的官方真实截图。本轮没有重新截图全部竞品，也不声称像素级复刻。

- 查询结果操作区增加“下载 Markdown”，复用已校验成果和已有下载器。完整报告包含查询、规则要求、官方来源与本地匹配边界；无命中时导出本次空结果，不夹带旧查询内容。
- 编辑、停止或重新查询后，旧成果操作失效。下载失败保留结果供重试或复制，提示只表示发起下载，不冒充保存完成。关闭桌面弹窗不撤销已开始的下载，页面退出清理临时 URL。
- 报告加入当前会话后定位到开头，完整复制按钮移到正文前，只有一个操作入口。复用既有复制状态、图标与可访问名称。
- 精简重复的“桌面工具”显示前缀；存档标签、去重规则和会话格式保持兼容。正常对话发送、流式跟随、草稿与模型上下文隔离保持原有行为。

## 修改文件

| 文件 | 本轮修改 |
| --- | --- |
| `desktop/design-previews/explain.html`、`desktop/index.html` | 共用结果工具栏增加 Web Awesome 下载按钮 |
| `desktop/design-previews/explain.js` | 接入现有 artifact downloader，处理编辑失效、反馈竞态和生命周期 |
| `desktop/design-previews/conversation.js` | 新报告从开头进入阅读，保存阅读位置 |
| `desktop/design-previews/components/message.js` | 报告前置单一复制操作、精简显示标签 |
| `tests/local-explain-ui.test.mjs`、`tests/helpers/explain-ui.mjs` | 完整下载、旧成果失效、异常重试、晚返回复制和清理回归 |
| `tests/conversation-continuity.test.mjs` | 报告定位、复制原文、草稿、阅读恢复与后续发送跟随回归 |
| `scripts/desktop-native-e2e.mjs` | WebView2 实际下载文件、报告首屏尺寸与顶部复制验收 |
| `desktop/README.md`、本目录计划及交付记录 | 更新功能、启动与验证边界 |

工作区的其他修改来自此前轮次，本轮未重置或提交这些文件。复用了 `artifact-download.js`、Markdown 格式化器和既有消息动作，没有再造导出组件，也没有修改 CSS、模型协议或存储格式。

## 验证证据

先观察到 3 项新增下载回归失败，以及长报告滚动回归的 `3200 !== 1200`，再实现修复。

- `npm test`：**939/939 通过**，无跳过，日志 `.omx/artifacts/result-actions-tests.log`。
- `npm run lint`、7 个本轮 JS/MJS 文件的显式 ESLint：通过。显式检查包含默认忽略的 desktop 目录。
- `npm --prefix desktop run tauri build -- --debug --no-bundle`：通过，包含 TypeScript 与 Vite；11:08 UTC 重新构建后完成最终原生验收。
- 根目录及 desktop 的 `npm audit --omit=dev --audit-level=high`：均为 0 漏洞。
- 独立审查：9 个限定范围文件，无待处理发现；审查方另运行 90 项针对性测试及静态检查。
- `node scripts/desktop-native-e2e.mjs`：**38/38 通过**。实际 Tauri/WebView2、IPC、规则查询、文件下载与回读、顶部复制、草稿保留、重复保存、历史搜索、刷新和进程重启均通过。
- 实际浏览器：411×563 CSS px，浅深色无横向溢出；用 Enter 发起 Markdown 下载，回读 1265 字符的完整隐私报告。空结果下载包含新查询且无旧规则。控制台 warning/error 均为空。

原生证据：`.omx/artifacts/desktop-model-native/run-2026-10-22T11-09-46-799Z/results.json`。测试 exe SHA-256：`9874bf15383f465edeb8d6fb3dbdcc471bed13d39415180be80a368b858dfddf`。

截图已人工查看：上述目录的 `explain-report-entry.png`、`explain-download.png`、`explain-narrow.png`；浏览器为 `.omx/artifacts/result-actions-browser/result-light-final.jpg` 和 `result-dark.jpg`，行为记录为同目录 `verification.json`。原生窄屏为 390 CSS px，三个操作能换行且关闭入口可达。

首次新增原生尺寸断言失败：要求按钮底边严格小于标题顶边。实际两者均为 118.3229 CSS px，边界相接，无重叠。保留可见范围和实际点击检查，将关系修正为 `<=` 后全量原生验收通过；没有为迎合断言修改产品布局。测量值随验收保存。

## 质量配置与交付门禁

- Decision：**PASS（本轮范围）**；Risk：medium，因共享会话阅读路径采用更强回归和独立审查；Release status：**local-ready**。
- Profile：discovered，来源为 `package.json`、`desktop/package.json`、`.github/workflows/ci.yml`、`desktop/README.md` 和原生测试脚本；没有新增 profile 文件。
- 门禁：DQ-00/01/02/04/05/06/07/08/09/10=PASS（本地范围）。DQ-11=N/A，本轮不改模型、提示词或规则匹配算法；DQ-03=N/A，无待处置阻塞项。
- 关键路径：有效结果 → 下载/复制 → 显式加入会话 → 保留草稿 → 历史查找/重启恢复；下载失败、旧反馈、停止和 URL 回收由回归覆盖。
- 安全与数据：只导出经过校验的本地结果，沿用文件名、MIME、体积和并发 URL 上限；没有新增远程请求、文件执行或凭据持久化。历史会话与模型隔离测试及原生恢复通过。
- 性能/生命周期：沿用有界下载器及 URL 释放；Vite 主 JS 498.06 kB / gzip 164.94 kB、CSS 193.55 kB / gzip 34.29 kB，为测量值，不宣称达到未定义的预算。
- CI 契约：`validate-rules/validate` 的 Windows/Linux、Node 20/22/24 矩阵及 lint/test/quotes/coverage/package smoke。未运行远端 CI 或发布，本地结果不等于 CI-ready；未触及规则、打包或发布配置。
- 恢复：可单独撤回本轮控制器/消息展示改动，无数据迁移，也无需清理现有会话。

## 修复登记

| ID | 级别 | 状态 | 责任与验证 |
| --- | --- | --- | --- |
| RA-01 | medium | 已修复 | 主任务：长报告从结尾开始；先红后绿回归及原生首屏验收 |
| RA-02 | low | 已修复 | 主任务：完整复制位于长正文之后；前置单一操作，原生点击成功 |
| RA-03 | medium | 已完成 | 主任务：结果缺少文件复用；共享下载器、失败/清理回归、两端实际文件回读 |
| RA-04 | low | 已修复 | 主任务：新增测试拒绝合法相接边界；保留坐标证据，修正后 38 项全过 |

## 启动与已知边界

预览：`node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/explain.html`；桌面：`npm --prefix desktop run tauri dev`。无需新增环境变量、密钥或依赖；浏览器刷新即可，桌面需重新构建。

查询仍为真实本地规则匹配，不扫描项目或实时核验官方内容。只有显式加入会话的报告进入历史；查询表单本身未新增跨进程恢复。会话中的报告提供复制，本轮未新增会话报告下载按钮。

模型和 OAuth 原生回归使用明确标记的隔离协议 fixture，不能据此宣称外部账号或付费模型验收。文件下载在隔离 WebView2 profile 中设置测试下载目录，验证了真实文件；Windows 保存对话框、安装包和分发未覆盖。既有 chat-transport 静态/动态混合导入警告仍存在，不影响构建。本轮没有发布或部署。
