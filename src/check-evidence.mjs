import { apiMatches } from "./data.mjs";
import { checkRequiredPrivateInfos, checkBackendApiInFrontend, checkIpOrLocalhost } from "./crosscheck.mjs";

const MAX_ITEM_LOCATIONS = 100;
const identity = ({ kind, signal, file }) => JSON.stringify([
  kind === "api-reference" || kind === "api-import" ? "api" : kind,
  signal,
  kind === "secret-key" ? file : null,
]);
const compare = (a, b) => a === b ? 0 : a < b ? -1 : 1;
const compareLocations = (a, b) => compare(a.file, b.file)
  || compare(a.line ?? Infinity, b.line ?? Infinity)
  || compare(a.column ?? Infinity, b.column ?? Infinity)
  || compare(a.kind, b.kind) || compare(a.signal, b.signal);

function expectedSignals(item, rule, scan) {
  const expected = new Set();
  const add = (kind, signal, file) => expected.add(identity({ kind, signal, file }));
  if (rule) {
    for (const signal of scan.apis)
      if (rule.match?.api?.some(api => apiMatches(new Set([signal]), api))) add("api-reference", signal);
    for (const signal of scan.configKeys)
      if (rule.match?.config_key?.includes(signal)) add("config-key", signal);
    if (rule.stage === "domain") for (const signal of scan.domains) add("domain", signal);
  } else {
    // Reuse the actual detector on each signal; display text is not a matching contract.
    switch (item.ruleId) {
      case "consistency.requiredPrivateInfos":
        for (const signal of scan.apis)
          if (checkRequiredPrivateInfos({ ...scan, apis: [signal] })) add("api-reference", signal);
        break;
      case "security.backend-api-in-frontend":
        for (const signal of scan.domains)
          if (checkBackendApiInFrontend({ domains: [signal] })) add("domain", signal);
        break;
      case "security.hardcoded-secret":
        for (const { file, key } of scan.secretHints) add("secret-key", key, file);
        break;
      case "security.insecure-request":
        for (const signal of scan.insecureHosts) add("insecure-request", signal);
        break;
      case "domain.ip-or-localhost":
        for (const signal of scan.domains)
          if (checkIpOrLocalhost({ domains: [signal] })) add("domain", signal);
        break;
    }
  }
  return expected;
}

/** Enrich an explicitly requested report without changing its findings or scan coverage. */
export function attachCheckEvidence(report, rules, collected) {
  const ruleById = new Map(rules.map(rule => [rule.id, rule]));
  const uniqueLocations = new Map();
  for (const location of collected.locations) {
    const { file, line, column, kind, signal } = location;
    uniqueLocations.set(JSON.stringify([file, line, column, kind, signal]), location);
  }
  const locations = [...uniqueLocations.values()].sort(compareLocations);
  const scan = report.meta.scan;
  let truncated = collected.truncated;
  for (const item of report.items) {
    const rule = ruleById.get(item.ruleId);
    const expected = expectedSignals(item, rule, scan);
    const matching = locations.filter(location => expected.has(identity(location)));
    const observed = new Set(matching.map(identity));
    const capped = matching.length > MAX_ITEM_LOCATIONS;
    const dynamic = rule?.stage === "domain" && scan.dynamicRequest && rule.match?.dynamic_note;
    const partial = collected.truncated || capped || dynamic || matching.some(location => location.line === null || location.column === null)
      || [...expected].some(key => !observed.has(key));
    const status = collected.truncated || dynamic ? "partial"
      : !matching.length ? "unavailable" : partial ? "partial" : "located";
    item.evidence = { status, locations: matching.slice(0, MAX_ITEM_LOCATIONS) };
    truncated ||= capped;
  }
  report.meta.evidence = { schemaVersion: 1, truncated };
  if (truncated)
    report.notes.push("证据位置已截断（全局最多 20,000 个、每项最多 100 个）；规则扫描与退出阈值仍按原发现项计算，请结合扫描限制人工核对。");
  return report;
}
