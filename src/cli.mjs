// src/cli.mjs —— 命令行入口（零运行时依赖的参数解析与分发）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCheck } from "./check.mjs";
import { runGuide } from "./guide.mjs";
import { render } from "./report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version;

const HELP = `weapp-shipmate · 你写代码，我陪你上线

用法：
  weapp-shipmate check [目录] [选项]   代码感知预检：扫描源码 → 个性化上线清单
  weapp-shipmate guide [选项]          上线流程导航：你在哪一步、下一步做什么

选项：
  --subject <personal|individual_business|enterprise>   主体类型
  --json                输出 JSON（默认 Markdown）
  --include-drafts      包含未核验来源的 draft 规则（默认排除）
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

注意：本工具只给"待你确认"的导航建议，不代办、不做合规担保。`;

const VALUE_FLAGS = new Set(["subject", "business"]);

export function parseFlags(args) {
  const f = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (VALUE_FLAGS.has(key)) f[key] = args[++i];
      else f[key] = true;
    } else f._.push(a);
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
  const format = flags.json ? "json" : "markdown";
  const includeDrafts = !!flags["include-drafts"];

  try {
    if (cmd === "check") {
      const dir = flags._[0] || ".";
      const result = runCheck(dir, { subjectType: flags.subject, includeDrafts });
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
      const result = runGuide(inputs, { includeDrafts });
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
