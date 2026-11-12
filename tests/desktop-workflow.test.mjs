import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
import { deriveWorkflow } from '../src/workflow.mjs';
import { createWorkflowArtifact } from '../desktop/design-previews/workflow-artifact.js';
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../desktop/src/workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const project = {id:'a',name:'Project A',revision:2,contextRevision:1,subject:'personal',facts:{businessType:'门店',hasPayment:null,collectsSensitive:null,hasServerDomain:null}};
test('workflow exports saved snapshot without drafts or native writes and reports retryable download failures', async () => {
  const h = harness(); h.controller.open(h.node('trigger')); await h.settle();
  h.node('workflow-businessType').value = 'unsaved private draft'; await h.fire('workflow-businessType','input');
  const before = h.calls.length;
  await h.fire('workflow-export');
  assert.equal(h.downloads.length, 1);
  assert.match(h.downloads[0].text, /实际业务：门店/);
  assert.doesNotMatch(h.downloads[0].text, /unsaved private draft/);
  assert.match(h.node('workflow-status').textContent, /已发起下载/);
  assert.equal(h.calls.length, before);
  h.setDownloadOK(false); await h.fire('workflow-export');
  assert.match(h.node('workflow-status').textContent, /无法下载/);
  h.setDownloadOK(true); await h.fire('workflow-export');
  assert.match(h.node('workflow-status').textContent, /已发起下载/);
  h.controller.destroy(); assert.equal(h.disposed(), true);
  await h.fire('workflow-export'); assert.equal(h.downloads.length, 3);
});

test('report fact links preserve drafts and only focus the requested project after loading', async () => {
  const h = harness();
  h.controller.open(h.node('trigger')); await h.settle();
  h.node('workflow-businessType').value = '业务草稿'; await h.fire('workflow-businessType', 'input');
  h.controller.close();
  for (const field of ['collectsSensitive', 'hasServerDomain']) {
    assert.equal(h.controller.openFacts('a', field, h.node('trigger')), true);
    await h.settle();
    assert.equal(h.doc.activeElement, h.node('workflow-' + field));
    assert.equal(h.node('workflow-facts').open, true);
    assert.equal(h.node('workflow-businessType').value, '业务草稿');
    h.controller.close();
  }
  const reads = h.calls.length;
  assert.equal(h.controller.openFacts('other', 'collectsSensitive', h.node('trigger')), false);
  assert.equal(h.calls.length, reads);
  assert.ok(h.calls.every(([cmd]) => cmd === 'project_workflow'));
  let resolve;
  const delayed = harness({ custom: () => new Promise(done => { resolve = done; }) });
  delayed.controller.openFacts('a', 'hasServerDomain', delayed.node('trigger'));
  delayed.setCurrent({ ...project, id: 'other' });
  resolve(delayed.snapshot); await delayed.settle();
  assert.notEqual(delayed.doc.activeElement, delayed.node('workflow-hasServerDomain'));
  assert.equal(delayed.node('workflow-content').hidden, true);
});

test('workflow export guards no project, failed loading, busy state and stale project events', async () => {
  for (const config of [{current:null}, {fail:true}]) {
    const h=harness(config);h.controller.open(h.node('trigger'));await h.settle();await h.fire('workflow-export');
    assert.equal(h.downloads.length,0);assert.equal(h.node('workflow-export').disabled,true);
  }
  const h=harness();h.controller.open(h.node('trigger'));await h.settle();
  h.controller.setBusy(true);await h.fire('workflow-export');assert.equal(h.downloads.length,0);
  h.controller.setBusy(false);h.setCurrent({...project,id:'b',name:'Project B'});
  await h.fire('workflow-export');assert.equal(h.downloads.length,0);
  assert.equal(h.node('workflow-content').hidden,true);
});

