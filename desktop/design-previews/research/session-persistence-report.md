# 会话持久化与历史搜索交付记录

2026-10-18。范围：`desktop/design-previews/chat-full.html` 完整聊天页。直接执行；独立子代理承担存储、写入协调、回归与只读审查。不启用 OMX runtime。结果为本机开发预览可用，不代表正式桌面或部署验收。

## 实际交付

- 会话、手动标题、消息、当前选择、独立草稿、编辑前上下文、光标选区、引用名称、模型选择元数据及阅读位置进入原生 IndexedDB。真实文本分支和本机结构化清单可恢复；凭据、OAuth 状态和运行控制对象不入存档。
- 每次有效变化排队保存，合并同一轮待写内容，串行提交；只有事务 `complete` 后显示“已保存在此浏览器”。未提交内容注册原生离页保护，页面隐藏/离开时补充刷新待写队列。
- 历史搜索覆盖已载入的标题和消息正文，显示命中摘要。激活正文结果定位并聚焦对应消息；标题结果仍恢复原阅读位置。不搜索未发送草稿、工具原始 JSON 或隐藏推理。
- 刷新中断的回复保留已保存的部分文本并显示停止；运行记录和工具状态一起收敛。旧审批过期，不自动重放模型请求、工具或授权。
- 数据读取失败不以默认示例覆盖原存档。提供重试和明确的临时使用模式；保存失败保留页面内容，支持备份导出。超限导出继续使用安全字段校验，不受存储容量上限阻断。
- 写入使用事务内 revision 比较，旧窗口不能覆盖新历史。冲突提供下载备份和确认后重新载入；取消保留内容与焦点。意外数据库断开可重连，版本变化提示重新载入。
- 修正跨刷新消息编号碰撞、清单筛选恢复覆盖用户手动折叠、重试按钮消失后焦点落到页面的问题。

## 文件与简化

| 文件 | 本轮职责 |
| --- | --- |
| `session-store.js` | v1 白名单存档校验、IndexedDB 事务、冲突检测、恢复降级与安全导出 |
| `session-persistence.js` | 串行保存、合并待写状态、错误与显式重试 |
| `chat.js` | 初始读取、会话变化保存、搜索定位、备份和恢复入口 |
| `conversation.js` | 唯一消息 ID、程序性草稿变化通知、清单/折叠恢复顺序 |
| `chat-full.html`、`conversation.css` | 保存状态、备份按钮、错误提示与窄屏布局；复用 Lucide 和已有主题变量 |
| `tests/session-store.test.mjs`、`tests/session-persistence.test.mjs` | 存档安全、真实提交边界、CAS、失败恢复、并发队列 |
| `tests/chat-sessions.test.mjs`、`tests/conversation-continuity.test.mjs` | 草稿调度、焦点、定位、编号与阅读状态回归 |
| `tests/chat-menus.test.mjs`、`tests/conversation-journeys.test.mjs` | 离页保存顺序与已有 bfcache 行为 |
| `desktop/README.md` | 更新完整聊天与工作台快速对话的不同保留边界 |

继续使用现有原生 ESM、浏览器 IndexedDB、组件和消息协议，没有新增依赖或升级框架。存储、写入协调与页面提示分别承担单一职责，搜索定位复用已有视图恢复函数，没有另建状态框架。未提交或部署，没有清理其他任务的工作区修改。

## 真实产品依据

