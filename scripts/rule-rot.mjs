// scripts/rule-rot.mjs —— 规则腐烂监控 CLI（零依赖）。
// 时效检查始终离线运行；链接体检需 --links（联网）。用法：
//   node scripts/rule-rot.mjs              # 仅 last_verified 时效
//   node scripts/rule-rot.mjs --links      # 额外体检 official_url
//   node scripts/rule-rot.mjs --report-only# 永远 exit 0（只报告不报警）
// 环境变量：WEAPP_SHIPMATE_TODAY=YYYY-MM-DD（确定性覆盖今天）、WEAPP_SHIPMATE_STALE_DAYS（默认 180）。
import { loadData } from "../src/data.mjs";
import { staleness, uniqueUrls, classifyStatus } from "../src/rot.mjs";

const args = process.argv.slice(2);
const checkLinks = args.includes("--links");
const reportOnly = args.includes("--report-only");
const staleDays = Number(process.env.WEAPP_SHIPMATE_STALE_DAYS || 180);
const today = process.env.WEAPP_SHIPMATE_TODAY
  ? new Date(`${process.env.WEAPP_SHIPMATE_TODAY}T00:00:00Z`)
  : new Date();
const log = (m) => process.stdout.write(m + "\n");

// 监控覆盖全部规则（含 draft）——draft 也会过期。
const { rules } = loadData({ includeDrafts: true });

// 1) 时效
const st = staleness(rules, { today, staleDays });
const stale = st.filter((s) => s.stale);
log(`# 规则腐烂监控（today=${today.toISOString().slice(0, 10)}，阈值=${staleDays} 天）`);
log(`\n## last_verified 时效：${rules.length} 条规则，${stale.length} 条超期`);
for (const s of [...st].sort((a, b) => b.ageDays - a.ageDays).slice(0, stale.length || 3)) {
  const mark = s.stale ? "⚠ 超期" : "·";
  log(`  ${mark} ${s.id}  ${s.last_verified}  ${s.ageDays} 天${s.draft ? "（draft）" : ""}`);
}

// 2) 链接体检（可选）
let deadLinks = [];
if (checkLinks) {
  const urls = uniqueUrls(rules);
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
