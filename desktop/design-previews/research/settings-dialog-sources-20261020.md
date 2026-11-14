# 设置与业务弹窗：真实界面及组件 API 依据

检索与图片复核日期：2026-10-20。范围为资料研究，不代表产品功能已经实现或验收。

## 实际查看的图片

本轮用图片查看工具重新读取以下原图；来源记录位于 `.omx/artifacts/settings-history-detail/references/manifest.json`。随后重新打开原始公开网页核对出处。图片只用于观察，不作为本产品分发资源。

| 产品与来源 | 图片中直接可见的细节 | 可借鉴与不可推断的边界 |
| --- | --- | --- |
| [Cherry Studio 官方服务商设置](https://www.cherryai.com/docs/en/pre-basic/settings/providers/)；[API key 原图](https://www.cherryai.com/docs/content-assets/84b3d4a4b6d1af3614f9914e.webp) | 背景为设置分类、服务商列表、配置详情三列。凭据弹窗标题把服务商品牌图标、厂商名与添加操作放在同一行；右上角关闭。主体为单个横向密码输入框，眼睛按钮在字段内部，下面为获取密钥链接，底部操作分离。 | 凭据输入保持聚焦，帮助文字靠近字段，厂商身份贯穿弹窗。官方图片未注明版本；不能由截图证明密钥存储方式、OAuth 能力或网络错误处理。 |
| [Codex 社区设置原帖](https://github.com/openai/codex/issues/23794)；[General 原图](https://github.com/user-attachments/assets/d7009dd4-5ea4-4416-b8f2-74fd147ae522) | 深色设置采用单个圆角分组容器，内部用细线分隔行。每行左侧标题和较淡说明，右侧下拉、开关或按钮；宽控件右边缘对齐。没有给每个设置额外套卡片。 | 可借鉴行布局与文字/控件层级。记录来自 2026-06-05 社区评论；图片具体应用版本未确认，不称为当前版本完整复刻。 |
| [Claude 搜索原帖](https://github.com/anthropics/claude-code/issues/100949)；[原图](https://github.com/user-attachments/assets/299a324d-bdfc-49bd-a9a0-f78a0d02ee9a) | 搜索输入在顶部，关闭在右上；下方过滤项；结果采用左侧线性图标、标题、右侧辅助操作/快捷键，当前行用整行底色高亮。 | **该原帖是错误交互报告**：搜索结果混入 Archive/Delete 等会话操作，导致误归档。只参考排版与高亮，不能把此混排复制成最佳实践。历史搜索应仅打开结果，破坏性操作留在明确菜单。 |

Claude 原帖标明 2026-10-10、Desktop 2.31226.0、bundled CLI 2.1.281、macOS 27.0.1；这是作者报告的版本，非研究者在账号内实测。此次未登录 Codex/Claude/Cherry 私人账号，也未把静态图片当成交互测试。

本地查看文件：`cherry-api-key.webp`、`codex-general.png`、`claude-search.png`，均在上述 references 目录。

## 已核对的 Web Awesome 版本

官方文档页脚当前标明 **3.14.0**；本地安装包 `desktop/node_modules/@awesome.me/webawesome/package.json` 同样为 **3.14.0 / MIT**。本轮仅检查分发包的组件类型声明以交叉核对 API，没有修改依赖或产品源码。前轮 vendor manifest 记录 package gitHead `201e49fdb9359416f411e4a52b5e4af1ac88f3b8`。

| 组件 | 官方 API 事实 | 集成时需保留的行为 |
| --- | --- | --- |
| [Button](https://webawesome.com/docs/components/button/) | 默认 `type="button"`，与原生 button 默认 submit 不同；支持 `disabled`、`size`、`variant`、`appearance`、`start/end` 插槽及 `focus()`。`href` 会让内部渲染为链接。 | 表单提交需显式 `type="submit"`。图标可继续使用本地 SVG 插槽。不可假设只匹配原生 `button` 的事件委托会涵盖自定义元素。 |
| [Input](https://webawesome.com/docs/components/input/) | `label` / label 插槽提供标签，`hint` 提供说明；`type="password"` 配 `password-toggle` 提供显隐；原生事件名为 `input`、`change`、`focus`、`blur`，另有 `wa-clear`。支持 `value`、`select()`、`focus()`、`setCustomValidity()`。 | 密钥字段不应复制自造显隐按钮。当前值从属性读取；错误状态和错误文案仍由业务逻辑提供。不能凭仅原生 input 的 DOM 选择器判断是否处于编辑状态。 |
| [Select](https://webawesome.com/docs/components/select/) | 子项为 `wa-option`；单选 `value` 是字符串，多选是数组；有 `label`、`hint`、`disabled`、`required`、`placement` 和 `show()/hide()`；事件包含原生 input/change 与开合生命周期。 | 只用于有限选项；模型目录搜索若已有专用列表，不应因引入 select 被迫删掉搜索。必须实测弹窗内的键盘、Escape、滚动与焦点。 |
| [Switch](https://webawesome.com/docs/components/switch/) | 用于立即生效的布尔设置。`checked` attribute 是初始值；运行时读写 `.checked` 属性。监听 `change`；状态样式用 `:state(checked)`。 | 不可用 `hasAttribute('checked')` 判断点击后的值，也不要监听旧版库的 `wa-change`。非即时提交的表单布尔项应按其业务语义选择控件。 |
| [Dialog](https://webawesome.com/docs/components/dialog/) | 通过 `open` 属性开合；有 label/footer/header-actions 插槽，`--width`，内部使用原生 dialog。默认 Escape/关闭按钮可关；点击遮罩关闭须启用 `light-dismiss`。`wa-hide` 可取消，`wa-after-hide` 在动画结束后触发。 | API 不是 native `showModal()/close()` 的直接替身，也不是旧 Shoelace `request-close` 事件。迁移必须同步生命周期、取消清理和焦点恢复；保持已验证的 native dialog、只替换内部成熟控件也是可行的兼容边界，是否迁移由实现者按调用关系决定。 |

### 表单与自动化约束

[官方 Form Controls 文档](https://webawesome.com/docs/form-controls)确认这些控件是 form-associated custom elements，参与表单提交和约束校验；官方示例在绑定表单行为前等待 `customElements.whenDefined()`。`setCustomValidity('')` 清除自定义错误，非空文本阻止无效提交。客户端校验不能替代服务端校验。

升级原生控件为自定义元素时，验证必须跨过 shadow DOM：检查真实可编辑字段、密码显隐、Enter 提交、无效输入、取消、焦点归还及 disabled 行为。DOM 字符串匹配或不支持 shadow DOM 的假节点测试不能独立证明这些路径。

这些是集成关注点，**不是新增依赖或架构决策**。复用已选定的 Web Awesome，无须为了本轮表单额外引入 React 或其他 UI 套件。

## 可直接交给实施者的对齐准则

1. 设置采用分组行：左侧标题/说明，右侧控件；窄屏按语义顺序堆叠，避免三列同时挤窄。
2. 简单业务弹窗聚焦单一任务。标题与图标一致，字段标签和错误靠近输入，底部主次动作明确；模型连接的服务商身份保留。
3. 同类按钮、字段、开关使用同一组件与 token；行内图标保持统一尺寸和描边，厂商品牌图标单独保留。
4. 历史搜索只展示可打开的会话，不复制 Claude bug 图里的操作混排。
5. 运行中的操作继续使用现有文字渐变状态，不因控件库提供 loading 属性而重新加入旋转圈。

以上准则是从图片观察和 API 约束得出的实施建议，不是产品对外功能承诺。具体宽度、间距和字级属于本项目设计判断，不能声称从截图精准还原。
