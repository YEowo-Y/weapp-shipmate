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
const WEPY = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "wepy-app");
const TPL = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "template-signals");
const UNICOND = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "uni-cond");
const FPG = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fp-guards");
const BROKEN = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "broken-config");

// ── V3/V4（STRENGTHENING_PLAN 阶段2）──
test("V3: 坏 app.json 记录 configErrors 而非静默丢弃（静默会让一致性核验反向误报）", () => {
  const r = scanProject(BROKEN);
  assert.equal(r.configErrors.length, 1);
  assert.equal(r.configErrors[0].file, "app.json");
  assert.match(r.configErrors[0].reason, /解析失败/);
  assert.ok(r.apis.includes("wx.getLocation"), "配置坏了不影响 API 事实提取");
});

test("V4: Taro 动态拼接请求触发 dynamicRequest（此前漏 Taro 命名空间，注记不出）", () => {
  assert.equal(scanProject(TARO).dynamicRequest, true);
});

test("V4: wepy 明文 http 请求进入 insecureHosts（此前漏 wepy 命名空间，无警告）", () => {
  assert.ok(scanProject(WEPY).insecureHosts.includes("insecure.example.com"));
});

test("V4 防过杀: Taro/wepy 静态 URL 不误判为动态拼接（fp-guards 卫兵文件确实被扫到）", () => {
  const r = scanProject(FPG);
  assert.equal(r.dynamicRequest, false);
  assert.ok(r.apis.includes("Taro.request") && r.apis.includes("wepy.request"), "卫兵文件应在扫描范围内");
});

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

// ── uni-app 真实结构盲区（私有真实样本 dogfood 暴露）──
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

test("uni-app 条件编译：剔除非微信分支，保留微信/非平台分支", () => {
  const r = scanProject(UNICOND);
  // 保留：#ifdef MP-WEIXIN、#ifndef APP-NVUE（含微信）、#ifdef VUE3（非平台标记）
  assert.ok(r.apis.includes("uni.getClipboardData"), "#ifdef MP-WEIXIN 分支应保留");
  assert.ok(r.apis.includes("uni.getSystemInfoSync"), "#ifndef APP-NVUE 分支（含微信）应保留");
  assert.ok(r.apis.includes("uni.getStorageSync"), "#ifdef VUE3 非平台标记不应按平台剔除");
  assert.ok(r.configKeys.includes("button.open-type=chooseAvatar"), "#ifdef MP-WEIXIN 模板分支应保留");
  // 剔除：#ifdef APP-PLUS、#ifndef MP-WEIXIN、#ifdef H5（模板）
  assert.ok(!r.apis.includes("uni.scanCode"), "#ifdef APP-PLUS 分支应剔除");
  assert.ok(!r.apis.includes("uni.getRecorderManager"), "#ifndef MP-WEIXIN 分支应剔除");
  assert.ok(!r.domains.includes("h5-only.example"), "#ifdef H5 模板分支的域名应剔除");
});

test("模板级隐私入口：chooseAvatar 按钮 + camera/live-pusher 组件 → 配置信号", () => {
  const r = scanProject(TPL);
  assert.ok(r.configKeys.includes("button.open-type=chooseAvatar"), "应识别 chooseAvatar 头像按钮");
  assert.ok(r.configKeys.includes("component.camera"), "应识别 <camera> 组件");
  assert.ok(r.configKeys.includes("component.live-pusher"), "应识别 <live-pusher> 组件");
  assert.ok(r.configKeys.includes("component.web-view"), "应识别 <web-view> 组件");
});

// ── wepy（.wpy 单文件 + wepy.* 命名空间）盲区 ──
test("wepy: 扫描 .wpy 并提取 wepy.* 调用", () => {
  const r = scanProject(WEPY);
  for (const a of ["wepy.getUserInfo", "wepy.request"])
    assert.ok(r.apis.includes(a), `应从 .wpy 提取 ${a}（.wpy 须在扫描扩展名内、API_RE 须认 wepy.）`);
});

// ── FP 卫兵（dogfood 审计确认的五个扫描器可信度缺陷，回归锁）──
test("静态 URL（冒号后带空格，最常见写法）不误判为动态拼接请求", () => {
  const r = scanProject(FPG);
  assert.equal(r.dynamicRequest, false, 'url: "..." 带空格是主流写法，不是动态拼接');
});

test("header/method 前置的嵌套对象不挡明文请求识别", () => {
  const r = scanProject(FPG);
  assert.ok(
    r.insecureHosts.includes("plain.fpguard.test"),
    `url 前有 header:{...} 时明文 http 仍应命中：${JSON.stringify(r.insecureHosts)}`,
  );
});

test("字符串文案里的 API 名不算真实调用", () => {
  const r = scanProject(FPG);
  assert.ok(!r.apis.includes("wx.getLocation"), "console.log 文案里的 wx.getLocation 不应入 apis");
  assert.ok(r.apis.includes("wx.request"), "真实调用仍应命中");
});

test("WXML 注释掉的组件/按钮/域名不触发信号", () => {
  const r = scanProject(FPG);
  assert.ok(!r.configKeys.includes("component.camera"), "注释里的 <camera> 不应命中");
  assert.ok(!r.configKeys.includes("component.web-view"), "注释里的 <web-view> 不应命中");
  assert.ok(!r.configKeys.includes("button.open-type=getPhoneNumber"), "注释里的手机号按钮不应命中");
  assert.ok(!r.domains.includes("commented.fpguard.test"), "注释里的域名不应进白名单核对清单");
});

test("app.json 尾逗号（JSONC 常态）不再丢失隐私声明", () => {
  const r = scanProject(FPG);
  assert.ok(
    r.configKeys.includes("app.json:requiredPrivateInfos:getLocation"),
    `尾逗号 app.json 的声明应被容错解析：${JSON.stringify(r.configKeys)}`,
  );
});
