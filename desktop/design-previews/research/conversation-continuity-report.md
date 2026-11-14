# 对话操作连续性修复记录

日期：2026-10-16。范围：继续 Codex / Claude 对齐中的历史消息操作、输入框编辑态和本地会话草稿；没有新增依赖、迁移框架或接入模型。

## 实现结果

- 编辑后发送立即可用；输入框出现编辑条和取消按钮。点击取消或按 Esc 恢复原草稿；输入法和补全菜单优先处理其按键。
- 修改旧消息后保留原文，新增用户消息和回复，随后恢复进入编辑前的草稿。多次切换编辑对象不会覆盖这份备份。
- 重新生成 / 失败重试统一查找显式源消息，修复对 A 连续重新生成却第二次使用 B 的错误。旧记录保留无来源字段的兼容路径；显式无效来源不回退。
- 会话切换保存独立的编辑草稿，返回后恢复；新会话不继承编辑标记。旧状态播报也清除。
- 页面触发的重新生成 / 故障演示不消费输入框草稿，删除三个适配器中重复的备份恢复代码。
- 保留原有“执行中文字渐变，渐变处隐藏旋转圈”的共享样式。没有改动本轮之外的消息动画或图标来源。

## Changed Files

| 文件 | 本轮修改 |
| --- | --- |
| `conversation.js` | 源消息关联、编辑取消、按钮同步、草稿 API、会话重置；合并重复的重试 / 再生成处理 |
| `components/composer.js`、`components/composer.css` | 复用已有输入组件添加编辑条、标准 pencil 图标、原生取消按钮与焦点样式 |
| `chat.js` | 会话保存与恢复编辑草稿；删除页面动作的草稿备份恢复 |
| `main.js`、`components/showcase.js` | 删除重复的草稿备份恢复，采用共享 submit 语义 |
| `tests/conversation-continuity.test.mjs` | 17 项真实 mountConversation 回归，用轻量 DOM stub 驱动实际渲染与事件；没有复制生产状态逻辑 |
| `AGENT-INTERACTION-STANDARD.md` | 记录历史消息、编辑、草稿与公开接口合同 |
| 本目录 `conversation-continuity-plan.md`、本记录 | 修改前计划和证据 |

以上文件大多是先前工作已存在的未跟踪文件；本轮只改所述部分。其他脏工作区改动保留。修改前六份源码快照保存在 `.omx/state/conversation-continuity/before/`，用于查看和恢复本轮差异。

## Verification

- 基线：32 项对话 / 消息 / 菜单测试通过。
- 先新增 4 项回归，全部红灯，分别证明：空草稿编辑后发送禁用、旧回复重复生成串题、旧失败重试后生成串题、切会话残留编辑标记。
- 修复后 17 项连续性测试覆盖上述路径，以及取消、发送编辑恢复草稿、多次切换编辑对象、运行期间编辑禁用、显式请求保留草稿、无效来源拒绝、IME / 补全按键优先、状态播报清理与恢复。
- `npm test`：规则校验通过，**293/293** 测试通过，无跳过。
- `npm run lint`：通过。由于根 lint 忽略 desktop，另行对修改的 JS 和新增测试执行 `eslint --no-ignore`；main.js 显式传入 document / window globals，均通过。
- `components/composer.css`：现有 PostCSS 解析通过。`git diff --check` 退出 0；相对修改前快照的 whitespace 检查无错误，no-index 的 1 仅表示有差异。
- 静态审查确认原有 ResizeObserver 根据 composer 实际高度更新悬浮入口偏移；新增编辑条没有另设固定高度补丁。这不替代窄屏实测。
- 本地 `chat-full.html` HTTP 200。此次未重跑 desktop TypeScript / Vite：设计预览不属于该构建产物，本轮也未修改 desktop/src。

### 真实浏览器已完成与未完成

