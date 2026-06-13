import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanProject } from "../src/scanner.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");

test("scanner 提取 wx API", () => {
  const r = scanProject(FIX);
  assert.ok(r.apis.includes("wx.getUserProfile"));
  assert.ok(r.apis.includes("wx.getLocation"));
  assert.ok(r.apis.includes("wx.request"));
});

test("scanner 提取静态域名并标记动态请求", () => {
  const r = scanProject(FIX);
  assert.ok(r.domains.includes("api.example.com"));
  assert.equal(r.dynamicRequest, true);
});

test("scanner 提取配置信号（手机号按钮 + app.json 隐私接口）", () => {
  const r = scanProject(FIX);
  assert.ok(r.configKeys.includes("button.open-type=getPhoneNumber"));
  assert.ok(r.configKeys.includes("app.json:requiredPrivateInfos:getLocation"));
});
