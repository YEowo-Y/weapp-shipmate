import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PRIVATE_FILES = JSON.parse(readFileSync(new URL("../src/private-files.json", import.meta.url), "utf8"));

export function distributionTag(version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, "Invalid package version");
  return version.split("+")[0].includes("-") ? "next" : "latest";
}

function packageResult(value) {
  if (Array.isArray(value)) {
    assert.equal(value.length, 1, "Expected one package in dry-run output");
    return value[0];
  }
  return value;
}

function privateName(name) {
  const lower = name.toLowerCase();
  return Object.values(PRIVATE_FILES).some((group) =>
    group.exact?.includes(lower) ||
    group.prefix?.some((prefix) => lower.startsWith(prefix)) ||
    group.suffix?.some((suffix) => lower.endsWith(suffix)) ||
    group.contains?.some((part) => lower.includes(part)) ||
    group.prefixSuffix?.some(({ prefix, suffix }) => lower.startsWith(prefix) && lower.endsWith(suffix)));
}

export function verifyPackageRehearsal(packOutput, publishOutput, manifest) {
  const packed = packageResult(packOutput);
  const published = packageResult(publishOutput);
  assert.equal(packed.name, manifest.name, "Unexpected package name");
  assert.equal(packed.version, manifest.version, "Unexpected package version");
  for (const key of ["name", "version", "size", "unpackedSize"]) {
    assert.equal(packed[key], published[key], `Dry-run ${key} mismatch`);
  }
  const sortedFiles = (result) => [...result.files].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(sortedFiles(packed), sortedFiles(published), "Dry-run file lists differ");
  const paths = new Set(packed.files.map((file) => file.path));
  assert.equal(paths.size, packed.files.length, "Duplicate package paths");
  const allowed = ["package.json", "README.md", "LICENSE", ...manifest.files];
  for (const path of paths) {
    const parts = path.split("/");
    assert.ok(parts.every((part) => part && !part.startsWith(".") && !/[\\:]/.test(part)), `Invalid package path: ${path}`);
    assert.ok(!parts.some(privateName), `Private package path: ${path}`);
    assert.ok(parts[0] !== "desktop", `Desktop content in npm package: ${path}`);
    assert.ok(allowed.some((entry) => entry.endsWith("/") ? path.startsWith(entry) : path === entry), `Unexpected package path: ${path}`);
  }
  const required = ["package.json", "README.md", "LICENSE", "flow.yaml", "rejections.yaml", "src/private-files.json", ...Object.values(manifest.bin)];
  for (const path of required) assert.ok(paths.has(path), `Missing package file: ${path}`);
  for (const entry of manifest.files) {
    assert.ok([...paths].some((path) => entry.endsWith("/") ? path.startsWith(entry) : path === entry), `Missing package entry: ${entry}`);
  }
  return { version: packed.version, files: paths.size, size: packed.size, unpackedSize: packed.unpackedSize };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [packPath, publishPath] = process.argv.slice(2);
  assert.ok(packPath && publishPath, "Usage: node scripts/verify-package-rehearsal.mjs <pack.json> <publish.json>");
  const readJson = (path) => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  const summary = verifyPackageRehearsal(readJson(packPath), readJson(publishPath), readJson(resolve(ROOT, "package.json")));
  console.log(JSON.stringify(summary));
}
