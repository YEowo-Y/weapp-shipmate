import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowArtifact } from '../desktop/design-previews/workflow-artifact.js';
import { createWorkflowCatalog } from '../src/project-artifact.mjs';

const now = 1794000000000;
function snapshot() {
  return {project:{id:'p1',name:'准备上线',directory:'C:/private/project',revision:3,contextRevision:2,subject:'personal',facts:{businessType:'餐饮',hasPayment:true,collectsSensitive:null,hasServerDomain:false}},
    catalog:createWorkflowCatalog(),rulesVersion:'rules-v1',confirmations:[]};
}

test('workflow export includes all stages, saved facts, conditional materials and source evidence', () => {
  const input = snapshot(), before = JSON.stringify(input);
  const artifact = createWorkflowArtifact(input, now);
  assert.equal(artifact.filename, `shipmate-workflow-${now}.md`);
  assert.equal(artifact.mimeType, 'text/markdown;charset=utf-8');
  for (const stage of input.catalog.stages) assert.ok(artifact.text.includes(stage.title), stage.stage);
  for (const phrase of ['餐饮', '涉及支付：是', '收集敏感信息：尚未确认', '服务器域名：否', '条件要求', '类目与资质线索', '规则版本：rules-v1', '项目版本：3', '事实版本：2', '未实时核验', '不代表官方审核或发布完成', '未保存草稿不包含']) assert.ok(artifact.text.includes(phrase), phrase);
  assert.match(artifact.text, /https:\/\/developers.weixin.qq.com/);
  assert.match(artifact.text, /下一步/);
  assert.doesNotMatch(artifact.text, /C:\/private\/project/);
  assert.equal(JSON.stringify(input), before);
});

test('workflow export distinguishes current, stale and revoked confirmations', () => {
  const input = snapshot();
  input.confirmations = [{stageId:'registration',state:'confirmed',recordedAt:now-1000,contextRevision:2,rulesVersion:'rules-v1',note:'本人核对账号'}];
  assert.match(createWorkflowArtifact(input, now).text, /状态：人工已确认/);
  input.project.contextRevision++;
  const stale = createWorkflowArtifact(input, now).text;
  assert.match(stale, /状态：待重检/);
  assert.match(stale, /历史记录：人工已确认/);
  assert.match(stale, /本人核对账号/);
  input.confirmations.push({...input.confirmations[0],state:'pending',recordedAt:now,note:'已撤销'});
  assert.match(createWorkflowArtifact(input, now).text, /历史记录：待确认/);
});

test('restored confirmations retain their external origin, original decision and local pending state', () => {
  const input = snapshot();
  input.confirmations = [{stageId:'registration',state:'pending',sourceState:'confirmed',provenance:'imported',
    recordedAt:now-5000,contextRevision:1,rulesVersion:'backup-v1',note:'从备份恢复的备注'}];
  const text = createWorkflowArtifact(input, now).text;
  assert.match(text, /状态：待确认/);
  assert.match(text, /备份记录（未在本机核验）：人工已确认/);
  assert.match(text, /备份备注：从备份恢复的备注/);
  assert.doesNotMatch(text, /历史记录：人工已确认/);
  Object.assign(input.confirmations[0], {recordedAt:Number.MAX_SAFE_INTEGER, sourceState:'stale'});
  assert.match(createWorkflowArtifact(input, now).text, /备份记录（未在本机核验）：未记录 · 记录日期未知/);
});

test('rule manifests are listed once with the historical and current versions still distinguishable', () => {
  const input = snapshot();
  input.rulesVersion = JSON.stringify({'rules/example.yaml':'a'.repeat(64)});
  input.confirmations = [{stageId:'registration',state:'confirmed',contextRevision:1,recordedAt:now,
    rulesVersion:JSON.stringify({'rules/example.yaml':'b'.repeat(64)})}];
  const text = createWorkflowArtifact(input, now).text;
  assert.match(text, /规则版本：清单 1/);
  assert.match(text, /记录依据：事实版本 1 · 规则版本 清单 2/);
  assert.match(text, /### 清单 1[\s\S]*a{64}[\s\S]*### 清单 2[\s\S]*b{64}/);
  input.confirmations[0].rulesVersion = input.rulesVersion;
  assert.equal(createWorkflowArtifact(input, now).text.split('a'.repeat(64)).length, 2);
});

test('workflow export escapes user text and ignores unsafe source links', () => {
  const input = snapshot();
  input.project.name = '<img src=x>\n# injected';
  input.project.facts.businessType = '[click](javascript:alert(1))';
  input.catalog.stages[0] = {...input.catalog.stages[0],official_url:'javascript:alert(1)'};
  const text = createWorkflowArtifact(input, now).text;
  assert.doesNotMatch(text, /<img|\n# injected|<javascript:|\[click\]\(javascript:/);
  assert.match(text, /&lt;img/);
});

test('workflow export rejects missing project/catalog and represents sparse coverage honestly', () => {
  assert.throws(() => createWorkflowArtifact({}));
  const input = snapshot(); input.catalog.rules = []; input.project.subject = null;
  const text = createWorkflowArtifact(input, now).text;
  assert.match(text, /主体：尚未确认/);
  assert.match(text, /暂无细化规则/);
  assert.match(text, /暂无匹配线索/);
});
