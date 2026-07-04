// scripts/pin-fixtures.mjs —— 夹具命中集合钉板（G1，STRENGTHENING_PLAN 阶段1）。
// 动机：38/68 条可命中规则在 labels.json 零锚点，其误报/漏报对 accuracy 门禁完全不可见
// （coverage.mjs "标注锚定" 三数之一）。本钉板固化每个夹具在两种口径下的完整 ruleId 命中集合，
// 与 corpus/fixture-pins.json 比对，任何规则/扫描器改动引起的漂移在 CI 变红（tests/fixture-pins.test.mjs）。
// 口径：personal（与 labels.json subject_default 一致）+ 不带 subject（与 dogfood 快检口径一致）。
//   node scripts/pin-fixtures.mjs            核验：命中集合 ≡ 钉板，漂移 → 退出 1
//   node scripts/pin-fixtures.mjs --update   重生成钉板（漂移须逐条人工裁决 TP/FP 后再提交，不得迁就回归）
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runCheck } from "../src/check.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PIN_PATH = path.join(ROOT, "corpus", "fixture-pins.json");
// none = 不带 subject：只发全主体通用规则（check.mjs 的 subject_type.length<3 过滤分支）。
export const MODES = [
  { key: "personal", opts: { subjectType: "personal" } },
  { key: "none", opts: {} },
];

/** 对 fixtures/ 全部夹具 × 两种口径跑 check，返回排序去重的 ruleId 命中集合清单。 */
export function computePins(rootDir = ROOT) {
  const fixtures = readdirSync(path.join(rootDir, "fixtures"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const pins = [];
  for (const name of fixtures) {
    for (const mode of MODES) {
      const res = runCheck(path.join(rootDir, "fixtures", name), mode.opts);
      pins.push({
        fixture: name,
        subject: mode.key,
        rules: [...new Set(res.items.map((i) => i.ruleId))].sort(),
      });
    }
  }
  return pins;
}

export function loadPins() {
  return JSON.parse(readFileSync(PIN_PATH, "utf-8")).pins;
}

function diffPins(want, got) {
  const lines = [];
  const gotMap = new Map(got.map((p) => [`${p.fixture}::${p.subject}`, p.rules]));
  for (const w of want) {
    const g = gotMap.get(`${w.fixture}::${w.subject}`) ?? [];
    const added = g.filter((r) => !w.rules.includes(r));
    const lost = w.rules.filter((r) => !g.includes(r));
    if (added.length || lost.length) {
      lines.push(`❌ ${w.fixture}（${w.subject}）命中漂移：`);
      for (const r of added) lines.push(`   + 新增 ${r}（读夹具源码裁决 TP/FP——FP 则修实现）`);
      for (const r of lost) lines.push(`   - 消失 ${r}（有意修复请 --update 钉板，否则是召回回归）`);
    }
  }
  return lines;
}

function main() {
  const got = computePins();
  if (process.argv.includes("--update")) {
    const doc = {
      _comment:
        "夹具命中集合钉板（scripts/pin-fixtures.mjs 生成，tests/fixture-pins.test.mjs 在 CI 强制）。rules 是该夹具在对应口径（personal / none=不带 subject）下 check 命中的完整 ruleId 集合。作用：把 labels.json 未锚定规则的误报也纳入 CI 可见范围。漂移即红——新增读夹具源码裁决 TP/FP，消失区分有意修复与召回回归；确认有意改进后用 --update 重钉并提交。",
      pins: got,
    };
    writeFileSync(PIN_PATH, JSON.stringify(doc, null, 2) + "\n");
    console.log(`钉板已重写：${PIN_PATH}（${got.length} 条记录）\n⚠ 提交前须逐条人工核验漂移是有意改进，不是迁就回归。`);
    return;
  }
  const want = loadPins();
  const diff = diffPins(want, got);
  if (diff.length) {
    for (const l of diff) console.error(l);
    console.error(`\n❌ 夹具钉板核验失败。`);
    process.exit(1);
  }
  console.log(`✅ 夹具钉板核验通过：${want.length} 条记录（${MODES.length} 口径 × ${want.length / MODES.length} 夹具）命中集合一致。`);
}

// 仅在直接运行时执行 main（被测试 import 时不执行）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
