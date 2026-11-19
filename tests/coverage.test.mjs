// G3（STRENGTHENING_PLAN 阶段1）：coverage.mjs 此前入口守卫恒真（if (process.argv[1])），
// import 即执行 main() 并 process.exit——覆盖率红线因此永远无法被单测。本文件锁住两件事：
// 1) coverage.mjs 可被安全 import（本文件能跑完即证明）；2) 红线三数的计算结果本身合理。
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLabels } from "../scripts/accuracy.mjs";
import { computeCoverage } from "../scripts/coverage.mjs";

test("coverage.mjs 可安全 import 且红线三数自洽", () => {
  const c = computeCoverage();
  assert.ok(c.rules > 0, "默认规则数应 > 0");
  assert.equal(c.verbatim, c.rules, "逐字核验红线：每条默认规则必带 official_url + source_quote + last_verified");
  assert.ok(c.precision >= 0.95, `precision 红线：${c.precision} < 0.95`);
  assert.equal(c.matrix.fp, 0, "零误报红线");
  assert.equal(c.labelCount, loadLabels().labels.length, "报告应给出标注语料的样本数");
  assert.ok(
    c.anchored <= c.rules + c.crosscheck,
    "标注锚定数不得超过默认规则与交叉核验的总数",
  );
  assert.ok(c.freshness.earliest && c.freshness.latest, "新鲜度区间应存在");
});
