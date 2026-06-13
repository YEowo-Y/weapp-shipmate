import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/check.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");

test("check 默认排除 draft → 命中 0（当前种子全为 draft）", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  assert.equal(r.items.length, 0);
});

test("check --include-drafts 命中隐私与域名规则", () => {
  const r = runCheck(FIX, { subjectType: "personal", includeDrafts: true });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.getUserProfile"));
  assert.ok(ids.includes("privacy.getLocation"));
  assert.ok(ids.includes("privacy.getPhoneNumber"));
  assert.ok(ids.includes("domain.request-whitelist"));
});

test("check 报告动态域名警示并附静态域名清单", () => {
  const r = runCheck(FIX, { subjectType: "personal", includeDrafts: true });
  assert.ok(r.notes.some((n) => n.includes("动态")));
  const domainItem = r.items.find((i) => i.ruleId === "domain.request-whitelist");
  assert.ok(domainItem.requires.some((x) => x.includes("api.example.com")));
});
