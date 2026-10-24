import test from "node:test";
import assert from "node:assert/strict";
import { loadData } from "../src/data.mjs";
import { runGuide } from "../src/guide.mjs";
import { loadSnapshots } from "../scripts/verify-source-quotes.mjs";
import { createWorkflowCatalog } from "../src/project-artifact.mjs";
import { deriveWorkflow } from "../src/workflow.mjs";

const onboardingIds = ["registration.account-details", "certification.enterprise-verification", "release.manual-publish"];

test("new manual rules use archived verbatim primary sources and no scanner", () => {
  const { rules } = loadData();
  const snapshots = loadSnapshots();
  for (const id of onboardingIds) {
    const rule = rules.find(rule => rule.id === id);
    assert.ok(rule, id);
    assert.equal(rule.kind, "navigation");
    assert.equal(rule.manual_required, true);
    assert.equal(rule.match, undefined);
    assert.equal(rule.last_verified, "2026-10-22");
    assert.ok(snapshots[rule.official_url].includes(rule.source_quote), id);
  }
});

test("registration and release apply to each supported subject but enterprise certification is not generalized", () => {
  for (const subject of ["personal", "individual_business", "enterprise"]) {
    const result = runGuide({ subject_type: subject });
    const ids = result.items.map(item => item.ruleId);
    assert.ok(ids.includes("registration.account-details"));
    assert.ok(ids.includes("release.manual-publish"));
    assert.equal(ids.includes("certification.enterprise-verification"), subject === "enterprise");
    if (subject === "enterprise") {
      const item = result.items.find(item => item.ruleId === "certification.enterprise-verification");
      assert.ok(item.requires.some(text => text.includes("不将付费认证")));
      assert.equal(item.severity, "info");
    } else assert.ok(ids.includes("flow.certification"), "unverified subject detail remains an explicit coverage gap");
  }
});

test("new coverage never automatically confirms registration or release; review alone is insufficient", () => {
  const project = { subject: "enterprise", contextRevision: 0, facts: {} };
  const result = deriveWorkflow({ project, catalog: createWorkflowCatalog(), rulesVersion: "v1", confirmations: [
    { stageId: "review", state: "confirmed", contextRevision: 0, rulesVersion: "v1", recordedAt: 1 },
  ] });
  for (const id of ["registration", "certification", "release"]) {
    const stage = result.stages.find(stage => stage.id === id);
    assert.equal(stage.status, "pending");
    assert.equal(stage.coverage.ruleCount, 1);
  }
});

test("filing uses the verified relocated page without altering unrelated freshness", () => {
  const { rules, flow } = loadData();
  const url = "https://developers.weixin.qq.com/miniprogram/product/record/record_guidelines.html";
  assert.equal(flow.find(stage => stage.stage === "filing").official_url, url);
  assert.equal(flow.find(stage => stage.stage === "certification").title, "主体身份核验");
  for (const id of ["filing.required-before-release", "filing.individual-id-materials", "filing.face-verification"]) {
    const rule = rules.find(rule => rule.id === id);
    assert.equal(rule.official_url, url);
    assert.equal(rule.last_verified, "2026-10-22");
    assert.ok(loadSnapshots()[url].includes(rule.source_quote));
  }
  assert.equal(rules.find(rule => rule.id === "filing.keep-updated").last_verified, "2026-07-16");
});
