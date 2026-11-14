import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData, ruleToItem } from '../src/data.mjs';
import { runCheck } from '../src/check.mjs';
import { runGuide } from '../src/guide.mjs';
import { runExplain } from '../src/explain.mjs';
import { render } from '../src/report.mjs';
import { main } from '../src/cli.mjs';
import { dispatch } from '../src/mcp.mjs';
import { validateGuideResult } from '../desktop/design-previews/guide-contract.js';
import { validateExplainResult } from '../desktop/design-previews/explain-contract.js';
import { createGuideArtifact } from '../desktop/design-previews/guide-artifact.js';
import { createExplainArtifact } from '../desktop/design-previews/explain-artifact.js';
import { createHandoff, exportHandoff, parseHandoff } from '../desktop/design-previews/repair-handoff.js';
import { createGuideResultCard } from '../desktop/design-previews/components/message.js';
import { createPreviewDocument } from './helpers/preview-dom.mjs';

const meaning = '规则维护者对规则准确性的把握，不是命中概率或过审保证';
const guideInput = {subject:'personal', sensitive:false, domain:false};

test('CLI JSON and MCP text/structured outputs expose the same recorded confidence', async () => {
  for (const [kind, args, flags] of [['check', {dir:'fixtures/leaky-app'}, ['fixtures/leaky-app']], ['guide', {subject:'personal',sensitive:false,domain:false,payment:false}, ['--subject', 'personal', '--no-sensitive', '--no-domain', '--no-payment']], ['explain', {query:'隐私'}, ['隐私']]]) {
    let stdout = '', stderr = '';
    main(['node', 'cli', kind, ...flags, '--json'], {write:value => { stdout += value; }}, {write:value => { stderr += value; }});
    assert.equal(stderr, '');
    const cli = JSON.parse(stdout);
    for (const format of ['json', 'markdown']) {
      const reply = await dispatch({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:`weapp_shipmate_${kind}`,arguments:{...args,format}}});
      assert.equal(reply.result.isError, false);
      const mcp = reply.result.structuredContent;
      assert.deepEqual(mcp.items.map(item => item.confidence), cli.items.map(item => item.confidence));
      assert.ok(mcp.items.some(item => ['high','medium','low'].includes(item.confidence)));
      if (format === 'json') assert.deepEqual(JSON.parse(reply.result.content[0].text), mcp);
      else assert.ok(reply.result.content[0].text.includes(meaning));
    }
  }
});

test('desktop contracts accept only declared confidence values and support legacy reports', () => {
  for (const [result, validate] of [[runGuide({subject_type:'personal'}), validateGuideResult], [runExplain('隐私'), value => validateExplainResult(value, '隐私')]]) {
    for (const confidence of ['high', 'medium', 'low']) {
      result.items[0].confidence = confidence;
      assert.equal(validate(result).ok, true, confidence);
    }
    for (const confidence of ['unknown', '', null, 1, ['high'], {}]) {
      result.items[0].confidence = confidence;
      assert.equal(validate(result).ok, false, JSON.stringify(confidence));
    }
    for (const item of [...result.items, ...(result.selfCheck || [])]) delete item.confidence;
    assert.equal(validate(result).ok, true, 'legacy report');
  }
});

test('desktop exports and visible guide evidence retain confidence and imported provenance', () => {
  const result = runGuide({subject_type:'personal'});
  assert.match(createGuideArtifact(guideInput, result, 'markdown').text, /规则置信度：高/);
  assert.match(createGuideArtifact(guideInput, result, 'markdown').text, /规则置信度：中/);
  assert.deepEqual(JSON.parse(createGuideArtifact(guideInput, result, 'json').text), result);
  assert.ok(createExplainArtifact('隐私', runExplain('隐私')).text.includes(meaning));
  const imported = createGuideArtifact(guideInput, result, 'markdown', {provenance:'imported'}).text;
  assert.match(imported, /备份记录的规则置信度/);
  assert.match(imported, /外部会话备份/);
  const flat = node => [node, ...node.children.flatMap(flat)];
  for (const provenance of [undefined, 'imported']) {
    const card = createGuideResultCard(createPreviewDocument(), result, {provenance});
    assert.ok(flat(card).some(node => node.textContent.includes(`${provenance ? '备份记录的' : ''}规则置信度：高`) && node.textContent.includes(meaning)));
  }
  for (const item of [...result.items, ...result.selfCheck]) delete item.confidence;
  assert.doesNotMatch(createGuideArtifact(guideInput, result, 'markdown').text, /规则置信度/);
  assert.ok(flat(createGuideResultCard(createPreviewDocument(), result)).every(node => !node.textContent.includes('规则置信度')));
});

