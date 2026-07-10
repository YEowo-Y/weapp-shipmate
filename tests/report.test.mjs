import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/report.mjs";
import { loadFlow } from "../src/data.mjs";

const result = {
  command: "check",
  meta: { summary: "测试摘要" },
  items: [
    { ruleId: "a.warn", title: "WarnItem", stage: "review", severity: "warning", requires: ["做警告项"] },
    { ruleId: "a.block", title: "BlockItem", stage: "review", severity: "blocker", requires: ["做阻断项"] },
    { ruleId: "a.info", title: "InfoItem", stage: "privacy", severity: "info", requires: ["做提示项"] },
  ],
  notes: [],
};

test("markdown 概览：按严重度统计计数", () => {
  const md = render(result, "markdown");
  assert.match(md, /\*\*概览\*\*/);
  assert.match(md, /🔴 1 阻断/);
  assert.match(md, /🟠 1 警告/);
  assert.match(md, /🟡 1 提示/);
});

test("markdown 同阶段内按严重度排序：阻断在警告之前", () => {
  const md = render(result, "markdown");
  assert.ok(md.indexOf("BlockItem") < md.indexOf("WarnItem"), "blocker 应排在 warning 之前");
});

test("checklist 只列待办动作、含勾选框、阻断动作在前", () => {
  const md = render(result, "checklist");
  assert.match(md, /可勾选/);
  assert.match(md, /- \[ \] 🔴 做阻断项/);
  assert.ok(!/为什么/.test(md), "checklist 不应含叙事说明");
  assert.ok(md.indexOf("做阻断项") < md.indexOf("做警告项"), "阻断动作应排在警告动作之前");
});

test("json 输出不受渲染排序影响（保持 items 原序）", () => {
  const j = JSON.parse(render(result, "json"));
  assert.deepEqual(j.items.map((i) => i.ruleId), ["a.warn", "a.block", "a.info"]);
});

test("markdown 与 checklist 的已知阶段标题和顺序直接跟随 flow.yaml", () => {
  const flow = loadFlow();
  const flowResult = {
    command: "check", meta: {}, notes: [],
    items: [...flow].reverse().map((stage) => ({
      ruleId: `flow-test.${stage.stage}`,
      title: stage.title,
      stage: stage.stage,
      severity: "info",
      requires: [`完成 ${stage.stage}`],
    })),
  };
  for (const format of ["markdown", "checklist"]) {
    const output = render(flowResult, format);
    let previous = -1;
    for (const stage of flow) {
      const heading = `## ${stage.title}（${stage.stage}）`;
      const position = output.indexOf(heading);
      assert.ok(position > previous, `${format} 应按 flow 顺序渲染 ${heading}`);
      previous = position;
    }
  }
});

// ── 边界渲染（此前零覆盖的三个分支）──
test("空结果占位：无 items 无 selfCheck → 两种格式都有明确空态文案", () => {
  const empty = { command: "check", meta: {}, items: [], notes: [] };
  assert.match(render(empty, "markdown"), /未命中任何规则/);
  assert.match(render(empty, "checklist"), /无可执行清单项/);
});

test("checklist：无 requires 但有 warn 的规则退化用 warn 作待办（否则整条静默丢失）", () => {
  const r = {
    command: "guide", meta: {}, notes: [],
    items: [{ ruleId: "b.warnonly", title: "WarnOnly", stage: "review", severity: "warning", warn: "警示性动作" }],
  };
  assert.match(render(r, "checklist"), /- \[ \] 🟠 警示性动作/);
});

// V6（STRENGTHENING_PLAN 阶段2）：未知 stage 的条目此前渲染时静默丢弃，但概览计数与
// CLI 退出码都算了它们——新增 flow 阶段而漏更新 STAGE_TITLE 时，阻断项会隐身。
test("未知 stage 兜底渲染为'其他'段，概览计数与正文不再自相矛盾", () => {
  const r = {
    command: "check", meta: {}, notes: [],
    items: [{ ruleId: "x.future", title: "FutureStageItem", stage: "future_stage", severity: "blocker", requires: ["做未来阶段项"] }],
  };
  const md = render(r, "markdown");
  assert.match(md, /## 其他（future_stage）/);
  assert.match(md, /FutureStageItem/);
  assert.match(md, /🔴 1 阻断/, "概览计数应与正文一致");
  const cl = render(r, "checklist");
  assert.match(cl, /- \[ \] 🔴 做未来阶段项/);
  assert.ok(!/无可执行清单项/.test(cl), "有动作项时不应出现空态文案");
});

test("selfCheck 段渲染：markdown 含'可能适用'与 signal 自查文案，checklist 含条件前缀", () => {
  const r = {
    command: "guide", meta: {}, items: [], notes: [],
    selfCheck: [{ ruleId: "c.self", title: "SelfItem", severity: "info", signal: ["直播", "医疗"], requires: ["办资质"] }],
  };
  const md = render(r, "markdown");
  assert.match(md, /可能适用 · 请按你的业务自查/);
  assert.match(md, /若你的小程序涉及【直播 \/ 医疗】/);
  assert.ok(!/未命中任何规则/.test(md), "有 selfCheck 时不应出现空占位");
  assert.match(render(r, "checklist"), /若涉及【直播 \/ 医疗】：办资质/);
});
