// scripts/validate.mjs —— weapp-shipmate 数据校验门禁（CI 与 `npm test` 入口）
// 校验：1) schemas/*.json 自身合法；2) flow.yaml + rules/*.yaml 符合 schema；
//       3) flow 图完整性（指向存在/唯一入口/唯一终点/无环/全可达）；4) 跨文件 stage 一致性 + 规则 id 全局唯一。
// schema 通过 ≠ 图合法 —— 图完整性是 JSON Schema 抓不到的跨节点约束（见 docs/03）。
// G4（STRENGTHENING_PLAN 阶段1）：linter 抽为纯函数导出，负向测试见 tests/validate.test.mjs——
// 门禁自身必须可证伪，否则"喂坏数据会不会红"只是信仰。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

/** 生产门禁的 Ajv 装配（allErrors + strict:false + ajv-formats）。导出供测试复用**同一装配**——
 *  strict:false 下若丢失 addFormats，format:"date" 不会报错而是被静默忽略（unknown format ignored），
 *  测试若自建实例会锁不住这条走廊（2026-07-16 复核）。 */
export function createAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/** flow 图 linter：指向存在、唯一入口/终点、无环、链路全可达（抓分离环/游离节点）。 */
export function lintFlowGraph(flow) {
  const errors = [];
  const stages = (flow.stages ?? []).map((s) => s.stage);
  const stageSet = new Set(stages);
  if (stageSet.size !== stages.length)
    errors.push(`flow stage 名重复: ${stages.filter((s, i) => stages.indexOf(s) !== i).join(",")}`);
  const node = Object.fromEntries((flow.stages ?? []).map((s) => [s.stage, s]));
  for (const s of flow.stages ?? []) {
    if (s.next != null && !stageSet.has(s.next)) errors.push(`flow next 指向不存在: ${s.next}`);
    for (const r of s.requires_stage ?? [])
      if (!stageSet.has(r)) errors.push(`flow requires_stage 指向不存在: ${r}`);
  }
  const terminals = (flow.stages ?? []).filter((s) => s.next == null).map((s) => s.stage);
  if (terminals.length !== 1) errors.push(`flow 终点数 != 1: ${terminals}`);
  const targets = new Set((flow.stages ?? []).map((s) => s.next).filter(Boolean));
  const entries = stages.filter((s) => !targets.has(s));
  if (entries.length !== 1) errors.push(`flow 入口数 != 1: ${entries}`);
  let chain = [];
  if (entries.length === 1) {
    const seen = [];
    let cur = entries[0];
    while (cur != null) {
      if (seen.includes(cur)) { errors.push(`flow 存在环: ${[...seen, cur]}`); break; }
      seen.push(cur);
      cur = node[cur]?.next; // ?.：next 悬空时 linter 自身不得 TypeError 崩溃（报错误而非崩）
    }
    // 全可达：链路必须覆盖全部 stage——入口/终点数正常但存在分离环/游离节点时，原三项检查全部沉默。
    if (errors.length === 0 && seen.length !== stages.length)
      errors.push(`flow 链路未覆盖全部阶段(可达 ${seen.length}/${stages.length})，游离: ${stages.filter((s) => !seen.includes(s)).join(",")}`);
    chain = seen;
  }
  return { errors, stageSet, terminals, entries, chain };
}

/** rules 文档 linter：stage 必须在 flow 中；规则 id 全局唯一（重复会在 explain/rejections 层被静默遮蔽）。 */
export function lintRules(docs, stageSet) {
  const errors = [];
  const ruleIds = new Set();
  const draftRuleIds = new Set(); // draft 规则 id——供 lintRejections 拦截"非 draft 拒因引用 draft 规则"的旁路
  let total = 0;
  for (const { file, doc } of docs) {
    for (const r of doc?.rules ?? []) {
      total++;
      if (ruleIds.has(r.id)) errors.push(`重复规则 id: ${r.id} @ ${file}（后加载者会静默遮蔽先加载者）`);
      ruleIds.add(r.id);
      if (r.draft) draftRuleIds.add(r.id);
      if (!stageSet.has(r.stage)) errors.push(`${file} 规则 ${r.id} 的 stage ${r.stage} 不在 flow 中`);
    }
  }
  return { errors, ruleIds, draftRuleIds, total };
}

