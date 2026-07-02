import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/report.mjs";

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
