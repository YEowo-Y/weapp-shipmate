# Research: Windows Tauri 2 原生端到端验收

## Request Type

Current best-practice research / implementation reference。检索与只读本机核实日期：2026-10-18。未安装工具、未启动应用、未执行端到端测试；本文不是验收通过记录。

## Direct Answer

Tauri 官方仍支持直接运行 `tauri-driver`，由它启动 Microsoft Edge WebDriver 并连接真实 Windows WebView2 应用。可以接入现有 Node 测试脚本，通过标准 WebDriver HTTP 请求执行测试，无须为此改生产 Rust 插件或叠加 Selenium、WebdriverIO 测试框架。是否采用此最小 harness 由实施负责人决定。[官方手动配置](https://v2.tauri.app/develop/tests/webdriver/manual-setup/)

当前官方默认推荐已变成 `@wdio/tauri-service`，默认 embedded provider 需要相应 Rust 插件；不要把旧文章中的“只能 Windows/Linux”误写为整个当前生态的限制。直接 `tauri-driver` 路线仍是 Windows/Linux。[官方总览](https://v2.tauri.app/develop/tests/webdriver/)

## Version Note / 本机只读检查

| 项目 | 2026-10-18 结果 |
| --- | --- |
| OS | Windows 11 Home 64-bit，10.0.26200 |
| Cargo / Rust | 1.94.1 / 1.94.1 |
| 仓库 Cargo.lock | tauri 2.11.3、tauri-build 2.6.3、tauri-runtime-wry 2.11.3、wry 0.55.1 |
| WebView2 Runtime 注册表 | 155.0.4283.62 |
| Edge 浏览器注册表 | 155.0.4283.45 |
| tauri-driver / msedgedriver | PATH 未找到；默认 cargo/bin 未找到 tauri-driver.exe；未扫描全磁盘 |
| 当前稳定 tauri-driver | 2.1.0，2026-09-26 发布；Rust 最低 1.90 |
| 不选用的预发布 | crates.io 同时有 3.0.0-alpha.1，不能把它当稳定版 |
| 现存 desktop.exe | target/debug/desktop.exe 存在，时间为 2026-06-21，不能作为当前代码验收 |

Cargo.lock 与 tauri.conf.json 为此次明确要求的只读环境检查，不据此推断业务实现。配置当前单窗口、1000×720，构建输出 ../dist，开发 URL localhost:1420。

稳定版本/许可证通过 [crates.io API](https://crates.io/api/v1/crates/tauri-driver) 与下方固定提交核对。驱动版本独立于 Tauri 应用版本；官方 CI 文档对此有明确注释。[Tauri CI](https://v2.tauri.app/develop/tests/webdriver/ci/)

## Official Docs Evidence

- [Microsoft WebView2 automation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver) — 驱动必须匹配应用使用的 WebView2 runtime；支持驱动直接启动单 WebView2 应用，也支持附加已有实例。该页示例为 Selenium/C#，同时明确任何支持 WebDriver 的语言和框架均可。
- [Microsoft Edge WebDriver 下载](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/) — 此次页面 stable 155.0.4283.62，与本机 WebView2 一致；不要仅按较旧 Edge 浏览器版本选择。
- [Edge WebDriver license terms](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/eula) — 微软专有许可，可安装使用；不能作为项目开源依赖再分发驱动压缩包/二进制。安装脚本应从微软下载并保留其 notices。
- [WebDriver 协议](https://www.w3.org/TR/webdriver/) — session、element 查找/点击/输入、refresh、window rect、screenshot、删除 session 都有标准 HTTP 端点。检索时最新文本为 2026-07-02 Working Draft；上述基础命令为既有协议，新增条目仍须以驱动实测为准。
- [WebView2 user data folders](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder) — 浏览数据保存在用户数据目录；测试必须与真实用户数据隔离，重新启动测试时复用同一测试目录才可验证跨进程持久化。

## Supporting Examples / 待实施命令

下面是交给实施者的示例，尚未执行安装或启动。先构建当前源码，再验证驱动版本与本机 runtime，保存日志和截图。

```powershell
cargo install tauri-driver --version 2.1.0 --locked
npm --prefix desktop run tauri -- build --debug --no-bundle
```

微软官方下载地址（此次仅 HEAD 请求，HTTP 200，Content-Length 11715108）：

`https://msedgedriver.microsoft.com/155.0.4283.62/edgedriver_win64.zip`

安装到不提交的工具目录，保留许可证。启动模板：

```powershell
tauri-driver --port 4444 --native-port 4445 --native-driver "C:\absolute\test-tools\msedgedriver.exe"
```

标准 `POST http://127.0.0.1:4444/session` 请求示例：

```json
{
  "capabilities": {
    "alwaysMatch": {
      "tauri:options": {
        "application": "C:\\Dev\\Projects\\weapp-shipmate\\desktop\\src-tauri\\target\\debug\\desktop.exe"
      }
    }
  }
}
```

实际 harness 应有限时等待并在 finally 删除 session、终止自己启动的驱动/子进程。持久化验收应包含：新会话输入、发送、逐步观察流式内容、停止后内容不继续增加、写草稿、退出整个 app、复用测试 profile 重启、历史搜索定位、模型连接失败后恢复。协议假服务用于可重复错误/停止测试时必须明确标记；它不能证明真实模型厂商已联网成功。

## Source-Reference Evidence

官方文档未详述 capability 转换、自动化环境变量、最低 Rust 版本，因此补读固定提交：

- `tauri-apps/tauri@726822c3d8afd38f87aff244200e64f5cb9513b5:crates/tauri-driver/Cargo.toml:L1-L11` — [2.1.0、Apache-2.0 OR MIT、Rust 1.90](https://github.com/tauri-apps/tauri/blob/726822c3d8afd38f87aff244200e64f5cb9513b5/crates/tauri-driver/Cargo.toml#L1-L11)。
- `tauri-apps/tauri@726822c3d8afd38f87aff244200e64f5cb9513b5:crates/tauri-driver/src/server.rs:L27-L68` — [application/args/webviewOptions 转换为 WebView2 capability](https://github.com/tauri-apps/tauri/blob/726822c3d8afd38f87aff244200e64f5cb9513b5/crates/tauri-driver/src/server.rs#L27-L68)。
- `tauri-apps/tauri@726822c3d8afd38f87aff244200e64f5cb9513b5:crates/tauri-driver/src/webdriver.rs:L15-L58` — [native-driver 选项、TAURI_WEBVIEW_AUTOMATION 与本机驱动启动](https://github.com/tauri-apps/tauri/blob/726822c3d8afd38f87aff244200e64f5cb9513b5/crates/tauri-driver/src/webdriver.rs#L15-L58)。

## Caveats / Ambiguity Flags

- WebDriver 操作的是原生进程内 WebView2，不覆盖 Windows 文件选择器、系统托盘等原生控件；这些不能由本轮 WebView 自动化结果推断通过。
- 没有实测窗口启动前，不能承诺当前运行环境允许成功打开 WebView2 或连接驱动。工具缺失目前属于待安装项，不是已确认不可行。
- 当前会话 CUA 原生控制不可用；独立、可复现的仓库测试 harness 与人工 CUA 验收须分开记录，不能把普通浏览器 fixture 冒称原生通过。
- 应用配置有 `csp: null`；这是现状而非建议，不应为了 E2E 继续扩大权限。

## Reusable Takeaway

本机具备 Rust 和 WebView2，缺两项驱动。官方 Windows 原生路径可用作实施依据：固定稳定 tauri-driver 2.1.0、匹配 WebView2 的 Edge Driver 155.0.4283.62、当前源码构建 exe、隔离测试 profile、标准 WebDriver 黑盒断言与截图。安装、应用实现、测试运行及交付判断交由执行/验证负责人；本调研未宣称任何端到端验收通过。
