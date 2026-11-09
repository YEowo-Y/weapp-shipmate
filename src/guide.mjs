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
/** signal 依赖业务事实，match 依赖源码事实；guide 均未确认这些条件。
 *  无条件规则保留为通用导航；preflight-only 仍由 check 处理。 */
function isContentDependent(r) {
  return !!r.signal?.length || Object.keys(r.match || {}).length > 0;
}

// 人工导航操作提示，不是新增政策规则或已完成事实。
// 依据官方 introduction/ 与 product/renzheng.html；核验记录见
// .omx/plans/guide-stage-guidance-20261025.md。具体材料和验证方式以后台为准。
const ONBOARDING_STEPS = {
  "registration.account-details": [
    "官方入口：https://mp.weixin.qq.com/ 。已有账号先登录核对主体与管理员；尚未注册时选择小程序注册，按邮箱激活和信息登记指引继续。",
    "完成条件：能登录目标小程序后台，已核对登记的主体类型、主体信息和管理员；如后台仍提示补充信息或验证，继续处理，暂不记录本阶段完成。",
  ],
  "release.manual-publish": [
    "官方入口：https://mp.weixin.qq.com/ 。登录目标小程序的版本管理页面，核对准备发布的版本与审核结果，再按后台提示手动发布。",
    "完成条件：在官方后台确认目标版本已发布到线上，并用微信打开线上版本核对关键页面；审核通过、体验版可访问或本机确认均不等于正式发布完成。",
  ],
};

function identityVerificationSteps(subjectType) {
  const identity = subjectType === "personal"
    ? "个人主体：核对后台登记的个人身份与管理员信息，按页面提示完成所需身份验证；所需身份资料只在官方后台提交。"
    : subjectType === "individual_business"
      ? "个体工商户：核对营业执照登记信息与后台主体记录；按后台显示的验证方式办理。若申请微信认证，按官方材料要求准备营业执照，不将企业的对公验证方式直接套用到个体。"
      : "主体类型尚未确认：先查看官方后台的主体登记信息，确认是个人、个体工商户还是其他主体；无法确认时保留待核对，不代选主体或标记完成。";
  return [
    "官方入口：https://mp.weixin.qq.com/ 。登录目标小程序，查看主体、管理员和待处理的身份验证提示。",
    identity,
    "如需申请微信认证或开通业务能力，另行核对官方说明：https://developers.weixin.qq.com/miniprogram/product/renzheng.html 。本阶段身份核验不代表微信认证已通过或支付资格已具备。",
    "完成条件：已确认真实主体和管理员信息，并在官方后台核对所要求的身份验证已完成；仍有待验证、信息不符或主体不明时，保留本阶段待处理。",
  ];
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
    if (missingFact) unknown.push(stage.title);
    if (!missingFact && !evalExpr(stage.applies_when, inputs)) {
      skipped.push(stage.title);
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
      item.signal = r.signal || [...(r.match?.api || []), ...(r.match?.config_key || [])];
      if (Object.keys(r.match || {}).length > 0)
        item.why = "尚未确认相关源码条件；请先检查是否使用这些接口、组件或配置。仅在条件成立时，按本条要求处理。";
      selfCheck.push(item);
    }
    for (const r of confirmed) {
      const item = ruleToItem(r);
      if (item.warn) item.note = item.warn;
      if (ONBOARDING_STEPS[r.id]) item.requires.push(...ONBOARDING_STEPS[r.id]);
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
        requires: stage.stage === "certification" ? identityVerificationSteps(subjectType) : [note],
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
  const subjectLabel = { personal: "个人", individual_business: "个体工商户", enterprise: "企业" }[subjectType] || "未指定";
  const summary = `主体：${subjectLabel}；适用阶段 ${flow.length - skipped.length}/${flow.length}。`;
  return { command: "guide", meta: { summary }, items, selfCheck, notes };
}