function harness({ current = project, fail = false, custom } = {}) {
  const doc = createPreviewDocument(), nodes = new Map(), calls = [], downloads = [];
  let downloadOK = true, disposed = false;
  const descendants = root => root.children.flatMap(child => [child, ...descendants(child)]);
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => Object.assign(create(tag), {value:'',disabled:false,open:false,events:{},addEventListener(type,fn){(this.events[type]??=[]).push(fn);},removeEventListener(){},focus(){doc.activeElement=this;},scrollIntoView(){this.scrolled=true;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.forEach(fn=>fn({}));},contains(other){return other===this || descendants(this).includes(other);},querySelectorAll(selector){return descendants(this).filter(child=>selector==='details[open]'?child.tag==='details'&&child.open:selector.split(',').includes(child.tag));}});
  const node = id => { if(!nodes.has(id))nodes.set(id,doc.createElement('div'));return nodes.get(id); };
  doc.querySelector = query=>node(query.slice(1));doc.getElementById=id=>[...nodes.values()].flatMap(root=>[root,...descendants(root)]).find(item=>item.id===id)??nodes.get(id);doc.body=doc.createElement('body');
  const snapshot = {project,catalog:{schemaVersion:1,stages:[{stage:'registration',title:'注册账号'}],rules:[]},rulesVersion:'v1',confirmations:[]};
  const context={document:doc,URL,deriveWorkflow,createWorkflowArtifact,createArtifactDownloader:()=>({download:artifact=>{downloads.push(artifact);return downloadOK;},dispose:()=>{disposed=true;}}),createIcon:()=>doc.createElement('svg'),openUrl:async()=>{},invoke:async(cmd,args)=>{calls.push([cmd,args]);if(custom){const result=await custom(cmd,args);if(result!==undefined)return result;}if(fail)throw Error('storage unavailable');return snapshot;}};
  vm.createContext(context);vm.runInContext(`${script}\nglobalThis.mount=mountWorkflow`,context);
  let changes=0, externalBusy=false;
  const controller=context.mount({getProject:()=>current,isBusy:()=>externalBusy,onProjectChanged:async()=>{changes++;}});
  const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  const fire=async(id,event='click')=>{node(id).events[event]?.forEach(fn=>fn({preventDefault(){}}));await settle();};
  return {controller,node,calls,doc,snapshot,settle,fire,downloads,setDownloadOK:value=>{downloadOK=value;},disposed:()=>disposed,changes:()=>changes,setExternalBusy:v=>{externalBusy=v;},setFail:v=>{fail=v;},setCurrent:v=>{current=v;}};
}
test('workflow has a project-empty state and never invents a native project',async()=>{
  const app=harness({current:null});app.controller.open(app.node('trigger'));await app.settle();assert.match(app.node('workflow-status').textContent,/选择或创建项目/);assert.equal(app.calls.length,0);assert.equal(app.node('workflow-content').hidden,true);
});

test('workflow shows factual counts and explicit next-step navigation without confirming anything',async()=>{
  const app=harness();app.controller.open(app.node('trigger'));await app.settle();
  assert.match(app.node('workflow-overview').textContent,/人工确认 0.*待处理 1/);
  assert.match(app.node('workflow-facts-summary').textContent,/3 项待补充/);
  assert.equal(app.node('workflow-facts').open,true);
  await app.fire('workflow-next-open');
  const row=app.node('workflow-stages').children[0];assert.equal(row.open,true);assert.equal(app.doc.activeElement.id,'workflow-stage-registration');
  assert.equal(app.calls.some(call=>call[0]==='project_stage_confirm'),false);
  await app.fire('workflow-facts-open');assert.equal(app.doc.activeElement,app.node('workflow-businessType'));
});

test('unknown next stages navigate to the relevant fact without saving or confirming', async () => {
  for (const [stage, expression, field] of [['privacy', 'collects_sensitive == true', 'collectsSensitive'], ['domain', 'has_server_domain == true', 'hasServerDomain']]) {
    const app = harness();
    app.snapshot.catalog.stages = [{ stage, title: '待核对阶段', applies_when: expression }];
    app.controller.open(app.node('trigger')); await app.settle();
    app.node('workflow-facts').open = false;
    app.node('workflow-businessType').value = '尚未保存的草稿'; await app.fire('workflow-businessType', 'input');
    const before = app.calls.length;
    assert.equal(app.node('workflow-next-open').textContent, '补充项目事实');
    await app.fire('workflow-next-open');
    assert.equal(app.node('workflow-facts').open, true);
    assert.equal(app.doc.activeElement, app.node('workflow-' + field));
    assert.equal(app.node('workflow-businessType').value, '尚未保存的草稿');
    assert.equal(app.calls.length, before);
    app.snapshot.project = { ...project, facts: { ...project.facts, [field]: false } };
    await app.controller.refresh(); await app.settle();
    assert.equal(app.node('workflow-next-open').textContent, '查看下一步');
    await app.fire('workflow-next-open');
    assert.equal(app.doc.activeElement.id, 'workflow-stage-' + stage);
    app.controller.destroy();
  }
});

