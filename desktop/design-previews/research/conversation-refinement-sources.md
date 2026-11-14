# 补全、输入与阅读连续性：真实参考

2026-10-17。本轮实际重新查看用户的 Codex 添加菜单截图 `codex-clipboard-eb9dd380-7053-46ea-93c0-29d71b7bc86c.png`：菜单与输入框宽度相近、深色菜单略深于输入面、低对比边框、圆角行、次要说明灰色、底部输入与工具栏分层。这些是图片观察，不是对私有源码的推测；未把图片作为产品资源发布。

沿用上轮实读的 [Claude 模型设置说明](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)：模型选择靠近发送按钮、变更从下一次回复生效。当前只有本地演示模式，不增加无执行能力的模型控件。本轮没有取得新的 Claude 客户端截图，没有用 Claude Code 的终端快捷键代替桌面行为。

本轮实读的技术依据：

| 官方来源 | 对应决定 |
| --- | --- |
| [WAI-ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | 输入焦点与建议选中项分离，使用 aria-activedescendant；保留浏览器文字编辑功能。补全只处理无修饰方向键与确认，Home/End及修饰键回到原生textarea；Esc关闭，Tab离开，IME不误确认。这里的多行任务输入属于项目适配，不宣称完全等同单行combobox示例。 |
| [Floating UI autoUpdate](https://floating-ui.com/docs/autoupdate) | 补全打开时才订阅位置更新，关闭释放；复用现有适配器的fixed、offset/flip/shift/size及过期回调防护，无额外库或版本升级。 |
| [MDN Using the Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using) | 使用原生非模态顶层弹层，避免被祖先overflow裁切；显示/隐藏与外部关闭状态同步。实际平台焦点和触摸行为仍需浏览器验证。 |

视觉收敛措施：补全与添加菜单使用中性背景和同一圆角层次；长路径显示完整文字；窄栏次要说明换行；操作按钮只在允许动效时给予轻微按下反馈；禁用选项没有可点击高亮；强制颜色模式仍有可见选中轮廓。

停止图标的暗色配置从白色改为既有深色 action ink：原声明颜色在粉色背景上仅2.70:1。暗色占位文字从 #929292 调为 #9e9e9e，与 #343434 输入背景的对比度从4.00:1提高到4.65:1。新增测试按声明的主题颜色计算亮度，检查两套主题的正文、辅助文字及占位文字至少4.5:1，发送/停止在常态与悬停下至少3:1。这是颜色token验证，不是浏览器最终合成像素测量。

生成后粘贴长草稿、流式过程中调整宽度造成阅读位置变化，是仓库源码审计发现的缺口；修复依据是保留用户阅读意图，不宣称复制 Codex/Claude 的内部滚动算法。

本轮继续遵循用户选择的代码与自动化验证。没有本项目当前截图、像素分数或浏览器Dogfood；不能把静态分析与参考截图当作最终视觉验收。
