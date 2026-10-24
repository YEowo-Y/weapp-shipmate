# 清单成果操作：官方来源

核验日期：2026-10-17。本轮真实打开下列官方资料；未访问本地浏览器、未获取新的产品截图。资料支持行为和 API 语义参考，不代表对 Claude 当前界面的逐像素复刻。

| 来源 | 核实内容 | 本轮采用 |
| --- | --- | --- |
| [Claude Artifacts 官方说明](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) | 可复用成果与对话关联，支持导出；当前模板与旧版成果的操作有所区别 | 清单具有独立操作区，提供明确的导出格式。没有把旧版复制/查看代码/下载布局声称为当前所有 Claude 成果的统一界面 |
| [MDN Blob URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob) | Blob URL 可引用本地生成内容，每次创建都有资源生命周期；不应过早撤销仍在使用的 URL | 原生 Blob 与下载链接，不上传数据；同一成果复用 URL，设资源上限，并在到期、换会话和离页时清理 |
| [W3C Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) | 折叠控制需有展开状态与键盘操作语义 | 沿用原生 details/summary，每个分区阶段使用唯一标识，以恢复阅读状态 |
| [W3C Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | 搜索结果数量、等待与无结果适合状态播报，不应把完整结果内容都作为状态消息 | 稳定的 polite 状态区播报匹配数量，搜索结果使用现有清单 DOM，不整体重建或整体播报 |

## 实现选择与证据边界

- 复制等待剪贴板操作返回后报告成功；失败允许重试。下载点击只能证明已发起，不能证明磁盘写入成功。这是本产品的反馈约定。
- Markdown 和复制共用序列化函数；JSON 保留原始 `runGuide` 结果。筛选条件不改变导出范围，是本产品的数据完整性约定。
- Object URL 的 30 秒清理窗口、最多 8 个不同成果资源是本项目的有界资源策略，**不是 MDN 保证的下载完成时限**。会话切换与离页也会释放资源。
- 保留现有原生组件与数据合同，没有引入新的依赖、包许可证或服务 API。
- 没有进行浏览器剪贴板权限、真实保存、输入法、屏幕阅读器或视觉对照验收；代码及 DOM 测试替身不能替代这些验证。
