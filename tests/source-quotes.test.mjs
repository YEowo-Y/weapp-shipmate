// tests/source-quotes.test.mjs —— 逐字门禁的契约测试。
// 重点是负向控制：门禁必须对「跨段拼接」和「标点改写」变红，同时对「渲染空白差异」保持绿。
// 这两侧都锁死，门禁才既抓得住真缺陷、又不制造假红。

import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseWhitespace, classifyQuote, verifyQuotes, isPassing, summarize } from "../src/source-quotes.mjs";
import { loadData } from "../src/data.mjs";
import { loadSnapshots } from "../scripts/verify-source-quotes.mjs";

test("collapseWhitespace 只折叠空白，不动标点与字词", () => {
  assert.equal(collapseWhitespace("a b\tc\nd"), "abcd");
  assert.equal(collapseWhitespace("违规：清单"), "违规：清单");
  assert.equal(collapseWhitespace("违规。清单"), "违规。清单");
});

test("classifyQuote：逐字命中判 exact", () => {
  assert.equal(classifyQuote("小程序只可以跟指定的域名进行网络通信。", "每个微信小程序需要事先设置通讯域名，小程序只可以跟指定的域名进行网络通信。包括普通 HTTPS 请求"), "exact");
});

test("classifyQuote：仅空白差异判 whitespace-normalized（表格单元格/列表换行的渲染产物）", () => {
  // 快照里是表格两列（\t 分隔），规则按人类阅读习惯用空格接起来 —— 忠实转写，必须放行
  const page = "读取你的剪切板\twx.setClipboardData、wx.getClipboardData";
  assert.equal(classifyQuote("读取你的剪切板 wx.setClipboardData、wx.getClipboardData", page), "whitespace-normalized");
  // 列表项换行同理
  assert.equal(classifyQuote("（2选1）：1、《金融许可证》 2、《金融机构许可证》", "（2选1）：1、《金融许可证》\n2、《金融机构许可证》"), "whitespace-normalized");
});

test("负向控制：跨段拼接必须判 missing（GOVERNANCE 准则 1『不得跨段拼接』）", () => {
  const page = [
    "每个微信小程序需要事先设置通讯域名，小程序只可以跟指定的域名进行网络通信。",
    "域名只支持 https 和 wss 协议；",
    "服务器域名请在 「小程序后台-开发-开发设置-服务器域名」 中进行配置，配置时需要注意：",
  ].join("\n");
  // 把两段不同章节的句子逆序焊接、并补入「；」—— 各半句都在页面上，整串却不存在
  const stitched = "服务器域名请在「小程序后台 - 开发 - 开发设置 - 服务器域名」中进行配置；小程序只可以跟指定的域名进行网络通信。";
  assert.equal(classifyQuote(stitched, page), "missing");
  // 而其中任一连续单句必须过 —— 证明判 missing 的原因是拼接本身，不是字词不符
  assert.equal(classifyQuote("每个微信小程序需要事先设置通讯域名，小程序只可以跟指定的域名进行网络通信。", page), "exact");
});

test("负向控制：末位标点改写必须判 missing（准则 1『不得改写』）", () => {
  const page = "微信小程序不得发布、传送、传播、储存国家法律法规禁止的以下信息内容，否则视为违规：";
  assert.equal(classifyQuote("微信小程序不得发布、传送、传播、储存国家法律法规禁止的以下信息内容，否则视为违规。", page), "missing");
  assert.equal(classifyQuote(page, page), "exact");
});

test("classifyQuote：缺快照判 no-snapshot，且不得冒充通过", () => {
  assert.equal(classifyQuote("任意", undefined), "no-snapshot");
  assert.equal(isPassing("no-snapshot"), false);
  assert.equal(isPassing("missing"), false);
  assert.equal(isPassing("exact"), true);
  assert.equal(isPassing("whitespace-normalized"), true);
});

test("verifyQuotes 默认跳过 draft 规则（draft 不进默认集，不受本门禁约束）", () => {
  const rules = [
    { id: "a", source_quote: "x", official_url: "u", draft: true },
    { id: "b", source_quote: "x", official_url: "u" },
  ];
  const res = verifyQuotes(rules, { u: "zzz" });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, "b");
});

test("summarize 汇总失败项", () => {
  const res = [{ status: "exact" }, { status: "missing" }, { status: "whitespace-normalized" }];
  const s = summarize(res);
  assert.equal(s.total, 3);
  assert.equal(s.passed, 2);
  assert.equal(s.failures.length, 1);
});

test("红线：仓库全部非 draft 规则的 source_quote 均为其 official_url 快照的连续子串", () => {
  const { rules } = loadData({ includeDrafts: false });
  const snapshots = loadSnapshots();
  const { total, failures } = summarize(verifyQuotes(rules, snapshots));
  assert.ok(total > 0, "应至少核验一条规则");
  assert.deepEqual(
    failures.map((f) => `${f.id} [${f.status}]`),
    [],
    "source_quote 必须逐字取自 official_url（GOVERNANCE.md 来源核验准则 1）；" +
      "修法是改引文贴合原文或降为 draft，不是改快照迁就引文"
  );
});

test("每条非 draft 规则的 official_url 都有归档快照", () => {
  const { rules } = loadData({ includeDrafts: false });
  const snapshots = loadSnapshots();
  const missing = [...new Set(rules.map((r) => r.official_url))].filter((u) => !snapshots[u]);
  assert.deepEqual(missing, [], "缺快照的来源无法离线核验，请先跑 npm run snapshot:sources");
});
