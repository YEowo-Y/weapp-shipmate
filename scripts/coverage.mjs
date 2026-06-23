// scripts/coverage.mjs —— 覆盖率红线度量（docs/08 §15.4）。
// 红线：覆盖率与 precision 必须同速增长。每批新增规则报「覆盖数 / 逐字核验数 / precision」三数。
// 逐字核验跟不上覆盖、或 precision 下滑，即视为红线告警（退出码 1）——防"规则即数据"退化成 AI slop。
// 以官方实时文档为准：每条默认规则必带 official_url + source_quote + last_verified（schema 强制，本脚本显式盯）。
import { loadData } from "../src/data.mjs";
import { CROSSCHECK_RULE_IDS } from "../src/crosscheck.mjs";
import { loadLabels, computeAccuracy, PRECISION_MIN } from "./accuracy.mjs";

const BACKLOG_TOTAL = 72; // docs/08 §15.1：去重后官方上线/合规要求条目数（覆盖的分母）。
const STAGES = ["registration", "certification", "filing", "category", "privacy", "domain", "review", "release"];
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

export function computeCoverage() {
  const def = loadData({}).rules; // 默认集（非 draft）
  const all = loadData({ includeDrafts: true }).rules;
  const verbatim = def.filter((r) => r.official_url && r.source_quote && r.last_verified).length;
  const byStage = {};
  for (const r of def) byStage[r.stage] = (byStage[r.stage] || 0) + 1;
  const lv = def.map((r) => r.last_verified).filter(Boolean).sort();
  const { labels, subjectDefault } = loadLabels();
  const { global } = computeAccuracy(labels, { subjectDefault });
  return {
    rules: def.length,
    drafts: all.length - def.length,
    crosscheck: CROSSCHECK_RULE_IDS.length,
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
  console.log(`  覆盖（默认规则）：${c.rules} 条  +  交叉核验合成 ${c.crosscheck} = ${c.rules + c.crosscheck} 条可命中   | draft ${c.drafts}`);
  console.log(`  逐字核验（official_url + source_quote + last_verified）：${c.verbatim} / ${c.rules}`);
  console.log(`  precision：${f3(c.precision)}   （recall ${f3(c.recall)} · TP${c.matrix.tp}/FP${c.matrix.fp}/FN${c.matrix.fn}）`);
  console.log(`\n对照 §15.1 官方要求条目 ${BACKLOG_TOTAL}（去重）：默认规则覆盖其一部分，缺口见 docs/08 §15.2 backlog（T0/T1/T2）。`);
  console.log(`新鲜度：last_verified 最早 ${c.freshness.earliest} / 最近 ${c.freshness.latest}（以官方实时文档为准 · rot 监控保鲜）`);
  console.log("\n按阶段分布：");
  for (const s of STAGES) if (c.byStage[s]) console.log(`  ${s.padEnd(14)} ${c.byStage[s]}`);

  const verbatimOk = c.verbatim === c.rules;
  const precisionOk = c.precision >= PRECISION_MIN;
  if (!verbatimOk) console.error(`\n❌ 红线告警：${c.rules - c.verbatim} 条默认规则缺逐字核验字段（覆盖跑赢了逐字核验）。`);
  if (!precisionOk) console.error(`❌ 红线告警：precision ${f3(c.precision)} < ${PRECISION_MIN}（覆盖跑赢了准确性）。`);
  if (verbatimOk && precisionOk) console.log("\n✅ 红线：每条默认规则均逐字核验，且 precision ≥ 0.95——覆盖与准确性同速。");
  process.exit(verbatimOk && precisionOk ? 0 : 1);
}

if (process.argv[1]) main();
