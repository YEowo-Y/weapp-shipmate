// G4（STRENGTHENING_PLAN 阶段1）：数据门禁 linter 的负向测试。
// validate.mjs 是 `npm test` 的第一道闸，但此前只被合法数据喂过——"坏数据会不会红"不可证伪。
// 本文件对抽出的纯函数喂合成坏图/坏数据，锁死每类结构性缺陷都能被点名。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { lintFlowGraph, lintRules, lintRejections } from "../scripts/validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const stage = (name, next = null, extra = {}) => ({ stage: name, next, ...extra });

test("lintFlowGraph: 真实 flow.yaml 零错误（重构等价锁）", () => {
  const flow = yaml.load(readFileSync(join(ROOT, "flow.yaml"), "utf-8"));
  const g = lintFlowGraph(flow);
  assert.deepEqual(g.errors, []);
  assert.equal(g.chain.length, flow.stages.length, "健康图的链路应覆盖全部阶段");
});

test("lintFlowGraph: 环被点名（入口引入环）", () => {
  const g = lintFlowGraph({ stages: [stage("a", "b"), stage("b", "c"), stage("c", "b")] });
  assert.ok(g.errors.some((e) => e.includes("环")), `应报环: ${g.errors}`);
});

test("lintFlowGraph: 双终点被点名", () => {
  const g = lintFlowGraph({ stages: [stage("a", "b"), stage("b"), stage("c")] });
  assert.ok(g.errors.some((e) => e.includes("终点数")), `应报终点数: ${g.errors}`);
});

test("lintFlowGraph: next 悬空被点名，且 linter 自身不得崩溃", () => {
  // 原实现 walk 到不存在的节点会 node[cur].next TypeError——linter 崩溃 ≠ 校验失败。
  let g;
  assert.doesNotThrow(() => { g = lintFlowGraph({ stages: [stage("a", "ghost")] }); });
  assert.ok(g.errors.some((e) => e.includes("指向不存在")), `应报悬空指向: ${g.errors}`);
});

test("lintFlowGraph: 分离环（入口/终点数正常）被全可达检查点名——原三项检查对此全部沉默", () => {
  const g = lintFlowGraph({ stages: [stage("a", "b"), stage("b"), stage("c", "d"), stage("d", "c")] });
  assert.ok(g.errors.some((e) => e.includes("未覆盖全部阶段")), `应报游离节点: ${g.errors}`);
  assert.ok(g.errors.some((e) => e.includes("c") && e.includes("d")), `应点名游离的 c,d: ${g.errors}`);
});

test("lintFlowGraph: 重复 stage 名被点名", () => {
  const g = lintFlowGraph({ stages: [stage("a", "b"), stage("a", "b"), stage("b")] });
  assert.ok(g.errors.some((e) => e.includes("重复")), `应报重复 stage: ${g.errors}`);
});

test("lintRules: 跨文件重复规则 id 被点名（此前 CI 静默放行，explain 层后者遮蔽前者）", () => {
  const stageSet = new Set(["privacy"]);
  const docs = [
    { file: "rules/x.yaml", doc: { rules: [{ id: "privacy.dup", stage: "privacy" }] } },
    { file: "rules/y.yaml", doc: { rules: [{ id: "privacy.dup", stage: "privacy" }] } },
  ];
  const r = lintRules(docs, stageSet);
  assert.ok(r.errors.some((e) => e.includes("重复规则 id") && e.includes("privacy.dup")), `应报重复 id: ${r.errors}`);
  assert.equal(r.total, 2);
});

test("lintRules: stage 不在 flow 中被点名", () => {
  const r = lintRules([{ file: "rules/x.yaml", doc: { rules: [{ id: "a.b", stage: "nope" }] } }], new Set(["privacy"]));
  assert.ok(r.errors.some((e) => e.includes("不在 flow 中")), `应报未知 stage: ${r.errors}`);
});

test("lintRejections: 悬空规则引用被点名", () => {
  const errors = lintRejections({ rejections: [{ id: "rj1", rules: ["ghost.rule"] }] }, new Set(["real.rule"]));
  assert.ok(errors.some((e) => e.includes("ghost.rule")), `应报悬空引用: ${errors}`);
});

// R5（阶段4）：schema 的 scanner↔字段绑定——此前 match 只 required:[scanner]，
// "带 scanner 但无可匹配字段"的死规则（永不可能命中）能过 CI。
test("rules.schema: scanner 类型绑定必需字段（死规则三态负向）", async () => {
  const Ajv = (await import("ajv")).default;
  const addFormats = (await import("ajv-formats")).default;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "rules.schema.json"), "utf-8"));
  const validate = ajv.compile(schema);
  const mkDoc = (match) => ({
    schema_version: 1,
    rules: [{
      id: "privacy.deadRule", title: "t", kind: "preflight", stage: "privacy",
      subject_type: ["personal"], severity: "warning", confidence: "high",
      match, requires: ["x"], why: "w",
      official_url: "https://example.com", source_quote: "q", last_verified: "2026-07-01",
      manual_required: true, // schema 底部 if/then：带 requires 的规则须人工完成标记
    }],
  });
  assert.equal(validate(mkDoc({ scanner: "static_api_call" })), false, "static_api_call 无 api → 死规则须拒");
  assert.equal(validate(mkDoc({ scanner: "static_config" })), false, "static_config 无 config_key → 死规则须拒");
  assert.equal(validate(mkDoc({ scanner: "manual_only", api: ["wx.getLocation"] })), false, "manual_only 带 api 自相矛盾须拒");
  assert.equal(validate(mkDoc({ scanner: "static_api_call", api: ["wx.getLocation"] })), true, "正常形态仍过");
});

test("lintRules + lintRejections: 真实仓库数据零错误（重构等价锁）", () => {
  const flow = yaml.load(readFileSync(join(ROOT, "flow.yaml"), "utf-8"));
  const { stageSet } = lintFlowGraph(flow);
  const docs = readdirSync(join(ROOT, "rules"))
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => ({ file: `rules/${f}`, doc: yaml.load(readFileSync(join(ROOT, "rules", f), "utf-8")) }));
  const r = lintRules(docs, stageSet);
  assert.deepEqual(r.errors, []);
  const rejections = yaml.load(readFileSync(join(ROOT, "rejections.yaml"), "utf-8"));
  assert.deepEqual(lintRejections(rejections, r.ruleIds), []);
});