沿用用户提供的 Codex 截图作为中性对话面、紧凑工具栏和内容层级依据；Claude 的官方[会话管理说明](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation)支持从会话旁菜单管理名称。复核的 [OpenClaw Session management](https://docs.openclaw.ai/concepts/session)区分持久历史与执行恢复，[Cherry Studio Data Settings](https://cherryai.com/docs/en/pre-basic/data-settings/)区分本地备份与跨设备传递。

详细事实、原图来源和版本限制见 [持久化调研](session-persistence-sources.md)、[会话导航真实截图](session-navigation-agent-sources.md)、[前轮会话资料](session-experience-sources.md)。本轮没有登录上游客户端或重新运行 REA，未复制上游实现；界面结构与交互规则的迁移不等于像素复刻或拥有它们的服务端能力。

## 验证证据

仓库根目录执行，零新增环境变量：

```text
npm test                                                   724/724 通过
npm run lint                                               通过
npx eslint --no-ignore desktop/design-previews/chat.js desktop/design-previews/conversation.js desktop/design-previews/session-store.js desktop/design-previews/session-persistence.js
                                                           通过
npm --prefix desktop run build                             tsc + Vite 通过（独立桌面壳）
node --experimental-vm-modules .omx/agent-experience-static-check.mjs
                                                           16 HTML / 50 JS / 26 CSS / 38 HTTP 路由通过
git diff --check                                           通过；既有 CRLF 提示不构成错误
```

基线为 683 项测试。本轮先复现缺陷再补回归；第一次全量运行发现两处旧离页测试 harness 缺依赖及静态 SVG 缺标准描边，均修复后重新全量通过。测试日志位于 `.omx/artifacts/session-persistence/full-tests-final.log`；静态和 lint 日志同目录。独立审查已关闭数字 runId 契约、超限备份、断开重连、缺省引用和焦点问题；真实运行控制器及 `runGuide` 产物另做 30 次存档往返验证。

CUA 在真实 Chromium 浏览器通过 UI 操作，使用真实 IndexedDB；最终 **23/23 场景通过**：

1. 刷新后新会话、名称、当前会话、草稿与光标保留。
2. 两会话草稿独立；编辑草稿刷新后保留，取消编辑恢复原草稿。
3. 完整消息恢复，历史审批失效；生成中刷新保留部分回复且停止。
4. 恢复后继续发送/停止生成，消息 ID 唯一，旧消息不被替换。
5. 重新打开页面恢复历史；标题/正文搜索、无匹配、桌面/320px 结果定位有效。
6. 多窗口冲突保留未保存草稿，备份 JSON 包含当前内容；取消与确认恢复行为符合提示。
7. 真实本机清单、筛选词和手动折叠恢复；非零阅读位置等待加载完成后准确恢复。
8. 注入读取失败时主区 inert，原历史不被覆盖；重试恢复旧草稿与焦点。
9. 注入配额不足时保留内容；重试成功后刷新可恢复，焦点返回输入框。
10. 临时使用可单独导出，不覆盖原历史；390px 深色错误提示、320px 历史浮层没有横向溢出。

详细断言、初次失败与修复复验均保留在 `.omx/artifacts/session-persistence/browser-checks.json`。原生元素属性的第一次只读探测不可用、过早读取刷新后的滚动值均被保留并用明确 DOM 属性/加载完成断言重新验收，不当作产品通过证据。最终正常预览控制台 error 为 0。

故障注入使用独立 `5513` 来源的 `.omx/artifacts/session-persistence/fault-server.mjs`，仅包装读取/写入抛错，正常提交仍走真实数据库。此故障环境不代表浏览器实际耗尽磁盘。验收完成已关闭其页面与进程，`5501` 正常预览保留。独立视觉复核实际查看 5 张桌面/窄屏截图，未发现新增阻断问题。

## 启动与边界

```bash
node desktop/design-previews/_serve.mjs
```

打开 <http://127.0.0.1:5501/chat-full.html>。前端更新刷新即可；无新增环境变量或密钥要求。

- 仅完整聊天页持久化，工作台快速对话和正式 Tauri 壳未接入这套历史。
- 存储属于当前浏览器、同源端口和示例项目，无云同步、多窗口自动合并或后台续跑。现有保存限制为 200 会话、每会话 2000 消息、20 MiB；达到上限不会截断或覆盖旧记录。
- JSON 是可检查的备份导出，尚无应用内导入或历史删除管理。存档版本不兼容时保留原数据并显示读取失败，没有静默迁移。
- 不存 API 密钥；用户消息若自行含敏感文本仍会按消息保存在本机，JSON 备份同样包含这些内容。浏览器清理、隐私模式和进程/系统异常退出不能保证保留最后尚未提交的字符。
- 浏览器中执行了明确标记的本地演示和真实本机只读清单，没有使用真实付费模型账号；真实模型产物的保存契约由单元/集成往返检查覆盖。没有验证跨浏览器、OS 强制终止或磁盘故障。

当前风险为 medium，结论为 local-ready；未声称 CI、跨设备或生产交付就绪。
