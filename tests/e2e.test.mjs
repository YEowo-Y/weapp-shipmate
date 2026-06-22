// tests/e2e.test.mjs —— 二进制级端到端：spawn 真 CLI，验证全链路输出 + 退出码契约。
// 用 spawnSync（同步等子进程退出，天然确定性，不会有 mcp 那种竞态）。补 docs/06 关键路径 E2E 门禁(FX-04)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "weapp-shipmate.mjs");
const FIX = (n) => join(ROOT, "fixtures", n);

function run(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: "utf-8" });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

test("E2E check sample-app --json：命中隐私规则，仅警告 → 退出码 0", () => {
  const { code, stdout } = run("check", FIX("sample-app"), "--subject", "personal", "--json");
  const o = JSON.parse(stdout);
  assert.equal(o.command, "check");
  assert.ok(o.items.some((i) => i.ruleId === "privacy.getUserProfile"), "应含 privacy.getUserProfile");
  assert.equal(code, 0, "仅警告 → 退出码 0");
});

test("E2E check leaky-app：命中安全阻断 → 退出码 2（CI 门禁依赖的契约）", () => {
  const { code, stdout } = run("check", FIX("leaky-app"), "--subject", "personal", "--json");
  const o = JSON.parse(stdout);
  assert.ok(o.items.some((i) => i.ruleId === "security.hardcoded-secret"), "应含 security.hardcoded-secret");
  assert.equal(code, 2, "有 blocker → 退出码 2");
});

test("E2E check --blockers-only leaky-app：仍 exit 2 且只列阻断", () => {
  const { code, stdout } = run("check", FIX("leaky-app"), "--subject", "personal", "--blockers-only", "--json");
  const o = JSON.parse(stdout);
  assert.ok(o.items.length >= 1 && o.items.every((i) => i.severity === "blocker"), "只应剩阻断项");
  assert.equal(code, 2);
});

test("E2E guide --json：command=guide，退出码 0", () => {
  const { code, stdout } = run("guide", "--subject", "personal", "--sensitive", "--json");
  const o = JSON.parse(stdout);
  assert.equal(o.command, "guide");
  assert.equal(code, 0);
});

test("E2E explain 诱导分享：拒因反查文本，退出码 0", () => {
  const { code, stdout } = run("explain", "诱导分享");
  assert.match(stdout, /拒因/);
  assert.equal(code, 0);
});

test("E2E check --checklist：可勾选清单格式", () => {
  const { stdout } = run("check", FIX("sample-app"), "--subject", "personal", "--checklist");
  assert.match(stdout, /\[ \]/, "应含可勾选项 [ ]");
});

test("E2E --version：打印语义化版本，退出码 0", () => {
  const { code, stdout } = run("--version");
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(code, 0);
});

test("E2E explain 无参数 → 用法错误退出码 1", () => {
  assert.equal(run("explain").code, 1);
});

test("E2E 未知命令 → 退出码 1", () => {
  assert.equal(run("bogus").code, 1);
});
