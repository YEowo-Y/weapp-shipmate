// scripts/build-mcpb.mjs —— 把极简依赖 MCP server 打成 .mcpb Desktop 扩展（P1 轻量分发）。
// 零运行时依赖；只用 node 内置模块。流程：版本校验 → 暂存纯生产副本 → 冒烟自检 → mcpb pack。
// 设计要点：暂存目录是独立副本，绝不触碰开发用 node_modules（保留 ajv 等 devDeps 供 npm test）。
import { readFileSync, rmSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = join(ROOT, "build", "mcpb-stage");
const OUT = join(ROOT, "build", "weapp-shipmate.mcpb");
const log = (m) => process.stdout.write(m + "\n");

// 随服务端运行所需、与 package.json `files` 清单一致的内容（manifest + 入口 + 规则数据）。
// rejections.yaml 是 explain（CLI 第三命令 / MCP 第三工具）的拒因库，漏掉则装包后 ENOENT。
const INCLUDE = ["manifest.json", "package.json", "bin", "src", "schemas", "rules", "flow.yaml", "rejections.yaml"];

function readJSON(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}

// 1) 版本一致性：manifest.version 必须等于 package.json.version，杜绝静默漂移。
const pkg = readJSON(join(ROOT, "package.json"));
const manifest = readJSON(join(ROOT, "manifest.json"));
if (manifest.version !== pkg.version) {
  throw new Error(`版本漂移：manifest.json=${manifest.version} 与 package.json=${pkg.version} 不一致。请同步后再打包。`);
}
log(`✓ 版本一致：${pkg.version}`);

// 2) 暂存纯生产副本。
rmSync(join(ROOT, "build"), { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
for (const item of INCLUDE) {
  const src = join(ROOT, item);
  if (!existsSync(src)) throw new Error(`缺少待打包内容：${item}`);
  cpSync(src, join(STAGE, item), { recursive: true });
}
log(`✓ 已暂存内容：${INCLUDE.join(", ")}`);

// 3) 只复制生产依赖闭包（从 dependencies 出发递归），不带 devDependencies。
const nmSrc = join(ROOT, "node_modules");
const nmDst = join(STAGE, "node_modules");
const copied = new Set();
function copyDepClosure(name) {
  if (copied.has(name)) return;
  const depDir = join(nmSrc, name);
  const depPkgPath = join(depDir, "package.json");
  if (!existsSync(depPkgPath)) throw new Error(`未找到生产依赖 ${name}（请先 npm install）`);
  cpSync(depDir, join(nmDst, name), { recursive: true });
  copied.add(name);
  const depPkg = readJSON(depPkgPath);
  for (const child of Object.keys(depPkg.dependencies || {})) copyDepClosure(child);
}
for (const dep of Object.keys(pkg.dependencies || {})) copyDepClosure(dep);
log(`✓ 已捆绑生产依赖闭包：${[...copied].join(", ") || "（无）"}`);

// 4) 冒烟自检：用暂存副本启动 server，跑 initialize + tools/list 往返。
async function smoke() {
  const child = spawn(process.execPath, [join(STAGE, "bin", "weapp-shipmate-mcp.mjs")], { cwd: STAGE });
  let out = "";
  const seen = {};
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("冒烟自检超时（5s）")), 5000);
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (d) => {
      out += d;
      let i;
      while ((i = out.indexOf("\n")) >= 0) {
        const line = out.slice(0, i).trim();
        out = out.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        seen[msg.id] = msg;
        if (seen[1] && seen[2]) {
          clearTimeout(timer);
          child.kill();
          resolve(seen);
        }
      }
    });
    child.on("error", reject);
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
  const res = await done;
  const server = res[1]?.result?.serverInfo?.name;
  const tools = res[2]?.result?.tools?.map((t) => t.name) || [];
  if (server !== "weapp-shipmate") throw new Error(`冒烟失败：serverInfo.name=${server}`);
  const expected = ["weapp_shipmate_check", "weapp_shipmate_guide", "weapp_shipmate_explain"];
  if (!expected.every((t) => tools.includes(t))) throw new Error(`冒烟失败：tools=${tools.join(",")}`);
  log(`✓ 冒烟自检通过：server=${server}，tools=${tools.join(", ")}`);
}
await smoke();

