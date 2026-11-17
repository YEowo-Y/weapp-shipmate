import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const root = fileURLToPath(new URL("../", import.meta.url));
const bin = join(root, "bin", "weapp-shipmate.mjs");
const schema = JSON.parse(readFileSync(join(root, "schemas", "cli-report-v1.schema.json"), "utf8"));
const validate = new Ajv({ strictRequired: false }).compile(schema);
function cli(args) {
  const run = spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8", timeout: 15000 });
  assert.ifError(run.error);
  return run;
}

test("explicit thresholds count all selected findings before display filtering", () => {
  const levels = { blocker: ["blocker"], warning: ["blocker", "warning"], info: ["blocker", "warning", "info"], none: [] };
  for (const fixture of ["sample-app", "leaky-app"]) {
    for (const drafts of [[], ["--include-drafts"]]) {
      const args = ["check", "fixtures/" + fixture, ...drafts, "--json"];
      const original = JSON.parse(cli(args).stdout);
      for (const [threshold, severities] of Object.entries(levels)) {
        const count = original.items.filter(item => severities.includes(item.severity)).length;
        for (const focus of [[], ["--blockers-only"]]) {
          const expected = JSON.parse(cli([...args, ...focus]).stdout);
          const run = cli([...args, ...focus, "--fail-on=" + threshold, "--json-version", "1"]);
          assert.equal(run.status, count ? 2 : 0, threshold + " " + fixture);
          assert.equal(run.stderr, count ? `--fail-on ${threshold} 命中 ${count} 项。\n` : "");
          assert.equal(run.stdout, JSON.stringify({ ...expected, schemaVersion: 1 }, null, 2) + "\n");
          assert.ok(validate(JSON.parse(run.stdout)), JSON.stringify(validate.errors));
        }
      }
    }
  }
});

test("threshold none still reports blockers and preserves execution errors", () => {
  const run = cli(["check", "fixtures/leaky-app", "--fail-on", "none", "--json"]);
  assert.equal(run.status, 0);
  assert.ok(JSON.parse(run.stdout).items.some(item => item.severity === "blocker"));
  const failure = cli(["check", "fixtures/cli-contract-does-not-exist", "--fail-on", "none"]);
  assert.equal(failure.status, 1);
  assert.equal(failure.stdout, "");
  assert.match(failure.stderr, /目录不存在/);
});

test("empty reports do not trip any threshold", () => {
  const dir = mkdtempSync(join(tmpdir(), "shipmate empty "));
  try {
    writeFileSync(join(dir, "index.js"), "const empty = true;\n");
    for (const threshold of ["none", "info", "warning", "blocker"]) {
      const run = cli(["check", dir, "--fail-on", threshold, "--json"]);
      assert.equal(run.status, 0);
      assert.equal(run.stderr, "");
      assert.deepEqual(JSON.parse(run.stdout).items, []);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON v1 covers every command and rejects malformed reports", () => {
  for (const args of [["check", "fixtures/sample-app"], ["guide", "--subject", "personal"], ["explain", "诱导分享"]]) {
    const run = cli([...args, "--json", "--json-version=1"]);
    assert.equal(run.status, 0);
    assert.equal(run.stderr, "");
    const report = JSON.parse(run.stdout);
    assert.ok(validate(report), JSON.stringify(validate.errors));
    assert.equal(run.stdout, JSON.stringify(report, null, 2) + "\n");
    for (const key of ["schemaVersion", "command", "meta", "items", "notes", ...(report.command === "guide" ? ["selfCheck"] : [])]) {
      const missing = { ...report };
      delete missing[key];
      assert.equal(validate(missing), false, key);
    }
    for (const change of [{ schemaVersion: 2 }, { schemaVersion: "1" }, { command: "other" },
      { meta: [] }, { items: ["bad"] }, { notes: [1] }, { selfCheck: [false] }]) {
      assert.equal(validate({ ...report, ...change }), false);
    }
    assert.ok(validate({ ...report, extra: true }));
    delete report.schemaVersion;
    assert.deepEqual(report, JSON.parse(cli([...args, "--json"]).stdout));
  }
});

test("new parameters reject invalid values, duplicate options and unsupported combinations", () => {
  const invalid = [
    ["check", "--fail-on"], ["check", "--fail-on="], ["check", "--fail-on", "all"],
    ["guide", "--fail-on", "none"], ["explain", "域名", "--fail-on", "blocker"],
    ["check", "--fail-on", "none", "--fail-on=blocker"], ["check", "--fail-on=none", "--fail-on=none"],
    ["guide", "--json", "--json-version"], ["guide", "--json", "--json-version="],
    ["guide", "--json", "--json-version=2"], ["guide", "--json-version", "1"],
    ["guide", "--json", "--json-version=1", "--checklist"],
    ["guide", "--json", "--json-version", "1", "--json-version=1"],
    ["guide", "--interactive", "--json", "--json-version", "1"],
  ];
  for (const args of invalid) {
    const run = cli(args);
    assert.equal(run.status, 1, args.join(" "));
    assert.equal(run.stdout, "", args.join(" "));
    assert.ok(run.stderr.trim(), args.join(" "));
  }
});

test("a large JSON v1 report is fully drained even when the threshold exits with 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "shipmate large report "));
  try {
    for (let i = 0; i < 400; i++)
      writeFileSync(join(dir, "page-" + i + ".js"), `wx.request({ url: "https://example-${i}.com/a" });\n`);
    const run = cli(["check", dir, "--json", "--json-version", "1", "--fail-on", "warning"]);
    assert.equal(run.status, 2);
    assert.ok(run.stdout.length > 16384);
    const report = JSON.parse(run.stdout);
    assert.ok(validate(report));
    assert.equal(report.meta.scan.filesScanned, 400);
    assert.ok(run.stdout.endsWith("}\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
