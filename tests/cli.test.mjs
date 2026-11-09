import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
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
  const result = JSON.parse(out.get());
  const visible = [...result.items, ...result.selfCheck];
  assert.ok(visible.length > 0, "应有阻断项");
  assert.ok(visible.every((i) => i.severity === "blocker"), "items 与 selfCheck 的所有项均为 blocker");
  assert.match(result.meta.summary, new RegExp(`仅显示 ${visible.length} 条阻断项`));
  assert.ok(
    result.notes.every((note) => !/^另有 \d+ 条规则是否适用/.test(note)),
    "备注不得沿用过滤前的自查计数",
  );
  assert.ok(
    result.notes.some((note) => note.includes(`另有 ${result.selfCheck.length} 条阻断规则`)),
    "自查备注应与过滤后的 blocker 数一致",
  );
});

test("explain --blockers-only 的条目与摘要均只统计阻断规则", () => {
  const out = capture(), err = capture();
  assert.equal(main(["node", "cli", "explain", "隐私", "--blockers-only", "--json"], out, err), 0);
  const result = JSON.parse(out.get());
  const rejectCount = new Set(result.items.map((item) => item.rejectId)).size;
  assert.ok(result.items.every((item) => item.severity === "blocker"));
  assert.match(
    result.meta.summary,
    new RegExp(`匹配到 ${rejectCount} 条含阻断规则的相关拒审原因，对应 ${result.items.length} 条阻断规则`),
  );
  assert.equal(result.meta.query, "隐私", "结构化查询字段应保持原值");
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
  assert.match(o.meta.summary, /主体：个人/, "主体应以可读名称显示");
  assert.ok(o.items.some(item => item.ruleId === "filing.individual-id-materials"), "个人主体规则应生效");
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

test("guide CLI 保留未知，并分别表达明确是与否", () => {
  for (const [flags, expectedStages, payment] of [[[], "8/8", null], [["--payment", "--sensitive", "--domain"], "8/8", "涉及支付"], [["--no-payment", "--no-sensitive", "--no-domain"], "6/8", "不涉及支付"]]) {
    const out = capture(), err = capture();
    assert.equal(main(["node", "cli", "guide", ...flags, "--json"], out, err), 0, err.get());
    const result = JSON.parse(out.get());
    assert.ok(result.meta.summary.includes(expectedStages));
    if (payment) assert.ok(result.notes.some(note => note.includes(`已记录${payment}`)));
    else {
      assert.ok(result.notes.some(note => note.includes("未知不等于不适用")));
      assert.ok(result.notes.every(note => !note.includes("已记录") && !note.includes("跳过阶段")));
    }
  }
});

test("正反事实开关冲突与布尔等号取值都报错", () => {
  for (const fact of ["payment", "sensitive", "domain"]) {
    for (const args of [[`--${fact}`, `--no-${fact}`], [`--no-${fact}`, `--${fact}`], [`--${fact}=false`], [`--no-${fact}=true`]]) {
      const out = capture(), err = capture();
      assert.equal(main(["node", "cli", "guide", ...args, "--json"], out, err), 1);
      assert.match(err.get(), args.length === 2 ? /冲突/ : /无法识别/);
      assert.equal(out.get(), "");
    }
  }
});

test("中文主体在 CLI 边界归一化（check 与 guide）", () => {
  for (const [alias, subject] of [["个人", "personal"], ["个体户", "individual_business"], ["个体工商户", "individual_business"], ["企业", "enterprise"]]) {
    for (const command of [["guide"], ["check", "fixtures/sample-app"]]) {
      const actual = capture(), expected = capture(), err = capture();
      const status = main(["node", "cli", ...command, `--subject=${subject}`, "--json"], expected, err);
      assert.equal(main(["node", "cli", ...command, "--subject", alias, "--json"], actual, err), status, err.get());
      assert.deepEqual(JSON.parse(actual.get()), JSON.parse(expected.get()));
    }
  }
});

test("目录不存在或传入文件时显示中文路径与恢复指引", () => {
  for (const [path, reason] of [["fixtures/no-such-project-r1", /目录不存在/], ["package.json", /不是目录/]]) {
    const out = capture(), err = capture();
    assert.equal(main(["node", "cli", "check", path], out, err), 1);
    assert.match(err.get(), reason);
    assert.ok(err.get().replaceAll("\\", "/").includes(path));
    assert.match(err.get(), /请/);
    assert.doesNotMatch(err.get(), /ENOENT|ENOTDIR|at .*\.mjs/);
    assert.equal(out.get(), "");
  }
});

test("guide 帮助说明三态与仅提示输入", () => {
  const out = capture();
  main(["node", "cli", "guide", "--help"], out, capture());
  assert.match(out.get(), /未提供.*未知/);
  assert.match(out.get(), /payment.*business.*仅.*提示.*不.*筛选/);
  for (const fact of ["payment", "sensitive", "domain"]) assert.ok(out.get().includes(`--no-${fact}`));
});

test("目录拒权时保留中文原因和目标路径（注入 EACCES）", (t) => {
  const original = fs.readdirSync;
  t.mock.method(fs, "readdirSync", (path, options) => {
    if (String(path).includes("denied-r1")) throw Object.assign(new Error("private internal detail"), { code: "EACCES", syscall: "scandir", path });
    return original(path, options);
  });
  syncBuiltinESMExports();
  try {
    const out = capture(), err = capture();
    assert.equal(main(["node", "cli", "check", "denied-r1"], out, err), 1);
    assert.match(err.get(), /没有权限读取目录/);
    assert.match(err.get(), /denied-r1/);
    assert.match(err.get(), /请.*读取权限.*重试/);
    assert.doesNotMatch(err.get(), /private internal|EACCES|at .*\.mjs/);
    assert.equal(out.get(), "");
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("check 聚焦阻断时仍保留被隐藏条目的扫描限制", () => {
  const baseline = capture();
  assert.equal(main(["node", "cli", "check", "fixtures/sample-app", "--json"], baseline, capture()), 0);
  const note = JSON.parse(baseline.get()).items.find(item => item.ruleId === "domain.request-whitelist").note;
  assert.ok(note);
  for (const format of ["--json", "--checklist", null]) {
    const out = capture();
    assert.equal(main(["node", "cli", "check", "fixtures/sample-app", "--blockers-only", ...(format ? [format] : [])], out, capture()), 0);
    if (format === "--json") {
      const result = JSON.parse(out.get());
      assert.ok(result.items.every(item => item.severity === "blocker"));
      assert.equal(result.notes.filter(value => value === note).length, 1);
    } else assert.ok(out.get().includes(note), `${format || "Markdown"} 应保留完整扫描限制`);
  }
});
