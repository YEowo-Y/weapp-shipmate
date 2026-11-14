import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideResultCard, updateGuideFilter, getGuideViewState, restoreGuideViewState } from '../desktop/design-previews/components/message.js';
import { createPreviewDocument } from './helpers/preview-dom.mjs';
const item=(id,title,stage='release')=>({ruleId:id,title,stage,severity:'info',why:null,requires:['核对 HTTPS'],manual_required:true,official_url:null,last_verified:null});
const result={command:'guide',meta:{summary:'test'},items:[item('a','发布检查'),item('b','隐私检查','privacy')],selfCheck:[{...item('c','条件检查'),conditional:true}],notes:[]};
const flat=n=>[n,...n.children.flatMap(flat)];
const card=()=>createGuideResultCard(createPreviewDocument(),result,{messageId:'guide-1',input:{subject:'personal',sensitive:false,domain:false}});
test('guide artifact exposes stable search and complete export actions',()=>{
 const c=card(); const nodes=flat(c);const input=nodes.find(n=>n.dataset.guideSearch!==undefined);
 assert.equal(input.maxLength,200);assert.equal(input.dataset.messageId,'guide-1');
 assert.deepEqual(nodes.filter(n=>n.dataset.action).map(n=>n.dataset.action),['copy-guide','download-guide-markdown','download-guide-json']);
 assert.ok(nodes.some(n=>n.textContent.includes('始终导出完整清单')));
 assert.equal(new Set(nodes.filter(n=>n.tag==='details').map(n=>n.dataset.component)).size,3);
});
test('literal search keeps nodes stable, hides stages and restores baseline disclosures',()=>{
 const c=card();const nodes=flat(c);const details=nodes.filter(n=>n.tag==='details');details[1].open=true;
 const input=nodes.find(n=>n.dataset.guideSearch!==undefined);
 updateGuideFilter(c,'  发布检查  ');assert.equal(details[0].open,true);assert.equal(details[1].hidden,true);
 assert.equal(getGuideViewState(c).disclosures.find(d=>d.component===details[0].dataset.component).open,false);
 updateGuideFilter(c,'HTTPS');assert.equal(nodes.filter(n=>n.className==='guide-result__item'&&!n.hidden).length,3);
 updateGuideFilter(c,'[');assert.ok(nodes.find(n=>n.className==='guide-result__empty').hidden===false);
 updateGuideFilter(c,'');assert.equal(details[0].open,false);assert.equal(details[1].open,true);
 assert.equal(flat(c).find(n=>n.dataset.guideSearch!==undefined),input);
});
test('view state restores baseline and temporary search separately with JSON roundtrip',()=>{
 const c=card();flat(c).find(n=>n.tag==='details').open=true;updateGuideFilter(c,'隐私');
 const saved=JSON.parse(JSON.stringify(getGuideViewState(c)));const restored=card();restoreGuideViewState(restored,saved);
 assert.deepEqual(getGuideViewState(restored),saved);updateGuideFilter(restored,'');
 assert.equal(flat(restored).find(n=>n.tag==='details').open,true);
});
test('search covers stage names and rule metadata without changing source data or input text',()=>{
 const data=JSON.parse(JSON.stringify(result));Object.assign(data.items[0],{why:'why-token',warn:'warn-token',note:'note-token',source_quote:'quote-token'});
 const c=createGuideResultCard(createPreviewDocument(),data);const nodes=flat(c);const input=nodes.find(n=>n.dataset.guideSearch!==undefined);
 for(const query of ['WHY-TOKEN','warn-token','note-token','quote-token','发布','a']){
  updateGuideFilter(c,query);assert.equal(nodes.find(n=>n.className==='guide-result__item').hidden,false);
 }
 input.value='  HTTPS  ';updateGuideFilter(c,input.value);assert.equal(input.value,'  HTTPS  ');
 assert.equal(getGuideViewState(c).query,'  HTTPS  ');
 assert.equal(data.items.length,2);assert.equal(data.selfCheck.length,1);
 restoreGuideViewState(c,{query:null,disclosures:[null,{component:'untrusted',open:true}]});assert.equal(getGuideViewState(c).query,'');
});

