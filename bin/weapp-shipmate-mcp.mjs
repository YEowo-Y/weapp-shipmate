#!/usr/bin/env node
// bin/weapp-shipmate-mcp.mjs —— MCP server 可执行入口（stdio）。
// 在 Claude Code / Codex 的 MCP 配置中以此为 command 启动。
import { runStdio } from "../src/mcp.mjs";
runStdio();
