// tests/smoke.test.mjs —— 冒烟：最小存活断言，作 CI 首道哨兵，快速定位"前提崩溃"(FX-04 配套)。
// import 级（不 spawn），跑得快；E2E 的二进制级覆盖见 e2e.test.mjs。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/check.mjs";
import { runGuide } from "../src/guide.mjs";
import { runExplain } from "../src/explain.mjs";
import { dispatch } from "../src/mcp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "fixtures");

test("冒烟：check 在全部夹具上不崩、返回 items 数组 + scan 元信息", () => {
  const names = readdirSync(FIXTURES);
  assert.ok(names.length >= 8, "夹具数量异常");
  for (const name of names) {
    const res = runCheck(join(FIXTURES, name), { subjectType: "personal" });
    assert.equal(res.command, "check", `${name}: command 应为 check`);
    assert.ok(Array.isArray(res.items), `${name}: items 应为数组`);
    assert.ok(res.meta && res.meta.scan, `${name}: 应有 scan 元信息`);
  }
});

test("冒烟：guide / explain 不崩、返回对应 command", () => {
  const g = runGuide({ subject_type: "personal" }, {});
  assert.equal(g.command, "guide");
  const e = runExplain("诱导分享", {});
  assert.equal(e.command, "explain");
});

test("冒烟：MCP dispatch ping 存活", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 99, method: "ping" });
  assert.ok(res && res.result !== undefined, "ping 应返回 result");
});
