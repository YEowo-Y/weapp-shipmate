# 上线船友 · 桌面外壳（P2.0 薄外壳）

决策 #8 的产品终态是一个自建桌面 agent（BYO-key、内置终端可开 Claude Code / Codex）。
本目录是它的**第一步薄外壳**：用最小代价验证「外壳 / 大脑解耦」这条主链路——
桌面窗口把仓库根目录的**极简依赖 Node 规则大脑**（`../bin/weapp-shipmate.mjs`）当 sidecar 进程调起，
渲染上线预检（`check`）与流程导航（`guide`）报告。

**P2.0 范围**：选文件夹 → 跑 check/guide → 看报告。**不含**终端 / BYO-key / agent 子进程——
那些是 P2.1+（技术方案与坑见 `../docs/07-desktop-agent-tech-research.md`）。

**P2.1（下一步）**：前端换骨为 React + shadcn。触发点 = **v0.1.0 预览发出后，与 outreach 并行**
（仲裁 2026-07-02，见 `../docs/04` / `../docs/08` §9）。视觉方向已定为 engineered-calm（赭橙强调色），
**勿重选方向**；规范源两处：
- [`design-previews/`](design-previews/index.html) —— 14 屏 mock 实现稿（共享 `app.css` 设计系统）：
  主界面四区、阶段工作区、设置、对话工作区、⌘K 命令面板、首启引导、explain、diff 审阅、
  健康检查仪表盘、同步闭环、项目记忆、类目顾问、手把手指导、审计。
- 用户在 Claude design 上另有一批 UI 稿，P2.1 启动时并入规范源。

## 技术栈

- 外壳：**Tauri 2**（Rust 后端 + WebView 前端），见 `docs/07` 的选型论证（包体/内存/安全模型）。
- 前端：Vanilla TS + Vite（薄外壳保持最小依赖）。
- 大脑调用：Rust `std::process::Command` 调起 `node ../bin/weapp-shipmate.mjs`（P2.0 用编译期相对路径；
  打包分发时改为随包 sidecar）。
- 文件夹选择：`@tauri-apps/plugin-dialog`。

## 本地开发

前置：Node ≥ 20、Rust（cargo）、Windows 上的 WebView2（Win11 预装）。

```bash
cd desktop
npm install
npm run tauri dev      # 编译 Rust 后端并启动桌面窗口（首次编译较慢）
```

> 安全灶台（继承自项目）：预检仍 local-only、源码不出本机；外壳不新增远程上传能力。
> 报告只是「待你确认」的导航建议，不构成合规担保。
