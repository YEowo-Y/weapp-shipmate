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

// B6：协议版本不回显——我们只实现 2025-06-18 语义（无 JSON-RPC 批处理）。回显旧版本
// 是伪能力声明，客户端会按批处理等我们没有的语义交互。
test("initialize 协议版本协商：不支持的版本返回服务端版本而非回显", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 10, method: "initialize", params: { protocolVersion: "2024-11-05" },
  });
  assert.equal(res.result.protocolVersion, "2025-06-18");
});

test("通知不产生应答", async () => {
  assert.equal(await dispatch({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("显式 id:null 是请求：应答并原样回显 null", async () => {
  for (const method of ["ping", "notifications/initialized"]) {
    const res = await dispatch({ jsonrpc: "2.0", id: null, method });
    assert.equal(res.id, null, method);
    assert.deepEqual(res.result, {}, method);
  }
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

// V1（STRENGTHENING_PLAN 阶段2）：FX-06 的 MCP 面。主机可能把 LLM 生成的参数直接透传，
// 因此服务端必须执行 inputSchema 校验；非法 subject 此前会静默滤掉全部规则 → 伪清白空报告。
test("tools/call check 非法 subject → -32602 且列出合法值，不产出伪清白报告", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 9, method: "tools/call",
    params: { name: "weapp_shipmate_check", arguments: { dir: FIX, subject: "Personal" } },
  });
  assert.equal(res.error.code, -32602);
  assert.match(res.error.message, /subject/);
  assert.match(res.error.message, /personal \| individual_business \| enterprise/);
});

test("非法 JSON-RPC 请求信封返回 -32600（含非对象与错误字段类型）", async () => {
  const invalid = [
    null,
    42,
    [],
    "str",
    { jsonrpc: "1.0", id: 11, method: "ping" },
    { jsonrpc: "2.0", id: 12 },
    { jsonrpc: "2.0", id: {}, method: "ping" },
    { jsonrpc: "2.0", id: 13, method: "ping", params: "bad" },
    { jsonrpc: "2.0", id: 14, method: "ping", params: [] },
    { jsonrpc: "2.0", id: 15, method: "tools/call", params: [] },
  ];
  for (const msg of invalid) {
    const res = await dispatch(msg);
    assert.equal(res.error.code, -32600, `应拒绝 ${JSON.stringify(msg)}`);
    assert.equal(res.id, null, "非法请求无法建立可靠请求身份，错误 id 应为 null");
  }
});

// 阶段2复核 MINOR：guide 面与 check 面同享 FX-06 防线——此前 guide 静默接受非法主体,
// 丢弃主体专属规则(个人 web-view 阻断)的同时把该主体当作已生效回显。
test("tools/call guide 非法 subject → -32602 且列出合法值", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 9, method: "tools/call",
    params: { name: "weapp_shipmate_guide", arguments: { subject: "Personal" } },
  });
  assert.equal(res.error.code, -32602);
  assert.match(res.error.message, /subject/);
  assert.match(res.error.message, /personal \| individual_business \| enterprise/);
});

test("tools/call guide 保留省略的项目事实，并区分显式 false 与 true", async () => {
  for (const [facts, summary, domainGroup] of [
    [{}, "6/8，待确认 2 个阶段", "selfCheck"],
    [{ sensitive: false, domain: false, payment: false }, "6/8，已跳过 2 个阶段", null],
    [{ sensitive: true, domain: true, payment: true }, "8/8", "items"],
  ]) {
    const response = await dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "weapp_shipmate_guide", arguments: { subject: "personal", ...facts } } });
    const result = response.result.structuredContent;
    assert.ok(result.meta.summary.includes(summary));
    const hasDomain = item => item.ruleId === "domain.must-icp-filed";
    assert.equal(result.items.some(hasDomain), domainGroup === "items");
    assert.equal(result.selfCheck.some(hasDomain), domainGroup === "selfCheck");
    assert.equal(result.notes.some(note => note.includes("涉及支付")), facts.payment !== undefined);
  }
});

test("未知方法返回 -32601", async () => {
  const res = await dispatch({ jsonrpc: "2.0", id: 5, method: "no/such" });
  assert.equal(res.error.code, -32601);
});

test("tools/call 未知工具名 → -32602 Invalid params", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 7, method: "tools/call",
    params: { name: "no_such_tool", arguments: {} },
  });
  assert.equal(res.error.code, -32602);
  assert.match(res.error.message, /未知工具/);
});

