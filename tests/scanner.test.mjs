import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  scanProject,
  stripUniConditional,
  blankStrings,
  _stripComments,
  _normalizeHost,
  _extractFacts,
  _parseAppConfig,
} from "../src/scanner.mjs";

// ── R2/FX-17（阶段4）：已导出纯函数直测——R1 重构 scanProject 期间防静默回归 ──
test("stripUniConditional: 非微信平台分支剔除，微信/未知标记分支保守保留", () => {
  const src = [
    "// #ifdef H5", "wx.h5only()", "// #endif",
    "// #ifdef MP-WEIXIN", "wx.weixinOnly()", "// #endif",
    "// #ifdef VUE3", "wx.unknownToken()", "// #endif",
    "wx.always()",
  ].join("\n");
  const out = stripUniConditional(src);
  assert.ok(!out.includes("h5only"), "H5 分支应剔除");
  assert.ok(out.includes("weixinOnly"), "MP-WEIXIN 分支应保留");
  assert.ok(out.includes("unknownToken"), "未知标记（VUE3）无法判定，按保守保留");
  assert.ok(out.includes("always"));
});

test("stripUniConditional: #ifndef 指向微信剔除该分支；|| 表达式须全为非微信平台才剔除", () => {
  const a = stripUniConditional("// #ifndef MP-WEIXIN\nwx.notWeixin()\n// #endif\nwx.keep()");
  assert.ok(!a.includes("notWeixin"));
  assert.ok(a.includes("keep"));
  const b = stripUniConditional("// #ifdef H5 || MP-WEIXIN\nwx.mixed()\n// #endif");
  assert.ok(b.includes("mixed"), "含微信的 || 表达式不得剔除");
  const c = stripUniConditional("// #ifdef H5 || APP-PLUS\nwx.allNon()\n// #endif");
  assert.ok(!c.includes("allNon"), "全为非微信平台才剔除");
});

test("stripUniConditional: 嵌套条件 + HTML 注释形式标记（模板文件写法）", () => {
  const src = [
    "<!-- #ifdef MP-WEIXIN -->", "<view>wx-part</view>",
    "<!-- #ifdef H5 -->", "<view>h5-inner</view>", "<!-- #endif -->",
    "<!-- #endif -->",
  ].join("\n");
  const out = stripUniConditional(src);
  assert.ok(out.includes("wx-part"));
  assert.ok(!out.includes("h5-inner"), "嵌套内层 H5 应剔除");
});

test("stripUniConditional: 不平衡 #ifdef（缺 #endif）截断其后全部内容——已知限制的行为锁", () => {
  // 这是文档化的当前行为而非期望行为：若有意修复未闭合分支的容错，请连同本锁一起显性更新。
  const out = stripUniConditional("// #ifdef H5\nwx.h5()\nwx.after()");
  assert.ok(!out.includes("wx.after"));
});

// ── R3（阶段4，D2 拍板）：正则字面量感知——此前两类静默漏报的直接回归锁 ──
test("R3: 正则字面量不再毒化注释/字符串跟踪（JS 文件启用 regexAware）", () => {
  const t1 = _stripComments('const parts = s.split(/"/); wx.getLocation({});', true);
  assert.ok(t1.includes("wx.getLocation"), '/"/  不得把后续代码吞进字符串');
  const t2 = _stripComments("const re = /\\//; wx.getLocation({});", true);
  assert.ok(t2.includes("wx.getLocation"), "/\\//  不得把行尾吞进 // 注释");
  const t3 = _stripComments("a = b / c; // note\nwx.q()", true);
  assert.ok(t3.includes("wx.q") && !t3.includes("note"), "除号不误判、注释照剥");
  const t4 = _stripComments("const f = () => /x/.test(s); wx.k()", true);
  assert.ok(t4.includes("wx.k"), "箭头函数 => 后的 / 是正则位置");
});

