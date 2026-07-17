#!/usr/bin/env node
// scripts/verify-source-quotes.mjs —— 离线逐字门禁：每条非 draft 规则的 source_quote
// 必须是其 official_url 归档快照的连续子串（仅折叠空白）。
//
// 这条门禁执行的是 GOVERNANCE.md「来源核验准则」第 1 条。该标准此前只写在文档里、
// 无代码执行，因而漂移无声：2026-07-17 审计实测到两例跨段拼接、一例末位标点改写，
// 且其中一例曾被 LLM 代理判为"逐字核验 INTACT"并据此刷新 last_verified。
// 逐字与否必须由脚本判定——这就是那个脚本。
//
// 零网络：只读 corpus/source-snapshots/。因此可以进 PR CI 而不依赖微信站点可用性，
// 也不会因对方限流/抖动制造假红。快照的刷新与漂移检测由 scripts/snapshot-sources.mjs
// 和定时 rot 承担（允许软失败）。

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "../src/data.mjs";
import { verifyQuotes, summarize } from "../src/source-quotes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "corpus", "source-snapshots");
const INDEX = path.join(DIR, "index.json");

/** 读取快照索引，返回 official_url -> 正文（含溯源头，不影响子串判定）。 */
export function loadSnapshots({ dir = DIR, index = INDEX } = {}) {
  if (!existsSync(index)) return {};
  const idx = JSON.parse(readFileSync(index, "utf8"));
  const map = {};
  for (const s of idx.snapshots || []) {
    const f = path.join(dir, s.file);
    if (existsSync(f)) map[s.url] = readFileSync(f, "utf8");
  }
  return map;
}

function main() {
  const { rules } = loadData({ includeDrafts: false });
  const snapshots = loadSnapshots();
  const results = verifyQuotes(rules, snapshots);
  const { total, failures } = summarize(results);

  const exact = results.filter((r) => r.status === "exact").length;
  const ws = results.filter((r) => r.status === "whitespace-normalized").length;

  console.log(`逐字核验：${total} 条非 draft 规则`);
  console.log(`  ✓ 逐字命中           ${exact}`);
  console.log(`  ✓ 仅空白差异（渲染）  ${ws}`);
  console.log(`  ✗ 未命中             ${failures.length}`);

  if (failures.length) {
    console.log("\n以下 source_quote 不是其 official_url 快照的连续子串：\n");
    for (const f of failures) {
      const why =
        f.status === "no-snapshot"
          ? "该 official_url 没有归档快照（先跑 npm run snapshot:sources）"
          : "快照中找不到该连续片段——可能是跨段拼接、改写、或官方原文已漂移";
      console.log(`  ✗ ${f.id}  (${f.file})`);
      console.log(`      ${f.url}`);
      console.log(`      ${why}`);
    }
    console.log(
      "\nGOVERNANCE.md 来源核验准则 1：source_quote 必须是逐字原文片段，" +
        "不得改写、概括、翻译、跨段拼接。\n" +
        "修法：改引文以贴合原文（首选），或按准则 2 降为 draft:true。不得改快照去迁就引文。"
    );
    process.exitCode = 1;
    return;
  }
  console.log("\n全部通过。");
}

if (process.argv[1]?.endsWith("verify-source-quotes.mjs")) main();
