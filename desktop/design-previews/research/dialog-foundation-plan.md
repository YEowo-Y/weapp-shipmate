# 对话区成熟基础能力优化

2026-10-17，承接 session-experience。直接执行 + 有界原生子代理；不使用 OMX runtime。

## 范围与选型

预览仍为原生 ESM，多页面已共用 composer/message/ui。保留原生 textarea、dialog.showModal 与 popover 的编辑、模态隔离和顶层语义；保留已有 Lucide、Markdown-it。按用户“尽可能利用成熟最佳实践技术”要求，仅引入确实用于替换手写坐标的 Floating UI DOM，固定官方 MIT 发布版 dom/core 1.8.0、utils 0.2.12；本地 ESM、不走运行时 CDN，不安装 React/shadcn/第二套聊天运行时。

定位使用官方 computePosition、offset/flip/shift/size 和 autoUpdate；关闭清理监听，异步定位不能污染已关闭或新打开的菜单。供应链校验官方 tarball SHA-512，保留许可、来源与仅调整本地 import 的记录。

## 实施与验收

1. 先补共享表面与输入生命周期回归。现有标准验证为根 npm test / npm run lint、显式预览 ESLint、desktop npm run build、预览静态与 HTTP 校验。
2. 删除 ui.js 手算窗口定位，接入成熟定位库；菜单保持原生语义、方向键/Home/End/Esc/Tab及中文输入法保护，菜单 invoker 统一支持方向键初始焦点。
3. 保留 showModal 原生焦点隔离，核对弹层关闭、触发器失效后的恢复、dialog 中菜单与关闭清理。输入/按钮尺寸、滚动/溢出与 reduced-motion 用现有 tokens 统一。
4. 修复完整 conversation.destroy 监听解绑；bfcache pagehide 仅停止生成，真实卸载再销毁；补 keyCode229，统一输入高度边界并响应宽度变化。
5. 独立只读复核、完整自动化验证；记录成熟技术来源、实际文件、启动方式与未验证范围。

风险：共享菜单覆盖多个预览入口，必须验证清理、重入、键盘和异步竞态；引入第三方文件需锁定完整性。没有真实模型、文件操作、持久化或发布行为变化。

## 视觉门禁

Work 浏览器访问此前被禁用，用户明确选择“本轮先完成代码与自动化验证”。遵守该范围：源码/DOM模型/真实定位算法的合成几何可验证行为，但不能冒充真实浏览器、软键盘、焦点或像素验收。视觉 verdict=BLOCKED，每次改动前以已发现源码问题与官方参照评估，不声称通过视觉门禁。
