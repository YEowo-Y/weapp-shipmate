import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs, { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { main } from "../src/cli.mjs";

const bin = fileURLToPath(new URL("../bin/weapp-shipmate.mjs", import.meta.url));
const originalSource = "wx.chooseMedia({ count: 1 });\n";
const evidenceArgs = ["--evidence", "--json", "--json-version", "1"];
const warningDiagnostic = "--fail-on warning 命中 1 项。\n";

function workspace(t) {
  const tempRoot = realpathSync(tmpdir());
  const prefix = "shipmate baseline ";
  const dir = mkdtempSync(join(tempRoot, prefix));
  t.after(() => {
    assert.equal(dirname(dir), tempRoot);
    assert.ok(basename(dir).startsWith(prefix));
    rmSync(dir, { recursive: true, force: true });
  });
  const project = join(dir, "project");
  mkdirSync(project);
  const source = join(project, "app.js");
  writeFileSync(source, originalSource);
  return { dir, project, source, baseline: join(dir, "baseline.json") };
}

function run(cwd, args) {
  const child = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", timeout: 15000 });
  assert.ifError(child.error);
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

function report(result, status = 0, stderr = "") {
  assert.equal(result.status, status, result.stderr);
  assert.equal(result.stderr, stderr);
  return JSON.parse(result.stdout);
}

function withoutBaseline(report) {
  const plain = globalThis.structuredClone(report);
  delete plain.meta.baseline;
  for (const item of plain.items) delete item.baseline;
  return plain;
}

test("pre-existing evidence CLI stdout and diagnostics match the pre-baseline Windows byte fixture", t => {
  const { dir, project } = workspace(t);
  const result = run(dir, ["check", project, "--subject", "personal", ...evidenceArgs, "--fail-on", "warning"]);
  const current = report(result, 2, warningDiagnostic);
  assert.equal(current.meta.scan.scope.policyVersion, "shipmate-static-v2");
  // Captured at 96b88b6. Reconcile the local root and the scanner policy revision.
  const normalized = result.stdout.replaceAll(JSON.stringify(project).slice(1, -1), "<fixture>")
    .replace('"policyVersion": "shipmate-static-v2"', '"policyVersion": "shipmate-static-v1"');
  assert.equal(createHash("sha256").update(normalized).digest("hex"), "37b8833a47e242c9778bc6e13a93e917c5cce602a2acc1fe7220b593669894e0");
});

test("real CLI byte stream saves and compares a snapshot outside the scan with unchanged warning exits", t => {
  const { dir, project, source, baseline } = workspace(t);
  const args = ["check", project, ...evidenceArgs, "--fail-on", "warning"];
  const saved = run(dir, [...args, "--baseline-snapshot"]);
  const snapshot = report(saved, 2, warningDiagnostic);
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  assert.deepEqual(snapshot.meta.baseline, {
    schemaVersion: 1, mode: "snapshot", cliVersion: version, subject: null, includeDrafts: false, rulesHash: snapshot.meta.baseline?.rulesHash,
  });
  assert.match(snapshot.meta.baseline.rulesHash, /^[0-9a-f]{64}$/);
  assert.ok(snapshot.items.every(item => !Object.hasOwn(item, "baseline")));
  assert.deepEqual(withoutBaseline(snapshot), report(run(dir, args), 2, warningDiagnostic));
  writeFileSync(baseline, saved.stdout);
  writeFileSync(source, originalSource.trimEnd() + " wx.chooseMedia({ count: 1 });\n");

  const compared = report(run(dir, [...args, "--baseline=baseline.json"]), 2, warningDiagnostic);
  assert.deepEqual(compared.meta.baseline, {
    ...snapshot.meta.baseline,
    mode: "compare", status: "compared",
    counts: { incomparableRules: 0, currentOnly: 1, common: 1, previousOnly: 0 },
  });
  assert.equal(compared.meta.scan.scope.filesHash, snapshot.meta.scan.scope.filesHash);
  assert.deepEqual(compared.items.map(item => item.ruleId), snapshot.items.map(item => item.ruleId));
  assert.deepEqual(compared.items[0].evidence.locations.map(location => location.column), [1, 31]);
  assert.deepEqual(compared.items[0].baseline, { status: "compared", currentOnlyLocationIndexes: [1] });
  assert.deepEqual(withoutBaseline(compared), report(run(dir, args), 2, warningDiagnostic));
  assert.equal(readFileSync(baseline, "utf8"), saved.stdout);
});

function call(args) {
  let stdout = "";
  let stderr = "";
  const status = main(["node", bin, ...args], { write: text => { stdout += text; } }, { write: text => { stderr += text; } });
  return { status, stdout, stderr };
}

function save(project, baseline, options = []) {
  const result = call(["check", project, ...evidenceArgs, "--baseline-snapshot", ...options]);
  const snapshot = report(result);
  writeFileSync(baseline, result.stdout);
  return snapshot;
}

function compare(project, baseline, options = []) {
  return call(["check", project, ...evidenceArgs, "--baseline", baseline, ...options]);
}

test("baseline compares coordinates within the same project as files and source bytes change", t => {
  const { project, source, baseline } = workspace(t);
  const previous = save(project, baseline);
  writeFileSync(source, originalSource.replace("count: 1", "count: 2"));
  const same = report(compare(project, baseline));
  assert.deepEqual(same.meta.baseline.counts, { incomparableRules: 0, currentOnly: 0, common: 1, previousOnly: 0 });

  const moved = join(project, "moved.js");
  renameSync(source, moved);
  writeFileSync(moved, "\n" + originalSource);
  const changed = report(compare(project, baseline));
  assert.notEqual(changed.meta.scan.scope.filesHash, previous.meta.scan.scope.filesHash);
  assert.deepEqual(changed.meta.baseline.counts, { incomparableRules: 0, currentOnly: 1, common: 0, previousOnly: 1 });
  assert.deepEqual(changed.items[0].evidence.locations.map(({ file, line }) => [file, line]), [["moved.js", 2]]);
  assert.deepEqual(changed.items[0].baseline.currentOnlyLocationIndexes, [0]);

  writeFileSync(moved, 'import { chooseMedia as first } from "@tarojs/taro";\n');
  save(project, baseline);
  writeFileSync(moved, 'import { chooseMedia as first, chooseMedia as second } from "@tarojs/taro";\n');
  assert.deepEqual(report(compare(project, baseline)).meta.baseline.counts, same.meta.baseline.counts);

  writeFileSync(moved, "const ready = true;\n");
  const removed = report(compare(project, baseline, ["--fail-on", "info"]));
  assert.deepEqual(removed.items, []);
  assert.deepEqual(removed.meta.baseline.counts, { incomparableRules: 0, currentOnly: 0, common: 0, previousOnly: 1 });
  save(project, baseline);
  assert.deepEqual(report(compare(project, baseline)).meta.baseline.counts,
    { incomparableRules: 0, currentOnly: 0, common: 0, previousOnly: 0 });
});

test("partial and unavailable evidence exclude their rule on either side", t => {
  const { project, source, baseline } = workspace(t);
  const dynamic = "wx.request({ url: baseUrl + path });\n";
  writeFileSync(source, originalSource + dynamic);
  const snapshot = save(project, baseline);
  const dynamicFinding = snapshot.items.find(item => item.ruleId === "domain.request-whitelist");
  assert.equal(dynamicFinding.evidence.status, "partial");
  const result = report(compare(project, baseline));
  assert.equal(result.meta.baseline.status, "partial");
  assert.deepEqual(result.meta.baseline.counts, { incomparableRules: 1, currentOnly: 0, common: 1, previousOnly: 0 });
  assert.deepEqual(result.items.find(item => item.ruleId === dynamicFinding.ruleId).baseline, { status: "incomparable" });

  writeFileSync(source, dynamic);
  const onlyPartial = save(project, baseline);
  const partial = report(compare(project, baseline));
  assert.equal(partial.meta.baseline.status, "partial");
  assert.deepEqual(partial.meta.baseline.counts, { incomparableRules: 1 });
  onlyPartial.items[0].evidence = { status: "unavailable", locations: [] };
  writeFileSync(baseline, JSON.stringify(onlyPartial));
  writeFileSync(source, "const ready = true;\n");
  const previousOnly = report(compare(project, baseline));
  assert.equal(previousOnly.meta.baseline.status, "partial");
  assert.deepEqual(previousOnly.meta.baseline.counts, { incomparableRules: 1 });
  assert.deepEqual(previousOnly.items, []);
});

test("comparison uses effective subject, scan policy, CLI version, rules and project root", t => {
  const { dir, project, baseline } = workspace(t);
  const prior = save(project, baseline, ["--subject", "个人"]);
  assert.equal(prior.meta.baseline.subject, "personal");
  const config = join(dir, "settings.json");
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, check: { subject: "personal", failOn: "none" } }));
  const configured = report(compare(project, baseline, ["--config", config]));
  assert.equal(configured.meta.baseline.status, "compared");

  const other = join(dir, "other");
  mkdirSync(other);
  writeFileSync(join(other, "app.js"), originalSource);
  const wrongRoot = report(compare(other, baseline, ["--config", config]));
  assert.deepEqual(wrongRoot.meta.baseline.reasonCodes, ["project-root-changed"]);
  assert.ok(wrongRoot.items.every(item => !Object.hasOwn(item, "baseline")));

  prior.meta.scan.scope.policyVersion = "shipmate-static-old";
  prior.meta.baseline.cliVersion = "0.0.0";
  prior.meta.baseline.rulesHash = "0".repeat(64);
  writeFileSync(baseline, JSON.stringify(prior));
  const changed = report(compare(project, baseline, ["--include-drafts", "--fail-on", "warning"]), 2, warningDiagnostic);
  assert.equal(changed.meta.baseline.status, "incomparable");
  assert.deepEqual(changed.meta.baseline.reasonCodes,
    ["scan-policy-changed", "cli-version-changed", "rules-changed", "subject-changed", "drafts-changed"]);
  assert.ok(!Object.hasOwn(changed.meta.baseline, "counts"));
});

