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
  "unpackage", "_mp_devtools", "releases", "coverage",
  // 工具/缓存目录
  ".omx", ".npm-cache", ".wxci", ".vscode", ".idea",
  // 云函数：服务端代码，不随小程序包上传；后端持有密钥、直调服务端 API 属正常，扫了只会误报。
  "cloudfunctions",
  // uni-app 的非微信端代码（5+App / H5），编译到微信时不参与，扫了会把 plus.*、App/H5 域名误当微信代码。
  "platforms",
]);
// B4：歧义目录名只在项目根层忽略——小程序包内 pages/test/、组件目录 windows/ 是会随包上传的
// 业务代码，任意深度裸名匹配会把它们整个静默漏扫（假阴性）。根层的 test/ scripts/ windows/（uni-app
// 非微信端）等才是工具/脚手架惯例位置。
const ROOT_ONLY_IGNORE = new Set([
  "scripts", "test", "tests", "__tests__", "__mocks__", "e2e", "output", "tmp", "windows",
]);
// 文件忽略（与 SECURITY.md 一致）
const IGNORE_FILE = [
  /^\.env/, /\.pem$/, /\.p12$/, /^private\..*\.key$/, /^project\.private\.config\.json$/, /^secret/,
  /-lock\.json$/, /^pnpm-lock\.yaml$/, /^yarn\.lock$/, // lock 文件：纯依赖元数据，含大量募捐/registry 域名
  /\.d\.ts$/,                                          // 类型声明：只有类型、无运行时调用
];
// 参与扫描的文本扩展名。各跨端框架的单文件源码：.jsx/.tsx（Taro/React）、.mpx（mpx）、
// .wpy（wepy）、.vue/.uvue/.nvue（uni-app）——这些文件里同样有 wx.*/uni.*/Taro.* 调用。
const SCAN_EXT = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".wxml", ".wxs", ".json", ".vue", ".uvue", ".nvue", ".mpx", ".wpy",
]);

const ignored = (name) => IGNORE_FILE.some((re) => re.test(name));

// B2：资源上限——单文件超限视为构建产物/数据文件跳过并计数，文件总数超限截断；两者都在报告注记显性化。
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 20000;

function* walk(dir, depth = 0, stats = null) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    // 顶层失败（目录不存在/不可读）必须显性抛出——静默返回 0 文件是伪清白（e2e 锁定 exit 1 契约）；
    // B3：嵌套子目录拒权（EPERM 等）只跳过该目录，不再让整个扫描崩掉；
    // 跳过必须计数（阶段3复核 MINOR）——静默跳过会让"没扫到"伪装成"没问题"。
    if (depth === 0) throw e;
    if (stats) stats.skippedDirs++;
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    // B1（FX-12）：不跟符号链接/junction（Windows junction 的 dirent 同样报 isSymbolicLink，已实测）——
    // 链接指向项目外会把外部代码的 API/域名带进合规报告；自环会让 filesScanned 无限膨胀直至路径长度崩溃。
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      if (depth === 0 && ROOT_ONLY_IGNORE.has(e.name)) continue; // B4：歧义名仅根层忽略
      yield* walk(full, depth + 1, stats);
    } else if (e.isFile() && SCAN_EXT.has(extname(e.name)) && !ignored(e.name)) {
      let st;
      try { st = statSync(full); } catch { continue; }
      yield { file: full, size: st.size };
    }
  }
}

