import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertVersionIdentity, readRepositoryVersionIdentity } from "../../scripts/check-release-version.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const BASE = "0.2.0-rc.3";
const VERSION = "0.2.0-rc.4";
const HISTORY = `## [${BASE}] - 2020-01-01\n\n### Fixed\n\n- 历史条目。\n`;
const MANUAL = "### Changed\n\n- 人工记录。\n";
const FILES = [
  "package.json", "manifest.json", "desktop/package.json", "desktop/src-tauri/tauri.conf.json",
  "package-lock.json", "desktop/package-lock.json", "desktop/src-tauri/Cargo.toml",
  "desktop/src-tauri/Cargo.lock", "CHANGELOG.md",
];

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_DATE: "2021-06-09T01:00:00+08:00", GIT_COMMITTER_DATE: "2021-06-09T01:00:00+08:00" },
  }).trim();
}

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), "shipmate-candidate-"));
  t.after(() => rmSync(temp, { recursive: true, force: true, maxRetries: 3 }));
  const repo = join(temp, "repo");
  mkdirSync(repo);
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "commit.gpgsign", "false");
  for (const path of FILES) {
    let content;
    if (path.endsWith(".json")) {
      const data = { name: "desktop", version: BASE };
      if (path.endsWith("package-lock.json")) {
        data.packages = { "": { version: BASE }, "node_modules/example": { version: BASE } };
      }
      content = JSON.stringify(data, null, 2) + "\n";
    } else if (path.endsWith("Cargo.toml")) {
      content = `[package]\nname = "desktop"\nversion = "${BASE}"\n`;
    } else if (path.endsWith("Cargo.lock")) {
      content = `version = 4\n\n[[package]]\nname = "example"\nversion = "${BASE}"\n\n[[package]]\nname = "desktop"\nversion = "${BASE}"\n`;
    } else {
      content = `# Changelog\n\n当前仓库发布候选版本为 \`${BASE}\`，最新公开版为 \`v0.1.0\`。\n\n## [Unreleased]\n\n${MANUAL}\n${HISTORY}`;
    }
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git(repo, "add", ".");
  git(repo, "commit", "-m", "chore: baseline");
  git(repo, "tag", "-a", `v${BASE}`, "-m", "baseline");
  git(repo, "commit", "--allow-empty", "-m", "feat: add offline reports");
  return { repo, source: git(repo, "rev-parse", "HEAD"), output: join(temp, "generated") };
}

function cli(repo, action, args, date) {
  const clock = date ? ["--import", "data:text/javascript," + encodeURIComponent(
    `import {mock} from 'node:test';mock.timers.enable({apis:['Date'],now:${Date.parse(date)}});`,
  )] : [];
  return spawnSync(process.execPath, [...clock, CLI, action, "--repo", repo, "--base-tag", `v${BASE}`, ...args], { encoding: "utf8" });
}

function success(result) {
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout);
}

function failure(result) {
  assert.equal(result.error, undefined);
  assert.ok(result.status > 0, `expected a failed command, got ${result.status}\n${result.stdout}`);
}

test("generation preserves manual history and produces identical files on different days", t => {
  const { repo, source, output } = fixture(t);
  const args = ["--source", source, "--version", VERSION, "--output", output];
  success(cli(repo, "generate", args, "2030-03-01"));
  const bytes = FILES.map(path => readFileSync(join(output, path)));
  success(cli(repo, "generate", args, "2030-03-10"));
  assert.deepEqual(FILES.map(path => readFileSync(join(output, path))), bytes);
  assertVersionIdentity({ ...readRepositoryVersionIdentity(output), tag: `v${VERSION}` }, { requireTag: true });
  const notes = readFileSync(join(output, "CHANGELOG.md"), "utf8");
  assert.ok(notes.indexOf("## [Unreleased]") >= 0);
  assert.ok(notes.indexOf(`## [${VERSION}] - 2021-06-08`) > notes.indexOf("## [Unreleased]"));
  assert.ok(notes.indexOf(MANUAL) > notes.indexOf(`## [${VERSION}]`));
  assert.ok(notes.endsWith(HISTORY));
  assert.match(notes, /add offline reports/);
  for (const path of ["package-lock.json", "desktop/package-lock.json"]) {
    assert.equal(JSON.parse(readFileSync(join(output, path))).packages["node_modules/example"].version, BASE);
  }
  assert.ok(readFileSync(join(output, "desktop/src-tauri/Cargo.lock"), "utf8").includes(`name = "example"\nversion = "${BASE}"`));
  assert.equal(git(repo, "status", "--porcelain"), "");
});

