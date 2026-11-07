// src/report.mjs —— 把检查/导航结果渲染为 Markdown 或 JSON
// 输出口径受 GOVERNANCE.md 约束：只给"待用户确认"的建议，绝不声称"已合规/保证过审"。
import { loadFlow } from "./data.mjs";

const SEV_ICON = { blocker: "🔴", warning: "🟠", info: "🟡" };
const SEV_RANK = { blocker: 0, warning: 1, info: 2 };
const SEV_LABEL = { blocker: "阻断", warning: "警告", info: "提示" };
const FLOW = loadFlow();
const STAGE_TITLE = new Map(FLOW.map((stage) => [stage.stage, stage.title]));

const DISCLAIMER =
  "本报告仅为**待你确认**的导航建议，依据官方来源整理；不构成合规担保，不代表“已合规”或“保证过审”。所有官方后台提交、认证、备案、发布均需你本人完成。";

function escapeMarkdownInline(value) {
  return String(value)
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([`*_[\]{}()#+!|~])/g, "\\$1");
}

function explainSummaryForMarkdown(result) {
  const summary = result.meta?.summary || "";
  const query = String(result.meta?.query ?? "");
  return summary.replace(`「${query}」`, () => `「${escapeMarkdownInline(query)}」`);
}

export function toJson(result) {
  return JSON.stringify(result, null, 2);
}

function filteredEmptyMessage(hiddenNonBlockerCount) {
  return hiddenNonBlockerCount > 0
    ? `_未命中阻断项；已隐藏 ${hiddenNonBlockerCount} 条非阻断项。_`
    : null;
}

// 合并相同诊断，同时保留所有关联规则；不改写引擎返回的事实对象。
function appendNotes(lines, result) {
  const notes = new Map();
  for (const note of result.notes || []) notes.set(note, new Set());
  for (const item of [...result.items, ...(result.selfCheck || [])]) {
    if (!item.note) continue;
    if (!notes.has(item.note)) notes.set(item.note, new Set());
    if (item.ruleId) notes.get(item.note).add(item.ruleId);
  }
  if (!notes.size) return;
  lines.push("## 备注", "");
  for (const [note, rules] of notes) {
    const context = rules.size ? `（相关规则：${[...rules].join("、")}）` : "";
    lines.push(`- ${note}${context}`);
  }
  lines.push("");
}

function hasUnmatchedAdvice(result) {
  return result.command === "explain" && !result.items.length &&
    result.notes?.some((note) => note.startsWith("未匹配到已收录的拒审原因。"));
}

const ACTION_LABELS = { code: "改代码", console: "后台配置", materials: "材料准备", manual_check: "人工核对" };

function actionLabels(item) {
  return (item.action_categories || []).map((category) => ACTION_LABELS[category]).filter(Boolean).join(" / ");
}

function appendActionCategories(lines, item) {
  const labels = actionLabels(item);
  if (labels) lines.push(`- 操作类别：${labels}`);
}

function relevanceLabel(item) {
  return item.relevance === "direct" ? "直接相关" : item.relevance === "possible" ? "可能相关" : "";
}

function matchBasis(item) {
  if (!item.matchEvidence) return "";
  const { aliases = [], codes = [], partialAliases = [] } = item.matchEvidence;
  const parts = [];
  if (codes.length) parts.push(`错误码：${codes.join("、")}`);
  if (aliases.length) parts.push(`完整关键词：${aliases.join("、")}`);
  if (partialAliases.length) parts.push(`短词扩展：${partialAliases.join("、")}`);
  if (item.relevance === "possible") parts.push("需结合完整反馈和实际功能核对");
  return `匹配依据：${escapeMarkdownInline(parts.join("；"))}`;
}

function confidenceLabel(item) {
  const label = new Map([['high', '高'], ['medium', '中'], ['low', '低']]).get(item.confidence);
  return label ? `规则置信度：${label}（规则维护者对规则准确性的把握，不是命中概率或过审保证）` : '';
}

export function toMarkdown(result, { hiddenNonBlockerCount = 0 } = {}) {
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
  const order = FLOW.map((stage) => stage.stage);
  const byStage = new Map();
  for (const it of result.items) {
    if (!byStage.has(it.stage)) byStage.set(it.stage, []);
    byStage.get(it.stage).push(it);
  }
  // 同一阶段内按严重度排序：阻断 → 警告 → 提示（稳定排序，平级保持原序）
  const pushStageMd = (title, items) => {
    lines.push(`## ${title}`, "");
    const sorted = [...items].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
    for (const it of sorted) {
      lines.push(`### ${SEV_ICON[it.severity] || "•"} ${it.title}  \`${it.ruleId}\``);
      appendActionCategories(lines, it);
      if (confidenceLabel(it)) lines.push(`- ${confidenceLabel(it)}`);
      if (it.why) lines.push(`- 为什么：${it.why}`);
      for (const r of it.requires || []) lines.push(`- [ ] ${r}`);
      if (it.manual_required) lines.push(`- 👤 需人工确认/处理`);
      if (it.official_url) lines.push(`- 来源：${it.official_url}（最后核验 ${it.last_verified}）`);
      lines.push("");
    }
  };
  for (const stage of order) {
    const items = byStage.get(stage);
    if (!items || !items.length) continue;
    pushStageMd(`${STAGE_TITLE.get(stage)}（${stage}）`, items);
  }
  // V6：未知 stage 的条目此前被静默丢弃，而概览计数与 CLI 退出码都包含它们——
  // 报告自相矛盾，阻断项甚至可能不可见。兜底渲染成"其他"段，绝不吞条目。
  for (const [stage, items] of byStage) {
    if (STAGE_TITLE.has(stage) || !items.length) continue;
    pushStageMd(`其他（${stage}）`, items);
  }

  // 可能适用 · 自查区：内容相关规则（取决于业务），不计入上面的确定阻断概览。
  if (result.selfCheck?.length) {
    lines.push("## 可能适用 · 请按你的业务自查", "");
    lines.push(
      "> 以下规则是否适用取决于你的小程序具体功能；导航看不到你的源码，无法替你判定，故列出供自查。涉及代码可感知的部分，可运行 `check ./你的项目` 精确判定。",
      "",
    );
    for (const it of result.selfCheck) {
      lines.push(`### ${SEV_ICON[it.severity] || "•"} ${it.title}  \`${it.ruleId}\``);
      if (it.signal?.length) lines.push(`- 自查：若你的小程序涉及【${it.signal.join(" / ")}】`);
      appendActionCategories(lines, it);
      if (confidenceLabel(it)) lines.push(`- ${confidenceLabel(it)}`);
      if (it.why) lines.push(`- 为什么：${it.why}`);
      for (const r of it.requires || []) lines.push(`- [ ] ${r}`);
      if (it.manual_required) lines.push(`- 👤 需人工确认/处理`);
      if (it.official_url) lines.push(`- 来源：${it.official_url}（最后核验 ${it.last_verified}）`);
      lines.push("");
    }
  }

  appendNotes(lines, result);
  if (!result.items.length && !result.selfCheck?.length)
    lines.push(filteredEmptyMessage(hiddenNonBlockerCount) || "_未命中任何规则。_", "");
  return lines.join("\n");
}

// 可勾选清单：把待办动作从叙事里抽出来拍平，按阶段分组 + 严重度排序，便于粘进任务清单。
export function toChecklist(result, { hiddenNonBlockerCount = 0 } = {}) {
  const lines = [];
  const title = result.command === "check" ? "上线预检清单" : "上线导航清单";
  lines.push(`# weapp-shipmate · ${title}（可勾选）`, "");
  lines.push(`> ${DISCLAIMER}`, "");

  if (result.items.some((item) => item.relevance))
    lines.push("> 相关性表示反馈文字与规则的关联，不代表已确认你的项目违规；可能相关项须人工核对。", "");

  const byStage = new Map();
  for (const it of result.items) {
    if (!byStage.has(it.stage)) byStage.set(it.stage, []);
    byStage.get(it.stage).push(it);
  }
  // 优先用 requires（动作项）；无 requires 但有 warn 的导航规则，退而用 warn。
  const stageActions = (items) => {
    const sorted = [...items].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
    const actions = [];
    for (const it of sorted) {
      const icon = SEV_ICON[it.severity] || "•";
      const todos = it.requires?.length ? it.requires : it.warn ? [it.warn] : [];
      const labels = [relevanceLabel(it), actionLabels(it)].filter(Boolean).join(" · ");
      for (const t of todos) actions.push(`- [ ] ${icon} ${t}  （${it.ruleId}${labels ? `；${labels}` : ""}）`);
      if (todos.length && confidenceLabel(it)) actions.push(`  - ${confidenceLabel(it)}`);
      if (matchBasis(it)) actions.push(`  - ${matchBasis(it)}`);
    }
    return actions;
  };
  let total = 0;
  for (const { stage, title } of FLOW) {
    const items = byStage.get(stage);
    if (!items || !items.length) continue;
    const actions = stageActions(items);
    if (!actions.length) continue;
    lines.push(`## ${title}（${stage}）`, ...actions, "");
    total += actions.length;
  }
  // V6：未知 stage 兜底（与 toMarkdown 同理）——清单是行动入口，动作项静默蒸发比叙事丢失更糟。
  for (const [stage, items] of byStage) {
    if (STAGE_TITLE.has(stage) || !items.length) continue;
    const actions = stageActions(items);
    if (!actions.length) continue;
    lines.push(`## 其他（${stage}）`, ...actions, "");
    total += actions.length;
  }

  // 可能适用 · 自查清单（取决于业务，条件触达）。
  if (result.selfCheck?.length) {
    const actions = [];
    for (const it of result.selfCheck) {
      const icon = SEV_ICON[it.severity] || "•";
      const cond = it.signal?.length ? `若涉及【${it.signal.join(" / ")}】：` : "";
      const todos = it.requires?.length ? it.requires : it.warn ? [it.warn] : [];
      for (const t of todos) actions.push(`- [ ] ${icon} ${cond}${t}  （${it.ruleId}${actionLabels(it) ? `；${actionLabels(it)}` : ""}）`);
      if (todos.length && confidenceLabel(it)) actions.push(`  - ${confidenceLabel(it)}`);
    }
    if (actions.length) {
      lines.push("## 可能适用 · 自查（取决于你的业务）", ...actions, "");
      total += actions.length;
    }
  }

  appendNotes(lines, result);

  if (!total && !hasUnmatchedAdvice(result)) {
    const filteredEmpty = !result.items.length && !result.selfCheck?.length;
    lines.push(
      (filteredEmpty && filteredEmptyMessage(hiddenNonBlockerCount)) || "_无可执行清单项；不代表已检查完整或检查通过。_",
      "",
    );
  }
  return lines.join("\n");
}

// 拒因反查渲染：按"拒审原因"分组（而非 flow 阶段），每组列出背后已核验规则的修复步骤与官方来源。
export function toExplain(result, { hiddenNonBlockerCount = 0 } = {}) {
  const lines = [];
  lines.push("# weapp-shipmate · 拒因解读", "");
  lines.push(`> ${DISCLAIMER}`, "");
  if (hasUnmatchedAdvice(result)) {
    if (result.meta?.query) lines.push(`查询：「${escapeMarkdownInline(result.meta.query)}」`, "");
  } else if (result.meta?.summary) lines.push(explainSummaryForMarkdown(result), "");

  if (result.items.some((item) => item.relevance))
    lines.push("> 相关性表示反馈文字与规则的关联，不代表已确认你的项目违规；可能相关项须人工核对。", "");

  // 按相关性与 rejectId 分组，保持 items 的命中排序（直接相关优先）
  const byReject = new Map();
  for (const it of result.items) {
    const key = `${it.relevance || ""}:${it.rejectId || "_"}`;
    if (!byReject.has(key)) byReject.set(key, { summary: it.rejectSummary, items: [] });
    byReject.get(key).items.push(it);
  }
  for (const { summary, items } of byReject.values()) {
    const label = relevanceLabel(items[0]);
    lines.push(`## ${summary}${label ? ` · ${label}` : ""}`, "");
    if (matchBasis(items[0])) lines.push(`- ${matchBasis(items[0])}`, "");
    const sorted = [...items].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
    for (const it of sorted) {
      lines.push(`### ${SEV_ICON[it.severity] || "•"} ${it.title}  \`${it.ruleId}\``);
      appendActionCategories(lines, it);
      if (confidenceLabel(it)) lines.push(`- ${confidenceLabel(it)}`);
      if (it.why) lines.push(`- 为什么：${it.why}`);
      for (const r of it.requires || []) lines.push(`- [ ] ${r}`);
      if (it.manual_required) lines.push(`- 👤 需人工确认/处理`);
      if (it.official_url) lines.push(`- 来源：${it.official_url}（最后核验 ${it.last_verified}）`);
      lines.push("");
    }
  }

  appendNotes(lines, result);
  if (!result.items.length && (hiddenNonBlockerCount > 0 || !hasUnmatchedAdvice(result)))
    lines.push(filteredEmptyMessage(hiddenNonBlockerCount) || "_未匹配到已收录的拒审原因。_", "");
  return lines.join("\n");
}

export function render(result, format = "markdown", options = {}) {
  if (format === "json") return toJson(result);
  if (format === "checklist") return toChecklist(result, options);
  if (result.command === "explain") return toExplain(result, options);
  return toMarkdown(result, options);
}
