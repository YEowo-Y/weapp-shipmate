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

test("tools/list 暴露 check / guide / explain", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["weapp_shipmate_check", "weapp_shipmate_explain", "weapp_shipmate_guide"]);
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

test("tools/call explain 拒因反查返回 content 文本", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 6, method: "tools/call",
    params: { name: "weapp_shipmate_explain", arguments: { query: "诱导分享" } },
  });
  assert.equal(res.result.isError, false);
  assert.match(res.result.content[0].text, /拒因解读/);
  assert.equal(res.result.structuredContent.command, "explain");
});

test("未知方法返回 -32601", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 5, method: "no/such" });
  assert.equal(res.error.code, -32601);
});

// 工具错误 ≠ 协议错误：tools/call 内部异常须包成 isError:true 的正常应答（MCP 契约），
// 不得升级成 JSON-RPC error——否则客户端会把业务失败当协议故障处理。
test("tools/call 未知工具名 → isError:true 且非协议错误", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 7, method: "tools/call",
    params: { name: "no_such_tool", arguments: {} },
  });
  assert.equal(res.error, undefined, "不应是 JSON-RPC 协议错误");
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /未知工具/);
});

test("tools/call check 目录不存在 → isError:true 文本含'错误：'", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 8, method: "tools/call",
    params: { name: "weapp_shipmate_check", arguments: { dir: "no/such/dir" } },
  });
  assert.equal(res.error, undefined, "不应是 JSON-RPC 协议错误");
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /错误：/);
});

test("stdio 传输端到端：initialize → tools/list 往返", async () => {
  // 事件驱动收尾：收齐 id=1、id=2 两条应答即 resolve（典型 ~毫秒级），不再用固定 400ms+kill 的竞态等待。
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
  try {
    const seen = await new Promise((resolve, reject) => {
      const acc = new Map();
      let buf = "";
      const timer = setTimeout(
        () => reject(new Error(`stdio 往返超时（仅收到应答 id=[${[...acc.keys()].join(",")}]）`)),
        5000,
      );
      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (d) => {
        buf += d;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.id != null) acc.set(msg.id, msg);
          if (acc.has(1) && acc.has(2)) { clearTimeout(timer); resolve(acc); }
        }
      });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      // 脏行容错契约：客户端发半截 JSON/空行时服务须跳过不崩，后续合法请求仍应答
      //（MCP stdio 服务最常见的真实故障模式；若崩溃则下面两条合法消息收不到应答而超时 fail）。
      child.stdin.write("{not json}\n");
      child.stdin.write("\n");
      child.stdin.write('{"jsonrpc": "2.0", "id"\n');
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    });
    assert.ok(seen.get(1).result.serverInfo, "initialize 应有 serverInfo");
    assert.equal(seen.get(2).result.tools.length, 3, "tools/list 应返回 3 个工具");
  } finally {
    child.stdin.end();
    child.kill();
  }
});
