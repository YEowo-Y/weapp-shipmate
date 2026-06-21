// src/data.mjs —— 规则与流程的统一加载器（导航与预检共用的"事实源"读取层）
// 默认排除 draft 规则（未核验来源的种子不进默认输出，见 GOVERNANCE.md）。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const readYaml = (p) => yaml.load(readFileSync(p, "utf-8"));

/**
 * 加载 flow.yaml 与 rules/*.yaml。
 * @param {{includeDrafts?: boolean, root?: string}} opts
 * @returns {{ flow: object[], rules: object[] }}
 */
export function loadData({ includeDrafts = false, root = ROOT } = {}) {
  const flow = readYaml(join(root, "flow.yaml")).stages;
  const rulesDir = join(root, "rules");
  const rules = [];
  for (const f of readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).sort()) {
    const doc = readYaml(join(rulesDir, f));
    for (const r of doc.rules) {
      if (!includeDrafts && r.draft) continue;
      rules.push({ ...r, _file: `rules/${f}` });
    }
  }
  return { flow, rules };
}

/** 按 stage 取出该阶段的规则；可选按 subject_type、kind 过滤。 */
export function rulesForStage(rules, stage, subjectType, kinds) {
  return rules.filter(
    (r) =>
      r.stage === stage &&
      (!subjectType || r.subject_type.includes(subjectType)) &&
      (!kinds || kinds.includes(r.kind)),
  );
}

/** 规则的 API 名是否命中扫描到的 API 集合；`uni.X` 与 `wx.X` 视为等价
 *  （uni-app 编译到微信小程序即 `wx.X`，源码里却写 `uni.X`——不归一则对 uni-app 全盘漏报）。 */
export function apiMatches(apiSet, ruleApi) {
  if (apiSet.has(ruleApi)) return true;
  const dot = ruleApi.indexOf(".");
  if (dot < 0) return false;
  const ns = ruleApi.slice(0, dot);
  const name = ruleApi.slice(dot + 1);
  if (ns === "wx") return apiSet.has(`uni.${name}`);
  if (ns === "uni") return apiSet.has(`wx.${name}`);
  return false;
}

/** 把一条规则映射为报告清单项（check 与 guide 共用，确保两个渲染器输出一致）。 */
export function ruleToItem(r) {
  return {
    ruleId: r.id,
    title: r.title,
    stage: r.stage,
    severity: r.severity,
    why: r.why || null,
    requires: r.requires ? [...r.requires] : [],
    warn: r.warn || null,
    official_url: r.official_url,
    source_quote: r.source_quote,
    last_verified: r.last_verified,
    manual_required: r.manual_required,
  };
}
