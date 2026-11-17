import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv from "ajv";

const schema = JSON.parse(readFileSync(new URL("../schemas/cli-report-v1.schema.json", import.meta.url), "utf8"));
const validate = new Ajv({ strictRequired: false }).compile(schema);
const location = (change = {}) => ({ file: "pages/home.js", line: 3, column: 8, kind: "api-reference", signal: "wx.getLocation", ...change });
const item = (status = "located", locations = [location()]) => ({ ruleId: "fixture.rule", evidence: { status, locations } });
const report = (items = [item()]) => ({ schemaVersion: 1, command: "check", meta: { evidence: { schemaVersion: 1, truncated: false } }, items, notes: [] });
function accepts(value) { assert.ok(validate(value), JSON.stringify(validate.errors)); }
function rejects(value) { assert.equal(validate(value), false, JSON.stringify(value)); }

test("evidence schema accepts exact, file-only, unavailable and truncated shapes", () => {
  for (const kind of ["api-reference", "api-import", "domain", "insecure-request", "config-key", "secret-key"])
    accepts(report([item("located", [location({ kind })])]));
  accepts(report([]));
  accepts(report([item("partial", [location(), location({ file: "app.json", line: null, column: null, kind: "config-key", signal: "app.json:permission:scope.userLocation" })])]));
  accepts(report([item("unavailable", [])]));
  accepts({ ...report([item("partial", [])]), meta: { evidence: { schemaVersion: 1, truncated: true } } });
  accepts(report([item("located", Array.from({ length: 100 }, (_, index) => location({ line: index + 1 })))]));
  for (const file of ["app.js", "目录/页面.vue", "pages/a b.js", "pages/sanitized?.js"])
    accepts(report([item("located", [location({ file })])]));
});

test("evidence marker is check-only and requires evidence on every displayed item", () => {
  rejects(report([{}]));
  rejects(report([item(), { ruleId: "missing" }]));
  rejects({ ...report(), meta: {} });
  rejects({ ...report(), command: "guide", selfCheck: [] });
  rejects({ ...report(), command: "explain" });
  for (const marker of [null, [], {}, { schemaVersion: 2, truncated: false }, { schemaVersion: "1", truncated: false }, { schemaVersion: 1 }, { schemaVersion: 1, truncated: "false" }, { schemaVersion: 1, truncated: false, source: "unexpected" }])
    rejects({ ...report(), meta: { evidence: marker } });
});

test("evidence locations enforce relative paths, paired positions, kinds and capacity", () => {
  for (const file of ["", "/app.js", "C:/app.js", "C:app.js", "../app.js", "a/../app.js", "./app.js", "a/./app.js", "a//app.js", "a/", "a\\app.js", "a\n.js", "a`.js"])
    rejects(report([item("located", [location({ file })])]));
  for (const change of [{ line: 0 }, { column: 0 }, { line: -1 }, { column: 1.5 }, { line: "1" }, { line: null }, { column: null }, { kind: "api-call" }, { signal: "" }, { signal: 1 }, { source: "code must not appear" }])
    rejects(report([item("partial", [location(change)])]));
  for (const key of ["file", "line", "column", "kind", "signal"]) {
    const missing = location();
    delete missing[key];
    rejects(report([item("partial", [missing])]));
  }
  rejects(report([item("located", Array.from({ length: 101 }, (_, index) => location({ line: index + 1 })))]));
  rejects(report([item("located", [location(), location()])]));
});

test("evidence status and location availability stay consistent", () => {
  for (const evidence of [null, [], {}, { status: "other", locations: [] }, { status: "located", locations: [] }, { status: "located", locations: [location({ line: null, column: null })] }, { status: "unavailable", locations: [location()] }, { status: "partial", locations: [], source: "unexpected" }])
    rejects(report([{ evidence }]));
});

test("legacy JSON reports remain accepted without evidence", () => {
  const baseline = JSON.parse(readFileSync(new URL("./fixtures/cli-legacy.json", import.meta.url), "utf8"));
  let count = 0;
  for (const sample of baseline.cases.filter(entry => entry.args.includes("--json") && entry.code !== 1)) {
    const legacy = JSON.parse(sample.stdout);
    accepts({ ...legacy, schemaVersion: 1, futureField: true });
    count++;
  }
  assert.ok(count >= 3);
});
