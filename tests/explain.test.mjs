import { test } from "node:test";
import assert from "node:assert/strict";
import { runExplain, scoreRejection, loadRejections } from "../src/explain.mjs";
import { loadData } from "../src/data.mjs";
import { render } from "../src/report.mjs";

test("关键词命中拒因，反查出背后已核验规则", () => {
  const r = runExplain("诱导分享");
  assert.equal(r.command, "explain");
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("review.no-inducement"), "应反查到诱导类拒审规则");
  // 反查出的项应携带官方来源（复用规则的 source_quote/url），不是凭空生成
  const it = r.items.find((i) => i.ruleId === "review.no-inducement");
  assert.match(it.official_url, /reject\.html/);
  assert.equal(it.rejectId, "reject.inducement");
});

test("整段审核反馈文案也能命中（子串匹配，无需精确）", () => {
  const r = runExplain("您的小程序涉及营销或广告用途，请整改");
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("review.not-mainly-ads"), "整段文案含「营销」应命中营销广告拒因");
});

test("错误码键位为精确匹配且权重最高", () => {
  // 当前种子未收录任何官方核验错误码（宁缺毋造），codes 应为空——确保没有杜撰的码混入
  const entries = loadRejections();
  for (const e of entries) assert.deepEqual(e.codes ?? [], [], `${e.id} 不应含未核验错误码`);
  // 打分机制本身：构造含 code 的条目，code 命中权重应远高于单个别名
  const fake = { codes: ["99999"], aliases: ["foo"] };
  assert.ok(scoreRejection(fake, "报错 99999") >= 100);
  assert.equal(scoreRejection(fake, "foo"), 1);
});

test("无匹配时返回空结果并给出引导提示，不报错", () => {
  const r = runExplain("完全无关的乱码xyz");
  assert.equal(r.items.length, 0);
  assert.ok(r.notes.some((n) => n.includes("关键词")), "应提示改用关键词重试");
});

test("空查询不命中任何拒因", () => {
  assert.equal(runExplain("").items.length, 0);
  assert.equal(scoreRejection({ aliases: ["营销"] }, ""), 0);
});

test("引用完整性：每条拒因映射的 rule id 必须在规则库真实存在", () => {
  const entries = loadRejections({ includeDrafts: true });
  const { rules } = loadData({ includeDrafts: true });
  const ids = new Set(rules.map((r) => r.id));
  for (const e of entries)
    for (const rid of e.rules)
      assert.ok(ids.has(rid), `拒因 ${e.id} 引用了不存在的规则 id: ${rid}`);
});

test("explain 渲染按拒因分组并附带官方来源", () => {
  const md = render(runExplain("测试号"), "markdown");
  assert.match(md, /拒因解读/);
  assert.match(md, /## .*测试号|## .*账号体系/, "应有按拒因的分组标题");
  assert.match(md, /review\.test-account/);
  assert.match(md, /来源：http/);
});