test("verification regenerates from the trusted source and compares the candidate Git objects", t => {
  const { repo, source, output } = fixture(t);
  success(cli(repo, "generate", ["--source", source, "--version", VERSION, "--output", output]));
  git(repo, "switch", "-c", "candidate");
  for (const path of FILES) {
    cpSync(join(output, path), join(repo, path));
    git(repo, "add", "--", path);
    git(repo, "commit", "-m", `chore(release): update ${path}`, "-m", `Release-Source: ${source}`);
  }
  const head = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "main");
  git(repo, "commit", "--allow-empty", "-m", "docs: prepare review");
  const main = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "-c", "synthetic-merge");
  git(repo, "merge", "--no-ff", "--no-edit", head);
  assert.equal(new Set([source, head, main, git(repo, "rev-parse", "HEAD")]).size, 4);
  success(cli(repo, "verify", ["--source", source, "--candidate", head, "--version", VERSION]));
  success(cli(repo, "verify-pr", ["--main", main, "--candidate", head, "--version", VERSION]));
  failure(cli(repo, "verify-pr", ["--main", git(repo, "rev-parse", `v${BASE}^{commit}`), "--candidate", head, "--version", VERSION]));
  git(repo, "switch", "candidate");
  writeFileSync(join(repo, "manifest.json"), readFileSync(join(repo, "manifest.json"), "utf8") + "\n");
  git(repo, "add", "manifest.json");
  git(repo, "commit", "-m", "test: change one byte", "-m", `Release-Source: ${source}`);
  failure(cli(repo, "verify-pr", ["--main", main, "--candidate", git(repo, "rev-parse", "HEAD"), "--version", VERSION]));
});

test("generation refuses a skipped RC, an occupied tag, and an unrelated baseline", t => {
  const { repo, source, output } = fixture(t);
  const args = ["--source", source, "--output", output];
  failure(cli(repo, "generate", [...args, "--version", "0.2.0-rc.5"]));
  git(repo, "tag", `v${VERSION}`, source);
  failure(cli(repo, "generate", [...args, "--version", VERSION]));
  git(repo, "switch", "--orphan", "other");
  git(repo, "commit", "--allow-empty", "-m", "fix: unrelated history");
  git(repo, "tag", "-d", `v${VERSION}`);
  failure(cli(repo, "generate", ["--source", git(repo, "rev-parse", "HEAD"), "--output", output, "--version", VERSION]));
});

test("an open candidate can be refreshed with appended commits and recognized after merge", t => {
  const { repo, source, output } = fixture(t);
  const apply = (from, generated) => {
    for (const path of FILES) {
      cpSync(join(generated, path), join(repo, path));
      git(repo, "add", "--", path);
      git(repo, "commit", "--allow-empty", "-m", "chore(release): refresh " + path,
        "-m", "Release-Source: " + from);
    }
  };
  success(cli(repo, "generate", ["--source", source, "--version", VERSION, "--output", output]));
  git(repo, "switch", "-c", "candidate");
  apply(source, output);
  const first = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "main");
  git(repo, "commit", "--allow-empty", "-m", "fix: include later correction");
  const updated = git(repo, "rev-parse", "HEAD");
  const refreshed = output + "-refreshed";
  success(cli(repo, "generate", ["--source", updated, "--version", VERSION, "--output", refreshed]));
  git(repo, "switch", "candidate");
  git(repo, "merge", "--no-ff", "--no-edit", updated);
  apply(updated, refreshed);
  const head = git(repo, "rev-parse", "HEAD");
  git(repo, "merge-base", "--is-ancestor", first, head);
  success(cli(repo, "verify-pr", ["--main", updated, "--candidate", head, "--version", VERSION]));
  assert.match(readFileSync(join(repo, "CHANGELOG.md"), "utf8"), /include later correction/);
  git(repo, "switch", "main");
  git(repo, "merge", "--no-ff", "--no-edit", head);
  const completed = cli(repo, "generate", ["--source", git(repo, "rev-parse", "HEAD"),
    "--version", VERSION, "--output", output + "-merged"]);
  success(completed);
  assert.match(completed.stdout, /already incorporated/);
});
