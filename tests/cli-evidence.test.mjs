import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Ajv from "ajv";
import { main } from "../src/cli.mjs";

function call(args) {
  let stdout = "", stderr = "";
  const status = main(["node", "cli", ...args], { write(text) { stdout += text; } }, { write(text) { stderr += text; } });
  return { status, stdout, stderr };
}
function project(t) {
  const dir = mkdtempSync(join(tmpdir(), "shipmate evidence cli "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, "app.js"), 'wx.getLocation(); wx.getLocation(); wx.request({url:"http://api.weixin.qq.com"});');
  return dir;
}

test("explicit CLI evidence composes with configuration, filtering, drafts and all thresholds", t => {
  const dir = project(t);
  const config = join(dir, "shipmate.json");
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, check: { subject: "personal" } }));
  const validate = new Ajv({ strictRequired: false }).compile(JSON.parse(readFileSync(new URL("../schemas/cli-report-v1.schema.json", import.meta.url))));
  for (const level of ["blocker", "warning", "info", "none"])
    for (const options of [[], ["--blockers-only"], ["--include-drafts"]]) {
      const args = ["check", dir, "--config", config, "--json", "--json-version", "1", "--fail-on", level, ...options];
      const plain = call(args), enriched = call([...args, "--evidence"]);
      assert.equal(enriched.status, plain.status, enriched.stderr);
      assert.equal(enriched.stderr, plain.stderr);
      const report = JSON.parse(enriched.stdout);
      assert.ok(validate(report), JSON.stringify(validate.errors));
      assert.ok(report.items.every(item => item.evidence));
      assert.ok(report.items.some(item => item.evidence.locations.length >= 2));
      assert.deepEqual(report.meta.evidence, { schemaVersion: 1, truncated: false });
      delete report.meta.evidence;
      for (const item of report.items) delete item.evidence;
      assert.deepEqual(report, JSON.parse(plain.stdout));
    }
});

test("evidence flag rejects incomplete, duplicate or incompatible calls", t => {
  const dir = project(t);
  for (const args of [
    ["check", dir, "--evidence"], ["check", dir, "--evidence", "--json"],
    ["check", dir, "--evidence=true", "--json", "--json-version", "1"],
    ["check", dir, "--evidence", "--evidence", "--json", "--json-version", "1"],
    ["check", dir, "--evidence", "--checklist", "--json", "--json-version", "1"],
    ["guide", "--evidence", "--json", "--json-version", "1"],
    ["explain", "分享", "--evidence", "--json", "--json-version", "1"],
  ]) {
    const result = call(args);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stdout, "");
  }
  for (const flag of ["--help", "--version"]) assert.equal(call(["check", "--evidence", flag]).status, 0);
});

test("evidence caps remain visible without changing fail-on exits", t => {
  const dir = project(t);
  writeFileSync(join(dir, "app.js"), 'wx.getLocation();\n'.repeat(20001));
  const args = ["check", dir, "--json", "--json-version", "1", "--fail-on", "blocker"];
  const plain = call(args), enriched = call([...args, "--evidence"]);
  assert.equal(enriched.status, plain.status);
  assert.equal(enriched.stderr, plain.stderr);
  const result = JSON.parse(enriched.stdout);
  assert.equal(result.meta.evidence.truncated, true);
  assert.ok(result.items.every(item => item.evidence.status === "partial" && item.evidence.locations.length <= 100));
  assert.match(result.notes.join(" "), /证据位置已截断/);
});
