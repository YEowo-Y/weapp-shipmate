import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  assertVersionIdentity,
  readRepositoryVersionIdentity,
} from "../scripts/check-release-version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "check-release-version.mjs");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;
const DRIFT_VERSION = VERSION === "0.0.0-test" ? "0.0.0-other" : "0.0.0-test";
const CONSISTENT = Object.freeze({
  tag: `v${VERSION}`,
  packageVersion: VERSION,
  manifestVersion: VERSION,
  lockVersion: VERSION,
  lockPackageVersion: VERSION,
});

test("发布版本契约接受 tag 与全部版本载体完全一致", () => {
  assert.deepEqual(assertVersionIdentity(CONSISTENT, { requireTag: true }), {
    version: VERSION,
    tag: `v${VERSION}`,
  });
});

for (const [name, change, carrier] of [
  ["tag 漂移", { tag: `v${DRIFT_VERSION}` }, "tag"],
  ["package.json 漂移", { packageVersion: DRIFT_VERSION }, "package.json"],
  ["manifest.json 漂移", { manifestVersion: DRIFT_VERSION }, "manifest.json"],
  ["package-lock.json 顶层漂移", { lockVersion: DRIFT_VERSION }, "package-lock.json.version"],
  ["package-lock.json 根包漂移", { lockPackageVersion: DRIFT_VERSION }, 'package-lock.json.packages[""].version'],
]) {
  test(`发布版本契约拒绝 ${name}`, () => {
    assert.throws(
      () => assertVersionIdentity({ ...CONSISTENT, ...change }, { requireTag: true }),
      new RegExp(carrier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
}

test("发布版本契约拒绝缺失 tag，但打包复用时可只校验文件载体", () => {
  const withoutTag = { ...CONSISTENT, tag: undefined };
  assert.throws(
    () => assertVersionIdentity(withoutTag, { requireTag: true }),
    /tag/,
  );
  assert.equal(assertVersionIdentity(withoutTag).version, VERSION);
});

test("仓库读取器覆盖 package、manifest 与 lock 的两个根版本字段", () => {
  assert.deepEqual(readRepositoryVersionIdentity(ROOT), {
    packageVersion: VERSION,
    manifestVersion: VERSION,
    lockVersion: VERSION,
    lockPackageVersion: VERSION,
  });
});

test("发布版本 CLI 使用 GITHUB_REF_NAME，并以退出码拒绝错误 tag", () => {
  const ok = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, GITHUB_REF_NAME: `v${VERSION}` },
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.includes(`v${VERSION}`), ok.stdout);

  const bad = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, GITHUB_REF_NAME: `v${DRIFT_VERSION}` },
  });
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stderr, /tag/);
});

test("release workflow 在任何打包步骤前运行 lint 与版本契约", () => {
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf-8");
  const steps = yaml.load(workflow).jobs.release.steps;
  const indexOfRun = (command) => steps.findIndex((step) => step.run === command);
  const lint = indexOfRun("npm run lint");
  const versionCheck = indexOfRun("npm run release:check");
  const npmPack = indexOfRun("npm pack");
  const mcpbPack = indexOfRun("npm run build:mcpb");

  assert.ok(lint >= 0, "release workflow 缺少 lint 门禁");
  assert.ok(versionCheck >= 0, "release workflow 缺少版本一致性门禁");
  assert.ok(npmPack >= 0 && mcpbPack >= 0, "release workflow 的两个打包步骤应存在");
  assert.notEqual(steps[lint]["continue-on-error"], true, "lint 失败不得被忽略");
  assert.notEqual(steps[versionCheck]["continue-on-error"], true, "版本一致性失败不得被忽略");
  assert.ok(lint < npmPack && lint < mcpbPack, "lint 必须早于打包");
  assert.ok(versionCheck < npmPack && versionCheck < mcpbPack, "版本一致性校验必须早于打包");
});
