# 真实拒因反查与历史入口修复计划

用户要求继续推进全功能调研落地。保留现有技术栈、规则库、组件和未提交工作；不增加依赖。

1. 修复完整聊天在窄屏从设置进入已归档时导航仍关闭的问题。复用 responsive.js 的导航生命周期，补可失败回归。
2. 将 explain 页从单条固定示例改为真实 runExplain 查询。新增固定本机 POST tools/explain，沿用 Origin、Cookie、CSRF、会话单执行槽；拒绝未知参数、路径、草稿开关、空/超长输入。仅查询既有规则，不运行命令、不读项目、不调用模型或外网。
3. 结构化结果服务端与前端双重校验；保留同一规则在不同拒因下的合法重复。固定组件以文本节点呈现原因、规则、步骤、官方来源与仓库核验日期。没有命中时明确说明，不合成结论。
4. 保留输入草稿，真实请求驱动忙碌、停止、失败和手动重试；输入修改后不展示旧结果。按钮采用既有 Web Awesome，样式复用现有令牌，移除硬编码示例结果。
5. 验收：既有基线896项；先跑范围回归，再 npm test、npm run lint、显式前端lint、desktop build、相关本机HTTP端到端和原生E2E。无新增模型或检索算法，因此不改变核心规则准确性基准。

风险：共享本地服务和不可信输入属高风险，需独立边界复审；恢复方式为回退本轮独立路由/页面变更，不修改数据Schema。profile来自package.json、desktop/package.json、.github/workflows/ci.yml及既有原生脚本；不做CI或发布就绪声明。

浏览器工具再次返回Local browser use is disabled in Work settings；不通过其他浏览器绕过。浏览器最终交互和截图门禁暂为BLOCKED，记录自动化替代证据和未验证范围。执行中沿用frontend-ui-engineering规范，不触发OMX运行时。
