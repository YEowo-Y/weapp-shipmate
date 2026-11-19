// Position metadata for the live desktop receipt stays separate from saved reports.
import { isScanPathEligible } from "./scanner.mjs";

const PREFLIGHT_EVIDENCE_BYTES = 16 * 1024;
const PROJECT_TOOL_BYTES = 2 * 1024 * 1024;
const jsonBytes = value => Buffer.byteLength(JSON.stringify(value));

function isSafeRelativeFile(file) {
  if (typeof file !== "string" || /[<>:"\\|?*`\p{Cc}\p{Bidi_Control}]/u.test(file)) return false;
  const parts = file.split("/");
  return isScanPathEligible(parts) && !parts.some(part => /[. ]$/.test(part));
}

function projectFinding({ ruleId, evidence }) {
  const item = { ruleId, status: evidence.status, locations: [] };
  const available = [];
  const seen = new Set();
  for (const { file, line } of evidence.locations) {
    if (!isSafeRelativeFile(file) || (line !== null && (!Number.isSafeInteger(line) || line < 1))) {
      item.status = "partial";
      continue;
    }
    const key = JSON.stringify([file, line]);
    if (seen.has(key)) continue;
    seen.add(key);
    available.push({ file, line });
  }
  return { item, available };
}

export function projectPreflightEvidence(report) {
  const projection = { items: [], truncated: report.meta.evidence.truncated };
  // Reserve the longer boolean and charge for each JSON comma as items are appended.
  let remaining = PREFLIGHT_EVIDENCE_BYTES - jsonBytes({ items: [], truncated: false });
  const groups = [];
  let rounds = 0;
  for (const finding of report.items) {
    const group = projectFinding(finding);
    const cost = jsonBytes(group.item) + Number(groups.length > 0);
    if (cost > remaining) {
      projection.truncated = true;
      continue;
    }
    remaining -= cost;
    projection.items.push(group.item);
    groups.push(group);
    rounds = Math.max(rounds, group.available.length);
  }
  // Give each finding a chance to retain its first position before adding more.
  for (let index = 0; index < rounds; index++) {
    for (const { item, available } of groups) {
      const location = available[index];
      if (!location) continue;
      const cost = jsonBytes(location) + Number(item.locations.length > 0);
      if (cost > remaining) {
        item.status = "partial";
        projection.truncated = true;
        continue;
      }
      remaining -= cost;
      item.locations.push(location);
    }
  }
  return projection;
}

function evidenceTail(evidence) {
  return `,"preflightEvidence":${JSON.stringify(evidence)}}`;
}

export function serializeProjectToolResult({ preflightEvidence, ...artifact }) {
  const output = JSON.stringify(artifact);
  if (!preflightEvidence) return output;
  // The original report has priority within the native stdout limit.
  const baseBytes = Buffer.byteLength(output) - 1;
  let tail = evidenceTail(preflightEvidence);
  if (baseBytes + Buffer.byteLength(tail) > PROJECT_TOOL_BYTES) {
    tail = evidenceTail({ items: [], truncated: true });
  }
  return baseBytes + Buffer.byteLength(tail) <= PROJECT_TOOL_BYTES ? output.slice(0, -1) + tail : output;
}
