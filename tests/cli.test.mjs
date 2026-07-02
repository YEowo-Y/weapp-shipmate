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

test("guide --blockers-only 只保留阻断项", () => {
  const out = capture(), err = capture();
  const code = main(
    ["node", "cli", "guide", "--subject", "personal", "--sensitive", "--domain", "--blockers-only", "--json"],
    out, err,
  );
  assert.equal(code, 0);
  const items = JSON.parse(out.get()).items;
  assert.ok(items.length > 0, "应有阻断项");
  assert.ok(items.every((i) => i.severity === "blocker"), "所有项均为 blocker");
});

test("未知命令返回 1", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "frobnicate"], out, err), 1);
});

// FX-06：非法 --subject 必须非 0 退出并提示枚举，不得静默产出伪清白报告
// （主体专属规则会被静默跳过——质量红线"不出现已合规假象"）。
test("非法 --subject 返回 1 并提示枚举（check 与 guide 一致）", () => {
  for (const cmd of ["check", "guide"]) {
    const out = capture(), err = capture();
    const code = main(["node", "cli", cmd, "fixtures/sample-app", "--subject", "foobar"], out, err);
    assert.equal(code, 1, `${cmd} 遇非法主体应返回 1`);
    assert.match(err.get(), /非法 --subject/, `${cmd} 应提示非法主体`);
    assert.match(err.get(), /personal \| individual_business \| enterprise/, `${cmd} 应列出枚举值`);
    assert.equal(out.get(), "", `${cmd} 不应产出任何报告输出`);
  }
});

test("--subject 缺值（flag 在末尾）同样报非法并返回 1", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "check", "fixtures/sample-app", "--subject"], out, err);
  assert.equal(code, 1, "缺值的 --subject 不应静默当作未指定");
  assert.match(err.get(), /非法 --subject/);
});