test('workflow retains unsaved facts and stage notes across refresh and reopening, isolated by project',async()=>{
  const app=harness({custom:(cmd,args)=>cmd==='project_workflow'?{...app.snapshot,project:{...project,id:args.projectId,name:args.projectId}}:undefined});
  app.controller.open(app.node('trigger'));await app.settle();
  app.node('workflow-businessType').value='未保存的门店业务';await app.fire('workflow-businessType','input');
  const note=app.doc.getElementById('workflow-note-registration');note.value='等待核对的备注';note.events.input[0]();
  await app.controller.refresh();await app.settle();
  assert.equal(app.node('workflow-businessType').value,'未保存的门店业务');assert.equal(app.doc.getElementById('workflow-note-registration').value,'等待核对的备注');
  await app.fire('workflow-close');app.controller.open(app.node('trigger'));await app.settle();
  assert.equal(app.node('workflow-businessType').value,'未保存的门店业务');assert.equal(app.doc.getElementById('workflow-note-registration').value,'等待核对的备注');
  app.setCurrent({...project,id:'b'});await app.controller.refresh();await app.settle();
  assert.equal(app.node('workflow-businessType').value,'门店');assert.equal(app.doc.getElementById('workflow-note-registration').value,'');
  app.setCurrent(project);await app.controller.refresh();await app.settle();assert.equal(app.doc.getElementById('workflow-note-registration').value,'等待核对的备注');
});

test('workflow blocks changed persisted facts until explicit draft discard, then saves against the new basis',async()=>{
  const app=harness({custom:(cmd,args)=>{
    if(cmd==='project_facts_save'){app.snapshot.project={...app.snapshot.project,facts:args.facts};return {};}
    return undefined;
  }});
  app.controller.open(app.node('trigger'));await app.settle();
  app.node('workflow-businessType').value='用户草稿';await app.fire('workflow-businessType','input');
  app.snapshot.project={...project,revision:3,contextRevision:2,facts:{...project.facts,businessType:'另处已保存',hasServerDomain:true}};
  await app.controller.refresh();await app.settle();assert.equal(app.node('workflow-businessType').value,'用户草稿');
  await app.fire('workflow-facts-form','submit');assert.equal(app.calls.some(call=>call[0]==='project_facts_save'),false);
  assert.match(app.doc.getElementById('workflow-facts-conflict').textContent,/另处已保存/);
  await app.fire('workflow-close');app.controller.open(app.node('trigger'));await app.settle();
  await app.fire('workflow-facts-form','submit');assert.equal(app.calls.some(call=>call[0]==='project_facts_save'),false);
  app.doc.getElementById('workflow-facts-discard').events.click[0]();await app.settle();assert.equal(app.node('workflow-businessType').value,'另处已保存');
  assert.equal(app.doc.getElementById('workflow-facts-conflict').hidden,true);
  app.node('workflow-businessType').value='重新核对后的业务';await app.fire('workflow-businessType','input');
  await app.fire('workflow-facts-form','submit');const write=app.calls.find(call=>call[0]==='project_facts_save')[1];assert.equal(write.expectedRevision,3);assert.equal(write.facts.businessType,'重新核对后的业务');assert.equal(write.facts.hasServerDomain,true);
  assert.doesNotMatch(app.node('workflow-facts-summary').textContent,/未保存/);
});

test('workflow requires rechecking a retained stage note when context, rules or confirmation changed',async()=>{
  for(const change of [app=>{app.snapshot.project={...project,revision:3,contextRevision:2};},app=>{app.snapshot.rulesVersion='v2';},app=>{app.snapshot.confirmations=[{stageId:'registration',state:'confirmed',contextRevision:1,rulesVersion:'v1',recordedAt:2,note:'外部核对备注'}];}]){
    const app=harness();app.controller.open(app.node('trigger'));await app.settle();
    const note=app.doc.getElementById('workflow-note-registration');note.value='旧依据上的草稿';note.events.input[0]();change(app);
    await app.controller.refresh();await app.settle();assert.equal(app.doc.getElementById('workflow-note-registration').value,'旧依据上的草稿');
    app.doc.getElementById('workflow-confirm-registration').events.click[0]();await app.settle();assert.equal(app.calls.some(call=>call[0]==='project_stage_confirm'),false);
    assert.match(app.doc.getElementById('workflow-note-hint-registration').textContent,/已变化/);
    app.doc.getElementById('workflow-note-discard-registration').events.click[0]();await app.settle();assert.equal(app.doc.getElementById('workflow-note-registration').value,'');
    app.doc.getElementById('workflow-confirm-registration').events.click[0]();await app.settle();assert.equal(app.calls.filter(call=>call[0]==='project_stage_confirm').length,1);
  }
});

