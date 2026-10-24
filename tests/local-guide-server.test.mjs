/* global Response, ReadableStream */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runGuide } from '../src/guide.mjs';
import { createModelConnectionHandler } from '../desktop/server/model-connections.mjs';
const input = { subject: 'personal', sensitive: true, domain: false };
async function app(t, options = {}) {
 const handler = createModelConnectionHandler({ fetchImpl: () => { throw new Error('unexpected network'); }, ...options });
 const server = createServer((req,res) => { void handler(req,res); }); server.listen(0,'127.0.0.1'); await once(server,'listening');
 t.after(async () => { handler.dispose(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); });
 const origin=`http://127.0.0.1:${server.address().port}`;
 const session=await fetch(`${origin}/api/model-connections`); const cookie=session.headers.get('set-cookie').split(';')[0]; const {csrfToken}=await session.json();
 return { handler, post: (value=input, overrides={}, path='tools/guide') => fetch(`${origin}/api/model-connections/${path}`, {method:'POST',headers:{cookie,Origin:origin,'Content-Type':'application/json','X-Shipmate-CSRF':csrfToken,...overrides},body:JSON.stringify(value)}) };
}
const events = text => text.split('\n').filter(line=>line.startsWith('data: ') && line!=='data: [DONE]').map(line=>JSON.parse(line.slice(6)));
test('guide runs the real local rule engine without model connection and preserves original result', async t => {
 const client=await app(t); const response=await client.post(); assert.equal(response.status,200);
 assert.equal(response.headers.get('x-vercel-ai-ui-message-stream'),'v1'); const stream=events(await response.text());
 assert.deepEqual(stream.map(event=>event.type),['start','tool-input-available','tool-output-available','finish']);
 assert.equal(stream[3].finishReason,'stop');
 assert.equal(stream[1].toolName,'weapp_shipmate_guide'); assert.deepEqual(stream[1].input,input);
 assert.equal(stream[1].toolCallId,stream[2].toolCallId);
 assert.deepEqual(stream[2].output,runGuide({subject_type:'personal',collects_sensitive:true,has_server_domain:false},{includeDrafts:false}));
});

test('guide rejects invalid input, draft flags, paths and unauthenticated requests before running', async t => {
 let calls=0; const client=await app(t,{guideRunner:()=>{calls++;return {};}});
 for(const value of [{...input,includeDrafts:true},{...input,subject:'unknown'},{...input,sensitive:'yes'},{subject:'personal'},null]) assert.equal((await client.post(value)).status,400);
 assert.equal((await client.post(input,{'X-Shipmate-CSRF':''})).status,403);
 assert.equal((await client.post(input,{Origin:'https://evil.test'})).status,403);
 assert.equal((await client.post(input,{cookie:''})).status,401);
 assert.equal((await client.post(input,{},'tools/guide/extra')).status,404);
 assert.equal(calls,0);
});

test('runner exceptions and invalid results emit only safe tool failure terminals', async t => {
 for(const guideRunner of [()=>{throw new Error('private path /secret');},()=>({command:'guide',secret:'private'})]) {
  const client=await app(t,{guideRunner});const response=await client.post();const text=await response.text();const stream=events(text);
  assert.deepEqual(stream.map(x=>x.type),['start','tool-input-available','tool-output-error','finish']);
  assert.equal(stream[2].toolCallId,stream[1].toolCallId);assert.equal(stream[3].finishReason,'error');assert.doesNotMatch(text,/private|secret/);
 }
});

async function started(response){const reader=response.body.getReader();let text='';while(!text.includes('tool-input-available')){const chunk=await reader.read();assert.equal(chunk.done,false);text+=Buffer.from(chunk.value).toString();}return reader;}
test('guide mutex blocks duplicate runs and connection mutations, timeout releases it', async t => {
 let signal;const client=await app(t,{guideRunner:(_input,options)=>{signal=options.signal;assert.equal(options.includeDrafts,false);return new Promise(()=>{});},guideTimeoutMs:80});
 const response=await client.post();const reader=await started(response);
 assert.equal((await client.post()).status,409);
 assert.equal((await client.post({apiKey:'key'},{},'openai/connect')).status,409);
 let rest='';while(true){const chunk=await reader.read();if(chunk.done)break;rest+=Buffer.from(chunk.value).toString();}
 assert.match(rest,/超时/);assert.equal(signal.aborted,true);
 const again=await client.post();assert.equal(again.status,200);await again.body.cancel();
});

test('closing the browser aborts a slow runner and late output cannot leak', async t => {
 let signal,resolve;const client=await app(t,{guideRunner:(_input,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});}});
 const reader=await started(await client.post());await reader.cancel();
 for(let i=0;i<50&&!signal.aborted;i++)await new Promise(done=>setTimeout(done,5));
 assert.equal(signal.aborted,true);resolve(runGuide({subject_type:'personal'}));
});

test('dispose and session expiry cancel pending tools', async t => {
 for(const mode of ['dispose','expire']){
  let signal,now=100;const client=await app(t,{now:()=>now,guideRunner:(_input,options)=>{signal=options.signal;return new Promise(()=>{});}});
  const reader=await started(await client.post());
  if(mode==='dispose')client.handler.dispose();else{now+=3600001;assert.equal((await client.post()).status,401);}
  let rest='';while(true){const chunk=await reader.read();if(chunk.done)break;rest+=Buffer.from(chunk.value).toString();}
  assert.equal(signal.aborted,true);assert.match(rest,/tool-output-error/);assert.doesNotMatch(rest,/tool-output-available/);
 }
});

test('guide and live inference share the same session execution slot in both directions', async t => {
 const client=await app(t,{
  guideRunner:()=>new Promise(()=>{}),
  fetchImpl:async url=>url.endsWith('/models')
   ?new Response(JSON.stringify({data:[{id:'test'}]}),{headers:{'Content-Type':'application/json'}})
   :new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}}),
 });
 await client.post({apiKey:'key'},{},'openai/connect');
 const toolReader=await started(await client.post());
 const chatInput={model:'test',messages:[{role:'user',content:'hello'}]};
 assert.equal((await client.post(chatInput,{},'openai/chat')).status,409);
 await toolReader.cancel();
 let response;
 for(let i=0;i<50;i++) {response=await client.post(chatInput,{},'openai/chat');if(response.status!==409)break;await response.body.cancel();await new Promise(resolve=>setTimeout(resolve,5));}
 assert.equal(response.status,200);
 assert.equal((await client.post()).status,409);await response.body.cancel();
});
