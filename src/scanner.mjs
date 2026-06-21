// src/scanner.mjs —— 本地源码静态扫描器（不懂合规，只提取事实）
// 安全：默认 local-only；忽略密钥/证照/私有配置；只输出 API 名、域名 host、配置键、文件路径，
//       绝不回显文件内容、Token、手机号、身份证号等（见 SECURITY.md）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname, relative } from "node:path";

// 目录忽略
const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".github", "miniprogram_npm", "dist", "build", ".omc", ".claude",
  // 构建/编译产物、发布与临时目录（含 uni-app 的 unpackage、HBuilderX 的 _mp_devtools）——
  // 扫了会把框架运行时（wx.createSubpackageApp 等）与占位 host 当成真实事实。
  "unpackage", "_mp_devtools", "output", "tmp", "releases", "coverage",
  // 工具/缓存目录
  ".omx", ".npm-cache", ".wxci", ".vscode", ".idea",
  // 云函数：服务端代码，不随小程序包上传；后端持有密钥、直调服务端 API 属正常，扫了只会误报。
  "cloudfunctions",
]);
// 文件忽略（与 SECURITY.md 一致）
const IGNORE_FILE = [
  /^\.env/, /\.pem$/, /\.p12$/, /^private\..*\.key$/, /^project\.private\.config\.json$/, /^secret/,
  /-lock\.json$/, /^pnpm-lock\.yaml$/, /^yarn\.lock$/, // lock 文件：纯依赖元数据，含大量募捐/registry 域名
  /\.d\.ts$/,                                          // 类型声明：只有类型、无运行时调用
];
// 参与扫描的文本扩展名（.jsx/.tsx：Taro/React 小程序的页面与组件源码）
const SCAN_EXT = new Set([".js", ".ts", ".jsx", ".tsx", ".mjs", ".wxml", ".wxs", ".json", ".vue", ".uvue"]);

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

