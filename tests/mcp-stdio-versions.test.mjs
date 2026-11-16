import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const bin = fileURLToPath(new URL("../bin/weapp-shipmate-mcp.mjs", import.meta.url));
const dir = fileURLToPath(new URL("../fixtures/sample-app/", import.meta.url));
const version = "io.modelcontextprotocol/protocolVersion";
const caps = "io.modelcontextprotocol/clientCapabilities";
const modern = { [version]: "2026-07-28", [caps]: {} };
const legacy = "2025-06-18";
const request = (id, method, params = {}) => ({ jsonrpc: "2.0", id, method, params });
const tool = (id, command, args, meta) => request(id, "tools/call", {
  name: "weapp_shipmate_" + command, arguments: args, _meta: meta,
});

function exchange(messages) {
  const child = spawnSync(process.execPath, [bin], {
    input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    encoding: "utf8", timeout: 15000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  return child.stdout.trimEnd().split("\n").map((line) => JSON.parse(line));
}

test("stdio selects the protocol independently for every request and preserves valid IDs", () => {
  const messages = [
    request("discover", "server/discover", { _meta: modern }),
    request(2, "tools/list", { _meta: { ...modern, [version]: "2099-01-01" } }),
    request(3, "tools/list", { _meta: modern }),
    request(null, "ping", { _meta: { custom: 1 } }),
    request(null, "tools/list", { _meta: modern }),
    request(6, "initialize", { protocolVersion: legacy }),
    request(7, "ping", { _meta: modern }),
    request(8, "initialize", { _meta: modern }),
    ...[{ [version]: modern[version] }, { [caps]: {} }, { ...modern, [caps]: [] },
      { ...modern, [version]: 7 }].map((_meta, i) => request(9 + i, "tools/list", { _meta })),
    request(undefined, "notifications/initialized"),
    tool(undefined, "explain", {}, modern),
  ];
  const replies = exchange(messages);
  assert.equal(replies.length, 12);
  for (const [i, reply] of replies.entries()) {
    assert.equal(reply.jsonrpc, "2.0");
    if (i !== 4) assert.equal(reply.id, messages[i].id);
  }
  const discover = replies[0].result;
  assert.ok(discover.supportedVersions.includes(legacy));
  assert.ok(discover.supportedVersions.includes(modern[version]));
  assert.deepEqual(discover.capabilities.tools, {});
  assert.equal(discover._meta["io.modelcontextprotocol/serverInfo"].name, "weapp-shipmate");
  assert.equal(replies[1].error.code, -32022);
  assert.deepEqual(replies[1].error.data.supported, discover.supportedVersions);
  assert.equal(replies[1].error.data.requested, "2099-01-01");
  for (const result of [discover, replies[2].result]) {
    assert.equal(result.resultType, "complete");
    assert.equal(result.ttlMs, 0);
    assert.equal(result.cacheScope, "private");
  }
  assert.deepEqual(replies[3].result, {});
  assert.equal(replies[4].error.code, -32600);
  assert.ok(!Object.hasOwn(replies[4], "id"));
  assert.equal(replies[5].result.protocolVersion, legacy);
  assert.deepEqual(replies.slice(6).map(r => r.error.code), [-32601, -32601, -32602, -32602, -32602, -32602]);
});

test("first-request list and calls advertise and satisfy each tool's output schema", () => {
  const ajv = new Ajv2020();
  const [list] = exchange([request(1, "tools/list", { _meta: modern })]);
  const fixtures = { check: { dir }, guide: { subject: "personal" }, explain: { query: "诱导分享" } };
  assert.equal(list.result.tools.length, 3);
  for (const [command, args] of Object.entries(fixtures)) {
    const definition = list.result.tools.find(t => t.name === "weapp_shipmate_" + command);
    assert.ok(definition.title.trim());
    assert.equal(definition.annotations.readOnlyHint, true);
    const validate = ajv.compile(definition.outputSchema);
    const [newMarkdown, oldMarkdown, newJson, oldJson] = exchange([
      tool(1, command, args, modern), tool(2, command, args),
      tool(3, command, { ...args, format: "json" }, modern),
      tool(4, command, { ...args, format: "json" }),
    ]).map(r => r.result);
    for (const r of [newMarkdown, oldMarkdown, newJson, oldJson]) {
      assert.equal(r.isError, false);
      assert.ok(validate(r.structuredContent), JSON.stringify(validate.errors));
      assert.ok(r.content.every(block => block.type === "text"));
    }
    assert.equal(newMarkdown.resultType, "complete");
    assert.equal(oldMarkdown.content.length, 1);
    assert.equal(newMarkdown.content.length, 2);
    assert.deepEqual(newMarkdown.content[0], oldMarkdown.content[0]);
    assert.deepEqual(JSON.parse(newMarkdown.content[1].text), newMarkdown.structuredContent);
    for (const r of [oldJson, newJson]) {
      assert.equal(r.content.length, 1);
      assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
    }
    const output = newMarkdown.structuredContent;
    for (const invalid of [{ ...output, command: "wrong" }, { ...output, meta: null },
      { ...output, notes: [1] }, { ...output, items: ["item"] }]) assert.equal(validate(invalid), false);
    for (const key of ["command", "meta", "notes", "items", ...(command === "guide" ? ["selfCheck"] : [])]) {
      const copy = { ...output };
      delete copy[key];
      assert.equal(validate(copy), false);
    }
    if (command === "guide") assert.equal(validate({ ...output, selfCheck: [false] }), false);
    assert.ok(validate({ ...output, extra: true }));
  }
});

test("modern tool errors and protocol errors use distinct channels", () => {
  const responses = exchange([
    tool(1, "check", {}, modern), tool(2, "guide", { subject: "wrong" }, modern),
    tool(3, "check", { dir: dir + "/missing" }, modern), tool(4, "check", {}),
    tool(5, "missing", {}, modern), tool(6, "guide", [], modern),
    request(7, "tools/call", { _meta: modern }),
  ]);
  for (const { result } of responses.slice(0, 3)) {
    assert.equal(result.isError, true);
    assert.equal(result.resultType, "complete");
    assert.ok(result.content[0].text);
    assert.ok(!Object.hasOwn(result, "structuredContent"));
  }
  for (const response of responses.slice(3)) {
    assert.equal(response.error.code, -32602);
    assert.ok(!Object.hasOwn(response, "result"));
  }
});
