import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function readRepositoryVersionIdentity(root = ROOT) {
  const pkg = readJSON(join(root, "package.json"));
  const manifest = readJSON(join(root, "manifest.json"));
  const lock = readJSON(join(root, "package-lock.json"));
  const desktop = join(root, "desktop");
  const native = join(desktop, "src-tauri");
  const desktopLock = readJSON(join(desktop, "package-lock.json"));
  const manifestSection = readFileSync(join(native, "Cargo.toml"), "utf8")
    .split(/^\[/m).find(section => section.startsWith("package]"));
  const lockedPackage = readFileSync(join(native, "Cargo.lock"), "utf8")
    .split(/^\[\[package\]\]/m).find(section => /^name = "desktop"\r?$/m.test(section));
  const versionOf = section => section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  return {
    packageVersion: pkg.version,
    manifestVersion: manifest.version,
    lockVersion: lock.version,
    lockPackageVersion: lock.packages?.[""]?.version,
    desktopPackageVersion: readJSON(join(desktop, "package.json")).version,
    desktopLockVersion: desktopLock.version,
    desktopLockPackageVersion: desktopLock.packages?.[""]?.version,
    tauriVersion: readJSON(join(native, "tauri.conf.json")).version,
    cargoVersion: versionOf(manifestSection),
    cargoLockVersion: versionOf(lockedPackage),
  };
}

export function assertVersionIdentity(identity, { requireTag = false } = {}) {
  const {
    tag,
    packageVersion,
    manifestVersion,
    lockVersion,
    lockPackageVersion,
  } = identity;
  const versions = [
    ["package.json", packageVersion],
    ["manifest.json", manifestVersion],
    ["package-lock.json.version", lockVersion],
    ['package-lock.json.packages[""].version', lockPackageVersion],
    ["desktop/package.json", identity.desktopPackageVersion],
    ["desktop/package-lock.json.version", identity.desktopLockVersion],
    ['desktop/package-lock.json.packages[""].version', identity.desktopLockPackageVersion],
    ["desktop/src-tauri/tauri.conf.json", identity.tauriVersion],
    ["desktop/src-tauri/Cargo.toml", identity.cargoVersion],
    ["desktop/src-tauri/Cargo.lock (desktop)", identity.cargoLockVersion],
  ];
  const missing = versions.filter(([, version]) => typeof version !== "string" || version.length === 0);
  if (missing.length > 0) {
    throw new Error(`版本字段缺失或无效：${missing.map(([name]) => name).join("、")}`);
  }

  const expectedTag = `v${packageVersion}`;
  const fileMismatch = versions.some(([, version]) => version !== packageVersion);
  const validateTag = requireTag || tag !== undefined;
  const tagMismatch = validateTag && tag !== expectedTag;
  if (fileMismatch || tagMismatch) {
    const values = versions.map(([name, version]) => `${name}=${version}`).join("；");
    const tagValue = tag === undefined || tag === "" ? "（缺失）" : tag;
    const tagDetails = validateTag ? `；tag=${tagValue}（期望 ${expectedTag}）` : "";
    throw new Error(`${values}${tagDetails}`);
  }

  return { version: packageVersion, tag: expectedTag };
}

function isEntrypoint() {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isEntrypoint()) {
  try {
    const identity = {
      ...readRepositoryVersionIdentity(ROOT),
      tag: process.argv[2] ?? process.env.GITHUB_REF_NAME,
    };
    const verified = assertVersionIdentity(identity, { requireTag: true });
    process.stdout.write(`✓ 发布版本一致：${verified.tag}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`发布版本校验失败：${message}\n`);
    process.exitCode = 1;
  }
}
