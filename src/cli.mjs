// src/cli.mjs —— 命令行入口（零运行时依赖的参数解析与分发）
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

const HELP = `weapp-shipmate · 你写代码，我陪你上线

用法：
  weapp-shipmate check [目录] [选项]   代码感知预检：扫描源码 → 个性化上线清单
  weapp-shipmate guide [选项]          上线流程导航：你在哪一步、下一步做什么
  weapp-shipmate explain <反馈|关键词>  拒因反查：审核反馈/关键词 → 对应规则 + 官方原文 + 修复步骤

选项：
  --subject <personal|individual_business|enterprise>   主体类型
  --json                输出 JSON（默认 Markdown）
  --checklist           输出可勾选清单（只列待办动作，便于粘进任务清单/issue）
  --include-drafts      包含未核验来源的 draft 规则（默认排除）
  --blockers-only       只输出阻断项（severity=blocker），快速聚焦上线拦路项
  --help, -h            显示帮助
  --version, -v         显示版本

guide 额外输入（布尔开关，出现即为 true）：
  --payment             涉及支付
  --sensitive           收集敏感信息（手机号/位置/头像等）
  --domain              有自有服务器域名
  --business <type>     业务类型

示例：
  weapp-shipmate check ./my-app --subject personal
  weapp-shipmate guide --subject personal --sensitive --domain
  weapp-shipmate explain 诱导分享
  weapp-shipmate explain "您的小程序存在营销广告用途"

注意：本工具只给"待你确认"的导航建议，不代办、不做合规担保。`;

const VALUE_FLAGS = new Set(["subject", "business"]);
const BOOL_FLAGS = new Set(["json", "checklist", "include-drafts", "blockers-only", "help", "version", "payment", "sensitive", "domain"]);

// FX-16：未知/拼错选项必须报错——静默忽略会让 `--subjcet personal` 这类笔误
// 产出主体维度错误却看起来正常的报告，比报错更糟。同时支持 --key=value 写法（CLI 常见习惯）。
export function parseFlags(args) {
  const f = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) { f._.push(a); continue; }
    const eq = a.indexOf("=");
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (VALUE_FLAGS.has(key)) {
      if (eq !== -1) f[key] = a.slice(eq + 1);
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith("--")) f[key] = args[++i];
      else f[key] = undefined; // 缺值：留给 main 报「缺少取值」，不吞下一个 flag
      continue;
    }
    if (BOOL_FLAGS.has(key) && eq === -1) { f[key] = true; continue; }
    (f._unknown ??= []).push(a); // 含布尔开关误带 =值 的写法
  }
  return f;
}

/** @returns {number} 进程退出码 */
export function main(argv = process.argv, out = process.stdout, err = process.stderr) {
  const args = argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") { out.write(HELP + "\n"); return 0; }
  if (cmd === "--version" || cmd === "-v") { out.write(VERSION + "\n"); return 0; }

  const flags = parseFlags(args.slice(1));
  if (flags._unknown?.length) {
    err.write(`无法识别的选项：${flags._unknown.join("、")}\n用 \`weapp-shipmate --help\` 查看可用选项。\n`);
    return 1;
  }
  if (flags.help) { out.write(HELP + "\n"); return 0; }
  if (flags.version) { out.write(VERSION + "\n"); return 0; }
  // FX-06：非法主体必须报错退出。静默接受会让主体专属规则全部跳过（check.mjs 按 subject 过滤），
  // 产出"已合规"假象——与 mcp.mjs 的 inputSchema enum 行为对齐。缺值与非法值分开报，不泄漏 undefined。
  if ("subject" in flags && !SUBJECT_ENUM.includes(flags.subject)) {
    const what = flags.subject === undefined ? "--subject 缺少取值" : `非法 --subject：${flags.subject}`;
    err.write(`${what}\n可选值：${SUBJECT_ENUM.join(" | ")}\n`);
    return 1;
  }
  const format = flags.json ? "json" : flags.checklist ? "checklist" : "markdown";
  const includeDrafts = !!flags["include-drafts"];
  const blockersOnly = !!flags["blockers-only"];
  // 仅过滤展示用的 items；阻断退出码仍按过滤后的结果判定（无阻断则 0）。
  const focus = (result) => {
    if (blockersOnly) result.items = result.items.filter((i) => i.severity === "blocker");
    return result;
  };

  try {
    if (cmd === "check") {
      const dir = flags._[0] || ".";
      const result = focus(runCheck(dir, { subjectType: flags.subject, includeDrafts }));
      out.write(render(result, format) + "\n");
      return result.items.some((i) => i.severity === "blocker") ? 2 : 0;
    }
    if (cmd === "guide") {
      const inputs = {
        subject_type: flags.subject,
        business_type: flags.business,
        has_payment: !!flags.payment,
        collects_sensitive: !!flags.sensitive,
        has_server_domain: !!flags.domain,
      };
      const result = focus(runGuide(inputs, { includeDrafts }));
      out.write(render(result, format) + "\n");
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
      out.write(render(result, format) + "\n");
      return 0;
    }
  } catch (e) {
    err.write(`错误：${e.message}\n`);
    return 1;
  }

  err.write(`未知命令：${cmd}\n用 \`weapp-shipmate --help\` 查看用法。\n`);
  return 1;
}
