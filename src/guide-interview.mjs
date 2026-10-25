import { createInterface as createReadlineInterface } from "node:readline/promises";

const SUBJECTS = new Map([
  ["1", "personal"], ["个人", "personal"], ["personal", "personal"],
  ["2", "individual_business"], ["个体户", "individual_business"], ["个体工商户", "individual_business"], ["individual_business", "individual_business"],
  ["3", "enterprise"], ["企业", "enterprise"], ["enterprise", "enterprise"],
  ["4", undefined], ["不确定", undefined], ["不知道", undefined],
]);
const BOOLEAN = new Map([
  ["1", true], ["是", true], ["yes", true], ["y", true],
  ["2", false], ["否", false], ["no", false], ["n", false],
  ["3", undefined], ["不确定", undefined], ["不知道", undefined],
]);
const QUESTIONS = [
  ["subject", "主体类型：1 个人 / 2 个体工商户 / 3 企业 / 4 不确定：", SUBJECTS],
  ["sensitive", "是否收集手机号、位置、头像等敏感信息？1 是 / 2 否 / 3 不确定：", BOOLEAN],
  ["domain", "是否有自有服务器域名？1 是 / 2 否 / 3 不确定：", BOOLEAN],
];

/** 仅收集已确认事实；未知选项不补 false，关闭或 Ctrl+C 不返回部分答案。 */
export async function interviewGuide(facts, {
  input = process.stdin, output = process.stdout, createInterface = createReadlineInterface,
} = {}) {
  const result = { ...facts };
  const pending = QUESTIONS.filter(([key]) => facts[key] === undefined);
  if (!pending.length) return result;
  const rl = createInterface({ input, output, terminal: true });
  const controller = new AbortController();
  let exitCode = 1;
  const close = () => controller.abort();
  const interrupt = () => { exitCode = 130; controller.abort(); };
  rl.on("close", close);
  rl.on("SIGINT", interrupt);
  try {
    for (const [key, prompt, choices] of pending) {
      while (true) {
        if (controller.signal.aborted) throw new Error("问答已结束");
        const answer = await rl.question(prompt, { signal: controller.signal });
        if (controller.signal.aborted || answer === undefined) throw new Error("未收到完整回答");
        const value = answer.trim().toLowerCase();
        if (!choices.has(value)) {
          output.write("请选择列出的编号或文字；不确定时请明确选择“不确定”。\n");
          continue;
        }
        if (choices.get(value) !== undefined) result[key] = choices.get(value);
        break;
      }
    }
    return result;
  } catch (error) {
    throw Object.assign(new Error("问答已取消或输入已结束，未生成报告。", { cause: error }), { exitCode });
  } finally {
    rl.off("close", close);
    rl.off("SIGINT", interrupt);
    rl.close();
  }
}
