// src/source-quotes.mjs —— source_quote 逐字核验的纯函数。
// 设计：判定逻辑全部纯函数、快照内容作为入参注入（不在此读文件或联网），便于确定性单测。
//
// 这是 GOVERNANCE.md「来源核验准则」第 1 条的**执行**：
//   "source_quote 必须是官方页面的逐字原文片段…不得改写、概括、翻译、跨段拼接"
// 该标准此前只写在文档里、无任何代码执行，2026-07-17 审计据此发现三例违例
// （两例跨段拼接、一例末位标点改写），其中一例还曾被代理判为"逐字核验 INTACT"。
// 结论：逐字与否必须由脚本判定，不能由人或代理的印象判定。

// 零宽字符（ZWSP / ZWNJ / ZWJ / BOM）：微信文档站正文里夹带这些。
// snapshot-sources 抓取时已从快照剔除，故引文侧必须同样剔除——否则维护者从官网复制粘贴
// 带进一个 ZWSP，门禁就会对一段实际逐字相同的文本报红，且提示语毫无线索。
// 两侧同等清洗是这条门禁不制造假红的前提。注意 JS 的 \s 覆盖全角空格 U+3000、NBSP U+00A0
// 与 BOM U+FEFF，但**不**覆盖 ZWSP U+200B，故必须显式处理。
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfeff]);

/**
 * 归一化：折叠空白 + 剔除零宽字符，不动标点与字词。
 *
 * 为什么折叠空白：快照正文由 HTML 提取而来，表格单元格会变成 \t、列表项会变成 \n，
 * 而规则作者按人类阅读习惯用空格把同一行的两列接起来（如隐私 API 表的"信息 ↔ 接口"两列）。
 * 这类差异是渲染产物、非改写，属忠实转写，不能误判为违例（2026-07-17 审计实测 6 例）。
 *
 * 为什么不归一化标点：全半角、句号/冒号的差异**正是**要抓的东西。
 * 把它们归一化掉，本门禁就会漏掉它唯一能可靠抓到的那类缺陷。
 */
export function collapseWhitespace(s) {
  return [...String(s)]
    .filter((c) => !ZERO_WIDTH.has(c.codePointAt(0)))
    .join("")
    .replace(/\s+/g, "");
}

/**
 * 单条判定：quote 是否为 snapshot 的连续子串（仅折叠空白后比较）。
 * @returns {"exact"|"whitespace-normalized"|"missing"|"no-snapshot"}
 */
export function classifyQuote(quote, snapshot) {
  if (snapshot == null) return "no-snapshot";
  if (snapshot.includes(quote)) return "exact";
  if (collapseWhitespace(snapshot).includes(collapseWhitespace(quote))) return "whitespace-normalized";
  return "missing";
}

/**
 * 批量核验。
 * @param {{id:string, source_quote:string, official_url:string, draft?:boolean, _file?:string}[]} rules
 * @param {Record<string,string>} snapshotsByUrl - official_url -> 快照正文
 * @param {{includeDrafts?: boolean}} [opts]
 * @returns {{id, file, url, status, draft}[]}
 */
export function verifyQuotes(rules, snapshotsByUrl, { includeDrafts = false } = {}) {
  return rules
    .filter((r) => (includeDrafts ? true : !r.draft))
    .map((r) => ({
      id: r.id,
      file: r._file || null,
      url: r.official_url,
      draft: !!r.draft,
      status: classifyQuote(r.source_quote, snapshotsByUrl[r.official_url]),
    }));
}

/** 通过判据：exact / whitespace-normalized 为过；missing / no-snapshot 为不过。 */
export function isPassing(status) {
  return status === "exact" || status === "whitespace-normalized";
}

/** 汇总为 {total, passed, failures[]}。failures 即需要人工处置的条目。 */
export function summarize(results) {
  const failures = results.filter((r) => !isPassing(r.status));
  return { total: results.length, passed: results.length - failures.length, failures };
}
