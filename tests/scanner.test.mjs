import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanProject, _stripComments, _normalizeHost } from "../src/scanner.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");
const EDGE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "edge-cases");

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

test("stripComments 去掉行/块注释但保留字符串里的 // 与 URL", () => {
  // 注释里的代码应被剥离
  assert.ok(!/getLocation/.test(_stripComments("// wx.getLocation()\n")));
  assert.ok(!/getFuzzyLocation/.test(_stripComments("/* wx.getFuzzyLocation() */")));
  // 字符串里的 https:// 不能被误当成注释起点而破坏（关键：避免重新引入错误）
  const code = _stripComments('wx.request({ url: "https://api.example.com/x" })');
  assert.match(code, /https:\/\/api\.example\.com\/x/);
  assert.match(code, /wx\.request/);
  // 真实代码后的行尾注释：保留代码、去掉注释
  const mixed = _stripComments('wx.getUserProfile() // 触发隐私接口\n');
  assert.match(mixed, /wx\.getUserProfile/);
  assert.ok(!/触发隐私接口/.test(mixed));
});

test("normalizeHost 去掉 userinfo 与端口（否则安全核验会被绕过）", () => {
  assert.equal(_normalizeHost("api.example.com:8443"), "api.example.com");
  assert.equal(_normalizeHost("user@cdn.example.com"), "cdn.example.com");
  assert.equal(_normalizeHost("user:pass@api.weixin.qq.com:443"), "api.weixin.qq.com");
  assert.equal(_normalizeHost("API.Example.COM"), "api.example.com");
  assert.equal(_normalizeHost("api.example.com"), "api.example.com");
});

test("scanner 不把注释里的 API 当成真实调用", () => {
  const r = scanProject(EDGE);
  assert.ok(r.apis.includes("wx.getUserProfile"), "注释外的真实调用应命中");
  assert.ok(!r.apis.includes("wx.getLocation"), "行注释里的 getLocation 不应命中");
  assert.ok(!r.apis.includes("wx.getFuzzyLocation"), "块注释里的 getFuzzyLocation 不应命中");
});

test("scanner 归一带端口/userinfo 的请求域名", () => {
  const r = scanProject(EDGE);
  assert.ok(r.domains.includes("api.example.com"), "带端口的域名应归一为裸 host");
  assert.ok(!r.domains.some((d) => d.includes(":")), "域名不应残留端口");
  assert.ok(r.domains.includes("cdn.example.com"), "带 userinfo 的域名应归一为裸 host");
  assert.ok(!r.domains.some((d) => d.includes("@")), "域名不应残留 userinfo");
});
