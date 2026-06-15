import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequiredPrivateInfos, checkBackendApiInFrontend } from "../src/crosscheck.mjs";

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
