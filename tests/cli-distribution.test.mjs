import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { stageMcpRuntime } from "../scripts/stage-mcp-runtime.mjs";
import { buildPlugins } from "../scripts/build-plugins.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, cwd, input) {
  const env = { ...process.env };
  delete env.NODE_PATH;
  const result = spawnSync(command, args, { cwd, env, input, encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}

test("npm tarball and staged MCPB/plugins ship the versioned CLI schema and compatible MCP", () => {
  const temp = mkdtempSync(join(tmpdir(), "shipmate cli packages "));
  try {
    const stage = join(temp, "mcpb");
    stageMcpRuntime(stage);
    const markets = buildPlugins(join(temp, "plugins"));
    const npm = process.env.npm_execpath || join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    const packed = JSON.parse(run(process.execPath, [npm, "pack", "--ignore-scripts", "--json", "--pack-destination", temp], root));
    assert.ok(packed[0].files.some(file => file.path === "schemas/cli-report-v1.schema.json"));
    run("tar", ["-xf", join(temp, packed[0].filename), "-C", temp], temp);
    const unpacked = join(temp, "package");
    // npm consumers install production dependencies separately from the tarball.
    cpSync(join(stage, "node_modules"), join(unpacked, "node_modules"), { recursive: true });
    const fixture = join(temp, "project");
    cpSync(join(root, "fixtures", "sample-app"), fixture, { recursive: true });
    const runtimes = [unpacked, stage, ...Object.values(markets).map(market => join(market, "plugins", "weapp-shipmate"))];
    for (const runtime of runtimes) {
      const schemaText = readFileSync(join(runtime, "schemas", "cli-report-v1.schema.json"), "utf8");
      assert.equal(schemaText, readFileSync(join(root, "schemas", "cli-report-v1.schema.json"), "utf8"));
      const validate = new Ajv({ strictRequired: false }).compile(JSON.parse(schemaText));
      for (const args of [["check", fixture], ["guide", "--subject", "personal"], ["explain", "诱导分享"]]) {
        const text = run(process.execPath, [join(runtime, "bin", "weapp-shipmate.mjs"), ...args, "--json", "--json-version", "1"], temp);
        const result = JSON.parse(text);
        assert.equal(result.command, args[0]);
        assert.ok(validate(result), JSON.stringify(validate.errors));
      }
      const config = { schemaVersion: 1, check: { subject: "enterprise", failOn: "none" }, guide: { subject: "personal", sensitive: false } };
      const configPath = join(temp, "shipmate.json");
      writeFileSync(configPath, JSON.stringify(config));
      const configSchema = readFileSync(join(runtime, "schemas", "cli-config-v1.schema.json"), "utf8");
      assert.equal(configSchema, readFileSync(join(root, "schemas", "cli-config-v1.schema.json"), "utf8"));
      assert.ok(new Ajv().compile(JSON.parse(configSchema))(config));
      for (const [command, positional, explicit] of [
        ["check", [fixture], ["--subject", "enterprise", "--fail-on", "none"]],
        ["guide", [], ["--subject", "personal", "--no-sensitive"]],
      ]) {
        const entry = join(runtime, "bin", "weapp-shipmate.mjs");
        const configured = run(process.execPath, [entry, command, ...positional, "--config", configPath, "--json"], temp);
        const direct = run(process.execPath, [entry, command, ...positional, ...explicit, "--json"], temp);
        assert.equal(configured, direct);
      }
      const evidenceText = run(process.execPath, [join(runtime, "bin", "weapp-shipmate.mjs"),
        "check", fixture, "--evidence", "--json", "--json-version", "1", "--fail-on", "none"], temp);
      const evidenceReport = JSON.parse(evidenceText);
      assert.ok(validate(evidenceReport), JSON.stringify(validate.errors));
      assert.ok(evidenceReport.items.some(item => item.evidence.locations.length));
      assert.deepEqual(evidenceReport.meta.evidence, { schemaVersion: 1, truncated: false });
      const requests = [
        { id: 1, method: "initialize", params: {} },
        { id: 2, method: "tools/call", params: { name: "weapp_shipmate_guide", arguments: { format: "json" } } },
        { id: 3, method: "tools/call", params: {
          _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} },
          name: "weapp_shipmate_guide", arguments: { format: "json" },
        } },
      ];
      const replies = run(process.execPath, [join(runtime, "bin", "weapp-shipmate-mcp.mjs")], temp,
        requests.map(r => JSON.stringify({ jsonrpc: "2.0", ...r })).join("\n") + "\n").trimEnd().split("\n").map(JSON.parse);
      assert.equal(replies.length, 3);
      assert.equal(replies[0].result.protocolVersion, "2025-06-18");
      for (const reply of replies.slice(1)) {
        assert.equal(reply.result.isError, false);
        assert.equal(reply.result.structuredContent.command, "guide");
        assert.ok(!Object.hasOwn(reply.result.structuredContent, "schemaVersion"));
        assert.deepEqual(JSON.parse(reply.result.content[0].text), reply.result.structuredContent);
      }
      assert.equal(replies[2].result.resultType, "complete");
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("synthetic preflight fixtures exercise info and explicit draft thresholds", () => {
  const temp = mkdtempSync(join(tmpdir(), "shipmate cli thresholds "));
  try {
    const runtime = join(temp, "runtime");
    stageMcpRuntime(runtime);
    rmSync(join(runtime, "rules"), { recursive: true });
    mkdirSync(join(runtime, "rules"));
    // These local fixture rules test CLI policy, independently of the production corpus.
    const rules = ["info", "warning", "blocker"].map(severity => ({
      id: "fixture." + severity, title: severity, kind: "preflight", stage: "privacy",
      subject_type: ["personal", "individual_business", "enterprise"], severity,
      match: { api: ["wx." + severity + "Probe"] }, requires: [], why: "Synthetic CLI fixture",
      draft: severity === "blocker",
    }));
    writeFileSync(join(runtime, "rules", "fixture.yaml"), JSON.stringify({ rules }));
    const project = join(temp, "project");
    mkdirSync(project);
    const entry = join(project, "index.js");
    const bin = join(runtime, "bin", "weapp-shipmate.mjs");
    for (const [source, flags, code, count] of [
      ["wx.infoProbe();", ["--fail-on", "info"], 2, 1],
      ["wx.infoProbe();", ["--fail-on", "warning"], 0, 0],
      ["wx.blockerProbe();", ["--fail-on", "blocker"], 0, 0],
      ["wx.blockerProbe();", ["--fail-on", "blocker", "--include-drafts"], 2, 1],
      ["wx.infoProbe(); wx.warningProbe(); wx.blockerProbe();",
        ["--fail-on", "info", "--include-drafts", "--blockers-only"], 2, 3],
    ]) {
      writeFileSync(entry, source);
      const child = spawnSync(process.execPath, [bin, "check", project, "--json", ...flags], { cwd: temp, encoding: "utf8", timeout: 15000 });
      assert.ifError(child.error);
      assert.equal(child.status, code, flags.join(" "));
      assert.equal(child.stderr, count ? `--fail-on ${flags[1]} 命中 ${count} 项。\n` : "");
      const output = JSON.parse(child.stdout);
      if (flags.includes("--blockers-only")) assert.deepEqual(output.items.map(item => item.severity), ["blocker"]);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
