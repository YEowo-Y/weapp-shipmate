// G1（STRENGTHENING_PLAN 阶段1）：夹具命中集合钉板的 CI 强制层。
// 动机：accuracy 门禁只对 labels.json 已标注的 (project,ruleId) 对计分，38/68 条可命中规则
// 零锚点——它们开始误报时 CI 无任何信号。本测试把每个夹具的完整命中集合钉死，任何漂移变红。
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePins, loadPins } from "../scripts/pin-fixtures.mjs";
import { loadLabels } from "../scripts/accuracy.mjs";

test("夹具钉板：全部夹具 × 两口径的命中集合与 corpus/fixture-pins.json 逐条一致", () => {
  const want = loadPins();
  const got = computePins();
  const gotMap = new Map(got.map((p) => [`${p.fixture}::${p.subject}`, p.rules]));
  assert.equal(got.length, want.length, "钉板记录数 ≠ 实际夹具×口径数（增删夹具后须 pin-fixtures --update 重钉）");
  for (const w of want) {
    const g = gotMap.get(`${w.fixture}::${w.subject}`);
    assert.ok(g, `钉板记录 ${w.fixture}::${w.subject} 对应的夹具已不存在`);
    assert.deepEqual(
      g,
      w.rules,
      `${w.fixture}（${w.subject}）命中漂移——新增读夹具源码裁决 TP/FP，消失区分有意修复与召回回归；确认有意改进后 node scripts/pin-fixtures.mjs --update 重钉`,
    );
  }
});

test("夹具钉板与 labels.json 真值一致：不得把已标注的 FP 钉成基线、不得丢已标注的 TP", () => {
  const pins = loadPins();
  const { labels, subjectDefault } = loadLabels();
  const pinMap = new Map(pins.map((p) => [`${p.fixture}::${p.subject}`, new Set(p.rules)]));
  let checked = 0;
  for (const l of labels) {
    if ((l.subject || subjectDefault) !== "personal") continue; // 钉板只覆盖 personal/none 两口径
    const name = l.project.replace(/^fixtures\//, "");
    const set = pinMap.get(`${name}::personal`);
    assert.ok(set, `labels 标注的夹具在钉板中缺失：${l.project}`);
    if (l.expect === "hit") assert.ok(set.has(l.ruleId), `labels 标 hit 但钉板缺失（召回回归被钉板固化）：${l.project} ${l.ruleId}`);
    else if (l.expect === "no_hit") assert.ok(!set.has(l.ruleId), `labels 标 no_hit 但钉板包含（误报被钉成基线）：${l.project} ${l.ruleId}`);
    checked++;
  }
  assert.ok(checked >= 70, `真值交叉核验条数异常偏低（${checked}），labels.json 可能未被正确读取`);
});
