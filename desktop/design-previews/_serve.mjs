// Local development previews and session-only model connection broker. Zero deps.
// Run: node desktop/design-previews/_serve.mjs  →  http://127.0.0.1:5501
// B8（STRENGTHENING_PLAN 阶段3）：只绑回环地址 + 路径遏制。此前 listen 不带 host（绑全网卡）
// 且 join(root, 解码路径) 会把 ../ 归一化出根目录——预览运行期间，同一局域网任何主机可读本机任意文件。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createModelConnectionHandler, isLocalHost } from "../server/model-connections.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml" };

const connections = createModelConnectionHandler();
const server = createServer(async (req, res) => {
  if (!isLocalHost(req)) { res.writeHead(403); res.end("local host required"); return; }
  if (await connections(req, res)) return;
  if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end("method not allowed"); return; }
  let p;
  try {
    p = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400);
    res.end("bad request");
    return;
  }
  if (p === "/") p = "/index.html";
  const full = resolve(root, "." + p);
  if (full !== root && !full.startsWith(root + sep)) {
    // 遏制：解析后必须仍落在预览根目录内，../ 逃逸一律 403。
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const buf = await readFile(full);
    res.writeHead(200, { "content-type": TYPES[extname(full)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : buf);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(5501, "127.0.0.1", () => console.log("preview http://127.0.0.1:5501"));
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.on("close", () => connections.dispose());
