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

test("--subject 缺值（flag 在末尾或后跟另一 flag）报「缺少取值」并返回 1", () => {
  for (const args of [["check", "fixtures/sample-app", "--subject"], ["check", "fixtures/sample-app", "--subject", "--json"]]) {
    const out = capture(), err = capture();
    const code = main(["node", "cli", ...args], out, err);
    assert.equal(code, 1, "缺值的 --subject 不应静默当作未指定");
    assert.match(err.get(), /--subject 缺少取值/, "缺值应报缺值文案，不泄漏 undefined");
    assert.ok(!/undefined/.test(err.get()), "不应泄漏 JS 词汇 undefined");
  }
});

// FX-16：未知/拼错选项与等号语法不得静默忽略——静默会产出参数错误却看起来正常的报告。
test("未知选项返回 1 并提示（含拼错的 flag）", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "guide", "--foo", "--subjcet", "personal"], out, err);
  assert.equal(code, 1);
  assert.match(err.get(), /无法识别的选项：--foo、--subjcet/);
  assert.equal(out.get(), "", "不应产出任何报告输出");
});

test("--subject=personal 等号语法被正确解析（不再静默丢弃）", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "guide", "--subject=personal", "--json"], out, err);
  assert.equal(code, 0);
  const o = JSON.parse(out.get());
  assert.equal(o.command, "guide");
  assert.ok(o.meta.summary.includes("personal") || JSON.stringify(o).includes("personal"), "主体应生效");
});

test("布尔开关误带 =值 报无法识别", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "guide", "--json=true"], out, err);
  assert.equal(code, 1);
  assert.match(err.get(), /无法识别的选项：--json=true/);
});

test("check --help 显示帮助而非执行检查", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "check", "--help"], out, err), 0);
  assert.match(out.get(), /用法：/);
});

// V5（STRENGTHENING_PLAN 阶段2，FX-16 残余）：单横杠选项与多余位置参数此前被静默吞掉——
// `-json` 当位置参数丢弃后照常输出 Markdown 报告，正是 FX-16 要杀死的"参数错但报告看着正常"。
test("单横杠选项（-json）返回 1 并提示，不静默当位置参数", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "check", "fixtures/sample-app", "-json"], out, err);
  assert.equal(code, 1);
  assert.match(err.get(), /无法识别的选项：-json/);
  assert.equal(out.get(), "", "不应产出任何报告输出");
});

test("-h / -v 缩写仍按帮助/版本处理（HELP 文案承诺的通用缩写）", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "check", "-h"], out, err), 0);
  assert.match(out.get(), /用法：/);
  const out2 = capture(), err2 = capture();
  assert.equal(main(["node", "cli", "guide", "-v"], out2, err2), 0);
  assert.match(out2.get(), /\d+\.\d+\.\d+/);
});

test("check 多余位置参数返回 1（第二个目录不得静默丢弃）", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "check", "fixtures/sample-app", "fixtures/leaky-app"], out, err);
  assert.equal(code, 1);
  assert.match(err.get(), /多余的位置参数/);
  assert.equal(out.get(), "", "不应对第一个目录产出报告");
});

test("guide 不接受位置参数（`guide personal` 漏写 --subject 不得看似生效）", () => {
  const out = capture(), err = capture();
  const code = main(["node", "cli", "guide", "personal"], out, err);
  assert.equal(code, 1);
  assert.match(err.get(), /guide 不接受位置参数/);
  assert.equal(out.get(), "");
});
