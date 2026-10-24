# 结果操作与长报告阅读计划

## 范围与证据

继续上一轮拒因成果路径。会话审计发现长报告 appendRecord 强制滚动到底部，复制操作位于完整正文之后；拒因页已有可信 Markdown 成果却缺少下载入口。保留现有数据结构、模型请求隔离和安全 Markdown 渲染。

参考已实际读取的 Claude 官方成果说明（https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them，第 View and export / Work with artifacts 部分）和 Cherry Studio 聊天说明及官方截图（https://cherryai.com/docs/en/cherrystudio/preview/chat/）。取其结果操作靠近内容入口、可复制导出和独立阅读的原则；不复制未实现的编辑器或云分享能力。

## 最小修改与职责

1. 会话侧：复用既有消息操作和滚动/焦点能力，给本地报告前置复制入口；加入新报告后从开头阅读。保护正常模型流式跟随、旧消息检索与原草稿。
2. 拒因侧：复用 createArtifactDownloader 下载已校验的 Markdown；空闲/运行/编辑时不下载旧成果；失败可重试，文案只承诺发起下载。
3. 不新增依赖，不改会话格式、模型协议、规则匹配或系统文件权限。原生与浏览器共用组件。

## 验收与质量配置

- 风险：medium 本地交互；共享会话滚动按 high 的验证强度处理，独立审查。
- 来源：package.json、desktop/package.json、desktop/README.md、scripts/desktop-native-e2e.mjs 及现有测试（discovered）；无单独质量 profile 文件。
- 先写失败的行为回归，再最小实现。针对性测试、npm test、npm run lint、共享 JS 显式 ESLint、desktop build、Tauri debug no-bundle build、原生 E2E。
- 浏览器实际验收下载内容、空结果/编辑失效、键盘操作、浅深色及窄屏；原生验收长报告起点、前置复制、草稿和历史恢复。
- 对下载做生命周期/容量检查；不新增网络请求。复用既有 URL 释放、文件名和 MIME 校验。
- 发布与外部模型账户不属于本轮；本地构建不声称 CI 或安装包通过。
- 回退：只回退本轮 UI/控制器改动，不迁移存档。
