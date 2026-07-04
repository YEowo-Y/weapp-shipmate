import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "../src/check.mjs";
import { apiMatches } from "../src/data.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");
const LEAK = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "leaky-app");
const UNI = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "uni-app");
const TARO = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "taro-app");
const MPX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "mpx-app");
const WEPY = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "wepy-app");
const TPL = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "template-signals");
const BROKEN = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "broken-config");

// V3（STRENGTHENING_PLAN 阶段2）：配置载体解析失败时，一致性核验缺证据须闭嘴并出显式注记——
// 此前静默丢配置 → configKeys 为空 → 反向断言"未声明" → blocker 级误报（锁屏级可信度缺陷）。
test("V3: 坏 app.json → 一致性核验闭嘴 + 显式注记，不产出 blocker 误报", () => {
  const r = runCheck(BROKEN, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.getLocation"), "API 事实提取不受配置故障影响");
  assert.ok(!ids.includes("consistency.requiredPrivateInfos"), "缺证据不得断言'未声明'");
  assert.ok(r.notes.some((n) => n.includes("配置文件读取/解析失败")), "须显式说明为什么没查");
});

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

// V1（STRENGTHENING_PLAN 阶段2）：FX-06 校验下沉引擎层。非法主体静默滤掉全部规则
// 会产出"看似合规"的空报告——CLI 早已拒绝，但直接调用方（MCP/未来嵌入方）此前不设防。
test("runCheck 非法 subjectType 直接抛错，不得静默产出伪清白报告", () => {
  assert.throws(() => runCheck(FIX, { subjectType: "Personal" }), /非法 subject/);
  assert.throws(() => runCheck(FIX, { subjectType: "个人" }), /personal \| individual_business \| enterprise/);
  assert.throws(() => runCheck(FIX, { subjectType: "" }), /非法 subject/, "空字符串也应拒绝而非静默降级");
});

// G5（STRENGTHENING_PLAN 阶段1）：不带 subject 的过滤分支（check.mjs subject_type.length<3）
// 是 dogfood 在真实样本上抓到过 FP 的历史缺陷类（个人专属阻断对通用口径误发），此前无 CI 锁。
test("check 不带 subject：只发全主体通用规则，主体专属规则不得命中", () => {
  const r = runCheck(TPL, {});
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("domain.web-view-business"), "全主体通用规则（web-view 业务域名）应命中");
  assert.ok(
    !ids.includes("domain.web-view-personal"),
    "个人主体专属阻断在不带 subject 时不得命中（dogfood 实抓的 FP 类）",
  );
});

test("apiMatches: wx / uni / Taro / wepy 等价匹配", () => {
  const set = new Set(["uni.chooseImage", "wx.getUserProfile", "Taro.getLocation", "wepy.request"]);
  assert.ok(apiMatches(set, "wx.chooseImage"), "规则 wx.chooseImage 应命中扫到的 uni.chooseImage");
  assert.ok(apiMatches(set, "uni.getUserProfile"), "规则 uni.getUserProfile 应命中扫到的 wx.getUserProfile");
  assert.ok(apiMatches(set, "wx.getLocation"), "规则 wx.getLocation 应命中扫到的 Taro.getLocation");
  assert.ok(apiMatches(set, "wx.request"), "规则 wx.request 应命中扫到的 wepy.request");
  assert.ok(apiMatches(set, "wx.getUserProfile"), "同名同前缀应命中");
  assert.ok(!apiMatches(set, "wx.getPhoneNumber"), "未调用的不应命中");
});

test("wepy: check 让 wepy.* 命中 wx.* 规则（.wpy 单文件）", () => {
  const r = runCheck(WEPY, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.getUserProfile"), "wepy.getUserInfo 应命中用户信息隐私规则");
  assert.ok(ids.includes("domain.request-whitelist"), "wepy.request 应命中域名白名单规则");
});

test("payment: wx.requestPayment 命中支付商户准入预检规则（覆盖 uni/Taro/wepy 变体）", () => {
  const r = runCheck(WEPY, { subjectType: "personal" }); // wepy 夹具含 wx.requestPayment
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("payment.requires-merchant"), "wx.requestPayment 应命中支付商户准入规则");
});

test("模板级隐私：chooseAvatar/相机/直播组件命中对应隐私规则（JS 调用扫不到）", () => {
  const r = runCheck(TPL, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.getUserProfile"), "chooseAvatar（头像）应命中用户信息隐私规则");
  assert.ok(ids.includes("privacy.camera"), "<camera>/<live-pusher> 应命中摄像头隐私规则");
  assert.ok(ids.includes("privacy.record"), "<live-pusher> 应命中麦克风隐私规则");
  assert.ok(ids.includes("domain.web-view-business"), "<web-view> 应命中业务域名预检规则");
});

test("Taro: check 让 Taro.* 命中 wx.* 规则，app.config 声明免误报", () => {
  const r = runCheck(TARO, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.choosePhotoVideo"), "Taro.chooseImage 应命中相册/图片隐私规则");
  assert.ok(ids.includes("privacy.getLocation"), "Taro.getLocation 应命中位置隐私规则");
  assert.ok(ids.includes("domain.request-whitelist"), "Taro.request 应命中域名白名单规则");
  assert.ok(
    !ids.includes("consistency.requiredPrivateInfos"),
    "getLocation 已在 app.config.ts 声明，交叉核验不应误报",
  );
});

test("mpx: check 在 .mpx 上命中隐私/域名规则，内嵌 json 声明免误报", () => {
  const r = runCheck(MPX, { subjectType: "personal" });
  const ids = r.items.map((i) => i.ruleId);
  assert.ok(ids.includes("privacy.choosePhotoVideo"), "wx.chooseImage 应命中相册/图片隐私规则");
  assert.ok(ids.includes("privacy.getLocation"), "wx.getLocation 应命中位置隐私规则");
  assert.ok(ids.includes("domain.request-whitelist"), "wx.request 应命中域名白名单规则");
  assert.ok(
    !ids.includes("consistency.requiredPrivateInfos"),
    "getLocation 已在 app.mpx json 块声明，交叉核验不应误报",
  );
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
