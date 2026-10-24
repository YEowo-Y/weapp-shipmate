import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { runProjectTool, createWorkflowCatalog } from "../src/project-artifact.mjs";
import { deriveWorkflow } from "../src/workflow.mjs";
import { runGuide } from "../src/guide.mjs";
import { runExplain } from "../src/explain.mjs";
import { scanProject, MAX_FILE_BYTES } from "../src/scanner.mjs";

const fixture = t => {
  const root = mkdtempSync(join(tmpdir(), "shipmate-project-domain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "app.json"), '{"pages":[]}');
  return root;
};
const catalog = createWorkflowCatalog();
const project = { subject: "personal", contextRevision: 0, facts: { businessType: "天气", hasPayment: null, collectsSensitive: null, hasServerDomain: null } };
const derive = overrides => deriveWorkflow({ project, catalog, rulesVersion: "rules-a", confirmations: [], ...overrides });

test("one-run envelope preserves public guide/explain shapes and renders markdown", () => {
  const guide = runProjectTool("guide", { subject: "personal", facts: {} });
  assert.deepEqual(guide.data.result, runGuide({ subject_type: "personal" }));
  const explain = runProjectTool("explain", { query: "隐私" });
  assert.deepEqual(explain.data.result, runExplain("隐私"));
  assert.equal(explain.data.scope, null);
  assert.ok(explain.markdown.includes("隐私"));
  assert.throws(() => runProjectTool("explain", { query: " " }));
  assert.throws(() => runProjectTool("explain", { query: "a".repeat(4097) }));
  assert.throws(() => runProjectTool("unknown"));
});

test("scope matches file membership across content edits, changes on file additions", t => {
  const root = fixture(t);
  writeFileSync(join(root, "a.js"), "wx.getLocation({})");
  const before = runProjectTool("check", { directory: root });
  writeFileSync(join(root, "a.js"), "const fixed = true;");
  const after = runProjectTool("check", { directory: root });
  assert.deepEqual(before.data.scope, after.data.scope);
  assert.equal(after.data.scope.complete, true);
  assert.ok(before.data.result.items.length > after.data.result.items.length);
  writeFileSync(join(root, "extra.js"), "");
  assert.notEqual(scanProject(root).scope.filesHash, after.data.scope.filesHash);
});

test("scope rejects partial, malformed, linked and empty scans", t => {
  const root = fixture(t);
  assert.equal(scanProject(root, { maxEntries: 0 }).scope.complete, false);
  writeFileSync(join(root, "app.json"), "{");
  assert.equal(scanProject(root).scope.complete, false);
  writeFileSync(join(root, "app.json"), "{}");
  writeFileSync(join(root, "big.js"), " ".repeat(MAX_FILE_BYTES + 1));
  assert.equal(scanProject(root).scope.complete, false);
  rmSync(join(root, "big.js"));
  symlinkSync(root, join(root, "linked"), "junction");
  const linked = scanProject(root);
  assert.equal(linked.skippedLinks, 1);
  assert.equal(linked.scope.complete, false);
});

test("unknown facts preserve stages; explicit false needs manual not-applicable reason", () => {
  const unknown = derive();
  assert.equal(unknown.stages.length, 8);
  assert.equal(unknown.stages.find(s => s.id === "privacy").status, "unknown");
  const falseFact = derive({ project: { ...project, facts: { collectsSensitive: false } } });
  assert.equal(falseFact.stages.find(s => s.id === "privacy").status, "pending");
  assert.equal(falseFact.stages.find(s => s.id === "privacy").applicability, false);
  assert.equal(unknown.nextAction.stageId, "registration");
  assert.ok(unknown.stages.find(s => s.id === "review").blockedBy.includes("filing"));
});

test("all file read/stat and nested directory failures invalidate scope, not just config errors", t => {
  const root = fixture(t);
  writeFileSync(join(root, "a.js"), "wx.getLocation({})");
  for (const method of ["readFileSync", "statSync"]) {
    const original = fs[method];
    try {
      fs[method] = (...args) => {
        if (String(args[0]).endsWith("a.js")) throw Object.assign(new Error("fixture denied"), { code: "EACCES" });
        return original(...args);
      };
      syncBuiltinESMExports();
      const result = scanProject(root);
      assert.equal(result.readErrors, 1);
      assert.equal(result.scope.complete, false);
      assert.equal(result.configErrors.length, 0);
    } finally { fs[method] = original; syncBuiltinESMExports(); }
  }
  fs.mkdirSync(join(root, "nested"));
  const original = fs.readdirSync;
  try {
    fs.readdirSync = (...args) => {
      if (String(args[0]).endsWith("nested")) throw new Error("fixture denied");
      return original(...args);
    };
    syncBuiltinESMExports();
    const result = scanProject(root);
    assert.equal(result.readErrors, 1);
    assert.equal(result.skippedDirs, 1);
    assert.equal(result.scope.complete, false);
  } finally { fs.readdirSync = original; syncBuiltinESMExports(); }
});

test("confirmation invalidates on context/rules changes, pending revokes confirmation", () => {
  const record = { stageId: "registration", state: "confirmed", contextRevision: 0, rulesVersion: "rules-a", recordedAt: 1 };
  assert.equal(derive({ confirmations: [record] }).stages[0].status, "confirmed");
  assert.equal(derive({ confirmations: [record], project: { ...project, contextRevision: 1 } }).stages[0].status, "stale");
  assert.equal(derive({ confirmations: [record], rulesVersion: "rules-b" }).stages[0].status, "stale");
  assert.equal(derive({ confirmations: [record, { ...record, state: "pending", recordedAt: 2 }] }).stages[0].status, "pending");
  assert.equal(derive({ confirmations: [record], project: { ...project, name: "renamed", revision: 10 } }).stages[0].status, "confirmed");
});

test("missing or invalid workflow catalog fails closed instead of reporting all complete", () => {
  for (const invalid of [null, {}, { schemaVersion: 1, stages: [], rules: [] },
    { ...catalog, stages: [{ stage: "registration" }] },
    { ...catalog, stages: [catalog.stages[0], catalog.stages[0]] },
    { ...catalog, rules: [{ id: "bad", stage: "not-a-stage" }] },
    { ...catalog, stages: catalog.stages.map(stage => stage.stage === "registration" ? { ...stage, requires_stage: ["review"] } : stage) }])
    assert.throws(() => derive({ catalog: invalid }), /资料|循环/);
  const confirmations = catalog.stages.map(stage => ({ stageId: stage.stage, state: "confirmed", contextRevision: 0, rulesVersion: "rules-a", recordedAt: 1 }));
  assert.equal(derive({ confirmations }).nextAction, null);
});

test("revoking a prerequisite marks all downstream confirmations stale, restoration recovers historical confirmations", () => {
  const confirmations = catalog.stages.map(stage => ({ stageId: stage.stage, state: "confirmed", contextRevision: 0, rulesVersion: "rules-a", recordedAt: 1 }));
  const revoked = [...confirmations, { ...confirmations[0], state: "pending", recordedAt: 2 }];
  const snapshot = globalThis.structuredClone(revoked);
  // Reverse display order to ensure dependency projection does not rely on array ordering.
  const reversed = { ...catalog, stages: [...catalog.stages].reverse() };
  const result = derive({ catalog: reversed, confirmations: revoked });
  const stage = id => result.stages.find(item => item.id === id);
  assert.equal(stage("registration").status, "pending");
  for (const id of ["certification", "filing", "category", "review", "release"])
    assert.equal(stage(id).status, "stale", id);
  assert.deepEqual(stage("certification").blockedBy, ["registration"]);
  assert.deepEqual(stage("review").blockedBy, ["filing", "category"]);
  assert.deepEqual(stage("release").blockedBy, ["review"]);
  assert.equal(stage("release").confirmation.state, "confirmed");
  assert.match(stage("release").action, /前置阶段/);
  assert.deepEqual(revoked, snapshot, "projection must not rewrite append-only records");
  const restored = derive({ catalog: reversed, confirmations: [...revoked, { ...confirmations[0], recordedAt: 3 }] });
  assert.ok(restored.stages.every(item => item.status === "confirmed"));
  assert.ok(restored.stages.every(item => !item.blockedBy.length));
  assert.equal(restored.nextAction, null);
});

test("category matches are scoped clues, never official selections or confirmation", () => {
  const result = derive({ project: { ...project, facts: { businessType: "医生问诊", hasPayment: true } } });
  assert.ok(result.categoryCandidates.some(item => item.ruleId === "category.medical-hint"));
  assert.ok(result.categoryCandidates.some(item => item.ruleId === "category.payment-hint"));
  assert.equal(result.stages.find(s => s.id === "category").status, "pending");
  assert.equal(derive().categoryCandidates.length, 0);
  assert.ok(catalog.rules.every(rule => !rule.draft));
});

test("guide public payment/business inputs explain finite scope and retain unknown stages", () => {
  const result = runGuide({ has_payment: true, business_type: "商城", collects_sensitive: null });
  assert.ok(result.notes.some(note => note.includes("支付") && note.includes("不代表")));
  assert.ok(result.notes.some(note => note.includes("不会自动选定")));
  assert.ok(result.items.some(item => item.stage === "privacy"));
  assert.ok(result.notes.some(note => note.includes("未知不等于")));
});

test("fixed project tool entrypoint emits one JSON envelope with exit 1 on bad input", () => {
  const result = spawnSync(process.execPath, ["src/project-tool.mjs", "guide", '{"subject":"personal"}'], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).data.kind, "guide");
  const invalid = spawnSync(process.execPath, ["src/project-tool.mjs", "guide", "{"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
});
