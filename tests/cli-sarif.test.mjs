import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";
import { main } from "../src/cli.mjs";
import { toSarif } from "../src/cli-sarif.mjs";

const bin = fileURLToPath(new URL("../bin/weapp-shipmate.mjs", import.meta.url));
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const photoRule = "privacy.choosePhotoVideo";
const domainRule = "domain.request-whitelist";

function project(t) {
  const dir = mkdtempSync(join(tmpdir(), "shipmate SARIF "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function call(args) {
  let stdout = "", stderr = "";
  const status = main(["node", bin, ...args], { write(text) { stdout += text; } }, { write(text) { stderr += text; } });
  return { status, stdout, stderr };
}

function cli(args) {
  const child = spawnSync(process.execPath, [bin, ...args], { timeout: 15000 });
  assert.ifError(child.error);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  return { status: child.status, stdout: decoder.decode(child.stdout), stderr: decoder.decode(child.stderr) };
}

function sarif(result, status) {
  assert.equal(result.status, status, result.stderr);
  assert.equal(result.stdout.slice(-2), "}\n");
  const document = JSON.parse(result.stdout);
  assert.equal(document.$schema, "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json");
  assert.equal(document.version, "2.1.0");
  assert.equal(document.runs.length, 1);
  const [run] = document.runs;
  const { driver } = run.tool;
  assert.equal(driver.name, "weapp-shipmate");
  assert.equal(driver.version, version);
  assert.equal(run.invocations.length, 1);
  assert.equal(run.invocations[0].exitCode, status);
  assert.equal(run.invocations[0].executionSuccessful, true);
  assert.equal(new Set(driver.rules.map(rule => rule.id)).size, driver.rules.length);
  for (const finding of run.results) {
    assert.ok(Number.isInteger(finding.ruleIndex));
    assert.equal(driver.rules[finding.ruleIndex]?.id, finding.ruleId);
  }
  return run;
}

function assertFailure(result, diagnostic) {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, diagnostic);
}

test("SARIF exports true relative URIs, UTF-16 regions and rule source metadata", t => {
  const dir = project(t);
  const folder = "页面 #1";
  const literalBackslash = process.platform === "win32" ? "" : "\\page";
  const name = "选择 %20` demo" + literalBackslash + ".js";
  mkdirSync(join(dir, folder));
  const file = join(dir, folder, name);
  const prefix = 'const prefix = "😀"; ';
  writeFileSync(file, prefix + "wx.chooseMedia();\r\n wx.chooseImage();\n  wx.chooseMedia();\r" +
    "   wx.chooseVideo();\u2028    wx.chooseMedia();\u2029     wx.chooseMedia();\n");

  const args = ["check", dir, "--sarif", "--fail-on", "warning"];
  const output = cli(args);
  const run = sarif(output, 2);
  assert.equal(call(args).stdout, output.stdout);
  assert.equal(run.columnKind, "utf16CodeUnits");
  assert.deepEqual(run.newlineSequences, ["\r\n", "\n", "\r", "\u2028", "\u2029"]);
  assert.deepEqual(run.properties, { scanComplete: true, evidenceTruncated: false, hiddenNonBlockerCount: 0 });
  const finding = run.results.find(item => item.ruleId === photoRule);
  assert.equal(finding.level, "warning");
  assert.equal(finding.properties.evidenceStatus, "located");
  assert.equal(finding.locations.length, 1);
  assert.deepEqual(finding.relatedLocations.map(location => location.id), [1, 2, 3, 4, 5]);
  const uri = "%E9%A1%B5%E9%9D%A2%20%231/%E9%80%89%E6%8B%A9%20%2520%60%20demo" +
    (literalBackslash ? "%5Cpage" : "") + ".js";
  const physical = [...finding.locations, ...finding.relatedLocations].map(location => location.physicalLocation);
  assert.deepEqual(physical.map(location => location.region), [
    { startLine: 1, startColumn: prefix.length + 1 }, { startLine: 2, startColumn: 2 },
    { startLine: 3, startColumn: 3 }, { startLine: 4, startColumn: 4 },
    { startLine: 5, startColumn: 5 }, { startLine: 6, startColumn: 6 },
  ]);
  for (const location of physical) {
    assert.deepEqual(location.artifactLocation, { uri, uriBaseId: "%SRCROOT%" });
    assert.equal(fileURLToPath(new URL(location.artifactLocation.uri, pathToFileURL(dir + sep))), file);
  }

  const legacy = call(["check", dir, "--evidence", "--json", "--json-version", "1"]);
  assert.equal(legacy.status, 0, legacy.stderr);
  const existing = JSON.parse(legacy.stdout);
  assert.deepEqual(run.results.map(item => item.ruleId), existing.items.map(item => item.ruleId));
  const reference = existing.items.find(item => item.ruleId === photoRule);
  assert.equal(reference.evidence.locations[0].file, `${folder}/${name.replace("`", "?").replace("\\", "/")}`);
  const rule = run.tool.driver.rules[finding.ruleIndex];
  assert.equal(rule.shortDescription.text, reference.title);
  assert.equal(rule.helpUri, reference.official_url);
  assert.equal(rule.help.text, reference.source_quote);
  assert.equal(rule.properties.lastVerified, reference.last_verified);
  for (const text of [reference.title, reference.why, ...reference.requires]) assert.ok(finding.message.text.includes(text));
});

test("SARIF keeps complete documents at each threshold and counts findings before focus", t => {
  const dir = project(t);
  writeFileSync(join(dir, "app.js"), "wx.chooseMedia();\n");
  for (const [threshold, code] of [["blocker", 0], ["warning", 2], ["info", 2], ["none", 0]]) {
    const output = cli(["check", dir, "--sarif", `--fail-on=${threshold}`, "--blockers-only"]);
    const run = sarif(output, code);
    assert.deepEqual(run.results, []);
    assert.equal(run.properties.hiddenNonBlockerCount, 1);
    assert.equal(output.stderr, code === 2 ? `--fail-on ${threshold} 命中 1 项。\n` : "");
  }
  writeFileSync(join(dir, "view.wxml"), "<web-view></web-view>\n");
  const output = cli(["check", dir, "--sarif", "--subject", "personal", "--fail-on", "none"]);
  const run = sarif(output, 0);
  assert.equal(output.stderr, "");
  assert.ok(run.results.some(item => item.level === "error"));
  assert.ok(run.results.some(item => item.level === "warning"));
});

test("SARIF composes with config, subject overrides and draft selections", t => {
  const dir = project(t);
  const config = join(dir, "settings.json");
  writeFileSync(join(dir, "view.wxml"), "<web-view></web-view>\n");
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, check: { subject: "personal", failOn: "warning" } }));
  const args = ["check", dir, "--sarif", "--config", config, "--blockers-only"];
  const configured = call(args);
  assert.deepEqual(sarif(configured, 2).results.map(item => item.ruleId), ["domain.web-view-personal"]);
  assert.equal(configured.stderr, "--fail-on warning 命中 2 项。\n");

  const overridden = call([...args, "--subject", "enterprise", "--include-drafts"]);
  const run = sarif(overridden, 2);
  assert.deepEqual(run.results, []);
  assert.equal(run.properties.hiddenNonBlockerCount, 1);
  assert.equal(overridden.stderr, "--fail-on warning 命中 1 项。\n");
  assert.ok(run.invocations[0].toolExecutionNotifications.some(note => note.message.text.includes("已包含 draft")));
});

