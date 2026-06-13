// src/guide.mjs —— 上线流程导航引擎：flow 图遍历 × navigation 规则 → 下一步清单
import { loadData, rulesForStage, ruleToItem } from "./data.mjs";

/**
 * 极小且安全的 applies_when 求值器（不使用 eval）。
 * 仅支持 02 输入字段 + 运算子集：== != && ||（&& 优先于 ||）。
 * 字面量：true / false / "字符串" / 裸标识符（按字符串比较）。
 */
export function evalExpr(expr, ctx) {
  if (!expr || !String(expr).trim()) return true;
  return String(expr)
    .split("||")
    .some((orPart) =>
      orPart.split("&&").every((andPart) => evalComparison(andPart.trim(), ctx)),
    );
}

function evalComparison(c, ctx) {
  const m = c.match(/^([A-Za-z_]\w*)\s*(==|!=)\s*(.+)$/);
  if (!m) throw new Error(`无法解析导航条件: "${c}"`);
  const [, field, op, raw] = m;
  const left = ctx[field];
  let right = raw.trim();
  if (right === "true") right = true;
  else if (right === "false") right = false;
  else right = right.replace(/^["']|["']$/g, "");
  return op === "==" ? left === right : left !== right;
}

/**
 * @param {{subject_type?:string, business_type?:string, has_payment?:boolean,
 *          collects_sensitive?:boolean, has_server_domain?:boolean}} inputs
 * @param {{includeDrafts?:boolean}} opts
 */
export function runGuide(inputs = {}, { includeDrafts = false } = {}) {
  const { flow, rules } = loadData({ includeDrafts });
  const subjectType = inputs.subject_type;
  const items = [];
  const skipped = [];

  for (const stage of flow) {
    // flow.yaml 已按顺序排列；applies_when 决定是否适用
    if (!evalExpr(stage.applies_when, inputs)) {
      skipped.push(stage.stage);
      continue;
    }
    // 导航只取 navigation / both 规则（preflight-only 需源码，归 check）
    const stageRules = rulesForStage(rules, stage.stage, subjectType, ["navigation", "both"]);
    if (stageRules.length === 0) {
      items.push({
        ruleId: `flow.${stage.stage}`,
        title: stage.title,
        stage: stage.stage,
        severity: "info",
        why: null,
        requires: ["按官方指引完成本阶段（暂无细化规则）"],
        official_url: stage.official_url || null,
        last_verified: stage.last_verified || null,
        manual_required: true,
      });
    } else {
      for (const r of stageRules) {
        const item = ruleToItem(r);
        if (item.warn) item.note = item.warn;
        items.push(item);
      }
    }
  }

  const notes = [];
  if (skipped.length) notes.push(`按你的输入跳过阶段：${skipped.join("、")}`);
  if (includeDrafts) notes.push("已包含 draft 规则（来源未核验，仅供参考）。");
  const summary = `主体：${subjectType || "未指定"}；适用阶段 ${flow.length - skipped.length}/${flow.length}。`;
  return { command: "guide", meta: { summary }, items, notes };
}
