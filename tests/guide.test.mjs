import { test } from "node:test";
import assert from "node:assert/strict";
import { evalExpr, runGuide } from "../src/guide.mjs";
import { loadData } from "../src/data.mjs";

test("evalExpr 支持 == / != / && / || 与空表达式", () => {
  assert.equal(evalExpr("collects_sensitive == true", { collects_sensitive: true }), true);
  assert.equal(evalExpr("collects_sensitive == true", { collects_sensitive: false }), false);
  assert.equal(evalExpr("subject_type != enterprise", { subject_type: "personal" }), true);
  assert.equal(evalExpr("", {}), true);
  assert.equal(
    evalExpr("has_payment == true || has_server_domain == true", { has_payment: false, has_server_domain: true }),
    true,
  );
});

test("guide 按输入跳过隐私/域名阶段", () => {
  const r = runGuide({ subject_type: "personal", collects_sensitive: false, has_server_domain: false });
  const stages = new Set(r.items.map((i) => i.stage));
  assert.ok(!stages.has("privacy"), "不收集敏感信息应跳过 privacy");
  assert.ok(!stages.has("domain"), "无服务器域名应跳过 domain");
  assert.ok(stages.has("filing"), "备案阶段应始终出现");
});

test("guide 收集敏感信息时含隐私阶段", () => {
  const r = runGuide({ subject_type: "personal", collects_sensitive: true });
  const stages = new Set(r.items.map((i) => i.stage));
  assert.ok(stages.has("privacy"));
});

test("guide 未指定主体时只返回全主体通用规则", () => {
  const r = runGuide({ has_server_domain: true });
  const ids = new Set([...r.items, ...r.selfCheck].map((i) => i.ruleId));
  assert.ok(ids.has("filing.required-before-release"), "全主体规则应继续出现");
  assert.ok(ids.has("domain.must-icp-filed"), "全主体域名规则应继续出现");
  assert.ok(!ids.has("filing.individual-id-materials"), "个人主体备案规则不应在主体未知时出现");
  assert.ok(!ids.has("domain.web-view-personal"), "个人主体 web-view 阻断不应在主体未知时出现");
});

test("guide 默认含已核验的提交审核规则（review 阶段）", () => {
  const r = runGuide({ subject_type: "personal" });
  const reviewIds = r.items.filter((i) => i.stage === "review").map((i) => i.ruleId);
  assert.ok(reviewIds.includes("review.no-inducement"), "应含禁诱导规则");
  assert.ok(reviewIds.includes("review.must-be-finished"), "应含完成品规则");
  assert.ok(reviewIds.includes("review.test-account"), "应含测试号规则");
  assert.ok(reviewIds.length >= 6, "review 阶段应有 6 条已核验规则");
});

test("guide 默认含已核验的登录规范（无 signal → 确定适用，进 items）", () => {
  const r = runGuide({ subject_type: "personal" });
  const ids = new Set(r.items.filter((i) => i.stage === "review").map((i) => i.ruleId));
  assert.ok(ids.has("login.after-experience"), "应含登录后置规则");
  assert.ok(ids.has("login.cancellable"), "应含可取消登录规则");
  assert.ok(ids.has("qualification.provide-materials"), "资质材料规则无 signal，应进 items");
});

test("内容相关规则带 signal（取决于业务）→ 进 selfCheck 而非 items 的确定清单", () => {
  const r = runGuide({ subject_type: "personal" });
  const itemIds = new Set(r.items.map((i) => i.ruleId));
  const selfIds = new Set((r.selfCheck || []).map((i) => i.ruleId));
  // 这些规则是否适用取决于小程序具体功能：不应作为「确定适用」混进 items，应进自查区。
  for (const id of [
    "content.filter-mechanism",
    "payment.virtual-must-use-official",
    "minor.protect",
    "data.collection-consent",
    "outbound.no-recommend-others",
    "outbound.no-induced-app-download",
    "category.medical-hint",
    "category.payment-hint",
  ]) {
    assert.ok(selfIds.has(id), `${id} 应进 selfCheck`);
    assert.ok(!itemIds.has(id), `${id} 不应进 items 的确定清单`);
  }
});

test("空白 guide 不再把内容相关规则当成确定阻断（修假阳性）", () => {
  // 一个未提供任何业务信号的请求：items 的确定清单里不应出现医疗等假阻断。
  const r = runGuide({ subject_type: "personal" });
  const blockers = r.items.filter((i) => i.severity === "blocker").map((i) => i.ruleId);
  assert.ok(!blockers.includes("category.medical-hint"), "医疗类目不应作为确定阻断");
  assert.ok(!blockers.includes("outbound.no-induced-app-download"), "诱导下载不应作为确定阻断");
  assert.ok(!blockers.includes("content.filter-mechanism"), "UGC 过滤不应作为确定阻断");
  // selfCheck 仍保留这些规则（不静默丢弃），供用户按业务自查。
  assert.ok((r.selfCheck || []).length >= 6, "内容相关规则应完整保留在 selfCheck");
});

