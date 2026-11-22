// scripts/coverage.mjs —— 覆盖率红线度量（docs/08 §15.4）。
// 红线：覆盖率与 precision 必须同速增长。每批新增规则报「覆盖数 / 逐字核验数 / precision」三数。
// 逐字核验跟不上覆盖、或 precision 下滑，即视为红线告警（退出码 1）——防"规则即数据"退化成 AI slop。
// 以官方实时文档为准：每条默认规则必带 official_url + source_quote + last_verified（schema 强制，本脚本显式盯）。
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadData } from "../src/data.mjs";
import { CROSSCHECK_RULE_IDS } from "../src/crosscheck.mjs";
import { loadLabels, computeAccuracy, PRECISION_MIN } from "./accuracy.mjs";

const BACKLOG_TOTAL = 72; // docs/08 §15.1：去重后官方上线/合规要求条目数（覆盖的分母）。
const STAGES = ["registration", "certification", "filing", "category", "privacy", "domain", "review", "release"];
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

export function computeCoverage({ labels, subjectDefault } = loadLabels()) {
  const def = loadData({}).rules; // 默认集（非 draft）
  const all = loadData({ includeDrafts: true }).rules;
  const verbatim = def.filter((r) => r.official_url && r.source_quote && r.last_verified).length;
  const byStage = {};
  for (const r of def) byStage[r.stage] = (byStage[r.stage] || 0) + 1;
  const lv = def.map((r) => r.last_verified).filter(Boolean).sort();
  const { global } = computeAccuracy(labels, { subjectDefault });
  const checkRuleIds = new Set([
    ...def.filter(rule => rule.kind === "preflight" || rule.kind === "both").map(rule => rule.id),
    ...CROSSCHECK_RULE_IDS,
  ]);
  const hits = new Set();
  const noHits = new Set();
  for (const { ruleId, expect } of labels) {
    if (!checkRuleIds.has(ruleId)) continue;
    if (expect === "hit") hits.add(ruleId);
    if (expect === "no_hit") noHits.add(ruleId);
  }
  return {
    rules: def.length,
    drafts: all.length - def.length,
    crosscheck: CROSSCHECK_RULE_IDS.length,
    anchored: new Set([...hits, ...noHits]).size,
    checkRules: checkRuleIds.size,
    paired: [...hits].filter(id => noHits.has(id)).length,
    navigationRules: def.length + CROSSCHECK_RULE_IDS.length - checkRuleIds.size,
    labelCount: labels.length,
    verbatim,
    precision: global.precision,
    recall: global.recall,
    matrix: { tp: global.tp, fp: global.fp, fn: global.fn },
    byStage,
    freshness: { earliest: lv[0], latest: lv[lv.length - 1] },
  };
}

function main() {
  const c = computeCoverage();
  console.log("覆盖率红线（docs/08 §15.4：覆盖与 precision 同速增长）\n");
  console.log("三数：");
  console.log(`  规则库：${c.rules} 条默认数据规则 + ${c.crosscheck} 项交叉核验 | draft ${c.drafts}`);
  console.log(`  引文凭据（official_url + source_quote + last_verified）：${c.verbatim} / ${c.rules}`);
  console.log(`  标注锚定：${c.anchored} / ${c.rules + c.crosscheck} 个默认或交叉核验规则 ID 在 labels.json 有 hit/no_hit 标注`);
  console.log(`  预检正反例：${c.paired} / ${c.checkRules} 个自动检查规则 ID 同时有 hit 和 no_hit 标注`);
  console.log(`  导航和人工核对规则：${c.navigationRules} 条`);
  console.log(`  precision：${f3(c.precision)}（recall ${f3(c.recall)} · TP${c.matrix.tp}/FP${c.matrix.fp}/FN${c.matrix.fn} · 基于 ${c.labelCount} 条标注）`);
  console.log(`\n对照 §15.1 官方要求条目 ${BACKLOG_TOTAL}（去重）：默认规则覆盖其一部分，缺口见 docs/08 §15.2 backlog（T0/T1/T2）。`);
  console.log(`新鲜度：last_verified 最早 ${c.freshness.earliest} / 最近 ${c.freshness.latest}（以官方实时文档为准 · rot 监控保鲜）`);
  console.log("\n按阶段分布：");
  for (const s of STAGES) if (c.byStage[s]) console.log(`  ${s.padEnd(14)} ${c.byStage[s]}`);

  const verbatimOk = c.verbatim === c.rules;
  const precisionOk = c.precision >= PRECISION_MIN;
  // A2 同款走廊（2026-07-16 复核）：precision 在 tp+fp=0 时按定义=1，召回全线崩塌时若不查 FN，
  // 本脚本会照打 ✅——与 scripts/accuracy.mjs 的 accuracyOk 同口径补上 FN==0。
  const fnOk = c.matrix.fn === 0;
  if (!verbatimOk) console.error(`\n❌ 红线告警：${c.rules - c.verbatim} 条默认规则缺逐字核验字段（覆盖跑赢了逐字核验）。`);
  if (!precisionOk) console.error(`❌ 红线告警：precision ${f3(c.precision)} < ${PRECISION_MIN}（覆盖跑赢了准确性）。`);
  if (!fnOk) console.error(`❌ 红线告警：FN=${c.matrix.fn}（已标注锚点出现漏报——召回回归不允许绿灯放行）。`);
  if (verbatimOk && precisionOk && fnOk) console.log("\n✅ 红线：每条默认数据规则均具备引文字段，标注语料 precision ≥ 0.95 且零漏报。");
  process.exit(verbatimOk && precisionOk && fnOk ? 0 : 1);
}

// 仅在直接运行时执行 main（被测试 import 时不执行）——原 `if (process.argv[1])` 恒真，
// import 即跑 main() 并 process.exit，会杀死导入方（G3，STRENGTHENING_PLAN 阶段1）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
