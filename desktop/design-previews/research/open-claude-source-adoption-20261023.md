# 对用户指定 GitHub 仓库的源码复核与移植

这次按实际组件实现评审，补正上一轮只看框架依赖和组件组织的不足。主参考是 **Caho1/open-claude-ui**，其纯 CSS 导出可直接用于当前 Vanilla TypeScript/Vite/Tauri 项目，并不要求引入 React。

## 实际读到的代码与取舍

固定版本：[c1f923ae0051a871941b98a0e2e3183a545e6a85](https://github.com/Caho1/open-claude-ui/tree/c1f923ae0051a871941b98a0e2e3183a545e6a85)，上游提交时间 2026-10-21。这是 MIT 社区组件项目，不是 Anthropic 官方 SDK；作者的 REA 溯源说法没有在本项目中独立证实。

| 实际源码 | 采用 | 项目适配或排除 |
| --- | --- | --- |
| [package.json](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/package.json)、`cds-pure.css` | 确认 `./tokens.css` 和 `./pure.css` 独立样式出口 | 不把 React peerDependencies 误当纯 CSS 的强制运行时要求 |
| [cds-theme.css](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/cds-theme.css#L87) | 画布/侧栏/浮层色阶、透明 ghost 填充、输入框 normal/hover/focus 双环与轻投影 | 提取实际使用的变量；不用整套灰橙色阶和无关动效；暗色弱文本保留项目可读色 |
| [ChatComposer.tsx](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/ChatComposer.tsx#L99) | 20px 圆角、14px 内边距、8px 间隔、15px/1.4 输入正文、48px 最小输入高度 | 保持既有 704px 阅读列和 144px 高度上限，防止大输入框挤占内容；保留 IME、真实停止与草稿恢复 |
| [ChatMessageBubbles.tsx](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/ChatMessageBubbles.tsx#L139) | 个人用户气泡上限85%、18px圆角、16×12px内边距、浅蓝灰/暗色6%填充；助手无框、4px缩进 | 正文字号继续服从14/16/18阅读偏好；不复制虚构推理耗时、自然语言关键词判定工具状态 |
| [CdsButton.tsx](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/CdsButton.tsx#L28) | 32px桌面图标按钮和轻量ghost态 | 保留44px粗指针目标、Lucide图标、屏幕阅读器名称；不加入默认旋转加载圈 |
| [useClaudeScrollPinning.ts](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/useClaudeScrollPinning.ts#L21) | 核对“用户上滚退出跟随、主动跳到最新”的交互原则 | 已有控制器支持视口锚点、选区和代码滚动；上游一次性programmaticScroll标记不直接替换现有实现 |
| [ConfirmationDialog.tsx](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/ConfirmationDialog.tsx#L35) | 核对尺寸梯度、16px圆角、标题说明操作分区 | 源码未实现注释宣称的完整焦点锁；保留原生dialog及成熟组件，不复制div弹窗或嵌套模糊装饰 |

还检查了仓库离线组件展示 `docs/claude-components-storybook.html` 的源码。它是组件演示，不将其称为当前 Claude 真实产品截图。源文件快照位于 `.omx/artifacts/open-claude-source/upstream/`，不作为可执行第三方网页装入产品。

## 另外两条用户链接

- **shadcn/ui**：固定 [e55b60b1014cccfb9ac62f97e0d20b5b649f4a54](https://github.com/shadcn-ui/ui/blob/e55b60b1014cccfb9ac62f97e0d20b5b649f4a54/apps/v4/registry/new-york-v4/ui/dialog.tsx)。实际 Radix 变体使用 React、radix-ui、Lucide、本地 Button/cn；统一 Portal/Overlay/Content、可命名关闭动作、响应式 footer。不是页面业务逻辑的完整实现。
- **Creative Tim UI**：固定 [20eb87b1f671a2ba778b435c53249522080e8f27](https://github.com/creativetimofficial/ui/blob/20eb87b1f671a2ba778b435c53249522080e8f27/apps/www/registry/creative-tim/ui/dialog.tsx)。同样是 React/Radix/Lucide 组合，并非另一种必要的弹窗基础技术。实际 registry 也声明 Radix Dialog 依赖。

上述两个 Dialog 都把焦点机制委托给 Radix；并未各自实现长内容滚动和完整设置业务。当前项目已有 Web Awesome 与原生 dialog，继续复用标题、说明、可滚动正文、页脚和原始触发点焦点恢复的统一契约，不叠加 React/Radix。两者均为 MIT；本轮没有复制其 TSX 源码。

## 落地文件

- `desktop/design-previews/components/vendor/open-claude-ui/tokens.css`：限定作用域的源码改编；完整 MIT 声明以保留注释随压缩 CSS 分发。
- 同目录 `LICENSE`、`README.md`：完整授权、固定提交、原始文件行号及适配边界。
- `desktop/index.html`：显式加载适配变量。
- `desktop/src/styles.css`：正式桌面主题与组件消费者；替换原输入框重复尺寸，保持现有运行时。通用 focus 双环之外，键盘输入焦点使用满足可辨识要求的2px高对比指示；强制色与减少动画均有降级。
- `scripts/native-open-claude-acceptance.mjs` 与 `scripts/desktop-native-e2e.mjs`：在真实 Windows WebView2 和原有模型协议 fixture 上检查明暗、宽窄、长草稿、键盘焦点和发送。

## 验证

实现前既有聊天回归111/111；修改后全量1300/1300，最终聊天回归111/111、全仓lint及TypeScript/Vite/Tauri debug构建通过。独立审查指出键盘焦点对比与构建许可证丢失，均已修复并复核。

Windows 原生验收实际使用编译后的 Tauri/WebView2 应用：

- **默认完整路径48/48通过**：`.omx/artifacts/desktop-model-native/run-2026-10-24T06-15-14-974Z/results.json`。包括连接/OAuth协议fixture、流式与停止、失败重试、历史搜索、独立草稿、归档、备份导入、刷新及退出重启恢复。
- **首页、上线进度与设置19/19通过**：`.omx/artifacts/desktop-model-native/run-2026-10-24T06-01-09-538Z/results.json`。包括单设置入口、焦点恢复、跨窗口状态、200%文字与用户间距。
- 新聊天矩阵覆盖明暗主题及320/390/1000/1440px窗口，输出12张截图、20条布局/键盘焦点记录。8个空草稿视图均无横向溢出且发送禁用；输入最小48px、上限144px，阅读列最大704px。真实Ctrl+A/Backspace清空、Shift+Enter输入24行草稿、窄窗真实点击发送均通过。
- 同步修正原生验收中过期的报告入口、工具runner路径、并发查询、焦点返回和输入方法断言；本地只读查询可在模型流式期间独立完成，测试不再错误要求全局互斥。停止测试绑定当前上游请求，避免旧消息误命中。未用DOM伪造聊天状态。

最终聊天截图位于上述48项验收目录：`open-claude-light-1440-chat.png`、`open-claude-dark-1000-chat.png`、`open-claude-light-320-long-draft.png`；详细测量见 `open-claude-chat-layout.json`。独立视觉检查未发现确认的布局阻塞。截图使用系统150%显示缩放，因此图片像素大于CSS窗口宽度。

构建仍有既有的单块JS超过500kB及chat-transport静态/动态混合导入提示；本轮未新增运行时JS依赖，不声称已经完成分包或性能基准验收。触屏44px样式保留，但本机是精细指针，未验证真实触屏硬件。系统文件选择器及外部厂商真实账号授权不属于本轮通过范围。

零新增依赖、零新增环境变量。启动 `npm --prefix desktop run tauri -- dev`。本轮没有修改模型协议、认证、持久化、服务端权限或数据库；原生验收模型为明确标记的协议fixture，不代表厂商在线模型实测。
