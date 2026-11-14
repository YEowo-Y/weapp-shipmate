# 桌面拒因查询：实施与验收

沿用现有 Tauri / TypeScript、Web Awesome、Lucide、结构化规则查询，不增加依赖。

1. 先用回归测试锁定原生 Fetch、Node 桥接与 Rust 路由边界，只放行固定 POST tools/explain；检索复用现有服务的输入校验、CSRF、超时和取消。
2. 将查询控制器改为显式挂载，浏览器和正式桌面共用；关闭弹窗取消进行中的查询并保留输入，已完成结果保持可读，不让迟到响应抢焦点。
3. 工作台增加轻量拒因入口，更多功能增加同一入口。使用原生 dialog + 已有 Web Awesome 按钮、Lucide 图标和结果组件；内容宽度约 720px，独立滚动，窄屏有边距，关闭后返回入口。
4. Windows 原生 E2E 验证真实规则检索、来源折叠、空结果、重试、保留输入、Escape / 焦点与窄屏。补截图审查，再运行适用的 lint、测试、TypeScript/Vite、Rust 与 Tauri 构建。

参考：Tauri 官方 commands / channels 文档 https://v2.tauri.app/develop/calling-rust/ 。复用仓库已有竞品调研和组件结论，不声称本轮抓取到新的竞品截图。Cherry 文档本次抓取失败。

浏览器打开仍被 Work 设置禁用，禁止换浏览器绕过。仅验证正式原生应用；浏览器验收单独记录为阻塞。原生子代理因工作区额度不足未启动成功，根代理继续实现并逐项复核，不能声称独立审查通过。当前范围为开发态桌面，安装包资源与无 Node 环境的分发仍需另行验收。
