// src/data.mjs —— 规则与流程的统一加载器（导航与预检共用的"事实源"读取层）
// 默认排除 draft 规则（未核验来源的种子不进默认输出，见 GOVERNANCE.md）。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 主体类型枚举——CLI 与 MCP 共用的唯一事实源（FX-06：非法主体必须报错，
 *  否则主体专属规则全部静默跳过，产出"已合规"假象）。 */
export const SUBJECT_ENUM = ["personal", "individual_business", "enterprise"];

const readYaml = (p) => yaml.load(readFileSync(p, "utf-8"));

/** 加载流程阶段；报告与导航共用同一份顺序和标题事实源。 */
export function loadFlow({ root = ROOT } = {}) {
  return readYaml(join(root, "flow.yaml")).stages;
}

/**
 * 加载 flow.yaml 与 rules/*.yaml。
 * @param {{includeDrafts?: boolean, root?: string}} opts
 * @returns {{ flow: object[], rules: object[] }}
 */
export function loadData({ includeDrafts = false, root = ROOT } = {}) {
  const flow = loadFlow({ root });
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

/** 主体适用性：已知主体精确命中；主体未知时仅采用覆盖全部主体的通用规则。 */
export function appliesToSubject(rule, subjectType) {
  if (subjectType) return rule.subject_type.includes(subjectType);
  return SUBJECT_ENUM.every((subject) => rule.subject_type.includes(subject));
}

/** 按 stage 取出该阶段的规则；可选按 subject_type、kind 过滤。 */
export function rulesForStage(rules, stage, subjectType, kinds) {
  return rules.filter(
    (r) =>
      r.stage === stage &&
      appliesToSubject(r, subjectType) &&
      (!kinds || kinds.includes(r.kind)),
  );
}

// 跨框架 API 命名空间：源码里写 uni./Taro./wepy.，编译到微信小程序都等价 wx.*。
const API_ALIASES = ["wx", "uni", "Taro", "wepy"];

/** 规则的 API 名是否命中扫描到的 API 集合；`wx.X`/`uni.X`/`Taro.X` 三者视为等价
 *  （不归一则对 uni-app、Taro 全盘漏报隐私/域名预检）。 */
export function apiMatches(apiSet, ruleApi) {
  if (apiSet.has(ruleApi)) return true;
  const dot = ruleApi.indexOf(".");
  if (dot < 0) return false;
  const ns = ruleApi.slice(0, dot);
  const name = ruleApi.slice(dot + 1);
  if (!API_ALIASES.includes(ns)) return false;
  return API_ALIASES.some((alias) => alias !== ns && apiSet.has(`${alias}.${name}`));
}

/** 把一条规则映射为报告清单项（check 与 guide 共用，确保两个渲染器输出一致）。 */
export function ruleToItem(r) {
  return {
    ruleId: r.id,
    title: r.title,
    stage: r.stage,
    severity: r.severity,
    ...(r.confidence !== undefined ? { confidence: r.confidence } : {}),
    why: r.why || null,
    requires: r.requires ? [...r.requires] : [],
    warn: r.warn || null,
    official_url: r.official_url,
    source_quote: r.source_quote,
    last_verified: r.last_verified,
    manual_required: r.manual_required,
    ...(r.action_categories ? { action_categories: [...r.action_categories] } : {}),
  };
}
