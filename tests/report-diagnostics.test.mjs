import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runCheck } from "../src/check.mjs";
import { runExplain } from "../src/explain.mjs";
import { render } from "../src/report.mjs";

for (const [fixture, diagnostic] of [["broken-config", /配置文件读取\/解析失败/], ["dynamic-url", /静态扫描可能漏报真实域名/]]) {
  test(`${fixture} 的各格式保留扫描限制且不改事实`, () => {
    const result = runCheck(fileURLToPath(new URL(`../fixtures/${fixture}`, import.meta.url)));
    const before = globalThis.structuredClone(result);
    for (const format of ["markdown", "checklist", "json"]) assert.match(render(result, format), diagnostic);
    assert.deepEqual(result, before);
    assert.deepEqual(JSON.parse(render(result, "json")), before);
  });
}

test("空扫描与全筛选清单保留限制，不将没有待办当作通过", () => {
  const dir = mkdtempSync(join(tmpdir(), "shipmate-report-"));
  try {
    const result = runCheck(dir);
    for (const format of ["markdown", "checklist", "json"]) assert.match(render(result, format), /扫描 0 个文件/);
    const output = render(result, "checklist");
    assert.match(output, /不代表.*检查通过/);
    const filtered = { ...runCheck("fixtures/broken-config"), items: [] };
    for (const format of ["markdown", "checklist"]) {
      const text = render(filtered, format, { hiddenNonBlockerCount: 2 });
      assert.match(text, /配置文件读取\/解析失败/);
      assert.match(text, /已隐藏 2 条非阻断项/);
    }
  } finally { rmSync(dir, { recursive: true }); }
});

test("相同诊断只展示一次且关联每个规则，包括只有 note 的项与自查项", () => {
  const note = "扫描限制：此项未能核验，请人工确认。";
  for (const command of ["check", "guide", "explain"]) {
    const result = { command, items: [{ ruleId: "a.one", stage: "review", title: "one", note }], selfCheck: command === "explain" ? [] : [{ ruleId: "b.two", note }], notes: [note, note] };
    for (const format of ["markdown", "checklist"]) {
      const output = render(result, format);
      assert.equal(output.split(note).length - 1, 1);
      assert.match(output, /a\.one/);
      if (command !== "explain") assert.match(output, /b\.two/);
    }
  }
});

test("人工处理文案不假定全部动作在官方后台", () => {
  for (const command of ["check", "guide", "explain"]) {
    const result = { command, items: [{ ruleId: "a.one", stage: "review", title: "one", manual_required: true, requires: ["修改代码", "到官方后台配置白名单"] }], notes: [] };
    const output = render(result);
    assert.match(output, /需人工确认\/处理/);
    assert.doesNotMatch(output, /需你本人在官方后台完成/);
    assert.match(output, /到官方后台配置白名单/);
  }
});

test("未知拒因只保留一次状态和可操作建议", () => {
  const result = runExplain("xyz-unrecognized-789");
  for (const format of ["markdown", "checklist"]) {
    const output = render(result, format);
    assert.equal((output.match(/未匹配到/g) || []).length, 1);
    assert.match(output, /关键词重试/);
  }
});