const API_RE = /\b(wx|uni|Taro)\.([a-zA-Z][a-zA-Z0-9]*)/g; // Taro：React 系小程序的 API 命名空间
const URL_RE = /(["'`])(https?:\/\/|wss?:\/\/)([^"'`\s/?#]+)/g;
const REQUEST_DYNAMIC_RE =
  /\b(?:wx|uni)\.(?:request|connectSocket|uploadFile|downloadFile)\s*\(\s*\{[^}]*\burl\s*:\s*(?!["'`])/;
const PHONE_BTN_RE = /open-?type\s*=\s*["']getPhoneNumber["']/;
// 疑似硬编码的微信密钥（AppSecret/商户密钥等后端专用）。捕获组只取键名，绝不记录密钥值。
const SECRET_RE = /\b(appsecret|app_secret|mch_?key|partner_?key|apiclient_key)\b\s*[:=]\s*["'`][^"'`]{6,}["'`]/gi;
// Taro 的 app.config.ts/js 是 TS/JS 模块（非 JSON），requiredPrivateInfos 以数组字面量声明。
const REQUIRED_PRIVATE_RE = /requiredPrivateInfos\s*:\s*\[([^\]]*)\]/;
const QUOTED_NAME_RE = /["'`]([a-zA-Z][a-zA-Z0-9]*)["'`]/g;

/**
 * 字符串感知地剥离 // 行注释与 / * * / 块注释，但完整保留字符串字面量内容
 * （含其中的 https:// 与 //）。这是可信度的关键：被注释掉的 wx.getLocation() 不应再触发
 * 隐私/域名预检；而朴素的「//→行尾」剥离会破坏 "https://x" 反而引入新错误，故必须感知字符串。
 * 不处理正则字面量与 WXML/HTML 注释（范围之外；保持现状即可，最坏只是少剥一处、不会误删真实代码）。
 */
export function stripComments(text) {
  let out = "";
  let str = null; // 当前字符串定界符（' " 或 反引号），null 表示不在字符串内
  for (let i = 0, n = text.length; i < n; ) {
    const c = text[i];
    if (str) {
      out += c;
      if (c === "\\") { if (i + 1 < n) out += text[i + 1]; i += 2; continue; } // 转义：原样保留下一字符
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") { // 行注释：跳到行尾（保留换行）
      i += 2;
      while (i < n && text[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") { // 块注释：跳到 */（保留其中换行以维持行结构）
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) { if (text[i] === "\n") out += "\n"; i += 1; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") str = c; // 进入字符串
    out += c;
    i += 1;
  }
  return out;
}

/** 把请求 host 归一为裸域名：去掉 user[:pass]@ 前缀与 :port 后缀并小写——否则带端口/凭据的
 *  域名会绕过 IP/微信服务端 API 等精确匹配的安全交叉核验。 */
export function normalizeHost(raw) {
  let h = String(raw).toLowerCase();
  const at = h.lastIndexOf("@");
  if (at !== -1) h = h.slice(at + 1); // 去 userinfo
  return h.replace(/:\d+$/, "");      // 去端口
}

// XML/SVG 命名空间标识符——是规范里的 namespace URI，绝不是网络请求目标。
// 内联 SVG 的 xmlns="http://www.w3.org/2000/svg" 在 Vue 组件里极常见，扫了会假报明文请求。
const NAMESPACE_HOSTS = new Set(["www.w3.org", "schemas.openxmlformats.org", "ns.adobe.com"]);

/** host 是否像真实域名/IP：归一后只含 [a-z0-9._-] 且含点（localhost 单独放行）。
 *  排除模板字面量 `${host}`、通配符等噪声，以及 XML/SVG 命名空间——它们不是可配进白名单的真实域名。 */
function isPlausibleHost(h) {
  if (NAMESPACE_HOSTS.has(h)) return false;
  return h === "localhost" || (/^[a-z0-9._-]+$/.test(h) && h.includes("."));
}

/**
 * 扫描一个小程序项目目录。
 * @returns {{ filesScanned:number, apis:string[], domains:string[], dynamicRequest:boolean, configKeys:string[] }}
 */
export function scanProject(dir) {
  const apis = new Set();
  const domains = new Set();
  const configKeys = new Set();
  const secretHints = new Set(); // "相对路径::键名"，去重；绝不含密钥值
  const insecureHosts = new Set(); // 用了明文 http/ws 的域名
  let dynamicRequest = false;
  let filesScanned = 0;

  for (const file of walk(dir)) {
    let text;
    try { text = readFileSync(file, "utf-8"); } catch { continue; }
    filesScanned++;

    // 在剥离注释后的代码上做事实提取：被注释掉的调用/域名不计入命中（app.json 仍按原文解析）。
    const code = stripComments(text);
    for (const m of code.matchAll(API_RE)) apis.add(`${m[1]}.${m[2]}`);
    for (const m of code.matchAll(URL_RE)) {
      const host = normalizeHost(m[3]); // 去端口/userinfo，防止绕过精确匹配的安全核验
      if (!isPlausibleHost(host)) continue; // 跳过 `${host}` 等模板占位/非法 host 噪声
      domains.add(host);
      if (m[2] === "http://" || m[2] === "ws://") insecureHosts.add(host); // 明文协议（须 https/wss）
    }
    if (REQUEST_DYNAMIC_RE.test(code)) dynamicRequest = true;
    if (PHONE_BTN_RE.test(code)) configKeys.add("button.open-type=getPhoneNumber");
    // 只取键名（m[1]）与相对路径，永不读取/记录密钥值本身。
    const rel = relative(dir, file).replace(/\\/g, "/");
    for (const m of code.matchAll(SECRET_RE)) secretHints.add(`${rel}::${m[1].toLowerCase()}`);

    // 隐私接口声明 / 权限：原生小程序在 app.json 根级；uni-app 在 manifest.json 的 mp-weixin 块
    // （且常为 JSONC 带注释，故用已剥离注释的 code 解析）。两者统一为同一逻辑配置键。
    const base = basename(file);
    if (base === "app.json" || base === "manifest.json") {
      try {
        const conf = JSON.parse(code);
        const mp = base === "manifest.json" ? conf["mp-weixin"] || {} : conf;
        if (mp.requiredPrivateInfos) {
          for (const k of mp.requiredPrivateInfos) configKeys.add(`app.json:requiredPrivateInfos:${k}`);
        }
        if (mp.permission) {
          for (const k of Object.keys(mp.permission)) configKeys.add(`app.json:permission:${k}`);
        }
      } catch { /* 非标准/含尾逗号的配置，跳过（降级为无配置信号，不崩） */ }
    } else if (/^app\.config\.[jt]sx?$/.test(base)) {
      // Taro：app.config.ts/js 是模块而非 JSON，正则抽取 requiredPrivateInfos 数组里的接口名。
      const m = code.match(REQUIRED_PRIVATE_RE);
      if (m) for (const q of m[1].matchAll(QUOTED_NAME_RE)) configKeys.add(`app.json:requiredPrivateInfos:${q[1]}`);
    }
  }

  return {
    filesScanned,
    apis: [...apis].sort(),
    domains: [...domains].sort(),
    dynamicRequest,
    configKeys: [...configKeys].sort(),
    secretHints: [...secretHints].sort().map((s) => {
      const [file, key] = s.split("::");
      return { file, key };
    }),
    insecureHosts: [...insecureHosts].sort(),
  };
}

export { stripComments as _stripComments, normalizeHost as _normalizeHost }; // 供测试直接验证纯函数
