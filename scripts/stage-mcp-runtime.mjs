import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Shared by MCPB and local plugins; data files are loaded lazily by the tools.
export const INCLUDE = ["manifest.json", "package.json", "bin", "src", "schemas", "rules", "flow.yaml", "rejections.yaml"];

export function stageMcpRuntime(destination) {
  mkdirSync(destination, { recursive: true });
  for (const item of INCLUDE) {
    const source = join(ROOT, item);
    if (!existsSync(source)) throw new Error(`缺少待打包内容：${item}`);
    cpSync(source, join(destination, item), { recursive: true });
  }

  const copied = new Set();
  function copyDependency(name) {
    if (copied.has(name)) return;
    const source = join(ROOT, "node_modules", name);
    const manifest = join(source, "package.json");
    if (!existsSync(manifest)) throw new Error(`未找到生产依赖 ${name}（请先 npm ci）`);
    cpSync(source, join(destination, "node_modules", name), { recursive: true });
    copied.add(name);
    const dependency = JSON.parse(readFileSync(manifest, "utf8"));
    for (const child of Object.keys(dependency.dependencies || {})) copyDependency(child);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  for (const name of Object.keys(pkg.dependencies || {})) copyDependency(name);
  return [...copied];
}
