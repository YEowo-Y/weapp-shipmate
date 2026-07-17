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
