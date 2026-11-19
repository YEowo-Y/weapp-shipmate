import { loadData } from "./data.mjs";
import { runCheck } from "./check.mjs";
import { runGuide } from "./guide.mjs";
import { runExplain } from "./explain.mjs";
import { render } from "./report.mjs";
import { projectPreflightEvidence } from "./project-evidence.mjs";

export function createWorkflowCatalog(options = {}) {
  const { flow, rules } = loadData(options);
  return { schemaVersion: 1, stages: flow, rules };
}

/** One deterministic run; preserve the public engine result inside the envelope. */
export function runProjectTool(kind, input = {}, { includePreflightEvidence = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("项目工具参数必须为对象");
  const facts = input.facts || {};
  let result, preflightEvidence;
  if (kind === "check") {
    if (typeof input.directory !== "string" || !input.directory.trim()) throw new Error("预检需要项目目录");
    const onEvidence = includePreflightEvidence === true ? report => { preflightEvidence = projectPreflightEvidence(report); } : undefined;
    result = runCheck(input.directory, { subjectType: input.subject || undefined, onEvidence });
  } else if (kind === "guide") {
    result = runGuide({ subject_type: input.subject || undefined, business_type: facts.businessType,
      has_payment: facts.hasPayment, collects_sensitive: facts.collectsSensitive, has_server_domain: facts.hasServerDomain });
  } else if (kind === "explain") {
    if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 4096) throw new Error("拒因查询需要 1–4096 字文本");
    result = runExplain(input.query.trim());
  } else throw new Error("不支持的项目工具");
  const artifact = { markdown: render(result), data: { schemaVersion: 1, kind, result, scope: kind === "check" ? result.meta.scan.scope : null } };
  return preflightEvidence ? { ...artifact, preflightEvidence } : artifact;
}