test("draft 门禁：默认集不含 draft 规则，--include-drafts 为其超集", () => {
  // 不依赖某条具体 draft 规则存在，直接验证门禁不变量（当前已无 draft 规则，机制仍须成立）。
  const def = loadData({ includeDrafts: false });
  const all = loadData({ includeDrafts: true });
  assert.ok(def.rules.every((r) => !r.draft), "默认规则集不得包含 draft 规则");
  assert.ok(all.rules.length >= def.rules.length, "include-drafts 应为默认集的超集");
  const defIds = new Set(def.rules.map((r) => r.id));
  for (const r of all.rules) if (!defIds.has(r.id)) assert.ok(r.draft, `多出的 ${r.id} 必为 draft`);
});

test("guide 所有源码匹配条件均为自查，通用导航仍为确定条目", () => {
  const result = runGuide({ subject_type: "personal", collects_sensitive: true, has_server_domain: true });
  const { rules } = loadData();
  for (const rule of rules.filter(r => ["both", "navigation"].includes(r.kind) && r.subject_type.includes("personal"))) {
    const conditional = !!rule.signal?.length || !!Object.keys(rule.match || {}).length;
    const target = conditional ? result.selfCheck : result.items;
    assert.ok(target.some(item => item.ruleId === rule.id), `${rule.id}: conditional=${conditional}`);
  }
  const webview = result.selfCheck.find(item => item.ruleId === "domain.web-view-personal");
  assert.equal(webview.conditional, true);
  assert.match(webview.why, /尚未确认/);
  assert.doesNotMatch(webview.why, /代码使用了/);
});

// 真实临时源码验证同一规则的未知、扫描未使用、扫描命中三种证据状态。
test("web-view 未扫描只提示条件；扫描无组件不命中，有组件才确定命中", async () => {
  const { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { runCheck } = await import("../src/check.mjs");
  const dir = mkdtempSync(join(tmpdir(), "shipmate-guide-evidence-"));
  const file = join(dir, "App.vue");
  try {
    const guidance = runGuide({ subject_type: "personal", has_server_domain: true });
    assert.ok(guidance.selfCheck.some(item => item.ruleId === "domain.web-view-personal"));
    writeFileSync(file, '<template><view>Hello</view></template>');
    const absent = runCheck(dir, { subjectType: "personal" });
    assert.equal(absent.meta.scan.filesScanned, 1, "跨框架项目不需要 app.json");
    assert.ok(!absent.items.some(item => item.ruleId === "domain.web-view-personal"));
    writeFileSync(file, '<template><web-view src="https://example.com" /></template>');
    const present = runCheck(dir, { subjectType: "personal" });
    const finding = present.items.find(item => item.ruleId === "domain.web-view-personal");
    assert.ok(finding);
    assert.match(finding.why, /代码使用了/);
    assert.equal(finding.conditional, undefined);
  } finally {
    unlinkSync(file);
    rmdirSync(dir);
  }
});

test("注册、身份核验与发布对个人、个体、未知主体均有入口和完成条件", () => {
  for (const subject_type of ["personal", "individual_business", undefined]) {
    const result = runGuide({ subject_type });
    for (const stage of ["registration", "certification", "release"]) {
      const entries = result.items.filter(item => item.stage === stage);
      assert.equal(entries.length, 1, `${subject_type}/${stage} 不重复新增导航项`);
      const item = entries[0];
      assert.equal(item.severity, "info");
      assert.ok(item.official_url?.startsWith("https://developers.weixin.qq.com/"));
      const steps = item.requires.join("\n");
      assert.match(steps, /https:\/\/mp.weixin.qq.com\//);
      assert.match(steps, /完成条件：/);
      assert.doesNotMatch(steps, /暂无细化规则/);
      assert.ok(item.requires.length >= 3);
    }
  }
});

test("身份核验区分个人、个体与未知，不把材料核对当资格保证", () => {
  const get = subject_type => runGuide({ subject_type }).items.find(item => item.stage === "certification");
  assert.match(get("personal").requires.join("\n"), /个人.*管理员/);
  assert.match(get("individual_business").requires.join("\n"), /营业执照/);
  assert.match(get(undefined).requires.join("\n"), /主体类型尚未确认/);
  for (const subject of ["personal", "individual_business", undefined]) {
    const item = get(subject);
    assert.match(item.requires.join("\n"), /不代表.*认证.*支付/);
    assert.equal(item.source_quote, undefined, "人工导航不伪造规则摘录");
    assert.equal(item.manual_required, true);
  }
});