test("either scan's incomplete coverage or evidence truncation prevents any position counts", t => {
  const { project, source, baseline } = workspace(t);
  const prior = save(project, baseline);
  const appConfig = join(project, "app.json");
  writeFileSync(appConfig, "{ invalid JSON }\n");
  const incomplete = report(compare(project, baseline, ["--fail-on", "warning"]), 2, warningDiagnostic);
  assert.deepEqual(incomplete.meta.baseline.reasonCodes, ["incomplete-scan"]);
  save(project, baseline);
  writeFileSync(appConfig, "{}\n");
  assert.deepEqual(report(compare(project, baseline)).meta.baseline.reasonCodes, ["incomplete-scan"]);

  writeFileSync(baseline, JSON.stringify(prior));
  for (const size of [101, 20001]) {
    writeFileSync(source, "wx.chooseMedia();\n".repeat(size));
    const capped = report(compare(project, baseline, ["--fail-on", "warning"]), 2, warningDiagnostic);
    assert.deepEqual(capped.meta.baseline.reasonCodes, ["truncated-evidence"]);
    assert.ok(!Object.hasOwn(capped.meta.baseline, "counts"));
    assert.ok(capped.items.every(item => !Object.hasOwn(item, "baseline")));
  }
});

function assertRejected({ status, stdout, stderr }, diagnostic) {
  assert.equal(status, 1);
  assert.equal(stdout, "");
  assert.match(stderr, diagnostic);
  assert.doesNotMatch(stderr, /SYNTHETIC_PRIVATE_MARKER/);
}

