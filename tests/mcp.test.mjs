import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { dispatch, TOOLS } from "../src/mcp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "weapp-shipmate-mcp.mjs");
const FIX = join(ROOT, "fixtures", "sample-app");

test("initialize 回应协议版本与 serverInfo", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(res.result.protocolVersion, "2025-06-18");
  assert.equal(res.result.serverInfo.name, "weapp-shipmate");
  assert.ok(res.result.capabilities.tools);
});

test("通知不产生应答", async () => {
  assert.equal(await dispatch({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("tools/list 暴露 check 与 guide", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["weapp_shipmate_check", "weapp_shipmate_guide"]);
  for (const t of TOOLS) assert.equal(t.inputSchema.type, "object");
});

test("tools/call guide 返回 content 文本", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "weapp_shipmate_guide", arguments: { subject: "personal", sensitive: true } },
  });
  assert.equal(res.result.isError, false);
  assert.match(res.result.content[0].text, /上线导航清单/);
  assert.equal(res.result.structuredContent.command, "guide");
});

test("tools/call check 在夹具上命中（含 draft）", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "weapp_shipmate_check", arguments: { dir: FIX, subject: "personal", includeDrafts: true, format: "json" } },
  });
  assert.equal(res.result.structuredContent.command, "check");
  assert.ok(res.result.structuredContent.items.length >= 4);
});

test("未知方法返回 -32601", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 5, method: "no/such" });
  assert.equal(res.error.code, -32601);
});

test("stdio 传输端到端：initialize → tools/list 往返", async () => {
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (d) => (out += d));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");

  await new Promise((r) => setTimeout(r, 400));
  child.stdin.end();
  child.kill();

  const lines = out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const init = lines.find((m) => m.id === 1);
  const list = lines.find((m) => m.id === 2);
  assert.ok(init.result.serverInfo, "initialize 应有 serverInfo");
  assert.equal(list.result.tools.length, 2, "tools/list 应返回 2 个工具");
});
