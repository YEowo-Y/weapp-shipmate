// src/report.mjs —— 把检查/导航结果渲染为 Markdown 或 JSON
// 输出口径受 GOVERNANCE.md 约束：只给"待用户确认"的建议，绝不声称"已合规/保证过审"。
const SEV_ICON = { blocker: "🔴", warning: "🟠", info: "🟡" };
const SEV_RANK = { blocker: 0, warning: 1, info: 2 };
const SEV_LABEL = { blocker: "阻断", warning: "警告", info: "提示" };
const STAGE_TITLE = {
  registration: "注册账号", certification: "主体认证", filing: "ICP 备案",
  category: "服务类目", privacy: "用户隐私保护指引", domain: "服务器域名白名单",
  review: "提交审核", release: "发布上线",
};

const DISCLAIMER =
  "本报告仅为**待你确认**的导航建议，依据官方来源整理；不构成合规担保，不代表“已合规”或“保证过审”。所有官方后台提交、认证、备案、发布均需你本人完成。";

export function toJson(result) {
  return JSON.stringify(result, null, 2);
}

export function toMarkdown(result) {
  const lines = [];
  const title = result.command === "check" ? "上线预检清单" : "上线导航清单";
  lines.push(`# weapp-shipmate · ${title}`, "");
  lines.push(`> ${DISCLAIMER}`, "");

  if (result.meta?.summary) lines.push(result.meta.summary, "");

  // 严重度概览：让用户一眼看到有几项阻断/警告/提示
  const counts = { blocker: 0, warning: 0, info: 0 };
  for (const it of result.items) if (counts[it.severity] !== undefined) counts[it.severity]++;
  const overview = ["blocker", "warning", "info"]
    .filter((s) => counts[s] > 0)
    .map((s) => `${SEV_ICON[s]} ${counts[s]} ${SEV_LABEL[s]}`);
  if (overview.length) lines.push(`**概览**：${overview.join(" · ")}`, "");

  // 按 flow 阶段顺序分组
  const order = Object.keys(STAGE_TITLE);
  const byStage = new Map();
  for (const it of result.items) {
    if (!byStage.has(it.stage)) byStage.set(it.stage, []);
    byStage.get(it.stage).push(it);
  }
  for (const stage of order) {
    const items = byStage.get(stage);
    if (!items || !items.length) continue;
    lines.push(`## ${STAGE_TITLE[stage]}（${stage}）`, "");
    // 同一阶段内按严重度排序：阻断 → 警告 → 提示（稳定排序，平级保持原序）
    const sorted = [...items].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
    for (const it of sorted) {
      lines.push(`### ${SEV_ICON[it.severity] || "•"} ${it.title}  \`${it.ruleId}\``);
      if (it.why) lines.push(`- 为什么：${it.why}`);
      for (const r of it.requires || []) lines.push(`- [ ] ${r}`);
      if (it.note) lines.push(`- ⚠️ ${it.note}`);
      if (it.manual_required) lines.push(`- 👤 需你本人在官方后台完成，工具不代办`);
      if (it.official_url) lines.push(`- 来源：${it.official_url}（最后核验 ${it.last_verified}）`);
      lines.push("");
    }
  }

  if (result.notes?.length) {
    lines.push("## 备注", "");
    for (const n of result.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  if (!result.items.length) lines.push("_未命中任何规则。_", "");
  return lines.join("\n");
}

export function render(result, format = "markdown") {
  return format === "json" ? toJson(result) : toMarkdown(result);
}
