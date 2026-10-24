# P4 凭据与 OpenRouter PKCE：发布包核实

## Research / Request Type

实施参考及当前最佳实践研究。检索日期：2026-10-22。范围只限外部文档、已发布 crate 和上游修复证据；本记录不代表依赖采用决定，不声称已完成本仓库集成或真实账号验收。

## Direct Answer

`keyring-core 1.0.1` 与 `windows-native-keyring-store 1.1.0` 均已发布、未撤回，API 可用于 Windows Credential Manager。**1.1.0 发布包没有包含 2026-10-13 合并的多线程/多进程并发修复**。即使仓库 main 版本号仍写 1.1.0，也不能把 main 的行为当作 crates.io 1.1.0 的行为。

若采用已发布包，依赖评审需同时批准运行边界：串行执行全部凭据操作，对同一 Windows 用户下的本应用所有进程协调排他访问；不能仅对单个 entry 加锁。唯一测试命名空间只避免覆盖真实凭据，不消除操作不同凭据时的 Windows 并发问题。即使上游修复也不能约束不遵循相同锁的第三方软件。[上游问题 #20](https://github.com/open-source-cooperative/windows-native-keyring-store/issues/20)、[修复 PR #21](https://github.com/open-source-cooperative/windows-native-keyring-store/pull/21)。

OpenRouter 官方支持浏览器授权 + S256 PKCE + loopback callback，换取的是用户控制的 **API key**。本项目原生端可负责 verifier、state、回调校验、代码交换及入库；WebView 只接收连接标识与状态。这里的“不向 WebView 返回 key”是项目安全边界，并非官方教程的强制架构。[OpenRouter OAuth 文档](https://openrouter.ai/docs/guides/overview/auth/oauth)。

## Official Docs Evidence

### 已发布版本、许可证与兼容条件

| 包 | 精确版本 | 发布时间（UTC） | MSRV / Edition | 许可证 | 可选能力 |
| --- | --- | --- | --- | --- | --- |
| keyring-core | 1.0.1 | 2026-10-13 00:02:42 | Rust 1.85 / 2024 | MIT OR Apache-2.0 | 无默认 feature；sample 是测试用途 |
| windows-native-keyring-store | 1.1.0 | 2026-05-24 20:15:23 | Rust 1.88 / 2024 | MIT OR Apache-2.0 | 默认 search 引入 regex；不搜索时可禁用 |

证据：[core registry metadata](https://crates.io/api/v1/crates/keyring-core)、[Windows registry metadata](https://crates.io/api/v1/crates/windows-native-keyring-store)、[core 发布 manifest](https://docs.rs/crate/keyring-core/1.0.1/source/Cargo.toml.orig)、[Windows 发布 manifest](https://docs.rs/crate/windows-native-keyring-store/1.1.0/source/Cargo.toml.orig)。Windows 包依赖 keyring-core `1`、windows-sys `0.61.2`、byteorder `1`、zeroize `1`。实际采用时须以当前工程工具链、目标平台构建和锁文件解析验证，而非只检查顶层 MSRV。

本次直接从 static.crates.io 下载压缩包到内存，计算 SHA-256 与 registry checksum 比对，未安装依赖、未访问凭据：

| 包 | SHA-256 | 发布包 `.cargo_vcs_info.json` commit |
| --- | --- | --- |
| keyring-core 1.0.1 | `29fbf4b551298c67925f38cf341a1ada797a75f1837bdf8ae1fc8e2ebc6efb59` | `50fe5c44fa3dc46cdf792acfe5116e1e8ebc2e0b` |
| windows-native-keyring-store 1.1.0 | `063426e76fdec7438d56bb777f67e318a84a25c707b07e575cb8b78e10c028f8` | `65bf68219cab395e7b508f57df1aa0899d20face` |

下载来源：[core .crate](https://static.crates.io/crates/keyring-core/keyring-core-1.0.1.crate)、[Windows .crate](https://static.crates.io/crates/windows-native-keyring-store/windows-native-keyring-store-1.1.0.crate)。

### 已发布 API 行为

生命周期是 `Store::new()` → `keyring_core::set_default_store(...)` → `Entry::new` / `Entry::new_with_modifiers` → set/get/delete → 退出时 unset。默认 mock/sample 不能用作生产安全存储。入口创建成功不代表凭据已存在，读取应区分 NoEntry 与平台失败。[core 发布文档](https://docs.rs/crate/keyring-core/1.0.1)、[Windows 1.1.0 文档](https://docs.rs/windows-native-keyring-store/1.1.0/windows_native_keyring_store/)。

Windows 默认 persistence 为 Enterprise；需通过 modifier 明确选择 Local 才符合“仅本机持久保存”的产品文案。默认 target 为 service/user 的拼接，字符串中包含分隔符可能碰撞；固定应用命名空间加受控连接 ID 或显式 target，并始终使用一致的构造规则。禁止无过滤遍历用户全部凭据。[Windows 1.1.0 文档](https://docs.rs/windows-native-keyring-store/1.1.0/windows_native_keyring_store/)。

Windows generic credential 的 blob 上限是 2560 字节。set_password 会使用其字符串编码；不应只按 UTF-8 字符数验长。读取依据当前 token 的登录会话；这是用户级安全存储，不等于只有本应用进程可以读取。[CREDENTIALW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)、[CredReadW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credreadw)。

### OpenRouter 与 native OAuth

- 授权入口为 `https://openrouter.ai/auth`，使用 `callback_url`、`code_challenge`、`code_challenge_method=S256`、随机 `state`。当前官方文档明确 state 会在成功回调中原样返回，但拒绝授权不返回 state。
- 官方允许 localhost/127.0.0.1 的任意端口回调。原生应用绑定 loopback 临时端口，外部系统浏览器授权；不要把授权页嵌入应用 WebView。
- 用 `POST https://openrouter.ai/api/v1/auth/keys`，JSON 发送 `code`、`code_verifier`、`code_challenge_method`，成功读取 `{key}`。该文档没有为此 key 承诺 refresh-token 轮换，不要捏造自动刷新按钮。
- 官方还支持无 callback 的 headless 模式，但当前桌面闭环无需为追新增加第二套授权 UX。

证据：[OpenRouter OAuth](https://openrouter.ai/docs/guides/overview/auth/oauth)、[官方 API 参数页（含 localhost/127.0.0.1）](https://openrouter.ai/docs/client-sdks/python/api-reference/oauth)、[RFC 8252 native apps](https://www.rfc-editor.org/rfc/rfc8252.html)。

PKCE verifier 必须使用加密随机源，每次授权独立，43–128 个允许字符；S256 使用 SHA-256 后 base64url **无 padding**。只在 pending 原生内存保留，取消、过期、失败或消费后清除；不使用文档示例的固定字符串。[RFC 7636 §§4.1–4.2, 7.1](https://www.rfc-editor.org/rfc/rfc7636.html)。

## Source-Reference Evidence

以下均锁定完整 commit，原因是发布包与 main 在并发修复上存在实质差异：

- [`open-source-cooperative/keyring-core@50fe5c44fa3dc46cdf792acfe5116e1e8ebc2e0b:src/lib.rs:L65-L89`](https://github.com/open-source-cooperative/keyring-core/blob/50fe5c44fa3dc46cdf792acfe5116e1e8ebc2e0b/src/lib.rs#L65-L89)：全局 store 生命周期。
- [`open-source-cooperative/keyring-core@50fe5c44fa3dc46cdf792acfe5116e1e8ebc2e0b:src/lib.rs:L130-L165`](https://github.com/open-source-cooperative/keyring-core/blob/50fe5c44fa3dc46cdf792acfe5116e1e8ebc2e0b/src/lib.rs#L130-L165)：Entry 与 modifiers 的实际 API。
- [`open-source-cooperative/windows-native-keyring-store@65bf68219cab395e7b508f57df1aa0899d20face:src/utils.rs:L129-L249`](https://github.com/open-source-cooperative/windows-native-keyring-store/blob/65bf68219cab395e7b508f57df1aa0899d20face/src/utils.rs#L129-L249)：已发布版本直接调用 CredWriteW / CredDeleteW / CredReadW，没有上游后来加入的 CallLock。
- [`open-source-cooperative/windows-native-keyring-store@65bf68219cab395e7b508f57df1aa0899d20face:src/cred.rs:L82-L114`](https://github.com/open-source-cooperative/windows-native-keyring-store/blob/65bf68219cab395e7b508f57df1aa0899d20face/src/cred.rs#L82-L114)：字符串转换、secret 写入及属性读取逻辑。
- [`open-source-cooperative/windows-native-keyring-store@493ecaa5442c3cbd445253ad78b58f54382a9049:src/utils.rs:L132-L235`](https://github.com/open-source-cooperative/windows-native-keyring-store/blob/493ecaa5442c3cbd445253ad78b58f54382a9049/src/utils.rs#L132-L235)：2026-10-13 合并的用户 SID 全局命名 mutex，60 秒等待上限及 abandoned-owner 处理。**该 commit 不在当前 1.1.0 registry 包内**。

## Caveats / Ambiguity Flags

1. 发布文档只提醒同 entry 多线程问题；较新的上游 issue 提供不同 entry、多进程也受影响的测量。以上不是我们复现所得，不把上游报告写成项目测试结果。
2. 只在某个 app identifier 的数据目录放锁，不能协调另一个测试/安装 identifier；若同用户同时跑测试与正式应用，需共享协调范围或确保不并行。锁必须覆盖完整读改写操作，而非只覆盖构造 Entry。
3. 应用自己的串行队列/锁并不能提供对所有第三方 Windows 软件的强保证。上游未发布修复的 Git pin、vendor 或额外锁库属于采用决策，交给 dependency-expert/项目负责人审议，研究阶段不安装或实现。
4. 改换另一个直接包装同样 Win32 Credential Manager 的库，并不能仅凭换包名证明规避平台并发问题。本次没有找到可直接声称解决该问题的已发布替代依据，不提出未经验证的替换。
5. OpenRouter 教程包含浏览器交换 key 的例子；把该例子复制为 WebView 返回明文 key 会违反本项目目标。原生闭环是本项目的实现约束。
6. 官方页面是滚动文档；已确认 state 与 loopback 当前受支持，不把老截图或缓存摘要作为相反证据。未运行用户真实授权、未确认账号权限/额度，不能声称线上 OAuth 验收通过。

## Reusable Takeaway / 接口交接（建议，非已实现）

- 主进程接收用户主动输入的 key 后，直接写系统凭据；配置只存 provider/base URL/model/credential reference。写入失败时保留旧连接，明确报错，不静默落盘明文。
- OAuth begin 返回授权地址与 opaque attempt ID；poll/finish 只返回连接状态和非敏感 metadata。原生监听回调，校验 loopback host/path、唯一 attempt、state、期限，交换后先存储再宣布成功。取消后迟到回调不得创建连接。
- native chat/连接检测通过 credential reference 在可信端取 key；没有通用 `getSecret` IPC。渲染层、日志、导出、会话记录均不接受秘密字段。
- 删除连接的本地凭据删除与 OpenRouter 远端 key 撤销是不同动作，界面应说明实际完成哪一项；禁止假报远端已撤销。
- 验收至少覆盖真实系统库保存/重启读取/删除、找不到凭据与权限失败、超长秘密拒绝、写入失败保持旧连接、同应用并发协调、唯一测试命名空间、拒绝/超时/重复/取消后的回调、配置导出与日志无密钥。实际代码路径和 IPC 命名由实现负责人映射。

## Version Note / Supporting Examples / OSS / Supplemental

版本和发布日期以本次 registry API 与校验后的发布包为准；docs.rs latest 搜索摘要存在 1.0.0/1.0.1 缓存差异，已避免使用 latest 作版本证据。只用了上游源码、官方平台文档与 RFC；无第三方材料作为技术结论依据。示例只用于 API 说明，未执行任何真实凭据或账号操作。

## 补充核实：旧版 keyring 3.x 与固定修复 commit

应负责人要求，进一步下载核实 keyring 的最新未撤回 3.x 发布包 **3.6.3**（不是当前总版本最新；总版本为 4.2.0）。3.6.3 于 2025-07-27 发布，MSRV 1.75，Edition 2021，MIT OR Apache-2.0；启用 `windows-native` 使用 windows-sys 0.60。包 checksum 为 `eebcc3aff044e5944a8fbaf69eb277d11986064cba30c468730e8b9909fb551c`，VCS commit 为 `315cbdf6c6a9153d8c9f88b56568f29862d3e39d`。[registry metadata](https://crates.io/api/v1/crates/keyring)、[发布包](https://static.crates.io/crates/keyring/keyring-3.6.3.crate)。

该已发布 Windows 实现也没有 Credential Manager 跨进程锁，不能因为历史更久就当作 #20 的修复替代。证据：[`open-source-cooperative/keyring-rs@315cbdf6c6a9153d8c9f88b56568f29862d3e39d:src/windows.rs:L24-L40`](https://github.com/open-source-cooperative/keyring-rs/blob/315cbdf6c6a9153d8c9f88b56568f29862d3e39d/src/windows.rs#L24-L40) 的警告，以及 [L260-L324 的直接写读调用](https://github.com/open-source-cooperative/keyring-rs/blob/315cbdf6c6a9153d8c9f88b56568f29862d3e39d/src/windows.rs#L260-L324)。

**可供依赖负责人审议的精确修复候选**：keyring-core `=1.0.1` + windows-native-keyring-store Git `rev=493ecaa5442c3cbd445253ad78b58f54382a9049`，`default-features=false`。它是已合并上游修复，沿用前述 Store/Entry API、许可证及 MSRV，新增 windows-sys 的 Win32_System_Threading feature。此处给的是可复查候选坐标，未安装、未编译、未批准采用，也没有把它描述为已发布版本。若项目标准必须包含 #20 修复，已检查的 registry 1.1.0 与 keyring 3.6.3 均不满足。

固定修复仍有边界：上游 [PR #36](https://github.com/open-source-cooperative/windows-native-keyring-store/pull/36) 尚未合并，拟把调用锁放入仅本用户可创建的 private namespace；不能声称当前 Global named mutex 已解决其他用户抢占锁名称的拒绝服务风险。[PR #44](https://github.com/open-source-cooperative/windows-native-keyring-store/pull/44) 尚未合并，拟收紧 crate 内部函数公开范围。不得在本项目直接调用接受原始 Win32 指针的底层 utils，使用 Entry 表面。真实原生测试与审计依旧必要。

术语区分：#20 的已核实报告是 **持久凭据更新丢失**，不是已证实的 Rust 内存破坏漏洞；本次没有收到实际内存破坏复现。若后续测试出现堆损坏或新的源代码证据，应立即停止把上述固定点视为充分修复，并重新评估。
