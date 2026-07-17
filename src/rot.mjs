// src/rot.mjs —— 规则腐烂监控的纯函数（时效 + 链接聚合）。
// 设计：判定逻辑全部纯函数、把"今天"作为入参注入（不在此用 new Date()），便于确定性单测。
// 这是对项目核心命题"政策会腐烂，唯一能对抗的是架构"的兜底：让过期规则与失效来源可被发现。

const DAY_MS = 86_400_000;

/** 解析 YYYY-MM-DD 为 UTC 零点 Date（两侧统一 UTC，避免时区误差）。 */
export function parseISODate(s) {
  return new Date(`${s}T00:00:00Z`);
}

/** 两个日期相差的整天数（today - fromISO）。today 可为 Date 或 YYYY-MM-DD。 */
export function ageInDays(fromISO, today) {
  const from = parseISODate(fromISO);
  const to = today instanceof Date ? today : parseISODate(today);
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * 计算每条规则的 last_verified 时效。
 * @param {object[]} rules - loadData 返回的规则（带 last_verified / id / _file / draft）
 * @param {{today: Date|string, staleDays?: number}} opts
 * @returns {{id, file, last_verified, ageDays, stale, draft}[]}
 */
export function staleness(rules, { today, staleDays = 180 }) {
  return rules.map((r) => {
    const ageDays = ageInDays(r.last_verified, today);
    // R5（阶段4）：缺失/非法 last_verified 产生 NaN，而 NaN > staleDays === false——
    // 坏日期的规则会被报成"新鲜"，恰好逃过唯一为它设的监控。显性标 invalid 并按 stale 处理。
    // 2026-07-16 审计：未来日期同样不可信——年份手误（如 2027 写成 2026 系列外的一条）会让
    // 规则被报"新鲜"一年以上。容差 -1 天：核验者时区可领先 CI 时区最多一天，不误伤当日核验。
    const invalid = Number.isNaN(ageDays) || ageDays < -1;
    return {
      id: r.id,
      file: r._file || null,
      last_verified: r.last_verified,
      ageDays,
      invalid,
      stale: invalid || ageDays > staleDays,
      draft: !!r.draft,
    };
  });
}

/** 聚合去重的 official_url → 引用它的规则 id 列表（链接体检按 URL 去重，避免重复请求）。 */
export function uniqueUrls(rules) {
  const m = new Map();
  for (const r of rules) {
    if (!r.official_url) continue;
    if (!m.has(r.official_url)) m.set(r.official_url, []);
    m.get(r.official_url).push(r.id);
  }
  return [...m.entries()].map(([url, ids]) => ({ url, ids }));
}

/** 把 HTTP 状态归类：ok=2xx；dead=404/410 或网络错误（确定失效）；inconclusive=其余（如 403/405 反爬）。 */
export function classifyStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410 || status === 0) return "dead";
  return "inconclusive";
}

// 落地页若命中这些模式，说明请求虽然 200，但拿到的不是被引用的正文，而是登录墙/错误页。
// 只匹配登录**墙**，不匹配 URL 里出现的 login 一词：微信自家的 wx.login 文档就住在
// /miniprogram/dev/api/open-api/login/wx.login.html——用 /login\b 会把它误判为不可达，
// 而 rules/login.yaml 恰是最可能引用它的文件（独立复核 P2 指出并实测复现）。
const INACCESSIBLE_PATTERNS = [/[?&]forceLogin=/i, /\/error\/emergency/i, /\/login\/?$/i];

/**
 * 只比较 origin+pathname：查询串与 hash 的差异（如站点自加的 ?from=…）不算搬家。
 * 已知取舍：因此查询串寻址的内容若改变（?id=1 → ?id=999）不会被判 moved。
 * 本仓库 11 个 official_url 全为路径寻址，故该盲区当前不触发；若将来引用查询串寻址的来源，需重议。
 */
function pathKey(u) {
  try {
    const p = new URL(u);
    return p.origin + p.pathname.replace(/\/$/, "");
  } catch {
    return String(u);
  }
}

/**
 * 综合判定 official_url 的健康度——状态码之外，还看**最终落在哪**。
 *
 * 为什么需要它：旧实现用 `redirect: "follow"` + classifyStatus，任意 2xx 一律判 ok。
 * 2026-07-17 审计实测两例必然漏报：
 *   - 社区页 302 → /community/error/emergency?forceLogin=true（强制登录错误页）→ 200 → 判 ok；
 *   - 支付文档 301 → pay.weixin.qq.com/doc/v3/merchant/4012791894（规范地址已变更）→ 200 → 判 ok。
 * 前者意味着用户点开 official_url 根本读不到被引用的原文，后者意味着引用地址已过时——
 * 而「来源可回链」正是本项目信任地基。只测存活不看落地页，这条承诺就是空头支票。
 *
 * @param {{status:number, requestedUrl:string, landedUrl?:string}} o
 * @returns {"ok"|"moved"|"inaccessible"|"dead"|"inconclusive"}
 */
export function classifyUrlHealth({ status, requestedUrl, landedUrl }) {
  const base = classifyStatus(status);
  if (base !== "ok") return base;
  if (!landedUrl) return "ok";
  if (INACCESSIBLE_PATTERNS.some((re) => re.test(landedUrl))) return "inaccessible";
  if (pathKey(landedUrl) !== pathKey(requestedUrl)) return "moved";
  return "ok";
}

/** moved / inaccessible / dead 都要求人处置；inconclusive 不阻断（反爬等噪声）。 */
export function isActionableHealth(kind) {
  return kind === "dead" || kind === "moved" || kind === "inaccessible";
}
