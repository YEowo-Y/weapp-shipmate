// src/cli.mjs —— 命令行入口（零运行时依赖的参数解析与分发）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SUBJECT_ENUM } from "./data.mjs";
import { runCheck } from "./check.mjs";
import { runGuide } from "./guide.mjs";
import { runExplain } from "./explain.mjs";
import { interviewGuide } from "./guide-interview.mjs";
import { render } from "./report.mjs";
import { readCliConfig } from "./cli-config.mjs";
import { assertBaselineOutputSize, hashBaselineRules, readCliBaseline, withCliBaseline } from "./cli-baseline.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;

const HELP = `weapp-shipmate · 你写代码，我陪你上线

用法：
  weapp-shipmate check [目录] [选项]   代码感知预检：扫描源码 → 个性化上线清单
  weapp-shipmate guide [选项]          上线流程导航：按已知事实生成阶段清单
  weapp-shipmate explain <反馈|关键词>  拒因反查：审核反馈/关键词 → 对应规则 + 官方原文 + 修复步骤

选项：
  --subject <personal|individual_business|enterprise>   主体类型（也支持：个人 / 个体户 / 个体工商户 / 企业）
  --config <file>       仅 check/guide：显式加载 JSON v1 配置，命令行值优先
  --evidence            仅 check：与 --json --json-version 1 同用，附来源位置与证据状态
  --baseline-snapshot   仅 check：与 --evidence --json --json-version 1 同用，输出基线快照
  --baseline <file>     仅 check：与 --evidence --json --json-version 1 同用，比对本地快照
  --json                输出 JSON（默认 Markdown）
  --json-version 1      与 --json 同用，增加 schemaVersion: 1；不能与 --checklist 同用
  --fail-on <level>     仅 check：blocker | warning | info | none；按展示过滤前的发现项判定
                        命中阈值退出 2，错误退出 1；退出 0 表示未触发阈值，扫描限制见报告
  --checklist           输出可勾选清单（待办动作与检查限制，便于粘进任务清单/issue）
  --include-drafts      包含未核验来源的 draft 规则（默认排除）
  --blockers-only       只输出阻断项（severity=blocker），快速聚焦上线拦路项
  --help, -h            显示帮助
  --version, -v         显示版本

guide 额外输入（未提供 = 未知；正向开关 = 是，--no- 开关 = 明确否）：
  --payment             涉及支付
  --sensitive           收集敏感信息（手机号/位置/头像等）
  --domain              有自有服务器域名
  --no-payment          明确不涉及支付
  --no-sensitive        明确不收集敏感信息
  --no-domain           明确没有自有服务器域名
  --business <type>     业务类型
  --interactive         交互问答补齐未知事实（仅终端，不能与 --json 同用）
  --no-interactive      禁用问答；无选项 guide 仅在输入输出均为终端时自动问答
  payment / business 仅用于提示，不参与规则筛选；正反开关不能同时使用。

示例：
  weapp-shipmate check ./my-app --subject personal
  weapp-shipmate guide --subject personal --sensitive --domain
  weapp-shipmate explain 诱导分享
  weapp-shipmate explain "您的小程序存在营销广告用途"

注意：本工具只给"待你确认"的导航建议，不代办、不做合规担保。`;

const SUBJECT_ALIASES = new Map([["个人", "personal"], ["个体户", "individual_business"], ["个体工商户", "individual_business"], ["企业", "enterprise"]]);
const TOGGLE_FLAGS = new Set(["payment", "sensitive", "domain", "interactive"]);

const VALUE_FLAGS = new Set(["subject", "business", "fail-on", "json-version", "config", "baseline"]);
const FAIL_LEVELS = {
  blocker: ["blocker"],
  warning: ["blocker", "warning"],
  info: ["blocker", "warning", "info"],
  none: [],
};
const BOOL_FLAGS = new Set(["evidence", "baseline-snapshot", "json", "checklist", "include-drafts", "blockers-only", "help", "version"]);

