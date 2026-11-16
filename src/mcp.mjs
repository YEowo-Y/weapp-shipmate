// src/mcp.mjs —— 极简依赖 MCP 适配层（仅 js-yaml；stdio 传输，把 CLI 能力暴露给 Claude Code / Codex）
// 协议：换行分隔的 JSON-RPC 2.0；旧版通过 initialize 握手，新版由每个请求的元数据选择协议。
// 安全：复用 CLI 的本地预检；不新增远程上传能力（见 SECURITY.md）。stdout 只输出 JSON-RPC，日志走 stderr。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SUBJECT_ENUM } from "./data.mjs";
import { runCheck } from "./check.mjs";
import { runGuide } from "./guide.mjs";
import { runExplain } from "./explain.mjs";
import { render } from "./report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;
const PROTOCOL_DEFAULT = "2025-06-18";
const MODERN_VERSION = "2026-07-28";
const SUPPORTED_VERSIONS = [MODERN_VERSION, PROTOCOL_DEFAULT];
const VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
const CACHE_HINTS = { ttlMs: 0, cacheScope: "private" };
const SERVER_INFO = { name: "weapp-shipmate", version: VERSION };

function toolOutput(command) {
  const properties = {
    command: { type: "string", const: command },
    meta: { type: "object" },
    items: { type: "array", items: { type: "object" } },
    notes: { type: "array", items: { type: "string" } },
  };
  if (command === "guide") properties.selfCheck = { type: "array", items: { type: "object" } };
  return { type: "object", properties, required: Object.keys(properties) };
}

export const TOOLS = [
  {
    name: "weapp_shipmate_check",
    title: "项目上线预检",
    annotations: { readOnlyHint: true },
    outputSchema: toolOutput("check"),
    description:
      "扫描本地微信小程序源码，输出个性化上线预检清单（命中的隐私 API、需配白名单的请求域名、动态 URL 警示等）。仅本地执行，不上传源码或密钥。",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", minLength: 1, description: "小程序项目目录路径" },
        subject: { type: "string", enum: SUBJECT_ENUM, description: "主体类型" },
        includeDrafts: { type: "boolean", description: "是否包含未核验来源的 draft 规则（默认 false）" },
        format: { type: "string", enum: ["markdown", "json"], description: "输出格式（默认 markdown）" },
      },
      required: ["dir"],
    },
  },
  {
    name: "weapp_shipmate_guide",
    title: "上线流程导航",
    annotations: { readOnlyHint: true },
    outputSchema: toolOutput("guide"),
    description:
      "根据主体类型与功能特征，输出微信小程序上线流程的下一步导航清单（注册/认证/备案/类目/隐私/域名/审核/发布）。不代办、不做合规担保。",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", enum: SUBJECT_ENUM, description: "主体类型" },
        business: { type: "string", description: "业务类型" },
        payment: { type: "boolean", description: "是否涉及支付" },
        sensitive: { type: "boolean", description: "是否收集敏感信息（手机号/位置/头像等）" },
        domain: { type: "boolean", description: "是否有自有服务器域名" },
        includeDrafts: { type: "boolean", description: "是否包含 draft 规则（默认 false）" },
        format: { type: "string", enum: ["markdown", "json"], description: "输出格式（默认 markdown）" },
      },
    },
  },
  {
    name: "weapp_shipmate_explain",
    title: "审核反馈解释",
    annotations: { readOnlyHint: true },
    outputSchema: toolOutput("explain"),
    description:
      "拒因反查：把审核反馈文案或关键词，反向索引到已核验规则的 why / 修复步骤 / 官方原文链接。仅引用已核验规则，不新增未核验断言。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "审核反馈文案或关键词（如：诱导分享 / 营销广告 / 服务器域名）" },
        includeDrafts: { type: "boolean", description: "是否包含 draft 规则（默认 false）" },
        format: { type: "string", enum: ["markdown", "json"], description: "输出格式（默认 markdown）" },
      },
      required: ["query"],
    },
  },
];
const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

function callTool(name, args = {}) {
  const format = args.format || "markdown";
  if (name === "weapp_shipmate_check") {
    const result = runCheck(args.dir, { subjectType: args.subject, includeDrafts: !!args.includeDrafts });
    return { text: render(result, format), result };
  }
  if (name === "weapp_shipmate_guide") {
    const result = runGuide(
      {
        subject_type: args.subject,
        business_type: args.business,
        has_payment: args.payment,
        collects_sensitive: args.sensitive,
        has_server_domain: args.domain,
      },
      { includeDrafts: !!args.includeDrafts },
    );
    return { text: render(result, format), result };
  }
  if (name === "weapp_shipmate_explain") {
    const result = runExplain(args.query || "", { includeDrafts: !!args.includeDrafts });
    return { text: render(result, format), result };
  }
  throw new Error(`未知工具: ${name}`);
}

