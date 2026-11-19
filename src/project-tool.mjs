import { runProjectTool } from "./project-artifact.mjs";
import { serializeProjectToolResult } from "./project-evidence.mjs";

try {
  const [kind, input, ...extra] = process.argv.slice(2);
  if (extra.length || !input) throw new Error("需要工具名称和一个 JSON 参数");
  const request = JSON.parse(input);
  const result = runProjectTool(kind, request, { includePreflightEvidence: request?.includePreflightEvidence === true });
  process.stdout.write(serializeProjectToolResult(result));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
