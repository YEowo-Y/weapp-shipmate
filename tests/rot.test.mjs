import { test } from "node:test";
import assert from "node:assert/strict";
import { ageInDays, staleness, uniqueUrls, classifyStatus } from "../src/rot.mjs";

test("ageInDays 按 UTC 整天计算", () => {
  assert.equal(ageInDays("2026-01-01", "2026-01-11"), 10);
  assert.equal(ageInDays("2026-06-14", "2026-06-14"), 0);
});

test("staleness 按阈值标记超期，注入 today 保证确定性", () => {
  const rules = [
    { id: "a.fresh", _file: "rules/a.yaml", last_verified: "2026-06-01" },
    { id: "b.old", _file: "rules/b.yaml", last_verified: "2025-01-01", draft: true },
  ];
  const out = staleness(rules, { today: "2026-06-14", staleDays: 180 });
  const fresh = out.find((s) => s.id === "a.fresh");
  const old = out.find((s) => s.id === "b.old");
  assert.equal(fresh.stale, false);
  assert.equal(old.stale, true);
  assert.equal(old.draft, true);
  assert.ok(old.ageDays > 180);
});

test("uniqueUrls 按 URL 去重并聚合规则 id", () => {
  const rules = [
    { id: "x", official_url: "https://e.com/a" },
    { id: "y", official_url: "https://e.com/a" },
    { id: "z", official_url: "https://e.com/b" },
    { id: "w" }, // 无 url，忽略
  ];
  const urls = uniqueUrls(rules);
  assert.equal(urls.length, 2);
  const a = urls.find((u) => u.url === "https://e.com/a");
  assert.deepEqual(a.ids, ["x", "y"]);
});

test("classifyStatus 区分 ok / dead / inconclusive", () => {
  assert.equal(classifyStatus(200), "ok");
  assert.equal(classifyStatus(404), "dead");
  assert.equal(classifyStatus(410), "dead");
  assert.equal(classifyStatus(0), "dead");
  assert.equal(classifyStatus(403), "inconclusive");
  assert.equal(classifyStatus(301), "inconclusive");
});
