import { closeSync, fstatSync, lstatSync, openSync, readSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { SUBJECT_ENUM } from "./data.mjs";

const { noRead } = JSON.parse(readFileSync(new URL("./private-files.json", import.meta.url), "utf8"));
const MAX_BYTES = 5 * 1024 * 1024;
const fields = { check: ["subject", "failOn"], guide: ["subject", "business", "payment", "sensitive", "domain"] };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

/** Read one explicitly chosen local configuration; never expose parser or system error content. */
export function readCliConfig(path) {
  // Reject network and Windows stream/device aliases before any filesystem access.
  const localPath = path.startsWith("\\\\?\\") ? path.slice(4) : path;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path) || path.startsWith("//") ||
      (path.startsWith("\\\\") && !/^[a-z]:[\\/]/i.test(localPath)))
    throw new Error("配置文件：仅支持本地文件路径，不支持远程地址。");
  if (process.platform === "win32" &&
      (localPath.replace(/^[a-z]:/i, "").includes(":") ||
       localPath.split(/[\\/]/).some(part => part !== "." && part !== ".." && /[. ]$/.test(part))))
    throw new Error("配置文件：不支持数据流或末尾点号、空格的路径别名。");
  const file = resolve(process.platform === "win32" ? localPath : path);
  if (file.startsWith("\\\\") || file.startsWith("//"))
    throw new Error("配置文件：仅支持本地文件路径，不支持远程地址。");
  const fail = (field, reason) => { throw new Error(`配置文件 ${file}：${field} ${reason}`); };
  const name = basename(file).toLowerCase();
  if (noRead.exact?.includes(name) || noRead.prefix?.some(p => name.startsWith(p)) ||
      noRead.suffix?.some(s => name.endsWith(s)) || noRead.contains?.some(p => name.includes(p)) ||
      noRead.prefixSuffix?.some(({ prefix, suffix }) => name.length >= prefix.length + suffix.length && name.startsWith(prefix) && name.endsWith(suffix)))
    fail("文件", "属于私有文件，禁止读取。");
  let data;
  let fd;
  try {
    for (let current = file; ; current = dirname(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) fail("文件", "路径包含符号链接或 junction。");
      if (current === file && (!stat.isFile() || stat.size > MAX_BYTES)) fail("文件", "必须是不超过 5 MiB 的普通文件。");
      if (dirname(current) === current) break;
    }
    fd = openSync(file, "r");
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) fail("文件", "必须是不超过 5 MiB 的普通文件。");
    // Bound allocation and reads even if the file grows after stat.
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > MAX_BYTES) fail("文件", "超过 5 MiB。");
    data = buffer.subarray(0, length);
  } catch {
    fail("文件", "不可读取；请核对路径、权限、普通文件类型、链接和 5 MiB 上限。");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  let config;
  try { config = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)); }
  catch { fail("JSON", "必须是有效的 UTF-8 JSON。"); }
  if (!object(config)) fail("根节点", "必须是对象。");
  for (const key of Object.keys(config))
    if (!["schemaVersion", "check", "guide"].includes(key)) fail("根节点", "含不支持的字段。");
  if (config.schemaVersion !== 1) fail("schemaVersion", "必须为整数 1。");
  for (const [command, allowed] of Object.entries(fields)) {
    if (!Object.hasOwn(config, command)) continue;
    const section = config[command];
    if (!object(section)) fail(command, "必须是对象。");
    for (const key of Object.keys(section)) {
      if (!allowed.includes(key)) fail(command, "含不支持的字段。");
      const value = section[key];
      const valid = key === "subject" ? SUBJECT_ENUM.includes(value)
        : key === "failOn" ? ["blocker", "warning", "info", "none"].includes(value)
          : key === "business" ? typeof value === "string" && value.trim().length > 0
            : typeof value === "boolean";
      if (!valid) fail(`${command}.${key}`, "类型或取值不符合配置约定。");
    }
  }
  return config;
}