已在 1280×720 深色完整聊天页验证：原先空草稿点击编辑后的发送禁用问题；修改后编辑条出现且发送可用；按钮取消后可继续输入；从编辑中的会话切换到另一个会话，不携带编辑条；返回后恢复编辑文本。已查看修改后的整页截图。基线截图保存为 `.omx/state/conversation-continuity/before-edit.png`。

这次实测又发现 idle → idle 会话切换残留编辑状态播报，随后修复并新增自动化回归。继续验证时，工具返回 **Local browser use is disabled in Work settings**，因此停止浏览器操作，没有绕过设置。

未完成：最终代码的桌面复验、390px 窄屏、浅色主题、实际键盘取消、连续再生成的浏览器端复验、控制台复查及最终截图保存。自动化测试通过不能代替这些视觉 / 浏览器检查。已有修改后截图只在工具输出中，未保存成最终交付文件。

独立代理提供了前三个缺陷的复现、测试和边界审查（14 项时通过，之后补写了状态播报测试），确认适配器的草稿保存 / 恢复路径；其最后一轮因工作区额度错误结束，**没有声称最终独立审查全部通过**。主代理检查最后差异，并运行最终 293 项测试与静态检查。

## Fix Register

| ID | Severity | Disposition | Owner | Approver | Due/Expiry | Action | Verification | Tracking ID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CC-01 | medium | fixed | root | root + independent boundary review | 本轮 | 编辑按钮即时同步、取消恢复草稿 | 新回归与桌面部分实测 | conversation-continuity |
| CC-02 | medium | fixed | root | root + independent boundary review | 本轮 | 明确回复来源，统一 retry / regenerate | 旧 A/B、失败重试、无效 ID 回归 | conversation-continuity |
| CC-03 | medium | fixed | root | root + independent boundary review | 本轮 | 会话保存编辑态并清理旧关联 | 挂载视图回归、适配器审查、桌面会话往返 | conversation-continuity |
| CC-04 | low | fixed | root | root verification | 本轮 | 清除 / 恢复编辑状态播报 | 最终回归 | conversation-continuity |
| CC-V01 | medium | verification blocked | root | 未审批豁免 | 浏览器能力恢复后 | 最终桌面 / 窄屏 / 浅色 / 键盘 / 控制台复验 | 当前 Work 设置禁用浏览器 | conversation-continuity-visual |

## Quality Profile / Delivery Gate

- Source/status：discovered；根与 desktop/package.json、既有测试及全局质量规则。没有项目专属质量 profile。
- Commands / thresholds：根规则校验、全部测试零失败、根和显式 lint 零错误、CSS 可解析、diff 无空白错误；UI 另需浏览器验收。
- Critical paths：编辑 / 取消 / 发送、旧回复重复再生成、会话往返、程序化请求不破坏草稿。
- Decision：**FAIL（最终视觉验收未完成，非已知测试失败）**。Risk：medium。Release status：blocked。
- Gates：DQ-00/01/04/05/07/08=PASS（此预览范围）；DQ-06=BLOCKED（最终 dogfood / 视觉）；DQ-10=BLOCKED（不能作完整交付声明）。DQ-03 无获批延期；DQ-09/11 不适用。最终独立审查不完整，不用已有部分结论替代整体验收。
- CI / recovery：没有提交、推送或远程 CI；恢复时仅对照 before 快照撤销本轮明确修改，不覆盖其他未提交工作。无数据迁移、外部副作用或生产发布。

## 启动与边界

仓库根目录执行 `node desktop/design-previews/_serve.mjs`，打开 `http://127.0.0.1:5501/chat-full.html`、`main-four-region.html` 或 `component-showcase.html`。当前本地服务仍可返回页面，不需要环境变量。

仍是定时片段、单个固定演示工具与内存会话，刷新不持久保存；没有真实模型 SSE、真实文件操作、完整 Markdown 流式解析或完整版本树。不声称逐像素复制 Codex / Claude，也不声称所有组件已无可提升之处。
