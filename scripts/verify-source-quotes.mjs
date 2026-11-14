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
// 也不会因对方限流/抖动制造假红。快照的刷新与漂移检测由 .github/workflows/rule-rot.yml
// 的定时任务承担：`npm run rot -- --links`（链接可达性）+ `npm run snapshot:sources -- --check`
// （内容漂移）。二者联网、允许失败以告警，与本门禁的零网络裁决严格分离。

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuleReferences } from "../src/source-catalog.mjs";
import { verifyQuotes, summarize, stripProvenanceHeader } from "../src/source-quotes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "corpus", "source-snapshots");
const INDEX = path.join(DIR, "index.json");

/**
 * 读取快照索引，返回 official_url -> 正文（含溯源头，不影响子串判定）。
 *
 * 顺带校验 index.json 记录的 sha256：本门禁把快照当作不可争议的证据，
 * 而「修法不得改快照去迁就引文」此前只是提示语里的一句话，没有任何东西拦着。
 * 校验 sha 不能拦住铁了心的人（他会两处一起改），但能把**静默篡改**变成一个显眼的双文件 diff，
 * 并顺手抓住手滑改坏快照的情况。（独立复核 P2 指出：引文侧由脚本裁决、快照侧却靠印象裁决，
 * 正是本分支要消灭的那种不对称。）
 */
export function loadSnapshots({ dir = DIR, index = INDEX } = {}) {
  if (!existsSync(index)) return {};
  const idx = JSON.parse(readFileSync(index, "utf8"));
  const map = {};
  const tampered = [];
  for (const s of idx.snapshots || []) {
    const f = path.join(dir, s.file);
    if (!existsSync(f)) continue;
    const text = stripProvenanceHeader(readFileSync(f, "utf8"));
    if (s.sha256 && createHash("sha256").update(text, "utf8").digest("hex") !== s.sha256) {
      tampered.push(s.file);
      continue; // 不进 map —— 规则随即判 no-snapshot 而失败，绝不拿存疑证据放行
    }
    map[s.url] = text;
  }
  if (tampered.length) {
    throw new Error(
      `快照内容与 index.json 记录的 sha256 不符：${tampered.join("、")}
` +
        "快照是本门禁的证据底座。若官方原文确有变化，请跑 npm run snapshot:sources 重新抓取并复核，" +
        "不要手工编辑快照去迁就引文。"
    );
  }
  return map;
}

/** official_url -> 快照的 method（fetch / manual）。manual 者其快照本身未经自动核验。 */
export function snapshotMethods({ index = INDEX } = {}) {
  if (!existsSync(index)) return {};
  const idx = JSON.parse(readFileSync(index, "utf8"));
  return Object.fromEntries((idx.snapshots || []).map((s) => [s.url, s.method]));
}

function main() {
  const rules = loadRuleReferences();
  const snapshots = loadSnapshots();
  const results = verifyQuotes(rules, snapshots);
  const { total, failures } = summarize(results);

  const exact = results.filter((r) => r.status === "exact").length;
  const ws = results.filter((r) => r.status === "whitespace-normalized").length;
  const methods = snapshotMethods();
  const manual = results.filter((r) => methods[r.url] === "manual");

  console.log(`逐字核验：${total} 条非 draft 规则`);
  console.log(`  ✓ 逐字命中           ${exact}`);
  console.log(`  ✓ 仅空白差异（渲染）  ${ws}`);
  console.log(`  ✗ 未命中             ${failures.length}`);
  if (manual.length) {
    // 对人工快照而言，链条是「人工转录的快照 → 脚本核验的引文」：
    // 脚本只能担保引文忠于该文档，担保不了该文档本身。别让这点消失在合计数里。
    console.log(
      `
  ⚠ 其中 ${manual.length} 条比对的是**人工快照**（快照本身未经自动抓取核验）：` +
        `${manual.map((m) => m.id).join("、")}`
    );
  }

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
