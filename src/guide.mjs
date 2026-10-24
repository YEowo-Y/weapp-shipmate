// src/guide.mjs —— 上线流程导航引擎：flow 图遍历 × navigation 规则 → 下一步清单
import { loadData, rulesForStage, ruleToItem, SUBJECT_ENUM } from "./data.mjs";

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
/** 规则是否「内容相关」：带 signal 表示其适用与否取决于小程序具体功能。
 *  导航看不到源码、无法替用户判定，故这类规则归入自查区而非「确定适用」清单——
 *  否则一个天气小工具的 guide 会把医疗类目等当成确定阻断（假阳性）。 */
function isContentDependent(r) {
  return Array.isArray(r.signal) && r.signal.length > 0;
}

export function runGuide(inputs = {}, { includeDrafts = false } = {}) {
  const { flow, rules } = loadData({ includeDrafts });
  const subjectType = inputs.subject_type;
  // 阶段2复核 MINOR：与 runCheck 同一道 FX-06 防线——非法主体会让 rulesForStage 静默丢弃
  // 主体专属规则(如个人主体的 web-view 阻断),导航却把它当作已生效回显(主体：Personal)。
  if (subjectType != null && !SUBJECT_ENUM.includes(subjectType))
    throw new Error(`非法 subject：${subjectType}（可选值：${SUBJECT_ENUM.join(" | ")}）`);
  const items = [];
  const selfCheck = []; // 内容相关、需用户按业务自查的规则（不计入确定阻断概览）
  const skipped = [];
  const unknown = [];

  for (const stage of flow) {
    // flow.yaml 已按顺序排列；applies_when 决定是否适用
    const missingFact = stage.applies_when && [...stage.applies_when.matchAll(/([A-Za-z_]\w*)\s*(?:==|!=)/g)]
      .some((match) => inputs[match[1]] == null);
    if (missingFact) unknown.push(stage.stage);
    if (!missingFact && !evalExpr(stage.applies_when, inputs)) {
      skipped.push(stage.stage);
      continue;
    }
    // 导航只取 navigation / both 规则（preflight-only 需源码，归 check）
    const stageRules = rulesForStage(rules, stage.stage, subjectType, ["navigation", "both"]);
    const confirmed = stageRules.filter((r) => !isContentDependent(r));
    const conditional = stageRules.filter((r) => isContentDependent(r));

    for (const r of conditional) {
      const item = ruleToItem(r);
      if (item.warn) item.note = item.warn;
      item.conditional = true; // 标记：取决于业务内容
      item.signal = r.signal; // 自查关键词，供渲染提示
      selfCheck.push(item);
    }
    for (const r of confirmed) {
      const item = ruleToItem(r);
      if (item.warn) item.note = item.warn;
      items.push(item);
    }
    // 没有「确定适用」的细化规则时，给一个阶段占位，保证导航顺序完整可见。
    if (confirmed.length === 0) {
      const note = conditional.length
        ? "本阶段是否有额外资质/要求取决于你的具体功能，见下方『可能适用 · 请按业务自查』。"
        : "按官方指引完成本阶段（暂无细化规则）。";
      items.push({
        ruleId: `flow.${stage.stage}`,
        title: stage.title,
        stage: stage.stage,
        severity: "info",
        why: null,
        requires: [note],
        official_url: stage.official_url || null,
        last_verified: stage.last_verified || null,
        manual_required: true,
      });
    }
  }

  const notes = [];
  if (unknown.length) notes.push(`事实尚未确认，保留待核对阶段：${unknown.join("、")}；未知不等于不适用。`);
  if (inputs.has_payment != null) notes.push(inputs.has_payment
    ? "已记录涉及支付：请核对『可能适用』中的支付与类目线索；此输入不代表已开通支付，也不能判定实物或虚拟支付资格。"
    : "已记录不涉及支付：未据此移除业务自查规则；如实际业务包含充值、会员或付费内容，请重新核对支付要求。");
  if (inputs.business_type != null) notes.push("已接收实际业务描述，仅用于人工核对类目线索；不会自动选定官方服务类目，未匹配也不代表无需资质。");
  if (skipped.length) notes.push(`按你的输入跳过阶段：${skipped.join("、")}`);
  if (selfCheck.length)
    notes.push(`另有 ${selfCheck.length} 条规则是否适用取决于你的具体功能，已列入『可能适用 · 请按业务自查』。`);
  if (includeDrafts) notes.push("已包含 draft 规则（来源未核验，仅供参考）。");
  const summary = `主体：${subjectType || "未指定"}；适用阶段 ${flow.length - skipped.length}/${flow.length}。`;
  return { command: "guide", meta: { summary }, items, selfCheck, notes };
}