// FX-16：未知/拼错选项必须报错——静默忽略会让 `--subjcet personal` 这类笔误
// 产出主体维度错误却看起来正常的报告，比报错更糟。同时支持 --key=value 写法（CLI 常见习惯）。
export function parseFlags(args) {
  const f = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      // V5（FX-16 残余）：单横杠 token 是选项笔误（-json / -subject），静默当位置参数
      // 会对错误口径产出看起来正常的报告。例外：-h / -v 是通用缩写，按全称处理；裸 "-" 保持位置参数。
      if (a.startsWith("-") && a.length > 1) {
        if (a === "-h") { f.help = true; continue; }
        if (a === "-v") { f.version = true; continue; }
        (f._unknown ??= []).push(a);
        continue;
      }
      f._.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (VALUE_FLAGS.has(key)) {
      if (["fail-on", "json-version", "config", "baseline"].includes(key) && Object.hasOwn(f, key))
        (f._duplicates ??= []).push(key);
      if (eq !== -1) f[key] = a.slice(eq + 1);
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith("--")) f[key] = args[++i];
      else f[key] = undefined; // 缺值：留给 main 报「缺少取值」，不吞下一个 flag
      if (f[key] === undefined || !f[key].trim()) (f._missing ??= []).push(key);
      continue;
    }
    const fact = key.startsWith("no-") ? key.slice(3) : key;
    if (TOGGLE_FLAGS.has(fact) && eq === -1) {
      const value = !key.startsWith("no-");
      if (fact in f && f[fact] !== value) (f._conflicts ??= []).push(fact);
      f[fact] = value;
      continue;
    }
    if (BOOL_FLAGS.has(key) && eq === -1) {
      if (["evidence", "baseline-snapshot"].includes(key) && Object.hasOwn(f, key)) (f._duplicates ??= []).push(key);
      f[key] = true; continue;
    }
    (f._unknown ??= []).push(a); // 含布尔开关误带 =值 的写法
  }
  return f;
}

function configuredFlags(flags, command, context) {
  if (!Object.hasOwn(flags, "config")) return flags;
  if (!["check", "guide"].includes(command))
    throw new Error("--config 仅用于 check / guide。");
  if (flags._duplicates?.includes("config"))
    throw new Error("--config 不能重复指定。");
  if (flags._missing?.length)
    throw new Error(`选项缺少取值：${[...new Set(flags._missing)].map(key => "--" + key).join("、")}`);
  context.config ??= readCliConfig(flags.config);
  const defaults = { ...context.config[command] };
  if (Object.hasOwn(defaults, "failOn")) {
    defaults["fail-on"] = defaults.failOn;
    delete defaults.failOn;
  }
  return { ...defaults, ...flags };
}

/** @returns {number} 进程退出码 */
export function main(argv = process.argv, out = process.stdout, err = process.stderr) {
  return executeMain(argv, out, err, {});
}

