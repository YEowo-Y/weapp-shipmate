// src/crosscheck.mjs —— 声明↔调用一致性核验（超越单向规则匹配的代码感知）
// 复用 scanner 已抓取的 apis（调用）与 configKeys（app.json 声明），交叉比对出"调了但没声明"。
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
    action_categories: ["code", "manual_check"],
    title: "位置接口未在 app.json 声明 requiredPrivateInfos",
    stage: "privacy",
    severity: "blocker",
    why: "2022 年 7 月 14 日后发布的小程序如使用下列位置接口，须在 app.json 的 requiredPrivateInfos 中声明，否则接口无法正常使用。请先核对小程序的发布日期。",
    requires: [`若适用，在 app.json 的 requiredPrivateInfos 中补充声明：${missing.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#requiredPrivateInfos",
    source_quote: "自 2022 年 7 月 14 日后发布的小程序，使用以下8个地理位置相关接口时，需要声明该字段，否则将无法正常使用。",
    last_verified: "2026-11-14",
    manual_required: true,
  };
}

// 微信服务端 API 域名（含容灾/就近接入点）——用于提示核对前端代码中出现的服务端域名。
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
    action_categories: ["code", "manual_check"],
    title: "核对前端代码中的微信服务端域名",
    stage: "domain",
    severity: "blocker",
    why: "微信后端 API 应在后端服务器调用，以保护 access_token。请核对这些域名的用途，api.weixin.qq.com 无法配置为小程序服务器域名。",
    requires: [`核对以下微信服务端域名，如有前端直连，改由后端调用：${hit.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/backend-api.html",
    source_quote: "后端 API 不能直接在小程序内通过 wx.request 调用，即 api.weixin.qq.com 不能被配置为服务器域名。",
    last_verified: "2026-11-14",
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
    action_categories: ["code", "manual_check"],
    title: "疑似硬编码密钥（AppSecret/商户密钥）",
    stage: "review",
    severity: "blocker",
    why: "所引官方说明适用于 AppSecret：泄露后账号有被冒用的风险。对于商户密钥等其他键，请按其实际用途核实。",
    requires: [`如确认是真实密钥，将其移出前端源码并在后端保管：${list}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/api_getaccesstoken.html",
    source_quote: "AppSecret 是账号使用后台 API 接口的密钥，请开发者妥善保管，避免因泄露造成账号被其他人冒用等风险。",
    last_verified: "2026-11-14",
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
    action_categories: ["code", "manual_check"],
    title: "核对明文 HTTP 或 WebSocket 请求",
    stage: "domain",
    severity: "warning",
    why: "配置为服务器域名时，普通请求、上传和下载须使用 HTTPS，WebSocket 须使用 WSS。局域网 IP 另有适用条件。",
    requires: [`核对以下地址的用途，用作服务器域名的地址应改为 HTTPS 或 WSS：${hosts.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html",
    source_quote: "域名只支持 https (wx.request、wx.uploadFile、wx.downloadFile) 和 wss (wx.connectSocket) 协议",
    last_verified: "2026-11-14",
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
    action_categories: ["code", "console", "manual_check"],
    title: "核对 IP 或 localhost 的服务器域名用途",
    stage: "domain",
    severity: "warning",
    why: "服务器域名不能使用 IP 地址（小程序的局域网 IP 除外）或 localhost。请确认检出的地址是否用于网络请求。",
    requires: [`若用作服务器域名，将以下地址改为已备案的域名：${hits.join("、")}`],
    warn: null,
    official_url: "https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html",
    source_quote: "域名不能使用 IP 地址（小程序的局域网 IP 除外）或 localhost",
    last_verified: "2026-11-14",
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

// 全命中合成 scan（阶段4复核 MINOR-2）：每个交叉核验都必须被它触发。rule-rot 用它收割内联规则
// 元数据并与 CROSSCHECK_RULE_IDS 对账（缺一即抛），tests/crosscheck.test 用同一常量做聚合器锁——
// 合成 scan 只此一份，不再两处漂移。新增交叉核验时须让它在此 scan 上命中，否则 rot 与测试双双报警。
export const CROSSCHECK_ALL_HIT_SCAN = {
  apis: ["wx.getLocation"],
  configKeys: [],
  domains: ["api.weixin.qq.com", "203.0.113.7"],
  secretHints: [{ file: "a.js", key: "appsecret" }],
  insecureHosts: ["insecure.example.com"],
};

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
