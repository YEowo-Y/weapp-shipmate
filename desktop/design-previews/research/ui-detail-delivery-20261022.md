# 视觉细节与复制反馈：修改和验证记录

日期：2026-10-22。结合用户图片、8 个官方/开源来源及真实桌面截图进行评估，结论见 [全项目评审与十条建议取舍](ui-detail-review-20261022.md)。本轮不新增依赖，不修改凭据、模型协议、权限或会话格式，不提交或发布。

## 修改与简化

| 文件 | 本轮实际内容 |
| --- | --- |
| `desktop/design-previews/conversation.js` | 复制成功 2500ms 恢复原按钮及成功播报；保留失败重试。复制任务身份、会话 epoch 与播报版本隔离旧 Promise/timer。流式代码变化撤销旧反馈，代码未变时保留。 |
| `desktop/design-previews/components/workbench.css` | 首页卡片复用 surface-2；删除主卡片额外着色边框、微阴影及图标外盒，保留按钮和内部区分。静态简介使用 pretty，补高对比边界。 |
| `desktop/design-previews/components/message.css` | 代码块减轻外框、保留标题分隔和键盘焦点；运行记录、结构化结果及清单数量使用等宽数字。 |
| `tests/conversation-continuity.test.mjs` | 新增 16 项行为回归：计时、重复复制、失败、重绘、切换/销毁、源码失效、迟到异步、同文案不同播报所有权等。 |
| `scripts/desktop-native-e2e.mjs` | 新增两个真实 WebView2 检查：消息复制恢复/焦点/布局/提示消退；代码文本、复制标签恢复和 Tab 焦点。使用明确标记的本地协议代码 fixture。 |
| `desktop/README.md`、本目录计划/评估/交付记录、`.omx/state/ui-detail-review/ralph-progress.json` | 记录取舍、真实能力边界、验证证据和未完成门禁。 |

其余工作区文件来自此前轮次，未重置。继续复用现有 Web Awesome / Lucide / Markdown 渲染器；没有增加新的组件包装、字体、动画库或人工逐字等待。

## 验证结果

- 修改前消息/Markdown/流式相关基线 **95/95**。新增复制回归先失败再通过，记录于 `.omx/artifacts/copy-refinement-red.log` 和 `copy-announcement-red.log`。
- 最终 `npm test`：**962/962 通过，0 跳过**；日志 `.omx/artifacts/ui-detail-tests.log`。
- `npm run lint`、额外 `npx eslint --no-ignore desktop/design-previews/conversation.js`、两个 JS 语法检查、`git diff --check` 通过。已有换行转换提示没有作为错误隐藏。
- `npm --prefix desktop run tauri build -- --debug --no-bundle`：TypeScript、Vite、Rust 构建通过。日志 `.omx/artifacts/ui-detail-build.log`。最终二进制 SHA-256：`8b303d005af1206cc31448d9c6cdea67ce9f53bbb737d3e42b69476800ef7972`。
- `node scripts/desktop-native-e2e.mjs`：**41/41 通过**。覆盖真实生产 UI/IPC、模型目录与选择、OAuth 协议错误恢复、流式/停止/重试、复制、历史/草稿/归档/备份、进程重启；不 mock Tauri invoke。
- 最终证据：`.omx/artifacts/desktop-model-native/run-2026-10-22T18-03-16-893Z/results.json`。独立只读审阅未发现本轮复制修改的阻断性问题，连续性交互 **86/86 通过**。

## 真实截图复核

首轮原生检查 40/40 通过，查看 `copy-feedback-restored.png` 却发现成功播报常驻，因此继续修复，并新增原生断言后重跑。不能只凭测试计数宣称视觉完成。

- 前轮 `run-2026-10-22T17-21-20-495Z/empty-1280x850.png` 为卡片基线。
- 首轮 `run-2026-10-22T17-59-33-557Z/empty-1280x850.png` 和 `empty-390x500.png` 已查看：静态卡片以底色区分、图标无重复外盒、窄窗口单列且保持独立滚动。390×500 是短窗口压力场景，首屏不能同时展示全部卡片，未将其声称为全部内容无需滚动。
- 最终 `run-2026-10-22T18-03-16-893Z/copy-feedback-restored.png` 已查看：图标恢复、成功提示消失。自动化比较按钮宽度和消息矩形恢复到操作前数值，焦点仍在原按钮。
- 最终 `code-block-focus.png` 已查看：代码完整、浅色层级清晰、复制恢复原标签，Tab 后 pre 的键盘焦点可见。

本轮实际视觉验收为 Windows 原生浅色场景。深色/forced-colors/reduced-motion 的浏览器复验未完成；CSS fallback 的存在不等同这些模式已实测。用户图片是建议文本，因此未做像素匹配评分。

## 交付门禁和剩余风险

Decision：**FAIL（完整浏览器门禁 BLOCKED；本轮代码和原生切片 PASS）**。Release status：**blocked**。不声称 production-ready 或全功能完成。风险 high：共享消息控制器跨工作台、聊天和桌面入口。

质量配置为 discovered，来源为仓库/desktop manifests、CI 与现有原生验收脚本。标准测试、构建、独立审阅、RED→GREEN、真实截图修复证据已收集；未以原生检查替代浏览器、远端 CI、外部账号或分发验收。

| ID | 状态 / 严重性 | 下一步与边界 |
| --- | --- | --- |
| CF-01 | blocked / medium；继承此前记录 | Work 设置禁用本地浏览器。历史弹窗主题/尺寸/键盘、深色窄屏、设置空搜索恢复、禁用按钮实际点击与控制台等矩阵仍未关闭。浏览器恢复后、完整交付声明前补验；当前执行者负责，无豁免批准人。 |
| UI-01 | recorded / low | JS 主包 500.03 kB / gzip 165.49 kB，CSS 194.00 / 34.49 kB。JS 相比前轮 498.65 kB 小幅增加并首次超过 Vite 默认 500 kB 提示阈值；还有既有静态/动态导入重叠警告。未提高阈值隐藏警告。后续测量与按需拆分应独立进行。 |
| UI-02 | not verified / medium | 外部 OAuth 和厂商推理使用明确的协议 fixture，不是供应商真实账号/付费 API 通过。本轮没有验证真实模型的长输出性能。 |
| UI-03 | product boundary | 通用模型工具执行、系统凭据库、报告显式发送给模型、跨端同步及安装分发仍需独立实现/验收，详见评估文档。 |

无新环境变量。预览：仓库根运行 `node desktop/design-previews/_serve.mjs`，访问 `http://127.0.0.1:5501/main-four-region.html`；桌面：`npm --prefix desktop run tauri dev`。预览默认演示，真实模型需显式连接；桌面需加载本轮重新构建的程序。回退仅撤销上表本轮修改，不重置整个脏工作区。
