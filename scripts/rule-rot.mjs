// scripts/rule-rot.mjs —— 规则腐烂监控 CLI（极简依赖，仅 js-yaml）。
// 时效检查始终离线运行；链接体检需 --links（联网）。用法：
//   node scripts/rule-rot.mjs              # 仅 last_verified 时效
//   node scripts/rule-rot.mjs --links      # 额外体检 official_url
//   node scripts/rule-rot.mjs --report-only# 永远 exit 0（只报告不报警）
// 环境变量：WEAPP_SHIPMATE_TODAY=YYYY-MM-DD（确定性覆盖今天）、WEAPP_SHIPMATE_STALE_DAYS（默认 180）。
import { loadData } from "../src/data.mjs";
import { crossChecks } from "../src/crosscheck.mjs";
import { staleness, uniqueUrls, classifyStatus } from "../src/rot.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// R5：三类载体此前逃逸监控——crosscheck 的 5 条内联规则、flow 阶段、rejections 条目
// 都带 last_verified/official_url，却只有 rules/*.yaml 被盯。项目核心命题是"政策会腐烂，
// 监控对抗腐烂"，逃逸即命题失效。
// 内联规则用"全命中合成 scan"现场收割元数据（与 tests/crosscheck.test 的聚合器锁同一手法，零重复维护）。
function crosscheckItems() {
  const ALL_HIT_SCAN = {
    apis: ["wx.getLocation"],
    configKeys: [],
    domains: ["api.weixin.qq.com", "203.0.113.7"],
    secretHints: [{ file: "a.js", key: "appsecret" }],
    insecureHosts: ["insecure.example.com"],
  };
  return crossChecks(ALL_HIT_SCAN).map((r) => ({
    id: r.ruleId,
    _file: "src/crosscheck.mjs",
    last_verified: r.last_verified,
    official_url: r.official_url,
  }));
}

function flowAndRejectionItems() {
  const flow = yaml.load(readFileSync(join(ROOT, "flow.yaml"), "utf-8"));
  const rejections = yaml.load(readFileSync(join(ROOT, "rejections.yaml"), "utf-8"));
  return [
    ...(flow.stages ?? []).map((s) => ({
      id: `flow:${s.stage}`, _file: "flow.yaml", last_verified: s.last_verified, official_url: s.official_url,
    })),
    ...(rejections.rejections ?? []).map((rj) => ({
      id: `rejections:${rj.id}`, _file: "rejections.yaml", last_verified: rj.last_verified, official_url: rj.official_url, draft: rj.draft,
    })),
  ];
}

const args = process.argv.slice(2);
const checkLinks = args.includes("--links");
const reportOnly = args.includes("--report-only");
const staleDays = Number(process.env.WEAPP_SHIPMATE_STALE_DAYS || 180);
const today = process.env.WEAPP_SHIPMATE_TODAY
  ? new Date(`${process.env.WEAPP_SHIPMATE_TODAY}T00:00:00Z`)
  : new Date();
const log = (m) => process.stdout.write(m + "\n");

// 监控覆盖全部规则（含 draft）——draft 也会过期；R5 起并入 crosscheck 内联规则 + flow 阶段 + rejections 条目。
const { rules } = loadData({ includeDrafts: true });
const monitored = [...rules, ...crosscheckItems(), ...flowAndRejectionItems()];

// 1) 时效
const st = staleness(monitored, { today, staleDays });
const stale = st.filter((s) => s.stale);
log(`# 规则腐烂监控（today=${today.toISOString().slice(0, 10)}，阈值=${staleDays} 天）`);
log(`\n## last_verified 时效：${monitored.length} 个载体（${rules.length} 规则 + 交叉核验/flow/rejections），${stale.length} 个超期`);
for (const s of [...st].sort((a, b) => b.ageDays - a.ageDays).slice(0, stale.length || 3)) {
  const mark = s.stale ? "⚠ 超期" : "·";
  log(`  ${mark} ${s.id}  ${s.last_verified}  ${s.ageDays} 天${s.draft ? "（draft）" : ""}`);
}

// 2) 链接体检（可选）
let deadLinks = [];
if (checkLinks) {
  const urls = uniqueUrls(monitored);
  log(`\n## official_url 体检：${urls.length} 个去重链接`);
  async function check(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ac.signal });
      // 部分服务器不支持 HEAD（405）或反爬（403），回退 GET 再判一次。
      if (res.status === 405 || res.status === 403) {
        res = await fetch(url, { method: "GET", redirect: "follow", signal: ac.signal });
      }
      return { status: res.status };
    } catch (e) {
      return { status: 0, error: e.message };
    } finally {
      clearTimeout(timer);
    }
  }
  for (const { url, ids } of urls) {
    const { status, error } = await check(url);
    const kind = classifyStatus(status);
    const mark = kind === "ok" ? "✓" : kind === "dead" ? "✗ 失效" : "? 待人工";
    log(`  ${mark} [${status || error}] ${url}  ←  ${ids.join(", ")}`);
    if (kind === "dead") deadLinks.push({ url, ids });
  }
}

// 3) 汇总与退出码：超期或确证失效 → 非零（报警）；--report-only 永远 0。
log("");
if (stale.length) log(`⚠ ${stale.length} 条规则 last_verified 超 ${staleDays} 天，请重新核验官方来源并更新。`);
if (deadLinks.length) log(`✗ ${deadLinks.length} 个 official_url 确证失效（404/410/网络错误），请修复来源。`);
if (!stale.length && !deadLinks.length) log("✓ 未发现超期规则或失效链接。");
if (!reportOnly && (stale.length || deadLinks.length)) process.exitCode = 1;