test('handoff roundtrip preserves confidence, validates imported values and accepts legacy items', () => {
  for (const kind of ['check', 'guide', 'explain']) {
    const result = kind === 'check' ? runCheck('fixtures/leaky-app') : kind === 'guide' ? runGuide({subject_type:'personal'}) : runExplain('隐私');
    const source = {id:'a1',runId:'r1',projectId:null,projectRevision:null,contextRevision:null,title:'历史报告',kind,createdAt:1792700000000,toolVersion:'1.0',rulesVersion:'rules-1',provenance:'imported',data:{schemaVersion:1,kind,result}};
    const pack = createHandoff(source);
    const original = [...result.items, ...(result.selfCheck || [])];
    assert.deepEqual(pack.items.map(item => item.rule.confidence), original.map(item => item.confidence));
    assert.deepEqual(parseHandoff(exportHandoff(pack, 'json').text), pack);
    assert.match(exportHandoff(pack, 'markdown').text, /备份记录的规则置信度：[高中低]/);
    assert.match(exportHandoff(pack, 'markdown').text, /外部导入报告.*未在本机核验/);
    pack.items[0].rule.confidence = 'certain';
    assert.throws(() => parseHandoff(JSON.stringify(pack)));
    for (const item of pack.items) delete item.rule.confidence;
    assert.deepEqual(parseHandoff(JSON.stringify(pack)), pack);
    assert.doesNotMatch(exportHandoff(pack, 'markdown').text, /规则置信度/);
  }
});

test('check, guide and explain retain confidence from the rule catalog without rating synthetic items', () => {
  const rules = new Map(loadData().rules.map(rule => [rule.id, rule]));
  const outputs = [runCheck('fixtures/leaky-app'), runGuide({subject_type:'personal'}), runExplain('隐私')];
  for (const result of outputs) {
    const json = JSON.parse(render(result, 'json'));
    assert.ok(json.items.length);
    for (const item of [...json.items, ...(json.selfCheck || [])]) {
      const rule = rules.get(item.ruleId);
      if (rule) assert.equal(item.confidence, rule.confidence, `${result.command}: ${item.ruleId}`);
      else assert.equal(Object.hasOwn(item, 'confidence'), false, item.ruleId);
    }
  }
  assert.ok(outputs[0].items.some(item => !rules.has(item.ruleId)), 'exercise synthesized cross-check findings');
  assert.ok(outputs[1].items.some(item => item.ruleId.startsWith('flow.')), 'exercise stage navigation entries');
  assert.ok(outputs[1].selfCheck.some(item => item.confidence === 'medium'), 'exercise conditional category guidance');
});

test('rule projection retains each declared confidence and never invents a missing rating', () => {
  for (const confidence of ['high', 'medium', 'low']) {
    const rule = {id:'test.rule',title:'规则',stage:'privacy',severity:'warning',confidence};
    assert.equal(ruleToItem(Object.freeze(rule)).confidence, confidence);
  }
  assert.equal(Object.hasOwn(ruleToItem({id:'legacy.rule'}), 'confidence'), false);
});

test('all report formats distinguish confidence from severity and preserve conditional guidance', () => {
  for (const command of ['check', 'guide', 'explain']) for (const [confidence, label] of [['high','高'], ['medium','中'], ['low','低']]) {
    const item = {ruleId:'test.rule', title:'规则标题', stage:'privacy', severity:'blocker', requires:['核对实际用途'], confidence,
      rejectId:'test.reject', rejectSummary:'拒因', relevance:'possible'};
    const result = {command, meta:{summary:'摘要'}, items:[item], notes:[], ...(command === 'guide' ? {selfCheck:[{...item,ruleId:'conditional.rule',signal:['相关业务']}]} : {})};
    for (const format of ['markdown','checklist']) {
      const markdown = render(result, format);
      assert.ok(markdown.includes(`规则置信度：${label}`), `${command}/${format}/${confidence}`);
      assert.ok(markdown.includes(meaning));
      assert.match(markdown, /核对实际用途/);
      if (command === 'guide') assert.ok(markdown.slice(markdown.indexOf('## 可能适用')).includes(`规则置信度：${label}`));
    }
    assert.equal(JSON.parse(render(result, 'json')).items[0].confidence, confidence);
    assert.equal(item.severity, 'blocker');
  }
});

test('legacy reports without confidence remain unrated in Markdown and checklists', () => {
  const result = {command:'check',items:[{ruleId:'legacy',title:'历史规则',stage:'privacy',severity:'warning',requires:['核对要求']}],notes:[]};
  for (const format of ['markdown','checklist']) {
    assert.doesNotMatch(render(result, format), /规则置信度/);
    assert.match(render(result, format), /核对要求/);
  }
});
