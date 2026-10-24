import { createHash } from "node:crypto";

export function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// 零宽字符（ZWSP / ZWNJ / ZWJ / BOM）：微信文档站正文里夹带这些，会让逐字子串匹配莫名落空。
// 用码点集合剔除，而不是把它们当字面量写进正则——字面量既触发 no-irregular-whitespace，
// 也在历次编辑中反复被转义/反转义弄坏（仓库已两次记录该坑）。
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfeff]);

/** 从 VuePress 风格页面 HTML 中提取 <main class="page"> 正文纯文本。 */
export function extractMainText(html) {
  let start = html.indexOf('<main class="page"');
  if (start === -1) start = html.indexOf("<main");
  const end = html.indexOf("</main>", start);
  if (start === -1 || end === -1) return null;
  let body = html.slice(start, end);
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<\/(p|div|li|h[1-6]|tr|table|ul|ol|blockquote|section)>/gi, "\n");
  body = body.replace(/<(br|hr)\s*\/?>/gi, "\n");
  body = body.replace(/<\/(td|th)>/gi, "\t");
  body = body.replace(/<[^>]+>/g, "");
  const ent = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  body = body.replace(/&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g, (m) => {
    if (ent[m]) return ent[m];
    if (m.startsWith("&#x")) return String.fromCodePoint(parseInt(m.slice(3, -1), 16));
    if (m.startsWith("&#")) return String.fromCodePoint(parseInt(m.slice(2, -1), 10));
    return m;
  });
  body = [...body].filter((c) => !ZERO_WIDTH.has(c.codePointAt(0))).join("");
  return body
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, (s) => (s.includes("\t") ? "\t" : " ")).trim())
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}

