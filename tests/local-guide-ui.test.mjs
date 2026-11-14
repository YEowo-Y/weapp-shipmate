import { createActionButton } from './helpers/ui-action.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getToolOutputPresentation, getRunAnnouncement } from '../desktop/design-previews/components/presentation.js';
import { createGuideResultCard, createMessageActions } from '../desktop/design-previews/components/message.js';
const result = {command:'guide',meta:{summary:'清单'},items:[{ruleId:'one',why:null,title:'<script>text</script>',stage:'release',severity:'blocker',requires:['核对材料'],manual_required:true,official_url:'https://developers.weixin.qq.com/example',last_verified:'2026-01-01'}],selfCheck:[{ruleId:'flow.two',title:'条件项',stage:'release',severity:'blocker',requires:[],manual_required:true,conditional:true}],notes:['不是合规结论']};
const doc = {createElementNS(_ns,tag){return this.createElement(tag);},createElement(tag){return {tag,dataset:{},children:[],attributes:{},set innerHTML(_){throw Error('unsafe');},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.children.push(...nodes);}};}};
const flatten = node => [node,...node.children.flatMap(flatten)];
test('guide results use validated local rules and never display stale failed output',()=>{
 assert.equal(getToolOutputPresentation('success',{kind:'guide',result}).kind,'result');
 for(const state of ['fail','canceled','running']) assert.notEqual(getToolOutputPresentation(state,{kind:'guide',result}).kind,'result');
 assert.match(getRunAnnouncement('working',{guide:{}}),/本机/);
 const nodes=flatten(createGuideResultCard(doc,result));
 assert.ok(nodes.some(n=>n.textContent==='条件待确认 · 1 项'));
 assert.ok(nodes.some(n=>n.textContent==='<script>text</script>'));
 assert.ok(nodes.some(n=>n.tag==='a'&&n.href===result.items[0].official_url));
 assert.throws(()=>createGuideResultCard(doc,{...result,items:[{...result.items[0],official_url:'javascript:bad()'}]}));
});
test('guide messages cannot free-text edit and regeneration names the operation',()=>{
 assert.equal(flatten(createMessageActions(doc,{role:'user',id:'a',text:'guide',guide:{}})).some(n=>n.dataset.action==='edit'),false);
 assert.ok(flatten(createMessageActions(doc,{role:'assistant',id:'b',status:'complete',guide:{}},{canRegenerate:true})).some(n=>n.attributes['aria-label']==='重新生成上线清单'));
});

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { GUIDE_SUBJECTS } from '../desktop/design-previews/guide-contract.js';
function formHarness() {
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.value='';this.events={};}
  append(...children){this.children.push(...children);}
  setAttribute(){}
  addEventListener(name,fn){this.events[name]=fn;}
  fire(name){this.events[name]?.({preventDefault(){}});}
  focus(){this.focused=true;}
  close(){this.open=false;this.fire('close');}
  querySelector(){return this.body;}
 }
 const composer={dataset:{liveChat:'true',modelId:'unchanged'},draft:'keep',busy:false,events:[],dispatchEvent(event){this.events.push(event);if(this.accept)event.detail.accepted=true;}};
 const dialogs=[];const notices=[];
 const trigger={closest:()=>composer};
 const context=vm.createContext({createActionButton,document:{createElement:tag=>new Node(tag)},GUIDE_SUBJECTS,validateGuideInput:input=>({ok:['personal','individual_business','enterprise'].includes(input.subject)&&typeof input.sensitive==='boolean'&&typeof input.domain==='boolean'}),modelBusy:()=>composer.busy,notify:m=>notices.push(m),CustomEvent:class {constructor(type,options){this.type=type;Object.assign(this,options);}},makeDialog:()=>{const d=new Node('dialog');d.body=new Node('body');dialogs.push(d);return d;},showDialog:(d,f)=>{d.open=true;f.focus();return d;}});
 const source=readFileSync(new URL('../desktop/design-previews/ui.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('  let guideDialog'),source.indexOf('  function openAddMenu')),context);
 const all=node=>[node,...node.children.flatMap(all)];
 return {composer,dialogs,notices,open:()=>context.openGuide(trigger),openFromHome:()=>context.openGuide({closest:()=>null},{composer}),all};
}
test('guide form requires explicit answers, dispatches booleans and only closes on acceptance',()=>{
 const h=formHarness();const d=h.open();assert.equal(h.open(),d);
 const nodes=h.all(d.body);const selects=nodes.filter(n=>n.tag==='select');const form=nodes.find(n=>n.tag==='form');
 assert.deepEqual(selects.map(n=>n.value),['','','']);form.fire('submit');assert.equal(h.composer.events.length,0);
 for(const [n,value] of selects.map((n,i)=>[n,['personal','false','true'][i]]))n.value=value;
 form.fire('submit');assert.equal(d.open,true);assert.equal(h.composer.events.length,1);
 assert.equal(h.composer.events[0].detail.input.sensitive,false);assert.equal(h.composer.events[0].detail.input.domain,true);
 h.composer.busy=true;form.fire('submit');assert.equal(h.composer.events.length,1);
 h.composer.busy=false;h.composer.accept=true;form.fire('submit');assert.equal(d.open,false);
 assert.equal(h.composer.draft,'keep');assert.equal(h.composer.dataset.modelId,'unchanged');
});
test('busy and showcase cannot open guide; cancel never dispatches',()=>{
 const h=formHarness();h.composer.busy=true;assert.equal(h.open(),null);
 h.composer.busy=false;h.composer.dataset.liveChat='false';assert.equal(h.open(),null);
 h.composer.dataset.liveChat='true';const d=h.open();h.all(d.body).find(n=>n.textContent==='取消').fire('click');assert.equal(d.open,false);assert.equal(h.composer.events.length,0);
});
import { createMessage } from '../desktop/design-previews/components/message.js';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
test('guide, real model and demo message and trace sources remain distinct',()=>{
 for(const [extra,label] of [[{guide:{}},'本机规则工具'],[{live:{providerId:'openai',label:'Model A'}},'真实模型'],[{},'本地演示']]){
  const message=createMessage(createPreviewDocument(),{id:'source',role:'assistant',text:'reply',status:'complete',trace:{state:'complete',runId:1,elapsedMs:1},...extra});
  assert.match(flatten(message).find(n=>n.className==='msg__meta').textContent,new RegExp(label));
  assert.match(flatten(message).find(n=>n.className==='run-trace').textContent,new RegExp(label));
 }
});

test('homepage guide entry passes its composer explicitly and keeps the same execution contract',()=>{
 const h=formHarness();const d=h.openFromHome();assert.ok(d.open);
 const nodes=h.all(d.body);nodes.filter(n=>n.tag==='select').forEach((n,i)=>{n.value=['enterprise','false','false'][i];});
 h.composer.accept=true;nodes.find(n=>n.tag==='form').fire('submit');
 assert.equal(h.composer.events[0].type,'shipmate:guide-request');
 assert.equal(h.composer.events[0].detail.input.subject,'enterprise');
 assert.equal(d.open,false);
});
