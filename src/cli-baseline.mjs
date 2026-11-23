import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import { SUBJECT_ENUM } from "./data.mjs";
import { MAX_CLI_JSON_BYTES, readCliJsonFile } from "./cli-config.mjs";
import { isPortableEvidenceFile } from "./scanner-evidence.mjs";

const VERSION = 1;
const scanCounters = ["readErrors", "skippedLinks", "skippedDirs", "skippedLargeFiles"];
const locationKinds = new Set(["api-reference", "api-import", "domain", "insecure-request", "config-key", "secret-key"]);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.length > 0;
const isDigest = value => typeof value === "string" && value.length === 64 && /^[0-9a-f]+$/.test(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;

export function hashBaselineRules(rules) {
  const canonical = JSON.stringify(rules, (_key, value) => isRecord(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
    : value);
  return createHash("sha256").update(canonical).digest("hex");
}

function validScan(scan) {
  const scope = scan?.scope;
  if (!isRecord(scan) || !isRecord(scope) || !isText(scope.root) ||
      !(posix.isAbsolute(scope.root) || win32.isAbsolute(scope.root)) ||
      !isText(scope.policyVersion) || !isDigest(scope.filesHash) ||
      !isCount(scan.filesScanned) || !scanCounters.every(key => isCount(scan[key])) ||
      typeof scan.truncated !== "boolean" || !Array.isArray(scan.configErrors))
    return false;
  const complete = scan.filesScanned > 0 && scanCounters.every(key => scan[key] === 0) &&
    !scan.truncated && scan.configErrors.length === 0;
  return scope.complete === complete;
}

// The original evidence schema is also validated at the package boundary by tests.
function validLocation(location) {
  if (!isRecord(location) || Object.keys(location).length !== 5) return false;
  const { file, line, column, kind, signal } = location;
  if (!isPortableEvidenceFile(file) || !locationKinds.has(kind) || !isText(signal))
    return false;
  return (line === null && column === null) || (isCount(line) && line > 0 && isCount(column) && column > 0);
}

function locationKey({ file, line, column, kind, signal }) {
  return JSON.stringify([file, line, column, kind, signal]);
}

function validItem(item) {
  if (!isRecord(item) || !isText(item.ruleId) || Object.hasOwn(item, "baseline")) return false;
  const evidence = item.evidence;
  if (!isRecord(evidence) || Object.keys(evidence).length !== 2) return false;
  const { status, locations } = evidence;
  if (!Array.isArray(locations) || locations.length > 100 || !locations.every(validLocation) ||
      new Set(locations.map(locationKey)).size !== locations.length)
    return false;
  if (status === "located") return locations.length > 0 && locations.every(location => location.line !== null);
  if (status === "unavailable") return locations.length === 0;
  return status === "partial";
}

function assertSnapshot(report) {
  const baseline = report?.meta?.baseline;
  if (baseline?.mode !== "snapshot")
    throw new Error("基线文件：需要通过 --baseline-snapshot 保存的 JSON v1 快照。");

  const evidence = report.meta.evidence;
  if (!isRecord(report) || report.schemaVersion !== 1 || report.command !== "check" ||
      !isRecord(report.meta) || !isRecord(baseline) || Object.keys(baseline).length !== 6 ||
      baseline.schemaVersion !== VERSION || !isText(baseline.cliVersion) || !isDigest(baseline.rulesHash) ||
      (baseline.subject !== null && !SUBJECT_ENUM.includes(baseline.subject)) ||
      typeof baseline.includeDrafts !== "boolean" || !validScan(report.meta.scan) ||
      !isRecord(evidence) || Object.keys(evidence).length !== 2 ||
      evidence.schemaVersion !== 1 || typeof evidence.truncated !== "boolean" ||
      !Array.isArray(report.notes) || !report.notes.every(note => typeof note === "string") ||
      (Object.hasOwn(report, "selfCheck") && !(Array.isArray(report.selfCheck) && report.selfCheck.every(isRecord))) ||
      !Array.isArray(report.items) || !report.items.every(validItem) ||
      new Set(report.items.map(item => item.ruleId)).size !== report.items.length)
    throw new Error("基线快照：格式不符合 CLI 基线 v1。");
}

export function readCliBaseline(file) {
  const { value } = readCliJsonFile(file, "基线文件");
  assertSnapshot(value);
  return value;
}

export function assertBaselineOutputSize(json) {
  if (Buffer.byteLength(json, "utf8") > MAX_CLI_JSON_BYTES)
    throw new Error("基线快照：超过 5 MiB。");
}

function incompatibleReasons(before, after) {
  const oldScope = before.scan.scope;
  const newScope = after.scan.scope;
  // Bump the scanner policy version for changes to coverage, locations, or crosscheck semantics.
  const checks = [
    [oldScope.root !== newScope.root, "project-root-changed"],
    [oldScope.policyVersion !== newScope.policyVersion, "scan-policy-changed"],
    [before.baseline.cliVersion !== after.baseline.cliVersion, "cli-version-changed"],
    [before.baseline.rulesHash !== after.baseline.rulesHash, "rules-changed"],
    [before.baseline.subject !== after.baseline.subject, "subject-changed"],
    [before.baseline.includeDrafts !== after.baseline.includeDrafts, "drafts-changed"],
    [!oldScope.complete || !newScope.complete, "incomplete-scan"],
    [before.evidence.truncated || after.evidence.truncated, "truncated-evidence"],
  ];
  return checks.filter(([different]) => different).map(([, code]) => code);
}

function compareItems(previousItems, currentItems) {
  const remaining = new Map(previousItems.map(item => [item.ruleId, item]));
  const counts = { incomparableRules: 0, currentOnly: 0, common: 0, previousOnly: 0 };
  const items = currentItems.map(item => {
    const previous = remaining.get(item.ruleId);
    remaining.delete(item.ruleId);
    if (item.evidence.status !== "located" || (previous && previous.evidence.status !== "located")) {
      counts.incomparableRules++;
      return { ...item, baseline: { status: "incomparable" } };
    }
    const unmatched = new Set(previous?.evidence.locations.map(locationKey));
    const currentOnlyLocationIndexes = [];
    for (const [index, location] of item.evidence.locations.entries()) {
      if (unmatched.delete(locationKey(location))) counts.common++;
      else currentOnlyLocationIndexes.push(index);
    }
    counts.currentOnly += currentOnlyLocationIndexes.length;
    counts.previousOnly += unmatched.size;
    return { ...item, baseline: { status: "compared", currentOnlyLocationIndexes } };
  });
  for (const previous of remaining.values()) {
    if (previous.evidence.status === "located") counts.previousOnly += previous.evidence.locations.length;
    else counts.incomparableRules++;
  }
  const { incomparableRules, currentOnly, common, previousOnly } = counts;
  return {
    items,
    status: incomparableRules ? "partial" : "compared",
    counts: !incomparableRules || currentOnly || common || previousOnly ? counts : { incomparableRules },
  };
}

export function withCliBaseline(report, { cliVersion, subject, includeDrafts, rulesHash }, previous) {
  const baseline = { schemaVersion: VERSION, mode: "snapshot", cliVersion, subject, includeDrafts, rulesHash };
  const meta = { ...report.meta, baseline };
  const snapshot = { ...report, meta };
  assertSnapshot({ ...snapshot, schemaVersion: 1 });
  if (!previous) return snapshot;

  const reasonCodes = incompatibleReasons(previous.meta, meta);
  if (reasonCodes.length) {
    return {
      ...snapshot,
      meta: { ...meta, baseline: { ...baseline, mode: "compare", status: "incomparable", reasonCodes } },
    };
  }
  const { items, status, counts } = compareItems(previous.items, report.items);
  return { ...snapshot, meta: { ...meta, baseline: { ...baseline, mode: "compare", status, counts } }, items };
}
