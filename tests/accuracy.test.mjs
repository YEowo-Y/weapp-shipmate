// tests/accuracy.test.mjs —— 准确性门禁 + 黄金快照。
// 把 docs/08 §4.2 / docs/10 FX-11 落成 CI 回归：改规则/扫描器若让真实夹具的命中漂移，这里立刻 RED。
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLabels, computeAccuracy, PRECISION_MIN } from "../scripts/accuracy.mjs";

test("准确性门禁：全局 precision ≥ 0.95、零误报 FP、无未知 ruleId", () => {
  const { labels, subjectDefault } = loadLabels();
  const { global, perRule, warnings } = computeAccuracy(labels, { subjectDefault });

  assert.equal(warnings.length, 0, `存在未知 ruleId / 非法 expect：${warnings.join("；")}`);
  assert.ok(global.precision >= PRECISION_MIN, `全局 precision=${global.precision} < ${PRECISION_MIN}`);
  assert.equal(global.fp, 0, `全局误报 FP=${global.fp}（违准确性红线）`);
  for (const [id, o] of perRule) assert.equal(o.fp, 0, `规则 ${id} 误报 FP=${o.fp}`);

  // 防 labels 被清空仍假绿：核心夹具的正/反例锚点必须够数。
  const hits = labels.filter((l) => l.expect === "hit").length;
  const guards = labels.filter((l) => l.expect === "no_hit").length;
  assert.ok(hits >= 8, `hit 真阳锚点过少（${hits}）`);
  assert.ok(guards >= 8, `no_hit FP-guard 锚点过少（${guards}）`);
});

test("准确性黄金快照：命中基线 53 TP / 0 FP / 0 FN（14 夹具，含主体维度，漂移须人工确认后更新）", () => {
  const { labels, subjectDefault } = loadLabels();
  const { global } = computeAccuracy(labels, { subjectDefault });
  // 改了规则/扫描器导致真实夹具(原生/uni/Taro/mpx/wepy/edge/template/#ifdef/recall/missing-decl/sensor/broken-config + 企业主体 web-view)的命中变化 → 此断言 RED。
  // 确认是有意改进(非回归)后，再同步更新此基线 + corpus/labels.json。
  // 2026-07-04 基线 51→53：V3 新增 broken-config 夹具(+1 hit：privacy.getLocation)、
  // V4 补 wepy 明文请求检测(+1 hit：wepy-app security.insecure-request)——均为有意改进，逐条核验过夹具源码。
  // 2026-07-05 基线 53→54：R3 正则字面量感知——fp-guards 新增卫兵文件，同行正则后的 wx.getWeRunData
  // 修复前会被静默吞掉(+1 hit)，正则文本里的 chooseAddress 为 no_hit FP 卫兵。
  // 2026-07-05 基线 54→55：R4 Taro 具名导入映射——taro-app 的 getWeRunData() 具名导入调用(+1 hit)，
  // 修复前 API_RE 只认命名空间形式，此类调用整类不可见。
  assert.deepEqual(
    { tp: global.tp, fp: global.fp, fn: global.fn },
    { tp: 55, fp: 0, fn: 0 },
    "命中基线漂移：核对是否引入回归，确认无误后更新基线与 labels"
  );
});
