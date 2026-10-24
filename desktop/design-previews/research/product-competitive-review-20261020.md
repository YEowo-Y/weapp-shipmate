# 全功能竞品评审与落地决策

核验日期：2026-10-20。范围：当前仓库浏览器工作台、完整聊天、Tauri 桌面、CLI/MCP。官方文档是功能依据；截图仅作为所见界面的视觉证据，未登录竞品账号实测授权或套餐功能。

## 结论

现有产品已经有真实模型文本聊天与本地规则工具，但二者仍是独立路径，不应宣传成模型自主执行的完整 Agent。近期优先级是让已有工作可找回、可保存、可恢复，再把现有规则内核接入更多业务页面。继续增加记忆、监控、多 Agent 和插件市场的演示入口会稀释真实功能。

保留 Vanilla JS/TypeScript + Tauri + Web Awesome + Lucide。新加入 React 或三套聊天框架不会自动解决数据闭环；本轮不新增依赖。复用共享组件、现有 Schema 和带版本检查的 IndexedDB 事务，避免用自然语言猜测执行状态。

## 一手证据与采用方式

| 证据 | 已确认行为 | 本项目采用/限制 |
| --- | --- | --- |
| [Codex App Server](https://learn.chatgpt.com/docs/app-server) | 归档、恢复、永久删除为不同操作；列表可筛选归档 | 使用归档状态及活动/已归档/全部过滤；本轮不添加永久删除 |
| [Codex Projects](https://learn.chatgpt.com/docs/projects) | 会话搜索、组织及恢复入口 | 常用导航保持简洁，历史和数据管理承担整理操作；文档菜单位置有版本差异，不写死竞品快捷键 |
| [OpenClaw Sessions](https://docs.openclaw.ai/web/control-ui/sessions-and-sidebar) | Active/Archived/All，归档恢复、请求失败反馈 | 提交成功才更新归档列表；失败保留原会话；操作期间防重入 |
| [Cherry Data Settings](https://cherryai.com/docs/en/pre-basic/data-settings/) | 将备份、恢复与迁移集中管理，明确完整/轻量范围 | 新增“数据与会话”；明确仅为会话备份，不包含模型密钥、授权或项目文件 |
| [OpenClaw Backup](https://docs.openclaw.ai/cli/backup) | 创建、验证、恢复分阶段 | 文件大小、Schema、ID引用先校验，数量预览后追加提交 |
| [Cherry Mobile Backup](https://cherryai.com/docs/en/mobile/backup-and-restore/) | 恢复前预览来源和数量，明确替换语义 | 借鉴预览；本项目采用追加而非替换。移动端资料不当作桌面能力证明 |
| [Claude Data Export](https://support.claude.com/en/articles/9450526-export-your-claude-data) | 设置中集中导出；个人账号导出不能导入另一账号 | 借鉴入口，不宣称能导入 Claude/ChatGPT 的ZIP |
| [Claude Search and Memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) | 历史搜索、引用、长期记忆是不同能力 | 现有匹配保持称“历史搜索”；不将本地字符串搜索宣传为记忆 |
| [Cherry Chat](https://cherryai.com/docs/en/cherrystudio/preview/chat/) / [Settings](https://cherryai.com/docs/en/pre-basic/settings/) | 助手、话题、当前模型与全局设置区分；有数据和归档入口 | 模型切换保留上下文；设置直接进入所属会话面的管理操作 |
| [Claude Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) | 成果独立呈现并可回访 | 继续复用已校验清单和报告；无版本存储时不做假编辑画布 |

实际查看的[Cherry官方截图](https://cherryai.com/docs/content-assets/ea2f3f51dcba385254d1f719.webp)为聊天首页：全局侧栏、助手列表、模型标题、主内容和底部输入区层级清楚。截图不证明归档或备份逻辑。用户提供的Codex截图支持紧凑辅助信息、输入区层级和中性色方向，不据此臆测内部实现。

## 全功能矩阵

| 功能 | 仓库事实 | 本轮处置/下一步验收条件 |
| --- | --- | --- |
| 聊天、流式、停止、重试 | 五家供应商文本流；已有错误恢复测试 | 保留；归档/导入前显式停止并保存当前任务，恢复不自动重跑 |
| 模型连接与OAuth | API Key、Ollama、本轮前已有OpenRouter PKCE；密钥内存保存 | 保留；不是所有厂商都支持通用订阅OAuth，备份不扩散授权 |
| 真实工具 | 浏览器规则清单；桌面目录预检与清单 | 保留；下一阶段应接模型工具循环，并校验参数/步数/超时/只读边界 |
| 审批 | local-demo-change演示、状态及身份校验 | 维持演示标识；导入pending/accepted转stale。真实写文件前必须服务端绑定具体操作 |
| 成果 | 已校验清单支持Markdown/JSON，桌面报告可加入会话 | 本轮随会话备份与恢复；独立成果版本库暂不加入 |
| 历史与草稿 | 本地持久化，消息命中定位，浏览器两页面共享工作区 | 本轮新增归档筛选、恢复和追加导入；桌面独立workspace可手工迁移 |
| 设置与导航 | 模型/主题/字号真实，工程/规则/安全选项预览禁用 | 新增真实“数据与会话”，原生侧栏及更多菜单直达；预览项仍明确标识 |
| 项目记忆 | 固定示例搜索分类 | 不升级文案；待可信数据来源、删除机制与可验证引用齐备再接入 |
| 健康检查 | 固定示例回放和阅读状态 | 不称后台监控；后续接真实扫描器、周期和失败恢复 |
| 阶段准备 | 静态步骤、来源与导航 | 作为办事指引保留，不称后台进度同步或工作流引擎 |
| 拒因反查/预检页面 | 浏览器固定示例；CLI存在真实explain/check | 优先后续接现有内核，不再增加同类假业务数据 |
| CLI/MCP | 共用规则内核check/guide/explain；stdio工具服务 | 保留；桌面不是通用MCP客户端，不新增插件市场 |
| 桌面分发 | 开发环境依赖系统Node和仓库路径 | 独立安装包仍需资源打包/运行时验证；本轮原生E2E不能证明安装包可分发 |

## 本轮数据策略

- 仅接受本项目版本1 JSON，20MiB/200会话上限，现有每会话消息及字段限制继续有效。
- 导入追加独立副本，重新分配会话与消息标识，更新阅读/编辑/审批来源引用；保留当前草稿、活动会话及现有审批状态。
- 不覆盖既有记录；跨窗口版本冲突、容量不足或格式损坏均保留原数据。持久化成功后才应用新快照。
- 备份是明文用户会话：用户自行输入的敏感文字仍会导出，界面明确说明。不会从凭据服务导出密钥。
- 保留归档后的消息、草稿、模型选择和阅读位置；恢复操作不调用模型、不执行工具。

验收结果、文件清单与已知限制见同目录 product-continuity-delivery-20261020.md。
