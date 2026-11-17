import test from "node:test";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, toNamespacedPath } from "node:path";
import { tmpdir } from "node:os";
import Ajv from "ajv";
import { readCliConfig } from "../src/cli-config.mjs";

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), "shipmate config reader "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, file: join(dir, "config.json") };
}

test("config runtime and shipped schema agree on all fields and reject unknown data", t => {
  const { file } = workspace(t);
  const validate = new Ajv().compile(JSON.parse(readFileSync(new URL("../schemas/cli-config-v1.schema.json", import.meta.url))));
  const valid = [{ schemaVersion: 1 }, { schemaVersion: 1, check: {}, guide: {} }];
  for (const subject of ["personal", "individual_business", "enterprise"])
    for (const failOn of ["blocker", "warning", "info", "none"])
      for (const value of [true, false]) valid.push({ schemaVersion: 1, check: { subject, failOn }, guide: { subject, business: "  服务  ", payment: value, sensitive: value, domain: value } });
  const invalid = [null, [], true, {}, { schemaVersion: "1" }, { schemaVersion: 2 }, { schemaVersion: 1, extra: true }];
  for (const section of ["check", "guide"]) {
    for (const value of [null, [], false, "value"]) invalid.push({ schemaVersion: 1, [section]: value });
    for (const key of ["extra", "__proto__", "constructor", "json", "includeDrafts", "interactive", "dir"])
      invalid.push({ schemaVersion: 1, [section]: { [key]: "SYNTHETIC_PRIVATE_VALUE" } });
    for (const subject of [null, true, "个人", "invalid", "", 1]) invalid.push({ schemaVersion: 1, [section]: { subject } });
  }
  for (const business of [null, true, 1, "", " \t\n", "\u00a0"]) invalid.push({ schemaVersion: 1, guide: { business } });
  for (const key of ["payment", "sensitive", "domain"])
    for (const value of [null, 0, 1, "false", [], {}]) invalid.push({ schemaVersion: 1, guide: { [key]: value } });
  for (const failOn of [null, false, 1, "invalid", ""]) invalid.push({ schemaVersion: 1, check: { failOn } });
  invalid.push({ schemaVersion: 1, guide: { failOn: "none" } }, { schemaVersion: 1, check: { business: "服务" } });
  for (const [documents, expected] of [[valid, true], [invalid, false]]) {
    for (const document of documents) {
      writeFileSync(file, JSON.stringify(document));
      assert.equal(validate(document), expected, JSON.stringify(document));
      if (expected) assert.deepEqual(readCliConfig(file), document);
      else assert.throws(() => readCliConfig(file), error => !error.message.includes("SYNTHETIC_PRIVATE_VALUE"));
    }
  }
});

test("reader rejects private names, bad UTF-8/JSON and non-files without disclosing values", t => {
  const { dir, file } = workspace(t);
  for (const name of [".env", ".ENV.local", "cert.pem", "cert.P12", "private.upload.key", "PROJECT.PRIVATE.CONFIG.JSON", "secret.json"]) {
    const path = join(dir, name);
    writeFileSync(path, '{"schemaVersion":1}');
    assert.throws(() => readCliConfig(path), /私有文件/);
  }
  for (const data of ['{"SYNTHETIC_PRIVATE_VALUE', '"SYNTHETIC_PRIVATE_VALUE"', Buffer.from([0x7b, 0xff, 0x7d])]) {
    writeFileSync(file, data);
    assert.throws(() => readCliConfig(file), error => !error.message.includes("SYNTHETIC_PRIVATE_VALUE"));
  }
  assert.throws(() => readCliConfig(dir), /不可读取/);
  assert.throws(() => readCliConfig(join(dir, "absent.json")), /不可读取/);
  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    writeFileSync(file, '{"schemaVersion":1}');
    chmodSync(file, 0);
    try { assert.throws(() => readCliConfig(file), /不可读取/); }
    finally { chmodSync(file, 0o600); }
  }
});

test("reader enforces the byte limit while accepting exactly 5 MiB", t => {
  const { file } = workspace(t);
  const text = '{"schemaVersion":1}';
  writeFileSync(file, text.padEnd(5 * 1024 * 1024, " "));
  assert.deepEqual(readCliConfig(file), { schemaVersion: 1 });
  writeFileSync(file, text.padEnd(5 * 1024 * 1024 + 1, " "));
  assert.throws(() => readCliConfig(file), /5 MiB/);
});

test("reader refuses ancestor directory links including Windows junctions", t => {
  const { dir } = workspace(t);
  const target = join(dir, "target");
  mkdirSync(target);
  writeFileSync(join(target, "config.json"), '{"schemaVersion":1}');
  const link = join(dir, "linked");
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => readCliConfig(join(link, "config.json")), /链接/);
});

test("reader refuses a file symlink", t => {
  const { dir, file } = workspace(t);
  writeFileSync(file, '{"schemaVersion":1}');
  const link = join(dir, "linked.json");
  try { symlinkSync(file, link, "file"); }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) { t.skip("Windows file symlink privilege unavailable; ancestor junction is tested separately"); return; }
    throw error;
  }
  assert.throws(() => readCliConfig(link), /链接/);
});

test("reader rejects network addresses before filesystem access", t => {
  const paths = ["https://example.invalid/config.json", "file://example.invalid/config.json", "//example.invalid/share/config.json", "\\\\example.invalid\\share\\config.json", "\\\\?\\UNC\\example.invalid\\share\\config.json", "\\\\.\\pipe\\config"];
  if (process.platform === "win32") paths.push("/\\example.invalid/share/config.json", "\\/example.invalid/share/config.json");
  const stat = t.mock.method(fs, "lstatSync", () => { throw new Error("filesystem must not be reached"); });
  syncBuiltinESMExports();
  try {
    for (const path of paths) assert.throws(() => readCliConfig(path), /仅支持本地文件路径/);
    if (process.platform === "win32") {
      const cwd = t.mock.method(process, "cwd", () => "\\\\example.invalid\\share");
      try { assert.throws(() => readCliConfig("config.json"), /仅支持本地文件路径/); }
      finally { cwd.mock.restore(); }
    }
    assert.equal(stat.mock.callCount(), 0);
  } finally {
    stat.mock.restore();
    syncBuiltinESMExports();
  }
});

test("Windows stream and trailing aliases cannot bypass private filenames", { skip: process.platform !== "win32" }, t => {
  const { dir, file } = workspace(t);
  for (const path of ["/\\example.invalid/share/config.json", "\\/example.invalid/share/config.json"])
    assert.throws(() => readCliConfig(path), /仅支持本地文件路径/);
  writeFileSync(file, '{"schemaVersion":1}');
  assert.deepEqual(readCliConfig(toNamespacedPath(file)), { schemaVersion: 1 });
  for (const name of ["cert.pem", "project.private.config.json"]) {
    const path = join(dir, name);
    writeFileSync(path, '{"schemaVersion":1}');
    writeFileSync(path + ":config", '{"schemaVersion":1}');
    for (const alias of [path + "::$DATA", path + ":config", path + ".", path + " ", toNamespacedPath(path + "::$DATA")])
      assert.throws(() => readCliConfig(alias), /数据流或末尾/);
  }
});
