# 上线船友 · 应用内操作教程

三段可独立观看的无声教程，1920 × 1080、30 fps、每段 24 秒。应用入口为「更多功能 → 操作教程」。视频使用真实 Windows 界面截图，示例项目由验收脚本临时创建；画面中的结果不代表用户项目。视频只展示操作，不执行任何工具或提交动作。

| 教程 | 0–8 秒 | 8–16 秒 | 16–24 秒 |
| --- | --- | --- | --- |
| 运行项目预检 | 选择已保存项目 | 项目工具 → 运行项目预检 | 阅读报告，核对问题和依据 |
| 导出准备清单 | 进入上线进度 | 核对并保存项目事实 | 导出准备清单 |
| 生成修复交接 | 从报告打开交接 | 核对问题及来源 | 复制或导出 Markdown |

## 设计

沿用应用的暖白、陶土色和中文优先字体。左侧持续显示当前步骤和解释，右侧放大真实操作区域，底部显示三步进度。每步 8 秒，前约 1.5 秒用于淡入、定位和光标移动，其余时间供阅读。没有闪烁、循环弹跳或背景音乐；无需听声音理解内容。

播放器不自动播放、不循环；切换教程、Esc 或关闭都会暂停。原生视频控件支持拖动进度、重播和全屏。文字步骤完整保留，适合窄窗口、减少动效偏好及视频无法播放时使用。教程中的人工确认不等于官方完成，预检不保证过审，生成交接不会修改文件。

## 参考与原创边界

2026-11-07 调研，2026-11-08 制作。参考的是叙事方法，未下载或复制竞品界面、视频、图标或配乐：

- [Remotion 官方 Showcase](https://www.remotion.dev/showcase)：产品视频与教程的场景组织。采用自己的截图、局部聚焦和步骤注释。没有逐帧测量第三方作品或沿用其时长。
- [Alexwtlf/agentic-product-demo](https://github.com/Alexwtlf/agentic-product-demo)：借鉴光标先停稳、一次一个主要动作、给内容留阅读时间的节奏。该模板代码为 MIT；本工程没有复制模板代码。[模板许可](https://github.com/Alexwtlf/agentic-product-demo/blob/main/LICENSE)
- [Linear 产品页面](https://linear.app/)：借鉴围绕具体工作流而非功能菜单展开内容的方式，不使用其品牌素材。本项目不是 Linear 的关联产品。
- [Remotion spring](https://www.remotion.dev/docs/spring)、[Composition](https://www.remotion.dev/docs/composition)、[render CLI](https://www.remotion.dev/docs/cli/render)：帧驱动动画、合成与本地渲染的实现依据。

Remotion 4.0.541 是 **source-available、采用 Remotion License**，不是 MIT 或 OSI 开源库。个人、最多 3 名员工的营利组织等可按该版本许可免费使用，其他主体需对应许可；具体以已安装包内 `node_modules/remotion/LICENSE.md` 和[官方许可](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)为准。第三方模板的 MIT 许可不替代 Remotion 许可。

## 本地制作

此目录是独立的制作工程，不加入桌面运行依赖。先安装制作依赖：

```powershell
npm --prefix motion ci
npm --prefix motion run check
npm --prefix motion run studio
```

渲染三段 H.264 / yuv420p MP4 及 JPEG 海报，输出到 `desktop/public/tutorials/`：

```powershell
npm --prefix motion run render
```

首次渲染需下载 Remotion 的 Chrome Headless Shell。Windows 使用已安装的 Microsoft YaHei；未把系统字体文件复制进仓库。在其他系统重新渲染前需提供可用的中文字体，字体差异可能改变字形与换行。

`src/lessons.ts` 定义文案、步骤时长和镜头；`src/Tutorial.tsx` 负责帧驱动动画；`public/screens/` 保存原始截图与来源记录。编辑步骤或 UI 后需重采样截图、更新高亮坐标，再重新渲染并检查每一步，不能仅修改字幕而保留已经变化的按钮位置。

原生采集使用现有 `--presentation` 隔离验收，在既有检查结束后创建独立示例项目并实际执行预检、导出和交接路径。首次制作可加 `--tutorial-capture-only` 跳过尚未生成的视频解码；它不等于媒体播放验收。最终验收必须移除此参数，使用包含 MP4 的新构建验证三段视频实际解码、播放、切换暂停和关闭回焦。

生成的 MP4/JPEG 随桌面打包，播放无需网络或 Remotion。三段视频与三张海报共 5,208,805 字节（约 5.21 MB）。截图和教程媒体以外的临时构建日志、原生配置与播放器调试资料仍保存在 `.omx/artifacts/`。

## 本轮验证（2026-11-08）

- `npm test`：1,594 项通过；`npm run lint`、制作工程类型检查及桌面 TypeScript/Vite/Tauri 构建通过。
- 九个步骤分别渲染静帧并检查中文换行、实际按钮位置和高亮范围。六张原始截图的 SHA-256 与 `public/screens/source.json` 一致。
- 隔离 Windows 原生 `--presentation` 验收共 30 项通过，其中新增 2 项检查真实截图操作路径与教程播放器。三段打包视频均实际解码播放，尺寸 1920 × 1080、时长 24 秒；验证默认暂停、切换暂停、Esc/关闭暂停及回焦、390px 窄窗口文字和键盘恢复。无模型请求。
- 原生证据：`.omx/artifacts/desktop-model-native/run-2026-11-08T09-22-11-509Z/`，包括 `results.json`、`tutorial-viewer-evidence.json` 和宽窄窗口截图。制作、测试与构建日志：`.omx/artifacts/tutorials-20261108/`。这些本机证据不随发行包分发，也不代表签名安装器或其他操作系统验收。
- 首次截图采集后的清理检查发现弹窗过早聚焦 Web Awesome 按钮的问题；已改为聚焦原生标题，并在上述新构建中完整通过。截图来源记录保留这次采集与最终播放验收的区别。
- 启动 JavaScript 为 712,641 字节，gzip 为 234,359 字节，通过现有 750,000 / 250,000 字节门禁。Remotion 制作依赖未进入桌面运行包。
