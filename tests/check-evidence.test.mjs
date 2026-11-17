import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { attachCheckEvidence } from "../src/check-evidence.mjs";
import { runCheck } from "../src/check.mjs";
import { crossChecks } from "../src/crosscheck.mjs";

const location = (kind, signal, file = "app.js", line = 1, column = 1) => ({ file, line, column, kind, signal });
const scan = (overrides = {}) => ({ apis: [], configKeys: [], domains: [], insecureHosts: [], secretHints: [], configErrors: [], dynamicRequest: false, scope: { complete: true }, ...overrides });
const report = (facts, items) => ({ command: "check", meta: { scan: facts, summary: "unchanged" }, items, notes: [] });

test("ordinary rule evidence uses actual API aliases, config matches and domain hints only", () => {
  const facts = scan({ apis: ["uni.getLocation", "wx.request", "wx.unrelated"], configKeys: ["component.camera"], domains: ["example.com"] });
  const rules = [
    { id: "privacy.test", stage: "privacy", match: { api: ["wx.getLocation"], config_key: ["component.camera"] } },
    { id: "domain.test", stage: "domain", match: { api: ["wx.request"] } },
  ];
  const locations = [
    location("api-reference", "wx.unrelated"), location("domain", "example.com"),
    location("api-reference", "uni.getLocation", "z.js", 4, 2),
    location("api-import", "uni.getLocation", "a.js", 1, 2),
    location("config-key", "component.camera", "template.wxml", 2, 1),
    location("api-reference", "wx.request"),
  ];
  const result = attachCheckEvidence(report(facts, rules.map(r => ({ ruleId: r.id, stage: r.stage }))), rules, { locations, truncated: false });
  assert.deepEqual(result.items[0].evidence, { status: "located", locations: [locations[3], locations[4], locations[2]] });
  assert.deepEqual(result.items[1].evidence, { status: "located", locations: [locations[5], locations[1]] });
  assert.deepEqual(result.meta.evidence, { schemaVersion: 1, truncated: false });
  assert.equal(result.meta.summary, "unchanged");
  assert.deepEqual(result.notes, []);
});

test("five crosschecks associate only the signals responsible for their finding", () => {
  const facts = scan({
    apis: ["uni.getLocation", "wx.chooseLocation", "wx.request"],
    configKeys: ["app.json:requiredPrivateInfos:chooseLocation"],
    domains: ["api.weixin.qq.com", "api2.weixin.qq.com", "example.com", "10.1.2.3", "203.0.113.7", "localhost"],
    insecureHosts: ["clear.example.com"], secretHints: [{ file: "a.js", key: "appsecret" }],
  });
  const locations = [
    location("api-reference", "uni.getLocation"), location("api-reference", "wx.chooseLocation"),
    location("api-reference", "wx.request"), ...facts.domains.map(host => location("domain", host)),
    location("insecure-request", "clear.example.com"), location("domain", "clear.example.com"),
    location("secret-key", "appsecret", "a.js"), location("secret-key", "appsecret", "unrelated.js"),
  ];
  const result = attachCheckEvidence(report(facts, crossChecks(facts)), [], { locations, truncated: false });
  const selected = id => result.items.find(item => item.ruleId === id).evidence.locations;
  assert.deepEqual(selected("consistency.requiredPrivateInfos"), [locations[0]]);
  assert.deepEqual(selected("security.backend-api-in-frontend").map(item => item.signal), ["api.weixin.qq.com", "api2.weixin.qq.com"]);
  assert.deepEqual(selected("security.hardcoded-secret"), [location("secret-key", "appsecret", "a.js")]);
  assert.deepEqual(selected("security.insecure-request"), [location("insecure-request", "clear.example.com")]);
  assert.deepEqual(selected("domain.ip-or-localhost").map(item => item.signal), ["203.0.113.7", "localhost"]);
  assert.ok(result.items.every(item => item.evidence.status === "located"));
});

test("file-only, missing evidence and dynamic notes are partial without conflating scan scope", () => {
  const rules = [{ id: "test", stage: "privacy", match: { api: ["wx.getLocation"], config_key: ["component.camera"] } }];
  const facts = scan({ apis: ["wx.getLocation"], configKeys: ["component.camera"], scope: { complete: false } });
  const reference = location("api-reference", "wx.getLocation");
  const config = location("config-key", "component.camera", "app.json", null, null);
  const evidence = locations => attachCheckEvidence(report(facts, [{ ruleId: "test" }]), rules, { locations, truncated: false }).items[0].evidence;
  assert.equal(evidence([reference, config]).status, "partial");
  assert.equal(evidence([reference]).status, "partial");
  assert.equal(evidence([]).status, "unavailable");
  assert.equal(evidence([reference, { ...config, line: 3, column: 1 }]).status, "located");
  const dynamic = attachCheckEvidence(report(scan({ apis: ["wx.request"], dynamicRequest: true }), [{ ruleId: "domain", stage: "domain", note: "dynamic" }]), [{ id: "domain", stage: "domain", match: { api: ["wx.request"], dynamic_note: "dynamic" } }], { locations: [location("api-reference", "wx.request")], truncated: false });
  assert.equal(dynamic.items[0].evidence.status, "partial");
});

test("item evidence is deterministically deduplicated and bounded without dropping findings", () => {
  const facts = scan({ apis: ["wx.getLocation", "wx.request"] });
  const rules = [{ id: "many", match: { api: ["wx.getLocation"] } }, { id: "one", match: { api: ["wx.request"] } }];
  const locations = Array.from({ length: 101 }, (_, n) => location("api-reference", "wx.getLocation", "app.js", n + 1, 2));
  locations.push(locations[0], location("api-reference", "wx.request"));
  const result = attachCheckEvidence(report(facts, rules.map(rule => ({ ruleId: rule.id }))), rules, { locations: locations.toReversed(), truncated: false });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].evidence.locations.length, 100);
  assert.equal(result.items[0].evidence.status, "partial");
  assert.equal(result.items[0].evidence.locations[99].line, 100);
  assert.equal(result.items[1].evidence.status, "located");
  assert.deepEqual(result.meta.evidence, { schemaVersion: 1, truncated: true });
  assert.match(result.notes.join("\n"), /证据.*截断/);
});

test("global evidence truncation marks all items partial including unlocated ones", () => {
  const facts = scan({ apis: ["wx.getLocation"] });
  const rules = [{ id: "test", match: { api: ["wx.getLocation"] } }];
  const result = attachCheckEvidence(report(facts, [{ ruleId: "test" }, { ruleId: "unknown" }]), rules, { locations: [location("api-reference", "wx.getLocation")], truncated: true });
  assert.deepEqual(result.items.map(item => item.evidence.status), ["partial", "partial"]);
  assert.equal(result.meta.evidence.truncated, true);
  assert.match(result.notes.join("\n"), /证据.*截断/);
});

test("runCheck explicit evidence leaves legacy facts, findings and notes intact", () => {
  const dir = fileURLToPath(new URL("../fixtures/sample-app", import.meta.url));
  const ordinary = runCheck(dir, { subjectType: "personal" });
  const enriched = runCheck(dir, { subjectType: "personal", evidence: true });
  assert.deepEqual(enriched.meta.evidence, { schemaVersion: 1, truncated: false });
  assert.ok(enriched.items.every(item => item.evidence));
  assert.ok(enriched.items.some(item => item.evidence.locations.length > 0));
  assert.ok(!Object.hasOwn(enriched.meta.scan, "evidence"));
  delete enriched.meta.evidence;
  for (const item of enriched.items) delete item.evidence;
  assert.deepEqual(enriched, ordinary);
});
