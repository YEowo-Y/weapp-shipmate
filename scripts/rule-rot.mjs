// scripts/rule-rot.mjs —— 规则腐烂监控 CLI（极简依赖，仅 js-yaml）。
// 时效检查始终离线运行；链接体检需 --links（联网）。用法：
//   node scripts/rule-rot.mjs              # 仅 last_verified 时效
//   node scripts/rule-rot.mjs --links      # 额外体检 official_url
//   node scripts/rule-rot.mjs --report-only# 永远 exit 0（只报告不报警）
// 环境变量：WEAPP_SHIPMATE_TODAY=YYYY-MM-DD（确定性覆盖今天）、WEAPP_SHIPMATE_STALE_DAYS（默认 180）。
import { loadData } from "../src/data.mjs";
import { loadSourceReferences } from "../src/source-catalog.mjs";
import { staleness, uniqueUrls, classifyUrlHealth, isActionableHealth } from "../src/rot.mjs";
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
const monitored = loadSourceReferences();

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
      return { status: res.status, landedUrl: res.url };
    } catch (e) {
      return { status: 0, error: e.message };
    } finally {
      clearTimeout(timer);
    }
  }
  for (const { url, ids } of urls) {
    const { status, error, landedUrl } = await check(url);
    const kind = classifyUrlHealth({ status, requestedUrl: url, landedUrl });
    const mark =
      kind === "ok" ? "✓" : kind === "dead" ? "✗ 失效" : kind === "moved" ? "→ 已搬家" : kind === "inaccessible" ? "🔒 不可达" : "? 待人工";
    log(`  ${mark} [${status || error}] ${url}  ←  ${ids.join(", ")}`);
    if (kind === "moved") log(`      落地于 ${landedUrl} —— 引用地址已非规范地址，请更新 official_url。`);
    if (kind === "inaccessible") log(`      落地于 ${landedUrl} —— 用户点开读不到被引用的原文（登录墙/错误页）。`);
    if (isActionableHealth(kind)) deadLinks.push({ url, ids, kind, landedUrl });
  }
}

// 3) 汇总与退出码：超期或确证失效 → 非零（报警）；--report-only 永远 0。
log("");
if (stale.length) log(`⚠ ${stale.length} 条规则 last_verified 超 ${staleDays} 天，请重新核验官方来源并更新。`);
if (deadLinks.length) log(`✗ ${deadLinks.length} 个 official_url 需处置（失效 / 已搬家 / 登录墙不可达），请修复来源。`);
if (!stale.length && !deadLinks.length) log("✓ 未发现超期规则或失效链接。");
if (!reportOnly && (stale.length || deadLinks.length)) process.exitCode = 1;