test("baseline flags require explicit evidence JSON v1 and preserve help and version fast exits", t => {
  const { project, baseline } = workspace(t);
  const args = ["check", project, ...evidenceArgs];
  for (const command of [
    ["check", project, "--baseline-snapshot"], [...args, "--baseline"], [...args, "--baseline= "],
    [...args, "--baseline", baseline, "--baseline-snapshot"],
    [...args, "--baseline", baseline, "--baseline=" + baseline],
    [...args, "--baseline-snapshot", "--baseline-snapshot"],
    [...args, "--baseline-snapshot=true"], [...args, "--baseline-snapshot", "--blockers-only"],
    [...args, "--baseline-snapshot", "--checklist"],
    ["guide", ...evidenceArgs, "--baseline", baseline],
    ["explain", "分享", ...evidenceArgs, "--baseline-snapshot"],
  ]) assertRejected(call(command), /基线|baseline|evidence|json-version/);
  for (const flag of ["--help", "--version"]) {
    const help = call([...args, "--baseline", baseline, flag]);
    assert.equal(help.status, 0);
    assert.equal(help.stderr, "");
    assert.ok(help.stdout.length > 0);
  }
});

test("baseline files share local JSON bounds and use fixed diagnostics for malformed snapshots", t => {
  const { dir, project, baseline } = workspace(t);
  const snapshot = save(project, baseline);
  assertRejected(compare(project, dir), /不可读取/);
  assertRejected(compare(project, join(dir, "absent.json")), /不可读取/);
  const privatePath = join(dir, "secret-baseline.json");
  writeFileSync(privatePath, "SYNTHETIC_PRIVATE_MARKER");
  assertRejected(compare(project, privatePath), /私有文件/);

  const linked = join(dir, "linked");
  symlinkSync(dir, linked, process.platform === "win32" ? "junction" : "dir");
  const throughLink = join(linked, "baseline.json");
  const lstat = t.mock.method(fs, "lstatSync");
  syncBuiltinESMExports();
  try {
    assertRejected(compare(project, throughLink), /链接/);
    const checked = lstat.mock.calls.map(call => call.arguments[0]);
    assert.ok(checked.includes(linked));
    assert.ok(!checked.includes(throughLink), "linked directory content must not be accessed");
  } finally {
    lstat.mock.restore();
    syncBuiltinESMExports();
  }
  if (process.platform === "win32") {
    for (const path of [baseline + ":SYNTHETIC_PRIVATE_MARKER", baseline + ".", baseline + " "])
      assertRejected(compare(project, path), /路径别名/);
  }
  assertRejected(compare(project, "https://example.invalid/SYNTHETIC_PRIVATE_MARKER.json"), /仅支持本地/);

  for (const bytes of ['{"SYNTHETIC_PRIVATE_MARKER"', Buffer.from([0x7b, 0xff, 0x7d])]) {
    writeFileSync(baseline, bytes);
    assertRejected(compare(project, baseline), /UTF-8 JSON/);
  }
  writeFileSync(baseline, JSON.stringify(withoutBaseline(snapshot)));
  assertRejected(compare(project, baseline), /--baseline-snapshot/);
  for (const corrupt of [
    value => { value.meta.baseline.schemaVersion = 2; },
    value => { value.meta.evidence.schemaVersion = 2; },
    value => { value.meta.scan.readErrors = 1; },
    value => { value.items.push(value.items[0]); },
    value => { value.items[0].evidence.locations[0].file = "../SYNTHETIC_PRIVATE_MARKER.js"; },
    value => { value.items[0].evidence.locations[0].file = "C:SYNTHETIC_PRIVATE_MARKER.js"; },
  ]) {
    const invalid = globalThis.structuredClone(snapshot);
    corrupt(invalid);
    writeFileSync(baseline, JSON.stringify(invalid));
    assertRejected(compare(project, baseline), /基线 v1/);
  }
  const json = JSON.stringify(snapshot);
  const bytesAtLimit = json + " ".repeat(5 * 1024 * 1024 - Buffer.byteLength(json));
  writeFileSync(baseline, bytesAtLimit);
  assert.equal(report(compare(project, baseline)).meta.baseline.status, "compared");
  writeFileSync(baseline, bytesAtLimit + " ");
  assertRejected(compare(project, baseline), /5 MiB/);
});

