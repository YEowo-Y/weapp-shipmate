// @ts-check
// Pure projection of trusted catalog + user facts. No scan can confirm an official stage.
/**
 * @typedef {{
 *   stageId: string;
 *   state: string;
 *   note?: string;
 *   recordedAt: number;
 *   contextRevision: number;
 *   rulesVersion: string;
 *   provenance?: 'imported';
 *   sourceState?: string;
 * }} WorkflowConfirmation
 */
/**
 * @typedef {{
 *   subject?: string | null;
 *   contextRevision?: number | null;
 *   facts?: {
 *     businessType?: string | null;
 *     hasPayment?: boolean | null;
 *     collectsSensitive?: boolean | null;
 *     hasServerDomain?: boolean | null;
 *   } | null;
 * }} WorkflowProject
 * @typedef {{ official_url?: string | null; source_quote?: string | null; last_verified?: string | null }} CatalogSource
 * @typedef {CatalogSource & { stage: string; title: string; requires_stage?: string[] | null; applies_when?: unknown }} CatalogStage
 * @typedef {CatalogSource & {
 *   id: string;
 *   stage: string;
 *   title: string;
 *   kind?: string | null;
 *   severity?: string | null;
 *   subject_type: string[];
 *   requires?: string[] | null;
 *   signal?: string[] | null;
 *   match?: { api?: string[] | null; config_key?: string[] | null } | null;
 * }} CatalogRule
 * @typedef {'confirmed' | 'not_applicable' | 'pending' | 'unknown' | 'stale'} WorkflowStatus
 */
const SUBJECTS = ["personal", "individual_business", "enterprise"];
/** @param {unknown} state @returns {state is "confirmed" | "not_applicable"} */
const terminal = state => state === "confirmed" || state === "not_applicable";
/** @param {CatalogRule} rule */
const contentDependent = rule => Boolean(rule.signal?.length || Object.keys(rule.match || {}).length);
/** @param {CatalogRule} rule @param {WorkflowProject['subject']} subject */
const applicable = (rule, subject) => subject
  ? rule.subject_type.includes(subject)
  : SUBJECTS.every(value => rule.subject_type.includes(value));

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
/** @param {unknown} value @returns {value is unknown[]} */
const isList = value => Array.isArray(value);
/** @param {unknown} value @returns {value is string[]} */
const isTextList = value => isList(value) && value.every(item => typeof item === "string");
/** @param {unknown} value */
const optionalText = value => value == null || typeof value === "string";
/** @param {unknown} value @returns {value is CatalogSource & Record<string, unknown>} */
const isCatalogSource = value => isRecord(value)
  && [value.official_url, value.source_quote, value.last_verified].every(optionalText);
/** @param {unknown} value @returns {value is CatalogStage} */
function isCatalogStage(value) {
  return isCatalogSource(value) && typeof value.stage === "string" && Boolean(value.stage.trim())
    && typeof value.title === "string" && Boolean(value.title.trim())
    && (value.requires_stage == null || isTextList(value.requires_stage));
}
/** @param {unknown} value @returns {value is CatalogRule} */
function isCatalogRule(value) {
  if (!isCatalogSource(value) || typeof value.id !== "string" || typeof value.stage !== "string"
    || typeof value.title !== "string" || !isTextList(value.subject_type)
    || !optionalText(value.kind) || !optionalText(value.severity)
    || (value.requires != null && !isTextList(value.requires))
    || (value.signal != null && !isTextList(value.signal))) return false;
  const { match } = value;
  return match == null || (isRecord(match)
    && (match.api == null || isTextList(match.api))
    && (match.config_key == null || isTextList(match.config_key)));
}
const invalidCatalog = () => new Error("上线流程资料格式无效，请修复安装");

