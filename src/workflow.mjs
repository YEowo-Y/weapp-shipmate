// Pure projection of trusted catalog + user facts. No scan can confirm an official stage.
const SUBJECTS = ["personal", "individual_business", "enterprise"];
const terminal = state => state === "confirmed" || state === "not_applicable";
const contentDependent = rule => Boolean(rule.signal?.length || Object.keys(rule.match || {}).length);
const applicable = (rule, subject) => subject
  ? rule.subject_type?.includes(subject)
  : SUBJECTS.every(value => rule.subject_type?.includes(value));

function condition(expression, context) {
  if (!expression) return true;
  const alternatives = String(expression).split("||").map(part => {
    const values = part.split("&&").map(fragment => {
      const match = fragment.trim().match(/^([A-Za-z_]\w*)\s*(==|!=)\s*(.+)$/);
      if (!match || context[match[1]] == null) return null;
      const raw = match[3].trim();
      const right = raw === "true" ? true : raw === "false" ? false : raw.replace(/^["']|["']$/g, "");
      return match[2] === "==" ? context[match[1]] === right : context[match[1]] !== right;
    });
    return values.includes(false) ? false : values.includes(null) ? null : true;
  });
  return alternatives.includes(true) ? true : alternatives.includes(null) ? null : false;
}

export function deriveWorkflow({ project, catalog, rulesVersion, confirmations = [] }) {
  if (!project) throw new Error("请先选择项目");
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.stages) || !catalog.stages.length || !Array.isArray(catalog.rules))
    throw new Error("上线流程资料不可用，请重试或修复安装");
  const stageIds = new Set(catalog.stages.map(stage => stage?.stage));
  if (stageIds.size !== catalog.stages.length || catalog.stages.some(stage =>
    typeof stage?.stage !== "string" || !stage.stage.trim() || typeof stage.title !== "string" || !stage.title.trim() ||
    (stage.requires_stage != null && (!Array.isArray(stage.requires_stage) || stage.requires_stage.some(id => !stageIds.has(id))))) ||
    catalog.rules.some(rule => !rule || typeof rule.id !== "string" || !stageIds.has(rule.stage) ||
      typeof rule.title !== "string" || !Array.isArray(rule.subject_type) ||
      (rule.requires != null && (!Array.isArray(rule.requires) || rule.requires.some(item => typeof item !== "string"))) ||
      (rule.signal != null && (!Array.isArray(rule.signal) || rule.signal.some(item => typeof item !== "string")))))
    throw new Error("上线流程资料格式无效，请修复安装");
  const visited = new Set();
  const visiting = new Set();
  const visit = id => {
    if (visiting.has(id)) throw new Error("上线流程依赖存在循环，请修复安装");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of catalog.stages.find(stage => stage.stage === id).requires_stage || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of stageIds) visit(id);
  const facts = project.facts || {};
  const context = { subject_type: project.subject, business_type: facts.businessType,
    has_payment: facts.hasPayment, collects_sensitive: facts.collectsSensitive, has_server_domain: facts.hasServerDomain };
  const stages = catalog.stages.map(stage => {
    const id = stage.stage;
    const rules = catalog.rules.filter(rule => rule.stage === id && applicable(rule, project.subject) && ["navigation", "both"].includes(rule.kind));
    const latest = confirmations.filter(record => record.stageId === id)
      .reduce((last, record) => !last || record.recordedAt >= last.recordedAt ? record : last, null);
    const applies = condition(stage.applies_when, context);
    const stale = latest && latest.state !== "pending" && (latest.contextRevision !== (project.contextRevision ?? 0) || latest.rulesVersion !== rulesVersion);
    const status = stale ? "stale" : latest && terminal(latest.state) ? latest.state : applies === null ? "unknown" : "pending";
    const sources = [stage, ...rules].filter(source => source.official_url).map(source => ({
      url: source.official_url, lastVerified: source.last_verified || null, quote: source.source_quote || null,
    }));
    return { id, title: stage.title, status,
      coverage: { ruleCount: rules.length, conditionalRuleCount: rules.filter(contentDependent).length,
        note: !rules.length ? "暂无细化规则，请按官方指引人工核对。" : "规则覆盖有限；自动扫描发现不代表官方阶段已完成。" },
      items: rules.map(rule => ({ ruleId: rule.id, title: rule.title, stage: rule.stage, severity: rule.severity,
        requires: rule.requires || [], conditional: contentDependent(rule), signal: rule.signal?.length ? rule.signal : [...(rule.match?.api || []), ...(rule.match?.config_key || [])], official_url: rule.official_url || null })),
      sources, confirmation: latest, blockedBy: [],
      applicability: applies, action: stale ? "项目事实或规则已变化，请重新核对并确认。" : applies === null
        ? "补充项目事实，或按官方要求人工核对适用性。" : applies === false
          ? "按当前事实可能不适用；请核对后填写原因，人工标记不适用。" : "按官方指引完成后，人工确认本阶段。" };
  });
  // DFS insertion order is dependency-first, even when the catalog display order is not.
  // Keep the historical confirmation; only its current projection becomes stale.
  for (const id of visited) {
    const stage = stages.find(item => item.id === id);
    const source = catalog.stages.find(item => item.stage === stage.id);
    stage.blockedBy = (source.requires_stage || []).filter(id => !terminal(stages.find(item => item.id === id)?.status));
    if (stage.blockedBy.length && terminal(stage.status)) {
      stage.status = "stale";
      stage.action = "前置阶段尚未确认或已撤销，请先恢复前置阶段并重新核对。";
    }
  }
  const business = String(facts.businessType || "").trim().toLowerCase();
  const categoryCandidates = catalog.rules.filter(rule => rule.stage === "category" && applicable(rule, project.subject))
    .map(rule => ({ rule, matchedSignals: (rule.signal || []).filter(signal => business.includes(String(signal).toLowerCase())) }))
    .filter(({ rule, matchedSignals }) => matchedSignals.length || (facts.hasPayment === true && rule.id === "category.payment-hint"))
    .map(({ rule, matchedSignals }) => ({ ruleId: rule.id, title: rule.title, matchedSignals,
      reason: matchedSignals.length ? "业务文字匹配，仅为待核对线索，不是类目判定。" : "你声明涉及支付，请人工核对支付及服务类目要求。",
      requires: rule.requires || [], official_url: rule.official_url || null, last_verified: rule.last_verified || null }));
  const next = stages.find(stage => !terminal(stage.status) && !stage.blockedBy.length);
  return { stages, categoryCandidates, nextAction: next ? { stageId: next.id, title: next.title, description: next.action } : null };
}