const API_RE = /\b(wx|uni|Taro|wepy)\.([a-zA-Z][a-zA-Z0-9]*)/g; // 跨端框架的 API 命名空间（Taro/wepy 等）
const URL_RE = /(["'`])(https?:\/\/|wss?:\/\/)([^"'`\s/?#]+)/g;
// 选项对象扫描片段容忍一层嵌套（header:{...} 前置是封装 request 工具的普遍写法，否则漏报）；
// 空白必须并入否定 lookahead（写成 :\s*(?!["'`]) 时 \s* 可回溯为零宽，静态 `url: "..."` 会被误判为动态）。
// V4：四个命名空间一视同仁（wx≡uni≡Taro≡wepy 是 data.mjs 的等价契约），此前漏 Taro/wepy——
// Taro 项目的动态拼接请求不出"可能漏报域名"注记、wepy 明文请求无警告，框架间口径不一致。
const REQUEST_DYNAMIC_RE =
  /\b(?:wx|uni|Taro|wepy)\.(?:request|connectSocket|uploadFile|downloadFile)\s*\(\s*\{(?:[^{}]|\{[^{}]*\})*?\burl\s*:(?!\s*["'`])/;
// 明文请求：http/ws 作为 *请求 API 调用* 的 url: 参数（不是任意 url 字段、不是 <image src>/媒体数据）。
// 微信只对 request/connectSocket/uploadFile/downloadFile 强制 https/wss；据此精确定位，避免对图片数据误报。
const INSECURE_REQUEST_RE =
  /\b(?:wx|uni|Taro|wepy)\.(?:request|connectSocket|uploadFile|downloadFile)\s*\(\s*\{(?:[^{}]|\{[^{}]*\})*?\burl["'`]?\s*:\s*["'`](http|ws):\/\/([^"'`\s/?#]+)/g;
const PHONE_BTN_RE = /open-?type\s*=\s*["']getPhoneNumber["']/;
// 模板级隐私入口（JS 调用扫不到，须从模板属性/组件标签识别）：
const AVATAR_BTN_RE = /open-?type\s*=\s*["']chooseAvatar["']/; // 头像填写能力（收集头像 PII）
const CAMERA_TAG_RE = /<camera[\s/>]/;          // <camera> 组件 → 摄像头
const LIVE_PUSHER_TAG_RE = /<live-pusher[\s/>]/; // <live-pusher> 直播推流 → 摄像头 + 麦克风
const WEB_VIEW_TAG_RE = /<web-view[\s/>]/;       // <web-view> → 业务域名白名单（个人主体不支持）
// 疑似硬编码的微信密钥（AppSecret/商户密钥等后端专用）。捕获组只取键名，绝不记录密钥值。
const SECRET_RE = /\b(appsecret|app_secret|mch_?key|partner_?key|apiclient_key)\b\s*[:=]\s*["'`][^"'`]{6,}["'`]/gi;
// Taro 的 app.config.ts/js 是 TS/JS 模块（非 JSON），requiredPrivateInfos 以数组字面量声明。
const REQUIRED_PRIVATE_RE = /requiredPrivateInfos\s*:\s*\[([^\]]*)\]/;
const QUOTED_NAME_RE = /["'`]([a-zA-Z][a-zA-Z0-9]*)["'`]/g;
// R4（D2 拍板）：Taro 具名导入是摇树惯用法——import { getLocation } from "@tarojs/taro" 后直接
// getLocation() 调用，API_RE 的命名空间形式对其完全不可见（整类静默漏报）。把具名导入映射为 wx.* 事实；
// 导入未调用属罕见且报告本就是"待确认清单"，可接受的过近似。default-only 导入走 API_RE 原路径。
const TARO_IMPORT_RE = /import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*["']@tarojs\/taro["']/g;
// mpx 的 app.mpx 把应用配置放在内嵌的 <script type="application/json"> 块里（非独立 app.json）。
const MPX_JSON_BLOCK_RE = /<script[^>]*application\/json[^>]*>([\s\S]*?)<\/script>/i;
// 模板类单文件的 HTML/WXML 注释须在提取信号前剥离：注释掉的 <camera>/<web-view> 是调试遗留常态，
// 扫了会误报组件信号，注释里的域名也会污染白名单清单。顺序约束：须在 stripUniConditional 之后
// （uni 条件编译标记本身写在 <!-- #ifdef --> 里），在 stripComments 之前（注释里的撇号会破坏字符串跟踪）。
const TEMPLATE_EXT = new Set([".wxml", ".vue", ".uvue", ".nvue", ".mpx", ".wpy"]);
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

// ── R3（阶段4，D2 拍板）：正则字面量感知 ──
// 不识别正则会毒化字符串/注释跟踪：s.split(/"/) 让后续代码被当字符串吞掉、/\// 让行尾被当
// // 注释吞掉——同段真实隐私 API 调用静默消失，是合规工具最坏的失效模式（勘察实证）。
// 仅对纯 JS 扩展名启用（JS_EXT）：模板文件里 </view> 的 `/` 同样处于"表达式位置"，
// 启用会把闭合标签误判为正则、吞掉标签间内容；模板内嵌 script 保持旧行为（已知限制）。
const JS_EXT = new Set([".js", ".ts", ".jsx", ".tsx", ".mjs", ".wxs"]);
const REGEX_POS_KEYWORDS = new Set([
  "return", "typeof", "case", "in", "of", "new", "delete", "void", "do", "else", "instanceof", "yield", "await",
]);

/** 依据已产出的前文（注释/字符串已处理）判断当前 `/` 是否处于正则字面量位置（标准除号/正则启发式）。 */
function inRegexPosition(prev) {
  let k = prev.length - 1;
  while (k >= 0 && /\s/.test(prev[k])) k--;
  if (k < 0) return true; // 文件首
  const c = prev[k];
  if (c === ">") return prev[k - 1] === "="; // 箭头函数 => 后是正则位置；其余 > 按除号处理
  if (c === "<") return false;
  if (/[A-Za-z0-9_$)\]}]/.test(c)) {
    // 标识符/字面量/闭括号后是除号——但 return/typeof/case 等关键字后仍是正则位置
    const m = prev.slice(Math.max(0, k - 11), k + 1).match(/([A-Za-z_$][A-Za-z0-9_$]*)$/);
    if (!m || !REGEX_POS_KEYWORDS.has(m[1])) return false;
    const before = prev[k - m[1].length];
    return before === undefined || !/[A-Za-z0-9_$.]/.test(before);
  }
  return true; // 运算符/分隔符（= ( , : [ ! & | ? { ; 等）后 → 正则
}

/** 从 text[i]（`/`）扫过整个正则字面量（含字符类与 flags）。跨行/未闭合视为误判（除号），返回 -1。 */
function scanRegexLiteral(text, i) {
  const n = text.length;
  let k = i + 1;
  let inClass = false;
  let closed = false;
  for (; k < n; k++) {
    const c = text[k];
    if (c === "\\") { k++; continue; }
    if (c === "\n") return -1;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) { closed = true; k++; break; }
  }
  if (!closed) return -1;
  while (k < n && /[a-z]/i.test(text[k])) k++; // flags
  return k;
}

/**
 * 字符串感知地剥离 // 行注释与 / * * / 块注释，但完整保留字符串字面量内容
 * （含其中的 https:// 与 //）。这是可信度的关键：被注释掉的 wx.getLocation() 不应再触发
 * 隐私/域名预检；而朴素的「//→行尾」剥离会破坏 "https://x" 反而引入新错误，故必须感知字符串。
 * regexAware=true（仅 JS_EXT 文件）时额外识别并原样跳过正则字面量（R3）；
 * WXML/HTML 注释由 scanProject 对模板类文件先行剥离——
 * 对模板级信号（组件标签/属性）而言，注释掉的组件不剥会直接产生误报，不是"少剥一处"。
 */
export function stripComments(text, regexAware = false) {
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
    if (regexAware && c === "/" && inRegexPosition(out)) { // R3：正则字面量原样保留、整体跳过
      const end = scanRegexLiteral(text, i);
      if (end > 0) { out += text.slice(i, end); i = end; continue; }
    }
    if (c === '"' || c === "'" || c === "`") str = c; // 进入字符串
    out += c;
    i += 1;
  }
  return out;
}

/** 把字符串字面量内容置空但保留定界符——仅供 API 提取（API_RE）使用。
 *  已知取舍：模板字面量 ${} 插值里的真实调用会被一并置空（罕见写法，接受 FN 换取
 *  文案/日志引用 API 名这一常见场景不误报）。
 *  regexAware=true（仅 JS_EXT 文件）时整个正则字面量置为中性 token `0`（R3）——
 *  正则文本里的 API 名不是真实调用，且 `0` 保持后续 `/` 的除号语义与字面量后一致。 */
export function blankStrings(text, regexAware = false) {
  let out = "";
  let str = null; // 当前字符串定界符，null 表示不在字符串内
  for (let i = 0, n = text.length; i < n; ) {
    const c = text[i];
    if (str) {
      if (c === "\\") { i += 2; continue; } // 转义：连转义字符一起置空
      if (c === str) { out += c; str = null; }
      i += 1;
      continue;
    }
    if (regexAware && c === "/" && inRegexPosition(out)) { // R3
      const end = scanRegexLiteral(text, i);
      if (end > 0) { out += "0"; i = end; continue; }
    }
    if (c === '"' || c === "'" || c === "`") str = c;
    out += c;
    i += 1;
  }
  return out;
}

/** JSON 解析容错：微信开发者工具/HBuilderX 都容忍尾逗号，真实项目的 app.json/manifest.json 常见。
 *  只在标准 parse 失败后重试剥尾逗号——静默丢弃整份配置会让交叉核验反向断言「未声明」，
 *  产出 blocker 级误报（缺声明信号不是降级，是断言）。 */
function parseJsonLoose(text) {
  try { return JSON.parse(text); }
  catch { return JSON.parse(text.replace(/,\s*([}\]])/g, "$1")); }
}

// ── uni-app 条件编译（#ifdef/#ifndef/#endif）：编译到微信时只保留微信相关分支 ──
// 已知“非微信小程序”平台标记（编译到微信时这些 #ifdef 分支不参与）。
const NON_WEIXIN_PLATFORMS = new Set([
  "H5", "APP", "APP-PLUS", "APP-NVUE", "APP-PLUS-NVUE", "APP-VUE", "APP-HARMONY", "APP-ANDROID", "APP-IOS",
  "MP-ALIPAY", "MP-BAIDU", "MP-TOUTIAO", "MP-LARK", "MP-QQ", "MP-KUAISHOU", "MP-JD", "MP-360", "MP-XHS",
  "QUICKAPP-WEBVIEW", "QUICKAPP-WEBVIEW-UNION", "QUICKAPP-WEBVIEW-HUAWEI",
]);
const WEIXIN_TOKENS = new Set(["MP-WEIXIN", "MP"]); // MP = 所有小程序端，含微信
const condTokens = (expr) => expr.split("||").map((t) => t.trim().toUpperCase()).filter(Boolean);
// #ifdef expr：仅当所有 token 都是“非微信平台”时才剔除（含非平台标记如 VUE3/VUE2 则保留，因无法判定版本）。
const ifdefStrips = (expr) => { const ts = condTokens(expr); return ts.length > 0 && ts.every((t) => NON_WEIXIN_PLATFORMS.has(t)); };
// #ifndef expr：当 expr 指向微信（MP-WEIXIN/MP）时，这个“非微信”分支剔除。
const ifndefStrips = (expr) => condTokens(expr).some((t) => WEIXIN_TOKENS.has(t));
const COND_LINE_RE = /^\s*(?:\/\/|<!--|\/\*|#)\s*#(ifdef|ifndef|endif)\b([^\n]*?)\s*(?:-->|\*\/)?\s*$/;

/** 剔除 uni-app 中不参与微信小程序编译的条件分支（H5 / APP / 其它小程序端）。
 *  必须在 stripComments 之前对原文执行——条件编译标记本身是注释，会被 stripComments 抹掉。 */
export function stripUniConditional(text) {
  if (!/#if(?:n)?def\b/.test(text)) return text; // 无条件编译标记，快路径原样返回
  const out = [];
  const keepStack = []; // 每层是否保留；嵌套时全部为真才输出
  const kept = () => keepStack.every(Boolean);
  for (const line of text.split("\n")) {
    const m = line.match(COND_LINE_RE);
    if (m) {
      if (m[1] === "endif") { keepStack.pop(); continue; }
      const expr = m[2].replace(/-->|\*\//g, "").trim();
      const strip = m[1] === "ifdef" ? ifdefStrips(expr) : ifndefStrips(expr);
      keepStack.push(!strip);
      continue; // 标记行本身不输出
    }
    if (kept()) out.push(line);
  }
  return out.join("\n");
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


/** 配置载体判定：这些文件承载隐私声明/权限配置，其读取或解析失败必须显性记录（V3）。 */
const isConfigCarrier = (base) =>
  base === "app.json" || base === "manifest.json" || base === "app.mpx" || /^app\.config\.[jt]sx?$/.test(base);

/**
 * 单文件事实提取（R1/FX-05 拆分）：按序剥离（uni 条件编译 → 模板 HTML 注释 → JS 注释）后，
 * 提取 API 调用、域名、明文/动态请求、模板级隐私信号、密钥键名，累加进 facts。
 * 返回剥离后的 code，供配置载体解析复用（JSONC 注释已剥）。
 */
function extractFacts(file, text, rel, facts) {
  // 先剔除 uni-app 非微信端的条件编译分支，模板类文件再剥 HTML 注释，之后剥 JS 注释，最后在结果上提取事实。
  const regexAware = JS_EXT.has(extname(file)); // R3：正则字面量感知仅对纯 JS 文件启用（模板见 JS_EXT 注释）
  let code = stripUniConditional(text);
  if (TEMPLATE_EXT.has(extname(file))) code = code.replace(HTML_COMMENT_RE, "");
  code = stripComments(code, regexAware);
  // API 提取用字符串置空副本：日志/文案里引用的 "wx.getLocation" 不是真实调用；
  // 其余提取（URL/密钥/模板属性/配置解析）都依赖字符串内容，必须继续用原文本。
  for (const m of blankStrings(code, regexAware).matchAll(API_RE)) facts.apis.add(`${m[1]}.${m[2]}`);
  // R4：Taro 具名导入 → wx.* 等价事实（在字符串未置空的 code 上匹配，模块名是字符串字面量）。
  if (regexAware) {
    for (const m of code.matchAll(TARO_IMPORT_RE)) {
      for (const entry of m[1].split(",")) {
        const name = entry.split(/\s+as\s+/)[0].trim();
        if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) facts.apis.add(`wx.${name}`);
      }
    }
  }
  for (const m of code.matchAll(URL_RE)) {
    const host = normalizeHost(m[3]); // 去端口/userinfo，防止绕过精确匹配的安全核验
    if (!isPlausibleHost(host)) continue; // 跳过 `${host}` 等模板占位/非法 host 噪声
    facts.domains.add(host);
  }
  // 明文请求：仅取请求 API 调用里 url: 的 http/ws（不含媒体 src、navigator/href、mock 数据的 url 字段）
  for (const m of code.matchAll(INSECURE_REQUEST_RE)) {
    const host = normalizeHost(m[2]);
    if (isPlausibleHost(host)) facts.insecureHosts.add(host);
  }
  if (REQUEST_DYNAMIC_RE.test(code)) facts.dynamicRequest = true;
  if (PHONE_BTN_RE.test(code)) facts.configKeys.add("button.open-type=getPhoneNumber");
  if (AVATAR_BTN_RE.test(code)) facts.configKeys.add("button.open-type=chooseAvatar");
  if (CAMERA_TAG_RE.test(code)) facts.configKeys.add("component.camera");
  if (LIVE_PUSHER_TAG_RE.test(code)) facts.configKeys.add("component.live-pusher");
  if (WEB_VIEW_TAG_RE.test(code)) facts.configKeys.add("component.web-view");
  // 只取键名（m[1]）与相对路径，永不读取/记录密钥值本身。
  for (const m of code.matchAll(SECRET_RE)) facts.secretHints.add(`${rel}::${m[1].toLowerCase()}`);
  return code;
}

/**
 * 配置载体解析（R1/FX-05 拆分）：原生 app.json 根级 / uni-app manifest.json 的 mp-weixin 块
 * （常为 JSONC，入参 code 已剥注释）/ Taro app.config.*（模块非 JSON，正则抽取）/
 * mpx app.mpx（内嵌 application/json 块），统一为 app.json:* 逻辑配置键；解析失败记入 configErrors（V3）。
 */
function parseAppConfig(base, code, rel, facts) {
  if (base === "app.json" || base === "manifest.json") {
    try {
      const conf = parseJsonLoose(code);
      const mp = base === "manifest.json" ? conf["mp-weixin"] || {} : conf;
      if (mp.requiredPrivateInfos) {
        for (const k of mp.requiredPrivateInfos) facts.configKeys.add(`app.json:requiredPrivateInfos:${k}`);
      }
      if (mp.permission) {
        for (const k of Object.keys(mp.permission)) facts.configKeys.add(`app.json:permission:${k}`);
      }
    } catch { facts.configErrors.push({ file: rel, reason: "解析失败（尾逗号容错后仍非法）" }); } // V3：记录而非静默
  } else if (/^app\.config\.[jt]sx?$/.test(base)) {
    // Taro：app.config.ts/js 是模块而非 JSON，正则抽取 requiredPrivateInfos 数组里的接口名。
    const m = code.match(REQUIRED_PRIVATE_RE);
    if (m) {
      for (const q of m[1].matchAll(QUOTED_NAME_RE)) facts.configKeys.add(`app.json:requiredPrivateInfos:${q[1]}`);
    } else if (code.includes("requiredPrivateInfos")) {
      // R4（阶段2复核 NOTE）：声明存在但非数组字面量（变量/展开）——提取不到 ≠ 未声明，
      // 静默降级会让一致性核验反向产出 blocker 误报（与 V3 同一原则）。
      facts.configErrors.push({ file: rel, reason: "requiredPrivateInfos 非数组字面量，无法静态提取" });
    }
  } else if (base === "app.mpx") {
    // mpx：应用配置在 app.mpx 内嵌的 <script type="application/json"> 块里，提取后按 JSON 解析。
    const block = code.match(MPX_JSON_BLOCK_RE);
    if (!block && /application\/json/i.test(code)) {
      // R4（阶段2复核 NOTE）：存在 application/json 迹象但块无法定位（标签畸形）——同上，记录而非静默。
      facts.configErrors.push({ file: rel, reason: "内嵌 application/json 配置块无法定位" });
    }
    if (block) {
      try {
        const conf = parseJsonLoose(block[1]);
        if (conf.requiredPrivateInfos) {
          for (const k of conf.requiredPrivateInfos) facts.configKeys.add(`app.json:requiredPrivateInfos:${k}`);
        }
        if (conf.permission) {
          for (const k of Object.keys(conf.permission)) facts.configKeys.add(`app.json:permission:${k}`);
        }
      } catch { facts.configErrors.push({ file: rel, reason: "内嵌配置块解析失败" }); } // V3：记录而非静默
    }
  }
}

/**
 * 扫描一个小程序项目目录（R1/FX-05 后只负责编排：walk 边界 → 逐文件事实提取 → 配置解析 → 汇总）。
 * @returns {{ filesScanned:number, apis:string[], domains:string[], dynamicRequest:boolean, configKeys:string[] }}
 */
export function scanProject(dir) {
  const facts = {
    apis: new Set(),
    domains: new Set(),
    configKeys: new Set(),
    secretHints: new Set(), // "相对路径::键名"，去重；绝不含密钥值
    insecureHosts: new Set(), // 用了明文 http/ws 的域名
    // V3：配置载体读取或解析失败必须显性记录——静默丢弃会让一致性核验反向断言「未声明」，
    // 产出 blocker 级误报（本文件自己的设计注释早已预言）。
    configErrors: [],
    dynamicRequest: false,
  };
  let filesScanned = 0;
  let skippedLargeFiles = 0;
  let truncated = false;
  const walkStats = { skippedDirs: 0 }; // B3：拒权跳过的子目录数——未覆盖面必须可见
  // B5：相对路径统一净化——控制字符/反引号可借恶意文件名注入 markdown/提示词到报告与 MCP 文本。
  const relSafe = (f) => relative(dir, f).replace(/\\/g, "/").replace(/[\u0000-\u001f\u007f`]/g, "?");

  for (const { file, size } of walk(dir, 0, walkStats)) {
    if (filesScanned >= MAX_FILES) { truncated = true; break; } // B2：截断而非无限吃内存/时间
    if (size > MAX_FILE_BYTES) { skippedLargeFiles++; continue; } // B2：超大文件跳过并计数
    let text;
    try { text = readFileSync(file, "utf-8"); }
    catch {
      if (isConfigCarrier(basename(file)))
        facts.configErrors.push({ file: relSafe(file), reason: "读取失败" });
      continue;
    }
    filesScanned++;
    const rel = relSafe(file);
    const code = extractFacts(file, text, rel, facts);
    parseAppConfig(basename(file), code, rel, facts);
  }

  return {
    filesScanned,
    skippedLargeFiles,
    skippedDirs: walkStats.skippedDirs,
    truncated,
    apis: [...facts.apis].sort(),
    domains: [...facts.domains].sort(),
    dynamicRequest: facts.dynamicRequest,
    configKeys: [...facts.configKeys].sort(),
    configErrors: facts.configErrors,
    secretHints: [...facts.secretHints].sort().map((s) => {
      const [file, key] = s.split("::");
      return { file, key };
    }),
    insecureHosts: [...facts.insecureHosts].sort(),
  };
}

// 供测试直接验证纯函数；_extractFacts/_parseAppConfig 供直测（FX-17 同理，防重构静默回归）。
export {
  stripComments as _stripComments,
  normalizeHost as _normalizeHost,
  extractFacts as _extractFacts,
  parseAppConfig as _parseAppConfig,
};
