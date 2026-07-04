// src/crosscheck.mjs —— 声明↔调用一致性核验（超越单向规则匹配的代码感知）
// 复用 scanner 已抓取的 apis（调用）与 configKeys（app.json 声明），交叉比对出"调了但没声明"。
// 已核验官方来源（2026-06-15，全局配置文档 requiredPrivateInfos）：纯逻辑 + 官方逐字 source_quote。
import { apiMatches } from "./data.mjs";

// 官方：使用以下 8 个地理位置接口须在 app.json 的 requiredPrivateInfos 声明，否则无法正常使用。
const LOCATION_DECL_APIS = [
  "getLocation",
  "getFuzzyLocation",
  "onLocationChange",
  "startLocationUpdate",
  "startLocationUpdateBackground",
  "chooseLocation",
  "choosePoi",
  "chooseAddress",
];

const DECL_PREFIX = "app.json:requiredPrivateInfos:";

/**
 * 位置接口"代码调用了，但 app.json 的 requiredPrivateInfos 未声明"的一致性核验。
 * @param {{apis?:string[], configKeys?:string[]}} scan
 * @returns {object|null} 命中（有缺声明）则返回报告项，否则 null
 */
export function checkRequiredPrivateInfos(scan = {}) {
  // V3：声明载体读取/解析失败时，「未声明」不再可断言——缺证据时闭嘴（check 层给显式注记），
  // 否则一个坏 app.json 就产出 blocker 级误报，打在工具的可信度红线上。
  if (scan.configErrors?.length) return null;
  const apis = new Set(scan.apis || []);
  const declared = new Set(
    (scan.configKeys || []).filter((k) => k.startsWith(DECL_PREFIX)).map((k) => k.slice(DECL_PREFIX.length)),
  );
  // wx/uni/Taro 等价：源码写 uni./Taro.getLocation，编译到微信即 wx.getLocation。
  const missing = LOCATION_DECL_APIS.filter((name) => apiMatches(apis, `wx.${name}`) && !declared.has(name));
  if (!missing.length) return null;
  return {
    ruleId: "consistency.requiredPrivateInfos",
    title: "位置接口未在 app.json 声明 requiredPrivateInfos",
    stage: "privacy",
    severity: "blocker",
    why: "调用了地理位置接口但未在 app.json 的 requiredPrivateInfos 声明，提审会出现 61040 报错、真机调用会失败",
    requires: [`在 app.json 的 requiredPrivateInfos 中补充声明：${missing.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#requiredPrivateInfos",
    source_quote: "自 2022 年 7 月 14 日后发布的小程序，使用以下8个地理位置相关接口时，需要声明该字段，否则将无法正常使用。",
    last_verified: "2026-06-15",
    manual_required: true,
  };
}

// 微信服务端 API 域名（含容灾/就近接入点）——只该在后端调用，前端直连会泄露 AppSecret。
const BACKEND_HOSTS = [
  "api.weixin.qq.com",
  "api2.weixin.qq.com",
  "sh.api.weixin.qq.com",
  "sz.api.weixin.qq.com",
  "hk.api.weixin.qq.com",
];

/**
 * 前端直连微信服务端 API 的安全核验（AppSecret/access_token 泄露风险）。
 * @param {{domains?:string[]}} scan
 * @returns {object|null}
 */
export function checkBackendApiInFrontend(scan = {}) {
  const hit = (scan.domains || []).filter((d) => BACKEND_HOSTS.includes(d));
  if (!hit.length) return null;
  return {
    ruleId: "security.backend-api-in-frontend",
    title: "前端直连微信服务端 API（AppSecret 泄露风险）",
    stage: "domain",
    severity: "blocker",
    why: "在小程序前端调用 api.weixin.qq.com 等服务端接口，会把 AppSecret/access_token 暴露在客户端，且该域名无法配置进服务器域名白名单；须改为后端服务器调用",
    requires: [`移除前端对以下微信服务端域名的直连，改由后端调用：${hit.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/backend-api.html",
    source_quote: "后端 API 不能直接在小程序内通过 wx.request 调用，即 api.weixin.qq.com 不能被配置为服务器域名。",
    last_verified: "2026-06-15",
    manual_required: true,
  };
}

/**
 * 硬编码密钥安全核验：scanner 已抓到疑似密钥的"文件 + 键名"（绝不含值）。
 * @param {{secretHints?:{file:string,key:string}[]}} scan
 * @returns {object|null}
 */
export function checkHardcodedSecrets(scan = {}) {
  const hints = scan.secretHints || [];
  if (!hints.length) return null;
  const list = hints.map((h) => `${h.file}（${h.key}）`).join("、");
  return {
    ruleId: "security.hardcoded-secret",
    title: "疑似硬编码密钥（AppSecret/商户密钥）",
    stage: "review",
    severity: "blocker",
    why: "AppSecret/商户密钥等后端专用密钥不得打进小程序前端包，一旦随包下发即视为泄露，可被他人冒用",
    requires: [`移除前端源码中的疑似密钥，改由后端持有并调用：${list}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/api_getaccesstoken.html",
    source_quote: "AppSecret是账号使用后台API接口的密钥，请开发者妥善保管，避免因泄露造成账号被其他人冒用等风险。",
    last_verified: "2026-06-15",
    manual_required: true,
  };
}

/**
 * 明文请求安全核验：小程序网络请求只支持 https/wss，扫到 http/ws 域名即提示。
 * @param {{insecureHosts?:string[]}} scan
 * @returns {object|null}
 */
export function checkInsecureRequest(scan = {}) {
  const hosts = scan.insecureHosts || [];
  if (!hosts.length) return null;
  return {
    ruleId: "security.insecure-request",
    title: "明文 http/ws 请求（须改为 https/wss）",
    stage: "domain",
    severity: "warning",
    why: "小程序网络请求只支持 https/wss，明文 http/ws 域名上线后会被拦截、无法通信",
    requires: [`将以下域名改为 https/wss 协议：${hosts.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html",
    source_quote: "域名只支持 https（wx.request、wx.uploadFile、wx.downloadFile）和 wss（wx.connectSocket）协议",
    last_verified: "2026-06-15",
    manual_required: true,
  };
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// 官方"局域网 IP 除外"：排除 10/8、172.16-31/12、192.168/16 私有网段。
function isPrivateLan(host) {
  const m = IPV4_RE.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * 请求域名为 IP/localhost 的核验：服务器域名白名单不支持（局域网 IP 除外）。
 * @param {{domains?:string[]}} scan
 * @returns {object|null}
 */
export function checkIpOrLocalhost(scan = {}) {
  const hits = (scan.domains || []).filter((d) => d === "localhost" || (IPV4_RE.test(d) && !isPrivateLan(d)));
  if (!hits.length) return null;
  return {
    ruleId: "domain.ip-or-localhost",
    title: "请求使用 IP/localhost（不可作合法服务器域名）",
    stage: "domain",
    severity: "warning",
    why: "服务器域名白名单不支持 IP 地址（局域网 IP 除外）或 localhost，上线后这些请求会被拦截",
    requires: [`将以下 IP/localhost 改为已备案的域名：${hits.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html",
    source_quote: "域名不能使用 IP 地址（小程序的局域网 IP 除外）或 localhost",
    last_verified: "2026-06-15",
    manual_required: true,
  };
}

// 所有交叉核验可能产出的 ruleId（合成 id，不在 rules/*.yaml）。供 accuracy 等把它们识别为
// 合法规则而非拼写错误——尤其当某条交叉核验在语料里只作 no_hit 反例、从不命中时。新增交叉核验须同步登记。
export const CROSSCHECK_RULE_IDS = [
  "consistency.requiredPrivateInfos",
  "security.backend-api-in-frontend",
  "security.hardcoded-secret",
  "security.insecure-request",
  "domain.ip-or-localhost",
];

/** 所有交叉核验的入口；后续可在此追加更多一致性核验。 */
export function crossChecks(scan) {
  return [
    checkRequiredPrivateInfos(scan),
    checkBackendApiInFrontend(scan),
    checkHardcodedSecrets(scan),
    checkInsecureRequest(scan),
    checkIpOrLocalhost(scan),
  ].filter(Boolean);
}

export const _LOCATION_DECL_APIS = LOCATION_DECL_APIS; // 供测试
