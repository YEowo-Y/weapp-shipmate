import { test } from "node:test";
import assert from "node:assert/strict";
import { parseISODate, ageInDays, staleness, uniqueUrls, classifyStatus , classifyUrlHealth, isActionableHealth } from "../src/rot.mjs";

// ── R2/FX-17 + R5（阶段4）：parseISODate 直测 + 坏日期显性化 ──
test("parseISODate: 合法日期为 UTC 零点;非法/缺失得到 Invalid Date（NaN 时间戳）而非抛错", () => {
  const d = parseISODate("2026-01-15");
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCHours(), 0);
  assert.ok(Number.isNaN(parseISODate("garbage").getTime()));
  assert.ok(Number.isNaN(parseISODate(undefined).getTime()));
});

test("staleness: 缺失/非法 last_verified 标 invalid 且按 stale 处理——坏日期不得报'新鲜'逃逸监控", () => {
  const rules = [
    { id: "a.bad", _file: "rules/a.yaml", last_verified: "not-a-date" },
    { id: "a.missing", _file: "rules/a.yaml" },
    { id: "a.ok", _file: "rules/a.yaml", last_verified: "2026-06-01" },
  ];
  const st = staleness(rules, { today: "2026-07-01", staleDays: 180 });
  assert.equal(st[0].invalid, true);
  assert.equal(st[0].stale, true, "非法日期必须按 stale 处理");
  assert.equal(st[1].invalid, true);
  assert.equal(st[1].stale, true, "缺失日期必须按 stale 处理");
  assert.equal(st[2].invalid, false);
  assert.equal(st[2].stale, false);
});

test("ageInDays 按 UTC 整天计算", () => {
  assert.equal(ageInDays("2026-01-01", "2026-01-11"), 10);
  assert.equal(ageInDays("2026-06-14", "2026-06-14"), 0);
});

test("staleness 按阈值标记超期，注入 today 保证确定性", () => {
  const rules = [
    { id: "a.fresh", _file: "rules/a.yaml", last_verified: "2026-06-01" },
    { id: "b.old", _file: "rules/b.yaml", last_verified: "2025-01-01", draft: true },
  ];
  const out = staleness(rules, { today: "2026-06-14", staleDays: 180 });
  const fresh = out.find((s) => s.id === "a.fresh");
  const old = out.find((s) => s.id === "b.old");
  assert.equal(fresh.stale, false);
  assert.equal(old.stale, true);
  assert.equal(old.draft, true);
  assert.ok(old.ageDays > 180);
});

test("uniqueUrls 按 URL 去重并聚合规则 id", () => {
  const rules = [
    { id: "x", official_url: "https://e.com/a" },
    { id: "y", official_url: "https://e.com/a" },
    { id: "z", official_url: "https://e.com/b" },
    { id: "w" }, // 无 url，忽略
  ];
  const urls = uniqueUrls(rules);
  assert.equal(urls.length, 2);
  const a = urls.find((u) => u.url === "https://e.com/a");
  assert.deepEqual(a.ids, ["x", "y"]);
});

test("classifyStatus 区分 ok / dead / inconclusive", () => {
  assert.equal(classifyStatus(200), "ok");
  assert.equal(classifyStatus(404), "dead");
  assert.equal(classifyStatus(410), "dead");
  assert.equal(classifyStatus(0), "dead");
  assert.equal(classifyStatus(403), "inconclusive");
  assert.equal(classifyStatus(301), "inconclusive");
});

test("staleness: 未来 last_verified（超 1 天时区容差）标 invalid+stale——未来日期不得报'新鲜'逃逸监控", () => {
  const rules = [
    { id: "future", last_verified: "2030-01-01" },
    { id: "skew-ok", last_verified: "2026-07-02" }, // "明天"：核验者时区领先 CI 时区的正常情形
    { id: "skew-bad", last_verified: "2026-07-03" }, // 后天：超出时区可解释范围
  ];
  const st = staleness(rules, { today: "2026-07-01", staleDays: 180 });
  assert.equal(st[0].invalid, true, "2030 年的核验日期不可信");
  assert.equal(st[0].stale, true, "未来日期必须按 stale 处理，否则年份手误可逃逸监控一年以上");
  assert.equal(st[1].invalid, false, "±1 天时区偏差不误伤");
  assert.equal(st[1].stale, false);
  assert.equal(st[2].invalid, true);
});

// —— official_url 落地页判定（2026-07-17 审计：只测存活必然漏报）——
test("classifyUrlHealth: 落地页同路径且 2xx 判 ok", () => {
  assert.equal(
    classifyUrlHealth({ status: 200, requestedUrl: "https://a.com/doc/x.html", landedUrl: "https://a.com/doc/x.html" }),
    "ok"
  );
});

test("classifyUrlHealth: 查询串差异不算搬家（?from=… 是站点自加的回链参数）", () => {
  assert.equal(
    classifyUrlHealth({ status: 200, requestedUrl: "https://a.com/doc/x", landedUrl: "https://a.com/doc/x?from=y" }),
    "ok"
  );
});

test("负向控制：301 到别的路径判 moved —— 实测 payment.requires-merchant 的来源已搬家", () => {
  assert.equal(
    classifyUrlHealth({
      status: 200,
      requestedUrl: "https://pay.weixin.qq.com/docs/merchant/products/mini-program-payment/introduction.html",
      landedUrl: "https://pay.weixin.qq.com/doc/v3/merchant/4012791894?from=https%3A%2F%2Fpay.weixin.qq.com%2Fdocs",
    }),
    "moved"
  );
});

test("负向控制：302 到 forceLogin 错误页判 inaccessible —— 实测 login.* 的来源匿名不可读", () => {
  assert.equal(
    classifyUrlHealth({
      status: 200,
      requestedUrl: "https://developers.weixin.qq.com/community/develop/doc/000ea46d08898015317b956c65fc09",
      landedUrl:
        "https://developers.weixin.qq.com/community/error/emergency?forceLogin=true&force_redirect_url=/community/develop/doc/000ea46d08898015317b956c65fc09",
    }),
    "inaccessible"
  );
});

test("旧实现漏报的正是上面两例：跟随重定向后都是 200，classifyStatus 一律判 ok", () => {
  // 这条测试把「为什么需要 classifyUrlHealth」钉死：单看状态码，两个坏 URL 都是健康的。
  assert.equal(classifyStatus(200), "ok");
  assert.equal(classifyStatus(200), "ok");
});

test("moved / inaccessible / dead 均须人工处置；inconclusive 不阻断", () => {
  assert.equal(isActionableHealth("moved"), true);
  assert.equal(isActionableHealth("inaccessible"), true);
  assert.equal(isActionableHealth("dead"), true);
  assert.equal(isActionableHealth("inconclusive"), false);
  assert.equal(isActionableHealth("ok"), false);
});

test("保绿侧：URL 里出现 login 一词不算登录墙 —— 微信自家 wx.login 文档就住在 /login/ 下", () => {
  // 独立复核 P2：/login 会把这个健康的官方文档误判为 inaccessible，
  // 而 rules/login.yaml 恰是最可能引用它的文件 —— 那会让 rot 对一个好来源报红。
  const wxLogin = "https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html";
  assert.equal(classifyUrlHealth({ status: 200, requestedUrl: wxLogin, landedUrl: wxLogin }), "ok");
  // 而真正以 /login 结尾的落地页仍判不可达
  assert.equal(
    classifyUrlHealth({ status: 200, requestedUrl: "https://a.com/doc", landedUrl: "https://a.com/login" }),
    "inaccessible"
  );
});
