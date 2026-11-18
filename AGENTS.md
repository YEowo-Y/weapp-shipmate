# AGENTS.md

给在本仓库里干活的 agent。只写从代码和配置里查不到的约定；脚本看 `package.json`，规则格式看 `CONTRIBUTING.md`。

## 先读

1. `docs/26-implementation-handoff.md`：当前的工单、分支与 PR 流程（§2）、必须停下问维护者的关口（§3）。
2. `GOVERNANCE.md` 与 `SECURITY.md`：项目的承诺。与它们冲突的改动不会被合并。
3. `docs/25-vertical-agent-shell-plan.md`：方案的理由。动手不需要通读，工单里引用到哪节读哪节。

## 不能做的事

| 不做 | 理由 | 改做 |
|---|---|---|
| 让产品替用户提审、发布、注册、认证、备案 | `GOVERNANCE.md`「不接代办」 | 告诉用户去微信后台做什么 |
| 写「已合规」「保证过审」「可直接提交」 | `GOVERNANCE.md`「不做合规担保」 | 给官方原文、链接、核验日期 |
| 读取、保存或回显 AppSecret、上传密钥、Token | `SECURITY.md` | 只报告「文件 + 键名」 |
| 凭记忆或二手资料写 `source_quote` | `GOVERNANCE.md` 来源核验准则 | 从 `corpus/source-snapshots/` 的快照里逐字复制；核验不到就 `draft: true` |
| 手工编辑自动抓取的快照 | 门禁会校验 sha256 | `npm run snapshot:sources` 重新抓取 |
| 为了让测试变绿去改标注、阈值或判定 | 掩盖真实回归 | 修代码或规则；判断不了就停下报告 |
| 直接 push `main`、squash、rebase、amend、force-push、删分支、复用 tag | `main` 没有分支保护，只能靠约定 | 见 `docs/26` §2 |

## 容易踩的坑

- **两次安装**：`npm ci` 之后还要 `npm ci --prefix desktop`。桌面 server 的测试放在根目录 `tests/`，但从 `desktop/node_modules` 解析依赖。
- **桌面静态与类型检查（T14 后）**：`npm run lint` 已覆盖 `desktop/**/*.{js,mjs,ts,tsx}`（解析器惰性复用 `desktop/node_modules/@babel/parser`，运行前须已执行 `npm ci --prefix desktop`），并禁止正式桌面模块导入 `design-previews`；`npm --prefix desktop run typecheck` 检查三套 `tsconfig`（含 `desktop/src/shared/` 的 `checkJs`、TS/TSX `noImplicitAny` 以及 `desktop/{server,scripts}` 的 `// @ts-check`），已接入 `ci.yml`、`release-rehearsal.yml` 与 `release.yml`。
- **桌面 Vite 打包和 Rust 在 PR 的 `glib-backport` 里跑**，`cargo test` 只在它的 Windows job 里。`tests/desktop-*.test.mjs` 随 `npm test` 在 `validate-rules` 里跑。本机跑 Rust 要 1.94.1：`cargo +1.94.1 test --manifest-path desktop/src-tauri/Cargo.toml --locked`。
- **新增运行时依赖要登记**：`desktop/scripts/prepare-runtime.mjs` 用显式白名单复制依赖，未登记的会抛 `Unreviewed runtime dependency`；`tests/desktop-runtime-package.test.mjs` 钉着目录列表和版本。新增生产依赖本身要维护者批准。
- **运行时复制白名单**：`prepare-runtime.mjs` 从 `bin`、`src`、`desktop/server` 复制 `.mjs`，另显式复制 `src/private-files.json`，从 `rules` 只复制 YAML。往这些目录加别的类型的文件，要同步改复制规则。
- **启动包有预算**：750 kB、gzip 250 kB，现在是 735 kB 和 241 kB，由 `tests/desktop-bundle-budget.test.mjs` 把关。新界面按路由拆分，不要进启动入口。
- **broker 的 stdout 只能有 JSON 行**：`desktop/server/` 里不要用 `console.log`，Rust 端读到非 JSON 行会断开连接。
- **改规则会牵动金快照和夹具钉板**：按 `CONTRIBUTING.md`「改规则的验收协议」裁决。
- **前端**：新组件用 React 加 Base UI 原语，源码放 `desktop/src/components/ui/`，样式只用 `desktop/src/design-system.css` 的 `--ds-*` 令牌。不引入新的组件库，不再新增 Web Awesome 标签。
- **文件名**：根 `.gitignore` 忽略 `secret*`、`.env*`、`*.log`，新文件不要用这些名字。文本文件一律 LF、UTF-8、末尾换行。
- **PowerShell 输出中文**：先执行 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`。

## 交付前

1. 跑 `npm run lint`、`npm test`、`npm run verify:quotes`、`npm run coverage`，四条都要退出码 0。
2. 改动较大时，派一个没有上下文的子代理做代码 review，再交付。
3. 在根目录 `progress.txt` 追加一行：`YYYY-MM-DD HH:mm（北京时间）| 工作概要`。
4. 汇报里写清楚：哪些实际验证过，哪些只是读码推断，哪些没做。
