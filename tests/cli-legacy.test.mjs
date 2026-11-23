import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = JSON.parse(readFileSync(new URL("./fixtures/cli-legacy.json", import.meta.url), "utf8"));
const paths = Object.entries(baseline.paths).map(([name, path]) => [name, resolve(root, path)]);
function restore(text) {
  for (const [name, path] of paths) {
    text = text.replaceAll("{{" + name + "_JSON}}", JSON.stringify(path).slice(1, -1));
    text = text.replaceAll("{{" + name + "}}", path);
  }
  return text;
}

for (const example of baseline.cases) {
  test("legacy CLI bytes: " + example.name, () => {
    const child = spawnSync(process.execPath, [resolve(root, "bin/weapp-shipmate.mjs"), ...example.args.map(restore)], {
      cwd: root, encoding: "utf8", timeout: 15000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, example.code);
    // Evidence fixes advance the scanner policy while the historical fixture stays frozen.
    const expected = restore(example.stdout)
      .replace('"policyVersion": "shipmate-static-v1"', '"policyVersion": "shipmate-static-v2"');
    assert.equal(child.stdout, expected);
    assert.equal(child.stderr, restore(example.stderr));
  });
}