test("SARIF preserves empty runs and incomplete scan notifications", t => {
  const dir = project(t);
  const source = join(dir, "app.js");
  const args = ["check", dir, "--sarif", "--fail-on", "warning"];
  writeFileSync(source, "Page({});\n");
  const empty = cli(args);
  const noFindings = sarif(empty, 0);
  assert.deepEqual(noFindings.results, []);
  assert.equal(noFindings.properties.scanComplete, true);
  assert.equal(empty.stderr, "");

  writeFileSync(source, "wx.request({ url: baseURL + path });\n");
  writeFileSync(join(dir, "app.json"), "{ invalid json }\n");
  const run = sarif(cli(args), 2);
  assert.equal(run.properties.scanComplete, false);
  assert.equal(run.properties.evidenceTruncated, false);
  const domain = run.results.find(item => item.ruleId === domainRule);
  assert.equal(domain.properties.evidenceStatus, "partial");
  assert.equal(domain.locations.length, 1);
  const notifications = run.invocations[0].toolExecutionNotifications.map(note => note.message.text);
  assert.ok(notifications.some(note => note.includes("配置文件读取/解析失败")));
  assert.ok(notifications.some(note => note.includes("动态拼接的请求 URL")));
});

test("SARIF preserves primary and related location order after deduplicating coordinates", () => {
  const position = (file, line = null, column = null, signal = "fixture") => ({ file, line, column, kind: "api-reference", signal });
  const item = { ruleId: "fixture.info", title: "测试规则", severity: "info", requires: [] };
  const report = {
    command: "check",
    meta: { scan: { scope: { complete: true } }, evidence: { truncated: false } },
    items: [
      { ...item, evidence: { status: "partial", locations: [
        position("first.js"), position("primary.js", 4, 7), position("primary.js", 4, 7, "duplicate location"),
        position("second.js"), position("primary.js", 4, 8),
      ] } },
      { ...item, evidence: { status: "partial", locations: [position("first.js"), position("second.js")] } },
      { ...item, evidence: { status: "unavailable", locations: [] } },
    ],
    notes: ["第一条", "第二条", "第一条"],
  };
  const [run] = toSarif(report, { version, exitCode: 0 }).runs;
  const physical = (uri, region) => ({ physicalLocation: {
    artifactLocation: { uri, uriBaseId: "%SRCROOT%" }, ...(region ? { region } : {}),
  } });
  assert.equal(run.tool.driver.rules.length, 1);
  assert.deepEqual(run.results.map(item => [item.ruleIndex, item.level, item.properties.evidenceStatus]), [
    [0, "note", "partial"], [0, "note", "partial"], [0, "note", "unavailable"],
  ]);
  const [mixed, fileOnly, unavailable] = run.results;
  assert.deepEqual(mixed.locations, [physical("primary.js", { startLine: 4, startColumn: 7 })]);
  assert.deepEqual(mixed.relatedLocations, [
    { id: 1, ...physical("first.js") }, { id: 2, ...physical("second.js") },
    { id: 3, ...physical("primary.js", { startLine: 4, startColumn: 8 }) },
  ]);
  assert.deepEqual(fileOnly.locations, [physical("first.js")]);
  assert.deepEqual(fileOnly.relatedLocations, [{ id: 1, ...physical("second.js") }]);
  assert.deepEqual(unavailable.locations, []);
  assert.deepEqual(run.invocations[0].toolExecutionNotifications.map(note => note.message.text), ["第一条", "第二条"]);
});

