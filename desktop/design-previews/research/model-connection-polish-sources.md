# 模型连接页面：官方研究与实现交接

检索日期：2026-10-17。类型：当前最佳实践与界面参考研究。本文件只记录已查阅的官方证据及建议，不代表实现或浏览器验收。未登录用户账号、未调用付费模型、未运行参考产品。未新增或复制上游组件。

## 证据层级

### 实际观察到的产品图

- [Cherry Studio 官方 Model Service Settings](https://www.cherryai.com/docs/en/pre-basic/settings/providers/) 仍引用[这张官方图](https://www.cherryai.com/docs/content-assets/84b3d4a4b6d1af3614f9914e.webp)。本轮实际重新查看仓库已有 `assets/cherry-api-key-official.webp`：左侧设置导航、中间带搜索的厂商列表、右侧厂商详情；API Key 独立模态框在暗化背景上；框内是厂商图标与标题、单个输入框、显示密钥按钮、获取密钥链接和底部操作。详情背景有 API Host、Sync models、模型行和独立滚动区。没有逐像素测量，不将截图中的型号当作当前目录。
- [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) 的 2026-06-10 条目提供[模型菜单官方图片](https://images.ctfassets.net/j22is2dtoxu1/33WX9pLdkbnk3KR2RQDuEN/41874f8230fe2df9723ca287bd6b707f/Screenshot_2026-06-10_at_13.35.41_2x__1_.png?fm=webp&q=80&w=1344)。本轮成功解析官方图片链接，但工具未呈现像素，因此不据此断言视觉细节。该图是历史参考：同页更晚更新已移除部分自动切换行为，不能直接复制六月的 Auto 设置。
- Claude、OpenClaw 本轮取得的是官方文档与固定源码规范，没有取得可检查的设置页面像素；不声称已经观看其真实登录态设置页。

### 官方文档行为

1. [Cherry：Model Service Configuration](https://www.cherryai.com/docs/en/pre-basic/providers/)：厂商列表进入详情、填写凭证、同步模型、可选模型检查是独立步骤。连接协议也按厂商分类，不把所有厂商当作一种协议。
2. [Cherry：Model Service Settings](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)：密钥在独立弹窗中输入；Sync models 与 Model Check 分开；取得目录之后还要加入可选模型。其多密钥轮换、自定义地址与手动添加型号是该产品能力，不由外观自动带入本项目。
3. [OpenClaw：Control UI and API keys](https://docs.openclaw.ai/concepts/model-providers/control-ui-and-keys)：凭证状态、目录刷新和真实测试分别反馈。刷新时保留已有内容；目录错误提供重试。真实测试可能消耗 token；鉴权、限流、账单、超时错误分开。API key 不展示原文，账户信息仅在提供方真实返回时展示。
4. [OpenClaw：Authentication](https://docs.openclaw.ai/gateway/authentication)：模型厂商认证与 Gateway 自身认证不同；端点配置与凭证分离。API key、OAuth、外部凭证来源有不同语义，不能仅凭“已连接”一个布尔值代表全部。
5. [ChatGPT：Settings](https://learn.chatgpt.com/docs/reference/settings)：以 General、Keyboard Shortcuts、Appearance 等用途组织设置。该页当前标题是 ChatGPT desktop app，虽示例中有 Codex 字样，也不应混称 Codex 独有规范。
6. [Claude：Change the model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)：模型与 effort 位于发送按钮附近；切换从下一次回复生效。“More models”收起次要选项。这里只借鉴选择层级，不在不支持参数的传输中添加装饰性 effort 开关。
7. [Claude：Customizing your appearance settings](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings)：个人菜单进入 Settings → Appearance，主题和字体是全局设置；它们不应混入每个厂商的连接表单。
8. [OpenAI：Managing billing for ChatGPT and the API platform](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform)：ChatGPT 与 API Platform 分别管理计费，不应暗示填 API key 使用 ChatGPT 订阅。
9. [Claude：paid subscription versus API](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan)：Claude 和 Console 是独立产品。当前英文文档同时说明部分计划可关联 Console 获取 API credits；因此避免过时的绝对文案“订阅不包含任何 API 额度”。准确表述为“此处使用 Claude Console API 凭证，API 访问与计费由 Console 管理”。

### 固定源码证据

本轮重新打开官方 GitHub 页面并读取固定 raw 文件，以核对行号：

- `openclaw/openclaw@d8a406e1f75caeee7dd1649113cd9d6d04809c78:ui/docs/design-system/settings-design.md:L8-L29` — [固定来源](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/docs/design-system/settings-design.md#L8)：单层表面、标签与控件行、用文字和间距分组、轻量状态、一处主操作、仅颜色/背景变化。
- 同文件 `L83-L85` — [响应式规范](https://github.com/openclaw/openclaw/blob/d8a406e1f75caeee7dd1649113cd9d6d04809c78/ui/docs/design-system/settings-design.md#L83)：触摸目标 44px、输入字体最低 16px、窄屏标签与控件上下堆叠，动作允许换行。引用的是可复查源码规范，不是本项目尺寸的强制来源，也不宣称该 SHA 为最新发布版。

## 八条落地建议（研究建议，需由实现与验收证实）

1. **入口与任务分层。** 设置负责连接与目录，聊天输入区负责选择已可用的模型；一行显示当前模型并提供明确“管理连接”路径。依据 Claude 模型菜单与 Cherry 厂商设置流程。
2. **稳定的列表/详情结构。** 桌面厂商列表保留名称、图标、简短连接状态与搜索；详情以厂商标题开头。避免重复厂商大卡片。窄屏变为单列或选择器，不能横向挤压表单。依据 Cherry 实图与 OpenClaw 设置规范。
3. **收敛凭证表单。** API key 临时弹窗只放必要输入、显示/隐藏、获取凭证与保存动作；不预填真实密钥。关闭后清空输入，焦点返回触发按钮。关闭/焦点/清空是本项目建议，不能冒称从截图验证了上游实现。
4. **认证方式按能力显示。** OpenRouter 的已有 OAuth 可单独提供；API key-only 厂商不显示可点击的假登录。不要显示伪造邮箱、订阅、剩余额度。ChatGPT/Claude 消费订阅、厂商 API 和本应用会话应明确分开。
5. **三个结果分开。** 凭证已保存、目录已同步、实际生成可用是不同事实；文案显示当前验证范围。目录成功不显示“模型测试通过”。如果没有真实测试接口，显示“同步模型”而非“测试连接”。
6. **异步过程保护当前内容。** 同步期间保留已有目录、选择与滚动；失败保留可用旧内容并给就地重试。切换厂商、取消和关闭后，迟到响应不能修改新页面。依据 OpenClaw 刷新与恢复行为。
7. **可操作的目录。** 搜索、可选/未接入说明、当前选择状态、无匹配提示和清空搜索一起设计。模型能力仅用真实返回或已验证的支持信息；不要用名称推断视觉、工具、reasoning 或可推理性。
8. **验收包含真实状态和布局。** 用浏览器检查桌面/窄屏、键盘进出弹窗、搜索无结果、断开与重连提示、刷新错误、OAuth 取消、迟到结果和 200% 缩放。自动化 fixture 可覆盖成功/失败页面，但必须标注模拟响应；未经真实凭证授权，不得将 fixture 通过写成真实第三方 OAuth 或推理验收。

## 版本与范围

当前云产品文档无统一固定客户端版本，页面检索时间为上列日期；ChatGPT 历史图存在后续行为变更，Claude 英文与部分旧翻译的计费说明存在时间差。OpenClaw 固定 SHA 仅用于设计规范可追溯性，当前在线功能文档不等于该 SHA 所有能力。未复刻任何参考产品的账户数据、私有 UI 或授权 token。

此前 `model-connections-sources.md` 记录的本项目能力限制需要实现者再次核对；本研究没有检查或修改产品代码，不将旧报告当作最新运行结果。最终浏览器验收由主任务执行并单独记录。

## 追加：三产品视觉来源核查与可打开入口

2026-10-17 同轮补查。对官方域名执行图片搜索未返回结果；继续打开下列官方页面、检查其公开 HTML 图片元素，并检查 OpenClaw 官方仓库固定树。没有下载远程媒体绕过显示限制，没有操作主任务浏览器标签页。

| 产品 | 交给浏览器实际查看的官方入口 | 本研究确实取得的内容与限制 |
| --- | --- | --- |
| ChatGPT | [Settings 页面](https://learn.chatgpt.com/docs/reference/settings) | 页面包含内嵌 Appearance 设置演示（主题、字体、颜色），并非一张外链静态截图。web 文本能确认其控件文字；本研究尚未看见其渲染像素。此前官方六月模型菜单图仍可用于历史参考，不能代替当前设置页。 |
| Claude | [公开 Connectors and plugins 目录](https://claude.com/marketplace/connectors-plugins) | 这是官方可操作的公开目录，有 Search connectors、类别、类型、排序及连接条目；不是登录态 Settings，也不是多厂商模型认证页。可供浏览器观察目录视觉。 |
| Claude（历史） | [2025-05-01 官方 Integrations 文章](https://claude.com/resources/articles/integrations) 中的[官方演示视频](https://www.youtube-nocookie.com/embed/6IvP72wy4oE?enablejsapi=1&modestbranding=1&playsinline=1&rel=0) | 官方文章确认该视频属于 Integrations 演示。本研究未播放视频，不能声明已观察设置/授权镜头。当前帮助中心页面已主要采用文字步骤，不能把“Settings → Connectors”的文字当成截图。 |
| OpenClaw | [Control UI Settings](https://docs.openclaw.ai/web/control-ui/settings) 与[新版 Web UI 发布记录](https://docs.openclaw.ai/releases/2026.8.1/the-new-web-ui) | 取得官方设置功能说明；检查发布页 HTML，图片是品牌/社区素材，没有发现 Models 设置图。当前公开资料不能证明像素对齐。 |

另在官方仓库 `d8fa41ebddf5892bf31ade2f42ef32fc8b497228` 发现 [`.github/pr-proof/blobster-generation/local-model-preview.png`](https://github.com/openclaw/openclaw/blob/d8fa41ebddf5892bf31ade2f42ef32fc8b497228/.github/pr-proof/blobster-generation/local-model-preview.png)。GitHub 文件页可访问，图片工具抓取被 robots 拒绝；本研究未看见像素，**不将文件名当作模型设置截图的证据，不用于设计结论**。主任务若能直接用已授权浏览器查看，应先确认图中是什么功能再决定是否相关。

产品差异应保留：ChatGPT/Claude 消费应用的模型菜单、第三方工具连接目录与 Cherry/OpenClaw 的多厂商 API 设置并不是相同页面。可以分别参考导航、目录、表单和反馈；不能为了声称四产品一致而编造一个不存在的 ChatGPT/Claude 多厂商密钥页面。现阶段只有 Cherry 官方设置图已在本研究中实际显示；其余视觉观察必须由主任务浏览器真实补充，不能把本追加记录标为四产品视觉验收通过。
 ## 主任务浏览器观察补充
 
 2026-10-17已通过CUA实际查看：ChatGPT官方Settings页的Appearance界面示例（DOM为role=img的figure/illustration，不宣称下载的产品截图）；Claude公开连接目录及搜索；Cherry官方API Key图片通过本地view_image观察。截图在.omx/artifacts/model-connection-polish/reference-*.jpg。OpenClaw仅文档/源码确认，仍无Models设置像素证据。
 
 浏览器实测发现密钥dialog末尾Tab逸出，依据[WAI-ARIA APG Dialog Modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)补充首尾Tab循环并复验，保留原生modal和Escape。
