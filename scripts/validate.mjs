// scripts/validate.mjs —— weapp-shipmate 数据校验门禁（CI 与 `npm test` 入口）
// 校验：1) schemas/*.json 自身合法；2) flow.yaml + rules/*.yaml 符合 schema；
//       3) flow 图完整性（指向存在/唯一入口/唯一终点/无环）；4) 跨文件 stage 一致性。
// schema 通过 ≠ 图合法 —— 图完整性是 JSON Schema 抓不到的跨节点约束（见 docs/03）。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const ROOT = process.cwd();
const errors = [];
const ok = (m) => console.log("OK   " + m);
const fail = (m) => errors.push(m);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

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
const stages = flow.stages.map((s) => s.stage);
const stageSet = new Set(stages);
const node = Object.fromEntries(flow.stages.map((s) => [s.stage, s]));
for (const s of flow.stages) {
  if (s.next != null && !stageSet.has(s.next)) fail(`flow next 指向不存在: ${s.next}`);
  for (const r of s.requires_stage ?? [])
    if (!stageSet.has(r)) fail(`flow requires_stage 指向不存在: ${r}`);
}
const terminals = flow.stages.filter((s) => s.next == null).map((s) => s.stage);
if (terminals.length !== 1) fail(`flow 终点数 != 1: ${terminals}`);
const targets = new Set(flow.stages.map((s) => s.next).filter(Boolean));
const entries = stages.filter((s) => !targets.has(s));
if (entries.length !== 1) fail(`flow 入口数 != 1: ${entries}`);
if (entries.length === 1) {
  const seen = [];
  let cur = entries[0];
  while (cur != null) {
    if (seen.includes(cur)) { fail(`flow 存在环: ${[...seen, cur]}`); break; }
    seen.push(cur);
    cur = node[cur].next;
  }
  if (errors.length === 0) ok(`flow 图: 入口=${entries[0]} 终点=${terminals[0]} 链路=${seen.join("->")}`);
}

// 3) rules/*.yaml schema + 跨文件 stage 一致性
let total = 0;
const ruleIds = new Set();
for (const f of readdirSync(join(ROOT, "rules")).filter((f) => f.endsWith(".yaml")).sort()) {
  const doc = readYaml(join("rules", f));
  if (validateRules(doc)) ok(`rules/${f} (${doc.rules.length} 条)`);
  else fail(`rules/${f}: ` + ajv.errorsText(validateRules.errors));
  for (const r of doc.rules) {
    total++;
    ruleIds.add(r.id);
    if (!stageSet.has(r.stage)) fail(`rules/${f} 规则 ${r.id} 的 stage ${r.stage} 不在 flow 中`);
  }
}

// 3b) rejections.yaml schema + 引用完整性：每个拒因映射的 rule id 必须真实存在
const rejections = readYaml("rejections.yaml");
if (validateRejections(rejections)) ok(`rejections.yaml (${rejections.rejections.length} 条)`);
else fail("rejections.yaml schema: " + ajv.errorsText(validateRejections.errors));
let danglingLinks = 0;
for (const rj of rejections.rejections ?? []) {
  for (const rid of rj.rules ?? [])
    if (!ruleIds.has(rid)) { fail(`rejections ${rj.id} 引用了不存在的规则 id: ${rid}`); danglingLinks++; }
}
if (!danglingLinks && rejections.rejections) ok("rejections 引用的规则 id 全部存在");

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
console.log(`ALL CHECKS PASSED (${total} 条规则, ${stages.length} 个阶段)`);
