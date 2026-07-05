// tests/perf.test.mjs —— B7（FX-10/S6）：性能基线。docs/10 S6 规格：1000 文件 <3s、heap 增量 <200MB。
// 夹具现场生成于临时目录（不入 git、不进钉板/labels），只锁性能与计数，不锁命中集合。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject } from "../src/scanner.mjs";

test("性能基线：1000 文件冷扫 <3s、heap 增量 <200MB、filesScanned 精确", () => {
  const dir = mkdtempSync(join(tmpdir(), "ws-perf-"));
  try {
    writeFileSync(join(dir, "app.json"), JSON.stringify({ pages: ["pages/p0/index"] }));
    for (let i = 0; i < 1000; i++) {
      const d = join(dir, "pages", `p${i}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, "index.js"),
        `// page ${i}\nPage({ onLoad() { wx.request({ url: "https://api${i % 7}.example.com/x" }); ${i % 13 === 0 ? "wx.getLocation();" : ""} } });\n`,
      );
    }
    // 三次取最小：node --test 并行跑全部测试文件（含 e2e/mcp 子进程），单次墙钟会被 CPU 争抢
    // 放大数倍（实测同机 767ms ↔ 7711ms）。真实的算法性回归三次都快不起来；争抢噪声取 min 可滤。
    const heap0 = process.memoryUsage().heapUsed;
    const durations = [];
    let r;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      r = scanProject(dir);
      durations.push(performance.now() - t0);
    }
    const best = Math.min(...durations);
    const heapDelta = process.memoryUsage().heapUsed - heap0;
    // 本机严格执行 S6 规格（3s）；共享 CI runner（尤其 windows-latest）算力波动大且非规格环境，
    // 放宽到 8s——CI 腿只兜"无灾难性算法回归"，规格基线由开发机与复核实测把守（阶段3复核 NOTE-4）。
    const budget = process.env.CI ? 8000 : 3000;
    assert.equal(r.filesScanned, 1001, "1000 页面 + app.json");
    assert.ok(r.apis.includes("wx.getLocation"));
    assert.equal(r.domains.length, 7);
    assert.ok(best < budget, `1000 文件扫描三次最优 ${Math.round(best)}ms ≥ ${budget}ms（S6 规格；全部计时 ${durations.map((d) => Math.round(d)).join("/")}ms）`);
    assert.ok(heapDelta < 200 * 1024 * 1024, `heap 增量 ${Math.round(heapDelta / 1048576)}MB ≥ 200MB（FX-10 规格）`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
