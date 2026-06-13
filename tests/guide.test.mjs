import { test } from "node:test";
import assert from "node:assert/strict";
import { evalExpr, runGuide } from "../src/guide.mjs";

test("evalExpr 支持 == / != / && / || 与空表达式", () => {
  assert.equal(evalExpr("collects_sensitive == true", { collects_sensitive: true }), true);
  assert.equal(evalExpr("collects_sensitive == true", { collects_sensitive: false }), false);
  assert.equal(evalExpr("subject_type != enterprise", { subject_type: "personal" }), true);
  assert.equal(evalExpr("", {}), true);
  assert.equal(
    evalExpr("has_payment == true || has_server_domain == true", { has_payment: false, has_server_domain: true }),
    true,
  );
});

test("guide 按输入跳过隐私/域名阶段", () => {
  const r = runGuide({ subject_type: "personal", collects_sensitive: false, has_server_domain: false });
  const stages = new Set(r.items.map((i) => i.stage));
  assert.ok(!stages.has("privacy"), "不收集敏感信息应跳过 privacy");
  assert.ok(!stages.has("domain"), "无服务器域名应跳过 domain");
  assert.ok(stages.has("filing"), "备案阶段应始终出现");
});

test("guide 收集敏感信息时含隐私阶段（含 draft）", () => {
  const r = runGuide({ subject_type: "personal", collects_sensitive: true }, { includeDrafts: true });
  const stages = new Set(r.items.map((i) => i.stage));
  assert.ok(stages.has("privacy"));
});
