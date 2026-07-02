// src/check.mjs —— 代码感知预检引擎：扫描结果 × preflight 规则 → 个性化清单
import { loadData, ruleToItem, apiMatches } from "./data.mjs";
import { scanProject } from "./scanner.mjs";
import { crossChecks } from "./crosscheck.mjs";

/**
 * @param {string} dir 小程序项目目录
 * @param {{subjectType?:string, includeDrafts?:boolean}} opts
 */
export function runCheck(dir, { subjectType, includeDrafts = false } = {}) {
  const scan = scanProject(dir);
  const { rules } = loadData({ includeDrafts });
  const apiSet = new Set(scan.apis);
  const cfgSet = new Set(scan.configKeys);
  const items = [];

  for (const r of rules) {
    if (r.kind !== "preflight" && r.kind !== "both") continue;
    // 主体过滤：指定主体 → 按 subject_type 命中；未指定主体 → 只发"全主体通用"规则。
    // 主体专属规则（如个人主体专属的 web-view 阻断）须确认主体后才发，否则会对非该主体用户误报（dogfood 实证）。
    if (subjectType) {
      if (!r.subject_type.includes(subjectType)) continue;
    } else if (r.subject_type.length < 3) {
      continue;
    }
    const m = r.match || {};
    const apiHit = m.api && m.api.some((a) => apiMatches(apiSet, a)); // uni.X ≡ wx.X
    const cfgHit = m.config_key && m.config_key.some((k) => cfgSet.has(k));
    if (!apiHit && !cfgHit) continue;

    const item = ruleToItem(r);
    if (r.stage === "domain") {
      if (scan.domains.length)
        item.requires = [...item.requires, `检测到出站域名（请逐一核对是否已配白名单）：${scan.domains.join("、")}`];
      if (scan.dynamicRequest && m.dynamic_note) item.note = m.dynamic_note;
    }
    items.push(item);
  }

  // 声明↔调用一致性核验（如位置接口调用了但 app.json 未声明 requiredPrivateInfos）。
  for (const finding of crossChecks(scan)) items.push(finding);

  const notes = [];
  // FX-14：扫描 0 个文件时"未命中任何规则"是虚假安心（指错目录是新手最常见的第一步错误），
  // 必须显式声明本报告不构成任何结论。
  if (scan.filesScanned === 0)
    notes.push("⚠️ 未在该目录发现可识别的小程序源码文件（扫描 0 个文件）——请确认路径指向小程序项目根目录。本报告不构成任何「已通过检查」的结论。");
  if (scan.dynamicRequest)
    notes.push("检测到动态拼接的请求 URL（如 baseURL + path），静态扫描可能漏报真实域名，请人工核对全部出站域名。");
  if (includeDrafts) notes.push("已包含 draft 规则（来源未核验，仅供参考）。");

  const summary = `扫描 ${scan.filesScanned} 个文件：发现 API ${scan.apis.length} 个、域名 ${scan.domains.length} 个、配置信号 ${scan.configKeys.length} 个，命中 ${items.length} 条规则。`;
  return { command: "check", meta: { summary, scan }, items, notes };
}
