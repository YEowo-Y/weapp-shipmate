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
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const r = scanProject(dir);
    const dt = performance.now() - t0;
    const heapDelta = process.memoryUsage().heapUsed - heap0;
    assert.equal(r.filesScanned, 1001, "1000 页面 + app.json");
    assert.ok(r.apis.includes("wx.getLocation"));
    assert.equal(r.domains.length, 7);
    assert.ok(dt < 3000, `1000 文件扫描耗时 ${Math.round(dt)}ms ≥ 3000ms（S6 规格）`);
    assert.ok(heapDelta < 200 * 1024 * 1024, `heap 增量 ${Math.round(heapDelta / 1048576)}MB ≥ 200MB（FX-10 规格）`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
