import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { runCLI } from "../src/cli.mjs";
import { interviewGuide } from "../src/guide-interview.mjs";

function capture(isTTY = true) {
  let text = "";
  return { isTTY, write(value) { text += value; }, get: () => text };
}
function answers(values) {
  const prompts = [];
  const rl = new EventEmitter();
  rl.question = async prompt => { prompts.push(prompt); return values.shift(); };
  rl.close = () => rl.emit("close");
  return { prompts, createInterface: () => rl };
}

test("问答接受中文、是/否/未知，非法输入重试且不制造默认答案", async () => {
  const io = answers(["不是主体", "个人", "不确定", "否"]);
  const output = capture();
  const result = await interviewGuide({}, { input: {}, output, createInterface: io.createInterface });
  assert.deepEqual(result, { subject: "personal", domain: false });
  assert.equal(io.prompts.length, 4);
  assert.match(output.get(), /请选择/);
});

test("已有事实不重问", async () => {
  const io = answers([]);
  const facts = { subject: "enterprise", sensitive: false, domain: true };
  assert.deepEqual(await interviewGuide(facts, { input: {}, output: capture(), createInterface: io.createInterface }), facts);
  assert.equal(io.prompts.length, 0);
});

test("TTY 无参数自动问答并输出可复现命令", async () => {
  const out = capture(), err = capture();
  let calls = 0;
  const code = await runCLI(["node", "cli", "guide"], out, err, {
    input: { isTTY: true },
    interview: async () => { calls++; return { subject: "personal", sensitive: false }; },
  });
  assert.equal(code, 0);
  assert.equal(calls, 1);
  assert.match(out.get(), /可复现命令/);
  assert.match(out.get(), /--no-interactive.*--subject personal.*--no-sensitive/);
  assert.match(out.get(), /未知不等于不适用/);
});

test("JSON/管道/禁用模式不启动问答，显式交互遇不适用环境报错", async () => {
  for (const [args, tty, status] of [[[], false, 0], [["--json"], true, 0], [["--no-interactive"], true, 0], [["--subject", "personal"], true, 0], [["--interactive", "--json"], true, 1], [["--interactive"], false, 1], [["--interactive", "--no-interactive"], true, 1]]) {
    let called = false;
    const code = await runCLI(["node", "cli", "guide", ...args], capture(tty), capture(), {
      input: { isTTY: tty }, interview: async () => { called = true; return {}; },
    });
    assert.equal(code, status, args.join(" "));
    assert.equal(called, false);
  }
});

test("显式交互传递已有事实，中断不输出报告", async () => {
  const out = capture(), err = capture();
  const code = await runCLI(["node", "cli", "guide", "--interactive", "--subject", "个人", "--no-sensitive"], out, err, {
    input: { isTTY: true }, interview: async facts => {
      assert.equal(facts.subject, "personal");
      assert.equal(facts.sensitive, false);
      throw Object.assign(new Error("cancel"), { exitCode: 130 });
    },
  });
  assert.equal(code, 130);
  assert.equal(out.get(), "");
  assert.match(err.get(), /未生成报告/);
});

test("readline 关闭/中断拒绝部分答案并释放接口", async () => {
  for (const [event, exitCode] of [["close", 1], ["SIGINT", 130]]) {
    const rl = new EventEmitter();
    let count = 0, closed = false;
    rl.question = async (_prompt, { signal }) => {
      if (++count === 1) return "1";
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        Promise.resolve().then(() => rl.emit(event));
      });
    };
    rl.close = () => { closed = true; };
    await assert.rejects(interviewGuide({}, { input: {}, output: capture(), createInterface: () => rl }), error => error.exitCode === exitCode);
    assert.equal(closed, true);
    assert.equal(rl.listenerCount("close"), 0);
    assert.equal(rl.listenerCount("SIGINT"), 0);
  }
});

test("真实管道入口 JSON 与显式交互都不等待 stdin", async () => {
  const { spawnSync } = await import("node:child_process");
  for (const [args, status] of [[["guide", "--json"], 0], [["guide", "--interactive"], 1], [["guide", "--no-interactive", "--json"], 0]]) {
    const child = spawnSync(process.execPath, ["bin/weapp-shipmate.mjs", ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, status);
    if (status === 0) assert.equal(JSON.parse(child.stdout).command, "guide");
    else { assert.equal(child.stdout, ""); assert.match(child.stderr, /需要输入和输出均为终端/); }
  }
});

test("非法参数在问答前拒绝，输入输出任一非终端均不自动启动", async () => {
  for (const [args, inputTTY, outputTTY, status] of [
    [["--interactive", "--subject", "oops"], true, true, 1],
    [["--interactive", "--payment=false"], true, true, 1],
    [["--interactive", "personal"], true, true, 1],
    [[], true, false, 0], [[], false, true, 0],
  ]) {
    let called = false;
    assert.equal(await runCLI(["node", "cli", "guide", ...args], capture(outputTTY), capture(), {
      input: { isTTY: inputTTY }, interview: async () => { called = true; return {}; },
    }), status);
    assert.equal(called, false);
  }
});
