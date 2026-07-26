// tests/source-quotes.test.mjs —— 逐字门禁的契约测试。
// 重点是负向控制：门禁必须对「改写 / 词序调换 / 词句增删」变红，同时对「渲染空白差异」保持绿。
// 这两侧都锁死，门禁才既抓得住真缺陷、又不制造假红。
// 另有一条 known-gap 测试如实钉住它抓不到的东西（纯粹顺序的跨段焊接）——
// 覆盖面必须由测试证明，不能由测试名宣称。

import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseWhitespace, classifyQuote, verifyQuotes, isPassing, summarize, stripProvenanceHeader } from "../src/source-quotes.mjs";
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

const NETWORK_PAGE = [
  "每个微信小程序需要事先设置通讯域名，小程序只可以跟指定的域名进行网络通信。",
  "域名只支持 https 和 wss 协议；",
  "服务器域名请在 「小程序后台-开发-开发设置-服务器域名」 中进行配置，配置时需要注意：",
].join("\n");

test("负向控制：词序调换 + 补入分隔符必须判 missing（这正是 domain.request-whitelist 的旧引文）", () => {
  // 注意本条**证明的是什么**：它红，是因为词序被调换且补入了「；」——不是因为跨段本身。
  // 纯粹顺序的跨段焊接不在本门禁覆盖内，见下一条 known-gap 测试。
  const rewritten = "服务器域名请在「小程序后台 - 开发 - 开发设置 - 服务器域名」中进行配置；小程序只可以跟指定的域名进行网络通信。";
  assert.equal(classifyQuote(rewritten, NETWORK_PAGE), "missing");
  // 对照：页面上任一连续单句必须过，证明上面判红的原因是引文被改动，而非字词不符
  assert.equal(classifyQuote("每个微信小程序需要事先设置通讯域名，小程序只可以跟指定的域名进行网络通信。", NETWORK_PAGE), "exact");
});

test("已知缺口（如实钉住）：纯粹顺序的跨段焊接会判过，本门禁抓不到", () => {
  // 归一化把空白**删除**而非折叠，故段落边界在比较时不复存在：
  // 「段一末句 + 段二首句」不增不删不调序，归一化后恰好连续。
  // GOVERNANCE 准则 1 管这叫跨段拼接，本门禁却放行。
  //
  // 这条测试存在的意义不是庆祝该行为，而是**不让这个缺口被遗忘或被误以为已覆盖**：
  // 若将来有人让提取阶段区分段落边界与列表项，本条会变红，届时应改为断言 "missing"。
  const pureStitch = "小程序只可以跟指定的域名进行网络通信。域名只支持 https 和 wss 协议；";
  assert.equal(
    classifyQuote(pureStitch, NETWORK_PAGE),
    "whitespace-normalized",
    "若此处变红，说明缺口已被堵上——请把本测试改为断言 missing 并更新 source-quotes.mjs 的覆盖面说明"
  );
});

test("负向控制：末位标点改写必须判 missing（准则 1『不得改写』）", () => {
  const page = "微信小程序不得发布、传送、传播、储存国家法律法规禁止的以下信息内容，否则视为违规：";
  assert.equal(classifyQuote("微信小程序不得发布、传送、传播、储存国家法律法规禁止的以下信息内容，否则视为违规。", page), "missing");
  assert.equal(classifyQuote(page, page), "exact");
});

test("保绿侧：零宽字符差异不得判 missing（官网正文夹带 ZWSP，复制粘贴会带进引文）", () => {
  // snapshot-sources 抓取时把零宽字符从快照剔除；若引文侧不同等剔除，
  // 维护者从官网复制一段实际逐字相同的文本就会撞上无线索的假红。
  const zwsp = String.fromCodePoint(0x200b);
  const bom = String.fromCodePoint(0xfeff);
  assert.equal(classifyQuote("小程序只可以跟指定的域名", `x 小程序只${zwsp}可以跟指定的域名 y`), "whitespace-normalized");
  assert.equal(classifyQuote(`小程序${bom}只可以跟指定的域名`, "x 小程序只可以跟指定的域名 y"), "whitespace-normalized");
});

test("保绿侧：全角空格 U+3000 / NBSP U+00A0 差异不得判 missing", () => {
  const ideographic = String.fromCodePoint(0x3000);
  const nbsp = String.fromCodePoint(0x00a0);
  assert.equal(classifyQuote("a b", `x a${ideographic}b y`), "whitespace-normalized");
  assert.equal(classifyQuote("a b", `x a${nbsp}b y`), "whitespace-normalized");
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

test("stripProvenanceHeader 剥掉溯源头，使 sha256 不随抓取日期漂移、且元数据不进搜索空间", () => {
  const raw = ["===== URL: https://x", "===== FETCHED: 2026-07-17", "", "正文第一行", "正文第二行"].join("\n");
  assert.equal(stripProvenanceHeader(raw), "正文第一行\n正文第二行");
  // 无溯源头时原样返回
  assert.equal(stripProvenanceHeader("正文"), "正文");
  // 溯源头里的字样不得被 source_quote 匹配到（否则引文可以"命中"我们自己写的元数据）
  assert.ok(!stripProvenanceHeader(raw).includes("FETCHED"));
});
