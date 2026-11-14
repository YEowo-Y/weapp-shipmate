# 全项目组件标准化：执行清单

2026-10-13。承接用户扩大范围：检查全部设计预览与正式桌面入口；尽量使用标准控件，不引入与现有技术栈不兼容的组件库。

## 修改前依据

仓库当前是原生 JavaScript 预览 + Tauri/Vite/TypeScript 正式入口，没有 React 或 UI 组件依赖。README 中 React/shadcn 是后续计划，不是当前可复用依赖。基线对话、结果、组件合同测试 17/17 通过，根测试上一轮 253/253 通过。

## 清理计划

1. 全部 16 个预览页面与正式入口列出控件类别及具体缺陷。保留业务卡片，只替换不规范的交互基础控件。
2. 设置、首启和主界面的开关/互斥选项改用 input checkbox/radio、fieldset/legend 和真实 label，删除模拟键盘与类名状态逻辑；保留原有路由和演示边界。
3. 共用工作方式选择使用原生单选，原生 dialog 负责模态；清理多余焦点拦截，并检查关闭、取消、焦点归还和长内容阅读。
4. 页面中的操作使用 button、跳转使用 a、展开使用 details/summary；修复无标签表单、重复命令面板及确实存在的键盘/状态问题。共享设计令牌，不另造通用组件框架。
5. 正式入口保留已有原生 select/button 与 Tauri 文件夹选择器，补齐忙碌、失败、禁用和报告语义，防止并发操作覆盖结果。
6. 关键行为先以现有测试锁定；新增风险路径做有意义的回归验证。运行根测试、显式预览 ESLint、正式桌面 build、浏览器全页控件清单与代表性键盘/手机/深色场景。输出逐项处置及未验证边界。

Cherry Studio、OpenClaw、Hermes 的 REA 研究在隔离目录中进行。使用固定官方版本和许可证记录，采用可解释的交互原则；不把静态分析等同于完整产品运行验证，不复制不兼容许可代码。

## 实施映射

用户已允许必要时安装 React/shadcn；本轮基础控件可用原生语义完成，没有新增产品依赖。官方固定版本、许可证、REA 证据与采用边界见 [Agent 产品参考](agent-product-reference.md)。

| 范围 | 实际修改位置 | 标准化方式 |
| --- | --- | --- |
| 开关与互斥选择 | `settings.html`、`first-run.html`、`main-four-region.html`、`components/native-controls.css` | 使用 checkbox/radio、真实 label、fieldset/legend；删除模拟开关和选项类名状态逻辑。 |
| 对话框与命令面板 | `ui.js`、`ui.css`、`command-palette.html` | 原生 dialog 处理模态，工作方式由单选表单显式应用/取消；删除重复面板实现及手写 Tab 陷阱。 |
| 展开与导航 | `audit.html`、`category-advisor.html`、`stage-workspace.html`、`main-four-region.html`、`health-dashboard.html` | 折叠使用 details/summary，动作使用 button，导航使用有实际地址的 a；对应共享样式放在 `app.css`。 |
| 输入与操作反馈 | `guided-step.html`、`memory.html`、`explain.html` | 补齐输入名称；复制结果等待 Clipboard API 成功或失败后再反馈。 |
| 工具输出与阅读 | `components/message.js`、`components/presentation.js`、`conversation.js` | 输入/结果/错误/公开摘要分区，成功结果经校验；保留展开、结果滚动和焦点，阅读详情时暂停自动跟随。 |
| 主题与重复事件 | `preview.js` 及各页主题入口、`main.js`、`chat.js`、`components/showcase.js` | 主题偏好和实际颜色分离，跟随系统单独保存；清理重复监听与补丁式模拟语义。 |
| 正式桌面入口 | `desktop/src/main.ts`、`desktop/src/styles.css`、`desktop/index.html`（仓库根目录起） | 保留现有原生 select/button 和 Tauri 文件夹选择器；统一忙碌互斥、错误恢复、报告失效与可访问状态。 |

表内是源码实施位置，不代表所有运行环境均已验收。正式 Tauri 文件夹窗口与 Rust 调用需在对应桌面运行环境验证；设计预览仍是本地演示，不能据此宣称真实模型接入或服务端审批已完成。