test("tools/call 缺必填、错误类型或枚举 → -32602，并点名参数", async () => {
  const invalidCalls = [
    ["check 缺 dir", { name: "weapp_shipmate_check", arguments: {} }, /dir/],
    ["check 空 dir", { name: "weapp_shipmate_check", arguments: { dir: "" } }, /dir/],
    ["explain 缺 query", { name: "weapp_shipmate_explain", arguments: {} }, /query/],
    [
      "布尔值不强转",
      { name: "weapp_shipmate_check", arguments: { dir: FIX, includeDrafts: "true" } },
      /includeDrafts/,
    ],
    ["guide payment 类型", { name: "weapp_shipmate_guide", arguments: { payment: 1 } }, /payment/],
    [
      "format 枚举",
      { name: "weapp_shipmate_explain", arguments: { query: "隐私", format: "xml" } },
      /format/,
    ],
    ["arguments 必须为对象", { name: "weapp_shipmate_guide", arguments: [] }, /arguments/],
  ];
  for (const [label, params, expectedMessage] of invalidCalls) {
    const res = await dispatch({ jsonrpc: "2.0", id: label, method: "tools/call", params });
    assert.equal(res.error.code, -32602, label);
    assert.match(res.error.message, expectedMessage, label);
  }
});

test("tools/call 继续接受 schema 未声明的额外属性", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", id: 16, method: "tools/call", trace: "额外信封字段",
    params: {
      name: "weapp_shipmate_guide",
      extraParam: true,
      arguments: { subject: "personal", futureOption: "保留向前兼容" },
    },
  });
  assert.equal(res.error, undefined);
  assert.equal(res.result.isError, false);
  assert.equal(res.result.structuredContent.command, "guide");
});

test("合法 tools/call 通知即使参数无效也不产生应答", async () => {
  const res = await dispatch({
    jsonrpc: "2.0", method: "tools/call",
    params: { name: "weapp_shipmate_check", arguments: {} },
  });
  assert.equal(res, null);
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
      const parseErrors = []; // B6：坏 JSON 行应各回一条 -32700（id:null，不进 acc）
      const invalidRequests = [];
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
          if (msg.error?.code === -32700) parseErrors.push(msg);
          if (msg.error?.code === -32600) invalidRequests.push(msg);
          if (msg.id != null) acc.set(msg.id, msg);
          if (acc.has(1) && acc.has(2)) { clearTimeout(timer); resolve({ acc, parseErrors, invalidRequests }); }
        }
      });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      // 脏行容错契约：客户端发半截 JSON/空行时服务须跳过不崩，后续合法请求仍应答
      //（MCP stdio 服务最常见的真实故障模式；若崩溃则下面两条合法消息收不到应答而超时 fail）。
      // null/42/[] 是合法 JSON、但不是合法 JSON-RPC Request，应回 -32600 且服务继续存活。
      child.stdin.write("{not json}\n");
      child.stdin.write("\n");
      child.stdin.write('{"jsonrpc": "2.0", "id"\n');
      child.stdin.write("null\n");
      child.stdin.write("42\n");
      child.stdin.write("[]\n");
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    });
    assert.ok(seen.acc.get(1).result.serverInfo, "initialize 应有 serverInfo");
    assert.equal(seen.acc.get(2).result.tools.length, 3, "tools/list 应返回 3 个工具");
    // B6（FX-18）：两条坏 JSON 行（{not json} 与截断行）应各回一条 -32700，不再静默；
    // null/42/[] 不计为 parse error，故仍恰为 2 条 -32700。
    assert.equal(seen.parseErrors.length, 2, "坏 JSON 行应回 -32700 而非静默");
    assert.equal(seen.invalidRequests.length, 3, "合法 JSON 的非法请求信封应各回 -32600");
  } finally {
    child.stdin.end();
    child.kill();
  }
});

// B6：单行缓冲上限——无换行的超长输入此前无界累积吃内存；现在丢弃缓冲、服务存活、后续请求照常应答。
test("stdio 单行超限：2MB 无换行输入被丢弃，服务存活并继续应答", async () => {
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
  try {
    const pong = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("超时：服务未在超限输入后应答 ping")), 8000);
      let buf = "";
      child.stdout.setEncoding("utf-8");
      child.stdout.on("data", (d) => {
        buf += d;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let m;
          try { m = JSON.parse(line); } catch { continue; }
          if (m.id === 99) { clearTimeout(timer); resolve(m); }
        }
      });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.stdin.write("x".repeat(2 * 1024 * 1024)); // 超限垃圾，无换行
      child.stdin.write("\n"); // 残段成为坏行 → -32700，不得影响后续
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping" }) + "\n");
    });
    assert.deepEqual(pong.result, {});
  } finally {
    child.stdin.end();
    child.kill();
  }
});
