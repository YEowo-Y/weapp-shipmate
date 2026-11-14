// src/explain.mjs —— 拒因反查引擎：审核反馈/错误码 → 已核验规则（同一份规则库的第四个渲染器）
// 不新增官方断言：把用户看到的拒审信号反向索引到 rules/*.yaml 已核验规则，复用其 why/requires/来源。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { loadData, ruleToItem } from "./data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 读取拒因索引（默认排除 draft 映射，与规则库同一套门禁）。 */
export function loadRejections({ includeDrafts = false, root = ROOT } = {}) {
  const doc = yaml.load(readFileSync(join(root, "rejections.yaml"), "utf-8"));
  return doc.rejections.filter((r) => includeDrafts || !r.draft);
}

/**
 * 给一条拒因条目按查询打分：错误码精确命中权重最高，其次别名子串双向命中。
 * 中文按子串匹配，无需分词；alias 命中 query 或 query 命中 alias 皆算（兼顾"贴整段反馈"与"敲单个词"）。
 */
function matchRejection(entry, query) {
  const q = String(query || "").trim().toLowerCase();
  const evidence = { aliases: [], codes: [], partialAliases: [] };
  if (!q) return { score: 0, evidence, relevance: "possible" };
  for (const code of entry.codes || [])
    if (q.includes(String(code).toLowerCase())) evidence.codes.push(code);
  for (const alias of entry.aliases || []) {
    const a = alias.toLowerCase();
    if (q.includes(a)) evidence.aliases.push(alias);
    else if (a.includes(q)) evidence.partialAliases.push(alias);
  }
  // 一对多索引或短词扩展只能给候选；直接相关也仅指文本相关，不证明项目违规。
  const relevance = entry.rules?.length === 1 && (evidence.codes.length || evidence.aliases.length)
    ? "direct" : "possible";
  const score = evidence.codes.length * 100 + evidence.aliases.length + evidence.partialAliases.length;
  return { score, evidence, relevance };
}

export function scoreRejection(entry, query) {
  return matchRejection(entry, query).score;
}

/**
 * 拒因反查：把查询映射到命中的拒因条目，再解析出每条背后已核验的规则项。
 * @param {string} query 错误码或审核反馈关键词/整段文案
 * @param {{includeDrafts?:boolean}} opts
 * @returns {{command:string, meta:object, items:object[], notes:string[]}}
 */
export function runExplain(query, { includeDrafts = false } = {}) {
  const entries = loadRejections({ includeDrafts });
  const { rules } = loadData({ includeDrafts: true }); // 链接解析允许命中 draft 规则（draft 门禁在 rejections 层把关）
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const matched = entries
    .map((e) => ({ entry: e, ...matchRejection(e, query) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => Number(b.relevance === "direct") - Number(a.relevance === "direct") || b.score - a.score);

  const items = [];
  const missingLinks = [];
  for (const { entry, relevance, evidence } of matched) {
    for (const rid of entry.rules) {
      const rule = ruleById.get(rid);
      if (!rule) { missingLinks.push(`${entry.id}→${rid}`); continue; }
      const item = ruleToItem(rule);
      item.rejectId = entry.id; // 供 explain 渲染器按拒因分组
      item.rejectSummary = entry.summary;
      item.relevance = relevance;
      item.matchEvidence = evidence;
      items.push(item);
    }
  }

  const notes = [];
  if (!matched.length) {
    notes.push(
      "未匹配到已收录的拒审原因。可改用审核反馈里的关键词重试（如「诱导分享」「营销」「测试号」「隐私」「资质」），或提 issue 补充该拒因。",
    );
  }
  if (missingLinks.length) notes.push(`内部告警：拒因引用了不存在的规则 id（${missingLinks.join("、")}），请修 rejections.yaml。`);
  if (includeDrafts) notes.push("已包含 draft 映射（未充分复核，仅供参考）。");

  const summary = matched.length
    ? `为「${query}」匹配到 ${matched.length} 条相关拒审原因，对应 ${items.length} 条已核验规则。`
    : `为「${query}」未匹配到已收录拒审原因。`;
  return { command: "explain", meta: { summary, query }, items, notes };
}
