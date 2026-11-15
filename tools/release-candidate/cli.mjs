import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { generateNotes } from "./notes.mjs";
import { CANDIDATE_FILES, projectCandidate } from "./project.mjs";

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function gitStatus(repo, ...args) {
  const result = spawnSync("git", ["-C", repo, ...args]);
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) throw new Error("Git check failed: " + args[0]);
  return result.status === 0;
}

function commit(repo, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha) || git(repo, "cat-file", "-t", sha).trim() !== "commit") {
    throw new Error("Expected a full commit SHA");
  }
  return sha;
}

function ancestor(repo, older, newer) {
  if (!gitStatus(repo, "merge-base", "--is-ancestor", older, newer)) {
    throw new Error("Commit outside the requested history: " + older);
  }
}

function sourceTrailer(repo, candidate) {
  const trailer = git(repo, "show", "-s", "--format=%(trailers:key=Release-Source,valueonly)", candidate).trim();
  return commit(repo, trailer);
}

function storedVersion(repo, rev) {
  return JSON.parse(git(repo, "show", rev + ":package.json")).version;
}

async function render(repo, source, baseTag, version) {
  const baseVersion = baseTag.slice(1);
  const baseSha = git(repo, "rev-parse", "--verify", "refs/tags/" + baseTag + "^{commit}").trim();
  ancestor(repo, baseSha, source);
  if (storedVersion(repo, baseSha) !== baseVersion) throw new Error("Tag and base package version differ");
  const files = new Map(CANDIDATE_FILES.map(path => [path, git(repo, "show", source + ":" + path)]));
  const seconds = git(repo, "show", "-s", "--format=%ct", source).trim();
  const date = new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
  const notes = await generateNotes({ repoDir: repo, baseTag, baseSha, sourceSha: source, version });
  return projectCandidate({ files, baseVersion, version, date, notes });
}

async function compare(repo, source, candidate, baseTag, version) {
  ancestor(repo, source, candidate);
  const expected = await render(repo, source, baseTag, version);
  for (const [path, contents] of expected) {
    if (contents !== git(repo, "show", candidate + ":" + path)) throw new Error("Candidate mismatch: " + path);
  }
}

function save(files, output, repo) {
  const inRepo = relative(repo, output);
  if (!isAbsolute(inRepo) && inRepo !== ".." && !inRepo.startsWith(".." + sep)) {
    throw new Error("Choose an output directory outside the worktree");
  }
  // Generate into a sibling first so errors cannot leave a partially written candidate.
  mkdirSync(dirname(output), { recursive: true });
  const staging = mkdtempSync(join(dirname(output), "." + basename(output) + "-"));
  try {
    for (const [path, contents] of files) {
      mkdirSync(dirname(join(staging, path)), { recursive: true });
      writeFileSync(join(staging, path), contents, { encoding: "utf8", flag: "wx" });
    }
    try {
      renameSync(staging, output);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(error.code)) throw error;
      // Windows does not replace an existing empty directory with rename.
      if (readdirSync(output).length === 0) {
        rmdirSync(output);
        renameSync(staging, output);
        return;
      }
      for (const [path, contents] of files) {
        if (readFileSync(join(output, path), "utf8") !== contents) throw new Error("Use a fresh output directory", { cause: error });
      }
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function run(argv) {
  const [action, ...args] = argv;
  const modes = {
    generate: ["source", "output"],
    verify: ["source", "candidate"],
    "verify-pr": ["main", "candidate"],
  };
  if (!Object.hasOwn(modes, action)) throw new Error("Expected generate, verify, or verify-pr");
  const keys = ["repo", "base-tag", "version", ...modes[action]];
  const options = Object.fromEntries(keys.map(key => [key, { type: "string" }]));
  const { values } = parseArgs({ args, options });
  if (keys.some(key => !values[key])) throw new Error("Required arguments: " + keys.join(", "));
  const baseTag = values["base-tag"];
  const version = values.version;
  const base = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/.exec(baseTag);
  if (!base || version !== base.slice(1, 4).join(".") + "-rc." + (BigInt(base[4]) + 1n)) {
    throw new Error("Expected the next RC in the same version series");
  }
  const repo = resolve(git(resolve(values.repo), "rev-parse", "--show-toplevel").trim());
  const candidate = values.candidate && commit(repo, values.candidate);
  const source = action === "verify-pr" ? sourceTrailer(repo, candidate) : commit(repo, values.source);
  if (values.main) ancestor(repo, source, commit(repo, values.main));
  if (action === "generate" && storedVersion(repo, source) === version) {
    const history = git(repo, "log", "--fixed-strings", "--grep=Release-Source: ", "--format=%H", baseTag + ".." + source).trim();
    const prior = history.split("\n").find(sha => sha && storedVersion(repo, sha) === version);
    if (!prior) throw new Error("No verifiable candidate found for the existing version");
    await compare(repo, sourceTrailer(repo, prior), prior, baseTag, version);
    console.log("Candidate already incorporated: " + version + " (" + prior + ")");
    return;
  }
  if (gitStatus(repo, "show-ref", "--verify", "--quiet", "refs/tags/v" + version)) {
    throw new Error("Candidate tag already exists: v" + version);
  }
  if (candidate) {
    await compare(repo, source, candidate, baseTag, version);
  } else {
    save(await render(repo, source, baseTag, version), resolve(values.output), repo);
  }
  console.log([action, version, source, CANDIDATE_FILES.length + " files"].join(" | "));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
