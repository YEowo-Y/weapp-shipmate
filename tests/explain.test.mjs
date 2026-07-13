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

test("扩充覆盖：备案/域名/隐私接口/未成年等关键词各自路由到对应规则", () => {
  const cases = [
    ["备案", "filing.required-before-release"],
    ["域名白名单", "domain.request-whitelist"],
    ["麦克风", "privacy.record"],
    ["剪贴板", "privacy.clipboard"],
    ["相机", "privacy.camera"],
    ["未成年", "minor.protect"],
    ["收集数据", "data.collection-consent"],
  ];
  for (const [q, expected] of cases) {
    const ids = runExplain(q).items.map((i) => i.ruleId);
    assert.ok(ids.includes(expected), `「${q}」应命中 ${expected}，实得 ${ids.join(",") || "(空)"}`);
  }
});

test("语义拆分：虚拟支付与电商类目互不串味", () => {
  const vp = runExplain("虚拟支付").items.map((i) => i.ruleId);
  assert.ok(vp.includes("payment.virtual-must-use-official"));
  assert.ok(!vp.includes("category.payment-hint"), "虚拟支付不应混入电商类目规则");
  const ec = runExplain("电商").items.map((i) => i.ruleId);
  assert.ok(ec.includes("category.payment-hint"));
  assert.ok(!ec.includes("payment.virtual-must-use-official"), "电商不应混入虚拟支付规则");
});

test("explain 渲染按拒因分组并附带官方来源", () => {
  const md = render(runExplain("测试号"), "markdown");
  assert.match(md, /拒因解读/);
  assert.match(md, /## .*测试号|## .*账号体系/, "应有按拒因的分组标题");
  assert.match(md, /review\.test-account/);
  assert.match(md, /来源：http/);
});

test("explain Markdown 净化查询中的结构语法、HTML 与控制字符，JSON 保留原查询", () => {
  const query = "隐私」\n\n## harmless-marker <tag> `code` ~~strike~~ \u202E";
  const result = runExplain(query);
  const md = render(result, "markdown");
  const json = JSON.parse(render(result, "json"));

  assert.equal(result.meta.query, query, "引擎结果不得改写调用方查询");
  assert.equal(json.meta.query, query, "结构化 JSON 必须保留原查询");
  assert.doesNotMatch(md, /^## harmless-marker/m, "查询不得注入 Markdown 标题");
  assert.ok(!md.includes("<tag>"), "查询中的 HTML 标签必须转义");
  assert.ok(!md.includes("~~strike~~"), "查询不得注入 GFM 删除线");
  assert.ok(!md.includes("\u202E"), "双向文本控制字符不得进入 Markdown");
});
