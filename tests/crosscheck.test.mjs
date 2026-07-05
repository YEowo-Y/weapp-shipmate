import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRequiredPrivateInfos,
  checkBackendApiInFrontend,
  checkHardcodedSecrets,
  checkInsecureRequest,
  checkIpOrLocalhost,
  crossChecks,
  CROSSCHECK_RULE_IDS,
  CROSSCHECK_ALL_HIT_SCAN,
  _LOCATION_DECL_APIS,
} from "../src/crosscheck.mjs";

// R2/FX-17（阶段4）：位置声明键集合的直接行为锁——R1 重构期间此集合漂移会静默改变一致性核验范围。
test("_LOCATION_DECL_APIS: 非空、无重复、含核心项、均为裸声明键名（不带 wx. 前缀）", () => {
  assert.ok(_LOCATION_DECL_APIS.length >= 8);
  assert.equal(new Set(_LOCATION_DECL_APIS).size, _LOCATION_DECL_APIS.length, "不得有重复项");
  for (const core of ["getLocation", "chooseLocation", "chooseAddress"])
    assert.ok(_LOCATION_DECL_APIS.includes(core), `核心声明键缺失：${core}`);
  for (const n of _LOCATION_DECL_APIS)
    assert.ok(!n.startsWith("wx."), `声明键应为裸名（requiredPrivateInfos 语义）：${n}`);
});

// 聚合器 ↔ 登记清单一致性锁：单项 check 从聚合器被删/新 check 忘挂载或忘登记时，
// 单元测试与 accuracy（consistency/ip 两条只有 no_hit 标注）都不会翻红——只有这里会。
test("crossChecks 聚合器：全命中 scan 产出的 ruleId 集合 ≡ CROSSCHECK_RULE_IDS", () => {
  // 合成 scan 用 crosscheck.mjs 导出的共享常量（阶段4复核 MINOR-2）——rule-rot 的元数据收割
  // 依赖同一常量并对账,本测试锁住"每个交叉核验都被它触发",两个消费方不再各自漂移。
  const ids = crossChecks(CROSSCHECK_ALL_HIT_SCAN).map((i) => i.ruleId).sort();
  assert.deepEqual(ids, [...CROSSCHECK_RULE_IDS].sort(), "聚合器产出与登记清单漂移");
});

test("调用位置接口但未声明 requiredPrivateInfos → 命中（blocker）", () => {
  const item = checkRequiredPrivateInfos({ apis: ["wx.getLocation"], configKeys: [] });
  assert.ok(item, "应命中");
  assert.equal(item.ruleId, "consistency.requiredPrivateInfos");
  assert.equal(item.severity, "blocker");
  assert.match(item.requires[0], /getLocation/);
});

test("已在 app.json 声明 → 不命中", () => {
  const item = checkRequiredPrivateInfos({
    apis: ["wx.getLocation"],
    configKeys: ["app.json:requiredPrivateInfos:getLocation"],
  });
  assert.equal(item, null);
});

test("仅调用非位置接口 → 不命中", () => {
  const item = checkRequiredPrivateInfos({ apis: ["wx.getClipboardData"], configKeys: [] });
  assert.equal(item, null);
});

test("部分声明：只报缺失的那个", () => {
  const item = checkRequiredPrivateInfos({
    apis: ["wx.getLocation", "wx.chooseLocation"],
    configKeys: ["app.json:requiredPrivateInfos:getLocation"],
  });
  assert.ok(item);
  assert.match(item.requires[0], /chooseLocation/);
  assert.ok(!/getLocation、/.test(item.requires[0]), "已声明的 getLocation 不应再报");
});

test("前端出现 api.weixin.qq.com → 命中安全核验（blocker）", () => {
  const item = checkBackendApiInFrontend({ domains: ["api.weixin.qq.com"] });
  assert.ok(item);
  assert.equal(item.ruleId, "security.backend-api-in-frontend");
  assert.equal(item.severity, "blocker");
});

test("容灾变体 sh.api.weixin.qq.com 也命中", () => {
  assert.ok(checkBackendApiInFrontend({ domains: ["sh.api.weixin.qq.com"] }));
});

test("普通业务域名不命中安全核验", () => {
  assert.equal(checkBackendApiInFrontend({ domains: ["api.example.com"] }), null);
});

test("scanner 给出 secretHints → 命中硬编码密钥（blocker，只列文件+键名）", () => {
  const item = checkHardcodedSecrets({ secretHints: [{ file: "pages/index/index.js", key: "appsecret" }] });
  assert.ok(item);
  assert.equal(item.ruleId, "security.hardcoded-secret");
  assert.equal(item.severity, "blocker");
  assert.match(item.requires[0], /appsecret/);
  assert.match(item.requires[0], /index\.js/);
});

test("无 secretHints → 不命中", () => {
  assert.equal(checkHardcodedSecrets({ secretHints: [] }), null);
  assert.equal(checkHardcodedSecrets({}), null);
});

test("明文 http/ws 域名 → 命中（warning），列出域名", () => {
  const item = checkInsecureRequest({ insecureHosts: ["plain.example.com"] });
  assert.ok(item);
  assert.equal(item.ruleId, "security.insecure-request");
  assert.equal(item.severity, "warning");
  assert.match(item.requires[0], /plain\.example\.com/);
});

test("无明文域名 → 不命中", () => {
  assert.equal(checkInsecureRequest({ insecureHosts: [] }), null);
});

test("公网 IP 与 localhost → 命中（warning）", () => {
  const item = checkIpOrLocalhost({ domains: ["203.0.113.5", "localhost", "api.example.com"] });
  assert.ok(item);
  assert.equal(item.ruleId, "domain.ip-or-localhost");
  assert.match(item.requires[0], /203\.0\.113\.5/);
  assert.match(item.requires[0], /localhost/);
  assert.ok(!/api\.example\.com/.test(item.requires[0]), "正常域名不应被列入");
});

test("局域网 IP 与正常域名 → 不命中（官方除外）", () => {
  assert.equal(checkIpOrLocalhost({ domains: ["192.168.1.10", "10.0.0.2", "172.16.5.5", "api.example.com"] }), null);
});