test("SARIF reports the per-item cap and completely drains large stdout at exit 2", t => {
  const dir = project(t);
  const calls = "wx.chooseMedia(); wx.getClipboardData(); wx.openBluetoothAdapter();\n";
  writeFileSync(join(dir, "app.js"), calls.repeat(101));
  const output = cli(["check", dir, "--sarif", "--fail-on", "warning"]);
  assert.ok(Buffer.byteLength(output.stdout) > 64 * 1024);
  const run = sarif(output, 2);
  assert.equal(run.properties.scanComplete, true);
  assert.equal(run.properties.evidenceTruncated, true);
  for (const ruleId of [photoRule, "privacy.clipboard", "privacy.bluetooth"]) {
    const finding = run.results.find(item => item.ruleId === ruleId);
    assert.equal(finding.properties.evidenceStatus, "partial");
    assert.equal(finding.relatedLocations.length, 99);
    assert.equal(finding.relatedLocations.at(-1).physicalLocation.region.startLine, 100);
  }
  assert.ok(run.invocations[0].toolExecutionNotifications.some(note => note.message.text.includes("证据位置已截断")));
});

test("SARIF exposes the global evidence cap without dropping unlocated findings", t => {
  const dir = project(t);
  writeFileSync(join(dir, "app.js"), "wx.showToast();\n".repeat(20001) + "wx.chooseMedia();\n");
  const run = sarif(call(["check", dir, "--sarif", "--fail-on", "warning"]), 2);
  assert.equal(run.properties.scanComplete, true);
  assert.equal(run.properties.evidenceTruncated, true);
  const finding = run.results.find(item => item.ruleId === photoRule);
  assert.equal(finding.properties.evidenceStatus, "partial");
  assert.deepEqual(finding.locations, []);
  assert.ok(run.invocations[0].toolExecutionNotifications.some(note => note.message.text.includes("证据位置已截断")));
});

