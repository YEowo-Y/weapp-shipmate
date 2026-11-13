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
  const install = indexOfRun("npm ci");
  const desktopInstall = indexOfRun("npm ci --prefix desktop");
  const test = indexOfRun("npm test");
  const lint = indexOfRun("npm run lint");
  const versionCheck = indexOfRun("npm run release:check");
  const npmPack = indexOfRun("npm pack");
  const mcpbPack = indexOfRun("npm run build:mcpb");

  assert.ok(install >= 0 && install < desktopInstall && desktopInstall < test,
    "release workflow 必须在 npm ci 之后、npm test 之前安装桌面依赖");
  assert.ok(lint >= 0, "release workflow 缺少 lint 门禁");
  assert.ok(versionCheck >= 0, "release workflow 缺少版本一致性门禁");
  assert.ok(npmPack >= 0 && mcpbPack >= 0, "release workflow 的两个打包步骤应存在");
  assert.notEqual(steps[lint]["continue-on-error"], true, "lint 失败不得被忽略");
  assert.notEqual(steps[versionCheck]["continue-on-error"], true, "版本一致性失败不得被忽略");
  assert.ok(lint < npmPack && lint < mcpbPack, "lint 必须早于打包");
  assert.ok(versionCheck < npmPack && versionCheck < mcpbPack, "版本一致性校验必须早于打包");
});

// ── 2026-07-16 审计 A3：交付末端 ──
test("checksums 以扁平资产名生成——清单含路径前缀会让下载者 sha256sum -c 必败（rc.1 演练未覆盖的最后一步）", () => {
  const workflow = yaml.load(readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf-8"));
  const steps = workflow.jobs.release.steps;
  const checksums = steps.find((s) => s.name === "checksums");
  assert.ok(checksums, "release workflow 缺少 checksums 步骤");
  const m = checksums.run.match(/sha256sum\s+([^>]+)>/);
  assert.ok(m, "checksums 步骤应生成 SHA256SUMS 清单");
  for (const arg of m[1].trim().split(/\s+/))
    assert.ok(!arg.includes("/"), `校验和清单条目含路径前缀，gh 上传资产按 basename 拍平后校验必败：${arg}`);
  const release = steps.find((s) => s.name === "create draft release with assets");
  assert.ok(release, "release workflow 缺少资产上传步骤");
  assert.ok(!release.run.includes("build/"), "上传资产应与校验和清单同名（扁平文件名），否则清单与资产名对不上");
});

test("release 构建腿不得钉在已 EOL 的运行时（Node 20 EOL 2026-04-30）", () => {
  const workflow = yaml.load(readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf-8"));
  const setupNode = workflow.jobs.release.steps.find((s) => s.uses?.startsWith("actions/setup-node"));
  assert.ok(setupNode, "release workflow 缺少 setup-node");
  // String() 归一 + 主版本下限断言（复核 P3）：notEqual("20") 会被未加引号的数字 20、"20.x"、
  // "lts/iron" 三种自然写法绕过。有意排除 lts/* 别名——发布腿版本必须显式可读。
  const v = String(setupNode.with["node-version"]);
  assert.match(v, /^(2[2-9]|[3-9]\d)(\.|$)/, `发布构建腿应为显式的 >=22 主版本，实际：${v}`);
});

test("mcpb INCLUDE 清单 ⊇ package.json files ∪ {manifest.json, package.json}（0.1.0 漏包 rejections.yaml 事故的结构锁）", () => {
  const src = readFileSync(join(ROOT, "scripts", "build-mcpb.mjs"), "utf-8");
  const m = src.match(/const INCLUDE = \[([^\]]*)\]/);
  assert.ok(m, "build-mcpb.mjs 应有 INCLUDE 字面量清单");
  const include = new Set(
    m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean),
  );
  const files = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).files.map((f) =>
    f.replace(/\/$/, ""),
  );
  for (const f of [...files, "manifest.json", "package.json"])
    assert.ok(include.has(f), `INCLUDE 缺少 ${f}——npm 包有而 .mcpb 没有，安装后运行时 ENOENT`);
});

test("release 必须创建 Draft 且不得自动公开：--draft 在场、prerelease/latest 标记不在场", () => {
  // 2026-07-17 预推送复核 P3：--draft 是「演练」与「公开发布」之间唯一的闸，此前零测试覆盖——
  // 删掉它则全量测试与六腿 CI 依旧全绿，而下一次 tag push 会直接对外发布（历轮审批均明确排除该动作）。
  // 公开发布/prerelease 标记必须是人工在 Draft 上的显式决定，不可由 workflow 编辑静默获得。
  const workflow = yaml.load(readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf-8"));
  const release = workflow.jobs.release.steps.find((s) => s.name === "create draft release with assets");
  assert.ok(release, "release workflow 缺少资产上传步骤");
  assert.match(release.run, /--draft(\s|$)/, "gh release create 必须带 --draft：发布是不可逆动作，须留人工闸");
  assert.doesNotMatch(release.run, /--prerelease|--latest/, "prerelease/latest 标记须人工在 Draft 上决定，不得由 workflow 预设");
});