test("a location rejected at read time is rejected before snapshot output", { skip: process.platform === "win32" }, t => {
  const { project, source } = workspace(t);
  renameSync(source, join(project, "C:app.js"));
  assertRejected(call(["check", project, ...evidenceArgs, "--baseline-snapshot"]), /基线 v1/);
});

test("the versioned schema validates snapshot and comparison shapes", t => {
  const { project, baseline } = workspace(t);
  const schema = JSON.parse(readFileSync(new URL("../schemas/cli-report-v1.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv({ strictRequired: false }).compile(schema);
  const snapshot = save(project, baseline);
  const compared = report(compare(project, baseline));
  const incomparable = report(compare(project, baseline, ["--subject", "personal"]));
  for (const result of [snapshot, compared, incomparable])
    assert.ok(validate(result), JSON.stringify(validate.errors));
  for (const invalid of [
    { ...snapshot, command: "guide", selfCheck: [] },
    { ...compared, items: snapshot.items },
    { ...incomparable, meta: { ...incomparable.meta, baseline: { ...incomparable.meta.baseline, reasonCodes: [] } } },
  ]) assert.equal(validate(invalid), false);
});

test("snapshot export rejects an encoded report above 5 MiB before stdout", t => {
  const { project, source } = workspace(t);
  const suffix = ["a", "b", "c", "d"].map(part => part.repeat(55)).join(".");
  const urls = Array.from({ length: 14000 }, (_, i) => '"https://' + i + "." + suffix + '.example"');
  writeFileSync(source, "const urls = [\n" + urls.join(",\n") + "\n];\nwx.request({ url: urls[0] });\n");
  const args = ["check", project, ...evidenceArgs, "--fail-on", "none"];
  const ordinary = call(args);
  assert.equal(ordinary.status, 0);
  assert.ok(Buffer.byteLength(ordinary.stdout, "utf8") > 5 * 1024 * 1024);
  assertRejected(call([...args, "--baseline-snapshot"]), /超过 5 MiB/);
});
