import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequiredPrivateInfos } from "../src/crosscheck.mjs";

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
