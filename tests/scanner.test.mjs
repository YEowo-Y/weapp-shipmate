import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanProject, _stripComments, _normalizeHost } from "../src/scanner.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "sample-app");
const EDGE = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "edge-cases");
const UNI = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "uni-app");
const TARO = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "taro-app");
const MPX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "mpx-app");

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

// ── uni-app 真实结构盲区（dogfood day-private-sample 暴露）──
test("uni-app: 忽略构建/lock/类型声明，框架运行时与募捐域名不污染结果", () => {
  const r = scanProject(UNI);
  assert.ok(!r.apis.includes("wx.createSubpackageApp"), "unpackage 编译产物不应被扫");
  assert.ok(!r.apis.includes("uni.addInterceptor"), ".d.ts 类型声明不应被当成真实调用");
  assert.ok(!r.domains.includes("danger.example"), "unpackage 里的域名不应进结果");
  assert.ok(!r.domains.includes("feross.org"), "package-lock.json 的募捐域名不应进结果");
});

test("uni-app: 真实 uni.* 调用被正常提取", () => {
  const r = scanProject(UNI);
  for (const a of ["uni.getLocation", "uni.chooseImage", "uni.request", "uni.connectSocket"])
    assert.ok(r.apis.includes(a), `应提取 ${a}`);
});

test("uni-app: 模板字面量 host 被拒，只留合法域名", () => {
  const r = scanProject(UNI);
  assert.ok(r.domains.includes("api.example.com"), "合法请求域名应保留");
  assert.ok(!r.domains.some((d) => /[${}]/.test(d)), `占位符 host 不应进域名：${JSON.stringify(r.domains)}`);
});

test("SVG/XML 命名空间 host（www.w3.org）不被当成请求域名", () => {
  const r = scanProject(UNI);
  assert.ok(!r.domains.includes("www.w3.org"), "xmlns 命名空间不应进域名");
  assert.ok(!r.insecureHosts.includes("www.w3.org"), "xmlns 不应触发明文请求告警");
});

test("明文请求只在 url: 语境判定：媒体 src 的 http 不算明文请求", () => {
  const r = scanProject(EDGE);
  assert.ok(r.insecureHosts.includes("plain.req.test"), "请求 url: 里的 http 应判明文请求");
  assert.ok(
    !r.insecureHosts.includes("img.media.test"),
    `<image src> 等媒体资源的 http 不应判明文请求：${JSON.stringify(r.insecureHosts)}`,
  );
});

test("忽略构建/脚本目录（scripts/）：其域名不进扫描结果", () => {
  const r = scanProject(EDGE);
  assert.ok(!r.domains.includes("build-only.test"), "scripts/ 里的构建期域名不应进结果");
});

test("uni-app: 解析 manifest.json 的 mp-weixin 隐私/权限声明（JSONC 带注释）", () => {
  const r = scanProject(UNI);
  assert.ok(
    r.configKeys.includes("app.json:requiredPrivateInfos:getLocation"),
    `应从 manifest mp-weixin 读到 requiredPrivateInfos：${JSON.stringify(r.configKeys)}`,
  );
  assert.ok(
    r.configKeys.includes("app.json:permission:scope.userLocation"),
    "应从 manifest mp-weixin 读到 permission",
  );
});

// ── Taro（React .tsx + Taro.* API + app.config.ts 声明）盲区 ──
test("Taro: 扫描 .tsx 并提取 Taro.* 调用", () => {
  const r = scanProject(TARO);
  for (const a of ["Taro.getLocation", "Taro.chooseImage", "Taro.request"])
    assert.ok(r.apis.includes(a), `应从 .tsx 提取 ${a}（.tsx 须在扫描扩展名内、API_RE 须认 Taro.）`);
});

test("Taro: 从 app.config.ts 提取 requiredPrivateInfos（非 JSON）", () => {
  const r = scanProject(TARO);
  assert.ok(
    r.configKeys.includes("app.json:requiredPrivateInfos:getLocation"),
    `应从 app.config.ts 读到 requiredPrivateInfos：${JSON.stringify(r.configKeys)}`,
  );
});

// ── mpx（.mpx 单文件 + 内嵌 json 配置块）盲区 ──
test("mpx: 扫描 .mpx 并从 <script> 提取 wx.* 调用", () => {
  const r = scanProject(MPX);
  for (const a of ["wx.getLocation", "wx.chooseImage", "wx.request"])
    assert.ok(r.apis.includes(a), `应从 .mpx 的 <script> 提取 ${a}`);
});

test("mpx: 从 app.mpx 的 <script type=application/json> 块提取 requiredPrivateInfos", () => {
  const r = scanProject(MPX);
  assert.ok(
    r.configKeys.includes("app.json:requiredPrivateInfos:getLocation"),
    `应从 app.mpx 内嵌 json 块读到 requiredPrivateInfos：${JSON.stringify(r.configKeys)}`,
  );
});