test("SARIF includes only sanitized facts from source, requests and credential findings", t => {
  const dir = project(t);
  const markers = ["SARIF_FAKE_KEY", "SARIF_FAKE_USER", "SARIF_FAKE_PASSWORD", "SARIF_REQUEST_PATH", "SARIF_QUERY_VALUE", "SARIF_SOURCE_TEXT"];
  const [key, user, password, path, query, source] = markers;
  writeFileSync(join(dir, "app{0}.js"), `const testData = { appsecret: "${key}" };\n` +
    `const sample = "${source}";\nwx.request({ url: "https://${user}:${password}@synthetic.example/${path}?value=${query}" });\n`);
  const output = cli(["check", dir, "--sarif"]);
  const run = sarif(output, 2);
  assert.equal(output.stderr, "");
  const credential = run.results.find(item => item.ruleId === "security.hardcoded-secret");
  assert.equal(credential.level, "error");
  assert.match(credential.message.text, /app\{\{0\}\}\.js.*appsecret/);
  assert.equal(credential.locations[0].physicalLocation.artifactLocation.uri, "app%7B0%7D.js");
  assert.match(run.results.find(item => item.ruleId === domainRule).message.text, /synthetic\.example/);
  for (const marker of [...markers, basename(dir), encodeURIComponent(basename(dir))]) {
    assert.ok(!output.stdout.includes(marker), `unexpected unredacted value ${marker}`);
  }
});

test("credential findings keep the complete path and both positions when a POSIX path contains ::", {
  skip: process.platform === "win32" && "Windows file names cannot contain colons",
}, t => {
  const dir = project(t);
  const folder = "source::backup";
  const name = "page::copy.js";
  const file = `${folder}/${name}`;
  const marker = "SYNTHETIC_CREDENTIAL_NOT_REAL";
  mkdirSync(join(dir, folder));
  writeFileSync(join(dir, folder, name),
    `const one = { AppSecret: "${marker}" };\nconst two = { appsecret: "${marker}" };\n`);

  const output = cli(["check", dir, "--sarif"]);
  const ruleId = "security.hardcoded-secret";
  const credential = sarif(output, 2).results.find(item => item.ruleId === ruleId);
  assert.equal(credential.properties.evidenceStatus, "located");
  const artifactLocation = { uri: "source%3A%3Abackup/page%3A%3Acopy.js", uriBaseId: "%SRCROOT%" };
  assert.deepEqual(credential.locations, [
    { physicalLocation: { artifactLocation, region: { startLine: 1, startColumn: 15 } } },
  ]);
  assert.deepEqual(credential.relatedLocations, [
    { id: 1, physicalLocation: { artifactLocation, region: { startLine: 2, startColumn: 15 } } },
  ]);
  assert.equal(fileURLToPath(new URL(artifactLocation.uri, pathToFileURL(dir + sep))), join(dir, folder, name));

  const json = call(["check", dir, "--evidence", "--json", "--json-version", "1"]);
  assert.equal(json.status, 2, json.stderr);
  const report = JSON.parse(json.stdout);
  assert.deepEqual(report.meta.scan.secretHints, [{ file, key: "appsecret" }]);
  const evidence = report.items.find(item => item.ruleId === ruleId).evidence;
  assert.equal(evidence.status, "located");
  assert.deepEqual(evidence.locations, [1, 2].map(line => ({ file, line, column: 15, kind: "secret-key", signal: "appsecret" })));
  assert.ok(!output.stdout.includes(marker));
  assert.ok(!json.stdout.includes(marker));
});

