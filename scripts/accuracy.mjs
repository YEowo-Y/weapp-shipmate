// scripts/accuracy.mjs —— 准确性度量(极简依赖)：对 corpus/labels.json 的人工 ground-truth
// 跑 check，算每规则 + 全局 precision/recall/F1。准确性是护城河，本脚本把"准不准"从感觉变数字。
// 用法：node scripts/accuracy.mjs （precision < 0.95、有误报 FP、有漏报 FN、或有未知 ruleId → 退出码 1）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runCheck } from "../src/check.mjs";
import { loadData } from "../src/data.mjs";
import { CROSSCHECK_RULE_IDS } from "../src/crosscheck.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PRECISION_MIN = 0.95;

export function loadLabels(rootDir = ROOT) {
  const raw = JSON.parse(readFileSync(path.join(rootDir, "corpus", "labels.json"), "utf8"));
  return { subjectDefault: raw.subject_default || "personal", labels: raw.labels || [] };
}

/** 对一批 (project, ruleId, expect) 标注算混淆矩阵。每个 (project,subject) 只跑一次 check。 */
export function computeAccuracy(labels, { rootDir = ROOT, subjectDefault = "personal" } = {}) {
  const subjectOf = (l) => l.subject || subjectDefault;
  const keyOf = (l) => `${l.project}::${subjectOf(l)}`;

  const firedByKey = new Map(); // key -> Set(ruleId)
  for (const l of labels) {
    const k = keyOf(l);
    if (firedByKey.has(k)) continue;
    const res = runCheck(path.resolve(rootDir, l.project), { subjectType: subjectOf(l) });
    firedByKey.set(k, new Set(res.items.map((i) => i.ruleId)));
  }

  // 已知 id = 规则库里的 + 交叉核验合成 id（即使只作 no_hit 反例从不命中也算合法）+ 实际命中过的；不在其中 = 疑似拼写错误。
  const known = new Set([...loadData({ includeDrafts: true }).rules.map((r) => r.id), ...CROSSCHECK_RULE_IDS]);
  for (const set of firedByKey.values()) for (const id of set) known.add(id);

  const perRule = new Map(); // ruleId -> {tp,fp,fn,tn}
  const bump = (id, k) => {
    const o = perRule.get(id) || { tp: 0, fp: 0, fn: 0, tn: 0 };
    o[k] += 1;
    perRule.set(id, o);
  };
  const warnings = [];
  for (const l of labels) {
    if (!known.has(l.ruleId)) warnings.push(`未知 ruleId(从不命中且不在规则库，疑似拼写错误)：${l.ruleId} @ ${l.project}`);
    const hit = firedByKey.get(keyOf(l)).has(l.ruleId);
    if (l.expect === "hit") bump(l.ruleId, hit ? "tp" : "fn");
    else if (l.expect === "no_hit") bump(l.ruleId, hit ? "fp" : "tn");
    else warnings.push(`未知 expect(应为 hit/no_hit)：${l.expect} @ ${l.ruleId}`);
  }

  let tp = 0, fp = 0, fn = 0;
  for (const o of perRule.values()) { tp += o.tp; fp += o.fp; fn += o.fn; }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { global: { tp, fp, fn, precision, recall, f1 }, perRule, warnings };
}

/** 通过判据（2026-07-16 审计 A2）：必须含 FN==0——precision 在 tp+fp=0 时按定义=1，
 *  召回全线崩塌（54 锚点全漏报）时旧判据仍打 ✅，单跑本脚本的开发者会带着回归继续工作。 */
export function accuracyOk(global, warnings) {
  return global.precision >= PRECISION_MIN && global.fp === 0 && global.fn === 0 && warnings.length === 0;
}

const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

function main() {
  const { labels, subjectDefault } = loadLabels();
  const { global, perRule, warnings } = computeAccuracy(labels, { subjectDefault });
  console.log(`准确性度量 · corpus/labels.json（${labels.length} 条标注）`);
  console.log(`全局：TP=${global.tp} FP=${global.fp} FN=${global.fn} | precision=${f3(global.precision)} recall=${f3(global.recall)} F1=${f3(global.f1)}`);
  const lv = loadData({}).rules.map((r) => r.last_verified).filter(Boolean).sort();
  if (lv.length) console.log(`新鲜度：${lv.length} 条规则带 last_verified，最早 ${lv[0]} / 最近 ${lv[lv.length - 1]}（以官方实时文档为准 · rot 监控保鲜）`);
  const fpRules = [...perRule.entries()].filter(([, o]) => o.fp > 0);
  const fnRules = [...perRule.entries()].filter(([, o]) => o.fn > 0);
  if (fpRules.length) { console.log("误报 FP（违准确性红线）："); for (const [id, o] of fpRules) console.log(`  - ${id}: FP=${o.fp}`); }
  if (fnRules.length) { console.log("漏报 FN："); for (const [id, o] of fnRules) console.log(`  - ${id}: FN=${o.fn}`); }
  for (const w of warnings) console.log(`⚠️ ${w}`);
  const ok = accuracyOk(global, warnings);
  console.log(ok ? `✅ 通过：precision ≥ ${PRECISION_MIN}、零误报、零漏报、无未知 ruleId` : `❌ 未通过：precision < ${PRECISION_MIN} 或有误报/漏报或有未知 ruleId`);
  process.exit(ok ? 0 : 1);
}

// 仅在直接运行时执行 main（被测试 import 时不执行）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
