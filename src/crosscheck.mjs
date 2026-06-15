// src/crosscheck.mjs —— 声明↔调用一致性核验（超越单向规则匹配的代码感知）
// 复用 scanner 已抓取的 apis（调用）与 configKeys（app.json 声明），交叉比对出"调了但没声明"。
// 已核验官方来源（2026-06-15，全局配置文档 requiredPrivateInfos）：纯逻辑 + 官方逐字 source_quote。

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
  const apis = new Set(scan.apis || []);
  const declared = new Set(
    (scan.configKeys || []).filter((k) => k.startsWith(DECL_PREFIX)).map((k) => k.slice(DECL_PREFIX.length)),
  );
  const missing = LOCATION_DECL_APIS.filter((name) => apis.has(`wx.${name}`) && !declared.has(name));
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

/** 所有交叉核验的入口；后续可在此追加更多一致性核验。 */
export function crossChecks(scan) {
  return [checkRequiredPrivateInfos(scan), checkBackendApiInFrontend(scan)].filter(Boolean);
}

export const _LOCATION_DECL_APIS = LOCATION_DECL_APIS; // 供测试
