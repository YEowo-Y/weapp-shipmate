#!/usr/bin/env node
// bin/weapp-shipmate.mjs —— 可执行入口（package.json bin 指向此处）
import { main } from "../src/cli.mjs";
process.exit(main(process.argv));
