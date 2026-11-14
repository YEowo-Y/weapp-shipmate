import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { distributionTag, verifyPackageRehearsal } from "../scripts/verify-package-rehearsal.mjs";
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
  desktopPackageVersion: VERSION,
  desktopLockVersion: VERSION,
  desktopLockPackageVersion: VERSION,
  tauriVersion: VERSION,
  cargoVersion: VERSION,
  cargoLockVersion: VERSION,
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
  ["桌面 package.json 漂移", { desktopPackageVersion: DRIFT_VERSION }, "desktop/package.json"],
  ["桌面 lock 顶层漂移", { desktopLockVersion: DRIFT_VERSION }, "desktop/package-lock.json.version"],
  ["桌面 lock 根包漂移", { desktopLockPackageVersion: DRIFT_VERSION }, 'desktop/package-lock.json.packages[""].version'],
  ["Tauri 配置漂移", { tauriVersion: DRIFT_VERSION }, "tauri.conf.json"],
  ["Rust 包版本漂移", { cargoVersion: DRIFT_VERSION }, "Cargo.toml"],
  ["Rust 锁定版本漂移", { cargoLockVersion: DRIFT_VERSION }, "Cargo.lock"],
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

test("仓库读取器覆盖根目录及桌面端的全部版本载体", () => {
  assert.deepEqual({ tag: `v${VERSION}`, ...readRepositoryVersionIdentity(ROOT) }, CONSISTENT);
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

test("rule-rot 链接失败后仍检查漂移，安装失败或取消时不运行", () => {
  const workflow = yaml.load(readFileSync(join(ROOT, ".github", "workflows", "rule-rot.yml"), "utf-8"));
  const steps = workflow.jobs.rot.steps;
  const install = steps.find(step => step.run === "npm ci");
  const rot = steps.find(step => step.run === "npm run rot -- --links");
  const snapshot = steps.find(step => step.run === "npm run snapshot:sources -- --check");
  assert.equal(install.id, "install");
  assert.equal(snapshot.if, "${{ !cancelled() && steps.install.outcome == 'success' }}");
  assert.ok(steps.indexOf(install) < steps.indexOf(rot));
  assert.ok(steps.indexOf(rot) < steps.indexOf(snapshot));
  assert.notEqual(rot["continue-on-error"], true);
  assert.notEqual(snapshot["continue-on-error"], true);
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

test("发布打包前必须单独核验官方引文", () => {
  const workflow = yaml.load(readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf8"));
  const steps = workflow.jobs.release.steps;
  const quotes = steps.findIndex((step) => step.run === "npm run verify:quotes");
  assert.ok(quotes >= 0);
  for (const command of ["npm pack", "npm run build:mcpb"]) {
    assert.ok(quotes < steps.findIndex((step) => step.run === command));
  }
  assert.notEqual(steps[quotes]["continue-on-error"], true);
});

test("发布演练仅授予读权限，强制 dry-run 并对账包清单", () => {
  const workflow = yaml.load(readFileSync(join(ROOT, ".github/workflows/release-rehearsal.yml"), "utf8"));
  assert.deepEqual(Object.keys(workflow.on).sort(), ["pull_request", "workflow_dispatch"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const job = workflow.jobs.rehearsal;
  assert.equal(job.permissions, undefined);
  const commands = job.steps.filter((step) => step.run).map((step) => step.run);
  for (const command of ["npm ci", "npm ci --prefix desktop", "npm run lint", "npm test", "npm run verify:quotes", "npm run coverage"]) {
    assert.ok(commands.includes(command), command);
  }
  const publish = commands.find((command) => command.includes("npm publish"));
  assert.ok(publish);
  assert.match(publish, /npm publish --dry-run --ignore-scripts --tag "\$DIST_TAG" --json/);
  assert.match(publish, /npm pack --dry-run --ignore-scripts --json/);
  assert.match(publish, /node scripts\/verify-package-rehearsal\.mjs/);
  assert.match(publish, /cat build\/release-rehearsal\/pack\.json build\/release-rehearsal\/publish\.json/);
  assert.ok(commands.indexOf(publish) > commands.indexOf("npm run coverage"));
  for (const line of commands.flatMap((command) => command.split("\n")).filter((line) => /\bnpm publish\b/.test(line))) {
    assert.match(line, /^npm publish --dry-run --ignore-scripts --tag "\$DIST_TAG" --json > build\/release-rehearsal\/publish\.json$/);
  }
  const version = job.steps.find((step) => step.id === "version");
  assert.match(version.run, /assertVersionIdentity\(readRepositoryVersionIdentity\(\)\)/);
  assert.match(version.run, /distributionTag\(version\)/);
  assert.equal(job.steps.find((step) => step.run === publish).env.DIST_TAG, "${{ steps.version.outputs.dist_tag }}");
  for (const step of job.steps) {
    assert.notEqual(step["continue-on-error"], true);
    assert.doesNotMatch(step.run ?? "", /gh release|git push|NODE_AUTH_TOKEN|NPM_TOKEN/);
  }
});

test("演练区分稳定版与预发布版，包括构建元数据", () => {
  assert.equal(distributionTag("0.2.0-rc.3"), "next");
  assert.equal(distributionTag("0.2.0-rc.3+build.1"), "next");
  assert.equal(distributionTag("0.2.0"), "latest");
  assert.equal(distributionTag("0.2.0+build-with-hyphen"), "latest");
  assert.throws(() => distributionTag("main\nlatest"), /Invalid package version/);
});

const packageManifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
function rehearsalFixture() {
  const paths = ["package.json", "README.md", "LICENSE", "flow.yaml", "rejections.yaml",
    "src/private-files.json", "rules/example.yaml", "schemas/example.json", ...Object.values(packageManifest.bin)];
  return { name: packageManifest.name, version: packageManifest.version, size: 100, unpackedSize: paths.length,
    files: paths.map((path) => ({ path, size: 1, mode: 420 })) };
}

test("清单校验接受 npm pack 数组、publish 对象及不同文件顺序", () => {
  const packed = rehearsalFixture();
  const published = { ...packed, files: [...packed.files].reverse() };
  assert.equal(verifyPackageRehearsal([packed], published, packageManifest).files, packed.files.length);
  assert.throws(() => verifyPackageRehearsal([packed, packed], published, packageManifest), /Expected one package/);
});

test("清单校验拒绝遗漏入口、规则目录以及两次演练的内容或大小差异", () => {
  for (const missing of ["src/private-files.json", "rules/example.yaml", ...Object.values(packageManifest.bin)]) {
    const result = rehearsalFixture();
    result.files = result.files.filter((file) => file.path !== missing);
    assert.throws(() => verifyPackageRehearsal(result, result, packageManifest), /Missing package/);
  }
  const packed = rehearsalFixture();
  const changed = JSON.parse(JSON.stringify(packed));
  changed.files[0].size++;
  assert.throws(() => verifyPackageRehearsal(packed, changed, packageManifest), /file lists differ/);
  assert.throws(() => verifyPackageRehearsal(packed, { ...packed, size: 101 }, packageManifest), /size mismatch/);
  assert.throws(() => verifyPackageRehearsal(packed, packed, { ...packageManifest, version: "99.0.0" }), /Unexpected package version/);
});

test("清单校验拒绝桌面内容、私有文件和越界路径", () => {
  for (const path of ["desktop/package.json", "src/.env", "src/Secret.json", "src/project.private.config.json",
    "src/id_rsa", "src/private.upload.key", "src/keys/key.json", "src/../outside.js", "src\\escape.js", "unlisted.js"]) {
    const result = rehearsalFixture();
    result.files.push({ path, size: 1, mode: 420 });
    assert.throws(() => verifyPackageRehearsal(result, result, packageManifest), /package path|Desktop content/);
  }
});
