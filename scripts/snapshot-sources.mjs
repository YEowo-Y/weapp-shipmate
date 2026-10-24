#!/usr/bin/env node
// scripts/snapshot-sources.mjs —— 抓取 official_url 正文，归档到 corpus/source-snapshots/。
//
// 为什么要归档快照：离线门禁（npm run verify:quotes）需要一份可提交、可复现的官方正文，
// 才能在每个 PR 上零网络地判定 source_quote 是否逐字。把抓取（联网、会失败、会被限流）
// 与判定（纯函数、确定性）分开，是让门禁不 flake 的关键。
//
// 用法：
//   node scripts/snapshot-sources.mjs            # 刷新全部快照并报告漂移
//   node scripts/snapshot-sources.mjs --check    # 只报告，不写盘（定时监控用）
//
// 已知边界：微信开放社区（community/develop/doc/*）是客户端渲染，且匿名访问会 302 到
// forceLogin 错误页，curl 取不到正文。这类来源在 index.json 里标 method:"manual"，
// 本脚本不覆盖其快照，只报告其不可自动核验——这是如实信号，不是失败。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "../src/data.mjs";
import { uniqueUrls } from "../src/rot.mjs";
import { extractMainText, sha256 } from "../src/source-text.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "corpus", "source-snapshots");
const INDEX = path.join(DIR, "index.json");
const CHECK_ONLY = process.argv.includes("--check");

export function slugForUrl(url) {
  const h = createHash("sha256").update(url).digest("hex").slice(0, 8);
  const tail = url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-48);
  return `${tail}-${h}.txt`;
}

export { extractMainText, sha256 } from "../src/source-text.mjs";

async function main() {
  mkdirSync(DIR, { recursive: true });
  const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : { schema_version: 1, snapshots: [] };
  const prev = new Map(index.snapshots.map((s) => [s.url, s]));

  const { rules } = loadData({ includeDrafts: true });
  const urls = uniqueUrls(rules).map((u) => u.url);

  const out = [];
  let drifted = 0;
  let failed = 0;

  for (const url of urls) {
    const old = prev.get(url);
    if (old?.method === "manual") {
      console.log(`⊘ manual   ${url}`);
      console.log(`           （客户端渲染或需登录，不可自动刷新；快照由维护者手工核验并更新）`);
      out.push(old);
      continue;
    }

    let html, status, landed;
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "weapp-shipmate-snapshot" } });
      status = res.status;
      landed = res.url;
      html = await res.text();
    } catch (e) {
      console.log(`✗ error    ${url}\n           ${e.message}`);
      failed++;
      if (old) out.push(old);
      continue;
    }

    if (status < 200 || status >= 300) {
      console.log(`✗ http ${status} ${url}`);
      failed++;
      if (old) out.push(old);
      continue;
    }

    const text = extractMainText(html);
    if (!text || text.length < 200) {
      console.log(`✗ no-body  ${url}`);
      console.log(`           抓到 ${html.length} 字节但提取不到正文（可能是客户端渲染或错误页）。`);
      console.log(`           落地于：${landed}`);
      failed++;
      if (old) out.push(old);
      continue;
    }

    const file = old?.file || slugForUrl(url);
    // sha256 只覆盖正文，不含溯源头——头里有抓取日期，算进去的话每次重抓都"漂移"，
    // 漂移信号随即失去意义。verify-source-quotes 按同一口径校验，两侧必须一致。
    const hash = sha256(text);
    const changed = old && old.sha256 !== hash;
    if (changed) drifted++;

    if (!CHECK_ONLY) {
      const header = `===== URL: ${url}\n===== FETCHED: ${new Date().toISOString().slice(0, 10)}\n===== METHOD: fetch + <main> extract\n\n`;
      writeFileSync(path.join(DIR, file), header + text, "utf8");
    }

    out.push({
      url,
      file,
      sha256: hash,
      chars: text.length,
      fetched_at: CHECK_ONLY && old ? old.fetched_at : new Date().toISOString().slice(0, 10),
      method: "fetch",
    });
    console.log(`${changed ? "~ drift   " : "✓ ok      "} ${url}  (${text.length} 字符)`);
  }

  if (!CHECK_ONLY) {
    out.sort((a, b) => a.url.localeCompare(b.url));
    writeFileSync(INDEX, JSON.stringify({ schema_version: 1, snapshots: out }, null, 2) + "\n", "utf8");
  }

  console.log(`\n快照 ${out.length} 份；漂移 ${drifted}；失败 ${failed}。`);
  if (failed > 0) {
    console.log("失败的来源保留旧快照；离线门禁仍以旧快照为准，请人工核验后再更新。");
    process.exitCode = 1;
  }
  // --check 是定时监控的入口：漂移必须让 job 失败，否则"成功"就意味着没人会收到通知，
  // 而快照可以无限期地与官方原文分家、陈旧引文被离线门禁认证为"逐字"。
  // 非 --check（人工刷新）时漂移是预期结果，不该失败。
  if (CHECK_ONLY && drifted > 0) {
    console.log(
      `⚠ ${drifted} 个来源的官方正文已与归档快照不一致。\n` +
        "请跑 npm run snapshot:sources 重新抓取，并重新核验受影响规则的 source_quote 与断言——\n" +
        "原文变了，引文可能仍逐字，但规则的断言未必还成立。"
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("snapshot-sources.mjs")) {
  await main();
}
