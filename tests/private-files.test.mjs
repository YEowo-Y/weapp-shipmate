import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isScanPathEligible, scanProject } from "../src/scanner.mjs";

const cases = JSON.parse(readFileSync(new URL("./fixtures/private-file-cases.json", import.meta.url), "utf8"));

test("local file privacy matches the shared cases independently of extension or directory filters", () => {
  for (const { path, noRead } of cases) {
    const name = path.split("/").at(-1);
    assert.equal(isScanPathEligible(["src", name], "missing"), !noRead, path);
  }
});

test("local scan reads token.js and skips mixed-case private files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "shipmate-private-files-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "utils"));
  writeFileSync(join(root, "utils", "token.js"), "wx.getLocation()");
  writeFileSync(join(root, "SeCrEt.js"), "wx.getSystemInfo()");
  writeFileSync(join(root, "PROJECT.PRIVATE.CONFIG.json"), "{}");
  const result = scanProject(root);
  assert.equal(result.filesScanned, 1);
  assert.deepEqual(result.apis, ["wx.getLocation"]);
});
