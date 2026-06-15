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
