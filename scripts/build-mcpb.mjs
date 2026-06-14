// scripts/build-mcpb.mjs —— 把零依赖 MCP server 打成 .mcpb Desktop 扩展（P1 轻量分发）。
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
const INCLUDE = ["manifest.json", "package.json", "bin", "src", "schemas", "rules", "flow.yaml"];

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
  if (tools.length !== 2) throw new Error(`冒烟失败：tools=${tools.join(",")}`);
  log(`✓ 冒烟自检通过：server=${server}，tools=${tools.join(", ")}`);
}
await smoke();

// 5) 用官方 mcpb CLI 打包（需要网络拉取 npx 包）。失败则保留暂存目录并给出手动指令。
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(npx, ["--yes", "@anthropic-ai/mcpb", "pack", STAGE, OUT], { stdio: "inherit" });
if (r.status === 0) {
  log(`\n✓ 打包完成：${OUT}`);
  log("  安装：在 Claude Desktop 中双击该 .mcpb，或经扩展设置导入。");
} else {
  log(`\n⚠ mcpb 打包未成功（可能离线或未装）。暂存目录已就绪：${STAGE}`);
  log(`  请联网后手动执行：npx --yes @anthropic-ai/mcpb pack "${STAGE}" "${OUT}"`);
  process.exitCode = 0; // 暂存与自检已完成，不视为致命失败。
}