// One context per invocation: interactive validation and replay share the same configuration.
function executeMain(argv, out, err, context) {
  const args = argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") { out.write(HELP + "\n"); return 0; }
  if (cmd === "--version" || cmd === "-v") { out.write(VERSION + "\n"); return 0; }

  let flags = parseFlags(args.slice(1));
  if (flags._unknown?.length) {
    err.write(`无法识别的选项：${flags._unknown.join("、")}\n用 \`weapp-shipmate --help\` 查看可用选项。\n`);
    return 1;
  }
  if (flags._conflicts?.length) {
    err.write(`选项冲突：${[...new Set(flags._conflicts)].map(fact => `--${fact} 与 --no-${fact}`).join("、")}不能同时使用。\n`);
    return 1;
  }
  if (SUBJECT_ALIASES.has(flags.subject)) flags.subject = SUBJECT_ALIASES.get(flags.subject);
  if (flags.help) { out.write(HELP + "\n"); return 0; }
  if (flags.version) { out.write(VERSION + "\n"); return 0; }
  try { flags = configuredFlags(flags, cmd, context); }
  catch (error) { err.write(`${error.message}\n`); return 1; }
  // FX-06：非法主体必须报错退出。静默接受会让主体专属规则全部跳过（check.mjs 按 subject 过滤），
  // 产出"已合规"假象——与 mcp.mjs 的 inputSchema enum 行为对齐。缺值与非法值分开报，不泄漏 undefined。
  if ("subject" in flags && !SUBJECT_ENUM.includes(flags.subject)) {
    const what = flags.subject === undefined ? "--subject 缺少取值" : `非法 --subject：${flags.subject}`;
    err.write(`${what}\n可选值：${SUBJECT_ENUM.join(" | ")}\n`);
    return 1;
  }
  if ("interactive" in flags && cmd !== "guide") {
    err.write("--interactive / --no-interactive 仅用于 guide。\n");
    return 1;
  }
  if (flags._duplicates?.length) {
    err.write(`选项不能重复：${[...new Set(flags._duplicates)].map(key => "--" + key).join("、")}\n`);
    return 1;
  }
  const failOn = flags["fail-on"];
  if (Object.hasOwn(flags, "fail-on") && (cmd !== "check" || !Object.hasOwn(FAIL_LEVELS, failOn))) {
    err.write("--fail-on 仅用于 check，必须指定 blocker | warning | info | none。\n");
    return 1;
  }
  if (Object.hasOwn(flags, "json-version") &&
      (flags["json-version"] !== "1" || !flags.json || flags.checklist)) {
    err.write("--json-version 仅支持 1，必须与 --json 同用，且不能与 --checklist 同用。\n");
    return 1;
  }
  if (flags.evidence && (cmd !== "check" || !flags.json || flags["json-version"] !== "1" || flags.checklist)) {
    err.write("--evidence 仅用于 check，必须与 --json --json-version 1 同用，且不能与 --checklist 同用。\n");
    return 1;
  }
  const hasBaseline = Object.hasOwn(flags, "baseline");
  const baselineSnapshot = flags["baseline-snapshot"] === true;
  const baselineRequested = hasBaseline || baselineSnapshot;
  if (baselineRequested) {
    if (hasBaseline && !flags.baseline?.trim()) {
      err.write("--baseline 缺少文件路径。\n");
      return 1;
    }
    if (hasBaseline && baselineSnapshot) {
      err.write("--baseline 与 --baseline-snapshot 不能同时使用。\n");
      return 1;
    }
    if (cmd !== "check" || !flags.evidence || flags["blockers-only"]) {
      err.write("基线选项仅用于 check --evidence --json --json-version 1，不能与 --blockers-only 或 --checklist 同用。\n");
      return 1;
    }
  }
  const format = flags.json ? "json" : flags.checklist ? "checklist" : "markdown";
  const includeDrafts = !!flags["include-drafts"];
  const blockersOnly = !!flags["blockers-only"];
  let hiddenNonBlockerCount = 0;
  const writeReport = (result) => {
    const output = flags["json-version"] === "1" ? { ...result, schemaVersion: 1 } : result;
    const rendered = render(output, format, { hiddenNonBlockerCount }) + "\n";
    if (baselineSnapshot) assertBaselineOutputSize(rendered);
    out.write(rendered);
  };
  // 聚焦模式覆盖所有可渲染规则集合；摘要/派生备注也必须使用过滤后的计数，
  // 否则 JSON 会一边只展示 blocker，一边声称命中了已隐藏的 warning/info。
  const focus = (result) => {
    if (!blockersOnly) return result;
    // 聚焦规则不应隐藏扫描限制；guide 的业务自查提示仍随对应规则过滤。
    if (result.command === "check")
      result.notes = [...new Set([...result.notes, ...result.items
        .filter(item => item.severity !== "blocker" && item.note)
        .map(item => item.note)])];
    hiddenNonBlockerCount = result.items.filter((i) => i.severity !== "blocker").length;
    if (Array.isArray(result.selfCheck))
      hiddenNonBlockerCount += result.selfCheck.filter((i) => i.severity !== "blocker").length;
    result.items = result.items.filter((i) => i.severity === "blocker");
    if (Array.isArray(result.selfCheck))
      result.selfCheck = result.selfCheck.filter((i) => i.severity === "blocker");

    if (result.command === "check") {
      result.meta.summary = result.meta.summary.replace(
        /命中 \d+ 条规则。$/,
        `命中 ${result.items.length} 条阻断规则（仅显示 blocker）。`,
      );
    } else if (result.command === "guide") {
      const visibleCount = result.items.length + (result.selfCheck?.length || 0);
      result.meta.summary = `${result.meta.summary} 当前仅显示 ${visibleCount} 条阻断项。`;
      result.notes = result.notes.filter((note) => !/^另有 \d+ 条规则是否适用/.test(note));
      if (result.selfCheck?.length)
        result.notes.push(
          `另有 ${result.selfCheck.length} 条阻断规则是否适用取决于你的具体功能，已列入『可能适用 · 请按业务自查』。`,
        );
    } else if (result.command === "explain") {
      const rejectCount = new Set(result.items.map((item) => item.rejectId)).size;
      result.meta.summary =
        `为「${result.meta.query}」匹配到 ${rejectCount} 条含阻断规则的相关拒审原因，` +
        `对应 ${result.items.length} 条阻断规则（仅显示 blocker）。`;
    }
    return result;
  };

  try {
    if (cmd === "check") {
      // V5：多余位置参数是笔误（漏写 -- 或多贴了路径），静默只取第一个会对错误目标产出正常报告。
      if (flags._.length > 1) {
        err.write(`多余的位置参数：${flags._.slice(1).join("、")}\ncheck 只接受一个目录参数。\n`);
        return 1;
      }
      const dir = flags._[0] || ".";
      const previous = hasBaseline ? readCliBaseline(flags.baseline) : undefined;
      let rulesHash;
      const result = runCheck(dir, {
        subjectType: flags.subject,
        includeDrafts,
        evidence: !!flags.evidence,
        onRules: baselineRequested ? rules => { rulesHash = hashBaselineRules(rules); } : undefined,
      });
      const levels = FAIL_LEVELS[failOn ?? "blocker"];
      const failures = result.items.filter(item => levels.includes(item.severity)).length;
      const report = baselineRequested
        ? withCliBaseline(result, { cliVersion: VERSION, subject: flags.subject ?? null, includeDrafts, rulesHash }, previous)
        : result;
      writeReport(focus(report));
      if (failOn !== undefined && failures)
        err.write(`--fail-on ${failOn} 命中 ${failures} 项。\n`);
      return failures ? 2 : 0;
    }
    if (cmd === "guide") {
      // V5：guide 无位置参数语义；静默忽略会让 `guide personal`（漏写 --subject）看似生效。
      if (flags._.length > 0) {
        err.write(`guide 不接受位置参数：${flags._.join("、")}\n请用 --subject / --business 等选项传入。\n`);
        return 1;
      }
      const inputs = {
        subject_type: flags.subject,
        business_type: flags.business,
        has_payment: flags.payment,
        collects_sensitive: flags.sensitive,
        has_server_domain: flags.domain,
      };
      const result = focus(runGuide(inputs, { includeDrafts }));
      writeReport(result);
      return 0;
    }
    if (cmd === "explain") {
      const query = flags._.join(" ").trim();
      if (!query) {
        err.write("用法：weapp-shipmate explain <审核反馈或关键词>\n例如：weapp-shipmate explain 诱导分享\n");
        return 1;
      }
      // explain 是信息查询而非上线门禁，不返回阻断退出码。
      const result = focus(runExplain(query, { includeDrafts }));
      writeReport(result);
      return 0;
    }
  } catch (e) {
    const directoryErrors = {
      ENOENT: "目录不存在，请核对路径拼写，并选择实际的小程序源码目录。",
      ENOTDIR: "指定路径不是目录，请选择项目文件夹，而不是单个文件。",
      EACCES: "没有权限读取目录，请确认当前账号有读取权限后重试。",
      EPERM: "无法访问目录，请检查读取权限或文件占用后重试。",
    };
    if (cmd === "check" && e.syscall === "scandir" && directoryErrors[e.code])
      err.write(`错误：${directoryErrors[e.code]}\n路径：${e.path || flags._[0] || "."}\n`);
    else err.write(`错误：${e.message}\n`);
    return 1;
  }

  err.write(`未知命令：${cmd}\n用 \`weapp-shipmate --help\` 查看用法。\n`);
  return 1;
}

