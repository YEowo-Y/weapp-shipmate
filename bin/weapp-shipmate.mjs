#!/usr/bin/env node
// bin/weapp-shipmate.mjs —— 可执行入口（package.json bin 指向此处）
import { main } from "../src/cli.mjs";
// E8：process.exit() 不等待 stdout 管道的异步写完成，大报告经管道（| jq 等）可能被截断——
// 设 exitCode 让进程自然退出，退出码契约（0/1/2）不变。
process.exitCode = main(process.argv);
