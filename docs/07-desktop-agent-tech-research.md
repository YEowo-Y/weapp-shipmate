# 07 · 自建桌面 agent 终态：技术方案与稳定性调研

> 调研日期：2026-06-14 ｜ 来源：18+ 篇（GitHub 仓库/Issue/PR + 官方文档 + 工程博客）｜ 置信度：高（多源交叉）。
> 本文为**决策 #8（自建桌面 agent）** 的技术兜底，回答"终态怎么搭才稳"。结论分**事实**（带出处）与**推断**（明确标注），遵循项目"任何结论可回链来源、不做担保"的灶台。

## 摘要

社区在 2026 年已大量出现"桌面外壳 + 内置终端 + 跑 Claude Code / Codex 子进程 + BYO key"形态的开源项目，**船友终态不是开荒，而是踩在成熟模式上**。四条核心结论：

1. **外壳选 Tauri 2**——在"内嵌终端 + 跑 CLI 子进程"这一精确场景里，社区共识强烈倾向 Tauri：包体 ~10–30MB（Electron 150–300MB）、内存约 1/5、能力制安全模型默认 default-deny，且**无 native 模块 ABI 重编译之痛**（Electron 的 `node-pty`/`better-sqlite3` 需 `electron-rebuild`，是公认的 CI 痛点）。代价是 Rust 学习曲线 + WebView 跨平台差异需自测。
2. **内嵌终端用 `xterm.js`（前端）+ `portable-pty`（Rust 后端）**——这是 Tauri 阵营的标准组合。**最高风险点是 PTY 生命周期**：resize-after-exit 崩溃、Windows ConPTY 不发 EOF 导致读挂死、`portable-pty` 在 Windows `tauri build` 后弹 cmd 黑窗——三者都有现成解法，必须设计期就处理。
3. **BYO key 必须进 OS keychain，绝不进 localStorage / .env / 进程 env**——Tauri 用 `keyring` crate 直连系统钥匙串。要专门防"**AI agent 自我读取/外泄 key**"这一新威胁（内置终端里跑的 agent 本身可能读环境变量），社区最佳实践是 keychain + 本地代理注入 + TTY 守卫。
4. **`.mcpb` 旁路分发已是 Anthropic 官方机制**——`manifest.json` + `mcpb pack/sign`，`user_config` 里 `sensitive:true` 字段自动进 OS keychain，Node 运行时随 Claude Desktop 分发（零额外安装）。船友现有零依赖 MCP server 几乎可直接打包。

---

## 1. 外壳框架：Tauri vs Electron

**决定倾向：Tauri 2。** 证据（事实）：

