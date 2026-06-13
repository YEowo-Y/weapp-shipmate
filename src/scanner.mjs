// src/scanner.mjs —— 本地源码静态扫描器（不懂合规，只提取事实）
// 安全：默认 local-only；忽略密钥/证照/私有配置；只输出 API 名、域名 host、配置键、文件路径，
//       绝不回显文件内容、Token、手机号、身份证号等（见 SECURITY.md）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

// 目录忽略
const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".github", "miniprogram_npm", "dist", "build", ".omc", ".claude",
]);
// 文件忽略（与 SECURITY.md 一致）
const IGNORE_FILE = [/^\.env/, /\.pem$/, /\.p12$/, /^private\..*\.key$/, /^project\.private\.config\.json$/, /^secret/];
// 参与扫描的文本扩展名
const SCAN_EXT = new Set([".js", ".ts", ".mjs", ".wxml", ".wxs", ".json", ".vue", ".uvue"]);

const ignored = (name) => IGNORE_FILE.some((re) => re.test(name));

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) yield* walk(full);
    } else if (SCAN_EXT.has(extname(entry)) && !ignored(entry)) {
      yield full;
    }
  }
}

const API_RE = /\b(wx|uni)\.([a-zA-Z][a-zA-Z0-9]*)/g;
const URL_RE = /(["'`])(https?:\/\/|wss?:\/\/)([^"'`\s/?#]+)/g;
const REQUEST_DYNAMIC_RE =
  /\b(?:wx|uni)\.(?:request|connectSocket|uploadFile|downloadFile)\s*\(\s*\{[^}]*\burl\s*:\s*(?!["'`])/;
const PHONE_BTN_RE = /open-?type\s*=\s*["']getPhoneNumber["']/;

/**
 * 扫描一个小程序项目目录。
 * @returns {{ filesScanned:number, apis:string[], domains:string[], dynamicRequest:boolean, configKeys:string[] }}
 */
export function scanProject(dir) {
  const apis = new Set();
  const domains = new Set();
  const configKeys = new Set();
  let dynamicRequest = false;
  let filesScanned = 0;

  for (const file of walk(dir)) {
    let text;
    try { text = readFileSync(file, "utf-8"); } catch { continue; }
    filesScanned++;

    for (const m of text.matchAll(API_RE)) apis.add(`${m[1]}.${m[2]}`);
    for (const m of text.matchAll(URL_RE)) domains.add(m[3].toLowerCase());
    if (REQUEST_DYNAMIC_RE.test(text)) dynamicRequest = true;
    if (PHONE_BTN_RE.test(text)) configKeys.add("button.open-type=getPhoneNumber");

    if (basename(file) === "app.json") {
      try {
        const app = JSON.parse(text);
        if (app.requiredPrivateInfos) {
          for (const k of app.requiredPrivateInfos) configKeys.add(`app.json:requiredPrivateInfos:${k}`);
        }
        if (app.permission) {
          for (const k of Object.keys(app.permission)) configKeys.add(`app.json:permission:${k}`);
        }
      } catch { /* 非标准 app.json，跳过 */ }
    }
  }

  return {
    filesScanned,
    apis: [...apis].sort(),
    domains: [...domains].sort(),
    dynamicRequest,
    configKeys: [...configKeys].sort(),
  };
}
