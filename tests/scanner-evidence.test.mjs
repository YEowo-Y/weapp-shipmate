import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanProject } from "../src/scanner.mjs";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

function project(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "shipmate evidence "));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test("evidence maps transformed text back to original UTF-16 positions without changing facts", t => {
  const source = '// #ifdef H5\r\nwx.chooseLocation();\r\n// #endif\r\n' +
    'const s = `文案\nwx.fake() 😀`; /* gone */ wx.getLocation(); wx.getLocation();\r\n' +
    'const r = /wx.fakeAgain/; uni.getUserProfile;\n' +
    'import { getLocation as locate, request } from "@tarojs/taro";\n';
  const template = '<!-- comment\n<camera/> -->\n<camera/> <camera/> <button open-type="getPhoneNumber" />';
  const dir = project(t, { "app.js": source, "page.wxml": template });
  const plain = scanProject(dir);
  const { evidence, ...scan } = scanProject(dir, { evidence: true });
  assert.deepEqual(scan, plain);
  assert.equal(evidence.truncated, false);
  const api = evidence.locations.filter(x => x.kind === "api-reference");
  assert.deepEqual(api.map(x => x.signal), ["wx.getLocation", "wx.getLocation", "uni.getUserProfile"]);
  for (const location of api) {
    const lines = source.split("\n");
    assert.ok(lines[location.line - 1].slice(location.column - 1).startsWith(location.signal));
  }
  assert.equal(api[0].line, 5);
  assert.equal(api[1].line, 5);
  assert.notEqual(api[0].column, api[1].column);
  const imports = evidence.locations.filter(x => x.kind === "api-import");
  assert.deepEqual(imports.map(x => x.signal), ["wx.getLocation", "wx.request"]);
  assert.ok(imports.every(x => x.line === 7));
  const cameras = evidence.locations.filter(x => x.signal === "component.camera");
  assert.equal(cameras.length, 2);
  assert.deepEqual(cameras.map(x => [x.line, x.column]), [[3, 1], [3, 11]]);
});

test("evidence contains sanitized hosts and key names, with honest config file positions", t => {
  const dir = project(t, {
    "app.js": 'wx.request({url:"http://synthetic:password@api.weixin.qq.com:80/path?token=PRIVATE_MARKER"});\nconst appsecret="SYNTHETIC_SECRET_VALUE";',
    "app.json": '{"permission":{"scope.userLocation":{"desc":"hello"}},"requiredPrivateInfos":["getLocation"]}',
    "manifest.json": '{"mp-weixin":{"requiredPrivateInfos":["chooseLocation"]}}',
    "app.mpx": '<script type="application/json">{"requiredPrivateInfos":["choosePoi"]}</script>',
  });
  const { evidence } = scanProject(dir, { evidence: true });
  assert.ok(evidence.locations.some(x => x.kind === "domain" && x.signal === "api.weixin.qq.com"));
  assert.ok(evidence.locations.some(x => x.kind === "insecure-request" && x.signal === "api.weixin.qq.com"));
  assert.ok(evidence.locations.some(x => x.kind === "secret-key" && x.signal === "appsecret" && x.line === 2));
  const config = evidence.locations.filter(x => x.kind === "config-key");
  assert.equal(config.length, 4);
  assert.ok(config.every(x => x.line === null && x.column === null));
  for (const value of ["password", "PRIVATE_MARKER", "SYNTHETIC_SECRET_VALUE", "/path", "hello"])
    assert.ok(!JSON.stringify(evidence).includes(value), value);
});

test("evidence limit leaves original scanning and later signal extraction intact", t => {
  const dir = project(t, { "app.js": 'wx.getLocation();\n'.repeat(20001) + 'wx.getUserProfile();' });
  const plain = scanProject(dir);
  const { evidence, ...scan } = scanProject(dir, { evidence: true });
  assert.deepEqual(scan, plain);
  assert.equal(evidence.locations.length, 20000);
  assert.equal(evidence.truncated, true);
  assert.ok(scan.apis.includes("wx.getUserProfile"));
});

test("nested conditional and template transforms preserve original positions and existing heuristics", t => {
  const source = '<!-- gone\nagain -->\n// #ifdef H5\nwx.fake();\n// #ifdef MP-WEIXIN\nwx.fakeToo();\n// #endif\n// #endif\n' +
    '<script>\nconst s="😀中文"; /* same line */ wx.getLocation;\nconst prose="<camera />";\n</script>\n';
  const dir = project(t, { "page.vue": source, "app.config.ts": 'export default { requiredPrivateInfos: ["getLocation"] };' });
  const { evidence, ...actual } = scanProject(dir, { evidence: true });
  assert.deepEqual(actual, scanProject(dir));
  const reference = evidence.locations.find(x => x.kind === "api-reference");
  assert.equal(reference.line, 10);
  assert.equal(reference.column, source.split("\n")[9].indexOf("wx.getLocation") + 1);
  const camera = evidence.locations.find(x => x.signal === "component.camera");
  assert.equal(camera.line, 11); // Existing template heuristic is deliberately retained.
  assert.equal(camera.column, source.split("\n")[10].indexOf("<camera") + 1);
  assert.ok(evidence.locations.some(x => x.file === "app.config.ts" && x.kind === "config-key"));
});

test("evidence reads each selected source once and never reads private files", t => {
  const dir = project(t, { "app.js": "wx.getLocation();", "private.upload.key": "SYNTHETIC_PRIVATE_DATA" });
  const original = fs.readFileSync;
  const reads = [];
  const mocked = t.mock.method(fs, "readFileSync", (path, ...args) => {
    if (typeof path === "string" && path.startsWith(dir)) reads.push(path);
    return original(path, ...args);
  });
  syncBuiltinESMExports();
  try {
    scanProject(dir, { evidence: true });
    assert.deepEqual(reads, [join(dir, "app.js")]);
  } finally { mocked.mock.restore(); syncBuiltinESMExports(); }
});

test("all repository fixtures retain identical facts under evidence mode", () => {
  const root = fileURLToPath(new URL("../fixtures/", import.meta.url));
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const plain = scanProject(dir);
    const { evidence, ...actual } = scanProject(dir, { evidence: true });
    assert.deepEqual(actual, plain, entry.name);
    assert.deepEqual(evidence, scanProject(dir, { evidence: true }).evidence, entry.name);
  }
});

test("original positions recognize CR, CRLF and Unicode line separators", t => {
  const files = Object.fromEntries(["\r", "\r\n", "\n", "\u2028", "\u2029"].map((newline, index) =>
    [`case${index}.js`, `void 0;${newline}wx.getLocation();`]));
  const dir = project(t, files);
  const evidence = scanProject(dir, { evidence: true }).evidence;
  assert.equal(evidence.locations.length, 5);
  assert.ok(evidence.locations.every(location => location.line === 2 && location.column === 1));
});
