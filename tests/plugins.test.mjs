import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = join(root, "fixtures", "sample-app");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const version = readJson(join(root, "package.json")).version;

function callInstalledServer(pluginRoot, config, cwd) {
  const env = { ...process.env };
  delete env.NODE_PATH;
  const placeholder = config.args[0].includes("${CLAUDE_PLUGIN_ROOT}") ? "${CLAUDE_PLUGIN_ROOT}" : "${PLUGIN_ROOT}";
  const entry = config.args[0].replace(placeholder, pluginRoot);
  assert.equal(config.command, "node");
  assert.ok(entry.startsWith(pluginRoot), "server must load from the relocated plugin");
  const requests = [
    { id: 1, method: "initialize", params: {} },
    { id: 2, method: "tools/list" },
    ...Object.entries({
      check: { dir: fixture }, guide: { subject: "personal" }, explain: { query: "诱导分享" },
    }).map(([command, args], i) => ({
      id: i + 3, method: "tools/call",
      params: { name: "weapp_shipmate_" + command, arguments: { ...args, format: "json" } },
    })),
  ];
  const child = spawnSync(process.execPath, [entry], {
    cwd, env, encoding: "utf8", timeout: 15000,
    input: requests.map(r => JSON.stringify({ jsonrpc: "2.0", ...r })).join("\n") + "\n",
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  const replies = child.stdout.trimEnd().split("\n").map(JSON.parse);
  assert.equal(replies.length, requests.length);
  assert.deepEqual(replies.map(r => r.id), [1, 2, 3, 4, 5]);
  assert.equal(replies[0].result.serverInfo.version, version);
  assert.deepEqual(replies[1].result.tools.map(t => t.name), [
    "weapp_shipmate_check", "weapp_shipmate_guide", "weapp_shipmate_explain",
  ]);
  for (const [i, rule] of ["domain.request-whitelist", "registration.account-details", "review.no-inducement"].entries()) {
    const result = replies[i + 2].result;
    assert.equal(result.isError, false);
    assert.ok(result.structuredContent.items.some(item => item.ruleId === rule));
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  }
}

test("both plugin packages run from relocated directories with a complete runtime", async () => {
  const temp = mkdtempSync(join(tmpdir(), "shipmate plugin test "));
  try {
    const { buildPlugins } = await import("../scripts/build-plugins.mjs");
    const output = join(temp, "generated");
    const markets = buildPlugins(output);
    const copied = join(temp, "relocated market");
    cpSync(output, copied, { recursive: true });
    rmSync(output, { recursive: true });
    const skillTexts = [];
    for (const host of ["codex", "claude"]) {
      assert.equal(markets[host], join(output, host));
      const marketRoot = join(copied, host);
      const marketPath = host === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json";
      const marketplace = readJson(join(marketRoot, marketPath));
      assert.equal(marketplace.name, "weapp-shipmate-local");
      assert.equal(marketplace.plugins.length, 1);
      assert.equal(marketplace.plugins[0].name, "weapp-shipmate");
      const source = marketplace.plugins[0].source;
      assert.equal(typeof source === "string" ? source : source.path, "./plugins/weapp-shipmate");
      const plugin = join(marketRoot, "plugins", "weapp-shipmate");
      const manifest = readJson(join(plugin, host === "codex" ? "plugin.json" : ".claude-plugin/plugin.json"));
      assert.equal(manifest.name, "weapp-shipmate");
      assert.equal(manifest.version, version);
      const mcp = readJson(join(plugin, host === "codex" ? "mcp.json" : ".mcp.json"));
      assert.deepEqual(Object.keys(mcp.mcpServers), ["weapp-shipmate"]);
      const config = mcp.mcpServers["weapp-shipmate"];
      const variable = host === "codex" ? "${PLUGIN_ROOT}" : "${CLAUDE_PLUGIN_ROOT}";
      assert.deepEqual(config.args, [variable + "/bin/weapp-shipmate-mcp.mjs"]);
      if (host === "codex") {
        assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
        assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
      }
      for (const file of ["src/private-files.json", "flow.yaml", "rejections.yaml"]) {
        assert.equal(readFileSync(join(plugin, file), "utf8"), readFileSync(join(root, file), "utf8"));
      }
      assert.deepEqual(readdirSync(join(plugin, "node_modules")).sort(), ["argparse", "js-yaml"]);
      const skill = readFileSync(join(plugin, "skills", "weapp-shipmate", "SKILL.md"), "utf8");
      assert.match(skill, /name: weapp-shipmate/);
      for (const tool of ["check", "guide", "explain"]) assert.ok(skill.includes("weapp_shipmate_" + tool));
      skillTexts.push(skill);
      callInstalledServer(plugin, config, temp);
    }
    assert.equal(skillTexts[0], skillTexts[1]);
    // Rebuild beside an existing MCPB artifact to catch overly broad build cleanup.
    const sibling = join(temp, "weapp-shipmate.mcpb");
    writeFileSync(sibling, "preserve MCPB");
    buildPlugins(copied);
    assert.equal(readFileSync(sibling, "utf8"), "preserve MCPB");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("MCPB staging preserves plugin products beside its own output", () => {
  const temp = mkdtempSync(join(tmpdir(), "shipmate mcpb coexist "));
  try {
    for (const file of ["scripts", "bin", "src", "schemas", "rules", "flow.yaml", "rejections.yaml",
      "package.json", "package-lock.json", "manifest.json"]) {
      cpSync(join(root, file), join(temp, file), { recursive: true });
    }
    // The version gate also reads desktop version carriers.
    for (const file of ["desktop/package.json", "desktop/package-lock.json",
      "desktop/src-tauri/Cargo.toml", "desktop/src-tauri/Cargo.lock", "desktop/src-tauri/tauri.conf.json"]) {
      cpSync(join(root, file), join(temp, file), { recursive: true });
    }
    for (const dep of ["js-yaml", "argparse"]) cpSync(join(root, "node_modules", dep), join(temp, "node_modules", dep), { recursive: true });
    const marker = join(temp, "build", "plugins", "keep.txt");
    cpSync(join(root, "README.md"), marker, { recursive: true });
    const env = { ...process.env, WEAPP_SHIPMATE_NO_PACK: "1" };
    delete env.NODE_PATH;
    const run = spawnSync(process.execPath, [join(temp, "scripts", "build-mcpb.mjs")], {
      cwd: temp, env, encoding: "utf8", timeout: 20000,
    });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr + run.stdout);
    assert.ok(existsSync(marker));
    assert.equal(readFileSync(marker, "utf8"), readFileSync(join(root, "README.md"), "utf8"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
