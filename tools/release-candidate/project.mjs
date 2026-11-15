export const CANDIDATE_FILES = Object.freeze([
  "package.json",
  "manifest.json",
  "package-lock.json",
  "desktop/package.json",
  "desktop/package-lock.json",
  "desktop/src-tauri/tauri.conf.json",
  "desktop/src-tauri/Cargo.toml",
  "desktop/src-tauri/Cargo.lock",
  "CHANGELOG.md",
]);

// Locate string values in the original JSON so unrelated formatting survives.
function projectJson(source, path, baseVersion, version) {
  JSON.parse(source);
  const lock = path.endsWith("package-lock.json");
  const stack = [];
  const edits = [];
  const tokens = /"(?:\\.|[^"\\])*"(\s*:)?|[{}[\]]/g;
  for (const match of source.matchAll(tokens)) {
    const token = match[0];
    if (token === "{" || token === "[") {
      stack.push({ keys: new Set(), key: null });
    } else if (token === "}" || token === "]") {
      stack.pop();
    } else if (match[1]) {
      const frame = stack.at(-1);
      frame.key = JSON.parse(token.slice(0, -match[1].length));
      if (frame.keys.has(frame.key)) throw new Error(path + ": duplicate JSON key " + frame.key);
      frame.keys.add(frame.key);
    } else if (stack.at(-1)?.key === "version") {
      const root = stack.length === 1;
      const lockRoot = lock && stack.length === 3 && stack[0].key === "packages" && stack[1].key === "";
      if (!root && !lockRoot) continue;
      if (JSON.parse(token) !== baseVersion) throw new Error(path + ": version differs from baseline");
      edits.push([match.index, token.length]);
    }
  }
  if (edits.length !== (lock ? 2 : 1)) throw new Error(path + ": missing version field");
  for (const [offset, length] of edits.reverse()) {
    source = source.slice(0, offset) + JSON.stringify(version) + source.slice(offset + length);
  }
  return source;
}

// Cargo metadata uses single-line string fields. Reject ambiguous layouts before editing.
function cargoField(block, key, path) {
  const assignment = new RegExp(`^[ \\t]*(?:${key}|"${key}"|'${key}')[ \\t]*=.*$`, "gm");
  const matches = [...block.matchAll(assignment)];
  const parts = matches.length === 1 && /^([^=]+=[ \t]*)(["'])([^"'\n]*)\2[ \t]*(?:#.*)?$/.exec(matches[0][0]);
  if (!parts) throw new Error(path + ": expected one string field for " + key);
  return { value: parts[3], offset: matches[0].index + parts[1].length + 1 };
}

function projectCargo(source, path, baseVersion, version) {
  const lock = path.endsWith(".lock");
  const header = lock ? "[[package]]" : "[package]";
  if (source.includes('"""') || source.includes("'''")) throw new Error(path + ": multiline TOML strings unsupported");
  const blocks = source.split(/(?=^[ \t]*\[)/m);
  let matches = 0;
  for (const [index, block] of blocks.entries()) {
    if (block.split("\n", 1)[0].split("#", 1)[0].trim() !== header) continue;
    if (lock && cargoField(block, "name", path).value !== "desktop") continue;
    const { value, offset } = cargoField(block, "version", path);
    if (value !== baseVersion) throw new Error(path + ": package version differs from baseline");
    blocks[index] = block.slice(0, offset) + version + block.slice(offset + baseVersion.length);
    matches++;
  }
  if (matches !== 1) throw new Error(path + ": expected one desktop package");
  return blocks.join("");
}

function projectChangelog(source, baseVersion, version, date, notes) {
  const headings = [...source.matchAll(/^## (.+)$/gm)];
  const baselineHeadings = headings.filter(match => match[1].startsWith("[" + baseVersion + "]"));
  if (headings[0]?.[1] !== "[Unreleased]" ||
      headings.filter(match => match[1] === "[Unreleased]").length !== 1 ||
      baselineHeadings.length !== 1 || baselineHeadings[0] !== headings[1] ||
      !/^\[[^\]]+\] - \d{4}-\d{2}-\d{2}$/.test(headings[1][1]) ||
      headings.some(match => match[1].startsWith("[" + version + "]"))) {
    throw new Error("CHANGELOG.md: expected Unreleased followed by the baseline release");
  }
  const intro = source.slice(0, headings[0].index);
  const descriptions = [...intro.matchAll(/当前仓库发布候选版本为 `([^`\n]+)`/g)];
  if (descriptions.length !== 1 || descriptions[0][1] !== baseVersion) {
    throw new Error("CHANGELOG.md: candidate description differs from baseline");
  }
  if (typeof notes !== "string" || !notes.trim() || /^ {0,3}#{1,2}(?:\s|$)/m.test(notes) || notes.includes("\r")) {
    throw new Error("CHANGELOG.md: expected generated notes without a release heading");
  }
  const description = descriptions[0][0];
  const updatedIntro = intro.replace(description, description.replace(baseVersion, version));
  const manual = source.slice(headings[0].index + headings[0][0].length, headings[1].index);
  const history = source.slice(headings[1].index);
  return updatedIntro + "## [Unreleased]\n\n## [" + version + "] - " + date + manual +
    (manual.endsWith("\n\n") ? "" : "\n") + notes.trim() + "\n\n" + history;
}

export function projectCandidate({ files, baseVersion, version, date, notes }) {
  const rc = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-rc\.(0|[1-9]\d*)$/;
  const base = rc.exec(baseVersion);
  if (!base || version !== base[1] + "-rc." + (BigInt(base[2]) + 1n)) {
    throw new Error("Expected the next RC in the same version series");
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T00:00:00Z").toJSON()?.slice(0, 10) !== date) {
    throw new Error("Expected a UTC date in YYYY-MM-DD format");
  }
  const result = new Map();
  for (const path of CANDIDATE_FILES) {
    const source = files.get(path);
    if (typeof source !== "string" || source.includes("\r") || !source.endsWith("\n")) {
      throw new Error(path + ": expected LF-terminated source text");
    }
    let value;
    if (path.endsWith(".json")) value = projectJson(source, path, baseVersion, version);
    else if (path === "CHANGELOG.md") value = projectChangelog(source, baseVersion, version, date, notes);
    else value = projectCargo(source, path, baseVersion, version);
    result.set(path, value);
  }
  return result;
}