/** rejections 引用完整性：每个拒因映射的 rule id 必须真实存在；非 draft 拒因不得引用 draft 规则。
 *  后者是 2026-07-16 审计上锁项：explain 以 includeDrafts:true 解析规则链接（src/explain.mjs），
 *  "draft 门禁在 rejections 层把关"此前只是注释里的口头约定——一旦某规则被降级为 draft 而拒因仍
 *  引用它，未核验内容会进入默认 explain 输出且 CI 全绿，击穿"默认输出绝不含未核验断言"的治理承诺。 */
export function lintRejections(rejections, ruleIds, draftRuleIds = new Set()) {
  const errors = [];
  for (const rj of rejections.rejections ?? []) {
    for (const rid of rj.rules ?? []) {
      if (!ruleIds.has(rid)) {
        errors.push(`rejections ${rj.id} 引用了不存在的规则 id: ${rid}`);
        continue;
      }
      if (!rj.draft && draftRuleIds.has(rid))
        errors.push(`rejections ${rj.id}（非 draft）引用了 draft 规则 ${rid}——未核验内容将进入默认 explain 输出`);
    }
  }
  return errors;
}

function main() {
  const ROOT = process.cwd();
  const errors = [];
  const ok = (m) => console.log("OK   " + m);
  const fail = (m) => errors.push(m);

  const ajv = createAjv();

  const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf-8"));
  const readYaml = (p) => yaml.load(readFileSync(join(ROOT, p), "utf-8"));

  const rulesSchema = readJson("schemas/rules.schema.json");
  const flowSchema = readJson("schemas/flow.schema.json");
  const rejectionsSchema = readJson("schemas/rejections.schema.json");
  const validateRules = ajv.compile(rulesSchema);
  const validateFlow = ajv.compile(flowSchema);
  const validateRejections = ajv.compile(rejectionsSchema);

  // 1) flow.yaml schema
  const flow = readYaml("flow.yaml");
  if (validateFlow(flow)) ok("flow.yaml 符合 schema");
  else fail("flow.yaml schema: " + ajv.errorsText(validateFlow.errors));

  // 2) flow 图 linter
  const g = lintFlowGraph(flow);
  for (const e of g.errors) fail(e);
  if (errors.length === 0)
    ok(`flow 图: 入口=${g.entries[0]} 终点=${g.terminals[0]} 链路=${g.chain.join("->")}`);

  // 3) rules/*.yaml schema + 跨文件 stage 一致性 + id 唯一
  const docs = [];
  for (const f of readdirSync(join(ROOT, "rules")).filter((f) => f.endsWith(".yaml")).sort()) {
    const doc = readYaml(join("rules", f));
    if (validateRules(doc)) ok(`rules/${f} (${doc.rules.length} 条)`);
    else fail(`rules/${f}: ` + ajv.errorsText(validateRules.errors));
    docs.push({ file: `rules/${f}`, doc });
  }
  const r = lintRules(docs, g.stageSet);
  for (const e of r.errors) fail(e);

  // 3b) rejections.yaml schema + 引用完整性
  const rejections = readYaml("rejections.yaml");
  if (validateRejections(rejections)) ok(`rejections.yaml (${rejections.rejections.length} 条)`);
  else fail("rejections.yaml schema: " + ajv.errorsText(validateRejections.errors));
  const rjErrors = lintRejections(rejections, r.ruleIds, r.draftRuleIds);
  for (const e of rjErrors) fail(e);
  if (!rjErrors.length && rejections.rejections) ok("rejections 引用的规则 id 全部存在");

  // 4) 两 schema 的 stage 枚举一致
  const re = new Set(rulesSchema.definitions.rule.properties.stage.enum);
  const fe = new Set(flowSchema.definitions.stageEnum.enum);
  const diff = [...re].filter((x) => !fe.has(x)).concat([...fe].filter((x) => !re.has(x)));
  if (diff.length === 0) ok("rules.schema 与 flow.schema 的 stage 枚举一致");
  else fail("两 schema stage 枚举不一致: " + diff);

  console.log("---");
  if (errors.length) {
    console.error("FAIL:");
    for (const e of errors) console.error(" - " + e);
    process.exit(1);
  }
  console.log(`ALL CHECKS PASSED (${r.total} 条规则, ${g.chain.length} 个阶段)`);
}

// 仅在直接运行时执行 main（被测试 import 时不执行）。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
