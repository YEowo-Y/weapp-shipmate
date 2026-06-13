import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "../src/cli.mjs";

function capture() {
  let s = "";
  return { write: (x) => { s += x; }, get: () => s };
}

test("--version 返回 0 且输出语义化版本", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "--version"], out, err), 0);
  assert.match(out.get(), /\d+\.\d+\.\d+/);
});

test("--help 返回 0 并含用法", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "--help"], out, err), 0);
  assert.match(out.get(), /weapp-shipmate/);
});

test("guide --json 输出可解析的 JSON", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "guide", "--subject", "personal", "--json"], out, err), 0);
  assert.equal(JSON.parse(out.get()).command, "guide");
});

test("未知命令返回 1", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "frobnicate"], out, err), 1);
});
