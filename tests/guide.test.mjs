import { test } from "node:test";
import assert from "node:assert/strict";
import { evalExpr, runGuide } from "../src/guide.mjs";
import { loadData } from "../src/data.mjs";

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

test("guide 收集敏感信息时含隐私阶段", () => {
  const r = runGuide({ subject_type: "personal", collects_sensitive: true });
  const stages = new Set(r.items.map((i) => i.stage));
  assert.ok(stages.has("privacy"));
});

test("guide 默认含已核验的提交审核规则（review 阶段）", () => {
  const r = runGuide({ subject_type: "personal" });
  const reviewIds = r.items.filter((i) => i.stage === "review").map((i) => i.ruleId);
  assert.ok(reviewIds.includes("review.no-inducement"), "应含禁诱导规则");
  assert.ok(reviewIds.includes("review.must-be-finished"), "应含完成品规则");
  assert.ok(reviewIds.includes("review.test-account"), "应含测试号规则");
  assert.ok(reviewIds.length >= 6, "review 阶段应有 6 条已核验规则");
});

test("guide 默认含已核验的登录规范与内容安全规则", () => {
  const r = runGuide({ subject_type: "personal" });
  const ids = new Set(r.items.filter((i) => i.stage === "review").map((i) => i.ruleId));
  assert.ok(ids.has("login.after-experience"), "应含登录后置规则");
  assert.ok(ids.has("login.cancellable"), "应含可取消登录规则");
  assert.ok(ids.has("content.filter-mechanism"), "应含 UGC 内容过滤规则");
});

test("guide 默认含已核验的支付/资质/未成年人规则", () => {
  const r = runGuide({ subject_type: "personal" });
  const ids = new Set(r.items.filter((i) => i.stage === "review").map((i) => i.ruleId));
  assert.ok(ids.has("payment.virtual-must-use-official"), "应含虚拟支付规则");
  assert.ok(ids.has("qualification.provide-materials"), "应含资质材料规则");
  assert.ok(ids.has("minor.protect"), "应含未成年人保护规则");
  assert.ok(ids.has("data.collection-consent"), "应含数据收集告知/同意规则");
  assert.ok(ids.has("outbound.no-recommend-others"), "应含不得推荐其他小程序规则");
  assert.ok(ids.has("outbound.no-induced-app-download"), "应含不得诱导下载 App 规则");
});

test("draft 门禁：默认集不含 draft 规则，--include-drafts 为其超集", () => {
  // 不依赖某条具体 draft 规则存在，直接验证门禁不变量（当前已无 draft 规则，机制仍须成立）。
  const def = loadData({ includeDrafts: false });
  const all = loadData({ includeDrafts: true });
  assert.ok(def.rules.every((r) => !r.draft), "默认规则集不得包含 draft 规则");
  assert.ok(all.rules.length >= def.rules.length, "include-drafts 应为默认集的超集");
  const defIds = new Set(def.rules.map((r) => r.id));
  for (const r of all.rules) if (!defIds.has(r.id)) assert.ok(r.draft, `多出的 ${r.id} 必为 draft`);
});