/** @param {unknown} expression @param {Record<string, string | boolean | null | undefined>} context */
function condition(expression, context) {
  if (!expression) return true;
  const alternatives = String(expression).split("||").map(part => {
    const values = part.split("&&").map(fragment => {
      const match = fragment.trim().match(/^([A-Za-z_]\w*)\s*(==|!=)\s*(.+)$/);
      if (!match || !Object.hasOwn(context, match[1])) return null;
      const fact = context[match[1]];
      if (fact == null) return null;
      const raw = match[3].trim();
      const right = raw === "true" ? true : raw === "false" ? false : raw.replace(/^["']|["']$/g, "");
      return match[2] === "==" ? fact === right : fact !== right;
    });
    return values.includes(false) ? false : values.includes(null) ? null : true;
  });
  return alternatives.includes(true) ? true : alternatives.includes(null) ? null : false;
}

/**
 * @param {{
 *   project?: WorkflowProject | null;
 *   catalog?: unknown;
 *   rulesVersion?: string | null;
 *   confirmations?: readonly WorkflowConfirmation[];
 * }} basis
 */
export function deriveWorkflow({ project, catalog, rulesVersion, confirmations = [] }) {
  if (!project) throw new Error("请先选择项目");
  if (!isRecord(catalog) || catalog.schemaVersion !== 1 || !isList(catalog.stages) || !catalog.stages.length || !isList(catalog.rules))
    throw new Error("上线流程资料不可用，请重试或修复安装");
  const { stages: stageSources, rules: catalogRules } = catalog;
  if (!stageSources.every(isCatalogStage) || !catalogRules.every(isCatalogRule)) throw invalidCatalog();
  const dependenciesById = new Map(stageSources.map(source => [source.stage, source.requires_stage ?? []]));
  if (dependenciesById.size !== stageSources.length || catalogRules.some(rule => !dependenciesById.has(rule.stage)))
    throw invalidCatalog();

  /** @type {Map<string, readonly string[]>} */
  const visited = new Map();
  /** @type {Set<string>} */
  const visiting = new Set();
  /** @param {string} id */
  const visit = id => {
    if (visiting.has(id)) throw new Error("上线流程依赖存在循环，请修复安装");
    if (visited.has(id)) return;
    const dependencies = dependenciesById.get(id);
    if (!dependencies) throw invalidCatalog();
    visiting.add(id);
    for (const dependency of dependencies) visit(dependency);
    visiting.delete(id);
    visited.set(id, dependencies);
  };
  for (const id of dependenciesById.keys()) visit(id);
  const facts = project.facts || {};
  const context = { subject_type: project.subject, business_type: facts.businessType,
    has_payment: facts.hasPayment, collects_sensitive: facts.collectsSensitive, has_server_domain: facts.hasServerDomain };
  const stages = stageSources.map(stage => {
    const id = stage.stage;
    const rules = catalogRules.filter(rule => rule.stage === id && applicable(rule, project.subject) && (rule.kind === "navigation" || rule.kind === "both"));
    const latest = confirmations.filter(record => record.stageId === id)
      .reduce((last, record) => !last || record.recordedAt >= last.recordedAt ? record : last, /** @type {WorkflowConfirmation | null} */ (null));
    const applies = condition(stage.applies_when, context);
    const stale = latest && latest.state !== "pending" && (latest.contextRevision !== (project.contextRevision ?? 0) || latest.rulesVersion !== rulesVersion);
    /** @type {WorkflowStatus} */
    const status = stale ? "stale" : latest && terminal(latest.state) ? latest.state : applies === null ? "unknown" : "pending";
    const sources = [stage, ...rules].flatMap(source => source.official_url ? [{
      url: source.official_url, lastVerified: source.last_verified || null, quote: source.source_quote || null,
    }] : []);
    return { id, title: stage.title, status,
      coverage: { ruleCount: rules.length, conditionalRuleCount: rules.filter(contentDependent).length,
        note: !rules.length ? "暂无细化规则，请按官方指引人工核对。" : "规则覆盖有限；自动扫描发现不代表官方阶段已完成。" },
      items: rules.map(rule => ({ ruleId: rule.id, title: rule.title, stage: rule.stage, severity: rule.severity,
        requires: rule.requires || [], conditional: contentDependent(rule), signal: rule.signal?.length ? rule.signal : [...(rule.match?.api || []), ...(rule.match?.config_key || [])], official_url: rule.official_url || null })),
      sources, confirmation: latest, blockedBy: /** @type {string[]} */ ([]),
      applicability: applies, action: stale ? "项目事实或规则已变化，请重新核对并确认。" : applies === null
        ? "补充项目事实，或按官方要求人工核对适用性。" : applies === false
          ? "按当前事实可能不适用；请核对后填写原因，人工标记不适用。" : "按官方指引完成后，人工确认本阶段。" };
  });
  // DFS insertion order is dependency-first, even when the catalog display order is not.
  // Keep the historical confirmation; only its current projection becomes stale.
  const stagesById = new Map(stages.map(stage => [stage.id, stage]));
  for (const [id, dependencies] of visited) {
    const stage = stagesById.get(id);
    if (!stage) throw invalidCatalog();
    stage.blockedBy = dependencies.filter(dependency => !terminal(stagesById.get(dependency)?.status));
    if (stage.blockedBy.length && terminal(stage.status)) {
      stage.status = "stale";
      stage.action = "前置阶段尚未确认或已撤销，请先恢复前置阶段并重新核对。";
    }
  }
  const business = String(facts.businessType || "").trim().toLowerCase();
  const categoryCandidates = catalogRules.filter(rule => rule.stage === "category" && applicable(rule, project.subject))
    .map(rule => ({ rule, matchedSignals: (rule.signal || []).filter(signal => business.includes(String(signal).toLowerCase())) }))
    .filter(({ rule, matchedSignals }) => matchedSignals.length || (facts.hasPayment === true && rule.id === "category.payment-hint"))
    .map(({ rule, matchedSignals }) => ({ ruleId: rule.id, title: rule.title, matchedSignals,
      reason: matchedSignals.length ? "业务文字匹配，仅为待核对线索，不是类目判定。" : "你声明涉及支付，请人工核对支付及服务类目要求。",
      requires: rule.requires || [], official_url: rule.official_url || null, last_verified: rule.last_verified || null }));
  const next = stages.find(stage => !terminal(stage.status) && !stage.blockedBy.length);
  return { stages, categoryCandidates, nextAction: next ? { stageId: next.id, title: next.title, description: next.action } : null };
}