/** 异步终端入口；main 保持同步，供现有脚本/内嵌消费者使用。 */
export async function runCLI(argv = process.argv, out = process.stdout, err = process.stderr, {
  input = process.stdin, interview = interviewGuide,
} = {}) {
  const args = argv.slice(2);
  let flags = parseFlags(args.slice(1));
  const context = {};
  const tty = !!input.isTTY && !!out.isTTY;
  const interactive = flags.interactive === true || (args.length === 1 && tty);
  if (args[0] !== "guide" || flags.help || flags.version || !interactive)
    return main(argv, out, err);

  // 先走同一参数校验路径；暂不输出报告，避免问答中断时留下部分结果。
  const status = executeMain(argv, { write() {} }, err, context);
  if (status !== 0) return status;
  flags = configuredFlags(flags, args[0], context);
  if (!tty || flags.json) {
    err.write("交互问答需要输入和输出均为终端，且不能与 --json 同用；请改用参数或 --no-interactive。\n");
    return 1;
  }
  const facts = {};
  if (flags.subject !== undefined) facts.subject = SUBJECT_ALIASES.get(flags.subject) || flags.subject;
  for (const key of ["sensitive", "domain"]) if (flags[key] !== undefined) facts[key] = flags[key];
  let answered;
  try {
    answered = await interview(facts, { input, output: out });
  } catch (error) {
    err.write("问答已取消或输入已结束，未生成报告。\n");
    return error.exitCode === 130 ? 130 : 1;
  }
  const replay = args.filter(arg => arg !== "--interactive" && arg !== "--no-interactive");
  replay.splice(1, 0, "--no-interactive");
  for (const key of ["subject", "sensitive", "domain"]) {
    if (flags[key] !== undefined || answered[key] === undefined) continue;
    if (key === "subject") replay.push("--subject", answered[key]);
    else replay.push(answered[key] ? `--${key}` : `--no-${key}`);
  }
  const code = executeMain([...argv.slice(0, 2), ...replay], out, err, context);
  if (code === 0) {
    // Windows 默认 PowerShell；POSIX 使用单引号转义，保留业务描述等原始参数。
    const quote = value => /^[\w./:=-]+$/.test(value) ? value
      : process.platform === "win32" ? `'${value.replaceAll("'", "''")}'`
        : `'${value.replaceAll("'", "'\"'\"'")}'`;
    if (Object.hasOwn(flags, "config")) out.write("\n此命令依赖配置文件当时的内容。\n");
    out.write(`\n可复现命令（${process.platform === "win32" ? "PowerShell" : "Shell"}）：\nweapp-shipmate ${replay.map(quote).join(" ")}\n`);
  }
  return code;
}
