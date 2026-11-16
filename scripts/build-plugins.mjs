import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertVersionIdentity, readRepositoryVersionIdentity } from "./check-release-version.mjs";
import { stageMcpRuntime } from "./stage-mcp-runtime.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "weapp-shipmate";
const MARKETPLACE = "weapp-shipmate-local";
const DESCRIPTION = "微信小程序上线导航、项目预检和审核反馈解释。";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function buildPlugins(outputRoot = join(ROOT, "build", "plugins")) {
  assertVersionIdentity(readRepositoryVersionIdentity(ROOT));
  const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const output = resolve(outputRoot);
  const markets = { codex: join(output, "codex"), claude: join(output, "claude") };
  for (const [host, market] of Object.entries(markets)) {
    // Only this host's generated market is replaced; sibling build artifacts survive.
    rmSync(market, { recursive: true, force: true });
    const plugin = join(market, "plugins", NAME);
    stageMcpRuntime(plugin);
    cpSync(join(ROOT, "plugins", "skills"), join(plugin, "skills"), { recursive: true });
    const metadata = { name: NAME, version, description: DESCRIPTION };
    if (host === "codex") {
      writeJson(join(plugin, "plugin.json"), {
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        ...metadata,
      });
      writeJson(join(plugin, "mcp.json"), {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          [NAME]: {
            type: "stdio", command: "node",
            args: ["${PLUGIN_ROOT}/bin/weapp-shipmate-mcp.mjs"],
            cwd: "${PLUGIN_ROOT}",
          },
        },
      });
      writeJson(join(market, ".agents", "plugins", "marketplace.json"), {
        name: MARKETPLACE,
        interface: { displayName: "船友本地插件" },
        plugins: [{
          name: NAME,
          source: { source: "local", path: `./plugins/${NAME}` },
          policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          category: "Productivity",
        }],
      });
    } else {
      writeJson(join(plugin, ".claude-plugin", "plugin.json"), metadata);
      writeJson(join(plugin, ".mcp.json"), {
        mcpServers: {
          [NAME]: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/weapp-shipmate-mcp.mjs"] },
        },
      });
      writeJson(join(market, ".claude-plugin", "marketplace.json"), {
        name: MARKETPLACE,
        owner: { name: "YEowo-Y" },
        plugins: [{ name: NAME, source: `./plugins/${NAME}`, version, description: DESCRIPTION }],
      });
    }
  }
  return markets;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [host, market] of Object.entries(buildPlugins())) process.stdout.write(`${host}: ${market}\n`);
}