function invalidRequest(modern, id) {
  const response = { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" } };
  if (!modern) response.id = null;
  else if (typeof id === "string" || Number.isFinite(id)) response.id = id;
  return response;
}

function hasValidRequestEnvelope(msg) {
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return false;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return false;
  if (Object.hasOwn(msg, "id")) {
    const id = msg.id;
    if (id !== null && typeof id !== "string" && !(typeof id === "number" && Number.isFinite(id))) return false;
  }
  if (Object.hasOwn(msg, "params")) {
    const params = msg.params;
    if (typeof params !== "object" || params === null || Array.isArray(params)) return false;
  }
  return true;
}

function validateToolArguments(tool, args) {
  for (const required of tool.inputSchema.required || []) {
    if (!Object.hasOwn(args, required)) return { error: `缺少必填参数: ${required}` };
  }
  for (const [name, schema] of Object.entries(tool.inputSchema.properties || {})) {
    if (!Object.hasOwn(args, name)) continue;
    const value = args[name];
    if (schema.type && typeof value !== schema.type)
      return { error: `参数 ${name} 类型错误：应为 ${schema.type}` };
    if (schema.minLength && typeof value === "string" && value.length < schema.minLength)
      return { error: `参数 ${name} 不能为空` };
    if (schema.enum && !schema.enum.includes(value))
      return { error: `参数 ${name} 取值无效：可选值为 ${schema.enum.join(" | ")}` };
  }
  return null;
}

/** 处理单条 JSON-RPC 消息。通知（无 id）返回 null（不应答）。纯函数，便于测试。 */
export async function dispatch(msg) {
  const meta = msg?.params?._meta;
  const modern = meta != null && (Object.hasOwn(meta, VERSION_KEY) || Object.hasOwn(meta, CAPABILITIES_KEY));
  if (!hasValidRequestEnvelope(msg) || (modern && msg.id === null)) return invalidRequest(modern, msg?.id);
  const { id, method, params } = msg;
  if (!Object.hasOwn(msg, "id")) return null;

  const ok = (result) => ({
    jsonrpc: "2.0", id,
    result: modern ? { resultType: "complete", _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO }, ...result } : result,
  });
  const fail = (code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data && { data }) } });
  const toolError = (text) => ok({ content: [{ type: "text", text }], isError: true });
  if (modern) {
    const requested = meta[VERSION_KEY];
    const caps = meta[CAPABILITIES_KEY];
    if (typeof requested !== "string" || caps === null || typeof caps !== "object" || Array.isArray(caps))
      return fail(-32602, "Invalid protocolVersion or clientCapabilities metadata");
    if (requested !== MODERN_VERSION)
      return fail(-32022, "Unsupported protocol version", { supported: SUPPORTED_VERSIONS, requested });
  }

  switch (method) {
    case "server/discover":
      if (modern) return ok({ supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: {} }, ...CACHE_HINTS });
      break;
    case "initialize":
      if (!modern) return ok({ protocolVersion: PROTOCOL_DEFAULT, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
      break;
    case "notifications/initialized":
    case "initialized":
    case "ping":
      if (!modern) return ok({});
      break;
    case "tools/list":
      return ok({ tools: TOOLS, ...(modern && CACHE_HINTS) });
    case "tools/call": {
      if (typeof params?.name !== "string") return fail(-32602, "tools/call name 必须是字符串");
      const tool = TOOL_BY_NAME.get(params.name);
      if (!tool) return fail(-32602, `未知工具: ${params.name}`);
      const args = Object.hasOwn(params, "arguments") ? params.arguments : {};
      if (args === null || typeof args !== "object" || Array.isArray(args))
        return fail(-32602, "tools/call arguments 必须是对象");
      const validation = validateToolArguments(tool, args);
      if (validation) return modern ? toolError(validation.error) : fail(-32602, validation.error);
      try {
        const { text, result } = callTool(params.name, args);
        const content = [{ type: "text", text }];
        if (modern && args.format !== "json") content.push({ type: "text", text: JSON.stringify(result) });
        return ok({ content, structuredContent: result, isError: false });
      } catch (e) {
        return toolError(`错误：${e.message}`);
      }
    }
  }
  return fail(-32601, `Method not found: ${method}`);
}

/** 启动 stdio 服务：从 stdin 读换行分隔 JSON-RPC，向 stdout 写应答。 */
export function runStdio() {
  const MAX_LINE_BYTES = 1024 * 1024; // B6：单行缓冲上限——无换行的超长输入不再无界吃内存
  let buf = "";
  // B6（复核 NOTE）：客户端关闭 stdout 后继续写会以 EPIPE 击穿进程——安静退出而非崩溃栈。
  process.stdout.on("error", () => process.exit(0));
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    if (buf.length > MAX_LINE_BYTES && !buf.includes("\n")) {
      process.stderr.write(`weapp-shipmate MCP: 单行超过 ${MAX_LINE_BYTES} 字节，已丢弃该行缓冲\n`);
      buf = "";
      return;
    }
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        // B6（FX-18）：坏行此前静默吞掉，客户端只能干等。按 JSON-RPC 2.0 回 -32700（id:null）+ stderr 诊断；
        // stdout 仍只写 JSON-RPC。
        process.stderr.write(`weapp-shipmate MCP: 无法解析的 JSON 行（已回 -32700）\n`);
        process.stdout.write(
          JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n",
        );
        continue;
      }
      // V2：dispatch 的意外异常不得击穿事件循环杀死服务——诊断走 stderr，stdout 保持纯 JSON-RPC。
      let res;
      try {
        res = await dispatch(msg);
      } catch (e) {
        process.stderr.write(`weapp-shipmate MCP: dispatch 异常（已跳过该消息）：${e.message}\n`);
        continue;
      }
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    }
  });
  process.stderr.write("weapp-shipmate MCP server (stdio) ready\n");
}