test('workflow keeps note after failed confirmation and clears it only after a successful explicit save',async()=>{
  let fail=true;
  const app=harness({custom:cmd=>{if(cmd==='project_stage_confirm'&&fail)throw Error('write failed');}});
  app.controller.open(app.node('trigger'));await app.settle();
  const note=app.doc.getElementById('workflow-note-registration');note.value='已核对，待提交';note.events.input[0]();
  app.doc.getElementById('workflow-confirm-registration').events.click[0]();await app.settle();
  assert.match(app.node('workflow-status').textContent,/write failed/);
  await app.controller.refresh();assert.equal(app.doc.getElementById('workflow-note-registration').value,'已核对，待提交');
  fail=false;app.doc.getElementById('workflow-confirm-registration').events.click[0]();await app.settle();assert.equal(app.doc.getElementById('workflow-note-registration').value,'');
});

test('workflow respects explicit facts collapse and never counts stale confirmations as current completion',async()=>{
  const app=harness();app.snapshot.confirmations=[{stageId:'registration',state:'confirmed',contextRevision:0,rulesVersion:'v1',recordedAt:1,note:''}];
  app.controller.open(app.node('trigger'));await app.settle();
  assert.match(app.node('workflow-overview').textContent,/人工确认 0.*待处理 1/);
  assert.match(app.node('workflow-stages').textContent,/待重检/);
  app.node('workflow-facts').open=false;await app.fire('workflow-facts','toggle');
  await app.controller.refresh();assert.equal(app.node('workflow-facts').open,false);
});
test('workflow persists unknown booleans as null and uses captured CAS revision',async()=>{
  const app=harness();app.controller.open(app.node('trigger'));await app.settle();
  assert.equal(app.node('workflow-hasPayment').value,'unknown');app.node('workflow-businessType').value='商城';app.node('workflow-hasPayment').value='true';
  await app.fire('workflow-facts-form','submit');const args=app.calls.find(c=>c[0]==='project_facts_save')[1];assert.equal(args.expectedRevision,2);assert.equal(args.facts.hasPayment,true);assert.equal(args.facts.collectsSensitive,null);assert.equal(app.changes(),1);
});
test('workflow loading error hides stale editable content and retry restores it',async()=>{
  const app=harness({fail:true});app.controller.open(app.node('trigger'));await app.settle();assert.match(app.node('workflow-status').textContent,/storage unavailable/);assert.equal(app.node('workflow-content').hidden,true);app.setFail(false);await app.fire('workflow-retry');assert.equal(app.node('workflow-content').hidden,false);
});
test('workflow refuses empty not-applicable reason and sends explicit manual confirmation',async()=>{
  const app=harness();app.controller.open(app.node('trigger'));await app.settle();
  const stage=app.node('workflow-stages').children[0];const buttons=stage.children.at(-1).children;
  buttons[1].events.click[0]();await app.settle();assert.match(app.node('workflow-status').textContent,/填写不适用原因/);assert.equal(app.calls.some(c=>c[0]==='project_stage_confirm'),false);
  buttons[0].events.click[0]();await app.settle();const args=app.calls.find(c=>c[0]==='project_stage_confirm')[1];assert.equal(args.state,'confirmed');assert.equal(args.expectedRulesVersion,'v1');assert.equal(args.stageId,'registration');
});
test('workflow ignores late response after project switch and blocks writes while busy',async()=>{
  let release;const app=harness({custom:cmd=>cmd==='project_workflow'?new Promise(resolve=>{release=resolve;}):undefined});
  app.controller.open(app.node('trigger'));await app.settle();app.setCurrent({...project,id:'b'});release(app.snapshot);await app.settle();assert.equal(app.node('workflow-content').hidden,true);
  app.controller.setBusy(true);await app.fire('workflow-facts-form','submit');assert.equal(app.calls.some(c=>c[0]==='project_facts_save'),false);
});
test('workflow close restores opener and destroy prevents reopening',async()=>{
  const app=harness();const trigger=app.node('trigger');app.controller.open(trigger);await app.settle();app.doc.activeElement=app.doc.body;await app.fire('workflow-close');assert.equal(app.doc.activeElement,trigger);app.controller.destroy();app.controller.open(trigger);assert.equal(app.node('desktop-workflow').open,false);
});

