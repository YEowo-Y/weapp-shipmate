// src/mcp.mjs —— 零依赖 MCP 适配层（stdio 传输，把 CLI 能力暴露给 Claude Code / Codex）
// 协议：换行分隔的 JSON-RPC 2.0；仅实现 initialize / tools/list / tools/call / ping。
// 安全：复用 CLI 的本地预检；不新增远程上传能力（见 SECURITY.md）。stdout 只输出 JSON-RPC，日志走 stderr。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "./check.mjs";
import { runGuide } from "./guide.mjs";
import { runExplain } from "./explain.mjs";
import { render } from "./report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;
const PROTOCOL_DEFAULT = "2025-06-18";
const SERVER_INFO = { name: "weapp-shipmate", version: VERSION };

const SUBJECT_ENUM = ["personal", "individual_business", "enterprise"];

export const TOOLS = [
  {
    name: "weapp_shipmate_check",
    description:
      "扫描本地微信小程序源码，输出个性化上线预检清单（命中的隐私 API、需配白名单的请求域名、动态 URL 警示等）。仅本地执行，不上传源码或密钥。",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "小程序项目目录路径" },
        subject: { type: "string", enum: SUBJECT_ENUM, description: "主体类型" },
        includeDrafts: { type: "boolean", description: "是否包含未核验来源的 draft 规则（默认 false）" },
        format: { type: "string", enum: ["markdown", "json"], description: "输出格式（默认 markdown）" },
      },
      required: ["dir"],
    },
  },
  {
    name: "weapp_shipmate_guide",
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

function callTool(name, args = {}) {
  const format = args.format || "markdown";
  if (name === "weapp_shipmate_check") {
    const result = runCheck(args.dir || ".", { subjectType: args.subject, includeDrafts: !!args.includeDrafts });
    return { text: render(result, format), result };
  }
  if (name === "weapp_shipmate_guide") {
    const result = runGuide(
      {
        subject_type: args.subject,
        business_type: args.business,
        has_payment: !!args.payment,
        collects_sensitive: !!args.sensitive,
        has_server_domain: !!args.domain,
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

/** 处理单条 JSON-RPC 消息。通知（无 id）返回 null（不应答）。纯函数，便于测试。 */
export async function dispatch(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  const ok = (result) => (isNotification ? null : { jsonrpc: "2.0", id, result });
  const fail = (code, message) => (isNotification ? null : { jsonrpc: "2.0", id, error: { code, message } });

  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: params?.protocolVersion || PROTOCOL_DEFAULT,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "notifications/initialized":
    case "initialized":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      try {
        const { text, result } = callTool(params?.name, params?.arguments);
        return ok({ content: [{ type: "text", text }], structuredContent: result, isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `错误：${e.message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

/** 启动 stdio 服务：从 stdin 读换行分隔 JSON-RPC，向 stdout 写应答。 */
export function runStdio() {
  let buf = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const res = await dispatch(msg);
      if (res) process.stdout.write(JSON.stringify(res) + "\n");
    }
  });
  process.stderr.write("weapp-shipmate MCP server (stdio) ready\n");
}
