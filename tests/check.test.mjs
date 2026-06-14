import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/check.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");

test("check 默认即命中已核验的隐私与域名规则", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.getUserProfile"));
  assert.ok(ids.includes("privacy.getLocation"));
  assert.ok(ids.includes("privacy.getPhoneNumber"));
  assert.ok(ids.includes("domain.request-whitelist"));
  assert.ok(ids.includes("privacy.clipboard"), "扫到 wx.getClipboardData 应命中剪贴板隐私规则");
  assert.ok(r.items.length >= 5);
});

test("check 命中项均为非 draft（已核验来源）", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  // 默认不含 draft；命中的应都带真实 source_quote（非占位）
  for (const it of r.items) assert.ok(!/待核验/.test(it.source_quote || ""));
});

test("check 报告动态域名警示并附静态域名清单", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  assert.ok(r.notes.some((n) => n.includes("动态")));
  const domainItem = r.items.find((i) => i.ruleId === "domain.request-whitelist");
  assert.ok(domainItem.requires.some((x) => x.includes("api.example.com")));
});
