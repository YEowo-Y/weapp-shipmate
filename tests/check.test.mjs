import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/check.mjs";
import { apiMatches } from "../src/data.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");
const LEAK = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "leaky-app");
const UNI = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "uni-app");

test("check 默认即命中已核验的隐私与域名规则", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.getUserProfile"));
  assert.ok(ids.includes("privacy.getLocation"));
  assert.ok(ids.includes("privacy.getPhoneNumber"));
  assert.ok(ids.includes("domain.request-whitelist"));
  assert.ok(ids.includes("privacy.clipboard"), "扫到 wx.getClipboardData 应命中剪贴板隐私规则");
  assert.ok(
    !ids.includes("consistency.requiredPrivateInfos"),
    "夹具 app.json 已声明 getLocation，交叉核验不应误报",
  );
  assert.ok(r.items.length >= 5);
});

test("check 命中项均为非 draft（已核验来源）", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  // 默认不含 draft；命中的应都带真实 source_quote（非占位）
  for (const it of r.items) assert.ok(!/待核验/.test(it.source_quote || ""));
});

test("check 报告动态域名警示并附静态域名清单", () => {
  const r = runCheck(FIX, { subjectType: "personal" });
  assert.ok(r.notes.some((n) => n.includes("动态")));
  const domainItem = r.items.find((i) => i.ruleId === "domain.request-whitelist");
  assert.ok(domainItem.requires.some((x) => x.includes("api.example.com")));
});

test("check 在反例夹具上命中三条安全交叉核验", () => {
  const r = runCheck(LEAK, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("security.hardcoded-secret"), "应命中硬编码密钥");
  assert.ok(ids.includes("security.backend-api-in-frontend"), "应命中前端直连微信服务端 API");
  assert.ok(ids.includes("security.insecure-request"), "应命中明文 http 请求");
});

test("apiMatches: uni.X 与 wx.X 等价匹配", () => {
  const set = new Set(["uni.chooseImage", "wx.getUserProfile"]);
  assert.ok(apiMatches(set, "wx.chooseImage"), "规则 wx.chooseImage 应命中扫到的 uni.chooseImage");
  assert.ok(apiMatches(set, "uni.getUserProfile"), "规则 uni.getUserProfile 应命中扫到的 wx.getUserProfile");
  assert.ok(apiMatches(set, "wx.getUserProfile"), "同名同前缀应命中");
  assert.ok(!apiMatches(set, "wx.getLocation"), "未调用的不应命中");
});

test("uni-app: check 让 uni.* 调用命中 wx.* 规则（BS6），且 manifest 声明免误报", () => {
  const r = runCheck(UNI, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.choosePhotoVideo"), "uni.chooseImage 应命中相册/图片隐私规则");
  assert.ok(ids.includes("privacy.getLocation"), "uni.getLocation 应命中位置隐私规则");
  assert.ok(ids.includes("domain.request-whitelist"), "uni.request 应命中域名白名单规则");
  assert.equal(
    ids.filter((id) => id.startsWith("domain.")).length,
    1,
    "域名规则只应命中一条（apiMatches 让 wx 规则覆盖 uni，不得与已删除的 uni 变体重复）",
  );
  assert.ok(
    !ids.includes("consistency.requiredPrivateInfos"),
    "getLocation 已在 manifest mp-weixin 声明，交叉核验不应误报",
  );
});
