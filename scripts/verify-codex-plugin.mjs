import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARKET = "weapp-shipmate-local";
const PLUGIN = "weapp-shipmate";

// Invoke npm's launcher with Node on Windows rather than passing a .cmd file to a shell.
function codexCommand() {
  const explicit = process.argv[2];
  if (explicit) {
    const executable = resolve(explicit);
    assert.ok(existsSync(executable), `Codex executable missing: ${executable}`);
    assert.ok(!/\.(cmd|bat|ps1)$/i.test(executable), "Pass codex.exe or the npm codex.js launcher");
    return executable.endsWith(".js") ? [process.execPath, executable] : [executable];
  }
  if (process.platform !== "win32") return ["codex"];
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    const launcher = join(directory, "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(join(directory, "codex.cmd")) && existsSync(launcher)) return [process.execPath, launcher];
    if (existsSync(join(directory, "codex.exe"))) return [join(directory, "codex.exe")];
  }
  throw new Error("Codex CLI missing. Pass its executable path as the first argument.");
}

const command = codexCommand();
const workspace = mkdtempSync(join(tmpdir(), "shipmate codex plugin "));
const config = join(workspace, "config");
const cwd = join(workspace, "working directory");
const market = join(workspace, "local market");
const fixture = join(cwd, "sample app");
const env = {};
const allowed = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LANG", "LC_ALL"]);
for (const [key, value] of Object.entries(process.env)) if (allowed.has(key.toUpperCase())) env[key] = value;
Object.assign(env, {
  CODEX_HOME: config,
  HOME: join(workspace, "profile"),
  USERPROFILE: join(workspace, "profile"),
  APPDATA: join(workspace, "profile", "AppData", "Roaming"),
  LOCALAPPDATA: join(workspace, "profile", "AppData", "Local"),
});
for (const directory of [config, cwd, env.HOME, env.APPDATA, env.LOCALAPPDATA]) mkdirSync(directory, { recursive: true });

function cli(args) {
  const result = spawnSync(command[0], [...command.slice(1), ...args], { cwd, env, encoding: "utf8", timeout: 60000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Codex ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function appServer() {
  const child = spawn(command[0], [...command.slice(1), "app-server", "--stdio"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let nextId = 0;
  let diagnostic = "";
  const failAll = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.on("error", failAll);
  child.stdin.on("error", failAll);
  child.stderr.on("data", (chunk) => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
  child.on("close", (code) => failAll(new Error(`Codex app-server exited (${code}): ${diagnostic}`)));
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSON.parse(line);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } catch (error) { failAll(error); }
  });
  return {
    call(method, params) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}: ${diagnostic}`));
        }, 45000);
        pending.set(id, {
          resolve(value) { clearTimeout(timer); resolve(value); },
          reject(error) { clearTimeout(timer); reject(error); },
        });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    },
    notify(method) { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n"); },
    async close() {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      await closed;
      clearTimeout(timer);
    },
  };
}

let server;
let passed = false;
try {
  cpSync(join(ROOT, "build", "plugins", "codex"), market, { recursive: true });
  cpSync(join(ROOT, "fixtures", "sample-app"), fixture, { recursive: true });
  const version = cli(["--version"]);
  const added = JSON.parse(cli(["plugin", "marketplace", "add", market, "--json"]));
  assert.equal(added.marketplaceName, MARKET);
  const installed = JSON.parse(cli(["plugin", "add", `${PLUGIN}@${MARKET}`, "--json"]));
  assert.equal(installed.pluginId, `${PLUGIN}@${MARKET}`);
  const cachePath = relative(config, installed.installedPath);
  assert.ok(cachePath && !cachePath.startsWith("..") && !isAbsolute(cachePath), "Plugin must install into the isolated config");
  const manifest = JSON.parse(readFileSync(join(market, "plugins", PLUGIN, "plugin.json"), "utf8"));
  assert.equal(installed.version, manifest.version);
  server = appServer();
  await server.call("initialize", { clientInfo: { name: "shipmate-plugin-verification", version: "1" }, capabilities: { experimentalApi: true } });
  server.notify("initialized");
  const skills = await server.call("skills/list", { cwds: [cwd], forceReload: true });
  const skill = skills.data.flatMap((entry) => entry.skills).find((entry) => entry.name === `${PLUGIN}:${PLUGIN}`);
  assert.ok(skill?.enabled, "Installed skill must be enabled");
  assert.equal(skill.pluginId, installed.pluginId);
  assert.equal(resolve(skill.path), join(installed.installedPath, "skills", PLUGIN, "SKILL.md"));
  const { thread } = await server.call("thread/start", { cwd, ephemeral: true, approvalPolicy: "never", sandbox: "read-only" });
  const status = await server.call("mcpServerStatus/list", { threadId: thread.id, detail: "toolsAndAuthOnly", serverName: PLUGIN });
  const pluginServer = status.data.find((entry) => entry.name === PLUGIN);
  const cases = [
    ["check", { dir: fixture }, ["domain.request-whitelist", "privacy.getLocation"]],
    ["guide", { subject: "personal" }, ["registration.account-details"]],
    ["explain", { query: "诱导分享" }, ["review.no-inducement"]],
  ];
  for (const [name, args, expectedRules] of cases) {
    const tool = `weapp_shipmate_${name}`;
    assert.ok(pluginServer?.tools?.[tool], `Plugin tool missing: ${tool}`);
    const result = await server.call("mcpServer/tool/call", { threadId: thread.id, server: PLUGIN, tool, arguments: { ...args, format: "json" } });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.equal(result.structuredContent?.command, name);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    for (const rule of expectedRules) assert.ok(result.structuredContent.items.some((item) => item.ruleId === rule), `${name} missed ${rule}`);
    console.log(`✓ Codex ${name}: ${expectedRules.join(", ")}`);
  }
  console.log(`✓ ${version}: ${installed.pluginId}@${installed.version}; installed skill and three host tool calls passed`);
  await server.close();
  server = undefined;
  cli(["plugin", "remove", `${PLUGIN}@${MARKET}`, "--json"]);
  assert.ok(!existsSync(installed.installedPath), "Uninstall must remove the plugin cache");
  cli(["plugin", "marketplace", "remove", MARKET, "--json"]);
  console.log("✓ Codex plugin and marketplace uninstall passed");
  passed = true;
} finally {
  if (server) await server.close();
  if (passed) rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  else console.error(`Codex plugin verification failed; isolated evidence retained at ${workspace}`);
}
