import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectTool } from "../src/project-artifact.mjs";
import { projectPreflightEvidence, serializeProjectToolResult } from "../src/project-evidence.mjs";

function temporaryProject(t) {
  const directory = fs.mkdtempSync(join(tmpdir(), "shipmate-desktop-evidence-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(join(directory, "app.json"), "{}");
  return directory;
}

function bundledTool(kind, input) {
  const run = spawnSync(process.execPath, ["src/project-tool.mjs", kind, JSON.stringify(input)], { encoding: "utf8" });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, "");
  return run.stdout;
}

test("desktop positions come from one scan and leave the saved report byte-identical", t => {
  const directory = temporaryProject(t);
  const entry = join(directory, "页面.js");
  fs.writeFileSync(entry, "const note = 'synthetic-source-marker';\nwx.getLocation(); wx.getLocation();\n" + "wx.getLocation();\n".repeat(120));
  fs.writeFileSync(join(directory, "secret-hidden.js"), "wx.getPhoneNumber();");
  const outside = temporaryProject(t);
  fs.writeFileSync(join(outside, "outside.js"), "wx.getLocation();");
  fs.symlinkSync(outside, join(directory, "linked"), process.platform === "win32" ? "junction" : "dir");
  const input = { directory, subject: "personal" };
  const expected = JSON.stringify(runProjectTool("check", input));
  const original = fs.readFileSync;
  let entryReads = 0;
  const read = t.mock.method(fs, "readFileSync", (file, ...options) => {
    if (file === entry) entryReads++;
    return original(file, ...options);
  });
  syncBuiltinESMExports();
  let result;
  try {
    result = runProjectTool("check", input, { includePreflightEvidence: true });
  } finally {
    read.mock.restore();
    syncBuiltinESMExports();
  }
  const { preflightEvidence, ...artifact } = result;
  assert.equal(JSON.stringify(artifact), expected);
  assert.equal(entryReads, 1);
  assert.equal(preflightEvidence.truncated, true);
  const locations = preflightEvidence.items.find(item => item.ruleId === "privacy.getLocation");
  assert.equal(locations.status, "partial");
  assert.deepEqual(locations.locations.slice(0, 2), [{ file: "页面.js", line: 2 }, { file: "页面.js", line: 3 }]);
  const serialized = JSON.stringify(preflightEvidence);
  assert.doesNotMatch(serialized, /synthetic-source-marker|secret-hidden\.js|outside\.js|wx\.getLocation|https:\/\//u);
  assert.ok(Buffer.byteLength(serialized) <= 16 * 1024);
});

test("only a strictly opted in bundled check emits a receipt sibling", t => {
  const directory = temporaryProject(t);
  fs.writeFileSync(join(directory, "app.js"), "wx.getLocation();");
  const input = { directory };
  const plain = bundledTool("check", input);
  assert.equal(plain, JSON.stringify(runProjectTool("check", { ...input, includePreflightEvidence: true })));
  assert.equal(bundledTool("check", { ...input, includePreflightEvidence: "true" }), plain);
  assert.equal(bundledTool("guide", { subject: "personal", includePreflightEvidence: true }), bundledTool("guide", { subject: "personal" }));
  const enriched = bundledTool("check", { ...input, includePreflightEvidence: true });
  const { preflightEvidence, ...artifact } = JSON.parse(enriched);
  assert.equal(JSON.stringify(artifact), plain);
  assert.equal(enriched, plain.slice(0, -1) + `,"preflightEvidence":${JSON.stringify(preflightEvidence)}}`);
  assert.ok(preflightEvidence.items.some(item => item.status === "located" && item.locations.some(location => location.file === "app.js" && location.line === 1)));
});

test("a literal backslash filename never turns into a different displayed path", { skip: process.platform === "win32" }, t => {
  const directory = temporaryProject(t);
  fs.writeFileSync(join(directory, "other\\page.js"), "wx.getLocation();");
  const input = { directory };
  const { preflightEvidence, ...artifact } = runProjectTool("check", input, { includePreflightEvidence: true });
  assert.deepEqual(artifact, runProjectTool("check", input));
  const finding = preflightEvidence.items.find(item => item.ruleId === "privacy.getLocation");
  assert.deepEqual(finding, { ruleId: "privacy.getLocation", status: "partial", locations: [] });
});

test("the bounded view preserves file-only findings and a useful position for each item", () => {
  const candidate = (file, line) => ({ file, line, column: 2, signal: "synthetic-signal", sourceText: "synthetic-source-marker" });
  const findings = [
    { ruleId: "first", evidence: { status: "located", locations: Array.from({ length: 100 }, (_, i) => candidate(`pages/${"长".repeat(126)}-${i}.js`, 1)) } },
    { ruleId: "next", evidence: { status: "located", locations: [candidate("app.js", 7)] } },
    { ruleId: "file-only", evidence: { status: "partial", locations: [candidate("app.json", null)] } },
    { ruleId: "unsafe", evidence: { status: "located", locations: [
      ...["../bad.js", "bad/../file.js", "/root.js", "C:/absolute.js", "bad\\path.js", "bad?/file.js", "bad /file.js", "secret-hidden.js", "pages/a\u0001.js"].map(file => candidate(file, 1)),
      candidate("off-by-one.js", 0),
      candidate("pages/misordered\u202e.js", 1),
    ] } },
  ];
  const report = { items: findings, meta: { evidence: { truncated: false } } };
  const projected = projectPreflightEvidence(report);
  assert.deepEqual(projected, projectPreflightEvidence(report));
  assert.equal(projected.truncated, true);
  assert.ok(projected.items[0].locations.length > 0 && projected.items[0].locations.length < 100);
  assert.equal(projected.items[0].status, "partial");
  assert.deepEqual(projected.items.slice(1), [
    { ruleId: "next", status: "located", locations: [{ file: "app.js", line: 7 }] },
    { ruleId: "file-only", status: "partial", locations: [{ file: "app.json", line: null }] },
    { ruleId: "unsafe", status: "partial", locations: [] },
  ]);
  const wire = JSON.stringify(projected);
  assert.ok(Buffer.byteLength(wire) <= 16 * 1024);
  assert.doesNotMatch(wire, /synthetic-|column|sourceText|bad\?|absolute\.js/u);
});

test("the live receipt never consumes bytes needed by the original stdout envelope", () => {
  const limit = 2 * 1024 * 1024;
  const empty = { markdown: "", data: null };
  const rawBytes = value => Buffer.byteLength(JSON.stringify(value));
  const full = { items: [{ ruleId: "rule", status: "located", locations: [{ file: "目录/页面.js", line: 5 }] }], truncated: false };
  const omitted = { items: [], truncated: true };
  const overhead = preflightEvidence => rawBytes({ ...empty, preflightEvidence }) - rawBytes(empty);
  const envelopeOfSize = bytes => ({ ...empty, markdown: "行" + "x".repeat(bytes - rawBytes(empty) - Buffer.byteLength("行")) });
  for (const [bytes, expected] of [
    [limit - overhead(full), full],
    [limit - overhead(full) + 1, omitted],
    [limit - overhead(omitted), omitted],
    [limit - overhead(omitted) + 1, undefined],
  ]) {
    const artifact = envelopeOfSize(bytes);
    const output = serializeProjectToolResult({ ...artifact, preflightEvidence: full });
    const { preflightEvidence, ...received } = JSON.parse(output);
    assert.deepEqual(preflightEvidence, expected);
    assert.equal(JSON.stringify(received), JSON.stringify(artifact));
    assert.ok(Buffer.byteLength(output) <= limit);
    if (bytes + overhead(full) === limit || bytes + overhead(omitted) === limit) {
      assert.equal(Buffer.byteLength(output), limit);
    }
  }
});
