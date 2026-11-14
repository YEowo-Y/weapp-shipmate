# 模型连接页面优化与浏览器验收

日期：2026-10-17。结果：本轮代码与本地浏览器验收通过。没有执行真实供应商账号授权、付费推理、部署或发布。

## 实际改动

| 文件 | 改动 |
| --- | --- |
| `desktop/design-previews/settings.html` | 删除重复的仿窗口标题栏；缩短页首文案；凭据生命周期说明改为原生 details |
| `desktop/design-previews/settings.css` | 统一服务商列表、状态、连接区、目录区；480px密钥弹窗；主次按钮；长ID断行；深浅主题与窄屏 |
| `desktop/design-previews/settings.js` | 原生表单回车提交、4096字符上限、获取密钥官方链接；操作专属渐变状态；目录搜索计数/清除/滚动保留；真实能力标识；连接后返回对话；OAuth等待恢复与焦点 |
| `desktop/design-previews/ui.js` | 共享原生dialog的双向Tab边界循环，保留Escape、原生modal和popover行为 |
| `desktop/server/model-connections.mjs` | 刷新失败保留上次目录与时间但状态仍error；换凭据清空旧目录；测试服务可使用独立Cookie名称 |
| `scripts/model-settings-fixture.mjs` | 独立回环验收服务，复用实际页面与代理，注入封闭上游响应，显著显示模拟标识 |
| `tests/model-settings.test.mjs`、`tests/model-connections.test.mjs`、`tests/dialog-foundation.test.mjs`、`tests/model-settings-fixture.test.mjs` | 新增认证UI、异步竞争、刷新恢复、Cookie隔离、焦点循环等回归 |

简化：复用现有原生dialog、按钮、品牌图标、连接客户端和服务端协议；删除重复标题/说明与相同模型名和ID的重复展示。没有新增依赖或叠加React/组件框架。

## 参考与证据边界

详见[来源记录](model-connection-polish-sources.md)。

- Cherry Studio：实际查看官方API Key弹窗图，参考三列布局、品牌标识、凭据输入、获取密钥、目录同步。
- ChatGPT：通过真实浏览器查看官方Settings文档中的Appearance界面示例（网页内渲染的官方illustration），参考单层设置与文字层级。
- Claude：实际访问官方连接目录并操作搜索，参考搜索、类别、能力说明；它是公开连接目录，不是登录态的第三方模型密钥页。
- OpenClaw：查阅官方Models/Control UI文档及固定提交设计规范，参考认证→同步目录→推理的职责边界。未取得对应Models设置截图，不声称四产品均完成登录态像素对比。
- [WAI-ARIA APG模态弹窗规范](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)用于键盘焦点边界。

## 浏览器验收

使用已恢复可用的Codex内建CUA浏览器、Playwright locator及CDP。无需额外安装浏览器框架。最初5501未启动，启动回环服务后可真实打开；本轮不再以静态检查替代浏览器验收。

**54项最终断言通过**，执行中发现的Tab逸出已修复并复验。机器记录保留55次尝试（含修复前失败），最终按检查名取最新结果：

- 实际5501页面打开、无模拟横条、控制台无error/warn。
- 独立5512页面：表单空值禁用、4096上限、显示/隐藏、Enter提交、关闭清空、Escape返回焦点、双向Tab循环。
- 成功、错误凭据、429限流、空目录、断开、Ollama无密钥连接、Anthropic目录限定能力。
- 模型搜索、零结果、清除、刷新保留搜索/滚动；刷新失败保留旧目录并标识，重试恢复。
- OAuth开始、明确的外部授权链接、刷新页面后取消/重新开始路径、等待状态与可操作焦点；未点击外部授权链接。
- 慢请求文字渐变、减少动效回退、双击只发一次刷新请求。
- 320/390/768/1440像素下页面及目录无水平溢出，256字符ID换行；深浅主题。
- 返回对话→打开已连接模型选择器→选择模型→回到输入框；目录限定供应商不出现在可聊天选项中。未发送推理。
- fixture控制台无error/warn。网络检查确认操作来自本地连接接口。

证据位于 `.omx/artifacts/model-connection-polish/`：

- `browser-acceptance.json`：逐条断言、原始失败/修复记录、视口测量、网络路径与状态。
- `before-light.jpg`、`final-model-connections.jpg`：实际页面改造前后。
- `credential-dialog.jpg`、`dialog-320.jpg`、`refresh-failure-mobile.jpg`。
- `responsive-{320,390,768,1440}.jpg`、`connected-light.jpg`、`connected-dark-full.jpg`。
- `reference-chatgpt.jpg`、`reference-claude.jpg`、`reference-claude-search.jpg`。

独立评审最初指出刷新丢目录、同主机不同端口Cookie碰撞，均已修复并新增回归；最终复核无剩余确认缺陷。共享dialog额外评审通过。

## 命令与结果

- `npm test`：**616/616通过**，0失败、0跳过。
- `npm run lint`：通过。
- `npx eslint --no-ignore desktop/design-previews/settings.js desktop/design-previews/ui.js desktop/server/model-connections.mjs scripts/model-settings-fixture.mjs tests/model-settings.test.mjs tests/model-connections.test.mjs tests/model-settings-fixture.test.mjs tests/dialog-foundation.test.mjs`：通过。
- `npm --prefix desktop run build`：TypeScript与Vite通过。该构建针对桌面壳，静态设置页另外验收。
- `node --experimental-vm-modules .omx/agent-experience-static-check.mjs`：16个HTML、48脚本、24样式、202引用、38个HTTP路由通过。首次漏加VM标志失败，纠正后通过；不是浏览器证据。
- `git diff --check`：通过；工作区既有CRLF转换提示不影响结果。

## 启动与复验

正常页面：

```sh
node desktop/design-previews/_serve.mjs
```

访问 http://127.0.0.1:5501/settings.html#key 。没有新增环境变量。API Key在页面输入，由本地服务内存保存，不写入前端存储。OpenRouter OAuth使用本地回调与现有PKCE。

独立测试：

```sh
node scripts/model-settings-fixture.mjs
```

访问 http://127.0.0.1:5512/settings.html#key 。测试Key为 `fixture-success`、`fixture-auth-error`、`fixture-rate-limit`、`fixture-empty`、`fixture-slow`、`fixture-refresh-error`。最后一种按服务商依次返回成功→429→恢复，复验该序列应先重启fixture。5512使用独立Cookie，所有上游响应为封闭模拟，不能证明供应商在线。测试进程在交付前关闭；正常5501预览保留。

浏览器复验顺序：打开设置→API Key回车提交→搜索与清除→刷新→错误与恢复→OAuth开始/刷新/取消→Tab/Escape→四个视口→返回对话选择模型。自动化检查使用CUA会话能力，尚未接入无头CI浏览器任务。

## 尚未验证与恢复

未验证真实外部OAuth成功回调、用户凭据与计费推理、屏幕阅读器、真实触屏设备、跨平台CI、原生Tauri端到端。Anthropic/Google仍仅模型目录，自定义服务仍为草稿，其他标记预览的设置未因本轮变成正式功能。

回滚应仅撤回上述本轮增量；工作区含大量前序未提交修改，不可全仓重置。停止独立fixture不会影响正常服务；重启正常服务会清除其内存凭据。本轮没有数据库迁移、依赖升级或密钥持久化。

