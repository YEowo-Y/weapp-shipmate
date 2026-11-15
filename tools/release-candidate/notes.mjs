import { execFileSync } from "node:child_process";
import { parseConventionalCommits } from "release-please/build/src/commit.js";
import { buildStrategy } from "release-please/build/src/factory.js";
import { TagName } from "release-please/build/src/util/tag-name.js";

// release-please uses these names for links. No GitHub client or credentials are needed.
const github = { repository: { owner: "YEowo-Y", repo: "weapp-shipmate", defaultBranch: "main" } };
const logger = { trace() {}, debug() {}, info() {}, warn() {}, error: console.error };

export async function generateNotes({ repoDir, baseTag, baseSha, sourceSha, version }) {
  const tag = TagName.parse(baseTag);
  if (!tag) throw new Error(`Invalid release-please base tag: ${baseTag}`);

  const history = execFileSync("git", [
    "log", "--no-merges", "-z", "--format=%H%x00%B", "--end-of-options",
    `${baseSha}..${sourceSha}`, "--",
  ], { cwd: repoDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const fields = history.split("\0");
  const commits = [];
  for (let i = 0; i < fields.length - 1; i += 2) {
    commits.push({ sha: fields[i], message: fields[i + 1] });
  }

  const strategy = await buildStrategy({
    github, releaseType: "simple", targetBranch: "main", releaseAs: version,
    includeComponentInTag: false, skipGithubRelease: true, logger,
  });
  const candidate = await strategy.buildReleasePullRequest(
    parseConventionalCommits(commits, logger), { tag, sha: baseSha, notes: "" },
  );
  const entries = candidate?.body.releaseData;
  if (entries?.length !== 1 || entries[0].version?.toString() !== version) {
    throw new Error(`release-please did not generate a single candidate for ${version}`);
  }

  // The upstream header uses today's date. The caller writes the source commit's UTC date.
  const [header, ...lines] = entries[0].notes.split("\n");
  const sections = lines.join("\n").trim();
  if (!header.startsWith(`## [${version}](`) || !sections.startsWith("### ")) {
    throw new Error(`release-please returned no changelog sections for ${version}`);
  }
  return sections;
}
