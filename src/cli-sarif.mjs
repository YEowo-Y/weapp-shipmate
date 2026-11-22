const SARIF_SCHEMA = "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json";
const LEVELS = { blocker: "error", warning: "warning", info: "note" };

function plainText(text) {
  // SARIF escapes literal braces by doubling them.
  return { text: text.replace(/[{}]/g, "$&$&") };
}

function ruleDescriptor(item) {
  return {
    id: item.ruleId,
    shortDescription: plainText(item.title),
    ...(item.official_url ? { helpUri: item.official_url } : {}),
    ...(item.source_quote ? { help: plainText(item.source_quote) } : {}),
    ...(item.last_verified ? { properties: { lastVerified: item.last_verified } } : {}),
  };
}

function resultLocations(evidence) {
  const seen = new Set();
  const locations = [];
  for (const { file, line, column } of evidence.locations) {
    const key = JSON.stringify([file, line, column]);
    if (seen.has(key)) continue;
    seen.add(key);
    // The evidence callback uses "/" for separators and keeps literal characters in each segment.
    const uri = file.split("/").map(encodeURIComponent).join("/");
    locations.push({
      physicalLocation: {
        artifactLocation: { uri, uriBaseId: "%SRCROOT%" },
        ...(line !== null ? { region: { startLine: line, startColumn: column } } : {}),
      },
    });
  }
  const firstPrecise = locations.findIndex(location => location.physicalLocation.region);
  const [primary] = locations.splice(Math.max(firstPrecise, 0), 1);
  return {
    locations: primary ? [primary] : [],
    ...(locations.length ? { relatedLocations: locations.map((location, index) => ({ id: index + 1, ...location })) } : {}),
  };
}

/** Project a check report carrying the internal, original-path evidence. */
export function toSarif(report, { version, exitCode, hiddenNonBlockerCount = 0 }) {
  const rules = [];
  const ruleIndexes = new Map();
  const results = report.items.map(item => {
    let ruleIndex = ruleIndexes.get(item.ruleId);
    if (ruleIndex === undefined) {
      ruleIndex = rules.length;
      ruleIndexes.set(item.ruleId, ruleIndex);
      rules.push(ruleDescriptor(item));
    }
    return {
      ruleId: item.ruleId,
      ruleIndex,
      level: LEVELS[item.severity],
      message: plainText([item.title, item.warn, item.why, ...item.requires, item.note].filter(Boolean).join("\n")),
      ...resultLocations(item.evidence),
      properties: { evidenceStatus: item.evidence.status },
    };
  });
  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "weapp-shipmate", version, rules } },
      columnKind: "utf16CodeUnits",
      newlineSequences: ["\r\n", "\n", "\r", "\u2028", "\u2029"],
      invocations: [{
        executionSuccessful: true,
        exitCode,
        toolExecutionNotifications: [...new Set(report.notes)].map(text => ({ level: "note", message: plainText(text) })),
      }],
      properties: {
        scanComplete: report.meta.scan.scope.complete,
        evidenceTruncated: report.meta.evidence.truncated,
        hiddenNonBlockerCount,
      },
      results,
    }],
  };
}
