# 服务商设置页：质感与品牌图标交付记录

2026-10-16。本轮是现有预览的定向改造，不涉及生产模型接入。代码检查和真实 IAB 浏览器检查已通过；前一轮设置页的浏览器不可用问题本轮已解除。

## 实际改动

| 文件 | 改动 |
| --- | --- |
| `settings.html` / `settings.css` | 复用 `agent-workspace` 中性主题；默认对话来源改为简洁设置行；统一设置导航、服务商列表、详情标题、分组分隔线、40px 桌面控件、44px 手机控件、16px 手机输入字号；精简窄屏预览顶栏。 |
| `settings.js` | 复用品牌图标渲染器用于列表、详情与密钥弹窗；使用已有主操作按钮样式；沿用 Lucide 搜索/空态；服务商计数随搜索更新。 |
| `settings-state.js` | 删除字母图标 `mark` 字段，保留原有草稿和验证职责。 |
| `components/provider-icons.js` / `provider-icons.css` | 固定服务商白名单、本地 SVG、装饰性语义。OpenAI / Anthropic / Ollama 单色遮罩随主题；Google 保留原彩；本地演示/自定义服务复用 Lucide。 |
| `components/brands/` | 4 个未改动的 SVG、完整 MIT LICENSE、固定提交与 SHA-256 清单、逐文件来源说明。 |
| `_serve.mjs` | 增加 `image/svg+xml` MIME，使本地 SVG 图片和 CSS mask 正确加载；仍只监听回环地址。 |
| `tests/model-settings.test.mjs` | 现有实际模块 DOM 回归接入真实品牌渲染器，模拟原生弹窗标题结构。 |
| `tests/provider-assets.test.mjs` | 新增 3 项资产来源/哈希、被动 SVG 内容、固定 ID 与装饰性语义检查。 |

没有安装依赖，没有复制另一套组件框架，没有改动对话运行状态机，也没有引入运行时 CDN。

## 来源与许可

厂商标志来自 [Lobe Icons](https://github.com/lobehub/lobe-icons)，固定提交 `8a1b2821bb768c484fe8da20c5e1838b6bf551a9`。这是开源图标项目的品牌资源，不声称它是各厂商自行维护的官方仓库。Anthropic 使用服务商品牌标志，Google 使用 Google G，与 Claude / Gemini 模型标志区分。完整许可证、来源和校验值见 [SOURCES.md](../components/brands/SOURCES.md) 与 [manifest.json](../components/brands/manifest.json)。4 个 SVG 共 6,265 字节。

视觉依据延续 [Cherry 官方设置页及真实截图](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) 和 [OpenClaw 设置规范](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/docs/design-system/settings-design.md)。本轮使用实际浏览器查看当前实现，没有声称通过 REA 运行提取。

## 验证证据

验证命令来自根 `package.json` 和 `eslint.config.mjs`；没有另设项目质量阈值。预览为原生 JS/CSS，无单独 TypeScript 编译步骤，未改正式 Tauri 打包文件。

- 改前：`node --test tests/model-settings.test.mjs tests/chat-menus.test.mjs`，15/15 通过。
- 改后：`npm test`，**305/305 通过**，规则数据检查通过。
- `npm run lint` 通过；根 lint 忽略 `desktop/`，因此对本轮 JS、服务脚本和测试额外使用 `npx eslint --no-ignore`，通过。
- `settings.css` 和 `components/provider-icons.css` 经已有 PostCSS 解析通过；设置页内联 module 经 Node 语法检查通过。
- 设置 HTML / JS / CSS、品牌组件、4 个 SVG 共 9 项 HTTP 200；SVG MIME 正确。
- `git diff --check` 通过，仅现有 CRLF 提示。
- 独立只读复核未发现明确阻断问题；首个预设 reviewer 模型不可用，已由继承模型复核，不将失败的代理调用计为审查证据。

真实 IAB 浏览器使用默认桌面视口（最终读取为 1280×720），并检查 768×900、390×844、320×740：

- 浅色/深色品牌图标均可见；Google 图片加载成功；资源全部来自本机，无外部资产引用。
- 390px、320px 无页面横向溢出；320px 详情按钮实际高度均为 44px，手机输入字号为 16px。
- 768px 服务商列表转为上方双列，详情区可读；390px 顶栏过宽的主题按钮已按截图发现并修正。
- 密钥弹窗初始聚焦输入；输入仅用 `preview-only` 测试文本；Esc 与遮罩点击均关闭并回到触发按钮；重开输入为空且检查按钮禁用。浏览器自身工具栏可获得 Tab 焦点，未把这一行为误报为背景页面可操作。
- 实际完成模型草稿添加、服务商切换隔离、返回原服务商后移除、搜索无结果（`0 / 6`）、清空搜索恢复。
- Ollama 显示无 API Key 的本地配置；无效远程 HTTP 地址显示错误并聚焦地址输入；测试连接保持禁用。
- 控制台无 error / warn。临时视口已恢复，测试草稿刷新清空，最终保留浅色设置预览标签页。

截图证据位于 [assets/provider-polish](./assets/provider-polish/)：

- `before-light.jpg`：修改前。
- `after-light.jpg` / `after-dark.jpg`：桌面完整页面。
- `credential-light.jpg`：桌面密钥弹窗。
- `mobile-light-390.jpg` / `mobile-dark-390.jpg`：手机完整页面。
- `credential-dark-320.jpg`：最窄检查视口中的弹窗。

## 范围、风险和启动

风险为中等：本地预览组件与资产渲染，现有草稿与临时输入边界保持不变。DQ-00/01/02/04/05 与相关 DQ-06/07/08 检查通过，新增 SVG 的被动内容和许可证已核查；无当前范围阻断项。DQ-09 发布、DQ-11 概率模型行为不适用。没有部署、发布或提交。

仍未实现：外部模型调用、真实凭据安全存储、连接测试、模型同步。这些功能在界面中保持明确的未连接/预览状态；本轮不能作为生产接入验收。强制颜色媒体规则已实现，但未做真实系统高对比模式实测；没有扩大为整站无障碍认证。

仓库根目录运行 `node desktop/design-previews/_serve.mjs`，打开 [设置预览](http://127.0.0.1:5501/settings.html)。无需环境变量或 API Key，当前预览服务已启动。
