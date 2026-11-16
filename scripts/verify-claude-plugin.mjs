import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(process.argv[2] || join(ROOT, "build", "plugins", "claude"));
assert.ok(existsSync(join(source, ".claude-plugin", "marketplace.json")), "Run npm run build:plugins first");

// Resolve a native executable, avoiding cmd.exe interpolation of paths and tool inputs.
function findClaude() {
  for (const directory of (process.env.PATH || process.env.Path || "").split(delimiter)) {
    const candidates = process.platform === "win32"
      ? [join(directory, "claude.exe"), join(directory, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")]
      : [join(directory, "claude")];
    const executable = candidates.find(existsSync);
    if (executable) return executable;
  }
  throw new Error("Claude Code executable is required for host acceptance");
}

const claude = findClaude();
const scratch = mkdtempSync(join(tmpdir(), "shipmate claude acceptance "));
const profile = join(scratch, "profile");
const work = join(scratch, "project");
const market = join(scratch, "local market");
const fixture = join(work, "sample app");
for (const directory of [profile, work, join(profile, "AppData", "Roaming"), join(profile, "AppData", "Local")]) {
  mkdirSync(directory, { recursive: true });
}
cpSync(source, market, { recursive: true });
cpSync(join(ROOT, "fixtures", "sample-app"), fixture, { recursive: true });

const env = {};
for (const name of ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "TEMP", "TMP"]) {
  if (process.env[name]) env[name] = process.env[name];
}
Object.assign(env, {
  HOME: profile,
  USERPROFILE: profile,
  APPDATA: join(profile, "AppData", "Roaming"),
  LOCALAPPDATA: join(profile, "AppData", "Local"),
  CLAUDE_CONFIG_DIR: profile,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_AUTOUPDATER: "1",
  ANTHROPIC_API_KEY: "local-acceptance-placeholder",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:1",
});

function run(args) {
  const result = spawnSync(claude, args, { cwd: work, env, encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Claude ${args[0]} failed\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

const version = run(["--version"]).trim();
run(["plugin", "marketplace", "add", market, "--scope", "user"]);
run(["plugin", "install", "weapp-shipmate@weapp-shipmate-local", "--scope", "user"]);
const plugins = JSON.parse(run(["plugin", "list", "--json"]));
const installed = plugins.find(plugin => plugin.id === "weapp-shipmate@weapp-shipmate-local");
assert.ok(installed?.enabled, "Installed plugin must be enabled");
assert.ok(installed.installPath.startsWith(profile), "Plugin must load from the isolated installation");
const skillFile = join(installed.installPath, "skills", "weapp-shipmate", "SKILL.md");
assert.ok(readFileSync(skillFile, "utf8").includes("name: weapp-shipmate"));
const details = run(["plugin", "details", "weapp-shipmate@weapp-shipmate-local"]);
assert.ok(details.includes("weapp-shipmate"), "Host must discover the installed skill");
assert.ok(run(["mcp", "get", "plugin:weapp-shipmate:weapp-shipmate"]).includes("Connected"));

const cases = [
  { command: "check", arguments: { dir: fixture, subject: "personal" }, expected: ["domain.request-whitelist", "privacy.getLocation"] },
  { command: "guide", arguments: { subject: "personal" }, expected: ["registration.account-details"] },
  { command: "explain", arguments: { query: "诱导分享" }, expected: ["review.no-inducement"] },
];
for (const example of cases) {
  const settings = join(scratch, `${example.command}-settings.json`);
  writeFileSync(settings, JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [
    {
      type: "mcp_tool", server: "plugin:weapp-shipmate:weapp-shipmate", tool: `weapp_shipmate_${example.command}`,
      input: { ...example.arguments, format: "json" }, timeout: 30,
    },
    { type: "command", command: "node -e \"process.exit(2)\"" },
  ] }] } }) + "\n");
  const events = run([
    "--settings", settings, "--setting-sources", "user", "-p", "--no-session-persistence", "--verbose",
    "--include-hook-events", "--output-format", "stream-json", "Local plugin acceptance fixture",
  ]).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const init = events.find(event => event.type === "system" && event.subtype === "init");
  assert.ok(init, "Host initialization event is required");
  assert.ok(init.tools.includes(`mcp__plugin_weapp-shipmate_weapp-shipmate__weapp_shipmate_${example.command}`), "Host must expose the plugin tool");
  assert.ok(init.slash_commands.includes("weapp-shipmate:weapp-shipmate"), "Host must expose the installed skill");
  const hooks = events.filter(event => event.type === "system" && event.subtype === "hook_response");
  assert.ok(hooks.some(event => event.exit_code === 2), "Acceptance hook must stop before inference");
  const toolHook = hooks.find(event => event.exit_code === 0 && event.stdout);
  assert.ok(toolHook, "A successful tool hook response is required");
  const result = JSON.parse(toolHook.stdout);
  assert.equal(result.command, example.command);
  for (const ruleId of example.expected) assert.ok(result.items.some(item => item.ruleId === ruleId), `Missing fixture rule ${ruleId}`);
  const completion = events.find(event => event.type === "result");
  assert.ok(completion, "Host completion event is required");
  assert.equal(completion.usage.input_tokens, 0);
  assert.equal(completion.usage.output_tokens, 0);
  assert.equal(completion.total_cost_usd, 0);
  writeFileSync(join(scratch, `${example.command}-events.json`), JSON.stringify(events, null, 2) + "\n");
  console.log(`✓ Claude Code installed plugin ${example.command}: expected fixture results, zero model tokens`);
}
run(["plugin", "uninstall", "weapp-shipmate@weapp-shipmate-local", "--scope", "user"]);
assert.ok(!JSON.parse(run(["plugin", "list", "--json"])).some(plugin => plugin.id === "weapp-shipmate@weapp-shipmate-local"));
run(["plugin", "marketplace", "remove", "weapp-shipmate-local", "--scope", "user"]);
console.log(`✓ ${version}; isolated installation, skill, three tools and uninstall verified\nEvidence: ${scratch}`);