test('failed facts save keeps edited values and prevents duplicate writes while pending', async()=>{
  let rejectSave; const app=harness({custom:cmd=>cmd==='project_facts_save'?new Promise((resolve,reject)=>{rejectSave=reject;}):undefined});
  app.controller.open(app.node('trigger'));await app.settle();app.node('workflow-businessType').value='仍未保存的业务';
  await app.fire('workflow-facts-form','submit');await app.fire('workflow-facts-form','submit');assert.equal(app.calls.filter(c=>c[0]==='project_facts_save').length,1);
  rejectSave(Error('revision conflict'));await app.settle();assert.equal(app.node('workflow-businessType').value,'仍未保存的业务');assert.match(app.node('workflow-status').textContent,/revision conflict/);
});
test('project switch during pending workflow load queues a fresh read', async()=>{
  let release;let reads=0;const app=harness({custom:cmd=>{if(cmd!=='project_workflow')return undefined;if(++reads===1)return new Promise(resolve=>{release=resolve;});return {...app.snapshot,project:{...project,id:'b',name:'Project B'}};}});
  app.controller.open(app.node('trigger'));await app.settle();app.setCurrent({...project,id:'b'});await app.controller.refresh();release(app.snapshot);await app.settle();assert.equal(app.calls.filter(c=>c[0]==='project_workflow').length,2);assert.match(app.node('workflow-title').textContent,/Project B/);
});

test('reopening during a busy project switch never exposes or saves the previous project', async()=>{
  const app=harness({custom:(cmd,args)=>cmd==='project_workflow'?{...app.snapshot,project:{...project,id:args.projectId,name:args.projectId}}:undefined});
  app.controller.open(app.node('trigger'));await app.settle();await app.fire('workflow-close');
  app.setExternalBusy(true);app.controller.setBusy(true);app.controller.open(app.node('trigger'));await app.settle();assert.equal(app.node('workflow-content').hidden,true);
  app.setCurrent({...project,id:'b'});await app.controller.refresh();await app.fire('workflow-facts-form','submit');assert.equal(app.calls.some(c=>c[0]==='project_facts_save'),false);
  app.setExternalBusy(false);app.controller.setBusy(false);await app.settle();assert.equal(app.node('workflow-content').hidden,false);assert.match(app.node('workflow-title').textContent,/^b/);
  await app.fire('workflow-facts-form','submit');assert.equal(app.calls.find(c=>c[0]==='project_facts_save')[1].projectId,'b');
});
test('save-time project identity guard blocks stale form and stale stage events without refresh', async()=>{
  const app=harness();app.controller.open(app.node('trigger'));await app.settle();const buttons=app.node('workflow-stages').children[0].children.at(-1).children;
  app.setCurrent({...project,id:'b'});buttons[0].events.click[0]();await app.fire('workflow-facts-form','submit');assert.equal(app.calls.some(c=>['project_stage_confirm','project_facts_save'].includes(c[0])),false);
});
test('stage actions enforce applicability and prerequisites even for programmatic clicks', async()=>{
  const app=harness();app.snapshot.catalog.stages.push({stage:'privacy',title:'隐私',applies_when:'collects_sensitive == true',requires_stage:['registration']});
  app.controller.open(app.node('trigger'));await app.settle();const buttons=app.node('workflow-stages').children[1].children.at(-1).children;
  assert.equal(buttons[0].dataset.workflowBlocked,'true');assert.equal(buttons[1].dataset.workflowBlocked,'true');
  buttons[0].events.click[0]();await app.settle();assert.equal(app.calls.some(c=>c[0]==='project_stage_confirm'),false);assert.match(app.node('workflow-status').textContent,/前置阶段/);
  buttons[2].events.click[0]();await app.settle();assert.equal(app.calls.find(c=>c[0]==='project_stage_confirm')[1].state,'pending');
});
