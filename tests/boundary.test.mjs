// tests/boundary.test.mjs —— 阶段3（B1~B5）：扫描器文件系统边界行为。
// 这些场景无法用仓库内静态夹具表达（符号链接不宜入 git、5MB 文件不宜提交），故用临时目录现场构造。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject, MAX_FILE_BYTES } from "../src/scanner.mjs";

const mktmp = () => mkdtempSync(join(tmpdir(), "ws-boundary-"));

test("B1: junction/符号链接自环不再膨胀 filesScanned（FX-12，此前 2 文件项目实测膨胀到 64）", () => {
  const dir = mktmp();
  try {
    writeFileSync(join(dir, "a.js"), "wx.getLocation()");
    writeFileSync(join(dir, "b.js"), "wx.request({ url: 'https://x.example.com/a' })");
    let linked = true;
    try { symlinkSync(dir, join(dir, "self"), "junction"); } catch { linked = false; }
    const r = scanProject(dir);
    assert.equal(r.filesScanned, 2, linked ? "自环链接不得被跟随" : "无链接基线也应为 2");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("B1: 指向项目外的链接不得把外部代码的 API 带进合规报告", () => {
  const outside = mktmp();
  const dir = mktmp();
  try {
    writeFileSync(join(outside, "foreign.js"), "wx.chooseAddress()");
    writeFileSync(join(dir, "a.js"), "wx.getLocation()");
    let linked = true;
    try { symlinkSync(outside, join(dir, "vendor"), "junction"); } catch { linked = false; }
    const r = scanProject(dir);
    assert.ok(r.apis.includes("wx.getLocation"));
    if (linked) assert.ok(!r.apis.includes("wx.chooseAddress"), "越界链接目标的 API 不得进扫描事实");
  } finally {
    rmSync(outside, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("B2: 超过上限的文件跳过并计数，不整读入内存", () => {
  const dir = mktmp();
  try {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1, 0x20);
    big.write("wx.getLocation();", 0);
    writeFileSync(join(dir, "big.js"), big);
    writeFileSync(join(dir, "small.js"), "wx.getUserProfile()");
    const r = scanProject(dir);
    assert.equal(r.skippedLargeFiles, 1);
    assert.ok(!r.apis.includes("wx.getLocation"), "超大文件不应被读取，其 API 不进事实");
    assert.ok(r.apis.includes("wx.getUserProfile"));
    assert.equal(r.filesScanned, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("B4: 嵌套 pages/test/ 会被扫描（随包上传的业务代码），根层 test/ 仍被忽略（工具惯例位）", () => {
  const dir = mktmp();
  try {
    mkdirSync(join(dir, "pages", "test"), { recursive: true });
    mkdirSync(join(dir, "test"));
    writeFileSync(join(dir, "pages", "test", "page.js"), "wx.getLocation()");
    writeFileSync(join(dir, "test", "helper.js"), "wx.chooseAddress()");
    const r = scanProject(dir);
    assert.ok(r.apis.includes("wx.getLocation"), "嵌套 test/ 漏扫是假阴性（此前任意深度裸名匹配）");
    assert.ok(!r.apis.includes("wx.chooseAddress"), "根层 test/ 扫了是误报源");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("B5: 文件名里的反引号在 secretHints 路径中被净化（防 markdown/提示词注入）", () => {
  const dir = mktmp();
  const BT = "\x60"; // 反引号
  try {
    let created = true;
    try { writeFileSync(join(dir, "a" + BT + "b.js"), 'const appsecret = "abcdef123456";'); } catch { created = false; }
    if (!created) return; // 文件系统不允许该字符时无法构造场景
    const r = scanProject(dir);
    assert.equal(r.secretHints.length, 1);
    assert.ok(!r.secretHints[0].file.includes(BT), "路径应净化：" + r.secretHints[0].file);
    assert.ok(r.secretHints[0].file.includes("?"), "被净化字符应以 ? 占位");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("B3 边界: 顶层目录不存在仍显性抛错——e2e 的 exit-1 契约不被子目录容错破坏", () => {
  assert.throws(() => scanProject(join(tmpdir(), "ws-no-such-dir-xyz")), /ENOENT/);
});