// CI/快速模式：只验"暂存 + 冒烟"（防分发回归的核心），跳过需联网的打包/签名。
if (process.env.WEAPP_SHIPMATE_NO_PACK === "1") {
  log("· 跳过打包/签名（WEAPP_SHIPMATE_NO_PACK=1）；暂存与冒烟自检已完成。");
  process.exit(0);
}

// 5) 用官方 mcpb CLI 打包（需要网络拉取 npx 包）。失败则保留暂存目录并给出手动指令。
// 经 shell 调 npx：兼容 Windows 的 .cmd 解析；参数加引号以容纳含空格的路径。
// E4：锁定精确版本——`--yes` 不锁版会让最终分发物由"打包当刻 npm 恰好返回的版本"决定，
// 供应链上游破坏/破坏性变更会静默进入用户双击安装的 .mcpb。升级须显式改这里并走一次完整发布演练。
const MCPB_VERSION = "2.1.2";
const mcpb = (args) =>
  spawnSync(`npx --yes @anthropic-ai/mcpb@${MCPB_VERSION} ${args.map((a) => `"${a}"`).join(" ")}`, {
    stdio: "inherit",
    cwd: ROOT,
    shell: true,
  });
const packed = mcpb(["pack", STAGE, OUT]);
if (packed.status !== 0) {
  log(`\n⚠ mcpb 打包未成功（可能离线或未装）。暂存目录已就绪：${STAGE}`);
  log(`  请联网后手动执行：npx --yes @anthropic-ai/mcpb@${MCPB_VERSION} pack "${STAGE}" "${OUT}"`);
  // 发布上下文（release.yml 设 WEAPP_SHIPMATE_REQUIRE_PACK=1）：打包失败必须在此致命退出，
  // 让错误指向真正的源头——否则退 0，后续 sha256sum 才因缺文件报错，诊断偏移一步（阶段5复核 NOTE）。
  // 本地手动/CI 冒烟（默认，且 NO_PACK 已提前 return）保持非致命：暂存与自检已完成即达目的。
  if (process.env.WEAPP_SHIPMATE_REQUIRE_PACK === "1") process.exit(1);
  process.exitCode = 0;
} else {
  log(`\n✓ 打包完成：${OUT}`);

  // 6) 签名（分发可信，按需开启）。注意：`mcpb verify` 不接受外部证书，只能信任系统链，
  //    所以自签名永远过不了 verify——故区分两路，且都不把 verify 失败当致命。
  const cert = process.env.WEAPP_SHIPMATE_SIGN_CERT;
  const key = process.env.WEAPP_SHIPMATE_SIGN_KEY;
  if (cert && key) {
    // 正式分发：受信证书 → 签名并校验（verify 此时有意义）。
    log("· 用受信证书签名…");
    const signed = mcpb(["sign", OUT, "-c", cert, "-k", key]);
    const verified = signed.status === 0 ? mcpb(["verify", OUT]) : { status: 1 };
    log(verified.status === 0 ? "✓ 签名并校验通过。" : "⚠ 签名或校验未通过，请检查证书与链。");
  } else if (process.env.WEAPP_SHIPMATE_SELF_SIGN === "1") {
    // 内部/TOFU：自签名密钥写进 build/（已 gitignore），绝不入库。
    const devCert = join(ROOT, "build", "self-signed-cert.pem");
    const devKey = join(ROOT, "build", "self-signed-key.pem");
    log("· 自签名（TOFU）…");
    const signed = mcpb(["sign", OUT, "--self-signed", "-c", devCert, "-k", devKey]);
    log(
      signed.status === 0
        ? "✓ 已自签名。注意：自签名证书不在系统信任链，`mcpb verify` 不会判为可信，仅供内部/TOFU 分发。"
        : "⚠ 自签名未成功。",
    );
  } else {
    log("· 未签名（默认，安装包仍是合法 zip）。正式分发设 WEAPP_SHIPMATE_SIGN_CERT/KEY；内部分发设 WEAPP_SHIPMATE_SELF_SIGN=1。");
  }
  log("  安装：在 Claude Desktop 中双击该 .mcpb，或经扩展设置导入。");
}