test("SARIF locates credential paths outside the portable v1 evidence format", {
  skip: process.platform === "win32" && "Windows file names cannot contain colons",
}, t => {
  const dir = project(t);
  const marker = "SYNTHETIC_PORTABLE_PATH_SECRET";
  const files = ["a::key.js", "\\folder::copy.js", "nested\\..\\key::copy.js"];
  for (const file of files) {
    writeFileSync(join(dir, file), `const sample = { appsecret: "${marker}" };\n`);
  }

  const output = cli(["check", dir, "--sarif"]);
  const ruleId = "security.hardcoded-secret";
  const item = sarif(output, 2).results.find(result => result.ruleId === ruleId);
  assert.equal(item.properties.evidenceStatus, "located");
  const paths = [...item.locations, ...item.relatedLocations].map(({ physicalLocation }) =>
    physicalLocation.artifactLocation.uri);
  assert.deepEqual(paths.sort(), files.map(encodeURIComponent).sort());
  assert.ok(!output.stdout.includes(marker));

  const snapshotArgs = ["check", dir, "--evidence", "--json", "--json-version", "1", "--baseline-snapshot"];
  const snapshot = call(snapshotArgs);
  assert.equal(snapshot.status, 2, snapshot.stderr);
  const report = JSON.parse(snapshot.stdout);
  assert.deepEqual(report.items.find(item => item.ruleId === ruleId).evidence, {
    status: "unavailable",
    locations: [],
  });
  assert.equal(report.meta.scan.secretHints.length, files.length);
  assert.ok(report.meta.scan.secretHints.every(({ key }) => key === "appsecret"));
  assert.ok(!snapshot.stdout.includes(marker));

  writeFileSync(join(dir, "source::copy.js"), `const sample = { appsecret: "${marker}" };\n`);
  const mixed = call(snapshotArgs);
  assert.equal(mixed.status, 2, mixed.stderr);
  const mixedEvidence = JSON.parse(mixed.stdout).items.find(item => item.ruleId === ruleId).evidence;
  assert.equal(mixedEvidence.status, "partial");
  assert.deepEqual(mixedEvidence.locations.map(({ file }) => file), ["source::copy.js"]);
});

test("SARIF rejects incompatible commands and options with empty stdout", t => {
  const dir = project(t);
  const check = ["check", dir, "--sarif"];
  assertFailure(cli([...check, "--json"]), /--sarif/);
  for (const args of [
    [...check, "--json-version", "1"], [...check, "--checklist"], [...check, "--evidence"],
    [...check, "--baseline", "baseline.json"], [...check, "--baseline-snapshot"],
    [...check, "--sarif"], ["check", dir, "--sarif=false"], ["check", dir, "--sarif="],
    ["guide", "--sarif"], ["explain", "诱导分享", "--sarif"],
  ]) assertFailure(call(args), /--sarif/);
  assertFailure(call([...check, "true"]), /位置参数/);

  const config = join(dir, "absent.json");
  const help = call([...check, "--help", "--config", config]);
  const release = call([...check, "--version", "--config", config]);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stderr, "");
  assert.match(help.stdout, /--sarif/);
  assert.deepEqual(release, { status: 0, stdout: `${version}\n`, stderr: "" });
});

test("SARIF emits no bytes on a fatal scan, config or serialization error", t => {
  const dir = project(t);
  assertFailure(cli(["check", join(dir, "absent"), "--sarif"]), /目录不存在/);

  const config = join(dir, "settings.json");
  writeFileSync(config, '{"schemaVersion": 1, "check": "SARIF_INVALID_CONFIG_MARKER"}\n');
  const args = ["check", dir, "--sarif"];
  const badConfig = call([...args, "--config", config]);
  assertFailure(badConfig, /check/);
  assert.doesNotMatch(badConfig.stderr, /SARIF_INVALID_CONFIG_MARKER/);

  const stringify = JSON.stringify;
  t.mock.method(JSON, "stringify", (value, ...options) => {
    if (value?.version === "2.1.0" && value.runs) throw new Error("synthetic serialization error");
    return stringify(value, ...options);
  });
  assertFailure(call(args), /synthetic serialization error/);
});
