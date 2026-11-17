import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main, runCLI } from "../src/cli.mjs";

const bin = fileURLToPath(new URL("../bin/weapp-shipmate.mjs", import.meta.url));
function capture(isTTY = false) {
  let text = "";
  return { isTTY, write(value) { text += value; }, get: () => text };
}
function call(args) {
  const out = capture(), err = capture();
  const code = main(["node", "cli", ...args], out, err);
  return { code, stdout: out.get(), stderr: err.get() };
}
function workspace(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), "shipmate cli config "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "shipmate.json");
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, ...config }));
  return { dir, path };
}

test("config command partitions and explicit CLI values produce identical reports", t => {
  const { dir, path } = workspace(t, {
    check: { subject: "personal", failOn: "warning" },
    guide: { subject: "enterprise", business: "预约服务", payment: true, sensitive: true, domain: false },
  });
  for (const option of [["--config", path], ["--config=" + path]]) {
    assert.deepEqual(call(["guide", ...option, "--json"]), call(["guide", "--subject", "enterprise", "--business", "预约服务", "--payment", "--sensitive", "--no-domain", "--json"]));
    assert.deepEqual(call(["guide", ...option, "--subject", "个人", "--business", "商城", "--no-payment", "--no-sensitive", "--domain", "--json"]), call(["guide", "--subject", "个人", "--business", "商城", "--no-payment", "--no-sensitive", "--domain", "--json"]));
  }
  const project = join(dir, "project");
  mkdirSync(project);
  writeFileSync(join(project, "app.js"), "wx.getLocation(); wx.request({url:'http://example.com'});");
  for (const level of ["blocker", "warning", "info", "none"]) {
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, check: { subject: "enterprise", failOn: level } }));
    for (const extra of [[], ["--blockers-only"], ["--include-drafts", "--json-version", "1"]]) {
      assert.deepEqual(call(["check", project, "--config", path, "--json", ...extra]), call(["check", project, "--subject", "enterprise", "--fail-on", level, "--json", ...extra]));
    }
    assert.deepEqual(call(["check", project, "--config", path, "--subject", "personal", "--fail-on", "none", "--json"]), call(["check", project, "--subject", "personal", "--fail-on", "none", "--json"]));
  }
});

test("config errors are rejected without reports, while help/version avoid reading", t => {
  const { path } = workspace(t, { guide: { subject: "enterprise", business: "服务" } });
  for (const args of [
    ["guide", "--config"], ["guide", "--config="], ["guide", "--config", " "],
    ["guide", "--config", path, "--config=" + path], ["explain", "分享", "--config", path],
    ["guide", "--config", path, "--subject"], ["guide", "--config", path, "--business", "--json"],
    ["guide", "--config", path, "--business="], ["guide", "--config", path, "--business", "  "],
    ["guide", "--config", path, "--business", "--business", "ok"],
    ["guide", "--config", path, "--subject", "invalid"],
    ["guide", "--config", path, "--payment", "--no-payment"],
    ["guide", "--config", path, "--fail-on", "none"],
    ["guide", "--config", path, "--json-version", "1"],
    ["check", "--config", path, "--fail-on", "invalid"],
  ]) {
    const result = call(args);
    assert.equal(result.code, 1, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.ok(result.stderr);
  }
  for (const flag of ["--help", "--version"]) assert.equal(call(["guide", "--config", path + ".missing", flag]).code, 0);
  // Existing business missing-value behavior stays compatible outside config mode.
  assert.equal(call(["guide", "--business", "--json"]).code, 0);
  writeFileSync(path, '{"schemaVersion":1,"guide":{},"check":{"failOn":"SYNTHETIC_PRIVATE_VALUE"}}');
  let result = call(["guide", "--config", path]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.ok(!result.stderr.includes("SYNTHETIC_PRIVATE_VALUE"));
  writeFileSync(path, '{"schemaVersion":1, "SYNTHETIC_PRIVATE_VALUE');
  result = call(["guide", "--config", path]);
  assert.equal(result.code, 1);
  assert.ok(!result.stderr.includes("SYNTHETIC_PRIVATE_VALUE"));
});

test("real CLI resolves config and scan paths from cwd and never discovers config implicitly", t => {
  const { dir } = workspace(t, { guide: { subject: "enterprise" }, check: { failOn: "none" } });
  const configs = join(dir, "configs");
  mkdirSync(configs);
  writeFileSync(join(configs, "project.json"), JSON.stringify({ schemaVersion: 1, check: { failOn: "none" } }));
  mkdirSync(join(dir, "app"));
  const run = args => {
    const child = spawnSync(process.execPath, [bin, ...args], { cwd: dir, encoding: "utf8", timeout: 10000 });
    assert.ifError(child.error);
    return { code: child.status, stdout: child.stdout, stderr: child.stderr };
  };
  assert.deepEqual(run(["check", "app", "--config", "configs/project.json", "--json"]), run(["check", "app", "--fail-on", "none", "--json"]));
  assert.deepEqual(run(["guide", "--json"]), call(["guide", "--json"]));
});

test("config interactive guide reuses one read and preserves CLI facts in replay", async t => {
  const { path } = workspace(t, { guide: { subject: "enterprise", sensitive: true, business: "服务", payment: false } });
  const out = capture(true), err = capture();
  const code = await runCLI(["node", "cli", "guide", "--config", path, "--interactive", "--no-sensitive"], out, err, {
    input: { isTTY: true }, interview: async facts => {
      assert.deepEqual(facts, { subject: "enterprise", sensitive: false });
      rmSync(path);
      return { ...facts, domain: true };
    },
  });
  assert.equal(code, 0, err.get());
  const expected = call(["guide", "--subject", "enterprise", "--no-sensitive", "--domain", "--business", "服务", "--no-payment"]);
  assert.ok(out.get().startsWith(expected.stdout));
  assert.match(out.get(), /可复现命令/);
  assert.match(out.get(), /--config/);
  assert.match(out.get(), /依赖.*配置文件.*内容/);
});

test("config guide keeps interactive cancellation, non-TTY and JSON boundaries", async t => {
  const { path } = workspace(t, { guide: { subject: "enterprise" } });
  for (const [extra, tty, expected, calls] of [[[], true, 0, 0], [["--interactive"], false, 1, 0], [["--interactive", "--json"], true, 1, 0], [["--interactive"], true, 130, 1]]) {
    const out = capture(tty), err = capture();
    let count = 0;
    const status = await runCLI(["node", "cli", "guide", "--config", path, ...extra], out, err, {
      input: { isTTY: tty }, interview: async () => { count++; throw Object.assign(new Error("cancel"), { exitCode: 130 }); },
    });
    assert.equal(status, expected, err.get());
    assert.equal(count, calls);
    if (status) assert.equal(out.get(), "");
  }
});
