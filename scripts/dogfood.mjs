// scripts/dogfood.mjs —— 本地真实语料回归门禁（把 2026-07-01 的一次性快检固化为可重跑闸门）。
// 合成夹具门禁（accuracy.mjs）抓不到"真实项目惯用写法"触发的 FP/FN（五个扫描器缺陷的实证教训），
// 本脚本对真实开源小程序样本跑 check，与 corpus/dogfood.json 钉板的 ruleId 集合比对，漂移即红。
// 样本是机器本地路径（不入库），CI 跑不了——这是开发机门禁，改规则/扫描器后必跑。
//   node scripts/dogfood.mjs            核验：命中集合 ≡ 钉板，漂移 → 退出 1
//   node scripts/dogfood.mjs --update   重生成钉板（须人工核验漂移是有意改进后再提交）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PIN_PATH = join(ROOT, "corpus", "dogfood.json");

const pin = JSON.parse(readFileSync(PIN_PATH, "utf-8"));
const update = process.argv.includes("--update");

let missing = 0;
let drifted = 0;

for (const s of pin.samples) {
  if (!existsSync(s.dir)) {
    console.warn(`⚠ 样本缺失，跳过：${s.name}（${s.dir}）`);
    missing++;
    continue;
  }
  // 与快检口径一致：不带 subject（只发全主体通用规则），排序去重的 ruleId 集合作指纹。
  const result = runCheck(s.dir, {});
  const got = [...new Set(result.items.map((i) => i.ruleId))].sort();

  if (update) {
    const before = (s.rules || []).join(",");
    s.rules = got;
    if (before !== got.join(",")) console.log(`↻ 更新钉板：${s.name} → [${got.join(", ") || "无命中"}]`);
    continue;
  }

  const want = s.rules || [];
  const added = got.filter((r) => !want.includes(r));
  const lost = want.filter((r) => !got.includes(r));
  if (added.length || lost.length) {
    drifted++;
    console.error(`❌ ${s.name} 命中漂移：`);
    for (const r of added) console.error(`   + 新增 ${r}（读样本源码裁决 TP/FP——FP 则修实现）`);
    for (const r of lost) console.error(`   - 消失 ${r}（有意修复请 --update 钉板，否则是召回回归）`);
  } else {
    console.log(`✓ ${s.name}（${got.length} 条命中，与钉板一致）`);
  }
}

if (update) {
  writeFileSync(PIN_PATH, JSON.stringify(pin, null, 2) + "\n");
  console.log(`\n钉板已重写：${PIN_PATH}\n⚠ 提交前须逐条人工核验漂移是有意改进（读样本源码），不是迁就回归。`);
} else {
  const ran = pin.samples.length - missing;
  if (missing) console.warn(`\n⚠ ${missing} 个样本缺失（本门禁依赖开发机本地样本目录）。`);
  if (drifted) {
    console.error(`\n❌ 门禁失败：${drifted}/${ran} 个样本命中漂移。`);
    process.exit(1);
  }
  console.log(`\n✅ 真实语料门禁通过：${ran} 个样本命中集合与钉板一致。`);
}
