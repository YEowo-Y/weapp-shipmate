import { runProjectTool } from "./project-artifact.mjs";

try {
  const [kind, input, ...extra] = process.argv.slice(2);
  if (extra.length || !input) throw new Error("需要工具名称和一个 JSON 参数");
  process.stdout.write(JSON.stringify(runProjectTool(kind, JSON.parse(input))));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