| 维度 | Electron | Tauri 2 | 出处 |
|---|---|---|---|
| 生产包体 | 150–300 MB | 10–30 MB（hello-world 可 <1MB） | [PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)、[vanja.io](https://vanja.io/tauri-2-new-default/) |
| 空闲内存 | 150–400 MB | 40–90 MB | 同上 |
| 后端语言 | Node.js（全权限） | Rust（编译期内存安全） | [JS News](https://javascript-news.org/tauri-vs-electron-bundle-size-and-memory-footprint-in-2026) |
| 安全模型 | Node 集成开关 + 手动 contextBridge | 能力制权限 + scope，编译期固化 | [vanja.io](https://vanja.io/tauri-2-new-default/) |
| native 模块 | `node-pty` 等需 `electron-rebuild`，CI 痛点 | Rust crate 随 `cargo build`，无 ABI 重编 | [syv-ai/dash #92](https://github.com/syv-ai/dash/issues/92) |
| WebView 一致性 | 高（自带 Chromium） | 中（各 OS WebView 差异需自测） | [PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026) |

**针对船友场景的关键论据**：开发者工具类、跑在用户机器上、与本地 AI/agent 并存时，Tauri 的低占用尤为重要（[Agents UI 博客](https://agents-ui.com/blog/tauri-vs-electron-for-developer-tools/)：Monaco+终端+SSH 全功能仅 15–20MB）。多个 Electron 项目正主动迁 Tauri（[syv-ai/dash](https://github.com/syv-ai/dash/issues/92)、[AionUi RFC #2762](https://github.com/iOfficeAI/AionUi/issues/2762) 248MB→~45MB），迁移文档一致把 **PTY 管理标为唯一"Hard / 主风险区"**。

**反方/代价（事实，须正视）**：
- 安全不是白送。[Bishop Fox](https://bishopfox.com/blog/beyond-electron-attacking-alternative-desktop-application-frameworks) 指出 Tauri 的能力制"只和开发者对它的理解一样强"——XSS + 过宽的 fs/shell 能力配置仍可被利用。船友须把能力 scope 收到最小。
- WebView 差异：Windows 需 WebView2（Win10 1803+，Win11 预装），旧系统要运行时下载；macOS WKWebView 部分 CSS/JS 与 Chromium 有别（[AionUi RFC](https://github.com/iOfficeAI/AionUi/issues/2762)）。
- Rust 编译期更长、团队需吃 Rust。

> **推断**：船友前期若想极致轻量，可先不自造外壳（见 §5 的 `.mcpb` 旁路）；P2 自建时选 Tauri 2。此判断与项目"零依赖偏好 + 低运营成本公益"一致——Tauri 的小包体/低占用本身就是对零基础用户最友好的形态。

---

## 2. 内嵌终端：xterm.js + portable-pty 的坑与解

**标准组合（事实）**：前端 `xterm.js` 渲染 + 后端 PTY（Tauri 用 wezterm 的 `portable-pty` crate；Electron 用 `node-pty`）。`child_process.spawn` 不行——程序检测到非 TTY 会改行为（无色彩/无提示符/全屏 TUI 错乱），必须真 PTY（[node-pty README](https://github.com/microsoft/node-pty)、[Munder Difflin 博客](https://munderdiffl.in/blog/node-pty-electron-real-terminals/)）。

**必须设计期处理的坑（事实，逐条带出处）**：

1. **resize-after-exit 崩溃（最危险）**——PTY 退出后若 resize 事件才到，native C++ 直接抛异常，**绕过 JS try/catch**、冒泡到事件循环、杀进程。Node v22 因时序变化更易触发（[node-pty #827](https://github.com/microsoft/node-pty/issues/827)、[修复 PR #901](https://github.com/microsoft/node-pty/pull/901)）。
   - **解**：resize 前判 PTY 存活；在回调内部 try/catch；短命令禁用 resize；或用已修复版本。
2. **Windows ConPTY 不发 EOF**——子进程退出后 PTY 输出端不关，阻塞读会**永久挂死**；别用 `read_to_string()`，用 `read()` + 独立线程/异步（[Rust 论坛](https://users.rust-lang.org/t/rust-pty-output-hangs-when-trying-to-read-command-output-in-terminal-emulator/102873)）。
3. **portable-pty 在 Windows 弹 cmd 黑窗**——`tauri build` 后出现，需设 `TERM=xterm-256color` 等并处理子进程窗口隐藏（[wezterm #6946](https://github.com/wezterm/wezterm/issues/6946)）。
4. **resize 重画/重复行**——剧烈 resize 时 shell 重绘导致重复提示符；须 debounce（尺寸稳定后再发），跨 Win/Unix 都要测（[wezterm 讨论 #3363](https://github.com/wezterm/wezterm/discussions/3363)）。
5. **teardown 期向已销毁窗口 send**——退出时 `onExit` 异步触发，窗口可能已毁，`.send()` 抛 "Object has been destroyed"；每次发送前判目标存活（[Munder Difflin](https://munderdiffl.in/blog/node-pty-electron-real-terminals/)）。
6. **macOS GUI 不继承交互式 shell 的 PATH**——GUI 启动的 app 找不到 `claude`/`codex`；须主动解析登录 shell 的 PATH（[Munder Difflin](https://munderdiffl.in/blog/node-pty-electron-real-terminals/)）。
7. **孤儿进程**——父崩溃后子 agent 残留；Linux 用 `PR_SET_PDEATHSIG`，退出时显式 kill 全部会话（[Claudir 架构](https://gist.github.com/nodir-t/6b4b9e227fdc6f3a15be410dd4bcb4b1)）。
8. **node-pty 非线程安全**——勿跨 worker 线程共享（[node-pty README](https://github.com/microsoft/node-pty)）。

> **参考实现**：[JayarOnde/Tauri_TerminalEmulator](https://github.com/JayarOnde/Tauri_TerminalEmulator)（xterm.js+portable-pty 最小例）、[Terminal-64](https://github.com/Pugbread/Terminal-64)（Tauri+React+xterm.js+多 agent Claude Code+MCP）、[zigpty](https://github.com/pithings/zigpty)（node-pty 替代，自带 agent "idle" 检测、无需 C++ 编译）。

---

## 3. 把 Claude Code / Codex 当子进程跑

船友"内置终端跑 agent"有两条路：(A) 真 PTY 里跑交互式 CLI（用户直接看/操作）；(B) 程序化 headless 调用（船友把规则结论喂给 agent）。两者的坑不同。

**Claude Code headless（事实）**（[官方 headless 文档](https://code.claude.com/docs/en/headless.md)、[amux 指南](https://amux.io/guides/claude-code-headless/)）：
- `-p/--print` 非交互；`--output-format stream-json` 流式；`--bare` 跳过本地 hooks/MCP/CLAUDE.md 发现（CI 可复现）。
- **`--print` 默认仍会因工具审批而交互挂起**——必须配权限模式（`--allowedTools` 白名单 / `dontAsk` / 受控环境才 `--dangerously-skip-permissions`）。
- **必设 wall-clock 超时**（`timeout 30m`）；**必查退出码**（0 成功 / 1 跑了但有发现 / 2 跑失败，别混淆）；**必校验 JSON 形状**（畸形 JSON 是失败不是警告）。
- `--bare` 跳过 OAuth/keychain，认证走 `ANTHROPIC_API_KEY`——与 BYO key 直接相关。
- 程序化调用每次 spawn 有 ~1–2s 启动开销；官方 Agent SDK = "Claude Code as a library"，内部仍 spawn CLI 子进程、走 stdin/stdout JSON（[buildwithaws](https://buildwithaws.substack.com/p/inside-the-claude-agent-sdk-from)）。

**Codex CLI 特有坑（事实）**（[grapeot 指南](https://gist.github.com/grapeot/4271a9782da18b2e746a42e274720f77)）：
- **`nul byte found` 崩溃**：经 stdin 传 prompt 或 prompt 含 `\0` 时 Codex（Rust 核）直接崩。**解**：prompt 作为**最后一个命令行参数**传，传前 `replace('\0','')`。
- 用 `--json` 拿结构化事件（`thought`/`call`/`response`）；并发时强制 flush 避免缓冲卡死。
- 通用建议：**生产别用 `echo | claude` 管道**，用文件模式（先写临时文件再引用路径）。

**统一适配层（强参考）**：[Kangnam Client](https://github.com/kangnam7654/kangnam-client) 用 Tauri 2 + Rust `CliAdapter` trait 把 Claude Code（NDJSON）与 Codex（JSONL）的不同流格式归一成 `UnifiedMessage`，前端经 JSON-RPC 2.0 over WebSocket，权限请求弹安全确认框，会话存 SQLite——**几乎就是船友终态的蓝图**。

---

## 4. BYO key 本地安全存储

**铁律（事实，强共识）**：
- **绝不 localStorage**——Tauri WebView 的 localStorage 就是磁盘明文文件，同用户任意进程可读（[dev.to/Tauri 存 key](https://dev.to/hiyoyok/storing-api-keys-safely-in-a-tauri-app-dont-just-use-localstorage-2i71)）。
- **进 OS keychain**——Tauri 直接用 `keyring` crate（macOS Keychain / Windows DPAPI+Credential Manager / Linux libsecret）。前端永不持有 key，需要时 `invoke` 取（[同上](https://dev.to/hiyoyok/storing-api-keys-safely-in-a-tauri-app-dont-just-use-localstorage-2i71)）。
- **绝不作为 CLI 参数传**——会进 shell history 和 `/proc`（[llm-key-ring](https://github.com/yottayoshida/llm-key-ring)）。

**船友特有的新威胁——"agent 自我外泄 key"（事实）**：内置终端里跑的 Claude Code/Codex 本身能读环境变量，若 key 在 env 即可被 agent 读出/外泄。社区两种成熟缓解：
- **TTY 守卫**：非 TTY 的 `get` 一律拒（挡住 agent 经管道抽 key）；`zeroize` 退出时擦内存；剪贴板 30s 自动清（[llm-key-ring SECURITY](https://github.com/yottayoshida/llm-key-ring/blob/main/docs/SECURITY.md)）。
- **本地代理注入**：key 留在 keychain，本地 `localhost` 代理在请求时注入 Authorization 头，**key 全程不进 env**（[AIkeychain](https://github.com/aieo-product/AIkeychain)、[zenn 代理方案](https://zenn.dev/otani_ai_memo/articles/aikeychain-secure-api-key-management)）。
- **诚实边界**：llm-key-ring 明确"**绝不声称能防同用户代码执行**"——船友 SECURITY 文档应同样诚实划界，与"不做担保"灶台一致。

> **推断**：船友 BYO key 最简稳妥起点 = `keyring` crate 存取 + 首次启动引导页（key-not-found 是预期态非错误）。是否上本地代理，视"内置终端里 agent 能否读 key"的威胁等级再定，可作为 P2 安全加固项。

---

## 5. `.mcpb` 旁路分发（前期最轻路径）

**官方机制（事实）**（[Anthropic 工程博客](https://www.anthropic.com/engineering/desktop-extensions)、[anthropics/mcpb](https://github.com/anthropics/mcpb)、[官方 build-mcpb skill](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/mcp-server-dev/skills/build-mcpb/SKILL.md)）：
- `.mcpb` = zip（含本地 MCP server + `manifest.json`），stdio 传输，用户在 Claude Desktop **一键安装**。`.dxt` 已更名 `.mcpb`（旧的仍兼容）。
- **唯一必需文件是 `manifest.json`**；`server.mcp_config` 写 `command`/`args`/`env`，`${__dirname}` 指包内路径，`${user_config.X}` 注入安装期配置。
- **`user_config` 里 `sensitive:true` 的字段自动存进 OS keychain**——天然适合 BYO key。`type:"directory"` 渲染原生目录选择器（适合船友"被检项目路径"）。
- **Node 是推荐运行时**——随 Claude Desktop 分发，用户无需另装；船友现有零依赖 Node MCP server 几乎直接可打。避免 native 依赖（跨平台编译难）。
- `mcpb pack` 打包并校验 manifest、自动排除 `.git`/`node_modules/.cache`/`.env.*` 等；`.mcpbignore` 加自定义排除；`mcpb sign`/`verify` 用 PKCS#7 签名。
- 跨客户端：任何支持 .mcpb 的 AI 桌面应用都能装，不止 Claude Desktop（[himalaya-mcp 参考](https://data-wise.github.io/himalaya-mcp/reference/mcpb-format-reference/)）。

> **落地提醒（事实+不做担保）**：manifest 版本仍在演进（当前 spec 见 `manifest_version` 0.3/0.4），打包前以 [官方 MANIFEST.md](https://github.com/anthropics/mcpb/blob/main/MANIFEST.md) 当前版为准。

---

## 6. 可借鉴的同类开源项目（先研究、别重造）

| 项目 | 栈 | 与船友相关点 |
|---|---|---|
| [kangnam-client](https://github.com/kangnam7654/kangnam-client) | Tauri 2 + Rust | **最贴近蓝图**：spawn Claude Code/Codex，CliAdapter 归一 JSON，JSON-RPC/WS，安全确认框，SQLite，浏览器亦可用 |
| [codeg / 0xxb](https://github.com/0xxb/codeg) | Tauri + Rust core | 多 agent 工作区，MCP 管理，git worktree，桌面/服务端/Docker 三形态 |
| [Terax AI](https://runany.dev/blog/terax-ai/) | Tauri + React | 7MB，xterm.js 终端 + 多 LLM BYO key + 工具审批 |
| [Nora](https://github.com/Citosoft/nora) | Electron | PTY 终端 + 每会话 git worktree + CLI 检测安装 |
| [Phasr](https://phasr.sh/) | 桌面（MIT） | "凡能在终端跑的 agent 都能跑"，worktree 隔离 + review-first |
| [bbarit/terminal](https://github.com/bbarit/terminal) | Tauri+xterm.js WebGL | Claude/Codex/Ollama 在原生终端 + Monaco + PM2 |
| [Cherry Studio](https://cherry-ai.com/) / [Jan](https://github.com/menloresearch/jan) | Electron / Tauri | 45k/42k★ BYO-key 多provider 桌面客户端 + MCP；成熟度参照系 |
| [vibeshell](https://github.com/veithly/vibeshell) | Tauri | 为 AI agent 造的 SSH 客户端，经 MCP skills 让 Claude/Codex 管服务器 |

> **观察（推断）**：2026 年这类项目井喷且高度同构（Tauri + xterm.js + spawn CLI agent + BYO key + worktree 隔离 + MCP）。船友的差异化**不在外壳**（外壳是红海），而在**已核验的微信上线规则大脑**——这反向印证决策 #8 的"大脑/外壳解耦、外壳可借力"判断。

---

## 7. 终态稳定性建议清单（落地 checklist）

> 供 P2 自建 agent 立项直接对照。每条都对应 §1–6 的某个已知坑。

**外壳**
- [ ] 选 Tauri 2；能力（capability）scope 收到最小——只授终端/规则引擎/keychain 必需的命令，禁任意 shell/fs。
- [ ] Win/macOS/Linux 三平台 WebView 自测矩阵（WebView2 版本、WKWebView CSS 差异）。

**终端**
- [ ] PTY resize 前判存活 + 回调内 try/catch；短命令禁 resize（防 resize-after-exit 杀进程）。
- [ ] PTY 读用非阻塞 + 独立线程/异步，勿 `read_to_string`（防 ConPTY 不发 EOF 挂死）。
- [ ] resize debounce（尺寸稳定后再发）；Windows 隐藏子进程 cmd 窗口。
- [ ] teardown 期发送前判窗口/通道存活；退出时 kill 全部 PTY 会话；Linux 设 `PR_SET_PDEATHSIG` 防孤儿。
- [ ] macOS 主动解析登录 shell PATH，否则找不到 `claude`/`codex`。

**跑 agent**
- [ ] Claude Code headless：`-p` + 显式权限白名单 + `--output-format stream-json`，必设超时、必查退出码、必校验 JSON。
- [ ] Codex：prompt 作为**最后一个命令行参数**传 + 传前 `replace('\0','')`（防 nul byte 崩）。
- [ ] 用 CliAdapter 式适配层归一不同 agent 的流格式。

**BYO key**
- [ ] `keyring` crate 进 OS keychain；绝不 localStorage / .env / CLI 参数。
- [ ] 评估"内置终端 agent 读 key"威胁；必要时上 localhost 代理注入（key 不进 env）+ 非 TTY 取用守卫。
- [ ] 首次启动 key-not-found 当引导态；SECURITY 文档诚实划界（不防同用户代码执行）。

**分发**
- [ ] `.mcpb` 旁路：复用现有零依赖 Node MCP server；BYO key 走 `user_config` 的 `sensitive:true` 字段；`mcpb pack`+`sign`；以官方当前 manifest 版为准。

**守住灶台（贯穿所有层）**
- [ ] 规则预检默认 local-only，源码不出本机。
- [ ] 不输出"保证过审/已合规"；官方提交仍 `manual_required`。
- [ ] 零依赖偏好：外壳的每个新依赖都需论证；优先 Tauri 官方插件与标准 crate。

---

## 来源

1. [Tauri vs Electron for Developer Tools — Agents UI](https://agents-ui.com/blog/tauri-vs-electron-for-developer-tools/) — 开发者工具为何选 Tauri，终端 I/O 走 Rust。
2. [Migrate Electron→Tauri 2 · syv-ai/dash #92](https://github.com/syv-ai/dash/issues/92) — 迁移清单，PTY 标为唯一 Hard 项。
3. [RFC Electron→Tauri · AionUi #2762](https://github.com/iOfficeAI/AionUi/issues/2762) — 248MB→45MB，WebView2/WKWebView 注意点。
4. [Terax AI 7MB Tauri workspace](https://runany.dev/blog/terax-ai/) — xterm.js + 多 LLM BYO key + 工具审批。
5. [Tauri vs Electron 2026 — JS News](https://javascript-news.org/tauri-vs-electron-bundle-size-and-memory-footprint-in-2026) / [PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026) / [vanja.io](https://vanja.io/tauri-2-new-default/) — 包体/内存/安全模型对比。
6. [Bishop Fox — Attacking Alternative Desktop Frameworks](https://bishopfox.com/blog/beyond-electron-attacking-alternative-desktop-application-frameworks) — Tauri 能力制安全的现实局限。
7. [node-pty README](https://github.com/microsoft/node-pty) / [#827](https://github.com/microsoft/node-pty/issues/827) / [PR #901](https://github.com/microsoft/node-pty/pull/901) — resize-after-exit 崩溃、线程不安全、flow control。
8. [wezterm #6946](https://github.com/wezterm/wezterm/issues/6946) / [讨论 #3363](https://github.com/wezterm/wezterm/discussions/3363) — portable-pty Windows cmd 窗、resize 重画。
9. [Rust 论坛 — PTY 读挂死](https://users.rust-lang.org/t/rust-pty-output-hangs-when-trying-to-read-command-output-in-terminal-emulator/102873) — ConPTY 不发 EOF。
10. [Munder Difflin — node-pty in Electron](https://munderdiffl.in/blog/node-pty-electron-real-terminals/) — ABI 重编、PATH、teardown send 守卫、resize、清理。
11. [zigpty](https://github.com/pithings/zigpty) — node-pty 替代，agent idle 检测。
12. [Claude Code headless 官方](https://code.claude.com/docs/en/headless.md) / [amux 指南](https://amux.io/guides/claude-code-headless/) / [engineering-playbook](https://engineering-playbook.vercel.app/claude-code/headless-non-interactive-mode) — `-p`/`--bare`/stream-json、超时/退出码/JSON 校验。
13. [grapeot — CLI agent 自动化指南](https://gist.github.com/grapeot/4271a9782da18b2e746a42e274720f77) — Codex nul byte 崩溃、文件模式、流式 JSON。
14. [Inside the Claude Agent SDK](https://buildwithaws.substack.com/p/inside-the-claude-agent-sdk-from) / [Claudir 架构](https://gist.github.com/nodir-t/6b4b9e227fdc6f3a15be410dd4bcb4b1) — SDK spawn CLI、stdin/stdout JSON、PR_SET_PDEATHSIG。
15. [kangnam-client](https://github.com/kangnam7654/kangnam-client) — Tauri 2 spawn Claude Code/Codex 的蓝图级参考。
16. [存 key in Tauri — dev.to](https://dev.to/hiyoyok/storing-api-keys-safely-in-a-tauri-app-dont-just-use-localstorage-2i71) — keyring crate、绝不 localStorage。
17. [llm-key-ring](https://github.com/yottayoshida/llm-key-ring) + [SECURITY](https://github.com/yottayoshida/llm-key-ring/blob/main/docs/SECURITY.md) / [AIkeychain](https://github.com/aieo-product/AIkeychain) / [zenn 代理方案](https://zenn.dev/otani_ai_memo/articles/aikeychain-secure-api-key-management) — agent 外泄威胁、TTY 守卫、本地代理、诚实划界。
18. [Anthropic Desktop Extensions](https://www.anthropic.com/engineering/desktop-extensions) / [anthropics/mcpb](https://github.com/anthropics/mcpb) + [MANIFEST.md](https://github.com/anthropics/mcpb/blob/main/MANIFEST.md) / [官方 build-mcpb skill](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/mcp-server-dev/skills/build-mcpb/SKILL.md) — .mcpb 规范、sensitive→keychain、签名、Node 推荐。
19. 同类项目：[codeg](https://github.com/0xxb/codeg)、[Nora](https://github.com/Citosoft/nora)、[Phasr](https://phasr.sh/)、[bbarit/terminal](https://github.com/bbarit/terminal)、[Cherry Studio](https://cherry-ai.com/)、[vibeshell](https://github.com/veithly/vibeshell)、[Terminal-64](https://github.com/Pugbread/Terminal-64)、[Tauri_TerminalEmulator](https://github.com/JayarOnde/Tauri_TerminalEmulator)。

## 方法

5 个子问题（Tauri/Electron 取舍、终端嵌入、agent 子进程、BYO key 存储、.mcpb 打包 + 同类项目），经 GitHub 仓库/Issue/PR 搜索 + Exa 语义搜索并行扫掠，得 18+ 主要来源交叉验证。事实与推断分别标注；演进中的规范（.mcpb manifest 版本、Claude Code/Codex 旗标）均提示以官方当前文档为准，符合项目"不做担保"原则。
