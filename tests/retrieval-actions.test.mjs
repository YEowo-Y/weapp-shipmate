import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runExplain } from "../src/explain.mjs";
import { loadData, ruleToItem } from "../src/data.mjs";
import { render } from "../src/report.mjs";
const dataset = JSON.parse(readFileSync(new URL("./fixtures/rejection-retrieval-v1.json", import.meta.url)));
for (const c of dataset.cases) test(`${dataset.version}: ${c.kind} ${c.query}`, () => {
  const items = runExplain(c.query).items;
  const ids = items.map(i => i.ruleId);
  for (const id of c.expected) assert.ok(ids.includes(id), `missing ${id}`);
  for (const id of c.excluded || []) assert.ok(!ids.includes(id), `irrelevant ${id}`);
  if (c.empty) assert.equal(items.length, 0);
  if (c.onlyPossible) assert.ok(items.every(i => i.relevance === "possible"));
});
test("匹配依据可追踪，直接和可能相关不暗示已确定违规", () => {
  const phone = runExplain("手机号").items[0];
  assert.equal(phone.relevance, "direct");
  assert.deepEqual(phone.matchEvidence.aliases, ["手机号"]);
  assert.equal(phone.rejectId, "reject.privacy-phone");
  for (const format of ["markdown", "checklist"]) {
    assert.match(render(runExplain("手机号"), format), /直接相关/);
    const broad = render(runExplain("测试"), format);
    assert.match(broad, /可能相关/);
    assert.match(broad, /匹配依据/);
  }
});
test("显式操作类别保留原严重度和阶段，旧项不推断后台", () => {
  const rules = loadData().rules;
  const item = ruleToItem(rules.find(r => r.id === "review.must-be-finished"));
  assert.ok(item.action_categories.includes("code"));
  assert.equal(item.stage, "review");
  assert.equal(item.severity, "blocker");
  const location = ruleToItem(rules.find(r => r.id === "privacy.getLocation"));
  assert.ok(location.action_categories.includes("code"));
  assert.ok(location.action_categories.includes("console"));
  for (const format of ["markdown", "checklist"]) {
    const text = render({command:"check", items:[location],notes:[]},format);
    assert.match(text,/改代码/); assert.match(text,/后台配置/);
  }
  const legacy = ruleToItem({id:"legacy.rule",manual_required:true});
  assert.equal(legacy.action_categories, undefined);
});

test("具体手机反馈优先且泛隐私规则只列可能相关，旧字段不丢失", () => {
  const result = runExplain("手机号未声明隐私");
  assert.equal(result.items[0].ruleId, "privacy.getPhoneNumber");
  assert.equal(result.items[0].relevance, "direct");
  for (const item of result.items.filter(i => i.ruleId !== "privacy.getPhoneNumber")) assert.equal(item.relevance,"possible");
  const rules = new Map(loadData({includeDrafts:true}).rules.map(r => [r.id, r]));
  for (const item of result.items) {
    const base = ruleToItem(rules.get(item.ruleId));
    for (const [key,value] of Object.entries(base)) assert.deepEqual(item[key],value);
  }
  assert.deepEqual(JSON.parse(render(result,"json")),result);
});

test("每条现有规则类别有效；透传数组与原规则隔离", () => {
  const allowed = new Set(["code","console","materials","manual_check"]);
  for (const rule of loadData({includeDrafts:true}).rules) {
    assert.ok(rule.action_categories.length > 0,rule.id);
    assert.ok(rule.action_categories.every(c => allowed.has(c)),rule.id);
    assert.equal(new Set(rule.action_categories).size,rule.action_categories.length);
    const item = ruleToItem(rule);
    item.action_categories.push("test-only");
    assert.ok(!rule.action_categories.includes("test-only"));
  }
});

test("操作类别 schema 可选且拒绝未知、重复和空类别", async () => {
  const { createAjv } = await import("../scripts/validate.mjs");
  const schema = JSON.parse(readFileSync(new URL("../schemas/rules.schema.json", import.meta.url)));
  const validate = createAjv().compile(schema);
  const { _file, ...rule } = loadData().rules[0];
  const doc = {schema_version:1, rules:[rule]};
  assert.equal(validate(doc),true);
  delete rule.action_categories;
  assert.equal(validate(doc),true);
  for (const categories of [[], ["unknown"], ["code","code"]]) {
    rule.action_categories = categories;
    assert.equal(validate(doc),false);
  }
});