test("R3: 正则文本里的 API 名不是真实调用；模板文件默认不启用（闭合标签防误伤）", () => {
  const code = _stripComments("const NAME = /wx.chooseAddress/; wx.getUserProfile()", true);
  const blanked = blankStrings(code, true);
  assert.ok(!blanked.includes("chooseAddress"), "正则体应整体置为中性 token");
  assert.ok(blanked.includes("wx.getUserProfile"), "字面量外的真实调用保留");
  const tpl = _stripComments("<view>a</view><camera/>", false);
  assert.ok(tpl.includes("</view>") && tpl.includes("<camera/>"), "模板闭合标签不受启发式影响");
});

// R3 补（阶段4复核 MINOR-1）：字符串引号后的 / 必为除号——一行式 JSX 自闭合标签
// （属性引号 + /）曾被判为正则起点，吞掉同行后续的真实调用（探针确认的回归走廊）。
test("R3 补: 一行式 JSX 自闭合标签后的同行 API 调用不得丢失", () => {
  const facts = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _extractFacts(
    "page.tsx",
    'export const v = () => { return <View><Icon type="a"/>{Taro.scanCode()}</View>; };',
    "page.tsx",
    facts,
  );
  assert.ok(facts.apis.has("Taro.scanCode"), "自闭合标签（引号+/）后的调用曾被当正则吞掉");
});

// ── R4（阶段4，D2 拍板）：Taro 具名导入映射 + 配置载体"提取不到 ≠ 未声明" ──
test("R4: Taro 具名导入映射为 wx.* 事实（含 as 别名与 default+具名混合）", () => {
  const facts = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _extractFacts(
    "page.ts",
    'import Taro, { getLocation, chooseImage as pick } from "@tarojs/taro";\ngetLocation(); pick();',
    "page.ts",
    facts,
  );
  assert.ok(facts.apis.has("wx.getLocation"), "具名导入应映射为 wx.getLocation");
  assert.ok(facts.apis.has("wx.chooseImage"), "as 别名应取导出名而非本地名");
});

test("R4: 具名导入映射不适用于模板文件与其他包名", () => {
  const facts = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _extractFacts("comp.vue", 'import { getLocation } from "@tarojs/taro";', "comp.vue", facts);
  assert.ok(!facts.apis.has("wx.getLocation"), "模板扩展名不启用（regexAware 同门）");
  const facts2 = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _extractFacts("page.ts", 'import { getLocation } from "some-lib";', "page.ts", facts2);
  assert.ok(!facts2.apis.has("wx.getLocation"), "非 @tarojs/taro 包不映射");
});

test("R4: 配置载体提取失败记 configErrors——Taro 非数组字面量声明 / mpx 配置块无法定位", () => {
  const facts = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _parseAppConfig("app.config.ts", "const P = [...base];\nexport default { requiredPrivateInfos: P };", "src/app.config.ts", facts);
  assert.equal(facts.configErrors.length, 1, "变量声明提取不到必须记录，不得当'未声明'");
  assert.match(facts.configErrors[0].reason, /非数组字面量/);
  const facts2 = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _parseAppConfig("app.mpx", '<script type=application/json>{"pages":[]}</script', "app.mpx", facts2);
  assert.equal(facts2.configErrors.length, 1, "块定位失败必须记录");
  const facts3 = { apis: new Set(), domains: new Set(), configKeys: new Set(), secretHints: new Set(), insecureHosts: new Set(), configErrors: [], dynamicRequest: false };
  _parseAppConfig("app.config.ts", "export default { pages: [] };", "src/app.config.ts", facts3);
  assert.equal(facts3.configErrors.length, 0, "根本没有声明字样时不是错误（项目可不使用隐私接口）");
});

test("blankStrings: 字符串内容置空保留定界符；转义安全；模板字面量插值取舍锁", () => {
  assert.equal(blankStrings('a("wx.getLocation")'), 'a("")');
  assert.equal(blankStrings("a('x\\'y')"), "a('')", "字符串内转义引号不得提前终结置空");
  // 文档化取舍（scanner.mjs blankStrings 注释）：${} 插值里的真实调用一并置空，换取文案引用 API 名不误报。
  const out = blankStrings("const s = `pre ${wx.getLocation()} post`; wx.real()");
  assert.ok(!out.includes("getLocation"), "模板字面量整体置空（含插值）");
  assert.ok(out.includes("wx.real"), "字面量外的真实调用保留");
});

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
